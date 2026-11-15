/**
 * Hallenplan: Tische, Bänke und Garnituren als eingesetzte Teile (mit Maßen gespeichert, bleiben beim Neu-Setzen) und
 * Etagen je Käfigart (Kapazität der Grundplatten, unter „Käfige“ gespeichert, beim Speichern der Halle erhalten). Teil des
 * Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { festGeometrie, halleSchluessel, istMoebel, type Halle } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Tische, Bänke und Etagen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Möbel speichern und behalten, Etagen verdoppeln die Plätze je Platte", async () => {
    const { id } = await al().schau.anlegen({ name: "Möbel und Etagen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Etage", nachname: "Zwei", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 20 }, () => ({ farbenschlagId: st!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = {
      breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, reihenVersatz: [], plattenVersatz: [], spartenStart: [],
      flaechen: [{ name: "Cafeteria", art: "sperre" as const, x: 0, y: 1500, breite: 1000, tiefe: 500 }],
      objekte: [
        { id: "g1", art: "garnitur" as const, x: 100, y: 1600, drehung: 0 as const, laenge: 250, tiefe: 60, bankTiefe: 30 },
        { id: "t1", art: "tisch" as const, x: 500, y: 1600, drehung: 90 as const },
      ],
    };
    await al().katalog.halleSetzen({ schauId: id, halle });
    await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte: [{ ...halle.objekte[0]!, laenge: 5 }] } })).rejects.toThrow();
    let d = await helfer().katalog.hallenplan({ schauId: id });
    expect(d.halle!.objekte!.filter(istMoebel)).toEqual(halle.objekte);
    expect(d.plan!.objekte.map((o) => [o.name, o.rechteck.b, o.rechteck.h, o.plaetze])).toEqual([["Garnitur 1", 250, 150, 0], ["Tisch 1", 50, 220, 0]]);
    expect(d.plan!.warnungen).toEqual([]);
    const tauben = () => d.plan!.reihen.flatMap((r) => r.platten).filter((p) => p.typ === "tauben");
    expect(tauben().map((p) => p.plaetze)).toEqual([5, 5, 5, 5]);

    // Etagen unter „Käfige“: nur Administratoren, 1 bis 4, protokolliert; zwei Etagen = zehn Plätze je Platte.
    const b = await al().katalog.kaefigbedarf({ schauId: id });
    expect(b.etagen).toEqual({});
    const platten = { schauId: id, platte: b.platte, jePlatte: b.jePlatte, plattenMass: b.plattenMass };
    await expect(helfer().katalog.plattenSetzen({ ...platten, etagen: { tauben: 2 } })).rejects.toThrow();
    await expect(al().katalog.plattenSetzen({ ...platten, etagen: { tauben: 9 } })).rejects.toThrow();
    const vorher = d.halle!;
    await al().katalog.plattenSetzen({ ...platten, etagen: { tauben: 2, huehner: 1 } });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).etagen).toEqual({ tauben: 2 });
    d = await helfer().katalog.hallenplan({ schauId: id });
    expect(tauben().map((p) => [p.plaetze, p.belegt])).toEqual([[10, 10], [10, 10]]);
    expect(festGeometrie(d.halle as Halle, d.masse)).not.toBe(festGeometrie(vorher as Halle, d.masse));
    const log = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Grundplatten");
    expect(log.map((x) => (x.neu as { etagen: unknown }).etagen)).toEqual([{ tauben: 2 }]);
    // Ohne Angabe (älteres Bundle) bleiben die Etagen beim Speichern der Halle erhalten.
    const { etagen: _e, ...ohne } = d.halle!;
    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(d.halle as Halle), halle: ohne as never });
    expect((await al().katalog.kaefigbedarf({ schauId: id })).etagen).toEqual({ tauben: 2 });

    // Neu setzen: Tische und Garnitur bleiben, die Reihen weichen ihnen aus.
    d = await helfer().katalog.hallenplan({ schauId: id });
    await al().katalog.planNeuSetzen({ schauId: id, basis: halleSchluessel(d.halle as Halle), halle: { ...d.halle!, richtung: "quer" } as never, grund: "Halle: Reihenrichtung" });
    d = await helfer().katalog.hallenplan({ schauId: id });
    expect(d.halle!.objekte!.filter(istMoebel).map((o) => o.id)).toEqual(["g1", "t1"]);
    expect(d.halle!.etagen).toEqual({ tauben: 2 });
    expect(d.plan!.warnungen.filter((w) => /überschneidet|steht im Gang/.test(w))).toEqual([]);

    // Etagen wieder weg: eine Etage, kein Feld mehr in der Halle.
    await al().katalog.plattenSetzen({ ...platten, etagen: {} });
    d = await helfer().katalog.hallenplan({ schauId: id });
    expect(d.halle!.etagen).toBeUndefined();
  });

  test("Entfernen eines freien oberen Platzes: die Etage wird gespeichert", async () => {
    const { id } = await al().schau.anlegen({ name: "Etage entfernen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Etage", nachname: "Drei", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 3 }, () => ({ farbenschlagId: st!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const b = await al().katalog.kaefigbedarf({ schauId: id });
    await al().katalog.plattenSetzen({ schauId: id, platte: b.platte, jePlatte: b.jePlatte, plattenMass: b.plattenMass, etagen: { tauben: 2 } });
    let d = await al().katalog.hallenplan({ schauId: id });
    await al().katalog.planFestschreiben({ schauId: id });
    d = await al().katalog.hallenplan({ schauId: id });
    // Ein oberer Platz, unter dem auch frei ist (Spalte 3: drei Tauben füllen Spalte 1 und unten Spalte 2).
    const alleFrei = d.plan!.reihen[0]!.freiePlaetze!;
    const oben = alleFrei.find((f) => f.etage === 1 && alleFrei.some((u) => !u.etage && u.y === f.y))!;
    const entfernt = [{ reihe: 1, art: "platz" as const, x: oben.x, y: oben.y, etage: 1 }];
    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(d.halle as Halle), halle: { ...d.halle!, entfernt } as never, grund: "Leeres entfernt: 1 freier Platz" });
    d = await al().katalog.hallenplan({ schauId: id });
    expect(d.halle!.entfernt).toEqual(entfernt);
    const frei = d.plan!.reihen[0]!.freiePlaetze!;
    expect(frei.some((f) => f.y === oben.y && f.etage === 1)).toBe(false);
    expect(frei.some((f) => f.y === oben.y && !f.etage)).toBe(true);
  });
});
