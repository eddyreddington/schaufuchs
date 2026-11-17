import { beforeAll, describe, expect, test } from "bun:test";
import { NUR_LESEN_MELDUNG } from "./lesemodus";
import { ladeAlleOberflaechen, oberflaeche, serverText, SPRACHEN, texte } from "./sprachen";

beforeAll(ladeAlleOberflaechen);

describe("Lesemodus: Meldung des Servers", () => {
  test("steht wortgleich in den Servertexten, damit sie übersetzt wird", () => {
    expect(oberflaeche("de").serverKatalog.pruefung.anfrage.nurLesen).toBe(NUR_LESEN_MELDUNG);
  });

  test("in jeder Sprache übersetzt, auf Deutsch unverändert", () => {
    for (const s of SPRACHEN) {
      const ist = serverText(NUR_LESEN_MELDUNG, s);
      if (s === "de" || s === "de-CH") expect(ist).toBe(NUR_LESEN_MELDUNG);
      else {
        expect(ist).not.toBe(NUR_LESEN_MELDUNG);
        expect(ist).toBe(oberflaeche(s).serverKatalog.pruefung.anfrage.nurLesen);
      }
    }
  });

  test("Seiten für Aussteller haben Hinweis und Fehlertext in jeder Sprache", () => {
    for (const s of SPRACHEN) {
      expect(texte(s).rahmen.nurLesen.length).toBeGreaterThan(10);
      expect(texte(s).fehler.nurLesen).toBe(texte(s).rahmen.nurLesen);
    }
  });
});
