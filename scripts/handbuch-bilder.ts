/**
 * Bildschirmfotos für die Handbücher (docs/handbuch/bilder) – reproduzierbar aus den Demo-Daten.
 *
 *   bun scripts/handbuch-bilder.ts            alle Bilder
 *   bun scripts/handbuch-bilder.ts hallenplan preise   nur diese
 *
 * Legt zwei eigene Datenbanken an (A: Demo bis zur Bewertung, B: Demo komplett durchgespielt), startet je einen Server,
 * steuert Chrome ohne Fenster über das DevTools-Protokoll (keine zusätzlichen Pakete) und speichert JPEGs in der Größe
 * der bisherigen Bilder (Bildschirm 1280 × 800, Tablet 1180 × 820, jeweils 1,5-fach). Danach `sh scripts/handbuch.sh`.
 *
 * Voraussetzungen: lokale PostgreSQL (`bun run db:start`), gebaute Oberfläche (`cd apps/web && bun run build`), Chrome
 * bzw. Chromium (Pfad in CHROME, sonst die üblichen Orte). Datenbank-Server: HANDBUCH_DB (Standard wie db:start).
 */
import { SQL } from "bun";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WURZEL = join(import.meta.dir, "..");
const ZIEL = join(WURZEL, "docs/handbuch/bilder");
const DB = process.env.HANDBUCH_DB ?? "postgres://schau@localhost:5442";
const DEMO = { email: "demo@schau.test", passwort: "Demo-Schau-2026", pin: "20262026" };
const HELFER = { name: "Hanna Helferin", email: "helferin@demo.test", passwort: "Demo-Helfer-2026" };
const nur = new Set(process.argv.slice(2));
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Datenbanken und Server ────────────────────────────────────────────────
async function datenbank(name: string, lauf: "--bis-bewertung" | "--komplett") {
  const admin = new SQL(`${DB}/postgres`);
  await admin.unsafe(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${name}'`);
  await admin.unsafe(`drop database if exists ${name}`);
  await admin.unsafe(`create database ${name}`);
  await admin.close();
  const env = { ...process.env, DATABASE_URL: `${DB}/${name}`, SCHAU_VERZEICHNIS: "seed/demo-stammdaten.csv" };
  for (const befehl of [["bun", "src/migrate.ts"], ["bun", "src/seed.ts", lauf]]) {
    const p = Bun.spawnSync(befehl, { cwd: join(WURZEL, "apps/server"), env, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`${befehl.join(" ")} (${name}): ${p.stderr.toString().slice(-800)}`);
  }
}

function server(name: string, port: number) {
  const env = { ...process.env, PORT: String(port), DATABASE_URL: `${DB}/${name}`, ZWEI_FAKTOR_PFLICHT: "0", PUBLIC_URL: `http://localhost:${port}`, APP_NAME: "SchauFUCHS" };
  return Bun.spawn(["bun", "src/index.ts"], { cwd: join(WURZEL, "apps/server"), env, stdout: "ignore", stderr: "pipe" });
}

async function bereit(url: string) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/api/gesund`).then((r) => r.ok).catch(() => false)) return;
    await warte(200);
  }
  throw new Error(`Server ${url} startet nicht.`);
}

/** tRPC-Aufruf mit Cookie; gibt Ergebnis und gesetzte Cookies zurück. */
async function trpc(basis: string, pfad: string, input: unknown, cookie = "") {
  const r = await fetch(`${basis}/trpc/${pfad}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ json: input }) });
  const j = (await r.json()) as { result?: { data: { json: unknown } }; error?: { json: { message: string } } };
  if (j.error) throw new Error(`${pfad}: ${j.error.json.message}`);
  return { daten: j.result!.data.json, cookies: r.headers.getSetCookie().map((c) => c.split(";")[0]!) };
}
const anmelden = async (basis: string, email: string, passwort: string) => (await trpc(basis, "auth.anmelden", { email, passwort })).cookies.join("; ");

// ── Chrome über das DevTools-Protokoll ────────────────────────────────────
function chromePfad(): string {
  const kandidaten = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const p = kandidaten.find((k) => k && existsSync(k));
  if (!p) throw new Error("Chrome nicht gefunden – Pfad in CHROME angeben.");
  return p;
}

