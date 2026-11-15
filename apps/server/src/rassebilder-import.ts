/**
 * Rassebilder aus einem Verzeichnis einspielen (z. B. aus Wikimedia Commons gesammelt): `ergebnis.json` mit
 * {rasse, datei, urheber, lizenz, lizenzUrl, quelle, sicherheit} und die Dateien in `bilder/`.
 *
 *   bun src/rassebilder-import.ts --verzeichnis <pfad> --verein <organisation-id> [--hoch-geprueft]
 *
 * Vorhandene Bilder des Vereins bleiben (nichts wird überschrieben). Alles kommt „ungeprüft“ hinein und erst nach dem
 * Prüfen in den Katalog. Mit `--hoch-geprueft` gelten Treffer mit Sicherheit „hoch“ (eigener Wikipedia-Artikel der
 * Rasse) gleich als geprüft – nur, wenn jemand die Bilder vorher angesehen hat.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, sql } from "./db/client";
import { protokolliere } from "./services/protokoll";
import { speichereRassebild } from "./services/rassebild";
import { pruefeLizenz } from "@schau/domain";

/** Nur http(s)-Adressen übernehmen (eine „javascript:“-Adresse würde in der Oberfläche als Link ausgeführt). */
const nurHttp = (v: string | undefined) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim().slice(0, 500) : "");

type Fund = { rasse: string; datei: string | null; urheber?: string; lizenz?: string; lizenzUrl?: string; quelle?: string; sicherheit?: string };

export async function rassebilderEinspielen(verzeichnis: string, organisationId: number, opts: { hochGeprueft?: boolean } = {}) {
  const funde = JSON.parse(readFileSync(join(verzeichnis, "ergebnis.json"), "utf8")) as Fund[];
  let neu = 0, vorhanden = 0, fehler = 0;
  for (const f of funde) {
    if (!f.datei) continue;
    const pfad = [join(verzeichnis, "bilder", f.datei), join(verzeichnis, f.datei)].find((p) => existsSync(p));
    if (!pfad) {
      fehler++;
      continue;
    }
    try {
      const daten = readFileSync(pfad);
      const angaben = { urheber: (f.urheber ?? "").slice(0, 300), lizenz: (f.lizenz ?? "").slice(0, 100), lizenzUrl: nurHttp(f.lizenzUrl), quelle: nurHttp(f.quelle) };
      // Freigegeben nur mit vollständiger, katalogtauglicher Lizenz (kein NC/ND, CC BY mit Urheber).
      const lizenzOk = pruefeLizenz(angaben, true);
      if (lizenzOk.ok && !angaben.lizenzUrl) angaben.lizenzUrl = lizenzOk.lizenzUrl;
      const geprueft = !!opts.hochGeprueft && f.sicherheit === "hoch" && lizenzOk.ok;
      const gespeichert = await db.transaction(async (tx) => {
        const r = await speichereRassebild(tx, organisationId, f.rasse, daten, angaben, { geprueft, nurWennLeer: true });
        if (r) await protokolliere(tx, { schauId: null, tabelle: "rassebild", datensatzId: r.id, aktion: "Rassebild gespeichert", neu: { rasse: f.rasse, ...angaben, geprueft }, akteur: { text: "Einspiel-Skript" } });
        return r != null;
      });
      if (gespeichert) neu++;
      else vorhanden++;
    } catch (e) {
      fehler++;
      console.error(`${f.rasse}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await db.transaction((tx) =>
    protokolliere(tx, { schauId: null, tabelle: "rassebild", datensatzId: null, aktion: "Rassebilder eingespielt", neu: { organisationId, neu, vorhanden, fehler, hochGeprueft: !!opts.hochGeprueft }, akteur: { text: "Einspiel-Skript" } }),
  );
  return { neu, vorhanden, fehler };
}

if (import.meta.main) {
  const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const verzeichnis = arg("--verzeichnis");
  const verein = Number(arg("--verein"));
  if (!verzeichnis || !Number.isInteger(verein)) {
    console.error("Aufruf: bun src/rassebilder-import.ts --verzeichnis <pfad> --verein <organisation-id> [--hoch-geprueft]");
    process.exitCode = 1;
  } else {
    const r = await rassebilderEinspielen(verzeichnis, verein, { hochGeprueft: process.argv.includes("--hoch-geprueft") });
    console.log(`Rassebilder: ${r.neu} neu, ${r.vorhanden} schon vorhanden (unverändert), ${r.fehler} Fehler.`);
  }
  await sql.end();
}
