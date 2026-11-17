import type { OberflaecheTexte } from "..";

export const kontoauszug: OberflaecheTexte["serverKasse"]["kontoauszug"] = {
  zuGross: "Le fichier est trop volumineux (4 MB au maximum).",
  zuViele: (max: string) => `Trop de crédits (${max} au maximum). Veuillez exporter une période plus courte.`,
  postenFehlt: "Un poste ne figure pas dans ce fichier. Veuillez vérifier le fichier à nouveau.",
  nichtOffen: "Inscription ni en attente ni confirmée",
  schonGebucht: "déjà comptabilisé",
  andersBezahlt: "payé autrement entre-temps – veuillez vérifier à nouveau",
  keinCamt: "Ce n’est pas un relevé de compte au format camt.053.",
  unbekanntesFormat: "Format inconnu : les colonnes « Buchungstag » (date de comptabilisation) et « Betrag » (montant) manquent dans le fichier. Veuillez importer l’export des opérations au format CSV ou camt.053 (XML).",
  nichtLesbar: "Le fichier n’a pas pu être lu.",
};
