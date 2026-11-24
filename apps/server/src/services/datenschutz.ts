import { aufbewahrenBis, AUFBEWAHRUNG_BUECHER_JAHRE, AUFBEWAHRUNG_VERKAUF_JAHRE, INAKTIV_JAHRE, KARENZ_TAGE, POSTAUSGANG_TAGE, type Vereinsangaben } from "@schau/domain";
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { zufallsToken } from "../auth";
import { db, type Tx } from "../db/client";
import { aenderung, aussteller, auszahlung, beleg, bestaetigungSpende, bewertung, gesundheit, katalogeintrag, meldung, organisation, postausgang, prEinteilung, preisart, preisrichter, preisvergabe, prZuteilung, schau, sepaLauf, sitzung, spender, stiftung, verkauf, zahlung, zuwendungsbestaetigung } from "../db/schema";
import { fehler } from "../trpc";
import { bereinigeMandate, lastschriftAuskunft, loescheLastschriftDaten } from "./datenschutz-lastschrift";
import { ladeEintraege } from "./eintraege";
import { spendenFuerAuskunft } from "./spenden";
import { protokollZuletzt, protokolliere, type Akteur } from "./protokoll";
import { testKopienVon } from "./testschau";
import { kurzerFehler } from "./fehlertext";

export async function ladeVereinsangaben(organisationId: number): Promise<Vereinsangaben> {
  const [o] = await db.select().from(organisation).where(eq(organisation.id, organisationId));
  if (!o) throw fehler("NOT_FOUND", "Verein nicht gefunden.");
  const { id: _id, createdAt: _c, ...angaben } = o;
  return angaben;
}

/** Alles, was über einen Aussteller gespeichert ist – Grundlage für die Auskunft nach Art. 15 DSGVO. */
/**
 * Mails eines Ausstellers: über den Bezug (auch an frühere Adressen); die Adresse zählt nur bei Mails ohne Bezug.
 * Sonst träfen Auskunft und Löschung auch Familienmitglieder mit derselben Adresse.
 */
function mailVon(a: { id: number; email: string }) {
  return or(eq(postausgang.ausstellerId, a.id), a.email ? and(isNull(postausgang.ausstellerId), sql`lower(${postausgang.an}) = lower(${a.email})`) : sql`false`);
}

