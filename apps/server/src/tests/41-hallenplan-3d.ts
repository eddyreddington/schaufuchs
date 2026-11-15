/** Hallenplan räumlich: Aufsteller je Schau einstellen, Daten für die 3D-Ansicht ohne Ausstellernamen. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { AUFSTELLER_STANDARD, hallenSzene } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan 3D", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Aufstellerhöhe: Vorgabe, nur Administratoren, protokolliert, neue Schau übernimmt; Szene ohne Ausstellernamen", async () => {
    const { id } = await al().schau.anlegen({ name: "3D Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Raum", nachname: "Verborgenname", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 4 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "quer" as const, wandreihen: true, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });

    // Vorgabe, solange nichts eingestellt ist.
    expect((await helfer().katalog.kaefigbedarf({ schauId: id })).aufsteller).toEqual(AUFSTELLER_STANDARD);
    await expect(helfer().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 60 } })).rejects.toThrow("Administratoren");
    await expect(al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: -5 } })).rejects.toThrow();
    await al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 65 } });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).aufsteller).toEqual({ hoehe: 65 });
    const log = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id));
    expect(log.filter((x) => x.aktion === "Aufsteller").map((x) => [x.alt, x.neu])).toEqual([[null, { hoehe: 65 }]]);
    // Gleicher Wert: kein zweiter Eintrag.
    await al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 65 } });
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Aufsteller")).toHaveLength(1);

    // Hallenplan liefert Aufsteller und Farbenschläge; die Szene trägt keine Ausstellernamen.
    await al().katalog.nummernVergeben({ schauId: id });
    const p = await helfer().katalog.hallenplan({ schauId: id });
    expect(p.aufsteller).toEqual({ hoehe: 65 });
    expect(p.farben.length).toBe(4);
    const szene = hallenSzene(p.halle!, p.plan!, p.masse, p.aufsteller, new Map(p.farben));
    expect(szene.kaefige.filter((k) => k.tier)).toHaveLength(4);
    expect(szene.kaefige.every((k) => k.q.y === 65)).toBe(true);
    const text = JSON.stringify({ p, szene });
    expect(text).not.toContain("Verborgenname");

    // Keine Banner mehr an den Wänden (Rückmeldung): der Hallenplan liefert dafür nichts.
    expect("banner" in p).toBe(false);

    // Neue Schau übernimmt die Aufsteller der letzten; null = wieder Vorgabe.
    const neu = await al().schau.anlegen({ name: "3D Schau 2", ort: "Halle" });
    expect((await al().katalog.kaefigbedarf({ schauId: neu.id })).aufsteller).toEqual({ hoehe: 65 });
    await al().katalog.aufstellerSetzen({ schauId: neu.id, aufsteller: null });
    expect((await al().katalog.kaefigbedarf({ schauId: neu.id })).aufsteller).toEqual(AUFSTELLER_STANDARD);
  });

  test("Sockelverkleidung: an/aus und Farbe, Bild wie Katalogbilder geprüft, nur Administratoren, protokolliert, nicht im Katalog", async () => {
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { id } = await al().schau.anlegen({ name: "Sockel Schau", ort: "Halle" });
    await al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 70, verkleidung: { an: true, farbe: "#224433" } } });
    await expect(al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 70, verkleidung: { an: true, farbe: "grün" } } })).rejects.toThrow();
    // Bild: nur Administratoren, nur PNG/JPEG.
    await expect(helfer().katalog.sockelBildSetzen({ schauId: id, name: "plane.png", base64: PNG })).rejects.toThrow("Administratoren");
    await expect(al().katalog.sockelBildSetzen({ schauId: id, name: "x.svg", base64: Buffer.from("<svg onload=alert(1)>").toString("base64") })).rejects.toThrow("JPEG oder PNG");
    const b1 = await al().katalog.sockelBildSetzen({ schauId: id, name: "plane.png", base64: PNG });
    const b2 = await al().katalog.sockelBildSetzen({ schauId: id, name: "plane2.png", base64: PNG });
    let a = (await helfer().katalog.hallenplan({ schauId: id })).aufsteller;
    expect(a).toEqual({ hoehe: 70, verkleidung: { an: true, farbe: "#224433", bildId: b2.id } });
    // Das alte Bild ist weg, das neue nicht in der Bildliste des Katalogs.
    const bilder = await m.db.select().from(m.schema.bild).where(m.eq(m.schema.bild.schauId, id));
    expect(bilder.map((x) => [x.id, x.rolle])).toEqual([[b2.id, "sockel"]]);
    expect(b1.id).not.toBe(b2.id);
    expect((await al().katalogGestaltung.laden({ schauId: id })).bilder).toEqual([]);
    // Farbe ändern behält das Bild.
    await al().katalog.aufstellerSetzen({ schauId: id, aufsteller: { hoehe: 75, verkleidung: { an: false, farbe: "#224433" } } });
    a = (await helfer().katalog.hallenplan({ schauId: id })).aufsteller;
    expect(a).toEqual({ hoehe: 75, verkleidung: { an: false, farbe: "#224433", bildId: b2.id } });
    const log = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Sockelbild");
    expect(log).toHaveLength(2);

    // Neue Schau mit Vorlage: Bild mitkopiert, Verweis auf die Kopie; ohne Vorlage: ohne Bild.
    const mitVorlage = await al().schau.anlegen({ name: "Sockel Kopie", ort: "Halle", vorlageId: id });
    const kopie = (await al().katalog.kaefigbedarf({ schauId: mitVorlage.id })).aufsteller;
    const kopieBild = (await m.db.select().from(m.schema.bild).where(m.eq(m.schema.bild.schauId, mitVorlage.id)))[0]!;
    expect(kopie.verkleidung).toEqual({ an: false, farbe: "#224433", bildId: kopieBild.id });
    const ohne = await al().schau.anlegen({ name: "Sockel ohne Vorlage", ort: "Halle" });
    expect((await al().katalog.kaefigbedarf({ schauId: ohne.id })).aufsteller.verkleidung?.bildId ?? null).toBeNull();

    // Bild entfernen: Verkleidung bleibt, ohne Bild.
    await al().katalog.sockelBildEntfernen({ schauId: id });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).aufsteller).toEqual({ hoehe: 75, verkleidung: { an: false, farbe: "#224433", bildId: null } });
    expect(await m.db.select().from(m.schema.bild).where(m.eq(m.schema.bild.schauId, id))).toEqual([]);
  });
});
