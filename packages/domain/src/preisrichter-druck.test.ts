import { describe, expect, test } from "bun:test";
import { briefWerte } from "./briefvorlage";
import { bewertungslisteSpalten, bewertungslisteZeilen, GRUPPEN_VORGABE, type ListenZeile, rueckmeldungFehler, VERPFLICHTUNG_MUSTER, verpflichtungBrief, verpflichtungGruppen } from "./preisrichter-druck";

type T = { nr: number; rasse: string; farbenschlag: string };
const t = (nr: number, rasse: string, farbenschlag: string): T => ({ nr, rasse, farbenschlag });
const kurz = (z: ListenZeile<T>) => (z.art === "tier" ? String(z.tier.nr) : `${z.art === "rasse" ? "R" : "F"}:${z.text}${z.fortsetzung ? "+" : ""}`);

describe("Preisrichterverpflichtung: Gruppen zum Ankreuzen", () => {
  test("Gruppen aus dem Verzeichnis: einheitlich, ohne Doppelte, in natürlicher Folge", () => {
    expect(verpflichtungGruppen(["x2", "X10", " x 1", "", null, "X2", "B"])).toEqual(["B", "X1", "X2", "X10"]);
  });

  test("Ohne Gruppen im Verzeichnis: A bis M, Z1 bis Z3", () => {
    expect(verpflichtungGruppen([])).toEqual([..."ABCDEFGHIJKLM", "Z1", "Z2", "Z3"]);
    expect(verpflichtungGruppen(["", null, undefined])).toEqual([...GRUPPEN_VORGABE]);
    expect(GRUPPEN_VORGABE).toHaveLength(16);
  });
});

describe("Bewertungsliste: Zwischenköpfe und zwei Spalten", () => {
  test("Zwischenkopf je Rasse und je Farbenschlag, in der Folge der Tiere", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Testhuhn", "rot"), t(4, "Probetaube", "blau")]);
    expect(z.map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "2", "F:rot", "3", "R:Probetaube", "F:blau", "4"]);
  });

  test("Gleicher Farbenschlag bei neuer Rasse bekommt wieder einen Kopf; ohne Farbenschlag kein leerer Kopf", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Probehuhn", "weiß"), t(3, "Freihuhn", ""), t(4, "Probehuhn", "")]);
    expect(z.map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "R:Probehuhn", "F:weiß", "2", "R:Freihuhn", "3", "R:Probehuhn", "4"]);
    // Folgt ein Tier ohne Farbenschlag auf einen Farbenschlag derselben Rasse, steht es nicht unter dessen Kopf.
    expect(bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "")]).map(kurz)).toEqual(["R:Testhuhn", "F:weiß", "1", "F:ohne Farbenschlag", "2"]);
    expect(bewertungslisteZeilen([])).toEqual([]);
  });

  test("Spalten: jede Zeile genau einmal in Folge, kein Kopf allein am Spaltenende, Fortsetzung wiederholt die Köpfe", () => {
    const tiere = [t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Testhuhn", "weiß"), t(4, "Testhuhn", "rot"), t(5, "Testhuhn", "rot"), t(6, "Probetaube", "blau")];
    // Jede Zeile 1 hoch; erste Spalte 4, danach 3 (wie die erste Seite mit Briefkopf).
    const spalten = bewertungslisteSpalten(bewertungslisteZeilen(tiere), () => 1, (i) => (i === 0 ? 4 : 3));
    expect(spalten.map((s) => s.map(kurz))).toEqual([
      ["R:Testhuhn", "F:weiß", "1", "2"],
      ["R:Testhuhn+", "F:weiß+", "3"],
      // „rot“ mit seinem ersten Tier passte nicht mehr: neue Spalte, die Rasse als Fortsetzung davor.
      ["R:Testhuhn+", "F:rot", "4"],
      ["R:Testhuhn+", "F:rot+", "5"],
      ["R:Probetaube", "F:blau", "6"],
    ]);
    const nur = spalten.flat().filter((z) => z.art === "tier").map(kurz);
    expect(nur).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const s of spalten) expect(s.at(-1)!.art).toBe("tier");
  });

  test("Spalten: passt nur der Kopf einer neuen Rasse noch, beginnt sie die nächste Spalte", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß"), t(3, "Probetaube", "blau")]);
    // Nach Testhuhn ist in der ersten Spalte noch eine Zeile frei – zu wenig für Rasse, Farbenschlag und Tier.
    const spalten = bewertungslisteSpalten(z, () => 1, () => 5);
    expect(spalten.map((s) => s.map(kurz))).toEqual([["R:Testhuhn", "F:weiß", "1", "2"], ["R:Probetaube", "F:blau", "3"]]);
  });

  test("Spalten: Höhen je Zeilenart, genug Platz = eine Spalte, zu kleine Spalte bricht trotzdem nicht ab", () => {
    const z = bewertungslisteZeilen([t(1, "Testhuhn", "weiß"), t(2, "Testhuhn", "weiß")]);
    expect(bewertungslisteSpalten(z, () => 1, () => 100)).toHaveLength(1);
    // Köpfe 2 hoch, Tiere 1: 2 + 2 + 1 = 5 passt, das zweite Tier nicht mehr.
    const hoch = bewertungslisteSpalten(z, (x) => (x.art === "tier" ? 1 : 2), () => 5);
    expect(hoch.map((s) => s.map(kurz))).toEqual([["R:Testhuhn", "F:weiß", "1"], ["R:Testhuhn+", "F:weiß+", "2"]]);
    // Platz für nichts: jede Spalte nimmt trotzdem mindestens ein Tier.
    const eng = bewertungslisteSpalten(z, () => 1, () => 0);
    expect(eng.flat().filter((x) => x.art === "tier")).toHaveLength(2);
    expect(bewertungslisteSpalten([], () => 1, () => 10)).toEqual([]);
  });
});

