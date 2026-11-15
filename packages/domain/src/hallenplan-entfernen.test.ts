/** Leeres im festen Hallenplan entfernen: leere Platten, freie Plätze, leere Teile – Belegtes bleibt immer. */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, festschreiben, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { halleOhneFestenPlan, leereEntfernen, pruefeEntfernt, pruefeTeileEntfernt } from "./hallenplan-entfernen";
import { verschiebeTeile } from "./hallenplan-gruppe";

const tier = (id: number): PlanTier => ({ id, typ: "huehner", nr: String(id), rasse: "R", preisrichterId: null });
const tiere = (n: number) => Array.from({ length: n }, (_, i) => tier(i + 1));
const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 } };
// 10 × 20 m, Reihen längs, ohne Hauptgang: drei 70er je Grundplatte.
const basis: Halle = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs", hauptgang: { breite: 0, lage: "keiner" }, breite: 1000, laenge: 2000, flaechen: [] };
/** Fester Plan aus `n` Tieren; danach gelten nur noch die Tiere `bleiben` (die übrigen storniert). */
function fest(n: number, bleiben: number[]) {
  const fp = festschreiben(basis, planeHalle(basis, tiere(n), masse), masse, "2026-11-13T20:00:00Z");
  const jetzt = tiere(n).filter((t) => bleiben.includes(t.id));
  return { fp, jetzt, plan: (h: Halle = basis) => planeHalle(h, jetzt, masse, fp) };
}

