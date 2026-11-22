/**
 * Meldungen des Servers zu Preisen und Stiftungen (routers/preise.ts, services/preise.ts, domain preise.ts), Bewertung
 * und Tablet (routers/bewertung.ts, services/bewertung.ts, domain noten.ts), Einteilung der Preisrichter
 * (routers/preisrichter.ts) und Meisterschaften (domain meisterschaft.ts) – Teil von serverKasse (Entscheidung 022).
 */

/** Preise vergeben und entfernen, Stiftungen, Freigabe der Ergebnisse. */
export const preise = {
  deckung: (vergeben: string, verfuegbar: string) =>
    `Von diesem Stiftungspreis sind schon ${vergeben} vergeben – danach wären nur ${verfuegbar} verfügbar. Erst Preise entfernen.`,
  preisartFremd: "Preisart gehört nicht zu dieser Schau.",
  stiftungFehlt: "Stiftung nicht gefunden.",
  ausStiftungAenderung: (n: string) => `Aus dieser Stiftung sind schon ${n} Preise vergeben – Preisart und Betrag lassen sich nicht mehr ändern. Erst die Preise entfernen.`,
  ausStiftungAnzahl: (n: string) => `Aus dieser Stiftung sind schon ${n} Preise vergeben – die Anzahl kann nicht darunter liegen.`,
  ausStiftungLoeschen: (n: string) => `Aus dieser Stiftung sind schon ${n} Preise vergeben. Erst die Preise entfernen.`,
  betragEinlage: "Der Betrag ist schon als Einlage im Kassenbuch gebucht und lässt sich nicht mehr ändern.",
  mitMeldegeld: "Diese Stiftung wird mit dem Meldegeld bezahlt – Zahlung bitte an der Meldung erfassen.",
  schonKassenbuch: "Diese Stiftung ist schon im Kassenbuch gebucht.",
  sachpreis: "Die Stiftung hat keinen Geldbetrag (Sachpreis).",
  bleibtStehen: "Die Stiftung ist schon als Einlage im Kassenbuch gebucht und bleibt deshalb stehen.",
  nichtBewertet: (n: string) => `${n} Tiere sind noch nicht bewertet.`,
  obmannOffen: (n: string) => `${n} Bewertungen („vorzüglich“ oder u.M.) sind noch nicht vom Obmann bestätigt.`,
  ohneNummer: (n: string) => `${n} bestätigte Tiere haben keine Katalognummer – erst nummerieren oder die Meldung bereinigen.`,
  kontingentUeber: (liste: string) => `Kontingent überschritten: ${liste}. Bitte erst Preise entfernen.`,
  stiftungUngedeckt: (liste: string) => `Stiftungspreise nicht gedeckt: ${liste}. Bitte Stiftung ergänzen oder Preise entfernen.`,
  /** Hinweise vor der Freigabe (einzeln oder zusammen vor „Trotzdem freigeben?“). */
  hinweisPhase: (phase: string) => `Die Schau steht noch in der Phase „${phase}“ – die Preisrichter können am Tablet noch Preise vergeben.`,
  hinweisFrei: (liste: string) => `Noch freie Preise: ${liste}.`,
  hinweisStiftungFrei: (liste: string) => `Gestiftete Preise noch nicht vergeben: ${liste}.`,
  hinweisOhnePreisart: (stifter: string) => `Stiftung(en) ohne Preisart: ${stifter} – sie zählen für keinen Preis.`,
  hinweisOhneEinlieferung: (n: string) => `${n} Tiere sind bewertet, aber nicht als eingeliefert abgehakt (Nachweis prüfen oder mit Grund einliefern).`,
  trotzdemFreigeben: (hinweise: string) => `${hinweise} Trotzdem freigeben?`,
  grundRuecknahme: "Freigabe zurücknehmen nur mit Grund.",
  zuruecknehmen: (vorher: string) => `${vorher}Ergebnisse, Preise und Abrechnung können sich danach ändern. Trotzdem zurücknehmen?`,
  zuruecknehmenPhase: (phase: string) =>
    `Die Schau steht schon in der Phase „${phase}“. Ergebnisse, Preise und Abrechnung können sich danach ändern. Trotzdem zurücknehmen?`,
  zuruecknehmenAuszahlungen: (n: string) =>
    `Es gibt schon ${n} Auszahlung(en). Ergebnisse, Preise und Abrechnung können sich danach ändern. Trotzdem zurücknehmen?`,
  zuruecknehmenBeides: (phase: string, n: string) =>
    `Die Schau steht schon in der Phase „${phase}“. Es gibt schon ${n} Auszahlung(en). Ergebnisse, Preise und Abrechnung können sich danach ändern. Trotzdem zurücknehmen?`,
  /** Vergabe (services/preise.ts). */
  reklamation: "Die Ergebnisse sind freigegeben: Preise ändern sich nur noch als Reklamation mit Grund.",
  gestiftetAL: "Gestiftete Preise vergibt die Ausstellungsleitung.",
  gesperrt: "Tier ist im Gesundheitsjournal gesperrt (krank oder verdächtig) und bekommt keinen Preis.",
  bindung: (kuerzel: string, bindung: string) => `„${kuerzel}“ gilt ${bindung} – dieses Tier passt nicht dazu.`,
  nurJugend: "nur Jugend",
  nurSenioren: "nur Senioren",
  sparte: (sparte: string) => `Sparte ${sparte}`,
  jugendSparte: (sparte: string) => `nur Jugend, Sparte ${sparte}`,
  seniorenSparte: (sparte: string) => `nur Senioren, Sparte ${sparte}`,
  andererRichter: "Dieses Tier ist einem anderen Preisrichter zugeteilt.",
  keinRichter: "Das Tier ist keinem Preisrichter zugeteilt.",
  stiftungArt: "Diese Stiftung gehört nicht zu dieser Preisart.",
  stiftungVoll: (stifter: string) => `Die Stiftung von ${stifter} ist schon vollständig vergeben.`,
  preisFehlt: "Preis nicht gefunden.",
  nichtIhr: "Nicht Ihr Preis.",
  /** Prüfung der Vergabe (pruefeVergabe). */
  keinePunkte: "Das Tier hat keine Punktbewertung.",
  mindestpunkte: (preis: string, punkte: string) => `${preis} erst ab ${punkte} Punkten.`,
  schonPreisart: (preis: string) => `Das Tier hat bereits ${preis}.`,
  schonGeldpreis: "Das Tier hat bereits einen Geldpreis aus dem Standgeld.",
  ausgeschoepft: (preis: string, n: string) => `Kontingent für ${preis} ist ausgeschöpft (${n}).`,
  /** Note ändern, obwohl das Tier Preise hat (pruefeNotenaenderung). */
  preisZuerst: (preise: string) => `Das Tier hat schon ${preise}. Bitte zuerst den Preis entfernen.`,
  preisAbPunkten: (preise: string, punkte: string) => `${preise} gibt es erst ab ${punkte} Punkten. Bitte zuerst den Preis entfernen.`,
};

