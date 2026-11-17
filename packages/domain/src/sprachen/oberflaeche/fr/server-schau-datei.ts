import type { OberflaecheTexte } from "..";

export const serverSchauDatei: OberflaecheTexte["serverSchau"]["datei"] = {
  nurJson: "Requêtes JSON uniquement.",
  zuVieleAnfragen: "Trop de requêtes. Veuillez patienter un instant.",
  angabenUngueltig: "Indications non valables.",
  empfaengerFehlen: "Les destinataires manquent.",
  schauFehlt: "L’exposition manque.",
  keineSepaDatei: "Aucun fichier SEPA ouvert. Veuillez d’abord le créer dans le décompte.",
  abrufeSpaeter: "Trop de requêtes. Veuillez réessayer plus tard.",
  katalogNichtVeroeffentlicht: "Le catalogue n’est pas encore publié.",
  katalogOnline: (monate: string) => `Le catalogue ne reste en ligne que ${monate} mois après l’exposition.`,
  katalogWirdErzeugt: "Le catalogue est en cours de régénération. Veuillez réessayer dans un instant.",
  bestaetigungFehlt: "Reçu de don introuvable.",
  abrechnungFehlt: "Décompte introuvable.",
  quittungFehlt: "Quittance introuvable.",
  kaufbelegFehlt: "Justificatif de vente introuvable.",
  belegFehlt: "Justificatif introuvable.",
};
