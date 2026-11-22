import { describe, expect, test } from "bun:test";
import { bdrgGruppe, bdrgGruppeGueltig, bewertetGruppe, bewertetSparte, darfBewerten, pruefeObmann, ZUSAGEN } from "./preisrichter-zulassung";

describe("Zulassung der Preisrichter: Sparten und BDRG-Gruppen", () => {
  test("Gruppe: Groß-/Kleinschreibung und Leerzeichen egal, kurzer Text", () => {
    expect(bdrgGruppe(" z 1 ")).toBe("Z1");
    expect(bdrgGruppe(null)).toBe("");
    expect(bdrgGruppeGueltig("A")).toBe(true);
    expect(bdrgGruppeGueltig("bv")).toBe(true);
    expect(bdrgGruppeGueltig("")).toBe(false);
    expect(bdrgGruppeGueltig("blau-gesäumt")).toBe(false);
    expect(bdrgGruppeGueltig("ABCDEFGHIJK")).toBe(false);
  });

  test("Sparte: ohne Angabe alle, sonst nur die eingetragenen", () => {
    expect(bewertetSparte({ sparten: [] }, "Tauben")).toBe(true);
    expect(bewertetSparte({ sparten: ["Hühner"] }, "Tauben")).toBe(false);
    expect(bewertetSparte({ sparten: ["Hühner"] }, "Hühner")).toBe(true);
    expect(bewertetSparte({ sparten: ["Hühner"] }, null)).toBe(false);
  });

  test("Gruppe: ohne eingetragene Gruppen keine Einschränkung; Rasse ohne Gruppe wird nicht über Gruppen geprüft", () => {
    expect(bewertetGruppe({ gruppen: [] }, "C")).toBe(true);
    expect(bewertetGruppe({}, "C")).toBe(true);
    expect(bewertetGruppe({ gruppen: ["A", "b"] }, "B")).toBe(true);
    expect(bewertetGruppe({ gruppen: ["A", "B"] }, " c")).toBe(false);
    expect(bewertetGruppe({ gruppen: ["A"] }, "")).toBe(true);
    expect(bewertetGruppe({ gruppen: ["A"] }, null)).toBe(true);
  });

  test("darfBewerten: Sparte und Gruppe müssen beide passen", () => {
    const r = { sparten: ["Hühner"], gruppen: ["A"] };
    expect(darfBewerten(r, { sparte: "Hühner", gruppe: "A" })).toBe(true);
    expect(darfBewerten(r, { sparte: "Hühner", gruppe: "B" })).toBe(false);
    expect(darfBewerten(r, { sparte: "Tauben", gruppe: "A" })).toBe(false);
    expect(darfBewerten({ sparten: [], gruppen: ["Z2"] }, { sparte: "Tauben", gruppe: "z2" })).toBe(true);
    expect(darfBewerten({ sparten: [], gruppen: [] }, { sparte: "Tauben", gruppe: "X" })).toBe(true);
  });

  test("Zusage: drei Stände, Vorgabe offen zuerst", () => {
    expect(ZUSAGEN).toEqual(["offen", "zugesagt", "abgesagt"]);
  });
});

describe("Obmann-Zuordnung", () => {
  const richter = [
    { id: 1, istObmann: true },
    { id: 2, istObmann: false },
    { id: 3, istObmann: true },
  ];
  test("leer ist erlaubt, sonst ein Obmann derselben Schau, nicht er selbst", () => {
    expect(pruefeObmann(2, null, richter)).toBeNull();
    expect(pruefeObmann(2, 1, richter)).toBeNull();
    expect(pruefeObmann(undefined, 3, richter)).toBeNull();
    expect(pruefeObmann(1, 1, richter)).toBe("selbst");
    expect(pruefeObmann(1, 2, richter)).toBe("keinObmann");
    expect(pruefeObmann(1, 99, richter)).toBe("unbekannt");
  });
});
