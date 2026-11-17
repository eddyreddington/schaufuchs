import type { OberflaecheTexte } from "..";

type T = OberflaecheTexte["serverKasse"];

export const kasse: T["kasse"] = {
  abgeschlossenKorrektur: "De show is afgesloten – voor correcties eerst met een reden terug naar de afrekening.",
  abgerechnetReklamation: (nr: string) =>
    `Inzender is al afgerekend (kwitantie ${nr}). Als reclamatie alleen door de showleiding met een reden – het verschil verschijnt dan als differentie.`,
  abgerechnetGesperrt: (nr: string) => `Inzender is al afgerekend (kwitantie ${nr}). Verkoop, storno en prijzen zijn daarna geblokkeerd.`,
  inSepaDatei: "Inzender staat in het open SEPA-bestand. Eerst het bestand boeken of verwerpen.",
  lastschriftOffen: "Inschrijfgeld staat in het open incassobestand – eerst boeken of verwerpen.",
  kassenbestand: (soll: string, danach: string) => `Volgens het kasboek zit er maar ${soll} € in de kassa – daarna zou het ${danach} € zijn.`,
  kassenbestandHolen: (text: string) => `${text} Controleer het bedrag of haal de showleiding erbij.`,
  kassenbestandTrotzdem: (text: string) => `${text} Toch boeken?`,
};

export const auszahlung: T["auszahlung"] = {
  abPhaseSchau: "Uitbetaald wordt vanaf de fase „Show”. Terugbetalingen van inschrijfgeld daarvoor bij de inschrijving boeken.",
  ueberweisungNurAL: "Overschrijvingen boekt de showleiding (beheerders).",
  bereitsAbgerechnet: (nr: string) => `Al afgerekend (kwitantie ${nr}).`,
  ibanFehlt: "Voor een overschrijving ontbreekt de IBAN van de inzender – vul die in bij de inschrijving of betaal contant uit.",
  betragGeaendert: (jetzt: string, vorher: string) => `Het bedrag is gewijzigd: nu ${jetzt} in plaats van ${vorher}. Laad de pagina opnieuw en controleer.`,
  nachzahlungNurAL: "Nabetalingen en terugvorderingen boekt de showleiding (beheerders).",
  rueckforderungEingang: "Een terugvordering per overschrijving pas boeken als het geld op de rekening van de vereniging is ontvangen.",
  auszahlungFehlt: "Uitbetaling niet gevonden.",
  quittungStorniert: (nr: string) => `Kwitantie ${nr} is al geannuleerd.`,
  spaetereQuittung: (nr: string) => `Eerst de latere kwitantie ${nr} annuleren.`,
};

export const kassenbuch: T["kassenbuch"] = {
  abgeschlossen: "De show is afgesloten – geen kasboekingen meer.",
  zweck: "Vermeld bij een opname het doel (bijv. „Storting bank”).",
  entnahmeNurAL: "Opnames boekt de showleiding (beheerders).",
  kuenftig: "Een dagafsluiting voor een toekomstige dag is niet mogelijk.",
  schonAbgeschlossen: (datum: string) => `De kasdag ${datum} is al afgesloten (sindsdien geen contante boeking).`,
  spaeterAbgeschlossen: "Een latere kasdag is al afgesloten.",
  erstAbschliessen: (datum: string) => `Eerst de kasdag ${datum} afsluiten.`,
  keineBewegung: "Op deze dag was er geen contante beweging.",
  differenz: (ist: string, soll: string) => `Geteld ${ist} €, verwacht ${soll} € – verklaar het verschil.`,
};

export const sepa: T["sepa"] = {
  ausfuehrungVergangen: "De uitvoeringsdatum ligt in het verleden.",
  phaseAbrechnung: "Het SEPA-bestand hoort bij de fase „Afrekening” (na de show).",
  vereinskonto: "Vul eerst de rekening van de vereniging in bij de instellingen.",
  schonOffen: "Er is al een open SEPA-bestand. Eerst boeken of verwerpen.",
  lastschriftOffen: "Er is een open incassobestand. Eerst boeken of verwerpen, dan de overschrijvingen.",
  keineOffenen: "Geen openstaande overschrijvingen.",
  nichtMehrOffen: "Dit SEPA-bestand is niet meer open.",
  keineOffenenErstellen: "Geen openstaande overschrijvingen. Maak eerst het SEPA-bestand aan.",
  auswahlWeicht: "De selectie wijkt af van het SEPA-bestand.",
  keineUeberweisungen: "Geen overschrijvingen.",
  vereinskontoName: "Verenigingsrekening",
  betragPositiv: (name: string) => `Het bedrag voor ${name} moet positief zijn.`,
  ausserhalbEwr: (name: string) => `${name}: rekening buiten de EER – contant uitbetalen of afzonderlijk overmaken.`,
  ibanZeichen: (name: string) => `${name}: De IBAN is onvolledig of bevat ongeldige tekens.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name}: Een IBAN uit ${land} heeft ${soll} tekens, deze heeft er ${ist}.`,
  ibanPruefziffer: (name: string) => `${name}: Het controlegetal van de IBAN klopt niet – controleer op typefouten.`,
};

export const verkauf: T["verkauf"] = {
  nurAL: "Verkoop per kaart of overschrijving alleen door de showleiding (anders stond de opbrengst klaar voor uitbetaling zonder bevestigde ontvangst van het geld).",
  phase: "Verkoop pas na de keuring, zolang de show loopt (fase „Prijzen” of „Show”).",
  registriernummer: (hinweis: string) => `Registratienummer van de koper ongeldig: ${hinweis}.`,
  registriernummerHinweis: "12 cijfers, bijv. 276 06 535 012 0001 (landcode 276 mag ontbreken); buitenlandse nummers met landcode, bijv. NL …",
  unter16: "Koper jonger dan 16: alleen met toestemming van een ouder of voogd (§ 11c TierSchG) – vul diens naam in.",
  nichtVerkaeuflich: "Dit dier is niet als verkoopbaar ingeschreven.",
  nichtInHalle: "Dier is niet in de hal (niet ingekooid of al uitgekooid).",
  nichtBewertet: "Dier is nog niet gekeurd – verkocht wordt pas na de keuring.",
  gesperrt: "Dier is geblokkeerd in het gezondheidslogboek (ziek, verdacht of gestorven) en mag niet worden afgegeven.",
  bereitsVerkauft: (beleg: string) => `Al verkocht (bon ${beleg}).`,
  verkaufFehlt: "Verkoop niet gevonden.",
  schonStorniert: "Deze verkoop is al geannuleerd.",
  storniert: "De verkoop is geannuleerd.",
  nurUeberweisung: "Alleen verkopen per overschrijving hebben een betalingsontvangst nodig.",
  eingangGebucht: (beleg: string) => `De betaling voor bon ${beleg} is al geboekt.`,
};
