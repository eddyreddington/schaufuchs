/** Käfigbedarf je Käfiggröße und abweichende Größe je Rasse. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Käfigbedarf", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });

  test("je Größe gemeldet, bestätigt und Käfignummern; Regel je Rasse verschiebt Einzeltiere, nicht Stämme", async () => {
    const { id } = await al().schau.anlegen({ name: "Käfig Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = (art: "einzeltier" | "stamm" | "bruteier", geschlecht: string) => ({ farbenschlagId: wy!.id, freitext: "", art, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Käfig", nachname: "Bedarf", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [pos("einzeltier", "1,0"), pos("einzeltier", "0,1"), pos("stamm", "1,2")],
    });
    const rasse = (await al().katalog.kaefigbedarf({ schauId: id })).rassen[0]!;
    expect(rasse).toMatchObject({ anzahl: 2, typ: rasse.auto });
    const auto = rasse.auto;
    expect(auto).toBe("huehner"); // Wyandotten (Sparte Hühner)
    const zahl = async (typ: string) => (await helfer().katalog.kaefigbedarf({ schauId: id })).typen.find((t) => t.typ === typ)!;

    // Offene Meldung: gemeldet, noch nicht bestätigt, keine Nummern.
    expect(await zahl(auto)).toMatchObject({ gemeldet: 2, bestaetigt: 0, nummern: "" });
    expect(await zahl("stamm")).toMatchObject({ gemeldet: 1, bestaetigt: 0 });

    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const nachher = await zahl(auto);
    expect(nachher).toMatchObject({ gemeldet: 2, bestaetigt: 2 });
    expect(nachher.nummern).toMatch(/^\d+(–\d+)?$/);

    // Regel: diese Rasse in den Großkäfig – nur Einzeltiere wechseln, der Stamm bleibt im Stammkäfig.
    await expect(helfer().katalog.kaefigRegelSetzen({ schauId: id, rasse: rasse.rasse, typ: "grosskaefig" })).rejects.toThrow("Administratoren");
    await al().katalog.kaefigRegelSetzen({ schauId: id, rasse: rasse.rasse.toUpperCase(), typ: "grosskaefig" });
    expect((await zahl("grosskaefig")).bestaetigt).toBe(2);
    expect((await zahl("huehner")).bestaetigt).toBe(0);
    expect((await zahl("stamm")).bestaetigt).toBe(1);
    // Einlieferung: je Tier die Größe nach den Regeln; öffentliche Seite kennt die Regeln für die Anzeige im Formular.
    const halle = (await helfer().halle.suche({ schauId: id, q: "Bedarf" }))[0]!;
    expect(halle.tiere.map((t) => `${t.art}:${t.kaefigGroesse}`).sort()).toEqual(["einzeltier:100 × 100 × 100 cm", "einzeltier:100 × 100 × 100 cm", "stamm:Stammkäfig"]);
    const slug = (await al().schau.get({ id })).slug;
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    const oeffentlich = await m.appRouter.createCaller({ ...adminKontext, benutzer: null }).oeffentlich.schau({ slug });
    expect(oeffentlich.kaefigRegeln).toEqual([{ rasse: rasse.rasse.toUpperCase(), typ: "grosskaefig" }]);
    const b = await al().katalog.kaefigbedarf({ schauId: id });
    expect(b.rassen[0]).toMatchObject({ auto, typ: "grosskaefig" });
    expect(b.regeln).toHaveLength(1);
    // Zurück auf automatisch.
    await al().katalog.kaefigRegelSetzen({ schauId: id, rasse: rasse.rasse, typ: null });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).regeln).toEqual([]);
    expect((await zahl(auto)).bestaetigt).toBe(2);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id));
    expect(prot.filter((p) => p.aktion === "Käfigregel")).toHaveLength(2);
  });
});

describe("Katalognummern nach Käfigblöcken", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  test("Blockfolge der Schau bestimmt die Nummern; Einstellung bleibt beim Speichern erhalten und ist nach dem Festschreiben gesperrt", async () => {
    const { id } = await al().schau.anlegen({ name: "Block Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    expect(s.kaefigFolge).toBeNull();
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = (art: "einzeltier" | "stamm", geschlecht: string) => ({ farbenschlagId: wy!.id, freitext: "", art, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Block", nachname: "Folge", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [pos("einzeltier", "1,0"), pos("stamm", "1,2"), pos("einzeltier", "0,1")],
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const nummern = async () => (await al().katalog.liste({ schauId: id })).sort((a, b) => a.katalogNr! - b.katalogNr!).map((e) => `${e.art}:${e.geschlecht}`);
    // Nach Sparten (wie bisher, Stämme nicht vorn): Einzeltiere 1,0 und 0,1 vor dem Stamm derselben Farbe.
    await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), staemmeVorn: false } as never });
    await al().katalog.nummernVergeben({ schauId: id });
    expect(await nummern()).toEqual(["einzeltier:1,0", "einzeltier:0,1", "stamm:1,2"]);
    // Nach Käfigblöcken mit Stammkäfigen vorn: der Stamm bekommt die erste Nummer.
    const mitFolge = { ...(await al().schau.get({ id })), kaefigFolge: ["stamm", "huehner", "grosskaefig", "zwerghuehner", "tauben", "voliere"] as const };
    await al().schau.aktualisieren({ id, daten: { ...mitFolge, kaefigFolge: [...mitFolge.kaefigFolge] } as never });
    await al().katalog.nummernVergeben({ schauId: id });
    expect(await nummern()).toEqual(["stamm:1,2", "einzeltier:1,0", "einzeltier:0,1"]);
    // Doppelte Größe in der Folge wird abgelehnt; Speichern ohne Änderung behält die Folge.
    await expect(al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), kaefigFolge: ["stamm", "stamm"] } as never })).rejects.toThrow("nur einmal");
    await al().schau.aktualisieren({ id, daten: (await al().schau.get({ id })) as never });
    expect((await al().schau.get({ id })).kaefigFolge).toEqual(["stamm", "huehner", "grosskaefig", "zwerghuehner", "tauben", "voliere"]);
    // Nach dem Festschreiben nicht mehr änderbar.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    await expect(al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), kaefigFolge: null } as never })).rejects.toThrow("festgeschrieben");
  });
});

describe("Käfig je Tier wählen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Helfer setzt ein Tier in einen anderen Käfig; zählt im Bedarf und in der Blockfolge, Rasse bleibt, Protokoll, zurück auf automatisch", async () => {
    const { id } = await al().schau.anlegen({ name: "Wahl Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = (art: "einzeltier" | "bruteier", geschlecht: string) => ({ farbenschlagId: wy!.id, freitext: "", art, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Wahl", nachname: "Einzeln", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [pos("einzeltier", "1,0"), pos("einzeltier", "0,1"), pos("bruteier", "0,6")],
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const tiere = (await helfer().halle.suche({ schauId: id, q: "Einzeln" }))[0]!.tiere;
    const [erstes, zweites] = tiere.filter((t) => t.art === "einzeltier");
    const brut = tiere.find((t) => t.art === "bruteier")!;
    expect(erstes!).toMatchObject({ kaefigTyp: "huehner", kaefigAuto: "huehner" });
    const zahl = async (typ: string) => (await al().katalog.kaefigbedarf({ schauId: id })).typen.find((t) => t.typ === typ)!.bestaetigt;

    // Nur noch ein Großkäfig frei: das erste Tier kommt dorthin.
    await helfer().halle.kaefigSetzen({ schauId: id, id: erstes!.id, typ: "grosskaefig" });
    expect(await zahl("grosskaefig")).toBe(1);
    expect(await zahl("huehner")).toBe(1);
    const nachher = (await helfer().halle.suche({ schauId: id, q: "Einzeln" }))[0]!.tiere.find((t) => t.id === erstes!.id)!;
    expect(nachher).toMatchObject({ kaefigTyp: "grosskaefig", kaefigAuto: "huehner", kaefigGroesse: "100 × 100 × 100 cm" });
    const bedarf = await al().katalog.kaefigbedarf({ schauId: id });
    expect(bedarf.einzelwahl).toBe(1);
    // Die Größe der Rasse bleibt automatisch – die Wahl gilt nur für das eine Tier.
    expect(bedarf.rassen[0]).toMatchObject({ typ: "huehner", auto: "huehner", anzahl: 2 });

    // Die Wahl verschiebt keine Katalognummern (sie ist eine Ausnahme in der Halle): auch mit Großkäfigen vorn bleibt
    // das 0,1 mit Großkäfig-Wahl hinter dem 1,0.
    await helfer().halle.kaefigSetzen({ schauId: id, id: zweites!.id, typ: "grosskaefig" });
    await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), kaefigFolge: ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm", "voliere"] } as never });
    await al().katalog.nummernVergeben({ schauId: id });
    const liste = (await al().katalog.liste({ schauId: id })).filter((e) => e.katalogNr != null).sort((a, b) => a.katalogNr! - b.katalogNr!);
    expect(liste.map((e) => e.id).slice(0, 2)).toEqual([erstes!.id, zweites!.id]); // Bruteier dahinter
    await helfer().halle.kaefigSetzen({ schauId: id, id: zweites!.id, typ: null });

    // Bruteier: kein Käfig. Fremde Schau: nicht gefunden.
    await expect(helfer().halle.kaefigSetzen({ schauId: id, id: brut.id, typ: "huehner" })).rejects.toThrow("Bruteier");
    const { id: andere } = await al().schau.anlegen({ name: "Andere Wahl", ort: "Halle" });
    await expect(helfer().halle.kaefigSetzen({ schauId: andere, id: zweites!.id, typ: "huehner" })).rejects.toThrow("nicht gefunden");

    // Zurück auf automatisch; Protokoll hält beide Änderungen fest (gleiche Wahl zweimal = keine Zeile).
    await helfer().halle.kaefigSetzen({ schauId: id, id: erstes!.id, typ: null });
    await helfer().halle.kaefigSetzen({ schauId: id, id: erstes!.id, typ: null });
    expect(await zahl("grosskaefig")).toBe(0);
    expect(await zahl("huehner")).toBe(2);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((p) => p.aktion === "Käfig je Tier" && p.datensatzId === erstes!.id);
    // Ohne „order by“ liefert die Datenbank keine feste Reihenfolge: nach Protokollnummer sortieren.
    expect(prot.sort((a, b) => a.id - b.id).map((p) => `${p.alt}→${p.neu}`)).toEqual(["automatisch→100 × 100 × 100 cm", "100 × 100 × 100 cm→automatisch"]);
  });
});

describe("Käfigmaße", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Maße statt Namen: Richtwert, eigenes Maß nur durch Administratoren, im Bedarf und bei der Einlieferung; neue Schau übernimmt die Maße", async () => {
    const { id } = await al().schau.anlegen({ name: "Maß Schau", ort: "Halle" });
    const label = async (typ: string) => (await al().katalog.kaefigbedarf({ schauId: id })).typen.find((t) => t.typ === typ)!.label;
    // Andere Schauen dieses Laufs haben noch keine Maße: Richtwert.
    expect(await label("huehner")).toBe("70 × 70 × 70 cm");
    expect(await label("stamm")).toBe("Stammkäfig");
    await expect(helfer().katalog.kaefigMassSetzen({ schauId: id, typ: "huehner", mass: { breite: 70, tiefe: 60, hoehe: 70 } })).rejects.toThrow("Administratoren");
    await al().katalog.kaefigMassSetzen({ schauId: id, typ: "huehner", mass: { breite: 70, tiefe: 60, hoehe: 70 } });
    await al().katalog.kaefigMassSetzen({ schauId: id, typ: "stamm", mass: { breite: 120, tiefe: 60, hoehe: 80 } });
    expect(await label("huehner")).toBe("70 × 60 × 70 cm");
    expect(await label("stamm")).toBe("Stammkäfig 120 × 60 × 80 cm");
    await expect(al().katalog.kaefigMassSetzen({ schauId: id, typ: "huehner", mass: { breite: 0, tiefe: 60, hoehe: 70 } })).rejects.toThrow();

    // Einlieferung zeigt das Maß.
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Maß", nachname: "Halle", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    expect((await helfer().halle.suche({ schauId: id, q: "Halle" }))[0]!.tiere[0]!.kaefigGroesse).toBe("70 × 60 × 70 cm");

    // Zurück auf Richtwert; Protokoll; die nächste Schau des Vereins übernimmt die Maße.
    await al().katalog.kaefigMassSetzen({ schauId: id, typ: "stamm", mass: null });
    expect(await label("stamm")).toBe("Stammkäfig");
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((p) => p.aktion === "Käfigmaß");
    expect(prot).toHaveLength(3);
    const { id: naechste } = await al().schau.anlegen({ name: "Maß Schau Folgejahr", ort: "Halle" });
    expect((await al().schau.get({ id: naechste })).kaefigMasse).toEqual({ huehner: { breite: 70, tiefe: 60, hoehe: 70 } });
  });
});

describe("Nachmeldung nach dem Festschreiben mit Käfigblöcken", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("eingeordnet nach dem Block bei der Vergabe – weder Käfigwahl noch später geänderte Rassenregel verschieben die Einordnung", async () => {
    const { id } = await al().schau.anlegen({ name: "Nachmeldung Block", ort: "Halle" });
    const s = await al().schau.get({ id });
    // Zwei Hühnerrassen; welche vorn steht, entscheidet das Verzeichnis.
    const kandidaten: { id: number; rasse: string | null }[] = [];
    for (const q of ["Wyandotten", "Orpington", "Italiener", "Sussex", "Rhodeländer"]) {
      const [f] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q });
      if (f && !kandidaten.some((k) => k.rasse === f.rasse)) kandidaten.push(f);
    }
    expect(kandidaten.length).toBeGreaterThanOrEqual(2);
    const person = (nachname: string) => ({ vorname: "Block", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
    const pos = (f: { id: number }) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const melden = async (nachname: string, f: { id: number }) => {
      const r = await al().meldung.speichern({ schauId: id, aussteller: person(nachname), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(f)] });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), kaefigFolge: ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm", "voliere"] } as never });
    const m1 = await melden("Xaver", kandidaten[0]!);
    const m2 = await melden("Xaver", kandidaten[1]!);
    await al().katalog.nummernVergeben({ schauId: id });
    const liste = async () => await al().katalog.liste({ schauId: id });
    const nr = async (meldungId: number) => (await liste()).filter((e) => e.meldungId === meldungId).map((e) => `${e.katalogNr}${e.suffix}`)[0]!;
    // Vorne steht die Rasse mit Nummer 1 (P), dahinter Q.
    const [p, q] = (await nr(m1)) === "1" ? [kandidaten[0]!, kandidaten[1]!] : [kandidaten[1]!, kandidaten[0]!];
    const qMeldung = (await nr(m1)) === "1" ? m2 : m1;
    expect(await nr(qMeldung)).toBe("2");
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });

    // Nach dem Festschreiben: Q bekommt per Regel den Großkäfig (Block 0), das Q-Tier zusätzlich eine Käfigwahl.
    await al().katalog.kaefigRegelSetzen({ schauId: id, rasse: q.rasse!, typ: "grosskaefig" });
    const qTier = (await liste()).find((e) => e.meldungId === qMeldung)!;
    await helfer().halle.kaefigSetzen({ schauId: id, id: qTier.id, typ: "grosskaefig" });

    // Nachmeldung P von „Yvonne“ gehört hinter Xavers P (Nr. 1), nicht hinter das verschobene Q (Nr. 2).
    const neu = await melden("Yvonne", p);
    const r = await al().katalog.nummernVergeben({ schauId: id });
    expect(await nr(neu)).toBe("1a");
    expect(r.ausserhalbDerFolge).toEqual([]);
  });
});
