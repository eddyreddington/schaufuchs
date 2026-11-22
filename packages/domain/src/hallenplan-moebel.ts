/**
 * Hallenplan – Tisch, Bank, Garnitur und Pokaltisch: Arten, Namen, Standardmaße und Höhen, Maße mit Vorgaben, die Körper
 * einer Garnitur (Bank, Tisch, Bank) und die Stellen der Pokale auf einem Pokaltisch.
 */
import type { Rechteck } from "./hallenplan-typen";

/** Tisch, Bank, Garnitur (Biertisch mit zwei Bänken) und Pokaltisch (Ehrenpreise): eingesetzte Teile ohne Käfigplatz. */
export type MoebelArt = "tisch" | "bank" | "garnitur" | "pokaltisch";
export const MOEBEL_ARTEN: readonly MoebelArt[] = ["tisch", "bank", "garnitur", "pokaltisch"];
export const MOEBEL_NAME: Record<MoebelArt, string> = { tisch: "Tisch", bank: "Bank", garnitur: "Garnitur", pokaltisch: "Pokaltisch" };
/** Biertisch 220 × 50 cm, Bierbank 220 × 25 cm; in der Garnitur je eine Bank an jeder langen Seite, 15 cm vom Tisch. */
export const TISCH_STANDARD = { laenge: 220, tiefe: 50 } as const;
export const BANK_STANDARD = { laenge: 220, tiefe: 25 } as const;
export const GARNITUR_ABSTAND = 15;
/** Pokaltisch: ein breiterer Tisch für die Ehrenpreise, 200 × 80 cm. */
export const POKALTISCH_STANDARD = { laenge: 200, tiefe: 80 } as const;
/** Höhen (cm) für die 3D-Ansicht. */
export const TISCH_HOEHE = 77;
export const BANK_HOEHE = 47;

export const istMoebel = (o: { art: string }): o is { art: MoebelArt } => (MOEBEL_ARTEN as readonly string[]).includes(o.art);

/** Maße eines Möbelstücks mit Vorgaben: Länge, Tiefe (Tisch bzw. Bank) und bei der Garnitur die Tiefe der Bänke. */
export function moebelMass(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }): { laenge: number; tiefe: number; bankTiefe: number; gesamt: number } {
  const std = o.art === "bank" ? BANK_STANDARD : o.art === "pokaltisch" ? POKALTISCH_STANDARD : TISCH_STANDARD;
  const laenge = o.laenge && o.laenge > 0 ? o.laenge : std.laenge;
  const tiefe = o.tiefe && o.tiefe > 0 ? o.tiefe : std.tiefe;
  const bankTiefe = o.bankTiefe && o.bankTiefe > 0 ? o.bankTiefe : BANK_STANDARD.tiefe;
  return { laenge, tiefe, bankTiefe, gesamt: o.art === "garnitur" ? tiefe + 2 * (bankTiefe + GARNITUR_ABSTAND) : tiefe };
}

/**
 * Tisch, Bank, Garnitur oder Pokaltisch in der Lage `q` (Hallenkoordinaten): die Körper darin – eine Garnitur als Bank,
 * Tisch, Bank quer zur Länge. Grundlage für Plan, Druck und 3D.
 */
export function moebelStuecke(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }, q: Rechteck): { art: "tisch" | "bank" | "pokaltisch"; q: Rechteck }[] {
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

/** Höhen der Pokale (cm) im Wechsel, damit die Reihe nach Ehrenpreisen aussieht und nicht nach Flaschen. */
const POKAL_HOEHEN = [30, 38, 26, 34, 28, 36] as const;
/**
 * Pokal in 3D: Breite und Tiefe je cm Höhe (`POKAL_SKALA`, Körper 0,8, Henkel außen bei ±0,55) und die Hülle mit Henkeln
 * (`POKAL_BREITE` × Höhe), in beiden Richtungen gleich gerechnet, weil die Henkel nicht mit dem Tisch drehen.
 */
export const POKAL_SKALA = 0.6;
export const POKAL_BREITE = 1.1 * POKAL_SKALA;

/**
 * Pokale auf einem Pokaltisch in der Lage `q`: eine Reihe mittig längs der langen Seite, je etwa 50 cm einer (zwei bis
 * sechs), mit Mittelpunkt (x, y in Hallenkoordinaten) und Höhe. Auf schmalen oder kurzen Tischen werden sie kleiner, bis
 * die Hülle mit Henkeln in ihr Feld passt (kurze Seite × lange Seite / Anzahl). Für die 3D-Ansicht.
 */
export function pokalStellen(q: Rechteck): { x: number; y: number; h: number }[] {
  const laengsX = q.b >= q.h;
  const lang = laengsX ? q.b : q.h;
  const kurz = laengsX ? q.h : q.b;
  const n = Math.max(2, Math.min(POKAL_HOEHEN.length, Math.round(lang / 50)));
  const hoechstens = Math.min(kurz, lang / n) / POKAL_BREITE;
  return Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.5) * lang) / n;
    return { x: laengsX ? q.x + a : q.x + q.b / 2, y: laengsX ? q.y + q.h / 2 : q.y + a, h: Math.min(POKAL_HOEHEN[i]!, hoechstens) };
  });
}
