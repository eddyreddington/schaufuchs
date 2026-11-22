/** Belege der Kasse: Kaufbeleg mit Ausgabeschein (Verkauf), Kassenbericht der Barkasse, Einzahlungsquittung und Eigenbeleg. */
import { betragInWorten, druckFormateLesen, formatEuro, ZAHLART_LABEL } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/client";
import { aussteller, kassenbewegung, meldung, verkauf, zahlung } from "../db/schema";
import { ladeEintraege, type Eintrag } from "../services/eintraege";
import { ladeKassenbuch } from "../services/kassenbuch";
import { eigenerKopf } from "../services/protokoll-suche";
import {
  angaben,
  briefkopf,
  datumDe,
  erzeugePdf,
  fusszeilen,
  GRAU,
  hinweisKasten,
  kicker,
  logoBild,
  MM,
  SANS,
  SANS_FETT,
  SANS_KURSIV,
  SERIF,
  tabelle,
  textImFeld,
  TINTE,
  unterschrift,
} from "./basis";
import { belegSeite, schnittlinie } from "./beleg-blatt";
import { belegKopf, briefDesign, ladeBriefVorlage } from "./brief";
import { A4_RAENDER, breite, fusstext, klasse, kopfzeile, ladeDesign, nr, type Schau, tier, verein } from "./dokumente-gemeinsam";

/** Zahlart auf dem Kaufbeleg. */
const ZAHLART_KAUF: Record<string, string> = {
  bar: "Kaufpreis bar bezahlt",
  karte: "Kaufpreis per Karte bezahlt",
  ueberweisung: "Kaufpreis per Überweisung (vereinbart)",
  sonstige: "Kaufpreis unbar bezahlt",
};

// ── Kaufbeleg ────────────────────────────────────────────────────────────

/**
 * Kaufbeleg A5 quer (Formatvorgabe A4: oben auf A4 mit Schnittlinie, Entscheidung 029): links der Beleg für den
 * Käufer, rechts ein Ausgabeschein zum Abtrennen. Das Tier wird nur gegen den Ausgabeschein herausgegeben.
 */
