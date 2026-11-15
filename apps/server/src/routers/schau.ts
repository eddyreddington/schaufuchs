import { type Aufsteller, GEBUEHR_ARTEN, KONTINGENT_BASEN, PREIS_ZIELGRUPPEN, normalisiereIban, PHASEN, PHASEN_LABEL, PREIS_QUELLEN, pruefeBic, pruefeIban, RUNDUNGEN, STANDARD_NOTENSKALA, KAEFIG_TYPEN, UNTERSUCHUNG_ARTEN, halleOhneFestenPlan, fehlendeVereinsangaben, SORTIER_KRITERIEN, istStandardSortierung, sortierungNormal } from "@schau/domain";
import { and, asc, count, desc, eq, inArray, isNull, ne, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { aussteller, auszahlung, bewertung, bild, gebuehr, katalogBeitrag, katalogeintrag, katalogGestaltung, meldung, postausgang, preisart, preisrichter, preisvergabe, schau, sitzung, stammdatenVersion, verkauf, zahlung } from "../db/schema";
import { ladeEintraege } from "../services/eintraege";
import { offeneStornoZahlungen, offeneUeberweisungsverkaeufe, offenerLauf, pruefeNichtAbgeschlossen, sperreKasse } from "../services/kasse";
import { ladeKassenbuch } from "../services/kassenbuch";
import { mailStatus, naechsterVersuch, sendeMail, versende } from "../services/post";
import { protokolliere } from "../services/protokoll";
import { kennzeichneAlsTestschau, sperreTestschauExklusiv, testschauVorschau } from "../services/testschau";
import { fuellen, mitDemoSperre, zuruecksetzen, type Einspieler } from "../testschau";
import { pruefeProtokoll, sucheProtokoll } from "../services/protokoll-suche";
import { checkliste } from "../services/pruefung";
import { ladeVereinsangaben } from "../services/datenschutz";
import { heuteDe } from "../services/tiergesundheit";
import { pruefeVersion, versionSichtbar } from "./stammdaten";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId, kalenderdatum } from "../trpc";
import type { Veterinaeramt } from "@schau/domain";
import veterinaeraemter from "../daten/veterinaeraemter.json";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const datum = kalenderdatum().nullable();

const schauFelder = z.object({
  name: z.string().max(200).min(3),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  veranstalter: z.string().max(500),
  ort: z.string().max(500),
  meldeschluss: datum,
  einlieferung: z.string().max(500),
  bewertungAm: datum,
  oeffnungszeiten: z.string().max(500),
  aussetzen: z.string().max(500),
  reklamationsfrist: datum,
  kapazitaet: z.number().int().positive().max(100_000).nullable(),
  stammdatenVersionId: dbId.nullable(),
  provisionBp: z.number().int().min(0).max(5000),
  katalogStart: z.number().int().min(1).max(1_000_000),
  jugendSeparat: z.boolean(),
  staemmeVorn: z.boolean(),
  /** Reihenfolge der Käfigblöcke für die Katalognummern (jede Größe höchstens einmal); null = nach Sparten. */
  kaefigFolge: z
    .array(z.enum(KAEFIG_TYPEN))
    .max(KAEFIG_TYPEN.length)
    .refine((f) => new Set(f).size === f.length, "Jede Käfiggröße nur einmal.")
    .nullable()
    .default(null),
  kontingentJe: z.enum(KONTINGENT_BASEN),
  /** Meldegeld bei der Einlieferung statt vorab per Überweisung (Texte für Aussteller). */
  zahlungBeiEinlieferung: z.boolean().default(false),
  bestimmungen: z.string().max(20_000),
  bankverbindung: z.string().max(500),
  kontaktEmail: z.string().max(500),
  // Veterinäramt: Registrierung der Veranstaltung, Anzeige 4 Wochen vorher, Auflagen.
  vetRegistriernummer: z.string().trim().max(100).default(""),
  vetAmt: z.string().trim().max(500).default(""),
  vetAnzeigeAm: datum.default(null),
  vetAktenzeichen: z.string().trim().max(200).default(""),
  wassergefluegelUntersuchung: z.boolean().default(false),
  // Tiergesundheit (§ 7 GeflPestSchV, Merkblatt des Veterinäramts). Fehlt eine Angabe (ältere Oberfläche), bleibt der Stand.
  untersuchung: z.enum(UNTERSUCHUNG_ARTEN).nullable().optional(),
  untersuchungTage: z.number().int().min(1).max(30).optional(),
  einlassUntersuchungAm: datum.optional(),
  einlassTierarzt: z.string().trim().max(200).optional(),
  ndTageMin: z.number().int().min(0).max(730).nullable().optional(),
  ndTageMax: z.number().int().min(0).max(730).nullable().optional(),
  pmvTageMin: z.number().int().min(0).max(730).nullable().optional(),
  pmvTageMax: z.number().int().min(0).max(730).nullable().optional(),
  auslandZugelassen: z.boolean().optional(),
  prHoechstzahl: z.number().int().min(1).max(1000).optional(),
  obmannHoechstzahl: z.number().int().min(1).max(1000).optional(),
  erklaerungen: z.string().max(5_000).default(""),
  vereinKontoinhaber: z.string().max(500).trim(),
  vereinIban: z
    .string()
    .transform(normalisiereIban)
    .superRefine((v, c) => {
      const f = v ? pruefeIban(v) : null;
      if (f) c.addIssue({ code: "custom", message: `Vereinskonto: ${f}` });
    }),
  vereinBic: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .superRefine((v, c) => {
      const f = v ? pruefeBic(v) : null;
      if (f) c.addIssue({ code: "custom", message: f });
    }),
});

const preisartEingabe = z.object({
  id: dbId.optional(),
  schauId: dbId,
  kuerzel: z.string().min(1).max(10),
  name: z.string().max(200).min(2),
  betragCent: z.number().int().min(0).max(10_000_000),
  sachpreis: z.string().max(500),
  quelle: z.enum(PREIS_QUELLEN),
  schluesselProTiere: z.number().int().positive().max(100_000).nullable(),
  anzahlProSchluessel: z.number().int().min(0).max(1000),
  anzahlProPreisrichter: z.number().int().min(0).max(1000),
  mindestpunkte: z.number().int().min(0).max(100).nullable(),
  rundung: z.enum(RUNDUNGEN),
  folge: z.number().int().min(-100_000).max(100_000),
  zielgruppe: z.enum(PREIS_ZIELGRUPPEN).default("alle"),
  sparte: z.string().trim().max(100).default(""),
});

/**
 * Felder einer Preisart, die vergebene Preise betreffen – nach der ersten Vergabe fest. Kontingent und Rundung bleiben
 * änderbar (der Betrag steht je Vergabe fest; ein überzogenes Kontingent meldet die Prüfliste), Mindestpunkte nur so,
 * dass alle schon vergebenen Preise sie erfüllen.
 */
const PREISART_GEBUNDEN = ["betragCent", "quelle"] as const;

