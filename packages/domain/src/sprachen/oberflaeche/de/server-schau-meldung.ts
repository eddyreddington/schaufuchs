/** Meldungen des Servers zu Meldungen, Zahlungen und Ausstellern (Teil von serverSchau, Entscheidung 022). */
import { de as ausstellerTexte } from "../../de";

export const serverSchauMeldung = {
  /** routers/meldung.ts: Status, Zahlungen, Verfall. */
  status: {
    linkAusMail: "Meldung nicht gefunden. Bitte den Link aus der E-Mail verwenden.",
    abgeschlossen: "Die Schau ist abgeschlossen – der Status einer Meldung lässt sich nicht mehr ändern.",
    verfallGebucht: "Für diese Meldung ist ein Verfall gebucht – sie bleibt storniert bzw. abgelehnt. Bitte eine neue Meldung erfassen.",
    nurAdmin: "Ablehnen, Stornieren und Wiederaufnehmen einer Meldung nur durch die Ausstellungsleitung (Administratoren).",
    schonZahlung: "Die Meldung hat schon eine Zahlung – sie kann nicht zurück auf „offen“. Erst die Zahlung stornieren (Ausstellungsleitung).",
    nichtStorniert: (gruende: string) => `Die Meldung kann nicht mehr storniert werden: ${gruende}.`,
    nichtAbgelehnt: (gruende: string) => `Die Meldung kann nicht mehr abgelehnt werden: ${gruende}.`,
    nichtZurueckgesetzt: (gruende: string) => `Die Meldung kann nicht mehr zurückgesetzt werden: ${gruende}.`,
    /** Für jeden anderen Status (die drei üblichen stehen oben). */
    nichtMehr: (status: string, gruende: string) => `Die Meldung kann nicht mehr ${status} werden: ${gruende}.`,
    abgerechnet: (nr: string) => `Aussteller ist abgerechnet (Quittung ${nr})`,
    inSepa: "Aussteller steht in der offenen SEPA-Datei",
    inLastschrift: "Meldegeld steht in der offenen Lastschriftdatei",
    erstattungGrund: "Erstattung (negativer Betrag): bitte einen Grund angeben.",
    erstattungAdmin: "Erstattungen bucht die Ausstellungsleitung (Administratoren).",
    ueberweisungAdmin: "Überweisungen und sonstige Eingänge bucht die Ausstellungsleitung (Administratoren) nach dem Kontoauszug.",
    abgeschlossenBuchung: "Die Schau ist abgeschlossen – für Buchungen erst mit Grund zurück zur Abrechnung.",
    schonKassiert: (betrag: string) => `Das Meldegeld wurde inzwischen schon kassiert (offen jetzt ${betrag} €). Bitte die Anzeige neu laden.`,
    ueberzahlung: (betrag: string) => `Offen sind ${betrag} – mehr bucht nur die Ausstellungsleitung (Überzahlung).`,
    verfallNur: "Verfall gibt es nur bei stornierten oder abgelehnten Meldungen.",
    nichtsOffen: "Es ist nichts offen, das verfallen könnte (kein Zahlungseingang oder schon erstattet).",
    zahlungFehlt: "Zahlung nicht gefunden.",
    gegenbuchung: "Eine Gegenbuchung lässt sich nicht stornieren.",
    lastschriftZurueck: "Eine Lastschrift wird über „Rücklastschrift“ auf der Seite Lastschrift zurückgebucht.",
    schonStorniert: "Diese Zahlung ist bereits storniert.",
    keineEmail: "Der Aussteller hat keine E-Mail-Adresse.",
  },
  /** services/meldung.ts: Meldung speichern. */
  speichern: {
    farbenschlag: "Unbekannter Farbenschlag in der Meldung.",
    rasse: "Unbekannte Rasse in der Meldung.",
    jugendErfassen: (jahre: string) => `Laut Geburtsdatum am Bewertungstag nicht mehr jugendlich (unter ${jahre} Jahre) – bitte ohne Jugend erfassen.`,
    jugendMelden: (jahre: string) => `Laut Geburtsdatum am Bewertungstag nicht mehr jugendlich (unter ${jahre} Jahre) – bitte ohne Jugend melden.`,
    ausstellerWechsel: "Der Aussteller einer Meldung lässt sich nicht wechseln. Bitte die Meldung stornieren und für den richtigen Aussteller neu erfassen.",
    stiftung: "Eine Stiftung an einer bestehenden Meldung ändert die Ausstellungsleitung unter „Preise und Freigabe“.",
    spende: "Eine Spende zu einer bestehenden Meldung erfasst die Ausstellungsleitung unter „Spenden“.",
    abgeschlossen: "Die Schau ist abgeschlossen – Meldungen nur noch lesen. Für Korrekturen erst mit Grund zurück zur Abrechnung.",
    teilschauFest: "Der Katalog ist festgeschrieben – die Teilschau einer Meldung bleibt dann, wie sie ist.",
    gesperrtNeu: "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt. Bitte neu anlegen.",
    ibanAdmin: "Eine vorhandene IBAN oder den Kontoinhaber ändert nur die Ausstellungsleitung (Administratoren).",
    sepaBank: "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen, dann die Bankdaten ändern.",
    gesperrtNeuLaden: "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern. Bitte die Seite neu laden.",
    einverstaendnis: "Jugendmeldung: Die Veröffentlichung im Internet braucht das Einverständnis eines Erziehungsberechtigten – bitte dessen Namen eintragen.",
    doppelt: "Für diesen Aussteller gibt es schon eine Meldung zu dieser Schau.",
    bleibenInMeldung: (nrn: string) =>
      `Die Katalognummern sind festgeschrieben – diese Tiere bleiben in der Meldung: ${nrn}. Kommt ein Tier nicht, bei der Einlieferung als „fehlt“ markieren; die ganze Meldung lässt sich stornieren.`,
    nichtEntfernen: (gruende: string) => `Diese Tiere können nicht aus der Meldung entfernt werden: ${gruende}.`,
    aufKarten: (nrn: string) =>
      `Die Katalognummern sind festgeschrieben – Rasse, Farbenschlag, Art, Geschlecht und Alter dieser Tiere stehen schon auf Karten und im Katalog: ${nrn}. Zum Ändern das Tier als „fehlt“ markieren und richtig nachmelden (Unternummer).`,
    nichtAendern: (gruende: string) => `Diese Tiere lassen sich nicht mehr ändern (Rasse, Art, Geschlecht, Alter): ${gruende}.`,
    verkauft: (beleg: string) => `Verkaufspreis eines verkauften Tiers (Beleg ${beleg}) lässt sich nicht ändern – erst den Verkauf stornieren.`,
    verkaufspreisAdmin: "Den Verkaufspreis bewerteter Tiere ändert nur die Ausstellungsleitung.",
    position: "Position gehört nicht zu dieser Meldung.",
    abgerechnet: "Der Aussteller ist abgerechnet: Tiere, Jugend und Preisrichter-Befreiung ändert nur die Ausstellungsleitung.",
    abAbrechnung: "Ab der Abrechnung ändert Tiere, Jugend und Preisrichter-Befreiung nur die Ausstellungsleitung.",
    /** Für die Verwaltung kommen diese Texte der Aussteller-Seiten deutsch (texte("de")). */
    teilschau: ausstellerTexte.fehler.teilschau,
    keinAusland: ausstellerTexte.fehler.keinAusland,
  },
  /** Warum ein Tier fest an der Meldung hängt (bindungen): „Nr. 12a ist bewertet“. */
  bindung: {
    preis: (nr: string) => `Nr. ${nr} hat einen Preis`,
    bewertet: (nr: string) => `Nr. ${nr} ist bewertet`,
    eingeliefert: (nr: string) => `Nr. ${nr} ist eingeliefert`,
    ausgegeben: (nr: string) => `Nr. ${nr} ist ausgegeben`,
    journal: (nr: string) => `Nr. ${nr} steht im Gesundheitsjournal`,
    verkauft: (nr: string, beleg: string) => `Nr. ${nr} verkauft (Beleg ${beleg}), erst den Verkauf stornieren`,
    stornierterBeleg: (nr: string, belege: string) => `Nr. ${nr} steht mit storniertem Beleg ${belege} in der Verkaufsliste`,
    bewertetEingeliefert: (nr: string) => `Nr. ${nr} ist bewertet, ist eingeliefert`,
    bewertetAusgegeben: (nr: string) => `Nr. ${nr} ist bewertet, ist ausgegeben`,
    preisBewertet: (nr: string) => `Nr. ${nr} hat einen Preis, ist bewertet`,
    preisBewertetEingeliefert: (nr: string) => `Nr. ${nr} hat einen Preis, ist bewertet, ist eingeliefert`,
    preisBewertetAusgegeben: (nr: string) => `Nr. ${nr} hat einen Preis, ist bewertet, ist ausgegeben`,
    tierEingeliefert: "Tier ist eingeliefert",
    tierJournal: "Tier steht im Gesundheitsjournal",
  },
  /** services/aussteller.ts, services/datenschutz*.ts, routers/verein.ts. */
  aussteller: {
    doppelt: (vorname: string, nachname: string, plz: string) =>
      `${vorname} ${nachname} mit PLZ ${plz} gibt es schon. Bitte den vorhandenen Eintrag bearbeiten – oder bewusst ein zweites Mal anlegen.`,
    doppeltOhnePlz: (vorname: string, nachname: string) =>
      `${vorname} ${nachname} mit PLZ (leer) gibt es schon. Bitte den vorhandenen Eintrag bearbeiten – oder bewusst ein zweites Mal anlegen.`,
    formularNeu: "Bitte das Formular neu öffnen.",
    ausstellerFehlt: "Aussteller nicht gefunden.",
    gesperrt: "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern.",
    geaendert: "Die Angaben wurden inzwischen geändert (z. B. über eine Meldung). Bitte das Formular schließen und neu öffnen.",
    bankGeaendert: "Die Bankdaten wurden inzwischen geändert. Bitte das Formular schließen und neu öffnen.",
    lastschriftDatei: "Der Aussteller steht in einer offenen Lastschriftdatei – erst die Datei buchen oder verwerfen.",
    sepaDatei: "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen.",
    schonGeloescht: "Dieser Aussteller ist bereits gelöscht.",
    /** Zusatz leer; mit Testschau-Hinweis greift laufendTest. */
    laufend: (schauen: string, zusatz: string) => `Der Aussteller hat eine laufende Meldung (${schauen}). Erst die Meldung stornieren oder die Schau abschließen${zusatz}.`,
    laufendTest: (schauen: string) =>
      `Der Aussteller hat eine laufende Meldung (${schauen}). Erst die Meldung stornieren oder die Schau abschließen – bei einer Testschau genügt es, sie zu löschen oder die Demodaten neu einzuspielen.`,
  },
};
