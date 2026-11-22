import { describe, expect, test } from "bun:test";
import { hatKontingent, kontingent, stiftungUngedeckt, zaehltZumKontingent, type Preisart } from "./preise";

/** Gestiftete Preisart mit „zusätzlich je Preisrichter“ (Zusatzpreise ohne Stiftung). */
const ZP: Preisart = {
  id: 1,
  kuerzel: "ZP",
  name: "Zusatzplakette",
  quelle: "stiftung",
  schluesselProTiere: null,
  anzahlProSchluessel: 0,
  anzahlProPreisrichter: 2,
  mindestpunkte: null,
  rundung: "voll",
};
const PE: Preisart = { ...ZP, id: 2, kuerzel: "PE", anzahlProPreisrichter: 0 };
const E: Preisart = { ...ZP, id: 3, kuerzel: "E", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, anzahlProPreisrichter: 0 };

describe("Zusatzpreise je Preisrichter", () => {
  test("Kontingent haben Standgeldpreise und gestiftete mit „zusätzlich je Preisrichter“", () => {
    expect(hatKontingent(E)).toBe(true);
    expect(hatKontingent({ quelle: "standgeld", anzahlProPreisrichter: 0 })).toBe(true);
    expect(hatKontingent(ZP)).toBe(true);
    expect(hatKontingent(PE)).toBe(false);
  });

  test("Kontingent einer gestifteten Preisart: nur „zusätzlich je Preisrichter“ mal Preisrichter, kein Schlüssel", () => {
    expect(kontingent(ZP, 47)).toBe(2);
    expect(kontingent(ZP, 47, 3)).toBe(6);
    // Ein versehentlich eingetragener Schlüssel zählt bei gestifteten Preisen nicht (die Stiftung gibt die Anzahl vor).
    expect(kontingent({ ...ZP, schluesselProTiere: 10, anzahlProSchluessel: 1 }, 47)).toBe(2);
    expect(kontingent(PE, 47, 3)).toBe(0);
    expect(kontingent(E, 47, 3)).toBe(4);
  });

  test("zum Kontingent zählen Standgeldpreise und gestiftete ohne Stiftung, nicht die aus einer Stiftung", () => {
    expect(zaehltZumKontingent(E, { stiftungId: null })).toBe(true);
    expect(zaehltZumKontingent(ZP, { stiftungId: null })).toBe(true);
    expect(zaehltZumKontingent(ZP, { stiftungId: 7 })).toBe(false);
  });

  test("Deckung: Preise aus Stiftungen durch die gestiftete Anzahl, ohne Stiftung nur mit Zusatzpreisen", () => {
    const aus = (n: number) => Array.from({ length: n }, (_, i) => ({ stiftungId: 10 + i }));
    const ohne = (n: number) => Array.from({ length: n }, () => ({ stiftungId: null }));
    expect(stiftungUngedeckt(ZP, 2, [...aus(2), ...ohne(5)])).toBeNull();
    // Zusatzpreise zählen nicht gegen die Stiftung (die prüft das Kontingent je Preisrichter).
    expect(stiftungUngedeckt(ZP, 1, [...aus(2), ...ohne(1)])).toEqual({ vergeben: 2, verfuegbar: 1 });
    // Ohne „zusätzlich je Preisrichter“ ist auch ein Preis ohne Stiftung nur durch die gestiftete Anzahl gedeckt.
    expect(stiftungUngedeckt(PE, 2, [...aus(1), ...ohne(1)])).toBeNull();
    expect(stiftungUngedeckt(PE, 1, [...aus(1), ...ohne(1)])).toEqual({ vergeben: 2, verfuegbar: 1 });
    expect(stiftungUngedeckt(PE, 0, [])).toBeNull();
  });
});