export async function ladeAuskunft(organisationId: number, ausstellerId: number) {
  const [a] = await db.select().from(aussteller).where(and(eq(aussteller.id, ausstellerId), eq(aussteller.organisationId, organisationId)));
  if (!a) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
  const meldungen = await db
    .select({ m: meldung, schau: schau.name, phase: schau.phase })
    .from(meldung)
    .innerJoin(schau, eq(schau.id, meldung.schauId))
    .where(eq(meldung.ausstellerId, a.id))
    .orderBy(meldung.eingegangenAm);
  const ids = meldungen.map((x) => x.m.id);
  const spenderIds = (await db.select({ id: spender.id }).from(spender).where(eq(spender.ausstellerId, a.id))).map((x) => x.id);
  const tiere = ids.length ? await db.select().from(katalogeintrag).where(inArray(katalogeintrag.meldungId, ids)) : [];
  const tierIds = tiere.map((t) => t.id);
  const [zahlungen, auszahlungen, verkaeufe, post, bewertungen, preise, stiftungen, journal] = await Promise.all([
    ids.length ? db.select().from(zahlung).where(inArray(zahlung.meldungId, ids)) : [],
    db.select().from(auszahlung).where(eq(auszahlung.ausstellerId, a.id)),
    ids.length
      ? db
          .select({ v: verkauf, meldungId: katalogeintrag.meldungId, katalogNr: katalogeintrag.katalogNr, suffix: katalogeintrag.suffix, schauId: katalogeintrag.schauId })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .where(inArray(katalogeintrag.meldungId, ids))
      : [],
    // Über den Aussteller (auch nach einem Adresswechsel) oder die Adresse; Groß-/Kleinschreibung egal.
    db
      .select({ betreff: postausgang.betreff, createdAt: postausgang.createdAt, status: postausgang.status })
      .from(postausgang)
      .where(and(eq(postausgang.organisationId, organisationId), mailVon(a))),
    tierIds.length ? db.select().from(bewertung).where(inArray(bewertung.katalogeintragId, tierIds)) : [],
    tierIds.length
      ? db
          .select({ katalogeintragId: preisvergabe.katalogeintragId, name: preisart.name, kuerzel: preisart.kuerzel, betragCent: sql<number>`coalesce(${preisvergabe.betragCent}, ${preisart.betragCent})` })
          .from(preisvergabe)
          .innerJoin(preisart, eq(preisart.id, preisvergabe.preisartId))
          .where(inArray(preisvergabe.katalogeintragId, tierIds))
      : [],
    ids.length ? db.select().from(stiftung).where(inArray(stiftung.meldungId, ids)) : [],
    tierIds.length ? db.select().from(gesundheit).where(inArray(gesundheit.katalogeintragId, tierIds)) : [],
  ]);
  // Archivierte Belege mit Bezug zum Aussteller (Kaufbelege seiner Tiere, Quittungen, Einzahlungen).
  const belegWo = [
    ...verkaeufe.map(({ v, schauId }) => and(eq(beleg.schauId, schauId), inArray(beleg.art, ["kaufbeleg", "kaufbeleg-storno"]), eq(beleg.nummer, v.belegNr))),
    ...auszahlungen.map((x) => and(eq(beleg.schauId, x.schauId), inArray(beleg.art, ["quittung", "quittung-storno"]), eq(beleg.nummer, x.quittungNr))),
    ...(zahlungen.length ? [and(eq(beleg.art, "einzahlung"), inArray(beleg.nummer, zahlungen.map((z) => z.id)))] : []),
  ];
  const belege = belegWo.length
    ? await db.select({ art: beleg.art, nummer: beleg.nummer, createdAt: beleg.createdAt, sha256: beleg.sha256 }).from(beleg).where(or(...belegWo))
    : [];
  const bezug = [
    and(eq(aenderung.tabelle, "aussteller"), eq(aenderung.datensatzId, a.id)),
    ...(ids.length ? [and(eq(aenderung.tabelle, "meldung"), inArray(aenderung.datensatzId, ids))] : []),
    ...(zahlungen.length ? [and(eq(aenderung.tabelle, "zahlung"), inArray(aenderung.datensatzId, zahlungen.map((z) => z.id)))] : []),
    ...(auszahlungen.length ? [and(eq(aenderung.tabelle, "auszahlung"), inArray(aenderung.datensatzId, auszahlungen.map((z) => z.id)))] : []),
    ...(verkaeufe.length ? [and(eq(aenderung.tabelle, "verkauf"), inArray(aenderung.datensatzId, verkaeufe.map((v) => v.v.id)))] : []),
    ...(tierIds.length ? [and(inArray(aenderung.tabelle, ["katalogeintrag", "bewertung", "preisvergabe"]), inArray(aenderung.datensatzId, tierIds))] : []),
    ...(journal.length ? [and(eq(aenderung.tabelle, "gesundheit"), inArray(aenderung.datensatzId, journal.map((g) => g.id)))] : []),
    ...(stiftungen.length ? [and(eq(aenderung.tabelle, "stiftung"), inArray(aenderung.datensatzId, stiftungen.map((x) => x.id)))] : []),
    ...(spenderIds.length ? [and(eq(aenderung.tabelle, "spender"), inArray(aenderung.datensatzId, spenderIds))] : []),
  ];
  // Tierbezeichnung (Rasse, Farbenschlag) wie im Katalog.
  const bezeichnung = new Map<number, string>();
  for (const { m } of meldungen) for (const e of await ladeEintraege(m.schauId, { nurMeldungId: m.id })) bezeichnung.set(e.id, e.bezeichnung);
  const protokoll = await db
    .select({ zeitpunkt: aenderung.zeitpunkt, tabelle: aenderung.tabelle, aktion: aenderung.aktion, alt: aenderung.alt, neu: aenderung.neu, grund: aenderung.grund })
    .from(aenderung)
    .where(or(...bezug))
    .orderBy(aenderung.id)
    .limit(1000);
  const { organisationId: _o, ...stammdaten } = a;
  // Test-Kopien in Testschauen (beim Kennzeichnen einer Übungsschau entstanden): nur Name und Verein.
  const testKopien = (await testKopienVon(db, a.id)).map((k) => ({ schau: k.schau, name: `${k.vorname} ${k.nachname}`, verein: k.verein }));
  return {
    stammdaten,
    testKopien,
    meldungen: meldungen.map(({ m, schau: schauName, phase }) => ({
      schau: schauName,
      phase,
      eingang: m.eingang,
      eingegangenAm: m.eingegangenAm,
      status: m.status,
      istJugend: m.istJugend,
      istPreisrichter: m.istPreisrichter,
      erziehungsberechtigter: m.erziehungsberechtigter,
      meldebogenUnterschriebenAm: m.zustimmungAm,
      onlineVeroeffentlichungAm: m.onlineZustimmungAm,
      erklaerungenAm: m.erklaerungenAm,
      bemerkung: m.bemerkung,
      impfung: { datum: m.vetImpfdatum, impfstoff: m.vetImpfstoff, tierarzt: m.vetTierarzt },
      pmv: { datum: m.pmvImpfdatum, impfstoff: m.pmvImpfstoff, tierarzt: m.pmvTierarzt },
      wassergefluegel: { datum: m.wgDatum, sentinel: m.wgSentinel, stelle: m.wgStelle },
      nachweisGeprueftAm: m.vetGeprueftAm,
      tiere: tiere
        .filter((t) => t.meldungId === m.id)
        .sort((x, y) => x.position - y.position)
        .map((t) => {
          const b = bewertungen.find((x) => x.katalogeintragId === t.id);
          return {
            katalogNr: t.katalogNr,
            suffix: t.suffix,
            tier: bezeichnung.get(t.id) ?? t.freitext,
            art: t.art,
            geschlecht: t.geschlecht,
            alter: t.alter,
            ringnummern: t.ringnummern,
            verkaufspreisCent: t.verkaufspreisCent,
            freitext: t.freitext,
            status: t.status,
            bewertung: b ? { punkte: b.punkte, sondernote: b.sondernote, vorzuege: b.vorzuege, wuensche: b.wuensche, maengel: b.maengel } : null,
            preise: preise.filter((p) => p.katalogeintragId === t.id).map((p) => ({ preis: `${p.kuerzel} ${p.name}`.trim(), betragCent: Number(p.betragCent) })),
            gesundheit: journal
              .filter((g) => g.katalogeintragId === t.id)
              .map((g) => ({ zeitpunkt: g.zeitpunkt, befund: g.befund, massnahme: g.massnahme, verendet: g.verendet, sperre: g.sperre })),
          };
        }),
      zahlungen: zahlungen.filter((z) => z.meldungId === m.id).map((z) => ({ datum: z.datum, betragCent: z.betragCent, art: z.art })),
      verkaeufe: verkaeufe
        .filter((v) => v.meldungId === m.id)
        .map(({ v, katalogNr, suffix }) => ({ belegNr: v.belegNr, katalogNr: katalogNr != null ? `${katalogNr}${suffix}` : null, datum: v.createdAt, preisCent: v.preisCent, provisionCent: v.provisionCent, kaeufer: v.kaeuferName, storniertAm: v.storniertAm })),
      stiftungen: stiftungen.filter((x) => x.meldungId === m.id).map((x) => ({ stifter: x.stifter, anzahl: x.anzahl, betragCent: x.betragCent, vorgabe: x.vorgabe, eingegangenAm: x.eingegangenAm })),
    })),
    auszahlungen: auszahlungen.map((x) => ({ quittungNr: x.quittungNr, datum: x.createdAt, betragCent: x.betragCent, art: x.art, storniertAm: x.storniertAm })),
    spenden: await spendenFuerAuskunft(a.id),
    lastschrift: await lastschriftAuskunft(organisationId, a.id),
    belege,
    emails: post,
    protokoll,
  };
}

