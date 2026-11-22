import { expect, test } from "bun:test";
import { HALLE_STANDARD, type HallenObjekt, planeHalle, type Halle } from "@schau/domain";
import { ausrichtHinweis, eingesetztUndAusgerichtet, gedrehtUndAusgerichtet, mitAusrichtung, verschiebenUndAusrichten } from "./hallenplan-ausrichten";
import { type Daten, gedreht } from "./hallenplan-geometrie";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
const leer: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, gang: 150, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
const block = (id: string, x: number, y: number, front: HallenObjekt["front"], drehung: 0 | 90 = 0, typ: "tauben" | "huehner" = "tauben"): HallenObjekt => ({ id, art: "kaefigblock", typ, x, y, drehung, front });
// Zwei Taubenblöcke (200 × 40 cm), beide mit der Front nach unten (z+).
const halle: Halle = { ...leer, objekte: [block("a", 300, 300, "z+"), block("b", 300, 540, "z+")] };
const planVon = (h: Halle) => planeHalle(h, [], masse) as unknown as NonNullable<Daten["plan"]>;
const plan = planVon(halle);
const lage = (h: Halle) => h.objekte!.map((o) => [o.id, o.x, o.y, o.drehung, o.front]);

test("Verschieben: Block mit der Front an die Rückwand eines anderen geschoben – er dreht beim Loslassen, der andere bleibt", () => {
  const r = verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 0, 200, masse);
  expect(r).toMatchObject({ wand: 0, ruecken: 1 });
  expect(lage(r.halle)).toEqual([
    ["a", 300, 500, 0, "z-"],
    ["b", 300, 540, 0, "z+"],
  ]);
  expect(ausrichtHinweis(r)).toBe("Am Nachbarn gedreht: Rückwand an Rückwand (1 Teil).");
});

test("Verschieben: nicht ganz heran (40 cm) oder nur seitlich – nichts dreht, kein Hinweis", () => {
  const r = verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 0, 160, masse);
  expect(r).toMatchObject({ wand: 0, ruecken: 0 });
  expect(ausrichtHinweis(r)).toBeNull();
  expect(lage(verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 100, 0, masse).halle)[0]).toEqual(["a", 400, 300, 0, "z+"]);
});

test("Verschieben an die Wand: wie bisher Rückwand an die Wand – in demselben Schritt", () => {
  const anWand = { ...halle, objekte: [block("a", 300, 300, "z-"), block("b", 300, 540, "z+")] };
  const r = verschiebenUndAusrichten(anWand, planVon(anWand), [{ art: "objekt", id: "a" }], 0, -300, masse);
  expect(r).toMatchObject({ wand: 1, ruecken: 0 });
  expect(lage(r.halle)[0]).toEqual(["a", 300, 0, 0, "z+"]);
  expect(ausrichtHinweis(r)).toBe("An der Wand gedreht: Rückwand zur Wand (1 Teil).");
});

test("Drehen (R): verdeckt die gedrehte Front einen Nachbarn und ist die Gegenseite frei, dreht es weiter; sonst bleibt die Drehung", () => {
  // a waagrecht (Front unten); links daneben ein senkrechter Hühnerblock. Gedreht steht a senkrecht mit der Front nach links (x-),
  // also an b – die Ausrichtung dreht a mit der Front nach rechts.
  const h: Halle = { ...leer, objekte: [block("a", 300, 500, "z+"), block("b", 230, 500, "x-", 90, "huehner")] };
  const r = gedrehtUndAusgerichtet(h, planVon(h), { art: "objekt", id: "a" }, masse);
  expect(lage(gedreht(h, { art: "objekt", id: "a" }))[0]).toEqual(["a", 300, 500, 90, "x-"]);
  expect(r).toMatchObject({ wand: 0, ruecken: 1 });
  expect(lage(r.halle)[0]).toEqual(["a", 300, 500, 90, "x+"]);
  // Frei gedreht (kein Nachbar, keine Wand): genau die Drehung des Nutzers.
  const frei: Halle = { ...leer, objekte: [block("a", 300, 500, "z+")] };
  const f = gedrehtUndAusgerichtet(frei, planVon(frei), { art: "objekt", id: "a" }, masse);
  expect(f).toMatchObject({ wand: 0, ruecken: 0 });
  expect(f.halle).toEqual(gedreht(frei, { art: "objekt", id: "a" }));
  // Verdeckt, aber die Gegenseite ist auch zu (rechts 100 cm ein weiterer Block): die Drehung bleibt, wie gewählt.
  const eng: Halle = { ...h, objekte: [...h.objekte!, block("c", 440, 400, "x+", 90)] };
  expect(gedrehtUndAusgerichtet(eng, planVon(eng), { art: "objekt", id: "a" }, masse)).toMatchObject({ wand: 0, ruecken: 0 });
});

