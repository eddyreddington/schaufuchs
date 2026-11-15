/**
 * Freie Hallenplanung: strenge Katalogfolge ohne Sonderregeln (keine Tauben-Trennung, keine Großkäfig-Wand, kein
 * Quergang, keine Startreihen je Sparte), Käfige lückenlos, bis direkt an Freiflächen – die Gänge bleiben vorschriftsmäßig.
 */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, festschreiben, planeHalle, type Halle, type PlanTier, type Reihe } from "./hallenplan";
import type { KaefigTyp } from "./kaefige";

const tier = (id: number, typ: KaefigTyp, sparte?: string): PlanTier => ({ id, typ, nr: String(id), rasse: "R", preisrichterId: null, ...(sparte ? { sparte } : {}) });
const viele = (n: number, typ: KaefigTyp, ab: number, sparte?: string) => Array.from({ length: n }, (_, i) => tier(ab + i, typ, sparte));
// 10 × 20 m, Reihen längs, Gang 1,5 m, kein Hauptgang, Reihenenden mit Gang: Wandreihe links ab x 0 (Front rechts), dann Doppelreihen.
const basis: Halle = { ...HALLE_STANDARD, wandBuendig: false, richtung: "laengs", hauptgang: { breite: 0, lage: "keiner" }, breite: 1000, laenge: 2000 };
/** Grundplatten einer Reihe stehen lückenlos aneinander (je Abschnitt). */
const lueckenlos = (r: Reihe) =>
  r.abschnitte.every((a) => {
    const p = r.platten.filter((x) => x.y >= a.von - 0.5 && x.y < a.bis).sort((x, y) => x.y - y.y);
    return p.every((x, i) => i === 0 || Math.abs(x.y - (p[i - 1]!.y + p[i - 1]!.laenge)) < 0.5);
  });
/** Jeder Käfig steht ganz auf einer Platte (beim Mischen auch auf dem Rest der Platte einer anderen Art). */
const aufPlatte = (r: Reihe) => r.kaefige.every((k) => r.platten.some((pl) => k.y >= pl.y - 0.5 && k.y + k.breite <= pl.y + pl.laenge + 0.5));
/** Jeder Käfig steht ganz auf einer Platte seiner Art. */
const aufEigenerPlatte = (r: Reihe) => r.kaefige.every((k) => r.platten.some((pl) => pl.typ === k.typ && k.y >= pl.y - 0.5 && k.y + k.breite <= pl.y + pl.laenge + 0.5));

