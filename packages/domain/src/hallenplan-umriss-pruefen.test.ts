import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, type Halle } from "./hallenplan";
import { grundrissUebernehmen, pruefeHallenUmriss } from "./hallenplan-umriss-pruefen";
import { rechteckUmriss, wandZiehen } from "./hallenplan-umriss";

const L = [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }];
const halle: Halle = { ...HALLE_STANDARD, breite: 2000, laenge: 3000, umriss: L, flaechen: [], objekte: [] };

describe("Grundriss beim Speichern prüfen", () => {
  test("gültig; ohne Grundriss oder als Rechteck nichts zu prüfen", () => {
    expect(pruefeHallenUmriss(halle, null)).toBeNull();
    expect(pruefeHallenUmriss({ ...halle, umriss: undefined }, null)).toBeNull();
  });
  test("Breite und Länge passen zum Grundriss; Grundriss selbst gültig", () => {
    expect(pruefeHallenUmriss({ ...halle, breite: 2100 }, null)).toMatch(/Breite und Länge/);
    expect(pruefeHallenUmriss({ ...halle, umriss: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }] }, null)).toMatch(/rechtwinklig/);
  });
  test("keine Fläche und kein Teil außerhalb", () => {
    expect(pruefeHallenUmriss({ ...halle, flaechen: [{ name: "Bühne", art: "sperre", x: 1300, y: 100, breite: 400, tiefe: 300 }] }, null)).toMatch(/„Bühne“ liegt außerhalb/);
    // Ein Eingang an der Innenwand der Aussparung ist erlaubt (liegt in der Halle, an der Wand).
    expect(pruefeHallenUmriss({ ...halle, flaechen: [{ name: "E1", art: "eingang", x: 1400, y: 1000, breite: 200, tiefe: 50 }] }, null)).toBeNull();
    expect(pruefeHallenUmriss({ ...halle, objekte: [{ id: "t1", art: "tisch", x: 1500, y: 200, drehung: 0 }] }, null)).toMatch(/außerhalb/);
  });

  test("Grundriss übernehmen: Breite und Länge danach, Flächen und Teile wandern mit, wenn sich der Nullpunkt verschiebt", () => {
    const h: Halle = { ...HALLE_STANDARD, breite: 2000, laenge: 3000, flaechen: [{ name: "E1", art: "eingang", x: 0, y: 1000, breite: 50, tiefe: 200 }], objekte: [{ id: "t1", art: "tisch", x: 500, y: 500, drehung: 0 }] };
    // Linke Wand 2 m nach außen: alles rückt 2 m nach rechts, die Halle wird 22 m breit.
    const n = grundrissUebernehmen(h, wandZiehen(rechteckUmriss(2000, 3000), 3, -200));
    expect(n).toMatchObject({ breite: 2200, laenge: 3000 });
    expect(n.umriss).toBeUndefined();
    expect(n.flaechen[0]).toMatchObject({ x: 200, y: 1000 });
    expect(n.objekte![0]).toMatchObject({ x: 700, y: 500 });
    // L-Form: Grundriss gespeichert, nichts verschoben.
    const l = grundrissUebernehmen(h, L);
    expect(l.umriss).toEqual(L);
    expect(l.flaechen[0]).toMatchObject({ x: 0, y: 1000 });
  });

  test("Beim Speichern nur ablehnen, was neu hinausragt – mit Namen", () => {
    const tisch = { id: "t1", art: "tisch" as const, x: 1500, y: 200, drehung: 0 as const };
    const vorher: Halle = { ...halle, objekte: [tisch] };
    // Stand vorher schon draußen (z. B. nach einer größeren Grundplatte): eine andere Änderung bleibt möglich.
    expect(pruefeHallenUmriss({ ...vorher, gang: 200 }, null, vorher)).toBeNull();
    // Neu hinaus: mit Namen.
    expect(pruefeHallenUmriss({ ...halle, objekte: [tisch] }, null, halle)).toMatch(/Tisch/);
  });
});
