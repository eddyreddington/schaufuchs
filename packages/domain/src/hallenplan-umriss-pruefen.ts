/**
 * Prüfung einer Halle mit freiem Grundriss vor dem Speichern (Entscheidung 019): Grundriss gültig, Breite und Länge passen
 * dazu, keine Fläche und kein eingesetztes Teil liegt außerhalb. Eigene Datei, weil sie Grundriss und Hallenplan braucht.
 */
import { type Halle, type HallenFlaeche, type Rechteck, teilGroesse, ueberlappt } from "./hallenplan";
import { istRechteckUmriss, type Punkt, pruefeUmriss, umrissMasse, umrissNormal, umrissSperren } from "./hallenplan-umriss";
import type { KaefigMasse } from "./kaefige";

const TEIL_NAME: Record<NonNullable<Halle["objekte"]>[number]["art"], string> = { voliere: "Eine Voliere", kaefigblock: "Ein Käfigblock", tisch: "Ein Tisch", bank: "Eine Bank", garnitur: "Eine Garnitur", pokaltisch: "Ein Pokaltisch" };

/** Null = in Ordnung, sonst die Meldung für die Ausstellungsleitung. */
/**
 * Mit `vorher` (gespeicherte Halle) nur, was durch diese Änderung neu hinausragt: ein Teil, das schon vorher draußen stand
 * (etwa nach einer größeren Grundplatte), sperrt keine andere Änderung.
 */
export function pruefeHallenUmriss(halle: Halle, masse: KaefigMasse | null | undefined, vorher?: Halle | null): string | null {
  if (istRechteckUmriss(halle.umriss)) return null;
  const f = pruefeUmriss(halle.umriss!);
  if (f) return f;
  const u = umrissNormal(halle.umriss!);
  const m = umrissMasse(u);
  if (m.breite !== halle.breite || m.laenge !== halle.laenge) return "Breite und Länge passen nicht zum Grundriss.";
  const draussenIn = (h: Halle) => {
    const aussen = istRechteckUmriss(h.umriss) ? [] : umrissSperren(umrissNormal(h.umriss!));
    return (q: Rechteck) => aussen.some((a) => ueberlappt(q, a)) || q.x < -0.5 || q.y < -0.5 || q.x + q.b > h.breite + 0.5 || q.y + q.h > h.laenge + 0.5;
  };
  const draussen = draussenIn(halle);
  const warDraussen = vorher ? draussenIn(vorher) : () => false;
  const lage = (h: Halle, o: NonNullable<Halle["objekte"]>[number]): Rechteck => {
    const g = teilGroesse(o, h, masse);
    return o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz };
  };
  const flaecheQ = (fl: HallenFlaeche): Rechteck => ({ x: fl.x, y: fl.y, b: fl.breite, h: fl.tiefe });
  for (const fl of halle.flaechen) {
    if (fl.aussen || !draussen(flaecheQ(fl))) continue;
    const alt = vorher?.flaechen.find((x) => x.name === fl.name && x.x === fl.x && x.y === fl.y && x.breite === fl.breite && x.tiefe === fl.tiefe);
    if (alt && warDraussen(flaecheQ(alt))) continue;
    return `„${fl.name}“ liegt außerhalb des Grundrisses – bitte erst verschieben oder entfernen.`;
  }
  for (const o of halle.objekte ?? []) {
    if (!draussen(lage(halle, o))) continue;
    const alt = vorher?.objekte?.find((x) => x.id === o.id && x.x === o.x && x.y === o.y && x.drehung === o.drehung);
    if (alt && vorher && warDraussen(lage(vorher, alt))) continue;
    return `${TEIL_NAME[o.art]} liegt außerhalb des Grundrisses – bitte erst verschieben oder entfernen.`;
  }
  return null;
}

/**
 * Einen bearbeiteten Grundriss in die Halle übernehmen: einheitlich schreiben (`umrissNormal`), Breite und Länge danach.
 * Rückt der Nullpunkt (linke bzw. obere Wand gezogen), wandern Flächen und eingesetzte Teile mit – sie bleiben, wo sie in
 * der Halle stehen. Ein Rechteck wird als gewöhnliche Halle übernommen (ohne Grundriss).
 */
export function grundrissUebernehmen(halle: Halle, roh: Punkt[]): Halle {
  const dx = -Math.min(...roh.map((p) => p.x)), dy = -Math.min(...roh.map((p) => p.y));
  const u = umrissNormal(roh);
  const { breite, laenge } = umrissMasse(u);
  const { umriss: _alt, ...rest } = halle;
  return {
    ...rest,
    breite,
    laenge,
    ...(istRechteckUmriss(u) ? {} : { umriss: u }),
    flaechen: halle.flaechen.filter((f) => !f.aussen).map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })),
    objekte: (halle.objekte ?? []).map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
  };
}
