import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { hallenSzene, vertauscht, type HallenSzene } from "./hallenplan-3d";
import { rundgang, RUNDGANG_HOEHE, type RundgangPunkt } from "./hallenplan-3d-rundgang";
import { zeichnungDerHalle } from "./hallenplan-druck";
import { punktInUmriss } from "./hallenplan-umriss";
import { gleite, hinderniskarte, istFrei, wegZwischen } from "./hallenplan-3d-wege";

/** Sicherheitsabstand (Körperradius, cm), größter Abstand zweier Punkte (cm), Abtastung zwischen den Punkten (cm). */
const RADIUS = 35;
const SPRUNG = 100;
const FEIN = 5;

const tier = (id: number, typ: PlanTier["typ"] = "huehner"): PlanTier => ({ id, typ, nr: String(id), rasse: typ === "voliere" ? "Fasan" : "Wyandotten", sparte: "Hühner", preisrichterId: null });
const tiere = (n: number, typ: PlanTier["typ"] = "huehner") => Array.from({ length: n }, (_, i) => tier(i + 1, typ));

/** Alle Hindernisse der Szene als Rechtecke (x0, z0, x1, z1). */
function hindernisse(s: HallenSzene): [number, number, number, number][] {
  const qs = [...s.aufsteller, ...s.kaefige.map((k) => k.q), ...s.volieren.map((v) => v.q), ...s.moebel.map((m) => m.q), ...s.schuerzen.map((m) => m.q)];
  return [
    ...qs.map((q): [number, number, number, number] => [q.x, q.z, q.x + q.b, q.z + q.t]),
    ...s.flaechen.filter((f) => f.art === "sperre").map((f): [number, number, number, number] => [f.q.x, f.q.y, f.q.x + f.q.b, f.q.y + f.q.h]),
  ];
}

const abstandZuRechteck = (x: number, z: number, [x0, z0, x1, z1]: [number, number, number, number]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
const abstandZuStrecke = (x: number, z: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dz = b.y - a.y, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / l)) : 0;
  return Math.hypot(x - a.x - t * dx, z - a.y - t * dz);
};

/** Fehler des Rundgangs: außerhalb der Halle, zu nah an Wand oder Hindernis, nicht in Augenhöhe, Sprung. Leer: in Ordnung. */
export function pruefeRundgang(s: HallenSzene, punkte: RundgangPunkt[]): string[] {
  const fehler: string[] = [];
  const hin = hindernisse(s);
  const wand = (x: number, z: number) => {
    if (!s.umriss) return Math.min(x, s.breite - x, z, s.laenge - z);
    if (!punktInUmriss({ x, y: z }, s.umriss)) return -1;
    return Math.min(...s.umriss.map((a, i) => abstandZuStrecke(x, z, a, s.umriss![(i + 1) % s.umriss!.length]!)));
  };
  const stelle = (x: number, z: number) => {
    if (wand(x, z) < RADIUS - 0.01) return `zu nah an der Wand bei ${x.toFixed(0)}/${z.toFixed(0)}`;
    const h = hin.find((r) => abstandZuRechteck(x, z, r) < RADIUS - 0.01);
    return h ? `zu nah am Hindernis ${h.map((v) => v.toFixed(0)).join(",")} bei ${x.toFixed(0)}/${z.toFixed(0)}` : null;
  };
  punkte.forEach((p, i) => {
    if (p.y !== RUNDGANG_HOEHE) fehler.push(`Punkt ${i} nicht in Augenhöhe (${p.y})`);
    const q = punkte[i + 1];
    if (!q) return void (stelle(p.x, p.z) && fehler.push(stelle(p.x, p.z)!));
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > SPRUNG) fehler.push(`Sprung ${d.toFixed(0)} cm nach Punkt ${i}`);
    const n = Math.max(1, Math.ceil(d / FEIN));
    for (let k = 0; k < n; k++) {
      const f = stelle(p.x + ((q.x - p.x) * k) / n, p.z + ((q.z - p.z) * k) / n);
      if (f) {
        fehler.push(f);
        break;
      }
    }
  });
  return fehler.slice(0, 5);
}

