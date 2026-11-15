import { describe, expect, test } from "bun:test";
import { KATALOG_GLIEDERUNG, KATALOG_TEILE, seitenbereiche } from "./schriften";

describe("Gliederung des Katalogs", () => {
  test("jeder abwählbare Teil steht genau einmal in der Gliederung, die Schlüssel sind eindeutig", () => {
    const teile = KATALOG_GLIEDERUNG.flatMap((g) => ("teil" in g ? [g.teil] : []));
    expect([...teile].sort()).toEqual([...KATALOG_TEILE].sort());
    expect(new Set(KATALOG_GLIEDERUNG.map((g) => g.schluessel)).size).toBe(KATALOG_GLIEDERUNG.length);
  });

  test("Seitenbereiche: bis vor den nächsten Teil, gemeinsame Seite bei Beginn mitten auf der Seite", () => {
    expect(
      seitenbereiche(
        [
          { schluessel: "titel", seite: 1 },
          { schluessel: "inhalt", seite: 2 },
          { schluessel: "tierteil", seite: 3 },
          { schluessel: "rassenverzeichnis", seite: 9 },
          { schluessel: "bildnachweis", seite: 10, mitten: true },
          { schluessel: "notizen", seite: 12 },
        ],
        14,
      ),
    ).toEqual([
      { schluessel: "titel", von: 1, bis: 1 },
      { schluessel: "inhalt", von: 2, bis: 2 },
      { schluessel: "tierteil", von: 3, bis: 8 },
      { schluessel: "rassenverzeichnis", von: 9, bis: 10 },
      { schluessel: "bildnachweis", von: 10, bis: 11 },
      { schluessel: "notizen", von: 12, bis: 14 },
    ]);
    // Unsortierte Marken (das Inhaltsverzeichnis wird zuletzt gefüllt) ergeben dieselbe Ordnung.
    expect(seitenbereiche([{ schluessel: "inhalt", seite: 2 }, { schluessel: "titel", seite: 1 }], 2).map((b) => b.schluessel)).toEqual(["titel", "inhalt"]);
  });
});

describe("Farben und Vorgaben der Gestaltung", () => {
  test("alle Vorschlagsfarben und Paletten sind gültige Farben, Hauptfarben tragen weiße Schrift", async () => {
    const { KATALOG_FARBFAMILIEN, KATALOG_PALETTEN, kontrastZuWeiss } = await import("./schriften");
    const farben = [...KATALOG_FARBFAMILIEN.flatMap((f) => f.farben.map(([w]) => w)), ...KATALOG_PALETTEN.flatMap((p) => [p.haupt, p.akzent])];
    for (const f of farben) expect(f).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(KATALOG_FARBFAMILIEN.flatMap((f) => f.farben.map(([w]) => w))).size).toBe(42);
    // Hauptfarben sind Flächen mit Schrift darauf (Titel, Spartenbänder): mindestens 4,5 zu Weiß.
    for (const p of KATALOG_PALETTEN) expect(kontrastZuWeiss(p.haupt)).toBeGreaterThanOrEqual(4.5);
    expect(kontrastZuWeiss("#ffffff")).toBeCloseTo(1);
    expect(kontrastZuWeiss("#000000")).toBeCloseTo(21);
  });
});
