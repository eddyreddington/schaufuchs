/** Aussehen der Halle in 3D: Vorgaben, Bereinigung, nie Einfluss auf Plan und Nummern, Wandhöhe in der Szene, Decke. */
import { describe, expect, test } from "bun:test";
import { AUSSEHEN_STANDARD, aussehenBereinigt, aussehenVon, DECKE_VORSCHLAG, deckeSchalten, wandHoeheSetzen, istPrallwandFarbe, PRALLWAND_VORGABEN } from "./hallenplan-aussehen";
import { festGeometrie, festschreiben, HALLE_STANDARD, halleSchluessel, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { hallenSzene, TUER_HOEHE, WAND_HOEHE } from "./hallenplan-3d";

const tier = (id: number, nr: string): PlanTier => ({ id, typ: "huehner", nr, rasse: "Wyandotten", sparte: "Hühner", preisrichterId: null });
const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 75 } };

describe("Aussehen der Halle: Vorgaben und Bereinigung", () => {
  test("fehlt das Aussehen, gilt die Vorgabe (heutige Halle: Parkett, Holz-Prallwand 2 m, Wandhöhe wie bisher, Fenster)", () => {
    expect(aussehenVon(undefined)).toEqual(AUSSEHEN_STANDARD);
    expect(aussehenVon({})).toEqual(AUSSEHEN_STANDARD);
    expect(AUSSEHEN_STANDARD).toEqual({ boden: "parkett", abdeckung: false, prallwand: "holz", prallwandHoehe: 200, wandHoehe: WAND_HOEHE, firstHoehe: WAND_HOEHE, fenster: true, decke: false, linien: false, geraete: false });
  });

  test("Werte werden begrenzt: Wandhöhe über der Türhöhe, Prallwand unter der Wandhöhe, Farbe nur #rrggbb oder Holz", () => {
    const a = aussehenVon({ wandHoehe: 100, prallwandHoehe: 900, prallwand: "rot", boden: "rasen" as never, fenster: "ja" as never });
    expect(a.wandHoehe).toBeGreaterThan(TUER_HOEHE);
    expect(a.prallwandHoehe).toBeLessThan(a.wandHoehe);
    expect(a.prallwand).toBe("holz");
    expect(a.boden).toBe("parkett");
    expect(a.fenster).toBe(true);
    expect(aussehenVon({ wandHoehe: 99999 }).wandHoehe).toBe(1500);
    expect(aussehenVon({ prallwandHoehe: -5 }).prallwandHoehe).toBe(0);
    expect(aussehenVon({ prallwand: "#6D8571" }).prallwand).toBe("#6d8571");
    expect(aussehenVon({ wandHoehe: 612.4 }).wandHoehe).toBe(612);
    expect(istPrallwandFarbe("#00ff00")).toBe(true);
    expect(istPrallwandFarbe("holz")).toBe(true);
    expect(istPrallwandFarbe("#0f0")).toBe(false);
    expect(istPrallwandFarbe("url(x)")).toBe(false);
    for (const v of PRALLWAND_VORGABEN) expect(istPrallwandFarbe(v.farbe)).toBe(true);
  });

  test("gespeichert wird nur, was von der Vorgabe abweicht; ohne Abweichung gar nichts (die Halle bleibt wie vorher)", () => {
    expect(aussehenBereinigt(undefined)).toBeUndefined();
    expect(aussehenBereinigt({ ...AUSSEHEN_STANDARD })).toBeUndefined();
    expect(aussehenBereinigt({ ...AUSSEHEN_STANDARD, decke: true, prallwand: "#6D8571" })).toEqual({ decke: true, prallwand: "#6d8571" });
    expect(aussehenBereinigt({ wandHoehe: 600, prallwandHoehe: 250 })).toEqual({ wandHoehe: 600, prallwandHoehe: 250 });
    // Begrenzt gespeichert.
    expect(aussehenBereinigt({ wandHoehe: 300, prallwandHoehe: 400 })).toEqual({ wandHoehe: 300, prallwandHoehe: 270 });
  });
});

