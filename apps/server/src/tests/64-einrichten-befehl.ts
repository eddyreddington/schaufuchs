/**
 * Ersteinrichtung über die Kommandozeile (Entscheidung 026): `schaufuchs einrichten` ruft im Container
 * `bun src/einrichten.ts` auf. Geprüft wie bei einer neuen Installation – eigene leere Datenbank, migriert wie beim Start
 * des Containers, der Befehl als eigener Prozess. Am Ende legt der Administrator über den Link sein Passwort fest.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import postgres from "postgres";
import { sha256 } from "../auth";
import { config } from "../config";
import { ersteinrichtungAngaben } from "../services/ersteinrichtung";
import { einladungEinsetzen } from "../services/post";
import { leer, m, SRC } from "./kontext";

const SERVER = join(SRC, "..");
const NAME = "schau_test_einrichten";
const url = (() => {
  const u = new URL(config.databaseUrl);
  u.pathname = `/${NAME}`;
  return u.toString();
})();
const ADRESSE = "https://schau.example.org";
let db: postgres.Sql;

/** Startet einen Prozess mit der leeren Datenbank (ohne Mailversand, ohne Lesemodus, wenn nicht anders angegeben). */
async function lauf(befehl: string[], env: Record<string, string> = {}) {
  const p = Bun.spawn(befehl, {
    cwd: SERVER,
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: url, PUBLIC_URL: ADRESSE, SMTP_URL: "", NUR_LESEN: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [aus, fehler, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, aus, fehler };
}
const einrichten = (args: string[], env: Record<string, string> = {}) => lauf(["bun", "src/einrichten.ts", ...args], env);
const ANGABEN = ["--verein", "GZV Musterstadt", "--name", "Erika Muster", "--email", "Erika@Example.org"];

/** Link „Passwort setzen“ aus einem Text (Terminal oder Mail). */
const tokenAus = (text: string) => text.match(/\/einladung#([A-Za-z0-9_-]+)/)?.[1];
const zahl = async (tabelle: string) => Number((await db.unsafe(`select count(*) as n from ${tabelle}`))[0]!.n);
const konto = async () => (await db`select email, name, rolle, passwort_hash, einladung_hash, einladung_bis, aktiv from benutzer`)[0]!;

/** Kleiner SMTP-Server, der jede Mail annimmt und sich merkt. */
function smtpAttrappe() {
  const mails: string[] = [];
  const server = Bun.listen<{ daten: boolean; puffer: string }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) {
        s.data = { daten: false, puffer: "" };
        s.write("220 attrappe\r\n");
      },
      data(s, roh) {
        s.data.puffer += roh.toString();
        for (let i = s.data.puffer.indexOf("\r\n"); i >= 0; i = s.data.puffer.indexOf("\r\n")) {
          const zeile = s.data.puffer.slice(0, i);
          s.data.puffer = s.data.puffer.slice(i + 2);
          if (s.data.daten) {
            if (zeile === ".") {
              s.data.daten = false;
              s.write("250 angenommen\r\n");
            } else mails[mails.length - 1] += `${zeile}\n`;
          } else if (/^DATA/i.test(zeile)) {
            s.data.daten = true;
            mails.push("");
            s.write("354 weiter\r\n");
          } else if (/^QUIT/i.test(zeile)) {
            s.write("221 tschuess\r\n");
            s.end();
          } else s.write("250 ok\r\n");
        }
      },
    },
  });
  // Quoted-Printable: weiche Umbrüche entfernen (der Link steht wieder in einem Stück), Umlaute als UTF-8 lesen.
  const text = (i: number) => decodeURIComponent(mails[i]!.replace(/=\n/g, "").replace(/%/g, "%25").replace(/=([0-9A-F]{2})/g, "%$1"));
  return { url: `smtp://127.0.0.1:${server.port}`, mails, text, stop: () => server.stop(true) };
}

