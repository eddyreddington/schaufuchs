import { describe, expect, test } from "bun:test";
import { bankarbeitstag, erzeugeSepaLastschrift, fruehesteFaelligkeit, mandatGueltig, mandatLoeschbar, vorgeschlageneFaelligkeit, pruefeGlaeubigerId, pruefeMandatsreferenz } from "./lastschrift";

describe("SEPA-Lastschrift", () => {
  test("Gläubiger-ID: Aufbau und Prüfziffer (Geschäftsbereich zählt nicht mit)", () => {
    expect(pruefeGlaeubigerId("DE98ZZZ09999999999")).toBeNull();
    expect(pruefeGlaeubigerId("de98 zzz 0999 9999 999")).toBeNull();
    expect(pruefeGlaeubigerId("DE98ABC09999999999")).toBeNull();
    expect(pruefeGlaeubigerId("DE97ZZZ09999999999")).toMatch(/Prüfziffer/);
    expect(pruefeGlaeubigerId("DE98ZZZ0999")).toMatch(/18 Zeichen/);
    expect(pruefeGlaeubigerId("")).toMatch(/fehlt/);
  });

  test("Mandatsreferenz: 1 bis 35 erlaubte Zeichen, ohne Leerzeichen", () => {
    expect(pruefeMandatsreferenz("SF-A12-1")).toBeNull();
    expect(pruefeMandatsreferenz("")).toMatch(/fehlt/);
    expect(pruefeMandatsreferenz("A".repeat(36))).toMatch(/35/);
    expect(pruefeMandatsreferenz("SF A12")).toMatch(/Zeichen/);
    expect(pruefeMandatsreferenz("SF_A12")).toMatch(/Zeichen/);
  });

  test("Mandat gültig: unterschrieben, nicht widerrufen, 36 Monate seit letzter Nutzung, einmalig nur einmal", () => {
    const m = { unterschriebenAm: "2024-01-10", widerrufenAm: null, letzteNutzungAm: null, wiederkehrend: true };
    expect(mandatGueltig(m, "2026-11-15")).toBeNull();
    expect(mandatGueltig({ ...m, unterschriebenAm: "2026-12-01" }, "2026-11-15")).toMatch(/noch nicht/);
    expect(mandatGueltig({ ...m, widerrufenAm: "2026-01-01" }, "2026-11-15")).toMatch(/widerrufen/);
    expect(mandatGueltig({ ...m, unterschriebenAm: "2023-01-10" }, "2026-11-15")).toMatch(/36 Monate/);
    expect(mandatGueltig({ ...m, unterschriebenAm: "2023-01-10", letzteNutzungAm: "2025-11-20" }, "2026-11-15")).toBeNull();
    expect(mandatGueltig({ ...m, wiederkehrend: false, letzteNutzungAm: "2026-01-01" }, "2026-11-15")).toMatch(/einmalig/);
  });

  test("Mandat löschen: 14 Monate nach Widerruf bzw. nach dem Verfall", () => {
    const m = { unterschriebenAm: "2026-01-10", letzteNutzungAm: null, widerrufenAm: null };
    expect(mandatLoeschbar({ ...m, widerrufenAm: "2026-03-01" }, "2027-04-30")).toBe(false);
    expect(mandatLoeschbar({ ...m, widerrufenAm: "2026-03-01" }, "2027-05-01")).toBe(true);
    expect(mandatLoeschbar(m, "2030-03-09")).toBe(false); // 49 Monate
    expect(mandatLoeschbar(m, "2030-03-10")).toBe(true); // 36 + 14 Monate ohne Nutzung
    expect(mandatLoeschbar({ ...m, letzteNutzungAm: "2028-01-10" }, "2030-03-10")).toBe(false);
  });

  test("Früheste Fälligkeit: zwei Tage Vorlauf, kein Wochenende, kein Bankfeiertag", () => {
    expect(fruehesteFaelligkeit("2026-11-16")).toBe("2026-11-18"); // Montag → Mittwoch
    expect(fruehesteFaelligkeit("2026-11-19")).toBe("2026-11-23"); // Donnerstag → Samstag → Montag
    expect(fruehesteFaelligkeit("2026-12-23")).toBe("2026-12-28"); // 25./26.12. Feiertag, 27. Sonntag
    expect(fruehesteFaelligkeit("2027-03-24")).toBe("2027-03-30"); // Karfreitag 26.3., Ostermontag 29.3.
    // Heute kein Bankarbeitstag: gezählt wird ab dem nächsten (der Einreichungstag muss ein Bankarbeitstag sein).
    expect(fruehesteFaelligkeit("2026-11-21")).toBe("2026-11-24"); // Samstag → Montag, Dienstag
    expect(fruehesteFaelligkeit("2027-03-26")).toBe("2027-03-31"); // Karfreitag → 30., 31.
    expect(fruehesteFaelligkeit("2026-11-20")).toBe("2026-11-24"); // Freitag → Montag, Dienstag
  });

  test("Bankarbeitstag und vorgeschlagene Fälligkeit (14 Tage für die Vorabankündigung)", () => {
    expect(bankarbeitstag("2026-11-23")).toBe(true);
    expect(bankarbeitstag("2026-11-22")).toBe(false); // Sonntag
    expect(bankarbeitstag("2026-12-25")).toBe(false);
    expect(vorgeschlageneFaelligkeit("2026-11-16")).toBe("2026-11-30"); // Montag + 14 = Montag
    expect(vorgeschlageneFaelligkeit("2026-11-14")).toBe("2026-11-30"); // Samstag + 14 = Samstag → Montag
    expect(vorgeschlageneFaelligkeit("2026-12-11")).toBe("2026-12-28"); // 25.12. Feiertag … 28.
  });

  const auftrag = {
    nachrichtId: "SF-L1-20261120",
    erstelltAm: new Date("2026-11-15T10:00:00Z"),
    faelligAm: "2026-11-20",
    glaeubiger: { name: "Musterverein e. V.", iban: "DE02120300000000202051", bic: "BYLADEM1001", glaeubigerId: "DE98ZZZ09999999999" },
    posten: [
      { endToEndId: "S1-M7", name: "Müller, Grete & Sohn", iban: "DE02100500000054540402", betragCent: 2350, verwendungszweck: "Meldegeld Schau", mandatsreferenz: "SF-A7-1", unterschriebenAm: "2025-10-01", wiederkehrend: true },
      { endToEndId: "S1-M8", name: "Karl Muster", iban: "DE02300209000106531065", betragCent: 1100, verwendungszweck: "Meldegeld Schau", mandatsreferenz: "SF-A8-1", unterschriebenAm: "2026-11-01", wiederkehrend: false },
    ],
  };

  test("pain.008: je Sequenz ein Block, Summen, Gläubiger-ID, Mandat, Zeichensatz", () => {
    const x = erzeugeSepaLastschrift(auftrag);
    expect(x).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08"');
    expect(x).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(x).toContain("<CtrlSum>34.50</CtrlSum>");
    expect(x.match(/<PmtInf>/g)).toHaveLength(2);
    expect(x).toContain("<SeqTp>RCUR</SeqTp>");
    expect(x).toContain("<SeqTp>OOFF</SeqTp>");
    expect(x).toContain("<Cd>CORE</Cd>");
    expect(x).toContain("<ReqdColltnDt>2026-11-20</ReqdColltnDt>");
    expect(x).toContain("<Id>DE98ZZZ09999999999</Id>");
    expect(x).toContain("<MndtId>SF-A7-1</MndtId>");
    expect(x).toContain("<DtOfSgntr>2025-10-01</DtOfSgntr>");
    expect(x).toContain("<Nm>Mueller, Grete + Sohn</Nm>");
    expect(x).toContain("<BICFI>BYLADEM1001</BICFI>");
  });

  test("pain.008: ungültige Angaben werfen", () => {
    expect(() => erzeugeSepaLastschrift({ ...auftrag, posten: [] })).toThrow("Keine Lastschriften");
    expect(() => erzeugeSepaLastschrift({ ...auftrag, glaeubiger: { ...auftrag.glaeubiger, glaeubigerId: "DE97ZZZ09999999999" } })).toThrow("Gläubiger");
    expect(() => erzeugeSepaLastschrift({ ...auftrag, posten: [{ ...auftrag.posten[0]!, iban: "DE00123" }] })).toThrow("Müller");
    expect(() => erzeugeSepaLastschrift({ ...auftrag, posten: [{ ...auftrag.posten[0]!, betragCent: 0 }] })).toThrow("positiv");
    expect(() => erzeugeSepaLastschrift({ ...auftrag, posten: [{ ...auftrag.posten[0]!, mandatsreferenz: "a b" }] })).toThrow("Mandatsreferenz");
  });
});
