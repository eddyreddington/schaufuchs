/**
 * Wege durch die 3D-Halle ohne Anstoßen: eine Hinderniskarte aus der Szene (Grundplatten und Blöcke, Käfige samt Etagen,
 * Volieren, Möbel, Sperrflächen, Wände bzw. freier Grundriss), jedes Hindernis um den Körperradius vergrößert. Darauf ein
 * Wegsucher (A* auf einem Raster) und eine Glättung, die jede Abkürzung und jede Kurve gegen die Karte prüft. Alle
 * Hindernisse sind achsparallele Rechtecke, die Prüfung ist genau (nicht nur auf dem Raster). Rein, ohne three.js.
 * Koordinaten wie die Szene (cm; x, z am Boden).
 */
import type { HallenSzene } from "./hallenplan-3d";
import { umrissSperren } from "./hallenplan-umriss";

/** Halber Platzbedarf eines Menschen (cm): so weit bleibt der Weg von Käfigen und Wänden. */
export const KOERPER_RADIUS = 35;
/** Zusätzlich zum Radius (cm), damit Rundungsfehler nie an ein Hindernis führen. */
const SPIEL = 1;
/** Kantenlänge der Fächer, nach denen die Hindernisse für die Prüfung sortiert sind (cm). */
const FACH = 200;
/** Größter Abstand zweier Punkte eines geglätteten Wegs (cm). */
const DICHTE = 60;

export interface Stelle {
  x: number;
  z: number;
}

/** Was die Karte von der Szene braucht. */
export type WegSzene = Pick<HallenSzene, "breite" | "laenge" | "umriss" | "aufsteller" | "kaefige" | "volieren" | "moebel" | "flaechen" | "schuerzen">;

export interface Raster {
  /** Kantenlänge einer Zelle (cm); Mitte der Zelle (i, j) bei ((i + ½)·g, (j + ½)·g). */
  g: number;
  nx: number;
  nz: number;
  frei: Uint8Array;
  /** Zusammenhängende freie Bereiche (Nummer je Zelle, −1: belegt). */
  teil: Int32Array;
}

export interface Hinderniskarte {
  breite: number;
  laenge: number;
  /** Abstand zu Hindernissen und Wänden (cm, mit Spiel). */
  rand: number;
  /** Vergrößerte Hindernisse, je vier Werte x0, z0, x1, z1. */
  sperren: Float64Array;
  faecher: number[][];
  fx: number;
  raster?: Raster;
}

/** Hinderniskarte der Szene mit dem Körperradius als Abstand. */
export function hinderniskarte(s: WegSzene, radius = KOERPER_RADIUS): Hinderniskarte {
  const rand = radius + SPIEL;
  const qs = [...s.aufsteller, ...s.kaefige.map((k) => k.q), ...s.volieren.map((v) => v.q), ...s.moebel.map((m) => m.q), ...s.schuerzen.map((m) => m.q)];
  const r: number[][] = qs.map((q) => [q.x, q.z, q.x + q.b, q.z + q.t]);
  for (const f of s.flaechen) if (f.art === "sperre") r.push([f.q.x, f.q.y, f.q.x + f.q.b, f.q.y + f.q.h]);
  // Freier Grundriss: was im umschließenden Rechteck draußen liegt, ist Wand.
  if (s.umriss) for (const u of umrissSperren(s.umriss)) r.push([u.x, u.y, u.x + u.b, u.y + u.h]);
  const sperren = new Float64Array(r.length * 4);
  r.forEach(([x0, z0, x1, z1], i) => sperren.set([x0! - rand, z0! - rand, x1! + rand, z1! + rand], i * 4));
  const fx = Math.max(1, Math.ceil(s.breite / FACH)), fz = Math.max(1, Math.ceil(s.laenge / FACH));
  const faecher: number[][] = Array.from({ length: fx * fz }, () => []);
  for (let i = 0; i < r.length; i++) {
    const [a, b] = fachVon(sperren[i * 4]!, sperren[i * 4 + 1]!, fx, fz), [c, d] = fachVon(sperren[i * 4 + 2]!, sperren[i * 4 + 3]!, fx, fz);
    for (let x = a; x <= c; x++) for (let z = b; z <= d; z++) faecher[z * fx + x]!.push(i);
  }
  return { breite: s.breite, laenge: s.laenge, rand, sperren, faecher, fx };
}

const fachVon = (x: number, z: number, fx: number, fz: number) => [Math.min(fx - 1, Math.max(0, Math.floor(x / FACH))), Math.min(fz - 1, Math.max(0, Math.floor(z / FACH)))] as const;

const imRand = (k: Hinderniskarte, p: Stelle) => p.x >= k.rand && p.x <= k.breite - k.rand && p.z >= k.rand && p.z <= k.laenge - k.rand;