test("Einsetzen: ein neues Teil (noch nicht im Plan) richtet sich gleich aus", () => {
  // Neuer Taubenblock direkt über b, Front ohne Angabe (nach unten, zu b).
  const neu: HallenObjekt = { id: "n", art: "kaefigblock", typ: "tauben", x: 300, y: 500, drehung: 0 };
  const h = { ...halle, objekte: [...halle.objekte!, neu] };
  const r = eingesetztUndAusgerichtet(h, plan, ["n"], masse);
  expect(r).toMatchObject({ wand: 0, ruecken: 1 });
  expect(lage(r.halle).at(-1)).toEqual(["n", 300, 500, 0, "z-"]);
  // Frei eingesetzt: nichts.
  const frei = { ...halle, objekte: [...halle.objekte!, { ...neu, x: 600, y: 1200 }] };
  expect(eingesetztUndAusgerichtet(frei, plan, ["n"], masse)).toMatchObject({ wand: 0, ruecken: 0 });
});

test("Eben eingesetzt, der Plan kennt das Teil noch nicht: Verschieben und Drehen (Doppelklick wie R) richten genauso aus", () => {
  const neu: HallenObjekt = { id: "n", art: "kaefigblock", typ: "tauben", x: 300, y: 900, drehung: 0 };
  const h = { ...halle, objekte: [...halle.objekte!, neu] };
  const frisch = planVon(h);
  expect(plan.objekte.some((o) => o.id === "n")).toBe(false);
  // Verschieben: n von oben mit der Front (nach unten) an die Rückwand von b – n endet bei y 540.
  const v = verschiebenUndAusrichten(h, plan, [{ art: "objekt", id: "n" }], 0, -400, masse);
  expect(v).toMatchObject({ wand: 0, ruecken: 1 });
  expect(v).toEqual(verschiebenUndAusrichten(h, frisch, [{ art: "objekt", id: "n" }], 0, -400, masse));
  // Drehen neben einem senkrechten Hühnerblock links: die Front nach links wäre verdeckt.
  const d0: Halle = { ...leer, objekte: [block("b", 230, 500, "x-", 90, "huehner"), { ...neu, y: 500 }] };
  const d = gedrehtUndAusgerichtet(d0, planVon({ ...d0, objekte: [d0.objekte![0]!] }), { art: "objekt", id: "n" }, masse);
  expect(d).toMatchObject({ wand: 0, ruecken: 1 });
  expect(d).toEqual(gedrehtUndAusgerichtet(d0, planVon(d0), { art: "objekt", id: "n" }, masse));
});

test("„Fehlende Käfige einsetzen“: automatisch eingesetzte Blöcke bleiben automatisch, auch wenn sie sich ausrichten", () => {
  const neu: HallenObjekt = { id: "n", art: "kaefigblock", typ: "tauben", x: 300, y: 500, drehung: 0, front: "z+", auto: true };
  const r = eingesetztUndAusgerichtet({ ...halle, objekte: [...halle.objekte!, neu] }, plan, ["n"], masse);
  expect(r.ruecken).toBe(1);
  expect(r.halle.objekte!.find((o) => o.id === "n")).toMatchObject({ front: "z-", auto: true });
});

test("mitAusrichtung: ein Schritt über aendern, Ergebnis ist der Hinweis", () => {
  const schritte: Halle[] = [];
  const aendern = (f: (h: Halle) => Halle) => {
    const n = f(halle);
    schritte.push(n);
    return n;
  };
  expect(mitAusrichtung(aendern, (h) => verschiebenUndAusrichten(h, plan, [{ art: "objekt", id: "a" }], 0, 200, masse))).toBe("Am Nachbarn gedreht: Rückwand an Rückwand (1 Teil).");
  expect(schritte.length).toBe(1);
  expect(mitAusrichtung(aendern, (h) => verschiebenUndAusrichten(h, plan, [{ art: "objekt", id: "a" }], 100, 0, masse))).toBeNull();
});
