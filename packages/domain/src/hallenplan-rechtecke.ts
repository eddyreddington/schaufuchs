/**
 * Hallenplan – Rechnen mit Rechtecken und Blickrichtungen: Drehen, Front einer Reihe oder eines Blocks, Streifen und Gang
 * vor den Käfigen, Etagenfelder, Käfigkanten, Überschneidung, Gang vor einem Eingang und Plätze in einem Käfigblock.
 */
import { istRechteckUmriss, tuerOeffnung, umrissNormal } from "./hallenplan-umriss";
import type { Blick, Drehung, Halle, HallenFlaeche, Rechteck, Reihe, Strecke } from "./hallenplan-typen";

/** Rechteck um den Punkt c in 90°-Schritten drehen (Hallenkoordinaten x/y). */
export function dreheRechteck(q: Rechteck, c: { x: number; y: number }, grad: Drehung | number): Rechteck {
  const g = ((grad % 360) + 360) % 360;
  if (g === 90) return { x: c.x - (q.y + q.h - c.y), y: c.y + (q.x - c.x), b: q.h, h: q.b };
  if (g === 180) return { x: 2 * c.x - (q.x + q.b), y: 2 * c.y - (q.y + q.h), b: q.b, h: q.h };
  if (g === 270) return { x: c.x + (q.y - c.y), y: c.y - (q.x + q.b - c.x), b: q.h, h: q.b };
  return q;
}

/** Richtung in 90°-Schritten drehen (wie `dreheRechteck`: 90° führt x in y über). */
export function dreheBlick(b: Blick, grad: Drehung | number): Blick {
  const folge: Blick[] = ["x+", "z+", "x-", "z-"];
  const g = ((((grad ?? 0) % 360) + 360) % 360) / 90;
  return folge[(folge.indexOf(b) + g) % 4]!;
}

/** Front der Käfige einer Reihe in der Halle (Reihensystem: „rechts“ = zu größerem x; bei Reihen quer ist das Hallen-y). */
export function frontDerReihe(r: { front: "links" | "rechts"; drehung?: Drehung }, quer: boolean, plattenDrehung: Drehung | number = 0): Blick {
  const roh: Blick = quer ? (r.front === "rechts" ? "z+" : "z-") : r.front === "rechts" ? "x+" : "x-";
  return dreheBlick(dreheBlick(roh, r.drehung ?? 0), plattenDrehung);
}

/** Streifen der Breite `tief` vor der Seite `blick` eines Rechtecks. */
export function streifenVor(q: Rechteck, blick: Blick, tief: number): Rechteck {
  if (blick === "x+") return { x: q.x + q.b, y: q.y, b: tief, h: q.h };
  if (blick === "x-") return { x: q.x - tief, y: q.y, b: tief, h: q.h };
  if (blick === "z+") return { x: q.x, y: q.y + q.h, b: q.b, h: tief };
  return { x: q.x, y: q.y - tief, b: q.b, h: tief };
}

/** Der Gang vor den Käfigen jeder Grundplatte (Gangbreite der Halle, in Richtung der Front) – dort steht kein Tisch und keine Bank. */
export function gangVorKaefigen(plan: { quer: boolean; reihen: Pick<Reihe, "nr" | "front" | "drehung" | "platten">[] }, gang: number): { name: string; rechteck: Rechteck }[] {
  return plan.reihen.flatMap((r) =>
    r.platten.flatMap((pl) => (pl.entfernt ? [] : [{ name: `Gang vor R${r.nr}`, rechteck: streifenVor(pl.rechteck, frontDerReihe(r, plan.quer, pl.drehung ?? 0), Math.max(0, gang)) }])),
  );
}

/**
 * Feld eines Käfigs im Plan, wenn Käfige übereinander stehen: die Grundfläche quer zur Front in so viele Streifen geteilt,
 * wie es Etagen gibt – die unterste vorn am Gang, darüber nach hinten. So stehen beide Nummern einer Spalte im Plan.
 */
export function etagenStreifen(q: Rechteck, etage: number, etagen: number, front: Blick): Rechteck {
  if (etagen <= 1) return q;
  const e = Math.min(etagen - 1, Math.max(0, etage));
  if (front === "x+" || front === "x-") {
    const d = q.b / etagen;
    return { x: front === "x+" ? q.x + q.b - (e + 1) * d : q.x + e * d, y: q.y, b: d, h: q.h };
  }
  const d = q.h / etagen;
  return { x: q.x, y: front === "z+" ? q.y + q.h - (e + 1) * d : q.y + e * d, b: q.b, h: d };
}

/** Richtung im gedrehten Koordinatensystem (x und y vertauscht: Reihensystem bei Reihen quer, Zeichnung der Halle quer). */
export const blickTausch = (b: Blick): Blick => ((b[0] === "x" ? "z" : "x") + b[1]) as Blick;

/**
 * Kanten eines Käfigs, einer Grundplatte oder eines Blocks mit Front `front`: die dichte Rückwand gegenüber der Front, die
 * beiden dichten Seitenwände und die offene Front (Gitter). Für die Zeichnung im Plan und im Druck.
 */
export function kaefigKanten(q: Rechteck, front: Blick): { rueck: Strecke; seiten: [Strecke, Strecke]; front: Strecke } {
  const x1 = q.x, y1 = q.y, x2 = q.x + q.b, y2 = q.y + q.h;
  const senk = (x: number): Strecke => ({ x1: x, y1, x2: x, y2 });
  const waag = (y: number): Strecke => ({ x1, y1: y, x2, y2: y });
  if (front === "x+") return { front: senk(x2), rueck: senk(x1), seiten: [waag(y1), waag(y2)] };
  if (front === "x-") return { front: senk(x1), rueck: senk(x2), seiten: [waag(y1), waag(y2)] };
  if (front === "z+") return { front: waag(y2), rueck: waag(y1), seiten: [senk(x1), senk(x2)] };
  return { front: waag(y1), rueck: waag(y2), seiten: [senk(x1), senk(x2)] };
}