/** Darf man hier stehen (mit Abstand zu allem)? */
export function istFrei(k: Hinderniskarte, p: Stelle): boolean {
  if (!imRand(k, p)) return false;
  const [a, b] = fachVon(p.x, p.z, k.fx, k.faecher.length / k.fx);
  for (const i of k.faecher[b * k.fx + a]!) {
    const s = k.sperren;
    if (p.x > s[i * 4]! && p.x < s[i * 4 + 2]! && p.z > s[i * 4 + 1]! && p.z < s[i * 4 + 3]!) return false;
  }
  return true;
}

/** Ist die gerade Strecke von a nach b ganz frei? */
export function streckeFrei(k: Hinderniskarte, a: Stelle, b: Stelle): boolean {
  if (!imRand(k, a) || !imRand(k, b)) return false;
  const fz = k.faecher.length / k.fx;
  const [f0, g0] = fachVon(Math.min(a.x, b.x), Math.min(a.z, b.z), k.fx, fz), [f1, g1] = fachVon(Math.max(a.x, b.x), Math.max(a.z, b.z), k.fx, fz);
  const dx = b.x - a.x, dz = b.z - a.z, s = k.sperren;
  for (let x = f0; x <= f1; x++)
    for (let z = g0; z <= g1; z++)
      for (const i of k.faecher[z * k.fx + x]!) {
        // Schnitt der Strecke mit dem offenen Rechteck (Liang-Barsky).
        let t0 = 0, t1 = 1;
        const kante = (d: number, lo: number, hi: number, p: number) => {
          if (Math.abs(d) < 1e-9) return p > lo && p < hi;
          let u = (lo - p) / d, v = (hi - p) / d;
          if (u > v) [u, v] = [v, u];
          t0 = Math.max(t0, u);
          t1 = Math.min(t1, v);
          return t0 < t1;
        };
        if (kante(dx, s[i * 4]!, s[i * 4 + 2]!, a.x) && kante(dz, s[i * 4 + 1]!, s[i * 4 + 3]!, a.z) && t1 - t0 > 1e-9) return false;
      }
  return true;
}

/** Schritt von `von` nach `nach`, an Hindernissen entlang gleitend; wer schon zu nah steht, darf heraus. */
export function gleite(k: Hinderniskarte, von: Stelle, nach: Stelle): Stelle {
  if (!istFrei(k, von) || streckeFrei(k, von, nach)) return nach;
  const quer = { x: nach.x, z: von.z }, laengs = { x: von.x, z: nach.z };
  if (streckeFrei(k, von, quer)) return quer;
  if (streckeFrei(k, von, laengs)) return laengs;
  return von;
}

/** Raster der Karte (einmal gerechnet): Zellen um 15 cm, in großen Hallen etwas gröber (höchstens rund 90 000 Zellen). */
export function rasterVon(k: Hinderniskarte): Raster {
  if (k.raster) return k.raster;
  const g = Math.max(15, Math.sqrt((k.breite * k.laenge) / 90000));
  const nx = Math.max(1, Math.floor(k.breite / g)), nz = Math.max(1, Math.floor(k.laenge / g));
  const frei = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) frei[j * nx + i] = imRand(k, { x: (i + 0.5) * g, z: (j + 0.5) * g }) ? 1 : 0;
  const s = k.sperren;
  for (let n = 0; n < s.length / 4; n++) {
    // Zellen, deren Mitte echt im vergrößerten Hindernis liegt.
    const i0 = Math.max(0, Math.floor(s[n * 4]! / g - 0.5)), i1 = Math.min(nx - 1, Math.ceil(s[n * 4 + 2]! / g - 0.5));
    const j0 = Math.max(0, Math.floor(s[n * 4 + 1]! / g - 0.5)), j1 = Math.min(nz - 1, Math.ceil(s[n * 4 + 3]! / g - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * g;
      if (z <= s[n * 4 + 1]! || z >= s[n * 4 + 3]!) continue;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * g;
        if (x > s[n * 4]! && x < s[n * 4 + 2]!) frei[j * nx + i] = 0;
      }
    }
  }
  // Bereiche füllen (Nachbarn wie beim Suchen: diagonal nur ohne Ecke abzuschneiden).
  const teil = new Int32Array(nx * nz).fill(-1);
  const stapel = new Int32Array(nx * nz);
  let nummer = 0;
  for (let start = 0; start < nx * nz; start++) {
    if (!frei[start] || teil[start]! >= 0) continue;
    let oben = 0;
    stapel[oben++] = start;
    teil[start] = nummer;
    while (oben) {
      const c = stapel[--oben]!;
      nachbarn(nx, nz, frei, c, (n) => {
        if (teil[n]! < 0) {
          teil[n] = nummer;
          stapel[oben++] = n;
        }
      });
    }
    nummer++;
  }
  k.raster = { g, nx, nz, frei, teil };
  return k.raster;
}

