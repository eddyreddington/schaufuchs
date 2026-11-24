/**
 * Zeilenumbruch im Katalog (`zeilenUmbrechen`, Entscheidung 032): Ein geschütztes Leerzeichen trennt nicht – so beginnt
 * eine umbrochene Versalzeile nicht mit „· SPARTE“ (`versalZeilen` setzt es vor „·“).
 */
import { expect, test } from "bun:test";
import PDFDocument from "pdfkit";
import { zeilenUmbrechen } from "./basis";

test("geschütztes Leerzeichen bricht nicht um: „·“ bleibt beim Wort davor, nichts fällt weg", () => {
  const doc = new PDFDocument();
  doc.fontSize(7);
  const text = "LANDESVERBANDSJUGENDSCHAU DES LANDESVERBANDS\u00a0· SPARTE";
  const zeilen = zeilenUmbrechen(doc, text, doc.widthOfString("LANDESVERBANDSJUGENDSCHAU DES LANDESVERBANDS") + 1);
  expect(zeilen.length).toBeGreaterThan(1);
  expect(zeilen.filter((z) => z.trimStart().startsWith("·"))).toEqual([]);
  expect(zeilen.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
});

test("gewöhnliche Leerzeichen brechen weiter um", () => {
  const doc = new PDFDocument();
  doc.fontSize(7);
  expect(zeilenUmbrechen(doc, "EINS ZWEI DREI", doc.widthOfString("EINS ZWEI") + 1)).toEqual(["EINS ZWEI", "DREI"]);
});
