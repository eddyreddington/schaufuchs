import { AUFBEWAHRUNG_BELEGE_JAHRE, AUFBEWAHRUNG_VERKAUF_JAHRE, formatEuro, KARENZ_TAGE, MELDEART_LABEL, SONDERNOTE_LABEL, type Vereinsangaben } from "@schau/domain";
import type { Auskunft } from "../services/datenschutz";
import { angaben, briefkopf, datumDe, design, erzeugePdf, fusszeilen, GRAU, hinweisKasten, MM, SANS_KURSIV, SERIF, tabelle, TINTE, type Doc } from "./basis";

const STATUS: Record<string, string> = { offen: "offen", bestaetigt: "bestätigt", abgelehnt: "abgelehnt", storniert: "storniert" };
const ZAHLART: Record<string, string> = { ueberweisung: "Überweisung", bar: "bar", sonstige: "sonstige" };
const EINGANG: Record<string, string> = { papier: "Meldebogen", email: "E-Mail", online: "online" };
const breite = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

function abschnitt(doc: Doc, titel: string) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 30 * MM) doc.addPage();
  doc.moveDown(0.6);
  doc.font(SERIF).fontSize(13).fillColor(TINTE).text(titel, doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
}

function leer(doc: Doc, text: string) {
  doc.font(SANS_KURSIV).fontSize(9).fillColor(GRAU).text(text, doc.page.margins.left, doc.y, { width: breite(doc) });
  doc.fillColor(TINTE);
}

