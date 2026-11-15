import { KATALOG_AUFTEILUNGEN, KATALOG_FUSSZEILEN, KATALOG_LINIEN, KATALOG_SCHRIFTEN, KATALOG_TITELBILDER, KATALOG_TITELHINTERGRUENDE, KATALOG_STILE, TERMIN_EBENEN, UNTERSUCHUNG_ARTEN, type Abweichung, type KatalogTeil, type SortierSchritt } from "@schau/domain";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  ALTER,
  EINGANG,
  EINTRAG_STATUS,
  GEBUEHR_ARTEN,
  MELDEARTEN,
  MELDUNG_STATUS,
  PHASEN,
  KONTINGENT_BASEN,
  PREIS_QUELLEN,
  RUNDUNGEN,
  SONDERNOTEN,
  type KaefigRegel,
  type Halle,
  type Aufsteller,
  type FesterPlan,
  type KaefigMasse,
  type KaefigTyp,
  type MeisterschaftRegel,
  type Teilschau,
  type NotenStufe,
  type Steuerstatus,
} from "@schau/domain";
import { sql } from "drizzle-orm";
import { geheimJson, geheimText } from "./geheim";

import { bytea, created, createdNachSperre, ts } from "./spalten";

export const phaseEnum = pgEnum("phase", PHASEN);
export const meldeartEnum = pgEnum("meldeart", MELDEARTEN);
export const gebuehrArtEnum = pgEnum("gebuehr_art", GEBUEHR_ARTEN);
export const alterEnum = pgEnum("alter", ALTER);
export const eingangEnum = pgEnum("eingang", EINGANG);
export const meldungStatusEnum = pgEnum("meldung_status", MELDUNG_STATUS);
export const eintragStatusEnum = pgEnum("eintrag_status", EINTRAG_STATUS);
export const sondernoteEnum = pgEnum("sondernote", SONDERNOTEN);
export const preisQuelleEnum = pgEnum("preis_quelle", PREIS_QUELLEN);
export const rolleEnum = pgEnum("rolle", ["admin", "mitarbeiter"]);
export const zahlartEnum = pgEnum("zahlart", ["ueberweisung", "bar", "sonstige", "karte"]);
export const erfasstAufEnum = pgEnum("erfasst_auf", ["tablet", "pc"]);
export const rundungEnum = pgEnum("rundung", RUNDUNGEN);
export const kontingentBasisEnum = pgEnum("kontingent_basis", KONTINGENT_BASEN);

// ── Mandant und Benutzer ───────────────────────────────────────────────

/** Ein Verein oder Verband, der Schauen ausrichtet. Grundlage für Mandantenfähigkeit. */
export const organisation = pgTable("organisation", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) – der Verein ist Anbieter und Verantwortlicher.
  anschrift: text("anschrift").notNull().default(""),
  email: text("email").notNull().default(""),
  telefon: text("telefon").notNull().default(""),
  vertretung: text("vertretung").notNull().default(""),
  register: text("register").notNull().default(""),
  inhaltVerantwortlich: text("inhalt_verantwortlich").notNull().default(""),
  datenschutzbeauftragter: text("datenschutzbeauftragter").notNull().default(""),
  impressumZusatz: text("impressum_zusatz").notNull().default(""),
  datenschutzZusatz: text("datenschutz_zusatz").notNull().default(""),
  /** Eigener Text des Vereins – ersetzt das Muster aus der Software. */
  datenschutzText: text("datenschutz_text").notNull().default(""),
  /** Schreibweisen des eigenen Vereinsnamens in den Meldungen: Aussteller damit gelten als Vereinsmitglied. */
  vereinsnamen: jsonb("vereinsnamen").$type<string[]>().notNull().default([]),
  /** Eigene Schauen als iCal-Kalender veröffentlichen (/o/:id/schauen.ics) – andere Vereine abonnieren ihn für „Kommende Schauen“. */
  termineVeroeffentlichen: boolean("termine_veroeffentlichen").notNull().default(true),
  /** Automatische Abmeldung nach so vielen Minuten ohne Eingabe, je Rolle (packages/domain/src/abmeldung.ts); null = Vorgabe. */
  abmeldung: jsonb("abmeldung").$type<Partial<Record<"admin" | "mitarbeiter" | "preisrichter", number>>>(),
  /** Steuerliche Angaben für Zuwendungsbestätigungen (packages/domain/src/spenden.ts); null = nicht eingetragen. */
  steuer: jsonb("steuer").$type<Steuerstatus>(),
  /**
   * Gelernte Zuordnungen des Imports: Schreibweise aus der Datei (suchNorm von Rasse und Farbenschlag) → Rasse und
   * Farbenschlag im Verzeichnis, mit Namen statt Nummern (die gelten je Verzeichnisversion).
   */
  importZuordnungen: jsonb("import_zuordnungen").$type<Record<string, { rasse: string; farbenschlag: string }>>().notNull().default({}),
  createdAt: created(),
});

export const benutzer = pgTable(
  "benutzer",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id").notNull().references(() => organisation.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwortHash: text("passwort_hash").notNull(),
    rolle: rolleEnum("rolle").notNull().default("mitarbeiter"),
    aktiv: boolean("aktiv").notNull().default(true),
    /** Zwei-Faktor-Anmeldung (TOTP): Schlüssel in Base32, gesetzt schon während der Einrichtung. */
    totpGeheim: geheimText("totp_geheim", "benutzer.totpGeheim"), // verschlüsselt (db/geheim.ts)
    /** Erst mit der Bestätigung durch einen gültigen Code aktiv. */
    totpAktivSeit: ts("totp_aktiv_seit"),
    /** Zuletzt angenommener Zeitschritt – ein Code gilt nur einmal. */
    totpLetzterSchritt: integer("totp_letzter_schritt").notNull().default(0),
    /** SHA-256 der noch nicht benutzten Notfallcodes. */
    totpNotfall: jsonb("totp_notfall").$type<string[]>().notNull().default([]),
    /**
     * Entfernt, obwohl der Benutzer Spuren in Protokoll oder Kasse hat: Anmeldung, E-Mail, Passwort und 2FA sind weg,
     * nur der Name bleibt für die Nachvollziehbarkeit. Ohne Spuren wird der Datensatz ganz gelöscht.
     */
    geloeschtAm: ts("geloescht_am"),
    /**
     * Einladung: SHA-256 des Links, mit dem die Person ihr Passwort selbst festlegt (nur einmal, bis einladungBis).
     * Solange sie nicht angenommen ist, steht als Passwort-Hash "-" – eine Anmeldung ist dann nicht möglich.
     */
    einladungHash: text("einladung_hash"),
    einladungBis: ts("einladung_bis"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("benutzer_email_idx").on(t.email), uniqueIndex("benutzer_einladung_idx").on(t.einladungHash)],
);

export const sitzung = pgTable("sitzung", {
  /** SHA-256 des Tokens aus dem Cookie. */
  id: text("id").primaryKey(),
  benutzerId: integer("benutzer_id").references(() => benutzer.id, { onDelete: "cascade" }),
  preisrichterId: integer("preisrichter_id").references(() => preisrichter.id, { onDelete: "cascade" }),
  laeuftAb: ts("laeuft_ab").notNull(),
  /** Letzte Eingabe in dieser Sitzung – für die automatische Abmeldung nach Untätigkeit. */
  zuletzt: ts("zuletzt").notNull().defaultNow(),
  createdAt: created(),
});

