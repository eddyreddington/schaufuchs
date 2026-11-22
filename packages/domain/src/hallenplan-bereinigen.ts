/**
 * Halle so bereinigt, wie der Server sie ablegt (`HALLE_EINGABE`): Türart nur an Eingängen und abweichend von der Vorgabe,
 * Aussehen und Nummernfolge nur mit Abweichungen. Der Editor rechnet seinen Entwurf damit, sonst wiche sein Stand
 * (`halleSchluessel`) vom gespeicherten ab – Rückgängig fiele aus und die nächste Änderung käme als Konflikt zurück.
 */
import { aussehenBereinigt } from "./hallenplan-aussehen";
import { flaecheBereinigt } from "./hallenplan-tueren";
import type { Halle, NummerFolge } from "./hallenplan-typen";

/** Nummernfolge: nur gesetzte Werte (falsch zählt als nicht gesetzt); ohne Einstellung nichts. */
export function nummerFolgeBereinigt(f: NummerFolge | null | undefined): NummerFolge | undefined {
  if (!f) return undefined;
  const aus = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== false));
  return Object.keys(aus).length ? (aus as NummerFolge) : undefined;
}

export function halleBereinigt(h: Halle): Halle {
  const { aussehen, nummerFolge, ...rest } = h;
  const a = aussehenBereinigt(aussehen);
  const n = nummerFolgeBereinigt(nummerFolge);
  return { ...rest, flaechen: (h.flaechen ?? []).map(flaecheBereinigt), ...(a ? { aussehen: a } : {}), ...(n ? { nummerFolge: n } : {}) };
}
