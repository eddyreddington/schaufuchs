/**
 * Meldungen des Servers zu SEPA-Lastschrift (routers/lastschrift.ts, domain lastschrift.ts) und Spenden
 * (routers/spenden.ts, services/zuwendungsbestaetigung.ts, domain spenden.ts) – Teil von serverKasse (Entscheidung 022).
 */

/** Gläubiger-ID, Mandate, Lastschriftdatei, Rücklastschrift. */
export const lastschrift = {
  glaeubigerForm: "Die Gläubiger-ID hat die Form DE98ZZZ09999999999.",
  /** Auch als Grund hinter „Gläubiger-ID des Vereins: “ (domain lastschrift.ts). */
  glaeubigerFehlt: "Die Gläubiger-ID fehlt.",
  glaeubigerDe: "Eine deutsche Gläubiger-ID hat 18 Zeichen.",
  glaeubigerPruefziffer: "Die Prüfziffer der Gläubiger-ID stimmt nicht.",
  referenzFehlt: "Die Mandatsreferenz fehlt.",
  referenzLang: "Die Mandatsreferenz hat höchstens 35 Zeichen.",
  referenzZeichen: "Die Mandatsreferenz enthält unerlaubte Zeichen (erlaubt: Buchstaben ohne Umlaute, Ziffern, + ? / - : ( ) . , ').",
  /** Gründe, warum ein Mandat nicht eingezogen werden kann (mandatGueltig und Vorschau). */
  widerrufen: "Das Mandat ist widerrufen.",
  nichtUnterschrieben: "Das Mandat ist noch nicht unterschrieben.",
  einmaligGenutzt: "Das einmalige Mandat ist schon genutzt.",
  verfallen: (monate: string) => `Das Mandat ist verfallen (${monate} Monate nicht genutzt).`,
  ibanMandat: "IBAN des Mandats ungültig.",
  kontoAusserhalb: "Konto außerhalb von EU/EWR.",
  einmaligAndereDatei: "Das einmalige Mandat steht schon in einer anderen Lastschriftdatei.",
  sperreGlaeubiger: "Unter „Verein und Datenschutz“ fehlt die Gläubiger-ID des Vereins.",
  sperreKonto: "In den Einstellungen der Schau fehlt das Vereinskonto (IBAN).",
  nurEwr: "Lastschrift nur von Konten in EU/EWR – für andere Länder bräuchte sie BIC und Anschrift. Bitte bar oder per Überweisung.",
  unterschriftZukunft: "Das Datum der Unterschrift liegt in der Zukunft.",
  ausstellerGesperrt: "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt – kein neues Mandat.",
  referenzDoppelt: (referenz: string) => `Die Mandatsreferenz „${referenz}“ gibt es schon.`,
  mandatFehlt: "Mandat nicht gefunden.",
  schonWiderrufen: "Das Mandat ist schon widerrufen.",
  mandatInDatei: "Das Mandat steht in einer offenen Lastschriftdatei – erst die Datei verwerfen (oder nach dem Einzug buchen), dann widerrufen.",
  frueheste: (datum: string) => `Frühestes Fälligkeitsdatum ist der ${datum}.`,
  bankarbeitstag: "Die Fälligkeit muss ein Bankarbeitstag sein (kein Wochenende, kein Bankfeiertag).",
  schonOffen: "Es gibt schon eine offene Lastschriftdatei. Erst buchen oder verwerfen.",
  keinMeldegeld: "Kein offenes Meldegeld bei Ausstellern mit gültigem Mandat.",
  keineDatei: "Keine offene Lastschriftdatei.",
  nichtMehrOffen: "Diese Lastschriftdatei ist nicht mehr offen.",
  nurGebuchte: "Nur gebuchte Lastschriften lassen sich zurückbuchen.",
  meldungNicht: "Diese Meldung steht nicht in der Lastschrift.",
  schonZurueck: "Die Rücklastschrift ist schon gebucht.",
  zuwendung: (nr: string) =>
    `Zur Spende mit diesem Meldegeld gibt es die Zuwendungsbestätigung Nr. ${nr}. Bitte erst die Bestätigung stornieren (Spenden), dann die Rücklastschrift buchen.`,
  /** Prüfungen beim Erzeugen der Datei (erzeugeSepaLastschrift). */
  keineLastschriften: "Keine Lastschriften.",
  glaeubigerFehler: (fehler: string) => `Gläubiger-ID des Vereins: ${fehler}`,
  ausserhalbEwr: (name: string) => `${name}: Konto außerhalb von EU/EWR – dafür bräuchte die Lastschrift BIC und Anschrift.`,
  referenzFehltBei: (name: string) => `${name}: Die Mandatsreferenz fehlt.`,
  referenzLangBei: (name: string) => `${name}: Die Mandatsreferenz hat höchstens 35 Zeichen.`,
  referenzZeichenBei: (name: string) =>
    `${name}: Die Mandatsreferenz enthält unerlaubte Zeichen (erlaubt: Buchstaben ohne Umlaute, Ziffern, + ? / - : ( ) . , ').`,
};