/** Bewertung am PC und am Tablet, Obmann, Textbausteine, Anmeldung am Tablet. */
export const bewertung = {
  zuVieleVersuche: "Zu viele Fehlversuche. Bitte 15 Minuten warten oder bei der Ausstellungsleitung eine neue PIN holen.",
  zuVieleNetz: "Zu viele Fehlversuche von diesem Netz. Bitte 15 Minuten warten.",
  wartenMinute: (min: string) => `Zu viele Fehlversuche für diesen Preisrichter. Bitte bis zu ${min} Minute warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben.`,
  wartenMinuten: (min: string) => `Zu viele Fehlversuche für diesen Preisrichter. Bitte bis zu ${min} Minuten warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben.`,
  veraltetPc: "Die Note wurde inzwischen anderswo geändert (z. B. am Tablet). Bitte die Seite neu laden und prüfen.",
  bausteinDoppelt: "Diesen Textbaustein gibt es schon.",
  bausteineMax: (n: string) => `Es gibt schon ${n} Textbausteine – bitte erst nicht benötigte löschen.`,
  keinObmann: "Für dieses Tier ist keine Obmann-Bestätigung nötig.",
  noteGeaendert: "Die Note wurde inzwischen geändert – bitte neu laden und erneut prüfen.",
  eigeneBewertung:
    "Die eigene Bewertung kann der Obmann nicht selbst bestätigen. Bitte einen zweiten Obmann eintragen (Seite Preisrichter) oder die Ausstellungsleitung bestätigen lassen – im Auftrag eines anderen Preisrichters.",
  weitererObmann: "Bestätigen darf nur ein Obmann – es gibt einen weiteren Obmann.",
  pinFalsch: "PIN stimmt nicht.",
  anmeldungPhase: "Die Anmeldung am Tablet ist nur von der Einlieferung bis zu den Preisen möglich.",
  nichtZugeteilt: "Tier ist Ihnen nicht zugeteilt.",
  spaeter: "Server vorübergehend gestört – wird erneut gesendet.",
  intern: "Interner Fehler beim Speichern – bitte der Ausstellungsleitung melden.",
  nurObmann: "Nur der Obmann kann bestätigen.",
  geschlossen: "Bewertung ist geschlossen. Änderungen nur über die Ausstellungsleitung.",
  /** services/bewertung.ts */
  konflikt: "Inzwischen anderswo geändert (z. B. von der Ausstellungsleitung). Bitte prüfen und dann trotzdem senden oder verwerfen.",
  nichtImKatalog: "Tier ist nicht im Katalog.",
  fehlend: "Tier ist als fehlend gemeldet – erst die Einlieferung korrigieren.",
  nurMitBegruendung: "Nach der Freigabe nur mit Begründung änderbar.",
  verkauftNote: (beleg: string) => `Tier ist verkauft (Beleg ${beleg}) – die Note ändert nur die Ausstellungsleitung mit Grund.`,
  verkauftZurueck: (beleg: string) => `Tier ist verkauft (Beleg ${beleg}) – erst den Verkauf stornieren.`,
  /** Prüfung der Note (pruefeBewertung). */
  beides: "Entweder Punkte oder Sondernote, nicht beides.",
  keineNote: "Punkte oder Sondernote fehlen.",
  punkteSkala: (punkte: string) => `${punkte} Punkte sind in der Notenskala nicht vorgesehen.`,
};

