import { compress } from "hono/compress";
import { trpcServer } from "@hono/trpc-server";
import { bewertungsText, formatKatalognummer, ONLINE_MONATE, onlineAbgelaufen, schreibeIcal, VERSION, type KatalogSeitenbereich } from "@schau/domain";
import { heuteDe } from "./services/tiergesundheit";
import { Hono, type Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";
import { getConnInfo, serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { COOKIE, COOKIE_RICHTER, ladeSitzung, type Angemeldet } from "./auth";
import { config } from "./config";
import { db } from "./db/client";
import { aenderung, auszahlung, bild, katalogeintrag, meldung, organisation, rassebild, schau, verkauf } from "./db/schema";
import {
  abrechnungPdf,
  ausstellerUnterlagenPdf,
  bewertungskartenPdf,
  kassenberichtPdf,
  kaufbelegPdf,
  preisrichterListePdf,
  tierlistePdf,
  verkaufslistePdf,
} from "./pdf/dokumente";
import { datumDe } from "./pdf/basis";
import { auskunftPdf } from "./pdf/auskunft";
import { vorschauAus, vorschauAusKoerper, VORSCHAU_MAX_BYTES } from "./routers/katalog-gestaltung";
import { katalogPdf } from "./pdf/katalog";
import { aufbaulistePdf, hallenplanPdf } from "./pdf/hallenplan";
import { appRouter } from "./router";
import { abrechnungListe, offenerLauf, sepaXml } from "./routers/kasse";
import { ladeAuskunft, ladeVereinsangaben, starteBereinigung } from "./services/datenschutz";
import { kurzerFehler } from "./services/fehlertext";
import { starteMailversand } from "./services/post";
import { eigeneSchauenFuerKalender, starteTerminabruf } from "./services/termine";
import { adressSchluessel, Bremse } from "./services/bremse";
import { briefDateien, druckvorlageDateien } from "./datei-druckvorlage";
import { spendenDateien } from "./datei-spenden";
import { csv } from "./csv";
import { meisterschaftDateien } from "./datei-meisterschaften";
import { archiviereKassenbeleg, archiviereKaufbeleg, archiviereQuittung, archiviereSpendenquittung, ladeBeleg, ladeKassenbuch, type Belegart } from "./services/kassenbuch";
import { ladeEintraege, skalaVon, verdeckeNamen } from "./services/eintraege";
import { ladeTierliste } from "./services/tierliste";
import { ladeVerkaufsliste } from "./services/verkaufsliste";
import { strukturZuGross, type Context } from "./trpc";
import { oeffentlicherStand } from "./services/zwischenspeicher";

const app = new Hono<{ Variables: { sitzung?: Promise<Angemeldet> } }>();

// Content-Security-Policy für die Oberfläche: nur eigene Skripte, Schriften und Verbindungen (keine Fremdquellen).
// Keine Inline-Stile (React setzt style-Eigenschaften per DOM, das erlaubt die CSP). Keine Einbettung fremder Inhalte
// (COEP), keine Geräte-Schnittstellen (Permissions-Policy). PDFs und Bilder unter /datei ohne CSP – Chromes PDF-Ansicht
// vertrüge sie nicht.
const GERAETE_AUS = { camera: [], microphone: [], geolocation: [], payment: [], usb: [], serial: [], bluetooth: [], hid: [], midi: [], displayCapture: [] };
const mitCsp = secureHeaders({
  crossOriginEmbedderPolicy: "require-corp",
  permissionsPolicy: GERAETE_AUS,
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});
const ohneCsp = secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false, permissionsPolicy: GERAETE_AUS });
app.use("*", (c, next) => (c.req.path.startsWith("/datei/") || /^\/s\/[^/]+\/katalog\.pdf$/.test(c.req.path) || /^\/hilfe\/[a-z]+\.pdf$/.test(c.req.path) ? ohneCsp(c, next) : mitCsp(c, next)));

// API-Antworten komprimieren (z. B. die Meldeseite mit dem Vereinsverzeichnis: 180 KB → rund 30 KB).
app.use("/trpc/*", compress());

// Ohne PUBLIC_URL zeigen Links in Mails (Einladung, Meldebestätigung) auf den Entwicklungsserver.
if (config.production && !process.env.PUBLIC_URL) {
  console.warn("[betrieb] PUBLIC_URL ist nicht gesetzt – Links in Mails (Einladung, Meldung) zeigen auf http://localhost:5173. Bitte PUBLIC_URL in der .env setzen.");
}

let proxyWarnung = false;
/** Adresse des Besuchers für die Bremsen (IPv6 je /64 zusammengefasst). */
function clientIp(c: HonoContext): string {
  return adressSchluessel(rohAdresse(c));
}

function rohAdresse(c: HonoContext): string {
  if (!config.trustProxy && c.req.header("x-forwarded-for") && !proxyWarnung) {
    proxyWarnung = true;
    console.warn("[betrieb] Anfragen kommen über einen Proxy (X-Forwarded-For), TRUST_PROXY ist aber aus – alle Besucher zählen für die Bremsen als eine Adresse. Bitte TRUST_PROXY=1 setzen.");
  }
  if (config.trustProxy) {
    // Der eigene Proxy hängt die echte Adresse hinten an – der letzte Eintrag ist vertrauenswürdig.
    const kette = c.req.header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
    if (kette?.length) return kette[kette.length - 1]!;
  }
  try {
    return getConnInfo(c).remote.address ?? "unbekannt";
  } catch {
    return "unbekannt";
  }
}

