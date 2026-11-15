/**
 * Datei-Adressen des Druckvorlagen-Designers (nur Ausstellungsleitung):
 *   POST /datei/druckvorlage/vorschau.pdf    – Beispielkarten nach der (noch nicht gespeicherten) Vorlage
 *   POST /datei/druckvorlage/probedruck.pdf  – Millimeterraster zum Ausmessen am Drucker
 * Rumpf: JSON { daten, schauId? }. Mit schauId gelten Vereinsfarbe, Logo, Name und Ort dieser Schau.
 * Schutz wie bei der Katalog-Vorschau: nur JSON, keine fremde Herkunft, Größengrenze, Bremse je Benutzer.
 */
import { bogen, kartenVorlageLesen } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { db } from "./db/client";
import { bild, schau } from "./db/schema";
import { design } from "./pdf/basis";
import { BEISPIEL_KARTEN, kartenKopf, probedruckPdf, zeichneKartenPdf } from "./pdf/bewertungskarte";
import { ladeGestaltung } from "./routers/katalog-gestaltung";
import { Bremse } from "./services/bremse";

const MAX_BYTES = 64 * 1024;
const bremse = new Bremse(120, 60_000, "Zu viele Vorschauen. Bitte kurz warten.");

/** Hängt die Adressen an die Server-App (aufgerufen in index.ts). */
export function druckvorlageDateien(app: Hono<any>) {
  app.post("/datei/druckvorlage/:art{vorschau|probedruck}.pdf", async (c) => {
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) return c.text("Nur JSON-Anfragen.", 415);
    if (c.req.header("sec-fetch-site") === "cross-site") return c.text("Fremde Herkunft.", 403);
    if (Number(c.req.header("content-length") ?? 0) > MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
    const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
    if (!benutzer || benutzer.rolle !== "admin") return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    try {
      bremse.versuch([`benutzer:${benutzer.id}`]);
    } catch {
      return c.text("Zu viele Vorschauen. Bitte kurz warten.", 429);
    }
    const roh = await c.req.text();
    if (roh.length > MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
    let koerper: { daten?: unknown; schauId?: unknown };
    try {
      koerper = JSON.parse(roh);
    } catch {
      return c.text("Ungültige Angaben.", 400);
    }
    const vorlage = kartenVorlageLesen(koerper?.daten);
    const inhalt =
      c.req.param("art") === "probedruck"
        ? await probedruckPdf(vorlage)
        : await (async () => {
            const s = typeof koerper?.schauId === "number" ? await eigeneSchau(benutzer.organisationId, koerper.schauId) : null;
            const [g, logo] = s ? await Promise.all([ladeGestaltung(s.id), db.select({ daten: bild.daten }).from(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "logo")))]) : [null, []];
            const d = design(g?.farbe, logo[0]?.daten ?? null);
            const kopf = kartenKopf(s ?? { name: "Beispielschau 2026", ort: "Mehrzweckhalle Musterstadt", bewertungAm: null }, undefined);
            // Einen ganzen Bogen füllen, damit Raster und Schnittlinien zu sehen sind.
            const jeBogen = bogen(vorlage.format).nutzen.length;
            const karten = Array.from({ length: Math.max(jeBogen, 1) }, (_, i) => BEISPIEL_KARTEN[i % BEISPIEL_KARTEN.length]!);
            return zeichneKartenPdf("Vorschau Bewertungskarten", karten, vorlage, d, kopf, "");
          })();
    return c.body(new Uint8Array(inhalt), 200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${c.req.param("art")}.pdf"`, "Cache-Control": "no-store" });
  });
}

async function eigeneSchau(organisationId: number, id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return null;
  const [s] = await db.select().from(schau).where(and(eq(schau.id, id), eq(schau.organisationId, organisationId)));
  return s ?? null;
}
