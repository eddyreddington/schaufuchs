/**
 * Datenschutz und Anbieterkennzeichnung: Speicherfristen und Mustertexte für Impressum und Datenschutzhinweise.
 * Die Texte beschreiben, was diese Software tatsächlich verarbeitet. Verantwortlich ist der ausrichtende Verein;
 * er sollte die Muster prüfen (lassen) und kann sie ergänzen oder durch einen eigenen Text ersetzen.
 */

/** Verkaufsaufzeichnungen (Herkunft, Bestimmung, Registriernummer) für das Veterinäramt. */
export const AUFBEWAHRUNG_VERKAUF_JAHRE = 3;
/** Buchungsbelege (Zahlungen, Quittungen, Kaufbelege), § 147 Abs. 3 AO in der Fassung ab 2025. Prüfhinweis für den Verein. */
export const AUFBEWAHRUNG_BELEGE_JAHRE = 8;
/**
 * Bücher und Aufzeichnungen, § 147 Abs. 1 Nr. 1 und Abs. 3 AO: auch nach dem BEG IV zehn Jahre. Darunter fällt das
 * Änderungsprotokoll (Nachvollziehbarkeit nach § 146 Abs. 4 AO, GoBD). Prüfhinweis für den Verein (Steuerberater).
 */
export const AUFBEWAHRUNG_BUECHER_JAHRE = 10;
/** Bestätigungsmails mit Zugangslink im Postausgang. */
export const POSTAUSGANG_TAGE = 180;
/** Aussteller ohne Meldung so lange: Stammdaten werden gelöscht. */
export const INAKTIV_JAHRE = 3;
/** Karenzzeit nach dem Abschluss einer Schau, bevor IBAN, Geburtsdatum und Preisrichter-PIN gelöscht werden. */
export const KARENZ_TAGE = 30;
/** So lange nach der Schau (Bewertungstag) stehen Ergebnisse und Katalog öffentlich im Internet. */
export const ONLINE_MONATE = 12;

/** Ergebnisse und Katalog sind nicht mehr öffentlich: `ONLINE_MONATE` nach dem Bewertungstag (Datum JJJJ-MM-TT). */
export function onlineAbgelaufen(bewertungAm: string | null | undefined, heute: string): boolean {
  if (!bewertungAm) return false;
  const [j, m, t] = bewertungAm.split("-").map(Number) as [number, number, number];
  const ende = new Date(Date.UTC(j, m - 1 + ONLINE_MONATE, t)).toISOString().slice(0, 10);
  return heute > ende;
}

export interface Vereinsangaben {
  name: string;
  anschrift: string;
  email: string;
  telefon: string;
  /** Vertretungsberechtigter Vorstand, z. B. „Max Muster (1. Vorsitzender), Erika Muster (Kassiererin)“. */
  vertretung: string;
  /** Registergericht und Nummer, z. B. „Amtsgericht Kassel, VR 1234“. */
  register: string;
  /** Verantwortlich für journalistisch-redaktionelle Inhalte (§ 18 Abs. 2 MStV), falls vorhanden. */
  inhaltVerantwortlich: string;
  datenschutzbeauftragter: string;
  impressumZusatz: string;
  datenschutzZusatz: string;
  /** Eigener, vollständiger Text – ersetzt das Muster. */
  datenschutzText: string;
}

export interface Textabschnitt {
  titel: string;
  absaetze: string[];
}

const zeilen = (t: string) =>
  t
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean);

/** Pflichtangaben, die für Impressum und Datenschutzhinweise noch fehlen. Leer heißt: vollständig. */
export function fehlendeVereinsangaben(v: Vereinsangaben): string[] {
  return [
    !v.name.trim() ? "Name des Vereins" : "",
    !v.anschrift.trim() ? "Anschrift" : "",
    !v.email.trim() ? "E-Mail-Adresse" : "",
    !v.vertretung.trim() ? "Vertretungsberechtigter Vorstand" : "",
  ].filter(Boolean);
}

