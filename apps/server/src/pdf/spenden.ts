/**
 * Spenden: Zuwendungsbestätigung nach amtlichem Muster (Geld, Sache, Sammelbestätigung mit Anlage) und die einfache
 * Spendenquittung für die Kasse. Der Wortlaut steht unverändert in packages/domain/src/zuwendungsbestaetigung.ts;
 * hier nur die Anordnung in der Reihenfolge der Muster. Logo und laufende Nummer sind erlaubt (BMF Nr. 3), Dank und
 * Werbung auf der Vorderseite nicht (Nr. 2). Entscheidung 013.
 */
import {
  ANLAGE_SPALTEN,
  ANLAGE_TITEL,
  AUSSTELLER_TITEL,
  bescheidSatz,
  betragFelder,
  betragInWorten,
  datumKurz,
  formatEuro,
  HINWEIS,
  MITGLIEDSBEITRAG_SATZ,
  MITGLIEDSBEITRAG_TITEL,
  sachSaetze,
  SAMMEL_KEINE_WEITEREN,
  SAMMEL_VERZICHT,
  type Sachangaben,
  spenderName,
  type SpenderAnschrift,
  type Steuerstatus,
  UEBERSCHRIFT,
  UNTERSCHRIFT_TITEL,
  UNTERZEILE,
  verwendungSatz,
  ZUWENDENDER_TITEL,
} from "@schau/domain";
import { angaben, briefkopf, type Design, type Doc, erzeugePdf, GRAU, HAARLINIE, logoBild, MM, SANS, SANS_FETT, SANS_KURSIV, SERIF, TINTE, unterschrift } from "./basis";

export interface BestaetigungsSpende {
  datum: string;
  betragCent: number;
  verzichtAufwand: boolean;
  sache: Sachangaben | null;
}

export interface BestaetigungDaten {
  art: "geld" | "sache" | "sammel";
  nummer: string;
  verein: { name: string; anschrift: string };
  spender: SpenderAnschrift;
  steuer: Steuerstatus;
  spenden: BestaetigungsSpende[];
  /** Ausstellungstag (JJJJ-MM-TT). */
  heute: string;
  /** Sammelbestätigung: Kalenderjahr. */
  jahr?: number;
}

const GROESSE = 8.8;

/** Ankreuzkästchen, angekreuzt oder leer. */
function kaestchen(doc: Doc, x: number, y: number, an: boolean) {
  const k = 3.2 * MM;
  doc.save().lineWidth(0.6).strokeColor(TINTE).rect(x, y, k, k).stroke();
  if (an) doc.moveTo(x + 0.6, y + 0.6).lineTo(x + k - 0.6, y + k - 0.6).moveTo(x + k - 0.6, y + 0.6).lineTo(x + 0.6, y + k - 0.6).stroke();
  doc.restore();
}

/** Satz mit vorangestelltem, angekreuztem Kästchen (nur zutreffende Varianten stehen auf der Bestätigung). */
function angekreuzt(doc: Doc, text: string, x: number, w: number) {
  const y = doc.y;
  kaestchen(doc, x, y + 0.5, true);
  doc.font(SANS).fontSize(GROESSE).fillColor(TINTE).text(text, x + 6 * MM, y, { width: w - 6 * MM, lineGap: 1 });
  doc.y += 2.2 * MM;
}

/** Feld mit kleiner Beschriftung oben (bis zwei Zeilen) und dem Inhalt unten, gerahmt. */
function feld(doc: Doc, titel: string, inhalt: string, x: number, y: number, w: number, h: number) {
  doc.save().lineWidth(0.5).strokeColor(HAARLINIE).rect(x, y, w, h).stroke().restore();
  doc.font(SANS).fontSize(7).fillColor(GRAU).text(titel, x + 1.8 * MM, y + 1.4 * MM, { width: w - 3.6 * MM, height: 7.5 * MM, ellipsis: true });
  doc.font(SANS_FETT).fontSize(9.5).fillColor(TINTE).text(inhalt, x + 1.8 * MM, y + h - 5.6 * MM, { width: w - 3.6 * MM, height: 5 * MM, ellipsis: true, lineBreak: false });
}