/**
 * Anteil der Gänge, die der Rundgang abgeht: je Lücke zwischen zwei Reihen (bzw. Reihe und Wand), zu der eine Front zeigt,
 * müssen Punkte des Rundgangs in der Lücke liegen, an mindestens drei Vierteln der Meter, an denen dort Käfige stehen.
 */
function besuchteGaenge(h: Halle, plan: ReturnType<typeof planeHalle>, punkte: RundgangPunkt[]): { gaenge: number; besucht: number } {
  const tausch = zeichnungDerHalle(h).quer;
  // Szene vor dem Tauschen, dann ins Reihensystem: q quer zu den Reihen, l entlang.
  const ql = punkte.map((p) => (tausch ? { x: p.z, z: p.x } : { x: p.x, z: p.z })).map((p) => (plan.quer ? { q: p.z, l: p.x } : { q: p.x, l: p.z }));
  const breite = plan.quer ? h.laenge : h.breite;
  const reihen = plan.reihen.filter((r) => r.abschnitte.length).sort((a, b) => a.x - b.x);
  // Je Lücke die Meter entlang der Reihen, an denen dort Käfige stehen (Abschnitte der Nachbarreihen).
  const meterVon = (...rs: (typeof reihen)[number][]) => new Set(rs.flatMap((r) => r.abschnitte.flatMap((a) => Array.from({ length: Math.max(0, Math.floor(a.bis / 100) - Math.ceil(a.von / 100)) }, (_, i) => Math.ceil(a.von / 100) + i))));
  const luecken: { von: number; bis: number; meter: Set<number> }[] = [];
  reihen.forEach((r, i) => {
    const vor = reihen[i - 1];
    const links = vor ? vor.x + vor.tiefe : 0;
    if (r.x - links >= 120 && (r.front === "links" || vor?.front === "rechts")) luecken.push({ von: links, bis: r.x, meter: meterVon(...(vor ? [vor, r] : [r])) });
  });
  const letzte = reihen.at(-1);
  if (letzte?.front === "rechts" && breite - letzte.x - letzte.tiefe >= 120) luecken.push({ von: letzte.x + letzte.tiefe, bis: breite, meter: meterVon(letzte) });
  const besucht = luecken.filter((g) => {
    const meter = new Set(ql.filter((p) => p.q > g.von && p.q < g.bis).map((p) => Math.floor(p.l / 100)).filter((m) => g.meter.has(m)));
    return meter.size >= 0.75 * g.meter.size;
  }).length;
  return { gaenge: luecken.length, besucht };
}

