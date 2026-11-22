/**
 * Ausstattung der 3D-Halle aus dem Aussehen (Entscheidung 028): Fenster oben in den Längswänden, Geräte an den Wänden
 * (Basketballbretter, Sprossenwand), Spielfeldlinien am Boden, Decke mit Bindern und Leuchten. Alles in cm, in
 * Szene-Koordinaten (x entlang der Breite, z entlang der Länge). Reine Anschauung: nichts davon ist Hindernis im Plan.
 */
import { type HallenSzene, type Quader, type SzeneSeite, wandInnenseiten, type WandInnenseite } from "./hallenplan-3d";
import type { VollesAussehen } from "./hallenplan-aussehen";
import { type Punkt, punktInUmriss } from "./hallenplan-umriss";

type Wandlage = Pick<HallenSzene, "breite" | "laenge" | "waende" | "wandHoehe" | "aussehen">;

/** Längsseiten (an der längeren Seite; bei quadratischer Halle an z) und Stirnseiten. */
const laengsSeiten = (s: { breite: number; laenge: number }): SzeneSeite[] => (s.breite >= s.laenge ? ["z0", "z1"] : ["x0", "x1"]);
const stirnSeiten = (s: { breite: number; laenge: number }): SzeneSeite[] => (s.breite >= s.laenge ? ["x0", "x1"] : ["z0", "z1"]);

/** Voll hohe Wandstücke (ohne die Stürze über den Türen): nur dort ist die Wand ganz geschlossen. */
const volleStuecke = (s: Wandlage) => wandInnenseiten(s).filter((f) => f.y <= 0.5 && f.y + f.h >= s.wandHoehe - 0.5);

/** Fenster auf der Innenseite eines Wandstücks: Strecke entlang der Wand (von–bis), Unterkante y und Höhe h. */
export interface WandFenster {
  wand: number;
  seite: SzeneSeite;
  ebene: number;
  von: number;
  bis: number;
  y: number;
  h: number;
}

/** Höhe des Fensterbands: oben knapp unter der Decke, unten über der Prallwand und mindestens in der oberen Wandhälfte. */
export function fensterBand(a: VollesAussehen): { y: number; h: number } | null {
  const oben = a.wandHoehe - Math.min(60, Math.max(15, Math.round(a.wandHoehe * 0.08)));
  const unten = Math.max(a.prallwandHoehe + 25, Math.round(a.wandHoehe * 0.5));
  return oben - unten >= 50 ? { y: unten, h: oben - unten } : null;
}

/** Fenster: um 3 m breit (1–4 m), 1,20 m dazwischen, an Ecken und Türen mindestens 60 cm Wand. */
const FENSTER = { rand: 60, abstand: 120, ziel: 300, max: 400, min: 100 };

/** Fenster eines Wandstücks, gleichmäßig verteilt (Abstand an den Enden wie dazwischen). */
function fensterReihe(von: number, bis: number): [number, number][] {
  const { rand, abstand, ziel, max, min } = FENSTER;
  const nutz = bis - von - 2 * rand;
  if (nutz < min) return [];
  const n = Math.max(1, Math.round((nutz + abstand) / (ziel + abstand)));
  const b = Math.min(max, (nutz - (n - 1) * abstand) / n);
  const luecke = (bis - von - n * b) / (n + 1);
  return Array.from({ length: n }, (_, i) => {
    const a = von + luecke * (i + 1) + b * i;
    return [Math.round(a), Math.round(a + b)];
  });
}

/** Fensterband oben in den Längswänden, nur in voll hohen Wandstücken (nie über einer Tür). */
export function fensterInWaenden(s: Wandlage): WandFenster[] {
  const band = s.aussehen.fenster ? fensterBand(s.aussehen) : null;
  if (!band) return [];
  const seiten = laengsSeiten(s);
  return volleStuecke(s)
    .filter((f) => seiten.includes(f.seite))
    .flatMap((f) => fensterReihe(f.von, f.bis).map(([von, bis]) => ({ wand: f.wand, seite: f.seite, ebene: f.ebene, von, bis, ...band })));
}

