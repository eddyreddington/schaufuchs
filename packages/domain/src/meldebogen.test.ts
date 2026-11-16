import { describe, expect, test } from "bun:test";
import { A_BOGEN_LEERZEILEN, A_BOGEN_NACHTRAG, aBogenZeilen, type ABogenTier } from "./meldebogen";

const tier = (position: number, teil: Partial<ABogenTier> = {}): ABogenTier => ({
  rasse: "Wyandotten",
  farbenschlag: "weiß",
  art: "einzeltier",
  geschlecht: "1,0",
  alter: "jung",
  ringnummern: "",
  verkaufspreisCent: null,
  eigeneZucht: true,
  istAoc: false,
  istNeuzuechtung: false,
  position,
  ...teil,
});

describe("A-Bogen (Meldebogen)", () => {
  test("leerer Bogen: nur nummerierte Schreibzeilen", () => {
    const z = aBogenZeilen([]);
    expect(z).toHaveLength(A_BOGEN_LEERZEILEN);
    expect(z.map((x) => x.nr)).toEqual(Array.from({ length: A_BOGEN_LEERZEILEN }, (_, i) => String(i + 1)));
    expect(z.every((x) => !x.rasse && !x.art && x.preisCent == null && !x.eigeneZucht)).toBe(true);
  });

  test("vorausgefüllt: Tiere in der gemeldeten Reihenfolge mit Kürzeln, dann Platz für Nachträge", () => {
    const z = aBogenZeilen([
      tier(2, { geschlecht: "0,1", alter: "alt", ringnummern: "D 26 AZ 7", verkaufspreisCent: 2500 }),
      tier(1),
      tier(3, { art: "stamm", geschlecht: "1,2", eigeneZucht: false, rasse: "Orpington", farbenschlag: "gelb" }),
    ]);
    expect(z).toHaveLength(3 + A_BOGEN_NACHTRAG);
    expect(z.slice(0, 3).map((x) => [x.nr, x.rasse, x.art, x.geschlecht, x.alter, x.ring, x.preisCent, x.eigeneZucht])).toEqual([
      ["1", "Wyandotten", "E", "1,0", "j", "", null, true],
      ["2", "Wyandotten", "E", "0,1", "a", "D 26 AZ 7", 2500, true],
      ["3", "Orpington", "S", "1,2", "j", "", null, false],
    ]);
    expect(z.slice(3).every((x) => !x.rasse)).toBe(true);
    expect(z.at(-1)!.nr).toBe(String(3 + A_BOGEN_NACHTRAG));
  });

  test("AOC und Neuzüchtung als Kennzeichen hinter der Rasse", () => {
    const z = aBogenZeilen([tier(1, { rasse: "Zwerg-Sundheimer", istAoc: true }), tier(2, { rasse: "Neue Taube", istNeuzuechtung: true })]);
    expect(z.slice(0, 2).map((x) => x.rasse)).toEqual(["Zwerg-Sundheimer (AOC)", "Neue Taube (Neuzüchtung)"]);
  });

  test("Kürzel aller Meldearten", () => {
    expect(aBogenZeilen([tier(1, { art: "voliere" }), tier(2, { art: "bruteier" })]).slice(0, 2).map((x) => x.art)).toEqual(["V", "B"]);
  });
});
