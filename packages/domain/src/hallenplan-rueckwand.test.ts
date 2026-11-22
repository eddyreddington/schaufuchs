/**
 * Käfige aneinander: Rückwand an Rückwand (Wunsch des Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch
 * so aus, dass die Rückwände aneinander stehen und nicht die Front verdecken.“). Leere Halle ohne Reihen (Gang 150 cm) mit
 * eingesetzten Blöcken (Tauben 200 × 40 cm, Hühner 210 × 70 cm, Voliere 200 × 100 cm); dazu eine Beispielhalle mit Reihen.
 */
import { describe, expect, test } from "bun:test";
import { festschreiben, frontFehler, HALLE_STANDARD, planeHalle, type Blick, type Halle, type HallenObjekt, type PlanTier, type Rechteck } from "./hallenplan";
import type { HallenTeil } from "./hallenplan-gruppe";
import { ausrichtungBeimStellen, ruhendeNachbarn } from "./hallenplan-rueckwand";
import { wandAusrichtung, wandDrehungenAnwenden, wandKandidaten, type WandDrehung, type WandKandidat } from "./hallenplan-wandfront";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 }, voliere: { breite: 200, tiefe: 100, hoehe: 150 } };
const leer: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, gang: 150, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
/** Taubenblock: ungedreht 200 × 40 cm (Front z±), gedreht 40 × 200 cm (Front x±). */
const block = (id: string, x: number, y: number, front: Blick, drehung: 0 | 90 = 0, typ: "tauben" | "huehner" = "tauben"): HallenObjekt => ({ id, art: "kaefigblock", typ, x, y, drehung, front });
const objekt = (id: string): HallenTeil => ({ art: "objekt", id });
const kurz = (d: WandDrehung[]) => d.map((x) => [x.teil.art === "objekt" ? x.teil.id : `R${x.teil.reihe}/${x.teil.i}`, x.front]);
const nichts = { wand: [], ruecken: [] };

