/**
 * Fehlertexte der Datei-Adressen (apps/server/src/datei-*.ts, `c.text("…", 4xx)`), übersetzt vom Server in
 * datei-sprache.ts (Entscheidung 022) – Teil von serverSchau.
 */
export const serverSchauDatei = {
  nurJson: "Nur JSON-Anfragen.",
  zuVieleAnfragen: "Zu viele Anfragen. Bitte kurz warten.",
  angabenUngueltig: "Ungültige Angaben.",
  empfaengerFehlen: "Empfänger fehlen.",
  schauFehlt: "Schau fehlt.",
  keineSepaDatei: "Keine offene SEPA-Datei. Bitte zuerst in der Abrechnung erstellen.",
  abrufeSpaeter: "Zu viele Abrufe. Bitte später noch einmal.",
  katalogNichtVeroeffentlicht: "Der Katalog ist noch nicht veröffentlicht.",
  katalogOnline: (monate: string) => `Der Katalog steht nur ${monate} Monate nach der Schau im Internet.`,
  katalogWirdErzeugt: "Der Katalog wird gerade neu erzeugt. Bitte gleich noch einmal versuchen.",
  bestaetigungFehlt: "Bestätigung nicht gefunden.",
  abrechnungFehlt: "Abrechnung nicht gefunden.",
  quittungFehlt: "Quittung nicht gefunden.",
  kaufbelegFehlt: "Kaufbeleg nicht gefunden.",
  belegFehlt: "Beleg nicht gefunden.",
};
