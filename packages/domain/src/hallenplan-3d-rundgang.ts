/**
 * Automatischer Rundgang durch die Halle (3D): eine Runde an allen Käfigen. Er beginnt und endet am Haupteingang
 * (hallenplan-3d-eingang.ts; ohne Eingang beginnt er am Gang, der den kürzesten Weg ergibt, und endet am letzten). Ein Gang
 * ist die Linie vor den Käfigfronten (Käfige, eingesetzte Blöcke und Volieren; ohne Front rundum), mittig zwischen zwei Fronten
 * oder knapp einen Meter vor einer Front; er reicht nur so weit, wie dort Käfige stehen. Jeder Gang wird genau einmal
 * abgegangen; Reihenfolge und Richtung ergeben den kürzesten Gesamtweg. Dazwischen führt der kürzeste freie Weg – Wände,
 * Möbel und Sperrflächen sind nur Hindernisse, nie Ziel. Ist ein Gang eine Sackgasse, geht es darin zurück. Immer in
 * Augenhöhe und mit Abstand zu allem (Hinderniskarte und Wegsucher aus hallenplan-3d-wege.ts). Rein (ohne three.js).
 */
import type { HallenSzene } from "./hallenplan-3d";
import type { Blick } from "./hallenplan-typen";
import { haupteingang } from "./hallenplan-3d-eingang";
import { abkuerzen, abstaende, freieZelleNahe, type Hinderniskarte, hinderniskarte, istFrei, type Raster, rasterVon, runden, type Stelle, streckeFrei, suche, TEUER, type WegSzene, zelleBei, zellMitte } from "./hallenplan-3d-wege";

/** Augenhöhe beim Rundgang (cm), überall gleich. */
export const RUNDGANG_HOEHE = 160;
/** So weit vor einer Front geht man höchstens, wenn davor viel Platz ist (cm, über den Körperradius hinaus). */
const VOR_FRONT = 55;
/** Fronten derselben Reihe: Ebenen bis so weit auseinander, Lücken entlang bis so lang (cm). */
const EBENE_TOLERANZ = 30;
const FRONT_LUECKE = 100;
/** Zwei Frontlinien bilden einen Gang, wenn sie so nah beieinander liegen und sich entlang höchstens so weit verfehlen (cm). */
const GANG_TOLERANZ = 40;
const GANG_LUECKE = 300;
/** So breit um die Gehlinie gilt als Gang (cm, je Seite; an Fronten bis zu ihnen): dort entlang soll keine Verbindung gehen. */
const GANG_BAND = 150;
/** Kürzere freie Stücke eines Gangs fallen weg (cm). */
const MIN_STRECKE = 60;
/** Start: so weit innen vor der Tür, dann so weit geradeaus in die Halle (cm). */
const VOR_TUER = 80;
const IN_DIE_HALLE = 100;

export interface RundgangPunkt {
  x: number;
  y: number;
  z: number;
  /** Im Käfiggang mit Fronten nur auf einer Seite: Richtung zu ihnen (Einheitsvektor); der Blick geht leicht dorthin. */
  zu?: { x: number; z: number };
}

/** Was der Rundgang von der Szene braucht. */
export type RundgangSzene = WegSzene & Pick<HallenSzene, "tueren">;

/** Käfigfront: Normale entlang x (sonst z) in Plus- oder Minusrichtung, Ebene, Spanne entlang. */
interface Front {
  x: boolean;
  plus: boolean;
  ebene: number;
  u0: number;
  u1: number;
}

/** Gang: Linie quer zur Normalen (bei `x`: x = lage, entlang z) von u0 bis u1, mit den Fronten daran. */
interface Gang {
  x: boolean;
  lage: number;
  u0: number;
  u1: number;
  fronten: Front[];
}

const punktAuf = (x: boolean, quer: number, entlang: number): Stelle => (x ? { x: quer, z: entlang } : { x: entlang, z: quer });

/** Alle vier Seiten: Volieren ohne Front (ältere feste Pläne) sind rundum Gitter. */
const RUNDUM: Blick[] = ["x+", "x-", "z+", "z-"];

