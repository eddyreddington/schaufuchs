/** Preisrichter und Bewertung: Vereinsverzeichnis, Preisrichter, Einteilung, Bewertung, Textbausteine. Über schema.ts exportiert. */
import { boolean, integer, jsonb, pgTable, serial, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { erfasstAufEnum, sondernoteEnum, zusageEnum } from "./schema-aufzaehlungen";
import { organisation } from "./schema-mandant";
import { katalogeintrag } from "./schema-meldung";
import { schau } from "./schema-schau";
import { created, ts } from "./spalten";

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
  /** BDRG-Gruppen, für die er zugelassen ist (A, Z1, BV …); leer = keine Einschränkung über Gruppen. */
  gruppen: jsonb("gruppen").$type<string[]>().notNull().default([]),
  /** Obmann (Preisrichter derselben Schau mit istObmann), dem dieser Preisrichter zugeordnet ist. */
  obmannId: integer("obmann_id").references((): AnyPgColumn => preisrichter.id, { onDelete: "set null" }),
  /** Stand der Zusage; dazu, wofür er zugesagt hat (z. B. Jahre), und ein Vorbehalt als freier Text. */
  zusage: zusageEnum("zusage").notNull().default("offen"),
  zugesagtFuer: text("zugesagt_fuer").notNull().default(""),
  vorbehalt: text("vorbehalt").notNull().default(""),
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
