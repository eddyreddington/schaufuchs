/**
 * Import aus Altprogrammen (Entscheidung 015): Tabelle prüfen (Zeilen, Aussteller wiedererkennen, Rassen abgleichen),
 * übernehmen (über dieselben Wege wie die Oberfläche: speichereAussteller bzw. speichereMeldung – mit allen Prüfungen
 * und Protokoll) und einen ganzen Importlauf zurücknehmen, solange nichts weiter damit geschehen ist.
 * Vorhandene Aussteller werden nie überschrieben.
 */
import { ausstellerSchluessel, type ImportAussteller, type ImportFeld, type ImportZeile, istAuslaendisch, istJugendlich, JUGEND_ALTERSGRENZE, PHASEN_LABEL, rassenVorschlaege, suchNorm, zeilenAuswerten } from "@schau/domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { aenderung, auszahlung, aussteller, farbenschlag, importlauf, katalogeintrag, meldung, organisation, postausgang, rasse, schau, spende, spender, stiftung, zahlung } from "../db/schema";
import { fehler } from "../trpc";
import { ausstellerVerwaltungEingabe, speichereAussteller } from "./aussteller";
import { offenerLauf, sperreKasse } from "./kasse";
import { ausstellerEingabe, bindungen, meldungEingabe, positionEingabe, speichereMeldung } from "./meldung";
import { type Akteur, protokolliere } from "./protokoll";
import { ausstellerDerSchau, echteAussteller } from "./testschau";

export interface ImportEingabe {
  art: "aussteller" | "meldungen";
  schauId?: number;
  dateiname: string;
  tabelle: string[][];
  zuordnung: (ImportFeld | null)[];
  mitKopf: boolean;
  /** Von Hand gewählt: Schlüssel der Rasse aus der Datei → Farbenschlag im Verzeichnis (null = auslassen). */
  rassen: Record<string, number | null>;
}
type Lesen = Pick<Tx, "select">;
type Benutzer = Akteur & { benutzer: { id: number; name: string } };

/** Phasen, in denen noch Meldungen hinzukommen dürfen (und ein Import zurückgenommen werden kann). */
const IMPORT_PHASEN: string[] = ["vorbereitung", "meldung", "katalog"];
export const rassenSchluessel = (r: string, f: string) => suchNorm(`${r} ${f}`);
const namensSchluessel = (a: Pick<ImportAussteller, "vorname" | "nachname" | "plz">) => `name:${a.vorname.trim().toLowerCase()}|${a.nachname.trim().toLowerCase()}|${a.plz.trim()}`;
const stammdaten = (d: ImportAussteller) => ({ vorname: d.vorname, nachname: d.nachname, strasse: d.strasse, plz: d.plz, ort: d.ort, telefon: d.telefon, email: d.email, verein: d.verein, kreisverband: d.kreisverband, registriernummer: d.registriernummer, istPreisrichter: false, iban: "", kontoinhaber: "" });
const zodText = (e: { issues: { message: string }[] }) => [...new Set(e.issues.map((i) => i.message))].join(" ");

