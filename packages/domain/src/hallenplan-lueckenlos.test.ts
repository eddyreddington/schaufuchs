/**
 * Lückenlose Reihen (Rückmeldung 14.11.2026: „beim automatische berechnen entstehen immernoch lücken … die reihen sollen ein bild
 * bekommen und keine lücken, man kann auch kleinere an große käfige reihen“). Beispielhalle quer, ohne Hauptgang,
 * Einzelreihen an beiden Wänden, 271 Tiere in 100/70/50/40er-Käfigen mit Spartenwechseln mitten in den Käfigarten.
 */
import { describe, expect, test } from "bun:test";
import { frontFehler, HALLE_STANDARD, planeHalle, planeImReihensystem, type Halle, type Hallenplan, type PlanTier, type Rechteck } from "./hallenplan";
import { neuSetzen } from "./hallenplan-neu";
import type { KaefigMasse, KaefigTyp } from "./kaefige";

const masse: KaefigMasse = { grosskaefig: { breite: 100, tiefe: 100, hoehe: 100 }, huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
let id = 0;
const art = (n: number, typ: KaefigTyp, sparte: string): PlanTier[] =>
  Array.from({ length: n }, () => {
    id++;
    return { id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null };
  });
// Käfigarten in der Folge von einer Beispiel-Aufbauliste (1–4 Großkäfige, 5–43 70er, dann 50er und 40er im Wechsel), Sparten dazu.
const aufbauliste = (): PlanTier[] => {
  id = 0;
  return [
    ...art(4, "grosskaefig", "Wassergeflügel"),
    ...art(24, "huehner", "Hühner"),
    ...art(15, "huehner", "Hühner Jugend"),
    ...art(56, "zwerghuehner", "Zwerghühner"),
    ...art(10, "tauben", "Tauben"),
    ...art(4, "zwerghuehner", "Tauben"),
    ...art(20, "tauben", "Tauben"),
    ...art(8, "zwerghuehner", "Tauben Jugend"),
    ...art(24, "tauben", "Tauben Jugend"),
    ...art(24, "zwerghuehner", "Ziertauben"),
    ...art(30, "tauben", "Ziertauben"),
    ...art(12, "zwerghuehner", "Jugend Ziertauben"),
    ...art(40, "tauben", "Jugend Ziertauben"),
  ];
};
const beispielhalle: Halle = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, gang: 150, richtung: "quer", wandreihen: true, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };

const T = 0.5;
const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - T && q.y >= a.y - T && q.x + q.b <= a.x + a.b + T && q.y + q.h <= a.y + a.h + T;

/** Was am Bild der Reihen nicht stimmt (leer = ruhiges Bild). */
export function bildFehler(halle: Halle, plan: Hallenplan): string[] {
  const f: string[] = [];
  const entlang = (q: Rechteck) => (plan.quer ? { von: q.x, bis: q.x + q.b } : { von: q.y, bis: q.y + q.h });
  for (const r of plan.reihen) {
    for (const a of r.flaechen) {
      const platten = r.platten.filter((pl) => !pl.entfernt && innen(pl.rechteck, a)).map((pl) => ({ ...entlang(pl.rechteck), voll: pl.belegt >= pl.plaetze, typ: pl.typ, q: pl.rechteck }));
      platten.sort((x, y) => x.von - y.von);
      if (!platten.length) continue;
      const ab = entlang(a);
      // Bündig von einem Ende her, ohne Lücke.
      if (Math.abs(platten[0]!.von - ab.von) > T && Math.abs(platten.at(-1)!.bis - ab.bis) > T) f.push(`R${r.nr}: nicht bündig am Anfang oder Ende`);
      for (let i = 1; i < platten.length; i++) if (platten[i]!.von - platten[i - 1]!.bis > T) f.push(`R${r.nr}: Lücke von ${Math.round(platten[i]!.von - platten[i - 1]!.bis)} cm`);
      // Frei nur auf der letzten Platte des Reihenstücks (Rückmeldung 14.11.2026: „mischen erlaubt“) – mitten in der Reihe nur, wo
      // der nächste Käfig nicht auf den Rest passt (zu lang oder zu tief für die Platte; die Platte wird nie gekürzt).
      const tiefe = (q: Rechteck) => (plan.quer ? q.h : q.b);
      for (let i = 0; i + 1 < platten.length; i++) {
        const pl = platten[i]!;
        if (pl.voll) continue;
        const auf = r.kaefige.filter((k) => innen(k.rechteck, pl.q));
        const ende = Math.max(pl.von, ...auf.map((k) => entlang(k.rechteck).bis));
        const naechster = r.kaefige.filter((k) => innen(k.rechteck, platten[i + 1]!.q)).sort((x, y) => entlang(x.rechteck).von - entlang(y.rechteck).von)[0];
        if (!naechster) continue;
        const n = entlang(naechster.rechteck);
        if (n.bis - n.von <= pl.bis - ende + T && tiefe(naechster.rechteck) <= tiefe(pl.q) + T) f.push(`R${r.nr}: frei mitten in der Reihe, obwohl Käfig ${naechster.nr} auf den Rest passt`);
      }
    }
  }
  // Doppelreihen Rücken an Rücken ohne Abstand.
  for (const r of plan.reihen) {
    if (r.art !== "doppel" || r.front !== "links") continue;
    const partner = plan.reihen.find((x) => x.nr === r.nr + 1);
    if (partner && Math.abs(partner.x - (r.x + r.tiefe)) > T) f.push(`R${r.nr}/R${partner.nr}: Abstand zwischen den Rückwänden`);
  }
  // Vor jeder Front mindestens die Gangbreite.
  f.push(...frontFehler(halle, plan));
  return f;
}

