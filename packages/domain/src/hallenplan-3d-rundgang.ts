/**
 * Automatischer Rundgang durch die Halle (3D): die Gänge zwischen den Reihen in Schlangenlinie, immer in Augenhöhe und mit
 * Abstand zu allem (Hinderniskarte und Wegsucher aus hallenplan-3d-wege.ts). Ein Gang ist jede Lücke zwischen zwei Reihen
 * bzw. zwischen Reihe und Wand, zu der mindestens eine Käfigfront zeigt. Von Gang zu Gang führt der kürzeste freie Weg; ist
 * ein Gang eine Sackgasse, geht es darin zurück. Ein Gang, der nicht zu erreichen ist, fällt weg – nie geht es über eine
 * Reihe oder durch einen Käfig. Rein (ohne three.js); die 3D-Ansicht fährt die Punkte gerade von Punkt zu Punkt ab.
 */
import type { Hallenplan } from "./hallenplan";
import { abkuerzen, hinderniskarte, rasterVon, runden, type Stelle, streckeFrei, suche, type WegSzene, zellMitte } from "./hallenplan-3d-wege";

/** Augenhöhe beim Rundgang (cm), überall gleich. */
export const RUNDGANG_HOEHE = 160;
/** Schmalere Lücken sind kein Gang (cm). */
const MIN_GANG = 60;
/** Abstand vom Reihenende bzw. von der Wand (cm). */
const VORLAUF = 120;

export interface RundgangPunkt {
  x: number;
  y: number;
  z: number;
}

interface Gang {
  q: number;
  von: number;
  bis: number;
}

/** Gänge im Reihensystem (q quer zu den Reihen, l entlang), nach q geordnet. */
function gaengeVon(plan: Pick<Hallenplan, "reihen" | "quer">, breite: number, laenge: number): Gang[] {
  const reihen = [...plan.reihen].filter((r) => r.abschnitte.length).sort((a, b) => a.x - b.x);
  if (!reihen.length) return [];
  const gaenge: Gang[] = [];
  const ausdehnung = (rs: typeof reihen) => ({
    von: Math.max(60, Math.min(...rs.map((r) => r.abschnitte[0]!.von)) - VORLAUF),
    bis: Math.min(laenge - 60, Math.max(...rs.map((r) => r.abschnitte.at(-1)!.bis)) + VORLAUF),
  });
  const erste = reihen[0]!, letzte = reihen.at(-1)!;
  if (erste.front === "links" && erste.x >= MIN_GANG) gaenge.push({ q: erste.x / 2, ...ausdehnung([erste]) });
  for (let i = 0; i + 1 < reihen.length; i++) {
    const a = reihen[i]!, b = reihen[i + 1]!;
    const luecke = b.x - (a.x + a.tiefe);
    if (luecke >= MIN_GANG && (a.front === "rechts" || b.front === "links")) gaenge.push({ q: a.x + a.tiefe + luecke / 2, ...ausdehnung([a, b]) });
  }
  const hinten = breite - (letzte.x + letzte.tiefe);
  if (letzte.front === "rechts" && hinten >= MIN_GANG) gaenge.push({ q: letzte.x + letzte.tiefe + hinten / 2, ...ausdehnung([letzte]) });
  return gaenge;
}

/**
 * Wegpunkte des Rundgangs in Szene-Koordinaten (cm; x entlang der Breite, z entlang der Länge, y Augenhöhe), vor dem
 * Vertauschen der Achsen (`vertauscht`). Je zwei aufeinanderfolgende Punkte liegen dicht beieinander, die Strecke dazwischen
 * ist frei. Leer, wenn es keinen erreichbaren Gang mit Käfigen gibt.
 */
export function rundgang(s: WegSzene, plan: Pick<Hallenplan, "reihen" | "quer">): RundgangPunkt[] {
  const quer = plan.quer;
  const laenge = quer ? s.breite : s.laenge, breite = quer ? s.laenge : s.breite;
  const gaenge = gaengeVon(plan, breite, laenge);
  if (!gaenge.length) return [];
  const k = hinderniskarte(s);
  const r = rasterVon(k);
  const stelle = (q: number, l: number): Stelle => (quer ? { x: l, z: q } : { x: q, z: l });

  // Je Gang die freien Zellen auf seiner Mittellinie, nach Bereichen.
  const linien = gaenge.map((g) => {
    const zellen: number[] = [];
    for (let l = g.von; l <= g.bis; l += r.g / 2) {
      const p = stelle(g.q, l);
      const i = Math.floor(p.x / r.g), j = Math.floor(p.z / r.g);
      const c = j * r.nx + i;
      if (i >= 0 && j >= 0 && i < r.nx && j < r.nz && r.frei[c] && zellen.at(-1) !== c) zellen.push(c);
    }
    return zellen;
  });
  // Rundgang im Bereich, in dem die meisten Gänge liegen.
  const zahl = new Map<number, number>();
  for (const z of linien) for (const t of new Set(z.map((c) => r.teil[c]!))) zahl.set(t, (zahl.get(t) ?? 0) + 1);
  const bereich = [...zahl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (bereich == null) return [];

  // Stücke zwischen Pflichtpunkten (Enden der freien Strecken eines Gangs) – jedes für sich abgekürzt, damit keine
  // Sackgasse übersprungen wird. Steht etwas im Gang (Sperrfläche, Block), wird er in Strecken davor und dahinter geteilt.
  const stuecke: Stelle[][] = [];
  const mitten = (zellen: number[]) => zellen.map((c) => zellMitte(r, c));
  const nah = (a: number, b: number) => Math.abs((a % r.nx) - (b % r.nx)) <= 1 && Math.abs(Math.floor(a / r.nx) - Math.floor(b / r.nx)) <= 1;
  let hier = -1;
  for (const z of linien) {
    const strecken: [number, number][] = [];
    let vorher = -1;
    for (const c of z) {
      if (r.teil[c] !== bereich) continue;
      if (vorher >= 0 && nah(vorher, c)) strecken.at(-1)![1] = c;
      else strecken.push([c, c]);
      vorher = c;
    }
    const lang = strecken.filter(([a, b]) => Math.hypot(zellMitte(r, a).x - zellMitte(r, b).x, zellMitte(r, a).z - zellMitte(r, b).z) >= 100);
    if (!lang.length) continue;
    // Hinein vom näheren Ende (Weglänge), dann Strecke für Strecke.
    if (hier >= 0) {
      const a = lang[0]![0], b = lang.at(-1)![1];
      const zuA = suche(k, hier, a), zuB = suche(k, hier, b, zuA?.laenge ?? Infinity);
      if (zuB && (!zuA || zuB.laenge < zuA.laenge)) lang.reverse().forEach((st) => st.reverse());
    }
    for (const [anfang, ende] of lang) {
      if (hier >= 0) {
        const hin = suche(k, hier, anfang);
        if (!hin) continue;
        stuecke.push(mitten(hin.zellen));
      }
      const pa = zellMitte(r, anfang), pe = zellMitte(r, ende);
      stuecke.push(streckeFrei(k, pa, pe) ? [pa, pe] : mitten(suche(k, anfang, ende)?.zellen ?? [anfang]));
      hier = ende;
    }
  }
  const zug: Stelle[] = [];
  for (const st of stuecke) for (const p of abkuerzen(k, st)) if (!zug.length || zug.at(-1)!.x !== p.x || zug.at(-1)!.z !== p.z) zug.push(p);
  return runden(k, zug).map((p) => ({ x: p.x, y: RUNDGANG_HOEHE, z: p.z }));
}