/** Spenden, Spender und Zuwendungsbestätigungen. */
export const spenden = {
  spenderFehlt: "Spender nicht gefunden.",
  abgeschlossen: "Die Schau ist abgeschlossen – keine Spenden mehr erfassen.",
  sache: "Bei einer Sachspende bitte die Sache bezeichnen.",
  zukunft: "Der Tag der Zuwendung liegt in der Zukunft.",
  spendeFehlt: "Spende nicht gefunden.",
  keineStornos: "Die Schau ist abgeschlossen – keine Stornos mehr.",
  aufBestaetigung: "Die Spende steht auf einer Zuwendungsbestätigung – erst die Bestätigung stornieren.",
  schonStorniert: "Die Spende ist schon storniert.",
  keineSpenden: "Keine Spenden dieses Spenders.",
  keineGeldspende: (jahr: string) => `Für ${jahr} gibt es keine Geldspende, die noch bestätigt werden kann.`,
  testschau: "In einer Testschau gibt es keine Zuwendungsbestätigungen.",
  vereinFehlt: "Name und Anschrift des Vereins fehlen (Verein und Datenschutz → Vereinsangaben).",
  bestaetigungFehlt: "Zuwendungsbestätigung nicht gefunden.",
  bestaetigungStorniert: "Die Bestätigung ist schon storniert.",
  /** Steuerliche Angaben des Vereins (bescheidSperre). */
  nichtGemeinnuetzig: "Der Verein ist nicht als gemeinnützig eingetragen (Verein und Datenschutz → Steuerliche Angaben).",
  angabenFehlen: (liste: string) => `Steuerliche Angaben fehlen: ${liste}.`,
  finanzamt: "Finanzamt",
  steuernummer: "Steuernummer",
  bescheidDatum: "Datum des Bescheids",
  zweck: "Zweck",
  veranlagungszeitraum: "Veranlagungszeitraum",
  bescheidZukunft: "Das Datum des Bescheids liegt in der Zukunft – bitte prüfen.",
  freistellungAlt: "Der Freistellungsbescheid ist älter als fünf Jahre – Zuwendungsbestätigungen erst wieder mit einem neuen Bescheid.",
  feststellungAlt: "Die Feststellung nach § 60a AO ist älter als drei Jahre – Zuwendungsbestätigungen erst wieder mit einem Freistellungsbescheid.",
  /** Gründe gegen eine Zuwendungsbestätigung (bestaetigungsSperren). */
  storniert: "Die Spende ist storniert.",
  gegenleistung: "Mit Gegenleistung (z. B. Werbung) ist es Sponsoring, keine Spende – keine Zuwendungsbestätigung.",
  schonBestaetigt: "Die Spende ist schon bestätigt – eine zweite Bestätigung ist nicht erlaubt.",
  nichtEingegangen: "Das Geld ist noch nicht eingegangen.",
  spenderUnvollstaendig: "Name und Anschrift des Spenders sind unvollständig.",
  wertFehlt: "Der Wert der Sachzuwendung fehlt.",
  betragFehlt: "Der Betrag fehlt.",
  bezeichnungFehlt: "Die genaue Bezeichnung der Sachzuwendung fehlt.",
};
