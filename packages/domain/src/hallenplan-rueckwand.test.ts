/**
 * Käfige aneinander: Rückwand an Rückwand (Wunsch des Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch
 * so aus, dass die Rückwände aneinander stehen und nicht die Front verdecken.“). Leere Halle ohne Reihen mit eingesetzten
 * Blöcken (Tauben 200 × 40 cm, Hühner 210 × 70 cm, Voliere 200 × 100 cm); dazu eine Beispielhalle mit Reihen.
 */
import { describe, expect, test } from "bun:test";
import { festschreiben, frontFehler, HALLE_STANDARD, planeHalle, type Blick, type Halle, type HallenObjekt, type PlanTier } from "./hallenplan";
import type { HallenTeil } from "./hallenplan-gruppe";
import { ausrichtungBeimStellen } from "./hallenplan-rueckwand";
import { wandDrehungenAnwenden, wandKandidaten, type WandDrehung } from "./hallenplan-wandfront";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
const leer: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
/** Taubenblock: ungedreht 200 × 40 cm (Front z±), gedreht 40 × 200 cm (Front x±). */
const block = (id: string, x: number, y: number, front: Blick, drehung: 0 | 90 = 0, typ: "tauben" | "huehner" = "tauben"): HallenObjekt => ({ id, art: "kaefigblock", typ, x, y, drehung, front });
const objekt = (id: string): HallenTeil => ({ art: "objekt", id });
const kurz = (d: WandDrehung[]) => d.map((x) => [x.teil.art === "objekt" ? x.teil.id : `R${x.teil.reihe}/${x.teil.i}`, x.front]);

/** Teile in die leere Halle stellen und für die bewegten (`nur`) ausrichten. */
function stellen(objekte: HallenObjekt[], nur: string[], halle: Halle = leer, tiere: PlanTier[] = []) {
  const h: Halle = { ...halle, objekte };
  const p = planeHalle(h, tiere, masse);
  const a = ausrichtungBeimStellen(h, wandKandidaten(p), nur.map(objekt));
  const neu = wandDrehungenAnwenden(h, [...a.wand, ...a.ruecken]);
  return { h, p, a, neu, nachher: planeHalle(neu, tiere, masse) };
}

