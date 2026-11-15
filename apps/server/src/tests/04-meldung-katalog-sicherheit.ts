/** Jugendmeldung, freie Bezeichnung, Volieren/Stämme, Verkaufsliste, erhaltene Daten, Sicherheit. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, verkaufsbereit } from "./kontext";

describe("Audit Paket f: Jugendmeldung online", () => {
  test("Jugend nur mit Geburtsdatum und passendem Alter am Bewertungstag", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const pub = m.appRouter.createCaller(leer);
    const { id } = await admin.schau.anlegen({ name: "Jugendschau Paket F", ort: "Halle" });
    const s = await admin.schau.get({ id });
    await admin.schau.aktualisieren({ id, daten: { ...s, bewertungAm: "2026-11-14" } });
    await admin.schau.gebuehrenSetzen({
      schauId: id,
      gebuehren: [
        { art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false },
        { art: "einzeltier", jugend: true, betragCent: 650, befreitPreisrichter: false },
      ],
    });
    await admin.schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    const [farbe] = await admin.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });

    const melden = (n: number, geburtsdatum: string | null, erziehungsberechtigter = "Erika Test") =>
      pub.oeffentlich.melden({
        slug: s.slug,
        aussteller: {
          vorname: `Jung${n}`,
          nachname: "Test",
          strasse: "",
          plz: "",
          ort: "",
          telefon: "",
          email: `jung${n}@test.de`,
          verein: "",
          kreisverband: "",
          registriernummer: `06535999${String(n).padStart(4, "0")}`,
          geburtsdatum,
        },
        istJugend: true,
        istPreisrichter: false,
        positionen: [
          {
            farbenschlagId: farbe!.id,
            freitext: "",
            art: "einzeltier",
            geschlecht: "1,0",
            alter: "jung",
            istAoc: false,
            istNeuzuechtung: false,
            eigeneZucht: true,
            verkaufspreisCent: null,
          },
        ],
        zustimmung: true,
        erziehungsberechtigter,
        stiftung: null,
        bemerkung: "",
      });

    await expect(melden(1, null)).rejects.toThrow("Geburtsdatum");
    // Minderjährig: nur mit Namen eines Erziehungsberechtigten.
    await expect(melden(4, "2010-01-01", "")).rejects.toThrow("Erziehungsberechtigten");
    // Am Bewertungstag 18 geworden: kein Jugendtarif.
    await expect(melden(2, "2008-11-14")).rejects.toThrow("nicht mehr jugendlich");
    const r = await melden(3, "2008-11-15");
    expect(r.betrag.summeCent).toBe(650);
  });
});

describe("Freie Bezeichnung wird bei ihrer Rasse eingeordnet", () => {
  test("AOC am Ende der Rasse, Neuzüchtung am Ende der Sparte, ohne Rasse abgelehnt", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Einordnung 2026", ort: "Halle" });
    const { stammdatenVersionId: versionId } = await al.schau.get({ id: s.id });
    const such = async (q: string) => (await al.stammdaten.suche({ versionId: versionId!, q }))[0]!;
    const [wyanWeiss, pommern, strasser, brahma] = await Promise.all([such("Wyandotten weiß"), such("Pommerngänse grau"), such("Strasser"), such("Brahma hell")]);
    const pos = (p: { farbenschlagId?: number; freitext?: string; rasseId?: number | null; istAoc?: boolean; istNeuzuechtung?: boolean }) => ({
      farbenschlagId: p.farbenschlagId ?? null,
      freitext: p.freitext ?? "",
      rasseId: p.rasseId ?? null,
      art: "einzeltier" as const,
      geschlecht: "1,0",
      alter: "jung" as const,
      istAoc: p.istAoc ?? false,
      istNeuzuechtung: p.istNeuzuechtung ?? false,
      eigeneZucht: true,
      verkaufspreisCent: null,
    });
    const aussteller = { vorname: "Ein", nachname: "Ordnung", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "276000009999", geburtsdatum: null, istPreisrichter: false };
    const meldung = { schauId: s.id, aussteller, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true };
    await expect(al.meldung.speichern({ ...meldung, positionen: [pos({ freitext: "Wyandotten, lavendel" })] })).rejects.toThrow("Rasse");

    const r = await al.meldung.speichern({
      ...meldung,
      positionen: [
        pos({ farbenschlagId: strasser.id }),
        pos({ freitext: "Wyandotten, lavendel", rasseId: wyanWeiss.rasseId, istAoc: true }),
        pos({ freitext: "Neue Haushuhnrasse, gelb", rasseId: brahma.rasseId, istNeuzuechtung: true }),
        pos({ farbenschlagId: wyanWeiss.id }),
        pos({ farbenschlagId: pommern.id }),
      ],
    });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: s.id });
    const reihe = (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!).map((e) => e.bezeichnung);
    // Die Neuzüchtung steht nach allen Hühnern des Verzeichnisses (Marans ist die letzte Hühnerrasse), vor den Tauben.
    expect(reihe).toEqual([
      "Pommerngänse, grau",
      "Wyandotten, weiß",
      "Wyandotten, lavendel (AOC)",
      "Neue Haushuhnrasse, gelb (Neuzüchtung)",
      `Strasser, ${strasser.farbenschlag}`,
    ]);
  });
});

describe("Volieren und Stämme vor den Einzeltieren", () => {
  test("eigene Abteilungen vorn, Schalter nach dem Druck gesperrt", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Abteilungen 2026", ort: "Halle" });
    const daten = await al.schau.get({ id: s.id });
    expect(daten.staemmeVorn).toBe(true);
    const such = async (q: string) => (await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q }))[0]!;
    const [wyan, pommern] = await Promise.all([such("Wyandotten weiß"), such("Pommerngänse grau")]);
    const pos = (farbenschlagId: number, art: "einzeltier" | "stamm" | "voliere", geschlecht: string) => ({
      farbenschlagId,
      freitext: "",
      rasseId: null,
      art,
      geschlecht,
      alter: "jung" as const,
      istAoc: false,
      istNeuzuechtung: false,
      eigeneZucht: true,
      verkaufspreisCent: null,
    });
    const aussteller = { vorname: "Ab", nachname: "Teilung", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "276000009998", geburtsdatum: null, istPreisrichter: false };
    const r = await al.meldung.speichern({
      schauId: s.id,
      aussteller,
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: [pos(pommern.id, "einzeltier", "1,0"), pos(wyan.id, "einzeltier", "1,0"), pos(wyan.id, "stamm", "1,2"), pos(pommern.id, "stamm", "1,1"), pos(wyan.id, "voliere", "1,3")],
    });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const reihe = async () => {
      await al.katalog.nummernVergeben({ schauId: s.id });
      return (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!).map((e) => `${e.art} ${e.bezeichnung}`);
    };
    expect(await reihe()).toEqual(["voliere Wyandotten, weiß", "stamm Pommerngänse, grau", "stamm Wyandotten, weiß", "einzeltier Pommerngänse, grau", "einzeltier Wyandotten, weiß"]);

    // Ausgeschaltet: wie bisher bei der Rasse, Stämme hinter den Einzeltieren.
    await al.schau.aktualisieren({ id: s.id, daten: { ...(await al.schau.get({ id: s.id })), staemmeVorn: false } });
    expect(await reihe()).toEqual(["einzeltier Pommerngänse, grau", "stamm Pommerngänse, grau", "einzeltier Wyandotten, weiß", "stamm Wyandotten, weiß", "voliere Wyandotten, weiß"]);

    await al.schau.aktualisieren({ id: s.id, daten: { ...(await al.schau.get({ id: s.id })), staemmeVorn: true } });
    await reihe();
    await al.katalog.gedrucktSetzen({ schauId: s.id, gedruckt: true });
    const nachDruck = await al.schau.get({ id: s.id });
    await expect(al.schau.aktualisieren({ id: s.id, daten: { ...nachDruck, staemmeVorn: false } })).rejects.toThrow("Reihenfolge");
    await expect(al.schau.aktualisieren({ id: s.id, daten: { ...nachDruck, jugendSeparat: false } })).rejects.toThrow("Reihenfolge");

    const { katalogPdf } = await import("../pdf/katalog");
    const pdf = await katalogPdf(nachDruck);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("Verkaufsliste für das Veterinäramt", () => {
  test("Herkunft und Bestimmung mit Registriernummer, Stamm zählt alle Tiere", async () => {
    const { ladeVerkaufsliste } = await import("../services/verkaufsliste");
    const { verkaufslistePdf } = await import("../pdf/dokumente");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const zeilen = await ladeVerkaufsliste(s!.id);
    expect(zeilen.length).toBeGreaterThan(0);
    for (const z of zeilen) {
      expect(z.bestimmungRegistriernummer.length).toBeGreaterThanOrEqual(5);
      expect(z.herkunftName.length).toBeGreaterThan(0);
      expect(z.anzahl).toBeGreaterThanOrEqual(1);
    }
    expect(zeilen.map((z) => z.belegNr)).toEqual([...zeilen.map((z) => z.belegNr)].sort((a, b) => a - b));
    const pdf = await verkaufslistePdf(s!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("Audit: verkaufte Tiere und abgerechnete Meldungen bleiben erhalten", () => {
  test("Entfernen aus der Meldung und Storno sind gesperrt, solange ein Verkauf daran hängt", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Sperren 2026", ort: "Halle" });
    const daten = await al.schau.get({ id: s.id });
    const [wyan] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = (geschlecht: string, id?: number) => ({
      ...(id ? { id } : {}),
      farbenschlagId: wyan!.id,
      freitext: "",
      rasseId: null,
      art: "einzeltier" as const,
      geschlecht,
      alter: "jung" as const,
      istAoc: false,
      istNeuzuechtung: false,
      eigeneZucht: true,
      verkaufspreisCent: 2000,
    });
    const aussteller = { vorname: "Sperr", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "276000009997", geburtsdatum: null, istPreisrichter: false };
    const basis = { schauId: s.id, aussteller, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true };
    const r = await al.meldung.speichern({ ...basis, positionen: [pos("1,0"), pos("0,1")] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: s.id });
    const [t1, t2] = (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!);
    await verkaufsbereit(s.id, [t1!.id]);
    const v = await al.kasse.verkaufen({ schauId: s.id, katalogeintragId: t1!.id, kaeuferName: "Käufer Test", kaeuferAnschrift: "", kaeuferRegistriernummer: "276000001234", kaeuferAlter: "ab16" });

    // Verkauftes Tier weglassen: abgelehnt mit Hinweis auf den Beleg.
    const mitA = { ...basis, meldungId: r.meldungId, aussteller: { ...aussteller, id: t1!.ausstellerId } };
    await expect(al.meldung.speichern({ ...mitA, positionen: [pos(t2!.geschlecht, t2!.id)] })).rejects.toThrow(`Beleg ${v.belegNr}`);
    // Storno der Meldung: ebenfalls gesperrt.
    await expect(al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Test" })).rejects.toThrow("verkauft");
    expect((await al.kasse.verkaeufe({ schauId: s.id })).map((x) => x.belegNr)).toEqual([v.belegNr]);

    // Unverkauftes Tier darf weg; nach dem Storno des Verkaufs auch das andere.
    await al.meldung.speichern({ ...mitA, positionen: [pos(t1!.geschlecht, t1!.id)] });
    await al.kasse.stornieren({ schauId: s.id, verkaufId: v.id, grund: "Käufer tritt zurück" });
    // Bewertet und eingeliefert ist es auch (Voraussetzung für den Verkauf): ein eingeliefertes Tier hält die Meldung
    // für die Tierliste fest. Für den Storno die Testbewertung entfernen und die Einlieferung zurücknehmen.
    await m.db.delete(m.schema.bewertung).where(m.eq(m.schema.bewertung.katalogeintragId, t1!.id));
    await expect(al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Test" })).rejects.toThrow("eingeliefert");
    await al.halle.statusSetzen({ schauId: s.id, ids: [t1!.id], status: "katalogisiert" });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Aussteller abgesprungen" });
    // Datenbank verhindert stilles Löschen eines Verkaufs zusätzlich (RESTRICT).
    const v2 = await (async () => {
      await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      await verkaufsbereit(s.id, [t1!.id]);
      return al.kasse.verkaufen({ schauId: s.id, katalogeintragId: t1!.id, kaeuferName: "Käufer Zwei", kaeuferAnschrift: "", kaeuferRegistriernummer: "276000001235", kaeuferAlter: "ab16" });
    })();
    await expect((async () => await m.db.delete(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, t1!.id)))()).rejects.toThrow();
    expect(v2.belegNr).toBe(v.belegNr + 1);
  });

  test("Zahlungen: Erstattung nur mit Grund, Löschen nur durch die Ausstellungsleitung mit Grund", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const [mld] = await m.db.select().from(m.schema.meldung).limit(1);
    await expect(al.meldung.zahlungErfassen({ meldungId: mld!.id, betragCent: -500, datum: "2026-10-02", art: "bar" })).rejects.toThrow("Grund");
    await expect(al.meldung.zahlungErfassen({ meldungId: mld!.id, betragCent: 0, datum: "2026-10-02", art: "bar" })).rejects.toThrow();
    await al.meldung.zahlungErfassen({ meldungId: mld!.id, betragCent: -500, datum: "2026-10-02", art: "bar", grund: "Tier nicht angenommen" });
    const [z] = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.grund, "Tier nicht angenommen"));
    await expect(al.meldung.zahlungStornieren({ id: z!.id, grund: "" })).rejects.toThrow("Grund");
    await al.meldung.zahlungStornieren({ id: z!.id, grund: "Testbuchung" });
  });
});

describe("Audit: Sicherheit", () => {
  test("Zu große Anfragen werden abgewiesen, ungültige IDs sind Eingabefehler statt Datenbankfehler", async () => {
    const server = (await import("../index")).default;
    const gross = JSON.stringify({ json: { slug: "x".repeat(2 * 1024 * 1024) } });
    const r = await server.fetch(new Request("http://test/trpc/oeffentlich.melden", { method: "POST", headers: { "Content-Type": "application/json" }, body: gross }));
    expect(r.status).toBe(413);
    const pub = m.appRouter.createCaller(leer);
    await expect(pub.richter.anmelden({ slug: "testschau-2026", preisrichterId: 99_999_999_999, pin: "00000000" })).rejects.toThrow();
    const antwort = await server.fetch(
      new Request("http://test/trpc/richter.anmelden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: { slug: "testschau-2026", preisrichterId: 99_999_999_999, pin: "00000000" } }) }),
    );
    expect(antwort.status).toBe(400);
    expect(await antwort.text()).not.toContain("select");
  });

  test("Kassen-Korrekturen nur durch die Ausstellungsleitung", async () => {
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const [s] = await m.db.select().from(m.schema.schau).limit(1);
    await expect(helfer.kasse.auszahlungStornieren({ schauId: s!.id, id: 1, grund: "Test" })).rejects.toThrow("Administratoren");
    await expect(helfer.kasse.stornieren({ schauId: s!.id, verkaufId: 1, grund: "Test" })).rejects.toThrow("Administratoren");
    await expect(helfer.kasse.ueberweisungsdateiErstellen({ schauId: s!.id, ausfuehrungAm: "2026-12-01" })).rejects.toThrow("Administratoren");
    await expect(helfer.meldung.zahlungStornieren({ id: 1, grund: "Test" })).rejects.toThrow("Administratoren");
  });

  test("PIN-Sperre hält auch gleichzeitige Versuche auf", async () => {
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.7" });
    const [pr] = await m.db.select().from(m.schema.preisrichter).limit(1);
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, pr!.schauId));
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, s!.id));
    const versuche = await Promise.allSettled(Array.from({ length: 20 }, () => pub.richter.anmelden({ slug: s!.slug, preisrichterId: pr!.id, pin: "00000001" })));
    await m.db.update(m.schema.schau).set({ phase: s!.phase }).where(m.eq(m.schema.schau.id, s!.id));
    const gebremst = versuche.filter((v) => v.status === "rejected" && String(v.reason).includes("Zu viele")).length;
    expect(gebremst).toBeGreaterThanOrEqual(12); // höchstens 8 Versuche werden wirklich geprüft
  });
});
