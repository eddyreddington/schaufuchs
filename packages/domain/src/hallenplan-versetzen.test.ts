/** Tiere im festen Hallenplan von Hand versetzen oder tauschen (Rückmeldung 15.11.2026). */
import { describe, expect, test } from "bun:test";
import { festschreiben, HALLE_STANDARD, planeHalle, type FesterPlan, type Halle, type Hallenplan, type PlanTier } from "./hallenplan";
import { hallenSzene } from "./hallenplan-3d";
import { luekenlosAuffuellen, planUnordnung } from "./hallenplan-folge";
import { belegungImPlan, platzImPlan, tierVersetzen, type KaefigPlatz } from "./hallenplan-versetzen";
import type { KaefigTyp } from "./kaefige";

const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 }, zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 }, tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
const tier = (id: number, typ: KaefigTyp, sparte = "Hühner"): PlanTier => ({ id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null });
const viele = (n: number, typ: KaefigTyp, ab: number, sparte?: string) => Array.from({ length: n }, (_, i) => tier(ab + i, typ, sparte));
// Längs, 10 × 20 m: R1 zwei volle Hühnerplatten (1–6), dahinter Tauben 10–16 (eine volle Platte, eine mit 3 freien Plätzen).
const halle: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
const tiere = [...viele(6, "huehner", 1), ...viele(7, "tauben", 10, "Tauben")];

const aufbau = (h: Halle = halle, t: PlanTier[] = tiere) => {
  const fest = festschreiben(h, planeHalle(h, t, masse), masse, "2026-11-15T10:00:00.000Z");
  return { fest, plan: planeHalle(h, t, masse, fest) };
};
/** Lage jedes Tieres (Hallenkoordinaten) – zum Vergleichen vorher/nachher. */
const lagen = (p: Hallenplan) =>
  new Map([...p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, JSON.stringify(k.rechteck) + (k.etage ?? 0)] as const)), ...p.objekte.flatMap((o) => (o.kaefige ?? []).map((k) => [k.id, `${o.id}#${k.blockPlatz}`] as const))]);
const anwenden = (fest: FesterPlan, plan: Hallenplan, id: number, ziel: KaefigPlatz | null, h: Halle = halle, t: PlanTier[] = tiere) => {
  const e = tierVersetzen(fest, plan, t, id, ziel);
  if (!e.ok) throw new Error(e.fehler);
  return { ...e, plan: planeHalle(h, t, masse, e.fest) };
};
const freierPlatz = (p: Hallenplan, typ: KaefigTyp): KaefigPlatz => {
  for (const r of p.reihen) {
    const f = (r.freiePlaetze ?? []).find((x) => x.typ === typ && !x.angebaut);
    if (f) return { art: "reihe", reihe: r.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) };
  }
  throw new Error("kein freier Platz");
};