// ── Stammdaten (je Jahr versioniert) ───────────────────────────────────

export const stammdatenVersion = pgTable("stammdaten_version", {
  id: serial("id").primaryKey(),
  /** Verein, der die Version eingespielt hat. null = vom Betreiber für alle Vereine bereitgestellt. */
  organisationId: integer("organisation_id").references(() => organisation.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jahr: integer("jahr").notNull(),
  quelle: text("quelle").notNull().default(""),
  createdAt: created(),
});

export const sparte = pgTable("sparte", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  folge: integer("folge").notNull(),
});

export const rasse = pgTable(
  "rasse",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
    sparteId: integer("sparte_id").notNull().references(() => sparte.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folge: integer("folge").notNull(),
  },
  (t) => [index("rasse_version_idx").on(t.versionId)],
);

export const farbenschlag = pgTable(
  "farbenschlag",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
    rasseId: integer("rasse_id").notNull().references(() => rasse.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folge: integer("folge").notNull(),
  },
  (t) => [index("farbenschlag_rasse_idx").on(t.rasseId), index("farbenschlag_version_idx").on(t.versionId, t.folge)],
);

// ── Schau und Regeln ───────────────────────────────────────────────────

export const schau = pgTable("schau", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisation.id),
  /** Kurzname für öffentliche Adressen, z. B. /s/lv-schau-2026. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /**
   * Testschau (Üben, Vorführen): ihre Aussteller gehören nur ihr (`aussteller.testSchauId`) und erscheinen nie in
   * echten Schauen, Vorschlägen oder der Aussteller-Verwaltung. Einmal gesetzt, bleibt es (sonst kämen Test-Aussteller
   * in den echten Bestand).
   */
  test: boolean("test").notNull().default(false),
  veranstalter: text("veranstalter").notNull().default(""),
  ort: text("ort").notNull().default(""),
  meldeschluss: date("meldeschluss"),
  einlieferung: text("einlieferung").notNull().default(""),
  bewertungAm: date("bewertung_am"),
  oeffnungszeiten: text("oeffnungszeiten").notNull().default(""),
  aussetzen: text("aussetzen").notNull().default(""),
  reklamationsfrist: date("reklamationsfrist"),
  kapazitaet: integer("kapazitaet"),
  phase: phaseEnum("phase").notNull().default("vorbereitung"),
  stammdatenVersionId: integer("stammdaten_version_id").references(() => stammdatenVersion.id),
  /** Verkaufsprovision in Basispunkten (1500 = 15 %). */
  provisionBp: integer("provision_bp").notNull().default(1500),
  katalogStart: integer("katalog_start").notNull().default(1),
  jugendSeparat: boolean("jugend_separat").notNull().default(true),
  /** Volieren und Stämme als eigene Abteilungen vor den Einzeltieren. */
  staemmeVorn: boolean("staemme_vorn").notNull().default(true),
  kontingentJe: kontingentBasisEnum("kontingent_je").notNull().default("preisrichter"),
  katalogGedruckt: boolean("katalog_gedruckt").notNull().default(false),
  ergebnisseFreigegeben: boolean("ergebnisse_freigegeben").notNull().default(false),
  /** Zeitpunkt des Abschlusses – die Speicherfristen (IBAN, Geburtsdatum, PIN) laufen erst danach mit Karenzzeit. */
  abgeschlossenAm: ts("abgeschlossen_am"),
  bestimmungen: text("bestimmungen").notNull().default(""),
  bankverbindung: text("bankverbindung").notNull().default(""),
  /** Meldegeld erst bei der Einlieferung (statt vorab per Überweisung) – steuert die Texte für Aussteller. */
  zahlungBeiEinlieferung: boolean("zahlung_bei_einlieferung").notNull().default(false),
  /** Vereinskonto, von dem Preisgeld und Verkaufserlöse überwiesen werden (SEPA-Datei). */
  vereinKontoinhaber: text("verein_kontoinhaber").notNull().default(""),
  vereinIban: text("verein_iban").notNull().default(""),
  vereinBic: text("verein_bic").notNull().default(""),
  kontaktEmail: text("kontakt_email").notNull().default(""),
  // Tierseuchenrecht: Registrierung der Veranstaltung und Anzeige beim Veterinäramt (4 Wochen vorher).
  vetRegistriernummer: text("vet_registriernummer").notNull().default(""),
  vetAmt: text("vet_amt").notNull().default(""),
  vetAnzeigeAm: date("vet_anzeige_am"),
  vetAktenzeichen: text("vet_aktenzeichen").notNull().default(""),
  /** Behörde verlangt für Enten und Gänse eine Untersuchung oder Sentinel-Bestätigung. */
  wassergefluegelUntersuchung: boolean("wassergefluegel_untersuchung").notNull().default(false),
  /** Klinische Untersuchung nach § 7 Abs. 1 GeflPestSchV (siehe UNTERSUCHUNG_ARTEN); leer = noch nicht festgelegt. */
  untersuchung: text("untersuchung", { enum: UNTERSUCHUNG_ARTEN }),
  /** Höchstalter der tierärztlichen Bescheinigung vor der Schau in Tagen (Merkblatt des Veterinäramts). */
  untersuchungTage: integer("untersuchung_tage").notNull().default(6),
  /** Einlassuntersuchung: wann und durch welchen Tierarzt. */
  einlassUntersuchungAm: date("einlass_untersuchung_am"),
  einlassTierarzt: text("einlass_tierarzt").notNull().default(""),
  /** Impffristen nach dem Merkblatt des Veterinäramts (Tage vor der Schau); leer = keine Frist. */
  ndTageMin: integer("nd_tage_min"),
  ndTageMax: integer("nd_tage_max"),
  pmvTageMin: integer("pmv_tage_min"),
  pmvTageMax: integer("pmv_tage_max"),
  /** Aussteller aus anderen Mitgliedstaaten zugelassen (dann Gesundheitszertifikat, TRACES, Einlasskontrolle). */
  auslandZugelassen: boolean("ausland_zugelassen").notNull().default(true),
  /** Höchstzahl Tiere je Preisrichter bzw. Obmann (Stamm 2, Voliere 3, Bruteier 3) – nur Hinweis in der Prüfliste. */
  prHoechstzahl: integer("pr_hoechstzahl").notNull().default(80),
  obmannHoechstzahl: integer("obmann_hoechstzahl").notNull().default(60),
  /** Abgesagt (z. B. Ausstellungsverbot wegen Tierseuche): Meldungen storniert, Erstattung über die Abrechnung. */
  abgesagtAm: ts("abgesagt_am"),
  absageGrund: text("absage_grund").notNull().default(""),
  /** Pflichterklärungen der Aussteller, je Zeile eine (z. B. „nicht aus Sperrbezirk“, „21 Tage kein Zukauf“). */
  erklaerungen: text("erklaerungen").notNull().default(""),
  notenskala: jsonb("notenskala").$type<NotenStufe[] | null>(),
  /** Meisterschaftswertungen der Schau (packages/domain/src/meisterschaft.ts), in der Reihenfolge der Ausgabe. */
  meisterschaften: jsonb("meisterschaften").$type<MeisterschaftRegel[]>().notNull().default([]),
  /** Teilschauen (Entscheidung 016) in Katalogfolge; leer = eine Schau ohne Teilschauen. */
  teilschauen: jsonb("teilschauen").$type<Teilschau[]>().notNull().default([]),
  /** Abweichende Käfiggröße je Rasse (Einzeltiere), z. B. Brahma im Großkäfig. */
  kaefigRegeln: jsonb("kaefig_regeln").$type<KaefigRegel[]>().notNull().default([]),
  /** Katalognummern nach Käfigblöcken in dieser Reihenfolge (wie in der Halle); null = nach Sparten. */
  kaefigFolge: jsonb("kaefig_folge").$type<KaefigTyp[] | null>(),
  /** Reihenfolge der Katalognummern innerhalb der Gliederung (Kriterien, Richtung); null = Vorgabe (SORTIERUNG_STANDARD). */
  katalogSortierung: jsonb("katalog_sortierung").$type<SortierSchritt[] | null>(),
  /** Maße der eigenen Käfige je Käfigart (cm); fehlende nach Richtwert. */
  kaefigMasse: jsonb("kaefig_masse").$type<KaefigMasse>().notNull().default({}),
  /** Maße der Halle, Gangbreite und Sperrflächen für den Hallenplan; null = noch nicht angelegt. */
  halle: jsonb("halle").$type<Halle | null>(),
  /** Festgeschriebener Hallenplan (Lage jedes Käfigs); null = die Automatik rechnet laufend. */
  hallenplanFest: jsonb("hallenplan_fest").$type<FesterPlan | null>(),
  /** Aufsteller (Gestelle unter den Grundplatten): Höhe in cm; null = Vorgabe. Für die 3D-Ansicht des Hallenplans. */
  aufsteller: jsonb("aufsteller").$type<Aufsteller | null>(),
  /** Druckvorlage der Bewertungskarten; null = Vorgabe (A6, vier je A4). */
  vorlageBewertungskarteId: integer("vorlage_bewertungskarte_id").references((): AnyPgColumn => druckvorlage.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const gebuehr = pgTable(
  "gebuehr",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    art: gebuehrArtEnum("art").notNull(),
    jugend: boolean("jugend").notNull().default(false),
    betragCent: integer("betrag_cent").notNull(),
    befreitPreisrichter: boolean("befreit_preisrichter").notNull().default(false),
  },
  (t) => [uniqueIndex("gebuehr_unique").on(t.schauId, t.art, t.jugend)],
);

