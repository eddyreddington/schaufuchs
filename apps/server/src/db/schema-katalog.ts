/** Katalog-Gestaltung: Druckvorlagen, Gestaltung, Bilder, Rassebilder, Beiträge (Grußworte, Anzeigen). Über schema.ts exportiert. */
import { KATALOG_AUFTEILUNGEN, KATALOG_FUSSZEILEN, KATALOG_LINIEN, KATALOG_SCHRIFTEN, KATALOG_STILE, KATALOG_TITELBILDER, KATALOG_TITELHINTERGRUENDE, type KatalogTeil } from "@schau/domain";
import { boolean, index, integer, jsonb, pgTable, serial, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { organisation } from "./schema-mandant";
import { schau } from "./schema-schau";
import { bytea, created } from "./spalten";

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
