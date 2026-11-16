/**
 * Überweisung des Meldegelds (Entscheidung 021): welche Bankverbindung Aussteller sehen, und je Meldung Verwendungszweck
 * mit Referenz und GiroCode. Die Regeln für Referenz und Code liegen in packages/domain (girocode.ts).
 */
import { formatIban, gefordertCent, giroCodeText, heuteBerlin, imEwr, mandatGueltig, pruefeIban, verwendungszweckMeldegeld } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { sepaMandat } from "../db/schema";
import type { Schau } from "../trpc";
import { inOffenerLastschrift } from "./kasse";

export type SchauKonto = Pick<Schau, "girocode" | "zahlungBeiEinlieferung" | "vereinKontoinhaber" | "vereinIban" | "vereinBic" | "bankverbindung">;

/** GiroCode und Referenz gibt es nur bei Zahlung vorab und mit vollständigem Vereinskonto. */
export function girocodeAktiv(s: SchauKonto): boolean {
  return s.girocode && !s.zahlungBeiEinlieferung && !!s.vereinIban && !!s.vereinKontoinhaber.trim();
}

/** Bankverbindung für Aussteller: mit GiroCode das Vereinskonto (gleiche Angaben wie im Code), sonst der freie Text. */
export function bankAngabe(s: SchauKonto): string {
  if (!girocodeAktiv(s)) return s.bankverbindung;
  return [s.vereinKontoinhaber.trim(), `IBAN ${formatIban(s.vereinIban)}`, s.vereinBic ? `BIC ${s.vereinBic}` : ""].filter(Boolean).join(", ");
}

export interface Ueberweisung {
  /** Verwendungszweck mit Referenz vorn. */
  zweck: string;
  /** Inhalt des GiroCodes; null, wenn das Konto dafür nicht reicht (z. B. außerhalb des EWR ohne BIC). */
  giroCode: string | null;
}

/** Bis zum Katalog kommt das Meldegeld per Überweisung; ab der Einlieferung zahlt man an der Kasse bzw. wird verrechnet. */
const UEBERWEISUNG_PHASEN: ReadonlySet<string> = new Set(["vorbereitung", "meldung", "katalog"]);

/**
 * Verwendungszweck und GiroCode einer Meldung über den offenen Betrag – null, wenn abgeschaltet, ab der Einlieferung,
 * wenn nichts offen ist, die Meldung storniert bzw. abgelehnt ist oder das Meldegeld per Lastschrift kommt (gültiges
 * Mandat oder Posten in der offenen Lastschriftdatei): Ein zweiter Zahlweg führte sonst zur Doppelzahlung.
 */
export async function ueberweisung(
  s: SchauKonto & Pick<Schau, "id" | "organisationId" | "phase">,
  m: { id: number; status: string; ausstellerId: number },
  name: { vorname: string; nachname: string },
  b: { summeCent: number; stiftungCent: number; spendeCent: number; bezahltCent: number },
): Promise<Ueberweisung | null> {
  const offenCent = gefordertCent(b) - b.bezahltCent;
  if (!girocodeAktiv(s) || !UEBERWEISUNG_PHASEN.has(s.phase) || offenCent <= 0 || (m.status !== "offen" && m.status !== "bestaetigt")) return null;
  if (await inOffenerLastschrift(db, s.id, { meldungIds: [m.id] })) return null;
  const mandate = await db.select().from(sepaMandat).where(and(eq(sepaMandat.organisationId, s.organisationId), eq(sepaMandat.ausstellerId, m.ausstellerId)));
  const heute = heuteBerlin();
  if (mandate.some((x) => !mandatGueltig(x, heute) && !pruefeIban(x.iban) && imEwr(x.iban))) return null;
  const zweck = verwendungszweckMeldegeld(m.id, name.nachname, name.vorname);
  return { zweck, giroCode: giroCodeText({ empfaenger: s.vereinKontoinhaber, iban: s.vereinIban, bic: s.vereinBic, betragCent: offenCent, verwendungszweck: zweck }) };
}