/** Prüfbericht: Zeilen mit Fehlern und Hinweisen, Aussteller (neu oder vorhanden), Rassen mit Zuordnung und Vorschlägen. */
export async function importPruefen(q: Lesen, organisationId: number, e: ImportEingabe) {
  const zeilen = zeilenAuswerten(e.tabelle, e.zuordnung, { mitKopf: e.mitKopf, art: e.art });
  let s: typeof schau.$inferSelect | null = null;
  if (e.art === "meldungen") {
    [s = null] = await q.select().from(schau).where(and(eq(schau.id, e.schauId ?? 0), eq(schau.organisationId, organisationId)));
    if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
    if (!IMPORT_PHASEN.includes(s.phase)) throw fehler("BAD_REQUEST", "Meldungen lassen sich nur bis zur Phase „Katalog & Halle“ importieren.");
  }

  // Aussteller wiedererkennen: Registriernummer, sonst Vorname, Nachname und PLZ – auch gesperrte und gelöschte, damit
  // sie nicht neu entstehen. In einer Testschau nur deren Test-Aussteller (dort entstehen Test-Aussteller).
  const vorhandene = await q
    .select()
    .from(aussteller)
    .where(and(eq(aussteller.organisationId, organisationId), s ? ausstellerDerSchau(s) : echteAussteller()))
    // Nicht gesperrte zuerst: eine gesperrte Person, die neu angelegt wurde, wird über den neuen Datensatz erkannt.
    .orderBy(sql`(${aussteller.gesperrtAm} is not null or ${aussteller.geloeschtAm} is not null)`, aussteller.id);
  type Vorhanden = (typeof vorhandene)[number];
  const nachNummer = new Map<string, Vorhanden>();
  const nachNamen = new Map<string, Vorhanden[]>();
  for (const a of vorhandene) {
    if (a.registriernummer && !nachNummer.has(ausstellerSchluessel(a))) nachNummer.set(ausstellerSchluessel(a), a);
    const n = namensSchluessel(a);
    nachNamen.set(n, [...(nachNamen.get(n) ?? []), a]);
  }
  // Über den Namen; eine PLZ, die beim Lesen eine führende 0 bekam, auch ohne sie (gespeichert evtl. vierstellig).
  const namensTreffer = (d: ImportAussteller) => nachNamen.get(namensSchluessel(d)) ?? (/^0\d{4}$/.test(d.plz) ? nachNamen.get(namensSchluessel({ ...d, plz: d.plz.slice(1) })) : undefined) ?? [];

  // Je Person eine Gruppe. Erst die Zeilen mit Registriernummer (je Nummer eine Gruppe), dann die ohne: Sie gehören zur
  // Gruppe mit demselben Namen – passt der Name zu mehreren Nummern (Vater und Sohn), ist das ein Fehler der Zeile.
  type Gruppe = { schluessel: string; daten: ImportAussteller; vorhanden: { id: number; name: string; gesperrt: boolean; registriernummer: string; geburtsdatum: string | null } | null; zeilen: number[]; mehrdeutig: boolean };
  const gruppen: Gruppe[] = [];
  const mehrdeutigeZeilen = new Set<number>();
  const mitName = zeilen.filter((z) => z.aussteller.nachname);
  for (const z of mitName.filter((x) => x.aussteller.registriernummer)) {
    const k = ausstellerSchluessel(z.aussteller);
    const g = gruppen.find((x) => x.schluessel === k);
    if (g) g.zeilen.push(z.nr);
    else gruppen.push({ schluessel: k, daten: z.aussteller, vorhanden: null, zeilen: [z.nr], mehrdeutig: false });
  }
  for (const z of mitName.filter((x) => !x.aussteller.registriernummer)) {
    const n = namensSchluessel(z.aussteller);
    const passend = gruppen.filter((x) => namensSchluessel(x.daten) === n);
    const mitNummer = passend.filter((x) => x.schluessel.startsWith("reg:"));
    // Nummern aus Datei und Verzeichnis zusammen: mehr als eine heißt, die Zeile kann mehrere Personen meinen.
    const nummern = new Set([...mitNummer.map((x) => x.schluessel), ...namensTreffer(z.aussteller).filter((a) => a.registriernummer && !(a.gesperrtAm || a.geloeschtAm)).map((a) => ausstellerSchluessel(a))]);
    if (nummern.size > 1) {
      mehrdeutigeZeilen.add(z.nr);
      continue;
    }
    const g = mitNummer[0] ?? passend[0];
    if (g) g.zeilen.push(z.nr);
    else gruppen.push({ schluessel: n, daten: z.aussteller, vorhanden: null, zeilen: [z.nr], mehrdeutig: false });
  }
  // Vorhandene zuordnen. Über den Namen nur ohne Widerspruch: ein vorhandener Aussteller mit anderer Nummer ist eine
  // andere Person; einer ohne Nummer, zu dem mehrere Nummern der Datei passen, ist nicht eindeutig.
  const alsVorhanden = (v: Vorhanden) => ({ id: v.id, name: `${v.vorname} ${v.nachname}`, gesperrt: !!(v.gesperrtAm || v.geloeschtAm), registriernummer: v.registriernummer, geburtsdatum: v.geburtsdatum });
  for (const g of gruppen) {
    if (g.schluessel.startsWith("reg:")) {
      const v = nachNummer.get(g.schluessel);
      if (v) g.vorhanden = alsVorhanden(v);
      else {
        const ohneNummer = namensTreffer(g.daten).filter((a) => !a.registriernummer);
        const andere = gruppen.filter((x) => x !== g && x.schluessel.startsWith("reg:") && namensSchluessel(x.daten) === namensSchluessel(g.daten) && !nachNummer.has(x.schluessel));
        if (ohneNummer.length && andere.length) g.mehrdeutig = true;
        else if (ohneNummer[0]) g.vorhanden = alsVorhanden(ohneNummer[0]);
      }
    } else {
      // Ohne Nummer: Passen mehrere (nicht gesperrte) vorhandene Aussteller, ist die Zeile nicht eindeutig.
      const treffer = namensTreffer(g.daten);
      const aktive = treffer.filter((a) => !(a.gesperrtAm || a.geloeschtAm));
      if (aktive.length > 1) g.mehrdeutig = true;
      else if (treffer[0]) g.vorhanden = alsVorhanden(aktive[0] ?? treffer[0]);
    }
  }
  // Zwei Schreibweisen, die auf denselben vorhandenen Aussteller führen, sind eine Gruppe (sonst zwei Meldungen).
  for (let i = gruppen.length - 1; i > 0; i--) {
    const g = gruppen[i]!;
    const erste = g.vorhanden && gruppen.find((x, j) => j < i && x.vorhanden?.id === g.vorhanden!.id);
    if (erste) {
      erste.zeilen.push(...g.zeilen);
      erste.zeilen.sort((x, y) => x - y);
      gruppen.splice(i, 1);
    }
  }
  const zeileZuGruppe = new Map(gruppen.flatMap((g) => g.zeilen.map((nr) => [nr, g] as const)));

  // Wer schon eine Meldung in dieser Schau hat, wird übersprungen (keine zweite Meldung, nichts überschrieben).
  const schonGemeldet = new Set<number>();
  if (s) {
    const ids = gruppen.map((g) => g.vorhanden?.id).filter((x): x is number => x != null);
    if (ids.length) for (const x of await q.select({ id: meldung.ausstellerId }).from(meldung).where(and(eq(meldung.schauId, s.id), inArray(meldung.ausstellerId, ids)))) schonGemeldet.add(x.id);
  }

  // Rassen abgleichen: von Hand gewählt, sonst vom Verein gelernt, sonst genauer Treffer, sonst nur Vorschläge.
  type Quelle = "gewaehlt" | "gelernt" | "genau" | null;
  const rassen: { schluessel: string; rasse: string; farbenschlag: string; anzahl: number; farbenschlagId: number | null; quelle: Quelle; vorschlaege: { id: number; rasse: string; farbenschlag: string }[] }[] = [];
  if (s) {
    const verzeichnis = await q
      .select({ id: farbenschlag.id, rasse: rasse.name, farbenschlag: farbenschlag.name })
      .from(farbenschlag)
      .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
      .where(eq(farbenschlag.versionId, s.stammdatenVersionId ?? -1));
    const [o] = await q.select({ z: organisation.importZuordnungen }).from(organisation).where(eq(organisation.id, organisationId));
    const gelernt = o?.z ?? {};
    const zaehler = new Map<string, { rasse: string; farbenschlag: string; anzahl: number }>();
    for (const z of zeilen) {
      if (!z.tier?.rasse) continue;
      const k = rassenSchluessel(z.tier.rasse, z.tier.farbenschlag);
      zaehler.set(k, { rasse: z.tier.rasse, farbenschlag: z.tier.farbenschlag, anzahl: (zaehler.get(k)?.anzahl ?? 0) + 1 });
    }
    for (const [k, r] of zaehler) {
      const vorschlaege = rassenVorschlaege(r.rasse, r.farbenschlag, verzeichnis);
      // Gelernt wird über die Namen – so gilt eine Zuordnung auch nach einem neuen Stand des Verzeichnisses.
      const l = gelernt[k];
      const gelernteId = l ? (verzeichnis.find((x) => x.rasse === l.rasse && x.farbenschlag === l.farbenschlag)?.id ?? null) : null;
      const genau = vorschlaege.find((v) => v.genau)?.id ?? null;
      let id: number | null;
      let quelle: Quelle;
      if (Object.hasOwn(e.rassen, k)) {
        const w = e.rassen[k];
        id = w != null && verzeichnis.some((v) => v.id === w) ? w : null;
        quelle = id != null ? "gewaehlt" : null;
      } else {
        id = gelernteId ?? genau;
        quelle = gelernteId != null ? "gelernt" : genau != null ? "genau" : null;
      }
      rassen.push({ schluessel: k, ...r, farbenschlagId: id, quelle, vorschlaege: vorschlaege.map((v) => ({ id: v.id, rasse: v.rasse, farbenschlag: v.farbenschlag })) });
    }
  }
  const nachSchluessel = new Map(rassen.map((r) => [r.schluessel, r.farbenschlagId]));

  // Was beim Speichern scheitern würde, ist ein Fehler der Zeile – mit denselben Schemata wie beim Speichern. So bricht
  // nie der ganze Import an einer einzelnen Zeile ab.
  const MEHRDEUTIG = "Name passt zu mehreren Registriernummern – bitte die Nummer in der Datei bzw. beim vorhandenen Aussteller eintragen.";
  const gruppenFehler = new Map<Gruppe, string[]>();
  const gruppenHinweise = new Map<Gruppe, string[]>();
  for (const g of gruppen) {
    const f: string[] = [];
    const h: string[] = [];
    if (g.mehrdeutig) f.push(MEHRDEUTIG);
    if (g.vorhanden?.gesperrt) f.push(`Aussteller ${g.vorhanden.name} ist gesperrt bzw. gelöscht – nicht importiert.`);
    if (!g.vorhanden) {
      let p = ausstellerEingabe.safeParse({ ...stammdaten(g.daten), geburtsdatum: null });
      // Eine E-Mail-Adresse, die erst die strenge Prüfung beim Speichern ablehnt, wird weggelassen (wie in der Domain).
      if (!p.success && p.error.issues.some((i) => i.path[0] === "email")) {
        h.push(`E-Mail „${g.daten.email.slice(0, 40)}“ nicht gültig – wird nicht übernommen.`);
        g.daten = { ...g.daten, email: "" };
        p = ausstellerEingabe.safeParse({ ...stammdaten(g.daten), geburtsdatum: null });
      }
      if (!p.success) f.push(`Aussteller: ${zodText(p.error)}`);
    }
    if (s && !s.auslandZugelassen && (istAuslaendisch(g.daten.registriernummer) || istAuslaendisch(g.vorhanden?.registriernummer))) f.push("Diese Schau nimmt keine Tiere aus dem Ausland an (ausländische Registriernummer).");
    if (e.art === "meldungen" && g.zeilen.length > 500) f.push("Mehr als 500 Tiere für einen Aussteller.");
    gruppenFehler.set(g, f);
    gruppenHinweise.set(g, h);
  }
  // Jugend: maßgeblich ist das gespeicherte Geburtsdatum eines vorhandenen Ausstellers (wie beim Speichern).
  const stichtag = s?.bewertungAm ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const nichtMehrJugend = (g: Gruppe | undefined) => !!g?.vorhanden?.geburtsdatum && !istJugendlich(g.vorhanden.geburtsdatum, stichtag);

  const bericht: (ImportZeile & { farbenschlagId: number | null })[] = zeilen.map((z) => {
    const g = zeileZuGruppe.get(z.nr);
    const farbenschlagId = z.tier ? (nachSchluessel.get(rassenSchluessel(z.tier.rasse, z.tier.farbenschlag)) ?? null) : null;
    const fehlerNeu = mehrdeutigeZeilen.has(z.nr) ? [MEHRDEUTIG] : [...(g ? gruppenFehler.get(g)! : [])];
    if (z.tier?.istJugend && nichtMehrJugend(g)) fehlerNeu.push(`Laut gespeichertem Geburtsdatum am Bewertungstag nicht mehr jugendlich (unter ${JUGEND_ALTERSGRENZE} Jahre) – in der Datei ohne Jugend melden.`);
    if (e.art === "meldungen" && z.tier?.rasse && !z.fehler.length) {
      if (farbenschlagId == null) fehlerNeu.push("Rasse und Farbenschlag noch nicht zugeordnet.");
      else {
        const t = z.tier;
        const p = positionEingabe.safeParse({ farbenschlagId, freitext: "", art: t.art, geschlecht: t.geschlecht, alter: t.alter, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: t.verkaufspreisCent, ringnummern: t.ringnummern });
        if (!p.success) fehlerNeu.push(`Tier: ${zodText(p.error)}`);
      }
    }
    const hinweiseNeu =
      g?.vorhanden && schonGemeldet.has(g.vorhanden.id) ? ["Aussteller hat in dieser Schau schon eine Meldung – wird übersprungen."] : g?.vorhanden && !g.vorhanden.gesperrt ? [`Aussteller gibt es schon (${g.vorhanden.name}) – bleibt, wie er ist.`] : [];
    return { ...z, farbenschlagId, fehler: [...z.fehler, ...fehlerNeu], hinweise: [...z.hinweise, ...(g ? gruppenHinweise.get(g)! : []), ...hinweiseNeu] };
  });
  return {
    zeilen: bericht,
    aussteller: gruppen.map(({ vorhanden, mehrdeutig: _, ...g }) => ({ ...g, vorhanden: vorhanden && { id: vorhanden.id, name: vorhanden.name }, schonGemeldet: vorhanden ? schonGemeldet.has(vorhanden.id) : false })),
    rassen,
    schau: s ? { id: s.id, name: s.name, test: s.test } : null,
  };
}

