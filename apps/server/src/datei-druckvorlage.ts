/**
 * Datei-Adressen des Druckvorlagen-Designers (nur Ausstellungsleitung):
 *   POST /datei/druckvorlage/vorschau.pdf    – Beispielkarten nach der (noch nicht gespeicherten) Vorlage
 *   POST /datei/druckvorlage/probedruck.pdf  – Millimeterraster zum Ausmessen am Drucker
 *   POST /datei/druckvorlage/brief.pdf       – Beispielbrief nach der (noch nicht gespeicherten) Briefvorlage;
 *                                              `teil`: „serienbrief“ (Vorgabe) oder „verpflichtung“ (Preisrichter)
 *   POST /datei/serienbrief.pdf              – Serienbrief an Mitglieder, alle Aussteller oder die einer Schau
 * Rumpf: JSON. Mit schauId gelten Vereinsfarbe, Logo, Name und Ort dieser Schau (sonst der neuesten Schau).
 * Schutz wie bei der Katalog-Vorschau: nur JSON, keine fremde Herkunft, Größengrenze, Bremse je Benutzer.
 */
import { bogen, briefVorlageLesen, briefWerte, kartenVorlageLesen } from "@schau/domain";
import { and, desc, eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, ladeSitzung } from "./auth";
import { db } from "./db/client";
import { bild, organisation, schau } from "./db/schema";
import { datumDe, design } from "./pdf/basis";
import { ladeBriefVorlage, serienbriefPdf } from "./pdf/brief";
import { BEISPIEL_KARTEN, kartenKopf, probedruckPdf, zeichneKartenPdf } from "./pdf/bewertungskarte";
import { ladeVerpflichtungsGruppen, verpflichtungsBriefe } from "./pdf/verpflichtung";
import { ladeGestaltung } from "./routers/katalog-gestaltung";
import { Bremse } from "./services/bremse";
import { SERIENBRIEF_AUSWAHL, serienbriefEmpfaenger, type SerienbriefAuswahl } from "./services/serienbrief";

const MAX_BYTES = 64 * 1024;
const bremse = new Bremse(120, 60_000, "Zu viele Vorschauen. Bitte kurz warten.");

/** Bewertungskarten: Vorschau und Probedruck (aufgerufen in index.ts). */
export function druckvorlageDateien(app: Hono<any>) {
  app.post("/datei/druckvorlage/:datei{(vorschau|probedruck)\\.pdf}", async (c) => {
    const art = c.req.param("datei") === "probedruck.pdf" ? "probedruck" : "vorschau";
    const p = await pruefeAnfrage(c);
    if (p instanceof Response) return p;
    const vorlage = kartenVorlageLesen(p.koerper.daten);
    if (art === "probedruck") return pdfAntwort(c, await probedruckPdf(vorlage), "probedruck.pdf");
    const s = typeof p.koerper.schauId === "number" ? await eigeneSchau(p.benutzer.organisationId, p.koerper.schauId) : null;
    const { d } = await vereinsDesign(p.benutzer.organisationId, s?.id);
    const kopf = kartenKopf(s ?? { name: "Beispielschau 2026", ort: "Mehrzweckhalle Musterstadt", bewertungAm: null }, undefined);
    // Einen ganzen Bogen füllen, damit Raster und Schnittlinien zu sehen sind.
    const karten = Array.from({ length: bogen(vorlage.format).nutzen.length }, (_, i) => BEISPIEL_KARTEN[i % BEISPIEL_KARTEN.length]!);
    return pdfAntwort(c, await zeichneKartenPdf("Vorschau Bewertungskarten", karten, vorlage, d, kopf, ""), "vorschau.pdf");
  });
}

/** Gemeinsamer Schutz der POST-Adressen: JSON, keine fremde Herkunft, Größe, nur Ausstellungsleitung, Bremse. */
async function pruefeAnfrage(c: Context): Promise<{ benutzer: { id: number; organisationId: number }; koerper: Record<string, unknown> } | Response> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) return c.text("Nur JSON-Anfragen.", 415);
  if (c.req.header("sec-fetch-site") === "cross-site") return c.text("Fremde Herkunft.", 403);
  if (Number(c.req.header("content-length") ?? 0) > MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
  const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
  if (!benutzer || benutzer.rolle !== "admin") return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  try {
    bremse.versuch([`benutzer:${benutzer.id}`]);
  } catch {
    return c.text("Zu viele Anfragen. Bitte kurz warten.", 429);
  }
  const roh = await c.req.text();
  if (roh.length > MAX_BYTES) return c.text("Die Anfrage ist zu groß.", 413);
  try {
    const koerper = JSON.parse(roh) as unknown;
    return { benutzer, koerper: koerper && typeof koerper === "object" ? (koerper as Record<string, unknown>) : {} };
  } catch {
    return c.text("Ungültige Angaben.", 400);
  }
}

