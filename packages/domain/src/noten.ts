import type { Sondernote } from "./types";

export interface NotenStufe {
  /** Kürzel wie auf der Bewertungskarte, z. B. "sg". */
  kuerzel: string;
  name: string;
  /** Punktwerte, die zu dieser Note führen. */
  punkte: number[];
}

/**
 * Notenskala des europäischen Bewertungssystems, wie sie der BDRG anwendet (v 97, hv 96, sg 95–93, g 92–91, b 90).
 * Abgeglichen mit den AAB des BDRG. Jede Schau kann die Skala überschreiben.
 */
export const STANDARD_NOTENSKALA: NotenStufe[] = [
  { kuerzel: "v", name: "vorzüglich", punkte: [97] },
  { kuerzel: "hv", name: "hervorragend", punkte: [96] },
  { kuerzel: "sg", name: "sehr gut", punkte: [95, 94, 93] },
  { kuerzel: "g", name: "gut", punkte: [92, 91] },
  { kuerzel: "b", name: "befriedigend", punkte: [90] },
];

export const SONDERNOTE_LABEL: Record<Sondernote, { kuerzel: string; name: string; hinweis: string }> = {
  u: { kuerzel: "u", name: "ungenügend", hinweis: "0 Punkte: ohne Rassewert, Kreuzung oder Ausschlussfehler" },
  oB: { kuerzel: "o.B.", name: "ohne Bewertungsnote", hinweis: "z. B. krank, ungepflegt, Ringfehler, falsch besetzter Stamm" },
  uM: { kuerzel: "u.M.", name: "unnatürliche Merkmale", hinweis: "Manipulation; Obmann bestätigt und meldet weiter" },
  nA: { kuerzel: "n.a.", name: "nicht anerkannt", hinweis: "Rasse oder Farbenschlag nicht im Standard" },
};

/** Note, für die der Obmann bestätigen muss. */
export const OBMANN_NOTE = "v";
/** Sondernoten, die der Obmann ebenfalls bestätigen muss. */
export const OBMANN_SONDERNOTEN: readonly Sondernote[] = ["uM"];

export function erlaubtePunkte(skala: NotenStufe[] = STANDARD_NOTENSKALA): number[] {
  return skala.flatMap((s) => s.punkte).sort((a, b) => b - a);
}

export function noteFuerPunkte(punkte: number, skala: NotenStufe[] = STANDARD_NOTENSKALA): NotenStufe | null {
  return skala.find((s) => s.punkte.includes(punkte)) ?? null;
}

export interface BewertungsWert {
  punkte: number | null;
  sondernote: Sondernote | null;
}

/** Text für Katalog und Listen, z. B. "95 sg" oder "o.B.". */
export function bewertungsText(b: BewertungsWert | null | undefined, skala?: NotenStufe[]): string {
  if (!b) return "";
  if (b.sondernote === "u") return "0 u";
  if (b.sondernote) return SONDERNOTE_LABEL[b.sondernote].kuerzel;
  if (b.punkte == null) return "";
  const note = noteFuerPunkte(b.punkte, skala);
  return note ? `${b.punkte} ${note.kuerzel}` : String(b.punkte);
}

export function brauchtObmann(b: BewertungsWert, skala?: NotenStufe[]): boolean {
  if (b.sondernote) return OBMANN_SONDERNOTEN.includes(b.sondernote);
  if (b.punkte == null) return false;
  return noteFuerPunkte(b.punkte, skala)?.kuerzel === OBMANN_NOTE;
}

/** Prüft eine Bewertung. Gibt eine Fehlermeldung oder null zurück. */
export function pruefeBewertung(b: BewertungsWert, skala?: NotenStufe[]): string | null {
  if (b.sondernote && b.punkte != null) return "Entweder Punkte oder Sondernote, nicht beides.";
  if (!b.sondernote && b.punkte == null) return "Punkte oder Sondernote fehlen.";
  if (b.punkte != null && !noteFuerPunkte(b.punkte, skala)) return `${b.punkte} Punkte sind in der Notenskala nicht vorgesehen.`;
  return null;
}
