/** Preise, Verkauf, Geld: Stiftungen, Preisvergabe, Verkauf mit Zahlungseingang, Tiergesundheit, Auszahlungen. Über schema.ts exportiert. */
import { boolean, date, integer, pgTable, serial, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { zahlartEnum } from "./schema-aufzaehlungen";
import { preisrichter } from "./schema-bewertung";
import { kassenbewegung } from "./schema-kasse";
import { benutzer } from "./schema-mandant";
import { aussteller, katalogeintrag, meldung } from "./schema-meldung";
import { preisart, schau } from "./schema-schau";
import { created, createdNachSperre, ts } from "./spalten";

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
