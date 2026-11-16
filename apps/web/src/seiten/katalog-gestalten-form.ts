import type { Ausgabe } from "../trpc";

/* Katalog gestalten: Datentypen der Seite und das Formular „Gestaltung“ (was „Speichern“ übernimmt). */

export type Daten = Ausgabe["katalogGestaltung"]["laden"];
export type Beitrag = Daten["beitraege"][number];
export type Art = Beitrag["art"];
type Gestaltung = Daten["gestaltung"];

/** Formular „Gestaltung“: alles, was „Speichern“ übernimmt (Beiträge, Bilder und Termine speichern sofort). */
export function formAus(g: Gestaltung) {
  return {
    format: g.format,
    untertitel: g.untertitel,
    schirmherr: g.schirmherr,
    ausstellungsleitung: g.ausstellungsleitung,
    eintritt: g.eintritt,
    farbe: g.farbe,
    schrift: g.schrift,
    stil: g.stil,
    aufteilung: g.aufteilung,
    rassebilder: g.rassebilder,
    sparteNeueSeite: g.sparteNeueSeite,
    ausgeblendet: g.ausgeblendet,
    druck: g.druck,
    akzent: g.akzent,
    titelHintergrund: g.titelHintergrund,
    titelbild: g.titelbild,
    fusszeile: g.fusszeile,
    linien: g.linien,
  };
}
export type Form = ReturnType<typeof formAus>;
