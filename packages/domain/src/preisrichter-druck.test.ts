import { describe, expect, test } from "bun:test";
import { bewertungslisteSpalten, bewertungslisteZeilen, GRUPPEN_VORGABE, type ListenZeile, verpflichtungGruppen } from "./preisrichter-druck";

type T = { nr: number; rasse: string; farbenschlag: string };
const t = (nr: number, rasse: string, farbenschlag: string): T => ({ nr, rasse, farbenschlag });
const kurz = (z: ListenZeile<T>) => (z.art === "tier" ? String(z.tier.nr) : `${z.art === "rasse" ? "R" : "F"}:${z.text}${z.fortsetzung ? "+" : ""}`);

describe("Preisrichterverpflichtung: Gruppen zum Ankreuzen", () => {
  test("Gruppen aus dem Verzeichnis: einheitlich, ohne Doppelte, in natürlicher Folge", () => {
    expect(verpflichtungGruppen(["x2", "X10", " x 1", "", null, "X2", "B"])).toEqual(["B", "X1", "X2", "X10"]);
  });

  test("Ohne Gruppen im Verzeichnis: A bis M, Z1 bis Z3", () => {
    expect(verpflichtungGruppen([])).toEqual([..."ABCDEFGHIJKLM", "Z1", "Z2", "Z3"]);
    expect(verpflichtungGruppen(["", null, undefined])).toEqual([...GRUPPEN_VORGABE]);
    expect(GRUPPEN_VORGABE).toHaveLength(16);
  });
});

describe("Bewertungsliste: Zwischenköpfe und zwei Spalten", () => {
  test("Zwischenkopf je Rasse und je Farbenschlag, in der Folge der Tiere", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Testhuhn", "rot"), t(4, "Probetaube", "blau")]);
    expect(z.map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "2", "F:rot", "3", "R:Probetaube", "F:blau", "4"]);
  });

  test("Gleicher Farbenschlag bei neuer Rasse bekommt wieder einen Kopf; ohne Farbenschlag kein leerer Kopf", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Probehuhn", "weiß"), t(3, "Freihuhn", ""), t(4, "Probehuhn", "")]);
    expect(z.map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "R:Probehuhn", "F:weiß", "2", "R:Freihuhn", "3", "R:Probehuhn", "4"]);
    // Folgt ein Tier ohne Farbenschlag auf einen Farbenschlag derselben Rasse, steht es nicht unter dessen Kopf.
    expect(bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "")]).map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "F:ohne Farbenschlag", "2"]);
    expect(bewertungslisteZeilen([])).toEqual([]);
  });

  test("Spalten: jede Zeile genau einmal in Folge, kein Kopf allein am Spaltenende, Fortsetzung wiederholt die Köpfe", () => {
    const tiere = [t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Testhuhn", "weiß"), t(4, "Testhuhn", "rot"), t(5, "Testhuhn", "rot"), t(6, "Probetaube", "blau")];
    // Jede Zeile 1 hoch; erste Spalte 4, danach 3 (wie die erste Seite mit Briefkopf).
    const spalten = bewertungslisteSpalten(bewertungslisteZeilen(tiere), () => 1, (i) => (i === 0 ? 4 : 3));
    expect(spalten.map((s) => s.map(kurz))).toEqual([
      ["R:Testhuhn", "F:weiß", "1", "2"],
      ["R:Testhuhn+", "F:weiß+", "3"],
      // „rot“ mit seinem ersten Tier passte nicht mehr: neue Spalte, die Rasse als Fortsetzung davor.
      ["R:Testhuhn+", "F:rot", "4"],
      ["R:Testhuhn+", "F:rot+", "5"],
      ["R:Probetaube", "F:blau", "6"],
    ]);
    const nur = spalten.flat().filter((z) => z.art === "tier").map(kurz);
    expect(nur).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const s of spalten) expect(s.at(-1)!.art).toBe("tier");
  });

  test("Spalten: passt nur der Kopf einer neuen Rasse noch, beginnt sie die nächste Spalte", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Probetaube", "blau")]);
    // Nach Testhuhn ist in der ersten Spalte noch eine Zeile frei – zu wenig für Rasse, Farbenschlag und Tier.
    const spalten = bewertungslisteSpalten(z, () => 1, () => 5);
    expect(spalten.map((s) => s.map(kurz))).toEqual([["R:Testhuhn", "F:weiß", "1", "2"], ["R:Probetaube", "F:blau", "3"]]);
  });

  test("Spalten: Höhen je Zeilenart, genug Platz = eine Spalte, zu kleine Spalte bricht trotzdem nicht ab", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß")]);
    expect(bewertungslisteSpalten(z, () => 1, () => 100)).toHaveLength(1);
    // Köpfe 2 hoch, Tiere 1: 2 + 2 + 1 = 5 passt, das zweite Tier nicht mehr.
    const hoch = bewertungslisteSpalten(z, (x) => (x.art === "tier" ? 1 : 2), () => 5);
    expect(hoch.map((s) => s.map(kurz))).toEqual([["R:Testhuhn", "F:weiß", "1"], ["R:Testhuhn+", "F:weiß+", "2"]]);
    // Platz für nichts: jede Spalte nimmt trotzdem mindestens ein Tier.
    const eng = bewertungslisteSpalten(z, () => 1, () => 0);
    expect(eng.flat().filter((x) => x.art === "tier")).toHaveLength(2);
    expect(bewertungslisteSpalten([], () => 1, () => 10)).toEqual([]);
  });
});
