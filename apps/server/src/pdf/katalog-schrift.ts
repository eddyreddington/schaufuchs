/**
 * Schrift des Katalogs (Entscheidung 032): eine Familie – die gewählte – in drei Schnitten, dazu höchstens die
 * Auszeichnung für den Namen der Schau auf der Titelseite. Welche Dateien das sind, bestimmt @schau/domain
 * (katalog-typografie.ts). Briefe, Belege und Karten nutzen weiter `registriereSchriften` aus basis.ts.
 */
import { KATALOG_ZIFFERN, katalogSchriftsatz, type KatalogSchrift } from "@schau/domain";
import { type Doc, SANS, SANS_FETT, SANS_KURSIV, SERIF, SERIF_FETT, SERIF_KURSIV, schriftDatei } from "./basis";

export const NORMAL = "Katalog";
export const FETT = "Katalog-Fett";
export const KURSIV = "Katalog-Kursiv";
/** Name der Schau auf der Titelseite: die Auszeichnung der Wahl, sonst die Familie (normal). */
export const AUSZEICHNUNG = "Katalog-Titel";
/** Gleich breite Ziffern für Katalognummern, Noten und Preise (Spalten fluchten). */
export const ZIFFERN = { features: [...KATALOG_ZIFFERN] };

export function registriereKatalogSchrift(doc: Doc, schrift: KatalogSchrift) {
  const satz = katalogSchriftsatz(schrift);
  doc.registerFont(NORMAL, schriftDatei(satz.normal));
  doc.registerFont(FETT, schriftDatei(satz.fett));
  doc.registerFont(KURSIV, schriftDatei(satz.kursiv));
  doc.registerFont(AUSZEICHNUNG, schriftDatei(satz.titel ?? satz.normal));
  // Hilfen aus basis.ts (z. B. textImFeld ohne Angabe) greifen auf die allgemeinen Rollen zurück: auch sie in der
  // Familie, damit nie eine fremde Schrift oder Helvetica in den Katalog gerät.
  for (const [rolle, datei] of [[SERIF, satz.normal], [SERIF_FETT, satz.fett], [SERIF_KURSIV, satz.kursiv], [SANS, satz.normal], [SANS_FETT, satz.fett], [SANS_KURSIV, satz.kursiv]] as const) {
    doc.registerFont(rolle, schriftDatei(datei));
  }
  doc.font(NORMAL);
}
