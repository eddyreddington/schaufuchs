import { describe, expect, test } from "bun:test";
import { ueberlappt } from "./hallenplan";

describe("Überlappung zweier Rechtecke im Hallenplan", () => {
  const a = { x: 0, y: 0, b: 100, h: 50 };
  test("echte Überschneidung ja, Berühren und Rundung bis 0,5 cm nein", () => {
    expect(ueberlappt(a, { x: 50, y: 20, b: 100, h: 50 })).toBe(true);
    expect(ueberlappt(a, { x: 100, y: 0, b: 50, h: 50 })).toBe(false); // berührt
    expect(ueberlappt(a, { x: 99.6, y: 0, b: 50, h: 50 })).toBe(false); // 0,4 cm: Rundung
    expect(ueberlappt(a, { x: -99.5, y: 0, b: 100, h: 50 })).toBe(false); // genau 0,5 cm: noch Rundung
    expect(ueberlappt(a, { x: 99, y: 0, b: 50, h: 50 })).toBe(true);
    expect(ueberlappt(a, { x: 99, y: 0, b: 50, h: 50 }, 2)).toBe(false);
    expect(ueberlappt({ x: 50, y: 20, b: 100, h: 50 }, a)).toBe(true); // symmetrisch
  });
});