function nachbarn(nx: number, nz: number, frei: Uint8Array, c: number, f: (n: number, d: number) => void) {
  const i = c % nx, j = (c - i) / nx;
  const l = i > 0 && frei[c - 1], r = i < nx - 1 && frei[c + 1], o = j > 0 && frei[c - nx], u = j < nz - 1 && frei[c + nx];
  if (l) f(c - 1, 1);
  if (r) f(c + 1, 1);
  if (o) f(c - nx, 1);
  if (u) f(c + nx, 1);
  if (l && o && frei[c - nx - 1]) f(c - nx - 1, Math.SQRT2);
  if (r && o && frei[c - nx + 1]) f(c - nx + 1, Math.SQRT2);
  if (l && u && frei[c + nx - 1]) f(c + nx - 1, Math.SQRT2);
  if (r && u && frei[c + nx + 1]) f(c + nx + 1, Math.SQRT2);
}

/** Zelle an der Stelle (−1 außerhalb des Rasters). */
export function zelleBei(r: Raster, p: Stelle): number {
  const i = Math.floor(p.x / r.g), j = Math.floor(p.z / r.g);
  return i < 0 || j < 0 || i >= r.nx || j >= r.nz ? -1 : j * r.nx + i;
}

export const zellMitte = (r: Raster, c: number): Stelle => ({ x: ((c % r.nx) + 0.5) * r.g, z: (Math.floor(c / r.nx) + 0.5) * r.g });

/** Nächste freie Zelle bis `weit` cm um die Stelle (−1: keine). */
export function freieZelleNahe(r: Raster, p: Stelle, weit = 100): number {
  const c = zelleBei(r, p);
  if (c >= 0 && r.frei[c]) return c;
  let beste = -1, abstand = Infinity;
  const n = Math.ceil(weit / r.g), i0 = Math.floor(p.x / r.g), j0 = Math.floor(p.z / r.g);
  for (let j = j0 - n; j <= j0 + n; j++)
    for (let i = i0 - n; i <= i0 + n; i++) {
      if (i < 0 || j < 0 || i >= r.nx || j >= r.nz || !r.frei[j * r.nx + i]) continue;
      const m = zellMitte(r, j * r.nx + i), d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d < abstand && d <= weit) [beste, abstand] = [j * r.nx + i, d];
    }
  return beste;
}

let puffer: { n: number; g: Float64Array; vor: Int32Array; stempel: Int32Array; zu: Int32Array; runde: number } | null = null;

/** Kürzester Weg (A*) von Zelle zu Zelle; null, wenn es keinen gibt oder er länger als `grenze` (cm) wäre. */
export function suche(k: Hinderniskarte, von: number, nach: number, grenze = Infinity): { laenge: number; zellen: number[] } | null {
  const r = rasterVon(k), n = r.nx * r.nz;
  if (!r.frei[von] || !r.frei[nach] || r.teil[von] !== r.teil[nach]) return null;
  if (!puffer || puffer.n !== n) puffer = { n, g: new Float64Array(n), vor: new Int32Array(n), stempel: new Int32Array(n), zu: new Int32Array(n), runde: 0 };
  const p = puffer;
  const runde = ++p.runde;
  const zx = nach % r.nx, zz = (nach - zx) / r.nx;
  const schaetze = (c: number) => {
    const dx = Math.abs((c % r.nx) - zx), dz = Math.abs(Math.floor(c / r.nx) - zz);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * r.g;
  };
  // Binärer Haufen (Zelle, Schätzung), veraltete Einträge werden übersprungen.
  const hz: number[] = [], hf: number[] = [];
  const hinein = (c: number, f: number) => {
    let i = hz.length;
    hz.push(c);
    hf.push(f);
    while (i > 0) {
      const o = (i - 1) >> 1;
      if (hf[o]! <= f) break;
      hz[i] = hz[o]!;
      hf[i] = hf[o]!;
      i = o;
    }
    hz[i] = c;
    hf[i] = f;
  };
  const heraus = () => {
    const c = hz[0]!, lz = hz.pop()!, lf = hf.pop()!;
    if (hz.length) {
      let i = 0;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= hz.length) break;
        if (m + 1 < hz.length && hf[m + 1]! < hf[m]!) m++;
        if (hf[m]! >= lf) break;
        hz[i] = hz[m]!;
        hf[i] = hf[m]!;
        i = m;
      }
      hz[i] = lz;
      hf[i] = lf;
    }
    return c;
  };
  p.stempel[von] = runde;
  p.g[von] = 0;
  p.vor[von] = -1;
  hinein(von, schaetze(von));
  while (hz.length) {
    const f = hf[0]!;
    const c = heraus();
    if (p.zu[c] === runde) continue;
    if (f > grenze) return null;
    p.zu[c] = runde;
    if (c === nach) {
      const zellen = [c];
      for (let x = p.vor[c]!; x >= 0; x = p.vor[x]!) zellen.push(x);
      return { laenge: p.g[c]!, zellen: zellen.reverse() };
    }
    const gc = p.g[c]!;
    nachbarn(r.nx, r.nz, r.frei, c, (m, d) => {
      const neu = gc + d * r.g;
      if (p.zu[m] === runde || (p.stempel[m] === runde && p.g[m]! <= neu)) return;
      p.stempel[m] = runde;
      p.g[m] = neu;
      p.vor[m] = c;
      hinein(m, neu + schaetze(m));
    });
  }
  return null;
}

