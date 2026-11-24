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
 * Gänge im Reihensystem: je Lücke zwischen zwei Reihen (bzw. Reihe und Wand), zu der eine Front zeigt, die Meter entlang
 * der Reihen, an denen dort Käfige stehen, und wie oft der Rundgang dort vorbeikommt (Durchgänge).
 */
function gangMeter(h: Halle, plan: ReturnType<typeof planeHalle>, punkte: RundgangPunkt[]) {
  const tausch = zeichnungDerHalle(h).quer;
  // Szene vor dem Tauschen, dann ins Reihensystem: q quer zu den Reihen, l entlang.
  const ql = punkte.map((p) => (tausch ? { x: p.z, z: p.x } : { x: p.x, z: p.z })).map((p) => (plan.quer ? { q: p.z, l: p.x } : { q: p.x, l: p.z }));
  const breite = plan.quer ? h.laenge : h.breite;
  const reihen = plan.reihen.filter((r) => r.abschnitte.length).sort((a, b) => a.x - b.x);
  // Meter mit Käfigen (Mitte des Meters vor einem Käfig) der Reihen, deren Front zur Lücke zeigt.
  const meterVon = (...rs: ((typeof reihen)[number] | false | undefined)[]) =>
    new Set(rs.flatMap((r) => (r ? r.kaefige.flatMap((k) => Array.from({ length: Math.ceil(k.breite / 100) + 1 }, (_, i) => Math.floor(k.y / 100) + i).filter((m) => m * 100 + 50 > k.y && m * 100 + 50 < k.y + k.breite)) : [])));
  const luecken: { von: number; bis: number; meter: Set<number>; durch: Map<number, number> }[] = [];
  // Vor den Käfigen heißt: bis 1,5 m vor der Front (in breiten Lücken nur dort; weiter weg ist es nur ein Weg vorbei).
  const dazu = (von: number, bis: number, links: boolean, rechts: boolean, meter: Set<number>) => {
    const zone = { von: rechts && !links ? Math.max(von, bis - 150) : von, bis: links && !rechts ? Math.min(bis, von + 150) : bis };
    if (bis - von >= 120 && meter.size) luecken.push({ ...zone, meter, durch: new Map() });
  };
  reihen.forEach((r, i) => {
    const vor = reihen[i - 1];
    dazu(vor ? vor.x + vor.tiefe : 0, r.x, vor?.front === "rechts", r.front === "links", meterVon(r.front === "links" && r, vor?.front === "rechts" && vor));
  });
  const letzte = reihen.at(-1);
  if (letzte) dazu(letzte.x + letzte.tiefe, breite, letzte.front === "rechts", false, meterVon(letzte.front === "rechts" && letzte));
  // Durchgänge: zusammenhängende Folgen von Punkten im selben Meter einer Lücke.
  const zuletzt = new Map<string, number>();
  ql.forEach((p, i) => {
    const m = Math.floor(p.l / 100);
    luecken.forEach((g, gi) => {
      if (p.q <= g.von || p.q >= g.bis || !g.meter.has(m)) return;
      const key = `${gi}/${m}`;
      if (!zuletzt.has(key) || i - zuletzt.get(key)! > 3) g.durch.set(m, (g.durch.get(m) ?? 0) + 1);
      zuletzt.set(key, i);
    });
  });
  return luecken;
}

/** Anteil der Gänge, die der Rundgang abgeht: an mindestens drei Vierteln der Meter, an denen dort Käfige stehen. */
function besuchteGaenge(h: Halle, plan: ReturnType<typeof planeHalle>, punkte: RundgangPunkt[]): { gaenge: number; besucht: number } {
  const luecken = gangMeter(h, plan, punkte);
  return { gaenge: luecken.length, besucht: luecken.filter((g) => g.durch.size >= 0.75 * g.meter.size).length };
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
    rundgang(vor);
    const t0 = performance.now();
    const r = rundgang(vor);
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
    const a = s.rundgang[0]!, b = s.rundgang[Math.floor(s.rundgang.length / 2)]!;
    const w = wegZwischen(k, { x: a.x, z: a.z }, { x: b.x, z: b.z })!;
    expect(w.length).toBeGreaterThan(2);
    expect(pruefeRundgang(s, w.map((p) => ({ x: p.x, y: RUNDGANG_HOEHE, z: p.z })))).toEqual([]);
  });
});

