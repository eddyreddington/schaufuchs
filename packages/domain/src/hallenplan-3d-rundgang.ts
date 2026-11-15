/**
 * Automatischer Rundgang durch die Halle (3D): die Gänge zwischen den Reihen in Schlangenlinie, in Augenhöhe. Ein Gang ist
 * jede begehbare Lücke zwischen zwei Reihen bzw. zwischen Reihe und Wand, zu der mindestens eine Käfigfront zeigt. Am
 * Reihenende geht es in den nächsten Gang; steht die Reihe dort bündig an der Wand, hebt sich der Blick kurz darüber.
 * Rein (ohne three.js); die 3D-Ansicht fährt die Punkte als Kurve ab.
 */
import type { Halle, Hallenplan } from "./hallenplan";

/** Augenhöhe beim Rundgang (cm) und Höhe über einem Reihenende. */
export const RUNDGANG_HOEHE = 160;
export const RUNDGANG_UEBER = 300;
/** Schmalere Lücken sind kein Gang (cm). */
const MIN_GANG = 60;
/** Abstand vom Reihenende bzw. von der Wand (cm). */
const VORLAUF = 120;

export interface RundgangPunkt {
  x: number;
  y: number;
  z: number;
}

/**
 * Wegpunkte des Rundgangs in Szene-Koordinaten (cm; x entlang der Breite, z entlang der Länge, y Höhe), vor dem Drehen
 * der Szene. Leer, wenn es keinen Gang mit Käfigen gibt.
 */
export function rundgang(halle: Pick<Halle, "breite" | "laenge">, plan: Pick<Hallenplan, "reihen" | "quer">): RundgangPunkt[] {
  const quer = plan.quer;
  // Reihensystem: q quer zu den Reihen, l entlang der Reihen.
  const laenge = quer ? halle.breite : halle.laenge, breite = quer ? halle.laenge : halle.breite;
  const reihen = [...plan.reihen].filter((r) => r.abschnitte.length).sort((a, b) => a.x - b.x);
  if (!reihen.length) return [];
  type Gang = { q: number; von: number; bis: number };
  const gaenge: Gang[] = [];
  const ausdehnung = (rs: typeof reihen) => ({ von: Math.min(...rs.map((r) => r.abschnitte[0]!.von)), bis: Math.max(...rs.map((r) => r.abschnitte.at(-1)!.bis)) });
  const erste = reihen[0]!, letzte = reihen.at(-1)!;
  // Vor der ersten Reihe (an der Wand), zwischen den Reihen, hinter der letzten.
  if (erste.front === "links" && erste.x >= MIN_GANG) gaenge.push({ q: erste.x / 2, ...ausdehnung([erste]) });
  for (let i = 0; i + 1 < reihen.length; i++) {
    const a = reihen[i]!, b = reihen[i + 1]!;
    const luecke = b.x - (a.x + a.tiefe);
    if (luecke >= MIN_GANG && (a.front === "rechts" || b.front === "links")) gaenge.push({ q: a.x + a.tiefe + luecke / 2, ...ausdehnung([a, b]) });
  }
  const hinten = breite - (letzte.x + letzte.tiefe);
  if (letzte.front === "rechts" && hinten >= MIN_GANG) gaenge.push({ q: letzte.x + letzte.tiefe + hinten / 2, ...ausdehnung([letzte]) });
  if (!gaenge.length) return [];

  const punkt = (q: number, l: number, y: number): RundgangPunkt => (quer ? { x: l, y, z: q } : { x: q, y, z: l });
  const anfang = (g: Gang) => Math.max(60, g.von - VORLAUF), ende = (g: Gang) => Math.min(laenge - 60, g.bis + VORLAUF);
  const aus: RundgangPunkt[] = [];
  gaenge.forEach((g, k) => {
    const vor = k % 2 === 0;
    const start = vor ? anfang(g) : ende(g), ziel = vor ? ende(g) : anfang(g);
    if (k > 0) {
      // Übergang vom letzten Gang: am Reihenende quer hinüber; steht dort eine Reihe bis an die Wand, darüber hinweg.
      const vorher = aus.at(-1)!;
      const dazwischen = reihen.filter((r) => r.x > Math.min(gaenge[k - 1]!.q, g.q) && r.x < Math.max(gaenge[k - 1]!.q, g.q));
      const l = quer ? vorher.x : vorher.z;
      const frei = dazwischen.every((r) => (vor ? r.abschnitte[0]!.von - l >= MIN_GANG / 2 : l - r.abschnitte.at(-1)!.bis >= MIN_GANG / 2));
      if (!frei) aus.push(punkt((gaenge[k - 1]!.q + g.q) / 2, l, RUNDGANG_UEBER));
    }
    aus.push(punkt(g.q, start, RUNDGANG_HOEHE), punkt(g.q, ziel, RUNDGANG_HOEHE));
  });
  return aus;
}
