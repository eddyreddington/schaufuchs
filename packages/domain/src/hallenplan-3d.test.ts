/** Hallenplan räumlich: Szene aus dem gerechneten Plan (Aufsteller, Käfige, Volieren, Wände, Tiere). */
import { describe, expect, test } from "bun:test";
import { AUFSTELLER_STANDARD, PLATTEN_STAERKE, VERKLEIDUNG_STANDARD, verkleidungVon, verkleidungsKachel, wandInnenseiten, figurFuer, gangStandpunkt, gefiederFarbe, hallenSzene as szeneWieImPlan, TUER_HOEHE, vertauscht, WAND_DURCHSICHTIG, WAND_HOEHE, wandDeckkraft, wandSeiten, type Quader } from "./hallenplan-3d";
import { zeichnungDerHalle } from "./hallenplan-druck";
import { frontDerReihe, HALLE_STANDARD, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { neuSetzen } from "./hallenplan-neu";

/** Die Szene in Hallenkoordinaten (x = Breite, z = Länge) – so prüfen die Tests die Geometrie; die Abbildung wie im Plan prüft ein eigener Test. */
const hallenSzene = (...a: Parameters<typeof szeneWieImPlan>) => {
  const s = szeneWieImPlan(...a);
  return zeichnungDerHalle(a[0]).quer ? vertauscht(s) : s;
};
const tier = (id: number, typ: PlanTier["typ"], nr: string, rasse = "Wyandotten", sparte = "Hühner"): PlanTier => ({ id, typ, nr, rasse, sparte, preisrichterId: null });
const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 75 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 }, voliere: { breite: 200, tiefe: 100, hoehe: 190 } };
const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [] };
const innen = (a: Quader, b: Quader) => a.x >= b.x - 0.01 && a.z >= b.z - 0.01 && a.x + a.b <= b.x + b.b + 0.01 && a.z + a.t <= b.z + b.t + 0.01;

describe("3D-Szene aus dem Hallenplan", () => {
  const tiere = [...Array.from({ length: 7 }, (_, i) => tier(i + 1, "huehner", String(i + 1))), ...Array.from({ length: 3 }, (_, i) => tier(20 + i, "tauben", String(20 + i), "Kingtauben", "Tauben"))];
  // Sortenrein gestellt (restPlaetze „frei“), damit freie Plätze beider Arten bleiben; gemischt siehe unten.
  const plan = planeHalle({ ...halle, restPlaetze: "frei" }, tiere, masse);
  const s = hallenSzene(halle, plan, masse, { hoehe: 90 });

  test("je Grundplatte ein Aufsteller in ihrer Grundfläche und der eingestellten Höhe", () => {
    const platten = plan.reihen.flatMap((r) => r.platten.filter((p) => !p.entfernt));
    expect(s.aufsteller).toHaveLength(platten.length);
    for (const [i, p] of platten.entries()) expect(s.aufsteller[i]).toEqual({ x: p.rechteck.x, z: p.rechteck.y, y: 0, b: p.rechteck.b, t: p.rechteck.h, h: 90 });
  });

  test("Käfige stehen auf dem Aufsteller, in der Grundfläche aus dem Plan, so hoch wie ihr Maß", () => {
    const belegt = s.kaefige.filter((k) => k.tier);
    expect(belegt).toHaveLength(10);
    const huhn = belegt.find((k) => k.tier!.id === 1)!;
    const ausPlan = plan.reihen.flatMap((r) => r.kaefige).find((k) => k.id === 1)!;
    expect(huhn.q).toEqual({ x: ausPlan.rechteck.x, z: ausPlan.rechteck.y, y: 90, b: ausPlan.rechteck.b, t: ausPlan.rechteck.h, h: 75 });
    expect(belegt.find((k) => k.tier!.id === 20)!.q.h).toBe(40);
    // Jeder Käfig steht auf einem Aufsteller.
    for (const k of s.kaefige) expect(s.aufsteller.some((a) => innen(k.q, a))).toBe(true);
    // Freie Plätze (angefangene Platte: 7 Hühner auf Platten zu 3, 3 Tauben auf einer Platte zu 5) bleiben leere Käfige.
    expect(s.kaefige.filter((k) => !k.tier && k.typ === "huehner")).toHaveLength(2);
    expect(s.kaefige.filter((k) => !k.tier && k.typ === "tauben")).toHaveLength(2);
  });

  test("gemischte Platte (Standard): die Tauben auf dem Rest der Hühnerplatte in ihrer echten Größe, auf demselben Aufsteller", () => {
    const gemischt = planeHalle(halle, tiere, masse);
    const pl = gemischt.reihen.flatMap((r) => r.platten).find((x) => x.gemischt)!;
    expect(pl.typ).toBe("huehner");
    const g = hallenSzene(halle, gemischt, masse, { hoehe: 90 });
    const tauben = g.kaefige.filter((k) => k.tier && k.typ === "tauben");
    expect(tauben).toHaveLength(3);
    const ausPlan = new Map(gemischt.reihen.flatMap((r) => r.kaefige).map((k) => [k.id, k.rechteck]));
    for (const k of tauben) {
      const q = ausPlan.get(k.tier!.id)!;
      expect(k.q).toEqual({ x: q.x, z: q.y, y: 90, b: q.b, t: q.h, h: 40 });
      expect(Math.min(q.b, q.h)).toBe(40);
      expect(innen(k.q, { x: pl.rechteck.x, z: pl.rechteck.y, y: 0, b: pl.rechteck.b, t: pl.rechteck.h, h: 90 })).toBe(true);
    }
    // Ein Aufsteller je Platte – die gemischte Platte hat keinen eigenen für die Tauben.
    expect(g.aufsteller).toHaveLength(gemischt.reihen.reduce((n, r) => n + r.platten.length, 0));
  });

  test("Vorgabe der Aufstellerhöhe", () => {
    const v = hallenSzene(halle, plan, masse);
    expect(v.aufsteller[0]!.h).toBe(AUFSTELLER_STANDARD.hoehe);
    expect(v.kaefige[0]!.q.y).toBe(AUFSTELLER_STANDARD.hoehe);
  });

  test("keine Ausstellernamen: ein Tier trägt nur Nummer, Rasse, Sparte und Preisrichter", () => {
    const t = s.kaefige.find((k) => k.tier)!.tier!;
    expect(Object.keys(t).sort()).toEqual(["figur", "gefieder", "groesse", "id", "nr", "preisrichterId", "rasse", "sparte"]);
  });

  test("Fronten der Käfige zeigen zum Gang (Doppelreihe Rücken an Rücken)", () => {
    const fronten = new Map(plan.reihen.map((r) => [r.nr, frontDerReihe(r, plan.quer)]));
    // Reihen quer: die Front zeigt entlang der Hallenlänge.
    for (const f of fronten.values()) expect(["z+", "z-"]).toContain(f);
    const doppel = plan.reihen.filter((r) => r.art === "doppel");
    expect(fronten.get(doppel[0]!.nr)).not.toBe(fronten.get(doppel[1]!.nr));
  });

  test("gedrehte Reihe dreht die Front mit", () => {
    expect(frontDerReihe({ front: "rechts", drehung: 0 }, false)).toBe("x+");
    expect(frontDerReihe({ front: "rechts", drehung: 90 }, false)).toBe("z+");
    expect(frontDerReihe({ front: "links", drehung: 180 }, true)).toBe("z+");
    expect(frontDerReihe({ front: "rechts", drehung: 0 }, false, 270)).toBe("z-");
  });
});