describe("Käfige aneinander: Rückwand an Rückwand", () => {
  test("Block an Block, Fronten zueinander: der bewegte dreht an Ort und Stelle, der ruhende bleibt", () => {
    // a unten bündig an b (a: y 500–540, Front nach unten; b: y 540–580, Front nach oben).
    const teile = [block("a", 300, 500, "z+"), block("b", 300, 540, "z-")];
    const s = stellen(teile, ["a"]);
    expect(s.a.wand).toEqual([]);
    expect(kurz(s.a.ruecken)).toEqual([["a", "z-"]]);
    expect(s.neu.objekte!.map((o) => [o.id, o.x, o.y, o.drehung, o.front])).toEqual([
      ["a", 300, 500, 0, "z-"],
      ["b", 300, 540, 0, "z-"],
    ]);
    // Andersherum bewegt: dann dreht b.
    expect(kurz(stellen(teile, ["b"]).a.ruecken)).toEqual([["b", "z+"]]);
    // Ein zweites Mal: a ist frei, nichts mehr zu tun.
    expect(ausrichtungBeimStellen(s.neu, wandKandidaten(s.nachher), [objekt("a")])).toEqual({ wand: [], ruecken: [] });
  });

  test("Front an der Rückwand des Nachbarn: gedreht stehen beide Rücken an Rücken, keine Front-Hinweise mehr", () => {
    const s = stellen([block("a", 300, 500, "z+"), block("b", 300, 540, "z+")], ["a"]);
    expect(frontFehler(s.h, s.p).length).toBe(1);
    expect(kurz(s.a.ruecken)).toEqual([["a", "z-"]]);
    expect(frontFehler(s.neu, s.nachher)).toEqual([]);
  });

  test("Beide bewegt (zusammen verschoben), Fronten zueinander: beide drehen – Rücken an Rücken", () => {
    const s = stellen([block("a", 300, 500, "z+"), block("b", 300, 540, "z-")], ["a", "b"]);
    expect(kurz(s.a.ruecken)).toEqual([
      ["a", "z-"],
      ["b", "z+"],
    ]);
    expect(frontFehler(s.neu, s.nachher)).toEqual([]);
  });

  test("Rücken an Rücken, Ecke an Ecke, kurze Seite an kurzer Seite, weiter als der Fang: nichts", () => {
    for (const nur of [["a"], ["b"], ["a", "b"]]) {
      expect(stellen([block("a", 300, 500, "z-"), block("b", 300, 540, "z+")], nur).a).toEqual({ wand: [], ruecken: [] });
      // Ecke an Ecke: b beginnt genau an der rechten unteren Ecke von a.
      expect(stellen([block("a", 300, 500, "z+"), block("b", 500, 540, "z-")], nur).a).toEqual({ wand: [], ruecken: [] });
      // Seitenwand an Seitenwand.
      expect(stellen([block("a", 300, 500, "z+"), block("b", 500, 500, "z+")], nur).a).toEqual({ wand: [], ruecken: [] });
      // 40 cm Abstand (mehr als 30 cm Fang).
      expect(stellen([block("a", 300, 500, "z+"), block("b", 300, 580, "z-")], nur).a).toEqual({ wand: [], ruecken: [] });
    }
    // Bis 30 cm Fang zählt als aneinander, auch nur teilweise überlappend.
    expect(kurz(stellen([block("a", 300, 500, "z+"), block("b", 450, 570, "z-")], ["a"]).a.ruecken)).toEqual([["a", "z-"]]);
  });

  test("Stieße die Front nach dem Drehen an die Wand oder an ein anderes Teil: nicht drehen, die Prüfliste meldet es weiter", () => {
    // a mit der Rückwand an der Wand (bündig bzw. 20 cm davor), b direkt vor seiner Front.
    for (const y of [0, 20]) {
      const s = stellen([block("a", 300, y, "z+"), block("b", 300, y + 40, "z+")], ["a"]);
      expect(s.a).toEqual({ wand: [], ruecken: [] });
      expect(frontFehler(s.h, s.p).some((f) => f.includes("Front zu"))).toBe(true);
    }
    // a zwischen zwei Blöcken: hinter a steht c.
    const s = stellen([block("c", 300, 460, "z-"), block("a", 300, 500, "z+"), block("b", 300, 540, "z+")], ["a"]);
    expect(s.a).toEqual({ wand: [], ruecken: [] });
  });

  test("Mit der Wand-Ausrichtung zusammen: erst die Wand, kein Hin- und Herdrehen", () => {
    // a an der Wand mit der Front zur Wand, hinter a steht b: die Wand gewinnt (Rückwand an die Wand), danach ist Ruhe.
    const s = stellen([block("a", 300, 0, "z-"), block("b", 300, 40, "z+")], ["a"]);
    expect(kurz(s.a.wand)).toEqual([["a", "z+"]]);
    expect(s.a.ruecken).toEqual([]);
    expect(ausrichtungBeimStellen(s.neu, wandKandidaten(s.nachher), [objekt("a")])).toEqual({ wand: [], ruecken: [] });
    // Nur an der Wand, kein Nachbar: wie bisher.
    expect(kurz(stellen([block("a", 300, 0, "z-")], ["a"]).a.wand)).toEqual([["a", "z+"]]);
  });

  test("Gedrehte Teile (90°): Front x+/x-, Lage und Drehung bleiben", () => {
    // a senkrecht (40 × 200) mit Front nach rechts an der Rückwand eines Hühnerblocks (70 × 210).
    const s = stellen([block("a", 500, 300, "x+", 90), block("b", 540, 300, "x+", 90, "huehner")], ["a"]);
    expect(kurz(s.a.ruecken)).toEqual([["a", "x-"]]);
    expect(s.neu.objekte!.find((o) => o.id === "a")).toMatchObject({ x: 500, y: 300, drehung: 90, front: "x-" });
    expect(s.nachher.objekte.find((o) => o.id === "a")!.rechteck).toEqual(s.p.objekte.find((o) => o.id === "a")!.rechteck);
    // Gespiegelt: Nachbar links, Front nach links.
    expect(kurz(stellen([block("a", 500, 300, "x-", 90), block("b", 430, 300, "x-", 90, "huehner")], ["a"]).a.ruecken)).toEqual([["a", "x+"]]);
  });

  test("Eingesetzte Volieren drehen wie Blöcke", () => {
    const v: HallenObjekt = { id: "v", art: "voliere", x: 300, y: 400, drehung: 0, front: "z+" };
    const s = stellen([v, block("a", 300, 500, "z+")], ["v"]);
    expect(kurz(s.a.ruecken)).toEqual([["v", "z-"]]);
    expect(s.neu.objekte!.find((o) => o.id === "v")).toMatchObject({ x: 300, y: 400, drehung: 0, front: "z-" });
    // Der Block davor hat eine freie Front: nichts.
    expect(stellen([v, block("a", 300, 500, "z+")], ["a"]).a).toEqual({ wand: [], ruecken: [] });
  });
});

