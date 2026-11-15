/**
 * Datei-Adresse der Zuwendungsbestätigungen (nur Ausstellungsleitung, nur eigener Verein):
 *   GET /datei/zuwendungsbestaetigung/:id.pdf – das beim Ausstellen abgelegte Doppel, unverändert.
 * Das Doppel bleibt auch nach einem Storno unverändert; der Dateiname und die Kopfzeile X-Storniert kennzeichnen es.
 */
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { db } from "./db/client";
import { zuwendungsbestaetigung } from "./db/schema";

export function spendenDateien(app: Hono<any>) {
  app.get("/datei/zuwendungsbestaetigung/:datei{[0-9]{1,10}\\.pdf}", async (c) => {
    const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
    if (!benutzer || benutzer.rolle !== "admin") return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const id = Number.parseInt(c.req.param("datei"), 10);
    if (!(id >= 1 && id <= 2_147_483_647)) return c.text("Bestätigung nicht gefunden.", 404);
    const [b] = await db
      .select()
      .from(zuwendungsbestaetigung)
      .where(and(eq(zuwendungsbestaetigung.id, id), eq(zuwendungsbestaetigung.organisationId, benutzer.organisationId)));
    if (!b) return c.text("Bestätigung nicht gefunden.", 404);
    c.header("X-Beleg-SHA256", b.sha256);
    if (b.storniertAm) c.header("X-Storniert", "ja");
    return c.body(new Uint8Array(b.pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="zuwendungsbestaetigung-${b.nummer}${b.storniertAm ? "-storniert" : ""}.pdf"`,
      "Cache-Control": "no-store",
    });
  });
}
