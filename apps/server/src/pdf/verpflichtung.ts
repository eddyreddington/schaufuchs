/**
 * Preisrichterverpflichtung: Brief nach der Briefvorlage des Vereins (Briefkopf, Anschrift im Fenster, Fußzeile wie der
 * B-Bogen) mit der Bitte um Bewertung bei der Schau und einem Abschnitt zum Abtrennen – Name, Zusage oder Absage, Gruppen
 * zum Ankreuzen, Vorbehalt, Datum, Unterschrift. Alle Preisrichter der Schau (je Brief ab neuer Seite) oder nur einer.
 * Betreff und Text aus der Briefvorlage (leer: fester Text) und die Gruppen rechnet packages/domain/src/preisrichter-druck.ts
 * (`verpflichtungBrief`, `verpflichtungGruppen`); „Rückmeldung bis“ aus den Einstellungen der Schau.
 */
import { type BriefVorlage, briefWerte, fuelle, verpflichtungBrief, verpflichtungGruppen } from "@schau/domain";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { preisrichter, rasse } from "../db/schema";
import { datumDe, type Design, type Doc, erzeugePdf, GRAU, HAARLINIE, kicker, MM, SANS, SANS_FETT, SERIF, textImFeld, TINTE, unterschrift } from "./basis";
import { BRIEF_RAENDER, briefDesign, briefFuss, briefKopf, ladeBriefVorlage } from "./brief";
import { breite, fusstext, kopfzeile, ladeDesign, type Schau, unten, verein } from "./dokumente-gemeinsam";

export type Richter = { id: number; name: string; anschrift: string };

/** Gruppen je Zeile im Abschnitt und Höhe einer Zeile. */
const JE_ZEILE = 8;
const GRUPPENZEILE = 7 * MM;
const KAESTCHEN = 3.4 * MM;

