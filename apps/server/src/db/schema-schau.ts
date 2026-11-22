/** Schau mit ihren Regeln: Schau, Gebühren, Preisarten. Über schema.ts exportiert. */
import { UNTERSUCHUNG_ARTEN, type Aufsteller, type DruckFormate, type FesterPlan, type Halle, type KaefigMasse, type KaefigRegel, type KaefigTyp, type MeisterschaftRegel, type NotenStufe, type SortierSchritt, type Teilschau } from "@schau/domain";
import { boolean, date, integer, jsonb, pgTable, serial, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { gebuehrArtEnum, kontingentBasisEnum, phaseEnum, preisQuelleEnum, rundungEnum } from "./schema-aufzaehlungen";
import { druckvorlage } from "./schema-katalog";
import { organisation, stammdatenVersion } from "./schema-mandant";
import { created, ts } from "./spalten";

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
  /** Bis wann die Preisrichter den Abschnitt der Verpflichtung zurücksenden sollen; leer = nicht genannt. */
  preisrichterRueckmeldungBis: date("preisrichter_rueckmeldung_bis"),
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
  /** Preisrichter-Einteilung nach Rassen: die Jugend je Rasse eigens einteilen (false = mit ihrer Rasse). */
  einteilungJugendSeparat: boolean("einteilung_jugend_separat").notNull().default(false),
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
  /**
   * Meldegeld per Überweisung auf das Vereinskonto mit Referenz je Meldung und GiroCode (Entscheidung 021). Angezeigt
   * werden dann Kontoinhaber und IBAN des Vereinskontos statt des freien Textes `bankverbindung`.
   */
  girocode: boolean("girocode").notNull().default(false),
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
  /**
   * Formatvorgaben weiterer Drucke (Entscheidung 029): Bewertungsliste, Hallenplan, Kaufbeleg, Kassenbelege. Immer über
   * druckFormateLesen() lesen; leer oder fehlend = Vorgabe (wie bisher).
   */
  druckFormate: jsonb("druck_formate").$type<Partial<DruckFormate>>().notNull().default({}),
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
