/** Paket 5 (Kasse und GoBD, Versionszähler) und Behebungen aus der Beta. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText, verkaufsbereit, type Mod } from "./kontext";

describe("Paket 5: Kasse und GoBD", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let tiere: number[] = [];
  let meldungId = 0;

  test("Kassenbuch: Anfangsbestand, Barbewegungen, Tagesabschluss; Barbuchungen danach als Nachtrag", async () => {
    al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Kassenbuchschau", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    const [farbe] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 2000 };
    const aussteller = { vorname: "Kasse", nachname: "Buch", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350555555", geburtsdatum: null, istPreisrichter: false };
    const r = await al.meldung.speichern({ schauId, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos, pos, pos] });
    meldungId = r.meldungId;
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    tiere = (await al.katalog.liste({ schauId })).map((e) => e.id);
    await verkaufsbereit(schauId, tiere);

    await al.kasse.kassenbewegung({ schauId, art: "anfangsbestand", betragCent: 10_000, grund: "Wechselgeld" });
    await expect(al.kasse.kassenbewegung({ schauId, art: "entnahme", betragCent: 500 })).rejects.toThrow("Zweck");
    const kauf = (id: number, zahlart: "bar" | "karte" = "bar") =>
      al.kasse.verkaufen({ schauId, katalogeintragId: id, kaeuferName: "Bar Käufer", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350666666", kaeuferAlter: "ab16", zahlart });
    const v1 = await kauf(tiere[0]!);
    await kauf(tiere[1]!, "karte"); // Karte: nicht in der Barkasse
    await al.meldung.zahlungErfassen({ meldungId, betragCent: 1500, datum: "2026-11-06", art: "bar" });
    await al.kasse.kassenbewegung({ schauId, art: "entnahme", betragCent: 5000, grund: "Einzahlung Bank" });

    const buch = await al.kasse.kassenbuch({ schauId });
    const heute = buch.tage.find((t) => t.datum === buch.heute)!;
    expect(heute.bewegungen.map((b) => b.art)).toEqual(["anfangsbestand", "verkauf", "meldegeld", "entnahme"]);
    expect(heute.sollCent).toBe(10_000 + 2000 + 1500 - 5000);
    expect(buch.sollCent).toBe(8500);

    // Differenz nur mit Erklärung. Bar bleibt danach möglich (Nachtrag), Überweisungen berühren die Kasse nicht.
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 8400 })).rejects.toThrow("Differenz");
    const a = await al.kasse.tagesabschluss({ schauId, istCent: 8400, bemerkung: "1 € Wechselgeld falsch herausgegeben" });
    expect(a.differenzCent).toBe(-100);
    await al.meldung.zahlungErfassen({ meldungId, betragCent: 100, datum: "2026-11-06", art: "ueberweisung" });
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 8400 })).rejects.toThrow("schon abgeschlossen");
    await kauf(tiere[2]!);
    expect(v1.id).toBeGreaterThan(0);
    // Nachtragsabschluss: Soll = gezählte 84 € + 20 € Nachtrag.
    const n = await al.kasse.tagesabschluss({ schauId, istCent: 10_400 });
    expect(n).toMatchObject({ nachtrag: 1, sollCent: 10_400, differenzCent: 0 });
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 10_400 })).rejects.toThrow("schon abgeschlossen");

    const { kassenberichtPdf } = await import("../pdf/dokumente");
    const [sch] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect((await kassenberichtPdf(sch!)).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("Belegarchiv: Kaufbeleg beim Buchen abgelegt, unveränderbar; Provision nach Verkauf gesperrt", async () => {
    const belege = await al.kasse.belege({ schauId });
    // Jede Barbewegung hat einen Beleg: Wechselgeld und Entnahme (Eigenbeleg), bares Meldegeld (Einzahlung), Verkäufe.
    expect(belege.map((b) => b.art)).toEqual(["eigenbeleg", "eigenbeleg", "einzahlung", "kaufbeleg", "kaufbeleg", "kaufbeleg"]);
    expect(belege[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    const { archiviereKaufbeleg } = await import("../services/kassenbuch");
    const [v] = await al.kasse.verkaeufe({ schauId });
    const erneut = await archiviereKaufbeleg({ id: schauId }, v!.id);
    expect(erneut!.sha256).toBe(belege.find((b) => b.art === "kaufbeleg" && b.nummer === v!.belegNr)!.sha256);
    await expect((async () => m.db.delete(m.schema.beleg).where(m.eq(m.schema.beleg.schauId, schauId)))()).rejects.toThrow();
    // Verkauf einer anderen Schau: nichts archivieren (sonst läge ein falscher Beleg unter dieser Schau).
    const [fremd] = await m.db.select({ id: m.schema.verkauf.id }).from(m.schema.verkauf).innerJoin(m.schema.katalogeintrag, m.eq(m.schema.katalogeintrag.id, m.schema.verkauf.katalogeintragId)).where(m.ne(m.schema.katalogeintrag.schauId, schauId)).limit(1);
    expect(await archiviereKaufbeleg({ id: schauId }, fremd!.id)).toBeNull();
    const daten = await al.schau.get({ id: schauId });
    await expect(al.schau.aktualisieren({ id: schauId, daten: { ...daten, provisionBp: 2000 } })).rejects.toThrow("Provisionssatz");
  });

  test("Protokoll und Kassendaten unveränderbar, Hash-Kette prüfbar", async () => {
    const [z] = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, meldungId)).limit(1);
    await expect((async () => m.db.update(m.schema.zahlung).set({ betragCent: 1 }).where(m.eq(m.schema.zahlung.id, z!.id)))()).rejects.toThrow();
    await expect((async () => m.db.delete(m.schema.zahlung).where(m.eq(m.schema.zahlung.id, z!.id)))()).rejects.toThrow();
    const [e] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId)).limit(1);
    await expect((async () => m.db.update(m.schema.aenderung).set({ grund: "nachträglich" }).where(m.eq(m.schema.aenderung.id, e!.id)))()).rejects.toThrow();
    await expect((async () => m.db.delete(m.schema.aenderung).where(m.eq(m.schema.aenderung.id, e!.id)))()).rejects.toThrow();
    // Anonymisieren (Inhalt und Grund leeren) bleibt möglich und bricht die Kette nicht.
    await m.db.update(m.schema.aenderung).set({ alt: null, neu: null, grund: "" }).where(m.eq(m.schema.aenderung.id, e!.id));

    const ok = await al.schau.protokollPruefen({ schauId });
    expect(ok.geprueft).toBeGreaterThan(5);
    expect(ok.fehler).toEqual([]);

    // Der Schalter zum Entfernen eines Demo-Vereins erlaubt nur das Löschen, kein Ändern.
    await expect(
      m.sql.begin(async (tx) => {
        await tx.unsafe("set local schau.loeschen = 'ja'");
        await tx.unsafe(`update aenderung set grund = 'manipuliert' where id = ${e!.id}`);
      }),
    ).rejects.toThrow("nicht ändern");
    // Wer an der Datenbank vorbei ändert (Trigger abgeschaltet), fällt bei der Prüfung auf.
    const vorbei = (befehl: string) =>
      m.sql.begin(async (tx) => {
        await tx.unsafe("alter table aenderung disable trigger aenderung_schutz_tr");
        await tx.unsafe(befehl);
        await tx.unsafe("alter table aenderung enable trigger aenderung_schutz_tr");
      });
    await vorbei(`update aenderung set grund = 'manipuliert' where id = ${e!.id}`);
    const kaputt = await al.schau.protokollPruefen({ schauId });
    expect(kaputt.fehler.map((f) => [f.id, f.grund])).toEqual([[e!.id, "Inhalt verändert"]]);
    // Ebenso eine geänderte Aktion (Teil des Eintrags-Hashs).
    await vorbei(`update aenderung set grund = '', aktion = 'anders' where id = ${e!.id}`);
    expect((await al.schau.protokollPruefen({ schauId })).fehler.map((f) => [f.id, f.grund])).toEqual([[e!.id, "Eintrag verändert"]]);
  });

  test("Datumsprüfungen: Zahlung und SEPA-Ausführung", async () => {
    await expect(al.meldung.zahlungErfassen({ meldungId, betragCent: 100, datum: "2026-13-45", art: "ueberweisung" })).rejects.toThrow("Datum ungültig");
    await expect(al.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2026-02-31" })).rejects.toThrow("ungültig");
    await expect(al.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2020-01-01" })).rejects.toThrow("Vergangenheit");
  });
});

describe("Paket 5: Tablet-Abgleich nach Versionszähler", () => {
  test("Konflikt am Server-Stand statt an der Geräteuhr, Zukunftszeit begrenzt, Erzwingen nach Rückfrage", async () => {
    const { speichereBewertung, setzeBewertungZurueck } = await import("../services/bewertung");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.name, "Fachrechtschau"));
    expect(s!.phase).toBe("bewertung");
    const al = m.appRouter.createCaller(adminKontext);
    const liste = await al.katalog.liste({ schauId: s!.id });
    const wer = { akteur: { text: "Test-Tablet" }, preisrichterId: null, quelle: "tablet" as const, istAL: false, schauId: s!.id };
    const note = (id: number, punkte: number, extra: object) => ({ katalogeintragId: id, punkte, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(Date.now() + 10 * 3_600_000), ...extra });
    const speichere = (e: ReturnType<typeof note>) => m.db.transaction((tx) => speichereBewertung(tx, e as never, wer));

    // Das verkaufte Huhn ändert am Tablet niemand mehr (nur die Ausstellungsleitung mit Grund).
    const huhn = liste.find((e) => e.verkaufBelegNr != null)!;
    expect(await speichere(note(huhn.id, 95, { basisVersion: huhn.bewertungVersion }))).toMatchObject({ status: "fehler" });

    // Die Taube (bisher „fehlt“) ist doch da und wird am Tablet bewertet.
    const taube = liste.find((e) => e.status === "fehlt")!;
    await al.halle.statusSetzen({ schauId: s!.id, ids: [taube.id], status: "eingeliefert", uebersteuern: "Test: Tier nachgereicht, Nachweis liegt vor" });
    const erst = await speichere(note(taube.id, 93, { basisVersion: taube.bewertungVersion }));
    expect(erst.status).toBe("gespeichert");
    const v = (erst as { version: number }).version;

    // Uhr 10 Stunden vor, aber alter Stand: Konflikt.
    expect((await speichere(note(taube.id, 95, { basisVersion: v - 1 }))).status).toBe("veraltet");
    const ok = await speichere(note(taube.id, 95, { basisVersion: v }));
    expect(ok).toMatchObject({ status: "gespeichert", version: v + 1 });
    const [nachher] = await m.db.select().from(m.schema.bewertung).where(m.eq(m.schema.bewertung.katalogeintragId, taube.id));
    expect(nachher!.geraetZeit.getTime()).toBeLessThanOrEqual(Date.now());
    // Zweites Gerät mit dem alten Stand: Konflikt – nach Rückfrage mit „erzwingen“ gespeichert.
    expect((await speichere(note(taube.id, 96, { basisVersion: v }))).status).toBe("veraltet");
    expect((await speichere(note(taube.id, 96, { basisVersion: v, erzwingen: true }))).status).toBe("gespeichert");
    // Dasselbe noch einmal gesendet (Antwort ging verloren): kein Scheinkonflikt, kein neuer Stand.
    expect(await speichere(note(taube.id, 96, { basisVersion: v }))).toMatchObject({ status: "gespeichert", version: v + 2 });
    // Nach dem Zurücksetzen zählt der Zähler weiter: ein Tablet mit dem Stand davor bekommt einen Konflikt.
    await m.db.transaction((tx) => setzeBewertungZurueck(tx, taube.id, wer));
    expect((await speichere(note(taube.id, 94, { basisVersion: v + 2 }))).status).toBe("veraltet");
  });
});

describe("Beta-Behebung: Meldung, Nummern, Halle, Prüfliste, Auskunft", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let farbe = 0;
  let belegNr = 0;
  let slug = "";
  const pos = (geschlecht = "1,0", art: "einzeltier" | "voliere" = "einzeltier") => ({
    farbenschlagId: farbe,
    freitext: "",
    art,
    geschlecht,
    alter: "jung" as const,
    istAoc: false,
    istNeuzuechtung: false,
    eigeneZucht: true,
    verkaufspreisCent: 3000,
  });
  const person = (n: string) => ({ vorname: n, nachname: "Behebung", strasse: "Weg 2", plz: "34117", ort: "Kassel", telefon: "", email: `${n.toLowerCase()}@test.de`, verein: "GZV", kreisverband: "", registriernummer: "065350120002", geburtsdatum: null, istPreisrichter: false });
  const melden = (n: string, positionen = [pos(), pos("0,1")]) =>
    al.meldung.speichern({ schauId, aussteller: person(n), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen });

  test("Online-Meldung: Fehlversuche sperren die E-Mail-Adresse nicht, Bestätigung an die kleingeschriebene Adresse", async () => {
    al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Behebungsschau", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    slug = daten.slug;
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
    const pub = m.appRouter.createCaller({ ...leer, ip: "198.51.100.77" });
    const online = (reg: string) =>
      pub.oeffentlich.melden({
        slug: daten.slug,
        aussteller: { ...person("Online"), email: "Online.Melder@Test.DE", registriernummer: reg },
        istJugend: false,
        istPreisrichter: false,
        positionen: [pos()],
        zustimmung: true,
        stiftung: null,
        bemerkung: "",
      });
    // „keine“ ist keine Registriernummer – und vier Fehlversuche sperren die Adresse nicht.
    for (let i = 0; i < 4; i++) await expect(online("keine")).rejects.toThrow("Registriernummer");
    const r = await online("06 535 012 0002");
    expect(r.token).toBeTruthy();
    const post = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "online.melder@test.de"));
    expect(post).toHaveLength(1);
  });

  test("Nachmeldung: die Nummer einer wieder offenen Meldung bleibt belegt", async () => {
    const r1 = await melden("Eins");
    await al.meldung.statusSetzen({ id: r1.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    await al.katalog.gedrucktSetzen({ schauId, gedruckt: true });
    const x = await melden("Zwei", [pos()]);
    await al.meldung.statusSetzen({ id: x.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    await al.meldung.statusSetzen({ id: x.meldungId, status: "offen", grund: "Zahlung zurückgebucht" });
    const y = await melden("Drei", [pos()]);
    await al.meldung.statusSetzen({ id: y.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    const nummern = (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, schauId)))
      .filter((e) => e.katalogNr != null)
      .map((e) => `${e.katalogNr}${e.suffix}`);
    expect(nummern).toHaveLength(4);
    expect(new Set(nummern).size).toBe(4);
  });

  test("Halle: „fehlt“ nur ohne Bewertung, Ausgabe verkaufter Tiere gegen Kaufbeleg, gesperrter nur mit Grund", async () => {
    const [t1, t2] = (await al.katalog.liste({ schauId })).filter((e) => e.ausstellerName === "Behebung, Eins").sort((a, b) => a.katalogNr! - b.katalogNr!);
    await verkaufsbereit(schauId, [t1!.id, t2!.id]);
    await expect(al.halle.statusSetzen({ schauId, ids: [t1!.id], status: "fehlt" })).rejects.toThrow("ist bewertet");
    const v = await al.kasse.verkaufen({ schauId, katalogeintragId: t1!.id, kaeuferName: "Käufer Behebung", kaeuferAnschrift: "Hof 1", kaeuferRegistriernummer: "065350888888", kaeuferAlter: "ab16" });
    belegNr = v.belegNr;
    await expect(al.halle.statusSetzen({ schauId, ids: [t1!.id], status: "ausgesetzt" })).rejects.toThrow("Kaufbeleg");
    await expect(al.halle.statusSetzen({ schauId, ids: [t1!.id], status: "ausgesetzt", belegNr: v.belegNr + 1 })).rejects.toThrow("gehört nicht");
    await al.halle.statusSetzen({ schauId, ids: [t1!.id], status: "ausgesetzt", belegNr: v.belegNr });

    // Gesperrt: Ausgabe nur mit Grund; die Sperre hebt nur die Ausstellungsleitung auf.
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await al.halle.gesundheitErfassen({ schauId, nr: `${t2!.katalogNr}${t2!.suffix}`, befund: "Verdacht Atemwege" });
    const [g] = await al.halle.gesundheit({ schauId });
    const [gDb] = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.id, g!.id));
    expect(gDb!.tierText).toContain("Behebung, Eins");
    await expect(helfer.halle.statusSetzen({ schauId, ids: [t2!.id], status: "ausgesetzt" })).rejects.toThrow("Gesundheitsjournal");
    await expect(helfer.halle.gesundheitFreigeben({ schauId, id: g!.id, grund: "Tierarzt: unbedenklich" })).rejects.toThrow("Administratoren");
    await helfer.halle.statusSetzen({ schauId, ids: [t2!.id], status: "ausgesetzt", uebersteuern: "Tierarzt: Abgabe an den Halter angeordnet" });
    const p = await al.schau.protokoll({ schauId, limit: 30 });
    expect(p.some((x) => x.aktion.includes(`gegen Kaufbeleg ${v.belegNr}`))).toBe(true);
    expect(p.some((x) => x.aktion.includes("gesperrt") && x.grund.startsWith("Tierarzt"))).toBe(true);

    // Nach der Freigabe: Zurücknehmen der Ausgabe geht weiter, alles andere nur die Ausstellungsleitung mit Grund.
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, schauId));
    await helfer.halle.statusSetzen({ schauId, ids: [t2!.id], status: "eingeliefert" });
    await expect(helfer.halle.statusSetzen({ schauId, ids: [t2!.id], status: "fehlt" })).rejects.toThrow("Ausstellungsleitung");
    await expect(al.halle.statusSetzen({ schauId, ids: [t2!.id], status: "fehlt" })).rejects.toThrow("Grund");
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: false }).where(m.eq(m.schema.schau.id, schauId));

    // Storno nach der Ausgabe: die Tierliste fordert, den Verbleib zu prüfen.
    await al.kasse.stornieren({ schauId, verkaufId: v.id, grund: "Käufer bringt das Tier zurück" });
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const { ladeTierliste } = await import("../services/tierliste");
    const zeile = (await ladeTierliste(s!)).aussteller.flatMap((a) => a.tiere).find((x) => x.katalogNr === `${t1!.katalogNr}${t1!.suffix}`)!;
    expect(zeile.verbleib).toContain("Verbleib prüfen");
  });

  test("Prüfliste: Meldeart ohne Tarif, stornierte Meldung mit Zahlung, nur ein Preisrichter", async () => {
    await melden("Vier", [pos("2,4", "voliere")]);
    const r = await melden("Fuenf", [pos()]);
    await al.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 500, datum: "2026-11-06", art: "ueberweisung" });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Rückzug" });
    // Anschrift im Katalog nur mit Einverständnis (Gesamtprüfung 13.11.2026).
    await al.preisrichter.speichern({ schauId, name: "Einziger Obmann", anschrift: "Feldweg 3, 34117 Kassel", email: "", telefon: "", istObmann: true, anschriftImKatalog: true });
    const { checkliste } = await import("../services/pruefung");
    const texte = (await checkliste(schauId)).map((p) => p.text);
    expect(texte.some((t) => t.includes("ohne Tarif") && t.includes("Voliere"))).toBe(true);
    expect(texte.some((t) => t.includes("stornierte oder abgelehnte Meldung"))).toBe(true);
    expect(texte.some((t) => t.includes("Nur ein Preisrichter"))).toBe(true);
  });

  test("Auskunft: Bewertung, Belege und Protokoll; Käufer und Preisrichter nach Name", async () => {
    const { ladeAuskunft, ladeVereinsangaben } = await import("../services/datenschutz");
    const { auskunftPdf } = await import("../pdf/auskunft");
    const orgId = adminKontext.benutzer!.organisationId;
    const [eins] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.vorname, "Eins"));
    const a = await ladeAuskunft(orgId, eins!.id);
    expect(a.meldungen.some((x) => x.tiere.some((t) => t.bewertung?.punkte === 93))).toBe(true);
    expect(a.belege.map((b) => b.art)).toEqual(expect.arrayContaining(["kaufbeleg", "kaufbeleg-storno"]));
    expect(a.protokoll.length).toBeGreaterThan(0);
    expect((await auskunftPdf(a, await ladeVereinsangaben(orgId))).subarray(0, 4).toString()).toBe("%PDF");
    const k = await al.verein.auskunftPerson({ name: "käufer behebung" });
    expect(k.kaeufe.map((x) => x.belegNr)).toEqual([belegNr]);
    const pr = await al.verein.auskunftPerson({ name: "Einziger" });
    expect(pr.preisrichter.map((x) => x.anschrift)).toEqual(["Feldweg 3, 34117 Kassel"]);
    // Online-Katalog ohne Wohnanschrift der Preisrichter.
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const { katalogPdf } = await import("../pdf/katalog");
    const text = pdfText(await katalogPdf(s!, { online: true }));
    expect(text).toContain("Einziger Obmann");
    expect(text).not.toContain("Feldweg");
    // Gedruckt steht die Anschrift.
    expect(pdfText(await katalogPdf(s!))).toContain("Feldweg");
  });

  test("PIN: Fehlversuche über viele Adressen lassen den Preisrichter warten, eine neue PIN hebt das auf", async () => {
    const r = await al.preisrichter.speichern({ schauId, name: "PIN Probe", anschrift: "", email: "", telefon: "", istObmann: false });
    const { pin } = await al.preisrichter.pinErzeugen({ schauId, id: r.id });
    const [vorher] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, schauId));
    const falsch = pin === "00000000" ? "11111111" : "00000000";
    const von = (ip: string) => m.appRouter.createCaller({ ...leer, ip }).richter;
    for (let i = 0; i < 11; i++) await expect(von(`203.0.113.${i}`).anmelden({ slug, preisrichterId: r.id, pin: falsch })).rejects.toThrow("PIN stimmt nicht");
    await expect(von("203.0.113.200").anmelden({ slug, preisrichterId: r.id, pin })).rejects.toThrow("Zu viele");
    const neu = await al.preisrichter.pinErzeugen({ schauId, id: r.id });
    await von("203.0.113.201").anmelden({ slug, preisrichterId: r.id, pin: neu.pin });
    await m.db.update(m.schema.schau).set({ phase: vorher!.phase }).where(m.eq(m.schema.schau.id, schauId));
  });

  test("Logo höchstens 600 KB; SMTP mit kurzen Zeitgrenzen", async () => {
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(700 * 1024)]);
    await expect(al.katalogGestaltung.bildHochladen({ schauId, rolle: "logo", name: "gross.png", base64: png.toString("base64") })).rejects.toThrow("600 KB");
    const { smtpOptionen } = await import("../services/post");
    expect(smtpOptionen("smtps://user%40x.de:p%23ss@mail.example.de?tls.rejectUnauthorized=false")).toMatchObject({
      host: "mail.example.de",
      port: 465,
      secure: true,
      auth: { user: "user@x.de", pass: "p#ss" },
      connectionTimeout: 10_000,
      tls: { rejectUnauthorized: false },
    });
  });
});
