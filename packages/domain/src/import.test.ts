import { describe, expect, test } from "bun:test";
import { aehnlichkeit, alterLesen, ausstellerSchluessel, csvLesen, geschlechtLesen, preisLesen, rassenVorschlaege, spaltenRaten, suchNorm, zeilenAuswerten } from "./import";

describe("CSV lesen", () => {
  test("Trennzeichen erkennen, Anführungszeichen, Zeilenumbrüche im Feld, BOM", () => {
    expect(csvLesen("﻿Name;Ort\r\nMuster, Karl;Musterdorf\r\n")).toEqual([["Name", "Ort"], ["Muster, Karl", "Musterdorf"]]);
    expect(csvLesen('a,b\n"x, ""y""",z\n')).toEqual([["a", "b"], ['x, "y"', "z"]]);
    expect(csvLesen("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(csvLesen('a;b\n"zwei\nZeilen";2')).toEqual([["a", "b"], ["zwei\nZeilen", "2"]]);
    // Leere Zeilen fallen weg.
    expect(csvLesen("a;b\n\n1;2\n;\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("Spalten raten", () => {
  test("Übliche Überschriften aus Altprogrammen", () => {
    expect(spaltenRaten(["Name", "Straße", "PLZ", "Wohnort", "Verein", "Reg.-Nr.", "Rasse", "Farbe", "1,0/0,1", "J/A", "Preis"])).toEqual([
      "name",
      "strasse",
      "plz",
      "ort",
      "verein",
      "registriernummer",
      "rasse",
      "farbenschlag",
      "geschlecht",
      "alter",
      "verkaufspreis",
    ]);
    expect(spaltenRaten(["Vorname", "Nachname", "PLZ Ort", "E-Mail", "Kreisverband", "Unbekannt"])).toEqual(["vorname", "nachname", "plzOrt", "email", "kreisverband", null]);
  });
});

describe("Werte lesen", () => {
  test("Geschlecht, Alter, Preis", () => {
    expect(["1,0", "1.0", "M", "Hahn", "Täuber", "0,1", "w", "Henne", "1,2", "?"].map(geschlechtLesen)).toEqual(["1,0", "1,0", "1,0", "1,0", "1,0", "0,1", "0,1", "0,1", "1,2", null]);
    expect(["jung", "J", "Jt", "alt", "a", "Vj", "", "x"].map(alterLesen)).toEqual(["jung", "jung", "jung", "alt", "alt", "alt", null, null]);
    expect(["25", "25,50", "12,5 €", "", "-", "unverkäuflich", "1.250,00"].map(preisLesen)).toEqual([2500, 2550, 1250, null, null, null, 125000]);
  });

  test("Suchschlüssel und Ähnlichkeit", () => {
    expect(suchNorm("Zwerg-Wyandotten, weiß")).toBe("zwerg wyandotten weiss");
    expect(aehnlichkeit("wyandotten weiss", "wyandotten weiss")).toBe(1);
    expect(aehnlichkeit("wyandoten weis", "wyandotten weiss")).toBeGreaterThan(0.7);
    expect(aehnlichkeit("orpington", "wyandotten")).toBeLessThan(0.3);
  });

  test("Rassenvorschläge: genau, sonst ähnlich, Zwerg nicht mit Groß verwechseln", () => {
    const liste = [
      { id: 1, rasse: "Wyandotten", farbenschlag: "weiß" },
      { id: 2, rasse: "Zwerg-Wyandotten", farbenschlag: "weiß" },
      { id: 3, rasse: "Wyandotten", farbenschlag: "schwarz" },
    ];
    expect(rassenVorschlaege("Wyandotten", "weiß", liste)[0]).toMatchObject({ id: 1, genau: true });
    expect(rassenVorschlaege("Zwerg Wyandotten", "weiss", liste)[0]).toMatchObject({ id: 2, genau: true });
    const v = rassenVorschlaege("Wyandoten", "schwartz", liste);
    expect(v[0]).toMatchObject({ id: 3, genau: false });
  });

  test("Ausstellerschlüssel: Registriernummer vor Name und PLZ", () => {
    expect(ausstellerSchluessel({ vorname: "Karl", nachname: "Muster", plz: "12345", registriernummer: "276 09 999 999 9999" })).toBe("reg:276099999999999");
    expect(ausstellerSchluessel({ vorname: " Karl ", nachname: "MUSTER", plz: "12345", registriernummer: "" })).toBe("name:karl|muster|12345");
  });
});

describe("Zeilen auswerten", () => {
  test("Aussteller: Name „Nachname, Vorname“, PLZ und Ort zusammen; fehlende Pflichtangaben", () => {
    const z = zeilenAuswerten(
      [
        ["Name", "PLZ Ort", "Verein"],
        ["Muster, Karl", "12345 Musterdorf", "GZV Musterdorf"],
        ["Erika Beispiel", "", "GZV Musterdorf"],
        ["", "12345 Musterdorf", ""],
      ],
      ["name", "plzOrt", "verein"],
      { mitKopf: true, art: "aussteller" },
    );
    expect(z[0]!.aussteller).toMatchObject({ vorname: "Karl", nachname: "Muster", plz: "12345", ort: "Musterdorf" });
    expect(z[0]!.fehler).toEqual([]);
    expect(z[1]!.aussteller).toMatchObject({ vorname: "Erika", nachname: "Beispiel" });
    expect(z[1]!.hinweise.join()).toMatch(/Anschrift/);
    expect(z[2]!.fehler.join()).toMatch(/Name/);
    expect(z.map((x) => x.nr)).toEqual([2, 3, 4]);
  });

  test("Tiere: Geschlecht und Alter Pflicht, Stamm aus 1,2, Rasse und Farbenschlag aus einer Spalte", () => {
    const z = zeilenAuswerten(
      [
        ["Name", "Rasse/Farbe", "Geschl.", "Alter", "Preis", "Ring"],
        ["Muster, Karl", "Wyandotten, weiß", "1,0", "jung", "25", "DE 26 AB 123"],
        ["Muster, Karl", "Wyandotten, weiß", "1,2", "alt", "", ""],
        ["Muster, Karl", "Wyandotten, weiß", "x", "jung", "", ""],
      ],
      ["name", "rasseFarbe", "geschlecht", "alter", "verkaufspreis", "ringnummer"],
      { mitKopf: true, art: "meldungen" },
    );
    expect(z[0]!.tier).toMatchObject({ rasse: "Wyandotten", farbenschlag: "weiß", geschlecht: "1,0", art: "einzeltier", alter: "jung", verkaufspreisCent: 2500, ringnummern: "DE 26 AB 123" });
    expect(z[1]!.tier).toMatchObject({ art: "stamm", geschlecht: "1,2" });
    expect(z[2]!.fehler.join()).toMatch(/Geschlecht/);
  });
});

describe("Befunde der Gegenprüfung", () => {
  test("Excel-Zahlen: „1,0“ als 1 gespeichert, Preise „25,-“ und „0“", () => {
    expect(["1", "2", "0", "0,1"].map(geschlechtLesen)).toEqual(["1,0", "2,0", null, "0,1"]);
    expect(["25,-", "25,–", "0"].map(preisLesen)).toEqual([2500, 2500, 0]);
  });

  test("„Name“ neben „Vorname“ ist der Nachname", () => {
    expect(spaltenRaten(["Name", "Vorname", "PLZ"])).toEqual(["nachname", "vorname", "plz"]);
    expect(spaltenRaten(["Name", "PLZ"])).toEqual(["name", "plz"]);
  });

  test("Was der Server ablehnen würde, ist ein Fehler der Zeile – oder wird mit Hinweis weggelassen", () => {
    const z = zeilenAuswerten(
      [
        ["Vorname", "Nachname", "PLZ", "E-Mail", "Telefon", "Reg", "Rasse", "Geschl", "Alter", "Preis", "Ring"],
        ["", "Müller", "12345", "", "", "", "Wyandotten", "1,0", "jung", "", ""],
        ["Karl", "Muster", "7743", "keine", "0".repeat(60), "unbekannt", "Wyandotten", "1,0", "jung", "0", ""],
        ["Karl", "Muster", "12345", "", "", "", "Wyandotten", "0,0", "jung", "", ""],
        ["Karl", "Muster", "12345", "", "", "", "Wyandotten", "20,20", "jung", "200.000,00", "R".repeat(201)],
        ["K".repeat(101), "Muster", "1".repeat(21), "", "", "", "Wyandotten", "1,0", "jung", "", ""],
      ],
      ["vorname", "nachname", "plz", "email", "telefon", "registriernummer", "rasse", "geschlecht", "alter", "verkaufspreis", "ringnummer"],
      { mitKopf: true, art: "meldungen" },
    );
    expect(z[0]!.fehler.join()).toMatch(/Vorname fehlt/);
    // Weggelassen mit Hinweis: E-Mail, Telefon, Registriernummer; PLZ mit führender 0; Preis 0 = unverkäuflich.
    expect(z[1]!.fehler).toEqual([]);
    expect(z[1]!.aussteller).toMatchObject({ plz: "07743", email: "", telefon: "", registriernummer: "" });
    expect(z[1]!.hinweise.join()).toMatch(/E-Mail/);
    expect(z[1]!.hinweise.join()).toMatch(/Telefon/);
    expect(z[1]!.hinweise.join()).toMatch(/PLZ/);
    expect(z[1]!.tier!.verkaufspreisCent).toBeNull();
    expect(z[2]!.fehler.join()).toMatch(/0,0/);
    expect(z[3]!.fehler.join()).toMatch(/30 Tiere/);
    expect(z[3]!.fehler.join()).toMatch(/Verkaufspreis/);
    expect(z[3]!.fehler.join()).toMatch(/Ringnummer/);
    expect(z[4]!.fehler.join()).toMatch(/Vorname zu lang/);
    expect(z[4]!.fehler.join()).toMatch(/PLZ zu lang/);
  });

  test("Ausländische Registriernummern: Ländercode gehört zum Schlüssel", () => {
    const a = { vorname: "A", nachname: "B", plz: "1" };
    expect(ausstellerSchluessel({ ...a, registriernummer: "NL 1234567" })).not.toBe(ausstellerSchluessel({ ...a, registriernummer: "BE 1234567" }));
  });
});