/** Abstand eines Punkts (Szene, Boden) zu einem Quader (Grundriss). */
const abstandZuQuader = (p: { x: number; z: number }, q: { x: number; z: number; b: number; t: number }) => abstandZuRechteck(p.x, p.z, [q.x, q.z, q.x + q.b, q.z + q.t]);
const laenge = (r: RundgangPunkt[]) => r.reduce((n, p, i) => (i ? n + Math.hypot(p.x - r[i - 1]!.x, p.z - r[i - 1]!.z) : 0), 0);
const koerperVon = (s: HallenSzene) => [...s.kaefige.map((k) => k.q), ...s.volieren.map((v) => v.q), ...s.aufsteller];
const naechsterKaefig = (s: HallenSzene, p: { x: number; z: number }) => Math.min(...koerperVon(s).map((q) => abstandZuQuader(p, q)));

/** Käfige und Volieren mit Front, vor denen kein Punkt des Rundgangs liegt (bis 2,5 m vor der Front, seitlich im Käfig). */
function ungesehen(s: HallenSzene): string[] {
  const mitFront = [...s.kaefige.map((k) => ({ q: k.q, front: k.front, name: k.ort })), ...s.volieren.flatMap((v) => (v.front ? [{ q: v.q, front: v.front, name: v.name }] : []))];
  return mitFront
    .filter(({ q, front }) => {
      const x = front[0] === "x", plus = front[1] === "+";
      const ebene = x ? (plus ? q.x + q.b : q.x) : plus ? q.z + q.t : q.z;
      const [u0, u1] = x ? [q.z, q.z + q.t] : [q.x, q.x + q.b];
      return !s.rundgang.some((p) => {
        const d = (plus ? 1 : -1) * ((x ? p.x : p.z) - ebene), u = x ? p.z : p.x;
        return d > 0 && d <= 250 && u >= u0 - 30 && u <= u1 + 30;
      });
    })
    .map((k) => `${k.name} ${k.q.x.toFixed(0)}/${k.q.z.toFixed(0)}`);
}

const BEIDE = { breite: 300, lage: "beide" as const };
const eingang = (name: string, x: number, y: number, breite: number, tiefe: number) => ({ name, art: "eingang" as const, x, y, breite, tiefe });
const mitEingang: [string, Halle, string][] = [
  [
    "Haupteingang an der Stirnseite",
    { ...HALLE_STANDARD, richtung: "laengs", breite: 1500, laenge: 3000, hauptgang: BEIDE, flaechen: [eingang("Eingang", 600, 2950, 300, 50), eingang("Notausgang", 1450, 1200, 50, 150)] },
    "Eingang",
  ],
  [
    "Haupteingang an der Längsseite, mehrere Eingänge",
    { ...HALLE_STANDARD, breite: 1550, laenge: 2750, hauptgang: BEIDE, flaechen: [eingang("Eingang 1", 0, 800, 50, 250), eingang("Eingang 2", 0, 2000, 50, 150), eingang("Tor", 600, 2700, 300, 50), eingang("Notausgang", 1500, 1300, 50, 150)] },
    "Eingang 1",
  ],
];

