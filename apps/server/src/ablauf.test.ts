/**
 * Durchlauf einer kompletten Schau gegen eine echte Test-Datenbank (schau_test):
 * Meldung → Zahlung → Katalog → Preisrichter → Bewertung am Tablet → Obmann → Preise → Freigabe → Verkauf → Abrechnung,
 * dazu alle Prüfungen aus den Audits. Die Teile liegen in ./tests und laufen in dieser Reihenfolge nacheinander gegen
 * dieselbe Datenbank – spätere Teile nutzen Verein, Benutzer und Daten der früheren. Neue Prüfungen in den passenden Teil
 * oder als neuen Teil am Ende.
 */
import { afterAll, beforeAll } from "bun:test";
import { join } from "node:path";
import { config } from "./config";
import { m, setzeM } from "./tests/kontext";

beforeAll(async () => {
  const push = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
  });
  if (push.exitCode !== 0) throw new Error(push.stderr.toString());
  if (!config.databaseUrl.includes("test")) throw new Error(`Tests laufen nicht gegen eine Test-Datenbank: ${config.databaseUrl}`);
  const client = await import("./db/client");
  await (await import("./db/schutz")).schutzEinspielen(client.sql);
  // Geschützte Tabellen (Protokoll, Kasse) lassen sich nur mit der Löschfreigabe in derselben Transaktion leeren.
  await client.sql.begin(async (tx) => {
    await tx.unsafe("set local schau.loeschen = 'ja'");
    await tx.unsafe("truncate organisation, benutzer, sitzung, stammdaten_version, schau, aussteller, postausgang, vereinsverzeichnis restart identity cascade");
    await tx.unsafe("update aenderung_kette set letzte_id = null, letzter_hash = null");
    await tx.unsafe("truncate aenderung_geloescht, aenderung_anonymisiert");
  });
  setzeM({ appRouter: (await import("./router")).appRouter, db: client.db, sql: client.sql, schema: await import("./db/schema"), eq: (await import("drizzle-orm")).eq, desc: (await import("drizzle-orm")).desc, inArray: (await import("drizzle-orm")).inArray, ne: (await import("drizzle-orm")).ne });
});

afterAll(async () => {
  await m?.sql.end();
});

import "./tests/01-schau-ablauf";
import "./tests/02-rechte-und-kasse";
import "./tests/03-tablet-halle-drucke";
import "./tests/04-meldung-katalog-sicherheit";
import "./tests/05-datenschutz-fachrecht";
import "./tests/06-gobd-beta";
import "./tests/07-runde4";
import "./tests/08-betrieb-grenzen";
import "./tests/09-nachbesserung-runde5";
import "./tests/10-benutzer-zugang";
import "./tests/11-runde6-bausteine";
import "./tests/12-runde7-rollen-kasse";
import "./tests/13-luecken";
import "./tests/14-konzept-audit";
import "./tests/15-info-runde7";
import "./tests/16-schau-loeschen";
import "./tests/17-kaefige";
import "./tests/18-adressvorschlaege";
import "./tests/19-hallenplan";
import "./tests/20-schau-vorlage";
import "./tests/21-bestaetigung-zuruecknehmen";
import "./tests/22-audit-runde8";
import "./tests/23-preisrichter-sparten";
import "./tests/24-plan-fest";
import "./tests/25-rassebilder";
import "./tests/26-aussteller-verwaltung";
import "./tests/27-verschluesselung";
import "./tests/28-testschau";
import "./tests/29-einteilung-rassen";
import "./tests/30-einteilung-gegenpruefung";
import "./tests/31-stellvorschlaege";
import "./tests/32-eingabepruefung";
import "./tests/33-vereinsverzeichnis";
import "./tests/34-katalog-gestaltung";
import "./tests/35-pruefung-nachbesserung";
import "./tests/36-nach-plan-nummerieren";
import "./tests/37-kommende-schauen";
import "./tests/38-hallenplan-entfernen";
import "./tests/39-hallenplan-druck";
import "./tests/40-hallenplan-neu-setzen";
import "./tests/41-hallenplan-3d";
import "./tests/42-hallenplan-moebel-etagen";
import "./tests/43-katalog-sortierung";
import "./tests/44-pruefliste-hallenplan";
import "./tests/45-hallenplan-tier-versetzen";
import "./tests/46-automatische-abmeldung";
import "./tests/47-druckvorlagen";
import "./tests/48-briefvorlage";
import "./tests/49-spenden";
import "./tests/50-meisterschaften";
import "./tests/51-import";
import "./tests/52-import-befunde";
import "./tests/53-teilschauen";
import "./tests/54-hallenentwuerfe";
import "./tests/55-lastschrift";
import "./tests/56-grundriss";
import "./tests/57-sprachen";
import "./tests/58-a-bogen";
import "./tests/59-girocode";
import "./tests/60-kontoauszug";
import "./tests/61-oberflaeche-sprache";
import "./tests/62-gesundheitspruefung";
import "./tests/63-lesemodus";
import "./tests/64-einrichten-befehl";
import "./tests/65-a-bogen-mitglieder";
import "./tests/66-preisverteilung";
import "./tests/67-pokaltisch";
import "./tests/68-kleinkram";
import "./tests/69-preisrichter-gruppen";
import "./tests/70-preisrichter-drucke";
import "./tests/71-preisrichter-gegenpruefung";
import "./tests/72-jugend-einteilung";
import "./tests/73-jugend-gegenpruefung";
import "./tests/74-zusatzpreise-je-pr";
import "./tests/75-halle-aussehen";
import "./tests/76-verpflichtung-zusage";
import "./tests/78-tueren";
import "./tests/79-ablauf-halle";
import "./tests/80-druck-formate";
import "./tests/81-jugend-kennzeichen";
import "./tests/82-katalog-schriften";
import "./tests/83-katalog-nicht-kuerzen";
import "./tests/84-gleichzeitig-bewertung";
import "./tests/85-gleichzeitig-geld-meldung";
import "./tests/86-gleichzeitig-katalog";
import "./tests/87-gleichzeitig-auth-schau";
import "./tests/88-gleichzeitig-gesamt";
import "./tests/89-verklemmungen";
import "./tests/90-meldung-stammsatz-geld";
import "./tests/91-anmeldung-haertung";
import "./tests/92-betrieb-gesund-einrichtung";
