/**
 * Dach und Decke der 3D-Halle (Entscheidung 028): flache Decke in Wandhöhe oder Satteldach (First parallel zur langen Seite
 * in der Mitte, nur beim rechteckigen Grundriss), Leimbinder entlang der Decke, Giebel an den Stirnseiten, Leuchtbänder
 * mit sinnvoller Höhe über den Käfigen. Die Decke ist nur von innen zu sehen. Alles in cm, Szene-Koordinaten.
 */
import type { HallenSzene, Quader, SzeneSeite } from "./hallenplan-3d";
import { type Punkt, punktInUmriss } from "./hallenplan-umriss";

/** Was die Dachrechnung von der Szene braucht; `firstHoehe` fehlt: flach. */
export interface DachLage {
  breite: number;
  laenge: number;
  wandHoehe: number;
  firstHoehe?: number;
  umriss?: Punkt[];
}

export interface Dach {
  sattel: boolean;
  /** First entlang x (Halle breiter als lang), sonst entlang z. */
  laengsX: boolean;
  traufe: number;
  first: number;
}

export function dachVon(s: DachLage): Dach {
  const first = Math.max(s.wandHoehe, s.firstHoehe ?? s.wandHoehe);
  return { sattel: !s.umriss && first > s.wandHoehe + 0.5, laengsX: s.breite >= s.laenge, traufe: s.wandHoehe, first };
}

/** Unterseite der Decke an der Stelle (x, z): an den Längswänden die Traufe, zur Mitte gerade bis zum First. */
export function deckenHoehe(s: DachLage, x: number, z: number): number {
  const d = dachVon(s);
  if (!d.sattel) return s.wandHoehe;
  const quer = d.laengsX ? s.laenge : s.breite;
  const v = d.laengsX ? z : x;
  const t = Math.min(1, Math.max(0, 1 - Math.abs(v - quer / 2) / (quer / 2)));
  return d.traufe + (d.first - d.traufe) * t;
}

/**
 * Ist die Decke zu sehen? Nur von innen: Kamera unter der Decke (beim Satteldach an ihrer Stelle) und über der Grundfläche
 * der Halle (cm, Szene). Von oben oder außen versperrte sie den Blick auf die Käfige.
 */
export function deckeSichtbar(s: DachLage, kamera: { x: number; y: number; z: number }): boolean {
  const innen = s.umriss ? punktInUmriss({ x: kamera.x, y: kamera.z }, s.umriss) : kamera.x > 0 && kamera.x < s.breite && kamera.z > 0 && kamera.z < s.laenge;
  return innen && kamera.y < deckenHoehe(s, kamera.x, kamera.z) - 5;
}

/** Leimbinder 16 × 45 cm etwa alle 5,50 m; Leuchten 2,40 m lang. */
export const BINDER = { breite: 16, hoehe: 45, abstand: 550 };
export const LEUCHTE = { laenge: 240, breite: 14, hoehe: 8 };

/** Ein Binder (bzw. eine Hälfte beim Satteldach): Oberkante an der Decke von a nach b, Querschnitt `BINDER`. */
export interface Binder {
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
}

export interface DeckenTeile {
  binder: Binder[];
  leuchten: Quader[];
}

/** Strecken innerhalb des Grundrisses auf der Linie quer zur langen Seite (bei `laengsX` x = lage, sonst z = lage). */
function innenStrecken(u: Punkt[], lage: number, laengsX: boolean): [number, number][] {
  const schnitte: number[] = [];
  for (let i = 0; i < u.length; i++) {
    const a = u[i]!, b = u[(i + 1) % u.length]!;
    // Kanten quer zur Linie: bei laengsX waagrechte Kanten (y fest) über x = lage, sonst senkrechte über y = lage.
    const [p0, p1, quer] = laengsX ? [a.x, b.x, a.y] : [a.y, b.y, a.x];
    if ((laengsX ? a.y !== b.y : a.x !== b.x) || Math.min(p0, p1) > lage || Math.max(p0, p1) <= lage) continue;
    schnitte.push(quer);
  }
  schnitte.sort((a, b) => a - b);
  const aus: [number, number][] = [];
  for (let i = 0; i + 1 < schnitte.length; i += 2) aus.push([schnitte[i]!, schnitte[i + 1]!]);
  return aus;
}

/** Höchster Käfig bzw. höchste Voliere der Szene (Oberkante, cm); 0 ohne. */
export function hoechstesInDerHalle(s: Pick<HallenSzene, "kaefige" | "volieren">): number {
  return Math.max(0, ...s.kaefige.map((k) => k.q.y + k.q.h), ...s.volieren.map((v) => v.q.y + v.q.h));
}

