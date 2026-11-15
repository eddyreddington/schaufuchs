import { describe, expect, test } from "bun:test";
import { oeffnungszeitenZeilen } from "./termine";

describe("Öffnungszeiten", () => {
  test("je Tag eine Zeile: Zeilenumbrüche, Semikolon und Wochentage (abgekürzt oder ausgeschrieben)", () => {
    // So steht es heute in einer Schau – alles in einer Zeile.
    expect(oeffnungszeitenZeilen("Fr. 11.12.2026 15-18 Uhr Sa. 12.11.2026 9-18 Uhr So. 13.12.2026 9-15 Uhr")).toEqual([
      "Fr. 11.12.2026 15-18 Uhr",
      "Sa. 12.11.2026 9-18 Uhr",
      "So. 13.12.2026 9-15 Uhr",
    ]);
    expect(oeffnungszeitenZeilen("Samstag 9–18 Uhr\nSonntag 9–15 Uhr")).toEqual(["Samstag 9–18 Uhr", "Sonntag 9–15 Uhr"]);
    expect(oeffnungszeitenZeilen("Sa 9–18 Uhr; So 9–15 Uhr")).toEqual(["Sa 9–18 Uhr", "So 9–15 Uhr"]);
    expect(oeffnungszeitenZeilen("Samstag, 12.12., 9–18 Uhr, Sonntag, 13.12., 9–15 Uhr")).toEqual(["Samstag, 12.12., 9–18 Uhr", "Sonntag, 13.12., 9–15 Uhr"]);
    // Kein Wochentag: bleibt, wie es ist; leer: keine Zeile.
    expect(oeffnungszeitenZeilen("09:00")).toEqual(["09:00"]);
    expect(oeffnungszeitenZeilen("  ")).toEqual([]);
    // „So“ mitten im Satz ist kein Wochentag.
    expect(oeffnungszeitenZeilen("täglich 9–18 Uhr, Einlass so früh wie möglich")).toEqual(["täglich 9–18 Uhr, Einlass so früh wie möglich"]);
  });
});
