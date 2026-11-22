import { describe, expect, test } from "bun:test";
import { anschriftfeld, BRIEF_VORGABE, briefVorlageLesen, briefWerte, falzmarkenMm, fuelle, unbekanntePlatzhalter } from "./briefvorlage";

describe("Briefvorlage", () => {
  const werte = briefWerte({ vorname: "Karla", nachname: "Muster" }, { verein: "GZV Musterdorf", schau: "Lokalschau 2026", ort: "Musterdorf", datum: "15.11.2026" });

  test("Platzhalter einsetzen; unbekannte bleiben stehen und werden gemeldet", () => {
    expect(fuelle("{Anrede}, willkommen zur {Schau} in {Ort}. {Datum}", werte)).toBe("Guten Tag Karla Muster, willkommen zur Lokalschau 2026 in Musterdorf. 15.11.2026");
    expect(fuelle("Hallo {Vornahme}", werte)).toBe("Hallo {Vornahme}");
    expect(unbekanntePlatzhalter("{Vorname} {Vornahme} {Vornahme} {Schau}")).toEqual(["Vornahme"]);
    // Fehlende Werte werden leer, nicht „undefined“.
    expect(fuelle("{Meldeschluss}", werte)).toBe("");
    // Namen aus der Objekt-Prototypkette sind keine Platzhalter.
    expect(fuelle("{constructor} {toString}", werte)).toBe("{constructor} {toString}");
    expect(unbekanntePlatzhalter("{constructor} {hasOwnProperty}")).toEqual(["constructor", "hasOwnProperty"]);
  });

  test("Bewertungstag und Rückmeldung als Platzhalter; fehlen sie, bleiben sie leer", () => {
    const w = briefWerte({ vorname: "", nachname: "Bruno Buche" }, { verein: "V", schau: "S", bewertungstag: "06.11.2027", rueckmeldung: "01.10.2027", datum: "1.9.2027" });
    expect(fuelle("{Name}: Bewertung am {Bewertungstag}, Antwort bis {Rückmeldung}", w)).toBe("Bruno Buche: Bewertung am 06.11.2027, Antwort bis 01.10.2027");
    expect(fuelle("[{Bewertungstag}|{Rückmeldung}]", werte)).toBe("[|]");
    expect(unbekanntePlatzhalter("{Bewertungstag} {Rückmeldung} {Rueckmeldung}")).toEqual(["Rueckmeldung"]);
  });

  test("Anrede ohne Namen", () => {
    expect(briefWerte({ vorname: "", nachname: "" }, { verein: "V", datum: "1.1.2027" }).Anrede).toBe("Guten Tag");
  });

  test("DIN 5008: Anschriftfeld und Falzmarken je Form", () => {
    expect(anschriftfeld("B")).toMatchObject({ x: 20, y: 45, breite: 85, hoehe: 45, anschriftAb: 62.7 });
    expect(anschriftfeld("A")).toMatchObject({ y: 27, anschriftAb: 44.7 });
    expect(falzmarkenMm("B")).toEqual([105, 148.5, 210]);
    expect(falzmarkenMm("A")).toEqual([87, 148.5, 192]);
  });

  test("Einlesen: Vorgabe, Grenzen, Fußzeile immer drei Spalten", () => {
    expect(briefVorlageLesen(undefined)).toEqual(BRIEF_VORGABE);
    const v = briefVorlageLesen({ form: "A", fuss: ["Anschrift", 7], kopf: "x".repeat(900), farbig: false, serienbrief: { betreff: "Rundbrief" } });
    expect(v.form).toBe("A");
    expect(v.fuss).toEqual(["Anschrift", "", ""]);
    expect(v.kopf).toHaveLength(400);
    expect(v.farbig).toBe(false);
    expect(v.serienbrief).toEqual({ ...BRIEF_VORGABE.serienbrief, betreff: "Rundbrief" });
    // Briefkopf höchstens drei Zeilen, sonst läuft er ins Anschriftfeld.
    expect(briefVorlageLesen({ kopf: "a\nb\nc\nd\ne" }).kopf).toBe("a\nb\nc");
    // Preisrichterverpflichtung: leer heißt fester Text; ältere Vorlagen ohne den Teil bekommen ihn leer.
    expect(BRIEF_VORGABE.verpflichtung).toEqual({ betreff: "", text: "" });
    expect(briefVorlageLesen({ verpflichtung: { text: "x".repeat(9000), betreff: 7 } }).verpflichtung).toEqual({ betreff: "", text: "x".repeat(8000) });
  });
});
