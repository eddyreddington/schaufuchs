/** Einstellung „Nach Plan nummerieren“ (Rückmeldung 22.11.2026): wo die Zählung beginnt und wie sie läuft. */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, type Halle, type NummerFolge, type PlanTier } from "./hallenplan";
import { planFolge, planUnordnung } from "./hallenplan-folge";

const tier = (id: number): PlanTier => ({ id, typ: "huehner", nr: String(id), rasse: "R", sparte: "Hühner", preisrichterId: null });
// Längs, zwei Doppelreihen: R1 (1–6) Rücken an Rücken mit R2 (7–12), R3 (13–18) mit R4 (19–24); je Reihe vom Anfang (y) an.
const halle: Halle = { ...HALLE_STANDARD, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" }, breite: 1000, laenge: 800, richtung: "laengs", wandreihen: false };
const tiere = Array.from({ length: 24 }, (_, i) => tier(i + 1));
const von = (a: number, b: number) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));
const folge = (f?: NummerFolge) => planFolge(planeHalle({ ...halle, nummerFolge: f }, tiere, {}), "laengs", f);

describe("Nach Plan nummerieren: Einstellung", () => {
  test("ohne Einstellung wie bisher: Reihe für Reihe, jede Seite vom Anfang", () => {
    expect(folge()).toEqual(von(1, 24));
    expect(folge({})).toEqual(von(1, 24));
  });

  test("Beginnen bei Reihe: die übrigen folgen ringsum", () => {
    expect(folge({ startReihe: 3 })).toEqual([...von(13, 24), ...von(1, 12)]);
  });

  test("Reihen absteigend, auch ab einer Startreihe", () => {
    expect(folge({ absteigend: true })).toEqual([...von(19, 24), ...von(13, 18), ...von(7, 12), ...von(1, 6)]);
    expect(folge({ absteigend: true, startReihe: 2 })).toEqual([...von(7, 12), ...von(1, 6), ...von(19, 24), ...von(13, 18)]);
  });

  test("erste Reihe vom Ende: ohne Schlangenlinie laufen alle Reihen vom Ende", () => {
    expect(folge({ vomEnde: true })).toEqual([...von(6, 1), ...von(12, 7), ...von(18, 13), ...von(24, 19)]);
  });

  test("Schlangenlinie: jede folgende Reihe in Gegenrichtung", () => {
    expect(folge({ schlange: true })).toEqual([...von(1, 6), ...von(12, 7), ...von(13, 18), ...von(24, 19)]);
    expect(folge({ schlange: true, vomEnde: true })).toEqual([...von(6, 1), ...von(7, 12), ...von(18, 13), ...von(19, 24)]);
  });

  test("Doppelreihen abwechselnd: links, rechts, links … über beide Seiten", () => {
    expect(folge({ doppelAbwechselnd: true })).toEqual([1, 7, 2, 8, 3, 9, 4, 10, 5, 11, 6, 12, 13, 19, 14, 20, 15, 21, 16, 22, 17, 23, 18, 24]);
    // Mit Schlangenlinie läuft die zweite Doppelreihe zurück.
    expect(folge({ doppelAbwechselnd: true, schlange: true }).slice(12)).toEqual([18, 24, 17, 23, 16, 22, 15, 21, 14, 20, 13, 19]);
  });

  test("Startreihe gibt es nicht (mehr): Zählung wie ohne Startreihe", () => {
    expect(folge({ startReihe: 99 })).toEqual(von(1, 24));
  });

  test("der Hinweis „Nummern nicht in Planfolge“ rechnet mit derselben Einstellung", () => {
    const f: NummerFolge = { schlange: true };
    const p = planeHalle({ ...halle, nummerFolge: f }, tiere, {});
    // Die Nummern 1–24 laufen in R2 und R4 gegen die Schlangenlinie.
    expect(planUnordnung(p, "laengs", false, f).nichtInFolge).toBeGreaterThan(0);
    // Nummern nach der Schlangenlinie vergeben: in Folge.
    const neu = planFolge(p, "laengs", f);
    const nummeriert = tiere.map((t) => ({ ...t, nr: String(neu.indexOf(t.id) + 1) }));
    expect(planUnordnung(planeHalle({ ...halle, nummerFolge: f }, nummeriert, {}), "laengs", false, f).nichtInFolge).toBe(0);
  });

  test("Doppelreihen bleiben ein Paar, auch wenn eine Platte ein Stück verschoben ist (Gegenprüfung)", () => {
    const versetzt: Halle = { ...halle, plattenVersatz: [{ reihe: 1, platte: 0, dx: -5, dy: 0 }] };
    const f: NummerFolge = { doppelAbwechselnd: true };
    expect(planFolge(planeHalle({ ...versetzt, nummerFolge: f }, tiere, {}), "laengs", f).slice(0, 6)).toEqual([1, 7, 2, 8, 3, 9]);
  });

  test("Startreihe auf der zweiten Seite eines Paars: dort steht die 1", () => {
    expect(folge({ doppelAbwechselnd: true, startReihe: 2 }).slice(0, 4)).toEqual([7, 1, 8, 2]);
    expect(folge({ doppelAbwechselnd: true, startReihe: 4 }).slice(0, 4)).toEqual([19, 13, 20, 14]);
  });

  test("absteigend und abwechselnd: Paare von hinten, in jedem Paar die äußere Seite zuerst", () => {
    expect(folge({ doppelAbwechselnd: true, absteigend: true }).slice(0, 4)).toEqual([19, 13, 20, 14]);
  });

  test("Wandreihen ohne Partner zählen für sich, auch bei „abwechselnd“", () => {
    const mitWand: Halle = { ...halle, wandreihen: true, breite: 1200 };
    const viele = Array.from({ length: 40 }, (_, i) => tier(i + 1));
    const f: NummerFolge = { doppelAbwechselnd: true };
    const p = planeHalle({ ...mitWand, nummerFolge: f }, viele, {});
    const reihen = p.reihen.filter((r) => r.kaefige.length);
    // Erste Reihe ist eine Wandreihe: ihre Tiere zuerst am Stück.
    expect(reihen[0]!.art).toBe("wand");
    const erste = reihen[0]!.kaefige.map((k) => k.id).sort((a, b) => a - b);
    expect(planFolge(p, "laengs", f).slice(0, erste.length).sort((a, b) => a - b)).toEqual(erste);
    // Jede Folge enthält jedes Tier genau einmal.
    expect(new Set(planFolge(p, "laengs", f)).size).toBe(viele.length);
  });
});