/** Länge der Reihen, die Käfige tragen (in Reihenrichtung). */
const laengen = (p: Hallenplan) => p.reihen.filter((r) => r.platten.length).map((r) => r.platten.reduce((n, pl) => n + pl.laenge, 0));

describe("Lückenlose Reihen (Beispielhalle quer)", () => {
  test("keine Lücke, Sparten laufen durch, Reihen etwa gleich lang, alle Tiere gestellt", () => {
    const tiere = aufbauliste();
    expect(tiere).toHaveLength(271);
    const p = planeHalle(beispielhalle, tiere, masse);
    expect(bildFehler(beispielhalle, p)).toEqual([]);
    expect(p.nichtPlatziert).toHaveLength(0);
    expect(p.warnungen.filter((w) => /Sparte/.test(w))).toEqual([]);
    // Ruhiges Bild: bis auf die letzte Reihe höchstens eine Grundplatte Unterschied.
    const l = laengen(p);
    const ohneLetzte = l.slice(0, -1);
    expect(Math.max(...ohneLetzte) - Math.min(...ohneLetzte)).toBeLessThanOrEqual(215);
    // Eine neue Sparte beginnt nicht mehr in einer neuen Reihe: keine Reihe ist kürzer als die Hälfte der längsten (außer der letzten).
    expect(Math.min(...ohneLetzte)).toBeGreaterThanOrEqual(Math.max(...l) / 2);
    // Katalogfolge bleibt: Reihe für Reihe aufsteigend.
    const folge = p.reihen.flatMap((r) => [...r.kaefige].sort((a, b) => (p.quer ? a.rechteck.x - b.rechteck.x : a.rechteck.y - b.rechteck.y)).map((k) => k.id));
    expect(folge).toEqual([...folge].sort((a, b) => a - b));
  });

  test("auch neu gesetzt, längs und mit Hauptgang: ohne Lücken", () => {
    const tiere = aufbauliste();
    for (const richtung of ["quer", "laengs"] as const)
      for (const lage of ["keiner", "anfang", "beide", "mitte"] as const) {
        const h: Halle = { ...beispielhalle, richtung, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage } };
        const { halle, plan } = neuSetzen(h, tiere, masse);
        expect(bildFehler(halle, plan)).toEqual([]);
      }
  });
});

