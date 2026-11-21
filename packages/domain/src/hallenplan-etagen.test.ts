/**
 * Etagen: Käfige übereinander auf einer Grundplatte. Eine Platte trägt Käfige nebeneinander × Etagen; gestellt und gezählt
 * wird Spalte für Spalte, unten zuerst. Fester Plan, Entfernen, Planfolge und Käfigblöcke kennen die Etage.
 */
import { describe, expect, test } from "bun:test";
import { etagenNormal, etagenVon, festGeometrie, festschreiben, HALLE_STANDARD, halleSchluessel, planeHalle, platteFuer, plaetzeJePlatte, type Halle, type PlanTier } from "./hallenplan";
import { hallenSzene } from "./hallenplan-3d";
import { leereEntfernen, pruefeEntfernt } from "./hallenplan-entfernen";
import { fehlendeKaefige } from "./hallenplan-fehlend";
import { planFolge } from "./hallenplan-folge";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
let id = 0;
const tauben = (n: number): PlanTier[] =>
  Array.from({ length: n }, () => {
    id++;
    return { id, typ: "tauben", nr: String(id), rasse: "Kingtauben", sparte: "Tauben", preisrichterId: null };
  });
// Eine Reihe (längs, ohne Wandreihen, ein Abschnitt von 0 bis 2000).
const halle: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 500, laenge: 2000, wandreihen: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
const zwei: Halle = { ...halle, etagen: { tauben: 2 } };

