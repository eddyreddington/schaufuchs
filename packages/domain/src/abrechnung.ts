import { anteil } from "./geld";

export interface AbrechnungEingabe {
  /** Gefordertes Meldegeld (Standgeld, Katalog, Kostenanteil). */
  meldebetragCent: number;
  bezahltCent: number;
  preisgelderCent: number[];
  /** Provision wird beim Verkauf festgehalten (siehe `provision`), damit spätere Satzänderungen nichts verschieben. */
  verkaeufe: { preisCent: number; provisionCent: number }[];
}

export interface Abrechnung {
  preisgeldCent: number;
  verkaufCent: number;
  provisionCent: number;
  /** Noch nicht bezahltes Meldegeld (wird verrechnet). */
  offenCent: number;
  /** Positiv: Aussteller bekommt Geld. Negativ: Aussteller muss zahlen. */
  saldoCent: number;
}

export function provision(verkaufspreisCent: number, basispunkte: number): number {
  return anteil(verkaufspreisCent, basispunkte);
}

export function berechneAbrechnung(e: AbrechnungEingabe): Abrechnung {
  const preisgeldCent = e.preisgelderCent.reduce((s, x) => s + x, 0);
  const verkaufCent = e.verkaeufe.reduce((s, v) => s + v.preisCent, 0);
  const provisionCent = e.verkaeufe.reduce((s, v) => s + v.provisionCent, 0);
  const offenCent = Math.max(0, e.meldebetragCent - e.bezahltCent);
  const ueberzahlt = Math.max(0, e.bezahltCent - e.meldebetragCent);
  return {
    preisgeldCent,
    verkaufCent,
    provisionCent,
    offenCent,
    saldoCent: preisgeldCent + verkaufCent - provisionCent - offenCent + ueberzahlt,
  };
}
