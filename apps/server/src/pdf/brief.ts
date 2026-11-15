/**
 * Briefe nach der Briefvorlage des Vereins (DIN 5008, Form A oder B): Briefkopf, Rücksendeangabe, Anschrift,
 * Informationsblock, Falzmarken und Fußzeile. Genutzt von der Meldebestätigung (dokumente.ts), der Abrechnung und dem
 * Serienbrief. Die Maße und Texte stehen in packages/domain/src/briefvorlage.ts.
 */
import { anschriftfeld, briefVorlageLesen, falzmarkenMm, fuelle, type BriefPlatzhalter, type BriefVorlage } from "@schau/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { druckvorlage } from "../db/schema";
import { angaben, type Design, type Doc, erzeugePdf, fusszeilen, GRAU, HAARLINIE, logoBild, MM, SANS, SANS_FETT, SERIF, teilSeite, TINTE } from "./basis";

/** DIN 5008: links 25 mm, rechts 20 mm. Oben knapp, damit der Briefkopf Platz hat. */
export const BRIEF_RAENDER = { top: 14 * MM, bottom: 22 * MM, left: 25 * MM, right: 20 * MM };

/** Briefvorlage des Vereins (oder die Vorgabe). */
export async function ladeBriefVorlage(organisationId: number): Promise<BriefVorlage> {
  const [v] = await db
    .select({ daten: druckvorlage.daten })
    .from(druckvorlage)
    .where(and(eq(druckvorlage.organisationId, organisationId), eq(druckvorlage.art, "brief"), isNull(druckvorlage.schauId)))
    .orderBy(asc(druckvorlage.id))
    .limit(1);
  return briefVorlageLesen(v?.daten);
}

/** Farben des Briefs: Vereinsfarbe oder – „farbig“ aus – nur Schwarz und Grau. */
export function briefDesign(d: Design, v: BriefVorlage): Design {
  return v.farbig ? d : { ...d, farbe: TINTE, flaeche: "#4a4a4a" };
}

/**
 * Erste Seite eines Briefs bis zum Textbeginn: Briefkopf, Linie, Falzmarken, Rücksendeangabe, Anschrift und rechts
 * die Angaben (Nr., Datum …). Danach steht doc.y am Beginn des Brieftexts.
 */
export function briefKopf(doc: Doc, d: Design, v: BriefVorlage, b: { verein: string; unterzeile: string; empfaenger: string[]; angaben: [string, string][] }) {
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  const feld = anschriftfeld(v.form);
  // Briefkopf: bei Form A knapper (bis 27 mm), bei Form B mit Platz bis 45 mm.
  const kopfY = (v.form === "A" ? 8 : 12) * MM;
  const logoH = (v.form === "A" ? 11 : 14) * MM;
  let tx = x;
  const logo = v.logo ? logoBild(doc, d) : null;
  if (logo) {
    doc.image(logo, x, kopfY, { fit: [logoH, logoH] });
    tx = x + logoH + 3.5 * MM;
  }
  const zeilen = v.kopf.trim() ? v.kopf.trim().split("\n") : [b.verein, b.unterzeile];
  // Der Kopf endet über der Trennlinie; was nicht passt, wird mit „…“ abgeschnitten statt ins Anschriftfeld zu laufen.
  const linieY = (v.form === "A" ? 22 : 30) * MM;
  doc.font(SANS_FETT).fontSize(v.form === "A" ? 10 : 11).fillColor(TINTE).text(zeilen[0] ?? "", tx, kopfY + 1.5 * MM, { width: w - (tx - x), lineBreak: false, ellipsis: true });
  const restY = doc.y + 0.5;
  if (zeilen.length > 1 && linieY - 1.5 * MM - restY > 6)
    doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(zeilen.slice(1).join("\n"), tx, restY, { width: w - (tx - x), height: linieY - 1.5 * MM - restY, ellipsis: true });
  doc.save().rect(x, linieY, w, 1.2).fill(d.flaeche).restore();
  if (v.falzmarken)
    falzmarkenMm(v.form).forEach((y, i) => doc.save().lineWidth(0.4).strokeColor(GRAU).moveTo(5 * MM, y * MM).lineTo((i === 1 ? 11 : 9) * MM, y * MM).stroke().restore());
  // Rücksendeangabe in der Vermerkzone, darunter die Anschrift (DIN 5008).
  const ax = feld.x * MM;
  doc.font(SANS).fontSize(7).fillColor(GRAU).text(v.absender.trim() || b.verein, ax, (feld.anschriftAb - 8.5) * MM, { width: feld.breite * MM, underline: true, lineBreak: false, ellipsis: true });
  doc.font(SANS).fontSize(10.5).fillColor(TINTE).text(b.empfaenger.filter(Boolean).join("\n"), ax, (feld.anschriftAb + 0.8) * MM, { width: feld.breite * MM, height: (feld.y + feld.hoehe - feld.anschriftAb) * MM, lineGap: 1, ellipsis: true });
  // Informationsblock ab 125 mm von links.
  const ix = 125 * MM;
  angaben(doc, b.angaben, ix, (feld.y + 5) * MM, doc.page.width - doc.page.margins.right - ix, 0.45, 8.5);
  doc.x = x;
  doc.y = (feld.y + feld.hoehe + 10) * MM;
  doc.fillColor(TINTE);
}

