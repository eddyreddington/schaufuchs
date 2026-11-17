/** Betrieb: Angaben für die Gesundheitsprüfung (Entscheidung 024). Über schema.ts exportiert. */
import { sql } from "drizzle-orm";
import { check, integer, pgTable } from "drizzle-orm/pg-core";
import { ts } from "./spalten";

/**
 * Zeitpunkt der letzten geprüften Sicherung – genau eine Zeile (id 1). Schreibt der Sicherungsdienst
 * (scripts/backup.sh); der Server liest ihn nur für `/api/gesund`, denn die Sicherungsdateien selbst sieht er nicht.
 */
export const sicherung = pgTable("sicherung", { id: integer("id").primaryKey().default(1), am: ts("am").notNull() }, (t) => [
  check("sicherung_eine_zeile", sql`${t.id} = 1`),
]);
