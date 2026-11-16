/**
 * Einstieg des Servers (Hono): Sicherheits-Kopfzeilen, Gesundheitsprüfung, Schutz und Grenzen der tRPC-Anfragen,
 * dann die Datei-Adressen (eigene Module datei-*.ts, Reihenfolge wie hier registriert) und zuletzt die Oberfläche.
 */
import { compress } from "hono/compress";
import { trpcServer } from "@hono/trpc-server";
import { VERSION } from "@schau/domain";
import { Hono, type Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { COOKIE, COOKIE_RICHTER, ladeSitzung, type Angemeldet } from "./auth";
import { config } from "./config";
import { db } from "./db/client";
import { auskunftPdf } from "./pdf/auskunft";
import { appRouter } from "./router";
import { ladeAuskunft, ladeVereinsangaben, starteBereinigung } from "./services/datenschutz";
import { kurzerFehler } from "./services/fehlertext";
import { starteMailversand } from "./services/post";
import { starteTerminabruf } from "./services/termine";
import { briefDateien, druckvorlageDateien } from "./datei-druckvorlage";
import { spendenDateien } from "./datei-spenden";
import { meisterschaftDateien } from "./datei-meisterschaften";
import { strukturZuGross, type Context } from "./trpc";
import { clientIp } from "./besucher-adresse";
import { datei, pdf, zahlAus } from "./datei-hilfen";
import { katalogDateien } from "./datei-katalog";
import { unterlagenDateien } from "./datei-unterlagen";
import { exportDateien } from "./datei-exporte";
import { katalogVerzeichnis, oeffentlicheDateien } from "./datei-oeffentlich";

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
const GROSSE_ANFRAGEN = new Set(["katalogGestaltung.bildHochladen", "rassebild.hochladen", "stammdaten.importieren", "datenimport.lesen", "datenimport.pruefen", "datenimport.uebernehmen", "kontoauszug.pruefen", "kontoauszug.buchen"]);
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

katalogDateien(app);

druckvorlageDateien(app);
spendenDateien(app);
meisterschaftDateien(app);
briefDateien(app);

unterlagenDateien(app);
exportDateien(app);

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

oeffentlicheDateien(app);

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
