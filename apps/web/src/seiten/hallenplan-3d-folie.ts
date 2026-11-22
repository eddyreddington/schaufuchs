/** Schalter „Folie“ in der 3D-Ansicht (Entscheidung 028): nur die Ansicht, gespeichert wird nichts. */

/** Eigene Wahl im Schalter: `an`, getroffen, als die gespeicherte Einstellung `fuer` war. */
export interface FolienWahl {
  fuer: boolean;
  an: boolean;
}

/**
 * Ist die Folie gerade zu sehen? Die eigene Wahl gilt, solange die gespeicherte Einstellung dieselbe ist wie beim Wählen;
 * ändert sie sich (im Editor gespeichert, neu geladen), gilt sofort die Einstellung – im selben Bild, ohne Zwischenstand.
 */
export function folieJetzt(gespeichert: boolean, wahl: FolienWahl | null): boolean {
  return wahl && wahl.fuer === gespeichert ? wahl.an : gespeichert;
}
