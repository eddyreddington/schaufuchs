/**
 * Licht der 3D-Halle als Zahlen: Himmelslicht trägt die Helligkeit, die Sonne steht hoch und wirft nur helle, weiche
 * Schatten (Rückmeldung 22.11.2026: dunkle Sonnenschatten wirkten unruhig und störten im Bild). Kurze Schatten unter den
 * Käfigen und Möbeln geben Halt, lange dunkle Streifen über die Reihen nicht.
 */

export interface LichtWerte {
  himmel: { oben: string; unten: string; staerke: number };
  sonne: { farbe: string; staerke: number; position: { x: number; y: number; z: number } };
  /** `intensitaet`: 0 = kein Schatten, 1 = voller Schatten; `radius`: weicher Rand (nur mit PCFShadowMap). */
  schatten: { intensitaet: number; radius: number };
}

/** Licht für eine Halle der Größe `groesse` (m, größere Seite) um `mitte` (m). */
export function lichtWerte(groesse: number, mitte: { x: number; y: number; z: number }): LichtWerte {
  return {
    // Himmel leicht blau, vom Boden warm zurück (Holz) – kräftiger als die Sonne, damit Schatten hell bleiben.
    himmel: { oben: "#eaf0fb", unten: "#c8b08a", staerke: 2.3 },
    // Etwa 72° über dem Horizont: kurze Schatten.
    sonne: { farbe: "#ffe8c8", staerke: 1.3, position: { x: mitte.x - groesse * 0.25, y: mitte.y + groesse, z: mitte.z - groesse * 0.2 } },
    schatten: { intensitaet: 0.4, radius: 6 },
  };
}