describe("3D-Szene: Wände, Türen, Volieren, eingesetzte Blöcke", () => {
  test("Eingang öffnet die Wand bis zur Türhöhe, darüber Sturz; Notausgang erkannt", () => {
    const h: Halle = { ...halle, flaechen: [{ name: "Eingang", art: "eingang", x: 600, y: 0, breite: 300, tiefe: 100 }, { name: "Notausgang", art: "eingang", x: 0, y: 2000, breite: 80, tiefe: 150 }] };
    const s = hallenSzene(h, planeHalle(h, [], masse), masse);
    expect(s.tueren.map((t) => [t.name, t.notausgang])).toEqual([
      ["Eingang", false],
      ["Notausgang", true],
    ]);
    const tuer = s.tueren[0]!.q;
    expect(tuer).toEqual({ x: 600, z: -s.wandDicke, y: 0, b: 300, t: s.wandDicke, h: TUER_HOEHE });
    // Wand an z = 0: von 0 bis 600 und von 900 bis 1500 voll hoch, dazwischen nur der Sturz.
    const vorn = s.waende.filter((w) => w.z === -s.wandDicke && w.t === s.wandDicke && w.b < 1500 && w.b > s.wandDicke);
    expect(vorn.map((w) => [w.x, w.b, w.y, w.h]).sort((a, b) => a[0]! - b[0]! || a[2]! - b[2]!)).toEqual([
      [0, 600, 0, WAND_HOEHE],
      [600, 300, TUER_HOEHE, WAND_HOEHE - TUER_HOEHE],
      [900, 600, 0, WAND_HOEHE],
    ]);
    // Notausgang an der Wand x = 0 (steht, also lange Seite an dieser Wand).
    expect(s.tueren[1]!.q).toMatchObject({ x: -s.wandDicke, z: 2000, t: 150 });
  });

  test("Volieren stehen am Boden in ihrem Maß, mit mehreren Tieren; eingesetzter Block auf Aufsteller", () => {
    const h: Halle = {
      ...halle,
      flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 2400, breite: 1500, tiefe: 600 }],
      objekte: [
        { id: "v1", art: "voliere", x: 300, y: 1800, drehung: 0 },
        { id: "b1", art: "kaefigblock", typ: "zwerghuehner", x: 900, y: 1800, drehung: 0 },
      ],
    };
    const tiere = [tier(1, "voliere", "1", "Fasan", "Ziergeflügel"), tier(2, "voliere", "2", "Laufenten", "Wassergeflügel")];
    const plan = planeHalle(h, tiere, masse);
    const s = hallenSzene(h, plan, masse, { hoehe: 70 });
    expect(s.volieren).toHaveLength(2);
    const eingesetzt = s.volieren.find((v) => v.name === "Voliere 1")!;
    expect(eingesetzt.q).toEqual({ x: 300, z: 1800, y: 0, b: 200, t: 100, h: 190 });
    expect(eingesetzt.figuren).toBeGreaterThanOrEqual(2);
    expect(s.volieren.map((v) => v.tier?.figur).sort()).toEqual(["ente", "huhn"]);
    // Block: Aufsteller in der Grundfläche des Blocks, vier leere Zwerghuhnkäfige darauf.
    const block = plan.objekte.find((o) => o.id === "b1")!;
    expect(s.aufsteller).toContainEqual({ x: 900, z: 1800, y: 0, b: block.rechteck.b, t: block.rechteck.h, h: 70 });
    const imBlock = s.kaefige.filter((k) => k.ort === block.name);
    expect(imBlock).toHaveLength(4);
    expect(imBlock.every((k) => !k.tier && k.q.y === 70 && k.q.h === 50)).toBe(true);
  });

  test("Standpunkt im Gang: zwischen zwei Reihen mit Front zueinander, in Augenhöhe", () => {
    const tiere = Array.from({ length: 40 }, (_, i) => tier(i + 1, "huehner", String(i + 1)));
    const plan = planeHalle(halle, tiere, masse);
    const g = gangStandpunkt(halle, plan);
    expect(g.von.y).toBe(165);
    // Reihen quer: der Gang läuft entlang x, der Standpunkt liegt zwischen den Reihen (in z) und frei von Käfigen.
    expect(g.von.z).toBe(g.nach.z);
    const s = hallenSzene(halle, plan, masse);
    const imGang = s.kaefige.some((k) => g.von.z > k.q.z && g.von.z < k.q.z + k.q.t && g.nach.x > k.q.x);
    expect(imGang).toBe(false);
  });
});