/** Abkürzen: von jedem Punkt so weit voraus, wie die gerade Strecke frei ist (erster und letzter Punkt bleiben). */
export function abkuerzen(k: Hinderniskarte, punkte: Stelle[]): Stelle[] {
  if (punkte.length < 3) return punkte;
  const aus = [punkte[0]!];
  let i = 0;
  while (i < punkte.length - 1) {
    let weit = i + 1;
    for (let j = i + 2; j < punkte.length && j - weit <= 40; j++) if (streckeFrei(k, punkte[i]!, punkte[j]!)) weit = j;
    aus.push(punkte[weit]!);
    i = weit;
  }
  return aus;
}

/**
 * Ecken runden (Bogen bis 1,5 m vor und nach der Ecke, geprüft; wo er anstößt, enger oder gar nicht) und den Weg dicht
 * abtasten, sodass zwei Punkte höchstens `DICHTE` auseinander liegen. Kehrt der Weg um (Sackgasse), bleibt die Ecke.
 */
export function runden(k: Hinderniskarte, punkte: Stelle[]): Stelle[] {
  const p = punkte.filter((q, i) => i === 0 || Math.hypot(q.x - punkte[i - 1]!.x, q.z - punkte[i - 1]!.z) > 0.5);
  if (p.length < 2) return p;
  const zug: Stelle[] = [p[0]!];
  const linie = (a: Stelle, b: Stelle) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / DICHTE);
    for (let i = 1; i <= n; i++) zug.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  };
  for (let i = 1; i < p.length - 1; i++) {
    const a = zug.at(-1)!, e = p[i]!, b = p[i + 1]!;
    const la = Math.hypot(e.x - a.x, e.z - a.z), lb = Math.hypot(b.x - e.x, b.z - e.z);
    const ua = { x: (e.x - a.x) / la, z: (e.z - a.z) / la }, ub = { x: (b.x - e.x) / lb, z: (b.z - e.z) / lb };
    const cos = ua.x * ub.x + ua.z * ub.z;
    let bogen: Stelle[] | null = null;
    if (cos > -0.95 && cos < 0.9995) {
      const winkel = Math.acos(Math.max(-1, Math.min(1, cos)));
      for (let d = Math.min(150, 0.45 * la, 0.45 * lb); d >= 10 && !bogen; d /= 2) {
        const s = { x: e.x - ua.x * d, z: e.z - ua.z * d }, t = { x: e.x + ub.x * d, z: e.z + ub.z * d };
        const n = Math.max(3, Math.ceil(winkel / 0.15));
        const b2: Stelle[] = [s];
        for (let m = 1; m <= n; m++) {
          const u = m / n, v = 1 - u;
          b2.push({ x: v * v * s.x + 2 * u * v * e.x + u * u * t.x, z: v * v * s.z + 2 * u * v * e.z + u * u * t.z });
        }
        if (b2.every((q, m) => m === 0 || streckeFrei(k, b2[m - 1]!, q))) bogen = b2;
      }
    }
    if (bogen) {
      linie(a, bogen[0]!);
      zug.push(...bogen.slice(1));
    } else linie(a, e);
  }
  linie(zug.at(-1)!, p.at(-1)!);
  return zug;
}

/** Freier, geglätteter Weg von Stelle zu Stelle (beide frei, im selben Bereich), sonst null. */
export function wegZwischen(k: Hinderniskarte, von: Stelle, nach: Stelle): Stelle[] | null {
  if (!istFrei(k, von) || !istFrei(k, nach)) return null;
  if (streckeFrei(k, von, nach)) return runden(k, [von, nach]);
  const r = rasterVon(k);
  const a = freieZelleNahe(r, von), b = freieZelleNahe(r, nach);
  if (a < 0 || b < 0) return null;
  const w = suche(k, a, b);
  if (!w) return null;
  const mitte = w.zellen.map((c) => zellMitte(r, c));
  if (!streckeFrei(k, von, mitte[0]!) || !streckeFrei(k, mitte.at(-1)!, nach)) return null;
  return runden(k, abkuerzen(k, [von, ...mitte, nach]));
}