// Gesundheitsprüfung (Docker): Server und Datenbank antworten.
app.get("/api/gesund", async (c) => {
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, nein) => setTimeout(() => nein(new Error("Zeitüberschreitung")), 3000))]);
    return c.json({ ok: true, version: VERSION });
  } catch {
    return c.json({ ok: false, fehler: "Datenbank antwortet nicht" }, 503);
  }
});

// Schutz vor Anfragen fremder Seiten (CSRF): Änderungen nur als JSON und nicht von einer fremden Seite aus.
// Die eigene Oberfläche schickt immer application/json; Formulare fremder Seiten können das nicht.
let httpsWarnung = false;
app.use("/trpc/*", async (c, next) => {
  if (c.req.method === "POST") {
    const typ = c.req.header("content-type") ?? "";
    if (!typ.toLowerCase().startsWith("application/json")) return c.json({ error: { json: { message: "Nur JSON-Anfragen.", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 415 } } } }, 415);
    if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: { json: { message: "Fremde Herkunft.", code: -32600, data: { code: "FORBIDDEN", httpStatus: 403 } } } }, 403);
  }
  if (!httpsWarnung && config.publicUrl.startsWith("https://") && new URL(c.req.url).protocol === "http:" && !c.req.header("x-forwarded-proto")) {
    httpsWarnung = true;
    console.warn("[betrieb] PUBLIC_URL beginnt mit https://, die Anfrage kam aber über http – Anmelde-Cookies werden dann nicht gesetzt. Bitte über HTTPS aufrufen (siehe README, Hallenbetrieb).");
  }
  return next();
});

// Größe der Anfragen begrenzen: Bild-Upload (Base64) und Verzeichnis-Import bis 12 MB, alles andere 1 MB, ohne
// gültige Anmeldung 256 KB (eine Online-Meldung mit 200 Tieren braucht etwa 60 KB).
// Das große Limit nur für Administratoren und nur, wenn die Anfrage ausschließlich aus diesen Aufrufen besteht.
const GROSSE_ANFRAGEN = new Set(["katalogGestaltung.bildHochladen", "rassebild.hochladen", "stammdaten.importieren"]);
/** Gebündelte Aufrufe: höchstens 10; öffentliche Aufrufe und Anmeldungen nur einzeln (sonst umgingen sie die Bremsen). */
const MAX_BUENDEL = 10;
const einzeln = (p: string) => p.startsWith("oeffentlich.") || p === "auth.anmelden" || p === "auth.anmeldenCode" || p.startsWith("auth.einladung") || p === "richter.anmelden";
/**
 * Die Aufrufe einer Anfrage, so wie tRPC sie liest: es dekodiert den Pfad vollständig (auch %2C) und trennt dann an
 * Kommas. Ein nicht dekodierbarer Pfad ergibt null.
 */
