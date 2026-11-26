/**
 * Verschlüsselte Spalten: IBAN, Kontoinhaber, Bankdaten in SEPA-Dateien, Zwei-Faktor-Geheimnis. Die Anwendung
 * verschlüsselt beim Schreiben und entschlüsselt beim Lesen (AES-256-GCM); in der Datenbank und damit in jeder
 * Sicherung steht nur der verschlüsselte Wert. Der Schlüssel kommt aus der Umgebung (DATENSCHLUESSEL, 32 Byte Base64)
 * und liegt nie in der Datenbank. Ohne ihn sind diese Felder nicht mehr lesbar – er gehört zusätzlich in den Tresor
 * (KeePass).
 *
 * Leere Werte bleiben leer (Abfragen wie „IBAN angegeben?“ funktionieren weiter). Vergleiche mit Inhalt (z. B.
 * `eq(aussteller.iban, "DE…")`) treffen nie – jeder Wert hat einen eigenen Zufalls-IV; nur in der Anwendung vergleichen.
 *
 * Zwei Formen (Entscheidung 035):
 * - `enc1:…` – an das Feld gebunden (Zusatzdaten „aussteller.iban“): passt nur in seine Spalte.
 * - `enc2:<Zeile>:…` – Bankdaten (IBAN, Kontoinhaber von Ausstellern und Mandaten) zusätzlich an ihre Zeile gebunden
 *   (Zusatzdaten „aussteller.iban#42“). Die Zeilennummer steht lesbar davor und ist mit verschlüsselt; ob sie zur Zeile
 *   passt, prüfen Abrechnung und Lastschrift (`inEigenerZeile`). So lässt sich die eigene IBAN nicht in die Zeile eines
 *   anderen kopieren. Geschrieben werden diese Spalten nur über `gebunden()`; ältere `enc1:`-Werte schlüsselt der Start
 *   um (`verschluesseleBestand`).
 *
 * Werte ohne Präfix sind Altbestand im Klartext. Die Umstellung beim Start (`verschluesseleBestand`, migrate.ts) darf
 * sie lesen; in der laufenden Anwendung (Produktion) gelten sie als Manipulation und werden abgelehnt – sonst ließe sich
 * eine IBAN mit Schreibzugriff auf die Datenbank an der Verschlüsselung vorbei umleiten. Dasselbe gilt für Bankdaten
 * in der Form `enc1:` (ohne Zeile).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { customType, type AnyPgColumn } from "drizzle-orm/pg-core";

export const PRAEFIX = "enc1:";
/** An Feld und Zeile gebunden: `enc2:<Zeile>:<Base64>`. */
export const PRAEFIX_ZEILE = "enc2:";
/** Felder, die nur an ihre Zeile gebunden gespeichert werden. */
const anZeile = new Set<string>();
let schluessel: Buffer | null = null;
/** Nur Entwicklung, Tests und die Umstellung beim Start lesen Klartext ohne Präfix. */
const entwicklung = () => ["", "test", "development"].includes(process.env.NODE_ENV ?? "");
let klartextErlaubt: boolean | null = null;
export function erlaubeKlartext(ja: boolean | null) {
  klartextErlaubt = ja;
}
const altesLesen = () => klartextErlaubt ?? entwicklung();

/** Der Datenschlüssel. In Produktion Pflicht; in Entwicklung und Tests ein fester, öffentlich bekannter Schlüssel. */
export function datenschluessel(): Buffer {
  if (schluessel) return schluessel;
  const roh = (process.env.DATENSCHLUESSEL ?? "").trim();
  if (roh) {
    const b = Buffer.from(roh, "base64");
    // bleibt deutsch: Betreiberfehler beim Start, nie in der Oberfläche
    if (b.length !== 32) throw new Error("DATENSCHLUESSEL muss 32 Byte lang sein (Base64, z. B. aus: openssl rand -base64 32).");
    schluessel = b;
    return b;
  }
  if (!entwicklung()) {
    // bleibt deutsch: Betreiberfehler beim Start, nie in der Oberfläche
    throw new Error("DATENSCHLUESSEL fehlt in der .env – ohne ihn lassen sich IBAN und Zwei-Faktor-Geheimnisse weder lesen noch speichern.");
  }
  schluessel = createHash("sha256").update("schauverwaltung-entwicklung-nicht-fuer-echte-daten").digest();
  return schluessel;
}

