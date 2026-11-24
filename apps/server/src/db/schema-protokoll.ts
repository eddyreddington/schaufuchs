/** Protokoll und Post: Änderungsprotokoll mit Hash-Kette und ihren Vermerken, Postausgang. Über schema.ts exportiert. */
import { index, integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { preisrichter } from "./schema-bewertung";
import { benutzer, organisation } from "./schema-mandant";
import { aussteller } from "./schema-meldung";
import { schau } from "./schema-schau";
import { created, ts } from "./spalten";

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
  /** „sendet“: gerade beim Mailserver (beansprucht, damit sie nicht doppelt hinausgeht; Entscheidung 033). */
  status: text("status", { enum: ["wartet", "sendet", "gesendet", "fehler"] }).notNull().default("wartet"),
  fehler: text("fehler").notNull().default(""),
  /** Versandversuche – der Versandlauf wiederholt fehlgeschlagene Mails einige Male. */
  versuche: integer("versuche").notNull().default(0),
  createdAt: created(),
  gesendetAm: ts("gesendet_am"),
});

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
