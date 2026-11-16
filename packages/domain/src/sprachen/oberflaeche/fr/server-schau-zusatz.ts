import type { OberflaecheTexte } from "..";

export const serverSchauZusatz: OberflaecheTexte["serverSchau"]["zusatz"] = {
  eintragVeraendert: "entrée modifiée",
  inhaltVeraendert: "contenu modifié",
  ketteUnterbrochen: "chaîne interrompue",
  vorgaengerFehlt: "prédécesseur manquant (supprimé)",
  ketteNeu: "chaîne recommencée",
  inhaltGeleert: "contenu effacé sans mention",
  juengsterVeraendert: "dernière entrée modifiée",
  juengsterFehlt: "dernière entrée manquante (supprimée)",
  katalogZuLange: "La création du catalogue a pris trop de temps.",
  keineBerechtigung: "Non connecté ou pas d’autorisation.",
  nichtAngemeldet: "Non connecté.",
  vorschauUngueltig: "Données non valables pour l’aperçu.",
  fremdeHerkunft: "Origine étrangère.",
  anfrageZuGross: "La requête est trop volumineuse.",
  smtpUngueltig: "SMTP_URL n’est pas valable. Veuillez encoder pour URL les caractères spéciaux du nom d’utilisateur ou du mot de passe (p. ex. # → %23, / → %2F, ? → %3F, % → %25, @ → %40). D’ici là, les e-mails restent dans la boîte d’envoi.",
};
