/** Spaltenarten, die mehrere Schemadateien nutzen (schema.ts, schema-spenden.ts). */
import { sql } from "drizzle-orm";
import { customType, timestamp } from "drizzle-orm/pg-core";

export const ts = (name: string) => timestamp(name, { withTimezone: true });
export const created = () => ts("created_at").notNull().defaultNow();
/**
 * Zeitstempel von Kassenbuchungen und Tagesabschlüssen: Zeitpunkt des Einfügens (nach der Kassensperre), nicht der Beginn
 * der Transaktion – sonst sortiert eine Buchung, die auf die Sperre gewartet hat, vor einen Abschluss, der sie nicht zählte.
 */
export const createdNachSperre = () => ts("created_at").notNull().default(sql`clock_timestamp()`);
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