/** Front eines eingesetzten Käfigblocks ohne eigene Angabe: zur langen Seite (ungedreht zu größerem y, gedreht zu größerem x). */
export const blockFront = (q: Rechteck): Blick => (q.b >= q.h ? "z+" : "x+");

/**
 * Front eines Käfigblocks: seine Angabe `front`, wenn sie zu einer langen Seite zeigt (ungedreht z±, gedreht x±), sonst wie
 * `blockFront`. Die Front ist offen (Gitter), Rück- und Seitenwände sind dicht.
 */
export function objektFront(o: { front?: Blick; rechteck: Rechteck }): Blick {
  const lang = o.rechteck.b >= o.rechteck.h;
  if (o.front && (lang ? o.front[0] === "z" : o.front[0] === "x")) return o.front;
  return blockFront(o.rechteck);
}

/** Mitte des umschließenden Rechtecks. */
export function mitteVon(q: Rechteck[]): { x: number; y: number } {
  if (!q.length) return { x: 0, y: 0 };
  const x1 = Math.min(...q.map((a) => a.x)), y1 = Math.min(...q.map((a) => a.y));
  const x2 = Math.max(...q.map((a) => a.x + a.b)), y2 = Math.max(...q.map((a) => a.y + a.h));
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/**
 * Überschneiden sich zwei Rechtecke? Berühren zählt nicht, ebenso eine Überlappung bis `spiel` cm (Rundung beim
 * Rechnen in Zentimetern). Eine Stelle für Plan-Warnungen, Entfernen und Volieren, damit alle dieselbe Lage gleich sehen.
 */
export function ueberlappt(a: Rechteck, c: Rechteck, spiel = 0.5): boolean {
  return a.x < c.x + c.b - spiel && c.x < a.x + a.b - spiel && a.y < c.y + c.h - spiel && c.y < a.y + a.h - spiel;
}

/**
 * Gang vor einem Eingang oder Notausgang (samt dem Ausgang selbst): in Fluchtrichtung, so breit wie der Ausgang und einen
 * Gang tief – seitlich daneben darf man bis an den Ausgang heran. In einer Ecke zählt die Wand, an der er flach anliegt.
 * Ein Eingang, der an keiner Wand liegt, behält einen Gang rundherum. Gilt in Hallen- wie im Reihensystem.
 */
export function eingangsGang(halle: Pick<Halle, "breite" | "laenge" | "gang" | "umriss">, f: Pick<HallenFlaeche, "x" | "y" | "breite" | "tiefe">): Rechteck {
  const g = Math.max(0, halle.gang);
  // Freier Grundriss (Entscheidung 019): die Wand, an der der Eingang liegt (auch eine Innenwand), wie bei der Türöffnung.
  if (!istRechteckUmriss(halle.umriss)) {
    const o = tuerOeffnung(umrissNormal(halle.umriss!), { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, 1);
    if (o) {
      if (o.y + o.h <= f.y + 0.5) return { x: f.x, y: f.y, b: f.breite, h: f.tiefe + g };
      if (o.y >= f.y + f.tiefe - 0.5) return { x: f.x, y: f.y - g, b: f.breite, h: f.tiefe + g };
      if (o.x + o.b <= f.x + 0.5) return { x: f.x, y: f.y, b: f.breite + g, h: f.tiefe };
      return { x: f.x - g, y: f.y, b: f.breite + g, h: f.tiefe };
    }
  }
  const waende = [
    f.x <= 1 && { quer: f.breite, q: { x: f.x, y: f.y, b: f.breite + g, h: f.tiefe } },
    f.x + f.breite >= halle.breite - 1 && { quer: f.breite, q: { x: f.x - g, y: f.y, b: f.breite + g, h: f.tiefe } },
    f.y <= 1 && { quer: f.tiefe, q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe + g } },
    f.y + f.tiefe >= halle.laenge - 1 && { quer: f.tiefe, q: { x: f.x, y: f.y - g, b: f.breite, h: f.tiefe + g } },
  ].filter((w): w is { quer: number; q: Rechteck } => !!w);
  const wand = waende.sort((a, b) => a.quer - b.quer)[0];
  return wand ? wand.q : { x: f.x - g, y: f.y - g, b: f.breite + 2 * g, h: f.tiefe + 2 * g };
}

/**
 * Lage eines Platzes in einem eingesetzten Käfigblock: die Plätze liegen entlang der langen Seite, je Spalte die Etagen
 * übereinander (gezählt unten zuerst). `plaetze`: alle Plätze (Spalten × Etagen).
 */
export function blockPlatz(q: Rechteck, plaetze: number, etagen: number, i: number): { rechteck: Rechteck; etage: number; breite: number; tiefe: number } {
  const lang = q.b >= q.h;
  const spalten = Math.max(1, Math.ceil(plaetze / Math.max(1, etagen)));
  const platz = (lang ? q.b : q.h) / spalten;
  const s = Math.floor(i / Math.max(1, etagen));
  return {
    rechteck: lang ? { x: q.x + s * platz, y: q.y, b: platz, h: q.h } : { x: q.x, y: q.y + s * platz, b: q.b, h: platz },
    etage: i % Math.max(1, etagen),
    breite: platz,
    tiefe: lang ? q.h : q.b,
  };
}
