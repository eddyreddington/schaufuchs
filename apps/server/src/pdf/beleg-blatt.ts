/**
 * Papier der Belege (Kaufbeleg, Einzahlungsquittung, Eigenbeleg, Spendenquittung) nach der Formatvorgabe der Schau
 * (Entscheidung 029): A5 quer wie bisher, oder derselbe Beleg oben auf A4 mit Schnittlinie. Der untere Rand reicht auf
 * A4 bis unter die Schnittlinie – Text bricht also genau so um wie auf A5. Rechnung: belegBlatt() in @schau/domain.
 */
import { belegBlatt, type BelegFormat } from "@schau/domain";
import { type Doc, GRAU, MM } from "./basis";

/** Seitengröße und Ränder für erzeugePdf, dazu die Höhe des Belegs in Punkt. */
export function belegSeite(format: BelegFormat, rand: number) {
  const b = belegBlatt(format);
  return {
    size: [b.seite.breite * MM, b.seite.hoehe * MM] as [number, number],
    margins: { top: rand, left: rand, right: rand, bottom: (b.seite.hoehe - b.beleg.hoehe) * MM + rand },
    hoehe: b.beleg.hoehe * MM,
    schnittBei: b.schnittBei,
  };
}

/** Gestrichelte Schnittlinie unter dem Beleg auf jeder Seite (nur auf A4). */
export function schnittlinie(doc: Doc, schnittBei: number | null) {
  if (schnittBei == null) return;
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.save().lineWidth(0.4).strokeColor(GRAU).dash(3, { space: 3 }).moveTo(0, schnittBei * MM).lineTo(doc.page.width, schnittBei * MM).stroke().undash().restore();
  }
}
