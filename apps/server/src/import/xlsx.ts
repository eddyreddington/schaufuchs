/**
 * Excel-Dateien (.xlsx) lesen – ohne Fremdbibliothek (Entscheidung 015). Eine .xlsx ist ein ZIP-Archiv mit XML:
 * Inhaltsverzeichnis des Archivs lesen, die nötigen Dateien mit zlib entpacken (Grenze gegen ZIP-Bomben), dann die
 * erste Tabelle der Mappe als Zeilen aus Text. Formeln liefern ihr gespeichertes Ergebnis. Das alte .xls-Format
 * (vor 2007) wird nicht gelesen – solche Dateien in Excel bzw. LibreOffice als .xlsx oder .csv speichern.
 */
import { inflateRawSync } from "node:zlib";

/** Höchstens so viel wird insgesamt entpackt (eine Meldeliste ist weit kleiner). */
const MAX_ENTPACKT = 64 * 1024 * 1024;
/** Spalten jenseits davon fallen weg (der Import nutzt ohnehin weniger). */
export const XLSX_MAX_SPALTEN = 256;
/** Mehr Zeilen liest der Import nicht – Abbruch schon beim Lesen, damit kein Speicher dafür gebunden wird. */
export const XLSX_MAX_ZEILEN = 5001;

export class XlsxFehler extends Error {}

interface Eintrag {
  name: string;
  methode: number;
  groesse: number;
  entpackt: number;
  offset: number;
}

/** Inhaltsverzeichnis des ZIP-Archivs (End of Central Directory → Central Directory). */
function verzeichnis(b: Buffer): Map<string, Eintrag> {
  let ende = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      ende = i;
      break;
    }
  }
  if (ende < 0) throw new XlsxFehler("Die Datei ist keine Excel-Datei (.xlsx).");
  const anzahl = b.readUInt16LE(ende + 10);
  let p = b.readUInt32LE(ende + 16);
  const liste = new Map<string, Eintrag>();
  for (let i = 0; i < anzahl; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new XlsxFehler("Das Inhaltsverzeichnis der Excel-Datei ist beschädigt.");
    const methode = b.readUInt16LE(p + 10);
    const groesse = b.readUInt32LE(p + 20);
    const entpackt = b.readUInt32LE(p + 24);
    const nl = b.readUInt16LE(p + 28);
    const el = b.readUInt16LE(p + 30);
    const kl = b.readUInt16LE(p + 32);
    const offset = b.readUInt32LE(p + 42);
    const name = b.toString("utf8", p + 46, p + 46 + nl);
    liste.set(name, { name, methode, groesse, entpackt, offset });
    p += 46 + nl + el + kl;
  }
  return liste;
}

function lies(b: Buffer, e: Eintrag, budget: { rest: number }): string {
  if (b.readUInt32LE(e.offset) !== 0x04034b50) throw new XlsxFehler("Die Excel-Datei ist beschädigt.");
  const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
  const roh = b.subarray(start, start + e.groesse);
  let daten: Buffer;
  if (e.methode === 0) daten = roh;
  else if (e.methode === 8) {
    try {
      daten = inflateRawSync(roh, { maxOutputLength: budget.rest });
    } catch {
      throw new XlsxFehler("Die Excel-Datei ist zu groß oder beschädigt.");
    }
  } else throw new XlsxFehler("Die Excel-Datei ist auf eine unbekannte Art gepackt.");
  budget.rest -= daten.length;
  if (budget.rest < 0) throw new XlsxFehler("Die Excel-Datei ist zu groß.");
  return daten.toString("utf8");
}

const entitaeten: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const text = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : (entitaeten[e.toLowerCase()] ?? ""),
  );
/**
 * Elemente <tag …>…</tag> bzw. <tag …/> der Reihe nach – mit indexOf statt Regex mit „[\s\S]*?“: Ein nicht
 * geschlossenes Element beendet die Suche, statt sie für jedes weitere bis zum Ende laufen zu lassen (quadratisch).
 */
