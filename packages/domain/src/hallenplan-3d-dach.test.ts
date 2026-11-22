/** Dach und Decke der 3D-Halle: flach oder Satteldach, Binder, Giebel, Leuchtenhöhe, Decke nur von innen. */
import { describe, expect, test } from "bun:test";
import { BINDER, dachVon, deckeSichtbar, deckenHoehe, deckenTeile, giebel, hoechstesInDerHalle, LEUCHTE } from "./hallenplan-3d-dach";
import { hallenSzene, vertauscht, wandDeckkraft, WAND_DURCHSICHTIG, type HallenSzene } from "./hallenplan-3d";
import { zeichnungDerHalle } from "./hallenplan-druck";
import { HALLE_STANDARD, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { punktInUmriss } from "./hallenplan-umriss";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 75 } };
const szene = (h: Halle, tiere: PlanTier[] = []): HallenSzene => {
  const s = hallenSzene(h, planeHalle(h, tiere, masse), masse);
  return zeichnungDerHalle(h).quer ? vertauscht(s) : s;
};
const L_UMRISS = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 1000 }, { x: 800, y: 1000 }, { x: 800, y: 3000 }, { x: 0, y: 3000 }];
// 15 × 30 m, Längsseiten an x0/x1: First in z-Richtung bei x = 7,50 m.
const flach = { breite: 1500, laenge: 3000, wandHoehe: 600, firstHoehe: 600 };
const sattel = { breite: 1500, laenge: 3000, wandHoehe: 700, firstHoehe: 900 };

describe("Dachform", () => {
  test("Satteldach, wenn der First höher ist als die Wand: First parallel zur langen Seite in der Mitte", () => {
    expect(dachVon(flach).sattel).toBe(false);
    const d = dachVon(sattel);
    expect(d).toMatchObject({ sattel: true, laengsX: false, traufe: 700, first: 900 });
    expect(dachVon({ ...sattel, breite: 3000, laenge: 1500 }).laengsX).toBe(true);
    // Freier Grundriss: flach.
    expect(dachVon({ ...sattel, umriss: L_UMRISS }).sattel).toBe(false);
  });

  test("Deckenhöhe: an den Längswänden die Traufe, in der Mitte der First, dazwischen gerade", () => {
    expect(deckenHoehe(sattel, 0, 500)).toBe(700);
    expect(deckenHoehe(sattel, 1500, 2500)).toBe(700);
    expect(deckenHoehe(sattel, 750, 1200)).toBe(900);
    expect(deckenHoehe(sattel, 375, 10)).toBe(800);
    expect(deckenHoehe(flach, 375, 10)).toBe(600);
  });
});

describe("Decke nur von innen", () => {
  test("sichtbar in der Halle unter der Decke, sonst nicht (von oben, von außen)", () => {
    expect(deckeSichtbar(flach, { x: 700, y: 165, z: 900 })).toBe(true);
    expect(deckeSichtbar(flach, { x: 700, y: 800, z: 900 })).toBe(false);
    expect(deckeSichtbar(flach, { x: -300, y: 165, z: 900 })).toBe(false);
    expect(deckeSichtbar(flach, { x: 700, y: 165, z: 3100 })).toBe(false);
  });
  test("Satteldach: unter dem First höher als an der Wand", () => {
    expect(deckeSichtbar(sattel, { x: 750, y: 850, z: 900 })).toBe(true);
    expect(deckeSichtbar(sattel, { x: 100, y: 850, z: 900 })).toBe(false);
    expect(deckeSichtbar(sattel, { x: 750, y: 950, z: 900 })).toBe(false);
  });
  test("freier Grundriss: im ausgesparten Teil nicht", () => {
    expect(deckeSichtbar({ ...flach, umriss: L_UMRISS }, { x: 400, y: 165, z: 1500 })).toBe(true);
    expect(deckeSichtbar({ ...flach, umriss: L_UMRISS }, { x: 1200, y: 165, z: 1500 })).toBe(false);
  });
});

describe("Binder", () => {
  test("flach: quer zur langen Seite in gleichem Abstand, über die ganze Breite, bündig unter der Decke", () => {
    const { binder } = deckenTeile(flach);
    expect(binder.length).toBeGreaterThanOrEqual(4);
    for (const b of binder) {
      expect(Math.abs(b.b.x - b.a.x)).toBe(1500);
      expect(b.a.z).toBe(b.b.z);
      expect([b.a.y, b.b.y]).toEqual([600, 600]);
    }
    const z = binder.map((b) => b.a.z);
    const abst = z.slice(1).map((v, i) => v - z[i]!);
    for (const a of abst) expect(Math.abs(a - abst[0]!)).toBeLessThan(1);
  });

  test("Satteldach: je Binder zwei Hälften von der Traufe zum First", () => {
    const { binder } = deckenTeile(sattel);
    const je = new Map<number, typeof binder>();
    for (const b of binder) je.set(b.a.z, [...(je.get(b.a.z) ?? []), b]);
    expect(je.size).toBeGreaterThanOrEqual(4);
    for (const zwei of je.values()) {
      expect(zwei).toHaveLength(2);
      for (const b of zwei) {
        expect([b.a.y, b.b.y].sort()).toEqual([700, 900]);
        // Oberkante folgt der Decke.
        expect(b.a.y).toBe(deckenHoehe(sattel, b.a.x, b.a.z));
        expect(b.b.y).toBe(deckenHoehe(sattel, b.b.x, b.b.z));
      }
    }
  });

  test("freier Grundriss: nur über der Halle", () => {
    const { binder, leuchten } = deckenTeile({ ...flach, umriss: L_UMRISS });
    for (const b of binder) {
      expect(punktInUmriss({ x: Math.min(b.a.x, b.b.x) + 1, y: b.a.z }, L_UMRISS)).toBe(true);
      expect(punktInUmriss({ x: Math.max(b.a.x, b.b.x) - 1, y: b.a.z }, L_UMRISS)).toBe(true);
    }
    expect(binder.some((b) => Math.abs(b.b.x - b.a.x) === 800)).toBe(true);
    for (const l of leuchten) expect(punktInUmriss({ x: l.x + l.b / 2, y: l.z + l.t / 2 }, L_UMRISS)).toBe(true);
  });
});

