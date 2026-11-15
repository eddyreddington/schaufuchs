import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, type PlanTier } from "./hallenplan";
import { rundgang, RUNDGANG_HOEHE, RUNDGANG_UEBER } from "./hallenplan-3d-rundgang";

const tiere: PlanTier[] = Array.from({ length: 160 }, (_, i) => ({ id: i + 1, typ: "huehner" as const, nr: String(i + 1), rasse: "Wyandotten", preisrichterId: null }));

describe("Rundgang durch die Gänge", () => {
  test("Schlangenlinie durch alle Gänge mit Käfigen, in Augenhöhe, in der Halle", () => {
    const halle = { ...HALLE_STANDARD, breite: 2000, laenge: 4000 };
    const plan = planeHalle(halle, tiere, null);
    const r = rundgang(halle, plan);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(r.every((p) => p.x >= 0 && p.x <= halle.breite && p.z >= 0 && p.z <= halle.laenge)).toBe(true);
    const unten = r.filter((p) => p.y === RUNDGANG_HOEHE);
    expect(unten.length).toBeGreaterThanOrEqual(4);
    // Hin und zurück: die Laufrichtung wechselt von Gang zu Gang.
    const laengs = plan.quer ? "x" : "z";
    const richtung = (a: number, b: number) => Math.sign(unten[b]![laengs] - unten[a]![laengs]);
    expect(richtung(0, 1)).toBe(-richtung(2, 3));
    // Über Reihenenden nur angehoben, nie in Käfighöhe hindurch.
    expect(r.every((p) => p.y === RUNDGANG_HOEHE || p.y === RUNDGANG_UEBER)).toBe(true);
  });

  test("ohne Reihen kein Rundgang", () => {
    expect(rundgang(HALLE_STANDARD, planeHalle(HALLE_STANDARD, [], null))).toEqual([]);
  });
});
