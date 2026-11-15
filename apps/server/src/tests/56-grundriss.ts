/**
 * Freier Grundriss der Halle (Entscheidung 019): speichern, prüfen (gültig, passt zu Breite/Länge, nichts außerhalb), ein
 * Rechteck als Grundriss gilt als keiner, und die Planung stellt keine Käfige außerhalb. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Freier Grundriss", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const L = [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }];
  const halle = { breite: 2000, laenge: 3000, gang: 150, richtung: "quer" as const, wandreihen: true, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
  let schauId = 0;

  test("L-förmige Halle speichern; ungültige Grundrisse und Teile außerhalb abgelehnt", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Grundrissschau", ort: "Musterdorf" }));
    await m.db.update(m.schema.schau).set({ halle: null }).where(m.eq(m.schema.schau.id, schauId));
    await expect(al().katalog.halleSetzen({ schauId, halle: { ...halle, umriss: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }, { x: 0, y: 500 }] } })).rejects.toThrow("rechtwinklig");
    await expect(al().katalog.halleSetzen({ schauId, halle: { ...halle, breite: 2400, umriss: L } })).rejects.toThrow("Breite und Länge");
    await expect(al().katalog.halleSetzen({ schauId, halle: { ...halle, umriss: L, flaechen: [{ name: "Bühne", art: "sperre", x: 1300, y: 100, breite: 400, tiefe: 300 }] } })).rejects.toThrow("außerhalb");
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, umriss: L } });
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect(s!.halle!.umriss).toEqual(L);
    const p = await al().katalog.hallenplan({ schauId });
    expect(p.halle!.umriss).toEqual(L);
  });

  test("Ein Rechteck als Grundriss wird nicht gespeichert (die Halle bleibt eine gewöhnliche)", async () => {
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, umriss: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }] } });
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect(s!.halle!.umriss).toBeUndefined();
  });

  test("Plan neu setzen mit Grundriss prüft ebenso", async () => {
    await expect(al().katalog.planNeuSetzen({ schauId, grund: "Test", halle: { ...halle, laenge: 2500, umriss: L } })).rejects.toThrow("Breite und Länge");
    await al().katalog.planNeuSetzen({ schauId, grund: "Grundriss L", halle: { ...halle, umriss: L } });
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect(s!.halle!.umriss).toEqual(L);
  });

  test("Neu setzen: eingesetzte Blöcke, die dabei wegfallen, sperren den neuen Grundriss nicht", async () => {
    const block = { id: "b1", art: "kaefigblock" as const, typ: "huehner" as const, auto: true, x: 1400, y: 200, drehung: 0 as const };
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, objekte: [block] } });
    // Die Aussparung deckt den Block; Neu setzen lässt eingesetzte Blöcke ohnehin wegfallen.
    await al().katalog.planNeuSetzen({ schauId, grund: "L mit Block", halle: { ...halle, umriss: L, objekte: [block] } });
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect(s!.halle!.umriss).toEqual(L);
    expect((s!.halle!.objekte ?? []).some((o) => o.id === "b1")).toBe(false);
  });

  test("Fester Plan: ein anderer Grundriss nur über Plan neu setzen; altes Teil draußen sperrt andere Änderungen nicht", async () => {
    await al().katalog.planFestschreiben({ schauId, nurWennLose: true });
    const rechteck = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }];
    await expect(al().katalog.halleSetzen({ schauId, halle: { ...halle, umriss: rechteck } })).rejects.toThrow("neu setzen");
    // Ein Tisch, der schon draußen steht (hier direkt gespeichert), sperrt eine andere Änderung nicht – ein neuer schon.
    const tisch = { id: "t9", art: "tisch" as const, x: 1500, y: 200, drehung: 0 as const };
    const [vorher] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    await m.db.update(m.schema.schau).set({ halle: { ...vorher!.halle!, objekte: [tisch] } }).where(m.eq(m.schema.schau.id, schauId));
    const [mitTisch] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, ...mitTisch!.halle!, gang: 160 } as never });
    await expect(al().katalog.halleSetzen({ schauId, halle: { ...halle, ...mitTisch!.halle!, objekte: [tisch, { ...tisch, id: "t10", x: 1600 }] } as never })).rejects.toThrow("Tisch");
  });
});