function aufrufe(c: HonoContext): string[] | null {
  try {
    return decodeURIComponent(c.req.path.replace(/^\/trpc\//, "")).split(",");
  } catch {
    return null;
  }
}
app.use("/trpc/*", async (c, next) => {
  const pfade = aufrufe(c);
  if (!pfade || pfade.length > MAX_BUENDEL || (pfade.length > 1 && pfade.some(einzeln))) {
    return c.json({ error: { json: { message: "Zu viele gebündelte Aufrufe.", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } } } }, 400);
  }
  await next();
});
const GRENZE_ANONYM = 256 * 1024;
const GRENZE_ANGEMELDET = 1024 * 1024;
const GRENZE_GROSS = 12 * 1024 * 1024;
/** So viele Anfragen über der Grenze für Anonyme dürfen gleichzeitig auf die Sitzungsprüfung warten (siehe unten). */
const MAX_UNGEPRUEFT = 16;
let ungeprueft = 0;
const trpcFehler = (c: HonoContext, status: 400 | 401 | 413 | 503, code: string, message: string) => c.json({ error: { json: { message, code: -32600, data: { code, httpStatus: status } } } }, status);
const zuGross = (c: HonoContext) => trpcFehler(c, 413, "PAYLOAD_TOO_LARGE", "Die Anfrage ist zu groß.");
/** Wie lange die letzte Eingabe in der Oberfläche her ist (ms, Kopfzeile der Oberfläche) – für die automatische Abmeldung. */
function eingabeVor(c: HonoContext): number | undefined {
  const wert = c.req.header("x-eingabe-vor");
  return wert && /^\d{1,12}$/.test(wert) ? Number(wert) : undefined;
}
app.use("/trpc/*", async (c, next) => {
  const token = getCookie(c, COOKIE);
  const tokenRichter = getCookie(c, COOKIE_RICHTER);
  const mitCookie = !!(token || tokenRichter);
  const grosserAufruf = (aufrufe(c) ?? []).every((p) => GROSSE_ANFRAGEN.has(p));
  // Erst prüfen, was ohne Datenbank geht: Während der Sitzungsprüfung sammelt Bun den Rumpf schon ein – bei beschäftigter
  // Datenbank sonst bis 13 MB je Verbindung. Wer dafür mehr als die Grenze für Anonyme mitbringt, zählt mit.
  const angabe = c.req.header("content-length");
  const laenge = angabe ? Number(angabe) : null;
  if (laenge != null && laenge > (!mitCookie ? GRENZE_ANONYM : grosserAufruf ? GRENZE_GROSS : GRENZE_ANGEMELDET)) return zuGross(c);
  const zaehlt = mitCookie && !!c.req.raw.body && (laenge == null || laenge > GRENZE_ANONYM);
  if (zaehlt && ungeprueft >= MAX_UNGEPRUEFT) return trpcFehler(c, 503, "SERVICE_UNAVAILABLE", "Der Server ist gerade ausgelastet. Bitte gleich noch einmal versuchen.");
  if (zaehlt) ungeprueft++;
  // Die Sitzung vor der eigentlichen Grenze prüfen: ein Cookie mit dem richtigen Namen kann jeder mitschicken.
  // Einmal laden und teilen – createContext meldet einen Datenbankfehler dann wie gewohnt, ohne zweite Wartezeit.
  const laden = ladeSitzung(token, tokenRichter, eingabeVor(c));
  c.set("sitzung", laden);
  const sitzung = await laden.catch(() => undefined).finally(() => void (zaehlt && ungeprueft--));
  const gross = sitzung?.benutzer?.rolle === "admin" && grosserAufruf;
  return bodyLimit({
    maxSize: gross ? GRENZE_GROSS : sitzung?.benutzer || sitzung?.richter ? GRENZE_ANGEMELDET : GRENZE_ANONYM,
    onError: (c2) => {
      if (!sitzung) return trpcFehler(c2, 503, "SERVICE_UNAVAILABLE", "Der Server ist gerade gestört. Bitte gleich noch einmal versuchen.");
      // Anmeldung abgelaufen: „neu anmelden“ hilft, „zu groß“ nicht (das Tablet böte sonst keine neue Anmeldung an).
      if (mitCookie && !sitzung.benutzer && !sitzung.richter) return trpcFehler(c2, 401, "UNAUTHORIZED", "Bitte anmelden.");
      return zuGross(c2);
    },
  })(c, next);
});
// Vor dem Parsen: Viele kleine Einträge und tiefe Verschachtelung binden ein Vielfaches ihrer Textlänge.
app.use("/trpc/*", async (c, next) => {
  const roh = c.req.method === "POST" ? await c.req.text() : (c.req.query("input") ?? "");
  if (strukturZuGross(roh)) return trpcFehler(c, 400, "BAD_REQUEST", "Die Anfrage ist zu umfangreich.");
  return next();
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    endpoint: "/trpc",
    maxBatchSize: MAX_BUENDEL,
    onError: ({ error, path }) => {
      // Nur unerwartete Fehler protokollieren; fachliche (BAD_REQUEST usw.) sind normale Rückmeldungen.
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path ?? "?"}:`, kurzerFehler(error.cause ?? error));
    },
    createContext: async (_opts, c): Promise<Context & Record<string, unknown>> => {
      const tokens = { benutzer: getCookie(c, COOKIE), richter: getCookie(c, COOKIE_RICHTER) };
      const sitzung: Angemeldet = await (c.get("sitzung") ?? ladeSitzung(tokens.benutzer, tokens.richter, eingabeVor(c)));
      return {
        ...sitzung,
        cookieTokens: tokens,
        ip: clientIp(c),
        setCookie: (wert) => c.header("Set-Cookie", wert, { append: true }),
      };
    },
  }),
);

// ── Dateien (PDF, CSV) – gleiche Anmeldung wie die Oberfläche ───────────


/** Ganze Zahl im Wertebereich der Datenbank-IDs (1 bis 2.147.483.647), sonst null – kein Datenbankfehler aus der Adresse. */
function zahlAus(wert: string | undefined): number | null {
  if (!wert || !/^\d{1,10}$/.test(wert)) return null;
  const n = Number(wert);
  return n >= 1 && n <= 2_147_483_647 ? n : null;
}

/** Echtes Kalenderdatum JJJJ-MM-TT oder null. */
function datumAus(wert: string | undefined): string | null {
  if (!wert || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const t = Date.parse(`${wert}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === wert ? wert : null;
}

async function schauMitBenutzer(c: HonoContext, opts: { nurAdmin?: boolean } = {}) {
  const id = zahlAus(c.req.param("schauId"));
  const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
  if (!benutzer || id == null || (opts.nurAdmin && benutzer.rolle !== "admin")) return null;
  const [s] = await db.select().from(schau).where(eq(schau.id, id));
  return s && s.organisationId === benutzer.organisationId ? { s, benutzer } : null;
}
async function schauFuer(c: HonoContext, opts: { nurAdmin?: boolean } = {}) {
  return (await schauMitBenutzer(c, opts))?.s ?? null;
}

function datei(c: HonoContext, inhalt: Buffer | string, name: string, typ: string) {
  return c.body(typeof inhalt === "string" ? inhalt : new Uint8Array(inhalt), 200, {
    "Content-Type": typ,
    "Content-Disposition": `inline; filename="${name}"`,
    "Cache-Control": "no-store",
  });
}
const pdf = (c: HonoContext, b: Buffer, name: string) => datei(c, b, name, "application/pdf");
/** Beleg aus dem Archiv, mit Prüfsumme im Kopf (zum Abgleich mit der Belegliste). */
const archivPdf = (c: HonoContext, b: { pdf: Buffer; sha256: string }, name: string) => {
  c.header("X-Beleg-SHA256", b.sha256);
  return datei(c, b.pdf, name, "application/pdf");
};

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

/**
 * Kataloge mit vielen Bildern brauchen beim Erzeugen viel Speicher – höchstens einer zur Zeit (weitere warten),
 * damit gleichzeitige Abrufe den Server nicht über seine Speichergrenze treiben.
 */
let katalogKette: Promise<unknown> = Promise.resolve();
/** Bleibt eine Erzeugung hängen (z. B. ein Bild, das pdfkit nicht fertig entpackt), warten die anderen nicht ewig. */
const KATALOG_HOECHSTENS_MS = 3 * 60_000;
/** Eine Vorschau, die beim Start schon von einer neueren desselben Benutzers abgelöst ist (siehe unten). */
class VorschauUeberholt extends Error {}
function katalogNacheinander(s: typeof schau.$inferSelect, opts?: Parameters<typeof katalogPdf>[1], nochGewollt?: () => boolean): Promise<Buffer> {
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

app.get("/datei/:schauId/katalog.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  // Mit Angaben in der Adresse: Vorschau mit noch nicht gespeicherter Darstellung (siehe vorschauAus).
  const vorschau = vorschauAus(c.req.query());
  if (vorschau === "ungueltig") return c.text("Ungültige Angaben für die Vorschau.", 400);
  return pdf(c, await katalogNacheinander(s, vorschau ? { vorschau } : undefined), `katalog-${s.slug}${vorschau ? "-vorschau" : ""}.pdf`);
});

/**
 * Live-Vorschau der Seite „Katalog“: Formular im Rumpf (auch Texte, siehe vorschauAusKoerper), meist als Kurzvorschau.
 * Sie reiht sich in dieselbe Warteschlange wie die Kataloge ein. Damit Tippen die Schlange nicht füllt, zählt je
 * Benutzer nur die neueste: ältere, die noch warten, entfallen (409), ebenso abgebrochene Abrufe.
 */
const vorschauBremse = new Bremse(90, 60_000, "Zu viele Vorschauen. Bitte kurz warten.");
const vorschauNeueste = new Map<number, number>();
let vorschauZaehler = 0;
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

druckvorlageDateien(app);
spendenDateien(app);
meisterschaftDateien(app);
briefDateien(app);

app.get("/datei/:schauId/bewertungskarten.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const pr = c.req.query("preisrichter");
  if (pr && zahlAus(pr) == null) return c.text("Preisrichter nicht gefunden.", 404);
  return pdf(c, await bewertungskartenPdf(s, pr ? zahlAus(pr)! : undefined), `bewertungskarten-${s.slug}.pdf`);
});

app.get("/datei/:schauId/preisrichter/:prId/liste.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const pr = zahlAus(c.req.param("prId"));
  if (pr == null) return c.text("Preisrichter nicht gefunden.", 404);
  return pdf(c, await preisrichterListePdf(s, pr), `bewertungsliste.pdf`);
});

