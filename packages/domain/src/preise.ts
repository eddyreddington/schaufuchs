import type { PreisQuelle, PreisZielgruppe, Rundung } from "./types";

export interface Preisart {
  id: number;
  kuerzel: string;
  name: string;
  quelle: PreisQuelle;
  /** "Auf N Tiere …" – null, wenn die Preisart nicht über den Schlüssel verteilt wird. */
  schluesselProTiere: number | null;
  anzahlProSchluessel: number;
  /** Feste Anzahl je Preisrichter, z. B. "jeder PR 2 Bänder". */
  anzahlProPreisrichter: number;
  mindestpunkte: number | null;
  rundung: Rundung;
  /** Bindung: nur Jugend oder nur Senioren (fehlt: alle). */
  zielgruppe?: PreisZielgruppe;
  /** Bindung an eine Sparte (Name wie in den Stammdaten; leer: alle Sparten). */
  sparte?: string;
}

/** Passt das Tier zur Bindung der Preisart (Zielgruppe, Sparte)? Zählt fürs Kontingent und erlaubt die Vergabe. */
export function passtZuPreisart(p: Pick<Preisart, "zielgruppe" | "sparte">, tier: { istJugend: boolean; sparte: string | null }): boolean {
  if (p.zielgruppe === "jugend" && !tier.istJugend) return false;
  if (p.zielgruppe === "senioren" && tier.istJugend) return false;
  if (p.sparte?.trim() && (tier.sparte ?? "").trim().toLowerCase() !== p.sparte.trim().toLowerCase()) return false;
  return true;
}

/** Gewicht einer Meldung bei der Höchstzahl je Preisrichter (PV-Hinweise): Stamm 2, Voliere 3, Bruteier 3. */
export const PR_GEWICHT: Record<string, number> = { einzeltier: 1, stamm: 2, voliere: 3, bruteier: 3 };

/** Gewichtete Tierzahl eines Preisrichters aus den Meldearten seiner Tiere. */
export function gewichteteTierzahl(arten: string[]): number {
  return arten.reduce((n, a) => n + (PR_GEWICHT[a] ?? 1), 0);
}

/** Kurzer Text zur Bindung für Katalog und Oberfläche („nur Jugend“, „Sparte Tauben“), leer ohne Bindung. */
export function bindungText(p: Pick<Preisart, "zielgruppe" | "sparte">): string {
  return [p.zielgruppe === "jugend" ? "nur Jugend" : p.zielgruppe === "senioren" ? "nur Senioren" : "", p.sparte?.trim() ? `Sparte ${p.sparte.trim()}` : ""].filter(Boolean).join(", ");
}

/**
 * Wie viele Preise dieser Art bei `tiere` ausgestellten Tieren vergeben werden dürfen.
 * Rundung je Preisart: „voll“ zählt nur volle Schlüssel (47 Tiere → 4), „angefangen“ auch angebrochene (47 → 5).
 * `preisrichter`: wie viele Preisrichter sich das Kontingent teilen (für die feste Anzahl je Preisrichter).
 */
export function kontingent(p: Preisart, tiere: number, preisrichter = 1): number {
  let schluessel = 0;
  if (p.schluesselProTiere && tiere > 0) {
    const q = tiere / p.schluesselProTiere;
    schluessel = p.rundung === "angefangen" ? Math.ceil(q) : Math.floor(q);
  }
  return schluessel * p.anzahlProSchluessel + p.anzahlProPreisrichter * preisrichter;
}

export interface VergabePruefung {
  preisart: Preisart;
  punkte: number | null;
  /** Ist die zu vergebende Preisart ein Geldpreis aus dem Standgeld (E, Z)? Bänder und Sachpreise nicht. */
  istGeldpreis: boolean;
  /** Hat der Eintrag schon einen Geldpreis aus dem Standgeld? */
  hatGeldpreis: boolean;
  /** Hat der Eintrag diese Preisart schon? */
  hatDiesePreisart: boolean;
  /** Schon vergeben / verfügbar – für Standgeldpreise je Preisrichter, für Stiftungen gesamt. */
  vergeben: number;
  verfuegbar: number;
}

/** Prüft eine Preisvergabe. Gibt eine Fehlermeldung oder null zurück. */
export function pruefeVergabe(v: VergabePruefung): string | null {
  const { preisart } = v;
  if (v.punkte == null) return "Das Tier hat keine Punktbewertung.";
  if (preisart.mindestpunkte != null && v.punkte < preisart.mindestpunkte) {
    return `${preisart.name} erst ab ${preisart.mindestpunkte} Punkten.`;
  }
  if (v.hatDiesePreisart) return `Das Tier hat bereits ${preisart.name}.`;
  // Je Tier höchstens ein Geldpreis aus dem Standgeld (E oder Z). Bänder und Stiftungen kommen zusätzlich.
  if (v.istGeldpreis && v.hatGeldpreis) return "Das Tier hat bereits einen Geldpreis aus dem Standgeld.";
  if (v.vergeben >= v.verfuegbar) return `Kontingent für ${preisart.name} ist ausgeschöpft (${v.verfuegbar}).`;
  return null;
}

/**
 * Prüft, ob eine Bewertung geändert oder zurückgesetzt werden darf, obwohl das Tier schon Preise hat.
 * `neuePunkte` null heißt: zurückgesetzt oder Sondernote – dann passt kein Preis mehr.
 */
export function pruefeNotenaenderung(neuePunkte: number | null, preise: { name: string; mindestpunkte: number | null }[]): string | null {
  const stoerend = preise.filter((p) => neuePunkte == null || (p.mindestpunkte != null && neuePunkte < p.mindestpunkte));
  if (stoerend.length === 0) return null;
  const namen = stoerend.map((p) => p.name).join(", ");
  return neuePunkte == null
    ? `Das Tier hat schon ${namen}. Bitte zuerst den Preis entfernen.`
    : `${namen} gibt es erst ab ${Math.max(...stoerend.map((p) => p.mindestpunkte ?? 0))} Punkten. Bitte zuerst den Preis entfernen.`;
}

/**
 * Anteil des nächsten gestifteten Preises: der noch nicht vergebene Rest der Stiftung, geteilt durch die freien Plätze
 * (aufgerundet; der letzte Platz bekommt genau den Rest). 20,00 € für 3 Preise: 6,67 + 6,67 + 6,66. Aus dem Rest
 * gerechnet bleibt die Summe auch nach dem Entfernen eines Preises oder einer geänderten Anzahl beim Stiftungsbetrag.
 */
export function stiftungsanteil(restCent: number, freiePlaetze: number): number {
  if (freiePlaetze <= 0 || restCent <= 0) return 0;
  return Math.ceil(restCent / freiePlaetze);
}