describe("Rundgang: eine Runde vom Haupteingang an allen Käfigen", () => {
  for (const [name, h, haupt] of mitEingang) {
    test(`${name}: Start und Ende am Haupteingang, jeder Gang genau einmal`, () => {
      const plan = planeHalle(h, tiere(160), null);
      const s = hallenSzene(h, plan, null);
      const tuer = s.tueren.find((t) => t.name === haupt)!;
      const not = s.tueren.find((t) => t.notausgang)!;
      expect(pruefeRundgang(s, s.rundgang)).toEqual([]);
      expect(abstandZuQuader(s.rundgang[0]!, tuer.q)).toBeLessThan(150);
      expect(abstandZuQuader(s.rundgang.at(-1)!, tuer.q)).toBeLessThan(150);
      expect(abstandZuQuader(s.rundgang[0]!, not.q)).toBeGreaterThan(300);
      // Keine Front zweimal (hier gibt es keine Sackgasse), jeder Gang an allen Käfigmetern.
      const gaenge = gangMeter(h, plan, s.rundgang);
      expect(gaenge.length).toBeGreaterThan(2);
      for (const g of gaenge) {
        expect([...g.durch.entries()].filter(([, n]) => n > 1)).toEqual([]);
        expect(g.durch.size).toBe(g.meter.size);
      }
      // Nicht länger als nötig: untere Schranke sind die Käfigmeter der Gänge, einmal quer über alle Gänge hin und zurück und
      // bei ungerader Zahl von Gängen einmal die Länge eines Gangs zurück (man kommt am anderen Ende heraus).
      const meter = gaenge.reduce((n, g) => n + g.meter.size * 100, 0), qs = gaenge.map((g) => (g.von + g.bis) / 2);
      const zurueck = gaenge.length % 2 ? Math.min(...gaenge.map((g) => (Math.max(...g.meter) - Math.min(...g.meter)) * 100)) : 0;
      expect(laenge(s.rundgang)).toBeLessThan(1.25 * (meter + 2 * (Math.max(...qs) - Math.min(...qs)) + zurueck));
      expect(ungesehen(s)).toEqual([]);
    });
  }

  test("ohne Eingang: Gänge enden an den Käfigen, nie weiter als 1,35 m von Käfig oder Grundplatte, keine Front zweimal", () => {
    for (const h of [hallen[2]![1], hallen[4]![1]]) {
      const plan = planeHalle(h, tiere(160), null);
      const s = hallenSzene(h, plan, null);
      expect(s.rundgang.filter((p) => naechsterKaefig(s, p) > 135).slice(0, 3)).toEqual([]);
      const gaenge = gangMeter(h, plan, s.rundgang);
      for (const g of gaenge) expect([...g.durch.entries()].filter(([, n]) => n > 1)).toEqual([]);
      // Offene Runde: höchstens 1,25-mal die Käfigmeter plus einmal quer über alle Gänge.
      const meter = gaenge.reduce((n, g) => n + g.meter.size * 100, 0), qs = gaenge.map((g) => (g.von + g.bis) / 2);
      expect(laenge(s.rundgang)).toBeLessThan(1.25 * (meter + Math.max(...qs) - Math.min(...qs)));
    }
  });

  test("Sackgassen: hinein bis zum letzten Käfig und zurück, keine Front öfter als zweimal", () => {
    const h: Halle = { ...HALLE_STANDARD, breite: 1400, laenge: 2000, wandBuendig: true, hauptgang: { breite: 300, lage: "anfang" }, flaechen: [eingang("Eingang", 0, 1000, 50, 200)] };
    const plan = planeHalle(h, tiere(120), null);
    const s = hallenSzene(h, plan, null);
    expect(pruefeRundgang(s, s.rundgang)).toEqual([]);
    const gaenge = gangMeter(h, plan, s.rundgang);
    expect(gaenge.length).toBeGreaterThan(2);
    for (const g of gaenge) expect(Math.max(...g.durch.values())).toBeLessThanOrEqual(2);
  });

  test("eingesetzte Blöcke und Volieren werden angesehen, Garnitur und Pokaltisch sind kein Ziel", () => {
    const [, h, t] = hallen[7]!;
    const s = hallenSzene(h, planeHalle(h, t, null), null);
    expect(ungesehen(s)).toEqual([]);
    // Nahe an Möbeln nur, wo der Weg ohnehin an Käfigen entlang führt.
    for (const m of s.moebel) expect(s.rundgang.filter((p) => abstandZuQuader(p, m.q) < 80 && naechsterKaefig(s, p) > 135).length).toBe(0);
  });

  test("Möbel abseits der Wege ändern den Rundgang nicht: nie zwischen Garnitur und Wand hindurch", () => {
    const h = hallen[2]![1];
    const mit: Halle = { ...h, objekte: [{ id: "g", art: "garnitur", x: 90, y: 1000, drehung: 90 }, { id: "p", art: "pokaltisch", x: 1350, y: 1800, drehung: 0 }] };
    const ohne = hallenSzene(h, planeHalle(h, tiere(160), null), null), s = hallenSzene(mit, planeHalle(mit, tiere(160), null), null);
    expect(s.moebel.length).toBeGreaterThan(1);
    expect(Math.abs(laenge(s.rundgang) - laenge(ohne.rundgang))).toBeLessThan(50);
    expect(pruefeRundgang(s, s.rundgang)).toEqual([]);
    // Zwischen Garnitur (Bänke und Tisch) und Wand: kein Punkt.
    const z0 = Math.min(...s.moebel.slice(0, 3).map((m) => m.q.z)), x0 = Math.min(...s.moebel.slice(0, 3).map((m) => m.q.x)), x1 = Math.max(...s.moebel.slice(0, 3).map((m) => m.q.x + m.q.b));
    expect(s.rundgang.filter((p) => p.z < z0 && p.x > x0 && p.x < x1)).toEqual([]);
  });
});
