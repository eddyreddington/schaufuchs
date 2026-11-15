import { berechneAbrechnung, gefordertCent, erzeugeSepaUeberweisung, imEwr, normalisiereRegistriernummer, provision, pruefeIban, REGISTRIERNUMMER_HINWEIS, verdeckeIban, type Phase, datumKurz } from "@schau/domain";
import { and, asc, eq, gt, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/client";
import { aenderung, aussteller, auszahlung, bewertung, gesundheit, kassenabschluss, kassenbewegung, katalogeintrag, KASSENBEWEGUNG_ARTEN, meldung, schau, sepaLauf, verkauf, verkaufZahlungseingang } from "../db/schema";
import { ladeEintraege, meldebetrag } from "../services/eintraege";
import { LASTSCHRIFT_OFFEN, offeneLastschrift, offeneUeberweisungsverkaeufe, offenerLauf, pruefeNichtAbgerechnet, pruefeNichtAbgeschlossen, schliesseLauf, SEPA_ERSTELLT, SEPA_GEBUCHT, SEPA_VERWORFEN, sperreKasse, type UeberweisungsLauf } from "../services/kasse";
import { archiviereKassenbeleg, archiviereKaufbeleg, archiviereQuittung, belegListe, ladeKassenbuch, sollBestand } from "../services/kassenbuch";
import { protokolliere } from "../services/protokoll";
import { heuteDe } from "../services/tiergesundheit";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId, kalenderdatum } from "../trpc";
import { kurzerFehler } from "../services/fehlertext";

type Schau = typeof schau.$inferSelect;