/** Übernimmt den Import in einer Transaktion. Zeilen mit Fehlern gehen nicht mit. */
export async function importUebernehmen(organisationId: number, e: ImportEingabe & { bestaetigen: boolean; zustimmung: boolean }, akteur: Benutzer) {
  return db.transaction(async (tx) => {
    // Zwei gleichzeitige Importe desselben Vereins (Doppelklick) laufen nacheinander – der zweite sieht den ersten.
    await tx.execute(sql`select pg_advisory_xact_lock(${organisationId}, hashtext('import'))`);
    const p = await importPruefen(tx, organisationId, e);
    const gut = new Map(p.zeilen.filter((z) => !z.fehler.length).map((z) => [z.nr, z]));
    const ausstellerIds: number[] = [];
    const meldungIds: number[] = [];
    let anzahlTiere = 0;
    for (const g of p.aussteller) {
      const zeilen = g.zeilen.map((nr) => gut.get(nr)).filter((z) => z != null);
      if (!zeilen.length || g.schonGemeldet) continue;
      // Was die Prüfung nicht vorhersah, nennt die Zeile statt „Interner Fehler“ (und bricht den Import ab).
      const mitZeile = (err: unknown) => {
        if (err instanceof TRPCError) throw fehler("BAD_REQUEST", `Zeile ${g.zeilen[0]} (${g.daten.vorname} ${g.daten.nachname}): ${err.message}`);
        throw err;
      };
      if (e.art === "aussteller") {
        if (g.vorhanden) continue;
        const r = await speichereAussteller(tx, organisationId, ausstellerVerwaltungEingabe.parse({ daten: stammdaten(g.daten), mitglied: "auto", trotzdem: true }), akteur).catch(mitZeile);
        ausstellerIds.push(r.id);
        continue;
      }
      // Vorhandener Aussteller bleibt, wie er ist (bestehendenNichtAendern); ein neuer entsteht mit der Meldung.
      const [v] = g.vorhanden ? await tx.select().from(aussteller).where(eq(aussteller.id, g.vorhanden.id)) : [];
      const eingabe = meldungEingabe.parse({
        schauId: e.schauId,
        aussteller: v
          ? { id: v.id, vorname: v.vorname, nachname: v.nachname, strasse: v.strasse, plz: v.plz, ort: v.ort, telefon: v.telefon, email: v.email, verein: v.verein, kreisverband: v.kreisverband, registriernummer: v.registriernummer, geburtsdatum: null, istPreisrichter: v.istPreisrichter, iban: "", kontoinhaber: "" }
          : { ...stammdaten(g.daten), geburtsdatum: null },
        eingang: "papier",
        istJugend: zeilen.some((z) => z.tier!.istJugend),
        bemerkung: `Import aus ${e.dateiname || "Datei"}`.slice(0, 200),
        zustimmung: e.zustimmung,
        positionen: zeilen.map(({ tier: t, farbenschlagId }) => ({ farbenschlagId, freitext: "", art: t!.art, geschlecht: t!.geschlecht, alter: t!.alter, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: t!.verkaufspreisCent, ringnummern: t!.ringnummern })),
      });
      const r = await speichereMeldung(tx, organisationId, eingabe, akteur, { istAdmin: true, ibanVerdeckt: true, bestehendenNichtAendern: !!v }).catch(mitZeile);
      meldungIds.push(r.meldungId);
      anzahlTiere += zeilen.length;
      if (!v) ausstellerIds.push(r.ausstellerId);
      if (e.bestaetigen) {
        await tx.update(meldung).set({ status: "bestaetigt" }).where(eq(meldung.id, r.meldungId));
        await protokolliere(tx, { schauId: e.schauId!, tabelle: "meldung", datensatzId: r.meldungId, aktion: "Status: bestaetigt", alt: { status: "offen" }, neu: { status: "bestaetigt" }, grund: "Import", akteur });
      }
    }
    // Von Hand gewählte Zuordnungen lernen – beim nächsten Import stehen sie schon da.
    const gewaehlt = p.rassen.filter((r) => r.quelle === "gewaehlt" && r.farbenschlagId != null);
    if (gewaehlt.length) {
      const namen = await tx
        .select({ id: farbenschlag.id, rasse: rasse.name, farbenschlag: farbenschlag.name })
        .from(farbenschlag)
        .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
        .where(inArray(farbenschlag.id, gewaehlt.map((r) => r.farbenschlagId!)));
      const [o] = await tx.select({ z: organisation.importZuordnungen }).from(organisation).where(eq(organisation.id, organisationId)).for("update");
      const neu = { ...(o?.z ?? {}) };
      for (const r of gewaehlt) {
        const n = namen.find((x) => x.id === r.farbenschlagId);
        if (n) neu[r.schluessel] = { rasse: n.rasse, farbenschlag: n.farbenschlag };
      }
      await tx.update(organisation).set({ importZuordnungen: neu }).where(eq(organisation.id, organisationId));
    }
    const schauId = e.art === "meldungen" ? e.schauId! : null;
    const [lauf] = await tx
      .insert(importlauf)
      .values({ organisationId, schauId, art: e.art, dateiname: e.dateiname.slice(0, 200), ausstellerIds, meldungIds, anzahlTiere, erstelltVon: akteur.benutzer.id })
      .returning({ id: importlauf.id });
    const ergebnis = { aussteller: ausstellerIds.length, meldungen: meldungIds.length, tiere: anzahlTiere, ausgelassen: p.zeilen.length - gut.size };
    await protokolliere(tx, { schauId, tabelle: "importlauf", datensatzId: lauf!.id, aktion: "Import", neu: { datei: e.dateiname, ...ergebnis, meldungIds, ausstellerIds }, akteur });
    return { id: lauf!.id, ...ergebnis };
  });
}