describe("Giebel", () => {
  test("Satteldach: an beiden Stirnseiten ein Dreieck von der Traufe bis zum First, über die ganze Wand", () => {
    const s = szene({ ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [], aussehen: { decke: true, wandHoehe: 700, firstHoehe: 900 } });
    const g = giebel(s);
    expect(g.map((x) => x.seite).sort()).toEqual(["z0", "z1"]);
    for (const x of g) {
      expect([x.y, x.spitze]).toEqual([700, 900]);
      expect(x.von).toBeLessThanOrEqual(0);
      expect(x.bis).toBeGreaterThanOrEqual(1500);
      expect(s.waende[x.wand]!.seite).toBe(x.seite);
    }
  });
  test("flach: keine Giebel", () => {
    expect(giebel(szene({ ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [], aussehen: { decke: true, wandHoehe: 700 } }))).toEqual([]);
  });
});

describe("Leuchten", () => {
  test("unter den Bindern abgehängt, nie unter 3 m", () => {
    for (const l of deckenTeile(flach).leuchten) {
      expect(l.y + l.h).toBeLessThanOrEqual(600 - BINDER.hoehe);
      expect(l.y).toBeGreaterThanOrEqual(300);
    }
    const hoch = { ...flach, wandHoehe: 1000, firstHoehe: 1000 };
    for (const l of deckenTeile(hoch).leuchten) expect(l.y + l.h).toBeLessThanOrEqual(1000 - BINDER.hoehe);
  });

  test("mindestens 1,50 m über dem höchsten Käfig; reicht die Decke dafür nicht, direkt an der Decke", () => {
    for (const l of deckenTeile({ ...flach, wandHoehe: 1000, firstHoehe: 1000 }, 700).leuchten) expect(l.y).toBeGreaterThanOrEqual(850);
    for (const l of deckenTeile(flach, 500).leuchten) expect(l.y + l.h).toBe(600);
    // Niedrige Halle: 3 m, so weit die Decke reicht.
    for (const l of deckenTeile({ ...flach, wandHoehe: 350, firstHoehe: 350 }).leuchten) {
      expect(l.y).toBeGreaterThanOrEqual(300);
      expect(l.y + l.h).toBeLessThanOrEqual(350);
    }
  });

  test("Satteldach: jede Leuchte unter der Decke an ihren Enden", () => {
    const { leuchten } = deckenTeile(sattel);
    expect(leuchten.length).toBeGreaterThan(0);
    for (const l of leuchten) {
      const decke = Math.min(deckenHoehe(sattel, l.x, l.z), deckenHoehe(sattel, l.x + l.b, l.z + l.t));
      expect(l.y + l.h).toBeLessThanOrEqual(decke);
      expect(l.h).toBe(LEUCHTE.hoehe);
    }
  });

  test("höchster Käfig aus der Szene", () => {
    const tiere = Array.from({ length: 12 }, (_, i): PlanTier => ({ id: i + 1, typ: "huehner", nr: String(i + 1), rasse: "Wyandotten", sparte: "Hühner", preisrichterId: null }));
    const s = szene({ ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [] }, tiere);
    expect(hoechstesInDerHalle(s)).toBe(Math.max(...s.kaefige.map((k) => k.q.y + k.q.h)));
    expect(hoechstesInDerHalle({ ...s, kaefige: [], volieren: [] })).toBe(0);
  });
});

describe("Wände beim Blick von oben", () => {
  // Längswand x0 (innen bei x = 0), Blickziel in der Halle.
  const wand = { x: -24, z: 0, y: 0, b: 24, t: 3000, h: 700, seite: "x0" as const };
  const ziel = { x: 750, y: 0, z: 1500 };
  test("Satteldach: über der örtlichen Decke (nahe der Traufe) werden die Wände durchsichtiger, unter dem First nicht", () => {
    // 8 m: an der Wand (Decke 7,13 m) über der Decke, in der Mitte (9 m) darunter.
    expect(wandDeckkraft(wand, sattel, { x: 50, y: 800, z: 1500 }, ziel)).toBeLessThan(1);
    expect(wandDeckkraft(wand, sattel, { x: 750, y: 800, z: 1500 }, ziel)).toBe(1);
    expect(wandDeckkraft(wand, sattel, { x: 750, y: 1000, z: 1500 }, ziel)).toBeLessThan(1);
    expect(wandDeckkraft(wand, sattel, { x: 750, y: 1000, z: 1500 }, ziel)).toBeGreaterThanOrEqual(WAND_DURCHSICHTIG);
  });
  test("flach wie bisher: über der Wandhöhe", () => {
    expect(wandDeckkraft(wand, flach, { x: 750, y: 590, z: 1500 }, ziel)).toBe(1);
    expect(wandDeckkraft(wand, flach, { x: 750, y: 650, z: 1500 }, ziel)).toBeLessThan(1);
  });
});