/** Teile in die Halle stellen und für die bewegten (`nur`) ausrichten. */
function stellen(objekte: HallenObjekt[], nur: string[], halle: Halle = leer, tiere: PlanTier[] = [], ruhend?: Rechteck[]) {
  const h: Halle = { ...halle, objekte };
  const p = planeHalle(h, tiere, masse);
  const a = ausrichtungBeimStellen(h, wandKandidaten(p), nur.map(objekt), ruhend ?? ruhendeNachbarn(p));
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
    expect(ausrichtungBeimStellen(s.neu, wandKandidaten(s.nachher), [objekt("a")])).toEqual(nichts);
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

  test("T-Stoß: Front an der kurzen Seitenwand eines Nachbarn – dreht ebenfalls", () => {
    // Hühnerblock senkrecht (70 × 210) unter der Mitte von a: seine kurze obere Seite an der Front von a.
    const s = stellen([block("a", 300, 500, "z+"), block("b", 350, 540, "x+", 90, "huehner")], ["a"]);
    expect(kurz(s.a.ruecken)).toEqual([["a", "z-"]]);
  });

  test("Rücken an Rücken, Ecke an Ecke, Seitenwand an Seitenwand, wenig Überlappung, weiter als der Fang: nichts", () => {
    for (const nur of [["a"], ["b"], ["a", "b"]]) {
      expect(stellen([block("a", 300, 500, "z-"), block("b", 300, 540, "z+")], nur).a).toEqual(nichts);
      // Ecke an Ecke: b beginnt genau an der rechten unteren Ecke von a.
      expect(stellen([block("a", 300, 500, "z+"), block("b", 500, 540, "z-")], nur).a).toEqual(nichts);
      // Seitenwand an Seitenwand: kurze an kurzer Seite bzw. die lange Seitenwand eines senkrechten Blocks an der kurzen von a.
      expect(stellen([block("a", 300, 500, "z+"), block("b", 500, 500, "z+")], nur).a).toEqual(nichts);
      expect(stellen([block("a", 300, 500, "z+"), block("b", 500, 400, "x+", 90)], nur).a).toEqual(nichts);
      // Nur 20 cm Überlappung (weniger als 30 cm).
      expect(stellen([block("a", 300, 500, "z+"), block("b", 480, 540, "z-")], nur).a).toEqual(nichts);
      // 40 cm Abstand (mehr als 30 cm Fang).
      expect(stellen([block("a", 300, 500, "z+"), block("b", 300, 580, "z-")], nur).a).toEqual(nichts);
    }
    // Bis 30 cm Fang und ab 30 cm Überlappung zählt es als aneinander.
    expect(kurz(stellen([block("a", 300, 500, "z+"), block("b", 450, 570, "z-")], ["a"]).a.ruecken)).toEqual([["a", "z-"]]);
    expect(kurz(stellen([block("a", 300, 500, "z+"), block("b", 470, 540, "z-")], ["a"]).a.ruecken)).toEqual([["a", "z-"]]);
  });

  test("Gedreht wird nur, wenn vor der neuen Front ein Gang (Gangbreite) frei ist – sonst meldet die Prüfliste es weiter", () => {
    // a mit der Rückwand an der Wand (bündig bzw. 20 cm davor), b direkt vor seiner Front.
    for (const y of [0, 20]) {
      const s = stellen([block("a", 300, y, "z+"), block("b", 300, y + 40, "z+")], ["a"]);
      expect(s.a).toEqual(nichts);
      expect(frontFehler(s.h, s.p).some((f) => f.includes("Front zu"))).toBe(true);
    }
    // a zwischen zwei Blöcken: hinter a steht c (direkt bzw. 100 cm – weniger als ein Gang).
    expect(stellen([block("c", 300, 460, "z-"), block("a", 300, 500, "z+"), block("b", 300, 540, "z+")], ["a"]).a).toEqual(nichts);
    expect(stellen([block("c", 300, 360, "z-"), block("a", 300, 500, "z+"), block("b", 300, 540, "z+")], ["a"]).a).toEqual(nichts);
    // 100 cm vor der Wand: auch zu wenig.
    expect(stellen([block("a", 300, 100, "z+"), block("b", 300, 140, "z+")], ["a"]).a).toEqual(nichts);
    expect(kurz(stellen([block("a", 300, 150, "z+"), block("b", 300, 190, "z+")], ["a"]).a.ruecken)).toEqual([["a", "z-"]]);
  });

  test("Mit der Wand-Ausrichtung zusammen: erst die Wand, aber nur, wenn die Front danach nicht direkt an einem Teil steht", () => {
    // a an der Wand mit der Front zur Wand, b direkt hinter a: gedreht stünde die Front an b – dann bleibt es.
    expect(stellen([block("a", 300, 0, "z-"), block("b", 300, 40, "z+")], ["a"]).a).toEqual(nichts);
    // b 60 cm hinter a: Rückwand an die Wand; danach ist Ruhe.
    const s = stellen([block("a", 300, 0, "z-"), block("b", 300, 100, "z+")], ["a"]);
    expect(kurz(s.a.wand)).toEqual([["a", "z+"]]);
    expect(s.a.ruecken).toEqual([]);
    expect(ausrichtungBeimStellen(s.neu, wandKandidaten(s.nachher), [objekt("a")])).toEqual(nichts);
    // Nur an der Wand, kein Nachbar: wie bisher.
    expect(kurz(stellen([block("a", 300, 0, "z-")], ["a"]).a.wand)).toEqual([["a", "z+"]]);
    // Hinter a eine Sperrfläche („Bühne“) direkt anliegend: auch dann nicht drehen.
    const buehne: Halle = { ...leer, flaechen: [{ name: "Bühne", art: "sperre", x: 300, y: 40, breite: 200, tiefe: 200 }] };
    expect(stellen([block("a", 300, 0, "z-")], ["a"], buehne).a).toEqual(nichts);
  });

  test("Pfeiltasten im Engpass zwischen Wand und Nachbar: kein Hin- und Herdrehen", () => {
    // b 120 cm vor der Wand (Rückwand zur Wand hin). a rückt in 10-cm-Schritten von der Wand bis an b und zurück.
    let a = block("a", 300, 0, "z+");
    const fronten: string[] = [];
    for (const y of [...Array.from({ length: 9 }, (_, i) => i * 10), ...Array.from({ length: 9 }, (_, i) => 80 - i * 10)]) {
      const s = stellen([{ ...a, y }, block("b", 300, 120, "z+")], ["a"]);
      a = s.neu.objekte!.find((o) => o.id === "a")!;
      fronten.push(a.front!);
    }
    expect(new Set(fronten)).toEqual(new Set(["z+"]));
    // Von der Front zur Wand aus: einmal an der Wand gedreht, danach bleibt es.
    a = block("a", 300, 80, "z-");
    const wechsel: string[] = [];
    for (const y of [80, 70, 60, 50, 40, 30, 20, 10, 0, 10, 20, 30, 40, 50, 60, 70, 80]) {
      const s = stellen([{ ...a, y }, block("b", 300, 120, "z+")], ["a"]);
      a = s.neu.objekte!.find((o) => o.id === "a")!;
      if (wechsel.at(-1) !== a.front) wechsel.push(a.front!);
    }
    expect(wechsel).toEqual(["z-", "z+"]);
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

  test("Eingesetzte Volieren drehen wie Blöcke; Volieren im Volierenbereich sind ruhende Nachbarn", () => {
    const v: HallenObjekt = { id: "v", art: "voliere", x: 300, y: 400, drehung: 0, front: "z+" };
    const s = stellen([v, block("a", 300, 500, "z+")], ["v"]);
    expect(kurz(s.a.ruecken)).toEqual([["v", "z-"]]);
    expect(s.neu.objekte!.find((o) => o.id === "v")).toMatchObject({ x: 300, y: 400, drehung: 0, front: "z-" });
    // Der Block davor hat eine freie Front: nichts.
    expect(stellen([v, block("a", 300, 500, "z+")], ["a"]).a).toEqual(nichts);

    // Volierenbereich ab y 1500 mit drei Volieren; a darüber mit der Front zu ihnen.
    const bereich: Halle = { ...leer, flaechen: [{ name: "Volieren", art: "volieren", x: 300, y: 1500, breite: 500, tiefe: 400 }] };
    const tiere: PlanTier[] = [1, 2, 3].map((id) => ({ id, typ: "voliere", nr: String(id), rasse: "R", sparte: "S", preisrichterId: null }));
    const mit = stellen([block("a", 300, 1460, "z+")], ["a"], bereich, tiere);
    expect(mit.p.volieren.length).toBe(3);
    expect(ruhendeNachbarn(mit.p)).toEqual(mit.p.volieren.map((x) => x.rechteck));
    expect(kurz(mit.a.ruecken)).toEqual([["a", "z-"]]);
  });

  test("Freier Grundriss (L-Halle): Innenwände zählen wie Wände – beim Ausrichten und in der Prüfliste", () => {
    // L: oben 10 m breit (y 0–10 m), unten nur die linke Hälfte (x 0–5 m). Innenwand bei y = 1000 (x 500–1000) und x = 500.
    const l: Halle = { ...leer, umriss: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 500, y: 1000 }, { x: 500, y: 2000 }, { x: 0, y: 2000 }] };
    // Front zur Innenwand: Rückwand an die Innenwand.
    const unten = stellen([block("a", 600, 960, "z+")], ["a"], l);
    expect(kurz(unten.a.wand)).toEqual([["a", "z-"]]);
    expect(kurz(wandAusrichtung(l, wandKandidaten(unten.p)))).toEqual([["a", "z-"]]);
    expect(kurz(stellen([block("a", 460, 1200, "x+", 90)], ["a"], l).a.wand)).toEqual([["a", "x-"]]);
    // Die Prüfliste (ohne die Sperrflächen des Grundrisses in der Halle) meldet die Front zur Innenwand.
    expect(frontFehler(unten.h, unten.p).some((f) => f.endsWith("Front zur Wand"))).toBe(true);
    expect(frontFehler(unten.neu, unten.nachher)).toEqual([]);
    // Nicht an die Innenwand drehen: a (Front nach oben) an der Rückwand von b, die Innenwand 40 cm hinter a.
    expect(stellen([block("b", 600, 880, "z-"), block("a", 600, 920, "z-")], ["a"], l).a).toEqual(nichts);
  });
});

