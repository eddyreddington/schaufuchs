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
 * Werte ohne Präfix sind Altbestand im Klartext. Die Umstellung beim Start (`verschluesseleBestand`, migrate.ts) darf
 * sie lesen; in der laufenden Anwendung (Produktion) gelten sie als Manipulation und werden abgelehnt – sonst ließe sich
 * eine IBAN mit Schreibzugriff auf die Datenbank an der Verschlüsselung vorbei umleiten.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { customType } from "drizzle-orm/pg-core";

export const PRAEFIX = "enc1:";
let schluessel: Buffer | null = null;
/** Nur Entwicklung, Tests und die Umstellung beim Start lesen Klartext ohne Präfix. */
const entwicklung = () => ["", "test", "development"].includes(process.env.NODE_ENV ?? "");
let klartextErlaubt: boolean | null = null;
export function erlaubeKlartext(ja: boolean | null) {
  klartextErlaubt = ja;
}

/** Der Datenschlüssel. In Produktion Pflicht; in Entwicklung und Tests ein fester, öffentlich bekannter Schlüssel. */
export function datenschluessel(): Buffer {
  if (schluessel) return schluessel;
  const roh = (process.env.DATENSCHLUESSEL ?? "").trim();
  if (roh) {
    const b = Buffer.from(roh, "base64");
    if (b.length !== 32) throw new Error("DATENSCHLUESSEL muss 32 Byte lang sein (Base64, z. B. aus: openssl rand -base64 32).");
    schluessel = b;
    return b;
  }
  if (!entwicklung()) {
    throw new Error("DATENSCHLUESSEL fehlt in der .env – ohne ihn lassen sich IBAN und Zwei-Faktor-Geheimnisse weder lesen noch speichern.");
  }
  schluessel = createHash("sha256").update("schauverwaltung-entwicklung-nicht-fuer-echte-daten").digest();
  return schluessel;
}

/** Nur für Tests: anderen Schlüssel setzen (null = wieder aus der Umgebung). */
export function setzeDatenschluesselFuerTest(b: Buffer | null) {
  schluessel = b;
}

/** Verschlüsselt `text`; `feld` (z. B. „aussteller.iban“) ist mit eingebunden – ein Wert passt nur in seine Spalte. */
export function verschluessele(text: string, feld: string): string {
  if (!text) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", datenschluessel(), iv);
  c.setAAD(Buffer.from(feld));
  const inhalt = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return PRAEFIX + Buffer.concat([iv, c.getAuthTag(), inhalt]).toString("base64");
}

export function entschluessele(wert: string, feld: string): string {
  if (!wert) return wert;
  if (!wert.startsWith(PRAEFIX)) {
    if (klartextErlaubt ?? entwicklung()) return wert;
    throw new Error(`Feld ${feld} steht unverschlüsselt in der Datenbank – nicht über die Anwendung geschrieben. Bitte prüfen (Manipulation?).`);
  }
  const schl = datenschluessel();
  const b = Buffer.from(wert.slice(PRAEFIX.length), "base64");
  try {
    if (b.length < 28) throw new Error("zu kurz");
    const d = createDecipheriv("aes-256-gcm", schl, b.subarray(0, 12), { authTagLength: 16 });
    d.setAAD(Buffer.from(feld));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new Error(`Verschlüsseltes Feld ${feld} lässt sich nicht lesen – passt der DATENSCHLUESSEL zu dieser Datenbank?`);
  }
}

/** Textspalte, verschlüsselt gespeichert. */
export function geheimText(spalte: string, feld: string) {
  return customType<{ data: string; driverData: string }>({
    dataType: () => "text",
    toDriver: (v) => (v == null ? v : verschluessele(v, feld)),
    fromDriver: (v) => (v == null ? v : entschluessele(v, feld)),
  })(spalte);
}

/**
 * JSON-Spalte, verschlüsselt gespeichert als `{"enc": "…"}`. Altbestand (gewöhnliches JSON) wird unverändert gelesen.
 */
export function geheimJson<T>(spalte: string, feld: string) {
  return customType<{ data: T; driverData: unknown }>({
    dataType: () => "jsonb",
    toDriver: (v) => JSON.stringify({ enc: verschluessele(JSON.stringify(v), feld) }),
    fromDriver: (v) => {
      const o = typeof v === "string" ? JSON.parse(v) : v;
      return (o && typeof o === "object" && typeof (o as { enc?: unknown }).enc === "string" ? JSON.parse(entschluessele((o as { enc: string }).enc, feld)) : o) as T;
    },
  })(spalte);
}
