import { describe, expect, test } from "bun:test";
import { migrationsverzeichnisFehler, offeneMigrationen, schautageLaufen, type SchauZeitraum } from "./gesundheitspruefung";

/** Bewertung Freitag, geöffnet Samstag und Sonntag – Einlieferung am Donnerstag. */
const dezember: SchauZeitraum = {
  test: false,
  phase: "meldung",
  bewertungAm: "2026-12-11",
  oeffnungszeiten: "Sa 12.12. 9–17 Uhr\nSo 13.12. 9–15 Uhr",
};

describe("schautageLaufen", () => {
  test("vom Tag vor der Bewertung bis zum letzten Öffnungstag", () => {
    expect(schautageLaufen([dezember], "2026-12-09")).toBe(false);
    expect(schautageLaufen([dezember], "2026-12-10")).toBe(true);
    expect(schautageLaufen([dezember], "2026-12-11")).toBe(true);
    expect(schautageLaufen([dezember], "2026-12-13")).toBe(true);
    expect(schautageLaufen([dezember], "2026-12-14")).toBe(false);
  });

  test("Bewertung zwei Tage vor der Öffnung: ab dem Tag vor der Bewertung", () => {
    const s = { ...dezember, bewertungAm: "2026-12-10" };
    expect(schautageLaufen([s], "2026-12-08")).toBe(false);
    expect(schautageLaufen([s], "2026-12-09")).toBe(true);
  });

  test("nur der Bewertungstag bekannt: Vortag und Bewertungstag", () => {
    const s = { ...dezember, oeffnungszeiten: "" };
    expect(schautageLaufen([s], "2026-12-10")).toBe(true);
    expect(schautageLaufen([s], "2026-12-11")).toBe(true);
    expect(schautageLaufen([s], "2026-12-12")).toBe(false);
  });

  test("Testschauen und abgeschlossene Schauen zählen nicht", () => {
    expect(schautageLaufen([{ ...dezember, test: true }], "2026-12-12")).toBe(false);
    expect(schautageLaufen([{ ...dezember, phase: "abgeschlossen" }], "2026-12-12")).toBe(false);
  });

  test("ohne Daten entscheidet die Phase", () => {
    const ohne = { ...dezember, bewertungAm: null, oeffnungszeiten: "" };
    for (const phase of ["einlieferung", "bewertung", "preise", "schau"] as const) {
      expect(schautageLaufen([{ ...ohne, phase }], "2026-12-12")).toBe(true);
    }
    for (const phase of ["vorbereitung", "meldung", "katalog", "abrechnung"] as const) {
      expect(schautageLaufen([{ ...ohne, phase }], "2026-12-12")).toBe(false);
    }
  });

  test("mit Daten zählt die Phase nicht – eine vergessene Phase hält Updates nicht auf", () => {
    expect(schautageLaufen([{ ...dezember, phase: "schau" }], "2027-01-20")).toBe(false);
  });

  test("ein verirrtes spätes Datum hält die Schautage nicht wochenlang offen", () => {
    const s = { ...dezember, oeffnungszeiten: `${dezember.oeffnungszeiten}\nAbholung der Pokale bis 20.1.2027` };
    expect(schautageLaufen([s], "2026-12-25")).toBe(true);
    expect(schautageLaufen([s], "2026-12-26")).toBe(false);
  });

  test("eine laufende Schau unter mehreren reicht", () => {
    const vorbei = { ...dezember, bewertungAm: "2026-11-06", oeffnungszeiten: "7.11. 9–17 Uhr" };
    expect(schautageLaufen([vorbei, dezember], "2026-12-12")).toBe(true);
    expect(schautageLaufen([], "2026-12-12")).toBe(false);
  });
});

describe("offeneMigrationen", () => {
  const journal = [1000, 2000, 3000];
  test("zählt die Migrationen nach der zuletzt eingespielten", () => {
    expect(offeneMigrationen(journal, null)).toBe(3);
    expect(offeneMigrationen(journal, 2000)).toBe(1);
    expect(offeneMigrationen(journal, 3000)).toBe(0);
    expect(offeneMigrationen(journal, 9000)).toBe(0);
  });
});

describe("migrationsverzeichnisFehler", () => {
  const eintrag = (idx: number, when: number, name: string) => ({ idx, when, tag: `${String(idx).padStart(4, "0")}_${name}` });
  const stand = {
    journal: [eintrag(0, 1000, "anfang"), eintrag(1, 2000, "spalte")],
    dateien: ["0000_anfang.sql", "0001_spalte.sql"],
    schnappschuesse: [
      { datei: "0000_snapshot.json", id: "a", prevId: "00000000-0000-0000-0000-000000000000" },
      { datei: "0001_snapshot.json", id: "b", prevId: "a" },
    ],
  };
  const pruefe = (aenderung: Partial<typeof stand>) => migrationsverzeichnisFehler({ ...stand, ...aenderung });

  test("ein sauberes Verzeichnis hat keine Fehler", () => {
    expect(pruefe({})).toEqual([]);
  });

  test("nach dem Merge nur umbenannt: älterer Zeitstempel als die Migration davor", () => {
    // Zweig B mergt nach Zweig A und benennt seine 0001 in 0002 um, behält aber den when-Wert von vorher.
    const journal = [...stand.journal, { idx: 2, when: 1500, tag: "0002_andere" }];
    const fehler = pruefe({ journal, dateien: [...stand.dateien, "0002_andere.sql"] });
    expect(fehler.join("\n")).toContain("0002_andere");
    expect(fehler.join("\n")).toContain("übersprungen");
  });

  test("gleiche Nummer zweimal, Lücken und fehlende oder überzählige Dateien", () => {
    expect(pruefe({ dateien: [...stand.dateien, "0001_andere.sql"] }).join("\n")).toContain("0001_andere.sql");
    expect(pruefe({ journal: [stand.journal[0]!, eintrag(2, 2000, "spalte")], dateien: ["0000_anfang.sql", "0002_spalte.sql"] }).join("\n")).toContain("0002_spalte");
    expect(pruefe({ dateien: ["0000_anfang.sql"] }).join("\n")).toContain("0001_spalte.sql");
    expect(pruefe({ journal: [stand.journal[0]!, { ...stand.journal[1]!, tag: "0002_spalte" }] }).length).toBeGreaterThan(0);
  });

  test("Schnappschüsse müssen eine Kette bilden", () => {
    const schnappschuesse = [stand.schnappschuesse[0]!, { datei: "0001_snapshot.json", id: "b", prevId: "x" }];
    expect(pruefe({ schnappschuesse }).join("\n")).toContain("0001_snapshot.json");
    expect(pruefe({ schnappschuesse: [stand.schnappschuesse[0]!] }).join("\n")).toContain("0001_snapshot.json");
  });
});
