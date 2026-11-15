/** Tiere ohne Platz je Käfiggröße: Anzahl, Tiere, was sich einsetzen lässt. */
import { describe, expect, test } from "bun:test";
import { fehlendeEinsetzen, fehlendeKaefige, freieStelle, type Belegt } from "./hallenplan-fehlend";
import { kaefigAnzahl } from "./kaefige";
import { eingangsGang, HALLE_STANDARD, planeHalle, type Halle, type Hallenplan, type PlanTier, type Rechteck } from "./hallenplan";

const tier = (id: number, typ: PlanTier["typ"], nr: string | null, rasse = "R"): PlanTier => ({ id, typ, nr, rasse, preisrichterId: null });

describe("Hallenplan: fehlende Käfige", () => {
  test("je Käfiggröße Anzahl und Tiere in Planfolge; Blöcke nach Käfigen je Grundplatte", () => {
    const g = fehlendeKaefige(
      [tier(1, "zwerghuehner", "256", "Zwerg-Wyandotten"), tier(2, "tauben", "300", "Kingtauben"), ...[3, 4, 5, 6].map((i) => tier(i, "zwerghuehner", String(254 + i))), tier(7, "tauben", null, "Strasser")],
      { zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } },
      HALLE_STANDARD,
    );
    expect(g.map((x) => [x.typ, x.anzahl, x.einsetzen, x.noetig])).toEqual([
      ["zwerghuehner", 5, "kaefigblock", 2], // 4 je Grundplatte
      ["tauben", 2, "kaefigblock", 1], // 5 je Grundplatte
    ]);
    expect(g[0]!.tiere[0]).toEqual({ id: 1, nr: "256", rasse: "Zwerg-Wyandotten" });
    expect(g[1]!.tiere.map((t) => t.nr ?? t.rasse)).toEqual(["300", "Strasser"]);
  });

  test("eigene Angabe „Käfige je Grundplatte“ zählt; Volieren je Tier; ohne Maß nichts einzusetzen", () => {
    const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const g = fehlendeKaefige([tier(1, "huehner", "1"), tier(2, "huehner", "2"), tier(3, "voliere", "3"), tier(4, "voliere", "4"), tier(5, "stamm", "5")], masse, { ...HALLE_STANDARD, jePlatte: { huehner: 1 } });
    expect(g.map((x) => [x.typ, x.einsetzen, x.noetig])).toEqual([
      ["huehner", "kaefigblock", 2],
      ["voliere", "voliere", 2],
      ["stamm", null, 0],
    ]);
  });

  test("alle haben Platz: leer", () => {
    expect(fehlendeKaefige([], {}, HALLE_STANDARD)).toEqual([]);
  });
});

describe("Hallenplan: freier Platz für ein neues Teil", () => {
  const halle = { breite: 1000, laenge: 2000 };
  const block = { b: 200, h: 50 };
  test("frei: genau am Startpunkt", () => {
    expect(freieStelle(halle, [], block, { x: 400, y: 950 })).toEqual({ x: 400, y: 950 });
  });
  test("belegt (z. B. vom ersten Block): der nächste freie Platz daneben, nicht darauf", () => {
    const p = freieStelle(halle, [{ x: 400, y: 950, b: 200, h: 50 }], block, { x: 400, y: 950 });
    expect(p).not.toEqual({ x: 400, y: 950 });
    expect(Math.abs(p.x - 400) + Math.abs(p.y - 950)).toBe(50);
  });
  test("bleibt in der Halle; ist nirgends Platz, bleibt es beim Start", () => {
    const p = freieStelle(halle, [{ x: 0, y: 0, b: 1000, h: 1950 }], block, { x: 400, y: 950 });
    expect(p.y).toBeGreaterThanOrEqual(1950);
    expect(p.y + block.h).toBeLessThanOrEqual(2000);
    expect(freieStelle(halle, [{ x: 0, y: 0, b: 1000, h: 2000 }], block, { x: 400, y: 950 })).toEqual({ x: 400, y: 950 });
  });
});

