/**
 * Freier Grundriss der Halle (Entscheidung 019): ein rechtwinkliges Vieleck in Hallenkoordinaten (cm, x nach rechts entlang
 * der Breite, y nach unten entlang der Länge). Die Planung bleibt dieselbe: was außerhalb liegt, wird zu Sperrflächen
 * (`umrissSperren`). Bearbeitet wird der Grundriss nur über `wandZiehen` und `wandTeilen` – so bleibt er rechtwinklig.
 *
 * Reihenfolge der Ecken: im Uhrzeigersinn, wie man auf den Plan schaut (oben links → oben rechts → unten), siehe
 * `umrissNormal`. Dann liegt das Innere jeder Kante rechts von ihr in Laufrichtung.
 */
import type { HallenFlaeche, Rechteck } from "./hallenplan";

export interface Punkt {
  x: number;
  y: number;
}

/** Seite, nach der eine Wand außen zeigt (wie man auf den Plan schaut). */
export type WandAussen = "oben" | "unten" | "links" | "rechts";

export interface UmrissKante {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  aussen: WandAussen;
}

/** Mindestmaß des Grundrisses (cm), wie bei der rechteckigen Halle. */
export const UMRISS_MIN = 300;

export function rechteckUmriss(breite: number, laenge: number): Punkt[] {
  return [
    { x: 0, y: 0 },
    { x: breite, y: 0 },
    { x: breite, y: laenge },
    { x: 0, y: laenge },
  ];
}

/** Umriss einer Halle: der gezeichnete oder das Rechteck aus Breite und Länge. */
export function umrissVon(halle: { breite: number; laenge: number; umriss?: Punkt[] | null }): Punkt[] {
  return halle.umriss && halle.umriss.length >= 4 ? halle.umriss : rechteckUmriss(halle.breite, halle.laenge);
}