export const preisart = pgTable("preisart", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  kuerzel: text("kuerzel").notNull(),
  name: text("name").notNull(),
  betragCent: integer("betrag_cent").notNull().default(0),
  sachpreis: text("sachpreis").notNull().default(""),
  quelle: preisQuelleEnum("quelle").notNull().default("standgeld"),
  schluesselProTiere: integer("schluessel_pro_tiere"),
  anzahlProSchluessel: integer("anzahl_pro_schluessel").notNull().default(1),
  anzahlProPreisrichter: integer("anzahl_pro_preisrichter").notNull().default(0),
  mindestpunkte: integer("mindestpunkte"),
  rundung: rundungEnum("rundung").notNull().default("voll"),
  folge: integer("folge").notNull().default(0),
  /** Bindung: "alle", "jugend" oder "senioren" (Kontingent und Vergabe nur über passende Tiere). */
  zielgruppe: text("zielgruppe", { enum: ["alle", "jugend", "senioren"] }).notNull().default("alle"),
  /** Bindung an eine Sparte (Name); leer: alle Sparten. */
  sparte: text("sparte").notNull().default(""),
});

// ── Aussteller und Meldungen ───────────────────────────────────────────

export const aussteller = pgTable(
  "aussteller",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id").notNull().references(() => organisation.id),
    vorname: text("vorname").notNull(),
    nachname: text("nachname").notNull(),
    strasse: text("strasse").notNull().default(""),
    plz: text("plz").notNull().default(""),
    ort: text("ort").notNull().default(""),
    telefon: text("telefon").notNull().default(""),
    email: text("email").notNull().default(""),
    verein: text("verein").notNull().default(""),
    kreisverband: text("kreisverband").notNull().default(""),
    /** Registriernummer nach Viehverkehrsordnung. */
    registriernummer: text("registriernummer").notNull().default(""),
    geburtsdatum: date("geburtsdatum"),
    istPreisrichter: boolean("ist_preisrichter").notNull().default(false),
    /** Vereinsmitglied von Hand gesetzt; null: nach der Vereinsangabe (Schreibweisen unter `organisation.vereinsnamen`). */
    mitglied: boolean("mitglied"),
    /**
     * Test-Aussteller: gehört nur zu dieser Testschau und verschwindet mit ihr (Kaskade). null = echter Aussteller des
     * Vereins. Echte Schauen sehen nur echte, eine Testschau nur ihre eigenen (services/testschau.ts).
     */
    testSchauId: integer("test_schau_id").references(() => schau.id, { onDelete: "cascade" }),
    /** Für die Überweisung von Preisgeld und Verkaufserlös (freiwillig). */
    // Verschlüsselt gespeichert (db/geheim.ts) – in der Datenbank und in Sicherungen nicht lesbar.
    iban: geheimText("iban", "aussteller.iban").notNull().default(""),
    kontoinhaber: geheimText("kontoinhaber", "aussteller.kontoinhaber").notNull().default(""),
    /** Löschung verlangt, aber Aufbewahrungsfrist läuft: Daten gesperrt (Art. 18 DSGVO), gelöscht ab loeschenAb. */
    gesperrtAm: ts("gesperrt_am"),
    loeschenAb: date("loeschen_ab"),
    geloeschtAm: ts("geloescht_am"),
    createdAt: created(),
  },
  (t) => [index("aussteller_name_idx").on(t.nachname, t.vorname), index("aussteller_test_schau_idx").on(t.testSchauId)],
);