/**
 * Nimmt einen Importlauf zurück: seine Meldungen und die Aussteller, die er neu angelegt hat. Nur in den Phasen bis
 * „Katalog & Halle“ und solange niemand die Meldungen danach bearbeitet hat und nichts daran hängt (Zahlung,
 * Katalognummer, Bewertung, Stiftung, Spende, Abrechnung, SEPA-Datei) – sonst bleibt alles stehen, mit Begründung.
 * Ein Aussteller bleibt, wenn er danach bearbeitet wurde oder anderswo gebraucht wird.
 */
export async function importZuruecknehmen(tx: Tx, organisationId: number, id: number, akteur: Benutzer) {
  const [lauf] = await tx.select().from(importlauf).where(and(eq(importlauf.id, id), eq(importlauf.organisationId, organisationId))).for("update");
  if (!lauf) throw fehler("NOT_FOUND", "Importlauf nicht gefunden.");
  if (lauf.zurueckgenommenAm) throw fehler("BAD_REQUEST", "Der Import ist schon zurückgenommen.");
  // „Später“ heißt: im Protokoll nach dem Eintrag „Import“ dieses Laufs (die laufende Nummer, nicht die Uhrzeit –
  // alles, was der Import selbst geschrieben hat, steht davor).
  const [importEintrag] = await tx
    .select({ id: aenderung.id })
    .from(aenderung)
    .where(and(eq(aenderung.tabelle, "importlauf"), eq(aenderung.datensatzId, lauf.id), eq(aenderung.aktion, "Import")))
    .orderBy(aenderung.id)
    .limit(1);
  const spaeter = (tabelle: string, ids: number[]) =>
    ids.length ? tx.select({ id: aenderung.datensatzId }).from(aenderung).where(and(eq(aenderung.tabelle, tabelle), inArray(aenderung.datensatzId, ids), gt(aenderung.id, importEintrag?.id ?? 0))) : Promise.resolve([]);
  // Die Meldungen sperren: Ein gleichzeitiger Statuswechsel wartet und wird danach nicht still mitgelöscht.
  const meldungen = lauf.meldungIds.length && lauf.schauId != null ? await tx.select({ id: meldung.id, ausstellerId: meldung.ausstellerId }).from(meldung).where(and(inArray(meldung.id, lauf.meldungIds), eq(meldung.schauId, lauf.schauId))).for("update") : [];
  if (meldungen.length) {
    const sid = lauf.schauId!;
    const [sch] = await tx.select({ phase: schau.phase }).from(schau).where(eq(schau.id, sid));
    if (!IMPORT_PHASEN.includes(sch!.phase)) throw fehler("BAD_REQUEST", `In der Phase „${PHASEN_LABEL[sch!.phase]}“ lässt sich ein Import nicht mehr zurücknehmen. Einzelne Meldungen bitte von Hand stornieren.`);
    const mIds = meldungen.map((m) => m.id);
    const aIds = meldungen.map((m) => m.ausstellerId);
    await sperreKasse(tx, sid);
    const eintraege = await tx.select({ id: katalogeintrag.id, nr: katalogeintrag.katalogNr, meldungId: katalogeintrag.meldungId }).from(katalogeintrag).where(inArray(katalogeintrag.meldungId, mIds));
    const [z] = await tx.select({ id: zahlung.id }).from(zahlung).where(inArray(zahlung.meldungId, mIds)).limit(1);
    const [st] = await tx.select({ id: stiftung.id }).from(stiftung).where(inArray(stiftung.meldungId, mIds)).limit(1);
    const [sp] = await tx.select({ id: spende.id }).from(spende).where(inArray(spende.meldungId, mIds)).limit(1);
    const [ab] = await tx.select({ id: auszahlung.id }).from(auszahlung).where(and(eq(auszahlung.schauId, sid), inArray(auszahlung.ausstellerId, aIds))).limit(1);
    const sepa = (await offenerLauf(tx, sid))?.posten.some((x) => aIds.includes(x.ausstellerId));
    // Bearbeitet: die Meldung selbst oder eines ihrer Tiere (Ringnummer, Käfig je Tier usw. stehen am Tier im Protokoll).
    const bearbeitet = [...(await spaeter("meldung", mIds)), ...(await spaeter("katalogeintrag", eintraege.map((x) => x.id))).map((x) => ({ id: eintraege.find((e) => e.id === x.id)?.meldungId ?? null }))];
    const gruende = [
      bearbeitet.length ? `${new Set(bearbeitet.map((x) => x.id)).size} Meldungen nach dem Import bearbeitet` : "",
      z ? "Zahlungen gebucht" : "",
      eintraege.some((x) => x.nr != null) ? "Katalognummern vergeben" : "",
      st ? "Ehrenpreise gestiftet" : "",
      sp ? "Spenden erfasst" : "",
      ab ? "Aussteller abgerechnet" : "",
      sepa ? "Aussteller in der offenen SEPA-Datei" : "",
      ...(await bindungen(tx, eintraege.map((x) => x.id), { loeschen: true, statuswechsel: true })),
    ].filter(Boolean);
    if (gruende.length) throw fehler("BAD_REQUEST", `Der Import lässt sich nicht mehr zurücknehmen: ${gruende.join("; ")}. Einzelne Meldungen bitte von Hand stornieren.`);
    // Je Meldung ein Eintrag im Protokoll – eine spätere Reklamation sieht so, wo die Meldung geblieben ist.
    for (const m of meldungen) {
      await protokolliere(tx, { schauId: sid, tabelle: "meldung", datensatzId: m.id, aktion: "Import zurückgenommen", alt: { ausstellerId: m.ausstellerId, tiere: eintraege.filter((x) => x.meldungId === m.id).length }, grund: `Importlauf ${lauf.id}`, akteur });
    }
    await tx.delete(meldung).where(inArray(meldung.id, mIds));
  }
  // Neu angelegte Aussteller nur, wenn sie danach niemand bearbeitet hat und nichts mehr auf sie verweist.
  const bearbeitet = new Set((await spaeter("aussteller", lauf.ausstellerIds)).map((x) => x.id));
  const entfernt: number[] = [];
  for (const aid of lauf.ausstellerIds) {
    if (bearbeitet.has(aid)) continue;
    const [andere] = await tx.select({ id: meldung.id }).from(meldung).where(eq(meldung.ausstellerId, aid)).limit(1);
    const [quittung] = await tx.select({ id: auszahlung.id }).from(auszahlung).where(eq(auszahlung.ausstellerId, aid)).limit(1);
    const [alsSpender] = await tx.select({ id: spender.id }).from(spender).where(eq(spender.ausstellerId, aid)).limit(1);
    const [post] = await tx.select({ id: postausgang.id }).from(postausgang).where(eq(postausgang.ausstellerId, aid)).limit(1);
    if (andere || quittung || alsSpender || post) continue;
    const weg = await tx.delete(aussteller).where(and(eq(aussteller.id, aid), eq(aussteller.organisationId, organisationId))).returning({ id: aussteller.id });
    entfernt.push(...weg.map((x) => x.id));
  }
  await tx.update(importlauf).set({ zurueckgenommenAm: new Date(), zurueckgenommenVon: akteur.benutzer.id }).where(eq(importlauf.id, lauf.id));
  const ergebnis = { meldungen: meldungen.length, aussteller: entfernt.length };
  await protokolliere(tx, { schauId: lauf.schauId, tabelle: "importlauf", datensatzId: lauf.id, aktion: "Import zurückgenommen", alt: { ...ergebnis, meldungIds: meldungen.map((m) => m.id), ausstellerIds: entfernt }, akteur });
  return ergebnis;
}

/** Letzte Importläufe des Vereins (für die Liste im Assistenten). */
export async function importLaeufe(q: Lesen, organisationId: number) {
  return q
    .select({ id: importlauf.id, art: importlauf.art, schauId: importlauf.schauId, schau: schau.name, dateiname: importlauf.dateiname, anzahlAussteller: sql<number>`jsonb_array_length(${importlauf.ausstellerIds})`, anzahlMeldungen: sql<number>`jsonb_array_length(${importlauf.meldungIds})`, anzahlTiere: importlauf.anzahlTiere, createdAt: importlauf.createdAt, zurueckgenommenAm: importlauf.zurueckgenommenAm })
    .from(importlauf)
    .leftJoin(schau, eq(schau.id, importlauf.schauId))
    .where(eq(importlauf.organisationId, organisationId))
    .orderBy(desc(importlauf.id))
    .limit(50);
}