/** Nur für Tests: anderen Schlüssel setzen (null = wieder aus der Umgebung). */
export function setzeDatenschluesselFuerTest(b: Buffer | null) {
  schluessel = b;
}

/**
 * Verschlüsselt `text`; `feld` (z. B. „aussteller.iban“) ist mit eingebunden – ein Wert passt nur in seine Spalte.
 * Mit `zeile` (Nummer des Datensatzes) zusätzlich nur in diese Zeile.
 */
export function verschluessele(text: string, feld: string, zeile?: number): string {
  if (!text) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", datenschluessel(), iv);
  c.setAAD(Buffer.from(zeile == null ? feld : `${feld}#${zeile}`));
  const inhalt = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const b64 = Buffer.concat([iv, c.getAuthTag(), inhalt]).toString("base64");
  return zeile == null ? PRAEFIX + b64 : `${PRAEFIX_ZEILE}${zeile}:${b64}`;
}

/** Zeile, an die ein Wert gebunden ist (`enc2:`), sonst null. */
export function zeileVon(wert: string): number | null {
  const z = /^enc2:(\d+):/.exec(wert);
  return z ? Number(z[1]) : null;
}

export function entschluessele(wert: string, feld: string): string {
  if (!wert) return wert;
  let aad = feld;
  let rest: string;
  if (wert.startsWith(PRAEFIX_ZEILE)) {
    const zeile = zeileVon(wert);
    // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
    if (zeile == null) throw new Error(`Verschlüsseltes Feld ${feld} lässt sich nicht lesen – passt der DATENSCHLUESSEL zu dieser Datenbank?`);
    aad = `${feld}#${zeile}`;
    rest = wert.slice(wert.indexOf(":", PRAEFIX_ZEILE.length) + 1);
  } else if (wert.startsWith(PRAEFIX)) {
    // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
    if (anZeile.has(feld) && !altesLesen()) throw new Error(`Feld ${feld} ist nicht an seine Zeile gebunden – nicht über die Anwendung geschrieben. Bitte prüfen (Manipulation?).`);
    rest = wert.slice(PRAEFIX.length);
  } else {
    if (altesLesen()) return wert;
    // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
    throw new Error(`Feld ${feld} steht unverschlüsselt in der Datenbank – nicht über die Anwendung geschrieben. Bitte prüfen (Manipulation?).`);
  }
  const schl = datenschluessel();
  const b = Buffer.from(rest, "base64");
  try {
    // bleibt deutsch: nur für den catch darunter
    if (b.length < 28) throw new Error("zu kurz");
    const d = createDecipheriv("aes-256-gcm", schl, b.subarray(0, 12), { authTagLength: 16 });
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
    throw new Error(`Verschlüsseltes Feld ${feld} lässt sich nicht lesen – passt der DATENSCHLUESSEL zu dieser Datenbank?`);
  }
}

/**
 * Textspalte, verschlüsselt gespeichert. `{ zeile: true }`: nur über `gebunden()` schreibbar (Wert an seine Zeile
 * gebunden); ein gewöhnlicher Text außer "" wird abgelehnt – so vergisst kein Schreibweg die Bindung.
 */
