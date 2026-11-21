import { expect, test } from "bun:test";
import { preisverteilung, type VerteilungArt } from "./preisverteilung";

const art = (x: Partial<VerteilungArt> & Pick<VerteilungArt, "preisartId" | "kuerzel">): VerteilungArt => ({ name: x.kuerzel, betragCent: 0, sachpreis: "", verfuegbar: null, ...x });
const band = art({ preisartId: 1, kuerzel: "EB", name: "Ehrenband", verfuegbar: 2 });
const e = art({ preisartId: 2, kuerzel: "E", name: "Ehrenpreis", betragCent: 1000, verfuegbar: 3 });
const z = art({ preisartId: 3, kuerzel: "Z", name: "Zuschlagpreis", betragCent: 500, verfuegbar: 1 });
const pokal = art({ preisartId: 4, kuerzel: "P", name: "Pokal", sachpreis: "Pokal", verfuegbar: 0 });
const gestiftet = art({ preisartId: 5, kuerzel: "SE", name: "Stiftung", betragCent: 1500 });

test("je Preisart so viele Zeilen wie das Kontingent; vergebene zuerst mit Nummer, die übrigen leer zum Eintragen", () => {
  const v = preisverteilung([band, e, z, pokal, gestiftet], [
    { preisartId: 2, nr: "17", betragCent: 1000 },
    { preisartId: 1, nr: "4", betragCent: 0 },
    { preisartId: 2, nr: "23", betragCent: 1200 },
  ]);
  expect(v.zeilen.map((x) => `${x.lfd} ${x.kuerzel} ${x.nr || "_"} ${x.betragCent}`)).toEqual([
    "1 EB 4 0",
    "2 EB _ 0",
    "1 E 17 1000",
    // Betrag der Vergabe (zum Zeitpunkt der Vergabe), nicht der heutige der Preisart.
    "2 E 23 1200",
    "3 E _ 1000",
    "1 Z _ 500",
  ]);
  // Ohne Kontingent und ohne Vergabe (Pokal 0, Stiftung) keine Zeile.
  expect(v.zeilen.some((x) => x.kuerzel === "P" || x.kuerzel === "SE")).toBe(false);
  expect(v.vergebenCent).toBe(2200);
  expect(v.gesamtCent).toBe(2200 + 1000 + 500);
});

test("gestiftete Preise und Kontingent für die ganze Schau: nur die vergebenen Zeilen", () => {
  const ganzeSchau = { ...e, verfuegbar: null };
  const v = preisverteilung([ganzeSchau, gestiftet], [
    { preisartId: 5, nr: "8", betragCent: 1500, zusatz: "Stifter Muster" },
    { preisartId: 2, nr: "9", betragCent: 1000 },
  ]);
  expect(v.zeilen.map((x) => `${x.lfd} ${x.kuerzel} ${x.nr} ${x.zusatz}`)).toEqual(["1 E 9 ", "1 SE 8 Stifter Muster"]);
  expect(v.gesamtCent).toBe(2500);
});

test("mehr vergeben als das Kontingent (z. B. nachträglich fehlende Tiere): alle Vergaben, die überzähligen markiert", () => {
  const v = preisverteilung([z, pokal], [
    { preisartId: 3, nr: "1", betragCent: 500 },
    { preisartId: 3, nr: "2", betragCent: 500 },
    { preisartId: 4, nr: "3", betragCent: 0 },
  ]);
  expect(v.zeilen.map((x) => `${x.lfd} ${x.kuerzel} ${x.nr} ${x.ueberKontingent}`)).toEqual(["1 Z 1 false", "2 Z 2 true", "1 P 3 true"]);
  // Sachpreis ohne Betrag: Wert bleibt 0, der Sachpreis steht dabei.
  expect(v.zeilen[2]!.sachpreis).toBe("Pokal");
});

test("überzählig sind zuerst Preise an fehlenden Tieren, dann die letzten; fehlende Tiere stehen in der Bemerkung", () => {
  // Kontingent Z = 1, vergeben an Nr. 3 (danach als fehlend gemeldet) und Nr. 7: Nr. 3 ist überzählig, nicht Nr. 7.
  const v = preisverteilung([z], [
    { preisartId: 3, nr: "3", betragCent: 500, fehlt: true },
    { preisartId: 3, nr: "7", betragCent: 500 },
  ]);
  expect(v.zeilen.map((x) => `${x.lfd} ${x.nr} ${x.ueberKontingent} ${x.fehlt}`)).toEqual(["1 3 true true", "2 7 false false"]);
  // Ohne fehlende Tiere die letzten in Katalogfolge.
  const zwei = { ...z, verfuegbar: 2 };
  const w = preisverteilung([zwei], ["1", "2", "3", "4"].map((nr) => ({ preisartId: 3, nr, betragCent: 500 })));
  expect(w.zeilen.map((x) => x.ueberKontingent)).toEqual([false, false, true, true]);
});

test("Vergabe einer unbekannten Preisart geht nicht verloren", () => {
  expect(() => preisverteilung([e], [{ preisartId: 99, nr: "5", betragCent: 0 }])).toThrow("Preisart 99");
});