describe("Hallenplan: freie Planung", () => {
  test("Freifläche: Reihen laufen ohne Abstand bis an die Fläche; ein Eingang behält den Gang", () => {
    const flaeche = { name: "Bühne", art: "sperre" as const, x: 0, y: 900, breite: 100, tiefe: 200 };
    const p = planeHalle({ ...basis, flaechen: [flaeche] }, viele(2, "huehner", 1), {});
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
    // Die erste Doppelreihe (ab x 263) berührt weder die Fläche noch steht die Fläche in ihrem Gang.
    expect(p.reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 1850 }]);
    const tuer = planeHalle({ ...basis, flaechen: [{ ...flaeche, name: "Eingang", art: "eingang" }] }, viele(2, "huehner", 1), {});
    // Am Eingang (Wand links) bleibt nur davor ein Gang frei, so breit wie der Eingang – seitlich daneben nicht.
    expect(tuer.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
  });

  test("Freifläche im Gang vor den Käfigen: dort keine Käfige (der Gang bleibt voll breit), sonst bis an die Fläche", () => {
    // Fläche im Gang zwischen Wandreihe (x 0–70, Front rechts) und erster Doppelreihe (x 263–333, Front links).
    const p = planeHalle({ ...basis, flaechen: [{ name: "Tisch", art: "sperre", x: 150, y: 900, breite: 50, tiefe: 200 }] }, viele(2, "huehner", 1), {});
    expect(p.reihen[0]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
    expect(p.reihen[1]!.abschnitte).toEqual([{ von: 150, bis: 900 }, { von: 1100, bis: 1850 }]);
    expect(p.reihen[2]!.abschnitte).toEqual([{ von: 150, bis: 1850 }]);
  });

  test("Abschnitt endet an einer Freifläche: die Käfige rücken bis an die Fläche, der Rest bleibt am Gang", () => {
    const p = planeHalle({ ...basis, flaechen: [{ name: "Kasse", art: "sperre", x: 0, y: 1000, breite: 100, tiefe: 100 }] }, viele(3, "huehner", 1), {});
    expect(p.reihen[0]!.kaefige.map((k) => k.y)).toEqual([790, 860, 930]);
    expect(p.reihen[0]!.platten.map((pl) => [pl.y, pl.laenge])).toEqual([[790, 210]]);
  });

  test("gemischt (Standard, Rückmeldung 14.11.2026: „Ja, mischen erlaubt“): die nächste Käfigart steht zuerst auf dem Rest der Platte", () => {
    // Sparte Hühner in drei Käfiggrößen, danach die Tauben.
    const tiere = [tier(1, "grosskaefig", "Hühner"), ...viele(2, "huehner", 2, "Hühner"), tier(4, "zwerghuehner", "Hühner"), ...viele(2, "tauben", 5, "Tauben")];
    const p = planeHalle({ ...basis, quergang: true, wandreihen: true }, tiere, {});
    const r = p.reihen[0]!;
    expect(r.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    // Großkäfig 150–250, Huhn 2 auf dem Rest (250–320); Huhn 3 passt dort nicht mehr (30 cm): neue Hühnerplatte ab 350,
    // darauf Zwerghuhn 4 und die Tauben 5 und 6 (bis 550) – je in ihrer echten Breite.
    expect(r.kaefige.map((k) => [k.y, k.breite])).toEqual([[150, 100], [250, 70], [350, 70], [420, 50], [470, 40], [510, 40]]);
    expect(r.platten.map((pl) => `${pl.typ}@${pl.y}+${pl.laenge}${pl.gemischt ? " gemischt" : ""}`)).toEqual(["grosskaefig@150+200 gemischt", "huehner@350+210 gemischt"]);
    expect(lueckenlos(r)).toBe(true);
    expect(aufPlatte(r)).toBe(true);
    // Kein Platz passt mehr in die Reste (30 und 10 cm): nichts frei.
    expect(r.freiePlaetze ?? []).toEqual([]);
    expect(r.platten.map((pl) => [pl.plaetze, pl.belegt])).toEqual([[2, 2], [4, 4]]);
  });

  test("sortenrein (restPlaetze „frei“): neue Sparte direkt dahinter (lückenlos); keine Großkäfig-Wand, kein Quergang, keine Startreihen", () => {
    // Sparte Hühner in drei Käfiggrößen, danach die Tauben.
    const tiere = [tier(1, "grosskaefig", "Hühner"), ...viele(2, "huehner", 2, "Hühner"), tier(4, "zwerghuehner", "Hühner"), ...viele(2, "tauben", 5, "Tauben")];
    const p = planeHalle({ ...basis, quergang: true, wandreihen: true, restPlaetze: "frei", spartenStart: [{ sparte: "Tauben", reihe: 3 }] }, tiere, {});
    const r = p.reihen[0]!;
    expect(r.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.kaefige.map((k) => k.y)).toEqual([150, 350, 420, 560, 760, 800]);
    // Innerhalb der Sparte: ganze Platten lückenlos aneinander, je Platte nur eine Käfigart (2 × 100, 3 × 70, 4 × 50).
    expect(lueckenlos(r)).toBe(true);
    expect(aufEigenerPlatte(r)).toBe(true);
    expect(r.platten.map((pl) => `${pl.typ}@${pl.y}+${pl.laenge}`)).toEqual(["grosskaefig@150+200", "huehner@350+210", "zwerghuehner@560+200", "tauben@760+200"]);
    // Frei bleiben nur die übrigen Plätze der angefangenen Platten.
    expect((r.freiePlaetze ?? []).map((f) => `${f.typ}@${f.y}`)).toEqual(["grosskaefig@250", "huehner@490", "zwerghuehner@610", "zwerghuehner@660", "zwerghuehner@710", "tauben@840", "tauben@880", "tauben@920"]);
    // Die Tauben (neue Sparte) folgen direkt auf ihrer eigenen Platte – keine neue Reihe, kein Gang.
    expect(p.reihen.slice(1).every((x) => !x.kaefige.length)).toBe(true);
    expect(p.warnungen).toEqual([]);
  });

  test("Sparten im Wechsel (Jugend-Blöcke): eine nach der anderen ohne Lücke, lückenlos ab dem Reihenanfang", () => {
    const tiere = [...viele(4, "huehner", 1, "Hühner"), ...viele(6, "tauben", 10, "Tauben"), ...viele(3, "huehner", 20, "Hühner Jugend"), ...viele(4, "tauben", 30, "Tauben Jugend")];
    const p = planeHalle({ ...basis, wandreihen: true }, tiere, {});
    const belegt = p.reihen.filter((r) => r.kaefige.length);
    // 2 + 2 + 1 + 1 Platten = 12,30 m passen in eine Reihe (17 m): alles in R1, in Katalogfolge.
    expect(belegt.map((r) => r.kaefige.map((k) => k.id))).toEqual([[1, 2, 3, 4, 10, 11, 12, 13, 14, 15, 20, 21, 22, 30, 31, 32, 33]]);
    for (const r of belegt) {
      expect(lueckenlos(r)).toBe(true);
      expect(aufPlatte(r)).toBe(true);
      expect(r.platten[0]!.y).toBe(r.abschnitte[0]!.von);
    }
    expect(p.warnungen).toEqual([]);
  });

  test("eine Reihe für zwei Sparten: die Tauben direkt hinter den Hühnern, ohne Gang und ohne Sparten-Hinweis", () => {
    // Nur eine Wandreihe 150–1850 (zu schmal für eine zweite).
    const halle: Halle = { ...basis, wandreihen: true, breite: 200 };
    const p = planeHalle(halle, [...viele(3, "huehner", 1, "Hühner"), ...viele(3, "tauben", 10, "Tauben")], {});
    expect(p.nichtPlatziert).toEqual([]);
    const r = p.reihen.find((x) => x.kaefige.length)!;
    expect(r.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 10, 11, 12]);
    expect(r.platten.find((pl) => pl.typ === "tauben")!.y).toBe(150 + 210);
    // Kein Hinweis zur Sparte mehr (die schmale Halle meldet weiter ihre eigenen Hinweise).
    expect(p.warnungen.join(" ")).not.toMatch(/eigenen Reihe|Sparte/);
  });

  test("Wechsel der Käfigart: erst der Rest der angefangenen Platte, dann die eigene Platte direkt daneben; frei nur am Ende", () => {
    const p = planeHalle(basis, [...viele(5, "huehner", 1), ...viele(4, "zwerghuehner", 10)], {});
    const r = p.reihen[0]!;
    expect(r.kaefige.map((k) => k.y)).toEqual([150, 220, 290, 360, 430, 500, 570, 620, 670]);
    expect(lueckenlos(r)).toBe(true);
    expect(aufPlatte(r)).toBe(true);
    expect(r.platten.map((pl) => `${pl.typ}@${pl.y}`)).toEqual(["huehner@150", "huehner@360", "zwerghuehner@570"]);
    expect((r.freiePlaetze ?? []).map((f) => `${f.typ}@${f.y}`)).toEqual(["zwerghuehner@720"]);
    // Sortenrein (restPlaetze „frei“): wie früher bleibt der Hühnerplatz frei.
    const frei = planeHalle({ ...basis, restPlaetze: "frei" }, [...viele(5, "huehner", 1), ...viele(4, "zwerghuehner", 10)], {}).reihen[0]!;
    expect(frei.kaefige.map((k) => k.y)).toEqual([150, 220, 290, 360, 430, 570, 620, 670, 720]);
    expect(aufEigenerPlatte(frei)).toBe(true);
    expect((frei.freiePlaetze ?? []).map((f) => `${f.typ}@${f.y}`)).toEqual(["huehner@500"]);
  });

  test("was hinten keinen Platz mehr findet, bleibt ohne Platz – nie verstreut auf freie Plätze weiter vorn", () => {
    // Eine Doppelreihe, je Hälfte 150–800: drei Tauben (Platte zu 5, zwei Plätze frei), dahinter Hühner auf fünf Platten;
    // die letzten zwei Tauben finden hinten keinen Platz mehr und kommen nicht auf die freien Plätze der ersten Taubenplatte.
    const halle: Halle = { ...basis, wandreihen: false, breite: 440, laenge: 950 };
    const tiere = [...viele(3, "tauben", 1, "Tauben"), ...viele(15, "huehner", 10, "Hühner"), ...viele(2, "tauben", 40, "Tauben")];
    const p = planeHalle(halle, tiere, {});
    expect(p.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 10, 11, 12, 13, 14, 15]);
    expect(p.reihen[1]!.kaefige.map((k) => k.id)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(p.reihen[0]!.freiePlaetze ?? []).toHaveLength(2);
    expect(p.nichtPlatziert.map((x) => x.id)).toEqual([40, 41]);
  });

  test("Doppelreihe: was in die erste Hälfte nicht passt, steht Rücken an Rücken in der zweiten", () => {
    const p = planeHalle({ ...basis, wandreihen: false, laenge: 950 }, [...viele(6, "huehner", 1, "Hühner"), ...viele(8, "tauben", 20, "Tauben")], {});
    // Reihe 1 (150–800): sechs Hühner auf zwei Platten; die Tauben (neue Sparte) auf der Rückseite, zwei Platten zu 5.
    expect(p.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.reihen[1]!.kaefige.map((k) => k.id)).toEqual([20, 21, 22, 23, 24, 25, 26, 27]);
    expect(p.reihen[0]!.front).not.toBe(p.reihen[1]!.front);
    expect(p.nichtPlatziert).toEqual([]);
  });
});