export const meldung = pgTable(
  "meldung",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    ausstellerId: integer("aussteller_id").notNull().references(() => aussteller.id),
    eingang: eingangEnum("eingang").notNull(),
    eingegangenAm: ts("eingegangen_am").notNull().defaultNow(),
    istJugend: boolean("ist_jugend").notNull().default(false),
    /** Teilschau der Meldung (Kennung aus schau.teilschauen); leer bzw. unbekannt = die erste. */
    teilschau: text("teilschau"),
    /** Preisrichter-Befreiung für genau diese Meldung (nicht am Stammsatz – sonst änderte sie frühere Schauen rückwirkend). */
    istPreisrichter: boolean("ist_preisrichter").notNull().default(false),
    /** Meldebogen unterschrieben bzw. AAB online anerkannt – Voraussetzung für den Namen im Katalog. */
    zustimmungAm: ts("zustimmung_am"),
    /** Freiwillige Einwilligung in die Veröffentlichung im Internet (Ergebnisse, Online-Katalog); widerruflich. */
    onlineZustimmungAm: ts("online_zustimmung_am"),
    /** Bei Jugendmeldungen: Erziehungsberechtigter, der mit der Meldung einverstanden ist. */
    erziehungsberechtigter: text("erziehungsberechtigter").notNull().default(""),
    status: meldungStatusEnum("status").notNull().default("offen"),
    bemerkung: text("bemerkung").notNull().default(""),
    /** Geheimer Link-Schlüssel, mit dem der Aussteller seine Meldung ansieht. */
    zugangsToken: text("zugangs_token").notNull().unique(),
    /** ND-Impfung (Hühner, Puten). */
    vetImpfdatum: date("vet_impfdatum"),
    vetImpfstoff: text("vet_impfstoff").notNull().default(""),
    vetTierarzt: text("vet_tierarzt").notNull().default(""),
    /** PMV-Impfung (Tauben). */
    pmvImpfdatum: date("pmv_impfdatum"),
    pmvImpfstoff: text("pmv_impfstoff").notNull().default(""),
    pmvTierarzt: text("pmv_tierarzt").notNull().default(""),
    /** Wassergeflügel: virologische Untersuchung (Labor) oder Sentinel-Bestätigung (Behörde). */
    wgDatum: date("wg_datum"),
    wgSentinel: boolean("wg_sentinel").notNull().default(false),
    wgStelle: text("wg_stelle").notNull().default(""),
    /** Tierärztliche Bescheinigung der klinischen Untersuchung (§ 7 Abs. 1 GeflPestSchV), wenn die Schau sie verlangt. */
    klDatum: date("kl_datum"),
    klTierarzt: text("kl_tierarzt").notNull().default(""),
    /** Herkunft im Ausland: amtliches Gesundheitszertifikat bzw. TRACES-NT-Meldung. */
    gzDatum: date("gz_datum"),
    gzNummer: text("gz_nummer").notNull().default(""),
    /** Alle nötigen Nachweise liegen vor und sind geprüft. */
    vetGeprueftAm: ts("vet_geprueft_am"),
    /** Pflichterklärungen der Schau abgegeben (online angekreuzt bzw. auf dem Meldebogen unterschrieben). */
    erklaerungenAm: ts("erklaerungen_am"),
    /**
     * Verfall: Meldegeld einer stornierten oder abgelehnten Meldung, das der Verein behält (z. B. Rücktritt nach dem
     * Meldeschluss laut AAB) – mit Grund. Ohne Verfall oder Erstattung hält die Zahlung den Abschluss der Schau auf.
     */
    /**
     * Widerspruch gegen die Nennung im Katalog (Art. 21 DSGVO): Name, Ort und Verein stehen dann weder im Druck noch
     * online – die Zustimmung zu den Ausstellungsbestimmungen bleibt davon unberührt.
     */
    namenWiderspruchAm: ts("namen_widerspruch_am"),
    verfallenCent: integer("verfallen_cent").notNull().default(0),
    verfallGrund: text("verfall_grund").notNull().default(""),
    verfallenAm: ts("verfallen_am"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("meldung_schau_aussteller").on(t.schauId, t.ausstellerId)],
);

export const zahlung = pgTable("zahlung", {
  id: serial("id").primaryKey(),
  meldungId: integer("meldung_id").notNull().references(() => meldung.id, { onDelete: "cascade" }),
  betragCent: integer("betrag_cent").notNull(),
  datum: date("datum").notNull(),
  art: zahlartEnum("art").notNull().default("ueberweisung"),
  erfasstVon: integer("erfasst_von").references(() => benutzer.id),
  /** Grund (Pflicht bei Erstattung und Storno). */
  grund: text("grund").notNull().default(""),
  /** Gegenbuchung zu dieser Zahlung (Storno statt Löschen – Kassendaten bleiben unverändert). */
  stornoVon: integer("storno_von"),
  createdAt: createdNachSperre(),
});

export const katalogeintrag = pgTable(
  "katalogeintrag",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    meldungId: integer("meldung_id").notNull().references(() => meldung.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    farbenschlagId: integer("farbenschlag_id").references(() => farbenschlag.id),
    /** Bezeichnung, wenn nicht im Verzeichnis (AOC, Neuzüchtung). */
    freitext: text("freitext").notNull().default(""),
    /** Bei freier Bezeichnung: Rasse, bei der das Tier im Katalog eingeordnet wird. */
    rasseId: integer("rasse_id").references(() => rasse.id),
    art: meldeartEnum("art").notNull().default("einzeltier"),
    geschlecht: text("geschlecht").notNull().default("1,0"),
    alter: alterEnum("alter").notNull().default("jung"),
    istAoc: boolean("ist_aoc").notNull().default(false),
    istNeuzuechtung: boolean("ist_neuzuechtung").notNull().default(false),
    eigeneZucht: boolean("eigene_zucht").notNull().default(true),
    verkaufspreisCent: integer("verkaufspreis_cent"),
    katalogNr: integer("katalog_nr"),
    suffix: text("suffix").notNull().default(""),
    kaefig: text("kaefig").notNull().default(""),
    /** Für dieses Tier gewählte Käfiggröße (z. B. nur noch ein Großkäfig frei); null = automatisch. */
    kaefigWahl: text("kaefig_wahl").$type<KaefigTyp>(),
    /** Käfigblock bei der Nummernvergabe – Nachmeldungen werden danach eingeordnet, auch wenn sich Regeln später ändern. */
    kaefigBlock: text("kaefig_block").$type<KaefigTyp>(),
    /** Zählt jede Bewertungsänderung und jedes Zurücksetzen – das Tablet erkennt so Änderungen anderer (monoton). */
    bewertungVersion: integer("bewertung_version").notNull().default(0),
    ringnummern: text("ringnummern").notNull().default(""),
    status: eintragStatusEnum("status").notNull().default("gemeldet"),
    createdAt: created(),
  },
  (t) => [
    index("eintrag_schau_idx").on(t.schauId),
    index("eintrag_meldung_idx").on(t.meldungId),
    uniqueIndex("eintrag_katalognr").on(t.schauId, t.katalogNr, t.suffix),
  ],
);

// ── Preisrichter und Bewertung ─────────────────────────────────────────

/**
 * Verzeichnis der Rassegeflügelzuchtvereine (nur Namen mit Kreis- und Landesverband, aus öffentlichen Verbandsseiten) –
 * für alle Vereine der Anwendung gemeinsam; Vorschläge beim Erfassen von Ausstellern. Keine Personen, keine Adressen.
 */
export const vereinsverzeichnis = pgTable(
  "vereinsverzeichnis",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kreisverband: text("kreisverband").notNull().default(""),
    landesverband: text("landesverband").notNull().default(""),
    /** Seite, auf der der Name öffentlich steht. */
    quelle: text("quelle").notNull().default(""),
    /** Vergleichsschlüssel aus Name und Kreisverband (klein, ohne Satzzeichen; in der Anwendung berechnet – unabhängig von der Sortierung der Datenbank, auch bei Umlauten). */
    schluessel: text("schluessel").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("vereinsverzeichnis_schluessel").on(t.schluessel)],
);

