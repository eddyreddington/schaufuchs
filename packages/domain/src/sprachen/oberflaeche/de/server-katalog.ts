/**
 * Texte der Oberfläche: serverKatalog (Entscheidung 022) – Meldungen des Servers zu Eingabeprüfung und Zugang, Hallenplan,
 * Katalog und Einlieferung, Bildern, Stammdaten und Druckvorlagen. Der Server schreibt sie deutsch; `serverText()` übersetzt.
 */
import { halle } from "./server-katalog-halle";
import { katalog } from "./server-katalog-katalog";
import { pruefung } from "./server-katalog-pruefung";
import { stamm } from "./server-katalog-stamm";

export const serverKatalog = { pruefung, halle, katalog, stamm };