describe("Käfige aneinander: eine Reihe dreht nur als Ganzes", () => {
  // Reihe 7 aus drei Grundplatten (70 × 210 cm) übereinander, Front nach rechts (x+); ein Taubenblock (200 × 40) stößt mit der
  // kurzen Seite an die Front von Platte 1 (T-Stoß).
  const platte = (i: number, x: number, front: Blick): WandKandidat => ({ teil: { art: "platte", reihe: 7, i }, rechteck: { x, y: i * 210, b: 70, h: 210 }, front, belegt: 3 });
  const reihe = (x: number, front: Blick = "x+") => [0, 1, 2].map((i) => platte(i, x, front));
  const teil = (id: string, x: number, y: number, b: number, h: number, front: Blick): WandKandidat => ({ teil: { art: "objekt", id }, rechteck: { x, y, b, h }, front, belegt: 0 });
  const t = teil("t", 370, 250, 200, 40, "z+");
  const r7: HallenTeil[] = [{ art: "reihe", nr: 7 }];
  const plattenVon = (d: WandDrehung[]) => kurz(d);

  test("Von der Wand weggerückt (3 m Gang dahinter): die ganze Reihe dreht", () => {
    const a = ausrichtungBeimStellen(leer, [...reihe(300), t], r7);
    expect(a.wand).toEqual([]);
    expect(plattenVon(a.ruecken)).toEqual([0, 1, 2].map((i) => [`R7/${i}`, "x-"]));
  });

  test("Nicht für alle Platten ein Gang frei: die Reihe dreht gar nicht – keine einzelne Platte mitten in der Reihe", () => {
    // 50 cm vor der Wand.
    expect(ausrichtungBeimStellen(leer, [...reihe(50), t], r7)).toEqual(nichts);
    // Hinter Platte 2 steht ein Block.
    const hinten = teil("h", 150, 430, 40, 200, "x-");
    expect(ausrichtungBeimStellen(leer, [...reihe(300), t, hinten], r7)).toEqual(nichts);
    // Mehrere Platten derselben Reihe zusammen gestellt: ebenso.
    expect(ausrichtungBeimStellen(leer, [...reihe(300), t, hinten], [{ art: "platte", reihe: 7, i: 1 }, { art: "platte", reihe: 7, i: 2 }])).toEqual(nichts);
    // Eine einzeln gestellte Platte dreht wie bisher für sich.
    expect(plattenVon(ausrichtungBeimStellen(leer, [...reihe(300), t, hinten], [{ art: "platte", reihe: 7, i: 1 }]).ruecken)).toEqual([["R7/1", "x-"]]);
  });

  test("An die Wand gestellt, Front zur Wand: die ganze Reihe dreht (Rückwand an die Wand)", () => {
    expect(plattenVon(ausrichtungBeimStellen(leer, reihe(10, "x-"), r7).wand)).toEqual([0, 1, 2].map((i) => [`R7/${i}`, "x+"]));
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
          expect(ausrichtungBeimStellen(h, wandKandidaten(p), null, ruhendeNachbarn(p))).toEqual(nichts);
        }
  });

  test("Fester Plan: Block mit der Front an eine Grundplatte gestellt dreht; eine bewegte Grundplatte dreht über ihre Drehung", () => {
    // Im festen Plan bleiben die Reihen stehen (in der Automatik wichen sie dem Block aus).
    const p0 = planeHalle(halle, tiere, masse);
    const fest = festschreiben(halle, p0, masse, "2026-11-22T10:00:00.000Z");
    const plane = (h: Halle) => planeHalle(h, tiere, masse, fest);
    // Doppelreihe mit Front nach links (x-): davor der Gang bis zur linken Wand.
    const r = p0.reihen.find((x) => x.art === "doppel" && x.front === "links" && x.platten.length >= 2)!;
    const pl = r.platten[0]!.rechteck;
    expect(pl.x - 48).toBeGreaterThanOrEqual(halle.gang);
    // Taubenblock senkrecht im Gang, rechte lange Seite bündig an der Front der Platte, Front zur Platte.
    const h1: Halle = { ...halle, objekte: [block("b", pl.x - 40, pl.y, "x+", 90)] };
    const p1 = plane(h1);
    expect(p1.reihen.find((x) => x.nr === r.nr)!.platten[0]!.rechteck).toEqual(pl);
    expect(kurz(ausrichtungBeimStellen(h1, wandKandidaten(p1), [objekt("b")]).ruecken)).toEqual([["b", "x-"]]);
    // Die Reihe selbst (als bewegt angenommen) dreht nicht: gedreht stieße ihre Front an die Gegenreihe der Doppelreihe.
    expect(ausrichtungBeimStellen(h1, wandKandidaten(p1), [{ art: "reihe", nr: r.nr }]).ruecken).toEqual([]);

    // Platte 0 von Hand bis 48 cm an die Wand geschoben, ihre Front an der Rückwand eines Blocks davor: hinter ihr ist jetzt
    // ein ganzer Gang frei – die Platte dreht um 180°.
    const dx = 48 - pl.x;
    const h2: Halle = { ...halle, objekte: [block("b", 8, pl.y, "x-", 90)], plattenVersatz: [{ reihe: r.nr, platte: 0, dx, dy: 0 }] };
    const p2 = plane(h2);
    const platte: HallenTeil = { art: "platte", reihe: r.nr, i: 0 };
    const a2 = ausrichtungBeimStellen(h2, wandKandidaten(p2), [platte]);
    expect(kurz(a2.ruecken)).toEqual([[`R${r.nr}/0`, "x+"]]);
    const neu = wandDrehungenAnwenden(h2, a2.ruecken);
    expect(neu.plattenVersatz).toEqual([{ reihe: r.nr, platte: 0, dx, dy: 0, drehung: 180 }]);
    // Gleiche Fläche, Front jetzt nach rechts; die Käfige darauf bleiben belegt (nur ihre Folge kehrt sich um).
    const vorher = p2.reihen.find((x) => x.nr === r.nr)!;
    const nachher = plane(neu).reihen.find((x) => x.nr === r.nr)!;
    expect(nachher.platten[0]!.rechteck).toEqual(vorher.platten[0]!.rechteck);
    expect(nachher.platten[0]!.drehung).toBe(180);
    expect(nachher.kaefige.filter((k) => k.platte === 0).map((k) => k.id).sort()).toEqual(vorher.kaefige.filter((k) => k.platte === 0).map((k) => k.id).sort());
    // Nur 60 cm in den Gang: gedreht stünde ihre Front 60 cm vor der Gegenreihe (weniger als ein Gang) – dann nicht.
    const h3: Halle = { ...halle, objekte: [block("b", pl.x - 60 - 40, pl.y, "x-", 90)], plattenVersatz: [{ reihe: r.nr, platte: 0, dx: -60, dy: 0 }] };
    expect(ausrichtungBeimStellen(h3, wandKandidaten(plane(h3)), [platte]).ruecken).toEqual([]);
  });
});