export async function kaufbelegPdf(s: Schau, verkaufId: number) {
  const [[v], d] = await Promise.all([db.select().from(verkauf).where(eq(verkauf.id, verkaufId)), ladeDesign(s)]);
  const e = v ? (await ladeEintraege(s.id)).find((x) => x.id === v.katalogeintragId) : undefined;
  // Registriernummern von Herkunfts- und Bestimmungsbetrieb gehören auf den Beleg (Tierseuchenrecht).
  const [verkaeufer] = e ? await db.select({ registriernummer: aussteller.registriernummer }).from(aussteller).where(eq(aussteller.id, e.ausstellerId)) : [];
  const seite = belegSeite(druckFormateLesen(s.druckFormate).kaufbeleg, 0);
  return erzeugePdf(
    v ? `Kaufbeleg ${v.belegNr}` : "Kaufbeleg",
    (doc) => {
      if (!v || !e) {
        doc.font(SANS).fontSize(10).text("Verkauf nicht gefunden.", 12 * MM, 12 * MM);
        return;
      }
      const W = doc.page.width;
      // Höhe des Belegs (auf A4 nur die obere Hälfte bis zur Schnittlinie).
      const H = seite.hoehe;
      const m = 9 * MM;
      const abschnitt = 58 * MM; // rechter Ausgabeschein
      const lb = W - abschnitt - 2 * m;
      const x = m;
      let y = m;

      // Kopf: Logo, Verein, Belegnummer.
      let tx = x;
      const logo = logoBild(doc, d);
      if (logo) {
        doc.image(logo, x, y, { fit: [11 * MM, 11 * MM] });
        tx = x + 13.5 * MM;
      }
      doc.font(SANS_FETT).fontSize(9).fillColor(TINTE).text(verein(s), tx, y + 0.5 * MM, { width: lb - (tx - x) - 30 * MM, lineBreak: false, ellipsis: true });
      doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(kopfzeile(s), tx, y + 4.8 * MM, { width: lb - (tx - x) - 30 * MM, lineBreak: false, ellipsis: true });
      doc.font(SANS).fontSize(7).fillColor(GRAU).text("BELEG-NR.", x + lb - 30 * MM, y, { width: 30 * MM, align: "right", characterSpacing: 0.6 });
      doc.font(SANS_FETT).fontSize(16).fillColor(TINTE).text(String(v.belegNr), x + lb - 30 * MM, y + 3 * MM, { width: 30 * MM, align: "right" });
      y += 13 * MM;
      doc.save().rect(x, y, lb, 1.2).fill(d.flaeche).restore();
      y += 4.5 * MM;
      kicker(doc, "Kaufbeleg", x, y, d.farbe, lb);
      // Tier: Nummer groß links, Bezeichnung rechts daneben.
      y += 4.5 * MM;
      const nb = 22 * MM;
      doc.save().rect(x, y, nb, 15 * MM).fill(d.flaeche).restore();
      doc.font(SANS_FETT).fontSize(6).fillColor("#ffffff").text("KATALOG-NR.", x, y + 1.5 * MM, { width: nb, align: "center", characterSpacing: 0.5 });
      textImFeld(doc, nr(e), x + 1 * MM, y + 5 * MM, { breite: nb - 2 * MM, groesse: 20, min: 11, schrift: SANS_FETT, farbe: "#ffffff", align: "center" });
      doc.font(SANS).text("", x, y);
      textImFeld(doc, e.bezeichnung, x + nb + 4 * MM, y + 1 * MM, { breite: lb - nb - 4 * MM, groesse: 13, min: 9, schrift: SERIF, farbe: TINTE });
      doc.font(SANS).fontSize(9).fillColor(GRAU).text(`${tier(e)}${e.kaefig && e.kaefig !== String(e.katalogNr) ? ` · Käfig ${e.kaefig}` : ""}`, x + nb + 4 * MM, y + 8.5 * MM, { width: lb - nb - 4 * MM, lineBreak: false });
      y += 19 * MM;

      // Angaben in zwei Spalten: Verkäufer/Ring links, Käufer rechts.
      const sp = (lb - 6 * MM) / 2;
      kicker(doc, "Verkäufer (Aussteller)", x, y, d.farbe, sp);
      kicker(doc, "Käufer", x + sp + 6 * MM, y, d.farbe, sp);
      const yA = y + 10;
      doc.font(SANS).fontSize(9).fillColor(TINTE).text(
        [`${e.vorname} ${e.nachname}`, e.ort, verkaeufer?.registriernummer ? `Registriernummer ${verkaeufer.registriernummer}` : "", e.ringnummern ? `Ring-Nr. ${e.ringnummern}` : ""].filter(Boolean).join("\n"),
        x,
        yA,
        { width: sp, lineGap: 0.5 },
      );
      const yL = doc.y;
      doc.text(
        [
          v.kaeuferName,
          v.kaeuferAnschrift,
          v.kaeuferRegistriernummer ? `Registriernummer ${v.kaeuferRegistriernummer}` : "",
          // § 11c TierSchG: Abgabe an unter 16-Jährige nur mit Einwilligung der Erziehungsberechtigten.
          v.kaeuferUnter16 ? `unter 16 – Einwilligung: ${v.kaeuferErziehungsberechtigter}` : "mindestens 16 Jahre alt (bestätigt)",
        ]
          .filter(Boolean)
          .join("\n"),
        x + sp + 6 * MM,
        yA,
        { width: sp, lineGap: 0.5 },
      );
      y = Math.max(yL, doc.y) + 4 * MM;

      // Kaufpreis im Farbfeld.
      const bh = 15 * MM;
      doc.save().fillOpacity(0.08).rect(x, y, lb, bh).fill(d.flaeche).restore();
      doc.save().rect(x, y, 2.2, bh).fill(d.flaeche).restore();
      kicker(doc, ZAHLART_KAUF[v.zahlart] ?? "Kaufpreis", x + 4 * MM, y + 2.5 * MM, d.farbe, lb * 0.5);
      doc.font(SERIF).fontSize(19).fillColor(TINTE).text(formatEuro(v.preisCent), x + 4 * MM, y + 5.5 * MM, { width: lb * 0.45, lineBreak: false });
      doc.font(SANS_KURSIV).fontSize(8).fillColor(GRAU).text(`in Worten: ${betragInWorten(v.preisCent)}`, x + lb * 0.4, y + 6.5 * MM, { width: lb * 0.6 - 4 * MM, align: "right" });
      y += bh + 3 * MM;
      doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(
        `Verkauft am ${datumDe(v.createdAt)} über die Verkaufsstelle der Schau. Das Tier wird nur gegen den Ausgabeschein herausgegeben${s.aussetzen ? ` (Tierausgabe: ${s.aussetzen})` : ""}. Ihre Angaben (Name, Anschrift, Registriernummer) zeichnen wir für das Veterinäramt auf (3 Jahre); dieser Beleg ist zugleich Buchungsbeleg und bleibt bis zum Ende des Jahres plus 8 Jahre – Datenschutzhinweise: ${config.publicUrl}/s/${s.slug}/datenschutz`,
        x,
        y,
        { width: lb },
      );
      unterschrift(doc, x + lb * 0.5, H - m - 4 * MM, lb * 0.5, "Unterschrift Verkaufsstelle");
      if (v.storniertAm) {
        // Stornierter Beleg: deutlich als ungültig kennzeichnen (Nachdruck für die Akten).
        doc.save().rotate(-18, { origin: [W / 2, H / 2] }).font(SANS_FETT).fontSize(54).fillColor("#b3261e").fillOpacity(0.35).text("STORNIERT", 0, H / 2 - 30, { width: W, align: "center" }).restore();
        doc.font(SANS_FETT).fontSize(8).fillColor("#b3261e").text(`Storniert am ${datumDe(v.storniertAm)}: ${v.stornoGrund}`, x, H - m - 12 * MM, { width: lb * 0.45 });
        doc.fillColor(TINTE).fillOpacity(1);
      }

      // Ausgabeschein rechts, abgetrennt durch eine Schnittlinie.
      const ax = W - m - abschnitt + 6 * MM;
      const ab = abschnitt - 6 * MM;
      doc.save().lineWidth(0.4).strokeColor(GRAU).dash(3, { space: 3 }).moveTo(ax - 4 * MM, 0).lineTo(ax - 4 * MM, H).stroke().undash().restore();
      let ay = m;
      kicker(doc, "Ausgabeschein", ax, ay, d.farbe, ab);
      doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(`Beleg ${v.belegNr} · ${s.name}`, ax, ay + 9, { width: ab, lineBreak: false, ellipsis: true });
      ay += 9 * MM;
      doc.save().fillOpacity(0.1).rect(ax, ay, ab, 22 * MM).fill(d.flaeche).restore();
      doc.font(SANS_FETT).fontSize(6.5).fillColor(d.farbe).text(e.kaefig && e.kaefig !== String(e.katalogNr) ? "KÄFIG-NR." : "KATALOG-NR.", ax, ay + 2 * MM, { width: ab, align: "center", characterSpacing: 0.6 });
      textImFeld(doc, e.kaefig || nr(e), ax + 2 * MM, ay + 6 * MM, { breite: ab - 4 * MM, groesse: 32, min: 14, schrift: SANS_FETT, farbe: TINTE, align: "center" });
      doc.font(SANS).text("", ax, ay);
      ay += 25 * MM;
      doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(e.bezeichnung, ax, ay, { width: ab });
      doc.font(SANS).fontSize(8).fillColor(GRAU).text(klasse(e), ax, doc.y + 1, { width: ab });
      doc.font(SANS_FETT).fontSize(8.5).fillColor(TINTE).text(`Käufer: ${v.kaeuferName}`, ax, doc.y + 3 * MM, { width: ab });
      doc
        .font(SANS)
        .fontSize(8.5)
        .text(
          v.zahlart === "ueberweisung"
            ? `Kaufpreis ${formatEuro(v.preisCent)} per Überweisung vereinbart – Tier erst nach Zahlungseingang ausgeben`
            : `bezahlt: ${formatEuro(v.preisCent)} (${v.zahlart === "bar" ? "bar" : v.zahlart === "karte" ? "Karte" : "unbar"})`,
          ax,
          doc.y + 1,
          { width: ab },
        );
      unterschrift(doc, ax, H - m - 4 * MM, ab, "Tier ausgegeben – Datum, Unterschrift");
      schnittlinie(doc, seite.schnittBei);
    },
    { size: seite.size, margins: seite.margins },
  );
}

