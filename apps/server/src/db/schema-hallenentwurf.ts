/**
 * Entwürfe des Hallenplans (Entscheidung 017): Je Schau mehrere Varianten speichern und laden; ist entschieden, gehen
 * die übrigen ins Archiv des Vereins und lassen sich in späteren Schauen laden. Über schema.ts exportiert.
 */
import type { Halle } from "@schau/domain";
import { boolean, index, integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { benutzer, organisation, schau } from "./schema";
import { created, ts } from "./spalten";

export const hallenentwurf = pgTable(
  "hallenentwurf",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisation.id),
    /** Schau, für die der Entwurf entstand; das Archiv bleibt, auch wenn die Schau gelöscht wird. */
    schauId: integer("schau_id").references(() => schau.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    halle: jsonb("halle").$type<Halle>().notNull(),
    /** Im Archiv des Vereins (nach der Entscheidung für einen anderen Plan). */
    archiviert: boolean("archiviert").notNull().default(false),
    /** Name der Schau zum Zeitpunkt des Speicherns – für die Anzeige im Archiv. */
    herkunft: text("herkunft").notNull().default(""),
    erstelltVon: integer("erstellt_von").references(() => benutzer.id),
    createdAt: created(),
    archiviertAm: ts("archiviert_am"),
  },
  (t) => [index("hallenentwurf_org_idx").on(t.organisationId, t.archiviert)],
);
