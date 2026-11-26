/** Testschauen: eigene Aussteller, nie in echten Schauen, Vorschlägen oder der Verwaltung; Kennzeichnen und Löschen. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer as leerKontext, m } from "./kontext";

const leer = { strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" };

describe("Testschau", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const ausstellerVon = async (meldungId: number) => {
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, mel!.ausstellerId));
    return a!;
  };
  const vorbereiten = async () => {
    const echt = await al().schau.anlegen({ name: "Echte Schau TS", ort: "Halle" });
    const testS = await al().schau.anlegen({ name: "Übungsschau TS", ort: "Halle", test: true });
    const versionId = (await al().schau.get({ id: echt.id })).stammdatenVersionId!;
    const pos = { farbenschlagId: (await al().stammdaten.suche({ versionId, q: "Wyandotten" }))[0]!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const melde = (schauId: number, aussteller: Record<string, unknown>) =>
      al().meldung.speichern({ schauId, aussteller: { ...leer, geburtsdatum: null, ...aussteller } as never, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    return { echt, testS, pos, melde };
  };

  test("Test-Aussteller bleiben in ihrer Testschau, echte bleiben draußen", async () => {
    const { echt, testS, melde } = await vorbereiten();
    expect((await al().schau.liste()).find((s) => s.id === testS.id)?.test).toBe(true);
    expect((await al().schau.liste()).find((s) => s.id === echt.id)?.test).toBe(false);

    // In der Testschau angelegt: gehört nur ihr.
    const tm = await melde(testS.id, { vorname: "Tessa", nachname: "Testschauerin", strasse: "Übungsweg 7", plz: "01099", ort: "Probstadt", verein: "Übungsverein Tessa", email: "tessa@test.de", registriernummer: "276 06 535 012 0077" });
    const tessa = await ausstellerVon(tm.meldungId);
    expect(tessa.testSchauId).toBe(testS.id);
    // Echter Aussteller (Verwaltung) und eine echte Meldung.
    const erwin = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Erwin", nachname: "Echtschauer", verein: "RGZV Echt" } });
    const em = await melde(echt.id, { id: erwin.id, vorname: "Erwin", nachname: "Echtschauer", verein: "RGZV Echt" });
    expect((await ausstellerVon(em.meldungId)).testSchauId).toBeNull();

    // Aussteller-Verwaltung: ohne Schau-Auswahl nur echte (Liste, Schreibweisen); Test-Aussteller unter ihrer Testschau.
    const verwaltung = (await al().verein.aussteller({ q: "schauer" })).map((x) => x.nachname);
    expect(verwaltung).toEqual(["Echtschauer"]);
    expect((await al().verein.vereinsangaben()).angaben.some((a) => a.verein === "Übungsverein Tessa")).toBe(false);
    // Bearbeiten, Auskunft und Löschen gehen auch für Test-Aussteller (z. B. wenn sich eine echte Person online in die
    // Testschau gemeldet hat); sie bleiben dabei Test-Aussteller.
    const { id: _i, mitglied: m0, ...tessaFelder } = await al().verein.ausstellerDaten({ id: tessa.id });
    expect(tessaFelder.nachname).toBe("Testschauerin");
    await al().verein.ausstellerSpeichern({ id: tessa.id, daten: { ...tessaFelder, telefon: "0123 4567" }, vorher: { ...tessaFelder, mitglied: m0 } });
    const tessaNeu = await ausstellerVon(tm.meldungId);
    expect(tessaNeu.telefon).toBe("0123 4567");
    expect(tessaNeu.testSchauId).toBe(testS.id);
    // Protokoll eines Test-Ausstellers nur in seiner Testschau, nicht im Vereinsprotokoll.
    const tessaProt = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "aussteller"))).filter((p) => p.datensatzId === tessa.id);
    expect(tessaProt.some((p) => p.aktion.startsWith("Stammdaten geändert") && p.schauId === testS.id)).toBe(true);
    expect(tessaProt.some((p) => p.schauId === null)).toBe(false);
    const { ladeAuskunft } = await import("../services/datenschutz");
    expect(JSON.stringify(await ladeAuskunft(adminKontext.benutzer!.organisationId, tessa.id))).toContain("Testschauerin");
    // Doppelt-Rückfrage beim Anlegen kennt nur echte: gleicher Name und PLZ wie Tessa ist kein Doppelter.
    const echteTessa = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Tessa", nachname: "Testschauerin", plz: "01099" } });
    expect(echteTessa.id).not.toBe(tessa.id);
    // Filter nach Schau: echte Schau – ihre echten Aussteller; Testschau – ihre Test-Aussteller.
    expect((await al().verein.aussteller({ q: "schauer", schauId: echt.id })).map((x) => x.id)).toEqual([erwin.id]);
    expect((await al().verein.aussteller({ q: "", schauId: testS.id })).map((x) => x.id)).toEqual([tessa.id]);

    // Suche im Meldeformular: je Schau nur der passende Bereich.
    const suche = async (schauId: number, q: string) => (await al().meldung.ausstellerSuche({ schauId, q })).map((x) => x.id);
    expect(await suche(echt.id, "Testschauerin")).toEqual([echteTessa.id]);
    expect(await suche(testS.id, "Testschauerin")).toEqual([tessa.id]);
    expect(await suche(testS.id, "Echtschauer")).toEqual([]);
    // Adressvorschläge: nichts aus Testschauen.
    const vorschlaege = JSON.stringify(await al().meldung.adressVorschlaege());
    expect(vorschlaege).not.toContain("Übungsweg");
    expect(vorschlaege).not.toContain("Übungsverein Tessa");

    // Melden über die Nummer: Test-Aussteller nicht in echter Schau, echter nicht in Testschau.
    await expect(melde(echt.id, { id: tessa.id, vorname: "Tessa", nachname: "Testschauerin" })).rejects.toThrow("Testschau");
    await expect(melde(testS.id, { id: erwin.id, vorname: "Erwin", nachname: "Echtschauer", verein: "RGZV Echt" })).rejects.toThrow("Testschau");
    expect((await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.ausstellerId, tessa.id))).map((x) => x.schauId)).toEqual([testS.id]);
  });

  test("Online-Meldung: bekannter Aussteller und Vereinsvorschläge nur aus dem eigenen Bereich", async () => {
    const { echt, testS, pos } = await vorbereiten();
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const id of [echt.id, testS.id]) await m.db.update(m.schema.schau).set({ phase: "meldung", meldeschluss: morgen }).where(m.eq(m.schema.schau.id, id));
    const slug = async (id: number) => (await al().schau.get({ id })).slug;
    const pub = m.appRouter.createCaller({ ...leerKontext, ip: "203.0.113.28" });
    const person = { vorname: "Olli", nachname: "Onlinetest", strasse: "Netzweg 1", plz: "01099", ort: "Probstadt", telefon: "", email: "olli@test.de", verein: "Übungsverein Olli", kreisverband: "", registriernummer: "276 06 535 012 0078", geburtsdatum: null };
    const melden = async (id: number) => pub.oeffentlich.melden({ slug: await slug(id), aussteller: person, istJugend: false, istPreisrichter: false, positionen: [pos], zustimmung: true, stiftung: null, bemerkung: "" });
    await melden(testS.id);
    const [testOlli] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.email, "olli@test.de"));
    expect(testOlli!.testSchauId).toBe(testS.id);
    await m.db.update(m.schema.meldung).set({ status: "bestaetigt" }).where(m.eq(m.schema.meldung.ausstellerId, testOlli!.id));
    // Dieselbe Person meldet in der echten Schau: neuer echter Stammsatz, nicht der Test-Aussteller.
    await melden(echt.id);
    const ollis = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.email, "olli@test.de"));
    expect(ollis.length).toBe(2);
    expect(ollis.find((a) => a.id !== testOlli!.id)!.testSchauId).toBeNull();
    // Vereinsvorschläge der echten Schau enthalten den Verein aus der Testschau nicht – die Testschau zeigt ihn.
    expect((await pub.oeffentlich.schau({ slug: await slug(echt.id) })).vereine.some((v) => v.verein === "Übungsverein Olli")).toBe(false);
    const testSeite = await pub.oeffentlich.schau({ slug: await slug(testS.id) });
    expect(testSeite.test).toBe(true);
    // Hinweis „Testschau“ auf allen öffentlichen Seiten: Rechtstexte, Ergebnisse, „Meine Meldung“.
    expect((await pub.oeffentlich.rechtstexte({ slug: await slug(testS.id) })).test).toBe(true);
    expect((await pub.oeffentlich.rechtstexte({ slug: await slug(echt.id) })).test).toBe(false);
    expect((await pub.oeffentlich.ergebnisse({ slug: await slug(testS.id) })).test).toBe(true);
    const [olliMeldung] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.ausstellerId, testOlli!.id));
    expect((await pub.oeffentlich.meineMeldung({ slug: await slug(testS.id), token: olliMeldung!.zugangsToken })).schau.test).toBe(true);
    expect(testSeite.vereine.some((v) => v.verein === "Übungsverein Olli")).toBe(true);
  });

  test("nachträglich als Testschau kennzeichnen: nur ohne echte Aussteller, endgültig, im Protokoll", async () => {
    const { echt, melde } = await vorbereiten();
    const uebung = await al().schau.anlegen({ name: "Übung nachträglich", ort: "Halle" });
    const dm = await melde(uebung.id, { vorname: "Dora", nachname: "Demoaustellerin", verein: "Demoverein" });
    const dora = await ausstellerVon(dm.meldungId);
    expect(dora.testSchauId).toBeNull();
    expect((await al().verein.aussteller({ q: "Demoaustellerin" })).length).toBe(1);

    await expect(al().schau.alsTestschau({ id: uebung.id, name: "falsch" })).rejects.toThrow("Namen");
    const [{ ab }] = (await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }];
    expect(await al().schau.alsTestschau({ id: uebung.id, name: "Übung nachträglich" })).toEqual({ aussteller: 1, kopien: 0 });
    expect((await ausstellerVon(dm.meldungId)).testSchauId).toBe(uebung.id);
    expect((await al().schau.get({ id: uebung.id })).test).toBe(true);
    expect(await al().verein.aussteller({ q: "Demoaustellerin" })).toEqual([]);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Als Testschau gekennzeichnet"))).filter((p) => p.id > ab);
    expect(prot.map((p) => p.schauId).sort()).toEqual([uebung.id, null].sort());
    // Zweites Mal: nichts zu tun.
    expect(await al().schau.alsTestschau({ id: uebung.id, name: "Übung nachträglich" })).toEqual({ aussteller: 0, kopien: 0 });

    // Mit einem echten Aussteller (auch in einem Beispiel gemeldet): ohne Bestätigung abgelehnt, nichts geändert.
    const gemischt = await al().schau.anlegen({ name: "Übung gemischt", ort: "Halle" });
    const rm = await melde(echt.id, { vorname: "Rudi", nachname: "Realaussteller", verein: "RGZV Echt" });
    const rudi = await ausstellerVon(rm.meldungId);
    // Über die Meldung in der Übung ändert sich Rudis Anschrift – die Spur steht nur im Protokoll der Übung.
    await melde(gemischt.id, { id: rudi.id, vorname: "Rudi", nachname: "Realaussteller", verein: "RGZV Echt", strasse: "Neuer Weg 5", email: "rudi@test.de" });
    const gm = await melde(gemischt.id, { vorname: "Gerd", nachname: "Gemischtdemo" });
    await expect(al().schau.alsTestschau({ id: gemischt.id, name: "Übung gemischt" })).rejects.toThrow("Rudi Realaussteller");
    expect((await al().schau.get({ id: gemischt.id })).test).toBe(false);
    expect((await ausstellerVon(gm.meldungId)).testSchauId).toBeNull();
    expect(await al().schau.testschauVorschau({ id: gemischt.id })).toEqual({ werden: ["Gerd Gemischtdemo"], kopien: ["Rudi Realaussteller"], hindernisse: [] });
    // Bestätigt: Rudis Meldung in der Übung geht auf eine Test-Kopie über (ohne Bankdaten), Rudi selbst bleibt echt.
    await m.db.update(m.schema.aussteller).set({ iban: (await import("../db/geheim")).gebunden("aussteller.iban", "DE89370400440532013000", rudi.id) }).where(m.eq(m.schema.aussteller.id, rudi.id));
    const rmUebung = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, gemischt.id))).find((x) => x.ausstellerId === rudi.id)!;
    expect(await al().schau.alsTestschau({ id: gemischt.id, name: "Übung gemischt", kopien: true })).toEqual({ aussteller: 1, kopien: 1 });
    const kopie = await ausstellerVon(rmUebung.id);
    expect(kopie.id).not.toBe(rudi.id);
    // Die Kopie trägt nur Name und Verein – keine Anschrift, Kontakt- oder Bankdaten.
    expect(kopie).toMatchObject({ vorname: "Rudi", nachname: "Realaussteller", verein: "RGZV Echt", testSchauId: gemischt.id, strasse: "", email: "", iban: "", mitglied: null, registriernummer: "" });
    const rudiDanach = await ausstellerVon(rm.meldungId);
    expect(rudiDanach).toMatchObject({ id: rudi.id, testSchauId: null, iban: "DE89370400440532013000", strasse: "Neuer Weg 5" });
    // Die Spur der Anschriftänderung steht jetzt auch im Vereinsprotokoll (sie verschwände sonst mit der Testschau).
    const rudiProt = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "aussteller"))).filter((p) => p.datensatzId === rudi.id && p.schauId === null);
    expect(rudiProt.some((p) => p.aktion.includes("jetzt Testschau") && JSON.stringify(p.neu).includes("Neuer Weg 5"))).toBe(true);
    // Auskunft und Löschen der echten Person erfassen die Kopie.
    const { ladeAuskunft } = await import("../services/datenschutz");
    expect((await ladeAuskunft(adminKontext.benutzer!.organisationId, rudi.id)).testKopien).toEqual([{ schau: "Übung gemischt", name: "Rudi Realaussteller", verein: "RGZV Echt" }]);
    expect((await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.ausstellerId, rudi.id))).map((x) => x.schauId)).toEqual([echt.id]);
    expect((await ausstellerVon(gm.meldungId)).testSchauId).toBe(gemischt.id);
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Meldung auf Test-Kopie umgehängt"))).some((p) => p.datensatzId === rudi.id && p.schauId === gemischt.id)).toBe(true);

    // Löschen der echten Person macht die Kopie sofort unkenntlich.
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, echt.id));
    await al().verein.ausstellerLoeschen({ id: rudi.id, grund: "Wunsch per Mail" });
    expect(await ausstellerVon(rmUebung.id)).toMatchObject({ id: kopie.id, nachname: "Gelöscht", verein: "" });
    expect((await ausstellerVon(rmUebung.id)).vorname).toBe(`#${kopie.id}`);
    await m.db.update(m.schema.schau).set({ phase: "vorbereitung" }).where(m.eq(m.schema.schau.id, echt.id));

    // Hat die Schau schon Geld (hier eine Zahlung, auch nur von Ausstellern, die Test-Aussteller würden): kein
    // Kennzeichnen – eine Testschau ließe sich samt Kasse und Belegen löschen.
    const mitGeld = await al().schau.anlegen({ name: "Übung Geld", ort: "Halle" });
    const zm = await melde(mitGeld.id, { vorname: "Zora", nachname: "Zahlerin" });
    await al().meldung.zahlungErfassen({ meldungId: zm.meldungId, betragCent: 100, datum: new Date().toISOString().slice(0, 10), art: "bar" });
    expect((await al().schau.testschauVorschau({ id: mitGeld.id })).hindernisse).toEqual(["1 Zahlung(en)", "1 Beleg(e)"]);
    await expect(al().schau.alsTestschau({ id: mitGeld.id, name: "Übung Geld", kopien: true })).rejects.toThrow("echte Aufzeichnungen");
    expect((await al().schau.get({ id: mitGeld.id })).test).toBe(false);
    expect((await ausstellerVon(zm.meldungId)).testSchauId).toBeNull();

    // In der Verwaltung gepflegt oder von Hand Mitglied: ebenfalls echt.
    const verwaltet = await al().schau.anlegen({ name: "Übung verwaltet", ort: "Halle" });
    const vera = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Vera", nachname: "Verwaltetdemo" } });
    await melde(verwaltet.id, { id: vera.id, vorname: "Vera", nachname: "Verwaltetdemo" });
    await expect(al().schau.alsTestschau({ id: verwaltet.id, name: "Übung verwaltet" })).rejects.toThrow("Vera Verwaltetdemo");
    const mitglied = await al().schau.anlegen({ name: "Übung Mitglied", ort: "Halle" });
    const mm = await melde(mitglied.id, { vorname: "Max", nachname: "Mitgliedsdemo" });
    await m.db.update(m.schema.aussteller).set({ mitglied: true }).where(m.eq(m.schema.aussteller.id, (await ausstellerVon(mm.meldungId)).id));
    await expect(al().schau.alsTestschau({ id: mitglied.id, name: "Übung Mitglied" })).rejects.toThrow("Max Mitgliedsdemo");

    // Nur Administratoren.
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await expect(helfer.schau.alsTestschau({ id: gemischt.id, name: "Übung gemischt" })).rejects.toThrow();
  });

  test("Datenbank-Trigger, Vorschau, Vorlage, Adressvorschläge je Bereich", async () => {
    const { echt, testS, melde } = await vorbereiten();
    const tm = await melde(testS.id, { vorname: "Trudi", nachname: "Triggertest", strasse: "Probeweg 9", verein: "Übungsverein Trudi" });
    const em = await melde(echt.id, { vorname: "Ernst", nachname: "Triggerecht", strasse: "Echtweg 1", verein: "RGZV Echtverein" });
    const trudi = await ausstellerVon(tm.meldungId);
    const ernst = await ausstellerVon(em.meldungId);
    // Am Programm vorbei: Die Datenbank lehnt jede Mischung ab.
    await expect(m.db.update(m.schema.meldung).set({ ausstellerId: trudi.id }).where(m.eq(m.schema.meldung.id, em.meldungId)).execute()).rejects.toThrow();
    await expect(m.db.update(m.schema.aussteller).set({ testSchauId: testS.id }).where(m.eq(m.schema.aussteller.id, ernst.id)).execute()).rejects.toThrow();
    await expect(m.db.update(m.schema.aussteller).set({ testSchauId: null }).where(m.eq(m.schema.aussteller.id, trudi.id)).execute()).rejects.toThrow();
    await expect(m.db.update(m.schema.schau).set({ test: false }).where(m.eq(m.schema.schau.id, testS.id)).execute()).rejects.toThrow();
    expect((await ausstellerVon(em.meldungId)).id).toBe(ernst.id);

    // Adressvorschläge: in der Testschau nur ihre eigenen, in echten Schauen nur echte.
    const imTest = JSON.stringify(await al().meldung.adressVorschlaege({ schauId: testS.id }));
    const imEcht = JSON.stringify(await al().meldung.adressVorschlaege({ schauId: echt.id }));
    expect(imTest).toContain("Übungsverein Trudi");
    expect(imTest).not.toContain("RGZV Echtverein");
    expect(imEcht).toContain("RGZV Echtverein");
    expect(imEcht).not.toContain("Übungsverein Trudi");

    // Vorlage: eine Testschau nur für eine weitere Testschau.
    await expect(al().schau.anlegen({ name: "Echt aus Test", ort: "Halle", vorlageId: testS.id })).rejects.toThrow("Vorlage");
    const kopie = await al().schau.anlegen({ name: "Test aus Test", ort: "Halle", vorlageId: testS.id, test: true });
    expect((await al().schau.get({ id: kopie.id })).test).toBe(true);

    // Vorschau vor dem Kennzeichnen; ändert sich die Zahl inzwischen, wird nichts geändert.
    const uebung = await al().schau.anlegen({ name: "Übung Vorschau", ort: "Halle" });
    await melde(uebung.id, { vorname: "Vroni", nachname: "Vorschaudemo" });
    expect(await al().schau.testschauVorschau({ id: uebung.id })).toEqual({ werden: ["Vroni Vorschaudemo"], kopien: [], hindernisse: [] });
    await melde(uebung.id, { vorname: "Nora", nachname: "Nachzueglerin" });
    await expect(al().schau.alsTestschau({ id: uebung.id, name: "Übung Vorschau", anzahl: 1 })).rejects.toThrow("Vorschau");
    expect((await al().schau.get({ id: uebung.id })).test).toBe(false);
    const gemischt = await al().schau.anlegen({ name: "Übung Vorschau echt", ort: "Halle" });
    await melde(gemischt.id, { id: ernst.id, vorname: "Ernst", nachname: "Triggerecht", strasse: "Echtweg 1", verein: "RGZV Echtverein" });
    expect((await al().schau.testschauVorschau({ id: gemischt.id })).kopien).toEqual(["Ernst Triggerecht"]);

    // Das Skript für Testdaten kennzeichnet seine Schau zuerst als Testschau.
    const skript = await al().schau.anlegen({ name: "Skript Testdaten", ort: "Halle" });
    const { fuellen } = await import("../testschau");
    await fuellen((await al().schau.get({ id: skript.id })).slug, 20, { leise: true }).catch(() => {});
    expect((await al().schau.get({ id: skript.id })).test).toBe(true);
  });

  test("Testschau mit Demodaten: beim Anlegen gefüllt, neu einspielen ersetzt alles, jedes Mal dieselben", async () => {
    await expect(al().schau.anlegen({ name: "Echt mit Demo", ort: "Halle", demodaten: true })).rejects.toThrow("nur für eine Testschau");
    const r = await al().schau.anlegen({ name: "Demo Testschau", ort: "Halle", test: true, demodaten: true });
    if (!r.demodaten?.ok) throw new Error(`Demodaten: ${r.demodaten && !r.demodaten.ok ? r.demodaten.fehler : "fehlen"}`);
    expect(r.demodaten.meldungen).toBeGreaterThan(10);
    const s = await al().schau.get({ id: r.id });
    expect(s).toMatchObject({ test: true, phase: "einlieferung" });
    const stand = async () => {
      const ml = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, r.id));
      const as = await m.db.select().from(m.schema.aussteller).where(m.inArray(m.schema.aussteller.id, ml.map((x) => x.ausstellerId)));
      return { as, namen: as.map((a) => `${a.vorname} ${a.nachname}`).sort() };
    };
    const vorher = await stand();
    expect(vorher.as.every((a) => a.testSchauId === r.id)).toBe(true);
    // Nicht in der Verwaltung, nicht in der Suche echter Schauen.
    expect((await al().verein.aussteller({ q: "" })).some((x) => vorher.as.some((a) => a.id === x.id))).toBe(false);
    // Von Hand geübt: eine eigene Meldung in der Testschau – beim Neu-Einspielen verschwindet sie samt Aussteller.
    const pos = { farbenschlagId: (await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" }))[0]!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const geuebt = await al().meldung.speichern({ schauId: r.id, aussteller: { ...leer, vorname: "Ulla", nachname: "Uebung", geburtsdatum: null }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    const ulla = await ausstellerVon(geuebt.meldungId);
    expect(ulla.testSchauId).toBe(r.id);
    const echt = await al().schau.anlegen({ name: "Echt neben Demo", ort: "Halle" });
    await expect(al().schau.demodatenNeu({ id: echt.id, name: "Echt neben Demo" })).rejects.toThrow("nur in einer Testschau");
    await expect(al().schau.demodatenNeu({ id: r.id, name: "falsch" })).rejects.toThrow("Namen");
    const n = await al().schau.demodatenNeu({ id: r.id, name: "Demo Testschau" });
    expect(n).toMatchObject({ ok: true, meldungen: r.demodaten.meldungen, tiere: r.demodaten.tiere });
    const nachher = await stand();
    expect(nachher.namen).toEqual(vorher.namen);
    expect(await m.db.select().from(m.schema.aussteller).where(m.inArray(m.schema.aussteller.id, vorher.as.map((a) => a.id)))).toEqual([]);
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, ulla.id))).toEqual([]);
    expect((await al().schau.get({ id: r.id })).phase).toBe("einlieferung");
    // Nur Administratoren.
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await expect(helfer.schau.demodatenNeu({ id: r.id, name: "Demo Testschau" })).rejects.toThrow();

    // Ein Lauf zur Zeit: zwei gleichzeitige Aufträge – einer läuft, der andere bekommt eine Meldung.
    await m.db.update(m.schema.schau).set({ hallenplanFest: { plaetze: [] } as never }).where(m.eq(m.schema.schau.id, r.id));
    const zwei = await Promise.allSettled([al().schau.demodatenNeu({ id: r.id, name: "Demo Testschau" }), al().schau.demodatenNeu({ id: r.id, name: "Demo Testschau" })]);
    expect(zwei.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(String((zwei.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toContain("gerade schon");
    // Neu einspielen hebt einen festgeschriebenen Hallenplan auf (die alten Plätze gibt es nicht mehr).
    expect((await al().schau.get({ id: r.id })).hallenplanFest).toBeNull();
  });

  test("Demodaten aus echter Vorlage: keine echten Preisrichter, Menge begrenzt", async () => {
    const vorlage = await al().schau.anlegen({ name: "Große echte Vorlage", ort: "Messe" });
    await m.db.update(m.schema.schau).set({ kapazitaet: 100_000 }).where(m.eq(m.schema.schau.id, vorlage.id));
    await al().preisrichter.speichern({ schauId: vorlage.id, name: "Echter Richter", anschrift: "Echtweg 1", email: "richter@test.de", telefon: "", istObmann: false });
    const r = await al().schau.anlegen({ name: "Übung aus Vorlage", ort: "Messe", vorlageId: vorlage.id, test: true, demodaten: true });
    if (!r.demodaten?.ok) throw new Error(`Demodaten: ${r.demodaten && !r.demodaten.ok ? r.demodaten.fehler : "fehlen"}`);
    const { DEMO_TIERE_HOECHSTENS } = await import("../testschau");
    expect(r.demodaten.tiere).toBeLessThanOrEqual(DEMO_TIERE_HOECHSTENS + 2);
    const richter = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, r.id));
    expect(richter.some((p) => p.name === "Echter Richter")).toBe(false);
    expect(richter.length).toBeGreaterThan(0);
    // In der Vorlage bleibt er.
    expect((await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, vorlage.id))).map((p) => p.name)).toEqual(["Echter Richter"]);
  });

  test("Testschau löschen: in jeder Phase samt Meldungen und Test-Ausstellern; echte bleiben", async () => {
    const { echt, testS, melde } = await vorbereiten();
    const tm = await melde(testS.id, { vorname: "Lotte", nachname: "Loeschtest" });
    const lotte = await ausstellerVon(tm.meldungId);
    const [org] = await m.db.select({ id: m.schema.schau.organisationId }).from(m.schema.schau).where(m.eq(m.schema.schau.id, testS.id));
    const [mail] = await m.db.insert(m.schema.postausgang).values({ organisationId: org!.id, ausstellerId: lotte.id, an: "lotte@test.de", betreff: "Meldung", text: "…" }).returning();
    const em = await melde(echt.id, { vorname: "Eckart", nachname: "Bleibtecht" });
    const eckart = await ausstellerVon(em.meldungId);
    for (const id of [echt.id, testS.id]) await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
    // Echte Schau: weiterhin nur leer und in der Vorbereitung.
    await expect(al().schau.loeschen({ id: echt.id, name: "Echte Schau TS", grund: "Test" })).rejects.toThrow("Vorbereitung");
    await al().schau.loeschen({ id: testS.id, name: "Übungsschau TS", grund: "Übung vorbei" });
    expect(await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, testS.id))).toEqual([]);
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, lotte.id))).toEqual([]);
    expect(await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.id, mail!.id))).toEqual([]);
    expect((await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, eckart.id))).length).toBe(1);
    const [eintrag] = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Schau gelöscht"))).filter((p) => p.datensatzId === testS.id);
    expect(JSON.stringify(eintrag!.alt)).toContain("Meldung");
  });
});
