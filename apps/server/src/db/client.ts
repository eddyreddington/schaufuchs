import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

export const sql = postgres(config.databaseUrl, { max: 10, onnotice: () => {} });
export const db = drizzle(sql, { schema });

export type DB = typeof db;
/** Datenbank oder laufende Transaktion. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;
