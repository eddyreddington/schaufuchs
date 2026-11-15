/**
 * Datei-Adressen der Meisterschaften (angemeldete Benutzer der eigenen Schau):
 *   GET /datei/:schauId/meisterschaften.pdf – Ergebnisse zum Aushängen, Namen wie im gedruckten Katalog
 *   GET /datei/:schauId/meisterschaften.csv – alle Kandidaten mit Tieren (intern, mit allen Namen)
 */
import { and, eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { csv } from "./csv";
import { db } from "./db/client";
import { schau } from "./db/schema";
import { ladeDesign } from "./pdf/dokumente-gemeinsam";
import { meisterschaftenPdf } from "./pdf/meisterschaften";
import { meisterschaftErgebnisse } from "./services/meisterschaften";

async function eigeneSchau(c: Context) {
  const id = Number(c.req.param("schauId"));
  const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
  if (!benutzer || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) return null;
  const [s] = await db.select().from(schau).where(and(eq(schau.id, id), eq(schau.organisationId, benutzer.organisationId)));
  return s ?? null;
}

const datei = (c: Context, inhalt: Buffer | string, name: string, typ: string) =>
  c.body(typeof inhalt === "string" ? inhalt : new Uint8Array(inhalt), 200, { "Content-Type": typ, "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" });

export function meisterschaftDateien(app: Hono<any>) {
  app.get("/datei/:schauId/meisterschaften.pdf", async (c) => {
    const s = await eigeneSchau(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const [d, ergebnisse] = await Promise.all([ladeDesign(s), meisterschaftErgebnisse(s.id, "druck")]);
    return datei(c, await meisterschaftenPdf(d, s, ergebnisse), `meisterschaften-${s.slug}.pdf`, "application/pdf");
  });

  app.get("/datei/:schauId/meisterschaften.csv", async (c) => {
    const s = await eigeneSchau(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const ergebnisse = await meisterschaftErgebnisse(s.id);
    const zeilen = ergebnisse.flatMap((e) =>
      e.gruppen.flatMap((g) =>
        g.kandidaten.map((k) => [e.regel.name, g.sparte, g.rasse, g.farbenschlag, g.jugend ? "Jugend" : "", k.rang ?? "", k.name, k.summe, k.titel ? "Titel" : "", k.grund ?? g.hinweis ?? "", k.gezaehlt.map((t) => `${t.katalogNr ?? "–"}:${t.punkte}`).join(" ")]),
      ),
    );
    return datei(c, csv([["Meisterschaft", "Sparte", "Rasse", "Farbenschlag", "Jugend", "Platz", "Aussteller bzw. Verein", "Summe", "Titel", "Hinweis", "Tiere (Kat.-Nr.:Punkte)"], ...zeilen]), `meisterschaften-${s.slug}.csv`, "text/csv; charset=utf-8");
  });
}
