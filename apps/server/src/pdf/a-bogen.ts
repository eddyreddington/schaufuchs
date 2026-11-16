/**
 * A-Bogen (Meldebogen) zum Ausdrucken: der Aussteller füllt ihn aus, unterschreibt und schickt ihn an die
 * Meldestelle; mit der Unterschrift erkennt er AAB und Sonderbestimmungen an („Meldebogen ist unterschrieben“).
 * Leer für alle (Schauseite, Meldungen) oder vorausgefüllt aus einer Meldung (zum Unterschreiben nachreichen).
 * Gegenstück: B-Bogen in pdf/dokumente.ts. Die Zeilenregeln stehen in packages/domain/src/meldebogen.ts.
 * Wie alle Drucke deutsch (Entscheidung 020).
 */
import { aBogenZeilen, datenschutzKurz, formatEuro, GEBUEHR_LABEL, JUGEND_ALTERSGRENZE, oeffnungszeitenZeilen, teilschauenLesen, teilschauVon } from "@schau/domain";
import { config } from "../config";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, gebuehr, meldung } from "../db/schema";
import { ladeVereinsangaben } from "../services/datenschutz";
import { ladeEintraege } from "../services/eintraege";
import { briefkopf, datumDe, type Doc, erzeugePdf, fusszeilen, GRAU, HAARLINIE, kicker, MM, mitVermerk, SANS, SANS_FETT, SERIF, tabelle, textImFeld, TINTE, unterschrift } from "./basis";
import { A4_RAENDER, breite, fusstext, kopfzeile, ladeDesign, type Schau, unten, verein } from "./dokumente-gemeinsam";

/** Kästchen zum Ankreuzen, bei `an` mit Kreuz (vorausgefüllte Angaben aus der Meldung). */
function kaestchen(doc: Doc, x: number, y: number, an = false) {
  const g = 3.2 * MM;
  doc.save().lineWidth(0.6).strokeColor(TINTE).rect(x, y, g, g).stroke();
  if (an) doc.moveTo(x + 0.7, y + 0.7).lineTo(x + g - 0.7, y + g - 0.7).moveTo(x + g - 0.7, y + 0.7).lineTo(x + 0.7, y + g - 0.7).stroke();
  doc.restore();
}

/** Ankreuzfeld mit Text daneben; gibt das y unter dem Text zurück. */
function ankreuzen(doc: Doc, text: string, x: number, y: number, w: number, an = false, groesse = 8.5): number {
  kaestchen(doc, x, y + 0.5, an);
  doc.font(SANS).fontSize(groesse).fillColor(TINTE).text(text, x + 5.5 * MM, y, { width: w - 5.5 * MM, lineGap: 1 });
  return doc.y + 2.5;
}

/** Schreibfeld: Beschriftung klein darüber, Linie, ein vorhandener Wert auf der Linie. */
function feld(doc: Doc, beschriftung: string, x: number, y: number, w: number, wert = "") {
  doc.font(SANS).fontSize(6.5).fillColor(GRAU).text(beschriftung, x, y, { width: w, lineBreak: false });
  // Immer einzeilig: lange Werte (Vereinsnamen, E-Mail) erst kleiner, dann gekürzt – nie in die Zeile darunter.
  if (wert) textImFeld(doc, wert, x, y + 8, { breite: w, groesse: 9.5, min: 6.5, farbe: TINTE });
  doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(x, y + 20).lineTo(x + w, y + 20).stroke().restore();
}

/** Platz bis zum Seitenende prüfen; sonst neue Seite. Gibt das y zum Weiterschreiben zurück. */
function platz(doc: Doc, y: number, hoehe: number): number {
  if (y + hoehe <= unten(doc)) return y;
  doc.addPage();
  return doc.page.margins.top;
}

