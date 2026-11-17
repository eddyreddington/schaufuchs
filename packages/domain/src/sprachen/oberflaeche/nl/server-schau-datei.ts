import type { OberflaecheTexte } from "..";

export const serverSchauDatei: OberflaecheTexte["serverSchau"]["datei"] = {
  nurJson: "Alleen JSON-verzoeken.",
  zuVieleAnfragen: "Te veel verzoeken. Even geduld a.u.b.",
  angabenUngueltig: "Ongeldige gegevens.",
  empfaengerFehlen: "Ontvangers ontbreken.",
  schauFehlt: "Show ontbreekt.",
  keineSepaDatei: "Geen open SEPA-bestand. Maak het eerst aan in de afrekening.",
  abrufeSpaeter: "Te veel verzoeken. Probeer het later opnieuw.",
  katalogNichtVeroeffentlicht: "De catalogus is nog niet gepubliceerd.",
  katalogOnline: (monate: string) => `De catalogus blijft slechts ${monate} maanden na de show online.`,
  katalogWirdErzeugt: "De catalogus wordt opnieuw aangemaakt. Probeer het zo opnieuw.",
  bestaetigungFehlt: "Giftbewijs niet gevonden.",
  abrechnungFehlt: "Afrekening niet gevonden.",
  quittungFehlt: "Kwitantie niet gevonden.",
  kaufbelegFehlt: "Verkoopbon niet gevonden.",
  belegFehlt: "Bon niet gevonden.",
};
