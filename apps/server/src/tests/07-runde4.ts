/** Audit Runde 4: Speicherflut, Geld, Fachlogik, Datenschutz, Bewertung am PC. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText, verkaufsbereit, type Mod } from "./kontext";

describe("Runde 4: Schutz vor Speicherflut und Bündelung", () => {
  const server = async () => (await import("../index")).default;
  const post = async (pfad: string, json: unknown, ip = "192.0.2.10") =>
    (await server()).fetch(
      new Request(`http://test/trpc/${pfad}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ json }) }),
    );

  test("40.000 leere Einträge werden vor der Prüfung abgewiesen, die Antwort bleibt klein", async () => {
    const vorher = process.memoryUsage().rss;
    const t0 = Date.now();
    const r = await post("oeffentlich.melden", { slug: "x", positionen: Array.from({ length: 40_000 }, () => ({})) });
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text.length).toBeLessThan(5_000);
    expect(text).toContain("zu umfangreich"); // schon vor dem Parsen
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(process.memoryUsage().rss - vorher).toBeLessThan(200 * 1024 * 1024);
    // Unterhalb dieser Grenze greift die Umfangsprüfung vor zod.
    const r2 = await post("oeffentlich.melden", { slug: "x", positionen: Array.from({ length: 10_000 }, () => ({})) });
    expect(r2.status).toBe(400);
    expect(await r2.text()).toContain("Höchstens 200");
  });

  test("Prüffehler: höchstens 20 Einträge in der Antwort", async () => {
    const r = await post("oeffentlich.melden", { slug: "x", positionen: Array.from({ length: 200 }, () => ({})) });
    const body = (await r.json()) as { error: { json: { message: string; data: { zod: { fieldErrors: Record<string, string[]>; formErrors: string[] } } } } };
    expect(body.error.json.message).toBe("Bitte die Eingaben prüfen.");
    const z = body.error.json.data.zod;
    expect(Object.values(z.fieldErrors).flat().length + z.formErrors.length).toBeLessThanOrEqual(20);
  });

  test("Bündelung: höchstens 10 Aufrufe, öffentliche und Anmeldungen nur einzeln", async () => {
    const s = await server();
    const get = (pfade: string[]) => s.fetch(new Request(`http://test/trpc/${pfade.join(",")}?batch=1&input=${encodeURIComponent(JSON.stringify(Object.fromEntries(pfade.map((_, i) => [i, { json: { slug: "x" } }]))))}`));
    expect((await get(Array(11).fill("auth.status"))).status).toBe(400);
    expect((await get(["oeffentlich.ergebnisse", "oeffentlich.ergebnisse"])).status).toBe(400);
    expect((await get(["auth.status", "auth.status"])).status).toBe(200);
    expect((await get(["oeffentlich.ergebnisse"])).status).not.toBe(400);
  });

  test("Bündelung lässt sich nicht mit kodiertem Komma umgehen", async () => {
    const r = await post("oeffentlich.melden%2Coeffentlich.melden?batch=1", {});
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("gebündelte");
  });

  test("Anonyme Anfragen über 256 KB werden abgewiesen", async () => {
    const r = await post("oeffentlich.melden", { slug: "x", bemerkung: "x".repeat(300 * 1024) });
    expect(r.status).toBe(413);
  });
});

describe("Runde 4: Geld, Kasse, Funktionstrennung, Protokoll", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let helfer: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let farbe = 0;
  const pos = () => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3000 });
  const person = (n: string, iban = "") => ({ vorname: n, nachname: "Geld", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350130099", geburtsdatum: null, istPreisrichter: false, iban, kontoinhaber: "" });
  const melden = (n: string, tiere: number, extra: Partial<{ stiftung: { betragCent: number; vorgabe: string } }> = {}) =>
    al.meldung.speichern({ schauId, aussteller: person(n), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: tiere }, pos), ...extra });

  test("Einrichtung", async () => {
    al = m.appRouter.createCaller(adminKontext);
    helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const s = await al.schau.anlegen({ name: "Geldschau Runde 4", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
    // Standgeld 3 € je Einzeltier (Kostenanteil und Katalog frei).
    await m.db.delete(m.schema.gebuehr).where(m.eq(m.schema.gebuehr.schauId, schauId));
    await m.db.insert(m.schema.gebuehr).values({ schauId, art: "einzeltier", betragCent: 300 });
  });

  test("Stiftung mit dem Meldegeld bezahlt: keine Überzahlung, getrennt ausgewiesen", async () => {
    const r = await melden("Stifter", 1, { stiftung: { betragCent: 2000, vorgabe: "bestes Huhn" } });
    expect(r.betrag.stiftungCent).toBe(2000);
    await al.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: r.betrag.summeCent + 2000, datum: "2026-10-01", art: "ueberweisung" });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const z = (await al.kasse.abrechnung({ schauId })).find((x) => x.ausstellerId === r.ausstellerId)!;
    expect(z.ueberzahltCent).toBe(0);
    expect(z.saldoCent).toBe(0);
  });

  test("Helfer: keine Kontoeingänge, keine Differenzen, keine Meldungsänderung nach der Abrechnung", async () => {
    const r = await melden("Helferfall", 2);
    await expect(helfer.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 5000, datum: "2026-10-01", art: "ueberweisung" })).rejects.toThrow("Ausstellungsleitung");
    await helfer.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 500, datum: "2026-10-01", art: "bar" });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    const tiere = (await al.katalog.liste({ schauId })).filter((e) => e.meldungId === r.meldungId);
    await verkaufsbereit(schauId, tiere.map((t) => t.id));
    await al.kasse.verkaufen({ schauId, katalogeintragId: tiere[0]!.id, kaeuferName: "Käufer Geld", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350130088", kaeuferAlter: "ab16" });
    const z = (await al.kasse.abrechnung({ schauId })).find((x) => x.ausstellerId === r.ausstellerId)!;
    await helfer.kasse.auszahlen({ schauId, ausstellerId: r.ausstellerId, erwartetCent: z.nochOffenCent });
    // Nach der Quittung: Tier hinzufügen nur durch die AL, die Differenz zahlt nur die AL aus.
    const [m0] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, r.meldungId));
    const mitA = { schauId, meldungId: r.meldungId, aussteller: { ...person("Helferfall"), id: r.ausstellerId }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true };
    const positionen = [...tiere.map((t) => ({ ...pos(), id: t.id })), pos()];
    await expect(helfer.meldung.speichern({ ...mitA, positionen })).rejects.toThrow("Ausstellungsleitung");
    await al.meldung.speichern({ ...mitA, positionen });
    const p = await al.schau.protokoll({ schauId, limit: 5 });
    expect(p.find((x) => x.tabelle === "meldung" && x.aktion === "geändert")?.alt).toMatchObject({ positionen: 2 });
    const neu = (await al.kasse.abrechnung({ schauId })).find((x) => x.ausstellerId === r.ausstellerId)!;
    expect(neu.nochOffenCent).toBeLessThan(0);
    await expect(helfer.kasse.auszahlen({ schauId, ausstellerId: r.ausstellerId })).rejects.toThrow("Ausstellungsleitung");
    // Rückforderung per Überweisung erst nach Geldeingang.
    await expect(al.kasse.auszahlen({ schauId, ausstellerId: r.ausstellerId, art: "ueberweisung" })).rejects.toThrow("eingegangen");
    await al.kasse.auszahlen({ schauId, ausstellerId: r.ausstellerId, art: "ueberweisung", eingangBestaetigt: true });
    expect(m0!.status).toBe("bestaetigt");

    // Reklamation nach der Abrechnung: die AL storniert mit Grund, der Unterschied erscheint als Rückforderung.
    const [v] = (await al.kasse.verkaeufe({ schauId })).filter((x) => x.eintrag.meldungId === r.meldungId);
    await al.kasse.stornieren({ schauId, verkaufId: v!.id, grund: "Käufer reklamiert, Tier zurück" });
    const nachStorno = (await al.kasse.abrechnung({ schauId })).find((x) => x.ausstellerId === r.ausstellerId)!;
    expect(nachStorno.nochOffenCent).toBe(-(v!.preisCent - v!.provisionCent));
  });

  test("Kasse: Entnahme über den Bestand nur nach Bestätigung, Kassentage in Reihenfolge", async () => {
    await expect(al.kasse.kassenbewegung({ schauId, art: "entnahme", betragCent: 500_000, grund: "Tippfehler" })).rejects.toThrow("Trotzdem");
    await expect(al.kasse.tagesabschluss({ schauId, datum: "2026-02-31", istCent: 0 })).rejects.toThrow("Datum ungültig");
    // Ein früherer Tag mit Bargeld ohne Abschluss muss zuerst abgeschlossen werden.
    const [k] = await m.db.select().from(m.schema.kassenbewegung).limit(1);
    await m.sql.begin(async (tx) => {
      await tx.unsafe("alter table kassenbewegung disable trigger kassenbewegung_schutz_tr");
      await tx.unsafe(`insert into kassenbewegung (schau_id, art, betrag_cent, grund, created_at) values (${schauId}, 'einlage', 1000, 'gestern', now() - interval '1 day')`);
      await tx.unsafe("alter table kassenbewegung enable trigger kassenbewegung_schutz_tr");
    });
    expect(k).toBeDefined();
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 0, bemerkung: "Test" })).rejects.toThrow("Erst den Kassentag");
  });

  test("Abschluss bei offener SEPA-Datei nie „trotzdem“; Löschschalter ändert keine Kassendaten", async () => {
    await m.db.update(m.schema.schau).set({ phase: "abrechnung", vereinIban: "DE89370400440532013000" }).where(m.eq(m.schema.schau.id, schauId));
    const r = await melden("Sepa", 1);
    await m.db.update(m.schema.aussteller).set({ iban: (await import("../db/geheim")).gebunden("aussteller.iban", "DE02120300000000202051", r.ausstellerId) }).where(m.eq(m.schema.aussteller.id, r.ausstellerId));
    await al.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: r.betrag.summeCent + 1000, datum: "2026-10-01", art: "ueberweisung" });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2030-01-02" });
    await expect(al.schau.phaseSetzen({ id: schauId, phase: "abgeschlossen", trotzdem: true, grund: "Test" })).rejects.toThrow("offene SEPA-Datei");
    await expect(
      m.sql.begin(async (tx) => {
        await tx.unsafe("set local schau.loeschen = 'ja'");
        await tx.unsafe(`update zahlung set betrag_cent = 1 where meldung_id = ${r.meldungId}`);
      }),
    ).rejects.toThrow("unveränderbar");
  });

  test("Protokoll: Anonymisieren wird vermerkt, Leeren ohne Vermerk fällt auf", async () => {
    // Zwei Einträge mit Inhalt (nur dort ändert Leeren etwas).
    const [e1, e2] = (await m.sql`select id from aenderung where schau_id = ${schauId} and neu is not null order by id desc limit 2`) as unknown as { id: number }[];
    await m.db.update(m.schema.aenderung).set({ alt: null, neu: null, grund: "" }).where(m.eq(m.schema.aenderung.id, e1!.id));
    let p = await al.schau.protokollPruefen({ schauId });
    expect(p.fehler).toEqual([]);
    expect(p.anonymisiert).toBeGreaterThanOrEqual(1);
    await m.sql.begin(async (tx) => {
      await tx.unsafe("alter table aenderung disable trigger aenderung_schutz_tr");
      await tx.unsafe(`update aenderung set alt = null, neu = null, grund = '' where id = ${e2!.id}`);
      await tx.unsafe("alter table aenderung enable trigger aenderung_schutz_tr");
    });
    p = await al.schau.protokollPruefen({ schauId });
    expect(p.fehler.map((f) => [f.id, f.grund])).toEqual([[e2!.id, "Inhalt ohne Vermerk geleert"]]);
    // Die Vermerke selbst sind geschützt.
    await expect((async () => m.db.delete(m.schema.aenderungAnonymisiert))()).rejects.toThrow();
  });
});

describe("Runde 4: Fachlogik", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let helfer: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let farbe = 0;
  const pos = (extra: object = {}) => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3000, ...extra });
  const person = (n: string, geburtsdatum: string | null = null) => ({ vorname: n, nachname: "Fach4", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350140099", geburtsdatum, istPreisrichter: false });

  test("Jugendtarif nur für Jugendliche, Prüfliste nennt Jugend ohne Geburtsdatum", async () => {
    al = m.appRouter.createCaller(adminKontext);
    helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const s = await al.schau.anlegen({ name: "Fachlogik Runde 4", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, bewertungAm: "2026-11-21" } });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
    const basis = { schauId, eingang: "papier" as const, bemerkung: "", zustimmung: true, erziehungsberechtigter: "Mutter", positionen: [pos()] };
    await expect(helfer.meldung.speichern({ ...basis, aussteller: person("Alt", "1990-01-01"), istJugend: true })).rejects.toThrow("nicht mehr jugendlich");
    await helfer.meldung.speichern({ ...basis, aussteller: person("Ohnegeb"), istJugend: true });
    const { checkliste } = await import("../services/pruefung");
    expect((await checkliste(schauId)).some((p) => p.text.includes("ohne Geburtsdatum"))).toBe(true);
  });

  test("Verendet sperrt dauerhaft, Journal unterscheidet „nie gesperrt“ von „aufgehoben“", async () => {
    const r = await al.meldung.speichern({ schauId, aussteller: person("Tiere"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(), pos(), pos()] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    const tiere = (await al.katalog.liste({ schauId })).filter((e) => e.meldungId === r.meldungId).sort((a, b) => a.katalogNr! - b.katalogNr!);
    await verkaufsbereit(schauId, tiere.map((t) => t.id));
    const nr = (t: (typeof tiere)[number]) => `${t.katalogNr}${t.suffix}`;
    await al.halle.gesundheitErfassen({ schauId, nr: nr(tiere[0]!), befund: "tot im Käfig", verendet: true, sperre: false });
    await al.halle.gesundheitErfassen({ schauId, nr: nr(tiere[1]!), befund: "leichtes Niesen", sperre: false });
    const journal = await al.halle.gesundheit({ schauId });
    const tot = journal.find((g) => g.verendet)!;
    expect(tot.sperre).toBe(true);
    await expect(al.halle.gesundheitFreigeben({ schauId, id: tot.id, grund: "keine Seuche" })).rejects.toThrow("verendet");
    await expect(al.kasse.verkaufen({ schauId, katalogeintragId: tiere[0]!.id, kaeuferName: "Käufer", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350140088", kaeuferAlter: "ab16" })).rejects.toThrow("verendet");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const { ladeTierliste } = await import("../services/tierliste");
    const tl = await ladeTierliste(s!);
    expect(tl.aussteller.flatMap((a) => a.tiere).find((x) => x.katalogNr === nr(tiere[0]!))!.verbleib).toContain("verendet");
    const nieGesperrt = (await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.katalogeintragId, tiere[1]!.id)))[0]!;
    expect(nieGesperrt.aufgehobenAm).toBeNull();
  });

  test("Tiere in der Halle bleiben in der Meldung; Verkaufspreis bis zum Verkauf durch die AL änderbar", async () => {
    const [mld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId)).orderBy(m.desc(m.schema.meldung.id)).limit(1);
    const tiere = (await al.katalog.liste({ schauId })).filter((e) => e.meldungId === mld!.id).sort((a, b) => a.katalogNr! - b.katalogNr!);
    const mitA = { schauId, meldungId: mld!.id, aussteller: { ...person("Tiere"), id: mld!.ausstellerId }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true };
    // Eingeliefertes (hier: bewertetes) Tier entfernen geht nicht.
    await expect(al.meldung.speichern({ ...mitA, positionen: tiere.slice(1).map((t) => pos({ id: t.id })) })).rejects.toThrow("nicht aus der Meldung entfernt");
    // Verkaufspreis eines bewerteten, nicht verkauften Tiers: Helfer nein, AL ja (im Protokoll).
    const neuePreise = tiere.map((t, i) => pos({ id: t.id, verkaufspreisCent: i === 2 ? 4500 : 3000 }));
    await expect(helfer.meldung.speichern({ ...mitA, positionen: neuePreise })).rejects.toThrow("Ausstellungsleitung");
    await al.meldung.speichern({ ...mitA, positionen: neuePreise });
    const p = await al.schau.protokoll({ schauId, limit: 3 });
    expect(JSON.stringify(p.find((x) => x.aktion === "geändert")?.neu)).toContain("4500");
    // Bestätigt → offen → storniert ist mit eingelieferten Tieren gesperrt.
    await expect(al.meldung.statusSetzen({ id: mld!.id, status: "offen", grund: "Test" })).rejects.toThrow("eingeliefert");
  });

  test("Bewertet ohne Einlieferung: Prüfliste meldet es, Ausgabe möglich; abgeschlossene Schau nur lesen", async () => {
    const r = await al.meldung.speichern({ schauId, aussteller: person("Nachweis"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.gedrucktSetzen({ schauId, gedruckt: true });
    await al.katalog.nummernVergeben({ schauId });
    const [t] = (await al.katalog.liste({ schauId })).filter((e) => e.meldungId === r.meldungId);
    await m.db.insert(m.schema.bewertung).values({ katalogeintragId: t!.id, punkte: 93 });
    const { checkliste } = await import("../services/pruefung");
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, schauId));
    expect((await checkliste(schauId)).some((p) => p.art === "fehler" && p.text.includes("nicht als eingeliefert abgehakt"))).toBe(true);
    await al.halle.statusSetzen({ schauId, ids: [t!.id], status: "ausgesetzt" });
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, schauId));
    await expect(al.meldung.speichern({ schauId, aussteller: person("Spaet"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] })).rejects.toThrow("abgeschlossen");
  });
});

describe("Runde 4: Datenschutz", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let slug = "";
  let farbe = 0;
  const pos = () => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3000 });
  const pub = () => m.appRouter.createCaller({ ...leer, ip: "198.51.100.140" });
  const online = (vorname: string, extra: Partial<{ istJugend: boolean; geburtsdatum: string; erziehungsberechtigter: string; stiftung: { betragCent: number; vorgabe: string } }> = {}) =>
    pub().oeffentlich.melden({
      slug,
      aussteller: { vorname, nachname: "Haushalt", strasse: "Hof 1", plz: "34117", ort: "Kassel", telefon: "", email: "familie@test.de", verein: "GZV", kreisverband: "", registriernummer: "06 535 012 0077", geburtsdatum: extra.geburtsdatum ?? null },
      istJugend: extra.istJugend ?? false,
      istPreisrichter: false,
      positionen: [pos()],
      zustimmung: true,
      erziehungsberechtigter: extra.erziehungsberechtigter ?? "",
      stiftung: extra.stiftung ?? null,
      bemerkung: "",
    });

  test("Mehrere Personen eines Betriebs melden online; Jugendliche erlauben die Veröffentlichung nur mit Erziehungsberechtigtem", async () => {
    al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Datenschutz Runde 4", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    slug = daten.slug;
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, bewertungAm: "2026-11-21" } });
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
    await online("Vater", { stiftung: { betragCent: 1000, vorgabe: "" } });
    await expect(online("Vater")).rejects.toThrow("schon gemeldet");
    const sohn = await online("Sohn", { istJugend: true, geburtsdatum: "2012-05-05", erziehungsberechtigter: "Vater Haushalt" });
    await pub().oeffentlich.onlineVeroeffentlichung({ slug, token: sohn.token, erlaubt: false });
    await expect(pub().oeffentlich.onlineVeroeffentlichung({ slug, token: sohn.token, erlaubt: true })).rejects.toThrow("Erziehungsberechtigten");
    expect((await pub().oeffentlich.onlineVeroeffentlichung({ slug, token: sohn.token, erlaubt: true, erziehungsberechtigter: "Mutter Haushalt" })).online).toBe(true);
  });

  test("Stifter online nur mit Einwilligung; gesperrte Aussteller ohne Namen", async () => {
    // Stiftung einer offenen Meldung (Vater) und ein Stifter ohne Meldung ohne Zustimmung: online nicht genannt.
    await al.preise.stiftungSpeichern({ schauId, stifter: "Firma Futterhaus", preisartId: null, anzahl: 1, betragCent: 2000, vorgabe: "", eingegangenAm: null });
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, schauId));
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const { katalogPdf } = await import("../pdf/katalog");
    const text = pdfText;
    const onlineKatalog = text(await katalogPdf(s!, { online: true }));
    expect(onlineKatalog).toContain("Datenschutz Runde 4");
    expect(onlineKatalog).not.toContain("Futterhaus");
    expect(onlineKatalog).not.toContain("Vater Haushalt");
    // Gedruckt stehen Stifter ohne Meldung immer.
    expect(text(await katalogPdf(s!))).toContain("Futterhaus");
    await al.preise.stiftungSpeichern({ ...(await al.preise.uebersicht({ schauId })).stiftungen.find((x) => x.stifter === "Firma Futterhaus")!, schauId, onlineNennen: true });
    expect(text(await katalogPdf(s!, { online: true }))).toContain("Futterhaus");
    // Gesperrt (Löschwunsch während der Frist): auch im Druck ohne Namen.
    const eintrag = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId)))[0]!;
    await m.db.update(m.schema.meldung).set({ status: "bestaetigt", zustimmungAm: new Date() }).where(m.eq(m.schema.meldung.id, eintrag.id));
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date() }).where(m.eq(m.schema.aussteller.id, eintrag.ausstellerId));
    const { ladeEintraege, verdeckeNamen } = await import("../services/eintraege");
    const druck = verdeckeNamen(await ladeEintraege(schauId, { nurMeldungId: eintrag.id }), "druck");
    expect(druck.every((e) => e.verdeckt)).toBe(true);
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: null }).where(m.eq(m.schema.aussteller.id, eintrag.ausstellerId));
  });

  test("Auskunft: Tierbezeichnung, Mails nach Adresswechsel, Stifter und Preisrichter mit Bewertungen", async () => {
    const { ladeAuskunft, ladeAuskunftPerson } = await import("../services/datenschutz");
    const orgId = adminKontext.benutzer!.organisationId;
    const [vater] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.vorname, "Vater"));
    await m.db.update(m.schema.aussteller).set({ email: "neu@test.de" }).where(m.eq(m.schema.aussteller.id, vater!.id));
    const a = await ladeAuskunft(orgId, vater!.id);
    expect(a.emails.length).toBeGreaterThan(0);
    expect(a.meldungen[0]!.tiere[0]!.tier).toContain("Wyandotten");
    const pr = await al.preisrichter.speichern({ schauId, name: "Richter Auskunft", anschrift: "", email: "", telefon: "", istObmann: false });
    await m.db.insert(m.schema.prEinteilung).values({ schauId, preisrichterId: pr.id, vonNr: 1, bisNr: 10 });
    const p = await ladeAuskunftPerson(orgId, "Richter Auskunft");
    expect(p.preisrichter[0]!.einteilung).toEqual([{ vonNr: 1, bisNr: 10 }]);
    expect((await ladeAuskunftPerson(orgId, "Futterhaus")).stifter).toHaveLength(1);
  });

  test("Löschen eines Ausstellers mit „%“ im Namen leert keine fremden Journaltexte", async () => {
    const { loescheAussteller } = await import("../services/datenschutz");
    const orgId = adminKontext.benutzer!.organisationId;
    await m.db.insert(m.schema.gesundheit).values({ schauId, befund: "Fremder Eintrag", tierText: "12 Huhn (Fremd, Name)" });
    const [a] = await m.db.insert(m.schema.aussteller).values({ organisationId: orgId, vorname: "%", nachname: "%" }).returning();
    await m.db.transaction((tx) => loescheAussteller(tx, orgId, a!.id, "Test Platzhalter", { text: "Test" }));
    const [g] = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.befund, "Fremder Eintrag"));
    expect(g!.tierText).toBe("12 Huhn (Fremd, Name)");
  });

  test("Bereinigung: Journal und Tierarztangaben nach 3 Jahren, gesperrte Aussteller behalten nur den Namen", async () => {
    const { bereinige } = await import("../services/datenschutz");
    await m.db.insert(m.schema.gesundheit).values({ schauId, befund: "Test-Befund", tierarzt: "Dr. Alt" });
    await m.db.update(m.schema.meldung).set({ vetTierarzt: "Dr. Alt" }).where(m.eq(m.schema.meldung.schauId, schauId));
    const [mld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId)).limit(1);
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date(), loeschenAb: "2040-01-01" }).where(m.eq(m.schema.aussteller.id, mld!.ausstellerId));
    const spaeter = new Date(Date.UTC(2030, 0, 15));
    // Solange die Schau läuft, bleibt alles stehen – gelöscht wird erst nach dem Abschluss.
    await bereinige(spaeter, { organisationId: adminKontext.benutzer!.organisationId });
    expect((await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.schauId, schauId))).length).toBeGreaterThan(0);
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, schauId));
    const n = await bereinige(spaeter, { organisationId: adminKontext.benutzer!.organisationId });
    expect(n.journal).toBeGreaterThan(0);
    expect(await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.schauId, schauId))).toHaveLength(0);
    const [nachher] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, mld!.id));
    expect(nachher!.vetTierarzt).toBe("");
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mld!.ausstellerId));
    expect([a!.strasse, a!.ort, a!.registriernummer]).toEqual(["", "", ""]);
    expect(a!.nachname).toBe("Haushalt");
  });
});

describe("Runde 4: Bewertung am PC und Obmann", () => {
  test("Konflikt am PC, Obmann bestätigt nur den gesehenen Stand und nie die eigene (auch am PC nachgetragene) Note; Kurzadresse fest", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Obmann Runde 4", ort: "Halle" });
    const daten = await al.schau.get({ id: s.id });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al.meldung.speichern({ schauId: s.id, aussteller: { vorname: "Ob", nachname: "Mann", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350150099", geburtsdatum: null, istPreisrichter: false }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos, pos] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: s.id });
    const [t1, t2] = (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!);
    const o1 = await al.preisrichter.speichern({ schauId: s.id, name: "Obmann Eins", anschrift: "", email: "", telefon: "", istObmann: true });
    const o2 = await al.preisrichter.speichern({ schauId: s.id, name: "Obmann Zwei", anschrift: "", email: "", telefon: "", istObmann: true });
    await al.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: [{ preisrichterId: o1.id, vonNr: 1, bisNr: 2 }] });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, s.id));
    await expect(al.schau.aktualisieren({ id: s.id, daten: { ...daten, slug: "andere-adresse-r4" } })).rejects.toThrow("Vorbereitung");

    const note = (id: number, punkte: number, extra: object = {}) => ({ schauId: s.id, katalogeintragId: id, punkte, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "", ...extra });
    // Am PC nachgetragene 97 für ein Tier von Obmann Eins: er bestätigt sie nicht selbst.
    await al.bewertung.setzen(note(t1!.id, 97, { basisVersion: 0 }));
    await expect(al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t1!.id, obmannId: o1.id })).rejects.toThrow("eigene Bewertung");
    // Zwischenzeitlich geändert: Bestätigung mit altem Stand scheitert, mit aktuellem geht sie.
    const v1 = (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, t1!.id)))[0]!.bewertungVersion;
    await al.bewertung.setzen(note(t1!.id, 97, { basisVersion: v1, vorzuege: "korrigiert" }));
    await expect(al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t1!.id, obmannId: o2.id, version: v1 })).rejects.toThrow("inzwischen geändert");
    await al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t1!.id, obmannId: o2.id, version: v1 + 1 });
    // Am PC mit veraltetem Stand: Konflikt, mit „erzwingen“ gespeichert.
    await al.bewertung.setzen(note(t2!.id, 93, { basisVersion: 0 }));
    await expect(al.bewertung.setzen(note(t2!.id, 94, { basisVersion: 0 }))).rejects.toThrow("inzwischen anderswo geändert");
    expect((await al.bewertung.setzen(note(t2!.id, 94, { basisVersion: 0, erzwingen: true }))).status).toBe("gespeichert");
  });
});