describe("Etagen je Käfigart", () => {
  test("Vorgabe eine Etage, höchstens vier, Volieren nie übereinander; leere Angabe ändert Schlüssel und Geometrie nicht", () => {
    expect(etagenVon("tauben", halle)).toBe(1);
    expect(etagenVon("tauben", zwei)).toBe(2);
    expect(etagenVon("tauben", { etagen: { tauben: 9 } })).toBe(4);
    expect(etagenVon("voliere", { etagen: { voliere: 2 } })).toBe(1);
    expect(etagenNormal({ tauben: 1, huehner: 2 })).toEqual({ huehner: 2 });
    expect(etagenNormal({ tauben: 1 })).toBeUndefined();
    expect(halleSchluessel({ ...halle, etagen: {} })).toBe(halleSchluessel(halle));
    expect(halleSchluessel({ ...halle, etagen: { tauben: 1 } })).toBe(halleSchluessel(halle));
    expect(festGeometrie({ ...halle, etagen: { tauben: 1 } }, masse)).toBe(festGeometrie(halle, masse));
    expect(festGeometrie(zwei, masse)).not.toBe(festGeometrie(halle, masse));
  });

  test("Kapazität: fünf Taubenkäfige nebeneinander × zwei Etagen = zehn Plätze je Grundplatte", () => {
    expect(platteFuer("tauben", masse.tauben, zwei)).toMatchObject({ n: 5, etagen: 2, plaetze: 10, laenge: 200 });
    expect(plaetzeJePlatte("tauben", 40, zwei)).toBe(10);
    id = 0;
    const t = tauben(20);
    const eine = planeHalle(halle, t, masse);
    const p = planeHalle(zwei, t, masse);
    expect(eine.reihen[0]!.platten).toHaveLength(4);
    expect(p.reihen[0]!.platten.map((pl) => [pl.plaetze, pl.belegt])).toEqual([[10, 10], [10, 10]]);
    // Reserve (zwei Reihen, Abschnitt 0–18,50 m): R1 noch sieben Platten, R2 neun – je zehn Plätze.
    const res = (x: typeof p) => x.reserve.find((r) => r.typ === "tauben")!.anzahl;
    expect(res(p)).toBe((7 + 9) * 10);
    expect(res(eine)).toBe((5 + 9) * 5);
  });

  test("Spalte für Spalte, unten zuerst; freie Plätze der angefangenen Platte in beiden Etagen", () => {
    id = 0;
    const p = planeHalle(zwei, tauben(13), masse);
    const r = p.reihen[0]!;
    const lage = r.kaefige.map((k) => [k.nr, k.y, k.etage ?? 0]);
    expect(lage.slice(0, 4)).toEqual([["1", 0, 0], ["2", 0, 1], ["3", 40, 0], ["4", 40, 1]]);
    expect(lage.slice(10)).toEqual([["11", 200, 0], ["12", 200, 1], ["13", 240, 0]]);
    // Gleiche Grundfläche je Spalte.
    expect(r.kaefige[0]!.rechteck).toEqual(r.kaefige[1]!.rechteck);
    expect(r.freiePlaetze!.map((f) => [f.y, f.etage ?? 0])).toEqual([[240, 1], [280, 0], [280, 1], [320, 0], [320, 1], [360, 0], [360, 1]]);
    expect(planFolge(p, "laengs")).toEqual(r.kaefige.map((k) => k.id));
    // Im Plan: die Grundfläche quer zur Front geteilt, unten vorn am Gang (R1 zeigt nach links: x−).
    const [u, o] = [r.kaefige[0]!, r.kaefige[1]!];
    expect(r.front).toBe("links");
    expect(u.zeichnung).toEqual({ x: u.rechteck.x, y: u.rechteck.y, b: 20, h: 40 });
    expect(o.zeichnung).toEqual({ x: u.rechteck.x + 20, y: u.rechteck.y, b: 20, h: 40 });
    // Eine Etage: kein eigenes Feld.
    expect(planeHalle(halle, tauben(1), masse).reihen[0]!.kaefige[0]!.zeichnung).toBeUndefined();
  });

  test("fester Plan: Etage bleibt; Nachmeldung in den freien oberen Platz, angebaute Platte mit beiden Etagen", () => {
    id = 0;
    const t = tauben(19);
    const plan = planeHalle(zwei, t, masse);
    const fest = festschreiben(zwei, plan, masse, "2026-11-14T12:00:00.000Z");
    expect(fest.reihen[0]!.plaetze.filter((pl) => pl.etage === 1)).toHaveLength(10);
    const nach = tauben(1);
    const p = planeHalle(zwei, [...t, ...nach], masse, fest);
    const k = p.reihen[0]!.kaefige.find((x) => x.id === nach[0]!.id)!;
    expect([k.y, k.etage]).toEqual([360, 1]);
    // Elf weitere: zehn Plätze frei? Nein – voll; die nächste Platte wird angebaut, mit zehn Plätzen.
    const mehr = tauben(3);
    const q = planeHalle(zwei, [...t, ...nach, ...mehr], masse, fest);
    const angebaut = q.reihen[0]!.platten.filter((pl) => pl.angebaut);
    expect(angebaut.map((pl) => [pl.plaetze, pl.belegt])).toEqual([[10, 3]]);
    expect(q.reihen[0]!.kaefige.filter((x) => mehr.some((m) => m.id === x.id)).map((x) => x.etage ?? 0)).toEqual([0, 1, 0]);
  });

  test("Entfernen: ein freier oberer Platz geht allein, der untere bleibt", () => {
    id = 0;
    const t = tauben(13);
    const plan = planeHalle(zwei, t, masse);
    const fest = festschreiben(zwei, plan, masse, "2026-11-14T12:00:00.000Z");
    const p = planeHalle(zwei, t, masse, fest);
    const oben = p.reihen[0]!.freiePlaetze!.find((f) => f.y === 280 && f.etage === 1)!;
    const e = leereEntfernen(zwei, p, [{ art: "platz", reihe: 1, x: oben.x, y: oben.y, etage: 1 }]);
    expect(e.plaetze).toBe(1);
    expect(e.halle.entfernt).toEqual([{ reihe: 1, art: "platz", x: oben.x, y: 280, etage: 1 }]);
    expect(pruefeEntfernt(undefined, e.halle.entfernt, fest, p)).toBeNull();
    const danach = planeHalle(e.halle, t, masse, fest);
    expect(danach.reihen[0]!.freiePlaetze!.filter((f) => f.y === 280).map((f) => f.etage ?? 0)).toEqual([0]);
    // Ein belegter oberer Platz lässt sich nicht entfernen.
    const belegt = p.reihen[0]!.kaefige.find((k) => k.etage === 1)!;
    expect(leereEntfernen(zwei, p, [{ art: "platz", reihe: 1, x: belegt.x, y: belegt.y, etage: 1 }]).plaetze).toBe(0);
  });

  test("Käfigblock: Plätze × Etagen, je Spalte dieselbe Grundfläche; fehlende Käfige brauchen halb so viele Blöcke", () => {
    id = 0;
    const klein: Halle = { ...zwei, laenge: 350, objekte: [{ id: "b", art: "kaefigblock", typ: "tauben", x: 300, y: 250, drehung: 0 }] };
    // Zwei Reihen mit je einer Platte (zehn Plätze): 20 gestellt, 15 ohne Platz.
    const p = planeHalle({ ...klein, objekte: [] }, tauben(35), masse);
    expect(p.nichtPlatziert).toHaveLength(15);
    expect(fehlendeKaefige(p.nichtPlatziert, masse, zwei)[0]).toMatchObject({ anzahl: 15, noetig: 2 });
    expect(fehlendeKaefige(p.nichtPlatziert, masse, halle)[0]).toMatchObject({ anzahl: 15, noetig: 3 });
    id = 0;
    const mit = planeHalle(klein, tauben(35), masse);
    const b = mit.objekte[0]!;
    expect(b.plaetze).toBe(10);
    expect(b.kaefige!.map((k) => k.etage ?? 0)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(b.kaefige![0]!.rechteck).toEqual(b.kaefige![1]!.rechteck);
    expect(b.kaefige![0]!.rechteck.b).toBe(40);
  });

  test("3D: Käfige der oberen Etage stehen auf denen der unteren", () => {
    id = 0;
    const p = planeHalle(zwei, tauben(4), masse);
    const s = hallenSzene(zwei, p, masse, { hoehe: 80 });
    const k = (nr: string) => s.kaefige.find((x) => x.tier?.nr === nr)!.q;
    expect([k("1").y, k("2").y]).toEqual([80, 120]);
    expect(k("2").x).toBe(k("1").x);
    expect(s.kaefige.filter((x) => !x.tier).every((x) => x.q.y === 80 || x.q.y === 120)).toBe(true);
  });
});