describe("Tier im festen Plan versetzen", () => {
  test("in einen freien Käfig gleicher Größe: nur dieses Tier zieht um, sein Käfig ist danach frei; Nummern bleiben", () => {
    const { fest, plan } = aufbau();
    const ziel = freierPlatz(plan, "tauben");
    const vorher = lagen(plan);
    const alt = platzImPlan(plan, 10)!;
    const e = anwenden(fest, plan, 10, ziel);
    expect(e.getauscht).toBeNull();
    expect(platzImPlan(e.plan, 10)).toEqual(ziel);
    expect(belegungImPlan(e.plan, alt)).toEqual({ typ: "tauben", tierId: null });
    const nachher = lagen(e.plan);
    for (const [id, l] of vorher) if (id !== 10) expect(nachher.get(id)).toBe(l);
    // Katalognummern bleiben; der Plan meldet „Nummern nicht in Planfolge“.
    expect(e.plan.reihen.flatMap((r) => r.kaefige).find((k) => k.id === 10)!.nr).toBe("10");
    expect(planUnordnung(e.plan, "laengs").nichtInFolge).toBeGreaterThan(0);
    // Gespeichert im festen Plan: auch neu gerechnet aus dem gespeicherten Stand dasselbe.
    expect(lagen(planeHalle(halle, tiere, masse, JSON.parse(JSON.stringify(e.fest))))).toEqual(nachher);
  });

  test("auf einen belegten Käfig gleicher Größe: die beiden Tiere tauschen, sonst bleibt alles", () => {
    const { fest, plan } = aufbau();
    const p1 = platzImPlan(plan, 1)!, p5 = platzImPlan(plan, 5)!;
    const vorher = lagen(plan);
    const e = anwenden(fest, plan, 1, p5);
    expect(e.getauscht).toBe(5);
    expect(platzImPlan(e.plan, 1)).toEqual(p5);
    expect(platzImPlan(e.plan, 5)).toEqual(p1);
    const nachher = lagen(e.plan);
    expect(nachher.get(1)).toBe(vorher.get(5));
    expect(nachher.get(5)).toBe(vorher.get(1));
    for (const [id, l] of vorher) if (id !== 1 && id !== 5) expect(nachher.get(id)).toBe(l);
    // Noch einmal derselbe Tausch: alles wie am Anfang (so geht Rückgängig).
    const z = anwenden(e.fest, e.plan, 1, p1);
    expect(lagen(z.plan)).toEqual(vorher);
  });

  test("andere Käfiggröße wird abgelehnt, der feste Plan bleibt unverändert", () => {
    const { fest, plan } = aufbau();
    const kopie = JSON.stringify(fest);
    const e = tierVersetzen(fest, plan, tiere, 1, freierPlatz(plan, "tauben"));
    expect(e).toEqual({ ok: false, fehler: "Der Käfig hat eine andere Größe." });
    // Huhn auf eine Taube: ebenso.
    expect(tierVersetzen(fest, plan, tiere, 1, platzImPlan(plan, 12)!)).toMatchObject({ ok: false, fehler: "Der Käfig hat eine andere Größe." });
    expect(JSON.stringify(fest)).toBe(kopie);
    // Unbekannter Platz, gleicher Platz, Voliere.
    expect(tierVersetzen(fest, plan, tiere, 1, { art: "reihe", reihe: 1, x: 12345, y: 1 })).toMatchObject({ ok: false });
    expect(tierVersetzen(fest, plan, tiere, 1, platzImPlan(plan, 1))).toMatchObject({ ok: false, fehler: "Das Tier steht schon dort." });
  });

  test("Nachmeldung und Storno danach: der feste Plan stellt sie wie gewohnt, das versetzte Tier bleibt an seinem neuen Platz", () => {
    const { fest, plan } = aufbau();
    const ziel = freierPlatz(plan, "tauben");
    const e = anwenden(fest, plan, 10, ziel);
    // Nachmeldung einer Taube: kommt in einen freien Taubenplatz, das versetzte Tier bleibt.
    const mit = [...tiere, tier(17, "tauben", "Tauben")];
    const p = planeHalle(halle, mit, masse, e.fest);
    expect(platzImPlan(p, 10)).toEqual(ziel);
    expect(platzImPlan(p, 17)).not.toBeNull();
    // Storno einer anderen Taube: ihr Platz wird frei, sonst bleibt alles.
    const ohne = tiere.filter((t) => t.id !== 11);
    const q = planeHalle(halle, ohne, masse, e.fest);
    expect(platzImPlan(q, 10)).toEqual(ziel);
    for (const id of [12, 13, 14, 15, 16]) expect(platzImPlan(q, id)).toEqual(platzImPlan(e.plan, id));
  });

  test("ohne festen Plan rechnet die Automatik wie immer (Neu-Setzen verwirft die Handzuordnung)", () => {
    const { fest, plan } = aufbau();
    const e = anwenden(fest, plan, 1, platzImPlan(plan, 5)!);
    const lose = planeHalle(halle, tiere, masse);
    expect(lagen(lose)).toEqual(lagen(plan));
    expect(lagen(e.plan)).not.toEqual(lagen(plan));
  });
});

