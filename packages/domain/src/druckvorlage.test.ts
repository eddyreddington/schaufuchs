import { describe, expect, test } from "bun:test";
import { bogen, KARTEN_VORGABE, kartenLayout, kartenMassstab, kartenVorlageLesen, korrigiert, MM_JE_ZOLL, PAPIER } from "./druckvorlage";

describe("Druckvorlage Bewertungskarte: Bogen und Karten", () => {
  test("A6 vier je A4, A5 zwei je A4 quer, A4 eine je Seite", () => {
    const a6 = bogen({ art: "a6-auf-a4" });
    expect([a6.breite, a6.hoehe]).toEqual([210, 297]);
    expect(a6.nutzen).toEqual([
      { x: 0, y: 0, breite: 105, hoehe: 148.5 },
      { x: 105, y: 0, breite: 105, hoehe: 148.5 },
      { x: 0, y: 148.5, breite: 105, hoehe: 148.5 },
      { x: 105, y: 148.5, breite: 105, hoehe: 148.5 },
    ]);
    const a5 = bogen({ art: "a5-auf-a4" });
    expect([a5.breite, a5.hoehe, a5.nutzen.length]).toEqual([297, 210, 2]);
    expect(a5.nutzen[1]).toEqual({ x: 148.5, y: 0, breite: 148.5, hoehe: 210 });
    expect(bogen({ art: "a4" }).nutzen).toEqual([{ x: 0, y: 0, breite: 210, hoehe: 297 }]);
  });

  test("Endlospapier: Bogen frei, Karten in Spalten und Zeilen", () => {
    const b = bogen({ art: "endlos", bogenBreite: 240, bogenLaenge: 12 * MM_JE_ZOLL, spalten: 2, zeilen: 2 });
    expect(b.breite).toBe(240);
    expect(b.hoehe).toBeCloseTo(304.8);
    expect(b.nutzen).toHaveLength(4);
    expect(b.nutzen[3]!.x).toBe(120);
    expect(b.nutzen[3]!.y).toBeCloseTo(152.4);
  });

  test("Versatz und Längenkorrektur", () => {
    expect(korrigiert(10, 100, { versatzX: 1.5, versatzY: -2, laengenKorrektur: 0 })).toEqual({ x: 11.5, y: 98 });
    // 1 % länger: 200 mm werden 202 mm.
    expect(korrigiert(0, 200, { versatzX: 0, versatzY: 0, laengenKorrektur: 1 }).y).toBeCloseTo(202);
  });
});

describe("Druckvorlage Bewertungskarte: Bausteine", () => {
  test("Vorgabe: Bausteine füllen die A6-Karte innerhalb des Rands, Texte bekommen den Rest", () => {
    const l = kartenLayout(KARTEN_VORGABE, PAPIER.A6);
    expect(l.map((t) => t.id)).toEqual(["kopf", "tier", "klasse", "ringnummer", "texte", "ankreuzfeld", "note", "unterschriften", "legende"]);
    expect(l[0]!.y).toBe(6);
    const ende = l.at(-1)!;
    expect(ende.y + ende.hoehe).toBeCloseTo(PAPIER.A6.hoehe - 6);
    expect(l.find((t) => t.id === "texte")!.hoehe).toBeGreaterThan(40);
  });

  test("Reihenfolge und Ausschalten wirken; größere Karte, größere Bausteine", () => {
    const v = { ...KARTEN_VORGABE, bausteine: [{ id: "note" as const, an: true }, { id: "kopf" as const, an: true }, { id: "legende" as const, an: false }] };
    const l = kartenLayout(v, PAPIER.A5);
    expect(l.map((t) => t.id)).toEqual(["note", "kopf"]);
    expect(kartenMassstab(PAPIER.A5.breite, 100)).toBeCloseTo(1.41, 2);
    expect(l[0]!.hoehe).toBeCloseTo(14.5 * kartenMassstab(148, 100));
  });

  test("Zu viel für die Karte: alles wird gleichmäßig gestaucht, nichts läuft über", () => {
    const l = kartenLayout({ ...KARTEN_VORGABE, groesse: 150 }, { breite: 105, hoehe: 100 });
    const ende = l.at(-1)!;
    expect(ende.y + ende.hoehe).toBeLessThanOrEqual(100 - 6 + 1e-9);
  });
});

describe("Druckvorlage einlesen", () => {
  test("Nichts gespeichert: Vorgabe", () => {
    expect(kartenVorlageLesen(null)).toEqual(KARTEN_VORGABE);
  });

  test("Ungültiges wird begrenzt oder durch die Vorgabe ersetzt; jeder Baustein genau einmal", () => {
    const v = kartenVorlageLesen({
      format: { art: "endlos", bogenBreite: 9999, bogenLaenge: "x", spalten: 7, zeilen: 0 },
      druck: { versatzX: 99, versatzY: -1, laengenKorrektur: 3 },
      modus: "vordruck",
      bausteine: [{ id: "note" }, { id: "note", an: false }, { id: "gibtsnicht" }, { id: "kopf", an: false }],
      groesse: 10,
      farbig: false,
      felder: { punkte: { x: 20, y: 30, breite: 10, hoehe: 5, groesse: 99 } },
    });
    expect(v.format).toEqual({ art: "endlos", bogenBreite: 500, bogenLaenge: 304.8, spalten: 4, zeilen: 1 });
    expect(v.druck).toEqual({ versatzX: 30, versatzY: -1, laengenKorrektur: 3 });
    expect(v.modus).toBe("vordruck");
    expect(v.bausteine.slice(0, 2)).toEqual([{ id: "note", an: true }, { id: "kopf", an: false }]);
    expect(v.bausteine).toHaveLength(10);
    expect(v.bausteine.filter((b) => b.an).map((b) => b.id)).toEqual(["note"]);
    expect(v.groesse).toBe(70);
    expect(v.farbig).toBe(false);
    expect(v.felder.punkte).toEqual({ x: 20, y: 30, breite: 10, hoehe: 5, groesse: 40 });
    expect(v.felder.katalognummer).toEqual(KARTEN_VORGABE.felder.katalognummer);
  });
});