app.get("/datei/:schauId/aussteller.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const einzel = c.req.query("meldung");
  if (einzel && zahlAus(einzel) == null) return c.text("Meldung nicht gefunden.", 404);
  const ids = einzel
    ? [zahlAus(einzel)!]
    : (await db.select({ id: meldung.id }).from(meldung).where(eq(meldung.schauId, s.id))).map((m) => m.id);
  return pdf(c, await ausstellerUnterlagenPdf(s, ids), `b-bogen-${s.slug}.pdf`);
});

app.get("/datei/:schauId/abrechnung.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const aRoh = c.req.query("aussteller");
  const qRoh = c.req.query("quittung");
  const a = zahlAus(aRoh);
  const q = zahlAus(qRoh);
  if ((aRoh && a == null) || (qRoh && q == null)) return c.text("Abrechnung nicht gefunden.", 404);
  // Quittungen kommen aus dem Belegarchiv (so wie beim Buchen erzeugt); die Abrechnung ohne Quittung ist eine Vorschau.
  if (a != null && q != null) {
    const [b] = await db
      .select({ storniert: auszahlung.storniertAm })
      .from(auszahlung)
      .where(and(eq(auszahlung.schauId, s.id), eq(auszahlung.ausstellerId, a), eq(auszahlung.quittungNr, q)));
    if (!b) return c.text("Quittung nicht gefunden.", 404);
    const archiv = (b.storniert && (await archiviereQuittung(s, a, q, true))) || (await archiviereQuittung(s, a, q));
    if (archiv) return archivPdf(c, archiv, `quittung-${q}.pdf`);
  }
  return pdf(c, await abrechnungPdf(s, a ?? undefined, q ?? undefined), `abrechnung-${s.slug}.pdf`);
});

// Hono nähme bei ":id.pdf" den Namen "id.pdf" – daher Muster mit Endung.
app.get("/datei/:schauId/kaufbeleg/:datei{[0-9]+\\.pdf}", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const id = Number.parseInt(c.req.param("datei"), 10);
  // Aus dem Belegarchiv: der Beleg von damals, nach Storno der Stornobeleg.
  // Nur Verkäufe dieser Schau – sonst ließe sich über eine fremde ID ein falscher Beleg ins Archiv legen.
  const [v] =
    id <= 2_147_483_647
      ? await db
          .select({ storniert: verkauf.storniertAm })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .where(and(eq(verkauf.id, id), eq(katalogeintrag.schauId, s.id)))
      : [];
  if (!v) return c.text("Kaufbeleg nicht gefunden.", 404);
  const archiv = (v.storniert && (await archiviereKaufbeleg(s, id, true))) || (await archiviereKaufbeleg(s, id));
  if (archiv) return archivPdf(c, archiv, `kaufbeleg-${archiv.nummer}.pdf`);
  return pdf(c, await kaufbelegPdf(s, id), `kaufbeleg.pdf`);
});

app.get("/datei/:schauId/kassenbericht.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const roh = c.req.query("datum");
  const datum = datumAus(roh);
  if (roh && !datum) return c.text("Datum ungültig.", 400);
  return pdf(c, await kassenberichtPdf(s, datum ?? undefined), `kassenbericht-${s.slug}${datum ? `-${datum}` : ""}.pdf`);
});

