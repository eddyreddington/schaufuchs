import { betragInWorten, briefWerte, formatEuro, formatIban, fuelle, oeffnungszeitenZeilen } from "@schau/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, katalogeintrag, meldung, preisrichter, prEinteilung, verkauf, type schau } from "../db/schema";
import { abrechnungListe } from "../routers/kasse";
import { ladeEintraege, meldebetrag, type Eintrag } from "../services/eintraege";
import { zuteilung } from "../services/pruefung";
import {
  angaben,
  briefkopf,
  datumDe,
  type Doc,
  erzeugePdf,
  fusszeilen,
  GRAU,
  HAARLINIE,
  hinweisKasten,
  hinweisKastenHoehe,
  kicker,
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
import { bewertungskartenPdf as kartenNachVorlagePdf } from "./bewertungskarte";
import { belegKopf, BRIEF_RAENDER, briefDesign, briefFuss, briefKopf, ladeBriefVorlage } from "./brief";
import { A4_RAENDER, breite, fusstext, klasse, kopfzeile, ladeDesign, nr, type Schau, tier, unten, verein } from "./dokumente-gemeinsam";
// Belege der Kasse und Listen für das Veterinäramt stehen in eigenen Dateien; hier weitergereicht, damit alle
// Aufrufer weiter „./pdf/dokumente“ nutzen.
export { kassenbelegPdf, kassenberichtPdf, kaufbelegPdf } from "./dokumente-kasse";
export { tierlistePdf, verkaufslistePdf } from "./dokumente-amt";

// ── Bewertungskarten ──────────────────────────────────────────────────────

/** Bewertungskarten nach der Druckvorlage der Schau (Format, Bausteine, Vordruck) – gezeichnet in pdf/bewertungskarte.ts. */
export async function bewertungskartenPdf(s: Schau, nurPreisrichterId?: number) {
  return kartenNachVorlagePdf(s, await ladeDesign(s), nurPreisrichterId);
}

// ── Bewertungsliste ───────────────────────────────────────────────────────

/** Bewertungsliste für einen Preisrichter (zum Mitnehmen in die Käfigreihe), mit Platz zum Eintragen. */
export async function preisrichterListePdf(s: Schau, preisrichterId: number) {
  const [eintraege, einteilung, [pr], d] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    // Nur Preisrichter dieser Schau – sonst ließen sich Namen fremder Schauen über die ID abfragen.
    Number.isFinite(preisrichterId)
      ? db.select().from(preisrichter).where(and(eq(preisrichter.id, preisrichterId), eq(preisrichter.schauId, s.id)))
      : Promise.resolve([]),
    ladeDesign(s),
  ]);
  const zu = zuteilung(eintraege, einteilung);
  const meine = pr ? eintraege.filter((e) => zu.get(e.id) === pr.id) : [];
  const bereiche = pr ? einteilung.filter((x) => x.preisrichterId === pr.id).map((x) => (x.vonNr === x.bisNr ? `${x.vonNr}` : `${x.vonNr}–${x.bisNr}`)).join(", ") : "";
  return erzeugePdf(
    `Bewertungsliste ${pr?.name ?? ""}`,
    (doc) => {
      briefkopf(doc, d, {
        verein: verein(s),
        zeile: kopfzeile(s),
        art: "Bewertungsliste",
        titel: pr?.name ?? "Preisrichter nicht gefunden",
        unter: pr ? "Zum Eintragen in der Käfigreihe – maßgeblich ist die Bewertungskarte." : undefined,
        angaben: pr
          ? [
              ["Bewertung", datumDe(s.bewertungAm) || "–"],
              ["Nummern", bereiche || "–"],
              ["Tiere", String(meine.length)],
            ]
          : [],
      });
      if (!pr) return;
      const w = breite(doc);
      tabelle(
        doc,
        [
          { titel: "Nr.", breite: 13 * MM, align: "right", fett: true },
          { titel: "Rasse, Farbenschlag", breite: w - 13 * MM - 26 * MM - 24 * MM - 16 * MM - 34 * MM },
          { titel: "Klasse", breite: 26 * MM },
          { titel: "Note / Pkt.", breite: 24 * MM },
          { titel: "Preis", breite: 16 * MM },
          { titel: "Bemerkung", breite: 34 * MM },
        ],
        meine.map((e) => [nr(e), e.bezeichnung, tier(e), e.status === "fehlt" ? "fehlt" : "", "", ""]),
        { schrift: 9, zeilenhoehe: 15, streifen: d.flaeche },
      );
      fusszeilen(doc, `Bewertungsliste ${pr.name} · ${s.name}`);
    },
    { margins: A4_RAENDER },
  );
}