/**
 * Holzdecke: Leimbinder quer zur langen Seite in gleichem Abstand, bündig unter der Decke (beim Satteldach zwei Hälften
 * von der Traufe zum First); in jedem Feld dazwischen Leuchtbänder parallel zu den Bindern. Die Leuchten hängen unter den
 * Bindern, aber nie tiefer als 1,50 m über dem höchsten Käfig (`hoechstes`) und nie unter 3 m; reicht die Decke dafür
 * nicht, sitzen sie direkt an der Decke. Beim freien Grundriss nur über der Halle.
 */
export function deckenTeile(s: DachLage, hoechstes = 0): DeckenTeile {
  const d = dachVon(s);
  const L = d.laengsX ? s.breite : s.laenge, B = d.laengsX ? s.laenge : s.breite;
  const P = (u: number, v: number) => (d.laengsX ? { x: u, z: v } : { x: v, z: u });
  const hoehe = (u: number, v: number) => {
    const p = P(u, v);
    return deckenHoehe(s, p.x, p.z);
  };
  const strecken = (u: number): [number, number][] => (s.umriss ? innenStrecken(s.umriss, u, d.laengsX) : d.sattel ? [[0, B / 2], [B / 2, B]] : [[0, B]]);
  const felder = Math.max(2, Math.round(L / BINDER.abstand));
  const binder: Binder[] = [];
  for (let i = 1; i < felder; i++) {
    const u = (L * i) / felder;
    for (const [a, b] of strecken(u)) binder.push({ a: { ...P(u, a), y: hoehe(u, a) }, b: { ...P(u, b), y: hoehe(u, b) } });
  }
  const unten = Math.max(300, hoechstes + 150);
  const m = Math.max(1, Math.round(B / 600));
  const laenge = Math.min(LEUCHTE.laenge, B / m - 60);
  const leuchten: Quader[] = [];
  if (laenge > 60)
    for (let j = 0; j < felder; j++) {
      const u = (L * (j + 0.5)) / felder;
      for (let i = 0; i < m; i++) {
        const v = (B * (i + 0.5)) / m;
        const enden = [v - laenge / 2, v + laenge / 2];
        if (s.umriss && !enden.every((w) => punktInUmriss(d.laengsX ? { x: u, y: w } : { x: w, y: u }, s.umriss!))) continue;
        const decke = Math.min(...enden.map((w) => hoehe(u, w)));
        let y = Math.max(decke - BINDER.hoehe - 30 - LEUCHTE.hoehe, unten);
        if (y + LEUCHTE.hoehe > decke) y = decke - LEUCHTE.hoehe;
        const p = P(u - LEUCHTE.breite / 2, v - laenge / 2);
        leuchten.push(d.laengsX ? { ...p, b: LEUCHTE.breite, t: laenge, y, h: LEUCHTE.hoehe } : { ...p, b: laenge, t: LEUCHTE.breite, y, h: LEUCHTE.hoehe });
      }
    }
  return { binder, leuchten };
}

/** Giebeldreieck über einer Stirnwand: entlang der Wand von–bis (über die Ecken), Unterkante y, Spitze in der Mitte. */
export interface Giebel {
  seite: SzeneSeite;
  /** Wandstück, mit dem der Giebel aus- und einblendet. */
  wand: number;
  /** Innenfläche quer zur Wand (wie `WandInnenseite.ebene`), die Wand ist `dicke` stark nach außen. */
  ebene: number;
  dicke: number;
  von: number;
  bis: number;
  y: number;
  spitze: number;
}

/** Giebel an beiden Stirnseiten beim Satteldach (geschlossen bis unter den First); flach: keine. */
export function giebel(s: Pick<HallenSzene, "breite" | "laenge" | "wandHoehe" | "firstHoehe" | "umriss" | "waende" | "wandDicke">): Giebel[] {
  const d = dachVon(s);
  if (!d.sattel) return [];
  const seiten: SzeneSeite[] = d.laengsX ? ["x0", "x1"] : ["z0", "z1"];
  return seiten.flatMap((seite) => {
    const laenge = (w: Quader) => (seite[0] === "z" ? w.b : w.t);
    const kandidaten = s.waende.map((w, i) => ({ w, i })).filter((x) => x.w.seite === seite).sort((a, b) => Number(b.w.y === 0) - Number(a.w.y === 0) || laenge(b.w) - laenge(a.w));
    const wand = kandidaten[0];
    if (!wand) return [];
    const entlang = seite[0] === "z" ? s.breite : s.laenge;
    const ebene = seite === "x0" || seite === "z0" ? 0 : seite === "x1" ? s.breite : s.laenge;
    return [{ seite, wand: wand.i, ebene, dicke: s.wandDicke, von: -s.wandDicke, bis: entlang + s.wandDicke, y: d.traufe, spitze: d.first }];
  });
}
