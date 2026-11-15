/** Spielt die Schutz-Trigger (schutz.sql) ein: nach Migrationen, nach db:push und in den Tests. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { sql as Sql } from "./client";

export async function schutzEinspielen(sql: typeof Sql) {
  await sql.unsafe(readFileSync(join(import.meta.dir, "schutz.sql"), "utf8"));
}

if (import.meta.main) {
  const { sql } = await import("./client");
  await schutzEinspielen(sql);
  console.log("Schutz für Protokoll und Kassendaten eingespielt.");
  await sql.end();
}
