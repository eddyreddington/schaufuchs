/**
 * Texte der Oberfläche: rahmen (Entscheidung 022) – App-Rahmen mit Seitenmenü und Benutzermenü, Anmeldung, Einladung,
 * Hilfe-Rahmen, Fehlerseite und die gemeinsamen UI-Bausteine (Dialog, Speicherleiste, Ladefehler …).
 */
export const rahmen = {
  /** rahmen.tsx: Leiste, Kopfleiste, Pfadzeile, Schauwahl. */
  app: {
    allgemein: "Allgemein",
    hauptnavigation: "Hauptnavigation",
    version: "Version",
    bereicheDerSchau: "Bereiche der Schau",
    zumInhalt: "Zum Inhalt springen",
    menue: "Menü",
    menueSchliessen: "Menü schließen",
    menueOeffnen: "Menü öffnen",
    testschau: "Testschau",
    abgesagt: "Abgesagt",
    /** Phase einer Schau in der Schauwahl, bei einer Testschau mit Zusatz. */
    phaseTest: (phase: string, test: boolean) => (test ? `${phase}, Testschau` : phase),
    alleSchauen: "Alle Schauen",
    /** Pfadzeile: Seiten, die nicht im Menü stehen. */
    protokoll: "Protokoll",
    neueMeldung: "Neue Meldung",
    meldung: "Meldung",
    schauen: "Schauen",
  },
  /** seitenmenue.tsx: Gruppen und Seiten der linken Leiste. */
  menue: {
    uebersicht: "Übersicht",
    vorbereitung: "Vorbereitung",
    einstellungen: "Einstellungen",
    preisrichter: "Preisrichter",
    meldephase: "Meldephase",
    meldungen: "Meldungen",
    nachMeldeschluss: "Nach dem Meldeschluss",
    kaefige: "Käfige",
    hallenplan: "Hallenplan",
    katalognummern: "Katalognummern",
    katalog: "Katalog",
    schautage: "Schautage",
    einlieferung: "Einlieferung",
    bewertung: "Bewertung",
    preise: "Preise",
    meisterschaften: "Meisterschaften",
    tierverkauf: "Tierverkauf",
    kasseAbrechnung: "Kasse und Abrechnung",
    kassenbuch: "Kassenbuch",
    spenden: "Spenden",
    lastschrift: "Lastschrift",
    abrechnung: "Abrechnung",
    alleSchauen: "Alle Schauen",
    verein: "Verein",
    aussteller: "Aussteller",
    spender: "Spender",
    import: "Import",
    vereinDatenschutz: "Verein und Datenschutz",
    einrichtung: "Einrichtung",
    stammdaten: "Rassen und Farbenschläge",
    benutzer: "Benutzer",
    meinZugang: "Mein Zugang",
  },
  /** rahmen.tsx: Benutzermenü unten in der Leiste. */
  benutzerMenue: {
    administrator: "Administrator",
    mitarbeiter: "Mitarbeiter",
    darstellung: "Darstellung",
    system: "System",
    hell: "Hell",
    dunkel: "Dunkel",
    meinZugang: "Mein Zugang",
    abmelden: "Abmelden",
  },
  /** rahmen.tsx: Anmeldeseite und Ersteinrichtung. */
  anmelden: {
    titel: "Anmelden",
    bestaetigungscode: "Bestätigungscode",
    codeHinweis: "Bitte den 6-stelligen Code aus Ihrer Authenticator-App eingeben. Ohne Telefon geht auch ein Notfallcode.",
    code: "Code",
    anmelden: "Anmelden",
    zurueck: "Zurück zur Anmeldung",
    ersteinrichtung: "Ersteinrichtung für Ihren Verein",
    anmeldungFuer: "Anmeldung für Ausstellungsleitung und Helfer",
    untaetig: "Sie wurden nach längerer Untätigkeit automatisch abgemeldet.",
    vereinName: "Name des Vereins",
    ihrName: "Ihr Name",
    einrichtungscode: "Einrichtungscode",
    einrichtungscodeHinweis: "Steht als EINRICHTUNG_CODE in der Konfiguration des Servers.",
    email: "E-Mail-Adresse",
    passwort: "Passwort",
    mindestens10: "Mindestens 10 Zeichen.",
    vereinAnlegen: "Verein anlegen und anmelden",
    hilfe: "Hilfe zur Anmeldung und zur Software",
  },
  /** abmeldung.tsx: Hinweis in der letzten Minute. */
  abmeldung: {
    hinweis: (sekunden: number) => `Automatische Abmeldung in ${sekunden} s. Zum Weiterarbeiten tippen oder eine Taste drücken.`,
  },
  /** ui-dialog.tsx, ui-meldungen.tsx */
  dialog: {
    mindestensZeichen: (anzahl: number) => `mindestens ${anzahl} Zeichen`,
    meldungSchliessen: "Meldung schließen",
  },
  /** ui-seite.tsx */
  seite: {
    hilfeZu: (titel: string) => `Hilfe zu ${titel}`,
    ladeFehler: "Die Daten konnten nicht geladen werden.",
    erneutVersuchen: "Erneut versuchen",
  },
  /** ui-speichern.tsx */
  speichern: {
    ungespeichert: "Ungespeicherte Änderungen",
    verwerfen: "Verwerfen",
    wirdGespeichert: "Wird gespeichert …",
    gespeichert: "Gespeichert",
    nichtGespeichert: "Nicht gespeichert",
  },
  /** lib.ts: Alter eines Tiers (klein, im Satz). */
  alter: { jung: "jung", alt: "alt" },
  /** seiten/fehler.tsx */
  fehler: {
    zurSchau: "Zur Übersicht der Schau",
  },
  /** seiten/hilfe.tsx: nur der Rahmen, das Handbuch selbst bleibt deutsch. */
  hilfe: {
    titel: "Hilfe",
    titelTeil: (teil: string) => `Hilfe – ${teil}`,
    teile: { ausstellungsleitung: "Ausstellungsleitung", helfer: "Helfer", preisrichter: "Preisrichter" },
    handbuecher: "Handbücher",
    drucken: "Drucken",
    alsPdf: "Als PDF",
    zumAusdrucken: "Handbücher zum Ausdrucken",
    pdf: (titel: string) => `${titel} (PDF)`,
    inhalt: "Inhalt",
    ladeFehler: "Das Handbuch ließ sich nicht laden. Ohne Netz nur, wenn es vorher online geöffnet war.",
    nurDeutsch: "Das Handbuch gibt es nur auf Deutsch.",
  },
  /** seiten/einladung.tsx */
  einladung: {
    titel: "Zugang einrichten",
    ungleich: "Die beiden Passwörter stimmen nicht überein.",
    unvollstaendig: "Dieser Link ist unvollständig. Bitte den Link aus der Einladungsmail vollständig öffnen.",
    gutenTag: (name: string) => `Guten Tag ${name}, bitte legen Sie Ihr Passwort fest.`,
    anmeldungMit: "Anmeldung mit",
    wechsel: (angemeldet: string, neu: string) => `Gerade ist ${angemeldet} angemeldet – danach wechselt die Anmeldung zu ${neu}.`,
    neuesPasswort: "Neues Passwort",
    mindestens10: "Mindestens 10 Zeichen",
    wiederholen: "Passwort wiederholen",
    festlegen: "Passwort festlegen und anmelden",
    hilfe: "Hilfe zum Zugang",
  },
};
