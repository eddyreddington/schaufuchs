import { describe, expect, test } from "bun:test";
import type { SzeneTuer } from "./hallenplan-3d";
import { haupteingang, vorneSeite } from "./hallenplan-3d-eingang";

/** Tür in der Wand einer Halle 20 × 40 m (Szene): an x0/x1 entlang z, an z0/z1 entlang x. */
function tuer(name: string, seite: "x0" | "x1" | "z0" | "z1", von: number, breite: number): SzeneTuer {
  const q =
    seite === "x0" ? { x: -25, z: von, b: 25, t: breite } : seite === "x1" ? { x: 2000, z: von, b: 25, t: breite } : seite === "z0" ? { x: von, z: -25, b: breite, t: 25 } : { x: von, z: 4000, b: breite, t: 25 };
  return { name, notausgang: /not/.test(name.toLowerCase()), art: "wand", fluegel: 1, wand: 0, q: { ...q, y: 0, h: 220 } };
}
const szene = (...tueren: SzeneTuer[]) => ({ breite: 2000, laenge: 4000, tueren });

describe("Haupteingang", () => {
  test("Seite mit den meisten Eingängen, dort der breiteste; Notausgänge zählen nicht", () => {
    const s = szene(tuer("Notausgang 1", "z1", 500, 200), tuer("Notausgang 2", "z1", 1200, 200), tuer("Eingang Nord", "x0", 1000, 250), tuer("Eingang Süd", "x0", 3000, 150), tuer("Tor", "z0", 800, 400));
    expect(haupteingang(s)!.tuer.name).toBe("Eingang Nord");
    expect(vorneSeite(s)).toBe("x0");
  });

  test("Gleichstand: die Seite mit mehr Breite; Nebeneingang zuletzt", () => {
    const s = szene(tuer("Seiteneingang", "x0", 200, 120), tuer("Nebeneingang", "z1", 300, 300), tuer("Eingang", "z1", 1200, 200), tuer("Eingang 3", "x0", 2000, 100));
    expect(haupteingang(s)).toMatchObject({ tuer: { name: "Eingang" }, seite: "z1" });
  });

  test("ein „Haupteingang“ geht vor", () => {
    const s = szene(tuer("Eingang A", "x1", 200, 200), tuer("Eingang B", "x1", 2000, 200), tuer("Haupteingang", "z0", 900, 200));
    expect(haupteingang(s)).toMatchObject({ tuer: { name: "Haupteingang" }, seite: "z0" });
  });

  test("ohne Eingang: keiner, Parkplatz unten", () => {
    expect(haupteingang(szene(tuer("Notausgang", "x0", 100, 120)))).toBeNull();
    expect(vorneSeite(szene())).toBe("z1");
  });
});