/**
 * Auskunft für Personen ohne Aussteller-Stammsatz: Käufer (Verkaufsliste) und Preisrichter, gesucht nach Name.
 * Käuferdaten bleiben 3 Jahre (Verkaufsaufzeichnung) und werden danach von der Bereinigung anonymisiert.
 */
export async function ladeAuskunftPerson(organisationId: number, name: string) {
  const muster = `%${name.trim().toLowerCase().replace(/[%_\\]/g, (z) => `\\${z}`)}%`;
  const [kaeufeRoh, richter, stifter] = await Promise.all([
    db
      .select({
        schauId: schau.id,
        schau: schau.name,
        belegNr: verkauf.belegNr,
        datum: verkauf.createdAt,
        name: verkauf.kaeuferName,
        anschrift: verkauf.kaeuferAnschrift,
        registriernummer: verkauf.kaeuferRegistriernummer,
        erziehungsberechtigter: verkauf.kaeuferErziehungsberechtigter,
        preisCent: verkauf.preisCent,
        zahlart: verkauf.zahlart,
        storniertAm: verkauf.storniertAm,
      })
      .from(verkauf)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
      .innerJoin(schau, eq(schau.id, katalogeintrag.schauId))
      .where(and(eq(schau.organisationId, organisationId), sql`lower(${verkauf.kaeuferName}) like ${muster}`))
      .orderBy(schau.id, verkauf.belegNr),
    db
      .select({ id: preisrichter.id, schau: schau.name, name: preisrichter.name, anschrift: preisrichter.anschrift, email: preisrichter.email, telefon: preisrichter.telefon, istObmann: preisrichter.istObmann, pinGesetzt: sql<boolean>`${preisrichter.pinHash} is not null`, createdAt: preisrichter.createdAt,
        anschriftImKatalog: preisrichter.anschriftImKatalog, sparten: preisrichter.sparten, gruppen: preisrichter.gruppen, zusage: preisrichter.zusage, zugesagtFuer: preisrichter.zugesagtFuer, vorbehalt: preisrichter.vorbehalt, obmann: sql<string | null>`(select o.name from preisrichter o where o.id = ${preisrichter.obmannId})` })
      .from(preisrichter)
      .innerJoin(schau, eq(schau.id, preisrichter.schauId))
      .where(and(eq(schau.organisationId, organisationId), sql`lower(${preisrichter.name}) like ${muster}`))
      .orderBy(schau.id, preisrichter.name),
    db
      .select({ schau: schau.name, stifter: stiftung.stifter, anzahl: stiftung.anzahl, betragCent: stiftung.betragCent, vorgabe: stiftung.vorgabe, eingegangenAm: stiftung.eingegangenAm, onlineNennen: stiftung.onlineNennen })
      .from(stiftung)
      .innerJoin(schau, eq(schau.id, stiftung.schauId))
      .where(and(eq(schau.organisationId, organisationId), sql`lower(${stiftung.stifter}) like ${muster}`))
      .orderBy(schau.id),
  ]);
  // Käufer: dazu die archivierten Kaufbelege (sie tragen Name und Anschrift bis zum Ende der Belegfrist).
  const kaeufe = await Promise.all(
    kaeufeRoh.map(async ({ schauId, ...k }) => ({
      ...k,
      belege: (await db.select({ art: beleg.art, nummer: beleg.nummer, createdAt: beleg.createdAt }).from(beleg).where(and(eq(beleg.schauId, schauId), inArray(beleg.art, ["kaufbeleg", "kaufbeleg-storno"]), eq(beleg.nummer, k.belegNr)))),
    })),
  );
  // Preisrichter: Einteilung, eigene Bewertungen, Obmann-Bestätigungen und Protokolleinträge.
  const preisrichterAuskunft = await Promise.all(
    richter.map(async ({ id, ...r }) => {
      const [einteilung, rassen, bewertet, bestaetigt, protokoll] = await Promise.all([
        db.select({ vonNr: prEinteilung.vonNr, bisNr: prEinteilung.bisNr }).from(prEinteilung).where(eq(prEinteilung.preisrichterId, id)),
        db.select({ sparte: prZuteilung.sparte, rasse: prZuteilung.rasse, farbenschlag: prZuteilung.farbenschlag, jugend: prZuteilung.jugend }).from(prZuteilung).where(eq(prZuteilung.preisrichterId, id)),
        db.select({ n: count() }).from(bewertung).where(eq(bewertung.preisrichterId, id)),
        db.select({ n: count() }).from(bewertung).where(eq(bewertung.obmannBestaetigtVon, id)),
        db.select({ zeitpunkt: aenderung.zeitpunkt, tabelle: aenderung.tabelle, aktion: aenderung.aktion }).from(aenderung).where(eq(aenderung.preisrichterId, id)).orderBy(aenderung.id).limit(1000),
      ]);
      return { ...r, einteilung, einteilungNachRassen: rassen, bewertungen: Number(bewertet[0]?.n ?? 0), obmannBestaetigungen: Number(bestaetigt[0]?.n ?? 0), protokoll };
    }),
  );
  return { gesucht: name.trim(), kaeufe, preisrichter: preisrichterAuskunft, stifter };
}
export type Auskunft = Awaited<ReturnType<typeof ladeAuskunft>>;

