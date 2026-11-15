import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { XlsxFehler, xlsxLesen } from "./xlsx";

/** Kleines ZIP-Archiv bauen (gepackt wie von Excel), damit der Test ohne Fremddatei auskommt. */
function zip(dateien: Record<string, string>): Buffer {
  const teile: Buffer[] = [];
  const verzeichnis: Buffer[] = [];
  let offset = 0;
  for (const [name, inhalt] of Object.entries(dateien)) {
    const roh = Buffer.from(inhalt, "utf8");
    const gepackt = deflateRawSync(roh);
    const n = Buffer.from(name, "utf8");
    const crc = Bun.hash.crc32(roh);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4);
    lokal.writeUInt16LE(8, 8);
    lokal.writeUInt32LE(crc, 14);
    lokal.writeUInt32LE(gepackt.length, 18);
    lokal.writeUInt32LE(roh.length, 22);
    lokal.writeUInt16LE(n.length, 26);
    teile.push(lokal, n, gepackt);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0);
    z.writeUInt16LE(20, 4);
    z.writeUInt16LE(20, 6);
    z.writeUInt16LE(8, 10);
    z.writeUInt32LE(crc, 16);
    z.writeUInt32LE(gepackt.length, 20);
    z.writeUInt32LE(roh.length, 24);
    z.writeUInt16LE(n.length, 28);
    z.writeUInt32LE(offset, 42);
    verzeichnis.push(z, n);
    offset += 30 + n.length + gepackt.length;
  }
  const cd = Buffer.concat(verzeichnis);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(Object.keys(dateien).length, 8);
  ende.writeUInt16LE(Object.keys(dateien).length, 10);
  ende.writeUInt32LE(cd.length, 12);
  ende.writeUInt32LE(offset, 16);
  return Buffer.concat([...teile, cd, ende]);
}

const mappe = (blatt: string, gemeinsam: string[]) =>
  zip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Meldungen" sheetId="1" r:id="rId7"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/blatt1.xml"/></Relationships>',
    "xl/sharedStrings.xml": `<sst>${gemeinsam.map((s) => `<si>${s}</si>`).join("")}</sst>`,
    "xl/worksheets/blatt1.xml": `<worksheet><sheetData>${blatt}</sheetData></worksheet>`,
  });

describe("Excel lesen (.xlsx ohne Fremdbibliothek)", () => {
  test("Text, Zahlen, formatierter Text, leere Zellen, Sonderzeichen", () => {
    const datei = mappe(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Preis</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12345</v></c><c r="D2"><v>25.5</v></c></row>' +
        '<row r="3"></row>' +
        '<row r="4"><c r="A4" t="str"><v>Kröger &amp; Söhne</v></c><c r="C4" t="b"><v>1</v></c></row>',
      ["<t>Name</t>", "<t>PLZ</t>", "<r><t>Muster, </t></r><r><t>Karl</t></r>"],
    );
    expect(xlsxLesen(datei)).toEqual([
      ["Name", "PLZ", "", "Preis"],
      ["Muster, Karl", "12345", "", "25,5"],
      ["Kröger & Söhne", "", "ja"],
    ]);
  });

  test("Keine Excel-Datei, beschädigt, zu groß entpackt", () => {
    expect(() => xlsxLesen(Buffer.from("Name;Ort\nMuster;Musterdorf"))).toThrow(XlsxFehler);
    const kaputt = mappe("<row/>", []);
    kaputt.writeUInt32LE(0, kaputt.length - 6); // Verweis auf das Inhaltsverzeichnis zerstören
    expect(() => xlsxLesen(kaputt)).toThrow(XlsxFehler);
    // Ein Blatt, das entpackt über die Grenze geht (gleiche Zeichen packen sich sehr klein).
    const riesig = mappe(`<row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(70 * 1024 * 1024)}</t></is></c></row>`, []);
    expect(riesig.length).toBeLessThan(1024 * 1024);
    expect(() => xlsxLesen(riesig)).toThrow(XlsxFehler);
  });

  test("Präparierte Dateien blockieren den Server nicht", () => {
    const schnell = (f: () => unknown) => {
      const t0 = performance.now();
      try {
        f();
      } catch (e) {
        if (!(e instanceof XlsxFehler)) throw e;
      }
      return performance.now() - t0;
    };
    // Riesiger Spaltenbezug: Zellen jenseits der Grenze fallen weg statt aufgefüllt zu werden.
    expect(schnell(() => xlsxLesen(mappe('<row r="1"><c r="ZZZZZZZZ1" t="inlineStr"><is><t>x</t></is></c><c r="A1" t="inlineStr"><is><t>a</t></is></c></row>', [])))).toBeLessThan(500);
    expect(xlsxLesen(mappe('<row r="1"><c r="XFD1"><v>1</v></c><c r="B1"><v>2</v></c></row>', []))).toEqual([["", "2"]]);
    // Viele Zeilen mit gültigem, aber fernem Bezug.
    expect(schnell(() => xlsxLesen(mappe('<row><c r="XFD1"><v>1</v></c></row>'.repeat(50_000), [])))).toBeLessThan(1500);
    // Nicht geschlossene Tags: linear, nicht quadratisch.
    expect(schnell(() => xlsxLesen(mappe("<row><c>".repeat(100_000), [])))).toBeLessThan(1500);
    expect(schnell(() => xlsxLesen(mappe("", Array.from({ length: 50_000 }, () => "<t>offen"))))).toBeLessThan(1500);
    // Auch Mappe, Verweise und Werte: nicht geschlossene Tags bleiben linear.
    const roh = (rels: string, blatt: string, mappeXml = '<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>') =>
      zip({ "xl/workbook.xml": mappeXml, "xl/_rels/workbook.xml.rels": rels, "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${blatt}</sheetData></worksheet>` });
    expect(schnell(() => xlsxLesen(roh("<Relationship".repeat(40_000), "")))).toBeLessThan(1500);
    expect(schnell(() => xlsxLesen(roh("", `<row><c r="A1">${"<v>".repeat(80_000)}</c></row>`)))).toBeLessThan(1500);
    expect(schnell(() => xlsxLesen(roh("", "", `<workbook>${"<sheet ".repeat(40_000)}`)))).toBeLessThan(1500);
    // Zu viele Zeilen: Abbruch beim Lesen, nicht erst danach.
    expect(() => xlsxLesen(mappe('<row><c t="inlineStr"><is><t>x</t></is></c></row>'.repeat(6000), []))).toThrow("Zeilen");
  });
});
