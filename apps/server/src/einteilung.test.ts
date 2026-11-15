import { describe, expect, test } from "bun:test";
import { schlageEinteilungVor } from "./routers/preisrichter";

describe("Preisrichter-Einteilung", () => {
  test("verteilt gleichmäßig und schneidet an Rassengrenzen", () => {
    const rassen = ["A", "A", "A", "B", "B", "B", "B", "C", "C", "D", "D", "D"];
    const v = schlageEinteilungVor(rassen.map((rasse, i) => ({ nr: i + 1, rasse })), [1, 2, 3]);
    expect(v).toEqual([
      { preisrichterId: 1, vonNr: 1, bisNr: 3 },
      { preisrichterId: 2, vonNr: 4, bisNr: 7 },
      { preisrichterId: 3, vonNr: 8, bisNr: 12 },
    ]);
  });

  test("schneidet mitten in einer großen Rasse, wenn keine Grenze in der Nähe ist", () => {
    const v = schlageEinteilungVor(Array.from({ length: 100 }, (_, i) => ({ nr: i + 1, rasse: "A" })), [1, 2]);
    expect(v.map((b) => b.bisNr - b.vonNr + 1)).toEqual([50, 50]);
  });

  test("Nachmeldungen mit Unternummer bleiben beim selben Preisrichter (keine Überlappung)", () => {
    const n = [
      ...Array.from({ length: 35 }, (_, i) => ({ nr: i + 1, suffix: "", rasse: i < 24 ? "Dorking" : "Wyandotte" })),
      { nr: 24, suffix: "a", rasse: "Zwerg-Wyandotte" },
      { nr: 16, suffix: "a", rasse: "Dorking" },
      { nr: 30, suffix: "a", rasse: "Wyandotte" },
    ];
    const v = schlageEinteilungVor(n, [1, 2, 3]);
    expect(v).toHaveLength(3);
    expect(v[0]!.vonNr).toBe(1);
    expect(v.at(-1)!.bisNr).toBe(35);
    for (let i = 1; i < v.length; i++) expect(v[i]!.vonNr).toBe(v[i - 1]!.bisNr + 1);
  });

  test("Preisrichter nur für bestimmte Sparten: jeder bekommt nur seine Sparten, alles verteilt, Last ausgeglichen", () => {
    // 1–40 Hühner, 41–80 Zwerghühner, 81–150 Tauben. A nur Tauben, B nur Hühner und Zwerghühner, C alles.
    const n = Array.from({ length: 150 }, (_, i) => ({ nr: i + 1, rasse: `R${Math.floor(i / 10)}`, sparte: i < 40 ? "Hühner" : i < 80 ? "Zwerghühner" : "Tauben" }));
    const richter = [{ id: 1, sparten: ["Tauben"] }, { id: 2, sparten: ["Hühner", "Zwerghühner"] }, { id: 3, sparten: [] }];
    const v = schlageEinteilungVor(n, richter);
    expect(v.fehlend).toEqual([]);
    const wer = new Map<number, number>();
    for (const e of v) for (let nr = e.vonNr; nr <= e.bisNr; nr++) {
      expect(wer.has(nr)).toBe(false);
      wer.set(nr, e.preisrichterId);
    }
    expect(wer.size).toBe(150);
    for (const x of n) {
      const r = richter.find((y) => y.id === wer.get(x.nr))!;
      expect(r.sparten.length === 0 || r.sparten.includes(x.sparte)).toBe(true);
    }
    const last = [1, 2, 3].map((id) => [...wer.values()].filter((x) => x === id).length);
    expect(Math.max(...last) - Math.min(...last)).toBeLessThanOrEqual(35);
    // Nebeneinanderliegende Bereiche eines Preisrichters sind zusammengefasst.
    for (let i = 1; i < v.length; i++) expect(v[i]!.preisrichterId === v[i - 1]!.preisrichterId && v[i]!.vonNr === v[i - 1]!.bisNr + 1).toBe(false);
    // Liegt eine Sparte ohne Preisrichter dazwischen, wird nicht zusammengefasst (Tauben 41–50 bleiben frei).
    const mitte = Array.from({ length: 60 }, (_, i) => ({ nr: i + 1, rasse: "R", sparte: i >= 40 && i < 50 ? "Tauben" : "Hühner" }));
    const getrennt = schlageEinteilungVor(mitte, [{ id: 2, sparten: ["Hühner"] }]);
    expect([...getrennt]).toEqual([{ preisrichterId: 2, vonNr: 1, bisNr: 40 }, { preisrichterId: 2, vonNr: 51, bisNr: 60 }]);
    // Niemand für Tauben: Hinweis, die Tauben bleiben ohne Preisrichter.
    const ohne = schlageEinteilungVor(n, [{ id: 2, sparten: ["Hühner", "Zwerghühner"] }]);
    expect(ohne.fehlend).toEqual(["Tauben"]);
    expect(ohne).toEqual([{ preisrichterId: 2, vonNr: 1, bisNr: 80 }]);
  });

  test("Gegenprüfung: Tiere ohne Sparte und gemischte Nummern im Hinweis; kleine Abschnitte nicht geteilt", () => {
    const h = { id: 1, sparten: ["Hühner"] }, t = { id: 2, sparten: ["Tauben"] };
    // Ohne Sparte (Freitext ohne Einordnung): im Hinweis.
    const n = Array.from({ length: 60 }, (_, i) => ({ nr: i + 1, rasse: "R", sparte: i < 30 ? "Hühner" : i < 35 ? null : "Tauben" }));
    expect(schlageEinteilungVor(n, [h, t]).fehlend).toEqual(["Tiere ohne Sparte"]);
    // Nachmeldung 24a (Tauben) zur Hühner-Nr. 24: nur Nr. 24 fehlt, mit Namen beider Sparten.
    const m = [...Array.from({ length: 50 }, (_, i) => ({ nr: i + 1, suffix: "", rasse: "R", sparte: i < 24 ? "Hühner" : "Tauben" })), { nr: 24, suffix: "a", rasse: "S", sparte: "Tauben" }];
    expect(schlageEinteilungVor(m, [h, t]).fehlend).toEqual(["Nr. 24 (Hühner und Tauben)"]);
    // 20 Hühner, zwei Allrounder und ein Taubenrichter: die Hühner bleiben bei einem.
    const k = [...Array.from({ length: 20 }, (_, i) => ({ nr: i + 1, rasse: "H", sparte: "Hühner" })), ...Array.from({ length: 40 }, (_, i) => ({ nr: 21 + i, rasse: "T", sparte: "Tauben" }))];
    const v = schlageEinteilungVor(k, [{ id: 1, sparten: [] }, { id: 2, sparten: [] }, t]);
    expect(new Set(v.filter((e) => e.vonNr <= 20).map((e) => e.preisrichterId)).size).toBe(1);
    // 28 Enten (zwei Richter für Enten und Tauben) und 32 Tauben (dazu ein reiner Taubenrichter): 28/16/16.
    const e = [...Array.from({ length: 28 }, (_, i) => ({ nr: i + 1, rasse: "E", sparte: "Wassergeflügel" })), ...Array.from({ length: 32 }, (_, i) => ({ nr: 29 + i, rasse: "T", sparte: "Tauben" }))];
    const w = schlageEinteilungVor(e, [{ id: 1, sparten: ["Wassergeflügel", "Tauben"] }, { id: 2, sparten: ["Wassergeflügel", "Tauben"] }, { id: 3, sparten: ["Tauben"] }]);
    const last = [1, 2, 3].map((id) => w.filter((x) => x.preisrichterId === id).reduce((s, x) => s + x.bisNr - x.vonNr + 1, 0)).sort((a, b) => b - a);
    expect(last).toEqual([28, 16, 16]);
  });

  test("Obmänner bekommen nach ihrer Höchstzahl weniger Tiere, auch mit zwei Obmännern und Sparten", () => {
    const zahl = (v: { preisrichterId: number; vonNr: number; bisNr: number }[], id: number) =>
      v.filter((x) => x.preisrichterId === id).reduce((s, x) => s + x.bisNr - x.vonNr + 1, 0);
    // 140 Tiere, Obmann (Höchstzahl 60) und Preisrichter (80): 60 und 80.
    const n = Array.from({ length: 140 }, (_, i) => ({ nr: i + 1, rasse: "A" }));
    const v = schlageEinteilungVor(n, [{ id: 1, sparten: [], gewicht: 60 }, { id: 2, sparten: [], gewicht: 80 }]);
    expect([zahl(v, 1), zahl(v, 2)]).toEqual([60, 80]);
    // Zwei Obmänner und zwei Preisrichter, 280 Tiere: je 60 und je 80.
    const m = Array.from({ length: 280 }, (_, i) => ({ nr: i + 1, rasse: "A" }));
    const w = schlageEinteilungVor(m, [{ id: 1, sparten: [], gewicht: 60 }, { id: 2, sparten: [], gewicht: 80 }, { id: 3, sparten: [], gewicht: 60 }, { id: 4, sparten: [], gewicht: 80 }]);
    expect([1, 2, 3, 4].map((id) => zahl(w, id))).toEqual([60, 80, 60, 80]);
    // Mit Sparten (Waage nach Last je Höchstzahl): 70 Hühner für Obmann und Preisrichter, 70 Tauben nur für den Preisrichter.
    const s = Array.from({ length: 140 }, (_, i) => ({ nr: i + 1, rasse: `R${Math.floor(i / 10)}`, sparte: i < 70 ? "Hühner" : "Tauben" }));
    const x = schlageEinteilungVor(s, [{ id: 1, sparten: ["Hühner"], gewicht: 60 }, { id: 2, sparten: [], gewicht: 80 }, { id: 3, sparten: ["Tauben"], gewicht: 80 }]);
    // Hühner zuerst: 70 im Verhältnis 60 : 80 → Obmann 30, Preisrichter 40 (vorher 35/35).
    expect(zahl(x, 1)).toBe(30);
    expect(zahl(x, 1) + zahl(x, 2) + zahl(x, 3)).toBe(140);
  });

  test("ohne Preisrichter oder Tiere leer", () => {
    expect(schlageEinteilungVor([], [1])).toEqual([]);
    expect(schlageEinteilungVor([{ nr: 1, rasse: "A" }], [])).toEqual([]);
  });
});
