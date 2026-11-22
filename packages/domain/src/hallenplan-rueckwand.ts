/**
 * Käfige aneinander mit der Rückwand an die Rückwand (Wunsch des Vereins: „Wenn Käfige aneinander gestellt werden, richte sie
 * automatisch so aus, dass die Rückwände aneinander stehen und nicht die Front verdecken.“). Zwei Teile (Grundplatte,
 * Käfigblock, eingesetzte Voliere) stehen aneinander, wenn eine Front- oder Rückseite des einen einer Front- oder Rückseite des
 * anderen gegenübersteht – bündig oder bis `WAND_FANG` – und sie sich entlang dieser Seite überlappen (Ecke an Ecke und
 * Seitenwand an Seitenwand zählen nicht). Zeigt die Front eines eben gestellten Teils auf ein anliegendes Teil, ist sie verdeckt:
 * Das Teil dreht an Ort und Stelle um 180° – nur das bewegte, nie der ruhende Nachbar – und nur, wenn seine Front danach weder
 * an einer Wand noch an einem anderen Teil liegt. Zuerst gilt die Wand (`wandAusrichtung`), dann die Nachbarn: So dreht nichts
 * hin und her. Reine Rechnung.
 */
import type { Blick, Halle, Rechteck } from "./hallenplan";
import type { HallenTeil } from "./hallenplan-gruppe";
import { kandidatGewaehlt, WAND_FANG, wandAusrichtung, type WandDrehung, type WandKandidat } from "./hallenplan-wandfront";

/** Rechenspiel (cm): so viel Überschneidung gilt noch als bündig, so viel Überlappung entlang der Seite noch als Ecke. */
const T = 0.5;

const gegen = (b: Blick): Blick => `${b[0]}${b[1] === "+" ? "-" : "+"}` as Blick;
const gleichesTeil = (a: WandKandidat["teil"], b: WandKandidat["teil"]) =>
  a.art === "platte" ? b.art === "platte" && a.reihe === b.reihe && a.i === b.i : b.art === "objekt" && a.id === b.id;

/** Abstand (cm) von der Seite `blick` von q bis zur gegenüberliegenden Seite von n und die Überlappung entlang der Seite. */
function gegenueber(q: Rechteck, blick: Blick, n: Rechteck): { abstand: number; ueberlappt: number } {
  const x = blick[0] === "x";
  const abstand =
    blick === "x+" ? n.x - (q.x + q.b) : blick === "x-" ? q.x - (n.x + n.b) : blick === "z+" ? n.y - (q.y + q.h) : q.y - (n.y + n.h);
  const ueberlappt = x ? Math.min(q.y + q.h, n.y + n.h) - Math.max(q.y, n.y) : Math.min(q.x + q.b, n.x + n.b) - Math.max(q.x, n.x);
  return { abstand, ueberlappt };
}

const liegtAn = (q: Rechteck, blick: Blick, n: Rechteck, fang: number) => {
  const g = gegenueber(q, blick, n);
  return g.abstand >= -T && g.abstand <= fang && g.ueberlappt > T;
};

/**
 * Teil, das an der Seite `blick` von k anliegt: mit seiner Front- oder Rückseite (Front parallel zu `blick`) – nur dann
 * stehen zwei Teile Front bzw. Rücken aneinander. `jedeSeite`: auch ein Teil, das mit einer Seitenwand dort steht.
 */
export function anliegend(k: WandKandidat, blick: Blick, alle: WandKandidat[], fang = WAND_FANG, jedeSeite = false): WandKandidat | null {
  return alle.find((n) => !gleichesTeil(n.teil, k.teil) && (jedeSeite || n.front[0] === blick[0]) && liegtAn(k.rechteck, blick, n.rechteck, fang)) ?? null;
}

/** Liegt die Seite `blick` an einer Hallenwand (bündig oder bis `fang`)? */
const anWand = (halle: Pick<Halle, "breite" | "laenge">, q: Rechteck, blick: Blick, fang: number) =>
  blick === "x+" ? q.x + q.b >= halle.breite - fang : blick === "x-" ? q.x <= fang : blick === "z+" ? q.y + q.h >= halle.laenge - fang : q.y <= fang;

/**
 * Was nach dem Stellen (Verschieben, Pfeiltasten) zu drehen ist, je um 180° an Ort und Stelle: `wand` – Front zur Wand
 * (`wandAusrichtung`), `ruecken` – Front an einem anliegenden Teil. `alle`: alle Kandidaten im Plan (auch die ruhenden
 * Nachbarn), `nur`: die bewegten Teile (eine Reihe steht für ihre Platten); null = alle. Nur bewegte Teile drehen.
 */
export function ausrichtungBeimStellen(
  halle: Pick<Halle, "breite" | "laenge">,
  alle: WandKandidat[],
  nur: HallenTeil[] | null,
  fang = WAND_FANG,
): { wand: WandDrehung[]; ruecken: WandDrehung[] } {
  const wand = wandAusrichtung(halle, alle.filter((k) => kandidatGewaehlt(k.teil, nur)), fang);
  // Fronten nach der Wand-Ausrichtung; jede Drehung gilt sofort für die folgenden Teile.
  const jetzt = alle.map((k) => ({ ...k, front: wand.find((d) => gleichesTeil(d.teil, k.teil))?.front ?? k.front }));
  const ruecken: WandDrehung[] = [];
  jetzt.forEach((k, i) => {
    if (!kandidatGewaehlt(k.teil, nur) || wand.some((d) => gleichesTeil(d.teil, k.teil))) return;
    if (!anliegend(k, k.front, jetzt, fang)) return;
    const neu = gegen(k.front);
    if (anWand(halle, k.rechteck, neu, fang) || anliegend(k, neu, jetzt, fang, true)) return;
    ruecken.push({ teil: k.teil, grad: 180, front: neu, belegt: k.belegt });
    jetzt[i] = { ...k, front: neu };
  });
  return { wand, ruecken };
}