// ── B-Bogen und Ringkarten ────────────────────────────────────────────────

/**
 * B-Bogen (Meldebestätigung mit Katalognummern) als Geschäftsbrief nach der Briefvorlage des Vereins (DIN 5008 Form A
 * oder B, Anschrift im Fenster, Falzmarken; Texte und Hinweise aus der Vorlage). Danach die Ringkarten.
 */
export async function ausstellerUnterlagenPdf(s: Schau, meldungIds: number[]) {
  const [alle, meldungen, dVerein, vorlage] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db
      .select({ m: meldung, a: aussteller })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(eq(meldung.schauId, s.id))
      .orderBy(asc(aussteller.nachname), asc(aussteller.vorname)),
    ladeDesign(s),
    ladeBriefVorlage(s.organisationId),
  ]);
  const d = briefDesign(dVerein, vorlage);
  const auswahl = meldungen.filter((x) => meldungIds.includes(x.m.id) && x.m.status === "bestaetigt");
  const betraege = await Promise.all(auswahl.map((x) => meldebetrag(db, x.m.id)));
  const heute = datumDe(new Date());

  return erzeugePdf(
    `Ausstellerunterlagen ${s.name}`,
    (doc) => {
      const anfaenge: number[] = [];
      auswahl.forEach(({ m, a }, i) => {
        if (i > 0) doc.addPage();
        anfaenge.push(doc.bufferedPageRange().count - 1);
        const tiere = alle.filter((e) => e.meldungId === m.id && e.katalogNr != null);
        bBogen(doc, m, a, tiere, betraege[i]!);
        ringkarten(doc, a, tiere);
      });
      if (auswahl.length === 0) doc.font(SANS).fontSize(10).text("Keine bestätigten Meldungen ausgewählt.");
      briefFuss(doc, vorlage, fusstext(s), anfaenge);
    },
    { margins: BRIEF_RAENDER },
  );

  function bBogen(doc: Doc, m: typeof meldung.$inferSelect, a: typeof aussteller.$inferSelect, tiere: Eintrag[], b: { summeCent: number; bezahltCent: number; stiftungCent?: number }) {
    const x = doc.page.margins.left;
    const w = breite(doc);
    const werte = briefWerte(a, { verein: verein(s), schau: s.name, ort: s.ort, einlieferung: s.einlieferung, datum: heute });
    briefKopf(doc, d, vorlage, {
      verein: verein(s),
      unterzeile: kopfzeile(s),
      empfaenger: [`${a.vorname} ${a.nachname}`, a.strasse, `${a.plz} ${a.ort}`.trim()],
      angaben: [
        ["Meldung", `Nr. ${m.id}`],
        ["Registriernummer", a.registriernummer || "–"],
        ["Verein", a.verein || "–"],
        ["Datum", heute],
      ],
    });
    // Betreff und Text.
    kicker(doc, "Meldebestätigung · B-Bogen", x, doc.y, d.farbe, w);
    doc.font(SERIF).fontSize(17).fillColor(TINTE).text(s.name, x, doc.y + 11, { width: w });
    doc.font(SANS).fontSize(9.5).fillColor(TINTE).text(fuelle(vorlage.meldebestaetigung.einleitung, werte), x, doc.y + 4, { width: w });
    doc.y += 6;
    tabelle(
      doc,
      [
        { titel: "Nr.", breite: 14 * MM, align: "right", fett: true },
        { titel: "Käfig", breite: 16 * MM },
        { titel: "Rasse, Farbenschlag", breite: w - 30 * MM - 34 * MM - 22 * MM },
        { titel: "Klasse", breite: 34 * MM },
        { titel: "Vkpr.", breite: 22 * MM, align: "right" },
      ],
      tiere.map((e) => [nr(e), e.kaefig, e.bezeichnung, tier(e), e.verkaufspreisCent ? formatEuro(e.verkaufspreisCent) : "–"]),
      { streifen: d.flaeche },
    );
    // Meldegeld und Termine nebeneinander.
    let y = doc.y + 5 * MM;
    const halb = (w - 8 * MM) / 2;
    if (y + 40 * MM > unten(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    kicker(doc, "Meldegeld", x, y, d.farbe, halb);
    const stiftungCent = b.stiftungCent ?? 0;
    const offen = b.summeCent + stiftungCent - b.bezahltCent;
    const yLinks = angaben(
      doc,
      [
        ["Meldegeld", formatEuro(b.summeCent)],
        ...(stiftungCent ? ([["Ehrenpreisstiftung", formatEuro(stiftungCent)]] as [string, string][]) : []),
        ["bezahlt", formatEuro(b.bezahltCent)],
        [offen > 0 ? "noch offen" : offen < 0 ? "zu viel gezahlt" : "Stand", offen === 0 ? "vollständig bezahlt" : formatEuro(Math.abs(offen))],
      ],
      x,
      y + 12,
      halb,
      0.5,
    );
    kicker(doc, "Termine", x + halb + 8 * MM, y, d.farbe, halb);
    const yRechts = angaben(
      doc,
      [
        ["Einlieferung", s.einlieferung],
        ["Bewertung", s.bewertungAm ? `${datumDe(s.bewertungAm)} (geschlossen)` : ""],
        ["Öffnungszeiten", oeffnungszeitenZeilen(s.oeffnungszeiten).join("\n")],
        ["Tierausgabe", s.aussetzen],
      ],
      x + halb + 8 * MM,
      y + 12,
      halb,
      0.4,
    );
    y = Math.max(yLinks, yRechts) + 4 * MM;
    const hinweise = fuelle(vorlage.meldebestaetigung.hinweise, werte).split("\n").map((t) => t.trim()).filter(Boolean);
    // Hinweise und Gruß sind frei formuliert: vorher messen und, wenn nötig, auf der nächsten Seite beginnen.
    const neueSeiteWenn = (hoehe: number) => {
      if (y + hoehe > unten(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };
    if (hinweise.length) {
      neueSeiteWenn(hinweisKastenHoehe(doc, hinweise, w));
      y = hinweisKasten(doc, d, "Zur Einlieferung", hinweise, x, y, w) + 5 * MM;
    }
    const gruss = fuelle(vorlage.meldebestaetigung.gruss, werte).trim();
    if (gruss) {
      neueSeiteWenn(doc.font(SANS).fontSize(9.5).heightOfString(gruss, { width: w, lineGap: 1.5 }));
      doc.fillColor(TINTE).text(gruss, x, y, { width: w, lineGap: 1.5 });
    }
  }

  function ringkarten(doc: Doc, a: typeof aussteller.$inferSelect, tiere: Eintrag[]) {
    if (!tiere.length) return;
    doc.addPage();
    const x0 = doc.page.margins.left;
    const w = breite(doc);
    kicker(doc, "Ringkarten", x0, doc.y, d.farbe, w);
    doc.font(SERIF).fontSize(16).fillColor(TINTE).text(`${a.vorname} ${a.nachname}`, x0, doc.y + 10, { width: w });
    doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(
      "Je Tier zwei gleiche Abschnitte. Ringnummer eintragen, unterschreiben und an der Linie trennen: Abschnitt 1 bei der Einlieferung abgeben, Abschnitt 2 behalten und bei der Tierausgabe vorzeigen.",
      x0,
      doc.y + 2,
      { width: w },
    );
    let y = doc.y + 5 * MM;
    const kH = 33 * MM;
    const luecke = 4 * MM;
    const kB = (w - luecke) / 2;
    for (const e of tiere) {
      if (y + kH > unten(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      for (let k = 0; k < 2; k++) {
        const x = x0 + k * (kB + luecke);
        doc.save().lineWidth(0.4).strokeColor(GRAU).dash(2.5, { space: 2 }).rect(x, y, kB, kH - 2 * MM).stroke().undash().restore();
        // Nummer links in einem Farbfeld, rechts Tier, Aussteller, Ring und Unterschrift.
        const nb = 17 * MM;
        doc.save().fillOpacity(0.1).rect(x, y, nb, kH - 2 * MM).fill(d.flaeche).restore();
        doc.font(SANS_FETT).fontSize(6).fillColor(d.farbe).text("NR.", x, y + 2.5 * MM, { width: nb, align: "center", characterSpacing: 0.6 });
        textImFeld(doc, nr(e), x + 1 * MM, y + 7 * MM, { breite: nb - 2 * MM, groesse: 18, min: 10, schrift: SANS_FETT, farbe: TINTE, align: "center" });
        doc.font(SANS_FETT).fontSize(6).fillColor(d.farbe).text(k === 0 ? "1 · ABGABE" : "2 · AUSGABE", x, y + kH - 7 * MM, { width: nb, align: "center", lineBreak: false });
        const tx = x + nb + 2.5 * MM;
        const tb = kB - nb - 4.5 * MM;
        textImFeld(doc, e.bezeichnung, tx, y + 2 * MM, { breite: tb, groesse: 8.5, min: 6.5, schrift: SANS_FETT, farbe: TINTE });
        doc.font(SANS).fontSize(7.5).fillColor(GRAU).text(`${tier(e)} · ${e.eigeneZucht ? "eigene Zucht" : "nicht eigene Zucht"}`, tx, y + 6.3 * MM, { width: tb, lineBreak: false, ellipsis: true });
        doc.font(SANS).fontSize(7.5).fillColor(TINTE).text([`${a.vorname} ${a.nachname}`, `${a.plz} ${a.ort}`.trim(), a.kreisverband].filter(Boolean).join(" · "), tx, y + 9.6 * MM, { width: tb, lineBreak: false, ellipsis: true });
        doc.font(SANS).fontSize(7).fillColor(GRAU).text("Ring-Nr.", tx, y + 14.5 * MM, { lineBreak: false });
        if (e.ringnummern) doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(e.ringnummern, tx + 12 * MM, y + 14 * MM, { width: tb - 12 * MM, lineBreak: false, ellipsis: true });
        doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(tx + 12 * MM, y + 18 * MM).lineTo(tx + tb, y + 18 * MM).stroke().restore();
        unterschrift(doc, tx, y + kH - 7 * MM, tb, "Unterschrift Aussteller");
      }
      y += kH;
    }
  }
}

// ── Abrechnung und Quittung ───────────────────────────────────────────────

/** Abrechnung je Aussteller als Quittung (A4, mit Betrag in Worten und Unterschriften), oder alle Aussteller als Liste. */
export async function abrechnungPdf(s: Schau, ausstellerId?: number, quittungNr?: number, stand?: Awaited<ReturnType<typeof abrechnungListe>>[number]) {
  // Für eine Quittung nur die Zeile dieses Ausstellers rechnen (SEPA-Buchung legt viele Quittungen auf einmal ab);
  // mit festgehaltenem Stand genau diesen (Beleg = Stand der Buchung).
  const [zeilen, dVerein, brief] = await Promise.all([
    stand && stand.ausstellerId === ausstellerId ? [stand] : abrechnungListe(s.id, db, ausstellerId != null ? { nurAusstellerId: ausstellerId } : {}),
    ladeDesign(s),
    ladeBriefVorlage(s.organisationId),
  ]);
  const d = briefDesign(dVerein, brief);
  if (ausstellerId == null) return gesamtliste();
  const z = zeilen.find((x) => x.ausstellerId === ausstellerId);
  const [a] = z ? await db.select().from(aussteller).where(eq(aussteller.id, z.ausstellerId)) : [];
  const tiere = z ? (await ladeEintraege(s.id, { nurMeldungId: z.meldungId })).filter((e) => e.preise.length || e.verkauftAn) : [];
  const verkaeufe = z
    ? await db
        .select({ katalogeintragId: verkauf.katalogeintragId, belegNr: verkauf.belegNr, preisCent: verkauf.preisCent, provisionCent: verkauf.provisionCent, provisionBp: verkauf.provisionBp })
        .from(verkauf)
        .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
        .where(and(eq(katalogeintrag.meldungId, z.meldungId), isNull(verkauf.storniertAm)))
    : [];

  // Eine bestimmte Quittung (auch storniert) oder die letzte gültige Buchung.
  const aus = z ? (quittungNr != null ? (z.buchungen.find((b) => b.quittungNr === quittungNr) ?? null) : z.auszahlung) : null;
  return erzeugePdf(
    aus ? `Quittung ${aus.quittungNr}` : "Abrechnung",
    (doc) => {
      if (!z || !a) {
        doc.font(SANS).fontSize(10).text("Aussteller nicht gefunden.");
        return;
      }
      const x = doc.page.margins.left;
      const w = breite(doc);
      // Frühere gültige Buchungen werden im Rechenweg abgezogen – diese Quittung gilt nur für ihren Betrag.
      const frueher = aus ? z.buchungen.filter((b) => !b.storniertAm && b.id < aus.id) : z.buchungen.filter((b) => !b.storniertAm);
      const betrag = aus ? aus.betragCent : z.nochOffenCent;
      const anVerein = betrag < 0;
      const storniert = !!aus?.storniertAm;
      // Bei Überweisung bestätigt der Beleg keinen Empfang: Zahlungsanzeige statt Quittung (gleiche Nummer).
      const anzeige = !!aus && aus.art === "ueberweisung" && !anVerein;
      const belegName = anzeige ? "Zahlungsanzeige" : "Quittung";
      briefkopf(doc, d, {
        ...belegKopf(brief, verein(s), kopfzeile(s)),
        art: storniert ? "Storniert – ungültig" : aus ? `Abrechnung und ${belegName}` : "Abrechnung – noch nicht ausgezahlt",
        titel: aus ? `${belegName} Nr. ${aus.quittungNr}` : "Vorläufige Abrechnung",
        unter: aus?.bezugQuittungNr
          ? `${aus.betragCent >= 0 ? "Nachzahlung" : "Rückforderung"} zu Quittung Nr. ${aus.bezugQuittungNr}`
          : "Preisgeld und Verkaufserlöse aus der Schau",
        angaben: [
          ...(aus ? ([["Quittung", `Nr. ${aus.quittungNr}`]] as [string, string][]) : []),
          ["Datum", datumDe(aus?.createdAt ?? new Date())],
          ["Zahlungsart", aus ? (aus.art === "ueberweisung" ? "Überweisung" : "bar") : "–"],
          ["Registriernummer", a.registriernummer || "–"],
        ],
      });
      // Aussteller als Empfänger bzw. Zahler.
      kicker(doc, anVerein ? "Zahler" : "Empfänger", x, doc.y, d.farbe, w);
      doc.font(SANS_FETT).fontSize(10.5).fillColor(TINTE).text(`${a.vorname} ${a.nachname}`, x, doc.y + 10, { width: w });
      doc.font(SANS).fontSize(9.5).text([a.strasse, `${a.plz} ${a.ort}`.trim(), a.verein ? `Verein: ${a.verein}` : ""].filter(Boolean).join("\n"), x, doc.y + 1, { width: w });
      doc.y += 6 * MM;

      // Positionen.
      const provisionVon = new Map(verkaeufe.map((v) => [v.katalogeintragId, v]));
      const posten = tiere.flatMap((e) => [
        ...e.preise.map((p) => [nr(e), e.bezeichnung, klasse(e), `${p.name} (${p.kuerzel})`, formatEuro(p.betragCent)]),
        // Gebuchter Verkaufspreis (nicht der Preis aus der Meldung – der könnte inzwischen anders sein).
        ...(e.verkauftAn ? [[nr(e), e.bezeichnung, klasse(e), `Verkauf, Beleg ${provisionVon.get(e.id)?.belegNr ?? "–"}`, formatEuro(provisionVon.get(e.id)?.preisCent ?? e.verkaufspreisCent ?? 0)]] : []),
      ]);
      if (posten.length) {
        tabelle(
          doc,
          [
            { titel: "Nr.", breite: 13 * MM, align: "right", fett: true },
            { titel: "Tier", breite: w - 13 * MM - 22 * MM - 42 * MM - 26 * MM },
            { titel: "Klasse", breite: 22 * MM },
            { titel: "Posten", breite: 42 * MM },
            { titel: "Betrag", breite: 26 * MM, align: "right" },
          ],
          posten,
          { streifen: d.flaeche },
        );
      } else {
        doc.font(SANS_KURSIV).fontSize(9.5).fillColor(GRAU).text("Keine Preise und keine Verkäufe.", x, doc.y, { width: w });
      }

      // Rechenweg rechtsbündig: Posten, dann Summe mit Doppellinie.
      const rw = 92 * MM;
      const rx = x + w - rw;
      let y = doc.y + 4 * MM;
      // Satz aus den Verkäufen selbst – eine spätere Änderung der Schau-Einstellung ändert keinen Beleg.
      const saetze = [...new Set(verkaeufe.map((v) => v.provisionBp ?? s.provisionBp))];
      const prozent = saetze.length === 1 ? ` ${(saetze[0]! / 100).toLocaleString("de-DE")} %` : "";
      const rechnung: [string, number, string][] = [
        ["Preisgeld", z.preisgeldCent, ""],
        ["Verkaufserlös", z.verkaufCent, ""],
        [`Provision${prozent} vom Verkauf`, -z.provisionCent, ""],
        [z.stiftungCent ? "offenes Meldegeld/Stiftung" : "offenes Meldegeld", -z.offenCent, ""],
        ["zu viel gezahlt", z.ueberzahltCent, ""],
        // Richtung erkennbar: an den Aussteller ausgezahlt (positiv gebucht) oder vom Aussteller an den Verein gezahlt.
        ...frueher.map((b): [string, number, string] => [b.betragCent >= 0 ? `bereits ausgezahlt, Quittung ${b.quittungNr}` : `bereits vom Aussteller gezahlt, Quittung ${b.quittungNr}`, -b.betragCent, ""]),
      ];
      for (const [t, c] of rechnung) {
        if (c === 0) continue;
        doc.font(SANS).fontSize(9.5).fillColor(GRAU).text(t, rx, y, { width: rw * 0.62, lineBreak: false });
        doc.font(SANS).fillColor(TINTE).text(`${c < 0 ? "− " : ""}${formatEuro(Math.abs(c))}`, rx, y, { width: rw, align: "right", lineBreak: false });
        y += 14;
      }
      doc.save().lineWidth(0.6).strokeColor(TINTE).moveTo(rx, y).lineTo(rx + rw, y).stroke().moveTo(rx, y + 2).lineTo(rx + rw, y + 2).stroke().restore();
      y += 6;
      const rest = z.saldoCent - frueher.reduce((n, b) => n + b.betragCent, 0);
      doc.font(SANS_FETT).fontSize(10.5).fillColor(TINTE).text(rest < 0 ? "vom Aussteller zu zahlen" : "an den Aussteller", rx, y, { width: rw * 0.62, lineBreak: false });
      doc.text(formatEuro(Math.abs(rest)), rx, y, { width: rw, align: "right", lineBreak: false });
      y += 22;

      // Betragsfeld: was tatsächlich gezahlt wurde, in Ziffern und Worten.
      if (y + 75 * MM > unten(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const bh = 24 * MM;
      doc.save().fillOpacity(0.08).rect(x, y, w, bh).fill(d.flaeche).restore();
      doc.save().rect(x, y, 2.2, bh).fill(d.flaeche).restore();
      const label = aus
        ? anVerein
          ? aus.art === "ueberweisung"
            ? "Vom Aussteller überwiesen (eingegangen)"
            : "Vom Aussteller bar bezahlt"
          : aus.art === "ueberweisung"
            ? "Überwiesen an den Aussteller"
            : "Bar ausgezahlt an den Aussteller"
        : anVerein
          ? "Vom Aussteller noch zu zahlen"
          : "Noch auszuzahlen";
      kicker(doc, label, x + 5 * MM, y + 4 * MM, d.farbe, w * 0.5);
      doc.font(SERIF).fontSize(26).fillColor(TINTE).text(formatEuro(Math.abs(betrag)), x + 5 * MM, y + 8 * MM, { width: w * 0.5, lineBreak: false });
      doc.font(SANS_KURSIV).fontSize(9).fillColor(GRAU).text(`in Worten: ${betragInWorten(betrag)}`, x + w * 0.45, y + 10.5 * MM, { width: w * 0.55 - 5 * MM, align: "right" });
      y += bh + 5 * MM;

      if (storniert) {
        y = hinweisKasten(doc, d, "Storniert", [`Diese Quittung wurde am ${datumDe(aus!.storniertAm)} storniert und gilt nicht mehr. Grund: ${aus!.stornoGrund || "–"}`], x, y, w) + 5 * MM;
      } else if (aus && aus.id === z.auszahlung?.id && z.differenzCent !== 0) {
        y = hinweisKasten(
          doc,
          d,
          "Abweichung zum aktuellen Stand",
          [`Seit der Quittung hat sich die Abrechnung geändert: ${z.differenzCent > 0 ? "noch auszuzahlen" : "zu viel ausgezahlt"} ${formatEuro(Math.abs(z.differenzCent))} (aktueller Saldo ${formatEuro(z.saldoCent)}).`],
          x,
          y,
          w,
        ) + 5 * MM;
      }

      // Quittungstext und Unterschriften. Eine Nachzahlung nennt keine Bestandteile (geändert hat sich vielleicht nur
      // das Meldegeld), sondern ihren Bezug.
      const teile = aus?.bezugQuittungNr
        ? `Nachzahlung zu Quittung Nr. ${aus.bezugQuittungNr}`
        : [z.preisgeldCent ? "Preisgeld" : "", z.verkaufCent ? "Verkaufserlöse" : ""].filter(Boolean).join(" und ") || "Abrechnung";
      const vereinskonto = s.vereinIban ? ` (IBAN ${formatIban(s.vereinIban)}${s.vereinKontoinhaber ? `, ${s.vereinKontoinhaber}` : ""})` : "";
      const anlass = aus?.bezugQuittungNr ? `Rückforderung zu Quittung Nr. ${aus.bezugQuittungNr}` : "Ausgleich der Abrechnung";
      const satz = storniert
        ? "Storniert – kein Zahlungsnachweis."
        : !aus
          ? anVerein
            ? `Diese Abrechnung ist vorläufig. Bitte ${formatEuro(Math.abs(betrag))} an den Verein zahlen – bar an der Kasse oder per Überweisung${vereinskonto}.`
            : "Diese Abrechnung ist vorläufig. Die Quittung entsteht bei der Auszahlung an der Kasse."
          : anVerein
            ? aus.art === "ueberweisung"
              ? `Der Betrag von ${formatEuro(Math.abs(betrag))} (${anlass}, ${s.name}) ist auf dem Vereinskonto eingegangen.`
              : `Den Betrag von ${formatEuro(Math.abs(betrag))} (${anlass}, ${s.name}) hat der Verein bar erhalten.`
            : aus.art === "ueberweisung"
              ? `Der Betrag von ${formatEuro(betrag)} (${teile}, ${s.name}) wird auf das angegebene Konto überwiesen. Diese Zahlungsanzeige ist keine Empfangsbestätigung.`
              : `Den Betrag von ${formatEuro(betrag)} (${teile}, ${s.name}) habe ich bar erhalten.`;
      doc.font(SANS).fontSize(10).fillColor(TINTE).text(satz, x, y, { width: w });
      y = doc.y + 18 * MM;
      // Unterschriften nur bei Bargeld – bei Überweisungen gibt es keine Übergabe.
      if (aus && !storniert && aus.art === "bar") {
        const sb = (w - 10 * MM) / 3;
        unterschrift(doc, x, y, sb, "Ort, Datum", [s.ort, datumDe(aus.createdAt)].filter(Boolean).join(", "));
        unterschrift(doc, x + sb + 5 * MM, y, sb, anVerein ? "Unterschrift Kasse" : "Unterschrift Empfänger");
        unterschrift(doc, x + 2 * (sb + 5 * MM), y, sb, anVerein ? "Unterschrift Aussteller" : "Unterschrift Kasse");
      }
      briefFuss(doc, brief, fusstext(s));
    },
    { margins: BRIEF_RAENDER },
  );

  function gesamtliste() {
    return erzeugePdf(
      `Abrechnung ${s.name}`,
      (doc) => {
        const w = breite(doc);
        const summe = (f: (z: (typeof zeilen)[number]) => number) => formatEuro(zeilen.reduce((s2, z) => s2 + f(z), 0));
        briefkopf(doc, d, {
          verein: verein(s),
          zeile: kopfzeile(s),
          art: "Abrechnung",
          titel: "Abrechnung aller Aussteller",
          unter: "Meldegeld, Preisgeld, Verkauf und Provision je Aussteller",
          angaben: [
            ["Stand", datumDe(new Date())],
            ["Aussteller", String(zeilen.length)],
            ["abgerechnet", String(zeilen.filter((z) => z.auszahlung && z.nochOffenCent === 0).length)],
          ],
        });
        const zahl = 23 * MM;
        const status = 46 * MM;
        tabelle(
          doc,
          [
            { titel: "Aussteller", breite: w - 6 * zahl - status - 6 * MM },
            // Mit der Meldung zugesagte Stiftung gehört zum Geschuldeten – sonst ginge der Saldo nicht aus den Spalten auf.
            { titel: "Meldegeld/Stift.", breite: zahl, align: "right" },
            { titel: "bezahlt", breite: zahl, align: "right" },
            { titel: "Preisgeld", breite: zahl, align: "right" },
            { titel: "Verkauf", breite: zahl, align: "right" },
            { titel: "Provision", breite: zahl, align: "right" },
            { titel: "Saldo", breite: zahl, align: "right", fett: true },
            { titel: "", breite: 6 * MM },
            { titel: "Status", breite: status },
          ],
          zeilen.map((z) => [
            z.name,
            formatEuro(z.meldebetragCent + z.stiftungCent),
            formatEuro(z.bezahltCent),
            formatEuro(z.preisgeldCent),
            formatEuro(z.verkaufCent),
            formatEuro(z.provisionCent),
            formatEuro(z.saldoCent),
            "",
            [
              z.buchungen.filter((b) => !b.storniertAm).length ? `Quittung ${z.buchungen.filter((b) => !b.storniertAm).map((b) => b.quittungNr).join(", ")}` : "",
              z.inUeberweisung ? "in SEPA-Datei" : z.nochOffenCent === 0 ? (z.auszahlung ? "" : "nichts offen") : `offen ${formatEuro(z.nochOffenCent)}`,
            ]
              .filter(Boolean)
              .join(" · "),
          ]),
          {
            schrift: 8.5,
            streifen: d.flaeche,
            summe: [
              "Summe",
              summe((z) => z.meldebetragCent + z.stiftungCent),
              summe((z) => z.bezahltCent),
              summe((z) => z.preisgeldCent),
              summe((z) => z.verkaufCent),
              summe((z) => z.provisionCent),
              summe((z) => z.saldoCent),
              "",
              "",
            ],
          },
        );
        fusszeilen(doc, `Abrechnung · ${fusstext(s)}`);
      },
      { layout: "landscape", margins: { top: 12 * MM, bottom: 16 * MM, left: 15 * MM, right: 15 * MM } },
    );
  }
}
