import { expect, test } from "bun:test";
import { berechneAbrechnung, gesamtabrechnungZeilen } from "./abrechnung";

test("Gesamtabrechnung: jeder Posten einzeln, Summe = Saldo (auch bei Über- und Unterzahlung)", () => {
  const faelle = [
    { meldegeld: 2400, stiftung: 500, spende: 1000, bezahlt: 3900, preise: [1500, 500], verkaeufe: [{ preisCent: 3000, provisionCent: 300 }] },
    { meldegeld: 2400, stiftung: 0, spende: 1000, bezahlt: 0, preise: [], verkaeufe: [] },
    { meldegeld: 1200, stiftung: 0, spende: 0, bezahlt: 2000, preise: [700], verkaeufe: [] },
  ];
  for (const f of faelle) {
    const a = berechneAbrechnung({ meldebetragCent: f.meldegeld + f.stiftung + f.spende, bezahltCent: f.bezahlt, preisgelderCent: f.preise, verkaeufe: f.verkaeufe });
    const zeilen = gesamtabrechnungZeilen({ meldebetragCent: f.meldegeld, stiftungCent: f.stiftung, spendeCent: f.spende, bezahltCent: f.bezahlt, preisgeldCent: a.preisgeldCent, verkaufCent: a.verkaufCent, provisionCent: a.provisionCent });
    expect(zeilen.reduce((n, [, c]) => n + c, 0)).toBe(a.saldoCent);
  }
  const z = gesamtabrechnungZeilen({ meldebetragCent: 2400, stiftungCent: 0, spendeCent: 1000, bezahltCent: 3400, preisgeldCent: 0, verkaufCent: 0, provisionCent: 0 });
  expect(z.map(([t]) => t)).toEqual(["Meldegeld", "Spende für die Ausstellung", "bereits bezahlt"]);
});