describe("Restplätze der letzten Platte einer Käfigart (Rückmeldung 14.11.2026: „Ja, mischen erlaubt“)", () => {
  const ueber = (a: Rechteck, b: Rechteck) => a.x < b.x + b.b - T && b.x < a.x + a.b - T && a.y < b.y + b.h - T && b.y < a.y + a.h - T;
  const folge = (p: Hallenplan) => p.reihen.flatMap((r) => [...r.kaefige].sort((a, b) => (p.quer ? a.rechteck.x - b.rechteck.x : a.rechteck.y - b.rechteck.y) || (a.etage ?? 0) - (b.etage ?? 0)).map((k) => k.id));
  const platten = (p: Hallenplan) => p.reihen.reduce((n, r) => n + r.platten.length, 0);
  /** Mit Resten: 25 Hühner (zwei 70er frei), 7 Zwerghühner (ein 50er frei), 13 Tauben (zwei 40er frei), 9 Zwerghühner … */
  const mitResten = () => {
    id = 0;
    return [...art(4, "grosskaefig", "Wassergeflügel"), ...art(25, "huehner", "Hühner"), ...art(7, "zwerghuehner", "Zwerghühner"), ...art(13, "tauben", "Tauben"), ...art(9, "zwerghuehner", "Tauben"), ...art(30, "tauben", "Tauben Jugend")];
  };

  test("Standard gemischt: Käfige der nächsten Art auf dem Rest der Platte – ohne Lücke, ohne Überschneidung, in Katalogfolge, in echter Breite", () => {
    const tiere = mitResten();
    const a = planeHalle(beispielhalle, tiere, masse);
    const b = planeHalle({ ...beispielhalle, restPlaetze: "frei" }, tiere, masse);
    expect(a.nichtPlatziert).toEqual([]);
    expect(bildFehler(beispielhalle, a)).toEqual([]);
    expect(a.reihen.some((r) => r.platten.some((pl) => pl.gemischt))).toBe(true);
    expect(platten(a)).toBeLessThan(platten(b));
    expect(folge(a)).toEqual(tiere.map((t) => t.id));
    for (const r of a.reihen) {
      // Kein Käfig ragt über seine Platte, keiner liegt auf einem anderen (je Etage); jeder in der Breite seiner Art.
      for (const k of r.kaefige) {
        expect(innen(k.rechteck, r.platten[k.platte!]!.rechteck)).toBe(true);
        expect(Math.min(k.rechteck.b, k.rechteck.h)).toBe(Math.min(masse[k.typ]!.breite, masse[k.typ]!.tiefe));
      }
      for (const [i, k] of r.kaefige.entries())
        for (const x of r.kaefige.slice(i + 1)) if ((k.etage ?? 0) === (x.etage ?? 0)) expect(ueber(k.rechteck, x.rechteck)).toBe(false);
      for (const pl of r.platten.filter((x) => x.gemischt)) {
        const auf = r.kaefige.filter((k) => r.platten[k.platte!] === pl);
        // Die Platte beginnt mit ihrer Art; Plätze = belegt + frei darauf.
        expect(auf[0]!.typ).toBe(pl.typ);
        expect(pl.plaetze).toBe(pl.belegt + (r.freiePlaetze ?? []).filter((f) => r.platten[f.platte!] === pl).length);
      }
      // Frei nur noch auf der letzten Platte der Reihe.
      const letzte = r.platten.length - 1;
      expect((r.freiePlaetze ?? []).every((f) => f.platte === letzte)).toBe(true);
    }
  });

  test("restPlaetze „frei“: jede Platte sortenrein, die übrigen Plätze bleiben frei", () => {
    const p = planeHalle({ ...beispielhalle, restPlaetze: "frei" }, mitResten(), masse);
    for (const r of p.reihen) {
      expect(r.platten.some((pl) => pl.gemischt)).toBe(false);
      for (const k of r.kaefige) expect(k.typ).toBe(r.platten[k.platte!]!.typ);
    }
  });

  test("Nachbau: Die Käfigzahlen des Beispiels gehen fast ganz in Platten auf – gemischt ändert dort fast nichts", () => {
    const tiere = aufbauliste();
    const a = planeHalle(beispielhalle, tiere, masse);
    const b = planeHalle({ ...beispielhalle, restPlaetze: "frei" }, tiere, masse);
    expect(platten(a)).toBeLessThanOrEqual(platten(b));
    expect(bildFehler(beispielhalle, a)).toEqual([]);
  });

  test("passt der nächste Käfig nicht auf den Rest (zu tief oder zu lang), bleibt der Rest frei", () => {
    id = 0;
    // Tauben (Platte 40 tief) und danach Hühner (70 tief): kein Huhn auf der Taubenplatte.
    const p = planeHalle(beispielhalle, [...art(2, "tauben", "Tauben"), ...art(2, "huehner", "Hühner")], masse);
    const r = p.reihen.find((x) => x.kaefige.length)!;
    expect(r.platten.map((pl) => pl.typ)).toEqual(["tauben", "huehner"]);
    expect(r.platten.some((pl) => pl.gemischt)).toBe(false);
    expect(bildFehler(beispielhalle, p)).toEqual([]);
    // 4 Tauben (ein 40er frei), danach Zwerghühner (50 breit): passt nicht in 40 cm.
    id = 0;
    const q = planeHalle({ ...beispielhalle, platte: { laenge: 200, tiefe: 50 } }, [...art(4, "tauben", "Tauben"), ...art(2, "zwerghuehner", "Zwerghühner")], masse);
    const rq = q.reihen.find((x) => x.kaefige.length)!;
    expect(rq.platten.map((pl) => pl.typ)).toEqual(["tauben", "zwerghuehner"]);
    expect(bildFehler(beispielhalle, q)).toEqual([]);
  });

  test("Etagen je Käfigart: Tauben zweistöckig auf dem Rest einer Hühnerplatte, Hühner einstöckig", () => {
    id = 0;
    const halle: Halle = { ...beispielhalle, etagen: { tauben: 2 } };
    const tiere = [...art(4, "huehner", "Hühner"), ...art(5, "tauben", "Tauben")];
    const p = planeHalle(halle, tiere, masse);
    const r = p.reihen.find((x) => x.kaefige.length)!;
    const pl = r.platten[1]!;
    expect(pl.gemischt).toBe(true);
    const auf = r.kaefige.filter((k) => k.platte === 1);
    // Ein Huhn, dann Tauben in Spalten zu zwei Etagen (unten zuerst) auf 140 cm Rest: drei Spalten, sechs Plätze.
    expect(auf.map((k) => [k.typ, k.etage ?? 0])).toEqual([["huehner", 0], ["tauben", 0], ["tauben", 1], ["tauben", 0], ["tauben", 1], ["tauben", 0]]);
    expect((r.freiePlaetze ?? []).map((f) => [f.typ, f.etage ?? 0])).toEqual([["tauben", 1]]);
    expect(folge(p)).toEqual(tiere.map((t) => t.id));
    expect(bildFehler(halle, p)).toEqual([]);
  });

  test("Invariante über viele Hallen: frei mitten in der Reihe nur, wo der nächste Käfig nicht passt", () => {
    for (const tiere of [aufbauliste(), mitResten()])
      for (const richtung of ["quer", "laengs"] as const)
        for (const lage of ["keiner", "anfang", "ende", "beide", "mitte"] as const)
          for (const wandreihen of [true, false])
          for (const mitFlaechen of [false, true]) {
            // Mit Eingang, Sperrfläche und Volierenbereich (sie teilen Reihen in Stücke), dazu Tauben in zwei Etagen.
            const flaechen: Halle["flaechen"] = mitFlaechen
              ? [
                  { name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 },
                  { name: "Kasse", art: "sperre", x: 600, y: 1200, breite: 200, tiefe: 150 },
                  { name: "Volieren", art: "volieren", x: 0, y: 2300, breite: 500, tiefe: 300 },
                ]
              : [];
            const h: Halle = { ...beispielhalle, richtung, wandreihen, flaechen, ...(mitFlaechen ? { etagen: { tauben: 2 } } : {}), hauptgang: { breite: lage === "keiner" ? 0 : 300, lage } };
            const { halle, plan } = neuSetzen(h, tiere, masse);
            expect(bildFehler(halle, plan)).toEqual([]);
          }
  });
});

