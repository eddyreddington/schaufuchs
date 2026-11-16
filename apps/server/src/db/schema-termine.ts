/** Kommende Schauen: abonnierte Kalender und Termine anderer Schauen für den Katalog. Über schema.ts exportiert. */
import { TERMIN_EBENEN, type Abweichung } from "@schau/domain";
import { boolean, date, index, integer, jsonb, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organisation } from "./schema-mandant";
import { created, ts } from "./spalten";

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