describe("Tier versetzen mit Käfigblöcken", () => {
  // Ein Taubenblock frei in der Halle (5 Plätze), vorn quer – die Reihen bleiben, wie sie sind.
  const mitBlock: Halle = { ...halle, objekte: [{ id: "b1", art: "kaefigblock", typ: "tauben", x: 600, y: 1900, drehung: 0 }] };
  test("in einen freien Platz eines Blocks; ein zweites an Platz 3; das erste wieder heraus – die übrigen rücken nicht nach", () => {
    const { fest, plan } = aufbau(mitBlock);
    expect(plan.objekte[0]!.plaetze).toBe(5);
    expect(belegungImPlan(plan, { art: "block", objektId: "b1", i: 0 })).toEqual({ typ: "tauben", tierId: null });
    const a = anwenden(fest, plan, 10, { art: "block", objektId: "b1", i: 0 }, mitBlock);
    expect(platzImPlan(a.plan, 10)).toEqual({ art: "block", objektId: "b1", i: 0 });
    const b = anwenden(a.fest, a.plan, 11, { art: "block", objektId: "b1", i: 3 }, mitBlock);
    expect(platzImPlan(b.plan, 11)).toEqual({ art: "block", objektId: "b1", i: 3 });
    expect(platzImPlan(b.plan, 10)).toEqual({ art: "block", objektId: "b1", i: 0 });
    // 10 zurück in die Reihe (auf seinen alten, jetzt freien Platz): 11 bleibt auf Platz 3.
    const c = anwenden(b.fest, b.plan, 10, platzImPlan(plan, 10), mitBlock);
    expect(platzImPlan(c.plan, 10)).toEqual(platzImPlan(plan, 10));
    expect(platzImPlan(c.plan, 11)).toEqual({ art: "block", objektId: "b1", i: 3 });
    // Ein Huhn passt nicht in den Taubenblock.
    expect(tierVersetzen(c.fest, c.plan, tiere, 1, { art: "block", objektId: "b1", i: 1 })).toMatchObject({ ok: false, fehler: "Der Käfig hat eine andere Größe." });
    // Platz außerhalb des Blocks.
    expect(tierVersetzen(c.fest, c.plan, tiere, 12, { art: "block", objektId: "b1", i: 5 })).toMatchObject({ ok: false });
  });

  test("3D: ein Tier auf Platz 3 des Blocks steht dort, die Plätze davor sind leer", () => {
    const { fest, plan } = aufbau(mitBlock);
    const a = anwenden(fest, plan, 10, { art: "block", objektId: "b1", i: 3 }, mitBlock);
    const szene = hallenSzene(mitBlock, a.plan, masse);
    const imBlock = szene.kaefige.filter((k) => k.ort === a.plan.objekte[0]!.name);
    expect(imBlock).toHaveLength(5);
    expect(imBlock.map((k) => k.tier?.id ?? null)).toEqual([null, null, null, 10, null]);
  });

  test("Tausch zwischen Block und Reihe", () => {
    const { fest, plan } = aufbau(mitBlock);
    const a = anwenden(fest, plan, 10, { art: "block", objektId: "b1", i: 2 }, mitBlock);
    const p14 = platzImPlan(a.plan, 14)!;
    const b = anwenden(a.fest, a.plan, 10, p14, mitBlock);
    expect(b.getauscht).toBe(14);
    expect(platzImPlan(b.plan, 10)).toEqual(p14);
    expect(platzImPlan(b.plan, 14)).toEqual({ art: "block", objektId: "b1", i: 2 });
  });

  test("Tier ohne Platz (noch zu stellen): Tauschen mit einem Tier im Käfig geht nicht (das andere hätte keinen Platz)", () => {
    // Eine Doppelreihe, je 4 m: Hühner in R1, fünf Tauben in R2, die übrigen ohne Platz.
    const klein: Halle = { ...halle, breite: 440, laenge: 700 };
    const t = [...viele(3, "huehner", 1), ...viele(14, "tauben", 10, "Tauben")];
    const { fest, plan } = aufbau(klein, t);
    expect(plan.nichtPlatziert.length).toBeGreaterThan(0);
    const ohne = plan.nichtPlatziert.find((x) => x.typ === "tauben")!;
    expect(tierVersetzen(fest, plan, t, ohne.id, platzImPlan(plan, 10)!)).toEqual({ ok: false, fehler: "Tauschen geht nur zwischen zwei Tieren mit festem Käfig – bitte einen freien Käfig wählen." });
    // Ohne Ziel (für Rückgängig): ein Tier ohne festen Käfig lässt sich nicht herausnehmen.
    expect(tierVersetzen(fest, plan, t, ohne.id, null)).toMatchObject({ ok: false });
  });
});

