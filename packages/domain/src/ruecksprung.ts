/**
 * Rücksprung nach der Anmeldung: Wer mit abgelaufener Anmeldung einen Direktlink öffnet, landet nach dem Anmelden wieder
 * auf dieser Seite statt auf der Startseite. Nur eigene Seiten der Verwaltung sind erlaubt (kein offener Weiterleiter):
 * Ziel beginnt mit genau einem „/“, ist nicht die Anmeldung selbst und keine öffentliche Seite bzw. kein Preisrichter-Tablet.
 */
export function ruecksprungZiel(ziel: string | null | undefined): string {
  if (!ziel || !ziel.startsWith("/") || ziel.startsWith("//") || ziel.startsWith("/\\")) return "/";
  if (/[\s\\]/.test(ziel.slice(0, 2)) || /^\/(anmelden|s\/|richter\/)/.test(ziel)) return "/";
  return ziel;
}

/** Adresse der Anmeldeseite mit dem Ziel `?weiter=…` (Pfad und Suche der aktuellen Seite). */
export function anmeldeZiel(pfad: string, suche: string): string {
  const ziel = ruecksprungZiel(pfad + suche);
  return ziel === "/" ? "/anmelden" : `/anmelden?weiter=${encodeURIComponent(ziel)}`;
}
