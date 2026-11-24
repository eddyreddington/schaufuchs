import { expect, test } from "bun:test";
import { offenCent, zahlungAuftrag } from "./meldung-zahlung";

const a = { meldungId: 7, datum: "2026-11-24", art: "bar" as const, grund: "" };
// Meldegeld 11 €, Stiftung 5 €, Spende 2 €.
const betrag = (bezahltCent: number) => ({ summeCent: 1100, stiftungCent: 500, spendeCent: 200, bezahltCent });

test("Offener Betrag der Meldung: Meldegeld, Stiftung und Spende abzüglich bezahlt", () => {
  expect(offenCent(betrag(0))).toBe(1800);
  expect(offenCent(betrag(1000))).toBe(800);
  expect(offenCent(betrag(2000))).toBe(-200);
});

test("Zahlung an der Meldung: sendet den angezeigten offenen Betrag mit – auch bei Teilzahlung und Guthaben", () => {
  expect(zahlungAuftrag({ ...a, betragCent: 1800, betrag: betrag(0) }).erwartetOffenCent).toBe(1800);
  // Teilzahlung: erwartet bleibt, was offen angezeigt war (nicht der eingegebene Betrag).
  expect(zahlungAuftrag({ ...a, betragCent: 500, betrag: betrag(1000) }).erwartetOffenCent).toBe(800);
  // Guthaben (negativ offen) und Erstattung: der Server vergleicht mit dem echten Stand, nicht mit dem Vorschlag 0.
  expect(zahlungAuftrag({ ...a, betragCent: -200, grund: "Erstattung", betrag: betrag(2000) })).toEqual({ ...a, betragCent: -200, grund: "Erstattung", erwartetOffenCent: -200 });
});
