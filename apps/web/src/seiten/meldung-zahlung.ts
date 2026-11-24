/**
 * Was das Zahlungsformular der Meldungsseite sendet. Immer mit dem angezeigten offenen Betrag: Hat inzwischen jemand
 * kassiert (zweiter Helfer, erneuter Klick nach verlorener Antwort), lehnt der Server ab, statt doppelt zu buchen
 * (Entscheidung 033, wie an der Einlieferung).
 */
export function zahlungAuftrag<A extends string>(a: { meldungId: number; betragCent: number; datum: string; art: A; grund: string; angezeigtOffenCent: number }) {
  return { meldungId: a.meldungId, betragCent: a.betragCent, datum: a.datum, art: a.art, grund: a.grund, erwartetOffenCent: a.angezeigtOffenCent };
}
