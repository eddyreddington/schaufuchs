/** Umschreibungen der deutschen Grundlage: Schweizer Schreibung und französische Satzzeichen (Entscheidung 020). */

/**
 * Wendet `f` auf jeden Text an – bei Texten mit Platzhaltern nur auf den festen Teil: eingesetzte Werte (Schauname,
 * Grund, Adresse) bleiben, wie der Verein sie geschrieben hat. Leere Werte gehen unverändert hinein (Texte prüfen sie).
 */
export function umschreiben<T>(wert: T, f: (text: string) => string): T {
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

