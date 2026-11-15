import { describe, expect, test } from "bun:test";
import { datumKurz, heuteBerlin, tagBerlin } from "./datum";

describe("Datum in deutscher Zeit", () => {
  test("nach Mitternacht in Deutschland ist schon der nächste Tag, in UTC noch nicht", () => {
    expect(tagBerlin(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16"); // Winterzeit, UTC+1
    expect(tagBerlin(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16"); // Sommerzeit, UTC+2
    expect(tagBerlin(new Date("2026-07-15T21:30:00Z"))).toBe("2026-07-15");
    expect(heuteBerlin(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });

  test("Kurzform TT.MM.JJJJ", () => {
    expect(datumKurz("2026-11-05")).toBe("05.11.2026");
  });
});
