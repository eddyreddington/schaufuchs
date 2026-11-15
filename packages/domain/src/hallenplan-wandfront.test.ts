/**
 * Käfige an den Wänden: Rückwand an die Wand (Rückmeldung 14.11.2026: „an den wänden sollten käfige automatisch richtig gedreht
 * werden rückwand an wand“). Beispielhalle längs, Hauptgang durch die Mitte, Platten im festen Plan von Hand an die
 * Wände verschoben.
 */
import { describe, expect, test } from "bun:test";
import { festschreiben, frontDerReihe, frontFehler, HALLE_STANDARD, kaefigKanten, planeHalle, type Halle, type Hallenplan, type PlanTier } from "./hallenplan";
import { hallenSzene } from "./hallenplan-3d";
import { planUnordnung } from "./hallenplan-folge";
import { wandAusrichtung, wandDrehungenAnwenden, wandKandidaten } from "./hallenplan-wandfront";

let id = 0;
const art = (n: number, typ: PlanTier["typ"], sparte: string): PlanTier[] =>
  Array.from({ length: n }, () => {
    id++;
    return { id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null };
  });
const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
const beispielhalle: Halle = {
  ...HALLE_STANDARD,
  breite: 1550,
  laenge: 2750,
  gang: 150,
  richtung: "laengs",
  // An den Wänden ist Platz für von Hand dorthin geschobene Platten (mit Wandreihen siehe unten).
  wandreihen: false,
  hauptgang: { breite: 300, lage: "mitte" },
  flaechen: [{ name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 }],
};
const tiere = [...art(60, "huehner", "Hühner"), ...art(90, "zwerghuehner", "Zwerghühner"), ...art(120, "tauben", "Tauben")];

/** Rückwand liegt an einer Hallenwand. */
const anWand = (h: Halle, s: { x1: number; y1: number; x2: number; y2: number }) =>
  s.x1 === s.x2 ? Math.abs(s.x1) < 1 || Math.abs(s.x1 - h.breite) < 1 : Math.abs(s.y1) < 1 || Math.abs(s.y1 - h.laenge) < 1;

/** Beispiel: fester Plan, Platten einer Doppelreihe an die linke Wand und an die rechte Wand geschoben (Front zur Wand). */
function nachbau() {
  const p0 = planeHalle(beispielhalle, tiere, masse);
  const fest = festschreiben(beispielhalle, p0, masse, "2026-11-14T17:44:00.000Z");
  // R2 (Doppelreihe, Front „links“ zur linken Wand hin): die ersten drei Platten bündig an die linke Wand.
  const r2 = p0.reihen.find((r) => r.art === "doppel" && r.front === "links" && r.platten.length >= 3)!;
  // Eine Doppelreihe mit Front „rechts“: zwei Platten bündig an die rechte Wand.
  const rechts = [...p0.reihen].reverse().find((r) => r.art === "doppel" && r.front === "rechts" && r.platten.length >= 2)!;
  const halle: Halle = {
    ...beispielhalle,
    plattenVersatz: [
      ...[0, 1, 2].map((i) => ({ reihe: r2.nr, platte: i, dx: -r2.platten[i]!.rechteck.x, dy: 0 })),
      ...[0, 1].map((i) => ({ reihe: rechts.nr, platte: i, dx: beispielhalle.breite - (rechts.platten[i]!.rechteck.x + rechts.platten[i]!.rechteck.b), dy: 0 })),
    ],
  };
  return { halle, fest, r2: r2.nr, rechts: rechts.nr };
}
const anDerWand = (h: Halle, p: Hallenplan, nr: number, i: number) => {
  const r = p.reihen.find((x) => x.nr === nr)!;
  const pl = r.platten[i]!;
  return anWand(h, kaefigKanten(pl.rechteck, frontDerReihe(r, p.quer, pl.drehung ?? 0)).rueck);
};

