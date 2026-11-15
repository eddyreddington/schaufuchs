/** Hallenplan: Halle anlegen, Käfige in Katalogfolge auf die Reihen, Preisrichter-Bereiche. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Hallenplan", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Halle nur durch Administratoren; Plan in Nummernfolge mit Preisrichter, ohne Namen; Bruteier ohne Käfig; neue Schau übernimmt die Halle", async () => {
    const { id } = await al().schau.anlegen({ name: "Hallen Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = (art: "einzeltier" | "bruteier", geschlecht: string) => ({ farbenschlagId: wy!.id, freitext: "", art, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Hallen", nachname: "Geheimname", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [pos("einzeltier", "1,0"), pos("einzeltier", "0,1"), pos("einzeltier", "0,1"), pos("bruteier", "0,6")],
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });

    // Noch keine Halle: nur die Vorgaben.
    const leer = await helfer().katalog.hallenplan({ schauId: id });
    expect(leer).toMatchObject({ halle: null, plan: null, anzahl: 3, ohneNummer: 3 });
    expect(leer.vorgabe.gang).toBe(150);

    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: true, quergang: true, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [{ name: "Eingang", art: "eingang" as const, x: 0, y: 900, breite: 100, tiefe: 200 }] };
    await expect(helfer().katalog.halleSetzen({ schauId: id, halle })).rejects.toThrow("Administratoren");
    await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, gang: 10 } })).rejects.toThrow();
    await al().katalog.halleSetzen({ schauId: id, halle });

    await al().katalog.nummernVergeben({ schauId: id });
    const [richter] = await Promise.all([al().preisrichter.speichern({ schauId: id, name: "Hallen Richter", anschrift: "", email: "", telefon: "", istObmann: false })]);
    const liste = (await al().katalog.liste({ schauId: id })).filter((e) => e.art === "einzeltier").sort((a, b) => a.katalogNr! - b.katalogNr!);
    const erste = liste[0]!.katalogNr!;
    await m.db.insert(m.schema.prEinteilung).values({ schauId: id, preisrichterId: (richter as { id: number }).id, vonNr: erste, bisNr: erste + 1 });

    const p = await helfer().katalog.hallenplan({ schauId: id });
    expect(p.ohneNummer).toBe(0);
    // Gang nur vor dem Eingang (so breit wie er), seitlich daneben nicht.
    expect(p.plan!.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
    const kaefige = p.plan!.reihen.flatMap((x) => x.kaefige);
    expect(kaefige.map((k) => k.nr)).toEqual(liste.map((e) => String(e.katalogNr)));
    expect(kaefige.map((k) => k.preisrichterId)).toEqual([(richter as { id: number }).id, (richter as { id: number }).id, null]);
    expect(p.richter.map((x) => x.name)).toContain("Hallen Richter");
    expect(JSON.stringify(p)).not.toContain("Geheimname");
    // Klick auf einen Käfig: Züchter, Tier und Preisrichter (nur für Benutzer, nicht im Plan selbst).
    const info = await helfer().katalog.kaefigInfo({ schauId: id, id: liste[0]!.id });
    expect(info).toMatchObject({ nr: String(liste[0]!.katalogNr), geschlecht: "1,0", preisrichter: "Hallen Richter", zuechter: { name: "Geheimname, Hallen" }, bewertung: null });
    expect(info.tier).toContain("Wyandotten");
    const { id: fremd } = await al().schau.anlegen({ name: "Hallen Fremd", ort: "Halle" });
    await expect(helfer().katalog.kaefigInfo({ schauId: fremd, id: liste[0]!.id })).rejects.toThrow("nicht gefunden");

    // Käfigwahl zählt physisch: das dritte Tier im Großkäfig (100 cm breit). Gestellt wird streng in Katalogfolge – keine
    // Großkäfig-Wand, kein Quergang (auch wenn die Halle ihn noch eingeschaltet hat): erst die Hühner, dann der Großkäfig auf
    // seiner eigenen Platte direkt dahinter. Der Rest der 70 cm tiefen Hühnerplatte trägt den 1 m tiefen Käfig nicht.
    await helfer().halle.kaefigSetzen({ schauId: id, id: liste[2]!.id, typ: "grosskaefig" });
    const q = await helfer().katalog.hallenplan({ schauId: id });
    expect(q.plan!.reihen[0]!.kaefige.map((k) => [k.id, k.typ, k.y])).toEqual([
      [liste[0]!.id, "huehner", 150],
      [liste[1]!.id, "huehner", 220],
      [liste[2]!.id, "grosskaefig", 360],
    ]);
    expect(q.plan!.reihen[0]!.platten.map((pl) => `${pl.typ}:${pl.belegt}/${pl.plaetze}@${pl.laenge}`)).toEqual(["huehner:2/3@210", "grosskaefig:1/2@200"]);

    // Startreihen je Sparte (ältere Hallen) bleiben gespeichert, wirken aber nicht mehr: der Plan bleibt gleich.
    const sparte = liste[0]!.sparte!;
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, spartenStart: [{ sparte, reihe: 3 }] } });
    const mitSparte = await helfer().katalog.hallenplan({ schauId: id });
    expect(mitSparte.plan!.reihen.map((r) => r.kaefige.map((k) => k.id))).toEqual(q.plan!.reihen.map((r) => r.kaefige.map((k) => k.id)));

    // Eingesetzte Voliere und verschobene Reihe kommen über das Speichern in den Plan.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte: [{ id: "v1", art: "voliere", x: 400, y: 1000, drehung: 90 }], reihenVersatz: [{ nr: 1, dx: 20, dy: 0 }] } });
    const mitTeilen = await helfer().katalog.hallenplan({ schauId: id });
    expect(mitTeilen.plan!.objekte).toMatchObject([{ id: "v1", name: "Voliere 1", tier: null }]);
    expect(mitTeilen.plan!.reihen[0]!.versatz).toEqual({ dx: 20, dy: 0 });
    await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte: [{ id: "x", art: "voliere", x: 0, y: 0, drehung: 45 as never }] } })).rejects.toThrow();
    await al().katalog.halleSetzen({ schauId: id, halle });

    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Halle");
    expect(prot).toHaveLength(4);
    // Protokoll nur mit den geänderten Teilen (z. B. nur spartenStart), unverändertes Speichern ohne neue Zeile.
    const sparteZeile = prot.find((x) => JSON.stringify(x.neu).includes("spartenStart") && !JSON.stringify(x.neu).includes("objekte"))!;
    expect(Object.keys(sparteZeile.neu as object)).toEqual(["spartenStart"]);
    await al().katalog.halleSetzen({ schauId: id, halle });
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Halle")).toHaveLength(4);
    // Gleichzeitige Änderung: Speichern auf altem Stand wird abgelehnt, auf aktuellem Stand angenommen.
    const { halleSchluessel } = await import("@schau/domain");
    const aktuell = (await al().schau.get({ id })).halle!;
    await expect(al().katalog.halleSetzen({ schauId: id, basis: "veraltet-1", halle: { ...halle, gang: 160 } })).rejects.toThrow("inzwischen");
    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(aktuell), halle: { ...halle, gang: 160 } });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const { id: folge } = await al().schau.anlegen({ name: "Hallen Schau Folgejahr", ort: "Halle" });
    expect((await al().schau.get({ id: folge })).halle).toEqual({ ...halle, plattenMass: {}, plattenVersatz: [] });
  });

  test("leer ohne Meldungen; füllt sich mit den gemeldeten Tieren (offen und bestätigt), nicht mit abgelehnten", async () => {
    const { id } = await al().schau.anlegen({ name: "Hallen Gemeldet", ort: "Halle" });
    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: true, quergang: true, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const leer = await helfer().katalog.hallenplan({ schauId: id });
    expect(leer.anzahl).toBe(0);
    expect(leer.plan!.reihen.every((r) => r.kaefige.length === 0)).toBe(true);
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = (nachname: string) =>
      al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Hallen", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    await melden("Offen");
    const abgelehnt = await melden("Abgelehnt");
    await al().meldung.statusSetzen({ id: abgelehnt.meldungId, status: "abgelehnt", grund: "Test" });
    const p = await helfer().katalog.hallenplan({ schauId: id });
    expect(p.anzahl).toBe(1);
    expect(p.plan!.reihen.flatMap((r) => r.kaefige)).toHaveLength(1);
    // Bestätigt und bei der Einlieferung als fehlend gemeldet: der Käfig bleibt im Plan.
    const t = (await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Hallen", nachname: "Fehlt", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "0,1", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    })).meldungId;
    await al().meldung.statusSetzen({ id: t, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const tier = (await helfer().halle.suche({ schauId: id, q: "Fehlt" }))[0]!.tiere[0]!;
    await helfer().halle.statusSetzen({ schauId: id, ids: [tier.id], status: "fehlt" });
    expect((await helfer().katalog.hallenplan({ schauId: id })).anzahl).toBe(2);
  });

  test("Grundplatten auf der Käfig-Seite: Maß und Käfige je Platte, mit Protokoll; Platten einzeln verschieben", async () => {
    const { id } = await al().schau.anlegen({ name: "Hallen Platten", ort: "Halle" });
    // Ohne Halle: Vorgabe, Speichern legt die Halle an.
    expect((await al().katalog.kaefigbedarf({ schauId: id })).platte).toEqual({ laenge: 210, tiefe: 70 });
    await al().katalog.plattenSetzen({ schauId: id, platte: { laenge: 240, tiefe: 80 }, jePlatte: { tauben: 6 } });
    const s = await al().schau.get({ id });
    expect(s.halle!.platte).toEqual({ laenge: 240, tiefe: 80 });
    expect(s.halle!.jePlatte).toEqual({ tauben: 6 });
    const b = await al().katalog.kaefigbedarf({ schauId: id });
    expect([b.platte, b.jePlatte]).toEqual([{ laenge: 240, tiefe: 80 }, { tauben: 6 }]);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Grundplatten");
    expect(prot).toHaveLength(1);
    expect(prot[0]!.alt).toMatchObject({ platte: { laenge: 210, tiefe: 70 } });
    // Unverändert speichern: keine neue Zeile; nur Administratoren.
    await al().katalog.plattenSetzen({ schauId: id, platte: { laenge: 240, tiefe: 80 }, jePlatte: { tauben: 6 } });
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Grundplatten")).toHaveLength(1);
    await expect(helfer().katalog.plattenSetzen({ schauId: id, platte: { laenge: 200, tiefe: 70 }, jePlatte: {} })).rejects.toThrow();
    // Plattenmaß je Käfigart: gespeichert, geliefert, im Protokoll; eine Halle ohne diese Angabe gespeichert behält es.
    await al().katalog.plattenSetzen({ schauId: id, platte: { laenge: 240, tiefe: 80 }, jePlatte: { tauben: 6 }, plattenMass: { tauben: { laenge: 240, tiefe: 40 } } });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).plattenMass).toEqual({ tauben: { laenge: 240, tiefe: 40 } });
    const prot2 = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Grundplatten").sort((x, y) => x.id - y.id);
    expect(prot2).toHaveLength(2);
    expect(prot2.at(-1)!.neu).toMatchObject({ plattenMass: { tauben: { laenge: 240, tiefe: 40 } } });
    const { plattenMass: _pm, ...ohneMass } = (await al().schau.get({ id })).halle!;
    await al().katalog.halleSetzen({ schauId: id, halle: { ...ohneMass, gang: 160 } });
    expect((await al().schau.get({ id })).halle!.plattenMass).toEqual({ tauben: { laenge: 240, tiefe: 40 } });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...ohneMass, gang: 150 } });
    // Halbe Angabe (nur Länge) wird abgelehnt.
    await expect(al().katalog.plattenSetzen({ schauId: id, platte: { laenge: 240, tiefe: 80 }, jePlatte: {}, plattenMass: { tauben: { laenge: 240 } as { laenge: number; tiefe: number } } })).rejects.toThrow();
    // Platten einzeln verschieben: die Halle nimmt plattenVersatz auf und gibt ihn zurück.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...s.halle!, plattenVersatz: [{ reihe: 1, platte: 0, dx: 50, dy: 0 }] } });
    expect((await al().schau.get({ id })).halle!.plattenVersatz).toEqual([{ reihe: 1, platte: 0, dx: 50, dy: 0 }]);
    // Eine neue Schau übernimmt die Halle, aber keine verschobenen Platten (die hängen an Tieren dieser Schau).
    const { id: neu } = await al().schau.anlegen({ name: "Hallen Platten Folge", ort: "Halle" });
    expect((await al().schau.get({ id: neu })).halle!.plattenVersatz).toEqual([]);
    // „Plan neu setzen“ (Plan lösen) verwirft verschobene Platten – neu gerechnet stünden andere Tiere darauf.
    await al().katalog.planFestschreiben({ schauId: id });
    await al().katalog.planLoesen({ schauId: id, grund: "Plan neu setzen" });
    expect((await al().schau.get({ id })).halle!.plattenVersatz).toEqual([]);
    // Ohne Halle keine Grundplatten (sonst entstünde unbemerkt eine Vorgabe-Halle).
    await m.db.update(m.schema.schau).set({ halle: null }).where(m.eq(m.schema.schau.id, neu));
    expect((await al().katalog.kaefigbedarf({ schauId: neu })).hatHalle).toBe(false);
    await expect(al().katalog.plattenSetzen({ schauId: neu, platte: { laenge: 200, tiefe: 70 }, jePlatte: {} })).rejects.toThrow("Halle anlegen");
    expect((await al().schau.get({ id: neu })).halle).toBeNull();
  });
});