/** Vorzeichenbehaftete Fläche (positiv im Uhrzeigersinn auf dem Plan, y nach unten). */
function flaecheMitVorzeichen(u: Punkt[]): number {
  let s = 0;
  for (let i = 0; i < u.length; i++) {
    const a = u[i]!, b = u[(i + 1) % u.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Umlaufsinn: 1 im Uhrzeigersinn auf dem Plan, −1 dagegen (eine über die Gegenwand gezogene Wand kehrt ihn um). */
export function umlaufsinn(u: Punkt[]): 1 | -1 {
  return flaecheMitVorzeichen(u) >= 0 ? 1 : -1;
}

/** Kürzeste erlaubte Wand (cm): sonst entstünden Hallenarme, in denen nichts stehen kann. */
export const WAND_MIN = 50;

export function umrissFlaeche(u: Punkt[]): number {
  return Math.abs(flaecheMitVorzeichen(u));
}

export function umrissMasse(u: Punkt[]): { breite: number; laenge: number } {
  return { breite: Math.max(...u.map((p) => p.x)) - Math.min(...u.map((p) => p.x)), laenge: Math.max(...u.map((p) => p.y)) - Math.min(...u.map((p) => p.y)) };
}

/**
 * Einheitliche Form: links oben bei 0/0, im Uhrzeigersinn, ohne doppelte Ecken und ohne Ecken mitten auf einer geraden
 * Wand, Beginn an der obersten, davon linken Ecke. Zwei gleiche Grundrisse sind danach auch gleich geschrieben.
 */
export function umrissNormal(eingabe: Punkt[]): Punkt[] {
  const mx = Math.min(...eingabe.map((p) => p.x)), my = Math.min(...eingabe.map((p) => p.y));
  let u = eingabe.map((p) => ({ x: p.x - mx, y: p.y - my }));
  if (flaecheMitVorzeichen(u) < 0) u = u.reverse();
  // Doppelte und gerade durchlaufende Ecken entfernen, bis sich nichts mehr ändert.
  for (let geaendert = true; geaendert && u.length > 3; ) {
    geaendert = false;
    for (let i = 0; i < u.length; i++) {
      const a = u[(i - 1 + u.length) % u.length]!, b = u[i]!, c = u[(i + 1) % u.length]!;
      const doppelt = a.x === b.x && a.y === b.y;
      const gerade = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (doppelt || gerade) {
        u.splice(i, 1);
        geaendert = true;
        break;
      }
    }
  }
  const start = u.reduce((best, p, i) => (p.y < u[best]!.y || (p.y === u[best]!.y && p.x < u[best]!.x) ? i : best), 0);
  return [...u.slice(start), ...u.slice(0, start)];
}

const kante = (u: Punkt[], i: number) => [u[i]!, u[(i + 1) % u.length]!] as const;

/** Schneiden oder berühren sich zwei achsparallele Strecken? */
function treffen(a: readonly [Punkt, Punkt], b: readonly [Punkt, Punkt]): boolean {
  const ax1 = Math.min(a[0].x, a[1].x), ax2 = Math.max(a[0].x, a[1].x), ay1 = Math.min(a[0].y, a[1].y), ay2 = Math.max(a[0].y, a[1].y);
  const bx1 = Math.min(b[0].x, b[1].x), bx2 = Math.max(b[0].x, b[1].x), by1 = Math.min(b[0].y, b[1].y), by2 = Math.max(b[0].y, b[1].y);
  return ax1 <= bx2 && bx1 <= ax2 && ay1 <= by2 && by1 <= ay2;
}

/** Ist der Grundriss gültig? Null = ja, sonst der Grund. */
export function pruefeUmriss(u: Punkt[]): string | null {
  if (u.length < 3) return "Der Grundriss braucht mindestens 4 Ecken.";
  for (let i = 0; i < u.length; i++) {
    const [a, b] = kante(u, i);
    if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y)) return "Der Grundriss muss rechtwinklig sein: jede Wand waagrecht oder senkrecht.";
  }
  if (u.length < 4) return "Der Grundriss braucht mindestens 4 Ecken.";
  for (let i = 0; i < u.length; i++)
    for (let j = i + 2; j < u.length; j++) {
      if (i === 0 && j === u.length - 1) continue; // Nachbarn über den Anfang
      if (treffen(kante(u, i), kante(u, j))) return "Zwei Wände überschneiden sich – der Grundriss muss eine geschlossene Fläche sein.";
    }
  const m = umrissMasse(u);
  if (m.breite < UMRISS_MIN || m.laenge < UMRISS_MIN) return "Die Halle muss mindestens 3 × 3 m groß sein.";
  // Länge gerechnet ohne Teilungspunkte (eine geteilte Wand ist eine Wand).
  if (umrissKanten(umrissNormal(u)).some((k) => Math.abs(k.x2 - k.x1) + Math.abs(k.y2 - k.y1) < WAND_MIN)) return "Jede Wand muss mindestens 0,5 m lang sein.";
  return null;
}

/** Liegt der Punkt in der Halle? (Strahlverfahren; auf der Wand nicht eindeutig.) */
export function punktInUmriss(p: Punkt, u: Punkt[]): boolean {
  let innen = false;
  for (let i = 0, j = u.length - 1; i < u.length; j = i++) {
    const a = u[i]!, b = u[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) innen = !innen;
  }
  return innen;
}

/**
 * Was im umschließenden Rechteck außerhalb der Halle liegt, als möglichst wenige Rechtecke (Zeilen zusammengefasst, dann
 * gleich breite Stücke untereinander). Für die Planung sind das Sperrflächen: dort steht nie ein Käfig.
 */
export function umrissSperren(u: Punkt[]): Rechteck[] {
  const xs = [...new Set(u.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(u.map((p) => p.y))].sort((a, b) => a - b);
  const zeilen: Rechteck[][] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    const zeile: Rechteck[] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const mitte = { x: (xs[i]! + xs[i + 1]!) / 2, y: (ys[j]! + ys[j + 1]!) / 2 };
      if (punktInUmriss(mitte, u)) continue;
      const letzte = zeile.at(-1);
      if (letzte && letzte.x + letzte.b === xs[i]) letzte.b = xs[i + 1]! - letzte.x;
      else zeile.push({ x: xs[i]!, y: ys[j]!, b: xs[i + 1]! - xs[i]!, h: ys[j + 1]! - ys[j]! });
    }
    zeilen.push(zeile);
  }
  const fertig: Rechteck[] = [];
  let offen: Rechteck[] = [];
  for (const zeile of zeilen) {
    const weiter: Rechteck[] = [];
    for (const q of zeile) {
      const oben = offen.find((o) => o.x === q.x && o.b === q.b && o.y + o.h === q.y);
      if (oben) {
        oben.h += q.h;
        weiter.push(oben);
      } else weiter.push(q);
    }
    fertig.push(...offen.filter((o) => !weiter.includes(o)));
    offen = weiter;
  }
  fertig.push(...offen);
  return fertig.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Wände des Grundrisses mit ihrer Außenseite (für Zeichnung, 3D und Türen). */
export function umrissKanten(u: Punkt[]): UmrissKante[] {
  const vz = flaecheMitVorzeichen(u) >= 0 ? 1 : -1;
  return u.map((_, i) => {
    const [a, b] = kante(u, i);
    const dx = Math.sign(b.x - a.x) * vz, dy = Math.sign(b.y - a.y) * vz;
    // Außen liegt links der Laufrichtung (im Uhrzeigersinn auf dem Plan).
    const aussen: WandAussen = dx > 0 ? "oben" : dx < 0 ? "unten" : dy > 0 ? "rechts" : "links";
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, aussen };
  });
}