describe("Käfige an den Wänden: Rückwand an die Wand", () => {
  test("Nachbau: Platten an der Wand stehen mit der Front zur Wand – die Ausrichtung dreht sie um 180°, an Ort und Stelle", () => {
    const { halle, fest, r2, rechts } = nachbau();
    const vorher = planeHalle(halle, tiere, masse, fest);
    expect(frontFehler(halle, vorher).some((f) => f.startsWith(`R${r2}:`) && /Front zur Wand/.test(f))).toBe(true);
    for (const i of [0, 1, 2]) expect(anDerWand(halle, vorher, r2, i)).toBe(false);

    const drehungen = wandAusrichtung(halle, wandKandidaten(vorher));
    expect(drehungen.map((d) => [d.teil, d.grad] as unknown[])).toEqual([
      ...[0, 1, 2].map((i) => [{ art: "platte", reihe: r2, i }, 180]),
      ...[0, 1].map((i) => [{ art: "platte", reihe: rechts, i }, 180]),
    ]);
    const neu = wandDrehungenAnwenden(halle, drehungen);
    const nachher = planeHalle(neu, tiere, masse, fest);
    for (const i of [0, 1, 2]) expect(anDerWand(neu, nachher, r2, i)).toBe(true);
    for (const i of [0, 1]) expect(anDerWand(neu, nachher, rechts, i)).toBe(true);
    // Die Platten bleiben, wo sie sind (gleiche Fläche), keine Überschneidung, keine Front-Hinweise mehr für sie.
    const flaeche = (p: Hallenplan, nr: number) => JSON.stringify(p.reihen.find((r) => r.nr === nr)!.platten.map((pl) => pl.rechteck));
    expect(flaeche(nachher, r2)).toBe(flaeche(vorher, r2));
    expect(nachher.warnungen.filter((w) => /überschneidet/.test(w))).toEqual([]);
    expect(frontFehler(neu, nachher).filter((f) => f.startsWith(`R${r2}:`) || f.startsWith(`R${rechts}:`))).toEqual([]);
    // Ein zweites Mal: nichts mehr zu tun.
    expect(wandAusrichtung(neu, wandKandidaten(nachher))).toEqual([]);
  });

  test("Reihen aus der Planung (Wandreihen, Reihenenden bündig an der Wand) bleiben unberührt", () => {
    for (const richtung of ["quer", "laengs"] as const)
      for (const lage of ["keiner", "mitte", "beide"] as const) {
        const h: Halle = { ...beispielhalle, richtung, wandreihen: true, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage } };
        const p = planeHalle(h, tiere, masse);
        expect(wandAusrichtung(h, wandKandidaten(p))).toEqual([]);
        // Wandreihen: Rückwand an der Wand.
        for (const r of p.reihen.filter((x) => x.art === "wand"))
          for (const pl of r.platten) expect(anWand(h, kaefigKanten(pl.rechteck, frontDerReihe(r, p.quer, pl.drehung ?? 0)).rueck)).toBe(true);
      }
  });

  test("Käfigblock an der Wand mit der Front zur Wand: Front gedreht, Block bleibt stehen; Block mit der kurzen Seite an der Wand: nichts", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    const halle: Halle = {
      ...h,
      objekte: [
        { id: "b1", art: "kaefigblock", typ: "tauben", x: 0, y: 900, drehung: 90, front: "x-" },
        { id: "b2", art: "kaefigblock", typ: "tauben", x: 400, y: 0, drehung: 90, front: "x+" },
        { id: "v1", art: "voliere", x: 800, y: 1900, drehung: 0, front: "z+" },
      ],
    };
    const p = planeHalle(halle, [], masse);
    const d = wandAusrichtung(halle, wandKandidaten(p));
    expect(d.map((x) => [x.teil, x.grad, x.front])).toEqual([
      [{ art: "objekt", id: "b1" }, 180, "x+"],
      [{ art: "objekt", id: "v1" }, 180, "z-"],
    ]);
    const neu = wandDrehungenAnwenden(halle, d);
    expect(neu.objekte!.map((o) => [o.id, o.x, o.y, o.drehung, o.front])).toEqual([
      ["b1", 0, 900, 90, "x+"],
      ["b2", 400, 0, 90, "x+"],
      ["v1", 800, 1900, 0, "z-"],
    ]);
  });

  test("Planfolge: gedrehte belegte Platten kehren die Folge ihrer Käfige um – „Nach Plan nummerieren“ wird angeboten", () => {
    const { halle, fest, r2 } = nachbau();
    const vorher = planeHalle(halle, tiere, masse, fest);
    const neu = wandDrehungenAnwenden(halle, wandAusrichtung(halle, wandKandidaten(vorher)));
    const nachher = planeHalle(neu, tiere, masse, fest);
    // Längs: entlang der Reihe ist y. Die Käfige auf der ersten gedrehten Platte stehen jetzt in umgekehrter Folge.
    const folge = (p: Hallenplan) => p.reihen.find((r) => r.nr === r2)!.kaefige.filter((k) => k.platte === 0).sort((a, b) => a.rechteck.y - b.rechteck.y).map((k) => k.id);
    expect(folge(vorher).length).toBeGreaterThan(1);
    expect(folge(nachher)).toEqual([...folge(vorher)].reverse());
    // Deshalb zeigt der Plan danach „Nummern nicht in Planfolge“ (mit „Nach Plan nummerieren“ bzw. „Käfigplätze nach Plan“).
    expect(planUnordnung(nachher, "laengs").nichtInFolge).toBeGreaterThan(0);
  });

  test("3D: danach zeigt die Front der Käfige an der Wand in die Halle", () => {
    const { halle, fest, r2 } = nachbau();
    const vorher = planeHalle(halle, tiere, masse, fest);
    const neu = wandDrehungenAnwenden(halle, wandAusrichtung(halle, wandKandidaten(vorher)));
    const szene = hallenSzene(neu, planeHalle(neu, tiere, masse, fest), masse);
    // Die Szene liegt wie die Zeichnung: Halle länger als breit → x und y vertauscht (Hallen-x ist dort z).
    const amRand = szene.kaefige.filter((k) => k.ort === `R${r2}` && k.q.z < 1);
    expect(amRand.length).toBeGreaterThan(0);
    expect(amRand.every((k) => k.front === "z+")).toBe(true);
    // Vorher zeigten sie zur Wand.
    const alt = hallenSzene(halle, vorher, masse).kaefige.filter((k) => k.ort === `R${r2}` && k.q.z < 1);
    expect(alt.every((k) => k.front === "z-")).toBe(true);
  });
});