/** Auskunft nach Art. 15 DSGVO: alle gespeicherten Daten eines Ausstellers, mit Zwecken, Empfängern und Fristen. */
export function auskunftPdf(a: Auskunft, verein: Vereinsangaben) {
  const d = design(null, null);
  const s = a.stammdaten;
  const name = `${s.vorname} ${s.nachname}`.trim();
  return erzeugePdf(`Auskunft ${name}`, (doc) => {
    const x = doc.page.margins.left;
    const w = breite(doc);
    briefkopf(doc, d, {
      verein: verein.name,
      zeile: [verein.anschrift.replace(/\n/g, ", "), verein.email].filter(Boolean).join(" · "),
      art: "Auskunft nach Art. 15 DSGVO",
      titel: `Gespeicherte Daten: ${name}`,
      unter: "Alles, was der Verein in SchauFUCHS über Sie gespeichert hat",
      angaben: [
        ["Erstellt", datumDe(new Date())],
        ["Meldungen", String(a.meldungen.length)],
        ["Erfasst seit", datumDe(s.createdAt)],
      ],
    });

    abschnitt(doc, "Stammdaten");
    doc.y = angaben(
      doc,
      [
        ["Name", name],
        ["Anschrift", [s.strasse, `${s.plz} ${s.ort}`.trim()].filter(Boolean).join(", ")],
        ["Telefon", s.telefon],
        ["E-Mail", s.email],
        ["Ortsverein", s.verein],
        ["Vereinsmitglied (von Hand gesetzt)", s.mitglied == null ? "" : s.mitglied ? "ja" : "nein"],
        ["Kreisverband", s.kreisverband],
        ["Registriernummer", s.registriernummer],
        ["Geburtsdatum", datumDe(s.geburtsdatum)],
        ["Preisrichter", s.istPreisrichter ? "ja" : ""],
        ["IBAN", s.iban],
        ["Kontoinhaber", s.kontoinhaber],
        ["Gesperrt seit", s.gesperrtAm ? `${datumDe(s.gesperrtAm)}, Löschung ab ${datumDe(s.loeschenAb)}` : ""],
        ["Test-Kopien (Übungsschauen, nur Name und Verein)", a.testKopien.map((k) => `${k.name} in „${k.schau}“`).join("; ")],
      ],
      x,
      doc.y,
      w,
      0.3,
    );

    abschnitt(doc, "Meldungen");
    if (!a.meldungen.length) leer(doc, "Keine Meldungen gespeichert.");
    for (const m of a.meldungen) {
      doc.font(SANS_KURSIV).fontSize(10).fillColor(TINTE).text(m.schau, x, doc.y + 2, { width: w });
      doc.y = angaben(
        doc,
        [
          ["Eingegangen", `${datumDe(m.eingegangenAm)} (${EINGANG[m.eingang] ?? m.eingang})`],
          ["Status", STATUS[m.status] ?? m.status],
          ["Jugend", m.istJugend ? `ja${m.erziehungsberechtigter ? `, Erziehungsberechtigte(r): ${m.erziehungsberechtigter}` : ""}` : ""],
          ["Meldebogen / AAB", m.meldebogenUnterschriebenAm ? `anerkannt am ${datumDe(m.meldebogenUnterschriebenAm)}` : "nicht unterschrieben – Name nicht im Katalog"],
          ["Veröffentlichung im Internet", m.onlineVeroeffentlichungAm ? `eingewilligt am ${datumDe(m.onlineVeroeffentlichungAm)}` : "keine Einwilligung"],
          ["Preisrichter (Befreiung)", m.istPreisrichter ? "ja" : ""],
          ["ND-Impfung", [datumDe(m.impfung.datum), m.impfung.impfstoff, m.impfung.tierarzt].filter(Boolean).join(", ")],
          ["PMV-Impfung", [datumDe(m.pmv.datum), m.pmv.impfstoff, m.pmv.tierarzt].filter(Boolean).join(", ")],
          ["Wassergeflügel", [datumDe(m.wassergefluegel.datum), m.wassergefluegel.sentinel ? "Sentinel" : "", m.wassergefluegel.stelle].filter(Boolean).join(", ")],
          ["Nachweis geprüft", m.nachweisGeprueftAm ? datumDe(m.nachweisGeprueftAm) : ""],
          ["Pflichterklärungen", m.erklaerungenAm ? `abgegeben am ${datumDe(m.erklaerungenAm)}` : ""],
          ["Bemerkung", m.bemerkung],
        ],
        x,
        doc.y + 2,
        w,
        0.3,
      );
      if (m.tiere.length) {
        tabelle(
          doc,
          [
            { titel: "Kat.-Nr.", breite: 16 * MM, align: "right", fett: true },
            { titel: "Tier", breite: w - 16 * MM - 30 * MM - 50 * MM - 22 * MM },
            { titel: "Ring-Nr.", breite: 30 * MM },
            { titel: "Bewertung und Preise", breite: 50 * MM },
            { titel: "Verkaufspreis", breite: 22 * MM, align: "right" },
          ],
          m.tiere.map((t) => [
            t.katalogNr != null ? `${t.katalogNr}${t.suffix}` : "–",
            [`${t.geschlecht} ${t.alter}`, t.art !== "einzeltier" ? MELDEART_LABEL[t.art as keyof typeof MELDEART_LABEL] : "", t.freitext].filter(Boolean).join(" · "),
            t.ringnummern,
            [
              t.bewertung ? (t.bewertung.sondernote ? SONDERNOTE_LABEL[t.bewertung.sondernote].name : `${t.bewertung.punkte ?? ""} Punkte`) : "",
              ...t.preise.map((p) => `${p.preis}${p.betragCent ? ` (${formatEuro(p.betragCent)})` : ""}`),
              ...t.gesundheit.map((g) => `Gesundheit ${datumDe(g.zeitpunkt)}: ${g.befund}`),
            ]
              .filter(Boolean)
              .join("; "),
            t.verkaufspreisCent ? formatEuro(t.verkaufspreisCent) : "",
          ]),
          { schrift: 8.5, streifen: d.flaeche },
        );
      }
      if (m.zahlungen.length) {
        doc.font(SANS_KURSIV).fontSize(8.5).fillColor(GRAU).text("Meldegeld", x, doc.y + 2);
        tabelle(
          doc,
          [
            { titel: "Datum", breite: 30 * MM },
            { titel: "Art", breite: w - 30 * MM - 30 * MM },
            { titel: "Betrag", breite: 30 * MM, align: "right" },
          ],
          m.zahlungen.map((z) => [datumDe(z.datum), ZAHLART[z.art] ?? z.art, formatEuro(z.betragCent)]),
          { schrift: 8.5 },
        );
      }
      if (m.verkaeufe.length) {
        doc.font(SANS_KURSIV).fontSize(8.5).fillColor(GRAU).text("Verkaufte Tiere", x, doc.y + 2);
        tabelle(
          doc,
          [
            { titel: "Beleg", breite: 16 * MM, align: "right" },
            { titel: "Datum", breite: 24 * MM },
            { titel: "Kat.-Nr.", breite: 18 * MM, align: "right" },
            { titel: "Käufer", breite: w - 16 * MM - 24 * MM - 18 * MM - 26 * MM },
            { titel: "Preis", breite: 26 * MM, align: "right" },
          ],
          m.verkaeufe.map((v) => [String(v.belegNr), datumDe(v.datum), v.katalogNr != null ? String(v.katalogNr) : "", v.kaeufer, formatEuro(v.preisCent)]),
          { schrift: 8.5 },
        );
      }
      if (m.stiftungen.length) {
        doc.font(SANS_KURSIV).fontSize(8.5).fillColor(GRAU).text("Gestiftete Preise", x, doc.y + 2);
        tabelle(
          doc,
          [
            { titel: "Stifter", breite: w - 14 * MM - 30 * MM - 50 * MM },
            { titel: "Anzahl", breite: 14 * MM, align: "right" },
            { titel: "Betrag", breite: 30 * MM, align: "right" },
            { titel: "Vorgabe", breite: 50 * MM },
          ],
          m.stiftungen.map((x) => [x.stifter, String(x.anzahl), x.betragCent ? formatEuro(x.betragCent) : "", x.vorgabe]),
          { schrift: 8.5 },
        );
      }
      doc.moveDown(0.5);
    }
    // Bewertungstexte stehen vollständig in der JSON-Fassung; hier ein Hinweis, wenn es welche gibt.
    if (a.meldungen.some((m) => m.tiere.some((t) => t.bewertung && (t.bewertung.vorzuege || t.bewertung.wuensche || t.bewertung.maengel))))
      leer(doc, "Die Texte der Bewertungskarten (Vorzüge, Wünsche, Mängel) enthält die maschinenlesbare Fassung (JSON) vollständig.");

    abschnitt(doc, "Auszahlungen");
    if (!a.auszahlungen.length) leer(doc, "Keine Auszahlungen.");
    else
      tabelle(
        doc,
        [
          { titel: "Quittung", breite: 22 * MM, align: "right" },
          { titel: "Datum", breite: 28 * MM },
          { titel: "Art", breite: w - 22 * MM - 28 * MM - 30 * MM },
          { titel: "Betrag", breite: 30 * MM, align: "right" },
        ],
        a.auszahlungen.map((z) => [String(z.quittungNr), datumDe(z.datum), `${ZAHLART[z.art] ?? z.art}${z.storniertAm ? " (storniert)" : ""}`, formatEuro(z.betragCent)]),
        { schrift: 8.5 },
      );

    abschnitt(doc, "Archivierte Belege");
    if (!a.belege.length) leer(doc, "Keine archivierten Belege.");
    else
      tabelle(
        doc,
        [
          { titel: "Art", breite: 40 * MM },
          { titel: "Nummer", breite: 20 * MM, align: "right" },
          { titel: "Erstellt", breite: 28 * MM },
          { titel: "Prüfsumme (SHA-256)", breite: w - 88 * MM },
        ],
        a.belege.map((b) => [b.art, String(b.nummer), datumDe(b.createdAt), b.sha256.slice(0, 32)]),
        { schrift: 8 },
      );

    abschnitt(doc, "E-Mails an Sie");
    if (!a.emails.length) leer(doc, "Keine gespeicherten E-Mails.");
    else
      tabelle(
        doc,
        [
          { titel: "Datum", breite: 28 * MM },
          { titel: "Betreff", breite: w - 28 * MM - 24 * MM },
          { titel: "Status", breite: 24 * MM },
        ],
        a.emails.map((e) => [datumDe(e.createdAt), e.betreff, e.status]),
        { schrift: 8.5 },
      );

    abschnitt(doc, "Änderungsprotokoll");
    if (!a.protokoll.length) leer(doc, "Keine Einträge.");
    else
      tabelle(
        doc,
        [
          { titel: "Zeitpunkt", breite: 28 * MM },
          { titel: "Bereich", breite: 26 * MM },
          { titel: "Vorgang", breite: w - 54 * MM },
        ],
        a.protokoll.map((p) => [datumDe(p.zeitpunkt), p.tabelle, `${p.aktion}${p.alt == null && p.neu == null ? "" : " (Inhalt in der JSON-Fassung)"}`]),
        { schrift: 8 },
      );

    doc.moveDown(1);
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60 * MM) doc.addPage();
    hinweisKasten(
      doc,
      d,
      "Zwecke, Empfänger und Speicherdauer",
      [
        "Zweck: Durchführung der Schauen (Meldung, Katalog, Bewertung, Preise, Tierverkauf, Abrechnung) nach Art. 6 Abs. 1 lit. b DSGVO; tierseuchenrechtliche Aufzeichnungen nach lit. c; Veröffentlichung im Internet nur mit Einwilligung (lit. a).",
        "Empfänger: Veterinäramt (Verkaufsliste, Tierliste mit Gesundheitsjournal), Bank (Überweisungen), Öffentlichkeit (Katalog, Ergebnisse). Die Daten stammen von Ihnen selbst (Meldung) bzw. von Ausstellungsleitung und Preisrichtern (Bewertung, Preise, Verkauf).",
        `Speicherdauer: Verkaufsaufzeichnungen und Tierliste ${AUFBEWAHRUNG_VERKAUF_JAHRE} Jahre, Buchungsbelege und Protokoll ${AUFBEWAHRUNG_BELEGE_JAHRE} Jahre nach Jahresende; Geburtsdatum, IBAN und PINs ${KARENZ_TAGE} Tage nach Abschluss der Schau.`,
        `Sie können Berichtigung, Löschung oder Einschränkung verlangen, einer Verarbeitung widersprechen, eine Einwilligung widerrufen und sich bei einer Aufsichtsbehörde beschweren.${verein.email ? ` Kontakt: ${verein.email}` : ""}`,
      ],
      x,
      doc.y,
      w,
    );
    fusszeilen(doc, `Auskunft nach Art. 15 DSGVO · ${verein.name}`);
  });
}