export const preisrichter = pgTable("preisrichter", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  anschrift: text("anschrift").notNull().default(""),
  /** Anschrift im gedruckten Katalog nennen – nur mit Einverständnis des Preisrichters (sonst nur Name und Nummern). */
  anschriftImKatalog: boolean("anschrift_im_katalog").notNull().default(false),
  email: text("email").notNull().default(""),
  telefon: text("telefon").notNull().default(""),
  pinHash: text("pin_hash"),
  istObmann: boolean("ist_obmann").notNull().default(false),
  /** Sparten, die dieser Preisrichter bewertet (Namen aus dem Verzeichnis); leer = alle. Grundlage der Einteilung. */
  sparten: jsonb("sparten").$type<string[]>().notNull().default([]),
  createdAt: created(),
});

export const prEinteilung = pgTable("pr_einteilung", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  preisrichterId: integer("preisrichter_id").notNull().references(() => preisrichter.id, { onDelete: "cascade" }),
  vonNr: integer("von_nr").notNull(),
  bisNr: integer("bis_nr").notNull(),
});

/**
 * Einteilung nach Rassen (vor der Nummernvergabe): Sparte, Rasse und – wenn die Rasse geteilt wird – Farbenschlag je
 * Preisrichter. Daraus rechnet die Software beim Vergeben der Katalognummern die Bereiche in `pr_einteilung`.
 */
export const prZuteilung = pgTable(
  "pr_zuteilung",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    preisrichterId: integer("preisrichter_id").notNull().references(() => preisrichter.id, { onDelete: "cascade" }),
    sparte: text("sparte").notNull().default(""),
    rasse: text("rasse").notNull(),
    /** Leer = ganze Rasse. */
    farbenschlag: text("farbenschlag").notNull().default(""),
  },
  (t) => [uniqueIndex("pr_zuteilung_eindeutig").on(t.schauId, t.sparte, t.rasse, t.farbenschlag)],
);

export const bewertung = pgTable("bewertung", {
  id: serial("id").primaryKey(),
  katalogeintragId: integer("katalogeintrag_id")
    .notNull()
    .unique()
    .references(() => katalogeintrag.id, { onDelete: "cascade" }),
  preisrichterId: integer("preisrichter_id").references(() => preisrichter.id),
  punkte: integer("punkte"),
  sondernote: sondernoteEnum("sondernote"),
  vorzuege: text("vorzuege").notNull().default(""),
  wuensche: text("wuensche").notNull().default(""),
  maengel: text("maengel").notNull().default(""),
  erfasstAuf: erfasstAufEnum("erfasst_auf").notNull().default("pc"),
  /** Zeitpunkt der Änderung auf dem Gerät (für den Offline-Abgleich). */
  geraetZeit: ts("geraet_zeit").notNull().defaultNow(),
  obmannBestaetigtVon: integer("obmann_bestaetigt_von").references(() => preisrichter.id),
  obmannBestaetigtAm: ts("obmann_bestaetigt_am"),
  /** Zählt jede Änderung hoch: das Tablet erkennt so Änderungen anderer, unabhängig von seiner Uhr. */
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const textbaustein = pgTable("textbaustein", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisation.id),
  kategorie: text("kategorie", { enum: ["vorzug", "wunsch", "mangel"] }).notNull(),
  text: text("text").notNull(),
  /** Merkmal, z. B. „Kamm“ oder „Farbe“ – das Tablet zeigt die Bausteine je Merkmal. */
  gruppe: text("gruppe").notNull().default("Gesamteindruck"),
  /** Geflügelart (siehe BAUSTEIN_ARTEN), „alle“ gilt für jedes Tier. */
  art: text("art").notNull().default("alle"),
  /** Optional nur für eine Rasse (Name wie im Verzeichnis); leer = jede Rasse der Art. */
  rasse: text("rasse"),
});

// ── Preise, Verkauf, Geld ──────────────────────────────────────────────

export const stiftung = pgTable("stiftung", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  stifter: text("stifter").notNull(),
  meldungId: integer("meldung_id").references(() => meldung.id, { onDelete: "set null" }),
  preisartId: integer("preisart_id").references(() => preisart.id, { onDelete: "set null" }),
  anzahl: integer("anzahl").notNull().default(1),
  betragCent: integer("betrag_cent").notNull().default(0),
  vorgabe: text("vorgabe").notNull().default(""),
  eingegangenAm: date("eingegangen_am"),
  /** Stifter ohne Meldung: im Internet (Online-Katalog) nur mit Zustimmung nennen. */
  onlineNennen: boolean("online_nennen").notNull().default(false),
  /** Bar übergebene Stiftung ohne Meldung: die Einlage im Kassenbuch (mit Eigenbeleg). */
  kassenbewegungId: integer("kassenbewegung_id").references((): AnyPgColumn => kassenbewegung.id, { onDelete: "restrict" }),
});

