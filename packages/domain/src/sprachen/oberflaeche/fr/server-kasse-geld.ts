import type { OberflaecheTexte } from "..";

type T = OberflaecheTexte["serverKasse"];

export const kasse: T["kasse"] = {
  abgeschlossenKorrektur: "L’exposition est clôturée – pour une correction, revenir d’abord au décompte avec un motif.",
  abgerechnetReklamation: (nr: string) =>
    `Le décompte de l’exposant est déjà fait (quittance ${nr}). En réclamation uniquement par la direction de l’exposition avec un motif – l’écart apparaît alors comme différence.`,
  abgerechnetGesperrt: (nr: string) => `Le décompte de l’exposant est déjà fait (quittance ${nr}). Ventes, annulations et prix sont ensuite bloqués.`,
  inSepaDatei: "L’exposant figure dans le fichier SEPA ouvert. Comptabiliser ou rejeter d’abord le fichier.",
  lastschriftOffen: "Les frais d’inscription figurent dans le fichier de prélèvement ouvert – le comptabiliser ou le rejeter d’abord.",
  kassenbestand: (soll: string, danach: string) => `Selon le livre de caisse, il n’y a que ${soll} € en caisse – ensuite il y aurait ${danach} €.`,
  kassenbestandHolen: (text: string) => `${text} Veuillez vérifier le montant ou appeler la direction de l’exposition.`,
  kassenbestandTrotzdem: (text: string) => `${text} Comptabiliser quand même ?`,
};

export const auszahlung: T["auszahlung"] = {
  abPhaseSchau: "Les paiements commencent à l’étape « Exposition ». Comptabiliser auparavant les remboursements des frais d’inscription sur l’inscription.",
  ueberweisungNurAL: "Les virements sont comptabilisés par la direction de l’exposition (administrateurs).",
  bereitsAbgerechnet: (nr: string) => `Décompte déjà fait (quittance ${nr}).`,
  ibanFehlt: "L’IBAN de l’exposant manque pour un virement – veuillez l’enregistrer sur l’inscription ou payer en espèces.",
  betragGeaendert: (jetzt: string, vorher: string) => `Le montant a changé : maintenant ${jetzt} au lieu de ${vorher}. Veuillez recharger la page et vérifier.`,
  nachzahlungNurAL: "Les paiements complémentaires et les remboursements dus sont comptabilisés par la direction de l’exposition (administrateurs).",
  rueckforderungEingang: "Ne comptabiliser un remboursement dû par virement qu’une fois l’argent arrivé sur le compte du club.",
  auszahlungFehlt: "Paiement introuvable.",
  quittungStorniert: (nr: string) => `La quittance ${nr} est déjà annulée.`,
  spaetereQuittung: (nr: string) => `Annuler d’abord la quittance ultérieure ${nr}.`,
};

export const kassenbuch: T["kassenbuch"] = {
  abgeschlossen: "L’exposition est clôturée – plus d’écritures de caisse.",
  zweck: "Pour un retrait, veuillez indiquer l’objet (p. ex. « Versement à la banque »).",
  entnahmeNurAL: "Les retraits sont comptabilisés par la direction de l’exposition (administrateurs).",
  kuenftig: "Une clôture journalière pour un jour futur n’est pas possible.",
  schonAbgeschlossen: (datum: string) => `La journée de caisse du ${datum} est déjà clôturée (aucune écriture en espèces depuis).`,
  spaeterAbgeschlossen: "Une journée de caisse ultérieure est déjà clôturée.",
  erstAbschliessen: (datum: string) => `Clôturer d’abord la journée de caisse du ${datum}.`,
  keineBewegung: "Il n’y a eu aucun mouvement d’espèces ce jour-là.",
  differenz: (ist: string, soll: string) => `Compté ${ist} €, attendu ${soll} € – veuillez expliquer la différence.`,
};

export const sepa: T["sepa"] = {
  ausfuehrungVergangen: "La date d’exécution est dans le passé.",
  phaseAbrechnung: "Le fichier SEPA relève de l’étape « Décompte » (après l’exposition).",
  vereinskonto: "Veuillez d’abord saisir le compte du club dans les paramètres.",
  schonOffen: "Il y a déjà un fichier SEPA ouvert. Le comptabiliser ou le rejeter d’abord.",
  lastschriftOffen: "Il y a un fichier de prélèvement ouvert. Le comptabiliser ou le rejeter d’abord, puis les virements.",
  keineOffenen: "Aucun virement en attente.",
  nichtMehrOffen: "Ce fichier SEPA n’est plus ouvert.",
  keineOffenenErstellen: "Aucun virement en attente. Veuillez d’abord créer le fichier SEPA.",
  auswahlWeicht: "La sélection diffère du fichier SEPA.",
  keineUeberweisungen: "Aucun virement.",
  betragPositiv: (name: string) => `Le montant pour ${name} doit être positif.`,
  ausserhalbEwr: (name: string) => `${name} : compte hors de l’EEE – veuillez payer en espèces ou virer individuellement.`,
  ibanZeichen: (name: string) => `${name} : L’IBAN est incomplet ou contient des caractères non valables.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name} : Un IBAN de ${land} comporte ${soll} caractères, celui-ci en a ${ist}.`,
  ibanPruefziffer: (name: string) => `${name} : La clé de contrôle de l’IBAN est incorrecte – veuillez vérifier les fautes de frappe.`,
};

export const verkauf: T["verkauf"] = {
  nurAL: "Vente par carte ou virement uniquement par la direction de l’exposition (sinon le produit serait disponible au paiement sans encaissement confirmé).",
  phase: "Vente seulement après le jugement, tant que l’exposition est en cours (étape « Prix » ou « Exposition »).",
  registriernummer: (hinweis: string) => `Numéro d’enregistrement de l’acheteur non valable : ${hinweis}.`,
  registriernummerHinweis: "12 chiffres, p. ex. 276 06 535 012 0001 (le code pays 276 peut être omis) ; numéros étrangers avec le code du pays, p. ex. NL …",
  unter16: "Acheteur de moins de 16 ans : uniquement avec le consentement d’un représentant légal (§ 11c TierSchG) – veuillez indiquer son nom.",
  nichtVerkaeuflich: "Cet animal n’a pas été inscrit à la vente.",
  nichtInHalle: "L’animal n’est pas dans la salle (pas enlogé ou déjà délogé).",
  nichtBewertet: "L’animal n’est pas encore jugé – la vente n’a lieu qu’après le jugement.",
  gesperrt: "L’animal est bloqué dans le journal sanitaire (malade, suspect ou mort) et ne doit pas être remis.",
  bereitsVerkauft: (beleg: string) => `Déjà vendu (justificatif ${beleg}).`,
  verkaufFehlt: "Vente introuvable.",
  schonStorniert: "Cette vente est déjà annulée.",
  storniert: "La vente est annulée.",
  nurUeberweisung: "Seules les ventes par virement nécessitent un encaissement.",
  eingangGebucht: (beleg: string) => `L’encaissement du justificatif ${beleg} est déjà comptabilisé.`,
};