describe("Hallenplan: alle fehlenden Käfige einsetzen", () => {
  const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
  // Längs, 10 × 20 m, zwei Doppelreihen ohne Wandreihen, kein Hauptgang: R1 eine Hühnerplatte, direkt dahinter zwei Taubenplatten (lückenlos).
  const halle: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
  const tiere: PlanTier[] = [...[1, 2, 3].map((i) => ({ ...tier(i, "huehner", String(i)), sparte: "Hühner" })), ...Array.from({ length: 10 }, (_, i) => ({ ...tier(10 + i, "tauben", String(10 + i)), sparte: "Tauben" }))];
  const plan = planeHalle(halle, tiere, masse);
  const belegt = (p: Hallenplan): Belegt[] => p.reihen.flatMap((r) => r.platten.map((pl) => ({ q: pl.rechteck, typ: pl.typ })));
  const fehlend = Array.from({ length: 12 }, (_, i) => tier(100 + i, "tauben", String(100 + i)));
  const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - 0.5 && q.y >= a.y - 0.5 && q.x + q.b <= a.x + a.b + 0.5 && q.y + q.h <= a.y + a.h + 0.5;
  const ueber = (a: Rechteck, b: Rechteck) => a.x < b.x + b.b - 0.5 && b.x < a.x + a.b - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

  test("so viele Blöcke wie nötig, bündig hinter die Taubenplatten derselben Reihe, hinten wie die Platten", () => {
    const r2 = plan.reihen[0]!;
    expect(r2.platten.map((pl) => pl.typ)).toEqual(["huehner", "tauben", "tauben"]);
    const { einsaetze, ohne } = fehlendeEinsetzen({ ...plan, nichtPlatziert: fehlend }, halle, masse, belegt(plan));
    expect(ohne).toBe(0);
    expect(einsaetze).toHaveLength(3); // 12 Tauben, 5 je Grundplatte
    const ende = Math.max(...r2.platten.map((pl) => pl.rechteck.y + pl.rechteck.h));
    expect(einsaetze.map((e) => e.rechteck.y)).toEqual([ende, ende + 200, ende + 400]);
    for (const e of einsaetze) expect(e).toMatchObject({ art: "kaefigblock", typ: "tauben", drehung: 90, x: r2.platten[1]!.rechteck.x });
  });

  test("nie in Gänge oder auf etwas anderes: jedes Teil liegt in einem nutzbaren Abschnitt einer Reihe", () => {
    const viele = Array.from({ length: 200 }, (_, i) => tier(300 + i, "tauben", String(300 + i)));
    const { einsaetze, ohne } = fehlendeEinsetzen({ ...plan, nichtPlatziert: viele }, halle, masse, belegt(plan));
    expect(einsaetze.length).toBeGreaterThan(3);
    expect(ohne).toBe(200 - einsaetze.length * 5);
    const abschnitte = plan.reihen.flatMap((r) => r.flaechen);
    einsaetze.forEach((e, i) => {
      expect(abschnitte.some((a) => innen(e.rechteck, a))).toBe(true);
      expect(belegt(plan).some((b) => ueber(b.q, e.rechteck))).toBe(false);
      expect(einsaetze.some((x, j) => j !== i && ueber(x.rechteck, e.rechteck))).toBe(false);
    });
  });

  test("nur eine Käfigart, höchstens ein Block; die übrigen bleiben ohne Platz", () => {
    const { einsaetze, ohne } = fehlendeEinsetzen({ ...plan, nichtPlatziert: [...fehlend, tier(500, "huehner", "500")] }, halle, masse, belegt(plan), { typ: "tauben", hoechstens: 1 });
    expect(einsaetze).toHaveLength(1);
    expect(ohne).toBe(12 - 5 + 1);
  });

  test("kein Platz: nichts eingesetzt, alle bleiben ohne Platz", () => {
    const voll: Belegt[] = plan.reihen.flatMap((r) => r.flaechen.map((q) => ({ q })));
    expect(fehlendeEinsetzen({ ...plan, nichtPlatziert: fehlend }, halle, masse, voll)).toEqual({ einsaetze: [], ohne: 12 });
  });
});

