/** Spielt ausstehende Datenbank-Migrationen ein (Produktion, Docker-Start). */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { db, sql } from "./db/client";
import { pruefeDatenschluessel, verschluesseleBestand } from "./db/geheim-bestand";
import { schutzEinspielen } from "./db/schutz";

await migrate(db, { migrationsFolder: join(import.meta.dir, "../drizzle") });
await schutzEinspielen(sql);
// IBAN, Kontoinhaber, SEPA-Dateien und Zwei-Faktor-Geheimnisse aus der Zeit vor der Verschlüsselung umstellen.
await pruefeDatenschluessel(db);
const umgestellt = await verschluesseleBestand(db);
if (umgestellt.aussteller + umgestellt.benutzer + umgestellt.sepa) {
  console.log(`Verschlüsselt: ${umgestellt.aussteller} Aussteller, ${umgestellt.benutzer} Benutzer (Zwei-Faktor), ${umgestellt.sepa} SEPA-Dateien.`);
}
console.log("Datenbank ist aktuell.");
await sql.end();
