import { tierart } from "./tiergesundheit";
import type { Meldeart } from "./types";

/**
 * Besatz von Stämmen und Volieren (Beschluss der 185. BDRG-Bundesversammlung, Mai 2022).
 * Großgeflügel = Puten, Perlhühner, Gänse. Übrige = Enten, Hühner, Zwerghühner, Japanische Legewachteln.
 */
const BESATZ: Record<"stamm" | "voliere", Record<Tiergruppe, string>> = {
  stamm: { gross: "1,1", tauben: "1,1", uebrige: "1,2" },
  voliere: { gross: "1,2", tauben: "3,3", uebrige: "1,3" },
};

type Tiergruppe = "gross" | "tauben" | "uebrige";

/** Ordnet über Sparte und Rasse grob zu – Bezeichnungen im Verzeichnis sind nicht genormt. */
export function tiergruppe(sparteUndRasse: string): Tiergruppe {
  const art = tierart(sparteUndRasse, "");
  if (art === "tauben") return "tauben";
  if (art === "puten" || art === "perlhuehner" || art === "gaense") return "gross";
  return "uebrige";
}

/** Vorgeschriebener Besatz für Stamm oder Voliere, sonst null. */
export function standardBesatz(art: Meldeart, sparteUndRasse: string): string | null {
  if (art !== "stamm" && art !== "voliere") return null;
  return BESATZ[art][tiergruppe(sparteUndRasse)];
}

/** Hinweis, wenn der gemeldete Besatz nicht der Vorgabe entspricht (der Preisrichter vergibt dann o.B.). */
export function pruefeBesatz(art: Meldeart, geschlecht: string, sparteUndRasse: string): string | null {
  const soll = standardBesatz(art, sparteUndRasse);
  if (!soll || geschlecht.trim() === soll) return null;
  return `Vorgeschrieben ist ${soll}. Falsch besetzte Stämme und Volieren bleiben ohne Bewertungsnote (o.B.).`;
}

/**
 * Anzahl der Tiere hinter einer Geschlechtsangabe: „1,0“ → 1, „1,2“ → 3, „3,3“ → 6.
 * Für Aufzeichnungen über abgegebene Tiere (Stamm und Voliere zählen alle Tiere).
 */
export function tierzahl(geschlecht: string): number {
  const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(geschlecht);
  if (!m) return 1;
  return Math.max(1, Number(m[1]) + Number(m[2]));
}