/** Anbieterkennzeichnung nach § 5 DDG. */
export function impressumAbschnitte(v: Vereinsangaben): Textabschnitt[] {
  const abschnitte: Textabschnitt[] = [{ titel: "Angaben nach § 5 DDG", absaetze: [v.name, ...zeilen(v.anschrift)].filter(Boolean) }];
  if (v.vertretung.trim()) abschnitte.push({ titel: "Vertreten durch", absaetze: zeilen(v.vertretung) });
  const kontakt = [v.telefon.trim() ? `Telefon: ${v.telefon.trim()}` : "", v.email.trim() ? `E-Mail: ${v.email.trim()}` : ""].filter(Boolean);
  if (kontakt.length) abschnitte.push({ titel: "Kontakt", absaetze: kontakt });
  if (v.register.trim()) abschnitte.push({ titel: "Registereintrag", absaetze: zeilen(v.register) });
  if (v.inhaltVerantwortlich.trim()) abschnitte.push({ titel: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", absaetze: zeilen(v.inhaltVerantwortlich) });
  if (v.impressumZusatz.trim()) abschnitte.push({ titel: "Weitere Angaben", absaetze: zeilen(v.impressumZusatz) });
  return abschnitte;
}

function verantwortlicher(v: Vereinsangaben): string[] {
  return [
    [v.name, ...zeilen(v.anschrift)].filter(Boolean).join(", "),
    v.vertretung.trim() ? `Vertreten durch: ${zeilen(v.vertretung).join(", ")}` : "",
    [v.email.trim() ? `E-Mail: ${v.email.trim()}` : "", v.telefon.trim() ? `Telefon: ${v.telefon.trim()}` : ""].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/** Kurzfassung für das Meldeformular (erste Ebene der Information nach Art. 13 DSGVO). */
export function datenschutzKurz(v: Vereinsangaben): string[] {
  return [
    `Verantwortlich: ${verantwortlicher(v).join(" · ")}.`,
    "Wir verarbeiten Ihre Angaben, um die Schau durchzuführen: Meldung, Meldegeld, Katalog, Bewertung, Preise, Tierverkauf und Abrechnung (Art. 6 Abs. 1 lit. b DSGVO). Registriernummer, Ringnummern und Verkäufe zeichnen wir auf, weil das Tierseuchenrecht es verlangt (lit. c).",
    "Name, Wohnort und Verein stehen mit Ihren Tieren und Bewertungen im gedruckten Katalog. Im Internet erscheinen sie nur, wenn Sie unten einwilligen (lit. a). Die Preisrichter sehen keine Namen.",
    `Empfänger: das Veterinäramt (Verkaufsliste), die Bank bei Überweisungen. Geburtsdatum und IBAN löschen wir nach der Schau, Verkaufsaufzeichnungen nach ${AUFBEWAHRUNG_VERKAUF_JAHRE} Jahren, Belege nach ${AUFBEWAHRUNG_BELEGE_JAHRE} Jahren.`,
    "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch, auf Widerruf Ihrer Einwilligung und auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.",
  ];
}

/** Vollständige Datenschutzhinweise. Ein eigener Text des Vereins ersetzt das Muster. */
export function datenschutzAbschnitte(v: Vereinsangaben): Textabschnitt[] {
  if (v.datenschutzText.trim()) return [{ titel: "", absaetze: zeilen(v.datenschutzText) }];
  const abschnitte: Textabschnitt[] = [
    { titel: "Verantwortlicher", absaetze: verantwortlicher(v) },
  ];
  if (v.datenschutzbeauftragter.trim()) abschnitte.push({ titel: "Datenschutzbeauftragter", absaetze: zeilen(v.datenschutzbeauftragter) });
  abschnitte.push(
    {
      titel: "Meldung zur Schau",
      absaetze: [
        "Mit der Meldung erheben wir Name, Anschrift, Telefon, E-Mail-Adresse, Ortsverein, Kreisverband, Registriernummer nach Viehverkehrsverordnung und die gemeldeten Tiere. Bei einer Jugendmeldung kommen das Geburtsdatum (für den Jugendtarif) und der Name eines Erziehungsberechtigten hinzu, freiwillig die IBAN für die Überweisung von Preisgeld und Verkaufserlös.",
        "Wir brauchen diese Angaben, um die Schau nach den Allgemeinen Ausstellungsbestimmungen (AAB) und den Sonderbestimmungen durchzuführen: Meldegeld, Katalognummern, Käfige, Bewertung, Preise, Tierverkauf, Tierausgabe und Abrechnung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
        "Ohne Name, Anschrift, E-Mail-Adresse, Verein und Registriernummer ist keine Meldung möglich. Telefon und IBAN sind freiwillig; ohne IBAN wird bar ausgezahlt.",
      ],
    },
    {
      titel: "Tierseuchenrechtliche Aufzeichnungen",
      absaetze: [
        "Für jedes verkaufte Tier zeichnen wir Herkunft und Bestimmung mit Name, Anschrift und Registriernummer sowie die Ringnummer auf (Verkaufsliste). Über alle Aussteller führen wir eine Tierliste mit Herkunftsbetrieb, Registriernummer, Tieren, Impf- und Untersuchungsnachweisen und ihrem Verbleib, dazu ein Gesundheitsjournal über Krankheits- und Todesfälle. Das Veterinäramt kann diese Listen anfordern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit dem Tiergesundheitsrecht (Verordnung (EU) 2016/429, Delegierte Verordnung (EU) 2019/2035) und der Viehverkehrsverordnung.",
      ],
    },
    {
      titel: "Katalog und Ergebnisse",
      absaetze: [
        "Im gedruckten Katalog stehen Name, Wohnort und Verein der Aussteller mit Katalognummern, Bewertungen und Preisen. Das gehört nach den AAB zur Schau (Art. 6 Abs. 1 lit. b und f DSGVO). Fehlt ein unterschriebener Meldebogen, steht der Aussteller ohne Namen im Katalog. Aus Gründen, die sich aus Ihrer besonderen Situation ergeben, können Sie der Nennung widersprechen (Art. 21 DSGVO) – dann stehen Ihre Tiere im Katalog ohne Namen, Wohnort und Verein.",
        "Im Internet (Ergebnisliste und Katalog zum Herunterladen) erscheinen Name, Wohnort und Verein nur mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), sonst steht dort „nicht veröffentlicht“. Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen: über den Link in Ihrer Bestätigungsmail oder per E-Mail an uns.",
        "Die Preisrichter bewerten anonym nach Katalognummer und sehen keine Namen.",
      ],
    },
    {
      titel: "Zahlungen und Abrechnung",
      absaetze: [
        "Meldegeld, Auszahlungen von Preisgeld und Verkaufserlös sowie Kaufbelege buchen wir mit Name und Betrag. Bei einer Überweisung geben wir Name und IBAN an unsere Bank weiter. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Aufbewahrung der Belege lit. c in Verbindung mit § 147 AO.",
      ],
    },
    {
      titel: "Käufer, Preisrichter und Stifter",
      absaetze: [
        `Von Käufern erfassen wir Name, Anschrift und Registriernummer, bei minderjährigen Käufern auch den Namen eines Erziehungsberechtigten, für Kaufbeleg und Verkaufsliste (Art. 6 Abs. 1 lit. b und c DSGVO). Die Verkaufsliste bewahren wir ${AUFBEWAHRUNG_VERKAUF_JAHRE} Jahre auf; der Kaufbeleg ist zugleich Buchungsbeleg und bleibt bis zum Ende des Jahres plus ${AUFBEWAHRUNG_BELEGE_JAHRE} Jahre. Der Kaufbeleg weist auf diese Hinweise hin.`,
        "Von Preisrichtern erfassen wir Name, Anschrift und Kontaktdaten für die Einteilung (Art. 6 Abs. 1 lit. b DSGVO). Im gedruckten Katalog steht der Name, die Anschrift nur mit Einverständnis des Preisrichters; im Internet nur der Name. Der Name bleibt als Teil von Katalog und Bewertungen dauerhaft erhalten.",
        "Stifter von Ehrenpreisen nennen wir im gedruckten Katalog. Im Internet erscheint ein Stifter nur mit Einwilligung – Aussteller mit ihrer Einwilligung in die Online-Veröffentlichung, andere Stifter, wenn sie zugestimmt haben (Art. 6 Abs. 1 lit. a und f DSGVO).",
      ],
    },
    {
      titel: "Website",
      absaetze: [
        "Die öffentlichen Seiten setzen keine Cookies und binden keine Dienste Dritter ein. Ein Cookie gibt es nur nach der Anmeldung für Ausstellungsleitung, Helfer und Preisrichter (technisch notwendig). Zum Schutz vor Missbrauch des Meldeformulars zählt der Server Anfragen je IP-Adresse und E-Mail-Adresse im Arbeitsspeicher, höchstens 24 Stunden lang, bei Schauen mit begrenzter Hallenkapazität die gemeldeten Tiere je IP-Adresse bis zu 14 Tage (Art. 6 Abs. 1 lit. f DSGVO). Für angemeldete Nutzer und Preisrichter-Tablets merkt er sich zusätzlich bis zu 30 Tage im Arbeitsspeicher, von welcher IP-Adresse die Anmeldung gelang, damit Fehlversuche Fremder sie nicht aussperren (Art. 6 Abs. 1 lit. f DSGVO).",
        "Damit die Anwendung schnell lädt und das Bewertungs-Tablet ohne Netz arbeitet, legt Ihr Browser die Programmdateien (keine personenbezogenen Daten) über einen Service Worker im Zwischenspeicher ab. Auf dem Tablet der Preisrichter speichert der Browser zusätzlich die zugeteilten Tiere und die erfassten Bewertungen (ohne Ausstellernamen) im lokalen Speicher (IndexedDB), bis sie übertragen sind. Das ist technisch erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Am Tablet merkt sich der Browser außerdem, welcher Preisrichter zuletzt angemeldet war (Name, im lokalen Speicher), damit das Tablet ohne Netz weiterarbeiten kann. Sie können den Zwischenspeicher jederzeit in den Browsereinstellungen löschen.",
      ],
    },
    {
      titel: "Empfänger",
      absaetze: [
        "Das Veterinäramt (Verkaufsliste, Tierliste und Gesundheitsjournal, auf Anforderung), unsere Bank (Überweisungen), die Öffentlichkeit (Katalog, im Internet nur mit Einwilligung) und unser E-Mail-Anbieter für die Bestätigungsmails. Mitglieder der Ausstellungsleitung und Helfer sehen die Daten, soweit sie sie für ihre Aufgabe brauchen.",
      ],
    },
    {
      titel: "Speicherdauer",
      absaetze: [
        `Bestätigungsmails löschen wir nach ${POSTAUSGANG_TAGE} Tagen. Geburtsdatum, IBAN sowie E-Mail, Telefon und Zugangs-PIN der Preisrichter löschen wir ${KARENZ_TAGE} Tage nach dem Abschluss der Schau (Zeit für Rückfragen zu Überweisungen), Geburtsdatum und IBAN frühestens ${KARENZ_TAGE} Tage nach dem Ende der Reklamationsfrist.`,
        `Ergebnisse und Katalog stehen bis ${ONLINE_MONATE} Monate nach der Schau im Internet; danach nehmen wir sie aus dem Netz. Der gedruckte Katalog bleibt davon unberührt.`,
        `Verkaufsaufzeichnungen, Tierliste und Gesundheitsjournal bewahren wir ${AUFBEWAHRUNG_VERKAUF_JAHRE} Jahre nach der Schau auf, Buchungsbelege ${AUFBEWAHRUNG_BELEGE_JAHRE} Jahre und das Änderungsprotokoll ${AUFBEWAHRUNG_BUECHER_JAHRE} Jahre nach Ende des Kalenderjahres. Die Anschrift der Preisrichter löschen wir ${INAKTIV_JAHRE} Jahre nach der Schau. Bis zum Fristende sperren wir Daten, deren Löschung Sie verlangen, und löschen sie danach.`,
        `Ihre Stammdaten (Name, Anschrift, Verein) bewahren wir auf, damit Sie bei der nächsten Schau nicht alles neu eingeben müssen. Haben Sie ${INAKTIV_JAHRE} Jahre nicht gemeldet, löschen wir sie, ebenso jederzeit auf Ihren Wunsch. Müssen Buchungsbelege noch aufbewahrt werden, bleibt bis dahin nur Ihr Name gesperrt gespeichert.`,
        "Gelöschte Daten können noch bis zu 30 Tage in unseren Datensicherungen stehen; danach werden die Sicherungen überschrieben.",
      ],
    },
    {
      titel: "Ihre Rechte",
      absaetze: [
        "Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine Einwilligung können Sie jederzeit widerrufen (Art. 7 Abs. 3); die bis dahin erfolgte Verarbeitung bleibt rechtmäßig.",
        "Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der Aufsichtsbehörde des Bundeslandes, in dem der Verein seinen Sitz hat.",
        v.email.trim() ? `Für alle Anliegen genügt eine E-Mail an ${v.email.trim()}.` : "",
      ].filter(Boolean),
    },
  );
  if (v.datenschutzZusatz.trim()) abschnitte.push({ titel: "Ergänzungen", absaetze: zeilen(v.datenschutzZusatz) });
  return abschnitte;
}

/** Abschnitte als schlichter Text, z. B. um das Muster als eigenen Text zu übernehmen. */
export function alsText(abschnitte: Textabschnitt[]): string {
  return abschnitte.map((a) => [a.titel, ...a.absaetze].filter(Boolean).join("\n")).join("\n\n");
}

/** Ende des Jahres, in dem ein Beleg entstand, plus die Frist – so rechnet § 147 Abs. 4 AO. */
function belegfristEnde(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + AUFBEWAHRUNG_BELEGE_JAHRE + 1, 0, 1));
}

/**
 * Bis wann die Daten eines Ausstellers aufbewahrt werden müssen: Verkaufsaufzeichnungen ab Verkauf,
 * Belege (Zahlungen, Auszahlungen, Kaufbelege) bis Jahresende plus Frist. null heißt: nichts aufzubewahren.
 */
export function aufbewahrenBis(verkaeufe: Date[], belege: Date[]): Date | null {
  const enden = [
    ...verkaeufe.map((d) => new Date(Date.UTC(d.getUTCFullYear() + AUFBEWAHRUNG_VERKAUF_JAHRE, d.getUTCMonth(), d.getUTCDate()))),
    ...belege.map(belegfristEnde),
  ];
  if (!enden.length) return null;
  return new Date(Math.max(...enden.map((d) => d.getTime())));
}
