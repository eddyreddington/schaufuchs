/**
 * Textbausteine der Bewertungskarte: Kategorie (Vorzüge, Wünsche, Mängel), Merkmal (Gruppe) und Geflügelart. Das
 * Tablet zeigt je Tier nur die Bausteine seiner Art und je gewähltem Merkmal.
 */
export const BAUSTEIN_KATEGORIEN = ["vorzug", "wunsch", "mangel"] as const;
export type BausteinKategorie = (typeof BAUSTEIN_KATEGORIEN)[number];
export const BAUSTEIN_KATEGORIE_LABEL: Record<BausteinKategorie, string> = { vorzug: "Vorzüge", wunsch: "Wünsche", mangel: "Mängel" };

export const BAUSTEIN_ARTEN = {
  alle: "alle Arten",
  huehner: "Hühner und Zwerghühner",
  tauben: "Tauben",
  wasser: "Enten und Gänse",
  puten: "Puten",
  perlhuehner: "Perlhühner",
  wachteln: "Wachteln",
  ziergefluegel: "Ziergeflügel",
} as const;
export type BausteinArt = keyof typeof BAUSTEIN_ARTEN;
export const BAUSTEIN_ART_LISTE = Object.keys(BAUSTEIN_ARTEN) as BausteinArt[];

/**
 * Welche Bausteine passen zur Sparte eines Tieres? Die Spartennamen stammen aus dem eingespielten Verzeichnis; erkannt
 * wird über Wortteile. Unbekannte Sparten zeigen alle Bausteine.
 */
export function artenDerSparte(sparte: string | null | undefined, rasse?: string | null): BausteinArt[] | null {
  const klein = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ß/g, "ss");
  const s = klein(sparte);
  if (!s) return null;
  if (s.includes("taube")) return ["tauben"];
  // Puten vor Hühnern: „Truthühner“ enthält „hühner“.
  if (s.includes("pute") || s.includes("truthuhn") || s.includes("truthuehner")) return ["puten"];
  if (s.includes("wasser") || s.includes("ente") || s.includes("gans") || s.includes("gaense")) return ["wasser"];
  if (s.includes("perl")) return ["perlhuehner"];
  if (s.includes("gross")) {
    // Sammelsparte: am Rassenamen erkennen, sonst alle Arten des Großgeflügels.
    const r = klein(rasse);
    if (r.includes("pute") || r.includes("truthuhn") || r.includes("truthuehner")) return ["puten"];
    if (r.includes("perl")) return ["perlhuehner"];
    if (r.includes("ente") || r.includes("gans") || r.includes("gaense")) return ["wasser"];
    return ["puten", "perlhuehner", "wasser"];
  }
  if (s.includes("wachtel")) return ["wachteln"];
  if (s.includes("zier") || s.includes("fasan")) return ["ziergefluegel"];
  if (s.includes("huhn") || s.includes("huehner") || s.includes("bantam")) return ["huehner"];
  return null;
}

export function bausteinPasst(art: string, sparte: string | null | undefined, rasse?: string | null): boolean {
  if (art === "alle") return true;
  const arten = artenDerSparte(sparte, rasse);
  return arten == null || (arten as string[]).includes(art);
}

const rassenName = (x: string | null | undefined) => (x ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/** Gilt ein Baustein mit dieser Rasse für das Tier? Ohne Rasse gilt er für jede Rasse; Vergleich ohne Groß-/Kleinschreibung. */
export function rassePasst(bausteinRasse: string | null | undefined, tierRasse: string | null | undefined): boolean {
  if (!rassenName(bausteinRasse)) return true;
  return rassenName(bausteinRasse) === rassenName(tierRasse);
}

/**
 * Passt ein Baustein zum Tier? Geflügelart (über die Sparte, bei Großgeflügel über den Namen) und – wenn der Baustein an
 * eine Rasse gebunden ist – die Rasse des Tieres.
 */
export function bausteinFuerTier(
  b: { art: string; rasse?: string | null },
  tier: { sparte: string | null | undefined; rasse?: string | null; bezeichnung?: string | null },
): boolean {
  return bausteinPasst(b.art, tier.sparte, tier.rasse ?? tier.bezeichnung) && rassePasst(b.rasse, tier.rasse);
}

/** Reihenfolge der Merkmale wie beim Durchgehen eines Tieres – unbekannte Gruppen danach alphabetisch. */
export const BAUSTEIN_GRUPPEN_FOLGE = [
  "Gesamteindruck",
  "Form",
  "Haltung",
  "Größe",
  "Kopf",
  "Kamm",
  "Kehllappen/Ohrscheiben",
  "Augen",
  "Schnabel/Warzen",
  "Hals",
  "Rücken",
  "Brust",
  "Flügel",
  "Schwanz",
  "Läufe/Zehen",
  "Gefieder",
  "Farbe",
  "Zeichnung",
  "Federschmuck",
  "Kondition/Pflege",
];

export function sortiereGruppen(gruppen: Iterable<string>): string[] {
  const rang = (g: string) => {
    const i = BAUSTEIN_GRUPPEN_FOLGE.indexOf(g);
    return i < 0 ? BAUSTEIN_GRUPPEN_FOLGE.length : i;
  };
  return [...new Set(gruppen)].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, "de"));
}
