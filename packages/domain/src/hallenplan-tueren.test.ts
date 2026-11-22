/** Türen in den Eingängen: Vorgabe, Bereinigung, Flügel aus der Breite, Aufbau, in der Szene, nie Einfluss auf den Plan. */
import { describe, expect, test } from "bun:test";
import { flaecheBereinigt, GLAS_PROFIL, GLAS_SOCKEL, istTuerArt, PANIK_RAND, TUER_ARTEN, TUER_MIN_BREITE, TUER_VORGABE, tuerArtVon, tuerAufbau, tuerFluegel, ZWEIFLUEGELIG_AB } from "./hallenplan-tueren";
import { tuerLage } from "./hallenplan-3d-waende";
import { festGeometrie, festschreiben, HALLE_STANDARD, halleSchluessel, planeHalle, type Halle, type HallenFlaeche, type PlanTier } from "./hallenplan";
import { hallenSzene, TUER_HOEHE } from "./hallenplan-3d";

const tier = (id: number, nr: string): PlanTier => ({ id, typ: "huehner", nr, rasse: "Wyandotten", sparte: "Hühner", preisrichterId: null });
const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 75 } };
const eingang = (x: Partial<HallenFlaeche> = {}): HallenFlaeche => ({ name: "Eingang", art: "eingang", x: 600, y: 0, breite: 300, tiefe: 100, ...x });

describe("Türen: Vorgabe und Bereinigung", () => {
  test("ohne Angabe eine Tür wie die Wand; ungültige Angaben gelten als nicht gesetzt", () => {
    expect(TUER_VORGABE).toBe("wand");
    expect(tuerArtVon(eingang())).toBe("wand");
    expect(tuerArtVon(undefined)).toBe("wand");
    expect(tuerArtVon(eingang({ tuer: "glas" }))).toBe("glas");
    expect(tuerArtVon(eingang({ tuer: "offen" }))).toBe("offen");
    expect(tuerArtVon(eingang({ tuer: "stahl" as never }))).toBe("wand");
    expect(TUER_ARTEN.every(istTuerArt)).toBe(true);
    expect(istTuerArt("WAND")).toBe(false);
  });

  test("gespeichert nur an Eingängen, nur gültig und nur abweichend von der Vorgabe", () => {
    expect(flaecheBereinigt(eingang({ tuer: "holz" }))).toEqual(eingang({ tuer: "holz" }));
    expect(flaecheBereinigt(eingang({ tuer: "offen" })).tuer).toBe("offen");
    expect("tuer" in flaecheBereinigt(eingang({ tuer: "wand" }))).toBe(false);
    expect("tuer" in flaecheBereinigt(eingang({ tuer: "stahl" as never }))).toBe(false);
    expect("tuer" in flaecheBereinigt({ ...eingang({ tuer: "glas" }), art: "sperre" })).toBe(false);
    expect(flaecheBereinigt(eingang())).toEqual(eingang());
  });
});

describe("Türen: Flügel und Aufbau", () => {
  test(`bis ${ZWEIFLUEGELIG_AB} cm einflügelig, breiter zweiflügelig`, () => {
    expect(tuerFluegel(80)).toBe(1);
    expect(tuerFluegel(ZWEIFLUEGELIG_AB)).toBe(1);
    expect(tuerFluegel(ZWEIFLUEGELIG_AB + 1)).toBe(2);
    expect(tuerFluegel(300)).toBe(2);
  });

  test("Blätter füllen die Öffnung innerhalb der Zarge, Griffe zur Mitte bzw. rechts, Panikstange am Notausgang", () => {
    const eins = tuerAufbau({ art: "holz", breite: 100, hoehe: TUER_HOEHE, notausgang: false })!;
    expect(eins.blaetter).toHaveLength(1);
    expect(eins.blaetter[0]!.von).toBeCloseTo(-50 + eins.zarge);
    expect(eins.blaetter[0]!.bis).toBeCloseTo(50 - eins.zarge);
    expect(eins.blaetter[0]!.griff).toBeGreaterThan(0);
    expect(eins.hoehe).toBeLessThan(TUER_HOEHE - eins.zarge + 0.01);
    expect(eins.panik).toBe(false);
    const zwei = tuerAufbau({ art: "glas", breite: 300, hoehe: TUER_HOEHE, notausgang: true })!;
    expect(zwei.blaetter).toHaveLength(2);
    expect(zwei.blaetter[0]!.bis).toBeLessThan(0);
    expect(zwei.blaetter[1]!.von).toBeGreaterThan(0);
    expect(zwei.blaetter[0]!.griff).toBeLessThan(0);
    expect(zwei.blaetter[1]!.griff).toBeGreaterThan(0);
    expect(zwei.panik).toBe(true);
    // Bündig wie die Wand: nur eine feine Fuge statt eines Rahmens.
    expect(tuerAufbau({ art: "wand", breite: 100, hoehe: TUER_HOEHE, notausgang: false })!.zarge).toBeLessThan(2);
    expect(tuerAufbau({ art: "offen", breite: 100, hoehe: TUER_HOEHE, notausgang: false })).toBeNull();
    // Flügel aus der Szene (SzeneTuer.fluegel) gehen vor.
    expect(tuerAufbau({ art: "holz", breite: 300, hoehe: TUER_HOEHE, notausgang: false, fluegel: 1 })!.blaetter).toHaveLength(1);
  });

  test(`schmaler als ${TUER_MIN_BREITE} cm bleibt die Öffnung; darüber haben Glas und Panikstange immer Platz`, () => {
    for (let breite = 10; breite <= 400; breite += 5)
      for (const art of ["wand", "glas", "holz"] as const) {
        const a = tuerAufbau({ art, breite, hoehe: TUER_HOEHE, notausgang: true });
        if (breite < TUER_MIN_BREITE) {
          expect(a).toBeNull();
          continue;
        }
        expect(a!.hoehe - GLAS_PROFIL - GLAS_SOCKEL).toBeGreaterThan(0);
        for (const b of a!.blaetter) {
          expect(b.bis - b.von - 2 * GLAS_PROFIL).toBeGreaterThan(0);
          expect(b.bis - b.von - 2 * PANIK_RAND).toBeGreaterThan(0);
        }
      }
  });
});

