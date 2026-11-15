import { and, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { Tx } from "../db/client";
import { aussteller, auszahlung, katalogeintrag, lastschriftLauf, meldung, schau, sepaLauf, verkauf, verkaufZahlungseingang, zahlung } from "../db/schema";
import { fehler } from "../trpc";

/** Kennung der Kassen-Sperre (pg_advisory_xact_lock, zweiter Schlüssel ist die Schau). */
const KASSE_SPERRE = 0x4b415353; // "KASS"

/**
 * Sperrt Geldbuchungen der Schau bis zum Ende der Transaktion. Gleichzeitige Kassen laufen so nacheinander:
 * keine doppelten Beleg-/Quittungsnummern, und die Prüfungen auf Auszahlung/SEPA-Datei sehen den neuesten Stand.
 */
export async function sperreKasse(tx: Tx, schauId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${KASSE_SPERRE}::int, ${schauId}::int)`);
}

// ── SEPA-Datei (Überweisungslauf) ────────────────────────────────────────
// Die erzeugte Datei liegt mit allen Posten in sepa_lauf – nicht im Protokoll, damit IBANs nicht dauerhaft
// gespeichert bleiben. Gebucht wird genau dieser Inhalt, nicht der Stand der Liste beim Klick. Je Schau gibt es
// höchstens eine offene Datei. Nach Buchen oder Verwerfen werden IBAN und Kontoinhaber aus dem Lauf entfernt.

export const SEPA_ERSTELLT = "SEPA-Datei erstellt";
export const SEPA_VERWORFEN = "SEPA-Datei verworfen";
export const SEPA_GEBUCHT = "Überweisungen gebucht";

export interface UeberweisungsLauf {
  nachrichtId: string;
  erstelltAm: string;
  ausfuehrungAm: string;
  auftraggeber: { name: string; iban: string; bic: string };
  posten: { ausstellerId: number; name: string; kontoinhaber: string; iban: string; betragCent: number }[];
  summeCent: number;
}

/** Die erstellte, noch nicht gebuchte oder verworfene SEPA-Datei der Schau. */
export async function offenerLauf(tx: Tx, schauId: number): Promise<(UeberweisungsLauf & { erstelltVon: string }) | null> {
  const [l] = await tx.select().from(sepaLauf).where(and(eq(sepaLauf.schauId, schauId), eq(sepaLauf.status, "offen")));
  return l ? { ...(l.daten as UeberweisungsLauf), erstelltVon: l.erstelltVon } : null;
}

/** Schließt den offenen Lauf ab und behält nur, was für die Nachvollziehbarkeit nötig ist (wer, wie viel – keine Bankdaten). */
export async function schliesseLauf(tx: Tx, schauId: number, nachrichtId: string, status: "gebucht" | "verworfen") {
  const [l] = await tx.select().from(sepaLauf).where(and(eq(sepaLauf.schauId, schauId), eq(sepaLauf.nachrichtId, nachrichtId), eq(sepaLauf.status, "offen")));
  if (!l) return;
  const d = l.daten as UeberweisungsLauf;
  const gekuerzt = { ...d, auftraggeber: { name: d.auftraggeber.name, iban: "", bic: "" }, posten: d.posten.map((p) => ({ ausstellerId: p.ausstellerId, betragCent: p.betragCent })) };
  await tx.update(sepaLauf).set({ status, daten: gekuerzt, abgeschlossenAm: new Date() }).where(eq(sepaLauf.id, l.id));
}

// ── SEPA-Lastschrift (Entscheidung 018) ──────────────────────────────────
// Die Lastschriftdatei hält feste Beträge je Meldung, die die Bank einzieht. Solange sie offen ist, darf nichts den
// Betrag dieser Meldungen ändern oder die Meldung entfernen (Bearbeiten, Gebühren, Storno, Absage, Import-Rücknahme,
// Abschluss, Löschwunsch) – sonst bucht „Eingang buchen“ einen Betrag, der nicht mehr stimmt.

export const LASTSCHRIFT_OFFEN = "Meldegeld steht in der offenen Lastschriftdatei – erst buchen oder verwerfen.";

/** Die offene Lastschriftdatei der Schau oder null. */
export async function offeneLastschrift(tx: Pick<Tx, "select">, schauId: number) {
  const [l] = await tx.select().from(lastschriftLauf).where(and(eq(lastschriftLauf.schauId, schauId), eq(lastschriftLauf.status, "offen")));
  return l ?? null;
}

/** Alle offenen Lastschriftdateien des Vereins (für Mandate, die schauübergreifend gelten). */
export async function offeneLastschriftenDesVereins(tx: Pick<Tx, "select">, organisationId: number) {
  return tx
    .select({ l: lastschriftLauf })
    .from(lastschriftLauf)
    .innerJoin(schau, eq(schau.id, lastschriftLauf.schauId))
    .where(and(eq(lastschriftLauf.status, "offen"), eq(schau.organisationId, organisationId)))
    .then((r) => r.map((x) => x.l));
}

/** Steht eine der Meldungen bzw. einer der Aussteller in der offenen Lastschriftdatei der Schau? */
export async function inOffenerLastschrift(tx: Pick<Tx, "select">, schauId: number, wer: { meldungIds?: number[]; ausstellerIds?: number[] }) {
  const l = await offeneLastschrift(tx, schauId);
  return !!l?.daten.posten.some((p) => wer.meldungIds?.includes(p.meldungId) || wer.ausstellerIds?.includes(p.ausstellerId));
}

/**
 * Stornierte oder abgelehnte Meldungen, für die Geld eingegangen ist, das weder erstattet noch als Verfall gebucht ist.
 * Solche Meldungen stehen in keiner Abrechnung – ohne diese Liste fiele das Geld beim Abschluss unter den Tisch.
 */
export async function offeneStornoZahlungen(ex: Tx, schauId: number) {
  const ms = await ex
    .select({ id: meldung.id, verfallenCent: meldung.verfallenCent, vorname: aussteller.vorname, nachname: aussteller.nachname })
    .from(meldung)
    .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
    .where(and(eq(meldung.schauId, schauId), inArray(meldung.status, ["storniert", "abgelehnt"])));
  if (!ms.length) return [];
  const bezahlt = await ex
    .select({ meldungId: zahlung.meldungId, s: sum(zahlung.betragCent) })
    .from(zahlung)
    .where(inArray(zahlung.meldungId, ms.map((x) => x.id)))
    .groupBy(zahlung.meldungId);
  return ms
    .map((x) => ({ meldungId: x.id, name: `${x.nachname}, ${x.vorname}`, restCent: Number(bezahlt.find((b) => b.meldungId === x.id)?.s ?? 0) - x.verfallenCent }))
    .filter((x) => x.restCent !== 0);
}

/** Verkäufe per Überweisung ohne gebuchten Zahlungseingang (Erlös noch nicht in der Abrechnung, Tier noch nicht hinaus). */
export async function offeneUeberweisungsverkaeufe(ex: Tx, schauId: number) {
  return ex
    .select({ id: verkauf.id, belegNr: verkauf.belegNr, preisCent: verkauf.preisCent, katalogeintragId: verkauf.katalogeintragId })
    .from(verkauf)
    .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
    .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
    .where(and(eq(katalogeintrag.schauId, schauId), eq(verkauf.zahlart, "ueberweisung"), isNull(verkauf.storniertAm), isNull(verkaufZahlungseingang.id)));
}

/** Abgeschlossene Schau: nur noch lesen (sonst entstünden offene Beträge, die niemand mehr bucht). Gibt die Schau zurück, damit sich die Prüfung an ladeSchau hängen lässt. */
export function pruefeNichtAbgeschlossen<T extends { phase: string }>(s: T): T {
  if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – für Korrekturen erst mit Grund zurück zur Abrechnung.");
  return s;
}

/**
 * Wirft, wenn der Aussteller schon abgerechnet ist oder in der offenen SEPA-Datei steht – Verkauf, Storno oder Preise
 * änderten sonst den Saldo unbemerkt. Ausnahme Reklamation: die Ausstellungsleitung darf mit Grund stornieren bzw.
 * einen Preis entziehen – der Unterschied erscheint als Differenz (Rückforderung oder Nachzahlung mit Bezug auf die
 * erste Quittung). Eine offene SEPA-Datei sperrt immer.
 */
export async function pruefeNichtAbgerechnet(tx: Tx, schauId: number, ausstellerId: number, reklamation?: { istAdmin: boolean; grund: string }) {
  const [a] = await tx
    .select()
    .from(auszahlung)
    .where(and(eq(auszahlung.schauId, schauId), eq(auszahlung.ausstellerId, ausstellerId), isNull(auszahlung.storniertAm)));
  if (a && !(reklamation?.istAdmin && reklamation.grund.trim().length >= 3)) {
    throw fehler(
      "CONFLICT",
      reklamation
        ? `Aussteller ist bereits abgerechnet (Quittung ${a.quittungNr}). Als Reklamation nur durch die Ausstellungsleitung mit Grund – der Unterschied erscheint dann als Differenz.`
        : `Aussteller ist bereits abgerechnet (Quittung ${a.quittungNr}). Verkauf, Storno und Preise sind danach gesperrt.`,
    );
  }
  const lauf = await offenerLauf(tx, schauId);
  if (lauf?.posten.some((p) => p.ausstellerId === ausstellerId)) throw fehler("CONFLICT", "Aussteller steht in der offenen SEPA-Datei. Erst die Datei buchen oder verwerfen.");
}

