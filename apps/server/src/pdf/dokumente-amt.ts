/** Listen für das Veterinäramt: abgegebene Tiere (Verkaufsliste) und Aussteller- und Tierliste. */
import { ladeTierliste } from "../services/tierliste";
import { ladeVerkaufsliste } from "../services/verkaufsliste";
import {
  angaben,
  briefkopf,
  datumDe,
  erzeugePdf,
  fusszeilen,
  GRAU,
  hinweisKasten,
  MM,
  SANS,
  SANS_KURSIV,
  SERIF,
  tabelle,
  TINTE,
  unterschrift,
} from "./basis";
import { breite, fusstext, kopfzeile, ladeDesign, type Schau, verein } from "./dokumente-gemeinsam";

// ── Verkaufsliste für das Veterinäramt ───────────────────────────────────

/**
 * Aufzeichnung über die abgegebenen Tiere (A4 quer): Art, Anzahl und Ringnummern,
 * Herkunfts- und Bestimmungsbetrieb mit Registriernummer. Der Veranstalter bewahrt sie mindestens drei Jahre auf.
 */
export async function verkaufslistePdf(s: Schau) {
  const [zeilen, d] = await Promise.all([ladeVerkaufsliste(s.id), ladeDesign(s)]);
  const tiere = zeilen.filter((z) => !z.storniertAm).reduce((n, z) => n + z.anzahl, 0);
  const storniert = zeilen.filter((z) => z.storniertAm).length;
  const ohneNummer = zeilen.filter((z) => !z.herkunftRegistriernummer.trim() || !z.bestimmungRegistriernummer.trim()).length;
  const ohneRing = zeilen.filter((z) => !z.ringnummern.trim()).length;
  const betrieb = (name: string, anschrift: string, nummer: string) => [name, anschrift, `Reg.-Nr. ${nummer.trim() || "FEHLT"}`].filter(Boolean).join("\n");
  return erzeugePdf(
    `Verkaufsliste ${s.name}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      briefkopf(doc, d, {
        verein: verein(s),
        zeile: kopfzeile(s),
        art: "Aufzeichnung abgegebener Tiere",
        titel: "Verkaufsliste für das Veterinäramt",
        unter: "Tiere, die auf der Schau an andere Halter abgegeben wurden – mit Herkunfts- und Bestimmungsbetrieb",
        angaben: [
          ["Bewertung", datumDe(s.bewertungAm) || "–"],
          ["Abgaben", `${zeilen.length - storniert}${storniert ? ` (+${storniert} storniert)` : ""}`],
          ["Tiere", String(tiere)],
          ["Stand", datumDe(new Date())],
        ],
      });
      if (!zeilen.length) {
        doc.font(SANS_KURSIV).fontSize(10).fillColor(GRAU).text("Auf dieser Schau wurden keine Tiere abgegeben.", x, doc.y, { width: w });
      } else {
        const fest = [14, 18, 14, 0, 10, 30, 62, 62].map((v) => v * MM);
        fest[3] = w - fest.reduce((n, v) => n + v, 0);
        tabelle(
          doc,
          [
            { titel: "Beleg", breite: fest[0]!, align: "right", fett: true },
            { titel: "Datum", breite: fest[1]! },
            { titel: "Kat.-Nr.", breite: fest[2]! },
            { titel: "Tier", breite: fest[3]! },
            { titel: "Anz.", breite: fest[4]!, align: "center" },
            { titel: "Ring-Nr.", breite: fest[5]! },
            { titel: "Herkunft (Aussteller)", breite: fest[6]! },
            { titel: "Bestimmung (Käufer)", breite: fest[7]! },
          ],
          zeilen.map((z) => [
            z.storniertAm ? `${z.belegNr}\nstorniert` : String(z.belegNr),
            z.storniertAm ? `${datumDe(z.datum)}\nStorno ${datumDe(z.storniertAm)}` : datumDe(z.datum),
            z.katalogNr,
            [z.sparte, z.tier, z.klasse, z.storniertAm ? `Storno: ${z.stornoGrund}` : ""].filter(Boolean).join("\n"),
            z.storniertAm ? `(${z.anzahl})` : String(z.anzahl),
            z.ringnummern || "FEHLT",
            betrieb(z.herkunftName, z.herkunftAnschrift, z.herkunftRegistriernummer),
            [betrieb(z.bestimmungName, z.bestimmungAnschrift, z.bestimmungRegistriernummer), z.kaeuferUnter16 ? `unter 16, Einwilligung: ${z.kaeuferErziehungsberechtigter}` : ""].filter(Boolean).join("\n"),
          ]),
          { schrift: 8.5, streifen: d.flaeche, summe: ["", "", "", "Summe", String(tiere), "", "", ""] },
        );
      }
      let y = doc.y + 5 * MM;
      const punkte = [
        "Aufbewahrung: mindestens drei Jahre ab dem Ende der Veranstaltung.",
        "Tiere dürfen nur an Halter mit Registriernummer abgegeben werden, an Personen unter 16 Jahren nur mit Einwilligung der Erziehungsberechtigten (§ 11c TierSchG).",
        ...(storniert ? [`${storniert} stornierte ${storniert === 1 ? "Abgabe ist" : "Abgaben sind"} gekennzeichnet und zählen nicht zur Summe.`] : []),
        ...(ohneNummer ? [`Bei ${ohneNummer} ${ohneNummer === 1 ? "Abgabe fehlt" : "Abgaben fehlt"} eine Registriernummer – bitte nachtragen.`] : []),
        ...(ohneRing ? [`Bei ${ohneRing} ${ohneRing === 1 ? "Abgabe fehlt" : "Abgaben fehlt"} die Ringnummer – bitte unter Einlieferung nach der Ringkarte eintragen.`] : []),
      ];
      if (y + 45 * MM > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      y = hinweisKasten(doc, d, "Hinweise", punkte, x, y, w * 0.55) + 18 * MM;
      const sb = (w - 10 * MM) / 3;
      unterschrift(doc, x, y, sb, "Ort, Datum", [s.ort, datumDe(new Date())].filter(Boolean).join(", "));
      unterschrift(doc, x + sb + 5 * MM, y, sb * 2 + 5 * MM, "Unterschrift Veranstalter / Ausstellungsleitung");
      fusszeilen(doc, `Verkaufsliste · ${fusstext(s)}`);
    },
    { layout: "landscape", margins: { top: 12 * MM, bottom: 16 * MM, left: 15 * MM, right: 15 * MM } },
  );
}

// ── Aussteller- und Tierliste für das Veterinäramt ───────────────────────

/**
 * Liste über die Ausstellenden (A4 quer): Übersicht nach Tierarten und Herkunft (auch für die Anzeige),
 * je Aussteller Herkunftsbetrieb mit Registriernummer und Nachweisen, je Tier Anzahl, Ring-Nr., Status und Verbleib,
 * dazu das Gesundheitsjournal. Der Veranstalter legt sie auf Verlangen vor und bewahrt sie drei Jahre auf.
 */
export async function tierlistePdf(s: Schau) {
  const [t, d] = await Promise.all([ladeTierliste(s), ladeDesign(s)]);
  const tiere = t.aussteller.reduce((n, a) => n + a.tiere.reduce((m, x) => m + x.anzahl, 0), 0);
  return erzeugePdf(
    `Tierliste ${s.name}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      briefkopf(doc, d, {
        verein: verein(s),
        zeile: kopfzeile(s),
        art: "Aufzeichnung nach Tiergesundheitsrecht",
        titel: "Aussteller- und Tierliste für das Veterinäramt",
        unter: "Herkunftsbetriebe mit Registriernummer, Tiere mit Kennzeichnung, Status und Verbleib",
        angaben: [
          ["Reg.-Nr. Schau", s.vetRegistriernummer || "–"],
          ["Veterinäramt", s.vetAmt || "–"],
          ["Angezeigt am", datumDe(s.vetAnzeigeAm) || "–"],
          ["Aktenzeichen", s.vetAktenzeichen || "–"],
          ["Bewertung", datumDe(s.bewertungAm) || "–"],
        ],
      });
      // Übersicht links, Herkunft rechts.
      const lw = w * 0.55;
      doc.font(SERIF).fontSize(12).fillColor(TINTE).text("Übersicht nach Tierarten", x, doc.y);
      doc.moveDown(0.3);
      const yStart = doc.y;
      tabelle(
        doc,
        [
          { titel: "Tierart", breite: lw - 3 * 26 * MM },
          { titel: "Gemeldet", breite: 26 * MM, align: "right" },
          { titel: "Auf der Schau", breite: 26 * MM, align: "right" },
          { titel: "Aussteller", breite: 26 * MM, align: "right" },
        ],
        t.uebersicht.map((z) => [z.tierart, String(z.gemeldet), String(z.anwesend), String(z.aussteller)]),
        {
          schrift: 8.5,
          summe: ["Summe", String(t.uebersicht.reduce((n, z) => n + z.gemeldet, 0)), String(t.uebersicht.reduce((n, z) => n + z.anwesend, 0)), String(t.aussteller.length)],
        },
      );
      const yNachUebersicht = doc.y;
      const hx = x + lw + 10 * MM;
      const hw = w - lw - 10 * MM;
      doc.font(SERIF).fontSize(12).fillColor(TINTE).text("Herkunft der Aussteller", hx, yStart - doc.currentLineHeight() - 3);
      doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(t.herkunft.map((h) => `${h.ort}${h.anzahl > 1 ? ` (${h.anzahl})` : ""}`).join(" · ") || "–", hx, yStart, { width: hw, lineGap: 1 });
      doc.y = Math.max(yNachUebersicht, doc.y) + 6 * MM;
      doc.x = x;

      doc.font(SERIF).fontSize(12).fillColor(TINTE).text("Aussteller und Tiere", x, doc.y);
      doc.moveDown(0.3);
      if (!t.aussteller.length) {
        doc.font(SANS_KURSIV).fontSize(10).fillColor(GRAU).text("Noch keine bestätigten Meldungen mit Katalognummer.", x, doc.y, { width: w });
      } else {
        const fest = [62, 14, 0, 9, 30, 22, 58].map((v) => v * MM);
        fest[2] = w - fest.reduce((n, v) => n + v, 0);
        tabelle(
          doc,
          [
            { titel: "Herkunft (Aussteller)", breite: fest[0]! },
            { titel: "Kat.-Nr.", breite: fest[1]!, align: "right", fett: true },
            { titel: "Tier", breite: fest[2]! },
            { titel: "Anz.", breite: fest[3]!, align: "center" },
            { titel: "Ring-Nr.", breite: fest[4]! },
            { titel: "Status", breite: fest[5]! },
            { titel: "Verbleib", breite: fest[6]! },
          ],
          t.aussteller.flatMap((a) =>
            a.tiere.map((z, i) => [
              i === 0 ? [a.name, a.anschrift, `Reg.-Nr. ${a.registriernummer || "FEHLT"}`, a.nachweise].filter(Boolean).join("\n") : "",
              z.katalogNr,
              `${z.tier}\n${z.klasse}${z.gesperrt ? "\nGESPERRT (Gesundheitsjournal)" : ""}`,
              String(z.anzahl),
              z.ringnummern || "–",
              z.status,
              z.verbleib,
            ]),
          ),
          { schrift: 8, streifen: d.flaeche, summe: ["", "", "Summe", String(tiere), "", "", ""] },
        );
      }

      doc.moveDown(0.8);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 40 * MM) doc.addPage();
      doc.font(SERIF).fontSize(12).fillColor(TINTE).text("Gesundheitsjournal", x, doc.y);
      doc.moveDown(0.3);
      if (!t.gesundheit.length) {
        doc.font(SANS_KURSIV).fontSize(9).fillColor(GRAU).text("Keine Krankheits- oder Todesfälle erfasst.", x, doc.y, { width: w });
      } else {
        tabelle(
          doc,
          [
            { titel: "Zeitpunkt", breite: 28 * MM },
            { titel: "Tier", breite: w * 0.3 },
            { titel: "Befund", breite: w - 28 * MM - w * 0.3 - w * 0.25 - 22 * MM },
            { titel: "Maßnahme, Tierarzt", breite: w * 0.25 },
            { titel: "Sperre", breite: 22 * MM },
          ],
          t.gesundheit.map((g) => [
            new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(g.zeitpunkt),
            g.tier || "allgemein",
            `${g.befund}${g.verendet ? "\nverendet" : ""}`,
            [g.massnahme, g.tierarzt].filter(Boolean).join("\n"),
            g.sperre ? "gesperrt" : g.aufgehobenAm ? `aufgehoben ${datumDe(g.aufgehobenAm)}` : "–",
          ]),
          { schrift: 8 },
        );
      }
      let y = doc.y + 5 * MM;
      if (y + 45 * MM > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      y = hinweisKasten(
        doc,
        d,
        "Hinweise",
        [
          "Aufbewahrung: mindestens drei Jahre; auf Verlangen der Behörde vorlegen.",
          "Hühner und Puten nur mit Bescheinigung über die ND-Impfung des Herkunftsbestands, Tauben nach den Sonderbestimmungen mit PMV-Impfung.",
          "Kranke oder krankheitsverdächtige Tiere werden nicht zugelassen; Seuchenverdacht sofort dem Veterinäramt melden.",
        ],
        x,
        y,
        w * 0.55,
      ) + 18 * MM;
      const sb = (w - 10 * MM) / 3;
      unterschrift(doc, x, y, sb, "Ort, Datum", [s.ort, datumDe(new Date())].filter(Boolean).join(", "));
      unterschrift(doc, x + sb + 5 * MM, y, sb * 2 + 5 * MM, "Unterschrift Veranstalter / Ausstellungsleitung");
      fusszeilen(doc, `Tierliste · ${fusstext(s)}`);
    },
    { layout: "landscape", margins: { top: 12 * MM, bottom: 16 * MM, left: 15 * MM, right: 15 * MM } },
  );
}
