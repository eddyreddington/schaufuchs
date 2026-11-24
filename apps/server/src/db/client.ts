import { sql as sqlTag } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

export const sql = postgres(config.databaseUrl, { max: 10, onnotice: () => {} });
export const db = drizzle(sql, { schema });

/**
 * Höchste Wartezeit auf eine Sperre je Transaktion (Entscheidung 033). Wartet ein Aufruf länger, bricht er mit 55P03 ab
 * und meldet „Bitte noch einmal versuchen“, statt die Verbindung (und bei vollem Pool alle) festzuhalten. Je Transaktion
 * gelesen, damit ein Test sie kurz setzen kann. Migrationen (eigene Transaktion des Migrators), Startskript und
 * Sicherung laufen nicht über `db.transaction` und haben keine Grenze.
 */
export const sperrGrenze = () => process.env.DB_LOCK_TIMEOUT || "10s";

const transaktion = db.transaction.bind(db);
db.transaction = ((f, cfg) =>
  transaktion(async (tx) => {
    await tx.execute(sqlTag`select set_config('lock_timeout', ${sperrGrenze()}, true)`);
    return f(tx);
  }, cfg)) as typeof db.transaction;

export type DB = typeof db;
/** Datenbank oder laufende Transaktion. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;
