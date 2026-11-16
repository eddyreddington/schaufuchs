/**
 * Meldungen des Servers zum Kontoauszug-Import (routers/kontoauszug.ts, Entscheidung 023) – Teil von serverKasse
 * (Entscheidung 022). Allgemeine Meldungen („Die Datei ist leer.“, offene Lastschriftdatei) stehen in anderen Gruppen.
 */
export const kontoauszug = {
  zuGross: "Die Datei ist zu groß (höchstens 4 MB).",
  zuViele: (max: string) => `Zu viele Gutschriften (höchstens ${max}). Bitte einen kürzeren Zeitraum exportieren.`,
  postenFehlt: "Ein Posten steht nicht in dieser Datei. Bitte die Datei erneut prüfen.",
  /** Gründe für übersprungene Gutschriften (Liste „übersprungen“ der Seite). */
  nichtOffen: "Meldung nicht offen oder bestätigt",
  schonGebucht: "schon gebucht",
  andersBezahlt: "inzwischen anders bezahlt – bitte neu prüfen",
};
