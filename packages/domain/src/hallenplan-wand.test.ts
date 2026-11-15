/** Einzelreihe an einer Wand: nur eine Seite, Notausgang frei, übrige Reihen neu, von Hand verschobene bleiben stehen. */
import { describe, expect, test } from "bun:test";
import { eingangsGang, HALLE_STANDARD, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { mitWandreihe, reihenVersatzNachUmbau, wandSeiteVon } from "./hallenplan-wand";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 } };
const tiere: PlanTier[] = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, typ: "huehner", nr: String(i + 1), rasse: "R", preisrichterId: null }));
// Wie die Beispielhalle: 15,5 × 27,5 m, Reihen quer, ohne Einzelreihen, Notausgang an der Wand bei R1 (Reihensystem x = Länge).
const halle: Halle = {
  ...HALLE_STANDARD, breite: 1550, laenge: 2750, richtung: "quer", wandreihen: false, wandBuendig: true, hauptgang: { breite: 250, lage: "ende" },
  flaechen: [{ name: "Notausgang", art: "eingang", x: 0, y: 0, breite: 50, tiefe: 60 }],
};

describe("Hallenplan: Einzelreihe an einer Wand", () => {
  test("nur an einer Wand: dort eine Einzelreihe (Front zur Halle), gegenüber keine; der Notausgang bleibt frei", () => {
    const h = mitWandreihe(halle, "anfang");
    expect(h).toMatchObject({ wandreihen: true, wandreiheSeite: "anfang" });
    const p = planeHalle(h, tiere, masse);
    expect(p.reihen[0]).toMatchObject({ art: "wand", x: 0, front: "rechts" });
    expect(p.reihen.filter((r) => r.art === "wand")).toHaveLength(1);
    // Notausgang (Hallen-x 0–50) mit Gang davor: die Einzelreihe beginnt erst danach.
    expect(p.reihen[0]!.abschnitte[0]!.von).toBeGreaterThanOrEqual(50 + 150);
    expect(p.nichtPlatziert).toHaveLength(0);
    // Die andere Wand dazu: an beiden.
    expect(mitWandreihe(h, "ende")).toMatchObject({ wandreihen: true });
    expect(mitWandreihe(h, "ende").wandreiheSeite).toBeUndefined();
  });

  test("an welcher Wand steht eine Reihe? (Reihen quer: entlang der Länge)", () => {
    expect(wandSeiteVon(halle, { x: 300, y: 5, b: 1000, h: 70 })).toBe("anfang");
    expect(wandSeiteVon(halle, { x: 300, y: 2680, b: 1000, h: 70 })).toBe("ende");
    expect(wandSeiteVon(halle, { x: 300, y: 900, b: 1000, h: 70 })).toBeNull();
  });

  test("von Hand verschobene Reihen bleiben, wo sie stehen; die gezogene fällt weg", () => {
    const vorher = planeHalle({ ...halle, reihenVersatz: [{ nr: 3, dx: 100, dy: 40 }, { nr: 1, dx: 0, dy: -150 }] }, tiere, masse);
    const r3 = vorher.reihen.find((r) => r.nr === 3)!;
    const absolut = r3.x + 40; // Reihen quer: Reihensystem-x = Hallen-y
    const neuHalle = mitWandreihe(halle, "anfang");
    const nachher = planeHalle(neuHalle, tiere, masse);
    const v = reihenVersatzNachUmbau(vorher, nachher, [{ nr: 3, dx: 100, dy: 40 }, { nr: 1, dx: 0, dy: -150 }], 1, halle);
    // R3 war die dritte Seite einer Doppelreihe (Platz 2 ab 0) – nach der neuen Einzelreihe R4, an derselben Stelle.
    const ziel = nachher.reihen.filter((r) => r.art === "doppel")[2]!;
    expect(ziel.nr).toBe(4);
    expect(v).toHaveLength(1);
    expect(v[0]!.nr).toBe(ziel.nr);
    expect(ziel.x + v[0]!.dy).toBeCloseTo(absolut, 6);
    expect(v[0]!.dx).toBe(100);
  });
});

