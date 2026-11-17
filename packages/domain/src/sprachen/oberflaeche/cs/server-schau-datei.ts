import type { OberflaecheTexte } from "..";

export const serverSchauDatei: OberflaecheTexte["serverSchau"]["datei"] = {
  nurJson: "Pouze požadavky JSON.",
  zuVieleAnfragen: "Příliš mnoho požadavků. Chvíli prosím počkejte.",
  angabenUngueltig: "Neplatné údaje.",
  empfaengerFehlen: "Chybí příjemci.",
  schauFehlt: "Chybí výstava.",
  keineSepaDatei: "Žádný otevřený soubor SEPA. Nejprve jej prosím vytvořte ve vyúčtování.",
  abrufeSpaeter: "Příliš mnoho požadavků. Zkuste to prosím později.",
  katalogNichtVeroeffentlicht: "Katalog ještě není zveřejněn.",
  katalogOnline: (monate: string) => `Katalog zůstává na internetu jen ${monate} měsíců po výstavě.`,
  katalogWirdErzeugt: "Katalog se právě vytváří znovu. Zkuste to prosím za chvíli znovu.",
  bestaetigungFehlt: "Potvrzení o daru nenalezeno.",
  abrechnungFehlt: "Vyúčtování nenalezeno.",
  quittungFehlt: "Stvrzenka nenalezena.",
  kaufbelegFehlt: "Prodejní doklad nenalezen.",
  belegFehlt: "Doklad nenalezen.",
};