const pdfAntwort = (c: Context, inhalt: Buffer, name: string) => c.body(new Uint8Array(inhalt), 200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" });

/** Farbe und Logo für Vereinsbriefe: aus der genannten Schau oder der neuesten Schau des Vereins. */
async function vereinsDesign(organisationId: number, schauId: unknown) {
  const s = typeof schauId === "number" ? await eigeneSchau(organisationId, schauId) : ((await db.select().from(schau).where(eq(schau.organisationId, organisationId)).orderBy(desc(schau.id)).limit(1))[0] ?? null);
  const [g, logo] = s ? await Promise.all([ladeGestaltung(s.id), db.select({ daten: bild.daten }).from(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "logo"))).orderBy(desc(bild.id)).limit(1)]) : [null, []];
  return { s, d: design(g?.farbe, logo[0]?.daten ?? null) };
}

async function vereinsname(organisationId: number) {
  const [o] = await db.select({ name: organisation.name }).from(organisation).where(eq(organisation.id, organisationId));
  return o?.name ?? "";
}

/** Briefe: Vorschau der Briefvorlage (Beispielempfänger) und der Serienbrief an echte Empfänger. */
export function briefDateien(app: Hono<any>) {
  app.post("/datei/druckvorlage/brief.pdf", async (c) => {
    const p = await pruefeAnfrage(c);
    if (p instanceof Response) return p;
    const teil = p.koerper.teil ?? "serienbrief";
    if (teil !== "serienbrief" && teil !== "verpflichtung") return c.text("Ungültige Angaben.", 400);
    const v = briefVorlageLesen(p.koerper.daten);
    const { s, d } = await vereinsDesign(p.benutzer.organisationId, p.koerper.schauId);
    const verein = await vereinsname(p.benutzer.organisationId);
    if (teil === "verpflichtung") {
      // Wie der echte Brief an die Preisrichter, mit einem Beispiel-Preisrichter; ohne Schau mit Beispielangaben.
      const beispiel = s ?? { name: "Beispielschau 2026", ort: "Mehrzweckhalle Musterstadt", veranstalter: verein, kontaktEmail: "", bewertungAm: null, preisrichterRueckmeldungBis: null, meldeschluss: null, einlieferung: "" };
      const gruppen = await ladeVerpflichtungsGruppen(s?.stammdatenVersionId ?? null);
      const inhalt = await verpflichtungsBriefe(beispiel, [{ id: 0, name: "Karla Muster", anschrift: "Lindenweg 12\n12345 Musterdorf" }], gruppen, d, v);
      return pdfAntwort(c, inhalt, "briefvorlage.pdf");
    }
    const heute = datumDe(new Date());
    const inhalt = await serienbriefPdf(
      d,
      v,
      { verein, unterzeile: s ? [s.name, s.ort].filter(Boolean).join(" · ") : "", standardFuss: verein, betreff: v.serienbrief.betreff, text: v.serienbrief.text, gruss: v.serienbrief.gruss, datum: heute, werte: (e) => briefWerte(e, schauWerte(verein, s, heute)) },
      [{ vorname: "Karla", nachname: "Muster", strasse: "Lindenweg 12", plz: "12345", ort: "Musterdorf" }],
    );
    return pdfAntwort(c, inhalt, "briefvorlage.pdf");
  });

  app.post("/datei/serienbrief.pdf", async (c) => {
    const p = await pruefeAnfrage(c);
    if (p instanceof Response) return p;
    const k = p.koerper;
    const auswahl = SERIENBRIEF_AUSWAHL.includes(k.auswahl as SerienbriefAuswahl) ? (k.auswahl as SerienbriefAuswahl) : null;
    if (!auswahl) return c.text("Empfänger fehlen.", 400);
    if (auswahl === "schau" && typeof k.schauId !== "number") return c.text("Schau fehlt.", 400);
    const text = (w: unknown, max: number) => (typeof w === "string" ? w.slice(0, max) : "");
    const org = p.benutzer.organisationId;
    const { s, d } = await vereinsDesign(org, k.schauId);
    if (auswahl === "schau" && !s) return c.text("Schau nicht gefunden.", 404);
    const [v, verein, empfaenger] = await Promise.all([ladeBriefVorlage(org), vereinsname(org), serienbriefEmpfaenger(org, auswahl, s?.id)]);
    const heute = datumDe(new Date());
    const inhalt = await serienbriefPdf(
      d,
      v,
      { verein, unterzeile: s ? [s.name, s.ort].filter(Boolean).join(" · ") : "", standardFuss: verein, betreff: text(k.betreff, 200), text: text(k.text, 8000), gruss: text(k.gruss, 300), datum: heute, werte: (e) => briefWerte(e, schauWerte(verein, s, heute)) },
      empfaenger,
    );
    return pdfAntwort(c, inhalt, "serienbrief.pdf");
  });
}

/** Platzhalter aus der Schau (falls gewählt) für Vorschau und Serienbrief. */
function schauWerte(verein: string, s: typeof schau.$inferSelect | null, datum: string) {
  return { verein, schau: s?.name, ort: s?.ort, einlieferung: s?.einlieferung, meldeschluss: datumDe(s?.meldeschluss), bewertungstag: datumDe(s?.bewertungAm), rueckmeldung: datumDe(s?.preisrichterRueckmeldungBis), datum };
}

async function eigeneSchau(organisationId: number, id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return null;
  const [s] = await db.select().from(schau).where(and(eq(schau.id, id), eq(schau.organisationId, organisationId)));
  return s ?? null;
}