/** Meldungen, die noch laufen – solange darf ein Aussteller nicht gelöscht werden. */
async function laufendeMeldungen(tx: Tx, ausstellerId: number) {
  return tx
    .select({ schau: schau.name })
    .from(meldung)
    .innerJoin(schau, eq(schau.id, meldung.schauId))
    .where(and(eq(meldung.ausstellerId, ausstellerId), ne(schau.phase, "abgeschlossen"), inArray(meldung.status, ["offen", "bestaetigt"])));
}

/**
 * Bis wann Daten des Ausstellers aufbewahrt werden müssen (null: nichts mehr): Verkaufsaufzeichnungen und die
 * Aussteller- und Tierliste fürs Veterinäramt 3 Jahre (jede Teilnahme mit Tieren), Belege bis Jahresende + 8 Jahre.
 */
async function fristEnde(tx: Tx, ausstellerId: number): Promise<Date | null> {
  const ids = (await tx.select({ id: meldung.id }).from(meldung).where(eq(meldung.ausstellerId, ausstellerId))).map((x) => x.id);
  const [verk, zahl, ausz, teilnahme] = await Promise.all([
    ids.length
      ? tx.select({ d: verkauf.createdAt }).from(verkauf).innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId)).where(inArray(katalogeintrag.meldungId, ids))
      : [],
    ids.length ? tx.select({ d: zahlung.datum }).from(zahlung).where(inArray(zahlung.meldungId, ids)) : [],
    tx.select({ d: auszahlung.createdAt }).from(auszahlung).where(eq(auszahlung.ausstellerId, ausstellerId)),
    // Teilnahme mit Tieren (Katalognummer): Stichtag ist der Bewertungstag, sonst der Eingang der Meldung.
    ids.length
      ? tx
          .select({ bewertungAm: schau.bewertungAm, eingang: meldung.eingegangenAm })
          .from(meldung)
          .innerJoin(schau, eq(schau.id, meldung.schauId))
          .where(and(inArray(meldung.id, ids), sql`exists (select 1 from katalogeintrag k where k.meldung_id = "meldung"."id" and k.katalog_nr is not null)`))
      : [],
  ]);
  const verkaeufe = verk.map((x) => x.d);
  const aufzeichnung = [...verkaeufe, ...teilnahme.map((t) => (t.bewertungAm ? new Date(`${t.bewertungAm}T12:00:00Z`) : t.eingang))];
  // Kaufbelege sind auch Buchungsbelege.
  return aufbewahrenBis(aufzeichnung, [...verkaeufe, ...zahl.map((x) => new Date(`${x.d}T12:00:00Z`)), ...ausz.map((x) => x.d)]);
}

/** Was in jedem Fall sofort weg kann: Kontakt, Bankdaten, Geburtsdatum, Zugangslinks, Online-Veröffentlichung, Mails. */
async function entferneEntbehrliches(tx: Tx, a: typeof aussteller.$inferSelect) {
  const ids = (await tx.select({ id: meldung.id }).from(meldung).where(eq(meldung.ausstellerId, a.id))).map((x) => x.id);
  for (const id of ids) {
    // Neuer Zugangsschlüssel: der Link aus der alten Bestätigungsmail zeigt den Namen nicht mehr.
    await tx.update(meldung).set({ onlineZustimmungAm: null, erziehungsberechtigter: "", bemerkung: "", zugangsToken: zufallsToken(18) }).where(eq(meldung.id, id));
  }
  await tx
    .delete(postausgang)
    .where(and(eq(postausgang.organisationId, a.organisationId), mailVon(a)));
  return ids;
}

