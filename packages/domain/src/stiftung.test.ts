import { expect, test } from "bun:test";
import { stiftungsanteil } from "./preise";

/** Vergibt nacheinander `n` Preise aus einer Stiftung und liefert die Beträge. */
function vergib(betragCent: number, anzahl: number, n: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(stiftungsanteil(betragCent - out.reduce((a, b) => a + b, 0), anzahl - out.length));
  return out;
}

test("Stiftungsbetrag verteilt sich centgenau auf die gestifteten Preise", () => {
  expect(vergib(2000, 3, 3)).toEqual([667, 667, 666]);
  expect(vergib(2000, 2, 2)).toEqual([1000, 1000]);
  expect(vergib(1001, 7, 7).reduce((a, b) => a + b, 0)).toBe(1001);
  expect(stiftungsanteil(0, 3)).toBe(0); // Sachpreis oder schon alles vergeben
  expect(stiftungsanteil(500, 0)).toBe(0); // kein Platz frei
});

test("Anteil aus dem Rest: Entfernen und geänderte Anzahl zahlen nie mehr aus als gestiftet", () => {
  // 2000 auf 3: A und B je 667; A entfernt, neu vergeben: Rest 1333 auf 2 freie Plätze -> 667, dann 666.
  expect(stiftungsanteil(2000 - 667, 2)).toBe(667);
  // 2000 auf 2 (A, B je 1000), danach Anzahl 3: Rest 0 -> 0.
  expect(stiftungsanteil(0, 1)).toBe(0);
  // 2000 auf 3, A = 667, dann Anzahl 2: Rest 1333 auf 1 Platz.
  expect(stiftungsanteil(1333, 1)).toBe(1333);
});
