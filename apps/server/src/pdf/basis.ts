import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KatalogSchrift } from "@schau/domain";
import PDFDocument from "pdfkit";

export type Doc = PDFKit.PDFDocument;

export const MM = 72 / 25.4;

// ── Schriften und Farben (gemeinsam für Katalog und alle Belege) ─────────
// Zwei Rollen: Titelschrift (SERIF…) für Überschriften, Rassen und Farbenschläge, Textschrift (SANS…) für Text, Tabellen
// und Zahlen. Welche Dateien dahinter stehen, bestimmt das Schriftpaar (Katalog: wählbar; Belege: klassisch).
// Alle unter der SIL Open Font License (apps/server/fonts).
export const SERIF = "Titel";
export const SERIF_FETT = "Titel-Fett";
export const SERIF_KURSIV = "Titel-Kursiv";
export const SANS = "Text";
export const SANS_FETT = "Text-Fett";
export const SANS_KURSIV = "Text-Kursiv";
const SPECTRAL = ["Spectral-Regular.ttf", "Spectral-SemiBold.ttf", "Spectral-Italic.ttf"] as const;
const PLEX = ["IBMPlexSansCondensed-Regular.ttf", "IBMPlexSansCondensed-SemiBold.ttf", "IBMPlexSansCondensed-Italic.ttf"] as const;
const GARAMOND = ["EBGaramond-Regular.ttf", "EBGaramond-SemiBold.ttf", "EBGaramond-Italic.ttf"] as const;
const SOURCE = ["SourceSans3-Regular.ttf", "SourceSans3-SemiBold.ttf", "SourceSans3-Italic.ttf"] as const;
const ATKINSON = ["AtkinsonHyperlegible-Regular.ttf", "AtkinsonHyperlegible-Bold.ttf", "AtkinsonHyperlegible-Italic.ttf"] as const;
/** Je Schriftpaar: Dateien der Titel- und der Textschrift (normal, fett, kursiv). */
const PAARE: Record<KatalogSchrift, { titel: readonly string[]; text: readonly string[] }> = {
  klassisch: { titel: SPECTRAL, text: PLEX },
  traditionell: { titel: GARAMOND, text: SOURCE },
  lesbar: { titel: ATKINSON, text: ATKINSON },
  modern: { titel: SOURCE, text: SOURCE },
  buchschmal: { titel: GARAMOND, text: PLEX },
  ausgewogen: { titel: SPECTRAL, text: SOURCE },
};
const dateien = new Map<string, Buffer>();
const datei = (name: string) => {
  let b = dateien.get(name);
  if (!b) dateien.set(name, (b = readFileSync(join(import.meta.dir, "../../fonts", name))));
  return b;
};
export function registriereSchriften(doc: Doc, paar: KatalogSchrift = "klassisch") {
  const { titel, text } = PAARE[paar] ?? PAARE.klassisch;
  const rollen: [string, string][] = [
    [SERIF, titel[0]!],
    [SERIF_FETT, titel[1]!],
    [SERIF_KURSIV, titel[2]!],
    [SANS, text[0]!],
    [SANS_FETT, text[1]!],
    [SANS_KURSIV, text[2]!],
  ];
  for (const [rolle, name] of rollen) doc.registerFont(rolle, datei(name));
}

export const TINTE = "#1d1d1b";
export const GRAU = "#6b6b66";
export const HAARLINIE = "#c4c4bc";
export const STANDARDFARBE = "#2f5d3a";

/** Relative Helligkeit nach WCAG für #RRGGBB. */
function helligkeit(hex: string): number {
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
}

