/** Kassenbuch und Belegarchiv: Kassenbewegungen, Tagesabschlüsse, Belege; SEPA-Überweisungsläufe. Über schema.ts exportiert. */
import { date, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { geheimJson } from "./geheim";
import { benutzer } from "./schema-mandant";
import { schau } from "./schema-schau";
import { bytea, created, createdNachSperre, ts } from "./spalten";

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
