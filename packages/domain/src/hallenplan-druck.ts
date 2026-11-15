/**
 * Hallenplan drucken und zeichnen: gemeinsame Regeln für Bildschirm und PDF – Farben der Preisrichter in der Folge der
 * Katalognummern, Lage der Zeichnung (lange Seite waagrecht) und der Maßstab, mit dem der Plan ein Blatt füllt. Reine
 * Rechnung ohne Datenbank.
 */
import type { Hallenplan, Rechteck } from "./hallenplan";

/**
 * Preisrichter: geprüfte Kategorien-Palette in fester Reihenfolge nach Katalognummern – Nachbarn im Katalog bekommen
 * Nachbarfarben. Ab der 5. Farbe zusätzlich schraffiert (siehe `richterSchraffur`).
 */
export const RICHTER_FARBE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const richterFarbe = (i: number): string => RICHTER_FARBE[i % RICHTER_FARBE.length]!;
/** Schraffiert, damit einzelne Paare (Rot/Orange, Grün/Orange) auch bei Farbschwäche und im Schwarzweiß-Druck zu unterscheiden sind. */
export const richterSchraffur = (i: number): boolean => (i % RICHTER_FARBE.length >= 4) !== (i >= RICHTER_FARBE.length);

/**
 * Preisrichter in der Folge ihrer kleinsten Katalognummer im Plan (gleich: nach Namen). Der Platz in dieser Folge ist der
 * Index für `richterFarbe` – so tragen Bildschirm und Druck dieselben Farben.
 */
export function richterFolge<R extends { id: number; name: string }>(plan: Pick<Hallenplan, "reihen" | "volieren" | "objekte">, richter: R[]): R[] {
  const ersteNr = new Map<number, number>();
  const tiere = [...plan.reihen.flatMap((r) => r.kaefige), ...plan.volieren, ...plan.objekte.flatMap((o) => [...(o.tier ? [o.tier] : []), ...(o.kaefige ?? [])])];
  for (const k of tiere) {
    if (k.preisrichterId == null || !k.nr) continue;
    const n = Number.parseInt(k.nr, 10);
    if (Number.isNaN(n)) continue;
    if (!ersteNr.has(k.preisrichterId) || n < ersteNr.get(k.preisrichterId)!) ersteNr.set(k.preisrichterId, n);
  }
  return [...richter].sort((a, b) => (ersteNr.get(a.id) ?? Infinity) - (ersteNr.get(b.id) ?? Infinity) || a.name.localeCompare(b.name, "de"));
}

/**
 * Zeichnung der Halle: die lange Seite waagrecht (ist die Halle länger als breit, liegt sie quer). `W`/`H`: Breite und
 * Höhe der Zeichnung in cm; `zuZeichnung` rechnet ein Rechteck aus Hallenkoordinaten um.
 */
export function zeichnungDerHalle(halle: { breite: number; laenge: number }) {
  const quer = halle.laenge > halle.breite;
  return {
    quer,
    W: quer ? halle.laenge : halle.breite,
    H: quer ? halle.breite : halle.laenge,
    zuZeichnung: (q: Rechteck): Rechteck => (quer ? { x: q.y, y: q.x, b: q.h, h: q.b } : q),
  };
}

/**
 * Blatt für den Plan: Querformat, wenn die Zeichnung breiter als hoch ist, sonst Hochformat; der Maßstab (Punkte je cm)
 * so groß, dass die Zeichnung samt Rand `rand` (cm, für Beschriftungen vor der Wand) ganz in die Fläche passt – nie
 * abgeschnitten, auch nicht bei großen Hallen.
 */
export function druckMassstab(zeichnung: { W: number; H: number }, flaeche: { b: number; h: number }, rand = 0): number {
  const w = zeichnung.W + 2 * rand, h = zeichnung.H + 2 * rand;
  if (w <= 0 || h <= 0) return 1;
  return Math.min(flaeche.b / w, flaeche.h / h);
}

