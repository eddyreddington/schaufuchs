/**
 * Hallenplan – interne Hilfen für die Rechnung (nicht über `hallenplan.ts` veröffentlicht): Ersatzmaß der Voliere,
 * Platzhalter-Rechteck, Stücke eingesetzter Teile in den Reihen, Abschnitte abziehen und Meterangabe.
 */
import type { HallenFlaeche, Rechteck } from "./hallenplan-typen";

/** Voliere ohne eingetragenes Maß: 2 × 1 m. */
export const VOLIERE_ERSATZ = { breite: 200, tiefe: 100, hoehe: 180 };

export type Abschnitt = { von: number; bis: number };

/** Platzhalter im Reihensystem; die Lage in der Halle setzt `planeHalle`. */
export const LEER: Rechteck = { x: 0, y: 0, b: 0, h: 0 };

/** Zieht von den Abschnitten das Intervall [von, bis] ab. */
/**
 * Stücke eingesetzter Teile (siehe `HallenFlaeche.teil`), die ganz im Streifen einer Reihe stehen – je Reihe, entlang der
 * Reihe sortiert. Dort steht keine Platte; die Abschnitte der Reihe bleiben, wie sie sind.
 */
export function teilStuecke<R extends { x: number; tiefe: number }>(reihen: R[], flaechen: HallenFlaeche[]): Map<R, Abschnitt[]> {
  const m = new Map<R, Abschnitt[]>();
  for (const f of flaechen) {
    if (!f.teil) continue;
    const r = reihen.find((q) => f.x >= q.x - 0.5 && f.x + f.breite <= q.x + q.tiefe + 0.5);
    if (r) m.set(r, [...(m.get(r) ?? []), { von: f.y, bis: f.y + f.tiefe }].sort((a, b) => a.von - b.von));
  }
  return m;
}

/**
 * Im festen Plan: Stücke je Reihe, auf die keine angebaute Platte darf – jedes eingesetzte Teil, das in den Streifen der
 * Reihe ragt (Volieren samt Gang rundherum), auch wenn es nicht ganz darin steht.
 */
export function teilStueckeFest<R extends { x: number; tiefe: number }>(reihen: R[], flaechen: HallenFlaeche[], gang: number): Map<R, Abschnitt[]> {
  const m = new Map<R, Abschnitt[]>();
  for (const f of flaechen) {
    if (!f.teil && !f.mitGang && !f.moebel) continue;
    // Tische und Bänke: auch nicht davor (der Gang vor der neuen Platte bleibt frei).
    const g = f.mitGang || f.moebel ? gang : 0;
    for (const r of reihen) {
      if (f.x - g >= r.x + r.tiefe - 0.5 || f.x + f.breite + g <= r.x + 0.5) continue;
      m.set(r, [...(m.get(r) ?? []), { von: f.y - g, bis: f.y + f.tiefe + g }].sort((a, b) => a.von - b.von));
    }
  }
  return m;
}

/** Erste Stelle ab `y`, an der `laenge` frei von den Stücken ist (sortiert, siehe `teilStuecke`). */
export function hinterStuecken(stuecke: Abschnitt[] | undefined, y: number, laenge: number): number {
  for (const b of stuecke ?? []) if (b.von < y + laenge - 1e-6 && y < b.bis - 1e-6) y = b.bis;
  return y;
}

export function abziehen(abschnitte: Abschnitt[], von: number, bis: number): Abschnitt[] {
  const aus: Abschnitt[] = [];
  for (const a of abschnitte) {
    if (bis <= a.von || von >= a.bis) aus.push(a);
    else {
      if (von > a.von) aus.push({ von: a.von, bis: von });
      if (bis < a.bis) aus.push({ von: bis, bis: a.bis });
    }
  }
  return aus;
}

export const m = (cm: number) => `${(cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} m`;
