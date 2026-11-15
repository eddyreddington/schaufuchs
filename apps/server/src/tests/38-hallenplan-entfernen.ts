/**
 * Leere Plätze im festen Hallenplan entfernen: über das Speichern der Halle (wie jede Änderung im Editor), nur leere
 * Platten und Plätze im festen Plan, Protokoll mit Grund, rückgängig durch erneutes Speichern; „Plan neu setzen“ leert die
 * Liste. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { halleSchluessel, leereEntfernen, plattenStand } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Leeres entfernen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("leere Platte und freien Platz entfernen, Belegtes abgelehnt, rückgängig, gelöst", async () => {
    const { id } = await al().schau.anlegen({ name: "Leeres entfernen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Leer", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    await melden("Bleibt", 4);
    const geht = await melden("Geht", 3);
    const halle = { breite: 800, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const laden = async () => (await helfer().katalog.hallenplan({ schauId: id }))!;
    // Ohne festen Plan: abgelehnt.
    const ohneFest = (await laden()).plan!;
    const leerOhne = { ...halle, entfernt: [{ reihe: 1, art: "platte" as const, x: ohneFest.reihen[0]!.platten[0]!.x, y: ohneFest.reihen[0]!.platten[0]!.y }] };
    await expect(al().katalog.halleSetzen({ schauId: id, halle: leerOhne })).rejects.toThrow(/nur im festen Plan/);

    // Automatisches Festschreiben aus dem Editor: nur mit den Platten, die der Editor zeigt, und nur, solange lose.
    await expect(al().katalog.planFestschreiben({ schauId: id, nurWennLose: true, plattenStand: "anders" })).rejects.toThrow(/inzwischen geändert/);
    await al().katalog.planFestschreiben({ schauId: id, nurWennLose: true, plattenStand: plattenStand(ohneFest) });
    await expect(al().katalog.planFestschreiben({ schauId: id, nurWennLose: true, plattenStand: plattenStand(ohneFest) })).rejects.toThrow(/inzwischen festgeschrieben/);
    await al().meldung.statusSetzen({ id: geht, status: "storniert", grund: "Absage (Test)" });
    let d = await laden();
    const r1 = d.plan!.reihen[0]!;
    // 7 Plätze auf drei Platten: 1–3, 4 + zwei frei (Storno 5, 6), 7 frei (Storno) + zwei frei.
    expect(r1.platten.map((pl) => pl.belegt)).toEqual([3, 1, 0]);
    // Belegte Platte: der Server lehnt ab, auch wenn jemand sie direkt schickt.
    const belegt = { ...halle, entfernt: [{ reihe: 1, art: "platte" as const, x: r1.platten[0]!.x, y: r1.platten[0]!.y }] };
    await expect(al().katalog.halleSetzen({ schauId: id, halle: belegt, basis: halleSchluessel(d.halle) })).rejects.toThrow(/Grundplatte 1 in R1 ist belegt/);
    // Nur die Ausstellungsleitung.
    const e = leereEntfernen(d.halle!, d.plan!, [{ art: "platte", reihe: 1, i: 2 }, { art: "platz", reihe: 1, x: r1.freiePlaetze![0]!.x, y: r1.freiePlaetze![0]!.y }]);
    expect(e).toMatchObject({ platten: 1, plaetze: 1, bleibt: [] });
    await expect(helfer().katalog.halleSetzen({ schauId: id, halle: e.halle })).rejects.toThrow();
    await al().katalog.halleSetzen({ schauId: id, halle: e.halle, basis: halleSchluessel(d.halle), grund: "Leeres entfernt: 1 Grundplatte, 1 freier Platz" });
    d = await laden();
    // Die entfernte Platte bleibt als Platzhalter (Nummern der Platten unverändert), ohne Plätze.
    expect(d.plan!.reihen[0]!.platten.map((pl) => [pl.belegt, !!pl.entfernt])).toEqual([[3, false], [1, false], [0, true]]);
    expect(d.plan!.reihen[0]!.freiePlaetze).toHaveLength(1);
    expect(d.plan!.reihen[0]!.kaefige).toHaveLength(4);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Halle").sort((a, b) => a.id - b.id).at(-1)!;
    expect(prot.grund).toBe("Leeres entfernt: 1 Grundplatte, 1 freier Platz");
    expect(JSON.stringify(prot.neu)).toContain("entfernt");

    // Ein leerer Käfigblock lässt sich wieder entfernen (der Server prüft wegfallende Teile auf Belegung).
    const mitBlock = { ...e.halle, objekte: [{ id: "b1", art: "kaefigblock" as const, typ: "huehner" as const, x: 600, y: 800, drehung: 0 as const }] };
    await al().katalog.halleSetzen({ schauId: id, halle: mitBlock });
    await al().katalog.halleSetzen({ schauId: id, halle: e.halle, grund: "Leeres entfernt: 1 eingesetztes Teil" });
    expect((await laden()).halle!.objekte).toEqual([]);
    // Rückgängig: die Halle von vorher – Platte und Platz sind wieder da.
    await al().katalog.halleSetzen({ schauId: id, halle, basis: halleSchluessel(d.halle), grund: "Rückgängig" });
    expect((await laden()).plan!.reihen[0]!.platten.map((pl) => pl.belegt)).toEqual([3, 1, 0]);
    // Noch einmal entfernen, dann „Plan neu setzen“: die Liste ist leer, die Automatik rechnet wieder.
    await al().katalog.halleSetzen({ schauId: id, halle: e.halle });
    expect((await laden()).halle!.entfernt).toHaveLength(2);
    // Eine neue Schau übernimmt die Halle ohne die entfernten Plätze (sie gehören zum festen Plan dieser Schau).
    const naechste = await al().schau.anlegen({ name: "Nach Leeres entfernen", ort: "Halle" });
    const kopie = (await helfer().katalog.hallenplan({ schauId: naechste.id })).halle!;
    expect(kopie.entfernt).toBeUndefined();
    expect(kopie.breite).toBe(800);
    await al().katalog.planLoesen({ schauId: id, grund: "Plan neu setzen" });
    d = await laden();
    expect(d.halle!.entfernt).toBeUndefined();
    expect(d.plan!.fest).toBeNull();
    const geloest = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Hallenplan neu gesetzt").sort((a, b) => a.id - b.id).at(-1)!;
    expect(JSON.stringify(geloest.alt)).toContain("entfernt");
  });
});