/** Einteilung der Preisrichter (routers/preisrichter.ts). */
export const preisrichter = {
  richterFehlt: "Preisrichter nicht gefunden.",
  bereich: (von: string, bis: string) => `Bereich ${von}–${bis} ist ungültig.`,
  ueberschneidung: (nr: string) => `Bereiche überschneiden sich bei Nr. ${nr}.`,
  unbekannt: "Unbekannter Preisrichter.",
  sparteFalsch: (name: string, sparte: string, nummern: string) => `${name} bewertet keine ${sparte} (Nr. ${nummern})`,
  sparteVerteilen: (text: string) => `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte ergänzen.`,
  ohneSparte: "Tiere ohne Sparte",
  wechsel: (liste: string) => `Bereits bewertete Tiere wechseln den Preisrichter: Nr. ${liste}.`,
  schonBewertet: "Der Preisrichter hat schon bewertet und kann nicht gelöscht werden.",
  sparteRasse: (name: string, sparte: string, rasse: string) =>
    `${name} bewertet keine ${sparte} (${rasse}). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Sparte ergänzen.`,
  /** BDRG-Gruppen und Obmann-Zuordnung (routers/preisrichter.ts, services/preisrichter-speichern.ts). */
  gruppeFalsch: (name: string, gruppe: string, nummern: string) => `${name} bewertet keine Gruppe ${gruppe} (Nr. ${nummern})`,
  gruppeVerteilen: (text: string) => `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Gruppe ergänzen.`,
  sparteGruppeVerteilen: (text: string) => `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte bzw. Gruppe ergänzen.`,
  gruppeRasse: (name: string, gruppe: string, rasse: string) =>
    `${name} bewertet keine Gruppe ${gruppe} (${rasse}). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Gruppe ergänzen.`,
  gruppeName: (gruppe: string) => `Gruppe ${gruppe}`,
  gruppeUngueltig: "Gruppe ungültig – kurzer Text wie A, Z1 oder BV.",
  obmannSelbst: "Ein Preisrichter kann nicht sein eigener Obmann sein.",
  obmannFehlt: "Obmann nicht gefunden.",
  keinObmann: "Der gewählte Preisrichter ist kein Obmann.",
};

/** Gründe und Hinweise der Meisterschaftswertung (domain meisterschaft.ts). */
export const meisterschaft = {
  bedingungenGeschlechter: (n: string) => `Keine Auswahl von ${n} Tieren erfüllt die Bedingungen (beide Geschlechter).`,
  bedingungenAlttiere: (n: string, alt: string) => `Keine Auswahl von ${n} Tieren erfüllt die Bedingungen (höchstens ${alt} Alttiere).`,
  bedingungenBeide: (n: string, alt: string) => `Keine Auswahl von ${n} Tieren erfüllt die Bedingungen (beide Geschlechter, höchstens ${alt} Alttiere).`,
  wenigerInWertung: (n: string) => `Weniger als ${n} Tiere in der Wertung.`,
  wenigerGeschlechter: (n: string) => `Weniger als ${n} Tiere beider Geschlechter in der Wertung.`,
  unterMindest: (punkte: string) => `Unter der Mindestpunktzahl ${punkte}.`,
  wenigerTiere: (n: string) => `Weniger als ${n} Tiere.`,
  wenigerZuechter: (n: string) => `Weniger als ${n} Züchter.`,
  wenigerSparten: (n: string) => `Weniger als ${n} Sparten.`,
  keinTitelAussteller: (n: string) => `Kein Titel: mindestens ${n} Aussteller nötig.`,
  keinTitelTiere: (n: string) => `Kein Titel: mindestens ${n} Tiere nötig.`,
  keinTitelVereine: (n: string) => `Kein Titel: mindestens ${n} Vereine nötig.`,
  gleichstand: "Gleichstand auf Platz 1 – die Ausstellungsleitung entscheidet.",
};