/** Zuwendungsbestätigung nach amtlichem Muster; Sammelbestätigung mit der Anlage auf Seite 2. */
export function zuwendungsbestaetigungPdf(d: Design, b: BestaetigungDaten) {
  return erzeugePdf(
    `Zuwendungsbestätigung ${b.nummer}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = doc.page.width - x - doc.page.margins.right;
      // Aussteller: Bezeichnung und Anschrift der steuerbegünstigten Einrichtung (mit Logo, BMF Nr. 3).
      const logo = logoBild(doc, d);
      const tx = logo ? x + 17 * MM : x;
      if (logo) doc.image(logo, x, doc.y, { fit: [14 * MM, 14 * MM] });
      const kopfY = doc.y;
      doc.font(SANS).fontSize(7).fillColor(GRAU).text(AUSSTELLER_TITEL, tx, kopfY, { width: w - (tx - x) - 40 * MM });
      doc.font(SANS_FETT).fontSize(10).fillColor(TINTE).text(b.verein.name, tx, doc.y + 1, { width: w - (tx - x) - 40 * MM });
      doc.font(SANS).fontSize(GROESSE).text(b.verein.anschrift.replace(/\s*\n\s*/g, ", "), tx, doc.y, { width: w - (tx - x) - 40 * MM });
      const kopfEnde = doc.y;
      doc.font(SANS).fontSize(8).fillColor(GRAU).text(`Nr. ${b.nummer}`, x + w - 40 * MM, kopfY, { width: 40 * MM, align: "right" });
      doc.y = Math.max(kopfEnde, kopfY + (logo ? 14 * MM : 0)) + 6 * MM;

      // Überschrift.
      doc.font(SANS_FETT).fontSize(12.5).fillColor(TINTE).text(UEBERSCHRIFT[b.art], x, doc.y, { width: w });
      doc.font(SANS).fontSize(8).fillColor(TINTE).text(UNTERZEILE, x, doc.y + 1, { width: w });
      doc.y += 4 * MM;

      // Name und Anschrift des Zuwendenden (als Anschriftenfeld, BMF Nr. 3).
      doc.font(SANS).fontSize(7).fillColor(GRAU).text(ZUWENDENDER_TITEL, x, doc.y, { width: w });
      const sp = b.spender;
      doc.font(SANS).fontSize(9.5).fillColor(TINTE).text([spenderName(sp), sp.strasse, `${sp.plz} ${sp.ort}`.trim()].join("\n"), x, doc.y + 1, { width: w, lineGap: 1 });
      doc.y += 4 * MM;

      // Betrag in Ziffern und Buchstaben, Tag bzw. Zeitraum.
      const summe = b.spenden.reduce((n, s) => n + s.betragCent, 0);
      const { ziffern, buchstaben } = betragFelder(summe);
      const wort = b.art === "sache" ? "Wert der Zuwendung" : b.art === "sammel" ? "Gesamtbetrag der Zuwendung" : "Betrag der Zuwendung";
      const tag = b.art === "sammel" ? ["Zeitraum der Sammelbestätigung:", `01.01.${b.jahr} – 31.12.${b.jahr}`] : ["Tag der Zuwendung:", datumKurz(b.spenden[0]!.datum)];
      const y = doc.y;
      const h = 14 * MM;
      feld(doc, `${wort} – in Ziffern –`, ziffern, x, y, 42 * MM, h);
      feld(doc, "– in Buchstaben –", buchstaben, x + 42 * MM, y, w - 42 * MM - 42 * MM, h);
      feld(doc, tag[0]!, tag[1]!, x + w - 42 * MM, y, 42 * MM, h);
      doc.x = x;
      doc.y = y + h + 4 * MM;

      if (b.art === "geld") {
        // Verzicht auf Erstattung von Aufwendungen: immer mit Ja/Nein ankreuzen (BMF Nr. 7).
        const vy = doc.y;
        const verzicht = b.spenden[0]!.verzichtAufwand;
        doc.font(SANS).fontSize(GROESSE).fillColor(TINTE).text("Es handelt sich um den Verzicht auf Erstattung von Aufwendungen", x, vy, { width: w - 45 * MM });
        doc.text("Ja", x + w - 40 * MM, vy, { lineBreak: false });
        kaestchen(doc, x + w - 34 * MM, vy + 0.5, verzicht);
        doc.text("Nein", x + w - 24 * MM, vy, { lineBreak: false });
        kaestchen(doc, x + w - 15 * MM, vy + 0.5, !verzicht);
        doc.x = x;
        doc.y = vy + 7 * MM;
      }
      if (b.art === "sache") {
        const s = b.spenden[0]!.sache!;
        doc.font(SANS).fontSize(7).fillColor(GRAU).text("Genaue Bezeichnung der Sachzuwendung mit Alter, Zustand, Kaufpreis usw.", x, doc.y, { width: w });
        doc.font(SANS).fontSize(9.5).fillColor(TINTE).text(s.bezeichnung, x, doc.y + 1, { width: w });
        doc.y += 3 * MM;
        for (const satz of sachSaetze(s)) angekreuzt(doc, satz, x, w);
        doc.y += 1 * MM;
      }

      angekreuzt(doc, bescheidSatz(b.steuer), x, w);
      doc.font(SANS).fontSize(GROESSE).fillColor(TINTE).text(verwendungSatz(b.steuer), x, doc.y, { width: w, lineGap: 1 });
      doc.y += 3 * MM;
      if (b.art !== "sache") {
        // Geflügelzucht ist Förderung der Tierzucht (§ 52 Abs. 2 Nr. 23 AO): Mitgliedsbeiträge sind nicht abziehbar.
        doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(MITGLIEDSBEITRAG_TITEL, x, doc.y, { width: w });
        doc.y += 1;
        angekreuzt(doc, MITGLIEDSBEITRAG_SATZ, x, w);
      }
      if (b.art === "sammel") {
        doc.font(SANS).fontSize(GROESSE).fillColor(TINTE).text(SAMMEL_KEINE_WEITEREN, x, doc.y, { width: w, lineGap: 1 });
        doc.text(SAMMEL_VERZICHT, x, doc.y + 2 * MM, { width: w, lineGap: 1 });
      }

      // Ort, Datum und Unterschrift – immer von Hand unterschrieben.
      const uy = Math.max(doc.y + 16 * MM, doc.page.height - doc.page.margins.bottom - 42 * MM);
      doc.font(SANS).fontSize(9.5).fillColor(TINTE).text([b.steuer.ort, datumKurz(b.heute)].filter(Boolean).join(", "), x, uy - 12, { width: 80 * MM, lineBreak: false });
      doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(x, uy).lineTo(x + 110 * MM, uy).stroke().restore();
      doc.font(SANS).fontSize(7).fillColor(GRAU).text(UNTERSCHRIFT_TITEL, x, uy + 2, { width: 110 * MM });

      // Hinweis (beide Absätze, immer).
      doc.font(SANS_FETT).fontSize(7.5).fillColor(TINTE).text("Hinweis:", x, uy + 9 * MM, { width: w });
      for (const absatz of HINWEIS) doc.font(SANS).fontSize(7.5).fillColor(TINTE).text(absatz, x, doc.y + 1, { width: w, lineGap: 0.5 });

      if (b.art === "sammel") {
        doc.addPage();
        doc.font(SANS_FETT).fontSize(12).fillColor(TINTE).text(ANLAGE_TITEL, x, doc.page.margins.top, { width: w });
        doc.font(SANS).fontSize(9).fillColor(GRAU).text(`zur Sammelbestätigung Nr. ${b.nummer} für ${spenderName(sp)}`, x, doc.y + 1, { width: w });
        doc.y += 4 * MM;
        // Spaltenköpfe im Wortlaut des Musters – mehrzeilig, daher eigene Tabelle.
        const sb = [32 * MM, w - 32 * MM - 52 * MM - 28 * MM, 52 * MM, 28 * MM];
        const zeile = (werte: string[], fett: boolean, groesse: number) => {
          const y0 = doc.y;
          doc.font(fett ? SANS_FETT : SANS).fontSize(groesse).fillColor(TINTE);
          const hoehe = Math.max(...werte.map((t, i) => doc.heightOfString(t, { width: sb[i]! - 2 * MM })));
          let sx = x;
          werte.forEach((t, i) => {
            doc.text(t, sx + 1 * MM, y0, { width: sb[i]! - 2 * MM, align: i === 3 ? "right" : "left" });
            sx += sb[i]!;
          });
          doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(x, y0 + hoehe + 1.2 * MM).lineTo(x + w, y0 + hoehe + 1.2 * MM).stroke().restore();
          doc.x = x;
          doc.y = y0 + hoehe + 2.4 * MM;
        };
        zeile([...ANLAGE_SPALTEN], true, 8);
        for (const s of b.spenden) zeile([datumKurz(s.datum), "Geldzuwendung", s.verzichtAufwand ? "ja" : "nein", formatEuro(s.betragCent)], false, 9);
        zeile(["Gesamtsumme", "", "", formatEuro(summe)], true, 9);
      }
    },
    { margins: { top: 18 * MM, bottom: 16 * MM, left: 22 * MM, right: 18 * MM } },
  );
}

export interface QuittungDaten {
  kopf: { verein: string; zeile: string };
  nummer: number;
  /** Stornobeleg: hebt die Spende auf, keine Geldübergabe. */
  storno: { grund: string; am: string } | null;
  spender: SpenderAnschrift;
  art: "geld" | "sache";
  weg: string;
  betragCent: number;
  datum: string | null;
  zweck: string;
  sache: Sachangaben | null;
  /** Darf der Verein Zuwendungsbestätigungen ausstellen (gemeinnützig, Bescheid gültig)? */
  bestaetigungMoeglich: boolean;
}

/**
 * Spendenquittung (A5 quer): Empfang der Spende für Spender und Kasse. Ausdrücklich keine Zuwendungsbestätigung –
 * die stellt der Verein nach amtlichem Muster gesondert aus.
 */
export function spendenquittungPdf(d: Design, q: QuittungDaten) {
  const titel = q.storno ? `Storno zu Spende S-${q.nummer}` : q.art === "sache" ? "Empfangsbestätigung Sachspende" : "Spendenquittung";
  return erzeugePdf(
    titel,
    (doc) => {
      const x = doc.page.margins.left;
      const w = doc.page.width - x - doc.page.margins.right;
      briefkopf(doc, d, { ...q.kopf, art: "Spende", titel, angaben: [["Beleg", `S-${q.nummer}`], ["Datum", q.datum ? datumKurz(q.datum) : "–"]] });
      let y = angaben(
        doc,
        [
          ["Spender", [spenderName(q.spender), q.spender.strasse, `${q.spender.plz} ${q.spender.ort}`.trim()].filter((t) => t.trim()).join(", ")],
          ["Art", q.art === "sache" ? `Sachspende: ${q.sache?.bezeichnung ?? ""}` : `Geldspende (${q.weg})`],
          ["Zweck", q.zweck],
          ...(q.storno ? ([["Storno", `${q.storno.am}: ${q.storno.grund}`]] as [string, string][]) : []),
        ],
        x,
        doc.y,
        w * 0.75,
        0.25,
      );
      y += 4 * MM;
      doc.save().fillOpacity(0.08).rect(x, y, w, 18 * MM).fill(d.flaeche).restore();
      doc.save().rect(x, y, 2.2, 18 * MM).fill(d.flaeche).restore();
      doc.font(SANS).fontSize(7).fillColor(GRAU).text(q.art === "sache" ? "WERT" : "BETRAG", x + 4 * MM, y + 3 * MM, { width: w * 0.4, characterSpacing: 1.2 });
      const betrag = q.storno ? -q.betragCent : q.betragCent;
      doc.font(SERIF).fontSize(20).fillColor(TINTE).text(formatEuro(betrag), x + 4 * MM, y + 7 * MM, { width: w * 0.4, lineBreak: false });
      doc.font(SANS_KURSIV).fontSize(8.5).fillColor(GRAU).text(`in Worten: ${betragInWorten(betrag)}`, x + w * 0.4, y + 8 * MM, { width: w * 0.6 - 4 * MM, align: "right" });
      y += 24 * MM;
      const text = q.storno
        ? "Die Spende wird storniert – keine Geldübergabe. Eine dazu ausgestellte Zuwendungsbestätigung ist ungültig."
        : `${q.art === "sache" ? "Die Sachspende hat der Verein erhalten." : q.weg === "bar" ? "Den Betrag hat der Verein bar erhalten." : "Die Spende ist beim Verein eingegangen."} Dies ist keine Zuwendungsbestätigung im Sinne des § 10b EStG.${q.bestaetigungMoeglich ? " Eine Zuwendungsbestätigung nach amtlichem Muster stellt der Verein gesondert aus." : ""}`;
      doc.font(SANS).fontSize(9).fillColor(TINTE).text(text, x, y, { width: w });
      // Unterschriften am Fuß – über dem unteren Rand, sonst beginnt pdfkit für die Beschriftung eine neue Seite.
      const sb = (w - 5 * MM) / 2;
      const uy = doc.page.height - doc.page.margins.bottom - 8 * MM;
      unterschrift(doc, x, uy, sb, "Unterschrift Kasse");
      unterschrift(doc, x + sb + 5 * MM, uy, sb, q.storno ? "Unterschrift Zeuge" : "Unterschrift Spender");
    },
    { size: "A5", layout: "landscape", margin: 12 * MM },
  );
}