describe("Ausgleich nur, wenn alles Platz hat (Gegenprüfung)", () => {
  test("läuft die Halle über, bleiben dieselben Tiere ohne Platz wie ohne Ausgleich – keine früheren Nummern verdrängt", () => {
    // Zufallshallen wie in der Gegenprüfung: vorher verloren dort z. B. Hühner 82–84 ihren Platz, damit spätere Tauben passten.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const typen: KaefigTyp[] = ["grosskaefig", "huehner", "zwerghuehner", "tauben"];
    let ueberlauf = 0;
    for (let k = 0; k < 400; k++) {
      let n = 0;
      const tiere: PlanTier[] = [];
      const bloecke = 2 + Math.floor(rnd() * 8);
      for (let b = 0; b < bloecke; b++) {
        const typ = typen[Math.floor(rnd() * 4)]!;
        const c = 1 + Math.floor(rnd() * 40);
        for (let i = 0; i < c; i++) {
          n++;
          tiere.push({ id: n, typ, nr: String(n), rasse: "R", sparte: "S" + b, preisrichterId: null });
        }
      }
      const lage = (["anfang", "ende", "beide", "mitte", "keiner"] as const)[Math.floor(rnd() * 5)]!;
      const h: Halle = { ...HALLE_STANDARD, richtung: rnd() < 0.5 ? "laengs" : "quer", breite: 600 + Math.floor(rnd() * 1500), laenge: 800 + Math.floor(rnd() * 2500), gang: 150, wandreihen: rnd() < 0.5, hauptgang: { breite: 300, lage }, flaechen: [] };
      const sys = h.richtung === "quer" ? { ...h, breite: h.laenge, laenge: h.breite } : h;
      const roh = planeImReihensystem(sys, tiere, masse);
      const p = planeHalle(h, tiere, masse);
      if (!roh.nichtPlatziert.length) continue;
      ueberlauf++;
      expect(p.nichtPlatziert.map((t) => t.id)).toEqual(roh.nichtPlatziert.map((t) => t.id));
    }
    expect(ueberlauf).toBeGreaterThan(20);
  });

  test("Volieren ohne Volierenbereich (ohne Platz) verhindern den Ausgleich der Reihen nicht", () => {
    const mitVoliere = { ...masse, voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const tiere = [...aufbauliste(), ...[1, 2, 3].map((i) => ({ id: 900 + i, typ: "voliere" as const, nr: String(900 + i), rasse: "R", sparte: "Volieren", preisrichterId: null }))];
    const p = planeHalle(beispielhalle, tiere, mitVoliere);
    expect(p.nichtPlatziert.map((t) => t.id)).toEqual([901, 902, 903]);
    expect(laengen(p)).toEqual(laengen(planeHalle(beispielhalle, aufbauliste(), masse)));
  });
});