/** Ein archivierter Beleg (Original, Storno, Einzahlung, Eigenbeleg) – genau wie beim Buchen abgelegt. */
app.get("/datei/:schauId/beleg/:art{[a-z-]+}/:datei{[0-9]+\\.pdf}", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const nummer = zahlAus(c.req.param("datei").replace(".pdf", ""));
  // Die Art genau prüfen: ein Muster mit Alternativen nahm „kaufbeleg-storno“ als „kaufbeleg“ und lieferte das Original.
  if (!["kaufbeleg", "kaufbeleg-storno", "quittung", "quittung-storno", "einzahlung", "eigenbeleg", "spende", "spende-storno"].includes(c.req.param("art"))) return c.text("Beleg nicht gefunden.", 404);
  const art = c.req.param("art") as Belegart;
  let b = nummer == null ? null : await ladeBeleg(s.id, art, nummer);
  // Kassenbelege, deren Ablage beim Buchen scheiterte, entstehen beim ersten Abruf (wie Quittungen und Kaufbelege).
  if (!b && nummer != null && (art === "einzahlung" || art === "eigenbeleg")) b = await archiviereKassenbeleg(s, art, nummer);
  if (!b && nummer != null && (art === "spende" || art === "spende-storno")) b = await archiviereSpendenquittung(s, nummer, art === "spende-storno");
  if (!b) return c.text("Beleg nicht gefunden.", 404);
  return archivPdf(c, b, `${b.art}-${b.nummer}.pdf`);
});

app.get("/datei/:schauId/kassenbuch.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const tage = await ladeKassenbuch(s.id);
  const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
  return datei(
    c,
    csv([
      ["Tag", "Zeit", "Vorgang", "Einnahme", "Ausgabe", "Bestand"],
      ...tage.flatMap((t) => {
        let bestand = t.anfangCent;
        return [
          [datumDe(t.datum), "", "Anfangsbestand", "", "", euro(t.anfangCent)],
          ...t.bewegungen.map((b) => {
            bestand += b.betragCent;
            return [datumDe(t.datum), zeit(b.zeit), b.nachtrag ? `Nachtrag: ${b.text}` : b.text, b.betragCent > 0 ? euro(b.betragCent) : "", b.betragCent < 0 ? euro(-b.betragCent) : "", euro(bestand)];
          }),
          [datumDe(t.datum), "", "Soll-Endbestand", "", "", euro(t.sollCent)],
          // Nach einer Zählung geht es mit dem gezählten Bestand weiter – Unterschied als Kassendifferenz ausweisen.
          ...(t.abschluss && t.endCent !== t.sollCent
            ? [
                [datumDe(t.datum), "", "Kassendifferenz laut Abschluss", "", "", euro(t.endCent - t.sollCent)],
                [datumDe(t.datum), "", "Endbestand (gezählt + Nachträge)", "", "", euro(t.endCent)],
              ]
            : []),
          ...t.abschluesse.map((a) => [datumDe(t.datum), zeit(a.createdAt), `${a.nachtrag ? `Nachtragsabschluss ${a.nachtrag}` : "Tagesabschluss"} gezählt (Soll ${euro(a.sollCent).zahl} €, Differenz ${(a.differenzCent / 100).toFixed(2).replace(".", ",")} €) ${a.bemerkung}`.trim(), "", "", euro(a.istCent)]),
        ];
      }),
    ]),
    `kassenbuch-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

// Export des Protokolls mit Hash-Kette (GoBD: Nachvollziehbarkeit, maschinelle Auswertbarkeit).
app.get("/datei/:schauId/protokoll.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  // Mit allen Feldern, die in den Hash eingehen (Zeitpunkt in UTC auf die Mikrosekunde) – so lässt sich die Kette
  // auch außerhalb der Anwendung nachrechnen (Aufbau siehe README, Abschnitt Betrieb).
  const zeilen = await db
    .select({
      z: aenderung,
      utc: sql<string>`to_char(${aenderung.zeitpunkt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      // Textform wie in der Datenbank (jsonb) – genau sie geht in den Inhalts-Hash ein.
      altText: sql<string | null>`${aenderung.alt}::text`,
      neuText: sql<string | null>`${aenderung.neu}::text`,
    })
    .from(aenderung)
    .where(eq(aenderung.schauId, s.id))
    .orderBy(asc(aenderung.id));
  const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
  return datei(
    c,
    csv([
      ["Nr", "Zeitpunkt", "Wer", "Bereich", "Datensatz", "Aktion", "Grund", "Vorher", "Nachher", "Hash", "Vorgänger-Hash", "Vorgänger-Nr", "Schau", "Benutzer-ID", "Preisrichter-ID", "Zeitpunkt UTC", "Hash-Aufbau", "Inhalts-Hash"],
      ...zeilen.map(({ z, utc, altText, neuText }) => [
        z.id,
        zeit(z.zeitpunkt),
        z.wer,
        z.tabelle,
        z.datensatzId ?? "",
        z.aktion,
        z.grund,
        altText ?? "",
        neuText ?? "",
        z.hash ?? "",
        z.vorherHash ?? "",
        z.vorherId ?? "",
        z.schauId ?? "",
        z.benutzerId ?? "",
        z.preisrichterId ?? "",
        utc,
        z.hashVersion ?? 1,
        z.inhaltHash ?? "",
      ]),
    ]),
    `protokoll-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

// Maschinenlesbar und unverändert (ohne den Formelschutz der CSV): genau die Felder, die in die Hash-Kette eingehen.
app.get("/datei/:schauId/protokoll.json", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const zeilen = await db
    .select({
      nr: aenderung.id,
      vorgaengerNr: aenderung.vorherId,
      vorgaengerHash: aenderung.vorherHash,
      schau: aenderung.schauId,
      bereich: aenderung.tabelle,
      datensatz: aenderung.datensatzId,
      aktion: aenderung.aktion,
      benutzerId: aenderung.benutzerId,
      preisrichterId: aenderung.preisrichterId,
      wer: aenderung.wer,
      grund: aenderung.grund,
      zeitpunktUtc: sql<string>`to_char(${aenderung.zeitpunkt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
      vorherText: sql<string | null>`${aenderung.alt}::text`,
      nachherText: sql<string | null>`${aenderung.neu}::text`,
      hashAufbau: aenderung.hashVersion,
      inhaltsHash: aenderung.inhaltHash,
      hash: aenderung.hash,
    })
    .from(aenderung)
    .where(eq(aenderung.schauId, s.id))
    .orderBy(asc(aenderung.id));
  return datei(c, JSON.stringify(zeilen, null, 1), `protokoll-${s.slug}.json`, "application/json; charset=utf-8");
});

app.get("/datei/:schauId/verkaufsliste.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  return pdf(c, await verkaufslistePdf(s), `verkaufsliste-${s.slug}.pdf`);
});

