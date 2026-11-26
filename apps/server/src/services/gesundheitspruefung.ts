/**
 * Angaben der Gesundheitsprüfung `GET /api/gesund` neben `ok` und `version` (Entscheidung 024): wann die letzte
 * Sicherung lief, ob Migrationen offen sind und ob gerade Schautage laufen. Gedacht für Überwachung (z. B. Uptime
 * Kuma) und Update-Läufe, die nicht mitten in eine Schau fallen sollen.
 */
import { heuteBerlin, offeneMigrationen, schautageLaufen } from "@schau/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db/client";
import { schau, sicherung } from "../db/schema";

export interface GesundAngaben {
  /** Zeitpunkt der letzten geprüften Sicherung (ISO), null = noch keine gemeldet. */
  letzteSicherung: string | null;
  /** Volle Stunden seit der letzten Sicherung, null = noch keine gemeldet. */
  sicherungAlterStunden: number | null;
  /** Noch nicht eingespielte Migrationen, null = nicht feststellbar (Datenbank ohne Migrationsverzeichnis). */
  migrationenOffen: number | null;
  /** Läuft gerade eine Schau (Einlieferung bis letzter Öffnungstag)? null = nicht feststellbar. */
  schautage: boolean | null;
}

/** Kopfzeilen, die ein Reverse-Proxy (Caddy, nginx) setzt. */
const PROXY_KOPF = ["x-forwarded-for", "forwarded", "x-real-ip", "x-forwarded-proto", "x-forwarded-host"];

/**
 * Darf die Antwort Version und Zusatzangaben enthalten (Nachtrag zu Entscheidung 024)? Ja, wenn die Anfrage nicht über
 * einen Proxy kam – die Docker-Prüfung und der Befehl schaufuchs fragen den Container direkt – oder das
 * Token aus GESUND_TOKEN mitbringt (`Authorization: Bearer …`, für Überwachung von außen). Besucher aus dem Netz
 * kommen immer über den Proxy; der setzt X-Forwarded-For selbst, sie können es nicht entfernen.
 */
export function gesundAngabenErlaubt(kopf: (name: string) => string | undefined): boolean {
  const token = process.env.GESUND_TOKEN ?? "";
  if (token) {
    const mit = /^Bearer\s+(.+)$/i.exec(kopf("authorization") ?? "")?.[1]?.trim() ?? "";
    const hash = (s: string) => createHash("sha256").update(s).digest();
    if (mit && timingSafeEqual(hash(mit), hash(token))) return true;
  }
  return !PROXY_KOPF.some((name) => kopf(name) !== undefined);
}

/** Antwort, wenn die Angaben nicht zu ermitteln sind (Fehler, Zeitüberschreitung): gleiche Form, alles unbekannt. */
export const GESUND_UNBEKANNT: GesundAngaben = { letzteSicherung: null, sicherungAlterStunden: null, migrationenOffen: null, schautage: null };

/** Zeitpunkte (`when`) der Migrationen, die dieser Stand mitbringt; null, wenn das Verzeichnis fehlt. */
let verzeichnis: number[] | null | undefined;
function migrationsverzeichnis(): number[] | null {
  if (verzeichnis === undefined) {
    try {
      const journal = JSON.parse(readFileSync(join(import.meta.dir, "../../drizzle/meta/_journal.json"), "utf8")) as { entries: { when: number }[] };
      verzeichnis = journal.entries.map((e) => e.when);
    } catch {
      verzeichnis = null;
    }
  }
  return verzeichnis;
}

/** Wie viele Migrationen fehlen? Entwicklungs- und Testdatenbanken (`db:push`) führen kein Verzeichnis – dann null. */
async function migrationenOffen(): Promise<number | null> {
  const liste = migrationsverzeichnis();
  if (!liste) return null;
  const [t] = await db.execute<{ da: boolean }>(sql`select to_regclass('drizzle.__drizzle_migrations') is not null as da`);
  if (!t?.da) return null;
  const [m] = await db.execute<{ zuletzt: string | null }>(sql`select max(created_at)::text as zuletzt from drizzle.__drizzle_migrations`);
  return offeneMigrationen(liste, m?.zuletzt == null ? null : Number(m.zuletzt));
}

export async function gesundAngaben(jetzt = new Date()): Promise<GesundAngaben> {
  const [[letzte], offen, schauen] = await Promise.all([
    db.select({ am: sicherung.am }).from(sicherung),
    migrationenOffen(),
    db
      .select({ test: schau.test, phase: schau.phase, bewertungAm: schau.bewertungAm, oeffnungszeiten: schau.oeffnungszeiten })
      .from(schau)
      .where(and(eq(schau.test, false), ne(schau.phase, "abgeschlossen"))),
  ]);
  return {
    letzteSicherung: letzte ? letzte.am.toISOString() : null,
    sicherungAlterStunden: letzte ? Math.max(0, Math.floor((jetzt.getTime() - letzte.am.getTime()) / 3_600_000)) : null,
    migrationenOffen: offen,
    schautage: schautageLaufen(schauen, heuteBerlin(jetzt)),
  };
}
