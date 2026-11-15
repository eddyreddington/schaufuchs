/**
 * Teilschauen (Entscheidung 016): Eine Ausstellung kann aus mehreren Teilschauen bestehen, z. B. Landesschau,
 * Kreisschau und Jugendschau in einer Halle. Jede Meldung gehört zu einer Teilschau (ohne Angabe: der ersten). Die
 * Katalognummern laufen über alle Teilschauen fortlaufend – erst die ganze erste, dann die nächste.
 */
export interface Teilschau {
  /** Feste Kennung („t1“, „t2“ …) – bleibt beim Umbenennen und Umsortieren, die Meldungen verweisen darauf. */
  id: string;
  name: string;
}

export const TEILSCHAUEN_MAX = 12;
const NAME_MAX = 80;

/** Gespeicherte oder eingegebene Teilschauen lesen: Namen gekürzt, leere und doppelte Kennungen weg, neue nummeriert. */
export function teilschauenLesen(roh: unknown): Teilschau[] {
  const liste = Array.isArray(roh) ? roh : [];
  const gesehen = new Set<string>();
  const vorlaeufig: { id: string | null; name: string }[] = [];
  for (const x of liste) {
    if (vorlaeufig.length >= TEILSCHAUEN_MAX) break;
    const o = (x && typeof x === "object" ? x : {}) as { id?: unknown; name?: unknown };
    const name = typeof o.name === "string" ? o.name.trim().slice(0, NAME_MAX) : "";
    if (!name) continue;
    const id = typeof o.id === "string" && /^t\d{1,4}$/.test(o.id) ? o.id : null;
    if (id && gesehen.has(id)) continue;
    if (id) gesehen.add(id);
    vorlaeufig.push({ id, name });
  }
  let n = Math.max(0, ...[...gesehen].map((id) => Number(id.slice(1))));
  return vorlaeufig.map((t) => ({ id: t.id ?? `t${++n}`, name: t.name }));
}

/** Teilschau einer Meldung: ihre, sonst (ohne Angabe oder gelöscht) die erste; ohne Teilschauen keine. */
export function teilschauVon(teilschauen: readonly Teilschau[], id: string | null | undefined): Teilschau | null {
  return teilschauen.find((t) => t.id === id) ?? teilschauen[0] ?? null;
}

/** Stelle der Teilschau in der Katalogfolge (0 = erste). */
export function teilschauFolge(teilschauen: readonly Teilschau[], id: string | null | undefined): number {
  const i = teilschauen.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i;
}
