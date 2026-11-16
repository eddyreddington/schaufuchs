/**
 * Datei-Adressen für Bilder und Katalog (angemeldete Benutzer der eigenen Schau):
 *   GET  /datei/:schauId/bild/:bildId          – Vorschau hochgeladener Katalogbilder
 *   GET  /datei/rassebild/:id                  – Rassebild des eigenen Vereins
 *   GET  /datei/:schauId/katalog.pdf           – Katalog (mit Angaben in der Adresse als Vorschau)
 *   POST /datei/:schauId/katalog-vorschau.pdf  – Live-Vorschau der Seite „Katalog“
 * Dazu die Warteschlange der Katalog-Erzeugung (katalogNacheinander), die auch der öffentliche Katalog nutzt.
 */
import { type KatalogSeitenbereich } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { db } from "./db/client";
import { bild, rassebild, schau } from "./db/schema";
import { katalogPdf } from "./pdf/katalog";
import { vorschauAus, vorschauAusKoerper, VORSCHAU_MAX_BYTES } from "./routers/katalog-gestaltung";
import { Bremse } from "./services/bremse";
import { pdf, schauFuer, schauMitBenutzer, zahlAus } from "./datei-hilfen";

/**
 * Kataloge mit vielen Bildern brauchen beim Erzeugen viel Speicher – höchstens einer zur Zeit (weitere warten),
 * damit gleichzeitige Abrufe den Server nicht über seine Speichergrenze treiben.
 */
let katalogKette: Promise<unknown> = Promise.resolve();
/** Bleibt eine Erzeugung hängen (z. B. ein Bild, das pdfkit nicht fertig entpackt), warten die anderen nicht ewig. */
const KATALOG_HOECHSTENS_MS = 3 * 60_000;
/** Eine Vorschau, die beim Start schon von einer neueren desselben Benutzers abgelöst ist (siehe unten). */
class VorschauUeberholt extends Error {}
export function katalogNacheinander(s: typeof schau.$inferSelect, opts?: Parameters<typeof katalogPdf>[1], nochGewollt?: () => boolean): Promise<Buffer> {
  const p = katalogKette.then(() => {
    if (nochGewollt && !nochGewollt()) throw new VorschauUeberholt();
    let uhr: ReturnType<typeof setTimeout> | undefined;
    const zuLange = new Promise<never>((_, nein) => {
      uhr = setTimeout(() => nein(new Error("Die Katalog-Erzeugung hat zu lange gedauert.")), KATALOG_HOECHSTENS_MS);
    });
    return Promise.race([katalogPdf(s, opts), zuLange]).finally(() => clearTimeout(uhr));
  });
  katalogKette = p.catch(() => undefined);
  return p;
}

/**
 * Live-Vorschau der Seite „Katalog“: Formular im Rumpf (auch Texte, siehe vorschauAusKoerper), meist als Kurzvorschau.
 * Sie reiht sich in dieselbe Warteschlange wie die Kataloge ein. Damit Tippen die Schlange nicht füllt, zählt je
 * Benutzer nur die neueste: ältere, die noch warten, entfallen (409), ebenso abgebrochene Abrufe.
 */
const vorschauBremse = new Bremse(90, 60_000, "Zu viele Vorschauen. Bitte kurz warten.");
const vorschauNeueste = new Map<number, number>();
let vorschauZaehler = 0;

export function katalogDateien(app: Hono<any>) {
  // Vorschau hochgeladener Katalogbilder in der Oberfläche.
  app.get("/datei/:schauId/bild/:bildId{[0-9]+}", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    const bildId = zahlAus(c.req.param("bildId"));
    if (bildId == null) return c.text("Bild nicht gefunden.", 404);
    const [b] = await db
      .select({ mime: bild.mime, daten: bild.daten })
      .from(bild)
      .where(and(eq(bild.id, bildId), eq(bild.schauId, s.id)));
    if (!b) return c.text("Bild nicht gefunden.", 404);
    return c.body(new Uint8Array(b.daten), 200, { "Content-Type": b.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
  });

  /** Rassebild des eigenen Vereins (für die Pflege-Seite). */
  app.get("/datei/rassebild/:id{[0-9]+}", async (c) => {
    const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
    if (!benutzer) return c.text("Nicht angemeldet.", 403);
    const id = zahlAus(c.req.param("id"));
    if (id == null) return c.text("Bild nicht gefunden.", 404);
    const [b] = await db
      .select({ mime: rassebild.mime, daten: rassebild.daten })
      .from(rassebild)
      .where(and(eq(rassebild.id, id), eq(rassebild.organisationId, benutzer.organisationId)));
    if (!b) return c.text("Bild nicht gefunden.", 404);
    return c.body(new Uint8Array(b.daten), 200, { "Content-Type": b.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
  });

  app.get("/datei/:schauId/katalog.pdf", async (c) => {
    const s = await schauFuer(c);
    if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    // Mit Angaben in der Adresse: Vorschau mit noch nicht gespeicherter Darstellung (siehe vorschauAus).
    const vorschau = vorschauAus(c.req.query());
    if (vorschau === "ungueltig") return c.text("Ungültige Angaben für die Vorschau.", 400);
    return pdf(c, await katalogNacheinander(s, vorschau ? { vorschau } : undefined), `katalog-${s.slug}${vorschau ? "-vorschau" : ""}.pdf`);
  });

  app.post("/datei/:schauId/katalog-vorschau.pdf", async (c) => {
    if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) return c.text("Nur JSON-Anfragen.", 415);
    if (c.req.header("sec-fetch-site") === "cross-site") return c.text("Fremde Herkunft.", 403);
    const angabe = c.req.header("content-length");
    if (angabe && Number(angabe) > VORSCHAU_MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
    const x = await schauMitBenutzer(c);
    if (!x) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
    try {
      vorschauBremse.versuch([`benutzer:${x.benutzer.id}`]);
    } catch {
      return c.text("Zu viele Vorschauen. Bitte kurz warten.", 429);
    }
    const roh = await c.req.text();
    if (roh.length > VORSCHAU_MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
    let koerper: unknown;
    try {
      koerper = JSON.parse(roh);
    } catch {
      return c.text("Ungültige Angaben für die Vorschau.", 400);
    }
    const v = vorschauAusKoerper(koerper);
    if (!v) return c.text("Ungültige Angaben für die Vorschau.", 400);
    const wer = x.benutzer.id;
    const nr = ++vorschauZaehler;
    vorschauNeueste.set(wer, nr);
    let bereiche: KatalogSeitenbereich[] = [];
    try {
      const inhalt = await katalogNacheinander(
        x.s,
        { vorschau: v.vorschau, kurz: v.kurz, gliederung: (g) => (bereiche = g) },
        () => vorschauNeueste.get(wer) === nr && !c.req.raw.signal.aborted,
      );
      c.header("X-Katalog-Gliederung", JSON.stringify(bereiche));
      return pdf(c, inhalt, `katalog-${x.s.slug}-vorschau.pdf`);
    } catch (e) {
      if (e instanceof VorschauUeberholt) return c.body(null, 409);
      throw e;
    } finally {
      if (vorschauNeueste.get(wer) === nr) vorschauNeueste.delete(wer);
    }
  });
}
