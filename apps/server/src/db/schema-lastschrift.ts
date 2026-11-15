/**
 * SEPA-Lastschrift (Entscheidung 018): Mandate der Aussteller und Lastschriftläufe je Schau. IBAN, Kontoinhaber und die
 * Posten eines Laufs verschlüsselt (db/geheim.ts). Über schema.ts exportiert.
 */
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { geheimJson, geheimText } from "./geheim";
import { aussteller, benutzer, organisation, schau } from "./schema";
import { created, ts } from "./spalten";

export const sepaMandat = pgTable(
  "sepa_mandat",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id),
    ausstellerId: integer("aussteller_id")
      .notNull()
      .references(() => aussteller.id, { onDelete: "cascade" }),
    /** Mandatsreferenz, eindeutig je Verein (Gläubiger). */
    referenz: text("referenz").notNull(),
    unterschriebenAm: date("unterschrieben_am").notNull(),
    /** Wiederkehrend (jede Schau) oder einmalig. */
    wiederkehrend: boolean("wiederkehrend").notNull().default(true),
    iban: geheimText("iban", "sepaMandat.iban").notNull(),
    kontoinhaber: geheimText("kontoinhaber", "sepaMandat.kontoinhaber").notNull(),
    widerrufenAm: date("widerrufen_am"),
    /** Fälligkeit der letzten eingezogenen Lastschrift (36 Monate ohne Nutzung: Mandat verfällt). */
    letzteNutzungAm: date("letzte_nutzung_am"),
    erstelltVon: integer("erstellt_von").references(() => benutzer.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("sepa_mandat_referenz").on(t.organisationId, t.referenz), index("sepa_mandat_aussteller").on(t.ausstellerId)],
);

export interface LastschriftLaufPosten {
  meldungId: number;
  ausstellerId: number;
  mandatId: number;
  name: string;
  kontoinhaber: string;
  iban: string;
  betragCent: number;
  mandatsreferenz: string;
  unterschriebenAm: string;
  wiederkehrend: boolean;
  /** Rücklastschrift gebucht (nach dem Buchen des Laufs). */
  zurueck?: boolean;
}
export interface LastschriftLaufDaten {
  posten: LastschriftLaufPosten[];
  glaeubiger: { name: string; iban: string; bic: string; glaeubigerId: string };
  summeCent: number;
  erstelltAm: string;
}

export const lastschriftLauf = pgTable(
  "lastschrift_lauf",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id")
      .notNull()
      .references(() => schau.id, { onDelete: "cascade" }),
    nachrichtId: text("nachricht_id").notNull(),
    faelligAm: date("faellig_am").notNull(),
    daten: geheimJson<LastschriftLaufDaten>("daten", "lastschriftLauf.daten").notNull(),
    status: text("status", { enum: ["offen", "gebucht", "verworfen"] }).notNull().default("offen"),
    erstelltVon: integer("erstellt_von").references(() => benutzer.id),
    createdAt: created(),
    abgeschlossenAm: ts("abgeschlossen_am"),
  },
  (t) => [uniqueIndex("lastschrift_lauf_nachricht").on(t.nachrichtId), uniqueIndex("lastschrift_lauf_offen").on(t.schauId).where(sql`status = 'offen'`)],
);
