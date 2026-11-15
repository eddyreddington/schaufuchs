import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type KontoStand, zufallsToken } from "../auth";

/**
 * Zwei-Faktor-Anmeldung mit zeitbasierten Einmalcodes (TOTP nach RFC 6238: SHA-1, 30 Sekunden, 6 Ziffern) – passt zu
 * Google Authenticator, 2FAS, Microsoft Authenticator, Bitwarden usw. Ohne Fremdbibliothek, nur node:crypto.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SCHRITT_SEKUNDEN = 30;

export function base32(daten: Uint8Array): string {
  let bits = 0;
  let wert = 0;
  let aus = "";
  for (const b of daten) {
    wert = (wert << 8) | b;
    bits += 8;
    while (bits >= 5) {
      aus += ALPHABET[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
    wert &= (1 << bits) - 1;
  }
  if (bits > 0) aus += ALPHABET[(wert << (5 - bits)) & 31];
  return aus;
}

export function ausBase32(text: string): Buffer {
  let bits = 0;
  let wert = 0;
  const aus: number[] = [];
  for (const z of text.replace(/[\s=-]/g, "").toUpperCase()) {
    const i = ALPHABET.indexOf(z);
    if (i < 0) throw new Error("Ungültiges Zeichen im Schlüssel");
    wert = (wert << 5) | i;
    bits += 5;
    if (bits >= 8) {
      aus.push((wert >>> (bits - 8)) & 255);
      bits -= 8;
    }
    wert &= (1 << bits) - 1;
  }
  return Buffer.from(aus);
}

export function neuesGeheimnis(): string {
  return base32(randomBytes(20));
}

export function zeitschritt(jetzt = Date.now()): number {
  return Math.floor(jetzt / 1000 / SCHRITT_SEKUNDEN);
}

export function totp(geheim: Buffer, schritt: number, stellen = 6): string {
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(schritt));
  const h = createHmac("sha1", geheim).update(zaehler).digest();
  const o = h[h.length - 1]! & 15;
  const zahl = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(zahl % 10 ** stellen).padStart(stellen, "0");
}

function gleich(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Prüft einen Code gegen den aktuellen Zeitschritt ±1 (Uhren weichen ab). Liefert den passenden Schritt, wenn er
 * neuer ist als der zuletzt benutzte – ein abgelesener Code gilt so nur einmal –, sonst null.
 */
export function pruefeTotp(geheimBase32: string, code: string, letzterSchritt: number, jetzt = Date.now()): number | null {
  const sauber = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(sauber)) return null;
  const geheim = ausBase32(geheimBase32);
  const jetztSchritt = zeitschritt(jetzt);
  for (const s of [jetztSchritt - 1, jetztSchritt, jetztSchritt + 1]) {
    if (s > letzterSchritt && gleich(totp(geheim, s), sauber)) return s;
  }
  return null;
}

/** Adresse für die Authenticator-App (wird als QR-Code angezeigt). */
export function otpauthAdresse(geheim: string, konto: string, aussteller: string): string {
  const a = encodeURIComponent(aussteller);
  return `otpauth://totp/${a}:${encodeURIComponent(konto)}?secret=${geheim}&issuer=${a}&algorithm=SHA1&digits=6&period=${SCHRITT_SEKUNDEN}`;
}

/** Schlüssel in Vierergruppen zum Abtippen. */
export function lesbar(geheim: string): string {
  return geheim.match(/.{1,4}/g)!.join(" ");
}

const NOTFALL_ZEICHEN = "abcdefghjkmnpqrstuvwxyz23456789";
export function hashNotfallcode(code: string): string {
  return new Bun.CryptoHasher("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
}
/** Zehn Notfallcodes für ein verlorenes Telefon: im Klartext nur einmal angezeigt, gespeichert nur als Hash. */
export function neueNotfallcodes(anzahl = 10): { klar: string[]; hashes: string[] } {
  const klar = Array.from({ length: anzahl }, () => {
    const z = Array.from(randomBytes(8), (b) => NOTFALL_ZEICHEN[b % NOTFALL_ZEICHEN.length]).join("");
    return `${z.slice(0, 4)}-${z.slice(4)}`;
  });
  return { klar, hashes: klar.map(hashNotfallcode) };
}

/**
 * Zwischenstand nach richtigem Passwort: Die Sitzung entsteht erst mit dem zweiten Faktor. Höchstens 5 Minuten und
 * 5 Versuche je Anmeldung; liegt nur im Arbeitsspeicher (ein Neustart verlangt erneut das Passwort).
 */
const zwischen = new Map<string, { benutzerId: number; ip: string; bis: number; fehl: number; stand: KontoStand }>();
/** stand: Konto beim Prüfen des Passworts – die Sitzung entsteht nur, wenn es sich bis zum Code nicht geändert hat. */
export function starteZweiterSchritt(benutzerId: number, ip: string, stand: KontoStand): string {
  const jetzt = Date.now();
  for (const [k, v] of zwischen) if (v.bis < jetzt) zwischen.delete(k);
  while (zwischen.size >= 5000) zwischen.delete(zwischen.keys().next().value!);
  const token = zufallsToken(24);
  zwischen.set(token, { benutzerId, ip, bis: jetzt + 5 * 60_000, fehl: 0, stand });
  return token;
}
export function ladeZweiterSchritt(token: string) {
  const z = zwischen.get(token);
  if (!z || z.bis < Date.now() || z.fehl >= 5) {
    zwischen.delete(token);
    return null;
  }
  return z;
}
export function zweiterSchrittFehlgeschlagen(token: string) {
  const z = zwischen.get(token);
  if (z && ++z.fehl >= 5) zwischen.delete(token);
}
export function beendeZweiterSchritt(token: string) {
  zwischen.delete(token);
}