describe("Hallenplan: Leeres entfernen", () => {
  test("leere Grundplatte: verschwindet mit ihren freien Plätzen; die belegte bleibt mit Meldung", () => {
    const { plan } = fest(6, [1, 2, 3]);
    const p = plan();
    expect(p.reihen[0]!.platten.map((pl) => pl.belegt)).toEqual([3, 0]);
    const e = leereEntfernen(basis, p, [{ art: "platte", reihe: 1, i: 0 }, { art: "platte", reihe: 1, i: 1 }]);
    expect(e).toMatchObject({ platten: 1, plaetze: 0, bleibt: ["Grundplatte 1 in R1 (belegt, Nr. 1–3)"] });
    expect(e.halle.entfernt).toEqual([{ reihe: 1, art: "platte", x: p.reihen[0]!.platten[1]!.x, y: p.reihen[0]!.platten[1]!.y }]);
    const nach = plan(e.halle);
    // Die entfernte Platte bleibt als Platzhalter (gleiche Nummern), ohne Plätze.
    expect(nach.reihen[0]!.platten.map((pl) => !!pl.entfernt)).toEqual([false, true]);
    expect(nach.reihen[0]!.freiePlaetze ?? []).toEqual([]);
    expect(nach.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3]);
  });

  test("einzelne freie Plätze: nur der gewählte geht, die Platte bleibt; ein belegter Platz wird genannt", () => {
    const { plan } = fest(6, [1, 2, 3, 4]);
    const p = plan();
    const frei = p.reihen[0]!.freiePlaetze!;
    expect(frei).toHaveLength(2);
    const k4 = p.reihen[0]!.kaefige.find((k) => k.id === 4)!;
    const e = leereEntfernen(basis, p, [{ art: "platz", reihe: 1, x: frei[0]!.x, y: frei[0]!.y }, { art: "platz", reihe: 1, x: k4.x, y: k4.y }]);
    expect(e).toMatchObject({ platten: 0, plaetze: 1, bleibt: ["Platz in R1 (belegt, Nr. 4)"] });
    const nach = plan(e.halle);
    expect(nach.reihen[0]!.platten).toHaveLength(2);
    expect(nach.reihen[0]!.freiePlaetze).toHaveLength(1);
    // Nachmeldung: kommt in den übrigen freien Platz, nicht in den entfernten.
    const mitNach = planeHalle(e.halle, [...tiere(4), tier(7)], masse, fest(6, []).fp);
    expect(mitNach.reihen[0]!.kaefige.find((k) => k.id === 7)!.y).toBe(frei[1]!.y);
  });

  test("Platz auf einer gewählten leeren Platte zählt nicht doppelt; ganze Reihe nur, wenn leer", () => {
    const { plan } = fest(6, [1, 2, 3]);
    const p = plan();
    const f = p.reihen[0]!.freiePlaetze![0]!;
    const e = leereEntfernen(basis, p, [{ art: "platte", reihe: 1, i: 1 }, { art: "platz", reihe: 1, x: f.x, y: f.y }]);
    expect(e).toMatchObject({ platten: 1, plaetze: 0 });
    expect(leereEntfernen(basis, p, [{ art: "reihe", nr: 1 }])).toMatchObject({ platten: 0, bleibt: ["R1 (belegt, Nr. 1–3)"] });
    const leer = fest(6, []).plan();
    expect(leereEntfernen(basis, leer, [{ art: "reihe", nr: 1 }])).toMatchObject({ platten: 2, bleibt: [] });
  });

  test("Nummern der Platten bleiben: verschobene Platten stehen, wo sie stehen – auch wenn die entfernte wieder belegt wird", () => {
    const { fp, plan } = fest(9, [1, 2, 3, 7, 8, 9]);
    const halle = verschiebeTeile(basis, [{ art: "platte", reihe: 1, i: 2 }], 500, 0);
    const p = plan(halle);
    const lage = (pl: ReturnType<typeof plan>, ids: number[]) => pl.reihen[0]!.kaefige.filter((k) => ids.includes(k.id)).map((k) => k.rechteck);
    const e = leereEntfernen(halle, p, [{ art: "platte", reihe: 1, i: 1 }]);
    expect(e.halle.plattenVersatz).toEqual(halle.plattenVersatz);
    const nach = plan(e.halle);
    expect(lage(nach, [7, 8, 9])).toEqual(lage(p, [7, 8, 9]));
    expect(lage(nach, [1, 2, 3])).toEqual(lage(p, [1, 2, 3]));
    // Storno von Tier 4 zurückgenommen: Platte 2 ist wieder da, Platte 3 (7–9) bleibt verschoben.
    const wieder = planeHalle(e.halle, [...tiere(4), tier(7), tier(8), tier(9)], masse, fp);
    expect(lage(wieder, [7, 8, 9])).toEqual(lage(p, [7, 8, 9]));
    expect(wieder.reihen[0]!.platten.map((pl) => !!pl.entfernt)).toEqual([false, false, false]);
  });

  test("Nachmeldungen kommen nicht dorthin, wo Platten entfernt wurden; eine angebaute Platte bleibt, wo sie ist", () => {
    const { fp, plan } = fest(6, [1, 2, 3]);
    const p = plan();
    const zweite = p.reihen[0]!.platten[1]!;
    const e = leereEntfernen(basis, p, [{ art: "platte", reihe: 1, i: 1 }]);
    // Drei Nachmeldungen derselben Größe: eine neue Platte hinter der entfernten, nicht auf ihrem Platz.
    const nach = planeHalle(e.halle, [...tiere(3), tier(50), tier(51), tier(52)], masse, fp);
    const neu = nach.reihen.flatMap((r) => r.kaefige).filter((k) => k.id >= 50);
    expect(neu).toHaveLength(3);
    for (const k of neu) expect(k.y >= zweite.y + zweite.laenge - 0.5 || nach.reihen.find((r) => r.kaefige.includes(k))!.nr !== 1).toBe(true);
    // Ganz leere Reihe entfernt: dort wird nichts angebaut.
    const leer = fest(6, []);
    const ohneR1 = leereEntfernen(basis, leer.plan(), [{ art: "reihe", nr: 1 }]).halle;
    const r1 = planeHalle(ohneR1, [tier(60)], masse, leer.fp).reihen[0]!;
    expect(r1.kaefige).toEqual([]);
  });

  test("freier Platz auf einer angebauten Platte (Nachmeldung): bleibt mit Grund", () => {
    const { fp } = fest(3, [1, 2, 3]);
    const p = planeHalle(basis, [...tiere(3), tier(50)], masse, fp);
    const r = p.reihen.find((x) => x.kaefige.some((k) => k.id === 50))!;
    const f = r.freiePlaetze!.find((x) => x.angebaut)!;
    expect(f).toBeDefined();
    const e = leereEntfernen(basis, p, [{ art: "platz", reihe: r.nr, x: f.x, y: f.y }]);
    expect(e).toMatchObject({ plaetze: 0, bleibt: [`Platz in R${r.nr} (Platte einer Nachmeldung)`] });
  });

  test("Belegtes bleibt immer: sitzt auf einem entfernten Platz wieder ein Tier (Storno zurück), gilt die Entfernung nicht", () => {
    const { fp, plan } = fest(6, [1, 2, 3]);
    const e = leereEntfernen(basis, plan(), [{ art: "platte", reihe: 1, i: 1 }]);
    const wieder = planeHalle(e.halle, tiere(6), masse, fp);
    expect(wieder.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(wieder.reihen[0]!.platten).toHaveLength(2);
  });

  test("eingesetzte Teile: leerer Block und leere Voliere gehen, belegte bleiben; Flächen gehen", () => {
    const halle: Halle = { ...basis, flaechen: [{ name: "Bühne", art: "sperre", x: 600, y: 1500, breite: 300, tiefe: 300 }], objekte: [{ id: "a", art: "kaefigblock", typ: "huehner", x: 600, y: 200, drehung: 0 }, { id: "b", art: "kaefigblock", typ: "huehner", x: 600, y: 600, drehung: 0 }] };
    const p = planeHalle(halle, tiere(3), masse);
    // Tier 4 steht in Block „a“ (dorthin kommen Tiere, für die der feste Plan keinen Platz hat).
    p.objekte[0]!.kaefige = [{ ...tier(4), x: 0, y: 0, breite: 70, tiefe: 70, rechteck: { x: 600, y: 200, b: 70, h: 70 } }];
    const e = leereEntfernen(halle, p, [{ art: "objekt", id: "a" }, { art: "objekt", id: "b" }, { art: "flaeche", i: 0 }]);
    expect(e).toMatchObject({ teile: 1, flaechen: 1, bleibt: ["Block 70 × 70 × 70 cm (belegt, Nr. 4)"] });
    // Eben eingesetzt (noch nicht im Plan): lässt sich gleich entfernen.
    const mitNeu: Halle = { ...halle, objekte: [...halle.objekte!, { id: "c", art: "voliere", x: 100, y: 1500, drehung: 0 }] };
    expect(leereEntfernen(mitNeu, p, [{ art: "objekt", id: "c" }])).toMatchObject({ teile: 1 });
    expect(e.halle.objekte!.map((o) => o.id)).toEqual(["a"]);
    // Server: ein belegter Block, der beim Speichern fehlt, wird abgelehnt; ein leerer nicht.
    expect(pruefeTeileEntfernt(halle, { ...halle, objekte: [] }, p)).toMatch(/Belegt, bleibt stehen: Block 70 × 70 × 70 cm \(Nr\. 4\)/);
    expect(pruefeTeileEntfernt(halle, e.halle, p)).toBeNull();
    expect(e.halle.flaechen).toEqual([]);
  });

  test("Prüfung beim Speichern: nur leere Plätze im festen Plan", () => {
    const { fp, plan } = fest(6, [1, 2, 3]);
    const p = plan();
    const leer = { reihe: 1, art: "platte" as const, x: p.reihen[0]!.platten[1]!.x, y: p.reihen[0]!.platten[1]!.y };
    const belegt = { ...leer, y: p.reihen[0]!.platten[0]!.y };
    expect(pruefeEntfernt([], [leer], fp, p)).toBeNull();
    expect(pruefeEntfernt([], [belegt], fp, p)).toMatch(/Grundplatte 1 in R1 ist belegt \(Nr\. 1–3\)/);
    expect(pruefeEntfernt([], [leer], null, p)).toMatch(/nur im festen Plan/);
    expect(pruefeEntfernt([leer], [leer], fp, p)).toBeNull();
    // Entfernte wieder einsetzen (Rückgängig) geht immer.
    expect(pruefeEntfernt([leer], [], fp, p)).toBeNull();
    const k1 = p.reihen[0]!.kaefige[0]!;
    expect(pruefeEntfernt([], [{ reihe: 1, art: "platz", x: k1.x, y: k1.y }], fp, p)).toMatch(/belegt \(Nr\. 1\)/);
    expect(pruefeEntfernt([], [{ reihe: 1, art: "platz", x: 1, y: 1 }], fp, p)).toMatch(/gibt es im festen Plan nicht/);
  });

  test("neue Schau: ohne verschobene Platten und entfernte Plätze", () => {
    const h: Halle = { ...basis, plattenVersatz: [{ reihe: 1, platte: 0, dx: 10, dy: 0 }], entfernt: [{ reihe: 1, art: "platz", x: 0, y: 0 }] };
    const n = halleOhneFestenPlan(h);
    expect(n.plattenVersatz).toEqual([]);
    expect("entfernt" in n).toBe(false);
    expect(n.breite).toBe(basis.breite);
  });
});
