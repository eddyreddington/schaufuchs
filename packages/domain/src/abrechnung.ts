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

/**
 * Gesamtabrechnung eines Ausstellers als Rechenweg für die Quittung: alles, was er zahlt (Meldegeld, zugesagte
 * Ehrenpreisstiftung und Spende), was er schon bezahlt hat, was er bekommt (Preisgeld, Verkaufserlös) und die
 * Provision. Die Summe der Zeilen ist genau der Saldo aus berechneAbrechnung (−offen + zu viel gezahlt =
 * −Meldegeld − Stiftung − Spende + bezahlt). Zeilen mit 0 € fallen weg.
 */
export function gesamtabrechnungZeilen(z: {
  meldebetragCent: number;
  stiftungCent: number;
  spendeCent: number;
  bezahltCent: number;
  preisgeldCent: number;
  verkaufCent: number;
  provisionCent: number;
  provisionText?: string;
}): [string, number][] {
  const zeilen: [string, number][] = [
    ["Meldegeld", -z.meldebetragCent],
    ["Ehrenpreisstiftung (zugesagt)", -z.stiftungCent],
    ["Spende für die Ausstellung", -z.spendeCent],
    ["bereits bezahlt", z.bezahltCent],
    ["Preisgeld", z.preisgeldCent],
    ["Verkaufserlös", z.verkaufCent],
    [z.provisionText ?? "Provision vom Verkauf", -z.provisionCent],
  ];
  return zeilen.filter(([, c]) => c !== 0);
}
