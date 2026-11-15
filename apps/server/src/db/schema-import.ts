/**
 * Import aus Altprogrammen (Entscheidung 015): je Importlauf, was er angelegt hat – damit „Zurücknehmen“ genau das
 * wieder entfernt, solange nichts weiter damit geschehen ist. Über schema.ts exportiert.
 */
import { integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { benutzer, organisation, schau } from "./schema";
import { created, ts } from "./spalten";

export const importlauf = pgTable("importlauf", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id")
    .notNull()
    .references(() => organisation.id),
  /** Meldungen gehen in diese Schau; leer beim Import ins Ausstellerverzeichnis. */
  schauId: integer("schau_id").references(() => schau.id, { onDelete: "cascade" }),
  art: text("art", { enum: ["aussteller", "meldungen"] }).notNull(),
  dateiname: text("dateiname").notNull().default(""),
  /** Neu angelegte Aussteller (vorhandene, nur wiedererkannte stehen hier nicht). */
  ausstellerIds: jsonb("aussteller_ids").$type<number[]>().notNull().default([]),
  meldungIds: jsonb("meldung_ids").$type<number[]>().notNull().default([]),
  anzahlTiere: integer("anzahl_tiere").notNull().default(0),
  erstelltVon: integer("erstellt_von").references(() => benutzer.id),
  createdAt: created(),
  zurueckgenommenAm: ts("zurueckgenommen_am"),
  zurueckgenommenVon: integer("zurueckgenommen_von").references(() => benutzer.id),
});