/** Kopfzeilen für Belege (Abrechnung, Quittung): eigene Zeilen der Vorlage oder Verein und Schau. */
export function belegKopf(v: BriefVorlage, verein: string, zeile: string): { verein: string; zeile: string } {
  const z = v.kopf.trim().split("\n").filter((t) => t.trim());
  return z.length ? { verein: z[0]!, zeile: z.slice(1).join(" · ") || zeile } : { verein, zeile };
}

/**
 * Fußzeile aller Seiten: drei Spalten aus der Vorlage (mit Seitenzahl darunter) oder die einzeilige Standardfußzeile.
 * `anfaenge`: Seiten (ab 0), auf denen ein neuer Brief beginnt – dann zählen die Seitenzahlen je Brief.
 */
export function briefFuss(doc: Doc, v: BriefVorlage, standard: string, anfaenge?: number[]) {
  if (!v.fuss.some((t) => t.trim())) return fusszeilen(doc, standard, anfaenge);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const rand = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const x = doc.page.margins.left;
    const w = doc.page.width - x - doc.page.margins.right;
    const y = doc.page.height - rand + 3 * MM;
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x, y - 2 * MM).lineTo(x + w, y - 2 * MM).stroke().restore();
    const sb = (w - 8 * MM) / 3;
    v.fuss.forEach((t, s) => doc.font(SANS).fontSize(6.8).fillColor(GRAU).text(t, x + s * (sb + 4 * MM), y, { width: sb, height: rand - 8 * MM, ellipsis: true, lineGap: 0.5 }));
    const { nr, von } = teilSeite(i - range.start, range.count, anfaenge);
    if (von > 1) doc.font(SANS).fontSize(6.8).fillColor(GRAU).text(`Seite ${nr} von ${von}`, x, doc.page.height - 6 * MM, { width: w, align: "right", lineBreak: false });
    doc.page.margins.bottom = rand;
  }
  doc.fillColor(TINTE);
}

export interface SerienbriefEmpfaenger {
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
}

/** Serienbrief: je Empfänger eine Seite (oder mehr), Betreff und Text mit eingesetzten Platzhaltern. */
export function serienbriefPdf(
  d: Design,
  v: BriefVorlage,
  b: { verein: string; unterzeile: string; standardFuss: string; betreff: string; text: string; gruss: string; werte: (e: SerienbriefEmpfaenger) => Record<BriefPlatzhalter, string>; datum: string },
  empfaenger: SerienbriefEmpfaenger[],
) {
  const dd = briefDesign(d, v);
  return erzeugePdf(
    `Serienbrief ${b.verein}`,
    (doc) => {
      const anfaenge: number[] = [];
      empfaenger.forEach((e, i) => {
        if (i > 0) doc.addPage();
        anfaenge.push(doc.bufferedPageRange().count - 1);
        const w = b.werte(e);
        briefKopf(doc, dd, v, { verein: b.verein, unterzeile: b.unterzeile, empfaenger: [`${e.vorname} ${e.nachname}`.trim(), e.strasse, `${e.plz} ${e.ort}`.trim()], angaben: [["Datum", b.datum]] });
        const x = doc.page.margins.left;
        const breite = doc.page.width - x - doc.page.margins.right;
        doc.font(SERIF).fontSize(14).fillColor(TINTE).text(fuelle(b.betreff, w), x, doc.y, { width: breite });
        doc.font(SANS).fontSize(10).fillColor(TINTE).text(fuelle(b.text, w), x, doc.y + 4 * MM, { width: breite, lineGap: 2 });
        if (b.gruss.trim()) doc.text(fuelle(b.gruss, w), x, doc.y + 6 * MM, { width: breite, lineGap: 2 });
      });
      if (empfaenger.length === 0) doc.font(SANS).fontSize(10).text("Keine Empfänger ausgewählt.");
      briefFuss(doc, v, b.standardFuss, anfaenge);
    },
    { margins: BRIEF_RAENDER },
  );
}
