import type { OberflaecheTexte } from "..";

export const druckFormate: OberflaecheTexte["schau"]["einstellungen"]["druck"]["formate"] = {
  gespeichert: "Formaat opgeslagen.",
  hilfe: "Hulp bij afdrukformaten",
  drucksache: "Drukwerk",
  format: "Formaat",
  einstellung: "Instelling",
  nurAnsehen: "Alleen beheerders wijzigen de formaten.",
  fest: "vast",
  katalogGestalten: "Catalogus vormgeven",
  hoch: "staand",
  quer: "liggend",
  din5008: "DIN 5008",
  amtlich: "officieel model",
  formatWahl: "Formaat kiezen",
  katalog: {
    A5: "A5 staand (boekje)",
    A4: "A4 staand",
  },
  sachen: {
    aBogen: "A-formulier (inschrijfformulier)",
    bBogen: "B-formulier met ringkaarten",
    katalog: "Catalogus",
    bewertungskarten: "Keurkaarten",
    bewertungsliste: "Keurlijst",
    verpflichtung: "Verbintenis keurmeester",
    preisverteilung: "Prijsverdeling",
    meisterschaften: "Kampioenschappen",
    kaufbeleg: "Aankoopbewijs met afhaalbon",
    kassenbeleg: "Kasbewijzen en ontvangstbewijs gift",
    kassenbericht: "Kasrapport",
    abrechnung: "Afrekening en kwitantie",
    abrechnungListe: "Afrekening van alle inzenders",
    zuwendung: "Giftbewijs",
    serienbrief: "Rondschrijven",
    amtslisten: "Lijsten voor de veterinaire dienst",
    hallenplan: "Halplan",
    aufbauliste: "Opbouwlijst",
  },
  wahl: {
    bewertungsliste: {
      A4: "A4 staand, twee lijsten naast elkaar",
      A5: "A5 staand, één lijst per pagina",
    },
    hallenplan: {
      A4: "A4, één vel",
      A3: "A3, één vel",
    },
    kaufbeleg: {
      A5: "A5 liggend",
      A4: "A4 staand, bewijs bovenaan met snijlijn",
    },
    kassenbeleg: {
      A5: "A5 liggend",
      A4: "A4 staand, bewijs bovenaan met snijlijn",
    },
  },
};
