/** Hallenplan drucken: Farben der Preisrichter, Lage der Zeichnung, Maßstab fürs Blatt. */
import { describe, expect, test } from "bun:test";
import { festschreiben, HALLE_STANDARD, planeHalle, type PlanTier } from "./hallenplan";
import { druckMassstab, reihenSchilder, RICHTER_FARBE, richterFarbe, richterFolge, richterSchraffur, zeichnungDerHalle } from "./hallenplan-druck";

describe("Hallenplan drucken", () => {
  test("Preisrichter in der Folge ihres ersten Käfigs im Plan, ohne Käfig nach Namen", () => {
    const tier = (id: number, pr: number | null): PlanTier => ({ id, typ: "huehner", nr: String(id), rasse: "R", preisrichterId: pr });
    const plan = planeHalle({ ...HALLE_STANDARD, flaechen: [] }, [tier(1, 20), tier(2, 20), tier(3, 10), tier(4, null)], { huehner: { breite: 70, tiefe: 70, hoehe: 70 } });
    const r = richterFolge(plan, [
      { id: 10, name: "Anton" },
      { id: 30, name: "Bruno" },
      { id: 20, name: "Zacharias" },
      { id: 40, name: "Albert" },
    ]);
    // Zacharias steht vorn (Nr. 1), Anton dahinter (Nr. 3); ohne Tiere nach Namen.
    expect(r.map((x) => x.id)).toEqual([20, 10, 40, 30]);
  });

  test("Farben nach der ersten Lage im Plan: beim Nummerieren behält jeder Preisrichter seine Farbe", () => {
    const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 } };
    const halle = { ...HALLE_STANDARD, flaechen: [] };
    const richter = [{ id: 10, name: "Anton" }, { id: 20, name: "Zacharias" }];
    const t = (id: number, nr: string | null, pr: number): PlanTier => ({ id, typ: "huehner", nr, rasse: "R", preisrichterId: pr });
    const folge = (plan: Parameters<typeof richterFolge>[0]) => richterFolge(plan, richter).map((r) => r.name);
    // Vor den Nummern (Ausstellungsfolge): Zacharias vorn, Anton hinten – nicht nach Namen.
    const vorher = planeHalle(halle, [t(1, null, 20), t(2, null, 20), t(3, null, 10)], masse);
    expect(folge(vorher)).toEqual(["Zacharias", "Anton"]);
    // Automatischer Plan, in Ausstellungsfolge nummeriert: dieselben Farben.
    expect(folge(planeHalle(halle, [t(1, "1", 20), t(2, "2", 20), t(3, "3", 10)], masse))).toEqual(["Zacharias", "Anton"]);
    // Fester Plan, anders nummeriert (Anton bekommt die 1): die Käfige bleiben stehen, die Farben auch.
    const fest = festschreiben(halle, vorher, masse, "2026-11-22T00:00:00.000Z");
    expect(folge(planeHalle(halle, [t(3, "1", 10), t(1, "2", 20), t(2, "3", 20)], masse, fest))).toEqual(["Zacharias", "Anton"]);
  });

  test("Farben: acht, danach von vorn; schraffiert ab der fünften und in der zweiten Runde umgekehrt", () => {
    expect(richterFarbe(0)).toBe(RICHTER_FARBE[0]);
    expect(richterFarbe(8)).toBe(RICHTER_FARBE[0]);
    expect([0, 3, 4, 7, 8, 12].map(richterSchraffur)).toEqual([false, false, true, true, true, false]);
  });

  test("Zeichnung: lange Seite waagrecht; Maßstab passt die ganze Halle samt Rand ins Blatt", () => {
    // Beispielhalle 15,5 × 27,5 m: liegt quer.
    const z = zeichnungDerHalle({ breite: 1550, laenge: 2750 });
    expect(z).toMatchObject({ quer: true, W: 2750, H: 1550 });
    expect(z.zuZeichnung({ x: 100, y: 200, b: 70, h: 210 })).toEqual({ x: 200, y: 100, b: 210, h: 70 });
    // A4 quer (Punkte) ohne Rand und Kopf: rund 780 × 480.
    const m = druckMassstab(z, { b: 780, h: 480 }, 100);
    expect((2750 + 200) * m).toBeLessThanOrEqual(780 + 1e-9);
    expect((1550 + 200) * m).toBeLessThanOrEqual(480 + 1e-9);
    // Eine von beiden Seiten füllt die Fläche.
    expect(Math.max(((2750 + 200) * m) / 780, ((1550 + 200) * m) / 480)).toBeCloseTo(1, 9);
    // Lange, schmale Halle: begrenzt die Breite.
    expect(druckMassstab({ W: 6000, H: 1000 }, { b: 780, h: 480 })).toBeCloseTo(0.13, 9);
  });
});

describe("Reihenbezeichnungen am Rand (Rückmeldung 14.11.2026: „zieht nicht mit und ist unterschiedlich groß“)", () => {
  const rahmen = { x: 0, y: 0, b: 2750, h: 1550 };
  const abstand = { oben: 60, links: 40 };
  const platten = (x: number, y: number, n: number, b = 210, h = 70) => Array.from({ length: n }, (_, i) => ({ x: x + i * b, y, b, h }));
  test("waagrechte Reihe: Bezeichnung links auf der Höhe ihrer Platten – auch wenn alle Platten von Hand verschoben sind", () => {
    const s = reihenSchilder([{ nr: 1, platten: platten(300, 0, 6) }, { nr: 2, platten: platten(300, 500, 6) }], rahmen, abstand);
    expect(s).toEqual([{ nr: 1, seite: "links", mitte: 35 }, { nr: 2, seite: "links", mitte: 535 }]);
  });
  test("verstreute Platten: beim größten zusammenhängenden Stück", () => {
    const r4 = [...platten(300, 750, 2), ...platten(300, 1150, 5)];
    expect(reihenSchilder([{ nr: 4, platten: r4 }], rahmen, abstand)[0]).toEqual({ nr: 4, seite: "links", mitte: 1185 });
  });
  test("senkrechte Reihen: Bezeichnung oben auf der Höhe der Reihe", () => {
    const s = reihenSchilder([{ nr: 7, platten: platten(1200, 300, 5, 70, 210).map((q, i) => ({ ...q, x: 1200, y: 300 + i * 210 })) }], rahmen, abstand);
    expect(s).toEqual([{ nr: 7, seite: "oben", mitte: 1235 }]);
  });
  test("nie übereinander: zu nahe Bezeichnungen rücken auseinander, die Reihenfolge bleibt", () => {
    const s = reihenSchilder([4, 5, 6, 8].map((nr, i) => ({ nr, platten: platten(300, 600 + i * 10, 3) })), rahmen, abstand);
    const m = s.map((x) => x.mitte);
    for (let i = 1; i < m.length; i++) expect(m[i]! - m[i - 1]!).toBeGreaterThanOrEqual(abstand.links - 0.01);
    expect(s.map((x) => x.nr)).toEqual([4, 5, 6, 8]);
    // Am Rand der Halle: nach innen geschoben, nicht über den Rand hinaus.
    const unten = reihenSchilder([1, 2, 3].map((nr) => ({ nr, platten: platten(300, 1480, 3) })), rahmen, abstand).map((x) => x.mitte);
    expect(Math.max(...unten)).toBeLessThanOrEqual(rahmen.h);
  });
});