class Seite {
  private nr = 0;
  private offen = new Map<number, { ok: (v: unknown) => void; fehler: (e: Error) => void }>();
  constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data)) as { id?: number; result?: unknown; error?: { message: string } };
      const o = d.id != null ? this.offen.get(d.id) : undefined;
      if (!o) return;
      this.offen.delete(d.id!);
      if (d.error) o.fehler(new Error(d.error.message));
      else o.ok(d.result);
    };
  }
  static async verbinden(port: number) {
    for (let i = 0; i < 100; i++) {
      const liste = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>).catch(() => null);
      const s = liste?.find((t) => t.type === "page");
      if (s) {
        const ws = new WebSocket(s.webSocketDebuggerUrl);
        await new Promise((ok) => (ws.onopen = ok));
        const seite = new Seite(ws);
        await seite.senden("Page.enable");
        await seite.senden("Network.enable");
        await seite.senden("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
        return seite;
      }
      await warte(150);
    }
    throw new Error("Chrome antwortet nicht.");
  }
  senden<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.nr;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fehler) => this.offen.set(id, { ok: ok as (v: unknown) => void, fehler }));
  }
  async js<T = unknown>(ausdruck: string): Promise<T> {
    const r = await this.senden<{ result: { value: T }; exceptionDetails?: { text: string } }>("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.text} in ${ausdruck.slice(0, 80)}`);
    return r.result.value;
  }
  async groesse(breite: number, hoehe: number) {
    await this.senden("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 1.5, mobile: false });
  }
  async cookies(basis: string, cookie: string) {
    await this.senden("Network.clearBrowserCookies");
    for (const c of cookie.split("; ").filter(Boolean)) {
      const [name, ...wert] = c.split("=");
      await this.senden("Network.setCookie", { name, value: wert.join("="), url: basis });
    }
  }
  async oeffnen(url: string) {
    await this.senden("Page.navigate", { url });
    await this.ruhig();
  }
  /** Wartet, bis die Seite geladen ist und nichts mehr lädt. */
  async ruhig(extra = 600) {
    for (let i = 0; i < 80; i++) {
      const fertig = await this.js<boolean>(
        `document.readyState === "complete" && !document.body.innerText.includes("Wird geladen") && !document.querySelector("[aria-busy='true'], .animate-spin")`,
      ).catch(() => false);
      if (fertig) break;
      await warte(150);
    }
    await warte(extra);
  }
  async klick(text: string, art = "button, a, [role=tab]") {
    const ok = await this.js<boolean>(
      `(() => { const t = ${JSON.stringify(text)}; const e = [...document.querySelectorAll(${JSON.stringify(art)})].find((x) => x.textContent.trim() === t) ?? [...document.querySelectorAll(${JSON.stringify(art)})].find((x) => x.textContent.trim().startsWith(t)); if (!e) return false; e.scrollIntoView({ block: "center" }); e.click(); return true; })()`,
    );
    if (!ok) throw new Error(`Knopf „${text}“ nicht gefunden.`);
    await this.ruhig(400);
  }
  /** Tippt in ein Eingabefeld (React-tauglich). `wo`: JS-Ausdruck, der das Feld liefert. */
  async tippen(wo: string, text: string) {
    await this.js(
      `(() => { const e = ${wo}; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value").set; setter.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event("input", { bubbles: true })); e.focus(); })()`,
    );
    await this.ruhig(800);
  }
  /** Scrollt eine Überschrift (oder ein Element mit diesem Text) unter die Kopfleiste. */
  async zu(text: string) {
    const ok = await this.js<boolean>(
      `(() => { const t = ${JSON.stringify(text)}; const alle = [...document.querySelectorAll("h1, h2, h3, legend, p, label, span, div")]; const e = alle.find((x) => x.childElementCount === 0 && x.textContent.trim() === t) ?? alle.find((x) => x.textContent.trim() === t); if (!e) return false; e.scrollIntoView({ block: "start" }); if (window.scrollY > 0) window.scrollBy(0, -64); return true; })()`,
    );
    if (!ok) throw new Error(`Abschnitt „${text}“ nicht gefunden.`);
    await warte(400);
  }
  async foto(name: string) {
    await this.js(`document.activeElement?.blur?.()`);
    const r = await this.senden<{ data: string }>("Page.captureScreenshot", { format: "jpeg", quality: 86 });
    writeFileSync(join(ZIEL, `${name}.jpg`), Buffer.from(r.data, "base64"));
    console.log(`  ${name}.jpg`);
  }
}

// ── Ablauf ────────────────────────────────────────────────────────────────
const A = "http://localhost:8871";
const B = "http://localhost:8872";
const soll = (name: string) => nur.size === 0 || nur.has(name);

console.log("Demo-Datenbanken anlegen …");
await Promise.all([datenbank("schau_handbuch_a", "--bis-bewertung"), datenbank("schau_handbuch_b", "--komplett")]);
const dbA = new SQL(`${DB}/schau_handbuch_a`);
const serverA = server("schau_handbuch_a", 8871);
const serverB = server("schau_handbuch_b", 8872);
const profil = mkdtempSync(join(tmpdir(), "schau-handbuch-"));
const chrome = Bun.spawn([chromePfad(), "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profil}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--lang=de-DE", "--force-color-profile=srgb", "about:blank"], { stdout: "ignore", stderr: "ignore" });

try {
  await Promise.all([bereit(A), bereit(B)]);
  const s = await Seite.verbinden(9333);
  const adminA = await anmelden(A, DEMO.email, DEMO.passwort);
  const adminB = await anmelden(B, DEMO.email, DEMO.passwort);
  // Eine Helferin und eine eingeladene Person (Einladungslink aus dem Postausgang).
  await trpc(A, "auth.benutzerAnlegen", { name: HELFER.name, email: HELFER.email, passwort: HELFER.passwort, rolle: "mitarbeiter" }, adminA);
  await trpc(A, "auth.benutzerAnlegen", { name: "Lena Neu", email: "lena@demo.test", rolle: "mitarbeiter" }, adminA);
  const helferA = await anmelden(A, HELFER.email, HELFER.passwort);
  await trpc(B, "auth.benutzerAnlegen", { name: HELFER.name, email: HELFER.email, passwort: HELFER.passwort, rolle: "mitarbeiter" }, adminB);
  const helferB = await anmelden(B, HELFER.email, HELFER.passwort);
  const [{ id: schau }] = await dbA`select id from schau where slug = 'demo-schau-2026'`;
  const [{ id: adminId }] = await dbA`select id from benutzer where email = ${DEMO.email}`;
  const [{ id: helferId }] = await dbA`select id from benutzer where email = ${HELFER.email}`;
  const [{ id: meldungId }] = await dbA`select m.id from meldung m join zahlung z on z.meldung_id = m.id where m.schau_id = ${schau} order by m.id limit 1`;
  const [{ text: einladungsMail }] = await dbA`select text from postausgang where an = 'lena@demo.test' order by id desc limit 1`;
  const einladung = /\/einladung#([\w-]+)/.exec(einladungsMail)?.[1];
  const [{ nachname }] = await dbA`select a.nachname from aussteller a join meldung m on m.aussteller_id = a.id where m.schau_id = ${schau} order by m.id limit 1 offset 3`;

  const bild = async (name: string, basis: string, cookie: string, pfad: string, vorher?: () => Promise<void>, breite = 1280, hoehe = 800) => {
    if (!soll(name)) return;
    await s.groesse(breite, hoehe);
    await s.cookies(basis, cookie);
    await s.oeffnen(`${basis}${pfad}`);
    if (vorher) await vorher();
    await s.foto(name);
  };
  const S = `/schau/${schau}`;

  console.log("Ausstellungsleitung (Phase Bewertung):");
  await bild("anmelden", A, "", "/anmelden");
  await bild("hilfe", A, adminA, "/hilfe/ausstellungsleitung");
  await bild("schauen", A, adminA, "/");
  await bild("uebersicht", A, adminA, S);
  await bild("benutzer-liste", A, adminA, "/benutzer");
  await bild("benutzer-neu", A, adminA, "/benutzer/neu", async () => {
    await s.tippen(`document.querySelectorAll("input")[0]`, "Max Muster");
    await s.tippen(`document.querySelector("input[type=email]")`, "max@demo.test");
  });
  await bild("benutzer-seite", A, adminA, `/benutzer/${helferId}`);
  await bild("zwei-faktor", A, adminA, `/benutzer/${adminId}#zwei-faktor`, async () => {
    await s.tippen(`[...document.querySelectorAll("input[type=password]")].at(-1)`, DEMO.passwort);
    await s.klick("Einrichten");
    await s.ruhig(1000);
  });
  await bild("verein", A, adminA, "/verein");
  await bild("textbausteine", A, adminA, "/verein#textbausteine", () => s.ruhig(800));
  await bild("stammdaten", A, adminA, "/stammdaten");
  await bild("stammdaten-ergaenzen", A, adminA, "/stammdaten", () => s.klick("Ergänzen"));
  await bild("einstellungen", A, adminA, `${S}/einstellungen`);
  await bild("gebuehren", A, adminA, `${S}/einstellungen#gebuehren`, () => s.ruhig(800));
  await bild("preisarten", A, adminA, `${S}/einstellungen#preise`, () => s.ruhig(800));
  await bild("meldungen", A, adminA, `${S}/meldungen`);
  await bild("katalognummern", A, adminA, `${S}/katalog`);
  await bild("kaefige", A, adminA, `${S}/kaefige`);
  await bild("hallenplan", A, adminA, `${S}/hallenplan`, () => s.ruhig(1500));
  await bild("druckkatalog", A, adminA, `${S}/katalog/gestalten`, () => s.ruhig(3000));
  // 3D-Ansicht mit eingestelltem Aussehen (Holzdecke, Linien); Aussehen ändert den Plan nicht (Entscheidung 028).
  if (soll("hallenplan-3d")) {
    const aussehen = { decke: true, linien: true, prallwand: "#6d8571", wandHoehe: 700, firstHoehe: 900 };
    await dbA`update schau set halle = jsonb_set(halle, '{aussehen}', ${aussehen}::jsonb) where id = ${schau}`;
  }
  await bild("hallenplan-3d", A, adminA, `${S}/hallenplan/3d`, () => s.ruhig(4000));
  await bild("preisrichter", A, adminA, `${S}/preisrichter`);
  await bild("preisrichter-rassen", A, adminA, `${S}/preisrichter#einteilung-rassen`, () => s.ruhig(800));
  await bild("einlieferung", A, adminA, `${S}/einlieferung`);
  await bild("bewertung-pc", A, adminA, `${S}/bewertung`);

  console.log("Helfer (Phase Bewertung):");
  await bild("helfer-uebersicht", A, helferA, S);
  await bild("mein-zugang", A, helferA, "/benutzer");
  await bild("meldung-bearbeiten", A, helferA, `${S}/meldungen/${meldungId}`);
  await bild("meldung-tiere", A, helferA, `${S}/meldungen/${meldungId}`, () => s.zu("Tiere"));
  await bild("einlieferung-suche", A, helferA, `${S}/einlieferung`, () =>
    s.tippen(`[...document.querySelectorAll("input")].find((e) => /such|name/i.test(e.placeholder + e.getAttribute("aria-label")))`, nachname),
  );
  await bild("bewertung-helfer", A, helferA, `${S}/bewertung`);
  if (einladung) await bild("einladung", A, "", `/einladung#${einladung}`);

  console.log("Meldephase:");
  await dbA`update schau set phase = 'meldung' where id = ${schau}`;
  await bild("meldungen-meldephase", A, helferA, `${S}/meldungen`);
  await bild("meldung-neu", A, helferA, `${S}/meldungen/neu`);
  await bild("oeffentlich", A, "", "/s/demo-schau-2026");
  await dbA`update schau set phase = 'bewertung' where id = ${schau}`;

  console.log("Nach der Schau (Demo komplett):");
  await bild("preise", B, adminB, `${S}/preise`);
  await bild("verkauf", B, helferB, `${S}/verkauf`);
  await bild("abrechnung", B, adminB, `${S}/abrechnung`);
  await bild("kassenbuch", B, adminB, `${S}/kassenbuch`);
  await bild("protokoll", B, adminB, `${S}/protokoll`);

  if (["tablet-name", "tablet-pin", "tablet-karte", "tablet-bausteine", "tablet-offline"].some(soll)) {
    console.log("Tablet der Preisrichter:");
    await s.groesse(1180, 820);
    await s.cookies(A, "");
    await s.senden("Browser.grantPermissions", { origin: A, permissions: ["durableStorage"] }).catch(() => {});
    await s.oeffnen(`${A}/richter/demo-schau-2026`);
    if (soll("tablet-name")) await s.foto("tablet-name");
    await s.klick("Ralf Beispiel");
    for (const z of DEMO.pin.slice(0, 4)) await s.klick(z);
    if (soll("tablet-pin")) await s.foto("tablet-pin");
    for (const z of DEMO.pin.slice(4)) await s.klick(z);
    await s.ruhig(1500);
    await s.klick("94 sg");
    await s.klick("Kopf");
    await s.klick("kräftiger Kopf").catch(() => {});
    await s.js(`window.scrollTo(0, 0); for (const e of document.querySelectorAll("*")) if (e.scrollTop > 0) e.scrollTop = 0;`);
    await warte(300);
    if (soll("tablet-karte")) await s.foto("tablet-karte");
    await s.klick("Gefieder");
    await s.zu("Vorzüge");
    if (soll("tablet-bausteine")) await s.foto("tablet-bausteine");
    // Ohne Netz: die Bewertung bleibt im Gerät und wartet auf die Übertragung.
    await s.senden("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await s.js(`window.dispatchEvent(new Event("offline"))`);
    await s.klick("Speichern und nächstes Tier");
    await warte(1500);
    await s.zu("Vorzüge").catch(() => {});
    if (soll("tablet-offline")) await s.foto("tablet-offline");
    await s.senden("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  console.log("Fertig. Jetzt: sh scripts/handbuch.sh");
} finally {
  chrome.kill();
  serverA.kill();
  serverB.kill();
  await dbA.close().catch(() => {});
  rmSync(profil, { recursive: true, force: true });
}
