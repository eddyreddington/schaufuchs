import { expect, test } from "bun:test";
import { onlineAbgelaufen } from "./datenschutz";

test("Ergebnisse und Katalog stehen 12 Monate nach der Schau im Internet", () => {
  expect(onlineAbgelaufen("2026-12-12", "2027-12-12")).toBe(false);
  expect(onlineAbgelaufen("2026-12-12", "2027-12-13")).toBe(true);
  expect(onlineAbgelaufen(null, "2099-01-01")).toBe(false);
});

import { ringjahrPasst } from "./katalog";
test("Ringjahr: Jungtier mit Ring des Schaujahres", () => {
  expect(ringjahrPasst("DE 26 1234", "jung", 2026)).toBe(true);
  expect(ringjahrPasst("DE 25 1234", "jung", 2026)).toBe(false);
  expect(ringjahrPasst("DE 25 1234", "alt", 2026)).toBe(true);
  expect(ringjahrPasst("A 1234", "jung", 2026)).toBe(true);
  expect(ringjahrPasst("", "jung", 2026)).toBe(true);
});