export function kontrast(a: string, b: string): number {
  const [x, y] = [helligkeit(a), helligkeit(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/** Dunkelt helle Vereinsfarben (Gelb, Orange …) ab, bis Schrift darin auf weißem Papier gut lesbar ist (Kontrast 4,5). */
export function lesbareFarbe(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const alsHex = () => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  for (let i = 0; i < 20 && kontrast(alsHex(), "#ffffff") < 4.5; i++) {
    r *= 0.9;
    g *= 0.9;
    b *= 0.9;
  }
  return alsHex();
}

/** Vereinsfarbe und Logo aus „Katalog“ – damit Belege und Katalog gleich aussehen. */
export interface Design {
  /** Fläche, Linien (gewählte Vereinsfarbe). */
  flaeche: string;
  /** Schrift in Vereinsfarbe, notfalls abgedunkelt. */
  farbe: string;
  logo: Buffer | null;
}

/**
 * Logo als einmal eingebettetes Bild: pdfkit merkt sich Bilder nur bei Dateipfaden,
 * ein Buffer würde auf jeder Seite neu eingebettet (B-Bögen für alle Aussteller wurden so über 1 MB groß).
 */
const logos = new WeakMap<Doc, unknown>();
export function logoBild(doc: Doc, d: Design): Parameters<Doc["image"]>[0] | null {
  if (!d.logo) return null;
  if (!logos.has(doc)) {
    try {
      logos.set(doc, (doc as unknown as { openImage: (b: Buffer) => unknown }).openImage(d.logo));
    } catch {
      logos.set(doc, null);
    }
  }
  return (logos.get(doc) as Parameters<Doc["image"]>[0] | null) ?? null;
}

export function design(farbe: string | null | undefined, logo: Buffer | null): Design {
  const flaeche = farbe && /^#[0-9a-fA-F]{6}$/.test(farbe) ? farbe : STANDARDFARBE;
  return { flaeche, farbe: lesbareFarbe(flaeche), logo };
}

/**
 * Vermerk auf jeder Seite (z. B. „Zweitschrift“ für einen Beleg, der erst beim Abruf statt beim Buchen entstand).
 * Als Kontext statt Parameter: die Beleg-Funktionen reichen ihn so unverändert an erzeugePdf durch.
 */
const vermerkKontext = new AsyncLocalStorage<string>();
export function mitVermerk<T>(vermerk: string | null, f: () => Promise<T>): Promise<T> {
  return vermerk ? vermerkKontext.run(vermerk, f) : f();
}

/** Erzeugt ein PDF und liefert es als Buffer. Die Hausschriften sind registriert, Grundschrift ist Plex. */
export async function erzeugePdf(
  titel: string,
  zeichne: (doc: Doc) => void | Promise<void>,
  opts: { layout?: "portrait" | "landscape"; /** Papiername („A4“) oder Breite × Höhe in Punkt (Endlospapier). */ size?: string | [number, number]; margin?: number; margins?: { top: number; bottom: number; left: number; right: number } } = {},
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: opts.size ?? "A4",
    layout: opts.layout ?? "portrait",
    ...(opts.margins ? { margins: opts.margins } : { margin: opts.margin ?? 15 * MM }),
    bufferPages: true,
    info: { Title: titel, Creator: "SchauFUCHS" },
  });
  const teile: Buffer[] = [];
  doc.on("data", (c: Buffer) => teile.push(c));
  const fertig = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(teile))));
  registriereSchriften(doc);
  doc.font(SANS).fillColor(TINTE);
  await zeichne(doc);
  const vermerk = vermerkKontext.getStore();
  if (vermerk) {
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const rand = doc.page.margins.top;
      doc.save();
      doc.font(SANS_FETT).fontSize(8).fillColor("#b42318");
      doc.text(vermerk, doc.page.margins.left, Math.max(4 * MM, rand / 2 - 4), { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "right", lineBreak: false });
      doc.restore();
    }
  }
  doc.end();
  return fertig;
}

const links = (doc: Doc) => doc.page.margins.left;
const breite = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const unten = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/** y für doc.text, damit Text dieser Schrift auf der Grundlinie `grundlinie` steht. */
export function aufLinie(doc: Doc, schrift: string, groesse: number, grundlinie: number): number {
  doc.font(schrift).fontSize(groesse);
  return grundlinie - ((doc as unknown as { _font: { ascender: number } })._font.ascender / 1000) * groesse;
}

