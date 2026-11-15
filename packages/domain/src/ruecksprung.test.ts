import { describe, expect, test } from "bun:test";
import { anmeldeZiel, ruecksprungZiel } from "./ruecksprung";

describe("Rücksprung nach der Anmeldung", () => {
  test("eigene Seiten mit Suche und Anker bleiben erhalten", () => {
    expect(ruecksprungZiel("/schau/3/hallenplan")).toBe("/schau/3/hallenplan");
    expect(ruecksprungZiel("/schau/3/katalog?x=1#reihenfolge")).toBe("/schau/3/katalog?x=1#reihenfolge");
  });

  test("fremde oder unsinnige Ziele führen zur Startseite", () => {
    for (const z of [null, undefined, "", "schau/3", "//boese.example/x", "/\\boese.example", "https://boese.example/", "/anmelden", "/anmelden?weiter=/x", " /schau/3", "/s/schau", "/richter/abc"])
      expect(ruecksprungZiel(z)).toBe("/");
  });

  test("Anmeldeseite mit Ziel; ohne sinnvolles Ziel schlicht /anmelden", () => {
    expect(anmeldeZiel("/schau/3/hallenplan", "")).toBe("/anmelden?weiter=%2Fschau%2F3%2Fhallenplan");
    expect(anmeldeZiel("/schau/3/katalog", "?x=1")).toBe("/anmelden?weiter=%2Fschau%2F3%2Fkatalog%3Fx%3D1");
    expect(anmeldeZiel("/", "")).toBe("/anmelden");
    expect(anmeldeZiel("/anmelden", "")).toBe("/anmelden");
  });
});