describe("Tierfiguren", () => {
  test("Figur nach Sparte und Rasse", () => {
    expect(figurFuer({ typ: "huehner", sparte: "Hühner", rasse: "Wyandotten" })).toBe("huhn");
    expect(figurFuer({ typ: "zwerghuehner", sparte: "Zwerghühner", rasse: "Zwerg-Wyandotten" })).toBe("zwerghuhn");
    expect(figurFuer({ typ: "tauben", sparte: "Tauben", rasse: "Kingtauben" })).toBe("taube");
    expect(figurFuer({ typ: "huehner", sparte: "Wassergeflügel", rasse: "Laufenten" })).toBe("ente");
    expect(figurFuer({ typ: "grosskaefig", sparte: "Wassergeflügel", rasse: "Diepholzer Gänse" })).toBe("gans");
    expect(figurFuer({ typ: "grosskaefig", sparte: "Puten", rasse: "Bronzeputen" })).toBe("pute");
  });

  test("Zwerghuhn kleiner als Huhn; Figur passt in den Käfig", () => {
    const h: Halle = { ...halle, flaechen: [] };
    const plan = planeHalle(h, [tier(1, "huehner", "1"), tier(2, "zwerghuehner", "2", "Zwerg-Wyandotten", "Zwerghühner"), tier(3, "tauben", "3", "Kingtauben", "Tauben")], masse);
    const s = hallenSzene(h, plan, masse);
    const g = (id: number) => s.kaefige.find((k) => k.tier?.id === id)!;
    expect(g(2).tier!.groesse).toBeLessThan(g(1).tier!.groesse);
    for (const id of [1, 2, 3]) expect(g(id).tier!.groesse).toBeLessThanOrEqual(g(id).q.h * 0.75 + 1e-9);
  });

  test("Gefiederfarbe aus Farbenschlag, sonst aus der Rasse, immer gleich", () => {
    expect(gefiederFarbe("weiß", "Wyandotten")).toBe("#f3f0e8");
    expect(gefiederFarbe("schwarz-weißgescheckt", "Zwerg-Cochin")).toBe("#2a2a2e");
    expect(gefiederFarbe(null, "Blaue Wiener")).toBe("#8d97a6");
    expect(gefiederFarbe(null, "Italiener")).toBe(gefiederFarbe(undefined, "Italiener"));
  });
});