/** Kleine Versalzeile („QUITTUNG“, „ZUR BESONDEREN BEACHTUNG“). */
export function kicker(doc: Doc, text: string, x: number, y: number, farbe: string, b?: number) {
  doc.font(SANS_FETT).fontSize(7).fillColor(farbe).text(text.toLocaleUpperCase("de"), x, y, { width: b, characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(TINTE);
}

/**
 * Briefkopf für Belege: Logo und Veranstalter links, darunter eine Linie in Vereinsfarbe,
 * dann Belegtitel links und die Belegangaben (Nr., Datum …) als kleine Tabelle rechts.
 */
export function briefkopf(
  doc: Doc,
  d: Design,
  kopf: { verein: string; zeile: string; art?: string; titel: string; unter?: string; angaben?: [string, string][] },
) {
  const x = links(doc);
  const w = breite(doc);
  let y = doc.page.margins.top;
  let tx = x;
  const logoH = 13 * MM;
  const logo = logoBild(doc, d);
  if (logo) {
    doc.image(logo, x, y, { fit: [logoH, logoH] });
    tx = x + logoH + 3.5 * MM;
  }
  doc.font(SANS_FETT).fontSize(10).fillColor(TINTE).text(kopf.verein, tx, y + (logo ? 1.5 * MM : 0), { width: w - (tx - x) });
  doc.font(SANS).fontSize(8).fillColor(GRAU).text(kopf.zeile, tx, doc.y + 0.5, { width: w - (tx - x) });
  y = Math.max(doc.y, logo ? y + logoH : 0) + 3 * MM;
  doc.save().rect(x, y, w, 1.2).fill(d.flaeche).restore();
  y += 6 * MM;
  const angaben = kopf.angaben ?? [];
  const aw = angaben.length ? 62 * MM : 0;
  if (kopf.art) {
    kicker(doc, kopf.art, x, y, d.farbe, w - aw);
    y += 4 * MM;
  }
  doc.font(SERIF).fontSize(20).fillColor(TINTE).text(kopf.titel, x, y, { width: w - aw - 4 * MM, lineGap: -2 });
  if (kopf.unter) doc.font(SANS_KURSIV).fontSize(9).fillColor(GRAU).text(kopf.unter, x, doc.y + 1, { width: w - aw - 4 * MM });
  let yL = doc.y;
  // Belegangaben rechts: Bezeichnung grau, Wert rechtsbündig.
  let yR = y - (kopf.art ? 4 * MM : 0);
  for (const [l, v] of angaben) {
    doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(l, x + w - aw, yR, { width: aw * 0.4, lineBreak: false });
    // Wert immer einzeilig: erst kleiner, dann gekürzt – lange Angaben liefen sonst übereinander.
    textImFeld(doc, v, x + w - aw * 0.6, yR, { breite: aw * 0.6, groesse: 8.5, min: 6.5, schrift: SANS_FETT, farbe: TINTE, align: "right" });
    yR += 15;
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x + w - aw, yR - 3.5).lineTo(x + w, yR - 3.5).stroke().restore();
  }
  yL = Math.max(yL, yR);
  doc.x = x;
  doc.y = yL + 6 * MM;
  doc.fillColor(TINTE);
}

/** Fußzeile auf allen Seiten: links Veranstalter/Kontakt, rechts „Seite x von n“. */
export function fusszeilen(doc: Doc, linksText: string, anfaenge?: number[]) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    const { nr, von } = teilSeite(i - range.start, range.count, anfaenge);
    doc.switchToPage(i);
    const rand = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - rand * 0.6;
    const x = links(doc);
    const w = breite(doc);
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x, y - 4).lineTo(x + w, y - 4).stroke().restore();
    doc.font(SANS).fontSize(7).fillColor(GRAU);
    doc.text(linksText, x, y, { width: w * 0.75, lineBreak: false, ellipsis: true });
    doc.text(`Seite ${nr} von ${von}`, x, y, { width: w, align: "right", lineBreak: false });
    doc.page.margins.bottom = rand;
    doc.fillColor(TINTE);
  }
}

/**
 * Seitenzahl innerhalb eines Teils: Ein PDF mit mehreren Briefen (Serienbrief, Ausstellerunterlagen) zählt je Brief.
 * `anfaenge` sind die Seitenindizes (ab 0), auf denen ein neuer Brief beginnt; ohne zählt das ganze PDF.
 */
export function teilSeite(i: number, anzahl: number, anfaenge?: number[]): { nr: number; von: number } {
  if (!anfaenge?.length) return { nr: i + 1, von: anzahl };
  const start = Math.max(0, ...anfaenge.filter((a) => a <= i));
  const ende = Math.min(anzahl, ...anfaenge.filter((a) => a > i));
  return { nr: i - start + 1, von: ende - start };
}

/** Alte Fußzeile („Seite x von n“) – Name für bestehende Aufrufe. */
export function seitenzahlen(doc: Doc, linksText: string) {
  fusszeilen(doc, linksText);
}

