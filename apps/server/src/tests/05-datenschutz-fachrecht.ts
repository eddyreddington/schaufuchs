/** Paket 3 (Datenschutz) und Paket 4 (Fachrecht). Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, type Mod } from "./kontext";

describe("Paket 3: Datenschutz", () => {
  const slug = "testschau-2026";

  test("Impressum und Datenschutzhinweise aus den Vereinsangaben", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const pub = m.appRouter.createCaller(leer);
    expect((await admin.verein.get()).fehlend).toContain("Anschrift");
    await admin.verein.speichern({
      name: "Testverein e. V.",
      anschrift: "Hauptstr. 1\n34117 Kassel",
      email: "info@testverein.de",
      vertretung: "Max Muster (1. Vorsitzender)",
      register: "Amtsgericht Kassel, VR 1234",
    });
    const t = await pub.oeffentlich.rechtstexte({ slug });
    expect(t.vollstaendig).toBe(true);
    expect(t.impressum[0]!.absaetze).toEqual(["Testverein e. V.", "Hauptstr. 1", "34117 Kassel"]);
    expect(t.datenschutz[0]!.absaetze[0]).toContain("Testverein e. V., Hauptstr. 1, 34117 Kassel");
    expect((await pub.oeffentlich.schau({ slug })).datenschutzKurz[0]).toContain("info@testverein.de");
    // Nur Administratoren ändern die Angaben.
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await expect(helfer.verein.speichern({ name: "X e. V." })).rejects.toThrow("Administratoren");
  });

  test("Online nur mit Einwilligung, Widerruf über den Link aus der Mail", async () => {
    const pub = m.appRouter.createCaller(leer);
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, slug));
    // Alle Meldungen der Testschau sind ohne Online-Einwilligung angelegt: online kein Name.
    const vorher = await pub.oeffentlich.ergebnisse({ slug });
    expect(vorher.tiere.length).toBeGreaterThan(0);
    expect(vorher.tiere.every((t) => t.aussteller === "nicht veröffentlicht" && t.verein === "")).toBe(true);

    const [mld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, s!.id)).limit(1);
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mld!.ausstellerId));
    expect((await pub.oeffentlich.meineMeldung({ slug, token: mld!.zugangsToken })).online).toBe(false);
    await pub.oeffentlich.onlineVeroeffentlichung({ slug, token: mld!.zugangsToken, erlaubt: true });
    const mitName = await pub.oeffentlich.ergebnisse({ slug });
    expect(mitName.tiere.some((t) => t.aussteller === `${a!.vorname} ${a!.nachname}`)).toBe(true);

    await pub.oeffentlich.onlineVeroeffentlichung({ slug, token: mld!.zugangsToken, erlaubt: false });
    expect((await pub.oeffentlich.ergebnisse({ slug })).tiere.some((t) => t.aussteller.includes(a!.nachname))).toBe(false);
    const protokoll = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, mld!.id));
    expect(protokoll.map((p) => p.aktion)).toContain("Online-Veröffentlichung widerrufen");

    // Im Druck stehen die Namen (Meldebogen unterschrieben), online nicht.
    const { ladeEintraege, verdeckeNamen } = await import("../services/eintraege");
    const alle = await ladeEintraege(s!.id, { nurBestaetigt: true });
    expect(verdeckeNamen(alle, "druck").every((e) => !e.verdeckt)).toBe(true);
    expect(verdeckeNamen(alle, "online").every((e) => e.verdeckt)).toBe(true);
    expect(verdeckeNamen(alle.map((e) => ({ ...e, zustimmungAm: null })), "druck").every((e) => e.verdeckt)).toBe(true);
  });

  test("Geburtsdatum nur bei Jugendmeldung", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const s = await admin.schau.anlegen({ name: "Datenschutzschau", ort: "Halle" });
    const r = await admin.meldung.speichern({
      schauId: s.id,
      aussteller: { vorname: "Ohne", nachname: "Jugend", strasse: "", plz: "", ort: "", telefon: "", email: "ohne@test.de", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: "2000-01-01", istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: [],
    });
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, r.ausstellerId));
    expect(a!.geburtsdatum).toBeNull();
  });

  test("Auskunft als PDF und JSON", async () => {
    const { ladeAuskunft, ladeVereinsangaben } = await import("../services/datenschutz");
    const { auskunftPdf } = await import("../pdf/auskunft");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, slug));
    const [mld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, s!.id)).limit(1);
    const orgId = adminKontext.benutzer!.organisationId;
    const a = await ladeAuskunft(orgId, mld!.ausstellerId);
    expect(a.meldungen[0]!.schau).toBe(s!.name);
    expect(a.meldungen[0]!.tiere.length).toBeGreaterThan(0);
    const pdf = await auskunftPdf(a, await ladeVereinsangaben(orgId));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // Fremde Vereine bekommen nichts.
    await expect(ladeAuskunft(orgId + 999, mld!.ausstellerId)).rejects.toThrow("nicht gefunden");
    // Download nur angemeldet als Administrator.
    const server = (await import("../index")).default;
    for (const endung of ["pdf", "json"]) {
      const r = await server.fetch(new Request(`http://test/datei/aussteller/${mld!.ausstellerId}/auskunft.${endung}`));
      expect(r.status).toBe(403);
    }
  });

  test("Bereinigung: nur wirklich inaktive Aussteller, Geburtsdatum erst nach Abschluss", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const { bereinige } = await import("../services/datenschutz");
    const s = await admin.schau.anlegen({ name: "Fristenschau", ort: "Halle" });
    const person = (n: string, geburtsdatum: string | null) => ({ vorname: n, nachname: "Frist", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum, istPreisrichter: false, iban: "", kontoinhaber: "" });
    const melde = (n: string, jugend: boolean) =>
      admin.meldung.speichern({ schauId: s.id, aussteller: person(n, jugend ? "2012-03-03" : null), eingang: "papier", istJugend: jugend, bemerkung: "", zustimmung: true, positionen: [] });
    const aktiv = await melde("Aktiv", true);
    const alt = await melde("Alt", false);
    // Beide seit Jahren bekannt; „Alt“ hat zuletzt vor vier Jahren gemeldet, „Aktiv“ gerade eben.
    const vorJahren = new Date(Date.UTC(2020, 0, 1));
    await m.db.update(m.schema.aussteller).set({ createdAt: vorJahren }).where(m.inArray(m.schema.aussteller.id, [aktiv.ausstellerId, alt.ausstellerId]));
    await m.db.update(m.schema.meldung).set({ eingegangenAm: new Date(Date.UTC(2022, 5, 1)) }).where(m.eq(m.schema.meldung.id, alt.meldungId));
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.id, alt.meldungId));

    expect((await admin.verein.aussteller({ q: "Frist" })).map((x) => x.meldungen)).toEqual([1, 1]);
    await bereinige();
    const [a1] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, aktiv.ausstellerId));
    const [a2] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, alt.ausstellerId));
    expect(a1!.geloeschtAm).toBeNull();
    expect(a1!.geburtsdatum).toBe("2012-03-03"); // Schau läuft noch
    expect(a2!.nachname).toBe("Gelöscht");

    // Gelöscht wird erst nach der Karenzzeit ab dem Abschluss.
    await admin.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen", trotzdem: true, grund: "Test: Schau vorbei" });
    await bereinige();
    const [a3] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, aktiv.ausstellerId));
    expect(a3!.geburtsdatum).toBe("2012-03-03"); // noch in der Karenzzeit
    await bereinige(new Date(Date.now() + 31 * 86_400_000));
    const [a4] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, aktiv.ausstellerId));
    expect(a4!.geburtsdatum).toBeNull();
    expect(a4!.geloeschtAm).toBeNull();
  });

  test("Löschen: laufende Meldung sperrt, Fristen sperren, danach anonym", async () => {
    const admin = m.appRouter.createCaller(adminKontext);
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, slug));
    // Aussteller mit Verkauf in der Testschau.
    const [mitVerkauf] = await m.db
      .select({ id: m.schema.meldung.ausstellerId, meldungId: m.schema.meldung.id, token: m.schema.meldung.zugangsToken })
      .from(m.schema.verkauf)
      .innerJoin(m.schema.katalogeintrag, m.eq(m.schema.katalogeintrag.id, m.schema.verkauf.katalogeintragId))
      .innerJoin(m.schema.meldung, m.eq(m.schema.meldung.id, m.schema.katalogeintrag.meldungId))
      .limit(1);
    await expect(admin.verein.ausstellerLoeschen({ id: mitVerkauf!.id, grund: "Wunsch per Mail" })).rejects.toThrow("laufende Meldung");

    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, s!.id));
    const r = await admin.verein.ausstellerLoeschen({ id: mitVerkauf!.id, grund: "Wunsch per Mail" });
    expect(r.art).toBe("gesperrt");
    const [g] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mitVerkauf!.id));
    expect(g!.email).toBe("");
    expect(g!.gesperrtAm).not.toBeNull();
    expect(g!.nachname).not.toBe("Gelöscht"); // Verkaufsliste braucht Name und Registriernummer noch
    // Der alte Link aus der Mail zeigt nichts mehr.
    await expect(m.appRouter.createCaller(leer).oeffentlich.meineMeldung({ slug, token: mitVerkauf!.token })).rejects.toThrow("nicht gefunden");
    expect((await admin.meldung.ausstellerSuche({ schauId: s!.id, q: g!.nachname })).some((x) => x.id === g!.id)).toBe(false);
    expect((await admin.verein.aussteller({ filter: "gesperrt" })).some((x) => x.id === g!.id)).toBe(true);

    // Nach Ablauf der Frist löscht die Bereinigung.
    const { bereinige } = await import("../services/datenschutz");
    const spaeter = new Date(`${Number(g!.loeschenAb!.slice(0, 4)) + 1}-06-01T12:00:00Z`);
    const n = await bereinige(spaeter);
    expect(n.geloescht).toBeGreaterThan(0);
    const [weg] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mitVerkauf!.id));
    expect(weg!.nachname).toBe("Gelöscht");
    expect(weg!.registriernummer).toBe("");
    expect(weg!.geloeschtAm).not.toBeNull();
    // Katalog und Abrechnung behalten die Zeilen, nur ohne Namen.
    expect((await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, mitVerkauf!.meldungId))).length).toBe(1);
    const [v] = await m.db.select().from(m.schema.verkauf).limit(1);
    expect(v!.kaeuferName).toBe("Gelöscht");
    await expect(admin.verein.ausstellerLoeschen({ id: mitVerkauf!.id, grund: "nochmal" })).rejects.toThrow("bereits gelöscht");
  });
});

describe("Paket 4: Fachrecht", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let slug = "";
  let tiere: Awaited<ReturnType<typeof al.katalog.liste>> = [];

  test("Online-Meldung: Registriernummer, Geschlecht, Pflichterklärungen", async () => {
    al = m.appRouter.createCaller(adminKontext);
    const pub = m.appRouter.createCaller({ ...leer, ip: "198.51.100.4" });
    const s = await al.schau.anlegen({ name: "Fachrechtschau", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    slug = daten.slug;
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, bewertungAm: "2026-11-21", erklaerungen: "Nicht aus Sperrbezirk.\n21 Tage kein Zukauf." } });
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    const v = daten.stammdatenVersionId!;
    const [huhn] = await al.stammdaten.suche({ versionId: v, q: "Wyandotten weiß" });
    const [taube] = await al.stammdaten.suche({ versionId: v, q: "Strasser" });
    const pos = (id: number, geschlecht = "1,0") => ({ farbenschlagId: id, freitext: "", art: "einzeltier" as const, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 4000 });
    const person = { vorname: "Fach", nachname: "Recht", strasse: "Weg 1", plz: "34117", ort: "Kassel", telefon: "", email: "fach@test.de", verein: "GZV", kreisverband: "", geburtsdatum: null };
    const melden = (reg: string, positionen = [pos(huhn!.id), pos(taube!.id)], erklaerungen = true) =>
      pub.oeffentlich.melden({ slug, aussteller: { ...person, registriernummer: reg }, istJugend: false, istPreisrichter: false, positionen, zustimmung: true, erklaerungen, stiftung: null, bemerkung: "" });

    await expect(melden("276 06 100740")).rejects.toThrow("Registriernummer ungültig");
    await expect(melden("06 535 012 0001", [pos(huhn!.id, "0,0")])).rejects.toThrow("Mindestens ein Tier");
    await expect(melden("06 535 012 0001", [pos(huhn!.id)], false)).rejects.toThrow("Erklärungen");
    const r = await melden("06 535 012 0001");
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token));
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mel!.ausstellerId));
    expect(a!.registriernummer).toBe("276 06 535 012 0001");
    expect(mel!.erklaerungenAm).not.toBeNull();
    await al.meldung.statusSetzen({ id: mel!.id, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    tiere = (await al.katalog.liste({ schauId })).sort((x, y) => x.katalogNr! - y.katalogNr!);
    expect(tiere.map((t) => t.tierart).sort()).toEqual(["huehner", "tauben"]);
  });

  test("Einlieferung nur mit geprüften Nachweisen je Tierart, sonst mit Grund", async () => {
    await al.schau.phaseSetzen({ id: schauId, phase: "einlieferung", trotzdem: true, grund: "Test: Ablauf" });
    const suche = (await al.halle.suche({ schauId, q: "Recht" }))[0]!;
    expect(suche.nachweise.noetig).toEqual(["nd", "pmv"]);
    const ids = tiere.map((t) => t.id);
    await expect(al.halle.statusSetzen({ schauId, ids, status: "eingeliefert" })).rejects.toThrow("Nachweis nicht geprüft");
    const leer2 = { datum: null, impfstoff: "", tierarzt: "" };
    const nd = { datum: "2026-09-01", impfstoff: "ND", tierarzt: "Dr. A" };
    const wg = { datum: null, sentinel: false, stelle: "" };
    // Nur ND reicht nicht: der Aussteller hat auch Tauben.
    await expect(al.halle.vetSetzen({ meldungId: suche.meldung.id, nd, pmv: leer2, wg, geprueft: true })).rejects.toThrow("PMV");
    await al.halle.vetSetzen({ meldungId: suche.meldung.id, nd, pmv: { datum: "2026-08-01", impfstoff: "PMV", tierarzt: "Dr. A" }, wg, geprueft: true });
    await al.halle.statusSetzen({ schauId, ids, status: "eingeliefert" });

    // Übersteuern ohne Nachweis: nur mit Grund, steht im Protokoll.
    await al.halle.vetSetzen({ meldungId: suche.meldung.id, nd, pmv: leer2, wg, geprueft: false });
    await al.halle.statusSetzen({ schauId, ids: [ids[0]!], status: "katalogisiert" });
    await expect(al.halle.statusSetzen({ schauId, ids: [ids[0]!], status: "eingeliefert" })).rejects.toThrow("Nachweis nicht geprüft");
    await al.halle.statusSetzen({ schauId, ids: [ids[0]!], status: "eingeliefert", uebersteuern: "Bescheinigung wird nachgereicht" });
    const p = await al.schau.protokoll({ schauId, limit: 50 });
    expect(p.some((x) => x.aktion.includes("ohne geprüften Nachweis") && x.grund === "Bescheinigung wird nachgereicht")).toBe(true);
  });

  test("Verkauf erst nach Bewertung, nicht krank, § 11c, Storno bleibt in der Liste", async () => {
    const [huhn, taube] = tiere;
    const kauf = (id: number, extra: Partial<{ kaeuferAlter: "ab16" | "unter16"; kaeuferErziehungsberechtigter: string; kaeuferRegistriernummer: string }> = {}) =>
      al.kasse.verkaufen({ schauId, katalogeintragId: id, kaeuferName: "Käufer Fach", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350777777", kaeuferAlter: "ab16", ...extra });
    await expect(kauf(huhn!.id)).rejects.toThrow("nach der Bewertung");
    await al.schau.phaseSetzen({ id: schauId, phase: "bewertung", trotzdem: true, grund: "Test: Ablauf" });
    await al.bewertung.setzen({ schauId, katalogeintragId: huhn!.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" });
    await al.schau.phaseSetzen({ id: schauId, phase: "schau", trotzdem: true, grund: "Test: Ablauf" });
    await expect(kauf(taube!.id)).rejects.toThrow("noch nicht bewertet");
    await expect(kauf(huhn!.id, { kaeuferRegistriernummer: "12345" })).rejects.toThrow("Registriernummer");
    await expect(kauf(huhn!.id, { kaeuferAlter: "unter16" })).rejects.toThrow("§ 11c");

    // Krank gemeldet: gesperrt für Verkauf, nach Freigabe wieder verkäuflich.
    await al.halle.gesundheitErfassen({ schauId, nr: String(huhn!.katalogNr), befund: "Atemgeräusche", massnahme: "abgesondert" });
    await expect(kauf(huhn!.id)).rejects.toThrow("Gesundheitsjournal");
    expect((await al.kasse.angebot({ schauId })).some((x) => x.id === huhn!.id)).toBe(false);
    const [g] = await al.halle.gesundheit({ schauId });
    expect(g!.tier?.katalogNr).toBe(huhn!.katalogNr);
    await al.halle.gesundheitFreigeben({ schauId, id: g!.id, grund: "Tierarzt: unbedenklich" });

    const v = await kauf(huhn!.id, { kaeuferAlter: "unter16", kaeuferErziehungsberechtigter: "Mutter Käufer" });
    expect(v.kaeuferRegistriernummer).toBe("276 06 535 077 7777");
    await al.kasse.stornieren({ schauId, verkaufId: v.id, grund: "Rückgabe" });
    const v2 = await kauf(huhn!.id);
    expect(v2.belegNr).toBe(v.belegNr + 1);
    const { ladeVerkaufsliste } = await import("../services/verkaufsliste");
    const liste = await ladeVerkaufsliste(schauId);
    expect(liste.map((z) => [z.belegNr, !!z.storniertAm, z.kaeuferUnter16])).toEqual([
      [v.belegNr, true, true],
      [v2.belegNr, false, false],
    ]);
    // In der Abrechnung zählt nur der gültige Verkauf.
    const ab = await al.kasse.abrechnung({ schauId });
    expect(ab[0]!.verkaufCent).toBe(4000);
  });

  test("Fehlendes Tier lässt sich nicht bewerten; Tierliste für das Veterinäramt", async () => {
    const [, taube] = tiere;
    await al.halle.statusSetzen({ schauId, ids: [taube!.id], status: "fehlt" });
    // Zurück in eine frühere Phase nur mit Grund (steht im Protokoll).
    await expect(al.schau.phaseSetzen({ id: schauId, phase: "bewertung" })).rejects.toThrow("Grund");
    await al.schau.phaseSetzen({ id: schauId, phase: "bewertung", grund: "Test: Nachbewertung" });
    await expect(
      al.bewertung.setzen({ schauId, katalogeintragId: taube!.id, punkte: 93, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" }),
    ).rejects.toThrow("fehlend");

    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const { ladeTierliste } = await import("../services/tierliste");
    const t = await ladeTierliste(s!);
    expect(t.aussteller).toHaveLength(1);
    expect(t.aussteller[0]!.registriernummer).toBe("276 06 535 012 0001");
    expect(t.aussteller[0]!.tiere.map((x) => x.status)).toEqual(["eingeliefert", "fehlt"]);
    expect(t.aussteller[0]!.tiere[0]!.verbleib).toContain("verkauft");
    expect(t.uebersicht.map((z) => [z.tierart, z.gemeldet, z.anwesend])).toEqual([
      ["Hühner und Zwerghühner", 1, 1],
      ["Tauben", 1, 0],
    ]);
    expect(t.gesundheit).toHaveLength(1);
    const { tierlistePdf } = await import("../pdf/dokumente");
    expect((await tierlistePdf(s!)).subarray(0, 4).toString()).toBe("%PDF");

    // Anzeige beim Veterinäramt: Prüfliste mahnt, sobald die 4-Wochen-Frist erreicht ist.
    const { checkliste } = await import("../services/pruefung");
    const liste = await checkliste(schauId);
    expect(liste.some((p) => p.text.includes("Veterinäramt"))).toBe(true);
  });
});