const L_UMRISS = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1500 }, { x: 1000, y: 1500 }, { x: 1000, y: 3000 }, { x: 0, y: 3000 }];
const hallen: [string, Halle, PlanTier[]][] = [
  ["Rechteck quer, Hauptgang am Anfang, Wandreihen bündig", { ...HALLE_STANDARD }, tiere(160)],
  ["Rechteck längs", { ...HALLE_STANDARD, richtung: "laengs", breite: 1500, laenge: 3000 }, tiere(160)],
  ["Hauptgang an beiden Enden", { ...HALLE_STANDARD, breite: 1550, laenge: 2750, hauptgang: { breite: 300, lage: "beide" } }, tiere(160)],
  ["Hauptgang quer durch die Mitte", { ...HALLE_STANDARD, breite: 1550, laenge: 2750, hauptgang: { breite: 300, lage: "mitte" } }, tiere(160)],
  ["ohne Wandreihen und Hauptgang, nicht bündig", { ...HALLE_STANDARD, breite: 1400, laenge: 2400, wandreihen: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" } }, tiere(120)],
  ["Doppelreihen mit Eingängen", { ...HALLE_STANDARD, breite: 1800, laenge: 3000, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [{ name: "E1", art: "eingang", x: 800, y: 2950, breite: 300, tiefe: 50 }, { name: "N", art: "eingang", x: 0, y: 200, breite: 50, tiefe: 120 }] }, tiere(200)],
  [
    "Volierenbereich mit Volieren",
    { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 2300, breite: 1500, tiefe: 700 }] },
    [...tiere(100), ...Array.from({ length: 6 }, (_, i) => tier(500 + i, "voliere"))],
  ],
  [
    "eingesetzte Blöcke, Garnitur und Pokaltisch",
    {
      ...HALLE_STANDARD,
      breite: 1550,
      laenge: 2750,
      hauptgang: { breite: 300, lage: "beide" },
      objekte: [
        { id: "b", art: "kaefigblock", typ: "huehner", x: 600, y: 40, drehung: 0 },
        { id: "g", art: "garnitur", x: 1400, y: 60, drehung: 0 },
        { id: "p", art: "pokaltisch", x: 2000, y: 1300, drehung: 0 },
        { id: "v", art: "voliere", x: 300, y: 1300, drehung: 0, front: "z-" },
      ],
    },
    tiere(150),
  ],
  ["freier L-Grundriss", { ...HALLE_STANDARD, breite: 2000, laenge: 3000, umriss: L_UMRISS, hauptgang: { breite: 300, lage: "anfang" } }, tiere(140)],
  ["Sperrfläche mitten in der Halle", { ...HALLE_STANDARD, breite: 1600, laenge: 3000, flaechen: [{ name: "Bühne", art: "sperre", x: 500, y: 1200, breite: 600, tiefe: 500 }] }, tiere(120)],
];