export interface Spalte {
  titel: string;
  breite: number;
  align?: "left" | "right" | "center";
  /** Zahlen und Beträge fett setzen (z. B. Saldo). */
  fett?: boolean;
}

/**
 * Tabelle im Stil der Belege: Kopf in kleinen Versalien, feine Linien zwischen den Zeilen,
 * Kopf wiederholt sich nach Seitenumbruch, optional Summenzeile mit Linie darüber.
 * Danach steht doc.x wieder am linken Rand (sonst läuft Folgetext in die letzte Spalte).
 */
export function tabelle(
  doc: Doc,
  spalten: Spalte[],
  zeilen: string[][],
  opts: { schrift?: number; summe?: string[]; zeilenhoehe?: number; streifen?: string; schreibzeilen?: boolean } = {},
) {
  const schrift = opts.schrift ?? 9;
  const x0 = links(doc);
  const pad = 2;
  const kopf = () => {
    let x = x0;
    const y = doc.y;
    doc.font(SANS_FETT).fontSize(Math.min(7.5, schrift - 1)).fillColor(GRAU);
    for (const s of spalten) {
      doc.text(s.titel.toLocaleUpperCase("de"), x + pad, y, { width: s.breite - 2 * pad, align: s.align ?? "left", lineBreak: false, characterSpacing: 0.5 });
      x += s.breite;
    }
    doc.save().lineWidth(0.7).strokeColor(TINTE).moveTo(x0, y + 11).lineTo(x, y + 11).stroke().restore();
    doc.y = y + 15;
    doc.fillColor(TINTE);
  };
  const ende = x0 + spalten.reduce((n, s) => n + s.breite, 0);
  kopf();
  zeilen.forEach((z, zi) => {
    doc.font(SANS).fontSize(schrift);
    const hoehe = Math.max(opts.zeilenhoehe ?? 0, ...z.map((t, i) => doc.heightOfString(t || " ", { width: spalten[i]!.breite - 2 * pad }))) + 3;
    if (doc.y + hoehe > unten(doc)) {
      doc.addPage();
      kopf();
    }
    const y = doc.y;
    if (opts.streifen && zi % 2 === 1) doc.save().fillOpacity(0.05).rect(x0, y - 2, ende - x0, hoehe + 1).fill(opts.streifen).restore();
    let x = x0;
    z.forEach((t, i) => {
      const s = spalten[i]!;
      doc.font(s.fett ? SANS_FETT : SANS).fontSize(schrift).fillColor(TINTE).text(t, x + pad, y, { width: s.breite - 2 * pad, align: s.align ?? "left" });
      x += s.breite;
    });
    doc.y = y + hoehe;
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x0, doc.y - 1.5).lineTo(ende, doc.y - 1.5).stroke().restore();
    doc.y += 1.5;
  });
  if (opts.summe) {
    if (doc.y + 18 > unten(doc)) {
      doc.addPage();
      kopf();
    }
    const y = doc.y + 1;
    doc.save().lineWidth(0.7).strokeColor(TINTE).moveTo(x0, y - 1).lineTo(ende, y - 1).stroke().restore();
    let x = x0;
    opts.summe.forEach((t, i) => {
      const s = spalten[i]!;
      doc.font(SANS_FETT).fontSize(schrift).fillColor(TINTE).text(t, x + pad, y + 3, { width: s.breite - 2 * pad, align: s.align ?? "left", lineBreak: false });
      x += s.breite;
    });
    doc.y = y + schrift + 8;
  }
  doc.x = x0;
  doc.fillColor(TINTE);
}

/**
 * Setzt Text in ein Feld fester Größe: verkleinert die Schrift schrittweise bis `min`
 * und kürzt erst danach mit „…“, damit nichts in das nächste Feld läuft.
 * Ohne `hoehe` ist das Feld eine Zeile hoch. Gibt die verwendete Schriftgröße zurück.
 */