/**
 * Wand `i` (von Ecke i zu Ecke i+1) senkrecht verschieben: positiv nach innen, negativ nach außen. Liegt die Nachbarwand in
 * derselben Flucht (nach `wandTeilen`), entsteht dort eine neue Querwand; steht sie quer, wandert ihr Ende mit. So bleibt
 * der Grundriss rechtwinklig. Danach `umrissNormal` (entfernt, was dabei überflüssig wird) und `pruefeUmriss`.
 */
export function wandZiehen(u: Punkt[], i: number, d: number): Punkt[] {
  const vz = flaecheMitVorzeichen(u) >= 0 ? 1 : -1;
  const n = u.length;
  const [a, b] = kante(u, i);
  const rx = Math.sign(b.x - a.x), ry = Math.sign(b.y - a.y);
  const nach = { x: -ry * vz * d, y: rx * vz * d }; // nach innen: rechts der Laufrichtung
  const vor = u[(i - 1 + n) % n]!, nach2 = u[(i + 2) % n]!;
  const inFlucht = (p: Punkt, q: Punkt) => (rx !== 0 ? p.y === q.y : p.x === q.x);
  const neuA = { x: a.x + nach.x, y: a.y + nach.y }, neuB = { x: b.x + nach.x, y: b.y + nach.y };
  const ergebnis: Punkt[] = [];
  for (let k = 0; k < n; k++) {
    if (k === i) {
      if (inFlucht(vor, a)) ergebnis.push({ ...a });
      ergebnis.push(neuA);
    } else if (k === (i + 1) % n) {
      ergebnis.push(neuB);
      if (inFlucht(b, nach2)) ergebnis.push({ ...b });
    } else ergebnis.push({ ...u[k]! });
  }
  // Bei i = n − 1 steht Ecke i + 1 = 0 vorn: die Reihenfolge stimmt trotzdem (Ring).
  return ergebnis;
}

/** Ist der Grundriss ein einfaches Rechteck (oder keiner)? Dann gilt die Halle wie bisher. */
export function istRechteckUmriss(u?: Punkt[] | null): boolean {
  if (!u || u.length === 0) return true;
  return u.length >= 4 && pruefeUmriss(u) === null && umrissNormal(u).length === 4;
}

/** Name der Sperrflächen außerhalb des Grundrisses (in Meldungen beim Verschieben). */
export const AUSSEN_NAME = "Hallenwand";

/**
 * Halle für die Planung: dazu die Sperrflächen außerhalb des Grundrisses (markiert mit `aussen`, nie gespeichert). Doppelt
 * angewandt ändert nichts; bei rechteckigem Grundriss bleibt die Halle, wie sie ist.
 */
export function mitUmrissSperren<T extends { umriss?: Punkt[] | null; flaechen: HallenFlaeche[] }>(halle: T): T {
  const eigene = halle.flaechen.filter((f) => !f.aussen);
  if (istRechteckUmriss(halle.umriss)) return eigene.length === halle.flaechen.length ? halle : { ...halle, flaechen: eigene };
  const sperren: HallenFlaeche[] = umrissSperren(umrissNormal(halle.umriss!)).map((q) => ({ name: AUSSEN_NAME, art: "sperre", x: q.x, y: q.y, breite: q.b, tiefe: q.h, aussen: true }));
  return { ...halle, flaechen: [...eigene, ...sperren] };
}

/** Wand `i` an der Stelle `bei` teilen (x bei waagrechter, y bei senkrechter Wand); ein Teilstück lässt sich dann ziehen. */
export function wandTeilen(u: Punkt[], i: number, bei: number): Punkt[] {
  const [a, b] = kante(u, i);
  const waagrecht = a.y === b.y;
  const lo = waagrecht ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = waagrecht ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  if (bei <= lo || bei >= hi) return u;
  const p = waagrecht ? { x: bei, y: a.y } : { x: a.x, y: bei };
  return [...u.slice(0, i + 1), p, ...u.slice(i + 1)];
}