describe("3D-Szene: Tische und Bänke", () => {
  test("Garnitur als Tisch mit zwei Bänken in ihrer Grundfläche; Tisch und Bank für sich", () => {
    const h: Halle = { ...halle, objekte: [{ id: "g", art: "garnitur", x: 100, y: 2600, drehung: 0 }, { id: "t", art: "tisch", x: 600, y: 2600, drehung: 90 }, { id: "b", art: "bank", x: 900, y: 2600, drehung: 0, laenge: 300 }] };
    const s = hallenSzene(h, planeHalle(h, [], masse), masse);
    expect(s.moebel.map((m) => [m.name, m.art, m.q.x, m.q.z, m.q.b, m.q.t, m.q.h])).toEqual([
      ["Garnitur 1", "bank", 100, 2600, 220, 25, 47],
      ["Garnitur 1", "tisch", 100, 2640, 220, 50, 77],
      ["Garnitur 1", "bank", 100, 2705, 220, 25, 47],
      ["Tisch 1", "tisch", 600, 2600, 50, 220, 77],
      ["Bank 1", "bank", 900, 2600, 300, 25, 47],
    ]);
    // Keine Aufsteller und keine Käfige für Möbel.
    expect(s.aufsteller).toEqual([]);
    expect(s.kaefige).toEqual([]);
  });
});


describe("3D-Szene: Käfige richtig herum", () => {
  /** Streifen von `tief` cm vor der Front eines Käfigs (Hallenkoordinaten x/z). */
  const vorDerFront = (k: { q: Quader; front: string }, tief: number) => {
    const { x, z, b, t } = k.q;
    if (k.front === "x+") return { x: x + b, z, b: tief, t };
    if (k.front === "x-") return { x: x - tief, z, b: tief, t };
    if (k.front === "z+") return { x, z: z + t, b, t: tief };
    return { x, z: z - tief, b, t: tief };
  };
  const schneidet = (a: { x: number; z: number; b: number; t: number }, c: Quader) => a.x < c.x + c.b - 0.5 && c.x < a.x + a.b - 0.5 && a.z < c.z + c.t - 0.5 && c.z < a.z + a.t - 0.5;
  const pruefe = (h: Halle, tiere: PlanTier[]) => {
    const { halle: neu, plan } = neuSetzen(h, tiere, masse);
    const s = hallenSzene(neu, plan, masse);
    const fehler: string[] = [];
    for (const k of s.kaefige) {
      const vorn = vorDerFront(k, 30);
      // Vor dem Gitter steht kein anderer Käfig und keine Wand.
      if (s.kaefige.some((x) => x !== k && schneidet(vorn, x.q))) fehler.push(`${k.ort}: Käfig vor der Front`);
      if (vorn.x < -0.5 || vorn.z < -0.5 || vorn.x + vorn.b > h.breite + 0.5 || vorn.z + vorn.t > h.laenge + 0.5) fehler.push(`${k.ort}: Front zur Wand`);
    }
    return { fehler: [...new Set(fehler)], plan, s };
  };
  const viele = () => {
    let n = 0;
    const art = (k: number, typ: PlanTier["typ"], sparte: string) => Array.from({ length: k }, () => tier(++n + 5000, typ, String(n), "Rasse", sparte));
    return [...art(60, "huehner", "Hühner"), ...art(150, "zwerghuehner", "Zwerghühner"), ...art(1100, "tauben", "Tauben")];
  };

  test.each([
    ["quer, Wandreihen an beiden Wänden", { richtung: "quer" as const, wandreihen: true }],
    ["längs, Wandreihen an beiden Wänden", { richtung: "laengs" as const, wandreihen: true }],
    ["quer, ohne Wandreihen", { richtung: "quer" as const, wandreihen: false }],
    ["längs, Einzelreihe nur am Anfang", { richtung: "laengs" as const, wandreihen: true, wandreiheSeite: "anfang" as const }],
  ])("%s: jede Gitterfront zeigt zum Gang, auch in eingesetzten Blöcken", (_n, e) => {
    const h: Halle = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, hauptgang: { breite: 300, lage: "anfang" }, ...e, flaechen: [] };
    const { fehler, plan, s } = pruefe(h, viele());
    expect(fehler).toEqual([]);
    // Eingesetzte Blöcke (quer läuft die Halle über, längs ist für Blöcke kein Platz in den Reihen): Front wie ihre Reihe.
    const bloecke = plan.objekte.filter((o) => o.art === "kaefigblock");
    if (e.richtung === "quer") expect(bloecke.length).toBeGreaterThan(0);
    const imBlock = (b: (typeof bloecke)[number]) => s.kaefige.filter((k) => k.ort === b.name && k.q.x >= b.rechteck.x - 0.5 && k.q.z >= b.rechteck.y - 0.5 && k.q.x + k.q.b <= b.rechteck.x + b.rechteck.b + 0.5 && k.q.z + k.q.t <= b.rechteck.y + b.rechteck.h + 0.5);
    for (const b of bloecke) expect(imBlock(b).map((k) => k.front)).toEqual(imBlock(b).map(() => b.front!));
  });

  test("Doppelreihe: Rücken an Rücken, die Fronten zeigen voneinander weg; Wandreihe mit dem Rücken zur Wand", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    const p = planeHalle(h, Array.from({ length: 60 }, (_, i) => tier(i + 1, "huehner", String(i + 1))), masse);
    const s = hallenSzene(h, p, masse);
    const r = (nr: number) => s.kaefige.filter((k) => k.ort === `R${nr}`);
    // R1 an der linken Wand: Rücken an der Wand, Front nach rechts.
    expect(new Set(r(1).map((k) => k.front))).toEqual(new Set(["x+"]));
    expect(Math.min(...r(1).map((k) => k.q.x))).toBe(0);
    // R2/R3 Doppelreihe: R2 nach links, R3 nach rechts, die Rückwände aneinander.
    expect(new Set(r(2).map((k) => k.front))).toEqual(new Set(["x-"]));
    expect(new Set(r(3).map((k) => k.front))).toEqual(new Set(["x+"]));
    expect(Math.max(...r(2).map((k) => k.q.x + k.q.b))).toBe(Math.min(...r(3).map((k) => k.q.x)));
  });

  test("Block: Front aus seiner Angabe (objektFront), ohne Angabe zur langen Seite", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    const sechs = Array.from({ length: 6 }, (_, i) => tier(i + 1, "huehner", String(i + 1)));
    const mit: Halle = {
      ...h,
      objekte: [
        { id: "links", art: "kaefigblock", typ: "huehner", x: 263, y: 1500, drehung: 90, front: "x-" },
        { id: "frei", art: "kaefigblock", typ: "huehner", x: 400, y: 1500, drehung: 0 },
      ],
    };
    const s = hallenSzene(mit, planeHalle(mit, sechs, masse), masse);
    const p = planeHalle(mit, sechs, masse);
    const fronten = (id: string) => [...new Set(s.kaefige.filter((k) => k.ort === p.objekte.find((o) => o.id === id)!.name && k.q.x >= p.objekte.find((o) => o.id === id)!.rechteck.x - 0.5 && k.q.x < p.objekte.find((o) => o.id === id)!.rechteck.x + p.objekte.find((o) => o.id === id)!.rechteck.b).map((k) => k.front))];
    expect(fronten("links")).toEqual(["x-"]);
    expect(fronten("frei")).toEqual(["z+"]);
  });
});