export function textImFeld(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  feld: { breite: number; hoehe?: number; groesse: number; min?: number; schrift?: string; farbe?: string; align?: "left" | "center" | "right" },
): number {
  const min = feld.min ?? 7;
  let gr = feld.groesse;
  // Kein Platz: nichts setzen – pdfkit kommt bei Breite ≤ 0 aus dem Zeilenumbruch nicht mehr heraus.
  if (!(feld.breite > 1)) return gr;
  doc.font(feld.schrift ?? SANS).fontSize(gr);
  if (feld.farbe) doc.fillColor(feld.farbe);
  const passt = () =>
    feld.hoehe == null ? doc.widthOfString(text) <= feld.breite : doc.heightOfString(text, { width: feld.breite }) <= feld.hoehe;
  while (gr > min && !passt()) doc.fontSize((gr = Math.max(min, gr - 0.5)));
  const hoehe = feld.hoehe ?? doc.currentLineHeight(true);
  doc.text(text, x, y, { width: feld.breite, height: hoehe, ellipsis: true, align: feld.align ?? "left" });
  return gr;
}

/** Zweispaltige Angaben („Bezeichnung  Wert“) mit feinen Linien. Gibt das untere y zurück. */
export function angaben(doc: Doc, zeilen: [string, string][], x: number, y: number, w: number, labelAnteil = 0.38, groesse = 9): number {
  const lb = w * labelAnteil;
  for (const [a, b] of zeilen.filter(([, v]) => v.trim())) {
    doc.font(SANS).fontSize(groesse);
    const h = Math.max(doc.heightOfString(a || " ", { width: lb - 6 }), doc.heightOfString(b, { width: w - lb }));
    doc.fillColor(GRAU).text(a, x, y, { width: lb - 6 });
    doc.fillColor(TINTE).text(b, x + lb, y, { width: w - lb });
    y += h + 3;
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x, y - 1.5).lineTo(x + w, y - 1.5).stroke().restore();
    y += 2.5;
  }
  doc.x = links(doc);
  return y;
}

/** Getönter Kasten mit Farbkante, z. B. für Hinweise. Gibt das untere y zurück. */
/** Höhe, die hinweisKasten() für diese Punkte braucht – zum Prüfen, ob er noch auf die Seite passt. */
export function hinweisKastenHoehe(doc: Doc, punkte: string[], w: number, groesse = 8.5): number {
  return kastenMasse(doc, punkte, w, groesse).h;
}

function kastenMasse(doc: Doc, punkte: string[], w: number, groesse: number) {
  const innen = 4 * MM;
  const tb = w - 2 * innen - 8;
  doc.font(SANS).fontSize(groesse);
  const hoehen = punkte.map((t) => doc.heightOfString(t, { width: tb, lineGap: 1 }));
  return { innen, tb, hoehen, h: innen + 12 + hoehen.reduce((n, v) => n + v + 3, 0) - 3 + innen };
}

export function hinweisKasten(doc: Doc, d: Design, titel: string, punkte: string[], x: number, y: number, w: number, groesse = 8.5): number {
  const { innen, tb, hoehen, h } = kastenMasse(doc, punkte, w, groesse);
  doc.save().fillOpacity(0.08).rect(x, y, w, h).fill(d.flaeche).restore();
  doc.save().rect(x, y, 2.2, h).fill(d.flaeche).restore();
  kicker(doc, titel, x + innen, y + innen, d.farbe, w - 2 * innen);
  let ty = y + innen + 12;
  punkte.forEach((t, i) => {
    doc.font(SANS_FETT).fontSize(groesse).fillColor(d.farbe).text("•", x + innen, ty, { lineBreak: false });
    doc.font(SANS).fontSize(groesse).fillColor(TINTE).text(t, x + innen + 8, ty, { width: tb, lineGap: 1 });
    ty += hoehen[i]! + 3;
  });
  doc.x = links(doc);
  doc.fillColor(TINTE);
  return y + h;
}

/** Unterschriftslinie mit Beschriftung darunter. */
export function unterschrift(doc: Doc, x: number, y: number, w: number, beschriftung: string, vorgabe = "") {
  if (vorgabe) doc.font(SANS).fontSize(9).fillColor(TINTE).text(vorgabe, x, y - 12, { width: w, lineBreak: false, ellipsis: true });
  doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(x, y).lineTo(x + w, y).stroke().restore();
  doc.font(SANS).fontSize(7).fillColor(GRAU).text(beschriftung, x, y + 2.5, { width: w, lineBreak: false });
  doc.fillColor(TINTE);
}

export function ueberschrift(doc: Doc, text: string, groesse = 14) {
  doc.font(SERIF).fontSize(groesse).fillColor(TINTE).text(text, links(doc), doc.y);
  doc.font(SANS).moveDown(0.3);
}

export function datumDe(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(`${d}T12:00:00`) : d;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
}
