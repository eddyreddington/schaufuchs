import { describe, expect, test } from "bun:test";
import { STEUER_VORGABE } from "./spenden";
import { bescheidSatz, betragFelder, HINWEIS, MITGLIEDSBEITRAG_SATZ, sachSaetze, verwendungSatz } from "./zuwendungsbestaetigung";

const st = { ...STEUER_VORGABE, gemeinnuetzig: true, finanzamt: "Musterstadt", steuernummer: "12/345/67890", bescheidDatum: "2024-03-15", veranlagungszeitraum: "2022", zwecke: "der Tierzucht" };

describe("Amtlicher Wortlaut (BMF 7.11.2013)", () => {
  test("Freistellungsbescheid und Feststellung nach § 60a AO", () => {
    expect(bescheidSatz(st)).toBe(
      "Wir sind wegen Förderung der Tierzucht nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes Musterstadt StNr. 12/345/67890, vom 15.03.2024 für den letzten Veranlagungszeitraum 2022 nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.",
    );
    expect(bescheidSatz({ ...st, bescheidArt: "feststellung60a" })).toBe(
      "Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde vom Finanzamt Musterstadt, StNr. 12/345/67890 mit Bescheid vom 15.03.2024 nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung der Tierzucht.",
    );
    expect(verwendungSatz(st)).toBe("Es wird bestätigt, dass die Zuwendung nur zur Förderung der Tierzucht verwendet wird.");
  });

  test("Hinweise, Mitgliedsbeitrag, Betrag in Buchstaben", () => {
    expect(HINWEIS[0]).toContain("haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG).");
    expect(HINWEIS[1]).toEndWith("seit Ausstellung des Bescheides zurückliegt (§ 63 Abs. 5 AO).");
    expect(MITGLIEDSBEITRAG_SATZ).toBe("Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt, dessen Abzug nach § 10b Abs. 1 des Einkommensteuergesetzes ausgeschlossen ist.");
    expect(betragFelder(12_350)).toEqual({ ziffern: "123,50\u00a0€", buchstaben: "einhundertdreiundzwanzig Euro und fünfzig Cent" });
  });

  test("Sachzuwendung: nur die zutreffenden Sätze", () => {
    expect(sachSaetze({ bezeichnung: "Käfig", herkunft: "privat", unterlagen: false })).toEqual(["Die Sachzuwendung stammt nach den Angaben des Zuwendenden aus dem Privatvermögen."]);
    expect(sachSaetze({ bezeichnung: "Käfig", herkunft: "unbekannt", unterlagen: true })).toHaveLength(2);
  });
});