/** Gerät an der Wand (Deko): Mitte entlang der Wand, Unterkante y, Breite b, Höhe h. */
export interface WandGeraet {
  art: "korb" | "sprossenwand";
  wand: number;
  seite: SzeneSeite;
  ebene: number;
  mitte: number;
  y: number;
  b: number;
  h: number;
}

/** Basketballbrett 1,80 × 1,05 m, Unterkante 2,90 m (bei niedriger Wand tiefer); Ring ragt bis 60 cm in die Halle. */
export const KORB = { b: 180, h: 105, unten: 290, tief: 60 };
/** Sprossenwand mit zwei Feldern, bis 2,50 m hoch, 30 cm tief. */
export const SPROSSENWAND = { b: 180, h: 250, tief: 30 };

type Hindernisse = Pick<HallenSzene, "aufsteller" | "kaefige" | "volieren" | "moebel">;

/**
 * Freier Platz an der Wand für ein Gerät der Breite b: möglichst nahe an `ziel`, in einem voll hohen Wandstück (nie vor
 * einer Tür), und kein Aufsteller, Käfig, keine Voliere und kein Möbel in den `tief` cm davor, das über `unten` reicht.
 */
function platzAnWand(stuecke: WandInnenseite[], ziel: number, b: number, tief: number, unten: number, hindernisse: Quader[]) {
  const frei = (f: WandInnenseite, mitte: number) => {
    const entlangX = f.seite === "z0" || f.seite === "z1";
    const [q0, q1] = f.seite === "x0" || f.seite === "z0" ? [f.ebene, f.ebene + tief] : [f.ebene - tief, f.ebene];
    return !hindernisse.some((h) => {
      const [e0, e1] = entlangX ? [h.x, h.x + h.b] : [h.z, h.z + h.t];
      const [t0, t1] = entlangX ? [h.z, h.z + h.t] : [h.x, h.x + h.b];
      return e0 < mitte + b / 2 && e1 > mitte - b / 2 && t0 < q1 && t1 > q0 && h.y + h.h > unten;
    });
  };
  const kandidaten: { f: WandInnenseite; mitte: number }[] = [];
  for (const f of stuecke) {
    const lo = f.von + b / 2 + 20, hi = f.bis - b / 2 - 20;
    if (lo > hi) continue;
    kandidaten.push({ f, mitte: Math.min(hi, Math.max(lo, ziel)) });
    for (let m = lo; m <= hi; m += 50) kandidaten.push({ f, mitte: m });
  }
  kandidaten.sort((a, c) => Math.abs(a.mitte - ziel) - Math.abs(c.mitte - ziel));
  const k = kandidaten.find((x) => frei(x.f, x.mitte));
  return k ? { wand: k.f.wand, seite: k.f.seite, ebene: k.f.ebene, mitte: Math.round(k.mitte) } : null;
}

/**
 * Geräte an den Wänden: je Stirnwand ein Basketballbrett mittig oben, an einer Längswand eine Sprossenwand unter den
 * Fenstern. Nur in voll hohen Wandstücken (nicht vor Türen) und nie dort, wo Käfige, Volieren oder Möbel an der Wand stehen;
 * findet sich kein Platz, fällt das Gerät weg.
 */
