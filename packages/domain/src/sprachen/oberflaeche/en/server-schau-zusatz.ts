import type { OberflaecheTexte } from "..";

export const serverSchauZusatz: OberflaecheTexte["serverSchau"]["zusatz"] = {
  eintragVeraendert: "entry altered",
  inhaltVeraendert: "content altered",
  ketteUnterbrochen: "chain broken",
  vorgaengerFehlt: "predecessor missing (deleted)",
  ketteNeu: "chain restarted",
  inhaltGeleert: "content cleared without a note",
  juengsterVeraendert: "latest entry altered",
  juengsterFehlt: "latest entry missing (deleted)",
  katalogZuLange: "Creating the catalogue took too long.",
  keineBerechtigung: "Not signed in or not permitted.",
  nichtAngemeldet: "Not signed in.",
  vorschauUngueltig: "Invalid details for the preview.",
  fremdeHerkunft: "Foreign origin.",
  anfrageZuGross: "The request is too large.",
  smtpUngueltig: "SMTP_URL is invalid. Please URL-encode special characters in user name or password (e.g. # → %23, / → %2F, ? → %3F, % → %25, @ → %40). Until then, e-mails stay in the outbox.",
};
