/**
 * Kalendertage in deutscher Zeit (Europe/Berlin), als JJJJ-MM-TT. Der Server läuft in UTC: zwischen Mitternacht und
 * 1 bzw. 2 Uhr wäre „heute“ in UTC noch gestern. Alle Stellen, die einen Tag brauchen (Fristen, Kassentag, Fälligkeit),
 * nehmen diese Funktionen.
 */
const TAG_BERLIN = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });

/** Kalendertag eines Zeitpunkts in deutscher Zeit. */
export function tagBerlin(zeitpunkt: Date): string {
  return TAG_BERLIN.format(zeitpunkt);
}

/** TT.MM.JJJJ aus JJJJ-MM-TT (für Meldungen und Belege). */
export function datumKurz(iso: string): string {
  return iso.split("-").reverse().join(".");
}

/** Heutiger Kalendertag in deutscher Zeit. */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return tagBerlin(jetzt);
}