const euro = (cent: number) => ({ zahl: (cent / 100).toFixed(2).replace(".", ",") });

app.get("/datei/:schauId/abrechnung.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const zeilen = await abrechnungListe(s.id);
  return datei(
    c,
    csv([
      ["Aussteller", "Ort", "Tiere", "Meldegeld", "Stiftung", "Spende", "bezahlt", "Preisgeld", "Verkauf", "Provision", "Saldo", "Quittung", "ausgezahlt", "Abweichung"],
      ...zeilen.map((z) => [
        z.name,
        z.ort,
        z.tiere,
        euro(z.meldebetragCent),
        euro(z.stiftungCent),
        euro(z.spendeCent),
        euro(z.bezahltCent),
        euro(z.preisgeldCent),
        euro(z.verkaufCent),
        euro(z.provisionCent),
        euro(z.saldoCent),
        z.buchungen.filter((b) => !b.storniertAm).map((b) => b.quittungNr).join(", "),
        z.buchungen.some((b) => !b.storniertAm) ? euro(z.ausgezahltCent) : "",
        z.differenzCent ? euro(z.differenzCent) : "",
      ]),
    ]),
    `abrechnung-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

app.get("/datei/:schauId/ergebnisse.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  // Wie im Druckkatalog: ohne unterschriebenen Meldebogen kein Name. Die Spalte „online“ zeigt, wer im Internet erscheinen darf.
  const e = verdeckeNamen(await ladeEintraege(s.id, { nurBestaetigt: true }), "druck");
  return datei(
    c,
    csv([
      ["Nr", "Sparte", "Rasse, Farbenschlag", "Art", "Geschlecht", "Alter", "Aussteller", "Ort", "Verein", "Online veröffentlichen", "Ergebnis", "Punkte", "Preise", "Verkauf"],
      ...e
        .filter((x) => x.katalogNr != null)
        .map((x) => [
          formatKatalognummer(x),
          x.sparte ?? "",
          x.bezeichnung,
          x.art,
          x.geschlecht,
          x.alter,
          x.ausstellerName,
          x.ort,
          x.verein,
          x.zustimmungAm && x.onlineZustimmungAm ? "ja" : "nein",
          x.status === "fehlt" ? "fehlt" : bewertungsText({ punkte: x.punkte, sondernote: x.sondernote }, skalaVon(s)),
          x.punkte ?? "",
          x.preise.map((p) => p.kuerzel).join(" "),
          x.verkauftAn ? "verkauft" : "",
        ]),
    ]),
    `ergebnisse-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

/** Verkaufsliste für das Veterinäramt als Tabelle – gleiche Angaben wie das PDF. */
// Hallenplan auf einem Blatt A4 und die Aufbauliste je Reihe (eigenes PDF).
app.get("/datei/:schauId/hallenplan.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  return pdf(c, await hallenplanPdf(s), `hallenplan-${s.slug}.pdf`);
});
app.get("/datei/:schauId/aufbauliste.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  return pdf(c, await aufbaulistePdf(s), `aufbauliste-${s.slug}.pdf`);
});

// Aussteller- und Tierliste für das Veterinäramt (Art. 105 VO (EU) 2016/429, Aufbewahrung 3 Jahre).
app.get("/datei/:schauId/tierliste.pdf", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  return pdf(c, await tierlistePdf(s), `tierliste-${s.slug}.pdf`);
});