describe("Rundgang durch die Gänge ohne Anstoßen", () => {
  for (const [name, h, t] of hallen) {
    test(name, () => {
      const plan = planeHalle(h, t, null);
      const s = hallenSzene(h, plan, null);
      expect(s.rundgang.length).toBeGreaterThan(10);
      // Jeder Punkt (fein abgetastet) in der Halle, mit Abstand zu Wänden und Hindernissen, in Augenhöhe, ohne Sprung.
      expect(pruefeRundgang(s, s.rundgang)).toEqual([]);
      // Alle Gänge besucht (in diesen Hallen ist jeder erreichbar).
      const g = besuchteGaenge(h, plan, s.rundgang);
      expect(g.gaenge).toBeGreaterThan(0);
      expect(g.besucht).toBe(g.gaenge);
    });
  }

  test("Schlangenlinie: Laufrichtung wechselt zwischen den ersten Gängen", () => {
    const h = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, hauptgang: { breite: 300, lage: "beide" as const } };
    const s = hallenSzene(h, planeHalle(h, tiere(160), null), null);
    // Hier laufen die Gänge entlang x (Szene): erst hin (z wächst oder fällt), dann zurück.
    const zs = s.rundgang.map((p) => p.z);
    const wende = zs.findIndex((z, i) => i > 0 && Math.sign(z - zs[i - 1]!) !== Math.sign(zs[1]! - zs[0]!) && Math.abs(z - zs[i - 1]!) > 1);
    expect(wende).toBeGreaterThan(0);
  });

  test("unerreichbare Gänge werden ausgelassen, nie überflogen", () => {
    // Reihen an beiden Enden bündig an der Wand, ohne Hauptgang: jeder Gang ist eine Sackgasse für sich.
    const h: Halle = { ...HALLE_STANDARD, breite: 1400, laenge: 2000, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    const s = hallenSzene(h, planeHalle(h, tiere(120), null), null);
    expect(s.rundgang.length).toBeGreaterThan(10);
    expect(pruefeRundgang(s, s.rundgang)).toEqual([]);
  });

  test("ohne Reihen kein Rundgang", () => {
    expect(hallenSzene(HALLE_STANDARD, planeHalle(HALLE_STANDARD, [], null), null).rundgang).toEqual([]);
  });

  test("Gegenprobe: die alten Wegpunkte (gerade Verbindungen, über die Reihe gehoben) fallen durch", () => {
    // Rundgang bis 1.21.0 in der Halle 15 × 30 m längs: am Ende von Gang 1 auf 3 m über die Reihe, dann quer hinüber.
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1500, laenge: 3000 };
    const s = hallenSzene(h, planeHalle(h, tiere(160), null), null);
    const alt = [[60, 160, 150], [2940, 160, 150], [2940, 300, 300], [2940, 160, 450], [180, 160, 450]].map(([x, y, z]) => ({ x: x!, y: y!, z: z! }));
    const f = pruefeRundgang(s, alt);
    expect(f.some((x) => x.includes("Augenhöhe"))).toBe(true);
    expect(f.some((x) => x.startsWith("Sprung"))).toBe(true);
  });

  test("große Halle 40 × 60 m mit 600 Käfigen: Wegsuche unter 200 ms", () => {
    const h: Halle = { ...HALLE_STANDARD, breite: 4000, laenge: 6000, hauptgang: { breite: 300, lage: "beide" }, flaechen: [] };
    const plan = planeHalle(h, tiere(600), null);
    const s = hallenSzene(h, plan, null);
    const vor = zeichnungDerHalle(h).quer ? vertauscht(s) : s;
    rundgang(vor, plan);
    const t0 = performance.now();
    const r = rundgang(vor, plan);
    const dauer = performance.now() - t0;
    expect(s.kaefige.length).toBeGreaterThanOrEqual(600);
    expect(r.length).toBeGreaterThan(100);
    expect(dauer).toBeLessThan(200);
  });

  test("freies Gehen: an Käfigen entlang gleiten, nie hinein; Weg von Stelle zu Stelle frei", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1500, laenge: 3000 };
    const s = hallenSzene(h, planeHalle(h, tiere(160), null), null);
    const k = hinderniskarte(s);
    // Ein Käfig mit Front zum Gang (x+ oder z+); im Achsensystem des Käfigs: u zur Front hin, v entlang der Reihe.
    const lage = s.kaefige.flatMap((kf) => {
      if (kf.front !== "x+" && kf.front !== "z+") return [];
      const ux = kf.front === "x+";
      const p = (u: number, v: number) => (ux ? { x: u, z: v } : { x: v, z: u });
      const u0 = ux ? kf.q.x + kf.q.b : kf.q.z + kf.q.t, v0 = ux ? kf.q.z + kf.q.t / 2 : kf.q.x + kf.q.b / 2;
      for (let front = u0; front < u0 + 100; front++) if (istFrei(k, p(front, v0 - 20)) && istFrei(k, p(front, v0 + 20))) return [{ p, u0, v0, front: front + 3 }];
      return [];
    })[5]!;
    const { p, u0, v0, front } = lage;
    // Schräg auf die Käfigfront zu: der Schritt endet vor dem Käfig, die Bewegung entlang bleibt.
    const von = p(front, v0);
    expect(istFrei(k, von)).toBe(true);
    expect(gleite(k, von, p(front - 10, v0 + 10))).toEqual(p(front, v0 + 10));
    // Mitten in den Käfig hinein: bleibt stehen.
    expect(gleite(k, von, p(u0 - 20, v0))).toEqual(von);
    // Von Gang zu Gang: frei abgetastet, in kleinen Schritten.
    const a = s.rundgang[0]!, b = s.rundgang.at(-1)!;
    const w = wegZwischen(k, { x: a.x, z: a.z }, { x: b.x, z: b.z })!;
    expect(w.length).toBeGreaterThan(2);
    expect(pruefeRundgang(s, w.map((p) => ({ x: p.x, y: RUNDGANG_HOEHE, z: p.z })))).toEqual([]);
  });
});
