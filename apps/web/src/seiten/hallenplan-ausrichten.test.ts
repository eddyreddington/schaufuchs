import { expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, type Halle } from "@schau/domain";
import { verschiebenUndAusrichten } from "./hallenplan-ausrichten";
import type { Daten } from "./hallenplan-geometrie";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
// Leere Halle, zwei Taubenblöcke (200 × 40 cm), beide mit der Front nach unten (z+).
const halle: Halle = {
  ...HALLE_STANDARD,
  richtung: "laengs",
  breite: 1000,
  laenge: 2000,
  wandreihen: false,
  hauptgang: { breite: 0, lage: "keiner" },
  flaechen: [],
  objekte: [
    { id: "a", art: "kaefigblock", typ: "tauben", x: 300, y: 300, drehung: 0, front: "z+" },
    { id: "b", art: "kaefigblock", typ: "tauben", x: 300, y: 540, drehung: 0, front: "z+" },
  ],
};
const plan = planeHalle(halle, [], masse) as unknown as NonNullable<Daten["plan"]>;
const lage = (h: Halle) => h.objekte!.map((o) => [o.id, o.x, o.y, o.front]);

test("Block mit der Front an die Rückwand eines anderen geschoben: er dreht beim Loslassen, der andere bleibt", () => {
  const r = verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 0, 200);
  expect(r).toMatchObject({ wand: 0, ruecken: 1 });
  expect(lage(r.halle)).toEqual([
    ["a", 300, 500, "z-"],
    ["b", 300, 540, "z+"],
  ]);
});

test("Nicht ganz heran (40 cm) oder nur verschoben: nichts dreht", () => {
  expect(verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 0, 160)).toMatchObject({ wand: 0, ruecken: 0 });
  expect(lage(verschiebenUndAusrichten(halle, plan, [{ art: "objekt", id: "a" }], 100, 0).halle)[0]).toEqual(["a", 400, 300, "z+"]);
});

test("An die Wand geschoben: wie bisher Rückwand an die Wand – in demselben Schritt", () => {
  const anWand = { ...halle, objekte: [{ ...halle.objekte![0]!, front: "z-" as const }, halle.objekte![1]!] };
  const r = verschiebenUndAusrichten(anWand, planeHalle(anWand, [], masse) as unknown as NonNullable<Daten["plan"]>, [{ art: "objekt", id: "a" }], 0, -300);
  expect(r).toMatchObject({ wand: 1, ruecken: 0 });
  expect(lage(r.halle)[0]).toEqual(["a", 300, 0, "z+"]);
});
