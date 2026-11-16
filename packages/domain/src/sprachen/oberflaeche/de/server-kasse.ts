/**
 * Texte der Oberfläche: serverKasse (Entscheidung 022) – Meldungen des Servers zu Kasse, SEPA, Lastschrift, Kontoauszug, Spenden,
 * Preisen, Bewertung, Einteilung der Preisrichter und Meisterschaften. Der Server schreibt sie deutsch; `serverText()`
 * übersetzt. Allgemeine Meldungen („Tier nicht gefunden.“, „Bitte einen Grund angeben.“, IBAN-Prüfung) stehen in den
 * anderen Gruppen `server*` und werden hier nicht wiederholt.
 */
import { auszahlung, kasse, kassenbuch, sepa, verkauf } from "./server-kasse-geld";
import { lastschrift, spenden } from "./server-kasse-lastschrift";
import { kontoauszug } from "./server-kasse-kontoauszug";
import { bewertung, meisterschaft, preise, preisrichter } from "./server-kasse-preise";

export const serverKasse = { kasse, auszahlung, kassenbuch, sepa, verkauf, lastschrift, spenden, kontoauszug, preise, bewertung, preisrichter, meisterschaft };
