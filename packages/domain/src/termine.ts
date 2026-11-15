/** Wochentag am Anfang einer Angabe: ausgeschrieben oder abgekürzt (mit oder ohne Punkt), großgeschrieben. */
const TAG = "(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\\.?(?=[\\s,]|$)";
const VOR_TAG = new RegExp(`[\\s,]+(?=${TAG})`, "u");

/**
 * Öffnungszeiten als Zeilen, je Tag eine: getrennt an Zeilenumbrüchen und Semikolons, in einer Zeile außerdem vor jedem
 * weiteren Wochentag („Fr. … Uhr Sa. … Uhr“ wird zu zwei Zeilen). Ohne Wochentag bleibt der Text, wie er ist.
 */
export function oeffnungszeitenZeilen(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .flatMap((zeile) => zeile.split(VOR_TAG))
    .map((t) => t.trim().replace(/[,;]\s*$/, "").trim())
    .filter(Boolean);
}