describe("3D-Szene wie der 2D-Plan (nicht spiegelverkehrt)", () => {
  // Beispielhalle: 15,5 × 27,5 m – im Plan liegt sie quer (lange Seite waagrecht): Notausgang oben links, E1 rechts,
  // E2 und Nebeneingang unten.
  const beispielhalle: Halle = {
    ...HALLE_STANDARD,
    breite: 1550,
    laenge: 2750,
    gang: 150,
    richtung: "quer",
    wandreihen: true,
    wandBuendig: true,
    hauptgang: { breite: 300, lage: "beide" },
    flaechen: [
      { name: "Notausgang", art: "eingang", x: 0, y: 100, breite: 50, tiefe: 120 },
      { name: "Nebeneingang", art: "eingang", x: 1500, y: 600, breite: 50, tiefe: 150 },
      { name: "E2", art: "eingang", x: 1500, y: 800, breite: 50, tiefe: 100 },
      { name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 },
    ],
  };
  const tiere = Array.from({ length: 120 }, (_, i) => tier(i + 1, "huehner", String(i + 1)));

  test("Von oben wie die Zeichnung: x nach rechts, z nach unten; Notausgang oben links, E1 rechts, E2 und Nebeneingang unten", () => {
    const plan = planeHalle(beispielhalle, tiere, masse);
    const s = szeneWieImPlan(beispielhalle, plan, masse);
    const z = zeichnungDerHalle(beispielhalle);
    expect(z.quer).toBe(true);
    expect([s.breite, s.laenge]).toEqual([z.W, z.H]);
    // Jeder Käfig liegt genau dort, wo ihn die Zeichnung hat.
    const k = plan.reihen.flatMap((r) => r.kaefige);
    for (const [i, kk] of s.kaefige.filter((x) => x.tier).entries()) {
      const g = z.zuZeichnung(k.find((x) => x.id === kk.tier!.id)!.rechteck);
      expect([kk.q.x, kk.q.z, kk.q.b, kk.q.t]).toEqual([g.x, g.y, g.b, g.h]);
      if (i > 20) break;
    }
    // Türen: Kamera von oben (bzw. von Süden, z groß): links = kleines x, hinten/oben = kleines z.
    const tuer = (n: string) => s.tueren.find((t) => t.name === n)!.q;
    expect(tuer("Notausgang").x).toBeLessThan(s.breite / 4);
    expect(tuer("Notausgang").z).toBeLessThan(0);
    expect(tuer("E1").x).toBeGreaterThanOrEqual(s.breite);
    expect(tuer("E1").z).toBeGreaterThan(s.laenge / 2);
    for (const n of ["E2", "Nebeneingang"]) expect(tuer(n).z).toBeGreaterThanOrEqual(s.laenge);
    // Gegenprobe: ein Objekt links oben im Plan liegt in der Szene links hinten.
    const ecke = { ...beispielhalle, objekte: [{ id: "t", art: "tisch" as const, x: 400, y: 300, drehung: 0 as const }] };
    const m = szeneWieImPlan(ecke, planeHalle(ecke, [], masse), masse).moebel[0]!.q;
    const g = z.zuZeichnung({ x: 400, y: 300, b: 220, h: 50 });
    expect([m.x, m.z, m.b, m.t]).toEqual([g.x, g.y, g.b, g.h]);
    expect(m.x).toBeLessThan(s.breite / 2);
    expect(m.z).toBeLessThan(s.laenge / 2);
  });

  test("Fronten bleiben zum Gang, auch vertauscht; Halle breiter als lang bleibt unverändert", () => {
    const s = szeneWieImPlan(beispielhalle, planeHalle(beispielhalle, tiere, masse), masse);
    for (const k of s.kaefige) {
      const q = k.q;
      const vorn = k.front === "x+" ? { x: q.x + q.b, z: q.z } : k.front === "x-" ? { x: q.x - 1, z: q.z } : k.front === "z+" ? { x: q.x, z: q.z + q.t } : { x: q.x, z: q.z - 1 };
      expect(vorn.x >= -0.5 && vorn.z >= -0.5 && vorn.x <= s.breite + 0.5 && vorn.z <= s.laenge + 0.5).toBe(true);
    }
    const breit: Halle = { ...beispielhalle, breite: 2750, laenge: 1550, flaechen: [] };
    const sb = szeneWieImPlan(breit, planeHalle(breit, tiere, masse), masse);
    expect([sb.breite, sb.laenge]).toEqual([2750, 1550]);
  });
});