/** Protokollinhalte und Gesundheitstexte mit Bezug zum Aussteller leeren (Zeitpunkt, Aktion und Bearbeiter bleiben). */
async function anonymisiereProtokoll(tx: Tx, a: { id: number; organisationId: number; vorname: string; nachname: string }, meldungIds: number[], spenderIds: number[]) {
  const ausstellerId = a.id;
  const tierIds = meldungIds.length ? (await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(inArray(katalogeintrag.meldungId, meldungIds))).map((x) => x.id) : [];
  const zahlIds = meldungIds.length ? (await tx.select({ id: zahlung.id }).from(zahlung).where(inArray(zahlung.meldungId, meldungIds))).map((x) => x.id) : [];
  const auszIds = (await tx.select({ id: auszahlung.id }).from(auszahlung).where(eq(auszahlung.ausstellerId, ausstellerId))).map((x) => x.id);
  const verkIds = tierIds.length ? (await tx.select({ id: verkauf.id }).from(verkauf).where(inArray(verkauf.katalogeintragId, tierIds))).map((x) => x.id) : [];
  const stiftIds = meldungIds.length ? (await tx.select({ id: stiftung.id }).from(stiftung).where(inArray(stiftung.meldungId, meldungIds))).map((x) => x.id) : [];
  const leeren = async (tabelle: string, ids: number[]) => {
    if (!ids.length) return;
    const wo = and(eq(aenderung.tabelle, tabelle), inArray(aenderung.datensatzId, ids));
    await tx.update(aenderung).set({ alt: null, neu: null }).where(wo);
    // Freitext-Gründe können Namen enthalten; leeren lässt er sich ab Hash-Aufbau 3.
    await tx.update(aenderung).set({ grund: "" }).where(and(wo, gte(aenderung.hashVersion, 3), ne(aenderung.grund, "")));
  };
  await leeren("meldung", meldungIds);
  await leeren("aussteller", [ausstellerId]);
  await leeren("zahlung", zahlIds);
  await leeren("auszahlung", auszIds);
  await leeren("verkauf", verkIds);
  await leeren("stiftung", stiftIds);
  await leeren("spender", spenderIds);
  // Preise und Noten des Tiers: der Grund ist Freitext und kann Namen enthalten.
  await leeren("preisvergabe", tierIds);
  await leeren("bewertung", tierIds);
  if (tierIds.length) await tx.update(gesundheit).set({ tierText: "" }).where(inArray(gesundheit.katalogeintragId, tierIds));
  // Journaleinträge, deren Tier nicht mehr verknüpft ist, tragen den Namen nur noch im Text „(Nachname, Vorname)“ –
  // nur im eigenen Verein und mit maskierten Platzhaltern (ein „%“ im Namen träfe sonst alle Einträge).
  if (a.nachname.trim() && a.vorname.trim()) {
    const maske = (t: string) => t.replace(/[%_\\]/g, (z) => `\\${z}`);
    await tx
      .update(gesundheit)
      .set({ tierText: "" })
      .where(
        and(
          isNull(gesundheit.katalogeintragId),
          sql`${gesundheit.schauId} in (select id from schau where organisation_id = ${a.organisationId})`,
          sql`${gesundheit.tierText} like ${`%(${maske(a.nachname)}, ${maske(a.vorname)})%`}`,
        ),
      );
  }
}

/**
 * Löscht die Daten eines Ausstellers (Art. 17 DSGVO). Laufen noch Aufbewahrungsfristen (Verkaufsliste, Belege),
 * werden nur die entbehrlichen Daten gelöscht und der Rest bis Fristende gesperrt (Art. 18); danach löscht die
 * tägliche Bereinigung. Die Meldungen bleiben als anonyme Zeilen erhalten, damit Katalog und Abrechnung stimmen.
 */
export async function loescheAussteller(...a: Parameters<typeof loescheAusstellerInnen>) {
  // Protokoll zuletzt (Entscheidung 033): je Schau ein Eintrag, danach werden Aussteller und Meldungen noch geändert.
  return protokollZuletzt(a[0], () => loescheAusstellerInnen(...a));
}

async function loescheAusstellerInnen(tx: Tx, organisationId: number, ausstellerId: number, grund: string, akteur: Akteur, jetzt = new Date()) {
  // Zeile sperren: ein gleichzeitiges „Mandat erfassen“ wartet und sieht danach den Löschwunsch.
  const [a] = await tx.select().from(aussteller).where(and(eq(aussteller.id, ausstellerId), eq(aussteller.organisationId, organisationId))).for("update");
  if (!a) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
  if (a.geloeschtAm) throw fehler("BAD_REQUEST", "Dieser Aussteller ist bereits gelöscht.");
  const laufend = await laufendeMeldungen(tx, a.id);
  if (laufend.length) {
    throw fehler(
      "BAD_REQUEST",
      `Der Aussteller hat eine laufende Meldung (${laufend.map((l) => l.schau).join(", ")}). Erst die Meldung stornieren oder die Schau abschließen${a.testSchauId ? " – bei einer Testschau genügt es, sie zu löschen oder die Demodaten neu einzuspielen" : ""}.`,
    );
  }
  // In einer offenen SEPA-Datei bzw. Lastschriftdatei stehen IBAN und Name – erst buchen oder verwerfen.
  const offen = await tx.select({ daten: sepaLauf.daten }).from(sepaLauf).innerJoin(schau, eq(schau.id, sepaLauf.schauId)).where(and(eq(sepaLauf.status, "offen"), eq(schau.organisationId, organisationId)));
  if (offen.some((l) => (l.daten as { posten: { ausstellerId: number }[] }).posten.some((p) => p.ausstellerId === a.id))) {
    throw fehler("BAD_REQUEST", "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen.");
  }
  await loescheLastschriftDaten(tx, organisationId, a.id, jetzt);
  // Test-Kopien in Übungsschauen tragen den Namen mit: sofort unkenntlich (es sind Übungsdaten, keine Aufbewahrung).
  const kopien = await testKopienVon(tx, a.id);
  if (kopien.length) {
    for (const k of kopien) {
      await tx.update(aussteller).set({ vorname: `#${k.id}`, nachname: "Gelöscht", verein: "", kreisverband: "", geloeschtAm: jetzt }).where(eq(aussteller.id, k.id));
    }
  }
  const bis = await fristEnde(tx, a.id);
  const ids = await entferneEntbehrliches(tx, a);
  // Öffentlicher Katalog und Ergebnisse sind nach Protokollstand je Schau zwischengespeichert: ein Eintrag je
  // betroffener Schau erneuert sie sofort (ohne Namen).
  const schauIds = [...new Set((await tx.select({ schauId: meldung.schauId }).from(meldung).where(eq(meldung.ausstellerId, a.id))).map((x) => x.schauId))];
  for (const schauId of schauIds) await protokolliere(tx, { schauId, tabelle: "aussteller", datensatzId: a.id, aktion: "Datenschutz: Name ausgeblendet", akteur });
  if (bis && bis > jetzt) {
    const loeschenAb = bis.toISOString().slice(0, 10);
    await tx
      .update(aussteller)
      .set({ telefon: "", email: "", iban: "", kontoinhaber: "", geburtsdatum: null, mitglied: null, gesperrtAm: a.gesperrtAm ?? jetzt, loeschenAb })
      .where(eq(aussteller.id, a.id));
    await protokolliere(tx, { schauId: a.testSchauId ?? null, tabelle: "aussteller", datensatzId: a.id, aktion: "gesperrt", neu: { loeschenAb }, grund, akteur });
    return { art: "gesperrt" as const, loeschenAb };
  }
  await tx
    .update(aussteller)
    .set({
      vorname: `#${a.id}`,
      nachname: "Gelöscht",
      strasse: "",
      plz: "",
      ort: "",
      telefon: "",
      email: "",
      verein: "",
      kreisverband: "",
      registriernummer: "",
      geburtsdatum: null,
      istPreisrichter: false,
      iban: "",
      kontoinhaber: "",
      mitglied: null,
      gesperrtAm: null,
      loeschenAb: null,
      geloeschtAm: jetzt,
    })
    .where(eq(aussteller.id, a.id));
  if (ids.length) await tx.update(stiftung).set({ stifter: "Gelöscht" }).where(inArray(stiftung.meldungId, ids));
  // Spender-Kopie des Ausstellers: keine Nennung mehr; Name und Anschrift nur, solange ein Doppel einer
  // Zuwendungsbestätigung aufbewahrt werden muss (die Bereinigung entfernt sie danach).
  // Alle Spender-Kopien: ihr Protokoll trägt E-Mail und Notiz mit, auch bei denen mit Zuwendungsbestätigung (deren
  // Name und Anschrift stehen für das Doppel in der Spenderzeile, nicht im Protokoll).
  const spenderKopien = await tx.update(spender).set({ nennungName: false, nennungBetrag: false, email: "", notiz: "" }).where(eq(spender.ausstellerId, a.id)).returning({ id: spender.id });
  await tx
    .update(spender)
    .set({ vorname: "", nachname: "Gelöscht", strasse: "", plz: "", ort: "", ausstellerId: null })
    .where(and(eq(spender.ausstellerId, a.id), sql`not exists (select 1 from zuwendungsbestaetigung z where z.spender_id = "spender"."id")`));
  await tx.update(spender).set({ ausstellerId: null }).where(eq(spender.ausstellerId, a.id));
  // Im Protokoll bleiben Zeitpunkt, Aktion und Bearbeiter – die Inhalte mit Namen, IBAN oder Beträgen fallen weg (auch
  // die der Spender-Kopien).
  await anonymisiereProtokoll(tx, a, ids, spenderKopien.map((x) => x.id));
  // Test-Aussteller: ins Protokoll ihrer Testschau (verschwindet mit ihr), echte ins Vereinsprotokoll.
  await protokolliere(tx, { schauId: a.testSchauId ?? null, tabelle: "aussteller", datensatzId: a.id, aktion: "gelöscht", grund, akteur });
  return { art: "gelöscht" as const, loeschenAb: null };
}

