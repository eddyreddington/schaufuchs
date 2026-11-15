import { describe, expect, test } from "bun:test";
import { bereicheAusRassen, regelnAusZuteilung, richterNachRasse, type RassenRegel } from "./einteilung";

let lfd = 0;
const tier = (nr: number, rasse: string, farbenschlag: string, sparte = "Hühner", suffix = "", zaehlt = true) => ({ id: ++lfd, nr, suffix, sparte, rasse, farbenschlag, zaehlt });

describe("Preisrichter-Einteilung nach Rassen", () => {
  const regeln: RassenRegel[] = [
    { preisrichterId: 1, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "" },
    { preisrichterId: 2, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "silber-schwarzgesäumt" },
    { preisrichterId: 2, sparte: "Hühner", rasse: "Orpington", farbenschlag: "" },
  ];

  test("Farbenschlag-Regel geht vor der Rasse; Groß-/Kleinschreibung und Leerzeichen egal; Sparte muss passen", () => {
    expect(richterNachRasse(tier(1, "Wyandotten", "weiß"), regeln)).toBe(1);
    expect(richterNachRasse(tier(1, "wyandotten ", "Silber-schwarzgesäumt"), regeln)).toBe(2);
    expect(richterNachRasse(tier(1, "Orpington", "gelb"), regeln)).toBe(2);
    expect(richterNachRasse(tier(1, "Wyandotten", "weiß", "Zwerghühner"), regeln)).toBeNull();
    expect(richterNachRasse(tier(1, "Sussex", "hell"), regeln)).toBeNull();
  });

  test("Bereiche: aufeinanderfolgende Nummern zusammen, Lücke ohne Preisrichter trennt, Nachmeldung beim Preisrichter der Nummer", () => {
    const tiere = [
      tier(1, "Wyandotten", "weiß"), tier(2, "Wyandotten", "weiß"), tier(3, "Wyandotten", "silber-schwarzgesäumt"),
      tier(4, "Orpington", "gelb"), tier(5, "Sussex", "hell"), tier(6, "Wyandotten", "schwarz"),
      tier(2, "Wyandotten", "weiß", "Hühner", "a"), tier(6, "Orpington", "gelb", "Hühner", "a"),
    ];
    const { bereiche, abweichend, ohne } = bereicheAusRassen(tiere, regeln);
    expect(bereiche).toEqual([
      { preisrichterId: 1, vonNr: 1, bisNr: 2 },
      { preisrichterId: 2, vonNr: 3, bisNr: 4 },
      { preisrichterId: 1, vonNr: 6, bisNr: 6 },
    ]);
    expect(ohne).toBe(1);
    // 6a ist eine Orpington (Preisrichter 2), steht aber unter Nr. 6 (Preisrichter 1).
    expect(abweichend.map((x) => [x.nummer, x.preisrichterId])).toEqual([["6a", 2]]);
    // Ein Tier, das nicht zählt (Meldung nicht bestätigt), trennt den Bereich: 1–2 und 4 statt 1–4.
    const mitLuecke = bereicheAusRassen([tier(1, "Orpington", "gelb"), tier(2, "Wyandotten", "weiß", "Hühner", "", false), tier(3, "Orpington", "gelb")], regeln);
    expect(mitLuecke.bereiche).toEqual([{ preisrichterId: 2, vonNr: 1, bisNr: 1 }, { preisrichterId: 2, vonNr: 3, bisNr: 3 }]);
    expect(mitLuecke.ohne).toBe(0);
    // Nummern mit Lücke dazwischen (keine Tiere 7–9) bleiben ein Bereich.
    expect(bereicheAusRassen([tier(1, "Orpington", "gelb"), tier(10, "Orpington", "blau")], regeln).bereiche).toEqual([{ preisrichterId: 2, vonNr: 1, bisNr: 10 }]);
  });

  test("Regeln aus einer Zuteilung: ganze Rasse bei einem, geteilte Rasse je Farbenschlag", () => {
    const z = (rasse: string, farbe: string, preisrichterId: number | null) => ({ sparte: "Hühner", rasse, farbenschlag: farbe, preisrichterId });
    const regeln2 = regelnAusZuteilung([
      z("Orpington", "gelb", 2), z("Orpington", "blau", 2),
      z("Wyandotten", "weiß", 1), z("Wyandotten", "weiß", 1), z("Wyandotten", "schwarz", 3), z("Wyandotten", "schwarz", 3), z("Wyandotten", "blau", 1),
      z("Sussex", "hell", null),
    ]);
    expect(regeln2).toEqual([
      { preisrichterId: 2, sparte: "Hühner", rasse: "Orpington", farbenschlag: "" },
      { preisrichterId: 1, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "" },
      { preisrichterId: 3, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "schwarz" },
    ]);
  });
});