describe("Aussehen ändert nie Plan oder Nummern", () => {
  const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 2000, flaechen: [] };
  const tiere = Array.from({ length: 12 }, (_, i) => tier(i + 1, String(i + 1)));
  const anders: Halle = { ...halle, aussehen: { boden: "estrich", prallwand: "#4d6f94", prallwandHoehe: 250, wandHoehe: 700, fenster: false, decke: true, linien: true, geraete: true } };

  test("feste Geometrie gleich: ein fester Plan bleibt fest und gilt nicht als veraltet", () => {
    expect(festGeometrie(anders, masse)).toBe(festGeometrie(halle, masse));
    const fest = festschreiben(halle, planeHalle(halle, tiere, masse), masse, "2026-11-22T10:00:00Z");
    const p = planeHalle(anders, tiere, masse, fest);
    expect(p.fest?.veraltet).toBe(false);
    expect(p.warnungen).toEqual(planeHalle(halle, tiere, masse, fest).warnungen);
  });

  test("gerechneter Plan (Reihen, Käfige, Nummern) ist derselbe", () => {
    expect(planeHalle(anders, tiere, masse)).toEqual(planeHalle(halle, tiere, masse));
  });

  test("der Stand der Halle (Schlüssel) erkennt die Änderung, ohne Aussehen bleibt er wie bisher", () => {
    expect(halleSchluessel(anders)).not.toBe(halleSchluessel(halle));
    expect(halleSchluessel({ ...halle, aussehen: undefined })).toBe(halleSchluessel(halle));
  });
});

describe("Aussehen in der 3D-Szene", () => {
  const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 2000, flaechen: [{ name: "Eingang", art: "eingang", x: 600, y: 1900, breite: 300, tiefe: 100 }] };
  const plan = planeHalle(halle, [], masse);

  test("Wände so hoch wie eingestellt, der Sturz über den Türen reicht bis dorthin", () => {
    const s = hallenSzene({ ...halle, aussehen: { wandHoehe: 650 } }, plan, masse);
    expect(s.wandHoehe).toBe(650);
    expect(s.aussehen.wandHoehe).toBe(650);
    expect(Math.max(...s.waende.map((w) => w.y + w.h))).toBe(650);
    expect(s.waende.every((w) => w.y + w.h === 650)).toBe(true);
    const sturz = s.waende.find((w) => w.y === TUER_HOEHE)!;
    expect(sturz.h).toBe(650 - TUER_HOEHE);
  });

  test("ohne Aussehen wie bisher", () => {
    const s = hallenSzene(halle, plan, masse);
    expect(s.wandHoehe).toBe(WAND_HOEHE);
    expect(s.aussehen).toEqual(AUSSEHEN_STANDARD);
  });

  test("Firsthöhe der Szene: mit Decke das Satteldach, ohne Decke oder beim freien Grundriss flach in Wandhöhe", () => {
    expect(hallenSzene({ ...halle, aussehen: { decke: true, wandHoehe: 700, firstHoehe: 900 } }, plan, masse).firstHoehe).toBe(900);
    expect(hallenSzene({ ...halle, aussehen: { wandHoehe: 700, firstHoehe: 900 } }, plan, masse).firstHoehe).toBe(700);
    expect(hallenSzene(halle, plan, masse).firstHoehe).toBe(WAND_HOEHE);
    const umriss = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 1000 }, { x: 800, y: 1000 }, { x: 800, y: 2000 }, { x: 0, y: 2000 }];
    const h: Halle = { ...halle, umriss, flaechen: [], aussehen: { decke: true, wandHoehe: 700, firstHoehe: 900 } };
    expect(hallenSzene(h, planeHalle(h, [], masse), masse).firstHoehe).toBe(700);
  });

  test("auch beim freien Grundriss", () => {
    const umriss = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: 1000 }, { x: 800, y: 1000 }, { x: 800, y: 2000 }, { x: 0, y: 2000 }];
    const h: Halle = { ...halle, umriss, flaechen: [], aussehen: { wandHoehe: 500 } };
    const s = hallenSzene(h, planeHalle(h, [], masse), masse);
    expect(s.waende.every((w) => w.y + w.h === 500)).toBe(true);
  });
});

