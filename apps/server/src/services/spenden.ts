/**
 * Spenden (Entscheidung 013): Spender zum Aussteller finden oder anlegen, Spenden einer Schau mit Eingangstag und
 * Bestätigungsstand laden, Bestätigungsnummern vergeben. Fachregeln: packages/domain/src/spenden.ts.
 */
import { formatEuro, gefordertCent, type SpendeFuerBestaetigung, steuerstatusLesen, tagBerlin } from "@schau/domain";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { aussteller, auszahlung, bestaetigungSpende, meldung, organisation, spende, spender, zahlung, zuwendungsbestaetigung } from "../db/schema";
import { meldebetrag } from "./eintraege";
import { type Akteur, protokolliere } from "./protokoll";

type Ex = Tx | typeof db;

/** Steuerliche Angaben des Vereins (oder die Vorgabe „nicht eingetragen“). */
export async function ladeSteuer(organisationId: number, ex: Ex = db) {
  const [o] = await ex.select({ steuer: organisation.steuer, name: organisation.name, anschrift: organisation.anschrift }).from(organisation).where(eq(organisation.id, organisationId));
  return { steuer: steuerstatusLesen(o?.steuer), name: o?.name ?? "", anschrift: o?.anschrift ?? "" };
}

/**
 * Spender zu einem Aussteller (Spende bei der Tiermeldung): der schon verknüpfte, sonst ein neuer mit Name und Anschrift
 * des Ausstellers. Test-Aussteller bekommen einen Test-Spender, der mit der Testschau verschwindet.
 */
export async function spenderFuerAussteller(tx: Tx, organisationId: number, ausstellerId: number, nennen: boolean, akteur: Akteur) {
  const [vorhanden] = await tx.select().from(spender).where(and(eq(spender.organisationId, organisationId), eq(spender.ausstellerId, ausstellerId))).orderBy(desc(spender.id)).limit(1);
  if (vorhanden) {
    if (nennen && !vorhanden.nennungName) await tx.update(spender).set({ nennungName: true }).where(eq(spender.id, vorhanden.id));
    return vorhanden.id;
  }
  const [a] = await tx.select().from(aussteller).where(eq(aussteller.id, ausstellerId));
  if (!a) throw new Error("Aussteller fehlt.");
  const [neu] = await tx
    .insert(spender)
    .values({ organisationId, vorname: a.vorname, nachname: a.nachname, strasse: a.strasse, plz: a.plz, ort: a.ort, email: a.email, ausstellerId, nennungName: nennen, testSchauId: a.testSchauId })
    .returning();
  await protokolliere(tx, { schauId: null, tabelle: "spender", datensatzId: neu!.id, aktion: "Spender angelegt", neu: { name: `${a.vorname} ${a.nachname}`, ausstellerId }, akteur });
  return neu!.id;
}

/** Spende bei der Tiermeldung: freiwilliger Posten, wird mit dem Meldegeld bezahlt (Weg „meldung“). */
export async function meldungsspendeAnlegen(tx: Tx, e: { organisationId: number; schauId: number; meldungId: number; ausstellerId: number; betragCent: number; nennen: boolean; akteur: Akteur }) {
  const spenderId = await spenderFuerAussteller(tx, e.organisationId, e.ausstellerId, e.nennen, e.akteur);
  const [sp] = await tx
    .insert(spende)
    .values({ schauId: e.schauId, spenderId, art: "geld", weg: "meldung", betragCent: e.betragCent, meldungId: e.meldungId, zweck: "für die Ausstellung" })
    .returning();
  await protokolliere(tx, { schauId: e.schauId, tabelle: "spende", datensatzId: sp!.id, aktion: "Spende mit der Meldung", neu: sp, akteur: e.akteur });
  return sp!;
}