/** Fronten aller Käfige und Volieren, je Reihe zusammengefasst (Etagen und Nachbarn: eine Front). */
function frontenVon(s: WegSzene): Front[] {
  const roh: Front[] = [...s.kaefige.map((k) => ({ q: k.q, f: k.front })), ...s.volieren.flatMap((v) => (v.front ? [v.front] : RUNDUM).map((f) => ({ q: v.q, f })))].map(({ q, f }) => {
    const x = f[0] === "x", plus = f[1] === "+";
    return { x, plus, ebene: x ? (plus ? q.x + q.b : q.x) : plus ? q.z + q.t : q.z, u0: x ? q.z : q.x, u1: x ? q.z + q.t : q.x + q.b };
  });
  const aus: Front[] = [];
  for (const x of [true, false])
    for (const plus of [true, false]) {
      const hier = roh.filter((f) => f.x === x && f.plus === plus).sort((a, b) => a.ebene - b.ebene);
      // Nach der Ebene gruppieren, darin entlang zusammenhängende Stücke.
      for (let i = 0; i < hier.length; ) {
        let j = i + 1;
        while (j < hier.length && hier[j]!.ebene - hier[j - 1]!.ebene <= EBENE_TOLERANZ) j++;
        const gruppe = hier.slice(i, j).sort((a, b) => a.u0 - b.u0);
        let f: Front | null = null;
        for (const g of gruppe) {
          if (f && g.u0 - f.u1 <= FRONT_LUECKE) {
            f.u1 = Math.max(f.u1, g.u1);
            f.ebene = plus ? Math.max(f.ebene, g.ebene) : Math.min(f.ebene, g.ebene);
          } else aus.push((f = { ...g }));
        }
        i = j;
      }
    }
  return aus;
}

/** Abstand der Gehlinie vor einer Front (cm): Mitte des freien Raums davor, höchstens knapp einen Meter; null: kein Platz. */
function abstandVor(k: Hinderniskarte, f: Front): number | null {
  const n = Math.min(12, Math.max(1, Math.ceil((f.u1 - f.u0) / 100)));
  const werte: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = f.u0 + ((i + 0.5) * (f.u1 - f.u0)) / n;
    const frei = (d: number) => istFrei(k, punktAuf(f.x, f.ebene + (f.plus ? d : -d), u));
    let a = 0;
    while (a <= 100 && !frei(a)) a += 5;
    if (a > 100) continue;
    let b = a;
    while (b < 400 && frei(b + 5)) b += 5;
    werte.push(Math.min((a + b) / 2, a + VOR_FRONT));
  }
  return werte.length ? werte.sort((p, q) => p - q)[werte.length >> 1]! : null;
}

/** Gänge: je Front eine Gehlinie, gegenüberliegende und fluchtende Linien zu einem Gang zusammengefasst. */
function gaengeVon(k: Hinderniskarte, fronten: Front[]): Gang[] {
  const linien = fronten.flatMap((f) => {
    const d = abstandVor(k, f);
    return d == null ? [] : [{ x: f.x, lage: f.ebene + (f.plus ? d : -d), u0: f.u0, u1: f.u1, fronten: [f] }];
  });
  linien.sort((a, b) => Number(a.x) - Number(b.x) || a.lage - b.lage || a.u0 - b.u0);
  const gaenge: Gang[] = [];
  for (const l of linien) {
    const g = gaenge.find((g) => g.x === l.x && Math.abs(g.lage - l.lage) <= GANG_TOLERANZ && Math.max(g.u0, l.u0) - Math.min(g.u1, l.u1) <= GANG_LUECKE);
    if (!g) {
      gaenge.push(l);
      continue;
    }
    const n = g.fronten.length;
    g.lage = (g.lage * n + l.lage) / (n + 1);
    g.u0 = Math.min(g.u0, l.u0);
    g.u1 = Math.max(g.u1, l.u1);
    g.fronten.push(...l.fronten);
  }
  return gaenge;
}

/** Freie Stücke eines Gangs als Zellen (Anfang, Ende); was darin steht (Sperrfläche, Block), teilt ihn. */
function streckenVon(k: Hinderniskarte, g: Gang): [number, number][] {
  const r = rasterVon(k);
  const strecken: [number, number][] = [];
  let vorher = -1;
  for (let u = g.u0; u <= g.u1 + 0.01; u += r.g / 2) {
    const p = punktAuf(g.x, g.lage, Math.min(u, g.u1));
    const i = Math.floor(p.x / r.g), j = Math.floor(p.z / r.g), c = j * r.nx + i;
    if (i < 0 || j < 0 || i >= r.nx || j >= r.nz || !r.frei[c] || c === vorher) {
      if (c !== vorher) vorher = -1;
      continue;
    }
    const nah = vorher >= 0 && Math.abs((vorher % r.nx) - i) <= 1 && Math.abs(Math.floor(vorher / r.nx) - j) <= 1;
    if (nah) strecken.at(-1)![1] = c;
    else strecken.push([c, c]);
    vorher = c;
  }
  const lang = ([a, b]: [number, number]) => Math.hypot(zellMitte(r, a).x - zellMitte(r, b).x, zellMitte(r, a).z - zellMitte(r, b).z) >= MIN_STRECKE;
  return strecken.filter(lang);
}

