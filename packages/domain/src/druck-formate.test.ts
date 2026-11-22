import { describe, expect, test } from "bun:test";
import {
  belegBlatt,
  bewertungslisteBlatt,
  blatt,
  DRUCK_FORMAT_ARTEN,
  DRUCK_FORMAT_WAHL,
  DRUCK_FORMATE_VORGABE,
  DRUCKSACHEN,
  druckFormateAbweichung,
  druckFormateLesen,
  hallenplanBlatt,
} from "./druck-formate";

describe("Formatvorgaben der Drucke (Rückmeldung: „Bei den Druckeinstellungen fehlen die Formatvorgaben“)", () => {
  test("Vorgabe ist das bisherige Format; die Vorgabe steht in jeder Wahl vorn", () => {
    expect(DRUCK_FORMATE_VORGABE).toEqual({ bewertungsliste: "A4", hallenplan: "A4", kaufbeleg: "A5", kassenbeleg: "A5" });
    for (const art of DRUCK_FORMAT_ARTEN) expect(DRUCK_FORMAT_WAHL[art][0]).toBe(DRUCK_FORMATE_VORGABE[art] as never);
  });

  test("Lesen: leer, null, Fremdes und Ungültiges ergeben die Vorgabe – rückwärtskompatibel", () => {
    expect(druckFormateLesen(undefined)).toEqual(DRUCK_FORMATE_VORGABE);
    expect(druckFormateLesen(null)).toEqual(DRUCK_FORMATE_VORGABE);
    expect(druckFormateLesen({})).toEqual(DRUCK_FORMATE_VORGABE);
    expect(druckFormateLesen("A4")).toEqual(DRUCK_FORMATE_VORGABE);
    expect(druckFormateLesen([1, 2])).toEqual(DRUCK_FORMATE_VORGABE);
    // Ungültig je Schlüssel: nur dieser fällt auf die Vorgabe zurück, Unbekanntes fällt weg.
    const r = druckFormateLesen({ bewertungsliste: "A5", hallenplan: "A0", kaufbeleg: 4, kassenbeleg: "A4", fremd: "A3", __proto__: { x: 1 } });
    expect(r).toEqual({ bewertungsliste: "A5", hallenplan: "A4", kaufbeleg: "A5", kassenbeleg: "A4" });
    expect(Object.keys(r).sort()).toEqual([...DRUCK_FORMAT_ARTEN].sort());
    // Ein Format, das es nur bei einer anderen Drucksache gibt, gilt nicht (A3 für Belege, A5 für den Hallenplan).
    expect(druckFormateLesen({ kaufbeleg: "A3", hallenplan: "A5" })).toEqual(DRUCK_FORMATE_VORGABE);
  });

  test("Abweichung: nur, was nicht der Vorgabe entspricht – Vorgabe überall = leer", () => {
    expect(druckFormateAbweichung(DRUCK_FORMATE_VORGABE)).toEqual({});
    expect(druckFormateAbweichung({ ...DRUCK_FORMATE_VORGABE, hallenplan: "A3" })).toEqual({ hallenplan: "A3" });
  });

  test("Papier in mm: hochkant, quer vertauscht", () => {
    expect(blatt("A3")).toEqual({ breite: 297, hoehe: 420 });
    expect(blatt("A4")).toEqual({ breite: 210, hoehe: 297 });
    expect(blatt("A5", true)).toEqual({ breite: 210, hoehe: 148 });
    expect(blatt("A6")).toEqual({ breite: 105, hoehe: 148 });
  });

  test("Belege: A5 quer wie bisher, oder A5 quer oben auf A4 mit Schnittlinie", () => {
    expect(belegBlatt("A5")).toEqual({ seite: { breite: 210, hoehe: 148 }, beleg: { breite: 210, hoehe: 148 }, schnittBei: null });
    const a4 = belegBlatt("A4");
    expect(a4.seite).toEqual({ breite: 210, hoehe: 297 });
    // Der Beleg selbst bleibt gleich groß – nur das Papier ändert sich, Text kann nicht anders umbrechen.
    expect(a4.beleg).toEqual(belegBlatt("A5").beleg);
    expect(a4.schnittBei).toBe(148);
  });

  test("Bewertungsliste: A4 mit zwei Listen nebeneinander, A5 mit einer Liste je Seite", () => {
    expect(bewertungslisteBlatt("A4")).toEqual({ seite: { breite: 210, hoehe: 297 }, listenJeSeite: 2 });
    expect(bewertungslisteBlatt("A5")).toEqual({ seite: { breite: 148, hoehe: 210 }, listenJeSeite: 1 });
  });

  test("Hallenplan: ein Blatt, Ausrichtung nach der Zeichnung", () => {
    expect(hallenplanBlatt("A4", true)).toEqual({ breite: 297, hoehe: 210 });
    expect(hallenplanBlatt("A3", true)).toEqual({ breite: 420, hoehe: 297 });
    expect(hallenplanBlatt("A3", false)).toEqual({ breite: 297, hoehe: 420 });
  });

  test("Übersicht: jede Drucksache einmal; jede Formatwahl gehört zu genau einer Drucksache", () => {
    const ids = DRUCKSACHEN.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mitWahl = DRUCKSACHEN.flatMap((d) => (d.einstellung === "format" ? [d.id] : []));
    expect(mitWahl.sort()).toEqual([...DRUCK_FORMAT_ARTEN].sort());
    // Fest heißt: eine Seite angegeben; einstellbar anderswo (Katalog, Karten) zeigt dort sein Format.
    for (const d of DRUCKSACHEN) if (d.einstellung === "fest" || d.einstellung === "briefvorlage") expect(d.fest).toBeDefined();
    // Briefe bleiben A4 hoch nach DIN 5008.
    for (const d of DRUCKSACHEN.filter((x) => x.einstellung === "briefvorlage")) expect(d.fest).toMatchObject({ papier: "A4", lage: "hoch", norm: "din5008" });
  });
});