describe("Preisrichterverpflichtung: Brieftext und Rückmeldung", () => {
  const werte = (mehr: { ort?: string; bewertungstag?: string; rueckmeldung?: string } = {}) =>
    briefWerte({ vorname: "", nachname: "Bruno Buche" }, { verein: "GZV Musterdorf", schau: "Lokalschau 2027", datum: "01.09.2027", ...mehr });
  const leer = { betreff: "", text: "" };

  test("leer: fester Text nennt nur, was feststeht", () => {
    const ohne = verpflichtungBrief(leer, werte());
    expect(ohne.betreff).toBe("Bitte um Bewertung – Lokalschau 2027");
    expect(ohne.text).toContain("Guten Tag Bruno Buche,");
    expect(ohne.text).toContain("bei unserer Schau „Lokalschau 2027“ als Preisrichter zu bewerten.");
    expect(ohne.text).toContain("Bitte senden Sie uns den unteren Abschnitt ausgefüllt und unterschrieben zurück.");
    expect(ohne.text).not.toContain(" bis ");
    const mit = verpflichtungBrief(leer, werte({ ort: "Probedorf", bewertungstag: "06.11.2027", rueckmeldung: "01.10.2027" }));
    expect(mit.text).toContain("bei unserer Schau „Lokalschau 2027“ in Probedorf am 06.11.2027 als Preisrichter zu bewerten.");
    expect(mit.text).toContain("Bitte senden Sie uns den unteren Abschnitt bis 01.10.2027 ausgefüllt und unterschrieben zurück.");
    // Nur Leerzeichen zählen als leer.
    expect(verpflichtungBrief({ betreff: "  ", text: " \n" }, werte()).text).toBe(ohne.text);
  });

  test("eigener Text mit Platzhaltern; das Muster ergibt bei allen Angaben den festen Text", () => {
    const w = werte({ ort: "Probedorf", bewertungstag: "06.11.2027", rueckmeldung: "01.10.2027" });
    const eigen = verpflichtungBrief({ betreff: "Anfrage {Schau}", text: "{Anrede}, bitte bis {Rückmeldung} antworten – Bewertung am {Bewertungstag} in {Ort}. {Verein}" }, w);
    expect(eigen).toEqual({ betreff: "Anfrage Lokalschau 2027", text: "Guten Tag Bruno Buche, bitte bis 01.10.2027 antworten – Bewertung am 06.11.2027 in Probedorf. GZV Musterdorf" });
    // Nur der Betreff eigen: Text bleibt der feste.
    expect(verpflichtungBrief({ betreff: "Anfrage", text: "" }, w)).toEqual({ betreff: "Anfrage", text: verpflichtungBrief(leer, w).text });
    expect(verpflichtungBrief(VERPFLICHTUNG_MUSTER, w)).toEqual(verpflichtungBrief(leer, w));
  });

  test("Rückmeldung bis: höchstens am Bewertungstag", () => {
    expect(rueckmeldungFehler("2027-10-01", "2027-11-06")).toBeNull();
    expect(rueckmeldungFehler("2027-11-06", "2027-11-06")).toBeNull();
    expect(rueckmeldungFehler("2027-11-07", "2027-11-06")).toContain("Bewertungstag");
    expect(rueckmeldungFehler(null, "2027-11-06")).toBeNull();
    expect(rueckmeldungFehler("2027-11-07", null)).toBeNull();
  });
});
