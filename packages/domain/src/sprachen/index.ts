import { formatEuro } from "../geld";
import { franzoesischeZeichen, ohneEszett, umschreiben } from "./umschreiben";
import type { Uebersetzung } from "./uebersetzung";
import { cs } from "./cs";
import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";
import { pl } from "./pl";

/** Sprachen der Oberfläche (Entscheidung 022) und der Seiten und Mails für Aussteller (Entscheidung 020). */
export const SPRACHEN = ["de", "de-CH", "en", "fr", "nl", "pl", "cs"] as const;
export type Sprache = (typeof SPRACHEN)[number];

/** Name jeder Sprache in ihr selbst – so findet jeder die eigene in der Auswahl. */
export const SPRACHNAME: Record<Sprache, string> = {
  de: "Deutsch",
  "de-CH": "Deutsch (Schweiz)",
  en: "English",
  fr: "Français",
  nl: "Nederlands",
  pl: "Polski",
  cs: "Čeština",
};

/** Gebietsschema für Zahlen und Datum. */
export const LOCALE: Record<Sprache, string> = { de: "de-DE", "de-CH": "de-CH", en: "en-GB", fr: "fr-FR", nl: "nl-NL", pl: "pl-PL", cs: "cs-CZ" };

export type Texte = Uebersetzung<typeof de>;

const TEXTE: Record<Sprache, Texte> = {
  de,
  "de-CH": umschreiben(de, ohneEszett),
  en,
  fr: umschreiben(fr, franzoesischeZeichen),
  nl,
  pl,
  cs,
};

export function texte(sprache: Sprache): Texte {
  return TEXTE[sprache];
}

export function istSprache(wert: unknown): wert is Sprache {
  return typeof wert === "string" && (SPRACHEN as readonly string[]).includes(wert);
}

/**
 * Erste passende Sprache aus den Wünschen des Browsers (z. B. navigator.languages): „de-CH“ und „de-LI“ schweizerisch,
 * sonst nach der Grundsprache („fr-CH“ → Französisch, „en-US“ → Englisch). Nichts Passendes: Deutsch.
 */
export function passendeSprache(wuensche: readonly string[]): Sprache {
  for (const w of wuensche) {
    const tag = w.trim().toLowerCase().replace(/_/g, "-");
    if (tag === "de-ch" || tag === "de-li" || tag.startsWith("de-ch-") || tag.startsWith("gsw")) return "de-CH";
    const grund = tag.split(/[-_]/)[0];
    const treffer = SPRACHEN.find((s) => s === grund);
    if (treffer) return treffer;
  }
  return "de";
}

/** Betrag in Euro im Format der Sprache (Deutsch genau wie überall sonst im Programm). */
export function euroIn(cent: number, sprache: Sprache): string {
  if (sprache === "de") return formatEuro(cent);
  return new Intl.NumberFormat(LOCALE[sprache], { style: "currency", currency: "EUR" }).format(cent / 100);
}

/** Datum (JJJJ-MM-TT oder Zeitpunkt) im Format der Sprache, mit Ziffern; ohne Datum „–“. */
export function datumIn(d: string | Date | null | undefined, sprache: Sprache): string {
  if (!d) return "–";
  const date = typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat(LOCALE[sprache], { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export { franzoesischeZeichen, ohneEszett } from "./umschreiben";
export type { Uebersetzung } from "./uebersetzung";
export { oberflaeche, serverText, type OberflaecheTexte } from "./oberflaeche";
