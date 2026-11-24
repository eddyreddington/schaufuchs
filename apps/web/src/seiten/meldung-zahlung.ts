import { gefordertCent } from "@schau/domain";

type Betrag = { summeCent: number; stiftungCent: number; spendeCent: number; bezahltCent: number };

/** Offener Betrag einer Meldung, wie die Seite ihn anzeigt (negativ: Guthaben). */
export function offenCent(b: Betrag): number {
  return gefordertCent(b) - b.bezahltCent;
}

/**
 * Was das Zahlungsformular der Meldungsseite sendet. Immer mit dem angezeigten offenen Betrag: Hat inzwischen jemand
 * kassiert (zweiter Helfer, erneuter Klick nach verlorener Antwort), lehnt der Server ab, statt doppelt zu buchen
 * (Entscheidung 033, wie an der Einlieferung).
 */
export function zahlungAuftrag<A extends string>(a: { meldungId: number; betragCent: number; datum: string; art: A; grund: string; betrag: Betrag }) {
  return { meldungId: a.meldungId, betragCent: a.betragCent, datum: a.datum, art: a.art, grund: a.grund, erwartetOffenCent: offenCent(a.betrag) };
}
