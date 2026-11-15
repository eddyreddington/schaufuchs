import { describe, expect, test } from "bun:test";
import { type FolgeEintrag, vergebeKatalognummern } from "./katalog";
import { teilschauenLesen, teilschauFolge, teilschauVon } from "./teilschau";

describe("Teilschauen", () => {
  test("Lesen: Namen gekürzt, leere und doppelte weg, Kennungen bleiben, neue bekommen die nächste freie", () => {
    expect(teilschauenLesen(null)).toEqual([]);
    expect(teilschauenLesen([{ name: " Landesschau " }, { id: "t1", name: "Jugendschau" }, { name: "" }, { id: "t1", name: "Doppelt" }, { name: "x".repeat(200) }])).toEqual([
      { id: "t2", name: "Landesschau" },
      { id: "t1", name: "Jugendschau" },
      { id: "t3", name: "x".repeat(80) },
    ]);
    expect(teilschauenLesen(Array.from({ length: 30 }, (_, i) => ({ name: `T${i}` })))).toHaveLength(12);
  });

  test("Zugehörigkeit: ohne Angabe oder unbekannt die erste; ohne Teilschauen keine", () => {
    const t = [{ id: "t1", name: "Landesschau" }, { id: "t2", name: "Jugendschau" }];
    expect(teilschauVon(t, "t2")?.name).toBe("Jugendschau");
    expect(teilschauVon(t, null)?.name).toBe("Landesschau");
    expect(teilschauVon(t, "weg")?.name).toBe("Landesschau");
    expect(teilschauVon([], "t1")).toBeNull();
    expect([teilschauFolge(t, "t2"), teilschauFolge(t, null), teilschauFolge([], "t2")]).toEqual([1, 0, 0]);
  });

  test("Katalognummern laufen über die Teilschauen fortlaufend: erst die ganze erste Teilschau, dann die nächste", () => {
    const e = (id: number, teilschauFolge: number, rasseFolge: number): FolgeEintrag => ({ id, teilschauFolge, sparteFolge: 1, rasseFolge, farbFolge: 1, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istJugend: false, ausstellerName: "A", meldungId: id, position: 0 });
    const nr = vergebeKatalognummern([e(1, 1, 1), e(2, 0, 9), e(3, 1, 5), e(4, 0, 2)], { start: 1, jugendSeparat: true });
    expect([...nr.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id)).toEqual([4, 2, 1, 3]);
  });
});
