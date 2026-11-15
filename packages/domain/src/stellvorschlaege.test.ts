import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD } from "./hallenplan";
import { stellTitel, stellVorschlaege } from "./stellvorschlaege";

const t = (id: number) => ({ id, typ: "huehner" as const, nr: String(id), rasse: "R", sparte: "Hühner", preisrichterId: null });

describe("Stellvorschläge", () => {
  // 8 × 18 m, Reihen quer, Eingang an der linken Wand, Hauptgang 3 m: so passen 2 von 80 Hühnern nicht.
  const halle = {
    ...HALLE_STANDARD,
    breite: 800,
    laenge: 1800,
    hauptgang: { breite: 300, lage: "anfang" as const },
    flaechen: [{ name: "Eingang", art: "eingang" as const, x: 0, y: 300, breite: 50, tiefe: 300 }],
    reihenVersatz: [{ nr: 1, dx: 0, dy: 50 }],
    spartenStart: [{ sparte: "Hühner", reihe: 2 }],
  };
  const tiere = Array.from({ length: 80 }, (_, i) => t(i + 1));

  test("bisherige Aufstellung zum Vergleich, bessere zuerst, Eingang bleibt, Handarbeit der alten Aufstellung fällt weg", () => {
    const { aktuell, vorschlaege } = stellVorschlaege(halle, tiere, {});
    expect(aktuell.halle).toBe(halle);
    expect(aktuell.nichtPlatziert).toBeGreaterThan(0);
    // Zuerst eine Aufstellung, in der alle Tiere Platz haben.
    expect(vorschlaege[0]!.nichtPlatziert).toBe(0);
    // Sortiert: nie mehr Tiere ohne Platz als der Vorschlag davor.
    for (let i = 1; i < vorschlaege.length; i++) expect(vorschlaege[i]!.nichtPlatziert).toBeGreaterThanOrEqual(vorschlaege[i - 1]!.nichtPlatziert);
    // Alle möglichen Aufstellungen, nicht nur die besten: quer und längs, jede Lage des Hauptgangs.
    expect(vorschlaege.length).toBeGreaterThan(4);
    expect(new Set(vorschlaege.map((v) => v.halle.richtung))).toEqual(new Set(["quer", "laengs"]));
    expect(new Set(vorschlaege.map((v) => v.halle.hauptgang!.lage))).toEqual(new Set(["anfang", "ende", "beide", "mitte", "keiner"]));
    for (const v of vorschlaege) {
      expect(v.halle.flaechen).toEqual(halle.flaechen);
      expect([v.halle.reihenVersatz, v.halle.plattenVersatz, v.halle.spartenStart]).toEqual([[], [], []]);
      expect(v.halle.breite).toBe(800);
      expect(v.halle.hauptgang!.breite).toBe(v.halle.hauptgang!.lage === "keiner" ? 0 : 300);
      // Nie mit Gängen, die an beiden Enden zu sind.
      expect(v.plan.warnungen.join(" ")).not.toContain("an beiden Enden zu");
    }
    // Kein Vorschlag sieht aus wie ein anderer oder wie die bisherige Aufstellung.
    const bilder = [aktuell, ...vorschlaege].map((v) => JSON.stringify(v.plan.reihen.flatMap((r) => r.platten.map((p) => p.rechteck))));
    expect(new Set(bilder).size).toBe(bilder.length);
  });

  test("ohne Hauptgang: Vorschläge auch mit Hauptgang (Vorgabebreite 3 m); Titel", () => {
    const ohne = { ...halle, hauptgang: { breite: 0, lage: "keiner" as const } };
    const { vorschlaege } = stellVorschlaege(ohne, tiere, {});
    expect(vorschlaege.some((v) => v.halle.hauptgang!.lage === "keiner")).toBe(true);
    expect(vorschlaege.filter((v) => v.halle.hauptgang!.lage !== "keiner").every((v) => v.halle.hauptgang!.breite === 300)).toBe(true);
    expect(stellTitel({ ...HALLE_STANDARD, richtung: "laengs", wandreihen: false, wandBuendig: false, hauptgang: { breite: 300, lage: "mitte" } })).toBe(
      "Reihen längs, ohne Wandreihen, Hauptgang quer durch die Mitte, mit Gang an allen Wänden",
    );
  });

  test("Notausgang an der Wand: auch dann quer und längs zur Auswahl (nicht nur die vier besten)", () => {
    const mitNotausgang = {
      ...HALLE_STANDARD,
      breite: 1550,
      laenge: 2750,
      richtung: "laengs" as const,
      wandreihen: false,
      wandBuendig: false,
      hauptgang: { breite: 250, lage: "ende" as const },
      flaechen: [
        { name: "Notausgang", art: "eingang" as const, x: 0, y: 100, breite: 50, tiefe: 100 },
        { name: "Freifläche", art: "sperre" as const, x: 1030, y: 1870, breite: 490, tiefe: 860 },
      ],
    };
    const viele = Array.from({ length: 270 }, (_, i) => t(i + 1));
    const { vorschlaege } = stellVorschlaege(mitNotausgang, viele, {});
    expect(vorschlaege.some((v) => v.halle.richtung === "quer")).toBe(true);
    expect(vorschlaege.some((v) => v.halle.richtung === "laengs")).toBe(true);
  });
});
