/**
 * Vereinsverzeichnis einspielen (Namen der Rassegeflügelzuchtvereine aus öffentlichen Verbandsseiten):
 *
 *   bun src/vereinsverzeichnis-import.ts --datei <vereine.json>
 *
 * Die Datei ist eine Liste von {name, kreisverband, landesverband, quelle}. Nur diese Felder werden übernommen – keine
 * Personen, keine Adressen. Vorhandene Einträge bleiben unverändert (nichts wird überschrieben).
 */
import { readFileSync } from "node:fs";
import { sql } from "./db/client";
import { vereineEinspielen } from "./services/vereinsverzeichnis";

if (import.meta.main) {
  const i = process.argv.indexOf("--datei");
  const datei = i > 0 ? process.argv[i + 1] : undefined;
  if (!datei) {
    console.error("Aufruf: bun src/vereinsverzeichnis-import.ts --datei <vereine.json>");
    process.exitCode = 1;
  } else {
    const liste = JSON.parse(readFileSync(datei, "utf8")) as unknown;
    if (!Array.isArray(liste)) throw new Error("Die Datei muss eine Liste sein.");
    const r = await vereineEinspielen(liste, { datei });
    console.log(`Vereinsverzeichnis: ${r.neu} neu, ${r.schonVorhanden} schon vorhanden (unverändert), ${r.doppeltInDatei} doppelt in der Datei, ${r.abgelehnt.length} abgelehnt, ${r.angeboten} angeboten.`);
    for (const a of r.abgelehnt.slice(0, 50)) console.log(`  Zeile ${a.zeile}: ${a.grund}`);
  }
  await sql.end();
}
