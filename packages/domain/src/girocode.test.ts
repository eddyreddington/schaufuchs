import { describe, expect, test } from "bun:test";
import { GIROCODE_MAX_BYTE, giroCodeText, istRfReferenz, rfReferenz, verwendungszweckMeldegeld } from "./girocode";

describe("Referenz nach ISO 11649", () => {
  test("Prüfziffern wie unabhängig nachgerechnet, Rumpf siebenstellig", () => {
    expect(rfReferenz(1234)).toBe("RF540001234");
    expect(rfReferenz(1)).toBe("RF740000001");
    expect(rfReferenz(9_999_999)).toBe("RF169999999");
    // Größere Nummern werden länger, bleiben aber gültig.
    expect(istRfReferenz(rfReferenz(12_345_678))).toBe(true);
  });

  test("keine Referenz ist Anfang einer anderen", () => {
    const refs = [1, 12, 123, 1234, 12_345, 123_456, 1_234_567].map(rfReferenz);
    for (const a of refs) for (const b of refs) if (a !== b) expect(b.startsWith(a)).toBe(false);
  });

  test("Prüfung: Beispiel aus der Norm gültig, Tippfehler und Zahlendreher nicht", () => {
    expect(istRfReferenz("RF18 5390 0754 7034")).toBe(true);
    expect(istRfReferenz("rf18539007547034")).toBe(true);
    expect(istRfReferenz("RF18 5390 0754 7035")).toBe(false);
    expect(istRfReferenz("RF54 0001 243")).toBe(false);
    expect(istRfReferenz("RF54")).toBe(false);
    expect(istRfReferenz("DE540001234")).toBe(false);
  });

  test("ungültige Meldungsnummer", () => {
    expect(() => rfReferenz(0)).toThrow();
    expect(() => rfReferenz(1.5)).toThrow();
  });

  test("Verwendungszweck: Referenz vorn, Umlaute umgeschrieben, höchstens 140 Zeichen", () => {
    expect(verwendungszweckMeldegeld(1234, "Müller", "Jürgen")).toBe("RF540001234 Meldegeld Mueller, Juergen");
    expect(verwendungszweckMeldegeld(1, "x".repeat(300), "")).toHaveLength(140);
  });

  test("Verwendungszweck: Name nur aus Buchstaben – keine Links oder Domains (Mail mit Vereinsabsender)", () => {
    expect(verwendungszweckMeldegeld(1234, "www.spam.example", "https://x.example/a?b=1")).toBe("RF540001234 Meldegeld www spam example, https x example a b");
    expect(verwendungszweckMeldegeld(1234, "O’Neill-Smith", "Ann")).toBe("RF540001234 Meldegeld O Neill-Smith, Ann");
    expect(verwendungszweckMeldegeld(1234, "Łukasiewicz", "Zoë")).toBe("RF540001234 Meldegeld Lukasiewicz, Zoe");
    expect(verwendungszweckMeldegeld(1234, "...", "")).toBe("RF540001234 Meldegeld");
  });
});

describe("GiroCode (EPC069-12)", () => {
  const basis = { empfaenger: "Geflügelzuchtverein Musterstadt e.V.", iban: "DE89 3704 0044 0532 0130 00", betragCent: 2550, verwendungszweck: "RF540001234 Meldegeld Mueller, Juergen" };

  test("Aufbau Version 002, UTF-8, Betrag mit Punkt, Empfänger ohne Umschrift", () => {
    expect(giroCodeText(basis)!.split("\n")).toEqual([
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      "Geflügelzuchtverein Musterstadt e.V.",
      "DE89370400440532013000",
      "EUR25.50",
      "",
      "",
      "RF540001234 Meldegeld Mueller, Juergen",
    ]);
  });

  test("Beträge: ganze Euro und Cent richtig, außerhalb der Grenzen kein Code", () => {
    expect(giroCodeText({ ...basis, betragCent: 1 })!.split("\n")[7]).toBe("EUR0.01");
    expect(giroCodeText({ ...basis, betragCent: 100_000 })!.split("\n")[7]).toBe("EUR1000.00");
    expect(giroCodeText({ ...basis, betragCent: 0 })).toBeNull();
    expect(giroCodeText({ ...basis, betragCent: -500 })).toBeNull();
    expect(giroCodeText({ ...basis, betragCent: 12.5 })).toBeNull();
  });

  test("ohne gültige IBAN oder Empfänger kein Code", () => {
    expect(giroCodeText({ ...basis, iban: "DE89370400440532013001" })).toBeNull();
    expect(giroCodeText({ ...basis, empfaenger: "  " })).toBeNull();
  });

  test("BIC: im EWR freiwillig, außerhalb Pflicht, falsche BIC kein Code", () => {
    const ch = { ...basis, iban: "CH9300762011623852957" };
    expect(giroCodeText(ch)).toBeNull();
    expect(giroCodeText({ ...ch, bic: "UBSW CHZH 80A" })!.split("\n")[4]).toBe("UBSWCHZH80A");
    expect(giroCodeText({ ...basis, bic: "COBADEFF" })!.split("\n")[4]).toBe("COBADEFF");
    expect(giroCodeText({ ...basis, bic: "XYZ" })).toBeNull();
  });

  test("Name auf 70 Zeichen, Zeilenumbrüche entfernt; Inhalt bleibt unter der Höchstlänge", () => {
    const lang = giroCodeText({ ...basis, empfaenger: `Verein\n${"ä".repeat(100)}`, verwendungszweck: "ü".repeat(300) })!;
    const z = lang.split("\n");
    expect(z).toHaveLength(11);
    expect([...z[5]!]).toHaveLength(70);
    expect(z[10]).toHaveLength(140);
    expect(new TextEncoder().encode(lang).length).toBeLessThanOrEqual(GIROCODE_MAX_BYTE);
  });

  test("Name nach Zeichen gekürzt: ein Emoji an der Grenze bleibt ganz", () => {
    const name = giroCodeText({ ...basis, empfaenger: `${"a".repeat(69)}😀x` })!.split("\n")[5]!;
    expect(name).toBe(`${"a".repeat(69)}😀`);
    expect(name).not.toContain("\ufffd");
  });

  test("Höchstbetrag gerade noch, ein Cent mehr nicht", () => {
    expect(giroCodeText({ ...basis, betragCent: 99_999_999_999 })!.split("\n")[7]).toBe("EUR999999999.99");
    expect(giroCodeText({ ...basis, betragCent: 100_000_000_000 })).toBeNull();
  });

  test("Name aus Mehrbyte-Zeichen: Verwendungszweck wird gekürzt, Referenz bleibt vorn", () => {
    const text = giroCodeText({ ...basis, empfaenger: "€".repeat(70), verwendungszweck: `RF540001234 ${"x".repeat(200)}` })!;
    expect(new TextEncoder().encode(text).length).toBe(GIROCODE_MAX_BYTE);
    expect(text.split("\n")[10]!.startsWith("RF540001234 ")).toBe(true);
  });
});
