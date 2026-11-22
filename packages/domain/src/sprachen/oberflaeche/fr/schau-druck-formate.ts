import type { OberflaecheTexte } from "..";

export const druckFormate: OberflaecheTexte["schau"]["einstellungen"]["druck"]["formate"] = {
  gespeichert: "Format enregistré.",
  hilfe: "Aide sur les formats d’impression",
  drucksache: "Document imprimé",
  format: "Format",
  einstellung: "Réglage",
  nurAnsehen: "Seuls les administrateurs modifient les formats.",
  fest: "fixe",
  katalogGestalten: "Mettre en page le catalogue",
  hoch: "portrait",
  quer: "paysage",
  din5008: "DIN 5008",
  amtlich: "modèle officiel",
  formatWahl: "Choisir le format",
  katalog: {
    A5: "A5 portrait (livret)",
    A4: "A4 portrait",
  },
  sachen: {
    aBogen: "Formulaire A (bulletin d’inscription)",
    bBogen: "Formulaire B avec cartes de bague",
    katalog: "Catalogue",
    bewertungskarten: "Cartes de jugement",
    bewertungsliste: "Liste de jugement",
    verpflichtung: "Lettre d’engagement du juge",
    preisverteilung: "Répartition des prix",
    meisterschaften: "Championnats",
    kaufbeleg: "Justificatif d’achat avec bon de retrait",
    kassenbeleg: "Justificatifs de caisse et reçu de don",
    kassenbericht: "Rapport de caisse",
    abrechnung: "Décompte et quittance",
    abrechnungListe: "Décompte de tous les exposants",
    zuwendung: "Reçu de don",
    serienbrief: "Lettre circulaire",
    amtslisten: "Listes pour les services vétérinaires",
    hallenplan: "Plan de salle",
    aufbauliste: "Liste de montage",
  },
  wahl: {
    bewertungsliste: {
      A4: "A4 portrait, deux listes côte à côte",
      A5: "A5 portrait, une liste par page",
    },
    hallenplan: {
      A4: "A4, une feuille",
      A3: "A3, une feuille",
    },
    kaufbeleg: {
      A5: "A5 paysage",
      A4: "A4 portrait, justificatif en haut avec ligne de coupe",
    },
    kassenbeleg: {
      A5: "A5 paysage",
      A4: "A4 portrait, justificatif en haut avec ligne de coupe",
    },
  },
};