describe("Tier versetzen mit Nachmeldungen auf angebauten Platten (Gegenprüfung)", () => {
  // Fester Plan mit einer zusätzlichen leeren Hühnerplatte in R4; Nachmeldung Huhn 7 bekommt eine angebaute Platte.
  const aufbauMitNachmeldung = () => {
    const fest = festschreiben(halle, planeHalle(halle, tiere, masse), masse, "x");
    const r4 = fest.reihen.find((r) => r.nr === 4)!;
    r4.platten.push({ typ: "huehner", x: 690, y: 150, laenge: 210, tiefe: 70, plaetze: 3, belegt: 0 });
    for (let i = 0; i < 3; i++) r4.plaetze.push({ tierId: null, typ: "huehner", x: 690, y: 150 + i * 70, breite: 70, tiefe: 70 });
    const mit = [...tiere, tier(7, "huehner")];
    return { fest, mit, plan: planeHalle(halle, mit, masse, fest) };
  };
  const ziel: KaefigPlatz = { art: "reihe", reihe: 4, x: 690, y: 150 };

  test("versetzt: die Nachmeldung bleibt auf ihrer angebauten Platte (springt nicht in den frei gewordenen Platz); Rückgängig geht", () => {
    const { fest, mit, plan } = aufbauMitNachmeldung();
    const p7 = platzImPlan(plan, 7)!;
    const r7 = plan.reihen.find((r) => p7.art === "reihe" && r.nr === p7.reihe)!;
    expect(r7.platten[r7.kaefige.find((k) => k.id === 7)!.platte!]!.angebaut).toBe(true);
    const p1 = platzImPlan(plan, 1)!;
    const e = anwenden(fest, plan, 1, ziel, halle, mit);
    expect(platzImPlan(e.plan, 7)).toEqual(p7);
    expect(belegungImPlan(e.plan, p1)).toMatchObject({ tierId: null });
    // Rückgängig: Tier 1 zurück auf den freien alten Platz.
    const z = anwenden(e.fest, e.plan, 1, p1, halle, mit);
    expect(platzImPlan(z.plan, 1)).toEqual(p1);
    expect(platzImPlan(z.plan, 7)).toEqual(p7);
  });

  test("die Nachmeldung selbst versetzen und zurück: ihr Platz auf der angebauten Platte bleibt bestehen", () => {
    const { fest, mit, plan } = aufbauMitNachmeldung();
    const p7 = platzImPlan(plan, 7)!;
    const e = anwenden(fest, plan, 7, ziel, halle, mit);
    expect(platzImPlan(e.plan, 7)).toEqual(ziel);
    expect(belegungImPlan(e.plan, p7)).toMatchObject({ typ: "huehner", tierId: null });
    const z = anwenden(e.fest, e.plan, 7, p7, halle, mit);
    expect(platzImPlan(z.plan, 7)).toEqual(p7);
    // Ein Tier auf der angebauten Platte lässt sich auch tauschen.
    const t = anwenden(z.fest, z.plan, 1, p7, halle, mit);
    expect(t.getauscht).toBe(7);
  });
});

describe("Nach Plan nummerieren nach dem Versetzen (Rückmeldung 15.11.2026: „neu nummerieren soll … nicht die umgesetzten tiere zurück setzen“)", () => {
  test("Lückenlos auffüllen lässt versetzte Tiere auf ihrem Platz; der frei gemachte Platz bleibt frei", () => {
    const { fest, plan } = aufbau();
    const ziel = freierPlatz(plan, "tauben");
    const alt = platzImPlan(plan, 10)!;
    const e = anwenden(fest, plan, 10, ziel);
    const vorher = lagen(e.plan);
    const { fest: f2, verschoben } = luekenlosAuffuellen(e.fest, e.plan, "laengs");
    const p2 = planeHalle(halle, tiere, masse, f2);
    expect(platzImPlan(p2, 10)).toEqual(ziel);
    // Kein anderes Tier rückt in den von Hand frei gemachten Platz, nichts verschiebt sich.
    expect(belegungImPlan(p2, alt)).toEqual({ typ: "tauben", tierId: null });
    expect(lagen(p2)).toEqual(vorher);
    expect(verschoben).toBe(0);
    // Deshalb zählt dieser Platz auch nicht als „frei dazwischen“ (sonst stünde der Hinweis immer da).
    expect(planUnordnung(p2, "laengs").freiDazwischen).toBe(0);
  });

  test("getauschte Tiere bleiben getauscht; eine spätere Abmeldung wird weiter aufgefüllt, ohne die versetzten Tiere", () => {
    const { fest, plan } = aufbau();
    const e = anwenden(fest, plan, 1, platzImPlan(plan, 5)!);
    // Abmeldung von Huhn 2: sein Platz wird frei – dorthin rücken die übrigen Hühner (in Planfolge), 1 und 5 bleiben.
    const ohne2 = tiere.filter((t) => t.id !== 2);
    const p = planeHalle(halle, ohne2, masse, e.fest);
    expect(planUnordnung(p, "laengs").freiDazwischen).toBe(1);
    const { fest: f2 } = luekenlosAuffuellen(e.fest, p, "laengs");
    const p2 = planeHalle(halle, ohne2, masse, f2);
    expect(platzImPlan(p2, 1)).toEqual(platzImPlan(e.plan, 1));
    expect(platzImPlan(p2, 5)).toEqual(platzImPlan(e.plan, 5));
    expect(planUnordnung(p2, "laengs").freiDazwischen).toBe(0);
  });
});