describe("Käfige aneinander: mit Reihen aus der Planung", () => {
  let id = 0;
  const art = (n: number, typ: PlanTier["typ"]): PlanTier[] => Array.from({ length: n }, () => ({ id: ++id, typ, nr: String(id), rasse: "R", sparte: "S", preisrichterId: null }));
  const tiere = [...art(60, "huehner"), ...art(90, "zwerghuehner"), ...art(120, "tauben")];
  const halle: Halle = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, gang: 150, richtung: "laengs", wandreihen: false, hauptgang: { breite: 300, lage: "mitte" }, flaechen: [] };

  test("Reihen der Planung (Doppelreihen Rücken an Rücken, Wandreihen) bleiben unberührt – auch wenn alle als bewegt gelten", () => {
    for (const richtung of ["quer", "laengs"] as const)
      for (const wandreihen of [false, true])
        for (const lage of ["keiner", "mitte", "beide"] as const) {
          const h: Halle = { ...halle, richtung, wandreihen, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage } };
          const p = planeHalle(h, tiere, masse);
          expect(p.reihen.some((r) => r.art === "doppel")).toBe(true);
          expect(ausrichtungBeimStellen(h, wandKandidaten(p), null)).toEqual({ wand: [], ruecken: [] });
        }
  });

  test("Fester Plan: Block mit der Front an eine Grundplatte gestellt dreht; eine bewegte Grundplatte dreht über ihre Drehung", () => {
    // Im festen Plan bleiben die Reihen stehen (in der Automatik wichen sie dem Block aus).
    const p0 = planeHalle(halle, tiere, masse);
    const fest = festschreiben(halle, p0, masse, "2026-11-22T10:00:00.000Z");
    const plane = (h: Halle) => planeHalle(h, tiere, masse, fest);
    // Doppelreihe mit Front nach links (x-): davor der Gang.
    const r = p0.reihen.find((x) => x.art === "doppel" && x.front === "links" && x.platten.length >= 2)!;
    const pl = r.platten[0]!.rechteck;
    // Taubenblock senkrecht im Gang, rechte lange Seite bündig an der Front der Platte, Front zur Platte.
    const h1: Halle = { ...halle, objekte: [block("b", pl.x - 40, pl.y, "x+", 90)] };
    const p1 = plane(h1);
    expect(p1.reihen.find((x) => x.nr === r.nr)!.platten[0]!.rechteck).toEqual(pl);
    expect(kurz(ausrichtungBeimStellen(h1, wandKandidaten(p1), [objekt("b")]).ruecken)).toEqual([["b", "x-"]]);
    // Die Reihe selbst (als bewegt angenommen) dreht nicht: gedreht stieße ihre Front an die Gegenreihe der Doppelreihe.
    expect(ausrichtungBeimStellen(h1, wandKandidaten(p1), [{ art: "reihe", nr: r.nr }]).ruecken).toEqual([]);

    // Platte 0 von Hand 60 cm in den Gang geschoben, ihre Front an der Rückwand des Blocks: die Platte dreht um 180°.
    const h2: Halle = { ...halle, objekte: [block("b", pl.x - 60 - 40, pl.y, "x-", 90)], plattenVersatz: [{ reihe: r.nr, platte: 0, dx: -60, dy: 0 }] };
    const p2 = plane(h2);
    const platte: HallenTeil = { art: "platte", reihe: r.nr, i: 0 };
    const a2 = ausrichtungBeimStellen(h2, wandKandidaten(p2), [platte]);
    expect(kurz(a2.ruecken)).toEqual([[`R${r.nr}/0`, "x+"]]);
    const neu = wandDrehungenAnwenden(h2, a2.ruecken);
    expect(neu.plattenVersatz).toEqual([{ reihe: r.nr, platte: 0, dx: -60, dy: 0, drehung: 180 }]);
    // Gleiche Fläche, Front jetzt nach rechts; die Käfige darauf bleiben belegt (nur ihre Folge kehrt sich um).
    const vorher = p2.reihen.find((x) => x.nr === r.nr)!;
    const nachher = plane(neu).reihen.find((x) => x.nr === r.nr)!;
    expect(nachher.platten[0]!.rechteck).toEqual(vorher.platten[0]!.rechteck);
    expect(nachher.platten[0]!.drehung).toBe(180);
    expect(nachher.kaefige.filter((k) => k.platte === 0).map((k) => k.id).sort()).toEqual(vorher.kaefige.filter((k) => k.platte === 0).map((k) => k.id).sort());
    // Nur 20 cm in den Gang: gedreht stieße ihre Front an die Rückwand der Gegenreihe – dann nicht.
    const h3: Halle = { ...halle, objekte: [block("b", pl.x - 20 - 40, pl.y, "x-", 90)], plattenVersatz: [{ reihe: r.nr, platte: 0, dx: -20, dy: 0 }] };
    expect(ausrichtungBeimStellen(h3, wandKandidaten(plane(h3)), [platte]).ruecken).toEqual([]);
  });
});