export const preisvergabe = pgTable(
  "preisvergabe",
  {
    id: serial("id").primaryKey(),
    katalogeintragId: integer("katalogeintrag_id")
      .notNull()
      .references(() => katalogeintrag.id, { onDelete: "cascade" }),
    // RESTRICT: eine vergebene Preisart lässt sich nicht löschen (Preise, Ehrentafel, Abrechnung hängen daran).
    preisartId: integer("preisart_id").notNull().references(() => preisart.id, { onDelete: "restrict" }),
    preisrichterId: integer("preisrichter_id").references(() => preisrichter.id),
    /** Betrag zum Zeitpunkt der Vergabe – eine spätere Änderung der Preisart ändert keine Abrechnung. */
    betragCent: integer("betrag_cent"),
    /** Gestifteter Preis: aus welcher Stiftung (Betrag, Stifter, Vorgabe). RESTRICT: vergeben bleibt die Stiftung stehen. */
    stiftungId: integer("stiftung_id").references(() => stiftung.id, { onDelete: "restrict" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("preisvergabe_unique").on(t.katalogeintragId, t.preisartId)],
);

export const verkauf = pgTable(
  "verkauf",
  {
  id: serial("id").primaryKey(),
  katalogeintragId: integer("katalogeintrag_id")
    .notNull()
    // RESTRICT: Ein Verkauf verschwindet nie still mit dem Tier – erst stornieren (Beleg, Abrechnung, Veterinärliste).
    .references(() => katalogeintrag.id, { onDelete: "restrict" }),
  kaeuferName: text("kaeufer_name").notNull(),
  kaeuferAnschrift: text("kaeufer_anschrift").notNull().default(""),
  kaeuferRegistriernummer: text("kaeufer_registriernummer").notNull(),
  preisCent: integer("preis_cent").notNull(),
  provisionCent: integer("provision_cent").notNull(),
  belegNr: integer("beleg_nr").notNull(),
  verkauftVon: integer("verkauft_von").references(() => benutzer.id),
  zahlart: zahlartEnum("zahlart").notNull().default("bar"),
  /** Provisionssatz zum Zeitpunkt des Verkaufs (Basispunkte) – spätere Änderungen der Schau ändern keinen Beleg. */
  provisionBp: integer("provision_bp"),
  /** § 11c TierSchG: Käufer unter 16 nur mit Einwilligung eines Erziehungsberechtigten (Name). */
  kaeuferUnter16: boolean("kaeufer_unter16").notNull().default(false),
  kaeuferErziehungsberechtigter: text("kaeufer_erziehungsberechtigter").notNull().default(""),
  /** Storno statt Löschen: der Verkauf bleibt in der Verkaufsliste für das Veterinäramt sichtbar. */
  storniertAm: ts("storniert_am"),
  storniertVon: integer("storniert_von").references(() => benutzer.id),
  stornoGrund: text("storno_grund").notNull().default(""),
  createdAt: createdNachSperre(),
  },
  // Je Tier höchstens ein gültiger Verkauf; nach Storno darf es neu verkauft werden.
  (t) => [uniqueIndex("verkauf_tier_gueltig").on(t.katalogeintragId).where(sql`storniert_am is null`)],
);

/**
 * Zahlungseingang zu einem Verkauf per Überweisung (Kontoauszug). Erst damit zählt der Erlös in der Abrechnung des
 * Ausstellers und das Tier darf hinaus. Eigene, unveränderbare Zeile statt eines Felds am Verkauf (Kassendaten).
 */
export const verkaufZahlungseingang = pgTable("verkauf_zahlungseingang", {
  id: serial("id").primaryKey(),
  verkaufId: integer("verkauf_id")
    .notNull()
    .unique()
    // Mit dem Verkauf weg (nur beim Löschen einer Testschau – sonst schützt der Trigger beide).
    .references(() => verkauf.id, { onDelete: "cascade" }),
  datum: date("datum", { mode: "string" }).notNull(),
  erfasstVon: integer("erfasst_von").references(() => benutzer.id),
  createdAt: createdNachSperre(),
});

/**
 * Tiergesundheit (Art. 25 DelVO (EU) 2019/2035): Krankheitsfälle, Verdacht, Todesfälle, Maßnahmen.
 * Ein Eintrag mit Sperre nimmt das Tier aus Verkauf und Preisvergabe.
 */
export const gesundheit = pgTable("gesundheit", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  katalogeintragId: integer("katalogeintrag_id").references(() => katalogeintrag.id, { onDelete: "set null" }),
  zeitpunkt: ts("zeitpunkt").notNull().defaultNow(),
  /** Tier und Halter als Text, festgehalten beim Erfassen (bleibt lesbar, auch wenn die Meldung später storniert wird). */
  tierText: text("tier_text").notNull().default(""),
  befund: text("befund").notNull(),
  massnahme: text("massnahme").notNull().default(""),
  tierarzt: text("tierarzt").notNull().default(""),
  verendet: boolean("verendet").notNull().default(false),
  sperre: boolean("sperre").notNull().default(true),
  /** Aufgehoben durch die Ausstellungsleitung (sonst war das Tier nie gesperrt). */
  aufgehobenAm: ts("aufgehoben_am"),
  aufhebungGrund: text("aufhebung_grund").notNull().default(""),
  erfasstVon: integer("erfasst_von").references(() => benutzer.id),
  createdAt: created(),
});

export const auszahlung = pgTable(
  "auszahlung",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    ausstellerId: integer("aussteller_id").notNull().references(() => aussteller.id),
    betragCent: integer("betrag_cent").notNull(),
    art: zahlartEnum("art").notNull().default("bar"),
    quittungNr: integer("quittung_nr").notNull(),
    ausgezahltVon: integer("ausgezahlt_von").references(() => benutzer.id),
    /** Nachzahlung oder Rückforderung: Quittung, auf die sich diese Buchung bezieht (nur der Unterschied wird gebucht). */
    bezugQuittungNr: integer("bezug_quittung_nr"),
    /** Storno statt Löschen: die Buchung bleibt sichtbar, zählt aber nicht mehr. Nur, wenn kein Geld geflossen ist. */
    storniertAm: ts("storniert_am"),
    storniertVon: integer("storniert_von").references(() => benutzer.id),
    stornoGrund: text("storno_grund").notNull().default(""),
    createdAt: createdNachSperre(),
  },
  (t) => [uniqueIndex("auszahlung_quittung_unique").on(t.schauId, t.quittungNr)],
);

// ── Protokoll und Post ─────────────────────────────────────────────────

export const aenderung = pgTable(
  "aenderung",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").references(() => schau.id, { onDelete: "cascade" }),
    tabelle: text("tabelle").notNull(),
    datensatzId: integer("datensatz_id"),
    aktion: text("aktion").notNull(),
    alt: jsonb("alt"),
    neu: jsonb("neu"),
    benutzerId: integer("benutzer_id").references(() => benutzer.id),
    preisrichterId: integer("preisrichter_id").references(() => preisrichter.id),
    wer: text("wer").notNull().default(""),
    grund: text("grund").notNull().default(""),
    zeitpunkt: ts("zeitpunkt").notNull().defaultNow(),
    // Hash-Kette (Trigger in db/schutz.sql): jeder Eintrag bindet den vorigen ein – nachträgliche Änderungen fallen auf.
    vorherId: integer("vorher_id"),
    vorherHash: text("vorher_hash"),
    /** Aufbau des Hashes: leer = 1 (Felder mit | verbunden), 2 = JSON-Array (eindeutig, auch bei | und NULL). */
    hashVersion: integer("hash_version"),
    inhaltHash: text("inhalt_hash"),
    hash: text("hash"),
  },
  (t) => [index("aenderung_schau_idx").on(t.schauId, t.zeitpunkt)],
);

export const postausgang = pgTable("postausgang", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisation.id, { onDelete: "cascade" }),
  /** Empfänger als Aussteller: Auskunft und Löschung finden die Mail auch nach einem Adresswechsel. */
  ausstellerId: integer("aussteller_id").references(() => aussteller.id, { onDelete: "set null" }),
  an: text("an").notNull(),
  betreff: text("betreff").notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["wartet", "gesendet", "fehler"] }).notNull().default("wartet"),
  fehler: text("fehler").notNull().default(""),
  /** Versandversuche – der Versandlauf wiederholt fehlgeschlagene Mails einige Male. */
  versuche: integer("versuche").notNull().default(0),
  createdAt: created(),
  gesendetAm: ts("gesendet_am"),
});

// ── Katalog-Gestaltung ─────────────────────────────────────────────────

export const KATALOG_FORMATE = ["A5", "A4"] as const;
export const BEITRAG_ARTEN = ["grusswort", "anzeige", "seite"] as const;
export const ANZEIGE_GROESSEN = ["ganz", "halb", "viertel"] as const;

/** Angaben für Titel und Vorspann des gedruckten Katalogs (eine Zeile je Schau). */
/**
 * Druckvorlagen des Vereins (Bewertungskarte, später Briefe). Mit schauId: die für eine Schau abgewandelte Fassung.
 * Der Inhalt (daten) wird immer über kartenVorlageLesen() in packages/domain/src/druckvorlage.ts gelesen.
 */
export const druckvorlage = pgTable("druckvorlage", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id")
    .notNull()
    .references(() => organisation.id, { onDelete: "cascade" }),
  schauId: integer("schau_id").references((): AnyPgColumn => schau.id, { onDelete: "cascade" }),
  art: text("art", { enum: ["bewertungskarte", "brief"] }).notNull(),
  name: text("name").notNull(),
  daten: jsonb("daten").notNull().default({}),
  createdAt: created(),
});