// ── Kassenbericht ────────────────────────────────────────────────────────

/**
 * Kassenbericht der Barkasse (A4): je Tag Anfangsbestand, alle Bargeldbewegungen mit Uhrzeit, Soll-Endbestand,
 * gezählter Bestand und Differenz, Unterschriften von Kassierer und Prüfer. Ohne Datum alle Tage.
 */
export async function kassenberichtPdf(s: Schau, datum?: string) {
  const [alle, d, kopf] = await Promise.all([ladeKassenbuch(s.id), ladeDesign(s), eigenerKopf(s.id)]);
  // Stand der Protokoll-Kette beim Ausdruck: auf Papier festgehalten, fällt später ein heimlich gelöschter jüngster
  // Eintrag auf (Protokoll › Unveränderbarkeit prüfen zeigt denselben Stand).
  const kette = kopf.id != null ? [`Protokollstand beim Ausdruck: Nr. ${kopf.id}, Prüfwert ${kopf.pruefwert}.`] : [];
  const tage = datum ? alle.filter((t) => t.datum === datum) : alle;
  const zeit = (x: Date) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(x);
  return erzeugePdf(
    `Kassenbericht ${s.name}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      if (!tage.length) {
        briefkopf(doc, d, { verein: verein(s), zeile: kopfzeile(s), art: "Barkasse", titel: "Kassenbericht", angaben: [["Tag", datum ? datumDe(datum) : "alle"]] });
        doc.font(SANS_KURSIV).fontSize(10).fillColor(GRAU).text(["Keine Bargeldbewegungen.", ...kette].join(" "), x, doc.y, { width: w });
      }
      tage.forEach((t, i) => {
        if (i) doc.addPage();
        briefkopf(doc, d, {
          verein: verein(s),
          zeile: kopfzeile(s),
          art: "Barkasse",
          titel: `Kassenbericht ${datumDe(t.datum)}`,
          unter: "Alle Bargeldbewegungen des Tages – Verkauf, Meldegeld, Auszahlung, Einlage und Entnahme",
          angaben: [
            ["Anfangsbestand", formatEuro(t.anfangCent)],
            ["Einnahmen", formatEuro(t.einnahmenCent)],
            ["Ausgaben", formatEuro(t.ausgabenCent)],
            ["Soll-Endbestand", formatEuro(t.sollCent)],
            ["Gezählt", t.abschluss ? formatEuro(t.abschluss.istCent) + (t.abschluss.nachtrag ? ` (Nachtrag ${t.abschluss.nachtrag})` : "") : "–"],
            // Nach einer Zählung geht es mit dem gezählten Bestand weiter: der Unterschied zum Soll ist die Kassendifferenz.
            ...(t.abschluss && t.endCent !== t.sollCent
              ? ([
                  ["Kassendifferenz laut Abschluss", formatEuro(t.endCent - t.sollCent)],
                  ["Endbestand (gezählt + Nachträge)", formatEuro(t.endCent)],
                ] as [string, string][])
              : []),
          ],
        });
        let bestand = t.anfangCent;
        tabelle(
          doc,
          [
            { titel: "Zeit", breite: 16 * MM },
            { titel: "Vorgang", breite: w - 16 * MM - 3 * 26 * MM },
            { titel: "Einnahme", breite: 26 * MM, align: "right" },
            { titel: "Ausgabe", breite: 26 * MM, align: "right" },
            { titel: "Bestand", breite: 26 * MM, align: "right", fett: true },
          ],
          [
            ["", "Anfangsbestand", "", "", formatEuro(t.anfangCent)],
            ...t.bewegungen.map((b) => {
              bestand += b.betragCent;
              return [zeit(b.zeit), b.nachtrag ? `Nachtrag: ${b.text}` : b.text, b.betragCent > 0 ? formatEuro(b.betragCent) : "", b.betragCent < 0 ? formatEuro(-b.betragCent) : "", formatEuro(bestand)];
            }),
          ],
          { schrift: 8.5, streifen: d.flaeche, summe: ["", "Soll-Endbestand", formatEuro(t.einnahmenCent), formatEuro(t.ausgabenCent), formatEuro(t.sollCent)] },
        );
        let y = doc.y + 5 * MM;
        if (y + 55 * MM > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        y = hinweisKasten(
          doc,
          d,
          t.abschluss ? (t.nachtragOffen ? "Nachtrag noch nicht abgeschlossen" : "Tagesabschluss") : "Noch kein Tagesabschluss",
          t.abschluss
            ? [
                ...t.abschluesse.flatMap((a) => [
                  `${a.nachtrag ? `Nachtragsabschluss ${a.nachtrag}` : "Tagesabschluss"}: gezählt ${formatEuro(a.istCent)} um ${zeit(a.createdAt)}, Soll ${formatEuro(a.sollCent)}, Differenz ${formatEuro(a.differenzCent)}.`,
                  ...(a.bemerkung ? [`Erklärung: ${a.bemerkung}`] : []),
                ]),
                ...(t.nachtragOffen ? ["Nach dem letzten Abschluss gab es noch Barbuchungen (Nachtrag): Bestand zählen und den Nachtragsabschluss buchen."] : []),
                ...kette,
              ]
            : ["Bestand zählen und unter „Kassenbuch“ den Tagesabschluss buchen. Spätere Barbuchungen stehen als Nachtrag im Kassenbuch.", ...kette],
          x,
          y,
          w,
        ) + 18 * MM;
        const sb = (w - 10 * MM) / 3;
        unterschrift(doc, x, y, sb, "Ort, Datum", [s.ort, datumDe(t.datum)].filter(Boolean).join(", "));
        unterschrift(doc, x + sb + 5 * MM, y, sb, "Unterschrift Kassierer");
        unterschrift(doc, x + 2 * (sb + 5 * MM), y, sb, "Unterschrift Prüfer");
      });
      fusszeilen(doc, `Kassenbericht · ${fusstext(s)}`);
    },
    { margins: A4_RAENDER },
  );
}

// ── Kassenbelege (Einzahlung, Eigenbeleg) ─────────────────────────────────

/**
 * Einzahlungsquittung für bares Meldegeld (auch Erstattung/Storno) bzw. Eigenbeleg für Wechselgeld, Einlage und
 * Entnahme (A5 quer, Formatvorgabe A4: oben auf A4). Wird beim Buchen archiviert; null, wenn die Buchung nicht zur Schau gehört.
 */
export async function kassenbelegPdf(s: Schau, art: "einzahlung" | "eigenbeleg", nummer: number) {
  const [dVerein, brief] = await Promise.all([ladeDesign(s), ladeBriefVorlage(s.organisationId)]);
  const d = briefDesign(dVerein, brief);
  let titel: string;
  let zeilen: [string, string][];
  let betragCent: number;
  let text: string;
  if (art === "einzahlung") {
    const [z] = await db
      .select({ z: zahlung, vorname: aussteller.vorname, nachname: aussteller.nachname })
      .from(zahlung)
      .innerJoin(meldung, eq(meldung.id, zahlung.meldungId))
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(and(eq(zahlung.id, nummer), eq(meldung.schauId, s.id)));
    if (!z) return null;
    betragCent = z.z.betragCent;
    // Gegenbuchung (Storno) ist keine Geldübergabe: sie hebt den Ursprungsbeleg auf.
    const storno = z.z.stornoVon != null;
    titel = storno ? `Storno zu Beleg E-${z.z.stornoVon}` : betragCent < 0 ? "Auszahlung Meldegeld" : "Einzahlungsquittung Meldegeld";
    zeilen = [
      ["Beleg", `E-${nummer}`],
      ["Datum", datumDe(z.z.createdAt)],
      ["Aussteller", `${z.vorname} ${z.nachname}`],
      ["Zahlart", ZAHLART_LABEL[z.z.art]],
      ...(z.z.grund ? ([["Grund", z.z.grund]] as [string, string][]) : []),
    ];
    text = storno
      ? `Gegenbuchung zu Beleg E-${z.z.stornoVon}: Die Buchung wird rückgängig gemacht – keine Geldübergabe.`
      : betragCent < 0
        ? "Den Betrag hat der Aussteller bar erhalten."
        : "Den Betrag hat der Verein bar erhalten.";
  } else {
    const [k] = await db.select().from(kassenbewegung).where(and(eq(kassenbewegung.id, nummer), eq(kassenbewegung.schauId, s.id)));
    if (!k) return null;
    betragCent = k.art === "entnahme" ? -k.betragCent : k.betragCent;
    titel = k.art === "anfangsbestand" ? "Eigenbeleg Wechselgeld" : k.art === "einlage" ? "Eigenbeleg Einlage" : "Eigenbeleg Entnahme";
    zeilen = [
      ["Beleg", `K-${nummer}`],
      ["Datum", datumDe(k.createdAt)],
      ["Zweck", k.grund || "–"],
    ];
    text = k.art === "entnahme" ? "Der Betrag wurde der Barkasse entnommen." : "Der Betrag wurde in die Barkasse eingelegt.";
  }
  const seite = belegSeite(druckFormateLesen(s.druckFormate).kassenbeleg, 12 * MM);
  return erzeugePdf(
    titel,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      briefkopf(doc, d, { ...belegKopf(brief, verein(s), kopfzeile(s)), art: "Kassenbeleg", titel, angaben: zeilen.slice(0, 2) });
      let y = angaben(doc, zeilen.slice(2), x, doc.y, w * 0.6, 0.3);
      y += 4 * MM;
      doc.save().fillOpacity(0.08).rect(x, y, w, 18 * MM).fill(d.flaeche).restore();
      doc.save().rect(x, y, 2.2, 18 * MM).fill(d.flaeche).restore();
      kicker(doc, betragCent < 0 ? "Ausgabe" : "Einnahme", x + 4 * MM, y + 3 * MM, d.farbe, w * 0.4);
      doc.font(SERIF).fontSize(20).fillColor(TINTE).text(formatEuro(Math.abs(betragCent)), x + 4 * MM, y + 7 * MM, { width: w * 0.4, lineBreak: false });
      doc.font(SANS_KURSIV).fontSize(8.5).fillColor(GRAU).text(`in Worten: ${betragInWorten(betragCent)}`, x + w * 0.4, y + 8 * MM, { width: w * 0.6 - 4 * MM, align: "right" });
      y += 24 * MM;
      doc.font(SANS).fontSize(9.5).fillColor(TINTE).text(text, x, y, { width: w });
      const sb = (w - 5 * MM) / 2;
      // Über dem unteren Rand (wie bei der Spendenquittung): sonst begann pdfkit für jede Beschriftung eine neue Seite.
      const uy = doc.page.height - doc.page.margins.bottom - 8 * MM;
      unterschrift(doc, x, uy, sb, "Unterschrift Kasse");
      unterschrift(doc, x + sb + 5 * MM, uy, sb, art === "einzahlung" ? "Unterschrift Aussteller" : "Unterschrift Zeuge");
      schnittlinie(doc, seite.schnittBei);
    },
    { size: seite.size, margins: seite.margins },
  );
}
