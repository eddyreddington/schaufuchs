import type { OberflaecheTexte } from "..";

type T = OberflaecheTexte["serverKasse"];

export const kasse: T["kasse"] = {
  abgeschlossenKorrektur: "The show is closed – for corrections, first go back to the settlement with a reason.",
  abgerechnetReklamation: (nr: string) =>
    `Exhibitor has already been settled (voucher ${nr}). As a complaint only by the show management with a reason – the difference then appears as such.`,
  abgerechnetGesperrt: (nr: string) => `Exhibitor has already been settled (voucher ${nr}). Sales, cancellations and prizes are locked after that.`,
  inSepaDatei: "Exhibitor is in the open SEPA file. Book or discard the file first.",
  lastschriftOffen: "Entry fee is in the open direct debit file – book or discard it first.",
  kassenbestand: (soll: string, danach: string) => `According to the cash book there is only ${soll} € in the cash box – afterwards it would be ${danach} €.`,
  kassenbestandHolen: (text: string) => `${text} Please check the amount or call the show management.`,
  kassenbestandTrotzdem: (text: string) => `${text} Book anyway?`,
};

export const auszahlung: T["auszahlung"] = {
  abPhaseSchau: "Payouts start in the “Show” stage. Book entry fee refunds on the entry before that.",
  ueberweisungNurAL: "Bank transfers are booked by the show management (administrators).",
  bereitsAbgerechnet: (nr: string) => `Already settled (voucher ${nr}).`,
  ibanFehlt: "The exhibitor’s IBAN is missing for a bank transfer – please add it to the entry or pay out in cash.",
  betragGeaendert: (jetzt: string, vorher: string) => `The amount has changed: now ${jetzt} instead of ${vorher}. Please reload the page and check.`,
  nachzahlungNurAL: "Additional payments and claims are booked by the show management (administrators).",
  rueckforderungEingang: "Only book a claim by bank transfer once the money has arrived in the club account.",
  auszahlungFehlt: "Payout not found.",
  quittungStorniert: (nr: string) => `Voucher ${nr} has already been cancelled.`,
  spaetereQuittung: (nr: string) => `Cancel the later voucher ${nr} first.`,
};

export const kassenbuch: T["kassenbuch"] = {
  abgeschlossen: "The show is closed – no more cash book entries.",
  zweck: "For a withdrawal, please state the purpose (e.g. “Bank deposit”).",
  entnahmeNurAL: "Withdrawals are booked by the show management (administrators).",
  kuenftig: "A daily closing for a future day is not possible.",
  schonAbgeschlossen: (datum: string) => `The cash day ${datum} is already closed (no cash entry since).`,
  spaeterAbgeschlossen: "A later cash day is already closed.",
  erstAbschliessen: (datum: string) => `Close the cash day ${datum} first.`,
  keineBewegung: "There was no cash movement on this day.",
  differenz: (ist: string, soll: string) => `Counted ${ist} €, expected ${soll} € – please explain the difference.`,
};

export const sepa: T["sepa"] = {
  ausfuehrungVergangen: "The execution date is in the past.",
  phaseAbrechnung: "The SEPA file belongs to the “Settlement” stage (after the show).",
  vereinskonto: "Please enter the club account in the settings first.",
  schonOffen: "There is already an open SEPA file. Book or discard it first.",
  lastschriftOffen: "There is an open direct debit file. Book or discard it first, then the bank transfers.",
  keineOffenen: "No open bank transfers.",
  nichtMehrOffen: "This SEPA file is no longer open.",
  keineOffenenErstellen: "No open bank transfers. Please create the SEPA file first.",
  auswahlWeicht: "The selection differs from the SEPA file.",
  keineUeberweisungen: "No bank transfers.",
  betragPositiv: (name: string) => `Amount for ${name} must be positive.`,
  ausserhalbEwr: (name: string) => `${name}: account outside the EEA – please pay out in cash or transfer individually.`,
  ibanZeichen: (name: string) => `${name}: The IBAN is incomplete or contains invalid characters.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name}: An IBAN from ${land} has ${soll} characters; this one has ${ist}.`,
  ibanPruefziffer: (name: string) => `${name}: The IBAN check digits are wrong – please check for typing errors.`,
};

export const verkauf: T["verkauf"] = {
  nurAL: "Sales by card or bank transfer only by the show management (otherwise the proceeds would be ready for payout without confirmed receipt of money).",
  phase: "Sales only after judging, while the show is running (stage “Prizes” or “Show”).",
  registriernummer: (hinweis: string) => `Buyer’s registration number invalid: ${hinweis}.`,
  registriernummerHinweis: "12 digits, e.g. 276 06 535 012 0001 (country code 276 may be omitted); numbers from other countries with the country code, e.g. NL …",
  unter16: "Buyer under 16: only with the consent of a parent or guardian (§ 11c TierSchG) – please enter their name.",
  nichtVerkaeuflich: "This animal was not entered for sale.",
  nichtInHalle: "Animal is not in the hall (not delivered or already collected).",
  nichtBewertet: "Animal has not been judged yet – sales only after judging.",
  gesperrt: "Animal is blocked in the health log (sick, suspected or dead) and must not be handed over.",
  bereitsVerkauft: (beleg: string) => `Already sold (receipt ${beleg}).`,
  verkaufFehlt: "Sale not found.",
  schonStorniert: "This sale has already been cancelled.",
  storniert: "The sale has been cancelled.",
  nurUeberweisung: "Only sales by bank transfer need a payment receipt.",
  eingangGebucht: (beleg: string) => `The payment for receipt ${beleg} has already been booked.`,
};