describe("Hallenplan: knappe Halle", () => {
  test("Sparten hintereinander ohne Gang: alles lückenlos, ohne Hinweis", () => {
    // Zwei Wandreihen 150–1850 (je 1700): Hühner 1–3, Tauben 10–12, Zwerghühner 20–41 (22 Stück, 6 Platten = 1200).
    // Zusammen 16,10 m – passt in eine Reihe, die Sparten direkt hintereinander.
    const halle: Halle = { ...basis, wandreihen: true, breite: 300 };
    const tiere = [...viele(3, "huehner", 1, "Hühner"), ...viele(3, "tauben", 10, "Tauben"), ...viele(22, "zwerghuehner", 20, "Zwerghühner")];
    const p = planeHalle(halle, tiere, {});
    expect(p.nichtPlatziert).toEqual([]);
    const belegt = p.reihen.filter((r) => r.kaefige.length);
    expect(belegt).toHaveLength(1);
    expect(lueckenlos(belegt[0]!)).toBe(true);
    expect(belegt[0]!.platten[0]!.y).toBe(150);
    expect(p.warnungen).toEqual([]);
  });
});

describe("Hallenplan: fester Plan, Nachmeldung einer anderen Sparte", () => {
  test("neue Platte nicht hinter einer anderen Sparte (keine Hühner zwischen den Tauben), sondern in einer freien Reihe", () => {
    const halle: Halle = { ...basis, wandreihen: false, breite: 1000 };
    const tiere = [...viele(3, "huehner", 1, "Hühner"), ...viele(3, "tauben", 4, "Tauben")];
    const plan = planeHalle(halle, tiere, {});
    // Neu gerechnet stehen die Tauben direkt hinter den Hühnern (lückenlos).
    expect(plan.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    const fest = festschreiben(halle, plan, {}, "x");
    // Jugend-Huhn 6a: Nummer hinter der letzten Taube – kommt im festen Plan nicht ans Ende hinter die Tauben.
    const nach = planeHalle(halle, [...tiere, { ...tier(20, "huehner", "Hühner Jugend"), nr: "6a" }], {}, fest);
    expect(nach.nichtPlatziert).toEqual([]);
    expect(nach.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6]);
    const wo = nach.reihen.findIndex((r) => r.kaefige.some((k) => k.id === 20));
    expect(nach.reihen[wo]!.kaefige.map((k) => k.id)).toEqual([20]);
    // Eine Taube 6b dagegen kommt zu den Tauben (auf den freien Platz der angefangenen Platte).
    const taube = planeHalle(halle, [...tiere, { ...tier(21, "tauben", "Tauben"), nr: "6b" }], {}, fest);
    expect(taube.reihen[0]!.kaefige.map((k) => k.id)).toEqual([1, 2, 3, 4, 5, 6, 21]);
  });

  test("gibt es nur Reihenenden anderer Sparten, kommt die Nachmeldung trotzdem unter (statt ohne Platz)", () => {
    // Eine einzige Wandreihe: Hühner, dann (Notfall) nach einem Gang die Tauben.
    const halle: Halle = { ...basis, wandreihen: true, breite: 200 };
    const tiere = [...viele(3, "huehner", 1, "Hühner"), ...viele(3, "tauben", 4, "Tauben")];
    const fest = festschreiben(halle, planeHalle(halle, tiere, {}), {}, "x");
    const nach = planeHalle(halle, [...tiere, { ...tier(20, "huehner", "Hühner Jugend"), nr: "6a" }], {}, fest);
    expect(nach.nichtPlatziert).toEqual([]);
  });
});