export const katalogGestaltung = pgTable("katalog_gestaltung", {
  schauId: integer("schau_id")
    .primaryKey()
    .references(() => schau.id, { onDelete: "cascade" }),
  format: text("format", { enum: KATALOG_FORMATE }).notNull().default("A4"),
  untertitel: text("untertitel").notNull().default(""),
  schirmherr: text("schirmherr").notNull().default(""),
  /** Eine Zeile je Person: "Funktion: Name". */
  ausstellungsleitung: text("ausstellungsleitung").notNull().default(""),
  eintritt: text("eintritt").notNull().default(""),
  /** Schmuckfarbe für Linien und Überschriften, z. B. #2f5d3a. */
  farbe: text("farbe").notNull().default("#2f5d3a"),
  /** Schriftpaar für den gedruckten Katalog (siehe KATALOG_SCHRIFTEN). */
  schrift: text("schrift", { enum: KATALOG_SCHRIFTEN }).notNull().default("klassisch"),
  /** Gestaltung von Titelseite und Köpfen (siehe KATALOG_STILE). */
  stil: text("stil", { enum: KATALOG_STILE }).notNull().default("klassisch"),
  /** Aufteilung des Tierteils (siehe KATALOG_AUFTEILUNGEN). */
  aufteilung: text("aufteilung", { enum: KATALOG_AUFTEILUNGEN }).notNull().default("zweispaltig"),
  /** Rassebilder im Tierteil drucken (aus: dünnerer Katalog, die Stiche der Spartenköpfe bleiben). */
  rassebilder: boolean("rassebilder").notNull().default(true),
  /** Jede Sparte beginnt oben auf einer neuen Seite. */
  sparteNeueSeite: boolean("sparte_neue_seite").notNull().default(false),
  /** Impressum nach Landespressegesetz: Druckerei mit Anschrift oder „Eigendruck“. */
  druck: text("druck").notNull().default(""),
  /** Akzentfarbe für Linien, kleine Überschriften und Seitenzahlen; leer = wie die Vereinsfarbe. */
  akzent: text("akzent").notNull().default(""),
  /** Hintergrund der Titelseite (siehe KATALOG_TITELHINTERGRUENDE). */
  titelHintergrund: text("titel_hintergrund", { enum: KATALOG_TITELHINTERGRUENDE }).notNull().default("weiss"),
  /** Titelfoto eingepasst oder randlos (siehe KATALOG_TITELBILDER). */
  titelbild: text("titelbild", { enum: KATALOG_TITELBILDER }).notNull().default("eingepasst"),
  /** Fußzeile der Seiten (siehe KATALOG_FUSSZEILEN). */
  fusszeile: text("fusszeile", { enum: KATALOG_FUSSZEILEN }).notNull().default("linie"),
  /** Stärke der Schmucklinien (siehe KATALOG_LINIEN). */
  linien: text("linien", { enum: KATALOG_LINIEN }).notNull().default("normal"),
  /** Ausgeblendete Teile des Katalogs (siehe KATALOG_TEILE). */
  ausgeblendet: jsonb("ausgeblendet").$type<KatalogTeil[]>().notNull().default([]),
  /** „Kommende Schauen“: nur Kreisschauen dieses Kreisverbands bzw. Landesschauen dieses Landesverbands (leer = alle). */
  termineKreis: text("termine_kreis").notNull().default(""),
  termineLand: text("termine_land").notNull().default(""),
});

// ── Kommende Schauen (Termine anderer Schauen für den Katalog) ─────────

export const TERMIN_STATUS = ["vorschlag", "uebernommen", "verworfen"] as const;

/**
 * Abonnierter Kalender (iCal) eines anderen Vereins oder Verbands. Der Server ruft ihn täglich ab; neue Termine kommen
 * als Vorschlag, Änderungen an übernommenen Terminen nur als Hinweis (`schautermin.abweichung`) – nichts wird still
 * überschrieben. Ebene und Verband gelten für alle Termine des Kalenders.
 */
export const terminabo = pgTable(
  "terminabo",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    ebene: text("ebene", { enum: TERMIN_EBENEN }).notNull(),
    kreisverband: text("kreisverband").notNull().default(""),
    landesverband: text("landesverband").notNull().default(""),
    aktiv: boolean("aktiv").notNull().default(true),
    letzterAbruf: ts("letzter_abruf"),
    letzterErfolg: ts("letzter_erfolg"),
    /** Leer nach erfolgreichem Abruf; sonst der Grund – sichtbar auf der Pflegeseite. */
    letzterFehler: text("letzter_fehler").notNull().default(""),
    /** Termine im Kalender beim letzten erfolgreichen Abruf. */
    anzahl: integer("anzahl").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("terminabo_org_idx").on(t.organisationId)],
);

/** Termin einer anderen Schau (von Hand eingetragen oder aus einem Abo). Nur übernommene kommen in den Katalog. */
export const schautermin = pgTable(
  "schautermin",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ort: text("ort").notNull().default(""),
    von: date("von", { mode: "string" }).notNull(),
    bis: date("bis", { mode: "string" }),
    ebene: text("ebene", { enum: TERMIN_EBENEN }).notNull(),
    kreisverband: text("kreisverband").notNull().default(""),
    landesverband: text("landesverband").notNull().default(""),
    /** Quellenangabe für den Katalog, z. B. „eigene Eintragung“, „bdrg.de (nachgesehen)“ oder der Name des Abos. */
    quelle: text("quelle").notNull().default(""),
    quelleUrl: text("quelle_url").notNull().default(""),
    aboId: integer("abo_id").references(() => terminabo.id, { onDelete: "set null" }),
    /** Kennung im abonnierten Kalender (UID), leer bei eigener Eintragung. */
    uid: text("uid").notNull().default(""),
    status: text("status", { enum: TERMIN_STATUS }).notNull().default("uebernommen"),
    /** Was die Quelle inzwischen anders meldet (übernommene Termine werden nicht überschrieben). */
    abweichung: jsonb("abweichung").$type<Abweichung | null>(),
    abgerufenAm: ts("abgerufen_am"),
    createdAt: created(),
  },
  (t) => [index("schautermin_org_von_idx").on(t.organisationId, t.von), uniqueIndex("schautermin_abo_uid").on(t.aboId, t.uid)],
);

/** Bilder für den Katalog (Logo, Titelbild, Fotos zu Grußworten, Anzeigen, Hallenplan). Nur PNG und JPEG. */
export const bild = pgTable(
  "bild",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id")
      .notNull()
      .references(() => schau.id, { onDelete: "cascade" }),
    /**
     * "logo", "titel" und "sockel" (Bild der Sockelverkleidung im 3D-Hallenplan) gibt es je Schau höchstens einmal; sonst
     * gehört das Bild zu einem Beitrag.
     */
    rolle: text("rolle", { enum: ["logo", "titel", "beitrag", "sockel"] }).notNull().default("beitrag"),
    mime: text("mime", { enum: ["image/png", "image/jpeg"] }).notNull(),
    name: text("name").notNull().default(""),
    daten: bytea("daten").notNull(),
    /** Bildnachweis (§ 13 UrhG, Lizenzbedingungen): leer bei eigenen Fotos des Vereins und bei Anzeigen des Inserenten. */
    urheber: text("urheber").notNull().default(""),
    lizenz: text("lizenz").notNull().default(""),
    quelle: text("quelle").notNull().default(""),
    createdAt: created(),
  },
  (t) => [index("bild_schau_idx").on(t.schauId)],
);

