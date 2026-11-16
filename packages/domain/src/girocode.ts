/**
 * Überweisung des Meldegelds mit Referenz und GiroCode (Entscheidung 021): Jede Meldung bekommt eine Referenz nach
 * ISO 11649 („RF“ + Prüfziffern), die im Verwendungszweck steht. Der GiroCode (EPC-QR nach EPC069-12, Version 002)
 * füllt die Überweisung in der Banking-App aus. Die Referenz ordnet einen Eingang auf dem Kontoauszug eindeutig zu.
 */
import { imEwr, normalisiereIban, pruefeBic, pruefeIban, sepaText } from "./sepa";

/** Stellen der Meldungsnummer in der Referenz: gleich lang, damit keine Referenz Anfang einer anderen ist. */
const STELLEN = 7;

function rest97(ziffern: string): number {
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest;
}

/** Buchstaben in Zahlen (A = 10 … Z = 35), wie bei der IBAN. */
function alsZiffern(text: string): string {
  return [...text].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
}

/** Referenz einer Meldung, ohne Leerzeichen, z. B. „RF910001234“. */
export function rfReferenz(meldungId: number): string {
  if (!Number.isInteger(meldungId) || meldungId < 1) throw new Error("Ungültige Meldungsnummer für die Referenz.");
  const rumpf = String(meldungId).padStart(STELLEN, "0");
  const pruef = 98 - rest97(alsZiffern(`${rumpf}RF00`));
  return `RF${String(pruef).padStart(2, "0")}${rumpf}`;
}

/** Ist das eine gültige Referenz nach ISO 11649 (Aufbau und Prüfziffern)? Leerzeichen sind erlaubt. */
export function istRfReferenz(text: string): boolean {
  const r = text.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[0-9A-Z]{1,21}$/.test(r)) return false;
  return rest97(alsZiffern(r.slice(4) + r.slice(0, 4))) === 1;
}

/** Namensteil nur aus Buchstaben, Leerzeichen, Bindestrich, Apostroph – keine Links oder Domains in Mail und Code. */
function nurName(text: string): string {
  return text.replace(/[^\p{L}\p{M}\s'’-]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Verwendungszweck einer Meldegeld-Überweisung: Referenz zuerst (die findet der Import), dann der Name lesbar für den
 * Kassierer. Der Name ist frei eingegeben und steht in der Mail des Vereins – daher wie die Anrede nur Buchstaben.
 */
export function verwendungszweckMeldegeld(meldungId: number, nachname: string, vorname: string): string {
  const name = [nurName(nachname), nurName(vorname)].filter(Boolean).join(", ");
  return sepaText(`${rfReferenz(meldungId)} Meldegeld ${name}`, 140);
}

export interface GiroCodeAngaben {
  /** Kontoinhaber genau wie bei der Bank (Empfängerüberprüfung). */
  empfaenger: string;
  iban: string;
  /** Außerhalb des EWR Pflicht, sonst freiwillig. */
  bic?: string;
  betragCent: number;
  verwendungszweck: string;
}

/** Höchstlänge des Inhalts laut EPC069-12. */
export const GIROCODE_MAX_BYTE = 331;

/**
 * Inhalt des GiroCodes (EPC069-12 Version 002, UTF-8) oder null, wenn die Angaben dafür nicht reichen (IBAN ungültig,
 * kein Empfänger, Betrag außerhalb 0,01 bis 999.999.999,99 €, Konto außerhalb des EWR ohne BIC).
 */
export function giroCodeText(a: GiroCodeAngaben): string | null {
  const iban = normalisiereIban(a.iban);
  const bic = (a.bic ?? "").replace(/\s+/g, "").toUpperCase();
  // Name ohne Umschrift: Die Bank vergleicht ihn mit dem Kontoinhaber. Nur Zeilenumbrüche entfernen und kürzen.
  // Nach Zeichen kürzen, nicht nach UTF-16-Einheiten – sonst zerfiele ein Emoji an der Grenze.
  const empfaenger = [...a.empfaenger.replace(/\s+/g, " ").trim()].slice(0, 70).join("");
  if (!empfaenger || pruefeIban(iban)) return null;
  if (bic ? pruefeBic(bic) : !imEwr(iban)) return null;
  if (!Number.isInteger(a.betragCent) || a.betragCent < 1 || a.betragCent > 99_999_999_999) return null;
  const betrag = `EUR${Math.floor(a.betragCent / 100)}.${String(a.betragCent % 100).padStart(2, "0")}`;
  const kopf = ["BCD", "002", "1", "SCT", bic, empfaenger, iban, betrag, "", ""].join("\n") + "\n";
  // Ein langer Name aus Mehrbyte-Zeichen kann die Höchstlänge sprengen: dann den Verwendungszweck hinten kürzen
  // (nach sepaText nur ASCII, ein Zeichen je Byte). Die Referenz steht vorn und bleibt erhalten.
  const platz = GIROCODE_MAX_BYTE - new TextEncoder().encode(kopf).length;
  return kopf + sepaText(a.verwendungszweck, Math.min(140, platz));
}