describe("Wände blenden sich aus, wenn sie die Sicht verdecken", () => {
  const h: Halle = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, flaechen: [{ name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 }] };
  const s = szeneWieImPlan(h, planeHalle(h, [], masse), masse);
  const mitte = { x: s.breite / 2, y: 60, z: s.laenge / 2 };
  const seite = (n: string) => s.waende.filter((w) => wandSeiten(w, s).join() === n);
  const deck = (n: string, kamera: { x: number; y: number; z: number }, ziel = mitte) => seite(n).map((w) => wandDeckkraft(w, s, kamera, ziel));

  test("jedes Wandstück gehört zu einer Seite, Ecken zu zweien", () => {
    for (const w of s.waende) expect(wandSeiten(w, s).length).toBeGreaterThanOrEqual(1);
    expect(s.waende.filter((w) => wandSeiten(w, s).length === 2)).toHaveLength(4);
  });

  test("Rundum von Süden: die vordere Wand fast weg, die übrigen stehen", () => {
    const kamera = { x: mitte.x - 500, y: 1800, z: s.laenge + 2000 };
    for (const d of deck("z1", kamera)) expect(d).toBe(WAND_DURCHSICHTIG);
    for (const n of ["z0", "x0", "x1"]) for (const d of deck(n, kamera)) expect(d).toBe(1);
    // Die Ecken an der vorderen Wand gehen mit.
    for (const w of s.waende.filter((x) => wandSeiten(x, s).includes("z1"))) expect(wandDeckkraft(w, s, kamera, mitte)).toBe(WAND_DURCHSICHTIG);
  });

  test("weich: knapp vor der Wand halb, innen ganz", () => {
    const an = (z: number) => deck("z1", { x: mitte.x, y: 1000, z: s.laenge + z }, { x: mitte.x, y: 0, z: s.laenge - 3000 })[0]!;
    expect(an(-50)).toBe(1);
    expect(an(40)).toBeGreaterThan(0.3);
    expect(an(40)).toBeLessThan(0.8);
    expect(an(200)).toBe(WAND_DURCHSICHTIG);
  });

  test("hineingezoomt von oben: alle Wände durchsichtiger, je näher, desto mehr", () => {
    const ziel = { x: mitte.x, y: 0, z: mitte.z };
    const fern = deck("z0", { x: mitte.x, y: 2600, z: mitte.z + 10 }, ziel)[0]!;
    const halb = deck("z0", { x: mitte.x, y: 1200, z: mitte.z + 10 }, ziel)[0]!;
    const nah = deck("z0", { x: mitte.x, y: 500, z: mitte.z + 10 }, ziel)[0]!;
    expect(fern).toBe(1);
    expect(halb).toBeLessThan(fern);
    expect(nah).toBeLessThan(halb);
    expect(nah).toBeCloseTo(0.35, 2);
  });

  test("im Gang in Augenhöhe: keine Wand verschwindet; von außen durch eine Wand: nur diese", () => {
    const gang = s.gang;
    for (const w of s.waende) expect(wandDeckkraft(w, s, gang.von, gang.nach)).toBe(1);
    const draussen = { x: -300, y: 165, z: mitte.z };
    for (const d of deck("x0", draussen)) expect(d).toBe(WAND_DURCHSICHTIG);
    for (const d of deck("x1", draussen)) expect(d).toBe(1);
  });

  test("Türen bleiben beschriftet", () => {
    expect(s.beschriftungen.some((b) => b.text === "E1")).toBe(true);
  });
});

