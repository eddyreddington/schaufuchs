/** Hallenplan – Möbel: Pokaltisch (Ehrenpreise-Ausstellung) neben Tisch, Bank und Garnitur. */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, istMoebel, MOEBEL_ARTEN, MOEBEL_NAME, moebelMass, moebelStuecke, planeHalle, POKALTISCH_STANDARD, pokalStellen, teilGroesse, type Halle } from "./hallenplan";

describe("Pokaltisch", () => {
  test("eigene Möbelart mit Namen, kein Käfigplatz", () => {
    expect(MOEBEL_ARTEN).toContain("pokaltisch");
    expect(MOEBEL_NAME.pokaltisch).toBe("Pokaltisch");
    expect(istMoebel({ art: "pokaltisch" })).toBe(true);
    expect(istMoebel({ art: "kaefigblock" })).toBe(false);
  });

  test("Maße: Vorgabe 2,00 × 0,80 m, eigene Maße wie beim Tisch", () => {
    expect(POKALTISCH_STANDARD).toEqual({ laenge: 200, tiefe: 80 });
    expect(moebelMass({ art: "pokaltisch" })).toEqual({ laenge: 200, tiefe: 80, bankTiefe: 25, gesamt: 80 });
    expect(moebelMass({ art: "pokaltisch", laenge: 300, tiefe: 60 })).toMatchObject({ laenge: 300, tiefe: 60, gesamt: 60 });
    // Der Tisch behält seine Vorgabe.
    expect(moebelMass({ art: "tisch" })).toMatchObject({ laenge: 220, tiefe: 50 });
    expect(teilGroesse({ art: "pokaltisch" }, HALLE_STANDARD, null)).toEqual({ lang: 200, kurz: 80 });
  });

  test("ein Stück in seiner Grundfläche (keine Bänke)", () => {
    const q = { x: 100, y: 200, b: 200, h: 80 };
    expect(moebelStuecke({ art: "pokaltisch" }, q)).toEqual([{ art: "pokaltisch", q }]);
  });

  test("Pokale stehen in einer Reihe längs auf der Platte, mittig, innerhalb des Tisches", () => {
    const quer = pokalStellen({ x: 100, y: 200, b: 200, h: 80 });
    expect(quer).toHaveLength(4);
    expect(quer.map((p) => p.x)).toEqual([125, 175, 225, 275]);
    expect(quer.every((p) => p.y === 240)).toBe(true);
    expect(quer.every((p) => p.h >= 20 && p.h <= 40)).toBe(true);
    // Gedreht: die Reihe läuft die lange Seite (y) entlang.
    const hoch = pokalStellen({ x: 100, y: 200, b: 80, h: 200 });
    expect(hoch.map((p) => [p.x, p.y])).toEqual([[140, 225], [140, 275], [140, 325], [140, 375]]);
    // Kurzer Tisch: mindestens zwei, langer höchstens sechs.
    expect(pokalStellen({ x: 0, y: 0, b: 60, h: 50 })).toHaveLength(2);
    expect(pokalStellen({ x: 0, y: 0, b: 900, h: 80 })).toHaveLength(6);
  });

  test("im Plan als Möbel benannt, ohne Käfigplatz und ohne Warnung", () => {
    const halle: Halle = { ...HALLE_STANDARD, breite: 1000, laenge: 2000, flaechen: [], objekte: [{ id: "p", art: "pokaltisch", x: 400, y: 1700, drehung: 0 }] };
    const plan = planeHalle(halle, [], null);
    expect(plan.objekte.map((o) => [o.name, o.rechteck.b, o.rechteck.h, o.plaetze])).toEqual([["Pokaltisch 1", 200, 80, 0]]);
    expect(plan.warnungen).toEqual([]);
  });
});
