import { describe, expect, test } from "bun:test";
import { erzeugeSepaUeberweisung, formatIban, pruefeBic, pruefeIban, sepaText, verdeckeIban } from "./sepa";

describe("SEPA", () => {
  test("IBAN-Prüfung", () => {
    expect(pruefeIban("DE89 3704 0044 0532 0130 00")).toBeNull();
    expect(pruefeIban("de89370400440532013000")).toBeNull();
    expect(pruefeIban("DE88 3704 0044 0532 0130 00")).toContain("Prüfziffer");
    expect(pruefeIban("DE89 3704 0044 0532 0130")).toContain("22 Stellen");
    expect(pruefeIban("1234")).toContain("unvollständig");
    expect(pruefeIban("AT61 1904 3002 3457 3201")).toBeNull();
    expect(formatIban("de89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });

  test("BIC-Prüfung", () => {
    expect(pruefeBic("COBADEFFXXX")).toBeNull();
    expect(pruefeBic("COBADEFF")).toBeNull();
    expect(pruefeBic("COBA")).not.toBeNull();
  });

  test("Text auf SEPA-Zeichensatz", () => {
    expect(sepaText("Jürgen Müller & Söhne", 70)).toBe("Juergen Mueller + Soehne");
    expect(sepaText("Preisgeld <Nr. 12>", 70)).toBe("Preisgeld Nr. 12");
    expect(sepaText("x".repeat(200), 140)).toHaveLength(140);
    // Buchstaben ohne Zerlegung gehen nicht verloren (Empfängerüberprüfung vergleicht den Namen).
    expect(sepaText("Željko Ørsted & Łukasz Ærø", 70)).toBe("Zeljko Orsted + Lukasz AEro");
  });

  test("Sammelüberweisung mit Summen und Escaping", () => {
    const x = erzeugeSepaUeberweisung({
      nachrichtId: "SCHAU-1-20261116",
      erstelltAm: new Date("2026-11-16T10:00:00Z"),
      ausfuehrungAm: "2026-11-17",
      auftraggeber: { name: "GZV Müllerstadt", iban: "DE89370400440532013000", bic: "" },
      posten: [
        { endToEndId: "S1-A7", name: "Jürgen Weber", iban: "DE89 3704 0044 0532 0130 00", betragCent: 1250, verwendungszweck: "Preisgeld Demo-Schau" },
        { endToEndId: "S1-A9", name: "Anja Koch", iban: "AT611904300234573201", betragCent: 3000, verwendungszweck: "Tierverkauf" },
      ],
    });
    expect(x).toContain("pain.001.001.09");
    expect(x).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(x).toContain("<CtrlSum>42.50</CtrlSum>");
    expect(x).toContain('<InstdAmt Ccy="EUR">12.50</InstdAmt>');
    expect(x).toContain("<Nm>Juergen Weber</Nm>");
    expect(x).toContain("<Id>NOTPROVIDED</Id>");
    expect(x).toContain("<Dt>2026-11-17</Dt>");
  });

  test("lehnt ungültige Angaben ab", () => {
    const basis = { nachrichtId: "X", erstelltAm: new Date(), ausfuehrungAm: "2026-11-17", auftraggeber: { name: "V", iban: "DE89370400440532013000", bic: "" } };
    expect(() => erzeugeSepaUeberweisung({ ...basis, posten: [] })).toThrow("Keine");
    // Schweiz ist SEPA, aber nicht EWR: ohne BIC und Anschrift nicht in die Sammelüberweisung.
    expect(() => erzeugeSepaUeberweisung({ ...basis, posten: [{ endToEndId: "1", name: "CH", iban: "CH9300762011623852957", betragCent: 100, verwendungszweck: "" }] })).toThrow("EWR");
    expect(() => erzeugeSepaUeberweisung({ ...basis, posten: [{ endToEndId: "1", name: "A", iban: "DE00123", betragCent: 100, verwendungszweck: "" }] })).toThrow("A:");
    expect(() => erzeugeSepaUeberweisung({ ...basis, posten: [{ endToEndId: "1", name: "A", iban: "DE89370400440532013000", betragCent: 0, verwendungszweck: "" }] })).toThrow("positiv");
  });
});

describe("verdeckeIban", () => {
  test("zeigt nur Land und die letzten vier Stellen; formatIban lässt die Kürzung stehen", () => {
    expect(verdeckeIban("DE89 3704 0044 0532 0130 00")).toBe("DE… 3000");
    expect(verdeckeIban("")).toBe("");
    expect(formatIban(verdeckeIban("DE89370400440532013000"))).toBe("DE… 3000");
    expect(formatIban("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });
});