describe("Innenseiten der Wände (Turnhallen-Gestaltung)", () => {
  const h: Halle = {
    ...HALLE_STANDARD,
    breite: 1550,
    laenge: 2750,
    flaechen: [
      { name: "Notausgang", art: "eingang", x: 0, y: 100, breite: 50, tiefe: 120 },
      { name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 },
    ],
  };
  const s = szeneWieImPlan(h, planeHalle(h, [], masse), masse);
  test("decken jede Wand bis auf die Türöffnungen; über Türen der Sturz; keine Ecken", () => {
    const innen = wandInnenseiten(s);
    expect(innen.every((x) => s.waende[x.wand]!.b > s.wandDicke || s.waende[x.wand]!.t > s.wandDicke)).toBe(true);
    for (const seite of ["x0", "x1", "z0", "z1"] as const) {
      const lang = seite[0] === "z" ? s.breite : s.laenge;
      const unten = innen.filter((x) => x.seite === seite && x.y === 0).reduce((n, x) => n + x.bis - x.von, 0);
      const tuer = s.tueren.filter((t) => wandSeiten({ ...t.q, h: 1 }, s).includes(seite)).reduce((n, t) => n + (seite[0] === "z" ? t.q.b : t.q.t), 0);
      expect(unten + tuer).toBeCloseTo(lang, 6);
      // Über jeder Tür ein Sturz bis unter die Decke.
      expect(innen.filter((x) => x.seite === seite && x.y === TUER_HOEHE)).toHaveLength(s.tueren.filter((t) => wandSeiten({ ...t.q, h: 1 }, s).includes(seite)).length);
    }
  });
});

describe("Sockelverkleidung unter den Grundplatten", () => {
  // Längs, Wandreihe links (R1), Doppelreihe R2/R3: Fronten x+ (R1), x− (R2), x+ (R3).
  const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 900, wandreihen: true, wandreiheSeite: "anfang", hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
  const plan = planeHalle(h, Array.from({ length: 30 }, (_, i) => tier(i + 1, "huehner", String(i + 1))), masse);
  const s = hallenSzene(h, plan, masse, { hoehe: 80 });
  const imStreifen = (r: number) => {
    const pl = plan.reihen.find((x) => x.nr === r)!.platten.filter((p) => !p.entfernt).map((p) => p.rechteck);
    const x0 = Math.min(...pl.map((p) => p.x)), x1 = Math.max(...pl.map((p) => p.x + p.b));
    return { x0, x1, z0: Math.min(...pl.map((p) => p.y)), z1: Math.max(...pl.map((p) => p.y + p.h)) };
  };

  test("je Stück Reihe eine Bahn an der Front und zwei an den Stirnseiten, vom Boden bis unter die Grundplatte", () => {
    expect(plan.reihen.slice(0, 3).map((r) => r.front)).toEqual(["rechts", "links", "rechts"]);
    const reihen = [1, 2, 3].filter((r) => plan.reihen.find((x) => x.nr === r)!.platten.length);
    expect(s.schuerzen).toHaveLength(reihen.length * 3);
    for (const b of s.schuerzen) {
      expect(b.q.y).toBe(0);
      expect(b.q.h).toBe(80 - PLATTEN_STAERKE);
    }
    const r1 = imStreifen(1);
    const front1 = s.schuerzen.filter((b) => b.aussen === "x+" && Math.abs(b.q.x - r1.x1) < 0.5);
    expect(front1).toHaveLength(1);
    expect(front1[0]!.laenge).toBe(r1.z1 - r1.z0);
  });

  test("keine Bahn an der Wand und keine zwischen den Rücken der Doppelreihe", () => {
    // Wand: keine Bahn mit Blick x− an R1 (Rücken an x = 0).
    expect(s.schuerzen.some((b) => b.aussen === "x-" && b.q.x + b.q.b <= 0.5)).toBe(false);
    // Doppelreihe: zwischen R2 (Rücken bei x1) und R3 (Rücken bei x0) liegt keine Bahn.
    const r2 = imStreifen(2), r3 = imStreifen(3);
    expect(Math.abs(r2.x1 - r3.x0)).toBeLessThan(0.5);
    const mitte = r2.x1;
    expect(s.schuerzen.some((b) => (b.aussen === "x+" || b.aussen === "x-") && b.q.x < mitte + 1.5 && b.q.x + b.q.b > mitte - 1.5)).toBe(false);
  });

  test("Verkleidung aus: keine Bahnen; Vorgabe an, weiß, ohne Bild", () => {
    expect(hallenSzene(h, plan, masse, { hoehe: 80, verkleidung: { an: false, farbe: "#000000", bildId: null } }).schuerzen).toEqual([]);
    expect(verkleidungVon(null)).toEqual(VERKLEIDUNG_STANDARD);
    expect(VERKLEIDUNG_STANDARD).toEqual({ an: true, farbe: "#f7f4ee", bildId: null });
    expect(verkleidungVon({ hoehe: 70, verkleidung: { an: true, farbe: "#123456", bildId: 5 } }).bildId).toBe(5);
  });

  test("eingesetzter Block: Bahn an seiner Front", () => {
    const mit: Halle = { ...h, objekte: [{ id: "b", art: "kaefigblock", typ: "huehner", x: 700, y: 600, drehung: 90, front: "x-" }] };
    const sb = hallenSzene(mit, planeHalle(mit, [], masse), masse);
    const b = planeHalle(mit, [], masse).objekte[0]!.rechteck;
    expect(sb.schuerzen.filter((x) => x.aussen === "x-" && Math.abs(x.q.x + x.q.b - b.x) < 0.5)).toHaveLength(1);
    expect(sb.schuerzen.some((x) => x.aussen === "x+" && Math.abs(x.q.x - (b.x + b.b)) < 0.5)).toBe(false);
    // Front ohne, Stirnseiten mit Kennzeichen „stirn“ (dort nur weiß, kein Logo).
    expect(sb.schuerzen.filter((x) => !x.stirn).map((x) => x.aussen)).toEqual(["x-"]);
    expect(sb.schuerzen.filter((x) => x.stirn).map((x) => x.aussen).sort()).toEqual(["z+", "z-"]);
  });
});

