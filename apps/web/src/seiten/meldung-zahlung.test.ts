import { expect, test } from "bun:test";
import { zahlungAuftrag } from "./meldung-zahlung";

test("Zahlung an der Meldung: sendet den angezeigten offenen Betrag mit – auch bei Teilzahlung und Guthaben", () => {
  const a = { meldungId: 7, datum: "2026-11-24", art: "bar" as const, grund: "" };
  expect(zahlungAuftrag({ ...a, betragCent: 1100, angezeigtOffenCent: 1100 }).erwartetOffenCent).toBe(1100);
  // Teilzahlung: erwartet bleibt, was offen angezeigt war (nicht der eingegebene Betrag).
  expect(zahlungAuftrag({ ...a, betragCent: 500, angezeigtOffenCent: 1100 }).erwartetOffenCent).toBe(1100);
  // Guthaben (negativ offen) und Erstattung: der Server vergleicht mit dem echten Stand, nicht mit dem Vorschlag 0.
  expect(zahlungAuftrag({ ...a, betragCent: -300, grund: "Erstattung", angezeigtOffenCent: -300 })).toEqual({ ...a, betragCent: -300, grund: "Erstattung", erwartetOffenCent: -300 });
});
