import { describe, expect, test } from "bun:test";
import { reiterAusAnker } from "./reiter-anker";

describe("Reiter aus dem Anker der Adresse", () => {
  const ids = ["schau", "druck", "einteilung-nummern"] as const;
  test("eigener Reiter, auch mit Umlauten und Kodierung", () => {
    expect(reiterAusAnker("#druck", ids)).toBe("druck");
    expect(reiterAusAnker("druck", ids)).toBe("druck");
    expect(reiterAusAnker("#einteilung-nummern", ids)).toBe("einteilung-nummern");
    expect(reiterAusAnker("#k%C3%A4fige", ["käfige"] as const)).toBe("käfige");
  });
  test("Anker eines Abschnitts innerhalb eines Reiters", () => {
    expect(reiterAusAnker("#impressum", ["angaben", "steuer"] as const, { impressum: "angaben" })).toBe("angaben");
  });
  test("unbekannt oder leer: kein Reiter (die Seite bleibt beim gewählten)", () => {
    expect(reiterAusAnker("", ids)).toBeUndefined();
    expect(reiterAusAnker("#gibt-es-nicht", ids)).toBeUndefined();
    expect(reiterAusAnker("#%E0%A4%A", ids)).toBeUndefined();
    // Namen aus Object.prototype sind kein Reiter, auch wenn es eine Zuordnung gibt.
    expect(reiterAusAnker("#constructor", ids, {})).toBeUndefined();
    expect(reiterAusAnker("#toString", ids, { impressum: "schau" })).toBeUndefined();
  });
});
