/**
 * Fehlertexte der Datei-Adressen (/datei/…, /s/…, /o/…) in der Sprache der Oberfläche (Entscheidung 022). Diese Adressen
 * öffnen sich meist in einem neuen Browser-Tab, die Oberfläche kann den Klartext dort nicht übersetzen – also übersetzt
 * ihn der Server, mit denselben Texten wie `serverText()` in der Oberfläche. Die Adressen selbst schreiben weiter deutsch.
 *
 * Sprache: `?sprache=` im Link (Seiten für Aussteller geben ihre Wahl mit), unter /datei/ sonst die Sprache am Konto,
 * sonst Deutsch – die Browsersprache allein stellt wie in der Oberfläche nichts um. Die öffentlichen Adressen (/s/, /o/)
 * richten sich nur nach dem Link: ihre Antworten können in Zwischenspeichern landen und dürfen nicht vom Konto abhängen.
 */
import { istSprache, ladeAlleOberflaechen, serverText, type Sprache } from "@schau/domain";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, spracheDerSitzung } from "./auth";

/** Pfade, deren Fehler als Klartext im Browser erscheinen. */
export const DATEI_PFADE = ["/datei/*", "/s/*", "/o/*"] as const;

async function spracheDerAnfrage(c: Context): Promise<Sprache> {
  const ausLink = c.req.query("sprache");
  if (istSprache(ausLink)) return ausLink;
  const token = c.req.path.startsWith("/datei/") ? getCookie(c, COOKIE) : undefined;
  const amKonto = token ? await spracheDerSitzung(token).catch(() => null) : null;
  return istSprache(amKonto) ? amKonto : "de";
}

export const dateiFehlerUebersetzen: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.status < 400 || !(c.res.headers.get("content-type") ?? "").startsWith("text/plain")) return;
  const sprache = await spracheDerAnfrage(c);
  if (sprache === "de") return;
  await ladeAlleOberflaechen();
  const { status } = c.res;
  const text = await c.res.text();
  c.res = new Response(serverText(text, sprache), { status, headers: c.res.headers });
  // Hono übernimmt beim Ersetzen die alten Köpfe – eine Länge passte nicht mehr zum übersetzten Text.
  c.res.headers.delete("content-length");
};