export function geraeteAnWaenden(s: Wandlage & Hindernisse): WandGeraet[] {
  if (!s.aussehen.geraete) return [];
  const stuecke = volleStuecke(s);
  const hindernisse: Quader[] = [...s.aufsteller, ...s.kaefige.map((k) => k.q), ...s.volieren.map((v) => v.q), ...s.moebel.map((m) => m.q)];
  const aus: WandGeraet[] = [];
  const korbY = Math.min(KORB.unten, s.wandHoehe - 15 - KORB.h);
  if (korbY >= 200)
    for (const seite of stirnSeiten(s)) {
      const p = platzAnWand(stuecke.filter((f) => f.seite === seite), (seite[0] === "z" ? s.breite : s.laenge) / 2, KORB.b, KORB.tief, korbY, hindernisse);
      if (p) aus.push({ art: "korb", ...p, y: korbY, b: KORB.b, h: KORB.h });
    }
  const band = s.aussehen.fenster ? fensterBand(s.aussehen) : null;
  const h = Math.min(SPROSSENWAND.h, (band ? band.y : s.wandHoehe) - 15);
  if (h >= 150)
    for (const seite of laengsSeiten(s)) {
      const p = platzAnWand(stuecke.filter((f) => f.seite === seite), (seite[0] === "z" ? s.breite : s.laenge) * 0.25, SPROSSENWAND.b, SPROSSENWAND.tief, 0, hindernisse);
      if (!p) continue;
      aus.push({ art: "sprossenwand", ...p, y: 0, b: SPROSSENWAND.b, h });
      break;
    }
  return aus;
}

/** Linie am Boden (Strichmitte, cm); `punkte` als Linienzug. */
export interface SpielfeldLinie {
  art: "feld" | "mittellinie" | "mittelkreis" | "torraum" | "freiwurf" | "siebenmeter" | "volleyball" | "basketball";
  farbe: "schwarz" | "blau" | "rot";
  punkte: { x: number; z: number }[];
}

/** Strichbreite der Spielfeldlinien (cm). */
export const LINIEN_BREITE = 5;

/** Liegt das Rechteck ganz im Grundriss? Rand in kleinen Schritten geprüft, und keine Ecke des Grundrisses darin. */
function rechteckImUmriss(x0: number, z0: number, x1: number, z1: number, u: Punkt[]): boolean {
  if (u.some((p) => p.x > x0 && p.x < x1 && p.y > z0 && p.y < z1)) return false;
  const rand: Punkt[] = [];
  for (let x = x0; x <= x1; x += 50) rand.push({ x, y: z0 + 1 }, { x, y: z1 - 1 });
  for (let z = z0; z <= z1; z += 50) rand.push({ x: x0 + 1, y: z }, { x: x1 - 1, y: z });
  rand.push({ x: x1 - 1, y: z0 + 1 }, { x: x1 - 1, y: z1 - 1 });
  return rand.every((p) => punktInUmriss(p, u));
}

/** Linienzug in Striche teilen (Länge `strich`, Lücke `luecke`). */
function gestrichelt(p: { u: number; v: number }[], strich: number, luecke: number): { u: number; v: number }[][] {
  const aus: { u: number; v: number }[][] = [];
  let pos = 0;
  let akt: { u: number; v: number }[] | null = [p[0]!];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!;
    const l = Math.hypot(b.u - a.u, b.v - a.v);
    let t = 0;
    while (t < l) {
      const imStrich = pos % (strich + luecke) < strich;
      const bisWechsel = imStrich ? strich - (pos % (strich + luecke)) : strich + luecke - (pos % (strich + luecke));
      const schritt = Math.min(bisWechsel, l - t);
      t += schritt;
      pos += schritt;
      const q = { u: a.u + ((b.u - a.u) * t) / l, v: a.v + ((b.v - a.v) * t) / l };
      if (imStrich) akt!.push(q);
      const jetzt = pos % (strich + luecke) < strich;
      if (imStrich && !jetzt) {
        if (akt!.length > 1) aus.push(akt!);
        akt = null;
      } else if (!imStrich && jetzt) akt = [q];
    }
  }
  if (akt && akt.length > 1) aus.push(akt);
  return aus;
}

/**
 * Spielfeldlinien wie in einer Sporthalle, maßstäblich zur Halle: Handballfeld (40 × 20 m, mit 1 m Rand) mittig längs der
 * langen Seite, in kleineren Hallen verkleinert; Mittellinie, Mittelkreis, Torräume (6 m), Freiwurflinien (9 m, gestrichelt)
 * und 7-m-Striche schwarz, ein Volleyballfeld (9 × 18 m) blau, die Dreierlinien des Basketballs rot. Zu kleine Hallen
 * (Feld unter 12 × 7 m) und freie Grundrisse, in die das Feld nicht ganz passt, bekommen keine Linien.
 */