/** Nächste Belegnummer. Stornierte Belege stehen im Protokoll und werden nicht wieder vergeben. */
async function naechsteBelegNr(tx: Tx, schauId: number) {
  const [mx] = await tx
    .select({ n: max(verkauf.belegNr) })
    .from(verkauf)
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
    .where(eq(katalogeintrag.schauId, schauId));
  const [st] = await tx
    .select({ n: sql<number | null>`max((${aenderung.alt}->>'belegNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "verkauf"), eq(aenderung.aktion, "storniert")));
  // Auch Belege, deren Verkauf ohne Storno verschwand (Tier aus der Meldung gelöscht), stehen im Protokoll.
  const [vk] = await tx
    .select({ n: sql<number | null>`max((${aenderung.neu}->>'belegNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "verkauf"), eq(aenderung.aktion, "verkauft")));
  return Math.max(mx?.n ?? 0, Number(st?.n ?? 0), Number(vk?.n ?? 0)) + 1;
}

/**
 * Nächste Quittungsnummer. Stornierte Buchungen bleiben in der Tabelle; früher gelöschte (zurückgenommene)
 * stehen im Protokoll – beide werden nicht wieder vergeben.
 */
async function naechsteQuittungNr(tx: Tx, schauId: number) {
  const [mx] = await tx.select({ n: max(auszahlung.quittungNr) }).from(auszahlung).where(eq(auszahlung.schauId, schauId));
  const [st] = await tx
    .select({ n: sql<number | null>`max((${aenderung.alt}->>'quittungNr')::int)` })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "auszahlung"), eq(aenderung.aktion, "zurückgenommen")));
  return Math.max(mx?.n ?? 0, Number(st?.n ?? 0)) + 1;
}

// SEPA-Datei: Lauf und Sperre liegen in services/kasse.ts (auch die Preisvergabe braucht sie).
export { offenerLauf };

/** XML (pain.001.001.09) aus einem gespeicherten Lauf – bei jedem Download derselbe Inhalt. */
export function sepaXml(s: Schau, lauf: UeberweisungsLauf): string {
  return erzeugeSepaUeberweisung({
    nachrichtId: lauf.nachrichtId,
    erstelltAm: new Date(lauf.erstelltAm),
    ausfuehrungAm: lauf.ausfuehrungAm,
    auftraggeber: lauf.auftraggeber,
    posten: lauf.posten.map((p) => ({
      // Eindeutig je Datei: eine Nachzahlung an denselben Aussteller bekommt eine eigene Kennung.
      endToEndId: `S${s.id}-A${p.ausstellerId}-${lauf.nachrichtId.split("-").pop()}`,
      name: p.kontoinhaber,
      iban: p.iban,
      betragCent: p.betragCent,
      verwendungszweck: `${s.name} Preisgeld/Tierverkauf ${p.name}`,
    })),
  });
}

/** Abrechnung aller Aussteller einer Schau – oder nur eines Ausstellers (Quittung, Auszahlung: ohne alle anderen neu zu rechnen). */
/** Datum des jüngsten abgeschlossenen Kassentags ("" ohne Abschluss). */
function letzterAbschluss(tage: { datum: string; abschluss: unknown }[]): string {
  return tage.filter((t) => t.abschluss).reduce((m, t) => (t.datum > m ? t.datum : m), "");
}

export async function abrechnungListe(schauId: number, ex: Tx = db, opts: { nurAusstellerId?: number; nurAusstellerIds?: number[] } = {}) {
  const [eintraege, meldungen, auszahlungen, lauf, lastschrift] = await Promise.all([
    ladeEintraege(schauId, { nurBestaetigt: true, ex }),
    ex
      .select({
        id: meldung.id,
        ausstellerId: meldung.ausstellerId,
        vorname: aussteller.vorname,
        nachname: aussteller.nachname,
        ort: aussteller.ort,
        iban: aussteller.iban,
        kontoinhaber: aussteller.kontoinhaber,
      })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(and(eq(meldung.schauId, schauId), eq(meldung.status, "bestaetigt"), opts.nurAusstellerId ? eq(meldung.ausstellerId, opts.nurAusstellerId) : undefined, opts.nurAusstellerIds ? inArray(meldung.ausstellerId, opts.nurAusstellerIds.length ? opts.nurAusstellerIds : [-1]) : undefined)),
    ex.select().from(auszahlung).where(eq(auszahlung.schauId, schauId)).orderBy(asc(auszahlung.id)),
    offenerLauf(ex, schauId),
    offeneLastschrift(ex, schauId),
  ]);
  const alleVerkaeufe = await ex
    .select({ v: verkauf, schauId: katalogeintrag.schauId, eingang: verkaufZahlungseingang.id })
    .from(verkauf)
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
    .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
    .where(and(eq(katalogeintrag.schauId, schauId), isNull(verkauf.storniertAm)));
  // Per Überweisung verkauft: der Erlös zählt erst mit gebuchtem Zahlungseingang (sonst stünde Geld zur Auszahlung
  // bereit, das noch nicht da ist). Bis dahin als „ausstehend“ ausgewiesen.
  const bezahlt = (x: (typeof alleVerkaeufe)[number]) => x.v.zahlart !== "ueberweisung" || x.eingang != null;
  const verkaeufe = alleVerkaeufe.filter(bezahlt);

  const zeilen = await Promise.all(
    meldungen.map(async (m) => {
      const tiere = eintraege.filter((e) => e.meldungId === m.id);
      const betrag = await meldebetrag(ex, m.id);
      const verkauft = verkaeufe.filter((v) => tiere.some((t) => t.id === v.v.katalogeintragId));
      // Zugesagte Ehrenpreisstiftung und Spende gehören zu dem, was der Aussteller zahlt – bezahlt sind sie keine
      // Überzahlung, offen werden sie wie offenes Meldegeld verrechnet.
      const a = berechneAbrechnung({
        meldebetragCent: gefordertCent(betrag),
        bezahltCent: betrag.bezahltCent,
        preisgelderCent: tiere.flatMap((t) => t.preise.map((p) => p.betragCent)),
        verkaeufe: verkauft.map((v) => v.v),
      });
      // Alle Buchungen des Ausstellers; stornierte bleiben sichtbar, zählen aber nicht.
      const buchungen = auszahlungen.filter((x) => x.ausstellerId === m.ausstellerId);
      const gueltig = buchungen.filter((x) => !x.storniertAm);
      const ausgezahltCent = gueltig.reduce((n, x) => n + x.betragCent, 0);
      const aus = gueltig[gueltig.length - 1] ?? null;
      const posten = lauf?.posten.find((p) => p.ausstellerId === m.ausstellerId);
      const inUeberweisung = lauf && posten ? { nachrichtId: lauf.nachrichtId, betragCent: posten.betragCent } : null;
      // Meldegeld in der offenen Lastschriftdatei: die Bank zieht es ein – an der Kasse nicht noch einmal verrechnen.
      const einzug = lastschrift?.daten.posten.find((p) => p.meldungId === m.id);
      const imEinzug = lastschrift && einzug ? { nachrichtId: lastschrift.nachrichtId, betragCent: einzug.betragCent } : null;
      // Was noch zu zahlen ist (positiv) oder zurückzufordern (negativ) – nach allen gültigen Buchungen.
      const nochOffenCent = a.saldoCent - ausgezahltCent - (inUeberweisung?.betragCent ?? 0);
      return {
        meldungId: m.id,
        ausstellerId: m.ausstellerId,
        name: `${m.nachname}, ${m.vorname}`,
        ort: m.ort,
        iban: m.iban,
        kontoinhaber: m.kontoinhaber || `${m.vorname} ${m.nachname}`,
        tiere: tiere.length,
        verkaufAusstehendCent: alleVerkaeufe.filter((x) => !bezahlt(x) && tiere.some((t) => t.id === x.v.katalogeintragId)).reduce((n, x) => n + x.v.preisCent, 0),
        meldebetragCent: betrag.summeCent,
        stiftungCent: betrag.stiftungCent,
        spendeCent: betrag.spendeCent,
        bezahltCent: betrag.bezahltCent,
        ...a,
        // Zu viel gezahlt (über Meldegeld, Stiftung und Spende hinaus): steckt wie in berechneAbrechnung im Saldo und wird für die Belege ausgewiesen.
        ueberzahltCent: Math.max(0, betrag.bezahltCent - gefordertCent(betrag)),
        /** Letzte gültige Buchung (für Anzeige und Quittung). */
        auszahlung: aus,
        buchungen,
        ausgezahltCent,
        inUeberweisung,
        imEinzug,
        nochOffenCent,
        // Nicht 0 heißt: nach einer Buchung oder SEPA-Datei nachträglich geändert – auszugleichen über eine Differenzbuchung.
        differenzCent: gueltig.length || inUeberweisung ? nochOffenCent : 0,
        // Überweisbar: Guthaben (auch Nachzahlung), gültige IBAN und in keiner offenen SEPA-Datei.
        // Konten außerhalb des EWR (z. B. Schweiz) nicht in die Sammelüberweisung – dort fehlen BIC und Anschrift.
        ueberweisbar: !inUeberweisung && !imEinzug && nochOffenCent > 0 && !!m.iban && !pruefeIban(m.iban) && imEwr(m.iban),
      };
    }),
  );
  return zeilen.sort((x, y) => x.name.localeCompare(y.name, "de"));
}

/**
 * Verkauf nur, wenn das Tier ausgestellt und bewertet ist (HMLU-Erlass 28.08.2026: sonst wäre die Schau ein Markt) –
 * also nach der Bewertung, solange die Schau läuft.
 */
export const VERKAUF_PHASEN: Phase[] = ["preise", "schau"];

/**
 * Ausgezahlt wird nach der Bewertung – vorher sperrte eine Auszahlung Preise und Verkauf des Ausstellers. Nach dem
 * Abschluss wird nichts mehr gebucht (sonst entstünden offene Beträge, deren IBAN die Bereinigung löscht).
 */
export const AUSZAHLUNG_PHASEN: Phase[] = ["schau", "abrechnung"];
/** Die SEPA-Sammelüberweisung gehört in die Abrechnung nach der Schau. */
export const SEPA_PHASEN: Phase[] = ["abrechnung"];

/** Kalenderdatum JJJJ-MM-TT, das es wirklich gibt (kein 31.02.). */
const istKalenderdatum = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;

/** Bargeld, das nach einer Ausgabe noch in der Kasse wäre; negativ heißt: so viel ist gar nicht da. */
async function pruefeKassenbestand(tx: Tx, schauId: number, ausgabeCent: number, wer: { rolle: string }, trotzdem: boolean) {
  const soll = await sollBestand(schauId, tx);
  if (soll - ausgabeCent >= 0) return;
  const text = `Laut Kassenbuch sind nur ${(soll / 100).toFixed(2).replace(".", ",")} € in der Kasse – danach wären es ${((soll - ausgabeCent) / 100).toFixed(2).replace(".", ",")} €.`;
  if (wer.rolle !== "admin") throw fehler("BAD_REQUEST", `${text} Bitte Betrag prüfen oder die Ausstellungsleitung holen.`);
  if (!trotzdem) throw fehler("PRECONDITION_FAILED", `${text} Trotzdem buchen?`);
}

export const kasseRouter = router({
  tierSuchen: benutzerProcedure.input(z.object({ schauId: dbId, nr: z.string().max(20) })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const m = input.nr.trim().match(/^(\d+)([a-z]*)$/i);
    if (!m) return null;
    const alle = await ladeEintraege(input.schauId, { nurBestaetigt: true });
    const e = alle.find((x) => x.katalogNr === Number(m[1]) && x.suffix === (m[2] ?? "").toLowerCase());
    if (!e) return null;
    const [v] = await db.select().from(verkauf).where(and(eq(verkauf.katalogeintragId, e.id), isNull(verkauf.storniertAm)));
    return { eintrag: e, verkauf: v ?? null };
  }),

  verkaufen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        katalogeintragId: dbId,
        kaeuferName: z.string().max(500).trim().min(3, "Name des Käufers fehlt."),
        kaeuferAnschrift: z.string().max(500).trim(),
        kaeuferRegistriernummer: z.string().max(500).trim().min(5, "Registriernummer des Käufers fehlt (Viehverkehrsordnung)."),
        /** § 11c TierSchG: an Käufer unter 16 nur mit Einwilligung eines Erziehungsberechtigten – ausdrücklich bestätigen. */
        kaeuferAlter: z.enum(["ab16", "unter16"], { error: "Bitte angeben, ob der Käufer mindestens 16 Jahre alt ist (§ 11c TierSchG)." }),
        kaeuferErziehungsberechtigter: z.string().max(200).trim().default(""),
        /** Bar landet im Kassenbuch; Karte und Überweisung nicht. */
        zahlart: z.enum(["bar", "karte", "ueberweisung"]).default("bar"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Funktionstrennung wie beim Meldegeld: ein Verkauf ohne Geldeingang stellt den Erlös sofort zur (Bar-)Auszahlung
      // bereit – das bucht nur die Ausstellungsleitung.
      if (input.zahlart !== "bar" && ctx.benutzer.rolle !== "admin") {
        throw fehler("FORBIDDEN", "Verkauf auf Karte oder Überweisung nur durch die Ausstellungsleitung (der Erlös stünde sonst ohne bestätigten Geldeingang zur Auszahlung bereit).");
      }
      if (!VERKAUF_PHASEN.includes(s.phase)) throw fehler("BAD_REQUEST", "Verkauf erst nach der Bewertung, solange die Schau läuft (Phase „Preise“ oder „Schau“).");
      const registriernummer = normalisiereRegistriernummer(input.kaeuferRegistriernummer);
      if (!registriernummer) throw fehler("BAD_REQUEST", `Registriernummer des Käufers ungültig: ${REGISTRIERNUMMER_HINWEIS}.`);
      const unter16 = input.kaeuferAlter === "unter16";
      if (unter16 && input.kaeuferErziehungsberechtigter.length < 3) {
        throw fehler("BAD_REQUEST", "Käufer unter 16 Jahren: nur mit Einwilligung eines Erziehungsberechtigten (§ 11c TierSchG) – bitte dessen Namen angeben.");
      }
      const v = await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const [e] = await tx.select().from(katalogeintrag).where(and(eq(katalogeintrag.id, input.katalogeintragId), eq(katalogeintrag.schauId, s.id)));
        if (!e) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if (e.verkaufspreisCent == null || e.verkaufspreisCent <= 0) throw fehler("BAD_REQUEST", "Dieses Tier ist nicht verkäuflich gemeldet.");
        if (e.status !== "eingeliefert") throw fehler("BAD_REQUEST", "Tier ist nicht in der Halle (nicht eingeliefert oder schon ausgegeben).");
        const [b] = await tx.select({ id: bewertung.id }).from(bewertung).where(eq(bewertung.katalogeintragId, e.id));
        if (!b) throw fehler("BAD_REQUEST", "Tier ist noch nicht bewertet – verkauft wird erst nach der Bewertung.");
        const [krank] = await tx
          .select({ id: gesundheit.id })
          .from(gesundheit)
          .where(and(eq(gesundheit.katalogeintragId, e.id), or(eq(gesundheit.sperre, true), eq(gesundheit.verendet, true))));
        if (krank) throw fehler("BAD_REQUEST", "Tier ist im Gesundheitsjournal gesperrt (krank, verdächtig oder verendet) und darf nicht abgegeben werden.");
        const [schon] = await tx.select().from(verkauf).where(and(eq(verkauf.katalogeintragId, e.id), isNull(verkauf.storniertAm)));
        if (schon) throw fehler("CONFLICT", `Bereits verkauft (Beleg ${schon.belegNr}).`);
        const [m] = await tx.select({ ausstellerId: meldung.ausstellerId }).from(meldung).where(eq(meldung.id, e.meldungId));
        await pruefeNichtAbgerechnet(tx, s.id, m!.ausstellerId);
        const [v] = await tx
          .insert(verkauf)
          .values({
            katalogeintragId: e.id,
            kaeuferName: input.kaeuferName,
            kaeuferAnschrift: input.kaeuferAnschrift,
            kaeuferRegistriernummer: registriernummer,
            kaeuferUnter16: unter16,
            kaeuferErziehungsberechtigter: unter16 ? input.kaeuferErziehungsberechtigter : "",
            preisCent: e.verkaufspreisCent,
            provisionCent: provision(e.verkaufspreisCent, s.provisionBp),
            provisionBp: s.provisionBp,
            zahlart: input.zahlart,
            belegNr: await naechsteBelegNr(tx, s.id),
            verkauftVon: ctx.benutzer.id,
          })
          .returning();
        await protokolliere(tx, { schauId: s.id, tabelle: "verkauf", datensatzId: v!.id, aktion: "verkauft", neu: { nr: `${e.katalogNr}${e.suffix}`, preis: e.verkaufspreisCent, belegNr: v!.belegNr, unter16, zahlart: input.zahlart }, akteur: ctx });
        return v!;
      });
      // Beleg sofort ablegen: jeder Nachdruck zeigt genau diesen Beleg.
      await archiviereKaufbeleg(s, v.id);
      return v;
    }),

  stornieren: adminProcedure
    .input(z.object({ schauId: dbId, verkaufId: dbId, grund: z.string().max(500).trim().min(3, "Bitte einen Grund angeben.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      pruefeNichtAbgeschlossen(s);
      await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        const [v] = await tx
          .select({ v: verkauf, schauId: katalogeintrag.schauId, ausstellerId: meldung.ausstellerId })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
          .where(eq(verkauf.id, input.verkaufId));
        if (!v || v.schauId !== input.schauId) throw fehler("NOT_FOUND", "Verkauf nicht gefunden.");
        if (v.v.storniertAm) throw fehler("BAD_REQUEST", "Dieser Verkauf ist schon storniert.");
        await pruefeNichtAbgerechnet(tx, input.schauId, v.ausstellerId, { istAdmin: ctx.benutzer.rolle === "admin", grund: input.grund });
        // Markieren statt löschen: die Abgabe bleibt in der Verkaufsliste für das Veterinäramt (3 Jahre).
        await tx.update(verkauf).set({ storniertAm: new Date(), storniertVon: ctx.benutzer.id, stornoGrund: input.grund }).where(eq(verkauf.id, v.v.id));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "verkauf",
          datensatzId: v.v.id,
          aktion: "storniert",
          // Ohne Käuferdaten: die stehen im Verkauf selbst und werden dort nach Fristende anonymisiert.
          alt: { belegNr: v.v.belegNr, katalogeintragId: v.v.katalogeintragId, preisCent: v.v.preisCent, zahlart: v.v.zahlart },
          grund: input.grund,
          akteur: ctx,
        });
      });
      await archiviereKaufbeleg(s, input.verkaufId, true);
      return { ok: true };
    }),

  /** Tiere, die zum Verkauf stehen: verkäuflich gemeldet, eingeliefert, bewertet, nicht gesperrt und noch nicht verkauft. */
  angebot: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [alle, abgerechnet, lauf] = await Promise.all([
      ladeEintraege(input.schauId, { nurBestaetigt: true }),
      db.select({ ausstellerId: auszahlung.ausstellerId }).from(auszahlung).where(and(eq(auszahlung.schauId, input.schauId), isNull(auszahlung.storniertAm))),
      offenerLauf(db, input.schauId),
    ]);
    // Abgerechnete Aussteller (Quittung oder offene SEPA-Datei) verkaufen nichts mehr – der Verkauf würde abgelehnt.
    const gesperrt = new Set([...abgerechnet.map((x) => x.ausstellerId), ...(lauf?.posten.map((p) => p.ausstellerId) ?? [])]);
    return alle
      .filter((e) => e.katalogNr != null && (e.verkaufspreisCent ?? 0) > 0 && !e.verkauftAn && e.status === "eingeliefert" && e.bewertet && !e.gesperrt && !gesperrt.has(e.ausstellerId))
      .map((e) => ({
        id: e.id,
        katalogNr: e.katalogNr,
        suffix: e.suffix,
        sparte: e.sparte,
        bezeichnung: e.bezeichnung,
        geschlecht: e.geschlecht,
        alter: e.alter,
        punkte: e.punkte,
        sondernote: e.sondernote,
        verkaufspreisCent: e.verkaufspreisCent!,
      }));
  }),

  verkaeufe: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    // Alle Einträge (auch nicht bestätigte Meldungen): ein Verkauf behält so immer sein Tier.
    const alle = await ladeEintraege(input.schauId);
    const rows = await db.select().from(verkauf).innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId)).where(eq(katalogeintrag.schauId, input.schauId));
    return rows
      .flatMap((r) => {
        const eintrag = alle.find((e) => e.id === r.verkauf.katalogeintragId);
        return eintrag ? [{ ...r.verkauf, eintrag }] : [];
      })
      .sort((a, b) => b.belegNr - a.belegNr);
  }),

  /**
   * Zahlungseingang zu einem Verkauf per Überweisung (laut Kontoauszug) – nur Ausstellungsleitung. Erst damit zählt der
   * Erlös für den Aussteller, und das Tier darf gegen den Kaufbeleg hinaus. Unveränderbar, protokolliert.
   */
  zahlungseingangVerkauf: adminProcedure
    .input(z.object({ schauId: dbId, verkaufId: dbId, datum: kalenderdatum() }))
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const [v] = await tx
          .select({ v: verkauf, eingang: verkaufZahlungseingang.id })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
          .where(and(eq(verkauf.id, input.verkaufId), eq(katalogeintrag.schauId, s.id)));
        if (!v) throw fehler("NOT_FOUND", "Verkauf nicht gefunden.");
        if (v.v.storniertAm) throw fehler("BAD_REQUEST", "Der Verkauf ist storniert.");
        if (v.v.zahlart !== "ueberweisung") throw fehler("BAD_REQUEST", "Nur Verkäufe per Überweisung brauchen einen Zahlungseingang.");
        if (v.eingang != null) throw fehler("BAD_REQUEST", `Der Zahlungseingang zu Beleg ${v.v.belegNr} ist schon gebucht.`);
        const [e] = await tx.insert(verkaufZahlungseingang).values({ verkaufId: v.v.id, datum: input.datum, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: s.id, tabelle: "verkauf", datensatzId: v.v.id, aktion: "Zahlungseingang", neu: { belegNr: v.v.belegNr, preisCent: v.v.preisCent, datum: input.datum, eingangId: e!.id }, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Verkäufe per Überweisung, deren Zahlungseingang noch fehlt (Liste für die Kasse). */
  offeneUeberweisungen: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return offeneUeberweisungsverkaeufe(db, s.id);
  }),

  abrechnung: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const zeilen = await abrechnungListe(s.id);
    // Helfer an der Kasse sehen nur, ob und welche IBAN hinterlegt ist (gekürzt) – überweisen darf nur die AL.
    return ctx.benutzer.rolle === "admin" ? zeilen : zeilen.map((z) => ({ ...z, iban: verdeckeIban(z.iban) }));
  }),

  /**
   * Bucht die Auszahlung. Gibt es schon gültige Buchungen, wird nur der Unterschied gebucht (Nachzahlung oder
   * Rückforderung) – mit eigener Quittung und Bezug auf die erste. Bereits gezahltes Geld wird so nie doppelt ausgezahlt.
   */
  auszahlen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        ausstellerId: dbId,
        art: z.enum(["bar", "ueberweisung"]).default("bar"),
        /** Der Betrag, den die Seite angezeigt hat – weicht er ab, wird nichts gebucht (die Seite war veraltet). */
        erwartetCent: z.number().int().min(-100_000_000).max(100_000_000).optional(),
        /** Rückforderung per Überweisung: das Geld ist auf dem Vereinskonto eingegangen. */
        eingangBestaetigt: z.boolean().default(false),
        /** Administrator bestätigt eine Barauszahlung, für die das Kassenbuch nicht genug Bargeld ausweist. */
        trotzdem: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (!AUSZAHLUNG_PHASEN.includes(s.phase))
      throw fehler("BAD_REQUEST", s.phase === "abgeschlossen" ? "Die Schau ist abgeschlossen – für Buchungen erst mit Grund zurück zur Abrechnung." : "Ausgezahlt wird ab der Phase „Schau“. Meldegeld-Erstattungen vorher an der Meldung buchen.");
    // Funktionstrennung: eine Überweisung ohne SEPA-Datei bucht nur die Ausstellungsleitung.
    if (input.art === "ueberweisung" && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Überweisungen bucht die Ausstellungsleitung (Administratoren).");
    const a = await db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const zeile = (await abrechnungListe(s.id, tx, { nurAusstellerId: input.ausstellerId })).find((z) => z.ausstellerId === input.ausstellerId);
      if (!zeile) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
      if (zeile.inUeberweisung) throw fehler("CONFLICT", "Aussteller steht in der offenen SEPA-Datei. Erst die Datei buchen oder verwerfen.");
      if (zeile.imEinzug) throw fehler("CONFLICT", LASTSCHRIFT_OFFEN);
      if (zeile.auszahlung && zeile.nochOffenCent === 0) throw fehler("CONFLICT", `Bereits abgerechnet (Quittung ${zeile.auszahlung.quittungNr}).`);
      // Überweisung an den Aussteller nur mit hinterlegter IBAN (sonst nennt die Zahlungsanzeige ein Konto, das es nicht gibt).
      if (input.art === "ueberweisung" && zeile.nochOffenCent > 0 && !zeile.iban) {
        throw fehler("BAD_REQUEST", "Für eine Überweisung fehlt die IBAN des Ausstellers – bitte an der Meldung hinterlegen oder bar auszahlen.");
      }
      if (input.erwartetCent !== undefined && input.erwartetCent !== zeile.nochOffenCent) {
        const euro = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
        throw fehler("CONFLICT", `Der Betrag hat sich geändert: jetzt ${euro(zeile.nochOffenCent)} statt ${euro(input.erwartetCent)}. Bitte die Seite neu laden und prüfen.`);
      }
      const erste = zeile.buchungen.find((b) => !b.storniertAm);
      // Funktionstrennung: Nachzahlungen und Rückforderungen (die Abrechnung hat sich nach einer Quittung geändert)
      // bucht nur die Ausstellungsleitung.
      if (erste && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nachzahlungen und Rückforderungen bucht die Ausstellungsleitung (Administratoren).");
      if (zeile.nochOffenCent < 0 && input.art === "ueberweisung" && !input.eingangBestaetigt)
        throw fehler("BAD_REQUEST", "Eine Rückforderung per Überweisung erst buchen, wenn das Geld auf dem Vereinskonto eingegangen ist.");
      if (input.art === "bar" && zeile.nochOffenCent > 0) await pruefeKassenbestand(tx, s.id, zeile.nochOffenCent, ctx.benutzer, input.trotzdem);
      const [a] = await tx
        .insert(auszahlung)
        .values({
          schauId: s.id,
          ausstellerId: input.ausstellerId,
          betragCent: zeile.nochOffenCent,
          art: input.art,
          quittungNr: await naechsteQuittungNr(tx, s.id),
          ausgezahltVon: ctx.benutzer.id,
          bezugQuittungNr: erste?.quittungNr ?? null,
        })
        .returning();
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "auszahlung",
        datensatzId: a!.id,
        aktion: erste ? (zeile.nochOffenCent > 0 ? "nachgezahlt" : "zurückgefordert") : "ausgezahlt",
        neu: { ausstellerId: zeile.ausstellerId, betrag: zeile.nochOffenCent, art: input.art, quittungNr: a!.quittungNr, bezugQuittungNr: erste?.quittungNr ?? null },
        akteur: ctx,
      });
      return a!;
    });
    await archiviereQuittung(s, a.ausstellerId, a.quittungNr);
    return a;
    }),

  /** Die offene SEPA-Datei (erstellt, noch nicht gebucht) oder null. */
  ueberweisungsdatei: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const lauf = await offenerLauf(db, s.id);
    // Helfer sehen, wer in der Datei steht, aber keine vollständigen Bankdaten (die Datei bearbeitet nur die AL).
    if (!lauf || ctx.benutzer.rolle === "admin") return lauf;
    return { ...lauf, posten: lauf.posten.map((p) => ({ ...p, iban: verdeckeIban(p.iban) })) };
  }),

  /** Legt die SEPA-Datei mit allen jetzt überweisbaren Ausstellern fest. Herunterladen beliebig oft, immer derselbe Inhalt. */
  ueberweisungsdateiErstellen: adminProcedure
    .input(z.object({ schauId: dbId, ausfuehrungAm: kalenderdatum("Ausführungsdatum ungültig.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Echtes Kalenderdatum (kein 31.02.) und nicht in der Vergangenheit – sonst lehnt die Bank die Datei ab.
      const d = new Date(`${input.ausfuehrungAm}T12:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.ausfuehrungAm) throw fehler("BAD_REQUEST", "Ausführungsdatum ungültig.");
      if (input.ausfuehrungAm < heuteDe()) throw fehler("BAD_REQUEST", "Das Ausführungsdatum liegt in der Vergangenheit.");
      if (!SEPA_PHASEN.includes(s.phase)) throw fehler("BAD_REQUEST", "Die SEPA-Datei gehört in die Phase „Abrechnung“ (nach der Schau).");
      if (!s.vereinIban) throw fehler("BAD_REQUEST", "Bitte zuerst das Vereinskonto in den Einstellungen eintragen.");
      return db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        if (await offenerLauf(tx, s.id)) throw fehler("CONFLICT", "Es gibt schon eine offene SEPA-Datei. Erst buchen oder verwerfen.");
        // Phase unter der Sperre frisch lesen: ein gleichzeitiger Abschluss nimmt dieselbe Sperre (routers/schau.ts phaseSetzen).
        const [frisch] = await tx.select({ phase: schau.phase }).from(schau).where(eq(schau.id, s.id));
        if (!frisch || !SEPA_PHASEN.includes(frisch.phase)) throw fehler("BAD_REQUEST", "Die SEPA-Datei gehört in die Phase „Abrechnung“ (nach der Schau).");
        // Die Salden rechnen offenes Meldegeld ab, das die offene Lastschrift gerade einzieht – erst sie buchen oder verwerfen.
        if (await offeneLastschrift(tx, s.id)) throw fehler("CONFLICT", "Es gibt eine offene Lastschriftdatei. Erst buchen oder verwerfen, dann die Überweisungen.");
        const zeilen = (await abrechnungListe(s.id, tx)).filter((z) => z.ueberweisbar);
        if (zeilen.length === 0) throw fehler("BAD_REQUEST", "Keine offenen Überweisungen.");
        const jetzt = new Date();
        const lauf: UeberweisungsLauf = {
          nachrichtId: `SCHAU${s.id}-${jetzt.getTime().toString(36).toUpperCase()}`,
          erstelltAm: jetzt.toISOString(),
          ausfuehrungAm: input.ausfuehrungAm,
          auftraggeber: { name: s.vereinKontoinhaber || s.veranstalter || s.name, iban: s.vereinIban!, bic: s.vereinBic },
          posten: zeilen.map((z) => ({ ausstellerId: z.ausstellerId, name: z.name, kontoinhaber: z.kontoinhaber, iban: z.iban!, betragCent: z.nochOffenCent })),
          summeCent: zeilen.reduce((x, z) => x + z.nochOffenCent, 0),
        };
        try {
          sepaXml(s, lauf); // prüft IBANs und Beträge, bevor die Datei festgehalten wird
        } catch (err) {
          throw fehler("BAD_REQUEST", err instanceof Error ? err.message : String(err));
        }
        await tx.insert(sepaLauf).values({ schauId: s.id, nachrichtId: lauf.nachrichtId, daten: lauf, erstelltVon: ctx.benutzer.name });
        // Im Protokoll nur Kennung, Anzahl, Summe und Beträge je Aussteller – keine IBANs, Namen oder Kontoinhaber.
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "auszahlung",
          datensatzId: null,
          aktion: SEPA_ERSTELLT,
          neu: { nachrichtId: lauf.nachrichtId, ausfuehrungAm: lauf.ausfuehrungAm, anzahl: lauf.posten.length, summe: lauf.summeCent, posten: lauf.posten.map((p) => ({ ausstellerId: p.ausstellerId, betragCent: p.betragCent })) },
          akteur: ctx,
        });
        return lauf;
      });
    }),

  /** Verwirft die offene SEPA-Datei, z. B. wenn die Bank sie abgelehnt hat. */
  ueberweisungsdateiVerwerfen: adminProcedure
    .input(z.object({ schauId: dbId, nachrichtId: z.string().max(500), grund: z.string().max(500).trim().min(3, "Bitte einen Grund angeben.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const lauf = await offenerLauf(tx, s.id);
        if (!lauf || lauf.nachrichtId !== input.nachrichtId) throw fehler("CONFLICT", "Diese SEPA-Datei ist nicht mehr offen.");
        await schliesseLauf(tx, s.id, lauf.nachrichtId, "verworfen");
        await protokolliere(tx, { schauId: s.id, tabelle: "auszahlung", datensatzId: null, aktion: SEPA_VERWORFEN, neu: { nachrichtId: lauf.nachrichtId, anzahl: lauf.posten.length, summe: lauf.summeCent }, grund: input.grund, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Bucht die Aussteller aus der offenen SEPA-Datei mit den Beträgen der Datei als ausgezahlt (Art: Überweisung). */
  ueberweisungenBuchen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Kennung der Datei, die der Bank übergeben wurde. */
        nachrichtId: z.string().max(500).optional(),
        /** Nur zur Kontrolle: muss genau den Ausstellern der Datei entsprechen. */
        ausstellerIds: z.array(dbId).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Buchen bestätigt nur eine schon erstellte (und meist schon ausgeführte) Überweisung – nicht an die Phase gebunden,
      // sonst blieben die Aussteller nach einem Rückwechsel gesperrt. Abschließen geht mit offener Datei ohnehin nicht.
      const gebucht: { ausstellerId: number; quittungNr: number }[] = [];
      let stand: Awaited<ReturnType<typeof abrechnungListe>> = [];
      const r = await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const lauf = await offenerLauf(tx, s.id);
        if (!lauf) throw fehler("BAD_REQUEST", "Keine offenen Überweisungen. Bitte zuerst die SEPA-Datei erstellen.");
        if (input.nachrichtId && input.nachrichtId !== lauf.nachrichtId) throw fehler("CONFLICT", "Diese SEPA-Datei ist nicht mehr offen.");
        if (input.ausstellerIds) {
          const soll = new Set(lauf.posten.map((p) => p.ausstellerId));
          if (new Set(input.ausstellerIds).size !== soll.size || !input.ausstellerIds.every((id) => soll.has(id))) throw fehler("CONFLICT", "Die Auswahl weicht von der SEPA-Datei ab.");
        }
        // Frühere gültige Buchungen: die Überweisung ist dann eine Nachzahlung mit Bezug auf die erste Quittung.
        const frueher = await tx
          .select()
          .from(auszahlung)
          .where(and(eq(auszahlung.schauId, s.id), inArray(auszahlung.ausstellerId, lauf.posten.map((p) => p.ausstellerId)), isNull(auszahlung.storniertAm)))
          .orderBy(asc(auszahlung.id));
        let nr = (await naechsteQuittungNr(tx, s.id)) - 1;
        for (const p of lauf.posten) {
          const erste = frueher.find((a) => a.ausstellerId === p.ausstellerId);
          gebucht.push({ ausstellerId: p.ausstellerId, quittungNr: nr + 1 });
          await tx.insert(auszahlung).values({
            schauId: s.id,
            ausstellerId: p.ausstellerId,
            betragCent: p.betragCent,
            art: "ueberweisung",
            quittungNr: ++nr,
            ausgezahltVon: ctx.benutzer.id,
            bezugQuittungNr: erste?.quittungNr ?? null,
          });
        }
        await schliesseLauf(tx, s.id, lauf.nachrichtId, "gebucht");
        // Stand zum Buchungszeitpunkt festhalten: die Quittungen entstehen danach im Hintergrund und zeigen genau ihn.
        // Nur die Aussteller dieser Datei rechnen: die Kasse bleibt dafür gesperrt.
        stand = await abrechnungListe(s.id, tx, { nurAusstellerIds: lauf.posten.map((p) => p.ausstellerId) });
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "auszahlung",
          datensatzId: null,
          aktion: SEPA_GEBUCHT,
          neu: { nachrichtId: lauf.nachrichtId, anzahl: lauf.posten.length, summe: lauf.summeCent },
          akteur: ctx,
        });
        return { anzahl: lauf.posten.length, summeCent: lauf.summeCent };
      });
      // Quittungen im Hintergrund ablegen (bei vielen Posten dauert das); fehlt eine, entsteht sie beim ersten Abruf.
      void (async () => {
        for (const g of gebucht) await archiviereQuittung(s, g.ausstellerId, g.quittungNr, false, stand.find((z) => z.ausstellerId === g.ausstellerId));
      })().catch((e) => console.error("[belege] Quittungen der SEPA-Buchung:", kurzerFehler(e)));
      return r;
    }),

  /**
   * Storniert eine Buchung, bei der kein Geld geflossen ist (Fehlbuchung, Überweisung von der Bank zurückgebucht).
   * Die Buchung bleibt mit Grund sichtbar und zählt nicht mehr. Für Korrekturen nach echter Zahlung: Differenz auszahlen.
   */
  auszahlungStornieren: adminProcedure
    .input(z.object({ schauId: dbId, id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      pruefeNichtAbgeschlossen(s);
      const a = await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        const [a] = await tx.select().from(auszahlung).where(and(eq(auszahlung.id, input.id), eq(auszahlung.schauId, input.schauId)));
        if (!a) throw fehler("NOT_FOUND", "Auszahlung nicht gefunden.");
        if (a.storniertAm) throw fehler("CONFLICT", `Quittung ${a.quittungNr} ist bereits storniert.`);
        // Nur die jüngste gültige Buchung: sonst bezöge sich eine spätere Nachzahlung auf einen falschen Stand.
        const [neuere] = await tx
          .select({ nr: auszahlung.quittungNr })
          .from(auszahlung)
          .where(and(eq(auszahlung.schauId, input.schauId), eq(auszahlung.ausstellerId, a.ausstellerId), isNull(auszahlung.storniertAm), gt(auszahlung.id, a.id)));
        if (neuere) throw fehler("CONFLICT", `Erst die spätere Quittung ${neuere.nr} stornieren.`);
        await tx.update(auszahlung).set({ storniertAm: new Date(), storniertVon: ctx.benutzer.id, stornoGrund: input.grund }).where(eq(auszahlung.id, a.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "auszahlung", datensatzId: a.id, aktion: "storniert", alt: a, grund: input.grund, akteur: ctx });
        return a;
      });
      await archiviereQuittung(s, a.ausstellerId, a.quittungNr, true);
      return { ok: true };
    }),

  // ── Kassenbuch (Barkasse) ───────────────────────────────────────────────

  /** Kassenbuch nach Tagen: Anfangsbestand, Bargeldbewegungen, Soll, Tagesabschluss. */
  kassenbuch: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const tage = await ladeKassenbuch(input.schauId);
    const heute = heuteDe();
    // Abzuschließen ist immer der älteste Tag mit Bargeld ohne Abschluss (nach Mitternacht also der Vortag) –
    // Kassentage nur der Reihe nach, sonst stimmte der Anfangsbestand nicht. Ohne offenen Tag: heute.
    // Tage vor dem letzten Abschluss zählen nicht mehr (Bestand vor Einführung der Reihenfolge: ein übersprungener Tag
    // ließe sich nie mehr abschließen und blockierte sonst die Kasse für immer).
    const letzter = letzterAbschluss(tage);
    // Offen ist auch ein abgeschlossener Tag mit Barbuchungen danach: er braucht einen Nachtragsabschluss.
    const offen = tage.filter((t) => ((!t.abschluss && t.bewegungen.length && t.datum > letzter) || t.nachtragOffen) && t.datum <= heute).map((t) => t.datum);
    const heuteTag = tage.find((t) => t.datum === heute);
    const heuteAbgeschlossen = !!heuteTag?.abschluss && !heuteTag.nachtragOffen;
    const vorschlag = offen[0] ?? heute;
    const sollJe = { [vorschlag]: await sollBestand(input.schauId, db, vorschlag) };
    const nachtragJe = Object.fromEntries(offen.map((d) => [d, !!tage.find((t) => t.datum === d)?.abschluss]));
    return { tage, heute, heuteAbgeschlossen, sollCent: sollJe[vorschlag] ?? 0, vorschlag, offeneTage: offen[0] || !heuteAbgeschlossen ? [vorschlag] : [], sollJe, nachtragJe };
  }),

  /** Wechselgeld zu Beginn, Einlage oder Entnahme (z. B. Bargeld zur Bank). */
  kassenbewegung: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        art: z.enum(KASSENBEWEGUNG_ARTEN),
        betragCent: z.number().int().min(1, "Betrag fehlt.").max(10_000_000),
        grund: z.string().trim().max(500).default(""),
        /** Entnahme, obwohl das Kassenbuch nicht so viel Bargeld ausweist (nur nach Rückfrage). */
        trotzdem: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Kassenbuchungen mehr.");
      if (input.art === "entnahme" && input.grund.length < 3) throw fehler("BAD_REQUEST", "Bei einer Entnahme bitte den Zweck angeben (z. B. „Einzahlung Bank“).");
      // Funktionstrennung: Geld aus der Kasse nehmen darf nur die Ausstellungsleitung.
      if (input.art === "entnahme" && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Entnahmen bucht die Ausstellungsleitung (Administratoren).");
      const k = await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        if (input.art === "entnahme") await pruefeKassenbestand(tx, input.schauId, input.betragCent, ctx.benutzer, input.trotzdem);
        const { trotzdem: _t, ...werte } = input;
        const [k] = await tx.insert(kassenbewegung).values({ ...werte, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "kassenbewegung", datensatzId: k!.id, aktion: input.art, neu: k, grund: input.grund, akteur: ctx });
        return k!;
      });
      await archiviereKassenbeleg(s, "eigenbeleg", k.id);
      return { ok: true };
    }),

  /**
   * Tagesabschluss mit gezähltem Bestand für einen Kassentag (Standard: heute; nach Mitternacht der Vortag).
   * Eine Differenz braucht eine Erklärung. Barbuchungen bleiben danach möglich; sie stehen als Nachtrag im Kassenbuch und
   * werden mit einem Nachtragsabschluss (neu gezählter Bestand) abgeschlossen. Frühere Abschlüsse bleiben unverändert.
   */
  tagesabschluss: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        datum: kalenderdatum().optional(),
        istCent: z.number().int().min(0).max(100_000_000),
        bemerkung: z.string().trim().max(1000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const datum = input.datum ?? heuteDe();
      if (!istKalenderdatum(datum)) throw fehler("BAD_REQUEST", "Datum ungültig.");
      if (datum > heuteDe()) throw fehler("BAD_REQUEST", "Ein Tagesabschluss für einen künftigen Tag geht nicht.");
      return db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        const tage = await ladeKassenbuch(input.schauId, tx);
        const tag = tage.find((t) => t.datum === datum);
        if (tag?.abschluss && !tag.nachtragOffen) throw fehler("BAD_REQUEST", `Der Kassentag ${datumKurz(datum)} ist schon abgeschlossen (keine Barbuchung seitdem).`);
        const nachtrag = tag?.abschluss ? tag.abschluss.nachtrag + 1 : 0;
        // Kassentage nur der Reihe nach: sonst stimmte der Anfangsbestand der Folgetage nicht mehr, und ein früherer
        // offener Tag ließe sich nie mehr abschließen.
        if (tage.some((t) => t.datum > datum && t.abschluss)) throw fehler("BAD_REQUEST", "Ein späterer Kassentag ist schon abgeschlossen.");
        const frueher = tage.find((t) => t.datum < datum && ((t.datum > letzterAbschluss(tage) && !t.abschluss && t.bewegungen.length) || t.nachtragOffen));
        if (frueher) throw fehler("BAD_REQUEST", `Erst den Kassentag ${datumKurz(frueher.datum)} abschließen.`);
        if (datum !== heuteDe() && !tage.some((t) => t.datum === datum && t.bewegungen.length)) throw fehler("BAD_REQUEST", "An diesem Tag gab es keine Bargeldbewegung.");
        const sollCent = await sollBestand(input.schauId, tx, datum);
        const differenzCent = input.istCent - sollCent;
        if (differenzCent !== 0 && input.bemerkung.length < 3) {
          throw fehler("BAD_REQUEST", `Gezählt ${(input.istCent / 100).toFixed(2)} €, Soll ${(sollCent / 100).toFixed(2)} € – bitte die Differenz erklären.`);
        }
        const [a] = await tx
          .insert(kassenabschluss)
          .values({ schauId: input.schauId, datum, sollCent, istCent: input.istCent, differenzCent, bemerkung: input.bemerkung, erfasstVon: ctx.benutzer.id, nachtrag })
          .returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "kassenabschluss", datensatzId: a!.id, aktion: nachtrag ? "Nachtragsabschluss" : "Tagesabschluss", neu: a, grund: input.bemerkung, akteur: ctx });
        return a!;
      });
    }),

  /** Archivierte Belege mit Prüfsumme (SHA-256). */
  belege: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return belegListe(input.schauId);
  }),
});