function* elemente(xml: string, tag: string): Generator<{ attr: string; inhalt: string }> {
  let pos = 0;
  while (pos < xml.length) {
    const i = xml.indexOf(`<${tag}`, pos);
    if (i < 0) return;
    const nach = xml[i + tag.length + 1];
    if (nach !== ">" && nach !== "/" && nach !== " " && nach !== "\t" && nach !== "\n" && nach !== "\r") {
      pos = i + 1;
      continue;
    }
    const j = xml.indexOf(">", i);
    if (j < 0) return;
    if (xml[j - 1] === "/") {
      yield { attr: xml.slice(i + tag.length + 1, j - 1), inhalt: "" };
      pos = j + 1;
      continue;
    }
    const k = xml.indexOf(`</${tag}>`, j);
    if (k < 0) return;
    yield { attr: xml.slice(i + tag.length + 1, j), inhalt: xml.slice(j + 1, k) };
    pos = k + tag.length + 3;
  }
}

/** Alle <t>-Texte eines Elements (bei Formatierung im Text mehrere Abschnitte). */
const texte = (xml: string) => [...elemente(xml, "t")].map((e) => text(e.inhalt)).join("");

/** Spaltenbuchstaben → Index (A = 0, AA = 26); mehr als drei Buchstaben (über XFD) gibt es in Excel nicht. */
function spalte(buchstaben: string): number {
  if (buchstaben.length > 3) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (const c of buchstaben) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Zahl wie in einer deutschen Tabelle: Komma statt Punkt, ohne Exponent. */
function zahlText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6).replace(".", ",");
}

/** Erste Tabelle der Mappe als Zeilen aus Text; leere Zeilen fallen weg. */
export function xlsxLesen(datei: Buffer): string[][] {
  const zip = verzeichnis(datei);
  const budget = { rest: MAX_ENTPACKT };
  const hole = (name: string) => {
    const e = zip.get(name);
    return e ? lies(datei, e, budget) : null;
  };
  const mappe = hole("xl/workbook.xml");
  if (!mappe) throw new XlsxFehler("In der Datei steht keine Excel-Mappe.");
  // Auch hier über elemente(): ein nicht geschlossenes Tag darf die Suche nicht quadratisch machen.
  const [ersteTabelle] = elemente(mappe, "sheet");
  const erste = ersteTabelle?.attr.match(/\br:id="([^"]+)"/)?.[1];
  const rels = hole("xl/_rels/workbook.xml.rels") ?? "";
  let ziel: string | undefined;
  for (const r of elemente(rels, "Relationship")) {
    if (r.attr.match(/\bId="([^"]+)"/)?.[1] === erste) {
      ziel = r.attr.match(/\bTarget="([^"]+)"/)?.[1];
      break;
    }
  }
  const pfad = ziel ? (ziel.startsWith("/") ? ziel.slice(1) : `xl/${ziel}`) : "xl/worksheets/sheet1.xml";
  const blatt = hole(pfad);
  if (!blatt) throw new XlsxFehler("Die erste Tabelle der Mappe fehlt.");
  const gemeinsam = [...elemente(hole("xl/sharedStrings.xml") ?? "", "si")].map((e) => texte(e.inhalt));
  const zeilen: string[][] = [];
  for (const z of elemente(blatt, "row")) {
    const zeile: string[] = [];
    for (const c of elemente(z.inhalt, "c")) {
      const { attr, inhalt } = c;
      const ref = attr.match(/\br="([A-Z]+)\d+"/)?.[1];
      const typ = attr.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const vAnfang = inhalt.indexOf("<v>");
      const vEnde = vAnfang < 0 ? -1 : inhalt.indexOf("</v>", vAnfang);
      const v = vEnde < 0 ? undefined : inhalt.slice(vAnfang + 3, vEnde);
      let wert = "";
      if (typ === "s") wert = gemeinsam[Number(v)] ?? "";
      else if (typ === "inlineStr") wert = texte(inhalt);
      else if (typ === "b") wert = v === "1" ? "ja" : "nein";
      else if (typ === "str" || typ === "e") wert = text(v ?? "");
      else wert = v != null ? zahlText(v) : "";
      const i = ref ? spalte(ref) : zeile.length;
      if (i >= XLSX_MAX_SPALTEN) continue;
      while (zeile.length < i) zeile.push("");
      zeile[i] = wert.trim();
    }
    if (zeile.some((x) => x !== "")) zeilen.push(zeile);
    if (zeilen.length > XLSX_MAX_ZEILEN) throw new XlsxFehler(`Zu viele Zeilen (höchstens ${XLSX_MAX_ZEILEN - 1}). Bitte die Datei teilen.`);
  }
  return zeilen;
}