export function geheimText(spalte: string, feld: string, opts: { zeile?: boolean } = {}) {
  if (opts.zeile) anZeile.add(feld);
  return customType<{ data: string; driverData: string }>({
    dataType: () => "text",
    toDriver: (v) => {
      if (v == null || v === "") return v;
      // bleibt deutsch: Programmierfehler, nie in der Oberfläche
      if (opts.zeile) throw new Error(`Feld ${feld} nur an seine Zeile gebunden speichern (gebunden()).`);
      return verschluessele(v, feld);
    },
    fromDriver: (v) => (v == null ? v : entschluessele(v, feld)),
  })(spalte);
}

/** Wert für eine an ihre Zeile gebundene Spalte (`geheimText(…, { zeile: true })`), für `insert().values()` und `update().set()`. */
export function gebunden(feld: string, wert: string, zeile: number): SQL | string {
  return wert ? sql`${verschluessele(wert, feld, zeile)}` : wert;
}

/** IBAN und Kontoinhaber (soweit angegeben) eines Ausstellers oder Mandats, an ihre Zeile gebunden. */
export function bankdatenFuer<D extends { iban?: string; kontoinhaber?: string }>(tabelle: "aussteller" | "sepaMandat", zeile: number, d: D) {
  const r: { iban?: SQL | string; kontoinhaber?: SQL | string } = {};
  if (d.iban !== undefined) r.iban = gebunden(`${tabelle}.iban`, d.iban, zeile);
  if (d.kontoinhaber !== undefined) r.kontoinhaber = gebunden(`${tabelle}.kontoinhaber`, d.kontoinhaber, zeile);
  return r as { [K in keyof D as K extends "iban" | "kontoinhaber" ? K : never]: SQL | string };
}

/**
 * SQL: stehen die Werte dieser Spalten in ihrer eigenen Zeile (Nummer vor dem Geheimtext = `id`)? Leere Werte und
 * ältere Formen zählen als ja – die lehnt `entschluessele` in Produktion ab.
 */
export function inEigenerZeile(spalten: AnyPgColumn[], id: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`(${sql.join(
    spalten.map((s) => sql`(${s} not like 'enc2:%' or split_part(${s}, ':', 2) = ${id}::text)`),
    sql` and `,
  )})`;
}

/** Wirft, wenn ein Bankwert aus einer anderen Zeile stammt (in die Datenbank kopiert, nicht über die Anwendung). */
export function verlangeEigeneZeile(zeilen: { inEigenerZeile: boolean }[], was: string) {
  // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
  if (zeilen.some((z) => !z.inEigenerZeile)) throw new Error(`${was}: Bankdaten stehen in einer fremden Zeile – nicht über die Anwendung geschrieben. Bitte prüfen (Manipulation?).`);
}

/**
 * Wert einer verschlüsselten JSON-Spalte lesen. Gewöhnliches JSON (Altbestand) nur in Entwicklung, Tests und bei der
 * Umstellung beim Start – wie bei geheimText: in Produktion kann Klartext nur von außen geschrieben sein (etwa eine
 * fremde IBAN in einer SEPA- oder Lastschriftdatei), und die Anwendung lehnt ihn ab.
 */
export function geheimJsonLesen<T>(v: unknown, feld: string): T {
  const o = typeof v === "string" ? JSON.parse(v) : v;
  if (o && typeof o === "object" && typeof (o as { enc?: unknown }).enc === "string") return JSON.parse(entschluessele((o as { enc: string }).enc, feld)) as T;
  // bleibt deutsch: interner Fehler, tRPC zeigt nur „Interner Fehler“
  if (o != null && !altesLesen()) throw new Error(`Feld ${feld} steht unverschlüsselt in der Datenbank – nicht über die Anwendung geschrieben. Bitte prüfen (Manipulation?).`);
  return o as T;
}

/** JSON-Spalte, verschlüsselt gespeichert als `{"enc": "…"}` (Lesen: geheimJsonLesen). */
export function geheimJson<T>(spalte: string, feld: string) {
  return customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (v) => JSON.stringify({ enc: verschluessele(JSON.stringify(v), feld) }),
    fromDriver: (v) => geheimJsonLesen<T>(v, feld),
  })(spalte);
}