app.get("/datei/:schauId/tierliste.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const t = await ladeTierliste(s);
  return datei(
    c,
    csv([
      ["Aussteller", "Anschrift", "Registriernummer", "Nachweise", "Katalog-Nr", "Tierart", "Tier", "Klasse", "Anzahl", "Ring-Nr", "Status", "Verbleib", "Gesperrt"],
      ...t.aussteller.flatMap((a) =>
        a.tiere.map((z) => [a.name, a.anschrift, a.registriernummer, a.nachweise, z.katalogNr, z.tierart, z.tier, z.klasse, z.anzahl, z.ringnummern, z.status, z.verbleib, z.gesperrt ? "ja" : ""]),
      ),
    ]),
    `tierliste-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

app.get("/datei/:schauId/verkaufsliste.csv", async (c) => {
  const s = await schauFuer(c);
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const zeilen = await ladeVerkaufsliste(s.id);
  return datei(
    c,
    csv([
      [
        "Beleg",
        "Datum",
        "Katalog-Nr",
        "Sparte",
        "Tier",
        "Klasse",
        "Anzahl",
        "Ring-Nr",
        "Herkunft Name",
        "Herkunft Anschrift",
        "Herkunft Registriernummer",
        "Bestimmung Name",
        "Bestimmung Anschrift",
        "Bestimmung Registriernummer",
        "Käufer unter 16 (Einwilligung)",
        "Preis",
        "Storniert am",
        "Stornogrund",
      ],
      ...zeilen.map((z) => [
        z.belegNr,
        datumDe(z.datum),
        z.katalogNr,
        z.sparte,
        z.tier,
        z.klasse,
        z.anzahl,
        z.ringnummern,
        z.herkunftName,
        z.herkunftAnschrift,
        z.herkunftRegistriernummer,
        z.bestimmungName,
        z.bestimmungAnschrift,
        z.bestimmungRegistriernummer,
        z.kaeuferUnter16 ? z.kaeuferErziehungsberechtigter : "",
        euro(z.preisCent),
        z.storniertAm ? datumDe(z.storniertAm) : "",
        z.stornoGrund,
      ]),
    ]),
    `verkaufsliste-${s.slug}.csv`,
    "text/csv; charset=utf-8",
  );
});

/**
 * Sammelüberweisung (SEPA pain.001.001.09): die in der Abrechnung erstellte, noch offene Datei.
 * Bei jedem Abruf derselbe Inhalt – gebucht wird später genau dieser Stand.
 */
app.get("/datei/:schauId/ueberweisungen.xml", async (c) => {
  // Enthält alle IBANs – nur für die Ausstellungsleitung, die die Überweisung auch erstellt und bucht.
  const s = await schauFuer(c, { nurAdmin: true });
  if (!s) return c.text("Nicht angemeldet oder keine Berechtigung.", 403);
  const lauf = await offenerLauf(db, s.id);
  if (!lauf) return c.text("Keine offene SEPA-Datei. Bitte zuerst in der Abrechnung erstellen.", 400);
  try {
    return c.body(sepaXml(s, lauf), 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="ueberweisungen-${s.slug}-${lauf.ausfuehrungAm}.xml"`,
      "Cache-Control": "no-store",
    });
  } catch (err) {
    return c.text(String(err instanceof Error ? err.message : err), 400);
  }
});

// Auskunft nach Art. 15 DSGVO (PDF zum Lesen, JSON maschinenlesbar nach Art. 20) – nur Administratoren.
const auskunft = (format: "pdf" | "json") => async (c: HonoContext) => {
  const { benutzer } = await ladeSitzung(getCookie(c, COOKIE));
  if (!benutzer || benutzer.rolle !== "admin") return c.text("Nur für Administratoren.", 403);
  const id = zahlAus(c.req.param("ausstellerId"));
  if (id == null) return c.text("Aussteller nicht gefunden.", 404);
  try {
    const a = await ladeAuskunft(benutzer.organisationId, id);
    if (format === "json") return datei(c, JSON.stringify(a, null, 2), `auskunft-${id}.json`, "application/json; charset=utf-8");
    return pdf(c, await auskunftPdf(a, await ladeVereinsangaben(benutzer.organisationId)), `auskunft-${id}.pdf`);
  } catch {
    return c.text("Aussteller nicht gefunden.", 404);
  }
};
app.get("/datei/aussteller/:ausstellerId{[0-9]+}/auskunft.pdf", auskunft("pdf"));
app.get("/datei/aussteller/:ausstellerId{[0-9]+}/auskunft.json", auskunft("json"));

/**
 * Öffentlicher Katalog nach Freigabe der Ergebnisse. Erzeugt wird er nur, wenn sich seit dem letzten Mal etwas
 * geändert hat (Protokollstand der Schau), und dann höchstens alle 10 Minuten neu – außer bei Datenschutz-Änderungen
 * (Löschung, Widerruf der Online-Veröffentlichung, Stifter): die gelten sofort. Gleichzeitige Abrufe teilen sich eine
 * Erzeugung; gespeichert werden höchstens 20 Kataloge. Je Adresse höchstens 20 Abrufe pro Minute.
 * Ausgeliefert wird aus einer Datei: Ein langsamer Abruf hält sonst das ganze PDF je Verbindung im Arbeitsspeicher.
 */
const KATALOG_ABSTAND_MS = 10 * 60_000;
const KATALOG_MAX = 20;
type KatalogEintrag = { stand: string; maxId: number; zaehler: number; zeit: number; pfad: Promise<string> };
const katalogCache = new Map<number, KatalogEintrag>();
const katalogVerzeichnis = join(tmpdir(), `schau-katalog-${config.port}`);
let katalogDateiNr = 0;
async function katalogAlsDatei(s: typeof schau.$inferSelect): Promise<string> {
  const inhalt = await katalogNacheinander(s, { online: true });
  mkdirSync(katalogVerzeichnis, { recursive: true, mode: 0o700 });
  const pfad = join(katalogVerzeichnis, `${s.id}-${process.pid}-${++katalogDateiNr}.pdf`);
  await Bun.write(pfad, inhalt);
  return pfad;
}
/** Abgelöste Datei später löschen: ein Abruf, der sie gerade erst bekommen hat, soll sie noch öffnen können. */
function katalogVerwerfen(e: KatalogEintrag | undefined) {
  e?.pfad.then(
    (pfad) => void setTimeout(() => void rm(pfad, { force: true }).catch(() => {}), 60_000).unref?.(),
    () => {},
  );
}
const katalogBremse = new Bremse(20, 60_000, "Zu viele Abrufe. Bitte gleich noch einmal versuchen.");
async function datenschutzGeaendert(schauId: number, seit: number) {
  const [x] = await db
    .select({ n: count() })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), gt(aenderung.id, seit), inArray(aenderung.tabelle, ["aussteller", "meldung", "stiftung"])));
  return (x?.n ?? 0) > 0;
}
/**
 * Eigene Schauen des Vereins als Kalender (iCal) – andere Vereine abonnieren ihn für die Katalogseite „Kommende
 * Schauen“. Nur Name, Ort, Tage und Link zur Schauseite; abschaltbar unter „Katalog“ → „Kommende Schauen“.
 */
