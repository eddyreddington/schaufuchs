import type { OberflaecheTexte } from "..";

export const serverSchauDatei: OberflaecheTexte["serverSchau"]["datei"] = {
  nurJson: "JSON requests only.",
  zuVieleAnfragen: "Too many requests. Please wait a moment.",
  angabenUngueltig: "Invalid details.",
  empfaengerFehlen: "Recipients are missing.",
  schauFehlt: "Show is missing.",
  keineSepaDatei: "No open SEPA file. Please create it in the settlement first.",
  abrufeSpaeter: "Too many requests. Please try again later.",
  katalogNichtVeroeffentlicht: "The catalogue has not been published yet.",
  katalogOnline: (monate: string) => `The catalogue is only online for ${monate} months after the show.`,
  katalogWirdErzeugt: "The catalogue is being regenerated. Please try again in a moment.",
  bestaetigungFehlt: "Donation receipt not found.",
  abrechnungFehlt: "Settlement not found.",
  quittungFehlt: "Receipt not found.",
  kaufbelegFehlt: "Sales receipt not found.",
  belegFehlt: "Voucher not found.",
};