export function spielfeldLinien(s: Pick<HallenSzene, "breite" | "laenge" | "umriss" | "aussehen">): SpielfeldLinie[] {
  if (!s.aussehen.linien) return [];
  const laengsX = s.breite >= s.laenge;
  const L = laengsX ? s.breite : s.laenge, B = laengsX ? s.laenge : s.breite;
  const RAND = 100;
  const fl = Math.min(4000, L - 2 * RAND), fb = Math.min(2000, B - 2 * RAND);
  if (fl < 1200 || fb < 700) return [];
  const k = Math.min(1, fl / 4000, fb / 2000);
  const u0 = (L - fl) / 2, v0 = (B - fb) / 2, uc = L / 2, vc = B / 2;
  const P = (p: { u: number; v: number }) => (laengsX ? { x: p.u, z: p.v } : { x: p.v, z: p.u });
  if (s.umriss) {
    const a = P({ u: u0, v: v0 }), b = P({ u: u0 + fl, v: v0 + fb });
    if (!rechteckImUmriss(a.x, a.z, b.x, b.z, s.umriss)) return [];
  }
  const aus: SpielfeldLinie[] = [];
  const linie = (art: SpielfeldLinie["art"], farbe: SpielfeldLinie["farbe"], p: { u: number; v: number }[]) => aus.push({ art, farbe, punkte: p.map(P) });
  const bogen = (cu: number, cv: number, r: number, a0: number, a1: number, f: (a: number) => { u: number; v: number }) => {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 15));
    return Array.from({ length: n + 1 }, (_, i) => f(a0 + ((a1 - a0) * i) / n)).map((p) => ({ u: cu + p.u, v: cv + p.v }));
  };
  linie("feld", "schwarz", [{ u: u0, v: v0 }, { u: u0 + fl, v: v0 }, { u: u0 + fl, v: v0 + fb }, { u: u0, v: v0 + fb }, { u: u0, v: v0 }]);
  linie("mittellinie", "schwarz", [{ u: uc, v: v0 }, { u: uc, v: v0 + fb }]);
  linie("mittelkreis", "schwarz", bogen(uc, vc, 180 * k, 0, 2 * Math.PI, (a) => ({ u: 180 * k * Math.cos(a), v: 180 * k * Math.sin(a) })));
  // Torraum und Freiwurflinie: Viertelkreise um die Torpfosten (3 m auseinander), dazwischen gerade.
  const tor = 150 * k;
  const torbogen = (ue: number, dir: number, r: number) => [
    ...bogen(ue, vc - tor, r, 0, Math.PI / 2, (a) => ({ u: dir * r * Math.sin(a), v: -r * Math.cos(a) })),
    ...bogen(ue, vc + tor, r, Math.PI / 2, Math.PI, (a) => ({ u: dir * r * Math.sin(a), v: -r * Math.cos(a) })),
  ];
  const enden = [
    [u0, 1],
    [u0 + fl, -1],
  ] as const;
  for (const [ue, dir] of enden) linie("torraum", "schwarz", torbogen(ue, dir, 600 * k));
  for (const [ue, dir] of enden) {
    const innen = torbogen(ue, dir, 900 * k).filter((p) => Math.abs(p.v - vc) <= fb / 2);
    for (const st of gestrichelt(innen, 15 * Math.max(k, 0.6), 15 * Math.max(k, 0.6))) linie("freiwurf", "schwarz", st);
    linie("siebenmeter", "schwarz", [{ u: ue + dir * 700 * k, v: vc - 50 * k }, { u: ue + dir * 700 * k, v: vc + 50 * k }]);
  }
  // Volleyball 9 × 18 m mit den Angriffslinien 3 m neben der Mittellinie.
  const vu = 900 * k, vv = 450 * k;
  linie("volleyball", "blau", [{ u: uc - vu, v: vc - vv }, { u: uc + vu, v: vc - vv }, { u: uc + vu, v: vc + vv }, { u: uc - vu, v: vc + vv }, { u: uc - vu, v: vc - vv }]);
  for (const d of [-300 * k, 300 * k]) linie("volleyball", "blau", [{ u: uc + d, v: vc - vv }, { u: uc + d, v: vc + vv }]);
  // Basketball: Dreierlinie (6,75 m um den Korb 1,575 m vor der Grundlinie, seitlich gerade bei 6,60 m).
  const r3 = 675 * k, s3 = 660 * k, grenz = Math.asin(660 / 675);
  for (const [ue, dir] of enden) {
    const korb = ue + dir * 157.5 * k;
    linie("basketball", "rot", [
      { u: ue, v: vc - s3 },
      ...bogen(korb, vc, r3, -grenz, grenz, (a) => ({ u: dir * r3 * Math.cos(a), v: r3 * Math.sin(a) })),
      { u: ue, v: vc + s3 },
    ]);
  }
  return aus;
}