const kalenderBremse = new Bremse(60, 60_000, "Zu viele Abrufe.");
app.get("/o/:id{[0-9]+}/schauen.ics", async (c) => {
  try {
    kalenderBremse.versuch([`ip:${clientIp(c)}`]);
  } catch {
    return c.text("Zu viele Abrufe. Bitte später noch einmal.", 429);
  }
  const id = zahlAus(c.req.param("id"));
  const [o] = id == null ? [] : await db.select({ name: organisation.name, an: organisation.termineVeroeffentlichen }).from(organisation).where(eq(organisation.id, id));
  if (!o || !o.an) return c.text("Kalender nicht gefunden.", 404);
  const ics = schreibeIcal({ name: `Schauen ${o.name}`, prodid: "-//SchauFUCHS//Schautermine//DE" }, await eigeneSchauenFuerKalender(id!), new Date());
  return c.body(ics, 200, { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="schauen.ics"`, "Cache-Control": "public, max-age=3600" });
});

app.get("/s/:slug/katalog.pdf", async (c) => {
  try {
    katalogBremse.versuch([`ip:${clientIp(c)}`]);
  } catch {
    return c.text("Zu viele Abrufe. Bitte gleich noch einmal versuchen.", 429);
  }
  const [s] = await db.select().from(schau).where(eq(schau.slug, c.req.param("slug").slice(0, 100)));
  if (!s || !s.ergebnisseFreigegeben) return c.text("Der Katalog ist noch nicht veröffentlicht.", 404);
  if (onlineAbgelaufen(s.bewertungAm, heuteDe())) return c.text(`Der Katalog steht nur ${ONLINE_MONATE} Monate nach der Schau im Internet.`, 404);
  const neu = await oeffentlicherStand(s.id);
  const alt = katalogCache.get(s.id);
  let eintrag = alt;
  // Sofort neu: Datenschutz-Änderungen und bewusste Änderungen an Gestaltung oder Preisrichter-Angaben.
  const sofort = async (a: NonNullable<typeof alt>) => a.zaehler !== neu.zaehler || (await datenschutzGeaendert(s.id, a.maxId));
  if (!alt || (alt.stand !== neu.schluessel && (Date.now() - alt.zeit > KATALOG_ABSTAND_MS || (await sofort(alt))))) {
    // Während der Prüfung oben kann eine gleichzeitige Anfrage schon erneuert haben: dann deren Katalog nehmen.
    const aktuell = katalogCache.get(s.id);
    if (aktuell && aktuell !== alt) eintrag = aktuell;
    else {
      eintrag = { stand: neu.schluessel, maxId: neu.maxId, zaehler: neu.zaehler, zeit: Date.now(), pfad: katalogAlsDatei(s) };
      katalogVerwerfen(aktuell);
      katalogCache.delete(s.id);
      katalogCache.set(s.id, eintrag);
      // Älteste zuerst verwerfen (Map behält die Einfüge-Reihenfolge).
      while (katalogCache.size > KATALOG_MAX) {
        const aeltester = katalogCache.keys().next().value!;
        katalogVerwerfen(katalogCache.get(aeltester));
        katalogCache.delete(aeltester);
      }
      const e = eintrag;
      e.pfad.catch(() => katalogCache.get(s.id) === e && katalogCache.delete(s.id));
    }
  }
  const katalogDatei = Bun.file(await eintrag!.pfad);
  if (!(await katalogDatei.exists())) {
    // Von außen gelöscht (z. B. Aufräumen von /tmp): beim nächsten Abruf neu erzeugen.
    if (katalogCache.get(s.id) === eintrag) katalogCache.delete(s.id);
    return c.text("Der Katalog wird gerade neu erzeugt. Bitte gleich noch einmal versuchen.", 503);
  }
  return new Response(katalogDatei, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="katalog-${s.slug}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
});

// ── Oberfläche (Produktion: gebautes Frontend ausliefern) ──────────────

const webDist = join(import.meta.dir, "../../web/dist");
if (existsSync(webDist)) {
  // serveStatic erwartet einen Pfad relativ zum Arbeitsverzeichnis.
  const root = relative(process.cwd(), webDist) || ".";
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/*", serveStatic({ root }));
  // Alle übrigen Adressen gehören zur Oberfläche (Single-Page-App).
  const indexHtml = readFileSync(join(webDist, "index.html"), "utf8");
  app.get("*", (c) => c.html(indexHtml));
}

app.onError((err, c) => {
  console.error("[server]", c.req.method, c.req.path, kurzerFehler(err));
  return c.text("Interner Fehler", 500);
});

console.log(`${config.appName} läuft auf http://localhost:${config.port}`);
// Speicherfristen: beim Start und dann täglich (Datenschutzhinweise, Abschnitt Speicherdauer).
// Nur als laufender Server, nicht wenn Tests die App importieren.
if (import.meta.main) {
  // Reste eines früheren Laufs (nach einem Absturz gibt es sonst niemanden, der sie löscht).
  rmSync(katalogVerzeichnis, { recursive: true, force: true });
  starteBereinigung();
  starteMailversand();
  starteTerminabruf();
}

// idleTimeout: große PDFs (Katalog, B-Bögen) brauchen bei vielen Tieren länger als Buns Standard von 10 s.
// maxRequestBodySize: oberhalb der größten zulässigen Anfrage (12 MB) – gilt auch für Adressen außerhalb von /trpc.
export default { port: config.port, fetch: app.fetch, idleTimeout: 60, maxRequestBodySize: 13 * 1024 * 1024 };
