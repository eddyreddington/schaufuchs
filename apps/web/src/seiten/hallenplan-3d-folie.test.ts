import { expect, test } from "bun:test";
import { folieJetzt } from "./hallenplan-3d-folie";

test("Folie in der 3D-Ansicht: ohne eigene Wahl die gespeicherte Einstellung", () => {
  expect(folieJetzt(false, null)).toBe(false);
  expect(folieJetzt(true, null)).toBe(true);
});

test("eigene Wahl gilt, solange die gespeicherte Einstellung dieselbe bleibt; ändert sie sich (Neuladen), gilt sie sofort", () => {
  const wahl = { fuer: false, an: true };
  expect(folieJetzt(false, wahl)).toBe(true);
  // Inzwischen im Editor gespeichert: abgedeckt → die Ansicht folgt der Einstellung, ohne einen Zwischenstand.
  expect(folieJetzt(true, wahl)).toBe(true);
  expect(folieJetzt(true, { fuer: false, an: false })).toBe(true);
  expect(folieJetzt(false, { fuer: true, an: true })).toBe(false);
});