/** Binder und Leuchten der Holzdecke (cm, Szene). */
export interface DeckenTeile {
  binder: Quader[];
  leuchten: Quader[];
}

/** Leimbinder 16 × 45 cm etwa alle 5,50 m; Leuchten 2,40 m lang, abgehängt. */
export const BINDER = { breite: 16, hoehe: 45, abstand: 550 };
const LEUCHTE = { laenge: 240, breite: 14, hoehe: 8 };

/** Strecken innerhalb des Grundrisses auf der Linie quer zur langen Seite (bei `laengsX` x = u, sonst z = u). */
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

/**
 * Holzdecke: Leimbinder quer zur langen Seite in gleichem Abstand, bündig unter der Decke; in jedem Feld dazwischen
 * Leuchtbänder parallel zu den Bindern, abgehängt (bei niedriger Halle knapp unter der Decke). Beim freien Grundriss nur
 * über der Halle.
 */
export function deckenTeile(s: { breite: number; laenge: number; wandHoehe: number; umriss?: Punkt[] }): DeckenTeile {
  const laengsX = s.breite >= s.laenge;
  const L = laengsX ? s.breite : s.laenge, B = laengsX ? s.laenge : s.breite;
  const Q = (u: number, v: number, du: number, dv: number, y: number, h: number): Quader => (laengsX ? { x: u, z: v, b: du, t: dv, y, h } : { x: v, z: u, b: dv, t: du, y, h });
  const strecken = (u: number): [number, number][] => (s.umriss ? innenStrecken(s.umriss, u, laengsX) : [[0, B]]);
  const felder = Math.max(2, Math.round(L / BINDER.abstand));
  const binder: Quader[] = [];
  for (let i = 1; i < felder; i++) {
    const u = (L * i) / felder;
    for (const [a, b] of strecken(u)) binder.push(Q(u - BINDER.breite / 2, a, BINDER.breite, b - a, s.wandHoehe - BINDER.hoehe, BINDER.hoehe));
  }
  const abhang = Math.min(70, Math.max(10, Math.round((s.wandHoehe - 300) * 0.3)));
  const y = s.wandHoehe - abhang - LEUCHTE.hoehe;
  const m = Math.max(1, Math.round(B / 600));
  const laenge = Math.min(LEUCHTE.laenge, B / m - 60);
  const leuchten: Quader[] = [];
  if (laenge > 60)
    for (let j = 0; j < felder; j++) {
      const u = (L * (j + 0.5)) / felder;
      for (let i = 0; i < m; i++) {
        const v = (B * (i + 0.5)) / m;
        const drin = !s.umriss || [v - laenge / 2, v + laenge / 2].every((w) => punktInUmriss(laengsX ? { x: u, y: w } : { x: w, y: u }, s.umriss!));
        if (drin) leuchten.push(Q(u - LEUCHTE.breite / 2, v - laenge / 2, LEUCHTE.breite, laenge, y, LEUCHTE.hoehe));
      }
    }
  return { binder, leuchten };
}
