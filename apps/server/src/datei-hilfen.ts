/**
 * Gemeinsame Bausteine der Datei-Adressen (/datei/...): Zahlen und Daten aus der Adresse prüfen, Schau des angemeldeten
 * Benutzers laden, Datei-Antworten (PDF, CSV, archivierte Belege).
 */
import { eq } from "drizzle-orm";
import type { Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { db } from "./db/client";
import { schau } from "./db/schema";

/** Ganze Zahl im Wertebereich der Datenbank-IDs (1 bis 2.147.483.647), sonst null – kein Datenbankfehler aus der Adresse. */
export function zahlAus(wert: string | undefined): number | null {
  if (!wert || !/^\d{1,10}$/.test(wert)) return null;
  const n = Number(wert);
  return n >= 1 && n <= 2_147_483_647 ? n : null;
}

/** Echtes Kalenderdatum JJJJ-MM-TT oder null. */
export function datumAus(wert: string | undefined): string | null {
  if (!wert || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const t = Date.parse(`${wert}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === wert ? wert : null;
}

export async function schauMitBenutzer(c: HonoContext, opts: { nurAdmin?: boolean } = {}) {
  const id = zahlAus(c.req.param("schauId"));
  const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
  if (!benutzer || id == null || (opts.nurAdmin && benutzer.rolle !== "admin")) return null;
  const [s] = await db.select().from(schau).where(eq(schau.id, id));
  return s && s.organisationId === benutzer.organisationId ? { s, benutzer } : null;
}
export async function schauFuer(c: HonoContext, opts: { nurAdmin?: boolean } = {}) {
  return (await schauMitBenutzer(c, opts))?.s ?? null;
}

export function datei(c: HonoContext, inhalt: Buffer | string, name: string, typ: string) {
  return c.body(typeof inhalt === "string" ? inhalt : new Uint8Array(inhalt), 200, {
    "Content-Type": typ,
    "Content-Disposition": `inline; filename="${name}"`,
    "Cache-Control": "no-store",
  });
}
export const pdf = (c: HonoContext, b: Buffer, name: string) => datei(c, b, name, "application/pdf");
/** Beleg aus dem Archiv, mit Prüfsumme im Kopf (zum Abgleich mit der Belegliste). */
export const archivPdf = (c: HonoContext, b: { pdf: Buffer; sha256: string }, name: string) => {
  c.header("X-Beleg-SHA256", b.sha256);
  return datei(c, b.pdf, name, "application/pdf");
};
