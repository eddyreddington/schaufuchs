/**
 * Verschieben im Editor samt Ausrichtung (ohne React): Die Auswahl rückt um dx/dy; landet ein Käfig mit der Front an einer
 * Wand oder an einem anderen Teil, dreht ihn die Software an Ort und Stelle um 180° – Rückwand an die Wand bzw. Rückwand an
 * Rückwand (`ausrichtungBeimStellen`). Nur die bewegten Teile drehen, die Nachbarn bleiben. Ein Schritt (ein Rückgängig).
 */
import { ausrichtungBeimStellen, type Halle, type HallenTeil, verschiebeTeile, wandDrehungenAnwenden } from "@schau/domain";
import { type Daten, vollstaendig, wandKandidatenImEntwurf } from "./hallenplan-geometrie";

export function verschiebenUndAusrichten(
  h: Halle,
  plan: NonNullable<Daten["plan"]>,
  ziele: HallenTeil[],
  dx: number,
  dy: number,
): { halle: Halle; wand: number; ruecken: number } {
  const v = verschiebeTeile(vollstaendig(h), ziele, dx, dy);
  const a = ausrichtungBeimStellen(v, wandKandidatenImEntwurf(v, plan, null), ziele);
  return { halle: wandDrehungenAnwenden(v, [...a.wand, ...a.ruecken]), wand: a.wand.length, ruecken: a.ruecken.length };
}