describe("Hallenplan: Reihen bis an die Wand (Beispielhalle)", () => {
  test("Notausgang an der oberen Wand: nur die Reihen davor halten Abstand, alle anderen stehen bündig; unten bleibt ein Quergang", () => {
    const h: Halle = { ...halle, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [{ name: "Notausgang", art: "eingang", x: 0, y: 150, breite: 50, tiefe: 120 }, { name: "E1", art: "eingang", x: 1100, y: 2700, breite: 300, tiefe: 50 }] };
    const p = planeHalle(h, tiere, masse);
    const von = p.reihen.map((r) => r.abschnitte[0]?.von);
    // R1/R2 (Reihensystem-x 181–321) liegen vor dem Notausgang (150–270): Abstand 50 cm Tiefe + 1,5 m Gang.
    expect(von.slice(0, 2)).toEqual([200, 200]);
    expect(von.slice(2).every((v) => v === 0)).toBe(true);
    // Am anderen Ende (unten) ein Gang von 1,5 m.
    expect(p.reihen.every((r) => (r.abschnitte.at(-1)?.bis ?? 0) <= 1550 - 150)).toBe(true);
    expect(p.nichtPlatziert).toHaveLength(0);
  });

  test("Einzelreihe nur an einer Wand über die Einstellung: dort eine Einzelreihe, daneben Doppelreihen", () => {
    const p = planeHalle({ ...halle, wandreihen: true, wandreiheSeite: "anfang" }, tiere, masse);
    expect(p.reihen.map((r) => r.art).slice(0, 3)).toEqual(["wand", "doppel", "doppel"]);
    expect(p.reihen.at(-1)!.art).toBe("doppel");
  });
});

describe("Hallenplan: Gang vor einem Notausgang (Beispielhalle)", () => {
  // Notausgang an der oberen Wand (Hallen-x 0), ein Stück neben der Ecke; Fluchtrichtung in die Halle (+x).
  const notausgang = { name: "Notausgang", art: "eingang" as const, x: 0, y: 100, breite: 50, tiefe: 120 };

  test("der Gang liegt vor dem Ausgang, so breit wie er; seitlich daneben nichts", () => {
    expect(eingangsGang(halle, notausgang)).toEqual({ x: 0, y: 100, b: 50 + 150, h: 120 });
    // An der gegenüberliegenden Wand und an den Stirnwänden entsprechend.
    expect(eingangsGang(halle, { ...notausgang, x: 1500 })).toEqual({ x: 1350, y: 100, b: 200, h: 120 });
    expect(eingangsGang(halle, { ...notausgang, x: 600, y: 0, breite: 200, tiefe: 50 })).toEqual({ x: 600, y: 0, b: 200, h: 200 });
    expect(eingangsGang(halle, { ...notausgang, x: 600, y: 2700, breite: 200, tiefe: 50 })).toEqual({ x: 600, y: 2550, b: 200, h: 200 });
    // In der Ecke zählt die Wand, an der er flach anliegt.
    expect(eingangsGang(halle, { ...notausgang, y: 0, tiefe: 120 })).toEqual({ x: 0, y: 0, b: 200, h: 120 });
    // Mitten in der Halle: rundherum ein Gang.
    expect(eingangsGang(halle, { ...notausgang, x: 600, y: 900 })).toEqual({ x: 450, y: 750, b: 350, h: 420 });
  });

  test("die Einzelreihe neben dem Notausgang geht bis in die Ecke; die Reihe davor hält den Gang frei", () => {
    const h: Halle = { ...halle, wandreihen: true, wandreiheSeite: "anfang", hauptgang: { breite: 0, lage: "keiner" }, flaechen: [notausgang] };
    const p = planeHalle(h, tiere, masse);
    const r1 = p.reihen[0]!;
    expect(r1).toMatchObject({ art: "wand", x: 0 });
    // R1 (Reihensystem-x 0 bis zur Tiefe, Hallen-y) liegt neben dem Ausgang (Hallen-y 100–220), nicht davor.
    expect(r1.x + r1.tiefe).toBeLessThanOrEqual(100);
    expect(r1.abschnitte[0]!.von).toBe(0);
    // Reihen, die vor dem Ausgang liegen, beginnen erst hinter Ausgang und Gang.
    for (const r of p.reihen.filter((x) => x.x < 220 && x.x + x.tiefe > 100)) expect(r.abschnitte[0]!.von).toBeGreaterThanOrEqual(200);
    expect(p.nichtPlatziert).toHaveLength(0);
  });
});
