import { describe, expect, test } from "bun:test";
import {
  KATALOG_FAMILIEN,
  KATALOG_GROESSEN,
  KATALOG_GROESSEN_STUFEN,
  KATALOG_SCHRIFT_FAMILIE,
  katalogGroessen,
  katalogSchriftsatz,
  schnittDatei,
} from "./katalog-typografie";
import { KATALOG_SCHRIFTEN } from "./schriften";

describe("Katalog-Typografie (Entscheidung 032)", () => {
  test("jede Schriftwahl hat genau eine Familie; eine Auszeichnung nur, wo die Wahl sie ausdrücklich nennt", () => {
    for (const schrift of KATALOG_SCHRIFTEN) {
      const satz = katalogSchriftsatz(schrift);
      const familie = KATALOG_FAMILIEN[KATALOG_SCHRIFT_FAMILIE[schrift].familie];
      // Normal, fett und kursiv stammen aus derselben Familie.
      for (const d of [satz.normal, satz.fett, satz.kursiv]) expect(Object.values(familie.dateien) as string[]).toContain(d);
      expect(satz.pdfNamen).toEqual([familie.pdfName]);
      const titel = KATALOG_SCHRIFT_FAMILIE[schrift].titel;
      if (titel) {
        expect(satz.titel).toBe(KATALOG_FAMILIEN[titel].dateien.normal);
        expect(satz.titelPdfName).toBe(KATALOG_FAMILIEN[titel].pdfName);
      } else {
        expect(satz.titel).toBeNull();
        expect(satz.titelPdfName).toBeNull();
      }
    }
    // Die bisherige Vorgabe bleibt die schmale Plex, durchgehend.
    expect(KATALOG_SCHRIFT_FAMILIE.klassisch).toEqual({ familie: "plexSchmal" });
    // Höchstens zwei Wahlen mit Auszeichnung, die übrigen ganz in einer Familie.
    expect(KATALOG_SCHRIFTEN.filter((s) => KATALOG_SCHRIFT_FAMILIE[s].titel)).toEqual(["buchschmal", "ausgewogen"]);
  });

  test("fehlt ein Schnitt, ersetzt ihn die Regular derselben Familie – nie eine fremde Schrift", () => {
    const ohneKursiv = { normal: "X-Regular.ttf", fett: "X-Bold.ttf" };
    expect(schnittDatei(ohneKursiv, "kursiv")).toBe("X-Regular.ttf");
    expect(schnittDatei(ohneKursiv, "fett")).toBe("X-Bold.ttf");
    expect(schnittDatei({ normal: "Y.ttf" }, "fett")).toBe("Y.ttf");
    expect(schnittDatei({ normal: "Y.ttf" }, "kursiv")).toBe("Y.ttf");
  });

  test("Größenstufen: fest (A5-Heft), absteigend, auf A4 alle im selben Verhältnis größer", () => {
    expect(KATALOG_GROESSEN_STUFEN).toEqual(["titel", "h1", "h2", "h3", "text", "liste", "klein", "fein"]);
    const werte = KATALOG_GROESSEN_STUFEN.map((s) => KATALOG_GROESSEN[s]);
    for (let i = 1; i < werte.length; i++) expect(werte[i]!).toBeLessThan(werte[i - 1]!);
    expect(katalogGroessen(1)).toEqual(KATALOG_GROESSEN);
    const a4 = katalogGroessen(1.22);
    for (const s of KATALOG_GROESSEN_STUFEN) expect(a4[s]).toBeCloseTo(KATALOG_GROESSEN[s] * 1.22, 6);
    // Lesbar bleibt auch die kleinste Stufe im A5-Heft.
    expect(KATALOG_GROESSEN.fein).toBeGreaterThanOrEqual(6);
  });
});
