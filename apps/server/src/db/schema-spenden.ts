/**
 * Spenden (Entscheidung 013): Spenderverzeichnis des Vereins, Spenden je Schau und Zuwendungsbestätigungen.
 * Über schema.ts exportiert. Spenden und Bestätigungen sind wie alle Kassendaten unveränderbar – Korrektur nur per
 * Storno (db/schutz.sql). Die Fachregeln stehen in packages/domain/src/spenden.ts.
 */
import { SPENDE_ARTEN, SPENDE_WEGE, type Sachangaben } from "@schau/domain";
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { aussteller, benutzer, meldung, organisation, schau } from "./schema";
import { bytea, created, createdNachSperre, ts } from "./spalten";

/** Wer gespendet hat: Person oder Firma, mit Anschrift für die Zuwendungsbestätigung. */
export const spender = pgTable(
  "spender",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id),
    istFirma: boolean("ist_firma").notNull().default(false),
    vorname: text("vorname").notNull().default(""),
    /** Nachname bzw. Name der Firma. */
    nachname: text("nachname").notNull(),
    strasse: text("strasse").notNull().default(""),
    plz: text("plz").notNull().default(""),
    ort: text("ort").notNull().default(""),
    email: text("email").notNull().default(""),
    /** Spender, der auch Aussteller ist (z. B. Spende bei der Tiermeldung). */
    ausstellerId: integer("aussteller_id").references(() => aussteller.id, { onDelete: "set null" }),
    /** Einwilligung, im Katalog als Spender genannt zu werden – getrennt für Name und Betrag. */
    nennungName: boolean("nennung_name").notNull().default(false),
    nennungBetrag: boolean("nennung_betrag").notNull().default(false),
    notiz: text("notiz").notNull().default(""),
    /** Spender aus einer Testschau (Spende bei einer Test-Meldung): verschwindet mit ihr. */
    testSchauId: integer("test_schau_id").references(() => schau.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [index("spender_name_idx").on(t.organisationId, t.nachname, t.vorname), index("spender_aussteller_idx").on(t.ausstellerId)],
);

/** Eine Spende zu einer Schau: Geld (bar, Überweisung, mit dem Meldegeld) oder Sache. */
export const spende = pgTable(
  "spende",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id")
      .notNull()
      .references(() => schau.id, { onDelete: "cascade" }),
    spenderId: integer("spender_id")
      .notNull()
      .references(() => spender.id, { onDelete: "restrict" }),
    art: text("art", { enum: SPENDE_ARTEN }).notNull(),
    weg: text("weg", { enum: SPENDE_WEGE }).notNull(),
    /** Betrag bzw. Wert der Sachzuwendung in Cent (Entscheidung 004). */
    betragCent: integer("betrag_cent").notNull(),
    /** Tag der Zuwendung. Leer bei „mit dem Meldegeld“ – dann gilt der Tag, an dem die Meldung bezahlt war. */
    datum: date("datum"),
    /**
     * Mit der Tiermeldung zugesagt (Weg „meldung“): zählt zum offenen Betrag der Meldung. Kaskade nur für das Löschen
     * einer ganzen Schau – sonst verbietet der Schutz-Trigger das Löschen von Spenden (db/schutz.sql).
     */
    meldungId: integer("meldung_id").references(() => meldung.id, { onDelete: "cascade" }),
    /** Wofür, frei (z. B. „für die Ausstellung“). */
    zweck: text("zweck").notNull().default(""),
    sache: jsonb("sache").$type<Sachangaben>(),
    /** Gegenleistung (z. B. Werbung): dann Sponsoring – keine Zuwendungsbestätigung. */
    gegenleistung: boolean("gegenleistung").notNull().default(false),
    /** Verzicht auf Erstattung von Aufwendungen (Aufwandsspende). */
    verzichtAufwand: boolean("verzicht_aufwand").notNull().default(false),
    erfasstVon: integer("erfasst_von").references(() => benutzer.id),
    createdAt: createdNachSperre(),
    storniertAm: ts("storniert_am"),
    storniertVon: integer("storniert_von").references(() => benutzer.id),
    stornoGrund: text("storno_grund").notNull().default(""),
  },
  (t) => [index("spende_schau_idx").on(t.schauId), index("spende_spender_idx").on(t.spenderId), index("spende_meldung_idx").on(t.meldungId)],
);

/** Zuwendungsbestätigung (einzeln oder Sammelbestätigung), fortlaufend nummeriert je Verein, mit dem PDF als Doppel. */
export const zuwendungsbestaetigung = pgTable(
  "zuwendungsbestaetigung",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id),
    nummer: integer("nummer").notNull(),
    spenderId: integer("spender_id")
      .notNull()
      .references(() => spender.id, { onDelete: "restrict" }),
    art: text("art", { enum: ["einzel", "sammel"] }).notNull(),
    betragCent: integer("betrag_cent").notNull(),
    pdf: bytea("pdf").notNull(),
    sha256: text("sha256").notNull(),
    erstelltVon: integer("erstellt_von").references(() => benutzer.id),
    createdAt: created(),
    storniertAm: ts("storniert_am"),
    storniertVon: integer("storniert_von").references(() => benutzer.id),
    stornoGrund: text("storno_grund").notNull().default(""),
  },
  (t) => [uniqueIndex("zuwendungsbestaetigung_nummer").on(t.organisationId, t.nummer)],
);

/** Welche Spenden eine Bestätigung umfasst. Nach einem Storno darf eine Spende neu bestätigt werden. */
export const bestaetigungSpende = pgTable(
  "bestaetigung_spende",
  {
    bestaetigungId: integer("bestaetigung_id")
      .notNull()
      .references(() => zuwendungsbestaetigung.id, { onDelete: "cascade" }),
    spendeId: integer("spende_id")
      .notNull()
      .references(() => spende.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.bestaetigungId, t.spendeId] }), index("bestaetigung_spende_spende_idx").on(t.spendeId)],
);