describe("Ersteinrichtung über die Kommandozeile", () => {
  beforeAll(async () => {
    if (!url.includes("test")) throw new Error("Nur gegen eine Test-Datenbank.");
    await m.sql.unsafe(`drop database if exists ${NAME} with (force)`);
    await m.sql.unsafe(`create database ${NAME}`);
    const mig = await lauf(["bun", "src/migrate.ts"]);
    if (mig.code !== 0) throw new Error(mig.fehler || mig.aus);
    db = postgres(url, { max: 1, onnotice: () => {} });
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await m.sql.unsafe(`drop database if exists ${NAME} with (force)`);
  });

  test("ohne Mailversand nur mit --link-zeigen; vorher entsteht nichts", async () => {
    const r = await einrichten(ANGABEN);
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("--link-zeigen");
    expect(await zahl("benutzer")).toBe(0);
    expect(await zahl("organisation")).toBe(0);
  }, 60_000);

  test("fehlende oder falsche Angaben werden genannt", async () => {
    const ohneName = await einrichten(["--verein", "GZV Musterstadt", "--email", "erika@example.org", "--link-zeigen"]);
    expect(ohneName.code).toBe(1);
    expect(ohneName.fehler).toContain("--name");
    // Auch ohne Mailversand zuerst die Angaben.
    const falscheAdresse = await einrichten(["--verein", "GZV Musterstadt", "--name", "Erika Muster", "--email", "keine-adresse"]);
    expect(falscheAdresse.code).toBe(1);
    expect(falscheAdresse.fehler).toContain("E-Mail");
    const unbekannt = await einrichten([...ANGABEN, "--passwort", "geheim"]);
    expect(unbekannt.code).toBe(1);
    expect(unbekannt.fehler).toContain("--passwort");
    const ohneAnfuehrungszeichen = await einrichten(["--verein", "GZV", "Musterstadt", "--name", "Erika Muster", "--email", "erika@example.org", "--link-zeigen"]);
    expect(ohneAnfuehrungszeichen.code).toBe(1);
    expect(ohneAnfuehrungszeichen.fehler).toContain("Anführungszeichen");
    expect(await zahl("benutzer")).toBe(0);
  }, 60_000);

  test("im Lesemodus abgewiesen", async () => {
    const r = await einrichten([...ANGABEN, "--link-zeigen"], { NUR_LESEN: "1" });
    expect(r.code).toBe(1);
    expect(r.fehler).toContain(NUR_LESEN_MELDUNG);
    expect(await zahl("benutzer")).toBe(0);
  }, 60_000);

  let ersterToken = "";
  test("legt Verein und Administrator ohne Passwort an und zeigt den Link „Passwort setzen“", async () => {
    const r = await einrichten([...ANGABEN, "--link-zeigen"]);
    expect(r.fehler).toBe("");
    expect(r.code).toBe(0);
    expect(r.aus).toContain(`${ADRESSE}/einladung#`);
    ersterToken = tokenAus(r.aus)!;
    expect(ersterToken.length).toBeGreaterThan(40);
    const [o] = await db`select id, name from organisation`;
    expect(o!.name).toBe("GZV Musterstadt");
    const b = await konto();
    expect(b).toMatchObject({ email: "erika@example.org", name: "Erika Muster", rolle: "admin", passwort_hash: "-", aktiv: true });
    expect(b.einladung_hash).toBe(sha256(ersterToken));
    const tage = (new Date(b.einladung_bis).getTime() - Date.now()) / 86_400_000;
    expect(tage).toBeGreaterThan(6.9);
    expect(tage).toBeLessThan(7.1);
    // Wie bei der Einrichtung im Browser: Textbausteine des Vereins angelegt. Ins Protokoll mit „Kommandozeile“.
    expect(Number((await db`select count(*) as n from textbaustein where organisation_id = ${o!.id}`)[0]!.n)).toBeGreaterThan(0);
    const [p] = await db`select wer, aktion, tabelle from aenderung order by id desc limit 1`;
    expect(p).toMatchObject({ wer: "Kommandozeile", tabelle: "benutzer" });
  }, 60_000);

  test("noch einmal aufgerufen: neuer Link, der alte gilt nicht mehr; Verein und Konto bleiben", async () => {
    const r = await einrichten(["--verein", "Anderer Name", "--name", "Jemand", "--email", "erika@example.org", "--link-zeigen"]);
    expect(r.code).toBe(0);
    const neu = tokenAus(r.aus)!;
    expect(neu).not.toBe(ersterToken);
    expect((await konto()).einladung_hash).toBe(sha256(neu));
    expect(r.aus).toContain("GZV Musterstadt");
    expect(r.aus).toContain("bleiben, wie sie sind");
    expect(await zahl("organisation")).toBe(1);
    expect(await zahl("benutzer")).toBe(1);
    expect((await konto()).name).toBe("Erika Muster");
  }, 60_000);

  test("mit einer anderen Adresse: Einrichtung ist bereits erfolgt", async () => {
    const r = await einrichten(["--verein", "GZV Musterstadt", "--name", "Max Muster", "--email", "max@example.org", "--link-zeigen"]);
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("bereits erfolgt");
    expect(r.aus).not.toContain("/einladung#");
    expect(await zahl("benutzer")).toBe(1);
  }, 60_000);

  test("mit Mailversand: Link geht per Mail hinaus, nicht ins Terminal", async () => {
    const smtp = smtpAttrappe();
    try {
      const r = await einrichten(ANGABEN, { SMTP_URL: smtp.url });
      expect(r.fehler).toBe("");
      expect(r.code).toBe(0);
      expect(r.aus).toContain("erika@example.org");
      expect(r.aus).not.toContain("/einladung#");
      expect(smtp.mails).toHaveLength(1);
      const text = smtp.text(0);
      expect(text).toContain("Guten Tag Erika Muster,");
      // Ohne Absender im Verein: der Betreiber der Installation, Gruß vom Verein.
      expect(text).toContain("bei der Person, die SchauFUCHS für Ihren Verein betreibt");
      expect(text).toContain("Viele Grüße\nGZV Musterstadt");
      const token = tokenAus(text)!;
      expect((await konto()).einladung_hash).toBe(sha256(token));
      // Nach dem Versand steht der Link nicht mehr im Postausgang.
      const [post] = await db`select status, text from postausgang order by id desc limit 1`;
      expect(post!.status).toBe("gesendet");
      expect(post!.text).not.toContain(token);
    } finally {
      smtp.stop();
    }
  }, 60_000);

  test("Mailserver nicht erreichbar: Meldung mit Ausweg, die Mail bleibt im Postausgang", async () => {
    const r = await einrichten(ANGABEN, { SMTP_URL: "smtp://127.0.0.1:1" });
    expect(r.code).toBe(1);
    expect(r.fehler).toContain("--link-zeigen");
    expect(r.aus + r.fehler).not.toContain("/einladung#");
    const [post] = await db`select id, status, text from postausgang order by id desc limit 1`;
    expect(post!.status).toBe("fehler");
    // Ein neuer Link (hier über --link-zeigen) verwirft die nicht verschickte Mail mit dem alten.
    const alt = tokenAus(einladungEinsetzen(post!.text))!;
    expect(alt.length).toBeGreaterThan(40);
    const neu = await einrichten([...ANGABEN, "--link-zeigen"]);
    expect(neu.code).toBe(0);
    const [danach] = await db`select status, versuche, text from postausgang where id = ${post!.id}`;
    expect(danach!.text).not.toContain(alt);
    expect(danach!.text).toContain("/einladung#(durch einen neueren Link ersetzt)");
    expect(danach!.versuche).toBeGreaterThanOrEqual(20);
  }, 60_000);

  test("über den Link setzt der Administrator sein Passwort; danach ist die Einrichtung erledigt", async () => {
    const token = tokenAus((await einrichten([...ANGABEN, "--link-zeigen"])).aus)!;
    const skript = `
      const { appRouter } = await import("./src/router");
      const ctx = { benutzer: null, richter: null, cookieTokens: { benutzer: undefined, richter: undefined }, ip: "test", setCookie: () => {} };
      const api = appRouter.createCaller(ctx).auth;
      const wer = await api.einladungPruefen({ token: ${JSON.stringify(token)} });
      await api.einladungAnnehmen({ token: ${JSON.stringify(token)}, passwort: "ein-langes-passwort" });
      const an = await api.anmelden({ email: "erika@example.org", passwort: "ein-langes-passwort" });
      console.log(JSON.stringify({ wer, an: !!an }));
      process.exit(0);`;
    const r = await lauf(["bun", "-e", skript]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.aus.trim().split("\n").at(-1)!)).toEqual({ wer: { name: "Erika Muster", email: "erika@example.org", verein: "GZV Musterstadt" }, an: true });
    const nochmal = await einrichten([...ANGABEN, "--link-zeigen"]);
    expect(nochmal.code).toBe(1);
    expect(nochmal.fehler).toContain("bereits erfolgt");
  }, 60_000);

  test("Einrichtung im Browser: nach der Einrichtung abgewiesen, ohne den teuren Hash zu rechnen", async () => {
    // Läuft gegen schau_test, dort ist der Testverein längst eingerichtet.
    const hash = spyOn(Bun.password, "hash");
    try {
      const pub = m.appRouter.createCaller(leer);
      await expect(pub.auth.einrichten({ organisation: "GZV Musterstadt", name: "Erika Muster", email: "neu@example.org", passwort: "ein-langes-passwort" })).rejects.toThrow("bereits erfolgt");
      expect(hash).not.toHaveBeenCalled();
    } finally {
      hash.mockRestore();
    }
  });

  test("Angaben werden für beide Wege gleich bereinigt", () => {
    expect(ersteinrichtungAngaben.parse({ organisation: "  GZV Musterstadt ", name: " Erika Muster", email: " erika@example.org " })).toEqual({ organisation: "GZV Musterstadt", name: "Erika Muster", email: "erika@example.org" });
  });
});
