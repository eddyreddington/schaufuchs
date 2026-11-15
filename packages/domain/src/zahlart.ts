/** Zahlarten einer Meldegeld-Zahlung bzw. Auszahlung (Datenbank-Enum „zahlart“) und ihre Beschriftung in Belegen und Auskunft. */
export const ZAHLARTEN = ["ueberweisung", "bar", "sonstige", "karte", "lastschrift"] as const;
export type Zahlart = (typeof ZAHLARTEN)[number];

export const ZAHLART_LABEL: Record<Zahlart, string> = {
  ueberweisung: "Überweisung",
  bar: "bar",
  sonstige: "sonstige",
  karte: "Karte",
  lastschrift: "Lastschrift",
};
