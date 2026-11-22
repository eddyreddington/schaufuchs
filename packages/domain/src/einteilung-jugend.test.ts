import { describe, expect, test } from "bun:test";
import { bereicheAusRassen, regelnAusZuteilung, richterNachRasse, vergleicheEinteilFolge, type RassenRegel } from "./einteilung";
import { istJugendBlock, JUGEND_KUERZEL, jugendKennzeichen, vergleicheFolge, type FolgeEintrag } from "./katalog";

let lfd = 0;
const tier = (nr: number, rasse: string, farbenschlag: string, istJugend = false) => ({ id: ++lfd, nr, suffix: "", sparte: "Hühner", rasse, farbenschlag, istJugend });

describe("Einteilung nach Rassen: Jugend separat", () => {
  const regeln: RassenRegel[] = [
    { preisrichterId: 1, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "" },
    { preisrichterId: 2, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "schwarz" },
    { preisrichterId: 3, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "", jugend: true },
    { preisrichterId: 4, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "blau", jugend: true },
    { preisrichterId: 5, sparte: "Hühner", rasse: "Orpington", farbenschlag: "" },
  ];

  test("Jugendregel geht vor (Farbenschlag vor Rasse); ohne Jugendregel gilt die Regel der Rasse für beide", () => {
    expect(richterNachRasse(tier(1, "Wyandotten", "weiß"), regeln)).toBe(1);
    expect(richterNachRasse(tier(1, "Wyandotten", "schwarz"), regeln)).toBe(2);
    expect(richterNachRasse(tier(1, "Wyandotten", "weiß", true), regeln)).toBe(3);
    // Die Jugend der ganzen Rasse geht auch vor einem Farbenschlag der Senioren.
    expect(richterNachRasse(tier(1, "Wyandotten", "schwarz", true), regeln)).toBe(3);
    expect(richterNachRasse(tier(1, "Wyandotten", "blau", true), regeln)).toBe(4);
    // Alte Regeln ohne Merkmal gelten für Jugend und Senioren.
    expect(richterNachRasse(tier(1, "Orpington", "gelb", true), regeln)).toBe(5);
    // Senioren nie nach einer Jugendregel.
    expect(richterNachRasse(tier(1, "Wyandotten", "blau"), regeln)).toBe(1);
    expect(richterNachRasse({ sparte: "Hühner", rasse: "Sussex", farbenschlag: "hell", istJugend: true }, [{ preisrichterId: 9, sparte: "Hühner", rasse: "Sussex", farbenschlag: "", jugend: true }])).toBe(9);
    expect(richterNachRasse({ sparte: "Hühner", rasse: "Sussex", farbenschlag: "hell" }, [{ preisrichterId: 9, sparte: "Hühner", rasse: "Sussex", farbenschlag: "", jugend: true }])).toBeNull();
  });

  test("Bereiche: die Jugend einer Rasse bekommt ihren eigenen Preisrichter", () => {
    const tiere = [tier(1, "Wyandotten", "weiß"), tier(2, "Wyandotten", "weiß"), tier(3, "Orpington", "gelb"), tier(4, "Wyandotten", "weiß", true), tier(5, "Wyandotten", "blau", true), tier(6, "Orpington", "gelb", true)];
    expect(bereicheAusRassen(tiere, regeln).bereiche).toEqual([
      { preisrichterId: 1, vonNr: 1, bisNr: 2 },
      { preisrichterId: 5, vonNr: 3, bisNr: 3 },
      { preisrichterId: 3, vonNr: 4, bisNr: 4 },
      { preisrichterId: 4, vonNr: 5, bisNr: 5 },
      { preisrichterId: 5, vonNr: 6, bisNr: 6 },
    ]);
  });

  test("Regeln aus einer Zuteilung: Jugend einer Rasse als eigene Einheit mit Merkmal", () => {
    const z = (rasse: string, farbe: string, preisrichterId: number | null, istJugend = false) => ({ sparte: "Hühner", rasse, farbenschlag: farbe, preisrichterId, istJugend });
    expect(
      regelnAusZuteilung([z("Wyandotten", "weiß", 1), z("Wyandotten", "weiß", 1), z("Wyandotten", "weiß", 2, true), z("Wyandotten", "blau", 2, true), z("Wyandotten", "blau", 3, true), z("Wyandotten", "blau", 3, true), z("Wyandotten", "blau", 3, true)]),
    ).toEqual([
      { preisrichterId: 1, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "" },
      { preisrichterId: 3, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "", jugend: true },
      { preisrichterId: 2, sparte: "Hühner", rasse: "Wyandotten", farbenschlag: "weiß", jugend: true },
    ]);
  });

  test("Folge der Einteilung: Jugend am Ende (wie der Katalog mit Jugendblock) oder hinter ihrer Rasse", () => {
    const e = (sparteFolge: number, rasseFolge: number, rasse: string, istJugend = false) => ({ sparte: `S${sparteFolge}`, sparteFolge, rasse, rasseFolge, farbenschlag: "weiß", farbFolge: 1, istJugend });
    const liste = [e(1, 2, "B", true), e(2, 1, "C"), e(1, 1, "A", true), e(1, 2, "B"), e(1, 1, "A")];
    const name = (x: (typeof liste)[number]) => `${x.istJugend ? "J-" : ""}${x.rasse}`;
    expect([...liste].sort((a, b) => vergleicheEinteilFolge(a, b, { jugendAmEnde: true })).map(name)).toEqual(["A", "B", "C", "J-A", "J-B"]);
    expect([...liste].sort((a, b) => vergleicheEinteilFolge(a, b, { jugendAmEnde: false })).map(name)).toEqual(["A", "J-A", "B", "J-B", "C"]);
    // Ohne Verzeichnis-Folge ans Ende, nach dem Namen.
    const frei = { sparte: "S1", sparteFolge: 1, rasse: "Neu", rasseFolge: null, farbenschlag: null, farbFolge: null };
    expect(vergleicheEinteilFolge(frei, e(1, 9, "Z"), { jugendAmEnde: true })).toBeGreaterThan(0);
  });
});

