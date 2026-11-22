/** Ausstattung der 3D-Halle aus dem Aussehen: Fenster, Geräte an den Wänden, Spielfeldlinien, Decke mit Bindern und Leuchten. */
import { describe, expect, test } from "bun:test";
import { fensterInWaenden, geraeteAnWaenden, spielfeldLinien } from "./hallenplan-3d-ausstattung";
import { aussehenVon } from "./hallenplan-aussehen";
import { hallenSzene, vertauscht, wandInnenseiten, type HallenSzene } from "./hallenplan-3d";
import { zeichnungDerHalle } from "./hallenplan-druck";
import { HALLE_STANDARD, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { punktInUmriss } from "./hallenplan-umriss";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 75 } };
/** Szene in Hallenkoordinaten (x = Breite, z = Länge) wie in hallenplan-3d.test.ts. */
const szene = (h: Halle, tiere: PlanTier[] = []): HallenSzene => {
  const s = hallenSzene(h, planeHalle(h, tiere, masse), masse);
  return zeichnungDerHalle(h).quer ? vertauscht(s) : s;
};
const tuer = (name: string, x: number, y: number, breite: number, tiefe: number) => ({ name, art: "eingang" as const, x, y, breite, tiefe });

describe("Fenster in den Wänden", () => {
  // 15 × 30 m, Längsseiten an x (x0, x1); an der rechten Längsseite eine Tür bei 10–13 m.
  const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [tuer("Eingang", 1400, 1000, 100, 300)] };
  const s = szene(halle);
  const f = fensterInWaenden(s);

  test("nur an den Längsseiten, in voll hohen Wandstücken, nie über einer Tür", () => {
    expect(f.length).toBeGreaterThan(4);
    expect(new Set(f.map((x) => x.seite))).toEqual(new Set(["x0", "x1"]));
    const stuecke = wandInnenseiten(s);
    for (const x of f) {
      const st = stuecke.find((w) => w.wand === x.wand)!;
      expect(st.y).toBe(0);
      expect(x.von).toBeGreaterThanOrEqual(st.von);
      expect(x.bis).toBeLessThanOrEqual(st.bis);
    }
    for (const t of s.tueren) {
      const von = t.q.z, bis = t.q.z + t.q.t;
      expect(f.filter((x) => x.seite === "x1" && x.von < bis && x.bis > von)).toEqual([]);
    }
  });

  test("in der oberen Wand über der Prallwand, gleichmäßig verteilt, mit Abstand zueinander und zu den Ecken", () => {
    const a = s.aussehen;
    for (const x of f) {
      expect(x.y).toBeGreaterThanOrEqual(a.prallwandHoehe + 20);
      expect(x.y + x.h).toBeLessThan(a.wandHoehe);
      expect(x.bis - x.von).toBeGreaterThanOrEqual(100);
      expect(x.bis - x.von).toBeLessThanOrEqual(400);
    }
    const links = f.filter((x) => x.seite === "x0").sort((p, q) => p.von - q.von);
    expect(links[0]!.von).toBeGreaterThanOrEqual(50);
    const luecken = links.slice(1).map((x, i) => x.von - links[i]!.bis);
    for (const l of luecken) expect(Math.abs(l - luecken[0]!)).toBeLessThanOrEqual(1);
    expect(luecken[0]).toBeGreaterThanOrEqual(80);
    // Mehr Wand, mehr Fenster.
    const lang = fensterInWaenden(szene({ ...halle, laenge: 4500, flaechen: [] })).filter((x) => x.seite === "x0");
    expect(lang.length).toBeGreaterThan(links.length);
  });

  test("keine Fenster, wenn abgeschaltet oder über der Prallwand kein Platz ist", () => {
    expect(fensterInWaenden(szene({ ...halle, aussehen: { fenster: false } }))).toEqual([]);
    expect(fensterInWaenden(szene({ ...halle, aussehen: { wandHoehe: 300, prallwandHoehe: 260 } }))).toEqual([]);
  });

  test("hohe Wand: Fenster in der oberen Hälfte", () => {
    const hoch = fensterInWaenden(szene({ ...halle, aussehen: { wandHoehe: 700 } }));
    for (const x of hoch) expect(x.y).toBeGreaterThanOrEqual(350);
  });
});

