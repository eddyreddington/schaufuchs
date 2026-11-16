import { formatEuro } from "../geld";
import { cs } from "./cs";
import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";
import { pl } from "./pl";

/** Sprachen der Seiten und Mails für Aussteller (Entscheidung 020). Die Oberfläche des Vereins bleibt deutsch. */
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
const LOCALE: Record<Sprache, string> = { de: "de-DE", "de-CH": "de-CH", en: "en-GB", fr: "fr-FR", nl: "nl-NL", pl: "pl-PL", cs: "cs-CZ" };

/** Jede Übersetzung hat genau die Schlüssel des deutschen Textes; Platzhalter als Funktionen mit denselben Werten. */
type Uebersetzung<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : T[K] extends (...a: infer A) => infer R ? (...a: A) => R : Uebersetzung<T[K]>;
};
export type Texte = Uebersetzung<typeof de>;

/**
 * Wendet `f` auf jeden Text an – bei Texten mit Platzhaltern nur auf den festen Teil: eingesetzte Werte (Schauname,
 * Grund, Adresse) bleiben, wie der Verein sie geschrieben hat. Leere Werte gehen unverändert hinein (Texte prüfen sie).
 */
function umschreiben<T>(wert: T, f: (text: string) => string): T {
  if (typeof wert === "string") return f(wert) as T;
  if (Array.isArray(wert)) return wert.map((x) => umschreiben(x, f)) as T;
  if (typeof wert === "function") {
    return ((...a: unknown[]) => {
      const marke = (i: number) => `\u0000${i}\u0000`;
      const ergebnis = (wert as (...a: unknown[]) => unknown)(...a.map((x, i) => (typeof x === "string" && x ? marke(i) : x)));
      const zurueck = (t: string) => a.reduce<string>((s, x, i) => (typeof x === "string" && x ? s.split(marke(i)).join(x) : s), f(t));
      return Array.isArray(ergebnis) ? ergebnis.map((x) => (typeof x === "string" ? zurueck(x) : x)) : typeof ergebnis === "string" ? zurueck(ergebnis) : ergebnis;
    }) as T;
  }
  if (wert && typeof wert === "object") return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, umschreiben(v, f)])) as T;
  return wert;
}

/** Schweizer Schreibung: wie Deutsch, aber „ss“ statt „ß“. */
export const ohneEszett = (text: string) => text.replace(/ß/g, "ss").replace(/ẞ/g, "SS");

/** Französische Satzzeichen: geschütztes Leerzeichen vor : ; ? ! und innerhalb von « » (kein Umbruch davor). */
export const franzoesischeZeichen = (text: string) => text.replace(/ ([:;?!»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");

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