/** Vor Änderungen am Meldegeld: nach der ersten Auszahlung und bei offener SEPA-Datei gesperrt (Salden lägen sonst schief). */
async function pruefeGebuehrenAenderbar(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], schauId: number) {
  const [a] = await tx.select({ nr: auszahlung.quittungNr }).from(auszahlung).where(and(eq(auszahlung.schauId, schauId), isNull(auszahlung.storniertAm))).limit(1);
  if (a) throw fehler("BAD_REQUEST", `Es gibt schon Auszahlungen (Quittung ${a.nr}) – Gebühren und Preise lassen sich nicht mehr ändern.`);
  if (await offenerLauf(tx, schauId)) throw fehler("BAD_REQUEST", "Es gibt eine offene SEPA-Datei – erst buchen oder verwerfen.");
}

/** Was einem Abschluss der Schau noch entgegensteht (leer: abschließbar). */
async function abschlussHindernisse(schauId: number): Promise<string[]> {
  const { abrechnungListe } = await import("./kasse");
  const [zeilen, tage, lauf, stornos, ueberweisungen] = await Promise.all([
    abrechnungListe(schauId),
    ladeKassenbuch(schauId),
    offenerLauf(db, schauId),
    offeneStornoZahlungen(db, schauId),
    offeneUeberweisungsverkaeufe(db, schauId),
  ]);
  const offen = zeilen.filter((z) => z.nochOffenCent !== 0);
  return [
    offen.length ? `${offen.length} Aussteller nicht vollständig abgerechnet` : "",
    // Geld einer stornierten oder abgelehnten Meldung: erstatten oder als Verfall buchen – sonst fiele es aus jeder Abrechnung.
    stornos.length ? `${stornos.length} stornierte oder abgelehnte Meldung(en) mit Zahlungseingang (${stornos.map((x) => x.name).join(", ")}) – erstatten oder Verfall buchen` : "",
    ueberweisungen.length ? `${ueberweisungen.length} Verkauf/Verkäufe per Überweisung ohne Zahlungseingang (Beleg ${ueberweisungen.map((v) => v.belegNr).join(", ")})` : "",
    lauf ? "SEPA-Datei noch offen (buchen oder verwerfen)" : "",
    ...tage.filter((t) => (t.bewegungen.length && !t.abschluss) || t.nachtragOffen).map((t) => `Kassentag ${t.datum.split("-").reverse().join(".")} ${t.abschluss ? "mit offenem Nachtrag" : "ohne Tagesabschluss"}`),
  ].filter(Boolean);
}

/**
 * Demodaten in eine Testschau einspielen (src/testschau.ts, über die normalen Programmwege mit Protokoll unter dem
 * Namen des Administrators mit Zusatz „(Testdaten)“). `neu`: vorher alles Bisherige der Testschau entfernen.
 */
