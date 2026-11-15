/** Behebungen aus Audit Runde 8 (Geld, Datenschutz, Status, Löschen, Kassenbuch). Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Audit Runde 8", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  const person = (nachname: string, verein = "") => ({ vorname: "Audit", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein, kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });

  async function schauMitTier(name: string, betragCent = 500) {
    const { id } = await al().schau.anlegen({ name, ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent, befreitPreisrichter: false }] });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, verein = "") =>
      (await al().meldung.speichern({
        schauId: id, aussteller: person(nachname, verein), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      })).meldungId;
    return { id, s, wy: wy!, melden };
  }

  test("bezahlte Meldung lässt sich nicht auf offen zurücksetzen; nach Abschluss kein Statuswechsel", async () => {
    const { melden } = await schauMitTier("Audit8 Bezahlt");
    const a = await melden("Bezahlt");
    await helfer().meldung.statusSetzen({ id: a, status: "bestaetigt" });
    await helfer().meldung.zahlungErfassen({ meldungId: a, betragCent: 500, datum: "2026-11-11", art: "bar" });
    await expect(helfer().meldung.statusSetzen({ id: a, status: "offen" })).rejects.toThrow("Zahlung");
    await expect(al().meldung.statusSetzen({ id: a, status: "offen", grund: "x" })).rejects.toThrow("Zahlung");
    expect((await al().meldung.get({ id: a })).meldung.status).toBe("bestaetigt");
  });

  test("Meldegeld bei der Einlieferung nur einmal kassieren (erwarteter offener Betrag)", async () => {
    const { melden } = await schauMitTier("Audit8 Doppelt");
    const a = await melden("Doppelt");
    await helfer().meldung.statusSetzen({ id: a, status: "bestaetigt" });
    await helfer().meldung.zahlungErfassen({ meldungId: a, betragCent: 500, datum: "2026-11-11", art: "bar", erwartetOffenCent: 500 });
    await expect(helfer().meldung.zahlungErfassen({ meldungId: a, betragCent: 500, datum: "2026-11-11", art: "bar", erwartetOffenCent: 500 })).rejects.toThrow("schon");
    const zahlungen = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, a));
    expect(zahlungen).toHaveLength(1);
  });

  test("öffentliche Vereinsvorschläge nur aus bestätigten Meldungen, ohne überlange Texte", async () => {
    const { id, s, melden } = await schauMitTier("Audit8 Vereine");
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    const pub = m.appRouter.createCaller({ ...leer, ip: "audit8-pub" });
    const offen = await melden("Offen", "Erika Musterfrau, Lindenweg 5, Tel. 0171 1234567");
    const lang = await melden("Lang", "V".repeat(150));
    const bestaetigt = await melden("Bestaetigt", "GZV Audit-Acht");
    await al().meldung.statusSetzen({ id: bestaetigt, status: "bestaetigt" });
    await al().meldung.statusSetzen({ id: lang, status: "bestaetigt" });
    const vereine = (await pub.oeffentlich.schau({ slug: s.slug })).vereine.map((v) => v.verein);
    expect(vereine).toContain("GZV Audit-Acht");
    expect(vereine).not.toContain("Erika Musterfrau, Lindenweg 5, Tel. 0171 1234567");
    expect(vereine.some((v) => v.length > 100)).toBe(false);
    expect(offen).toBeGreaterThan(0);
  });

  test("leere Schau mit Eintrag im Gesundheitsjournal lässt sich nicht löschen", async () => {
    const { id } = await al().schau.anlegen({ name: "Audit8 Journal", ort: "Halle" });
    await helfer().halle.gesundheitErfassen({ schauId: id, befund: "Vorab-Kontrolle Tierarzt" });
    await expect(al().schau.loeschen({ id, name: "Audit8 Journal", grund: "Test" })).rejects.toThrow("Gesundheitsjournal");
  });

  test("Kassenbuch-CSV zeigt den Soll-Bestand der Abschlüsse als Betrag", async () => {
    const { id, melden } = await schauMitTier("Audit8 CSV");
    const a = await melden("Csv");
    await al().meldung.statusSetzen({ id: a, status: "bestaetigt" });
    await al().meldung.zahlungErfassen({ meldungId: a, betragCent: 500, datum: "2026-11-11", art: "bar" });
    await al().kasse.tagesabschluss({ schauId: id, istCent: 500, bemerkung: "" });
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, ip: "audit8-csv", setCookie: (c: string) => (cookie = c) }).auth.anmelden({ email: "al@test.de", passwort: "sehr-geheim-123" });
    const server = (await import("../index")).default;
    const antwort = await server.fetch(new Request(`http://test/datei/${id}/kassenbuch.csv`, { headers: { Cookie: cookie.split(";")[0]! } }));
    expect(antwort.status).toBe(200);
    const text = await antwort.text();
    expect(text).not.toContain("[object Object]");
    expect(text).toContain("Soll 5,00 €");
  });
});

describe("Audit Runde 8 – Restpunkte Kasse und Protokoll", () => {
  const al = () => m.appRouter.createCaller(adminKontext);

  test("Kassenbuchungen und Abschlüsse bekommen den Zeitstempel nach der Sperre (clock_timestamp)", async () => {
    const zeilen = (await m.sql`select table_name, column_default from information_schema.columns where column_name = 'created_at' and table_name in ('zahlung','verkauf','auszahlung','kassenbewegung','kassenabschluss')`) as unknown as { table_name: string; column_default: string }[];
    expect(zeilen).toHaveLength(5);
    for (const z of zeilen) expect(z.column_default).toContain("clock_timestamp");
  });

  test("offener Nachtrag eines früheren Kassentags: Vorschlag, Folgetag gesperrt, Abschlusshindernis; Kassendifferenz ausgewiesen", async () => {
    const { id } = await al().schau.anlegen({ name: "Audit8 Nachtrag gestern", ort: "Halle" });
    const { tagDe } = await import("../services/kassenbuch");
    const gestern = new Date(Date.now() - 24 * 3600 * 1000);
    const um = (h: number) => { const d = new Date(gestern); d.setUTCHours(h, 0, 0, 0); return d; };
    const tag = tagDe(um(12));
    await m.sql`insert into kassenbewegung (schau_id, art, betrag_cent, grund, created_at) values (${id}, 'einlage', 1000, 'Wechselgeld', ${um(8).toISOString()})`;
    await m.sql`insert into kassenabschluss (schau_id, datum, soll_cent, ist_cent, differenz_cent, bemerkung, nachtrag, created_at) values (${id}, ${tag}, 1000, 900, -100, 'zehn Euro fehlen', 0, ${um(12).toISOString()})`;
    await m.sql`insert into kassenbewegung (schau_id, art, betrag_cent, grund, created_at) values (${id}, 'einlage', 200, 'Nachtrag', ${um(14).toISOString()})`;
    const buch = await al().kasse.kassenbuch({ schauId: id });
    expect(buch.vorschlag).toBe(tag);
    expect(buch.nachtragJe[tag]).toBe(true);
    const t = buch.tage.find((x) => x.datum === tag)!;
    expect(t).toMatchObject({ sollCent: 1200, endCent: 1100, nachtragOffen: true });
    // Heute abschließen geht erst nach dem Nachtragsabschluss von gestern.
    await expect(al().kasse.tagesabschluss({ schauId: id, istCent: 1100, bemerkung: "" })).rejects.toThrow("Erst den Kassentag");
    // Abschluss der Schau nennt den offenen Nachtrag.
    await expect(al().schau.phaseSetzen({ id, phase: "abgeschlossen" })).rejects.toThrow("mit offenem Nachtrag");
    // Nachtragsabschluss für gestern: Soll = gezählt 9,00 + Nachtrag 2,00.
    await al().kasse.tagesabschluss({ schauId: id, datum: tag, istCent: 1100, bemerkung: "" });
    expect((await al().kasse.kassenbuch({ schauId: id })).tage.find((x) => x.datum === tag)!.nachtragOffen).toBe(false);
    // CSV weist die Kassendifferenz und den Endbestand aus.
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, ip: "audit8-csv2", setCookie: (c: string) => (cookie = c) }).auth.anmelden({ email: "al@test.de", passwort: "sehr-geheim-123" });
    const server = (await import("../index")).default;
    const text = await (await server.fetch(new Request(`http://test/datei/${id}/kassenbuch.csv`, { headers: { Cookie: cookie.split(";")[0]! } }))).text();
    expect(text).toContain("Kassendifferenz laut Abschluss");
    expect(text).toContain("Endbestand (gezählt + Nachträge)");
  });

  test("Meldegeld mit Stiftung: Anteil steht im Kassenbuch", async () => {
    const { id } = await al().schau.anlegen({ name: "Audit8 Stiftungsanteil", ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 500, befreitPreisrichter: false }] });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id, aussteller: { vorname: "Audit", nachname: "Stifter", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await al().meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 2000, datum: "2026-11-11", art: "bar", grund: "davon Meldegeld 5,00 €, Stiftung 15,00 €" });
    const tage = (await al().kasse.kassenbuch({ schauId: id })).tage;
    expect(tage.flatMap((t) => t.bewegungen.map((b) => b.text))).toContain("Meldegeld bar (davon Meldegeld 5,00 €, Stiftung 15,00 €)");
  });

  test("Kettenprüfung zeigt nur Eigenes: Prüfwert der eigenen Schau, keine Löschvermerke anderer", async () => {
    const { id: a } = await al().schau.anlegen({ name: "Audit8 Kette A", ort: "Halle" });
    const vorher = await al().schau.protokollPruefen({ schauId: a });
    // Eine andere Schau schreibt danach ins Protokoll – der angezeigte Stand von A bleibt gleich.
    const { id: b } = await al().schau.anlegen({ name: "Audit8 Kette B", ort: "Halle" });
    const nachher = await al().schau.protokollPruefen({ schauId: a });
    expect(nachher.kopf).toEqual(vorher.kopf);
    const [letzter] = (await m.sql`select id from aenderung where schau_id = ${a} and hash is not null order by id desc limit 1`) as unknown as { id: number }[];
    expect(nachher.kopf.id).toBe(letzter!.id);
    expect(nachher.vermerkt).toBe(0);
    expect(b).toBeGreaterThan(a);
  });
});

describe("Audit Runde 8 – Leistung und Schema", () => {
  test("Meldegeld gesammelt (Einlieferungssuche) gleich wie je Meldung", async () => {
    const { meldebetrag, meldebetraege } = await import("../services/eintraege");
    // Eine Schau mit mehreren Meldungen (Zahlungen, Jugend, Stämme) aus dem Ablauf.
    const [haeufig] = (await m.sql`select schau_id from meldung group by schau_id order by count(*) desc limit 1`) as unknown as { schau_id: number }[];
    const s = { id: haeufig!.schau_id };
    const meldungen = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, s.id));
    expect(meldungen.length).toBeGreaterThan(0);
    const gesammelt = await meldebetraege(m.db as never, s.id, meldungen);
    for (const me of meldungen) expect(gesammelt.get(me.id)).toEqual(await meldebetrag(m.db as never, me.id));
  });

  test("Migrationen ergeben dasselbe Schema wie schema.ts (Spalten, Typen, Standardwerte, NOT NULL)", async () => {
    const name = `schau_migpruef_${process.pid}`;
    await m.sql.unsafe(`drop database if exists ${name}`);
    await m.sql.unsafe(`create database ${name}`);
    try {
      const { config } = await import("../config");
      const url = config.databaseUrl.replace(/\/[^/?]+(\?.*)?$/, `/${name}`);
      const p = Bun.spawnSync(["bun", "src/migrate.ts"], { cwd: `${import.meta.dir}/../..`, env: { ...process.env, NODE_ENV: "development", TEST_DATABASE_URL: "", DATABASE_URL: url } });
      // (Ohne NODE_ENV=test – sonst nähme die Konfiguration immer die Test-Datenbank.)
      if (p.exitCode !== 0) console.log(p.stderr.toString().slice(0, 500));
      expect(p.exitCode).toBe(0);
      const postgres = (await import("postgres")).default;
      const mig = postgres(url, { max: 1 });
      const spalten = `select table_name, column_name, data_type, is_nullable, coalesce(column_default, '') as d from information_schema.columns where table_schema = 'public' and table_name not like '__drizzle%' order by 1, 2`;
      const a = (await m.sql.unsafe(spalten)).map((r) => JSON.stringify(r));
      const b = (await mig.unsafe(spalten)).map((r) => JSON.stringify(r));
      await mig.end();
      expect(b.filter((x) => !a.includes(x))).toEqual([]);
      expect(a.filter((x) => !b.includes(x))).toEqual([]);
    } finally {
      await m.sql.unsafe(`drop database if exists ${name}`);
    }
  }, 60_000);
});