const tageZurueck = (jetzt: Date, tage: number) => new Date(jetzt.getTime() - tage * 86_400_000);
const jahreZurueck = (jetzt: Date, jahre: number) => new Date(Date.UTC(jetzt.getUTCFullYear() - jahre, jetzt.getUTCMonth(), jetzt.getUTCDate()));

/**
 * Tägliche Bereinigung nach den Speicherfristen der Datenschutzhinweise:
 * abgelaufene Sitzungen, alte Mails, Geburtsdatum und IBAN 30 Tage nach Abschluss der Schauen, Kontaktdaten und PIN
 * der Preisrichter (Anschrift nach 3 Jahren), Käuferdaten nach Ablauf der Aufzeichnungspflicht, Protokollinhalte und
 * Belege nach Ende der Belegfrist, gesperrte Aussteller nach Fristende, lange inaktive Aussteller.
 * Mit organisationId nur für diesen Verein (Knopf auf der Seite „Verein und Datenschutz“).
 */
export async function bereinige(jetzt = new Date(), opts: { organisationId?: number } = {}) {
  const akteur: Akteur = { text: "Bereinigung (Speicherfrist)" };
  const n = { sitzungen: 0, mails: 0, geburtsdaten: 0, preisrichter: 0, kaeufer: 0, spender: 0, protokoll: 0, belege: 0, journal: 0, nachweise: 0, anschriften: 0, geloescht: 0, gesperrt: 0, fehlgeschlagen: 0, mandate: 0 };
  const org = opts.organisationId;
  const vereinSchau = (spalte: unknown) => (org ? sql`${spalte} in (select id from schau where organisation_id = ${org})` : sql`true`);
  if (!org) n.sitzungen = (await db.delete(sitzung).where(lt(sitzung.laeuftAb, jetzt)).returning({ id: sitzung.id })).length;
  n.mails = (
    await db
      .delete(postausgang)
      .where(and(lt(postausgang.createdAt, tageZurueck(jetzt, POSTAUSGANG_TAGE)), org ? eq(postausgang.organisationId, org) : undefined))
      .returning({ id: postausgang.id })
  ).length;

  // Erst 30 Tage nach dem Abschluss (Karenz für Nachfragen und Überweisungen) und frühestens 30 Tage nach dem Ende der
  // Reklamationsfrist (eine berechtigte Reklamation braucht noch die Bankverbindung): Geburtsdatum und Bankdaten.
  // Tabellennamen in den Unterabfragen ausgeschrieben (sonst bezöge sich "id" auf die Meldung).
  const karenz = tageZurueck(jetzt, KARENZ_TAGE).toISOString();
  const nichtsLaufendes = sql`exists (select 1 from meldung m where m.aussteller_id = "aussteller"."id")
    and not exists (select 1 from meldung m join schau s on s.id = m.schau_id where m.aussteller_id = "aussteller"."id"
      and (s.phase <> 'abgeschlossen' or s.abgeschlossen_am is null or s.abgeschlossen_am > ${karenz}::timestamptz
        or (s.reklamationsfrist is not null and s.reklamationsfrist > (${karenz}::timestamptz)::date)))`;
  // SEPA-Mandate: 14 Monate nach dem Widerruf bzw. nach dem Verfall (36 Monate ohne Nutzung) – so lange muss der Verein
  // das Mandat bei einem Widerspruch des Zahlers vorlegen können.
  n.mandate = await bereinigeMandate(jetzt, org);
  n.geburtsdaten = (
    await db
      .update(aussteller)
      .set({ geburtsdatum: null, iban: "", kontoinhaber: "" })
      .where(and(or(isNotNull(aussteller.geburtsdatum), ne(aussteller.iban, ""), ne(aussteller.kontoinhaber, "")), nichtsLaufendes, org ? eq(aussteller.organisationId, org) : undefined))
      .returning({ id: aussteller.id })
  ).length;
  const abgeschlossenVor = (datum: string) => sql`"preisrichter"."schau_id" in (select id from schau where phase = 'abgeschlossen' and abgeschlossen_am <= ${datum}::timestamptz)`;
  n.preisrichter = (
    await db
      .update(preisrichter)
      .set({ email: "", telefon: "", pinHash: null, vorbehalt: "", zugesagtFuer: "" }) // Vorbehalt: freier Text, kann Privates enthalten
      .where(and(or(ne(preisrichter.email, ""), ne(preisrichter.telefon, ""), isNotNull(preisrichter.pinHash), ne(preisrichter.vorbehalt, ""), ne(preisrichter.zugesagtFuer, "")), abgeschlossenVor(karenz), vereinSchau(preisrichter.schauId)))
      .returning({ id: preisrichter.id })
  ).length;
  // Anschrift der Preisrichter: steht im gedruckten Katalog, wird intern nach 3 Jahren nicht mehr gebraucht.
  n.preisrichter += (
    await db
      .update(preisrichter)
      .set({ anschrift: "" })
      .where(and(ne(preisrichter.anschrift, ""), abgeschlossenVor(jahreZurueck(jetzt, INAKTIV_JAHRE).toISOString()), vereinSchau(preisrichter.schauId)))
      .returning({ id: preisrichter.id })
  ).length;
  n.kaeufer = (
    await db
      .update(verkauf)
      .set({ kaeuferName: "Gelöscht", kaeuferAnschrift: "", kaeuferRegistriernummer: "", kaeuferErziehungsberechtigter: "" })
      .where(
        and(
          lt(verkauf.createdAt, jahreZurueck(jetzt, AUFBEWAHRUNG_VERKAUF_JAHRE)),
          ne(verkauf.kaeuferName, "Gelöscht"),
          org ? sql`${verkauf.katalogeintragId} in (select k.id from katalogeintrag k join schau s on s.id = k.schau_id where s.organisation_id = ${org})` : undefined,
        ),
      )
      .returning({ id: verkauf.id })
  ).length;
  // Protokollinhalte nach Ende der Frist für Bücher und Aufzeichnungen (Jahresende + 10 Jahre), archivierte Belege nach
  // der Belegfrist (Jahresende + 8 Jahre; die Grenze prüft auch der Schutz-Trigger mit der Uhr der Datenbank).
  const belegGrenze = new Date(Date.UTC(jetzt.getUTCFullYear() - AUFBEWAHRUNG_BUECHER_JAHRE, 0, 1)).toISOString();
  n.protokoll = (
    await db
      .update(aenderung)
      .set({ alt: null, neu: null })
      .where(and(lt(aenderung.zeitpunkt, new Date(belegGrenze)), or(isNotNull(aenderung.alt), isNotNull(aenderung.neu)), vereinSchau(aenderung.schauId)))
      .returning({ id: aenderung.id })
  ).length;
  await db
    .update(aenderung)
    .set({ grund: "" })
    .where(and(lt(aenderung.zeitpunkt, new Date(belegGrenze)), gte(aenderung.hashVersion, 3), ne(aenderung.grund, ""), vereinSchau(aenderung.schauId)));
  n.belege = (
    await db
      .delete(beleg)
      .where(and(sql`date_trunc('year', ${beleg.createdAt}) + interval '9 years' <= now()`, vereinSchau(beleg.schauId)))
      .returning({ id: beleg.id })
  ).length;
  // Zuwendungsbestätigungen (Doppel, § 50 Abs. 7 EStDV) wie Belege; vorher ihre Zuordnung zu den Spenden.
  const alteBestaetigung = sql`date_trunc('year', ${zuwendungsbestaetigung.createdAt}) + interval '9 years' <= now()`;
  const vereinBestaetigung = org ? eq(zuwendungsbestaetigung.organisationId, org) : undefined;
  await db.delete(bestaetigungSpende).where(inArray(bestaetigungSpende.bestaetigungId, db.select({ id: zuwendungsbestaetigung.id }).from(zuwendungsbestaetigung).where(and(alteBestaetigung, vereinBestaetigung))));
  n.belege += (await db.delete(zuwendungsbestaetigung).where(and(alteBestaetigung, vereinBestaetigung)).returning({ id: zuwendungsbestaetigung.id })).length;
  // Spender ohne Spende und Bestätigung innerhalb der Belegfrist: nur noch „Gelöscht“ (die Beträge bleiben für die Kasse).
  n.spender = (
    await db
      .update(spender)
      .set({ vorname: "", nachname: "Gelöscht", strasse: "", plz: "", ort: "", email: "", notiz: "", nennungName: false, nennungBetrag: false, ausstellerId: null })
      .where(
        and(
          ne(spender.nachname, "Gelöscht"),
          org ? eq(spender.organisationId, org) : undefined,
          sql`date_trunc('year', ${spender.createdAt}) + interval '9 years' <= now()`,
          sql`not exists (select 1 from spende x where x.spender_id = "spender"."id" and date_trunc('year', x.created_at) + interval '9 years' > now())`,
          sql`not exists (select 1 from zuwendungsbestaetigung z where z.spender_id = "spender"."id")`,
        ),
      )
      .returning({ id: spender.id })
  ).length;

  // Tierseuchenrechtliche Aufzeichnungen 3 Jahre nach der Schau: Gesundheitsjournal und Impf-/Tierarzt-Angaben.
  const dreiJahre = jahreZurueck(jetzt, AUFBEWAHRUNG_VERKAUF_JAHRE).toISOString();
  const alteSchau = (spalte: unknown) =>
    // Nur abgeschlossene Schauen, gerechnet ab dem späteren von Bewertungstag und Anlegen: ein vertipptes Jahr im
    // Bewertungsdatum löscht so keine Aufzeichnungen einer laufenden Schau.
    sql`${spalte} in (select id from schau where phase = 'abgeschlossen' and greatest(coalesce(bewertung_am::timestamptz, created_at), created_at) < ${dreiJahre}::timestamptz ${org ? sql`and organisation_id = ${org}` : sql``})`;
  n.journal = (await db.delete(gesundheit).where(alteSchau(gesundheit.schauId)).returning({ id: gesundheit.id })).length;
  n.nachweise = (
    await db
      .update(meldung)
      .set({ vetImpfstoff: "", vetTierarzt: "", pmvImpfstoff: "", pmvTierarzt: "", wgStelle: "" })
      .where(and(alteSchau(meldung.schauId), or(ne(meldung.vetTierarzt, ""), ne(meldung.vetImpfstoff, ""), ne(meldung.pmvTierarzt, ""), ne(meldung.pmvImpfstoff, ""), ne(meldung.wgStelle, ""))))
      .returning({ id: meldung.id })
  ).length;
  // Gesperrte Aussteller (Löschwunsch, Belegfrist läuft noch): nach den 3-Jahres-Fristen nur noch der Name für die
  // Buchungsbelege – Anschrift, Verein und Registriernummer werden nicht mehr gebraucht.
  n.anschriften = (
    await db
      .update(aussteller)
      .set({ strasse: "", plz: "", ort: "", verein: "", kreisverband: "", registriernummer: "", mitglied: null })
      .where(
        and(
          isNotNull(aussteller.gesperrtAm),
          isNull(aussteller.geloeschtAm),
          org ? eq(aussteller.organisationId, org) : undefined,
          or(ne(aussteller.strasse, ""), ne(aussteller.ort, ""), ne(aussteller.registriernummer, ""), ne(aussteller.verein, "")),
          sql`not exists (select 1 from meldung m join schau s on s.id = m.schau_id where m.aussteller_id = "aussteller"."id"
            and coalesce(s.bewertung_am::timestamptz, m.eingegangen_am) >= ${dreiJahre}::timestamptz)`,
          sql`not exists (select 1 from verkauf v join katalogeintrag k on k.id = v.katalogeintrag_id join meldung m on m.id = k.meldung_id
            where m.aussteller_id = "aussteller"."id" and v.created_at >= ${dreiJahre}::timestamptz)`,
        ),
      )
      .returning({ id: aussteller.id })
  ).length;

  // Gesperrte nach Fristende und Aussteller, die lange nicht gemeldet haben.
  const heute = jetzt.toISOString().slice(0, 10);
  const grenze = jahreZurueck(jetzt, INAKTIV_JAHRE);
  const kandidaten = await db
    .select({ id: aussteller.id, organisationId: aussteller.organisationId, gesperrtAm: aussteller.gesperrtAm })
    .from(aussteller)
    .where(
      and(
        isNull(aussteller.geloeschtAm),
        org ? eq(aussteller.organisationId, org) : undefined,
        or(
          lte(aussteller.loeschenAb, heute),
          and(
            isNull(aussteller.gesperrtAm),
            lt(aussteller.createdAt, grenze),
            sql`not exists (select 1 from meldung m where m.aussteller_id = "aussteller"."id" and m.eingegangen_am >= ${grenze.toISOString()}::timestamptz)`,
          ),
        ),
      ),
    );
  for (const k of kandidaten) {
    try {
      const r = await db.transaction((tx) => loescheAussteller(tx, k.organisationId, k.id, k.gesperrtAm ? "Aufbewahrungsfrist abgelaufen" : `${INAKTIV_JAHRE} Jahre keine Meldung`, akteur, jetzt));
      if (r.art === "gelöscht") n.geloescht++;
      else n.gesperrt++;
    } catch (e) {
      // Meist eine laufende Meldung (Schau nie abgeschlossen) – sichtbar machen, beim nächsten Lauf erneut.
      n.fehlgeschlagen++;
      console.error(`[datenschutz] Aussteller ${k.id} nicht gelöscht:`, kurzerFehler(e));
    }
  }
  return n;
}

/** Startet die Bereinigung jetzt und dann einmal täglich. */
export function starteBereinigung() {
  const lauf = () =>
    bereinige()
      .then((n) => {
        if (Object.values(n).some((x) => x > 0)) console.log("[datenschutz] Bereinigung:", n);
      })
      .catch((e) => console.error("[datenschutz] Bereinigung fehlgeschlagen:", kurzerFehler(e)));
  void lauf();
  setInterval(lauf, 86_400_000).unref?.();
}
