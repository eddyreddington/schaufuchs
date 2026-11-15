import { describe, expect, test } from "bun:test";
import { veterinaeramtSuchen, veterinaeramtZurSchau, type Veterinaeramt } from "@schau/domain";
import daten from "./daten/veterinaeraemter.json";

const liste = daten.eintraege as Veterinaeramt[];

describe("Verzeichnis der Veterinärämter", () => {
  test("alle 16 Länder, rund 400 Kreise, jeder Eintrag mit Amt, Anschrift und Quelle", () => {
    expect(new Set(liste.map((e) => e.land)).size).toBe(16);
    expect(liste.length).toBeGreaterThanOrEqual(400);
    for (const e of liste) {
      expect(e.amt.length).toBeGreaterThan(3);
      expect(e.plz).toMatch(/^\d{5}$/);
      expect(e.strasse.length).toBeGreaterThan(2);
      expect(e.quelle).toMatch(/^https?:\/\//);
      if (e.email) expect(e.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    }
  });

  test("je Land, Kreis und Art höchstens ein Eintrag", () => {
    const schluessel = liste.map((e) => `${e.land}|${e.kreis}|${e.art}`);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });

  test("Suche und Vorschlag finden typische Kreise", () => {
    expect(veterinaeramtSuchen(liste, "Fulda")[0]?.land).toBe("Hessen");
    expect(veterinaeramtZurSchau(liste, "Stadthalle, 36037 Fulda")?.land).toBe("Hessen");
    expect(veterinaeramtSuchen(liste, "Segeberg")[0]?.land).toBe("Schleswig-Holstein");
  });
});