/** Null: `preisrichterId` gehört nicht zu dieser Schau. */
export async function preisrichterVerpflichtungPdf(s: Schau, preisrichterId?: number) {
  const [richter, gruppen, dVerein, vorlage] = await Promise.all([
    db.select({ id: preisrichter.id, name: preisrichter.name, anschrift: preisrichter.anschrift }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
    ladeVerpflichtungsGruppen(s.stammdatenVersionId),
    ladeDesign(s),
    ladeBriefVorlage(s.organisationId),
  ]);
  const auswahl = preisrichterId == null ? richter : richter.filter((r) => r.id === preisrichterId);
  if (preisrichterId != null && !auswahl.length) return null;
  return verpflichtungsBriefe(s, auswahl, gruppen, dVerein, vorlage);
}

/** Gruppen zum Ankreuzen aus dem Rassenverzeichnis der Schau (ohne Verzeichnis: die feste Auswahl). */
export async function ladeVerpflichtungsGruppen(stammdatenVersionId: number | null) {
  const verzeichnis = stammdatenVersionId != null ? await db.selectDistinct({ gruppe: rasse.gruppe }).from(rasse).where(eq(rasse.versionId, stammdatenVersionId)) : [];
  return verpflichtungGruppen(verzeichnis.map((v) => v.gruppe));
}

/** Was der Brief von der Schau braucht (die Vorschau der Briefvorlage setzt ohne Schau Beispielwerte ein). */
export type VerpflichtungSchau = Pick<Schau, "name" | "ort" | "veranstalter" | "kontaktEmail" | "bewertungAm" | "preisrichterRueckmeldungBis" | "meldeschluss" | "einlieferung">;

/**
 * Die Briefe selbst: an `richter` mit den Gruppen zum Ankreuzen, nach `vorlage` (auch die noch nicht gespeicherte in der
 * Vorschau der Briefvorlage, dann mit einem Beispiel-Preisrichter).
 */
export function verpflichtungsBriefe(s: VerpflichtungSchau, richter: Richter[], gruppen: string[], dVerein: Design, vorlage: BriefVorlage) {
  const d = briefDesign(dVerein, vorlage);
  const heute = datumDe(new Date());
  const tag = datumDe(s.bewertungAm);
  const rueckmeldung = datumDe(s.preisrichterRueckmeldungBis);

  return erzeugePdf(
    `Preisrichterverpflichtung ${s.name}`,
    (doc) => {
      const anfaenge: number[] = [];
      richter.forEach((r, i) => {
        if (i > 0) doc.addPage();
        anfaenge.push(doc.bufferedPageRange().count - 1);
        brief(doc, r);
      });
      if (!richter.length) doc.font(SANS).fontSize(10).text("Keine Preisrichter angelegt.");
      briefFuss(doc, vorlage, fusstext(s), anfaenge);
    },
    { margins: BRIEF_RAENDER },
  );

  function brief(doc: Doc, r: Richter) {
    const x = doc.page.margins.left;
    const w = breite(doc);
    const werte = briefWerte(
      { vorname: "", nachname: r.name },
      { verein: verein(s), schau: s.name, ort: s.ort, meldeschluss: datumDe(s.meldeschluss), einlieferung: s.einlieferung, bewertungstag: tag, rueckmeldung, datum: heute },
    );
    briefKopf(doc, d, vorlage, {
      verein: verein(s),
      unterzeile: kopfzeile(s),
      empfaenger: [r.name, ...r.anschrift.split("\n").map((z) => z.trim())],
      angaben: [
        ["Schau", s.name],
        ["Bewertung", tag || "–"],
        ...(rueckmeldung ? [["Rückmeldung bis", rueckmeldung] as [string, string]] : []),
        ["Datum", heute],
      ],
    });
    const { betreff, text } = verpflichtungBrief(vorlage.verpflichtung, werte);
    doc.font(SERIF).fontSize(14).fillColor(TINTE).text(betreff, x, doc.y, { width: w });
    doc.font(SANS).fontSize(10).fillColor(TINTE).text(text, x, doc.y + 4 * MM, { width: w, lineGap: 2 });
    const gruss = fuelle(vorlage.serienbrief.gruss, werte).trim() || `Mit freundlichen Grüßen\n${verein(s)}`;
    doc.text(gruss, x, doc.y + 6 * MM, { width: w, lineGap: 2 });
    // Der Abschnitt steht unten auf der Seite; reicht der Platz unter dem Text nicht, auf der nächsten.
    const hoehe = abschnittHoehe();
    let y = unten(doc) - hoehe;
    if (doc.y + 8 * MM > y) {
      doc.addPage();
      y = doc.page.margins.top + 6 * MM;
    }
    abschnitt(doc, r, x, y, w);
  }

  function abschnittHoehe() {
    return 72 * MM + Math.ceil(gruppen.length / JE_ZEILE) * GRUPPENZEILE;
  }

  function kaestchen(doc: Doc, x: number, y: number, beschriftung: string, schrift = SANS) {
    doc.save().lineWidth(0.6).strokeColor(TINTE).rect(x, y, KAESTCHEN, KAESTCHEN).stroke().restore();
    doc.font(schrift).fontSize(9.5).fillColor(TINTE).text(beschriftung, x + KAESTCHEN + 2 * MM, y + 0.2 * MM, { lineBreak: false });
  }

  function abschnitt(doc: Doc, r: Richter, x: number, y: number, w: number) {
    // Schnittlinie über die ganze Blattbreite, mit Schere und „hier abtrennen“.
    const links = 8 * MM;
    doc.save().lineWidth(0.5).strokeColor(GRAU).dash(3, { space: 2.5 }).moveTo(links, y).lineTo(doc.page.width - links, y).stroke().undash().restore();
    schere(doc, x + 2 * MM, y);
    const hinweis = "hier abtrennen";
    doc.font(SANS).fontSize(7).fillColor(GRAU);
    const hb = doc.widthOfString(hinweis) + 3 * MM;
    doc.save().rect(x + w / 2 - hb / 2, y - 2 * MM, hb, 4 * MM).fill("#ffffff").restore();
    doc.font(SANS).fontSize(7).fillColor(GRAU).text(hinweis, x + w / 2 - hb / 2, y - 1.2 * MM, { width: hb, align: "center", lineBreak: false });

    let yy = y + 7 * MM;
    kicker(doc, `Preisrichterverpflichtung · Rückmeldung an ${verein(s)}`, x, yy, d.farbe, w);
    yy += 4.5 * MM;
    // Rechts in der Zeile der Schau: bis wann der Abschnitt zurück sein soll.
    const bis = rueckmeldung ? `Rückmeldung bis ${rueckmeldung}` : "";
    doc.font(SANS_FETT).fontSize(9.5);
    const bisBreite = bis ? doc.widthOfString(bis) + 4 * MM : 0;
    if (bis) doc.fillColor(TINTE).text(bis, x + w - bisBreite, yy + 0.8 * MM, { width: bisBreite, align: "right", lineBreak: false });
    doc.font(SERIF).fontSize(12).fillColor(TINTE).text([s.name, s.ort, tag].filter(Boolean).join(" · "), x, yy, { width: w - bisBreite, lineBreak: false, ellipsis: true });
    yy += 8 * MM;
    // Name des Preisrichters, darunter Zusage oder Absage.
    doc.font(SANS).fontSize(8).fillColor(GRAU).text("Name", x, yy + 0.8 * MM, { lineBreak: false });
    textImFeld(doc, r.name, x + 16 * MM, yy, { breite: w - 16 * MM, groesse: 10.5, min: 8, schrift: SANS_FETT, farbe: TINTE });
    doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x + 16 * MM, yy + 5 * MM).lineTo(x + w, yy + 5 * MM).stroke().restore();
    yy += 9 * MM;
    kaestchen(doc, x, yy, "Ich sage zu", SANS_FETT);
    kaestchen(doc, x + 45 * MM, yy, "Ich sage ab", SANS_FETT);
    yy += 8 * MM;
    doc.font(SANS).fontSize(8).fillColor(GRAU).text("Ich bewerte diese Gruppen:", x, yy, { lineBreak: false });
    yy += 5 * MM;
    const zelle = w / JE_ZEILE;
    gruppen.forEach((g, i) => kaestchen(doc, x + (i % JE_ZEILE) * zelle, yy + Math.floor(i / JE_ZEILE) * GRUPPENZEILE, g));
    yy += Math.ceil(gruppen.length / JE_ZEILE) * GRUPPENZEILE + 1 * MM;
    // Vorbehalt: zwei Linien zum Schreiben.
    doc.font(SANS).fontSize(8).fillColor(GRAU).text("Vorbehalt", x, yy + 2 * MM, { lineBreak: false });
    for (const ly of [yy + 5 * MM, yy + 12 * MM]) doc.save().lineWidth(0.4).strokeColor(TINTE).moveTo(x + 16 * MM, ly).lineTo(x + w, ly).stroke().restore();
    yy += 24 * MM;
    unterschrift(doc, x, yy, 45 * MM, "Datum");
    unterschrift(doc, x + 60 * MM, yy, w - 60 * MM, "Unterschrift");
    doc.fillColor(TINTE);
  }
}

/** Kleine Schere (zwei Griffe, zwei Klingen) auf der Schnittlinie – als Zeichnung, denn die Schrift hat kein Scherenzeichen. */
function schere(doc: Doc, x: number, y: number) {
  doc.save().rect(x - 1 * MM, y - 2.6 * MM, 8 * MM, 5.2 * MM).fill("#ffffff").restore();
  doc.save().lineWidth(0.6).strokeColor(TINTE);
  doc.circle(x + 1 * MM, y - 1.3 * MM, 1 * MM).stroke();
  doc.circle(x + 1 * MM, y + 1.3 * MM, 1 * MM).stroke();
  doc.moveTo(x + 1.9 * MM, y - 0.9 * MM).lineTo(x + 6.5 * MM, y + 1.2 * MM).stroke();
  doc.moveTo(x + 1.9 * MM, y + 0.9 * MM).lineTo(x + 6.5 * MM, y - 1.2 * MM).stroke();
  doc.restore();
}