/**
 * Bild einer Rasse für den Katalog (bei der Rassen-Überschrift), je Verein. Zugeordnet über den Rassennamen, damit es
 * auch für ein neues Verzeichnis gilt. Urheber, Lizenz und Quelle stehen im Bildnachweis des Katalogs. Automatisch
 * gefundene Bilder sind ungeprüft und kommen erst nach dem Prüfen in den Katalog.
 */
export const rassebild = pgTable(
  "rassebild",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    rasse: text("rasse").notNull(),
    mime: text("mime", { enum: ["image/png", "image/jpeg"] }).notNull(),
    daten: bytea("daten").notNull(),
    breite: integer("breite").notNull(),
    hoehe: integer("hoehe").notNull(),
    urheber: text("urheber").notNull().default(""),
    lizenz: text("lizenz").notNull().default(""),
    lizenzUrl: text("lizenz_url").notNull().default(""),
    quelle: text("quelle").notNull().default(""),
    geprueft: boolean("geprueft").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("rassebild_org_rasse").on(t.organisationId, t.rasse)],
);

/** Grußworte, Anzeigen und freie Seiten (z. B. Hallenplan) im Vorspann bzw. Anhang des Katalogs. */
export const katalogBeitrag = pgTable(
  "katalog_beitrag",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id")
      .notNull()
      .references(() => schau.id, { onDelete: "cascade" }),
    art: text("art", { enum: BEITRAG_ARTEN }).notNull(),
    folge: integer("folge").notNull().default(0),
    titel: text("titel").notNull().default(""),
    /** Grußwort: Name und Funktion des Verfassers. Anzeige: Firma. */
    unterzeile: text("unterzeile").notNull().default(""),
    text: text("text").notNull().default(""),
    bildId: integer("bild_id").references(() => bild.id, { onDelete: "set null" }),
    groesse: text("groesse", { enum: ANZEIGE_GROESSEN }).notNull().default("ganz"),
  },
  (t) => [index("katalog_beitrag_schau_idx").on(t.schauId, t.art, t.folge)],
);

// ── Kassenbuch und Belegarchiv ──────────────────────────────────────────

export const KASSENBEWEGUNG_ARTEN = ["anfangsbestand", "einlage", "entnahme"] as const;

/** Bargeld, das nicht aus Verkauf, Meldegeld oder Auszahlung stammt: Wechselgeld, Einlage, Entnahme (z. B. Bank). */
export const kassenbewegung = pgTable("kassenbewegung", {
  id: serial("id").primaryKey(),
  schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
  art: text("art", { enum: KASSENBEWEGUNG_ARTEN }).notNull(),
  betragCent: integer("betrag_cent").notNull(),
  grund: text("grund").notNull().default(""),
  erfasstVon: integer("erfasst_von").references(() => benutzer.id),
  createdAt: createdNachSperre(),
});

/** Tagesabschluss: gezählter Bestand gegen Soll. Danach nimmt die Kasse für diesen Tag keine Barbuchung mehr an. */
export const kassenabschluss = pgTable(
  "kassenabschluss",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    datum: date("datum").notNull(),
    sollCent: integer("soll_cent").notNull(),
    istCent: integer("ist_cent").notNull(),
    differenzCent: integer("differenz_cent").notNull(),
    bemerkung: text("bemerkung").notNull().default(""),
    erfasstVon: integer("erfasst_von").references(() => benutzer.id),
    /** 0 = Tagesabschluss; 1, 2, … = Nachtragsabschluss für Barbuchungen nach einem Abschluss am selben Tag. */
    nachtrag: integer("nachtrag").notNull().default(0),
    createdAt: createdNachSperre(),
  },
  (t) => [uniqueIndex("kassenabschluss_tag").on(t.schauId, t.datum, t.nachtrag)],
);

/**
 * Belegarchiv: jeder Kaufbeleg und jede Quittung wird beim Buchen als PDF mit SHA-256 abgelegt und danach
 * nur noch aus dem Archiv ausgegeben (unveränderbar, Trigger in db/schutz.sql). Storno ergibt einen eigenen Beleg.
 */
export const beleg = pgTable(
  "beleg",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    art: text("art", { enum: ["kaufbeleg", "kaufbeleg-storno", "quittung", "quittung-storno", "einzahlung", "eigenbeleg", "spende", "spende-storno"] }).notNull(),
    nummer: integer("nummer").notNull(),
    pdf: bytea("pdf").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("beleg_unique").on(t.schauId, t.art, t.nummer)],
);

// ── Hash-Kette: Verwaltung (Trigger in db/schutz.sql) ───────────────────

/** Letzter Eintrag der Kette (eine Zeile). Im Schema, damit db:push sie nicht löscht. */
export const aenderungKette = pgTable("aenderung_kette", {
  id: integer("id").primaryKey().default(1),
  letzteId: integer("letzte_id"),
  letzterHash: text("letzter_hash"),
});

/** Vermerk über gelöschte Protokolleinträge (nur beim Entfernen ganzer Demo-/Test-Vereine erlaubt). Die Prüfung meldet Lücken ohne Vermerk. */
export const aenderungGeloescht = pgTable("aenderung_geloescht", {
  id: integer("id").primaryKey(),
  schauId: integer("schau_id"),
  zeitpunkt: ts("zeitpunkt").notNull().defaultNow(),
});

/** Vermerk über anonymisierte Protokolleinträge (Inhalt und Grund geleert, z. B. nach Art. 17 DSGVO oder Fristablauf). */
export const aenderungAnonymisiert = pgTable("aenderung_anonymisiert", {
  id: integer("id").primaryKey(),
  zeitpunkt: ts("zeitpunkt").notNull().defaultNow(),
});

/**
 * SEPA-Überweisungslauf. Die Datei mit IBANs liegt nur hier (nicht im Protokoll) und wird nach dem Buchen oder
 * Verwerfen um IBAN und Kontoinhaber gekürzt. Je Schau höchstens ein offener Lauf.
 */
export const sepaLauf = pgTable(
  "sepa_lauf",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    nachrichtId: text("nachricht_id").notNull(),
    /** Mit IBAN und Kontoinhaber, solange die Datei offen ist – verschlüsselt gespeichert (db/geheim.ts). */
    daten: geheimJson<unknown>("daten", "sepaLauf.daten").notNull(),
    status: text("status", { enum: ["offen", "gebucht", "verworfen"] }).notNull().default("offen"),
    erstelltVon: text("erstellt_von").notNull().default(""),
    createdAt: created(),
    abgeschlossenAm: ts("abgeschlossen_am"),
  },
  (t) => [uniqueIndex("sepa_lauf_nachricht").on(t.nachrichtId), uniqueIndex("sepa_lauf_offen").on(t.schauId).where(sql`status = 'offen'`)],
);

// Spenden: eigene Datei (Spender, Spenden, Zuwendungsbestätigungen).
export * from "./schema-spenden";
// Import aus Altprogrammen: Importläufe.
export * from "./schema-import";
