/**
 * Texte der ganzen Oberfläche – Anmeldung, Verwaltung, Helfer, Preisrichter-Tablet – in allen Sprachen (Entscheidung 022).
 * Deutsch (`de/`) ist die Grundlage; jede Übersetzung hat über den Typ genau dieselben Schlüssel. Schweiz und Französisch
 * entstehen wie bei den Aussteller-Texten (020) durch Umschreibung. Meldungen des Servers übersetzt `serverText()`.
 */
import type { Sprache } from "..";
import type { Uebersetzung } from "../uebersetzung";
import { franzoesischeZeichen, ohneEszett, umschreiben } from "../umschreiben";
import { deOberflaeche } from "./de";

export type OberflaecheTexte = Uebersetzung<typeof deOberflaeche>;

/**
 * Übersetzungen werden erst bei Bedarf geladen (eigene Teile im Web-Bundle; Deutsch ist immer da). Vor der ersten
 * Verwendung einer Sprache `ladeOberflaeche()` abwarten – `SpracheRahmen` tut das, Tests über `ladeAlleOberflaechen()`.
 */
const LADEN: Record<Exclude<Sprache, "de" | "de-CH">, () => Promise<OberflaecheTexte>> = {
  en: async () => (await import("./en")).enOberflaeche,
  fr: async () => umschreiben((await import("./fr")).frOberflaeche, franzoesischeZeichen),
  nl: async () => (await import("./nl")).nlOberflaeche,
  pl: async () => (await import("./pl")).plOberflaeche,
  cs: async () => (await import("./cs")).csOberflaeche,
};
const fertig = new Map<Sprache, OberflaecheTexte>([["de", deOberflaeche]]);

/** Ist die Sprache geladen (Deutsch und Schweiz immer)? */
export function oberflaecheGeladen(sprache: Sprache): boolean {
  return sprache === "de-CH" || fertig.has(sprache);
}

/** Texte einer Sprache laden (einmal; danach sofort). */
export async function ladeOberflaeche(sprache: Sprache): Promise<void> {
  if (oberflaecheGeladen(sprache)) return;
  fertig.set(sprache, await LADEN[sprache as keyof typeof LADEN]());
}

/** Alle Sprachen laden (Tests, Prüfwerkzeuge). */
export async function ladeAlleOberflaechen(): Promise<void> {
  await Promise.all((Object.keys(LADEN) as Sprache[]).map(ladeOberflaeche));
}

/** Texte der Oberfläche in einer Sprache; noch nicht geladene Sprachen vorerst deutsch. */
export function oberflaeche(sprache: Sprache): OberflaecheTexte {
  if (sprache === "de-CH" && !fertig.has("de-CH")) fertig.set("de-CH", umschreiben(deOberflaeche, ohneEszett));
  return fertig.get(sprache) ?? deOberflaeche;
}

export { serverText } from "./server";

const rueck = new Map<Sprache, Map<string, string>>();
/**
 * Fester Text der Oberfläche zurück auf Deutsch (z. B. ein Name eines Bearbeitungsschritts, der ins Protokoll geht – das
 * Protokoll bleibt deutsch). Nur für Texte ohne Platzhalter; Unbekanntes bleibt, wie es ist.
 */
export function aufDeutsch(text: string, sprache: Sprache): string {
  if (sprache === "de" || !oberflaecheGeladen(sprache)) return text;
  let m = rueck.get(sprache);
  if (!m) {
    const karte = new Map<string, string>();
    const lauf = (w: unknown, de: unknown) => {
      if (typeof w === "string" && typeof de === "string") karte.has(w) || karte.set(w, de);
      else if (w && typeof w === "object" && de && typeof de === "object")
        for (const [k, v] of Object.entries(w)) lauf(v, (de as Record<string, unknown>)[k]);
    };
    lauf(oberflaeche(sprache), deOberflaeche);
    rueck.set(sprache, (m = karte));
  }
  return m.get(text) ?? text;
}
