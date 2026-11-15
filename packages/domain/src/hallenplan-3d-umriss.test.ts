import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, type Halle } from "./hallenplan";
import { hallenSzene, TUER_HOEHE, WAND_DURCHSICHTIG, WAND_HOEHE, wandDeckkraft, wandInnenseiten, wandSeiten } from "./hallenplan-3d";

// L-Form 30 × 20 m (breiter als lang: die Szene liegt wie der Plan), oben rechts fehlt 10 × 8 m; ein Eingang an der
// Innenwand der Aussparung.
const L = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 800 }, { x: 3000, y: 800 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }];
const halle: Halle = { ...HALLE_STANDARD, breite: 3000, laenge: 2000, umriss: L, flaechen: [{ name: "E1", art: "eingang", x: 2200, y: 800, breite: 200, tiefe: 50 }] };

describe("3D mit freiem Grundriss", () => {
  const s = hallenSzene(halle, planeHalle(halle, [], null), null);
  test("Wände laufen entlang des Grundrisses, auch an der Aussparung", () => {
    // Die Innenwand der Aussparung (z = 8 m, x 20–30 m) steht außen an der Kante, nach „oben“ (z0).
    const innen = s.waende.filter((w) => w.seite === "z0" && w.z + w.t === 800);
    expect(innen.length).toBeGreaterThan(0);
    expect(innen.every((w) => w.x >= 2000 - 25 && w.x + w.b <= 3000 + 25)).toBe(true);
    // Keine Wand mitten in der Aussparung an der Stelle der früheren Rechteckwand (z = 0 bei x 21–30 m).
    expect(s.waende.some((w) => w.z + w.t <= 0.5 && w.x >= 2100)).toBe(false);
  });
  test("Tür in der Innenwand: Öffnung mit Sturz darüber", () => {
    expect(s.tueren).toHaveLength(1);
    expect(s.tueren[0]!.q).toMatchObject({ x: 2200, b: 200, y: 0, h: TUER_HOEHE });
    expect(s.waende.some((w) => w.x === 2200 && w.b === 200 && w.y === TUER_HOEHE && w.h === WAND_HOEHE - TUER_HOEHE)).toBe(true);
  });
  test("Seite der Wand für Durchsicht und Innenseite – auch abseits des Hallenrands", () => {
    const w = s.waende.find((x) => x.seite === "z0" && x.z + x.t === 800 && x.y === 0)!;
    expect(wandSeiten(w, s)).toEqual(["z0"]);
    // Kamera in der Aussparung (außerhalb der Halle, vor dieser Wand): die Wand wird durchsichtig; von innen bleibt sie.
    expect(wandDeckkraft(w, s, { x: 2600, y: 150, z: 200 }, { x: 1500, y: 0, z: 1000 })).toBeCloseTo(WAND_DURCHSICHTIG, 2);
    expect(wandDeckkraft(w, s, { x: 2600, y: 150, z: 1500 }, { x: 1500, y: 0, z: 1000 })).toBe(1);
    expect(wandInnenseiten(s).some((x) => x.seite === "z0" && x.wand === s.waende.indexOf(w))).toBe(true);
  });

  test("Gedrehte Szene (Halle länger als breit): jede Wand behält ihre Seite, gedreht mit", () => {
    const hoch: Halle = { ...HALLE_STANDARD, breite: 2000, laenge: 3000, umriss: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }], flaechen: [] };
    const g = hallenSzene(hoch, planeHalle(hoch, [], null), null);
    expect(g.breite).toBe(3000);
    expect(g.waende.every((w) => w.seite)).toBe(true);
    // Die Innenwand der Aussparung (im Plan y = 10 m, außen „oben“) liegt gedreht bei x = 10 m und zeigt nach x0.
    expect(g.waende.some((w) => w.seite === "x0" && w.x + w.b === 1000)).toBe(true);
  });

  test("Innere Ecke ohne Lücke: die Wände decken auch das Quadrat in der Ecke", () => {
    // Innere Ecke des L bei x = 20 m, z = 8 m: das Feld knapp außen davor (in der Aussparung) muss Wand sein.
    const ecke = { x: 2000 + 5, z: 800 - 5 };
    expect(s.waende.some((w) => w.y === 0 && ecke.x > w.x && ecke.x < w.x + w.b && ecke.z > w.z && ecke.z < w.z + w.t)).toBe(true);
  });
});
