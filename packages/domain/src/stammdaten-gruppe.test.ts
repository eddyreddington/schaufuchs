import { describe, expect, test } from "bun:test";
import { parseStammdatenCsv } from "./stammdaten";

// Erfundene Gruppen (X1, Y), keine echte Zuordnung aus dem Verzeichnis.
describe("Stammdaten-CSV mit Gruppe (vierte Spalte, freiwillig)", () => {
  test("mit Kopfzeile: Gruppe je Rasse, einheitlich geschrieben; ohne Angabe leer", () => {
    const { baum, fehler } = parseStammdatenCsv("Sparte;Rasse;Farbenschlag;Gruppe\nHühner;Testhuhn;weiß;x 1\nHühner;Testhuhn;schwarz;\nHühner;Probehuhn;rot\nTauben;Testtaube;blau;Y");
    expect(fehler).toEqual([]);
    const rassen = baum.sparten.flatMap((s) => s.rassen);
    expect(rassen.map((r) => [r.name, r.gruppe])).toEqual([["Testhuhn", "X1"], ["Probehuhn", ""], ["Testtaube", "Y"]]);
  });

  test("ohne Kopfzeile zählt die vierte Spalte nur, wenn sie wie eine Gruppe aussieht", () => {
    const { baum, fehler } = parseStammdatenCsv("Hühner,Testhuhn,blau,X1\nHühner,Testhuhn,blau, gesäumt");
    expect(baum.sparten[0]!.rassen[0]!.gruppe).toBe("X1");
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("mehr als drei Spalten");
  });

  test("ungültige Gruppe, abweichende Gruppe derselben Rasse und eine fünfte Spalte werden gemeldet", () => {
    const { baum, fehler } = parseStammdatenCsv("Sparte;Rasse;Farbenschlag;Gruppe\nHühner;Testhuhn;weiß;X1\nHühner;Testhuhn;rot;Y\nHühner;Testhuhn;gelb;viel zu lange Gruppe\nHühner;Testhuhn;blau;X1;mehr");
    expect(baum.sparten[0]!.rassen[0]!.gruppe).toBe("X1");
    expect(baum.sparten[0]!.rassen[0]!.farbenschlaege).toEqual(["weiß", "rot"]);
    expect(fehler).toHaveLength(3);
    expect(fehler[0]).toBe("Zeile 3: andere Gruppe für Testhuhn (Y) – es gilt X1.");
    expect(fehler[1]).toContain("Gruppe ungültig");
    expect(fehler[2]).toContain("mehr als vier Spalten");
  });
});