describe("Geräte an den Wänden", () => {
  const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [], aussehen: { geraete: true } };

  test("Basketballbretter mittig oben an beiden Stirnwänden, Sprossenwand an einer Längsseite unter den Fenstern", () => {
    const s = szene(halle);
    const g = geraeteAnWaenden(s);
    const koerbe = g.filter((x) => x.art === "korb");
    expect(koerbe.map((k) => k.seite).sort()).toEqual(["z0", "z1"]);
    for (const k of koerbe) {
      expect(k.mitte).toBe(750);
      expect(k.y + k.h).toBeLessThanOrEqual(s.wandHoehe);
      expect(k.y).toBeGreaterThanOrEqual(200);
    }
    const sprossen = g.filter((x) => x.art === "sprossenwand");
    expect(sprossen).toHaveLength(1);
    const unten = Math.min(...fensterInWaenden(s).map((f) => f.y));
    expect(sprossen[0]!.y + sprossen[0]!.h).toBeLessThan(unten);
    expect(["x0", "x1"]).toContain(sprossen[0]!.seite);
  });

  test("nicht über einer Tür: liegt die Tür mitten in der Stirnwand, rückt das Brett daneben", () => {
    const s = szene({ ...halle, flaechen: [tuer("Eingang", 600, 2900, 300, 100)] });
    const korb = geraeteAnWaenden(s).find((x) => x.seite === "z1")!;
    expect(korb.mitte + korb.b / 2 <= 600 || korb.mitte - korb.b / 2 >= 900).toBe(true);
  });

  test("nie im Weg der Käfige: an einer Wand mit Wandreihe keine Sprossenwand", () => {
    const tiere = Array.from({ length: 120 }, (_, i): PlanTier => ({ id: i + 1, typ: "huehner", nr: String(i + 1), rasse: "Wyandotten", sparte: "Hühner", preisrichterId: null }));
    const s = szene({ ...halle, richtung: "laengs", wandreihen: true }, tiere);
    const g = geraeteAnWaenden(s);
    const hindernisse = [...s.aufsteller, ...s.kaefige.map((k) => k.q)];
    for (const x of g) {
      const entlangX = x.seite === "z0" || x.seite === "z1";
      const tief = x.art === "korb" ? 60 : 30;
      const [q0, q1] = x.seite === "x0" || x.seite === "z0" ? [x.ebene, x.ebene + tief] : [x.ebene - tief, x.ebene];
      const im = hindernisse.filter((h) => {
        const [e0, e1] = entlangX ? [h.x, h.x + h.b] : [h.z, h.z + h.t];
        const [t0, t1] = entlangX ? [h.z, h.z + h.t] : [h.x, h.x + h.b];
        return e0 < x.mitte + x.b / 2 && e1 > x.mitte - x.b / 2 && t0 < q1 && t1 > q0 && h.y + h.h > x.y;
      });
      expect(im).toEqual([]);
    }
  });

  test("abgeschaltet: keine Geräte", () => {
    expect(geraeteAnWaenden(szene({ ...halle, aussehen: {} }))).toEqual([]);
  });
});

describe("Spielfeldlinien", () => {
  test("große Halle: Handballfeld 40 × 20 m mittig, Torräume 6 m, Mittellinie, Mittelkreis", () => {
    const s = { breite: 2700, laenge: 4500, aussehen: aussehenVon({ linien: true }) };
    const l = spielfeldLinien(s);
    const feld = l.find((x) => x.art === "feld")!;
    const xs = feld.punkte.map((p) => p.x), zs = feld.punkte.map((p) => p.z);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]).toEqual([350, 2350, 250, 4250]);
    const kreis = l.find((x) => x.art === "mittelkreis")!;
    for (const p of kreis.punkte) expect(Math.hypot(p.x - 1350, p.z - 2250)).toBeCloseTo(180, 0);
    const torraum = l.filter((x) => x.art === "torraum");
    expect(torraum).toHaveLength(2);
    // Am weitesten in der Halle 6 m vor der Torlinie.
    expect(Math.max(...torraum[0]!.punkte.map((p) => Math.abs(p.z - 250)))).toBeCloseTo(600, 0);
    expect(l.find((x) => x.art === "mittellinie")!.punkte.every((p) => p.z === 2250)).toBe(true);
    expect(new Set(l.map((x) => x.farbe))).toEqual(new Set(["schwarz", "blau", "rot"]));
  });

  test("kleinere Halle: maßstäblich verkleinert, alles in der Halle; quer liegende Halle: Feld längs der langen Seite", () => {
    const s = { breite: 2800, laenge: 1500, aussehen: aussehenVon({ linien: true }) };
    const l = spielfeldLinien(s);
    for (const x of l) for (const p of x.punkte) {
      expect(p.x).toBeGreaterThanOrEqual(100 - 0.01);
      expect(p.x).toBeLessThanOrEqual(2700 + 0.01);
      expect(p.z).toBeGreaterThanOrEqual(100 - 0.01);
      expect(p.z).toBeLessThanOrEqual(1400 + 0.01);
    }
    expect(l.find((x) => x.art === "mittellinie")!.punkte.every((p) => p.x === 1400)).toBe(true);
    const torraum = l.filter((x) => x.art === "torraum")[0]!;
    // 13 m statt 20 m breit: Faktor 0,65 → Torraum 3,9 m.
    expect(Math.max(...torraum.punkte.map((p) => Math.min(Math.abs(p.x - 100), Math.abs(p.x - 2700))))).toBeCloseTo(390, 0);
  });

  test("zu klein oder abgeschaltet: keine Linien", () => {
    expect(spielfeldLinien({ breite: 800, laenge: 1100, aussehen: aussehenVon({ linien: true }) })).toEqual([]);
    expect(spielfeldLinien({ breite: 2700, laenge: 4500, aussehen: aussehenVon({}) })).toEqual([]);
  });

  test("freier Grundriss: nur, wenn das Feld ganz hineinpasst", () => {
    // Ausschnitt in der Ecke (nicht im Feld): Linien bleiben.
    const ecke = [{ x: 0, y: 0 }, { x: 2700, y: 0 }, { x: 2700, y: 4500 }, { x: 300, y: 4500 }, { x: 300, y: 4300 }, { x: 0, y: 4300 }];
    const l = spielfeldLinien({ breite: 2700, laenge: 4500, umriss: ecke, aussehen: aussehenVon({ linien: true }) });
    expect(l.length).toBeGreaterThan(0);
    for (const x of l) for (const p of x.punkte) expect(punktInUmriss({ x: p.x, y: p.z }, ecke)).toBe(true);
    // L-Halle: das Feld schnitte die Innenecke – keine Linien.
    const lHalle = [{ x: 0, y: 0 }, { x: 2700, y: 0 }, { x: 2700, y: 2000 }, { x: 1500, y: 2000 }, { x: 1500, y: 4500 }, { x: 0, y: 4500 }];
    expect(spielfeldLinien({ breite: 2700, laenge: 4500, umriss: lHalle, aussehen: aussehenVon({ linien: true }) })).toEqual([]);
  });
});
