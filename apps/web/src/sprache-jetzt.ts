/**
 * Sprache der Oberfläche für Code außerhalb von Komponenten (Fehlertexte, Datum, Rückfragen): `SpracheRahmen` setzt sie,
 * Komponenten nehmen besser `useOberflaeche()` (dann zeichnen sie bei einem Wechsel neu).
 */
import { oberflaeche, type OberflaecheTexte, type Sprache } from "@schau/domain";

let jetzt: Sprache = "de";

export function setzeAktuelleSprache(s: Sprache) {
  jetzt = s;
}

export function aktuelleSprache(): Sprache {
  return jetzt;
}

/** Texte der Oberfläche in der aktuellen Sprache (für Code außerhalb von Komponenten). */
export function ot(): OberflaecheTexte {
  return oberflaeche(jetzt);
}
