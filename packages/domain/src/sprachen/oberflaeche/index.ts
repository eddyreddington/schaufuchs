/**
 * Texte der ganzen Oberfläche – Anmeldung, Verwaltung, Helfer, Preisrichter-Tablet – in allen Sprachen (Entscheidung 022).
 * Deutsch (`de/`) ist die Grundlage; jede Übersetzung hat über den Typ genau dieselben Schlüssel. Schweiz und Französisch
 * entstehen wie bei den Aussteller-Texten (020) durch Umschreibung. Meldungen des Servers übersetzt `serverText()`.
 */
import type { Sprache } from "..";
import type { Uebersetzung } from "../uebersetzung";
import { franzoesischeZeichen, ohneEszett, umschreiben } from "../umschreiben";
import { csOberflaeche } from "./cs";
import { deOberflaeche } from "./de";
import { enOberflaeche } from "./en";
import { frOberflaeche } from "./fr";
import { nlOberflaeche } from "./nl";
import { plOberflaeche } from "./pl";

export type OberflaecheTexte = Uebersetzung<typeof deOberflaeche>;

const ROH: Record<Sprache, () => OberflaecheTexte> = {
  de: () => deOberflaeche,
  "de-CH": () => umschreiben(deOberflaeche, ohneEszett),
  en: () => enOberflaeche,
  fr: () => umschreiben(frOberflaeche, franzoesischeZeichen),
  nl: () => nlOberflaeche,
  pl: () => plOberflaeche,
  cs: () => csOberflaeche,
};
const fertig = new Map<Sprache, OberflaecheTexte>();

/** Texte der Oberfläche in einer Sprache (einmal aufbereitet, dann aus dem Speicher). */
export function oberflaeche(sprache: Sprache): OberflaecheTexte {
  let t = fertig.get(sprache);
  if (!t) fertig.set(sprache, (t = ROH[sprache]()));
  return t;
}

export { serverText } from "./server";

const rueck = new Map<Sprache, Map<string, string>>();
/**
 * Fester Text der Oberfläche zurück auf Deutsch (z. B. ein Name eines Bearbeitungsschritts, der ins Protokoll geht – das
 * Protokoll bleibt deutsch). Nur für Texte ohne Platzhalter; Unbekanntes bleibt, wie es ist.
 */
export function aufDeutsch(text: string, sprache: Sprache): string {
  if (sprache === "de") return text;
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