describe("Volieren mit Front wie im Plan", () => {
  test("Volierenbereich und eingesetzte Voliere: Front aus dem Plan, auch in der Szene wie die Zeichnung", () => {
    const h: Halle = {
      ...HALLE_STANDARD,
      breite: 1550,
      laenge: 2750,
      flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 2200, breite: 1550, tiefe: 550 }],
      objekte: [{ id: "v", art: "voliere", x: 600, y: 1200, drehung: 0, front: "z-" }],
    };
    const tiere = [tier(1, "voliere", "1", "Fasan", "Ziergeflügel"), tier(2, "voliere", "2", "Laufenten", "Wassergeflügel"), tier(3, "voliere", "3", "Pfau", "Ziergeflügel")];
    const plan = planeHalle(h, tiere, masse);
    const s = hallenSzene(h, plan, masse);
    const eingesetzt = s.volieren.find((v) => v.name === "Voliere 1")!;
    expect(eingesetzt.front).toBe("z-");
    const imBereich = s.volieren.filter((v) => v.name !== "Voliere 1");
    expect(imBereich.length).toBe(2);
    for (const v of imBereich) expect(v.front).toBeDefined();
    for (const v of imBereich) expect(v.front).toBe(plan.volieren.find((x) => x.rechteck.x === v.q.x && x.rechteck.y === v.q.z)!.front);
    // In der Szene wie im Plan (Halle quer): Achsen und Fronten vertauscht.
    const wie = szeneWieImPlan(h, plan, masse);
    expect(wie.volieren.find((v) => v.name === "Voliere 1")!.front).toBe("x-");
  });
});

describe("Verkleidung weiß mit wiederkehrendem Logo", () => {
  test("Vorgabe weiß; die frühere dunkle Vorgabe gilt als nicht gesetzt; eine gewählte Farbe bleibt", () => {
    expect(verkleidungVon(null)).toEqual({ an: true, farbe: "#f7f4ee", bildId: null });
    expect(verkleidungVon({ hoehe: 80, verkleidung: { an: true, farbe: "#2f3a33", bildId: 4 } })).toEqual({ an: true, farbe: "#f7f4ee", bildId: 4 });
    expect(verkleidungVon({ hoehe: 80, verkleidung: { an: false, farbe: "#123456", bildId: null } }).farbe).toBe("#123456");
  });

  test("Logo: alle 1–1,5 m, mittig in der Höhe, Seitenverhältnis erhalten, mit Rand", () => {
    for (const [bw, bh] of [[400, 400], [800, 300], [300, 600], [1000, 400]] as const) {
      const k = verkleidungsKachel(76, bw, bh);
      expect(k.laenge).toBeGreaterThanOrEqual(100);
      expect(k.laenge).toBeLessThanOrEqual(150);
      expect(k.logo.b / k.logo.h).toBeCloseTo(bw / bh, 6);
      expect(k.logo.x).toBeGreaterThan(0);
      expect(k.logo.x + k.logo.b).toBeLessThan(k.laenge);
      expect(k.logo.y).toBeGreaterThanOrEqual(76 * 0.12 - 1e-9);
      expect(k.logo.y + k.logo.h).toBeLessThanOrEqual(76 - 76 * 0.12 + 1e-9);
      expect(k.logo.y + k.logo.h / 2).toBeCloseTo(38, 6);
    }
  });

  test("breites Banner (über 3:1): in Bahnhöhe wiederholt, nicht verzerrt", () => {
    const k = verkleidungsKachel(76, 1200, 300);
    expect(k.logo.h).toBeCloseTo(76 - 2 * 76 * 0.12, 6);
    expect(k.logo.b / k.logo.h).toBeCloseTo(4, 6);
    expect(k.laenge).toBeCloseTo(k.logo.b + 2 * 76 * 0.12, 6);
  });
});