async function demodatenEinspielen(wer: Einspieler, schauId: number, neu: boolean): Promise<{ ok: true; meldungen: number; tiere: number; faelle: string[] } | { ok: false; fehler: string }> {
  try {
    // Ein Lauf zur Zeit (Datenbank-Sitzungssperre, gilt auch für das Skript und weitere Prozesse).
    return await mitDemoSperre(async () => {
      const [s] = await db.select({ slug: schau.slug, test: schau.test }).from(schau).where(eq(schau.id, schauId));
      if (!s?.test) return { ok: false as const, fehler: "Demodaten gibt es nur in einer Testschau." };
      if (neu) await zuruecksetzen(s.slug, { leise: true });
      const r = await fuellen(s.slug, undefined, { wer, leise: true });
      return { ok: true as const, ...r };
    });
  } catch (e) {
    return { ok: false, fehler: `Demodaten nicht vollständig eingespielt: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const schauRouter = router({
  /**
   * Verzeichnis der zuständigen Veterinärämter (öffentliche Behördenangaben mit Quelle, siehe daten/veterinaeraemter.json)
   * für die Vorschläge im Feld „Zuständiges Veterinäramt“. Ändert sich nur mit einer neuen Version des Programms.
   */
  veterinaeraemter: benutzerProcedure.query(() => ({
    stand: veterinaeraemter.stand,
    eintraege: veterinaeraemter.eintraege as Veterinaeramt[],
  })),

  liste: benutzerProcedure.query(({ ctx }) =>
    db
      .select({
        id: schau.id,
        name: schau.name,
        ort: schau.ort,
        phase: schau.phase,
        meldeschluss: schau.meldeschluss,
        bewertungAm: schau.bewertungAm,
        slug: schau.slug,
        test: schau.test,
      })
      .from(schau)
      .where(eq(schau.organisationId, ctx.benutzer.organisationId))
      .orderBy(desc(schau.createdAt)),
  ),

  get: benutzerProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    const [gebuehren, preisarten] = await Promise.all([
      db.select().from(gebuehr).where(eq(gebuehr.schauId, s.id)),
      db.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge), asc(preisart.id)),
    ]);
    return { ...s, notenskala: s.notenskala ?? STANDARD_NOTENSKALA, gebuehren, preisarten };
  }),

  /**
   * Neue Schau anlegen – leer mit Startwerten oder aus einer früheren Schau des Vereins als Vorlage. Mit Vorlage kommt alles
   * mit außer Meldungen und Geld: Einstellungen (ohne Termine und Bearbeitungsstand), Gebühren, Preisarten, Preisrichter
   * (ohne PIN), Katalog-Gestaltung, Beiträge, Bilder, Käfigregeln, Käfigmaße und Halle. Nicht übernommen: Meldungen, Tiere,
   * Stiftungen, Kasse, Belege, Auszahlungen, Gesundheitsjournal und die Preisrichter-Einteilung nach Katalognummern.
   */
  anlegen: adminProcedure
    .input(
      z.object({
        name: z.string().max(200).min(3),
        ort: z.string().max(500),
        vorlageId: dbId.optional(),
        /** Testschau: eigene Aussteller, nie in echten Schauen. */
        test: z.boolean().default(false),
        /** Testschau gleich mit Demodaten füllen (src/testschau.ts) – die Oberfläche tut das immer. */
        demodaten: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vorlage = input.vorlageId ? await ladeSchau(ctx.benutzer.organisationId, input.vorlageId) : null;
      // Eine Testschau bringt erfundene Preisrichter, Grußworte und Angaben mit – nur Vorlage für eine weitere Testschau.
      if (vorlage?.test && !input.test) throw fehler("BAD_REQUEST", "Eine Testschau taugt nur als Vorlage für eine weitere Testschau.");
      let slug = slugify(input.name) || "schau";
      const [vorhanden] = await db.select({ id: schau.id }).from(schau).where(eq(schau.slug, slug));
      if (vorhanden) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const [version] = await db.select().from(stammdatenVersion).where(versionSichtbar(ctx.benutzer.organisationId)).orderBy(desc(stammdatenVersion.jahr), desc(stammdatenVersion.id)).limit(1);
      // Die Käfige gehören dem Verein, die Halle ist meist dieselbe: beides aus der letzten Schau übernehmen.
      const [letzte] = await db.select({ kaefigMasse: schau.kaefigMasse, aufsteller: schau.aufsteller, halle: schau.halle }).from(schau).where(eq(schau.organisationId, ctx.benutzer.organisationId)).orderBy(desc(schau.id)).limit(1);
      if (input.demodaten && !input.test) throw fehler("BAD_REQUEST", "Demodaten gibt es nur für eine Testschau.");
      const angelegt = await db.transaction(async (tx) => {
        // Aus der Vorlage: Einstellungen ohne Termine, Phase, Festschreiben, Freigabe und Abschluss.
        const ausVorlage = vorlage
          ? {
              veranstalter: vorlage.veranstalter,
              einlieferung: vorlage.einlieferung,
              oeffnungszeiten: vorlage.oeffnungszeiten,
              aussetzen: vorlage.aussetzen,
              kapazitaet: vorlage.kapazitaet,
              provisionBp: vorlage.provisionBp,
              katalogStart: vorlage.katalogStart,
              jugendSeparat: vorlage.jugendSeparat,
              staemmeVorn: vorlage.staemmeVorn,
              kontingentJe: vorlage.kontingentJe,
              bestimmungen: vorlage.bestimmungen,
              bankverbindung: vorlage.bankverbindung,
              zahlungBeiEinlieferung: vorlage.zahlungBeiEinlieferung,
              vereinKontoinhaber: vorlage.vereinKontoinhaber,
              vereinIban: vorlage.vereinIban,
              vereinBic: vorlage.vereinBic,
              kontaktEmail: vorlage.kontaktEmail,
              vetRegistriernummer: vorlage.vetRegistriernummer,
              vetAmt: vorlage.vetAmt,
              wassergefluegelUntersuchung: vorlage.wassergefluegelUntersuchung,
              untersuchung: vorlage.untersuchung,
              untersuchungTage: vorlage.untersuchungTage,
              ndTageMin: vorlage.ndTageMin,
              ndTageMax: vorlage.ndTageMax,
              pmvTageMin: vorlage.pmvTageMin,
              pmvTageMax: vorlage.pmvTageMax,
              auslandZugelassen: vorlage.auslandZugelassen,
              prHoechstzahl: vorlage.prHoechstzahl,
              obmannHoechstzahl: vorlage.obmannHoechstzahl,
              erklaerungen: vorlage.erklaerungen,
              notenskala: vorlage.notenskala,
              kaefigRegeln: vorlage.kaefigRegeln,
              kaefigFolge: vorlage.kaefigFolge,
              katalogSortierung: vorlage.katalogSortierung,
              kaefigMasse: vorlage.kaefigMasse,
              aufsteller: vorlage.aufsteller,
              // Ohne verschobene Grundplatten und entfernte leere Plätze: die gehören zum festen Plan dieser Schau.
              halle: vorlage.halle ? halleOhneFestenPlan(vorlage.halle) : null,
            }
          : { kaefigMasse: letzte?.kaefigMasse ?? {}, aufsteller: ohneSockelbild(letzte?.aufsteller ?? null), halle: letzte?.halle ? halleOhneFestenPlan(letzte.halle) : null };
        const [s] = await tx
          .insert(schau)
          .values({
            organisationId: ctx.benutzer.organisationId,
            name: input.name,
            ort: input.ort,
            slug,
            stammdatenVersionId: version?.id ?? null,
            ...ausVorlage,
            test: input.test,
          })
          .returning();
        if (vorlage) {
          const neueBildId = await kopiereAusVorlage(tx, vorlage.id, s!.id);
          // Das Sockelbild ist mitkopiert: auf die Kopie zeigen.
          const alt = vorlage.aufsteller?.verkleidung?.bildId;
          if (alt != null) {
            const neu = neueBildId.get(alt) ?? null;
            await tx.update(schau).set({ aufsteller: { ...vorlage.aufsteller!, verkleidung: { ...vorlage.aufsteller!.verkleidung!, bildId: neu } } }).where(eq(schau.id, s!.id));
          }
          // Testschau aus einer echten Vorlage: keine echten Preisrichter (Name, Kontakt) in Übungsdaten – die
          // Demodaten bringen erfundene mit.
          if (input.test && !vorlage.test) await tx.delete(preisrichter).where(eq(preisrichter.schauId, s!.id));
          await protokolliere(tx, { schauId: s!.id, tabelle: "schau", datensatzId: s!.id, aktion: "angelegt", neu: { ...input, vorlage: vorlage.name }, akteur: ctx });
          return { id: s!.id };
        }
        // Startwerte, wie sie auf vielen Meldebögen stehen – werden in den Einstellungen angepasst.
        await tx.insert(gebuehr).values([
          { schauId: s!.id, art: "einzeltier", jugend: false, betragCent: 0 },
          { schauId: s!.id, art: "einzeltier", jugend: true, betragCent: 0 },
          { schauId: s!.id, art: "stamm", jugend: false, betragCent: 0 },
          { schauId: s!.id, art: "katalog", jugend: false, betragCent: 0, befreitPreisrichter: true },
          { schauId: s!.id, art: "kostenanteil", jugend: false, betragCent: 0 },
        ]);
        await tx.insert(preisart).values([
          { schauId: s!.id, kuerzel: "E", name: "Ehrenpreis", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, folge: 1 },
          { schauId: s!.id, kuerzel: "Z", name: "Zuschlagspreis", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 2, folge: 2 },
        ]);
        await protokolliere(tx, { schauId: s!.id, tabelle: "schau", datensatzId: s!.id, aktion: "angelegt", neu: input, akteur: ctx });
        return { id: s!.id };
      });
      if (!input.demodaten) return { ...angelegt, demodaten: null };
      // Erst nach dem Anlegen (eigene Programmwege mit Protokoll); scheitert es, steht die Schau trotzdem.
      return { ...angelegt, demodaten: await demodatenEinspielen(ctx.benutzer, angelegt.id, false) };
    }),

  /**
   * Testschau: Demodaten neu einspielen – Meldungen, Test-Aussteller, Geld, Katalog und Bewertungen weg, frische
   * Demodaten bis zur Einlieferung. Einstellungen, Gebühren, Preisarten, Halle und Käfigmaße bleiben.
   */
  demodatenNeu: adminProcedure.input(z.object({ id: dbId, name: z.string().max(200) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (!s.test) throw fehler("BAD_REQUEST", "Demodaten gibt es nur in einer Testschau.");
    if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
    const r = await demodatenEinspielen(ctx.benutzer, s.id, true);
    if (!r.ok) throw fehler("BAD_REQUEST", r.fehler);
    return r;
  }),

  /**
   * Löscht eine leere Schau (z. B. zum Ausprobieren angelegt): nur in der Vorbereitung, ohne Meldungen, Geld, Belege oder
   * Stiftungen, mit eingetipptem Namen und Grund. Eine Testschau dagegen in jeder Phase mit allem, was dazugehört –
   * auch ihren Test-Ausstellern (Kaskade über `aussteller.testSchauId`); echte Aussteller hat sie nicht. Protokoll und Kassendaten sind sonst gegen Löschen geschützt – der
   * Schalter gilt nur in dieser Transaktion, jede gelöschte Protokollzeile wird vermerkt (Kettenprüfung bleibt gültig),
   * und das Vereinsprotokoll hält das Löschen fest.
   */
  loeschen: adminProcedure
    .input(z.object({ id: dbId, name: z.string().max(200), grund: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
      if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
      if (input.grund.length < 3) throw fehler("BAD_REQUEST", "Bitte einen Grund für das Löschen angeben.");
      await db.transaction(async (tx) => {
        // Testschau: erst laufende Meldungen abwarten (gleiche Reihenfolge wie dort: Testschau-Sperre, dann Kasse).
        if (s.test) await sperreTestschauExklusiv(tx, s.id);
        await sperreKasse(tx, s.id);
        const [aktuell] = await tx.select().from(schau).where(eq(schau.id, s.id)).for("update");
        if (!aktuell) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
        if (!aktuell.test && aktuell.phase !== "vorbereitung") throw fehler("BAD_REQUEST", "Löschen geht nur, solange die Schau in der Vorbereitung steht.");
        const zahl = async (sqlText: ReturnType<typeof sql>) => Number(((await tx.execute(sqlText)) as unknown as { n: number }[])[0]?.n ?? 0);
        const hindernisse = [
          [await zahl(sql`select count(*)::int as n from meldung where schau_id = ${s.id}`), "Meldung(en)"],
          [await zahl(sql`select count(*)::int as n from stiftung where schau_id = ${s.id}`), "Stiftung(en)"],
          [await zahl(sql`select count(*)::int as n from kassenbewegung where schau_id = ${s.id}`), "Kassenbuchung(en)"],
          [await zahl(sql`select count(*)::int as n from kassenabschluss where schau_id = ${s.id}`), "Tagesabschlüsse"],
          [await zahl(sql`select count(*)::int as n from auszahlung where schau_id = ${s.id}`), "Auszahlung(en)"],
          [await zahl(sql`select count(*)::int as n from beleg where schau_id = ${s.id}`), "Beleg(e)"],
          // Das Gesundheitsjournal ist aufbewahrungspflichtig (auch Beobachtungen ohne Tier).
          [await zahl(sql`select count(*)::int as n from gesundheit where schau_id = ${s.id}`), "Eintrag/Einträge im Gesundheitsjournal"],
        ].filter(([n]) => (n as number) > 0);
        if (hindernisse.length && !aktuell.test) {
          throw fehler("BAD_REQUEST", `Die Schau hat schon ${hindernisse.map(([n, was]) => `${n} ${was}`).join(", ")} und lässt sich nicht löschen.`);
        }
        await tx.execute(sql`set local schau.loeschen = 'ja'`);
        // Verkäufe hängen mit RESTRICT an den Tieren – vor der Schau löschen (nur bei Testschauen vorhanden).
        // Noch wartende Mails an die Test-Aussteller dieser Schau gehen nicht mehr hinaus.
        if (aktuell.test) await tx.delete(postausgang).where(and(eq(postausgang.status, "wartet"), inArray(postausgang.ausstellerId, tx.select({ id: aussteller.id }).from(aussteller).where(eq(aussteller.testSchauId, s.id)))));
        if (aktuell.test) await tx.delete(verkauf).where(inArray(verkauf.katalogeintragId, tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, s.id))));
        await tx.delete(schau).where(eq(schau.id, s.id));
        await protokolliere(tx, {
          schauId: null,
          tabelle: "schau",
          datensatzId: s.id,
          aktion: "Schau gelöscht",
          alt: { id: s.id, name: s.name, slug: s.slug, ort: s.ort, ...(aktuell.test ? { test: true, inhalt: hindernisse.map(([n, was]) => `${n} ${was}`).join(", ") } : {}) },
          grund: input.grund,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Eine bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen): ihre Aussteller
   * werden Test-Aussteller und verschwinden aus Verwaltung und echten Schauen. Endgültig, mit eingetipptem Namen.
   */
  alsTestschau: adminProcedure.input(z.object({ id: dbId, name: z.string().max(200), anzahl: z.number().int().min(0).optional(), /** Echte Aussteller auf Test-Kopien umhängen (bestätigt). */ kopien: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
    return db.transaction((tx) => kennzeichneAlsTestschau(tx, ctx.benutzer.organisationId, s.id, ctx, { anzahl: input.anzahl, kopien: input.kopien }));
  }),

  /** Vor dem Kennzeichnen: wer würde Test-Aussteller, wer ist echt (und verhindert es)? */
  testschauVorschau: adminProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    return testschauVorschau(db, s.id);
  }),

  aktualisieren: adminProcedure
    .input(z.object({ id: dbId, daten: schauFelder }))
    .mutation(async ({ ctx, input }) => {
      const alt = await ladeSchau(ctx.benutzer.organisationId, input.id);
      if (input.daten.slug !== alt.slug) {
        // Ab der Meldung stecken Links in versandten Mails („Meine Meldung“, Widerruf) und in den Tablets der Preisrichter.
        if (alt.phase !== "vorbereitung") throw fehler("BAD_REQUEST", "Die Kurzadresse lässt sich nur in der Vorbereitung ändern – danach würden versandte Links und angemeldete Tablets ungültig.");
        // Auch nach „Zurück zur Vorbereitung“: Gibt es schon Meldungen oder Tablet-PINs, hängen Links daran.
        const [[mel], [pin]] = await Promise.all([
          db.select({ n: count() }).from(meldung).where(eq(meldung.schauId, alt.id)),
          db.select({ n: count() }).from(preisrichter).where(and(eq(preisrichter.schauId, alt.id), sql`${preisrichter.pinHash} is not null`)),
        ]);
        if ((mel?.n ?? 0) > 0 || (pin?.n ?? 0) > 0)
          throw fehler("BAD_REQUEST", "Die Kurzadresse lässt sich nicht mehr ändern: Es gibt schon Meldungen oder Tablet-PINs, deren Links daran hängen.");
        const [x] = await db.select({ id: schau.id }).from(schau).where(eq(schau.slug, input.daten.slug));
        if (x) throw fehler("CONFLICT", "Diese Kurzadresse ist schon vergeben.");
      }
      // Am Bewertungstag hängen Jugendtarif und Speicherfristen – ein vertipptes Jahr fällt hier auf.
      if (input.daten.bewertungAm && input.daten.bewertungAm !== alt.bewertungAm) {
        const fruehestens = new Date(alt.createdAt.getTime() - 366 * 86_400_000).toISOString().slice(0, 10);
        const spaetestens = new Date(Date.now() + 3 * 366 * 86_400_000).toISOString().slice(0, 10);
        if (input.daten.bewertungAm < fruehestens || input.daten.bewertungAm > spaetestens) throw fehler("BAD_REQUEST", "Der Bewertungstag liegt mehr als ein Jahr vor dem Anlegen der Schau oder mehr als drei Jahre in der Zukunft – bitte das Jahr prüfen.");
      }
      if (alt.katalogGedruckt && input.daten.stammdatenVersionId !== alt.stammdatenVersionId) {
        throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Stammdaten lassen sich nicht mehr wechseln.");
      }
      // Gemeldete Tiere verweisen auf Rassen und Farbenschläge der bisherigen Version: ein Wechsel ließe sich nicht mehr
      // speichern und mischte die Katalogfolge. Fehlt etwas, das Verzeichnis lieber ergänzen.
      const versionWechsel = input.daten.stammdatenVersionId !== alt.stammdatenVersionId;
      // Der Provisionssatz steht auf Kaufbelegen und Quittungen – nach dem ersten Verkauf nicht mehr änderbar.
      if (input.daten.provisionBp !== alt.provisionBp) {
        const [v] = await db.select({ id: verkauf.id }).from(verkauf).innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId)).where(eq(katalogeintrag.schauId, alt.id)).limit(1);
        if (v) throw fehler("BAD_REQUEST", "Es gibt schon Verkäufe – der Provisionssatz lässt sich nicht mehr ändern.");
      }
      if (
        alt.katalogGedruckt &&
        (input.daten.jugendSeparat !== alt.jugendSeparat || input.daten.staemmeVorn !== alt.staemmeVorn || JSON.stringify(input.daten.kaefigFolge ?? null) !== JSON.stringify(alt.kaefigFolge ?? null))
      ) {
        throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Reihenfolge im Katalog lässt sich nicht mehr ändern.");
      }
      // Nur eigene oder bereitgestellte Versionen; eine schon gesetzte bleibt erlaubt.
      const versionId = input.daten.stammdatenVersionId;
      if (versionId != null && versionId !== alt.stammdatenVersionId) await pruefeVersion(ctx.benutzer.organisationId, versionId);
      await db.transaction(async (tx) => {
        if (versionWechsel) {
          // In derselben Transaktion mit gesperrter Schau prüfen: eine gleichzeitig gespeicherte Meldung wartet so.
          // Stornierte und abgelehnte Meldungen zählen nicht.
          await tx.select({ id: schau.id }).from(schau).where(eq(schau.id, input.id)).for("update");
          const [x] = await tx
            .select({ id: katalogeintrag.id })
            .from(katalogeintrag)
            .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
            .where(and(eq(katalogeintrag.schauId, alt.id), inArray(meldung.status, ["offen", "bestaetigt"]), sql`(${katalogeintrag.farbenschlagId} is not null or ${katalogeintrag.rasseId} is not null)`))
            .limit(1);
          if (x) throw fehler("BAD_REQUEST", "Es gibt schon gemeldete Tiere – das Verzeichnis lässt sich nicht mehr wechseln. Fehlende Rassen oder Farbenschläge bitte unter „Rassen und Farbenschläge“ → „Ergänzen“ nachtragen (bei einem für alle Vereine bereitgestellten Verzeichnis: eigenes Verzeichnis einspielen, bevor gemeldet wird).");
        }
        await tx.update(schau).set(input.daten).where(eq(schau.id, input.id));
        await protokolliere(tx, { schauId: input.id, tabelle: "schau", datensatzId: input.id, aktion: "geändert", alt, neu: input.daten, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Reihenfolge der Katalognummern (Kriterien in Rangfolge, ausgeschaltet, umgekehrt; siehe SORTIER_KRITERIEN). Gespeichert
   * wird die vollständige Liste, die Vorgabe als null. Die Nummern folgen erst beim nächsten Vergeben; nach dem
   * Festschreiben gesperrt wie Jugendblock und Stämme vorn.
   */
  katalogSortierungSetzen: adminProcedure
    .input(
      z.object({
        id: dbId,
        sortierung: z
          .array(z.object({ kriterium: z.enum(SORTIER_KRITERIEN), aus: z.boolean().optional(), umgekehrt: z.boolean().optional() }))
          .max(SORTIER_KRITERIEN.length)
          .refine((f) => new Set(f.map((x) => x.kriterium)).size === f.length, "Jedes Kriterium nur einmal.")
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.id));
      const neu = istStandardSortierung(input.sortierung) ? null : sortierungNormal(input.sortierung);
      return db.transaction(async (tx) => {
        // Gesperrt gelesen: ein gleichzeitiges Festschreiben der Nummern wartet bzw. wird hier gesehen.
        const [s] = await tx.select({ gedruckt: schau.katalogGedruckt, alt: schau.katalogSortierung }).from(schau).where(eq(schau.id, geladen.id)).for("update");
        if (s!.gedruckt) throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Reihenfolge im Katalog lässt sich nicht mehr ändern.");
        // jsonb ordnet die Schlüssel um: verglichen wird die normalisierte Liste.
        const alt = s!.alt ? sortierungNormal(s!.alt) : null;
        if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
        await tx.update(schau).set({ katalogSortierung: neu }).where(eq(schau.id, geladen.id));
        await protokolliere(tx, { schauId: geladen.id, tabelle: "schau", datensatzId: geladen.id, aktion: "Reihenfolge der Katalognummern", alt: { sortierung: alt }, neu: { sortierung: neu }, akteur: ctx });
        return { ok: true, geaendert: true };
      });
    }),

  /**
   * Phase wechseln. Zurück nur mit Grund. Abschließen nur, wenn alles abgerechnet ist, keine SEPA-Datei offen ist und
   * jeder Kassentag einen Tagesabschluss hat – sonst nur ausdrücklich („trotzdem“) mit Grund. Mit dem Abschluss beginnt
   * die Karenzzeit, nach der die Bereinigung IBAN, Geburtsdatum und PINs löscht.
   */
  /**
   * Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche, § 7 Abs. 5 GeflPestSchV): nur bis vor der Einlieferung.
   * Alle offenen und bestätigten Meldungen werden storniert (gedruckte Nummern bleiben reserviert), die Schau geht in
   * die Abrechnung – dort zeigt sie, wem Meldegeld zu erstatten ist; vorher lässt sie sich nicht abschließen. Die
   * Aussteller bekommen eine E-Mail. Alles im Protokoll.
   */
  absagen: adminProcedure.input(z.object({ id: dbId, grund: z.string().trim().min(3, "Bitte den Grund angeben.").max(500) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (s.abgesagtAm) throw fehler("BAD_REQUEST", "Die Schau ist schon abgesagt.");
    if (!["vorbereitung", "meldung", "katalog"].includes(s.phase))
      throw fehler("BAD_REQUEST", "Absagen geht nur bis vor der Einlieferung. Sind schon Tiere in der Halle, bitte mit dem Veterinäramt abstimmen und über die normale Abrechnung abschließen.");
    const betroffen = await db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const ms = await tx
        .select({ id: meldung.id, status: meldung.status, ausstellerId: meldung.ausstellerId })
        .from(meldung)
        .where(and(eq(meldung.schauId, s.id), inArray(meldung.status, ["offen", "bestaetigt"])));
      for (const x of ms) {
        await tx.update(meldung).set({ status: "storniert" }).where(eq(meldung.id, x.id));
        // Wie beim einzelnen Storno: vor dem Festschreiben verlieren die Tiere ihre Nummer, danach bleiben sie reserviert.
        if (!s.katalogGedruckt) await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "", status: "gemeldet" }).where(eq(katalogeintrag.meldungId, x.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "meldung", datensatzId: x.id, aktion: "Status", alt: x.status, neu: "storniert", grund: `Schau abgesagt: ${input.grund}`, akteur: ctx });
      }
      await tx.update(schau).set({ abgesagtAm: new Date(), absageGrund: input.grund, phase: "abrechnung" }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Schau abgesagt", alt: { phase: s.phase }, neu: { phase: "abrechnung", stornierteMeldungen: ms.length }, grund: input.grund, akteur: ctx });
      return ms;
    });
    // Nachricht an die Aussteller (nach dem Speichern; ein Mailfehler macht die Absage nicht rückgängig).
    const empfaenger = betroffen.length
      ? await db.select({ id: aussteller.id, email: aussteller.email, vorname: aussteller.vorname, nachname: aussteller.nachname }).from(aussteller).where(inArray(aussteller.id, [...new Set(betroffen.map((x) => x.ausstellerId))]))
      : [];
    for (const a of empfaenger.filter((x) => x.email)) {
      await sendeMail(
        s.organisationId,
        a.email,
        `Abgesagt: ${s.name}`,
        `Guten Tag ${`${a.vorname} ${a.nachname}`.trim()},\n\nleider müssen wir die Schau „${s.name}“ absagen.\nGrund: ${input.grund}\n\nIhre Meldung ist damit storniert. Bereits gezahltes Meldegeld erstatten wir; die Ausstellungsleitung meldet sich dazu.\n\nMit freundlichen Grüßen\n${s.veranstalter || s.name}`,
        a.id,
      );
    }
    return { ok: true, storniert: betroffen.length, benachrichtigt: empfaenger.filter((x) => x.email).length };
  }),

  phaseSetzen: adminProcedure
    .input(z.object({ id: dbId, phase: z.enum(PHASEN), grund: z.string().trim().max(500).default(""), trotzdem: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const alt = await ladeSchau(ctx.benutzer.organisationId, input.id);
      if (input.phase === alt.phase) return { ok: true };
      const zurueck = PHASEN.indexOf(input.phase) < PHASEN.indexOf(alt.phase);
      if (zurueck && input.grund.length < 3) throw fehler("BAD_REQUEST", `Zurück zur Phase „${PHASEN_LABEL[input.phase]}“ nur mit Grund.`);
      const ziel = PHASEN.indexOf(input.phase);
      const von = PHASEN.indexOf(alt.phase);
      // Meldephase: Ohne Gebühren und Meldeschluss stünden Meldungen über 0,00 € und ein Formular ohne Termine im Netz.
      // Gilt auch beim Überspringen (Vorbereitung direkt zum Katalog), sonst ließe sich die Prüfung umgehen.
      if (!zurueck && von < PHASEN.indexOf("meldung") && ziel >= PHASEN.indexOf("meldung") && input.phase !== "abgeschlossen" && !input.trotzdem) {
        const [g] = (await db.select({ n: count() }).from(gebuehr).where(and(eq(gebuehr.schauId, alt.id), sql`${gebuehr.betragCent} > 0`))) as [{ n: number }];
        // Das Meldeformular ist öffentlich: ohne Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) nicht online stellen.
        const verein = fehlendeVereinsangaben(await ladeVereinsangaben(alt.organisationId));
        const fehlt = [
          !g.n && "keine Gebühren (Einstellungen › Gebühren)",
          !alt.meldeschluss && "kein Meldeschluss (Einstellungen)",
          verein.length > 0 && `Impressum und Datenschutz unvollständig: ${verein.join(", ")} (Verein und Datenschutz)`,
        ].filter(Boolean);
        if (fehlt.length) throw fehler("PRECONDITION_FAILED", `Vor der Meldephase fehlt: ${fehlt.join(", ")}.`);
      }
      if (input.phase === "abgeschlossen") {
        // Eine offene SEPA-Datei hält IBANs fest, die nach dem Abschluss gelöscht würden: nie „trotzdem“.
        if (await offenerLauf(db, alt.id)) throw fehler("BAD_REQUEST", "Es gibt noch eine offene SEPA-Datei. Bitte erst buchen oder verwerfen, dann abschließen.");
      }
      // Nach vorn (außer Vorbereitung → Meldephase, dafür gilt die Prüfung oben): rote Punkte der Prüfliste, unbewertete
      // Tiere und die fehlende Freigabe vor „Schau & Verkauf“, beim Abschluss die offenen Kassenpunkte und die laufende
      // Reklamationsfrist halten den Wechsel auf – auch beim Überspringen; „trotzdem“ nur mit Grund (steht im Protokoll).
      if (!zurueck && (von >= PHASEN.indexOf("meldung") || ziel > PHASEN.indexOf("meldung"))) {
        // Eine abgesagte Schau braucht nur noch die Kasse (Erstattungen) – Prüfliste, Freigabe und Frist gelten dann nicht.
        const offen = !alt.abgesagtAm ? (await checkliste(alt.id)).filter((p) => p.art === "fehler" && p.bis && PHASEN.indexOf(p.bis) < ziel).map((p) => (p.zusatz ? `${p.text} (${p.zusatz})` : p.text)) : [];
        // Vor dem Meldeschluss nennt die Prüfliste Tiere ohne Katalognummer nicht – beim Überspringen der Katalogphase hier zählen.
        if (ziel > PHASEN.indexOf("katalog") && von < PHASEN.indexOf("katalog") && !alt.abgesagtAm) {
          const ohneNr = (await ladeEintraege(alt.id, { nurBestaetigt: true })).filter((e) => e.katalogNr == null).length;
          if (ohneNr) offen.push(`${ohneNr} Tiere ohne Katalognummer`);
        }
        if (ziel >= PHASEN.indexOf("schau") && !alt.abgesagtAm) {
          // Die Prüfliste nennt unbewertete Tiere nur in den Bewertungsphasen – beim Überspringen hier selbst zählen.
          const tiere = (await ladeEintraege(alt.id, { nurBestaetigt: true })).filter((e) => e.katalogNr != null && e.status !== "fehlt");
          const unbewertet = tiere.filter((e) => !e.bewertet).length;
          if (unbewertet && !["bewertung", "preise", "schau"].includes(alt.phase)) offen.push(`${unbewertet} Tiere sind noch nicht bewertet`);
          if (tiere.length && !alt.ergebnisseFreigegeben) offen.push("Ergebnisse sind noch nicht freigegeben (Preise › Freigabe)");
        }
        if (input.phase === "abgeschlossen") {
          if (alt.reklamationsfrist && heuteDe() <= alt.reklamationsfrist && !alt.abgesagtAm) offen.push(`Reklamationsfrist läuft noch bis ${alt.reklamationsfrist.split("-").reverse().join(".")}`);
          offen.push(...(await abschlussHindernisse(alt.id)));
        }
        if (offen.length && !(input.trotzdem && input.grund.length >= 3)) {
          throw fehler(
            "PRECONDITION_FAILED",
            input.phase === "abgeschlossen" ? `Noch nicht abschließbar: ${offen.join("; ")}.` : `Vor „${PHASEN_LABEL[input.phase]}“ ist noch offen: ${offen.join("; ")}.`,
          );
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .update(schau)
          .set({ phase: input.phase, abgeschlossenAm: input.phase === "abgeschlossen" ? new Date() : null })
          .where(eq(schau.id, input.id));
        // Mit dem Abschluss alle Preisrichter abmelden (keine Sitzungen, die wochenlang gelten). Vorher nicht: ein
        // Tablet mit noch nicht übertragenen Noten bekommt so beim Abgleich „Bewertung geschlossen“ und zeigt sie dem
        // Preisrichter zum Nachtragen durch die Ausstellungsleitung, statt sie still im Gerät zu behalten.
        const abgemeldet =
          input.phase !== "abgeschlossen"
            ? []
            : await tx
                .delete(sitzung)
                .where(inArray(sitzung.preisrichterId, tx.select({ id: preisrichter.id }).from(preisrichter).where(eq(preisrichter.schauId, input.id))))
                .returning({ id: sitzung.id });
        await protokolliere(tx, {
          schauId: input.id,
          tabelle: "schau",
          datensatzId: input.id,
          aktion: "Phase",
          alt: alt.phase,
          neu: abgemeldet.length ? { phase: input.phase, tabletsAbgemeldet: abgemeldet.length } : input.phase,
          grund: input.grund,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  gebuehrenSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        gebuehren: z
          .array(
            z.object({ art: z.enum(GEBUEHR_ARTEN), jugend: z.boolean(), betragCent: z.number().int().min(0).max(10_000_000), befreitPreisrichter: z.boolean() }),
          )
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        await pruefeGebuehrenAenderbar(tx, input.schauId);
        const alt = await tx.select().from(gebuehr).where(eq(gebuehr.schauId, input.schauId));
        await tx.delete(gebuehr).where(eq(gebuehr.schauId, input.schauId));
        if (input.gebuehren.length) await tx.insert(gebuehr).values(input.gebuehren.map((g) => ({ ...g, schauId: input.schauId })));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "gebuehr",
          datensatzId: null,
          aktion: "gesetzt",
          alt: alt.map(({ art, jugend, betragCent, befreitPreisrichter }) => ({ art, jugend, betragCent, befreitPreisrichter })),
          neu: input.gebuehren,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Preisart anlegen oder ändern. Ist sie schon vergeben, bleiben Betrag, Quelle, Kontingent und Mindestpunkte fest
   * (Name, Kürzel, Sachpreis und Reihenfolge lassen sich weiter ändern). Jede Änderung steht im Protokoll.
   */
  preisartSpeichern: adminProcedure.input(preisartEingabe).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const { id, ...werte } = input;
    await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      if (id) {
        const [alt] = await tx.select().from(preisart).where(and(eq(preisart.id, id), eq(preisart.schauId, input.schauId)));
        if (!alt) throw fehler("NOT_FOUND", "Preisart nicht gefunden.");
        const [{ n }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.preisartId, id))) as [{ n: number }];
        const geaendert = PREISART_GEBUNDEN.filter((k) => alt[k] !== werte[k]);
        // Die Bindung bestimmt Kontingent und Berechtigung schon vergebener Preise: dann fest.
        if (n > 0 && (alt.zielgruppe !== werte.zielgruppe || alt.sparte !== werte.sparte)) {
          throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben – die Bindung (Jugend/Senioren, Sparte) lässt sich nicht mehr ändern. Bitte eine neue Preisart anlegen.`);
        }
        if (n > 0 && geaendert.length) {
          throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben – Betrag und Quelle lassen sich nicht mehr ändern. Bitte eine neue Preisart anlegen.`);
        }
        if (n > 0 && werte.mindestpunkte != null && werte.mindestpunkte !== alt.mindestpunkte) {
          const vergeben = await tx
            .select({ nr: katalogeintrag.katalogNr, suffix: katalogeintrag.suffix, punkte: bewertung.punkte })
            .from(preisvergabe)
            .innerJoin(katalogeintrag, eq(katalogeintrag.id, preisvergabe.katalogeintragId))
            .leftJoin(bewertung, eq(bewertung.katalogeintragId, katalogeintrag.id))
            .where(eq(preisvergabe.preisartId, id));
          const darunter = vergeben.filter((v) => v.punkte == null || v.punkte < werte.mindestpunkte!);
          if (darunter.length) {
            throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon an Tiere mit weniger Punkten vergeben (Nr. ${darunter.map((v) => `${v.nr}${v.suffix}`).join(", ")}). Erst diese Preise entfernen.`);
          }
        }
        await tx.update(preisart).set(werte).where(eq(preisart.id, id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: id, aktion: "geändert", alt, neu: werte, akteur: ctx });
      } else {
        const [neu] = await tx.insert(preisart).values(werte).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: neu!.id, aktion: "angelegt", neu: werte, akteur: ctx });
      }
    });
    return { ok: true };
  }),

  preisartLoeschen: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      const [alt] = await tx.select().from(preisart).where(and(eq(preisart.id, input.id), eq(preisart.schauId, input.schauId)));
      if (!alt) throw fehler("NOT_FOUND", "Preisart nicht gefunden.");
      const [{ n }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.preisartId, input.id))) as [{ n: number }];
      if (n > 0) throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben und lässt sich nicht löschen. Erst die Preise entfernen.`);
      await tx.delete(preisart).where(eq(preisart.id, input.id));
      await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: input.id, aktion: "gelöscht", alt, akteur: ctx });
    });
    return { ok: true };
  }),

  notenskalaSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        skala: z.array(z.object({ kuerzel: z.string().min(1), name: z.string().min(1), punkte: z.array(z.number().int().min(0).max(100)).min(1) })).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Nach der Freigabe stehen die Noten in Katalog, Ergebnissen und Karten – die Skala bleibt dann fest.
      if (s.ergebnisseFreigegeben) throw fehler("BAD_REQUEST", "Die Ergebnisse sind freigegeben – die Notenskala lässt sich nicht mehr ändern.");
      await db.transaction(async (tx) => {
        await tx.update(schau).set({ notenskala: input.skala }).where(eq(schau.id, input.schauId));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "schau", datensatzId: input.schauId, aktion: "Notenskala", alt: s.notenskala, neu: input.skala, akteur: ctx });
      });
      return { ok: true };
    }),

  uebersicht: benutzerProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    const [eintraege, meldungen, [bezahlt], punkte] = await Promise.all([
      ladeEintraege(s.id),
      db.select({ status: meldung.status, n: count() }).from(meldung).where(eq(meldung.schauId, s.id)).groupBy(meldung.status),
      db
        .select({ s: sum(zahlung.betragCent) })
        .from(zahlung)
        .innerJoin(meldung, eq(meldung.id, zahlung.meldungId))
        .where(eq(meldung.schauId, s.id)),
      checkliste(s.id),
    ]);
    const aktiv = eintraege.filter((e) => e.meldungStatus === "bestaetigt");
    const n = (st: string) => meldungen.find((m) => m.status === st)?.n ?? 0;
    return {
      schau: s,
      zahlen: {
        meldungen: meldungen.reduce((a, m) => a + m.n, 0),
        meldungenOffen: n("offen"),
        meldungenBestaetigt: n("bestaetigt"),
        tiereGemeldet: eintraege.filter((e) => e.meldungStatus !== "abgelehnt" && e.meldungStatus !== "storniert").length,
        tiereBestaetigt: aktiv.length,
        eingeliefert: aktiv.filter((e) => e.status === "eingeliefert" || e.status === "ausgesetzt").length,
        fehlt: aktiv.filter((e) => e.status === "fehlt").length,
        bewertet: aktiv.filter((e) => e.bewertet).length,
        preise: aktiv.reduce((a, e) => a + e.preise.length, 0),
        verkauft: aktiv.filter((e) => e.verkauftAn).length,
        bezahltCent: Number(bezahlt?.s ?? 0),
      },
      checkliste: punkte,
    };
  }),

  protokoll: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        limit: z.number().int().min(1).max(1000).default(200),
        /** Suche in der Datenbank (Wer, Aktion, Bereich, Grund, Werte). */
        q: z.string().trim().max(200).optional(),
        /** Seitenweise: nur Einträge älter als diese id (kleinste id der vorigen Seite). */
        cursor: dbId.nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      return sucheProtokoll(input.schauId, { q: input.q, vorId: input.cursor, limit: input.limit });
    }),

  /** Prüft die Hash-Kette des Protokolls: wurde etwas nachträglich verändert? */
  protokollPruefen: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return pruefeProtokoll(input.schauId);
  }),

  /** Postausgang des Vereins: nicht versandte Mails zuerst, damit ein gestörter Mailserver auffällt. */
  postausgang: adminProcedure.query(async ({ ctx }) => {
    const mails = await db
      .select({ id: postausgang.id, an: postausgang.an, betreff: postausgang.betreff, status: postausgang.status, fehler: postausgang.fehler, versuche: postausgang.versuche, createdAt: postausgang.createdAt, gesendetAm: postausgang.gesendetAm })
      .from(postausgang)
      .where(eq(postausgang.organisationId, ctx.benutzer.organisationId))
      .orderBy(sql`${postausgang.status} = 'gesendet'`, desc(postausgang.createdAt))
      .limit(100);
    return {
      ...mailStatus(),
      mails: mails.map((m) => ({ ...m, naechsterVersuch: m.status === "gesendet" ? null : naechsterVersuch(m.createdAt, m.versuche) })),
    };
  }),

  /** Nicht versandte Mail erneut senden (z. B. nach Korrektur der Mailserver-Einstellungen). */
  postErneutSenden: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    if (!mailStatus().eingerichtet) throw fehler("PRECONDITION_FAILED", "Der Mailversand ist nicht eingerichtet (SMTP_URL) – die Mail bleibt im Postausgang.");
    const [m] = await db
      .update(postausgang)
      .set({ status: "wartet", fehler: "", versuche: 0 })
      .where(and(eq(postausgang.id, input.id), eq(postausgang.organisationId, ctx.benutzer.organisationId), ne(postausgang.status, "gesendet")))
      .returning({ id: postausgang.id });
    if (!m) throw fehler("NOT_FOUND", "Mail nicht gefunden oder schon versendet.");
    await versende(m.id);
    return { ok: true };
  }),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Gebühren, Preisarten, Preisrichter (ohne PIN), Katalog-Gestaltung, Bilder und Beiträge aus der Vorlage übernehmen. */
async function kopiereAusVorlage(tx: Tx, von: number, nach: number) {
  const [gebuehren, preisarten, richter, gestaltung, bilder, beitraege] = await Promise.all([
    tx.select().from(gebuehr).where(eq(gebuehr.schauId, von)),
    tx.select().from(preisart).where(eq(preisart.schauId, von)),
    tx.select().from(preisrichter).where(eq(preisrichter.schauId, von)).orderBy(asc(preisrichter.id)),
    tx.select().from(katalogGestaltung).where(eq(katalogGestaltung.schauId, von)),
    tx.select().from(bild).where(eq(bild.schauId, von)).orderBy(asc(bild.id)),
    tx.select().from(katalogBeitrag).where(eq(katalogBeitrag.schauId, von)),
  ]);
  if (gebuehren.length) await tx.insert(gebuehr).values(gebuehren.map(({ id: _, ...g }) => ({ ...g, schauId: nach })));
  if (preisarten.length) await tx.insert(preisart).values(preisarten.map(({ id: _, ...p }) => ({ ...p, schauId: nach })));
  // Preisrichter ohne PIN: die neue Schau bekommt neue PINs (alte Tablets melden sich nicht an der neuen Schau an).
  if (richter.length) await tx.insert(preisrichter).values(richter.map(({ id: _, createdAt: __, pinHash: ___, ...r }) => ({ ...r, schauId: nach })));
  if (gestaltung[0]) await tx.insert(katalogGestaltung).values({ ...gestaltung[0], schauId: nach });
  const neueBildId = new Map<number, number>();
  for (const { id, createdAt: _, ...b } of bilder) {
    const [neu] = await tx.insert(bild).values({ ...b, schauId: nach }).returning({ id: bild.id });
    neueBildId.set(id, neu!.id);
  }
  if (beitraege.length)
    await tx.insert(katalogBeitrag).values(beitraege.map(({ id: _, ...k }) => ({ ...k, schauId: nach, bildId: k.bildId != null ? (neueBildId.get(k.bildId) ?? null) : null })));
  return neueBildId;
}

/** Aufsteller der letzten Schau für eine neue ohne Vorlage: die Bilder kommen nicht mit, also auch kein Sockelbild. */
function ohneSockelbild(a: Aufsteller | null): Aufsteller | null {
  return a?.verkleidung?.bildId != null ? { ...a, verkleidung: { ...a.verkleidung, bildId: null } } : a;
}

