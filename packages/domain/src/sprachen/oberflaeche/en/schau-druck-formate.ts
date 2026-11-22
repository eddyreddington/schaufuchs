import type { OberflaecheTexte } from "..";

export const druckFormate: OberflaecheTexte["schau"]["einstellungen"]["druck"]["formate"] = {
  gespeichert: "Format saved.",
  hilfe: "Help on print formats",
  drucksache: "Printout",
  format: "Format",
  einstellung: "Setting",
  nurAnsehen: "Only administrators change the formats.",
  fest: "fixed",
  katalogGestalten: "Design catalogue",
  hoch: "portrait",
  quer: "landscape",
  din5008: "DIN 5008",
  amtlich: "official form",
  formatWahl: "Choose format",
  katalog: {
    A5: "A5 portrait (booklet)",
    A4: "A4 portrait",
  },
  sachen: {
    aBogen: "Form A (entry form)",
    bBogen: "Form B with ring cards",
    katalog: "Catalogue",
    bewertungskarten: "Judging cards",
    bewertungsliste: "Judging list",
    verpflichtung: "Judge engagement letter",
    preisverteilung: "Prize allocation",
    meisterschaften: "Championships",
    kaufbeleg: "Sales receipt with collection slip",
    kassenbeleg: "Cash receipts and donation receipt",
    kassenbericht: "Cash report",
    abrechnung: "Settlement and receipt",
    abrechnungListe: "Settlement of all exhibitors",
    zuwendung: "Donation receipt (tax)",
    serienbrief: "Circular letter",
    amtslisten: "Lists for the veterinary office",
    hallenplan: "Hall plan",
    aufbauliste: "Set-up list",
  },
  wahl: {
    bewertungsliste: {
      A4: "A4 portrait, two lists side by side",
      A5: "A5 portrait, one list per page",
    },
    hallenplan: {
      A4: "A4, one sheet",
      A3: "A3, one sheet",
    },
    kaufbeleg: {
      A5: "A5 landscape",
      A4: "A4 portrait, receipt at the top with cutting line",
    },
    kassenbeleg: {
      A5: "A5 landscape",
      A4: "A4 portrait, receipt at the top with cutting line",
    },
  },
};
