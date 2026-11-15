import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, festGeometrie, halleSchluessel, planeHalle, type PlanTier } from "./hallenplan";
import { stellVorschlaege } from "./stellvorschlaege";
import { umlaufsinn, eingangAnWand, istRechteckUmriss, mitUmrissSperren, tuerOeffnung, umrissVersetzt, pruefeUmriss, punktInUmriss, rechteckUmriss, umrissFlaeche, umrissKanten, umrissNormal, umrissSperren, wandZiehen, wandTeilen } from "./hallenplan-umriss";

// L-Form: 20 × 30 m, oben rechts fehlt ein Stück von 8 × 10 m.
const L = [
  { x: 0, y: 0 },
  { x: 1200, y: 0 },
  { x: 1200, y: 1000 },
  { x: 2000, y: 1000 },
  { x: 2000, y: 3000 },
  { x: 0, y: 3000 },
];

describe("Grundriss der Halle (rechtwinklig)", () => {
  test("Rechteck als Umriss, Fläche, Punkt in der Halle", () => {
    expect(rechteckUmriss(2000, 4000)).toEqual([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }]);
    expect(umrissFlaeche(L)).toBe(2000 * 3000 - 800 * 1000);
    expect(punktInUmriss({ x: 600, y: 500 }, L)).toBe(true);
    expect(punktInUmriss({ x: 1600, y: 500 }, L)).toBe(false); // im ausgesparten Stück
    expect(punktInUmriss({ x: 1600, y: 2000 }, L)).toBe(true);
  });

  test("Prüfung: rechtwinklig, geschlossen, ohne Überschneidung, Mindestmaß", () => {
    expect(pruefeUmriss(L)).toBeNull();
    expect(pruefeUmriss([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }])).toMatch(/rechtwinklig/);
    expect(pruefeUmriss([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }])).toMatch(/3 × 3 m/);
    // Achterform: zwei Wände kreuzen sich.
    const acht = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 500, y: 1000 }, { x: 500, y: -500 }, { x: 0, y: -500 }];
    expect(pruefeUmriss(acht)).toMatch(/überschneiden/);
    expect(pruefeUmriss([{ x: 0, y: 0 }, { x: 1000, y: 0 }])).toMatch(/mindestens/);
  });

  test("Außerhalb des Umrisses: Sperrflächen im umschließenden Rechteck, lückenlos und ohne Überlappung", () => {
    const s = umrissSperren(L);
    expect(s).toEqual([{ x: 1200, y: 0, b: 800, h: 1000 }]);
    expect(umrissSperren(rechteckUmriss(2000, 3000))).toEqual([]);
    // U-Form: in der Mitte oben eine Nische.
    const U = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 500 }, { x: 1400, y: 500 }, { x: 1400, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }];
    const su = umrissSperren(U);
    expect(su.reduce((n, q) => n + q.b * q.h, 0)).toBe(800 * 500);
    expect(su.every((q) => !punktInUmriss({ x: q.x + q.b / 2, y: q.y + q.h / 2 }, U))).toBe(true);
  });

  test("Kanten mit Außenseite (für Wände und Türen)", () => {
    const k = umrissKanten(L);
    expect(k).toHaveLength(6);
    expect(k[0]).toMatchObject({ x1: 0, y1: 0, x2: 1200, y2: 0, aussen: "oben" });
    expect(k[1]).toMatchObject({ x1: 1200, y1: 0, x2: 1200, y2: 1000, aussen: "rechts" });
    expect(k[2]).toMatchObject({ x1: 1200, y1: 1000, x2: 2000, y2: 1000, aussen: "oben" });
    expect(k[5]).toMatchObject({ aussen: "links" });
    expect(umrissNormal([{ x: 0, y: 3000 }, { x: 2000, y: 3000 }, { x: 2000, y: 1000 }, { x: 1200, y: 1000 }, { x: 1200, y: 0 }, { x: 0, y: 0 }])).toEqual(L);
  });

  test("Wand ziehen: aus dem Rechteck wird eine Nische, zurückgezogen wieder ein Rechteck", () => {
    const r = rechteckUmriss(2000, 3000);
    // Obere Wand teilen (bei 1200), dann den rechten Teil um 10 m nach innen ziehen.
    const geteilt = wandTeilen(r, 0, 1200);
    expect(geteilt).toHaveLength(5);
    const l = wandZiehen(geteilt, 1, 1000);
    expect(umrissNormal(l)).toEqual(L);
    expect(pruefeUmriss(l)).toBeNull();
    // Zurück an die Außenwand: die überzähligen Ecken fallen weg.
    const k = umrissKanten(umrissNormal(l)).findIndex((x) => x.y1 === 1000 && x.y2 === 1000);
    expect(umrissNormal(wandZiehen(umrissNormal(l), k, -1000))).toEqual(r);
  });

  test("Wand ziehen nach außen: der Ursprung bleibt bei 0/0 (Umriss wird verschoben)", () => {
    const r = rechteckUmriss(2000, 3000);
    // Linke Wand (Kante 3: von 0/3000 nach 0/0) um 2 m nach außen.
    const g = umrissNormal(wandZiehen(r, 3, -200));
    expect(g).toEqual(rechteckUmriss(2200, 3000));
  });

  test("Planung: kein Käfig außerhalb des Grundrisses; Rechteck als Umriss ist wie keiner", () => {
    const halle = { ...HALLE_STANDARD, breite: 2000, laenge: 3000, umriss: L };
    const tiere: PlanTier[] = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, typ: "huehner" as const, nr: String(i + 1), rasse: "Wyandotten", preisrichterId: null }));
    const plan = planeHalle(halle, tiere, null);
    const kaefige = plan.reihen.flatMap((r) => r.kaefige);
    expect(kaefige.length).toBeGreaterThan(0);
    // Kein Käfig ragt in das ausgesparte Stück (x 12–20 m, y 0–10 m).
    expect(kaefige.every((k) => !(k.rechteck.x < 2000 && k.rechteck.x + k.rechteck.b > 1200 && k.rechteck.y < 1000 && k.rechteck.y + k.rechteck.h > 0))).toBe(true);
    // Ohne Aussparung stehen dort Käfige (sonst prüfte der Test nichts).
    const voll = planeHalle({ ...halle, umriss: undefined }, tiere, null).reihen.flatMap((r) => r.kaefige);
    expect(voll.some((k) => k.rechteck.x < 2000 && k.rechteck.x + k.rechteck.b > 1200 && k.rechteck.y < 1000)).toBe(true);
    // Die internen Sperrflächen gehören nicht zur gespeicherten Halle.
    expect(mitUmrissSperren(halle).flaechen.filter((f) => f.aussen)).toHaveLength(1);
    expect(mitUmrissSperren(mitUmrissSperren(halle)).flaechen.filter((f) => f.aussen)).toHaveLength(1);
    expect(istRechteckUmriss(rechteckUmriss(2000, 3000))).toBe(true);
    expect(istRechteckUmriss(L)).toBe(false);
    expect(halleSchluessel({ ...halle, umriss: rechteckUmriss(2000, 3000) })).toBe(halleSchluessel({ ...halle, umriss: undefined }));
    // Ein anderer Grundriss ist eine andere feste Geometrie (im festen Plan: neu setzen).
    expect(festGeometrie(halle, null)).not.toBe(festGeometrie({ ...halle, umriss: undefined }, null));
  });

  test("Wand außen herum: versetzter Umriss, an inneren und äußeren Ecken sauber", () => {
    expect(umrissVersetzt(rechteckUmriss(2000, 3000), 20)).toEqual([{ x: -20, y: -20 }, { x: 2020, y: -20 }, { x: 2020, y: 3020 }, { x: -20, y: 3020 }]);
    expect(umrissVersetzt(L, 20)).toEqual([{ x: -20, y: -20 }, { x: 1220, y: -20 }, { x: 1220, y: 980 }, { x: 2020, y: 980 }, { x: 2020, y: 3020 }, { x: -20, y: 3020 }]);
  });

  test("Türöffnung an der Wand, an der der Eingang liegt (auch an einer Innenwand des Grundrisses)", () => {
    // Eingang 2 m breit an der waagrechten Wand bei y = 10 m im ausgesparten Stück.
    expect(tuerOeffnung(L, { x: 1400, y: 1000, b: 200, h: 50 }, 20)).toEqual({ x: 1400, y: 980, b: 200, h: 20 });
    // Unten an der Außenwand.
    expect(tuerOeffnung(L, { x: 500, y: 2950, b: 300, h: 50 }, 20)).toEqual({ x: 500, y: 3000, b: 300, h: 20 });
    // Mitten in der Halle: keine Wand.
    expect(tuerOeffnung(L, { x: 500, y: 1500, b: 200, h: 50 }, 20)).toBeNull();
  });

  test("Eingang an die nächste Wand: innen anliegend, auf die Wand begrenzt (auch an der Innenwand der Aussparung)", () => {
    // Klick nahe der Innenwand bei y = 10 m im Bereich x 12–20 m: Eingang 2 m lang, 50 cm tief, darunter (in der Halle).
    expect(eingangAnWand(L, { x: 1600, y: 1080 }, 200, null, 50, 10)).toEqual({ x: 1500, y: 1000, breite: 200, tiefe: 50 });
    // Nahe der linken Außenwand: senkrecht, an x = 0.
    expect(eingangAnWand(L, { x: 40, y: 2000 }, 200, null, 50, 10)).toEqual({ x: 0, y: 1900, breite: 50, tiefe: 200 });
    // Aufgezogen über das Ende der Wand hinaus: auf die Wand begrenzt (die Wand bei y = 10 m reicht von x 12 bis 20 m).
    expect(eingangAnWand(L, { x: 1950, y: 1050 }, 300, 1850, 50, 10)).toEqual({ x: 1700, y: 1000, breite: 300, tiefe: 50 });
  });

  test("Stellvorschläge behalten den Grundriss und stellen nichts in die Aussparung", () => {
    const halle = { ...HALLE_STANDARD, breite: 2000, laenge: 3000, umriss: L };
    const tiere: PlanTier[] = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, typ: "huehner" as const, nr: String(i + 1), rasse: "Wyandotten", preisrichterId: null }));
    const v = stellVorschlaege(halle, tiere, null).vorschlaege;
    expect(v.length).toBeGreaterThan(1);
    expect(v.every((x) => JSON.stringify(x.halle.umriss) === JSON.stringify(L))).toBe(true);
    const imLoch = (q: { x: number; y: number; b: number; h: number }) => q.x < 2000 && q.x + q.b > 1200 && q.y < 1000 && q.y + q.h > 0;
    expect(v.every((x) => x.plan.reihen.every((r) => r.kaefige.every((k) => !imLoch(k.rechteck))))).toBe(true);
  });

  test("Mindestlänge jeder Wand (kein 10 cm schmaler Hallenarm); Umlaufsinn", () => {
    const schmal = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 1010, y: 1000 }, { x: 1010, y: 3000 }, { x: 1000, y: 3000 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    expect(pruefeUmriss(schmal)).toMatch(/0,5 m/);
    expect(umlaufsinn(L)).toBe(1);
    expect(umlaufsinn([...L].reverse())).toBe(-1);
  });

  test("Gang vor einem Eingang an einer Innenwand: nur nach innen, nicht rundherum", async () => {
    const { eingangsGang } = await import("./hallenplan");
    const h = { breite: 2000, laenge: 3000, gang: 150, umriss: L };
    expect(eingangsGang(h, { x: 1400, y: 1000, breite: 200, tiefe: 50 })).toEqual({ x: 1400, y: 1000, b: 200, h: 200 });
  });
});
