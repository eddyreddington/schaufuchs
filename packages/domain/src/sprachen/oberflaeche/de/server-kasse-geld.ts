/**
 * Meldungen des Servers zur Kasse (routers/kasse/*, services/kasse.ts) mit SEPA-Überweisung aus der Fachlogik
 * (sepa.ts) – Teil von serverKasse (Entscheidung 022). Wortgleich wie im Server; `serverText()` übersetzt.
 */

/** Gemeinsame Prüfungen der Kasse (services/kasse.ts, routers/kasse/gemeinsam.ts). */
export const kasse = {
  abgeschlossenKorrektur: "Die Schau ist abgeschlossen – für Korrekturen erst mit Grund zurück zur Abrechnung.",
  abgerechnetReklamation: (nr: string) =>
    `Aussteller ist bereits abgerechnet (Quittung ${nr}). Als Reklamation nur durch die Ausstellungsleitung mit Grund – der Unterschied erscheint dann als Differenz.`,
  abgerechnetGesperrt: (nr: string) => `Aussteller ist bereits abgerechnet (Quittung ${nr}). Verkauf, Storno und Preise sind danach gesperrt.`,
  inSepaDatei: "Aussteller steht in der offenen SEPA-Datei. Erst die Datei buchen oder verwerfen.",
  lastschriftOffen: "Meldegeld steht in der offenen Lastschriftdatei – erst buchen oder verwerfen.",
  kassenbestand: (soll: string, danach: string) => `Laut Kassenbuch sind nur ${soll} € in der Kasse – danach wären es ${danach} €.`,
  kassenbestandHolen: (text: string) => `${text} Bitte Betrag prüfen oder die Ausstellungsleitung holen.`,
  kassenbestandTrotzdem: (text: string) => `${text} Trotzdem buchen?`,
};

/** Auszahlung, Nachzahlung, Rückforderung und Storno (routers/kasse/auszahlung.ts). */
export const auszahlung = {
  abPhaseSchau: "Ausgezahlt wird ab der Phase „Schau“. Meldegeld-Erstattungen vorher an der Meldung buchen.",
  ueberweisungNurAL: "Überweisungen bucht die Ausstellungsleitung (Administratoren).",
  bereitsAbgerechnet: (nr: string) => `Bereits abgerechnet (Quittung ${nr}).`,
  ibanFehlt: "Für eine Überweisung fehlt die IBAN des Ausstellers – bitte an der Meldung hinterlegen oder bar auszahlen.",
  betragGeaendert: (jetzt: string, vorher: string) => `Der Betrag hat sich geändert: jetzt ${jetzt} statt ${vorher}. Bitte die Seite neu laden und prüfen.`,
  nachzahlungNurAL: "Nachzahlungen und Rückforderungen bucht die Ausstellungsleitung (Administratoren).",
  rueckforderungEingang: "Eine Rückforderung per Überweisung erst buchen, wenn das Geld auf dem Vereinskonto eingegangen ist.",
  auszahlungFehlt: "Auszahlung nicht gefunden.",
  quittungStorniert: (nr: string) => `Quittung ${nr} ist bereits storniert.`,
  spaetereQuittung: (nr: string) => `Erst die spätere Quittung ${nr} stornieren.`,
};

/** Barkasse: Einlage, Entnahme, Tagesabschluss (routers/kasse/kassenbuch.ts). */
export const kassenbuch = {
  abgeschlossen: "Die Schau ist abgeschlossen – keine Kassenbuchungen mehr.",
  zweck: "Bei einer Entnahme bitte den Zweck angeben (z. B. „Einzahlung Bank“).",
  entnahmeNurAL: "Entnahmen bucht die Ausstellungsleitung (Administratoren).",
  kuenftig: "Ein Tagesabschluss für einen künftigen Tag geht nicht.",
  schonAbgeschlossen: (datum: string) => `Der Kassentag ${datum} ist schon abgeschlossen (keine Barbuchung seitdem).`,
  spaeterAbgeschlossen: "Ein späterer Kassentag ist schon abgeschlossen.",
  erstAbschliessen: (datum: string) => `Erst den Kassentag ${datum} abschließen.`,
  keineBewegung: "An diesem Tag gab es keine Bargeldbewegung.",
  differenz: (ist: string, soll: string) => `Gezählt ${ist} €, Soll ${soll} € – bitte die Differenz erklären.`,
};