describe("Käfige: Anzahl mit Art und Maß", () => {
  test("Mehrzahl, Einzahl, ohne Maß", () => {
    const masse = { tauben: { breite: 40, tiefe: 40, hoehe: 40 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 } };
    expect(kaefigAnzahl(34, "tauben", masse)).toBe("34 Taubenkäfige (40 × 40 × 40 cm)");
    expect(kaefigAnzahl(12, "zwerghuehner", masse)).toBe("12 Zwerghuhnkäfige (50 × 50 × 50 cm)");
    expect(kaefigAnzahl(1, "tauben", masse)).toBe("1 Taubenkäfig (40 × 40 × 40 cm)");
    expect(kaefigAnzahl(2, "stamm", {})).toBe("2 Stammkäfige");
  });
});

describe("Hallenplan: fehlende Käfige in der Beispielhalle", () => {
  // 15,5 × 27,5 m, Reihen quer, Einzelreihen an beiden Wänden, kein Hauptgang; Notausgang oben links, Nebeneingang unten,
  // E1 rechts. Tiere ausgedacht, so viele Tauben, dass die Halle überläuft.
  const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
  const halle: Halle = {
    ...HALLE_STANDARD, breite: 1550, laenge: 2750, richtung: "quer", wandreihen: true, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" },
    flaechen: [
      { name: "Notausgang", art: "eingang", x: 0, y: 100, breite: 50, tiefe: 120 },
      { name: "Nebeneingang", art: "eingang", x: 1500, y: 600, breite: 50, tiefe: 150 },
      { name: "E1", art: "eingang", x: 1100, y: 2700, breite: 300, tiefe: 50 },
    ],
  };
  let id = 0;
  const art = (n: number, typ: PlanTier["typ"], sparte: string) => Array.from({ length: n }, () => ({ ...tier(++id, typ, String(id)), sparte }));
  const tiere = [...art(70, "huehner", "Hühner"), ...art(110, "zwerghuehner", "Zwerghühner"), ...art(420, "tauben", "Tauben")];
  const plan = planeHalle(halle, tiere, masse);
  const belegt: Belegt[] = [
    ...plan.reihen.flatMap((r) => r.platten.map((pl) => ({ q: pl.rechteck, typ: pl.typ }))),
    ...halle.flaechen.flatMap((f) => [{ q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe } }, { q: eingangsGang(halle, f) }]),
  ];

  test("alles, was eingesetzt wird, steht in den Reihen – nie im Gang, Quergang oder vor einem Eingang", () => {
    expect(plan.nichtPlatziert.length).toBeGreaterThan(0);
    const { einsaetze, ohne } = fehlendeEinsetzen(plan, halle, masse, belegt);
    const abschnitte = plan.reihen.flatMap((r) => r.flaechen);
    for (const e of einsaetze) {
      expect(abschnitte.some((a) => e.rechteck.x >= a.x - 0.5 && e.rechteck.y >= a.y - 0.5 && e.rechteck.x + e.rechteck.b <= a.x + a.b + 0.5 && e.rechteck.y + e.rechteck.h <= a.y + a.h + 0.5)).toBe(true);
      expect(belegt.some((b) => b.q.x < e.rechteck.x + e.rechteck.b - 0.5 && e.rechteck.x < b.q.x + b.q.b - 0.5 && b.q.y < e.rechteck.y + e.rechteck.h - 0.5 && e.rechteck.y < b.q.y + b.q.h - 0.5)).toBe(false);
    }
    // Die Planung füllt die Reihen selbst; es bleiben nur wenige Reste von einer Grundplatte Länge. Je Taubenblock 5 Plätze.
    expect(einsaetze.every((e) => e.typ === "tauben")).toBe(true);
    expect(ohne).toBe(plan.nichtPlatziert.length - 5 * einsaetze.length);
  });
});