export async function aBogenPdf(s: Schau, meldungId?: number) {
  const [d, v, gebuehren, vorlage] = await Promise.all([
    ladeDesign(s),
    ladeVereinsangaben(s.organisationId),
    db.select().from(gebuehr).where(eq(gebuehr.schauId, s.id)),
    meldungId == null
      ? Promise.resolve(null)
      : db
          .select({ m: meldung, a: aussteller })
          .from(meldung)
          .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
          .where(and(eq(meldung.id, meldungId), eq(meldung.schauId, s.id)))
          .then(async ([x]) => (x ? { ...x, tiere: await ladeEintraege(s.id, { nurMeldungId: x.m.id }) } : null)),
  ]);
  if (meldungId != null && !vorlage) return null;
  const a = vorlage?.a;
  const zeilen = aBogenZeilen(
    (vorlage?.tiere ?? []).map((e) => ({
      rasse: e.rasse ?? e.freitext,
      farbenschlag: e.rasse ? (e.farbenschlag ?? "") : "",
      art: e.art,
      geschlecht: e.geschlecht,
      alter: e.alter,
      ringnummern: e.ringnummern ?? "",
      verkaufspreisCent: e.verkaufspreisCent,
      eigeneZucht: e.eigeneZucht,
      istAoc: e.istAoc,
      istNeuzuechtung: e.istNeuzuechtung,
      position: e.position,
    })),
  );
  const teilschauen = teilschauenLesen(s.teilschauen);
  const erklaerungen = s.erklaerungen.split("\n").map((z) => z.trim()).filter(Boolean);
  const mitBetrag = gebuehren.filter((g) => g.betragCent > 0);

  // Testschau: Vermerk auf jeder Seite wie auf Schauseite und Katalog.
  return mitVermerk(s.test ? "Testschau – keine echte Ausstellung" : null, () => erzeugePdf(
    `A-Bogen ${s.name}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      const halb = (w - 6 * MM) / 2;
      briefkopf(doc, d, {
        verein: verein(s),
        zeile: kopfzeile(s),
        art: "Meldebogen · A-Bogen",
        titel: s.name,
        unter: "Bitte gut lesbar ausfüllen, unterschreiben und bis zum Meldeschluss an die Meldestelle schicken.",
        angaben: [
          ["Meldeschluss", s.meldeschluss ? datumDe(s.meldeschluss) : "–"],
          ["Bewertung", s.bewertungAm ? datumDe(s.bewertungAm) : "–"],
          ...(vorlage ? ([["Meldung", `Nr. ${vorlage.m.id}`]] as [string, string][]) : []),
        ],
      });

      // Meldestelle und Gebühren nebeneinander.
      let y = doc.y;
      kicker(doc, "Meldung an", x, y, d.farbe, halb);
      const an = [v.name || verein(s), ...v.anschrift.split("\n").map((z) => z.trim()).filter(Boolean), s.kontaktEmail || v.email].filter(Boolean).join("\n");
      doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(an, x, y + 10, { width: halb, lineGap: 1 });
      const yAn = doc.y;
      kicker(doc, "Gebühren", x + halb + 6 * MM, y, d.farbe, halb);
      let yG = y + 10;
      for (const g of mitBetrag) {
        doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(`${GEBUEHR_LABEL[g.art]}${g.jugend ? " (Jugend)" : ""}`, x + halb + 6 * MM, yG, { width: halb - 22 * MM, lineBreak: false });
        doc.text(formatEuro(g.betragCent), x + halb + 6 * MM, yG, { width: halb, align: "right", lineBreak: false });
        yG += 11;
      }
      const zahlung = s.zahlungBeiEinlieferung ? "Zahlung bei der Einlieferung der Tiere." : s.bankverbindung ? `Mit der Meldung überweisen an: ${s.bankverbindung}` : "";
      if (zahlung) doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(zahlung, x + halb + 6 * MM, yG + 2, { width: halb });
      y = Math.max(yAn, doc.y) + 6 * MM;

      // Aussteller.
      kicker(doc, "Aussteller", x, y, d.farbe, w);
      y += 10;
      const reihe = (paare: [string, string, number][]) => {
        let xi = x;
        for (const [l, wert, anteil] of paare) {
          const bw = anteil * w - (anteil < 1 ? 3 * MM : 0);
          feld(doc, l, xi, y, bw, wert);
          xi += anteil * w;
        }
        y += 25;
      };
      reihe([["Vorname *", a?.vorname ?? "", 0.5], ["Nachname *", a?.nachname ?? "", 0.5]]);
      reihe([["Straße und Hausnummer *", a?.strasse ?? "", 1]]);
      reihe([["PLZ *", a?.plz ?? "", 0.25], ["Ort *", a?.ort ?? "", 0.75]]);
      reihe([["Telefon", a?.telefon ?? "", 0.5], ["E-Mail", a?.email ?? "", 0.5]]);
      reihe([["Ortsverein *", a?.verein ?? "", 0.5], ["Kreisverband", a?.kreisverband ?? "", 0.5]]);
      reihe([["Registriernummer nach Viehverkehrsverordnung *", a?.registriernummer ?? "", 1]]);
      reihe([
        ["Bei Jugend: Geburtsdatum *", a?.geburtsdatum ? datumDe(a.geburtsdatum) : "", 0.3],
        ["Bei Jugend: Name eines Erziehungsberechtigten, der einverstanden ist *", vorlage?.m.erziehungsberechtigter ?? "", 0.7],
      ]);
      // Bankdaten nie vorausgefüllt: die IBAN steht verschlüsselt und gehört nicht auf ein Blatt, das per Post geht.
      reihe([["IBAN für Preisgeld und Verkaufserlös (freiwillig, sonst bar)", "", 0.6], ["Kontoinhaber, falls abweichend", "", 0.4]]);
      const yK = ankreuzen(doc, `Ich melde als Jugendlicher (unter ${JUGEND_ALTERSGRENZE} Jahre am Bewertungstag).`, x, y, halb, !!vorlage?.m.istJugend);
      ankreuzen(doc, "Ich bin amtierender Preisrichter.", x + halb + 6 * MM, y, halb, !!vorlage?.m.istPreisrichter);
      y = yK;
      if (teilschauen.length > 1) {
        doc.font(SANS_FETT).fontSize(8).fillColor(TINTE).text("Teilschau (eine ankreuzen):", x, y + 1, { width: w });
        y = doc.y + 3;
        // Zwei Spalten; jede Zeile so hoch wie ihr längster Name (bis zu 12 Teilschauen mit langen Namen).
        const gewaehlt = vorlage ? teilschauVon(teilschauen, vorlage.m.teilschau)?.id : undefined;
        for (let i = 0; i < teilschauen.length; i += 2) {
          y = platz(doc, y, 12);
          const yL = ankreuzen(doc, teilschauen[i]!.name, x, y, halb, gewaehlt === teilschauen[i]!.id);
          const yR = teilschauen[i + 1] ? ankreuzen(doc, teilschauen[i + 1]!.name, x + halb + 6 * MM, y, halb, gewaehlt === teilschauen[i + 1]!.id) : yL;
          y = Math.max(yL, yR);
        }
        y += 2;
      }

      // Tiere.
      y = platz(doc, y + 4 * MM, 60 * MM);
      kicker(doc, "Tiere", x, y, d.farbe, w);
      doc.font(SANS).fontSize(7.5).fillColor(GRAU).text("Je Farbenschlag in dieser Reihenfolge: 1,0 jung, 1,0 alt, 0,1 jung, 0,1 alt. Bei Zwergrassen „Zwerg“ mit angeben.", x, y + 9, { width: w });
      doc.y = doc.y + 4;
      const sp = [7, 40, 34, 11, 13, 9, 26, 15, 10].map((b) => b * MM);
      const faktor = w / sp.reduce((n, b) => n + b, 0);
      tabelle(
        doc,
        [
          { titel: "Nr.", breite: sp[0]! * faktor, align: "right" },
          { titel: "Rasse", breite: sp[1]! * faktor },
          { titel: "Farbenschlag", breite: sp[2]! * faktor },
          { titel: "Art", breite: sp[3]! * faktor, align: "center" },
          { titel: "1,0/0,1", breite: sp[4]! * faktor, align: "center" },
          { titel: "j/a", breite: sp[5]! * faktor, align: "center" },
          { titel: "Ring-Nr.", breite: sp[6]! * faktor },
          { titel: "Vkpr. €", breite: sp[7]! * faktor, align: "right" },
          { titel: "E. Z.", breite: sp[8]! * faktor, align: "center" },
        ],
        zeilen.map((z) => [z.nr, z.rasse, z.farbenschlag, z.art, z.geschlecht, z.alter, z.ring, z.preisCent ? (z.preisCent / 100).toFixed(2).replace(".", ",") : "", z.eigeneZucht ? "x" : ""]),
        { zeilenhoehe: 6.5 * MM, schrift: 8.5 },
      );
      doc.font(SANS).fontSize(7).fillColor(GRAU).text("Art: E = Einzeltier, S = Stamm, V = Voliere, B = Bruteier (Satz) · j/a = jung/alt · Vkpr. = Verkaufspreis (leer = unverkäuflich) · E. Z. = eigene Zucht ankreuzen · AOC oder Neuzüchtung in Klammern hinter die Rasse schreiben.", x, doc.y + 1, { width: w });
      y = doc.y + 5 * MM;

      // Stiftung und Spende.
      y = platz(doc, y, 32 * MM);
      kicker(doc, "Ehrenpreisstiftung und Spende (freiwillig)", x, y, d.farbe, w);
      y += 10;
      feld(doc, "Ehrenpreisstiftung, Betrag in €", x, y, 0.3 * w - 3 * MM);
      feld(doc, "Wofür? (z. B. bestes Tier einer Rasse)", x + 0.3 * w, y, 0.7 * w);
      y += 25;
      feld(doc, "Spende für die Ausstellung, Betrag in €", x, y, 0.3 * w - 3 * MM);
      ankreuzen(doc, "Meinen Namen im gedruckten Katalog als Spender nennen.", x + 0.3 * w, y + 8, 0.7 * w);
      y += 27;
      feld(doc, "Bemerkung an die Ausstellungsleitung", x, y, w, vorlage?.m.bemerkung ?? "");
      y += 27;

      // Erklärungen zur Herkunft (Text des Vereins).
      if (erklaerungen.length) {
        doc.font(SANS).fontSize(8.5);
        const hoehe = erklaerungen.reduce((n, t) => n + doc.heightOfString(t, { width: w - 5.5 * MM }) + 4, 14);
        y = platz(doc, y, hoehe);
        kicker(doc, "Erklärungen zur Herkunft der Tiere (Pflicht)", x, y, d.farbe, w);
        y += 10;
        for (const t of erklaerungen) y = ankreuzen(doc, t, x, y, w);
        y += 2 * MM;
      }

      // Datenschutz (erste Ebene nach Art. 13 DSGVO) und freiwillige Online-Veröffentlichung.
      const kurz = [...datenschutzKurz(v), `Vollständige Datenschutzhinweise: ${config.publicUrl}/s/${s.slug}/datenschutz`];
      const online =
        "Freiwillig: Mein Name, Wohnort und Verein dürfen auch im Internet erscheinen (Ergebnisliste und Katalog zum Herunterladen). Ohne Kreuz steht dort „nicht veröffentlicht“; widerrufen kann ich jederzeit.";
      doc.font(SANS).fontSize(7);
      // Kurzfassung und Einwilligung zusammen messen: das Ankreuzfeld reißt nicht vom Text weg.
      const hDs = kurz.reduce((n, t) => n + doc.heightOfString(t, { width: w }) + 2, 30) + doc.font(SANS).fontSize(8.5).heightOfString(online, { width: w - 5.5 * MM }) + 6;
      y = platz(doc, y, hDs);
      kicker(doc, "Datenschutz", x, y, d.farbe, w);
      doc.font(SANS).fontSize(7).fillColor(GRAU).text(kurz.join("\n"), x, y + 10, { width: w, paragraphGap: 2 });
      y = doc.y + 3;
      y = ankreuzen(doc, online, x, y, w);

      // Anerkennung und Unterschrift.
      y = platz(doc, y + 3 * MM, 48 * MM);
      kicker(doc, "Anerkennung und Unterschrift", x, y, d.farbe, w);
      doc
        .font(SANS)
        .fontSize(8.5)
        .fillColor(TINTE)
        .text(
          "Mit meiner Unterschrift erkenne ich die Allgemeinen Ausstellungsbestimmungen (AAB) des BDRG und die Sonderbestimmungen dieser Schau an. Danach stehen Name, Wohnort und Verein mit meinen Tieren und Bewertungen im gedruckten Katalog. Ich bestätige die angekreuzten Erklärungen.",
          x,
          y + 10,
          { width: w, lineGap: 1 },
        );
      y = doc.y + 14 * MM;
      const drittel = (w - 8 * MM) / 3;
      unterschrift(doc, x, y, drittel, "Ort, Datum");
      unterschrift(doc, x + drittel + 4 * MM, y, drittel, "Unterschrift Aussteller");
      unterschrift(doc, x + 2 * (drittel + 4 * MM), y, drittel, "bei Jugend: Erziehungsberechtigte(r)");

      // Termine und Sonderbestimmungen zum Nachlesen.
      const termine: [string, string][] = [
        ["Einlieferung", s.einlieferung],
        ["Öffnungszeiten", oeffnungszeitenZeilen(s.oeffnungszeiten).join(", ")],
        ["Tierausgabe", s.aussetzen],
      ].filter(([, t]) => t?.trim()) as [string, string][];
      if (termine.length || s.bestimmungen.trim()) {
        // Unter der Unterschrift, wenn es dort passt – sonst auf einer eigenen Seite.
        doc.font(SANS).fontSize(8.5);
        const hoehe = 12 * MM + termine.length * 12 + (s.bestimmungen.trim() ? doc.heightOfString(s.bestimmungen.trim(), { width: w, lineGap: 1.5 }) + 3 * MM : 0);
        y = platz(doc, y + 14 * MM, Math.min(hoehe, unten(doc) - doc.page.margins.top));
        doc.font(SERIF).fontSize(15).fillColor(TINTE).text("Termine und Sonderbestimmungen", x, y, { width: w });
        y = doc.y + 3 * MM;
        for (const [l, t] of termine) {
          doc.font(SANS_FETT).fontSize(8.5).fillColor(TINTE).text(`${l}: `, x, y, { continued: true }).font(SANS).text(t, { width: w });
          y = doc.y + 2;
        }
        if (s.bestimmungen.trim()) doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(s.bestimmungen.trim(), x, y + 3 * MM, { width: w, lineGap: 1.5 });
      }
      fusszeilen(doc, `A-Bogen · ${fusstext(s)}`);
    },
    { margins: A4_RAENDER },
  ));
}
