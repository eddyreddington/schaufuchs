import { describe, expect, test } from "bun:test";
import { standAbgleichen } from "./stand-abgleich";

describe("Abgleich nach „inzwischen geändert“", () => {
  const basis = { name: "Schau", ort: "Halle", iban: "", folge: null as number[] | null };
  test("eigene Änderungen bleiben, fremde werden übernommen", () => {
    const r = standAbgleichen(basis, { ...basis, ort: "Neue Halle" }, { ...basis, iban: "DE89370400440532013000" });
    expect(r.daten).toEqual({ name: "Schau", ort: "Neue Halle", iban: "DE89370400440532013000", folge: null });
    expect(r.beidseitig).toEqual([]);
  });
  test("beidseitig verschieden geändert: eigene Eingabe gilt und wird genannt; gleich geändert zählt nicht", () => {
    const r = standAbgleichen(basis, { ...basis, name: "Eigen", ort: "Gleich", folge: [1, 2] }, { ...basis, name: "Fremd", ort: "Gleich", folge: [2, 1] });
    expect(r.daten).toEqual({ name: "Eigen", ort: "Gleich", iban: "", folge: [1, 2] });
    expect(r.beidseitig).toEqual(["name", "folge"]);
  });
});
