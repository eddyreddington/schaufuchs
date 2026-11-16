/**
 * Hallenplan – Tisch, Bank und Garnitur: Arten, Namen, Standardmaße und Höhen, Maße mit Vorgaben und die Körper einer
 * Garnitur (Bank, Tisch, Bank).
 */
import type { Rechteck } from "./hallenplan-typen";

/** Tisch, Bank und Garnitur (Biertisch mit zwei Bänken): eingesetzte Teile ohne Käfigplatz. */
export type MoebelArt = "tisch" | "bank" | "garnitur";
export const MOEBEL_ARTEN: readonly MoebelArt[] = ["tisch", "bank", "garnitur"];
export const MOEBEL_NAME: Record<MoebelArt, string> = { tisch: "Tisch", bank: "Bank", garnitur: "Garnitur" };
/** Biertisch 220 × 50 cm, Bierbank 220 × 25 cm; in der Garnitur je eine Bank an jeder langen Seite, 15 cm vom Tisch. */
export const TISCH_STANDARD = { laenge: 220, tiefe: 50 } as const;
export const BANK_STANDARD = { laenge: 220, tiefe: 25 } as const;
export const GARNITUR_ABSTAND = 15;
/** Höhen (cm) für die 3D-Ansicht. */
export const TISCH_HOEHE = 77;
export const BANK_HOEHE = 47;

export const istMoebel = (o: { art: string }): o is { art: MoebelArt } => o.art === "tisch" || o.art === "bank" || o.art === "garnitur";

/** Maße eines Möbelstücks mit Vorgaben: Länge, Tiefe (Tisch bzw. Bank) und bei der Garnitur die Tiefe der Bänke. */
export function moebelMass(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }): { laenge: number; tiefe: number; bankTiefe: number; gesamt: number } {
  const std = o.art === "bank" ? BANK_STANDARD : TISCH_STANDARD;
  const laenge = o.laenge && o.laenge > 0 ? o.laenge : std.laenge;
  const tiefe = o.tiefe && o.tiefe > 0 ? o.tiefe : std.tiefe;
  const bankTiefe = o.bankTiefe && o.bankTiefe > 0 ? o.bankTiefe : BANK_STANDARD.tiefe;
  return { laenge, tiefe, bankTiefe, gesamt: o.art === "garnitur" ? tiefe + 2 * (bankTiefe + GARNITUR_ABSTAND) : tiefe };
}

/**
 * Tisch, Bank oder Garnitur in der Lage `q` (Hallenkoordinaten): die Körper darin – eine Garnitur als Bank, Tisch, Bank quer
 * zur Länge. Grundlage für Plan, Druck und 3D.
 */
export function moebelStuecke(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }, q: Rechteck): { art: "tisch" | "bank"; q: Rechteck }[] {
  if (o.art !== "garnitur") return [{ art: o.art, q }];
  const m = moebelMass(o);
  const xLang = Math.abs(q.b - m.laenge) <= Math.abs(q.h - m.laenge);
  const stueck = (von: number, tief: number): Rechteck => (xLang ? { x: q.x, y: q.y + von, b: q.b, h: tief } : { x: q.x + von, y: q.y, b: tief, h: q.h });
  return [
    { art: "bank", q: stueck(0, m.bankTiefe) },
    { art: "tisch", q: stueck(m.bankTiefe + GARNITUR_ABSTAND, m.tiefe) },
    { art: "bank", q: stueck(m.gesamt - m.bankTiefe, m.bankTiefe) },
  ];
}