/** Zellen in den Gängen (bis `GANG_BAND` um die Linie, so weit Käfige stehen). */
function gangFlaeche(r: Raster, gaenge: Gang[]): Uint8Array {
  const teuer = new Uint8Array(r.nx * r.nz);
  for (const g of gaenge) {
    const a = punktAuf(g.x, g.lage - GANG_BAND, g.u0), b = punktAuf(g.x, g.lage + GANG_BAND, g.u1);
    const i0 = Math.max(0, Math.ceil(a.x / r.g - 0.5)), i1 = Math.min(r.nx - 1, Math.floor(b.x / r.g - 0.5));
    const j0 = Math.max(0, Math.ceil(a.z / r.g - 0.5)), j1 = Math.min(r.nz - 1, Math.floor(b.z / r.g - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) teuer[j * r.nx + i] = 1;
  }
  return teuer;
}

/** Start am Haupteingang: Zelle innen vor der Tür und eine Zelle ein Stück geradeaus in die Halle; null ohne Eingang. */
function startAmEingang(k: Hinderniskarte, s: RundgangSzene): [number, number] | null {
  const t = haupteingang(s)?.tuer;
  if (!t) return null;
  const r = rasterVon(k);
  const mitte = { x: t.q.x + t.q.b / 2, z: t.q.z + t.q.t / 2 };
  // Die Tür ist so dick wie die Wand: quer dazu geht es hinein (dorthin, wo frei ist bzw. die Halle liegt).
  const x = t.q.b < t.q.t, dicke = x ? t.q.b : t.q.t;
  const kandidaten = [1, -1].map((v) => ({ v, p: punktAuf(x, (x ? mitte.x : mitte.z) + v * (dicke / 2 + VOR_TUER), x ? mitte.z : mitte.x) }));
  const innen = kandidaten.find((c) => istFrei(k, c.p)) ?? kandidaten.find((c) => (x ? c.p.x > 0 && c.p.x < k.breite : c.p.z > 0 && c.p.z < k.laenge));
  if (!innen) return null;
  const a = freieZelleNahe(r, innen.p, 150);
  if (a < 0) return null;
  const pa = zellMitte(r, a);
  const weiter = punktAuf(x, (x ? pa.x : pa.z) + innen.v * IN_DIE_HALLE, x ? pa.z : pa.x);
  const b = freieZelleNahe(r, weiter, 20);
  return [a, b >= 0 && r.teil[b] === r.teil[a] && streckeFrei(k, pa, zellMitte(r, b)) ? b : a];
}

/**
 * Reihenfolge und Richtung der Strecken für den kürzesten Gesamtweg (vom Start über alle Strecken zurück; ohne Start offen).
 * `d(a, b)`: Weglänge zwischen Enden (0: Start, 1 + 2i / 2 + 2i: Anfang / Ende der Strecke i). Nächster Nachbar von jedem
 * Anfang aus, dann Umkehren von Teilfolgen (2-opt, mit Richtung) und Versetzen einzelner Strecken, bis nichts mehr kürzer wird.
 */
function reihenfolge(m: number, d: (a: number, b: number) => number): { i: number; um: boolean }[] {
  const anf = (i: number, um: boolean) => (um ? 2 + 2 * i : 1 + 2 * i), end = (i: number, um: boolean) => (um ? 1 + 2 * i : 2 + 2 * i);
  const kosten = (t: { i: number; um: boolean }[]) => t.reduce((n, x, j) => n + d(j ? end(t[j - 1]!.i, t[j - 1]!.um) : 0, anf(x.i, x.um)), 0) + (t.length ? d(end(t.at(-1)!.i, t.at(-1)!.um), 0) : 0);
  let beste: { i: number; um: boolean }[] = [], besteKosten = Infinity;
  for (let erst = 0; erst < 2 * m; erst++) {
    const t = [{ i: erst >> 1, um: (erst & 1) === 1 }];
    const frei = new Set(Array.from({ length: m }, (_, i) => i).filter((i) => i !== erst >> 1));
    while (frei.size) {
      const hier = end(t.at(-1)!.i, t.at(-1)!.um);
      let w = { i: -1, um: false }, wd = Infinity;
      for (const i of frei)
        for (const um of [false, true])
          if (d(hier, anf(i, um)) < wd) [w, wd] = [{ i, um }, d(hier, anf(i, um))];
      t.push(w);
      frei.delete(w.i);
    }
    verbessere(t, d, anf, end);
    const c = kosten(t);
    if (c < besteKosten - 1e-6) [beste, besteKosten] = [t, c];
  }
  return beste;
}

function verbessere(t: { i: number; um: boolean }[], d: (a: number, b: number) => number, anf: (i: number, um: boolean) => number, end: (i: number, um: boolean) => number) {
  const vor = (j: number) => (j > 0 ? end(t[j - 1]!.i, t[j - 1]!.um) : 0), nach = (j: number) => (j < t.length - 1 ? anf(t[j + 1]!.i, t[j + 1]!.um) : 0);
  for (let runde = 0, besser = true; besser && runde < 50; runde++) {
    besser = false;
    // 2-opt: Teilfolge i..j umkehren (jede Strecke darin in Gegenrichtung).
    for (let i = 0; i < t.length; i++)
      for (let j = i; j < t.length; j++) {
        const a = vor(i), b = nach(j), si = anf(t[i]!.i, t[i]!.um), ej = end(t[j]!.i, t[j]!.um);
        if (d(a, ej) + d(si, b) < d(a, si) + d(ej, b) - 1e-6) {
          const teil = t.slice(i, j + 1).reverse().map((x) => ({ i: x.i, um: !x.um }));
          t.splice(i, teil.length, ...teil);
          besser = true;
        }
      }
    // Eine Strecke an eine andere Stelle setzen (in beiden Richtungen).
    for (let i = 0; i < t.length && t.length > 2; i++) {
      const x = t[i]!, raus = d(vor(i), anf(x.i, x.um)) + d(end(x.i, x.um), nach(i)) - d(vor(i), nach(i));
      const rest = [...t.slice(0, i), ...t.slice(i + 1)];
      let ziel = -1, zum = false, gewinn = 1e-6;
      for (let j = 0; j <= rest.length; j++) {
        const a = j > 0 ? end(rest[j - 1]!.i, rest[j - 1]!.um) : 0, b = j < rest.length ? anf(rest[j]!.i, rest[j]!.um) : 0;
        for (const um of [false, true]) {
          const g = raus - (d(a, anf(x.i, um)) + d(end(x.i, um), b) - d(a, b));
          if (g > gewinn) [ziel, zum, gewinn] = [j, um, g];
        }
      }
      if (ziel >= 0) {
        rest.splice(ziel, 0, { i: x.i, um: zum });
        t.splice(0, t.length, ...rest);
        besser = true;
      }
    }
  }
}

/**
 * Wegpunkte des Rundgangs in Szene-Koordinaten (cm; x entlang der Breite, z entlang der Länge, y Augenhöhe), vor dem
 * Vertauschen der Achsen (`vertauscht`). Je zwei aufeinanderfolgende Punkte liegen dicht beieinander, die Strecke dazwischen
 * ist frei. Leer, wenn es keinen erreichbaren Gang mit Käfigen gibt.
 */
export function rundgang(s: RundgangSzene): RundgangPunkt[] {
  const k = hinderniskarte(s);
  const r = rasterVon(k);
  const gaenge = gaengeVon(k, frontenVon(s));
  const alle = gaenge.flatMap((g) => streckenVon(k, g));
  if (!alle.length) return [];
  // Im Bereich des Eingangs; ohne Eingang (oder ist er abgeschnitten) im Bereich mit den meisten Strecken.
  let start = startAmEingang(k, s);
  if (start && !alle.some(([a]) => r.teil[a] === r.teil[start![0]])) start = null;
  const zahl = new Map<number, number>();
  for (const [a] of alle) zahl.set(r.teil[a]!, (zahl.get(r.teil[a]!) ?? 0) + 1);
  const bereich = start ? r.teil[start[0]]! : [...zahl.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const strecken = alle.filter(([a]) => r.teil[a] === bereich);

  // Weglängen zwischen allen Enden (und dem Start), dann die kürzeste Runde. Vor Käfigfronten entlang (in einem Gang) zählt
  // ein Verbindungsweg `TEUER`-fach: lieber ein kleiner Umweg als eine Front zweimal.
  const teuer = gangFlaeche(r, gaenge);
  const enden = [start ? start[1] : -1, ...strecken.flat()];
  const tabelle = enden.map((e, i) => (i === 0 && !start ? enden.map(() => 0) : abstaende(k, e, enden, teuer)));
  const d = (a: number, b: number) => (start || (a && b) ? tabelle[a]![b]! : 0);
  const folge = reihenfolge(strecken.length, d);

  const stuecke: { p: Stelle[]; verbindung?: true }[] = [];
  const mitten = (zellen: number[]) => zellen.map((c) => zellMitte(r, c));
  let hier = -1;
  if (start) {
    stuecke.push({ p: mitten([start[0], start[1]]) });
    hier = start[1];
  }
  const hin = (nach: number) => {
    if (hier >= 0 && hier !== nach) stuecke.push({ p: mitten(suche(k, hier, nach, Infinity, teuer)?.zellen ?? [hier, nach]), verbindung: true });
    hier = nach;
  };
  for (const { i, um } of folge) {
    const [a, b] = um ? [strecken[i]![1], strecken[i]![0]] : strecken[i]!;
    hin(a);
    const pa = zellMitte(r, a), pb = zellMitte(r, b);
    stuecke.push({ p: streckeFrei(k, pa, pb) ? [pa, pb] : mitten(suche(k, a, b)?.zellen ?? [a, b]) });
    hier = b;
  }
  if (start) {
    hin(start[1]);
    stuecke.push({ p: mitten([start[1], start[0]]) });
  }
  // Jedes Stück für sich abgekürzt (keine Sackgasse übersprungen; Verbindungen nicht quer durch einen Gang, wenn sie ihn
  // gemieden haben), dann Ecken gerundet.
  const gewicht = (a: Stelle, b: Stelle) => {
    const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / (r.g / 2)));
    let w = 0;
    for (let i = 0; i < n; i++) w += teuer[zelleBei(r, { x: a.x + ((b.x - a.x) * (i + 0.5)) / n, z: a.z + ((b.z - a.z) * (i + 0.5)) / n })] ? TEUER : 1;
    return (w * l) / n;
  };
  const zug: Stelle[] = [];
  for (const { p: st, verbindung } of stuecke) {
    const bis = [0];
    if (verbindung) for (let i = 1; i < st.length; i++) bis.push(bis[i - 1]! + gewicht(st[i - 1]!, st[i]!));
    const gekuerzt = abkuerzen(k, st, verbindung ? (i, j) => gewicht(st[i]!, st[j]!) <= bis[j]! - bis[i]! + 1 : undefined);
    for (const p of gekuerzt) if (!zug.length || zug.at(-1)!.x !== p.x || zug.at(-1)!.z !== p.z) zug.push(p);
  }
  const weg = runden(k, zug);
  return weg.map((p, i) => {
    const zu = blickZu(gaenge, p, weg[i + 1] ?? weg[i - 1] ?? p);
    return { x: p.x, y: RUNDGANG_HOEHE, z: p.z, ...(zu ? { zu } : {}) };
  });
}

/** Im Gang entlang mit Fronten nur auf einer Seite: Richtung zu ihnen; sonst (beide Seiten, Verbindungsstück) keine. */
function blickZu(gaenge: Gang[], p: Stelle, q: Stelle): { x: number; z: number } | undefined {
  const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
  for (const g of gaenge) {
    const quer = g.x ? p.x : p.z, u = g.x ? p.z : p.x, entlang = Math.abs(g.x ? dz : dx);
    if (Math.abs(quer - g.lage) > 30 || u < g.u0 - 10 || u > g.u1 + 10 || !l || entlang < 0.8 * l) continue;
    // Front in Plusrichtung liegt auf der kleineren Seite der Linie: dorthin schaut man in Minusrichtung.
    const seiten = new Set(g.fronten.filter((f) => u >= f.u0 && u <= f.u1).map((f) => (f.plus ? -1 : 1)));
    if (seiten.size !== 1) return undefined;
    const v = [...seiten][0]!;
    return g.x ? { x: v, z: 0 } : { x: 0, z: v };
  }
  return undefined;
}