/** SEPA-Sammelüberweisung (routers/kasse/sepa.ts) und Prüfungen beim Erzeugen der Datei (domain sepa.ts). */
export const sepa = {
  ausfuehrungVergangen: "Das Ausführungsdatum liegt in der Vergangenheit.",
  phaseAbrechnung: "Die SEPA-Datei gehört in die Phase „Abrechnung“ (nach der Schau).",
  vereinskonto: "Bitte zuerst das Vereinskonto in den Einstellungen eintragen.",
  schonOffen: "Es gibt schon eine offene SEPA-Datei. Erst buchen oder verwerfen.",
  lastschriftOffen: "Es gibt eine offene Lastschriftdatei. Erst buchen oder verwerfen, dann die Überweisungen.",
  keineOffenen: "Keine offenen Überweisungen.",
  nichtMehrOffen: "Diese SEPA-Datei ist nicht mehr offen.",
  keineOffenenErstellen: "Keine offenen Überweisungen. Bitte zuerst die SEPA-Datei erstellen.",
  auswahlWeicht: "Die Auswahl weicht von der SEPA-Datei ab.",
  keineUeberweisungen: "Keine Überweisungen.",
  betragPositiv: (name: string) => `Betrag für ${name} muss positiv sein.`,
  ausserhalbEwr: (name: string) => `${name}: Konto außerhalb des EWR – bitte bar auszahlen oder einzeln überweisen.`,
  /** Prüfung der IBAN eines Postens (pruefeIban), mit dem Namen davor. */
  ibanZeichen: (name: string) => `${name}: Die IBAN ist unvollständig oder enthält ungültige Zeichen.`,
  ibanLaenge: (name: string, land: string, soll: string, ist: string) => `${name}: Eine IBAN aus ${land} hat ${soll} Stellen, hier sind es ${ist}.`,
  ibanPruefziffer: (name: string) => `${name}: Die Prüfziffer der IBAN stimmt nicht – bitte auf Tippfehler prüfen.`,
};

/** Tierverkauf, Storno, Zahlungseingang (routers/kasse/verkauf.ts). */
export const verkauf = {
  nurAL: "Verkauf auf Karte oder Überweisung nur durch die Ausstellungsleitung (der Erlös stünde sonst ohne bestätigten Geldeingang zur Auszahlung bereit).",
  phase: "Verkauf erst nach der Bewertung, solange die Schau läuft (Phase „Preise“ oder „Schau“).",
  registriernummer: (hinweis: string) => `Registriernummer des Käufers ungültig: ${hinweis}.`,
  /** REGISTRIERNUMMER_HINWEIS (domain tiergesundheit.ts), oben eingesetzt. */
  registriernummerHinweis: "12 Ziffern, z. B. 276 06 535 012 0001 (Ländercode 276 darf fehlen); ausländische Nummern mit Ländercode, z. B. NL …",
  unter16: "Käufer unter 16 Jahren: nur mit Einwilligung eines Erziehungsberechtigten (§ 11c TierSchG) – bitte dessen Namen angeben.",
  nichtVerkaeuflich: "Dieses Tier ist nicht verkäuflich gemeldet.",
  nichtInHalle: "Tier ist nicht in der Halle (nicht eingeliefert oder schon ausgegeben).",
  nichtBewertet: "Tier ist noch nicht bewertet – verkauft wird erst nach der Bewertung.",
  gesperrt: "Tier ist im Gesundheitsjournal gesperrt (krank, verdächtig oder verendet) und darf nicht abgegeben werden.",
  bereitsVerkauft: (beleg: string) => `Bereits verkauft (Beleg ${beleg}).`,
  verkaufFehlt: "Verkauf nicht gefunden.",
  schonStorniert: "Dieser Verkauf ist schon storniert.",
  storniert: "Der Verkauf ist storniert.",
  nurUeberweisung: "Nur Verkäufe per Überweisung brauchen einen Zahlungseingang.",
  eingangGebucht: (beleg: string) => `Der Zahlungseingang zu Beleg ${beleg} ist schon gebucht.`,
};