/**
 * Eingangstag der Spenden „mit dem Meldegeld“: der Tag der letzten Zahlung, sobald die Meldung (nicht abgelehnt oder
 * storniert) ganz bezahlt ist – oder der Tag der Abrechnung, wenn der Rest mit Preisgeld verrechnet wurde. Sonst null (noch nicht eingegangen).
 */
export async function eingangMitMeldegeld(ex: Ex, meldungIds: number[]): Promise<Map<number, string | null>> {
  const ergebnis = new Map<number, string | null>();
  if (!meldungIds.length) return ergebnis;
  const [zahlungen, meldungen] = await Promise.all([
    ex.select({ meldungId: zahlung.meldungId, datum: zahlung.datum, betragCent: zahlung.betragCent }).from(zahlung).where(inArray(zahlung.meldungId, meldungIds)),
    ex.select({ id: meldung.id, schauId: meldung.schauId, ausstellerId: meldung.ausstellerId, status: meldung.status }).from(meldung).where(inArray(meldung.id, meldungIds)),
  ]);
  for (const m of meldungen) {
    // Abgelehnte oder stornierte Meldung: Die Spende gilt nicht als eingegangen (Geld geht zurück oder verfällt).
    if (m.status === "abgelehnt" || m.status === "storniert") {
      ergebnis.set(m.id, null);
      continue;
    }
    const b = await meldebetrag(ex as Tx, m.id);
    if (b.bezahltCent >= gefordertCent(b) && b.bezahltCent > 0) {
      const tage = zahlungen.filter((z) => z.meldungId === m.id && z.betragCent > 0).map((z) => z.datum).sort();
      ergebnis.set(m.id, tage.at(-1) ?? null);
      continue;
    }
    // Verrechnet mit der Abrechnung (Preisgeld, Verkauf): gilt mit der ersten gültigen Buchung als bezahlt.
    const [a] = await ex
      .select({ am: auszahlung.createdAt })
      .from(auszahlung)
      .where(and(eq(auszahlung.schauId, m.schauId), eq(auszahlung.ausstellerId, m.ausstellerId), isNull(auszahlung.storniertAm)))
      .orderBy(auszahlung.id)
      .limit(1);
    ergebnis.set(m.id, a ? tagDe(a.am) : null);
  }
  return ergebnis;
}

const tagDe = (d: Date) => tagBerlin(d);

/** Spenden mit Spender, Eingangstag und ob eine gültige Zuwendungsbestätigung sie schon umfasst. */
export async function ladeSpenden(ex: Ex, filter: { schauId: number } | { spenderId: number } | { spendeId: number }) {
  const bedingung = "schauId" in filter ? eq(spende.schauId, filter.schauId) : "spenderId" in filter ? eq(spende.spenderId, filter.spenderId) : eq(spende.id, filter.spendeId);
  const zeilen = await ex.select({ sp: spende, sr: spender }).from(spende).innerJoin(spender, eq(spender.id, spende.spenderId)).where(bedingung).orderBy(spende.id);
  const ids = zeilen.map((z) => z.sp.id);
  const bestaetigt = ids.length
    ? await ex
        .select({ spendeId: bestaetigungSpende.spendeId, id: zuwendungsbestaetigung.id, nummer: zuwendungsbestaetigung.nummer })
        .from(bestaetigungSpende)
        .innerJoin(zuwendungsbestaetigung, eq(zuwendungsbestaetigung.id, bestaetigungSpende.bestaetigungId))
        .where(and(inArray(bestaetigungSpende.spendeId, ids), isNull(zuwendungsbestaetigung.storniertAm)))
    : [];
  const eingang = await eingangMitMeldegeld(ex, zeilen.map((z) => z.sp.meldungId).filter((x): x is number => x != null));
  return zeilen.map(({ sp, sr }) => {
    const bestaetigung = bestaetigt.find((b) => b.spendeId === sp.id) ?? null;
    const nr = bestaetigung?.nummer ?? null;
    const datum = sp.weg === "meldung" && sp.meldungId != null ? (eingang.get(sp.meldungId) ?? null) : sp.datum;
    const fuerBestaetigung: SpendeFuerBestaetigung = {
      id: sp.id,
      art: sp.art,
      betragCent: sp.betragCent,
      datum,
      gegenleistung: sp.gegenleistung,
      verzichtAufwand: sp.verzichtAufwand,
      storniert: !!sp.storniertAm,
      bestaetigt: nr != null,
      sache: sp.sache,
    };
    return { spende: sp, spender: sr, datum, bestaetigungNr: nr, bestaetigungId: bestaetigung?.id ?? null, fuerBestaetigung };
  });
}
export type SpendeZeile = Awaited<ReturnType<typeof ladeSpenden>>[number];