/** Lage einer Reihenbezeichnung „R…“ am Rand der Zeichnung: über der oberen Wand (Reihe senkrecht) oder links davor. */
export interface Schild {
  nr: number;
  seite: "oben" | "links";
  /** Mitte der Bezeichnung entlang des Randes (x bei „oben“, y bei „links“), in Zeichnungskoordinaten. */
  mitte: number;
}

/**
 * Wo die Reihenbezeichnungen stehen – im Plan wie im Druck. `platten`: die Grundplatten jeder Reihe, wie sie gezeichnet sind
 * (samt von Hand verschobenen und gedrehten, im Editor auch während des Ziehens), in Zeichnungskoordinaten. Die Bezeichnung
 * steht beim größten zusammenhängenden Stück der Reihe (liegen ihre Platten verstreut), über der Wand, wenn das Stück in der
 * Zeichnung senkrecht steht, sonst links davor. Bezeichnungen am selben Rand rücken so weit auseinander, dass sie sich nie
 * überlappen (`abstand`: Mindestabstand ihrer Mitten), in ihrer Reihenfolge und innerhalb von `rahmen`.
 */
export function reihenSchilder(reihen: { nr: number; platten: Rechteck[] }[], rahmen: Rechteck, abstand: { oben: number; links: number }): Schild[] {
  const SPIEL = 5;
  const beruehrt = (a: Rechteck, b: Rechteck) => a.x <= b.x + b.b + SPIEL && b.x <= a.x + a.b + SPIEL && a.y <= b.y + b.h + SPIEL && b.y <= a.y + a.h + SPIEL;
  const roh: Schild[] = [];
  for (const r of reihen) {
    if (!r.platten.length) continue;
    // Zusammenhängende Stücke (Platten, die sich berühren).
    const gruppe = r.platten.map((_, i) => i);
    const wurzel = (i: number): number => (gruppe[i] === i ? i : (gruppe[i] = wurzel(gruppe[i]!)));
    for (let i = 0; i < r.platten.length; i++) for (let j = i + 1; j < r.platten.length; j++) if (beruehrt(r.platten[i]!, r.platten[j]!)) gruppe[wurzel(i)] = wurzel(j);
    const stuecke = new Map<number, Rechteck[]>();
    r.platten.forEach((q, i) => stuecke.set(wurzel(i), [...(stuecke.get(wurzel(i)) ?? []), q]));
    const flaeche = (qs: Rechteck[]) => qs.reduce((n, q) => n + q.b * q.h, 0);
    // Größtes Stück; bei Gleichstand das erste (Anfang der Reihe).
    const groesstes = [...stuecke.values()].reduce((a, b) => (flaeche(b) > flaeche(a) + 0.5 ? b : a));
    const x1 = Math.min(...groesstes.map((q) => q.x)), y1 = Math.min(...groesstes.map((q) => q.y));
    const x2 = Math.max(...groesstes.map((q) => q.x + q.b)), y2 = Math.max(...groesstes.map((q) => q.y + q.h));
    const senkrecht = y2 - y1 >= x2 - x1;
    roh.push({ nr: r.nr, seite: senkrecht ? "oben" : "links", mitte: senkrecht ? (x1 + x2) / 2 : (y1 + y2) / 2 });
  }
  // Je Rand: der Reihe nach auseinanderrücken, dann vom Ende her in den Rahmen zurück.
  for (const seite of ["oben", "links"] as const) {
    const d = abstand[seite];
    const [von, bis] = seite === "oben" ? [rahmen.x, rahmen.x + rahmen.b] : [rahmen.y, rahmen.y + rahmen.h];
    const liste = roh.filter((s) => s.seite === seite).sort((a, b) => a.mitte - b.mitte || a.nr - b.nr);
    for (let i = 0; i < liste.length; i++) liste[i]!.mitte = Math.max(liste[i]!.mitte, i ? liste[i - 1]!.mitte + d : von);
    for (let i = liste.length - 1; i >= 0; i--) liste[i]!.mitte = Math.min(liste[i]!.mitte, i < liste.length - 1 ? liste[i + 1]!.mitte - d : bis);
  }
  return roh;
}