describe("Katalog: Jugend eigener Block oder eingereiht", () => {
  const f = (id: number, rasseFolge: number, istJugend: boolean): FolgeEintrag => ({ id, sparteFolge: 1, rasseFolge, farbFolge: 1, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istJugend, ausstellerName: `A${id}`, meldungId: id, position: 0 });
  const liste = [f(1, 2, true), f(2, 1, false), f(3, 1, true), f(4, 2, false)];

  test("eigener Block am Ende oder in der Rasse eingereiht", () => {
    expect([...liste].sort((a, b) => vergleicheFolge(a, b, { jugendSeparat: true })).map((x) => x.id)).toEqual([2, 4, 3, 1]);
    expect([...liste].sort((a, b) => vergleicheFolge(a, b, { jugendSeparat: false })).map((x) => x.id)).toEqual([2, 3, 1, 4]);
  });

  test("eigener Jugendblock nur, wenn eingestellt", () => {
    expect(istJugendBlock({ istJugend: true }, { jugendSeparat: true })).toBe(true);
    expect(istJugendBlock({ istJugend: true }, { jugendSeparat: false })).toBe(false);
    expect(istJugendBlock({ istJugend: false }, { jugendSeparat: true })).toBe(false);
  });

  test("Kennzeichen „Jgd.“ genau dann, wenn die Jugend in der Rasse eingereiht steht", () => {
    expect(jugendKennzeichen({ istJugend: true }, { jugendSeparat: false })).toBe(true);
    // Eigener Block: die Überschrift „Jugend“ kennzeichnet, kein Kürzel an der Zeile.
    expect(jugendKennzeichen({ istJugend: true }, { jugendSeparat: true })).toBe(false);
    expect(jugendKennzeichen({ istJugend: false }, { jugendSeparat: false })).toBe(false);
    expect(jugendKennzeichen({ istJugend: false }, { jugendSeparat: true })).toBe(false);
    // Nie beides: Block und Kürzel schließen sich aus.
    for (const istJugend of [true, false]) for (const jugendSeparat of [true, false]) expect(istJugendBlock({ istJugend }, { jugendSeparat }) && jugendKennzeichen({ istJugend }, { jugendSeparat })).toBe(false);
    expect(JUGEND_KUERZEL).toBe("Jgd.");
  });
});