/** Kennung der Sperre für Bestätigungsnummern (zweiter Schlüssel: Verein). */
const NUMMER_SPERRE = 0x5a574253; // "ZWBS"

/**
 * Sperrt das Ausstellen von Zuwendungsbestätigungen des Vereins bis Transaktionsende. Vor dem Prüfen holen: sonst
 * prüfen zwei gleichzeitige Anfragen beide „noch nicht bestätigt“ und bestätigen dieselbe Spende doppelt.
 */
export async function sperreBestaetigungen(tx: Tx, organisationId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${NUMMER_SPERRE}::int, ${organisationId}::int)`);
}

/** Nächste Nummer einer Zuwendungsbestätigung des Vereins – fortlaufend (unter sperreBestaetigungen). */
export async function naechsteBestaetigungsnummer(tx: Tx, organisationId: number) {
  await sperreBestaetigungen(tx, organisationId);
  const [r] = await tx.select({ n: sql<number>`coalesce(max(${zuwendungsbestaetigung.nummer}), 0)::int` }).from(zuwendungsbestaetigung).where(eq(zuwendungsbestaetigung.organisationId, organisationId));
  return (r?.n ?? 0) + 1;
}

/**
 * Spender, die im Katalog der Schau genannt werden wollen (Einwilligung je Spender, getrennt für Name und Betrag):
 * ohne Stornos, Spenden mit dem Meldegeld erst nach Eingang. Gleicher Name mehrfach: Beträge zusammengezählt.
 */
export async function spenderFuerKatalog(schauId: number): Promise<string[]> {
  const zeilen = (await ladeSpenden(db, { schauId })).filter((z) => !z.spende.storniertAm && z.datum && z.spender.nennungName);
  const je = new Map<string, { cent: number; mitBetrag: boolean }>();
  for (const z of zeilen) {
    const name = z.spender.istFirma ? z.spender.nachname.trim() : `${z.spender.vorname} ${z.spender.nachname}`.trim();
    const alt = je.get(name);
    je.set(name, { cent: (alt?.cent ?? 0) + (z.spende.art === "geld" ? z.spende.betragCent : 0), mitBetrag: (alt?.mitBetrag ?? true) && z.spender.nennungBetrag });
  }
  return [...je.entries()].sort(([a], [b]) => a.localeCompare(b, "de")).map(([name, v]) => (v.mitBetrag && v.cent > 0 ? `${name} (${formatEuro(v.cent)})` : name));
}

/** Spenden eines Ausstellers (über seine Spender-Kopie) für die Auskunft nach Art. 15 DSGVO. */
export async function spendenFuerAuskunft(ausstellerId: number) {
  const kopien = await db.select({ id: spender.id }).from(spender).where(eq(spender.ausstellerId, ausstellerId));
  const zeilen = (await Promise.all(kopien.map((k) => ladeSpenden(db, { spenderId: k.id })))).flat();
  return zeilen.map((z) => ({
    datum: z.datum,
    art: z.spende.art,
    weg: z.spende.weg,
    betragCent: z.spende.betragCent,
    zweck: z.spende.zweck,
    zuwendungsbestaetigung: z.bestaetigungNr,
    imKatalogGenannt: z.spender.nennungName,
    storniertAm: z.spende.storniertAm,
  }));
}