describe("Firsthöhe und Decke", () => {
  test("Wandhöhe ändern: ein gesetzter First zieht mit (Dachhöhe bleibt), höchstens bis 20 m; ohne First bleibt es flach", () => {
    expect(wandHoeheSetzen({ wandHoehe: 700, firstHoehe: 900 }, 800)).toEqual({ wandHoehe: 800, firstHoehe: 1000 });
    expect(wandHoeheSetzen({ wandHoehe: 700, firstHoehe: 900 }, 500)).toEqual({ wandHoehe: 500, firstHoehe: 700 });
    expect(wandHoeheSetzen({ wandHoehe: 700, firstHoehe: 900 }, 1450)).toEqual({ wandHoehe: 1450, firstHoehe: 1650 });
    expect(wandHoeheSetzen({ wandHoehe: 1400, firstHoehe: 2000 }, 1500)).toEqual({ wandHoehe: 1500, firstHoehe: 2000 });
    expect(wandHoeheSetzen({ wandHoehe: 700, decke: true }, 900)).toEqual({ wandHoehe: 900, decke: true });
    expect(wandHoeheSetzen(undefined, 600)).toEqual({ wandHoehe: 600 });
    expect(wandHoeheSetzen({ wandHoehe: 600 }, 350)).toBeUndefined();
  });

  test("First mindestens so hoch wie die Wand, höchstens 20 m; gespeichert nur, wenn höher als die Wand", () => {
    expect(aussehenVon({}).firstHoehe).toBe(WAND_HOEHE);
    expect(aussehenVon({ wandHoehe: 700 }).firstHoehe).toBe(700);
    expect(aussehenVon({ wandHoehe: 700, firstHoehe: 500 }).firstHoehe).toBe(700);
    expect(aussehenVon({ firstHoehe: 99999 }).firstHoehe).toBe(2000);
    expect(aussehenBereinigt({ wandHoehe: 700, firstHoehe: 700 })).toEqual({ wandHoehe: 700 });
    expect(aussehenBereinigt({ wandHoehe: 700, firstHoehe: 650 })).toEqual({ wandHoehe: 700 });
    expect(aussehenBereinigt({ wandHoehe: 700, firstHoehe: 900 })).toEqual({ wandHoehe: 700, firstHoehe: 900 });
    expect(aussehenBereinigt({ abdeckung: true })).toEqual({ abdeckung: true });
  });

  test("Decke einschalten schlägt eine Sporthallenhöhe vor, solange Wand und First nie eingestellt waren", () => {
    expect(DECKE_VORSCHLAG).toEqual({ wandHoehe: 700, firstHoehe: 900 });
    expect(deckeSchalten(undefined, true)).toEqual({ decke: true, wandHoehe: 700, firstHoehe: 900 });
    expect(deckeSchalten({ linien: true }, true)).toEqual({ linien: true, decke: true, wandHoehe: 700, firstHoehe: 900 });
    // Selbst eingestellt: bleibt.
    expect(deckeSchalten({ wandHoehe: 500 }, true)).toEqual({ decke: true, wandHoehe: 500 });
    expect(deckeSchalten({ wandHoehe: 500, firstHoehe: 800 }, true)).toEqual({ decke: true, wandHoehe: 500, firstHoehe: 800 });
    // Ausschalten ändert die Höhen nicht.
    expect(deckeSchalten({ decke: true, wandHoehe: 700, firstHoehe: 900 }, false)).toEqual({ wandHoehe: 700, firstHoehe: 900 });
  });
});