describe("Türen in der Szene und im Plan", () => {
  const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [eingang(), { name: "Notausgang", art: "eingang", x: 0, y: 2000, breite: 80, tiefe: 110 }] };

  test("Szene: Türart, Flügel und der Sturz darüber (blendet mit ihr aus)", () => {
    const h: Halle = { ...halle, flaechen: [eingang({ tuer: "glas" }), halle.flaechen[1]!] };
    const s = hallenSzene(h, planeHalle(h, [], masse), masse);
    expect(s.tueren.map((t) => [t.name, t.art, t.fluegel])).toEqual([
      ["Eingang", "glas", 2],
      ["Notausgang", "wand", 1],
    ]);
    for (const t of s.tueren) {
      const sturz = s.waende[t.wand]!;
      expect(sturz.y).toBe(TUER_HOEHE);
      expect([sturz.x, sturz.z, sturz.b, sturz.t]).toEqual([t.q.x, t.q.z, t.q.b, t.q.t]);
    }
  });

  test("Lage: Innenfläche, Mitte und Breite entlang der Wand, Richtung „rechts“ von innen gesehen", () => {
    const h: Halle = { ...halle, breite: 3000, laenge: 1500, flaechen: [eingang(), eingang({ name: "Hinten", y: 1400 }), { name: "Links", art: "eingang", x: 0, y: 500, breite: 80, tiefe: 110 }, { name: "Rechts", art: "eingang", x: 2920, y: 500, breite: 80, tiefe: 110 }] };
    const s = hallenSzene(h, planeHalle(h, [], masse), masse);
    const lage = Object.fromEntries(s.tueren.map((t) => [t.name, tuerLage(t, s)]));
    expect(lage.Eingang).toEqual({ seite: "z0", ebene: 0, mitte: 750, breite: 300, tiefe: s.wandDicke, richtung: 1 });
    expect(lage.Hinten).toEqual({ seite: "z1", ebene: 1500, mitte: 750, breite: 300, tiefe: s.wandDicke, richtung: -1 });
    expect(lage.Links).toEqual({ seite: "x0", ebene: 0, mitte: 555, breite: 110, tiefe: s.wandDicke, richtung: -1 });
    expect(lage.Rechts).toEqual({ seite: "x1", ebene: 3000, mitte: 555, breite: 110, tiefe: s.wandDicke, richtung: 1 });
  });

  test("Türart ändert den Stand der Halle, aber weder feste Geometrie noch Plan", () => {
    const tiere = Array.from({ length: 12 }, (_, i) => tier(i + 1, String(i + 1)));
    const mit: Halle = { ...halle, flaechen: [eingang({ tuer: "holz" }), { ...halle.flaechen[1]!, tuer: "offen" }] };
    expect(halleSchluessel(mit)).not.toBe(halleSchluessel(halle));
    expect(festGeometrie(mit, masse)).toBe(festGeometrie(halle, masse));
    const ohne = planeHalle(halle, tiere, masse);
    const plan = planeHalle(mit, tiere, masse);
    expect(plan.reihen).toEqual(ohne.reihen);
    expect(plan.warnungen).toEqual(ohne.warnungen);
    // Fester Plan: bleibt fest und gleich.
    const fest = festschreiben(halle, ohne, masse, "2026-11-22");
    const festMit = planeHalle(mit, tiere, masse, fest);
    expect(festMit.fest?.veraltet).toBe(false);
    expect(festMit.reihen).toEqual(planeHalle(halle, tiere, masse, fest).reihen);
  });
});
