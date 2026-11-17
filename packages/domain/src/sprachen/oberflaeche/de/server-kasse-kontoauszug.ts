/**
 * Meldungen des Servers zum Kontoauszug-Import (routers/kontoauszug.ts und die dort weitergereichten Fehler der Domain,
 * Entscheidung 023) – Teil von serverKasse (Entscheidung 022). Allgemeine Meldungen („Die Datei ist leer.“, offene
 * Lastschriftdatei) stehen in anderen Gruppen.
 */
export const kontoauszug = {
  zuGross: "Die Datei ist zu groß (höchstens 4 MB).",
  zuViele: (max: string) => `Zu viele Gutschriften (höchstens ${max}). Bitte einen kürzeren Zeitraum exportieren.`,
  postenFehlt: "Ein Posten steht nicht in dieser Datei. Bitte die Datei erneut prüfen.",
  /** Gründe für übersprungene Gutschriften (Liste „übersprungen“ der Seite). */
  nichtOffen: "Meldung nicht offen oder bestätigt",
  schonGebucht: "schon gebucht",
  andersBezahlt: "inzwischen anders bezahlt – bitte neu prüfen",
  /** Fehler beim Lesen der Datei (packages/domain/src/kontoauszug.ts), vom Router weitergereicht. */
  keinCamt: "Das ist kein Kontoauszug im Format camt.053.",
  unbekanntesFormat: "Unbekanntes Format: In der Datei fehlen die Spalten Buchungstag und Betrag. Bitte den Umsatzexport als CSV oder camt.053 (XML) hochladen.",
  nichtLesbar: "Die Datei ließ sich nicht lesen.",
};