/**
 * Umriss um `d` nach außen versetzt (Außenkante der Wand bei Wanddicke `d`). Rechtwinklig: jede Ecke nimmt die versetzte
 * Lage ihrer waagrechten und ihrer senkrechten Wand – an inneren wie äußeren Ecken ohne Lücke und ohne Überstand.
 */
export function umrissVersetzt(u: Punkt[], d: number): Punkt[] {
  const k = umrissKanten(u);
  return u.map((p, i) => {
    const vor = k[(i - 1 + k.length) % k.length]!, nach = k[i]!;
    const waag = vor.y1 === vor.y2 ? vor : nach, senk = vor.x1 === vor.x2 ? vor : nach;
    return { x: p.x + (senk.aussen === "links" ? -d : d), y: p.y + (waag.aussen === "oben" ? -d : d) };
  });
}

/**
 * Öffnung in der Wand für einen Eingang `f` (Rechteck in der Halle, an einer Wand anliegend, `spiel` cm Toleranz): das
 * Stück der Wand vor dem Eingang, `wand` cm dick nach außen. Liegt er an zwei Wänden (Ecke), die entlang seiner langen
 * Seite. Null, wenn er an keiner Wand liegt.
 */
export function tuerOeffnung(u: Punkt[], f: Rechteck, wand: number, spiel = 10): Rechteck | null {
  const kandidaten: { q: Rechteck; laengs: boolean }[] = [];
  for (const k of umrissKanten(u)) {
    if (k.y1 === k.y2) {
      const a = Math.max(f.x, Math.min(k.x1, k.x2)), b = Math.min(f.x + f.b, Math.max(k.x1, k.x2));
      const kante = k.aussen === "oben" ? f.y : f.y + f.h;
      if (b > a && Math.abs(kante - k.y1) <= spiel) kandidaten.push({ q: { x: a, y: k.aussen === "oben" ? k.y1 - wand : k.y1, b: b - a, h: wand }, laengs: f.b >= f.h });
    } else {
      const a = Math.max(f.y, Math.min(k.y1, k.y2)), b = Math.min(f.y + f.h, Math.max(k.y1, k.y2));
      const kante = k.aussen === "links" ? f.x : f.x + f.b;
      if (b > a && Math.abs(kante - k.x1) <= spiel) kandidaten.push({ q: { x: k.aussen === "links" ? k.x1 - wand : k.x1, y: a, b: wand, h: b - a }, laengs: f.h > f.b });
    }
  }
  return (kandidaten.find((c) => c.laengs) ?? kandidaten[0])?.q ?? null;
}

/**
 * Eingang an die Wand, die `mitte` am nächsten liegt: `laenge` cm entlang der Wand (ab `von`, sonst mittig um `mitte`),
 * `tiefe` cm in die Halle hinein, auf `raster` gerundet und auf die Länge dieser Wand begrenzt. Ergebnis als Fläche.
 */
export function eingangAnWand(u: Punkt[], mitte: Punkt, laenge: number, von: number | null, tiefe: number, raster: number): { x: number; y: number; breite: number; tiefe: number } {
  const rund = (v: number) => Math.round(v / raster) * raster;
  const abstand = (k: UmrissKante) => {
    const x = Math.max(Math.min(k.x1, k.x2), Math.min(Math.max(k.x1, k.x2), mitte.x));
    const y = Math.max(Math.min(k.y1, k.y2), Math.min(Math.max(k.y1, k.y2), mitte.y));
    return Math.hypot(x - mitte.x, y - mitte.y);
  };
  const k = umrissKanten(u).reduce((a, b) => (abstand(b) < abstand(a) ? b : a));
  const waagrecht = k.y1 === k.y2;
  const a = waagrecht ? Math.min(k.x1, k.x2) : Math.min(k.y1, k.y2), b = waagrecht ? Math.max(k.x1, k.x2) : Math.max(k.y1, k.y2);
  const lang = Math.min(b - a, laenge);
  const start = Math.max(a, Math.min(b - lang, rund(von ?? (waagrecht ? mitte.x : mitte.y) - lang / 2)));
  return waagrecht
    ? { x: start, y: k.aussen === "oben" ? k.y1 : k.y1 - tiefe, breite: lang, tiefe }
    : { x: k.aussen === "links" ? k.x1 : k.x1 - tiefe, y: start, breite: tiefe, tiefe: lang };
}
