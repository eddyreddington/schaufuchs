import { betragInWorten, bewertungsText, brauchtObmann, formatEuro, formatIban, formatKatalognummer, MELDEART_LABEL, oeffnungszeitenZeilen, STANDARD_NOTENSKALA } from "@schau/domain";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/client";
import { aussteller, bewertung, bild, kassenbewegung, katalogeintrag, meldung, preisrichter, prEinteilung, verkauf, zahlung, type schau } from "../db/schema";
import { ladeGestaltung } from "../routers/katalog-gestaltung";
import { abrechnungListe } from "../routers/kasse";
import { ladeEintraege, meldebetrag, skalaVon, type Eintrag } from "../services/eintraege";
import { zuteilung } from "../services/pruefung";
import { ladeKassenbuch } from "../services/kassenbuch";
import { eigenerKopf } from "../services/protokoll-suche";
import { ladeTierliste } from "../services/tierliste";
import { ladeVerkaufsliste } from "../services/verkaufsliste";
import {
  angaben,
  briefkopf,
  datumDe,
  design,
  type Design,
  type Doc,
  erzeugePdf,
  fusszeilen,
  GRAU,
  HAARLINIE,
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

type Schau = typeof schau.$inferSelect;

const nr = (e: { katalogNr: number | null; suffix: string }) => formatKatalognummer(e);
const klasse = (e: Eintrag) => `${e.geschlecht} ${e.alter}`;
const tier = (e: Eintrag) => `${klasse(e)}${e.art !== "einzeltier" ? ` · ${MELDEART_LABEL[e.art]}` : ""}`;
// DIN 5008: links 25 mm, rechts 20 mm.
const A4_RAENDER = { top: 14 * MM, bottom: 20 * MM, left: 25 * MM, right: 20 * MM };

/** Vereinsfarbe und Logo aus „Katalog“, damit alle Belege zum Katalog passen. */
async function ladeDesign(s: Schau): Promise<Design> {
  const [g, [logo]] = await Promise.all([
    ladeGestaltung(s.id),
    db.select({ daten: bild.daten }).from(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "logo"))),
  ]);
  return design(g.farbe, logo?.daten ?? null);
}

const verein = (s: Schau) => s.veranstalter || s.name;
const kopfzeile = (s: Schau) => [s.name, s.ort].filter(Boolean).join(" · ");
const fusstext = (s: Schau) => [verein(s), s.kontaktEmail].filter(Boolean).join(" · ");
const breite = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const unten = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/** Beschriftetes Feld mit Rahmen (Bewertungskarte, Kaufbeleg). */
function feld(doc: Doc, d: Design, x: number, y: number, w: number, h: number, titel: string) {
  doc.save().lineWidth(0.5).strokeColor(HAARLINIE).rect(x, y, w, h).stroke().restore();
  doc.font(SANS_FETT).fontSize(6.5).fillColor(d.farbe).text(titel.toLocaleUpperCase("de"), x + 2.2 * MM, y + 1.8 * MM, { width: w - 4 * MM, lineBreak: false, characterSpacing: 0.6 });
  doc.fillColor(TINTE);
}

// ── Bewertungskarten ──────────────────────────────────────────────────────

/**
 * Bewertungskarten im Format des BDRG-Vordrucks: DIN A6 hoch, vier Karten je A4-Bogen – passt in die Kartenhalter am Käfig.
 * Anonym (ohne Ausstellernamen). Bereits erfasste Bewertungen werden eingedruckt, leere Felder bekommen Schreiblinien.
 * Bei v und u.M. (und auf leeren Karten) ein Feld für die Obmann-Unterschrift; unten die Notenlegende.
 */
export async function bewertungskartenPdf(s: Schau, nurPreisrichterId?: number) {
  const [eintraege, einteilung, richter, obmaenner, d] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    db.select().from(preisrichter).where(eq(preisrichter.schauId, s.id)),
    db
      .select({ katalogeintragId: bewertung.katalogeintragId, von: bewertung.obmannBestaetigtVon })
      .from(bewertung)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, bewertung.katalogeintragId))
      .where(and(eq(katalogeintrag.schauId, s.id), isNotNull(bewertung.obmannBestaetigtVon))),
    ladeDesign(s),
  ]);
  const zu = zuteilung(eintraege, einteilung);
  const obmannVon = new Map(obmaenner.map((o) => [o.katalogeintragId, o.von]));
  const karten = eintraege.filter((e) => e.katalogNr != null && (nurPreisrichterId == null || zu.get(e.id) === nurPreisrichterId));
  const skala = skalaVon(s);
  const unterzeile = [s.name, s.ort, s.bewertungAm ? `Bewertung am ${datumDe(s.bewertungAm)}` : ""].filter(Boolean).join(" · ");
  // Legende wie auf dem Vordruck: „97 v · 96 hv · 95–93 sg …“
  const legende = [
    ...(skala ?? STANDARD_NOTENSKALA).map((n) => {
      const p = [...n.punkte].sort((x, y) => y - x);
      return `${p.length > 1 ? `${p[0]}–${p[p.length - 1]}` : p[0]} ${n.kuerzel}`;
    }),
    "0 u",
    "o.B. · u.M. · n.a.",
  ].join(" · ");
  return erzeugePdf(
    `Bewertungskarten ${s.name}`,
    (doc) => {
      const kw = doc.page.width / 2;
      const kh = doc.page.height / 2;
      const schnitt = () => {
        doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(2, { space: 2.5 });
        doc.moveTo(kw, 0).lineTo(kw, doc.page.height).stroke();
        doc.moveTo(0, kh).lineTo(doc.page.width, kh).stroke();
        doc.undash().restore();
      };
      karten.forEach((e, i) => {
        if (i > 0 && i % 4 === 0) doc.addPage();
        if (i % 4 === 0) schnitt();
        karte(doc, e, (i % 2) * kw, Math.floor((i % 4) / 2) * kh, kw, kh);
      });
      if (karten.length === 0) doc.font(SANS).fontSize(10).text("Keine Tiere mit Katalognummer.", 20 * MM, 20 * MM);
    },
    { margin: 0 },
  );

  function karte(doc: Doc, e: Eintrag, x0: number, y0: number, w: number, h: number) {
    const m = 6 * MM;
    const x = x0 + m;
    const b = w - 2 * m;
    let y = y0 + m;
    // Kopf: links Karte und Schau, rechts die Katalognummer groß im Farbfeld.
    const nrB = 25 * MM;
    const nrH = 14 * MM;
    kicker(doc, "Bewertungskarte", x, y, d.farbe, b - nrB);
    doc.font(SANS).fontSize(6.5).fillColor(GRAU).text(unterzeile, x, y + 9, { width: b - nrB - 2 * MM, height: 19, ellipsis: true });
    doc.save().rect(x + b - nrB, y - 1, nrB, nrH).fill(d.flaeche).restore();
    doc.font(SANS_FETT).fontSize(5.5).fillColor("#ffffff").text("KATALOG-NR.", x + b - nrB, y + 0.8 * MM, { width: nrB, align: "center", characterSpacing: 0.6 });
    textImFeld(doc, nr(e), x + b - nrB + 1.5 * MM, y + 3.8 * MM, { breite: nrB - 3 * MM, groesse: 22, min: 12, schrift: SANS_FETT, farbe: "#ffffff", align: "center" });
    y += nrH + 2 * MM;
    // Tier: Rasse und Farbenschlag, darunter Klasse und ggf. Käfig.
    textImFeld(doc, e.bezeichnung, x, y, { breite: b, groesse: 12, min: 8, schrift: SERIF, farbe: TINTE });
    y += 6 * MM;
    const kaefig = e.kaefig && e.kaefig !== String(e.katalogNr) ? `Käfig ${e.kaefig}` : "";
    doc.font(SANS_FETT).fontSize(8.5).fillColor(d.farbe).text(tier(e), x, y, { lineBreak: false });
    if (kaefig) doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(kaefig, x, y, { width: b, align: "right", lineBreak: false });
    y += 5 * MM;
    // Ring-Nr.: eingedruckt oder zum Eintragen.
    doc.font(SANS_FETT).fontSize(6).fillColor(d.farbe).text("RING-NR.", x, y + 1.2, { lineBreak: false, characterSpacing: 0.6 });
    if (e.ringnummern) doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(e.ringnummern, x + 13 * MM, y, { width: b - 13 * MM, lineBreak: false, ellipsis: true });
    doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(x + 13 * MM, y + 9).lineTo(x + b, y + 9).stroke().restore();
    y += 5 * MM;

    // Vorzüge, Wünsche, Mängel als gerahmte Felder.
    const pr = richter.find((r) => r.id === zu.get(e.id));
    const wert = { punkte: e.punkte, sondernote: e.sondernote };
    const mitObmann = !e.bewertet || brauchtObmann(wert, skala);
    const fussY = y0 + h - m - 4 * MM - 26 * MM; // Note-Zeile + Unterschriften + Legende
    const hakenH = 4.5 * MM;
    const texte: [string, string | null][] = [
      ["Vorzüge", e.vorzuege],
      ["Wünsche", e.wuensche],
      ["Mängel", e.maengel],
    ];
    // Höhe nach Bedarf verteilen: langer Text bekommt mehr Platz, leere Felder behalten zwei Schreiblinien.
    const verfuegbar = fussY - hakenH - y;
    const rand = 6.5 * MM;
    doc.font(SANS).fontSize(7.5);
    const bedarf = texte.map(([, t]) => (t ? Math.max(11 * MM, doc.heightOfString(t, { width: b - 4 * MM }) + rand) : 14 * MM));
    const summe = bedarf.reduce((n, v) => n + v, 0);
    const hoehen = summe <= verfuegbar ? bedarf.map((v) => v + (verfuegbar - summe) / 3) : bedarf.map((v) => (v / summe) * verfuegbar);
    let fy0 = y;
    texte.forEach(([titel, text], f) => {
      const fh = hoehen[f]!;
      const fy = fy0;
      fy0 += fh;
      feld(doc, d, x, fy, b, fh - 1.2 * MM, titel);
      if (text) textImFeld(doc, text, x + 2 * MM, fy + 4.6 * MM, { breite: b - 4 * MM, hoehe: fh - rand, groesse: 9, min: 6, schrift: SANS, farbe: TINTE });
      // Schreiblinien nur in leeren Feldern, sonst streichen sie den eingedruckten Text durch.
      else
        for (let ly = fy + 9 * MM; ly < fy + fh - 2.5 * MM; ly += 5.5 * MM)
          doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x + 2 * MM, ly).lineTo(x + b - 2 * MM, ly).stroke().restore();
    });
    // Ankreuzfeld wie auf dem Vordruck.
    const hy = fy0 - 0.4 * MM;
    doc.save().lineWidth(0.5).strokeColor(TINTE).rect(x, hy, 2.6 * MM, 2.6 * MM).stroke().restore();
    doc.font(SANS).fontSize(6.5).fillColor(TINTE).text("Ausschließende Mängel in Kondition und/oder Pflege", x + 4 * MM, hy + 0.3 * MM, { width: b - 4 * MM, lineBreak: false });

    // Note | Punkte | Preis.
    let fy = fussY;
    const zellen: [string, string, number][] = (() => {
      const t = e.bewertet ? bewertungsText(wert, skala) : "";
      const m2 = /^(\d+) (.+)$/.exec(t);
      return [
        ["Note", m2 ? m2[2]! : t, 0.34],
        ["Punkte", m2 ? m2[1]! : "", 0.3],
        ["Preis", e.preise.map((p) => p.kuerzel).join(" "), 0.36],
      ];
    })();
    let zx = x;
    zellen.forEach(([titel, wertText, anteil], i) => {
      const zb = b * anteil - (i < 2 ? 1.2 * MM : 0);
      feld(doc, d, zx, fy, zb, 11 * MM, titel);
      if (wertText) textImFeld(doc, wertText, zx + 2 * MM, fy + 4 * MM, { breite: zb - 4 * MM, groesse: 15, min: 8, schrift: SANS_FETT, farbe: titel === "Preis" ? d.farbe : TINTE });
      zx += b * anteil;
    });
    fy += 11 * MM + 3.5 * MM;
    // Unterschriften: Preisrichter (Name/Stempel), bei Bedarf Obmann.
    const ub = mitObmann ? (b - 4 * MM) / 2 : b;
    unterschrift(doc, x, fy + 8 * MM, ub, "Unterschrift Preisrichter", pr?.name ?? "");
    if (mitObmann) {
      const ob = richter.find((r) => r.id === obmannVon.get(e.id));
      unterschrift(doc, x + ub + 4 * MM, fy + 8 * MM, ub, e.bewertet ? "Unterschrift Obmann" : "Unterschrift Obmann (nur bei v und u.M.)", ob?.name ?? "");
    }
    // Legende unten.
    doc.font(SANS).fontSize(5.8).fillColor(GRAU).text(legende, x, y0 + h - m - 1.5 * MM, { width: b, align: "center", lineBreak: false, ellipsis: true });
    doc.fillColor(TINTE);
  }
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
 * B-Bogen (Meldebestätigung mit Katalognummern) im Format eines Geschäftsbriefs nach DIN 5008 (Form B):
 * Anschrift im Fenster, Falz- und Lochmarken – passt in einen DL-Fensterumschlag. Danach die Ringkarten.
 */
export async function ausstellerUnterlagenPdf(s: Schau, meldungIds: number[]) {
  const [alle, meldungen, d] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db
      .select({ m: meldung, a: aussteller })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(eq(meldung.schauId, s.id))
      .orderBy(asc(aussteller.nachname), asc(aussteller.vorname)),
    ladeDesign(s),
  ]);
  const auswahl = meldungen.filter((x) => meldungIds.includes(x.m.id) && x.m.status === "bestaetigt");
  const betraege = await Promise.all(auswahl.map((x) => meldebetrag(db, x.m.id)));
  const heute = datumDe(new Date());

  return erzeugePdf(
    `Ausstellerunterlagen ${s.name}`,
    (doc) => {
      auswahl.forEach(({ m, a }, i) => {
        if (i > 0) doc.addPage();
        const tiere = alle.filter((e) => e.meldungId === m.id && e.katalogNr != null);
        bBogen(doc, m, a, tiere, betraege[i]!);
        ringkarten(doc, a, tiere);
      });
      if (auswahl.length === 0) doc.font(SANS).fontSize(10).text("Keine bestätigten Meldungen ausgewählt.");
      fusszeilen(doc, fusstext(s));
    },
    { margins: A4_RAENDER },
  );

  function falzmarken(doc: Doc) {
    // DIN 5008: Falzmarken bei 105 und 210 mm, Lochmarke bei 148,5 mm.
    for (const [y, l] of [
      [105, 4],
      [148.5, 6],
      [210, 4],
    ] as const)
      doc.save().lineWidth(0.4).strokeColor(GRAU).moveTo(5 * MM, y * MM).lineTo((5 + l) * MM, y * MM).stroke().restore();
  }

  function bBogen(doc: Doc, m: typeof meldung.$inferSelect, a: typeof aussteller.$inferSelect, tiere: Eintrag[], b: { summeCent: number; bezahltCent: number; stiftungCent?: number }) {
    const x = doc.page.margins.left;
    const w = breite(doc);
    // Briefkopf oben (bis 45 mm), dann das Anschriftfeld 85 × 45 mm.
    let ty = 12 * MM;
    let tx = x;
    const logo = logoBild(doc, d);
    if (logo) {
      doc.image(logo, x, ty, { fit: [14 * MM, 14 * MM] });
      tx = x + 17.5 * MM;
    }
    doc.font(SANS_FETT).fontSize(11).fillColor(TINTE).text(verein(s), tx, ty + 1.5 * MM, { width: w - (tx - x) });
    doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(kopfzeile(s), tx, doc.y + 0.5, { width: w - (tx - x) });
    doc.save().rect(x, 30 * MM, w, 1.2).fill(d.flaeche).restore();
    falzmarken(doc);
    // Anschriftfeld nach DIN 5008 Form B: 85 × 45 mm, 20 mm von links, 45 mm von oben;
    // oben die Zusatz- und Vermerkzone (Rücksendeangabe), darunter ab 62,7 mm die Anschrift.
    const ax = 20 * MM;
    doc.font(SANS).fontSize(7).fillColor(GRAU).text(verein(s), ax, 54 * MM, { width: 85 * MM, underline: true, lineBreak: false, ellipsis: true });
    doc.font(SANS).fontSize(10.5).fillColor(TINTE).text([`${a.vorname} ${a.nachname}`, a.strasse, `${a.plz} ${a.ort}`.trim()].filter(Boolean).join("\n"), ax, 63.5 * MM, { width: 85 * MM, lineGap: 1 });
    // Informationsblock ab 125 mm von links, 75 mm breit.
    const ix = 125 * MM;
    angaben(
      doc,
      [
        ["Meldung", `Nr. ${m.id}`],
        ["Registriernummer", a.registriernummer || "–"],
        ["Verein", a.verein || "–"],
        ["Datum", heute],
      ],
      ix,
      50 * MM,
      doc.page.width - doc.page.margins.right - ix,
      0.45,
      8.5,
    );
    // Betreff und Text.
    doc.y = 100 * MM;
    kicker(doc, "Meldebestätigung · B-Bogen", x, doc.y, d.farbe, w);
    doc.font(SERIF).fontSize(17).fillColor(TINTE).text(s.name, x, doc.y + 11, { width: w });
    doc.font(SANS).fontSize(9.5).fillColor(TINTE).text(
      `Guten Tag ${a.vorname} ${a.nachname}, Ihre Meldung ist bestätigt. Ihre Tiere haben diese Katalog- und Käfignummern:`,
      x,
      doc.y + 4,
      { width: w },
    );
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
    const hinweise = [
      "Bringen Sie zur Einlieferung den gültigen Impfnachweis Ihrer Tiere mit.",
      "Die Ringkarten auf den folgenden Seiten ausgefüllt und unterschrieben abgeben – je Tier zwei gleiche Abschnitte.",
      "Nur Tiere mit Katalognummer werden angenommen.",
    ];
    doc.font(SANS).fontSize(8.5);
    if (y + 30 * MM > unten(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    hinweisKasten(doc, d, "Zur Einlieferung", hinweise, x, y, w);
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
/** Zahlart auf dem Kaufbeleg. */
const ZAHLART_KAUF: Record<string, string> = {
  bar: "Kaufpreis bar bezahlt",
  karte: "Kaufpreis per Karte bezahlt",
  ueberweisung: "Kaufpreis per Überweisung (vereinbart)",
  sonstige: "Kaufpreis unbar bezahlt",
};

export async function abrechnungPdf(s: Schau, ausstellerId?: number, quittungNr?: number, stand?: Awaited<ReturnType<typeof abrechnungListe>>[number]) {
  // Für eine Quittung nur die Zeile dieses Ausstellers rechnen (SEPA-Buchung legt viele Quittungen auf einmal ab);
  // mit festgehaltenem Stand genau diesen (Beleg = Stand der Buchung).
  const [zeilen, d] = await Promise.all([
    stand && stand.ausstellerId === ausstellerId ? [stand] : abrechnungListe(s.id, db, ausstellerId != null ? { nurAusstellerId: ausstellerId } : {}),
    ladeDesign(s),
  ]);
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
        verein: verein(s),
        zeile: kopfzeile(s),
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
      fusszeilen(doc, fusstext(s));
    },
    { margins: A4_RAENDER },
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

// ── Kaufbeleg ────────────────────────────────────────────────────────────

/**
 * Kaufbeleg A5 quer: links der Beleg für den Käufer, rechts ein Ausgabeschein zum Abtrennen.
 * Das Tier wird nur gegen den Ausgabeschein herausgegeben.
 */
export async function kaufbelegPdf(s: Schau, verkaufId: number) {
  const [[v], d] = await Promise.all([db.select().from(verkauf).where(eq(verkauf.id, verkaufId)), ladeDesign(s)]);
  const e = v ? (await ladeEintraege(s.id)).find((x) => x.id === v.katalogeintragId) : undefined;
  // Registriernummern von Herkunfts- und Bestimmungsbetrieb gehören auf den Beleg (Tierseuchenrecht).
  const [verkaeufer] = e ? await db.select({ registriernummer: aussteller.registriernummer }).from(aussteller).where(eq(aussteller.id, e.ausstellerId)) : [];
  return erzeugePdf(
    v ? `Kaufbeleg ${v.belegNr}` : "Kaufbeleg",
    (doc) => {
      if (!v || !e) {
        doc.font(SANS).fontSize(10).text("Verkauf nicht gefunden.", 12 * MM, 12 * MM);
        return;
      }
      const W = doc.page.width;
      const H = doc.page.height;
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
    },
    { size: "A5", layout: "landscape", margin: 0 },
  );
}

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
 * Entnahme (A5 quer). Wird beim Buchen archiviert; null, wenn die Buchung nicht zur Schau gehört.
 */
export async function kassenbelegPdf(s: Schau, art: "einzahlung" | "eigenbeleg", nummer: number) {
  const d = await ladeDesign(s);
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
      ["Zahlart", z.z.art === "bar" ? "bar" : z.z.art === "ueberweisung" ? "Überweisung" : z.z.art === "karte" ? "Karte" : "sonstige"],
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
  return erzeugePdf(
    titel,
    (doc) => {
      const x = doc.page.margins.left;
      const w = breite(doc);
      briefkopf(doc, d, { verein: verein(s), zeile: kopfzeile(s), art: "Kassenbeleg", titel, angaben: zeilen.slice(0, 2) });
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
      unterschrift(doc, x, doc.page.height - doc.page.margins.bottom - 4 * MM, sb, "Unterschrift Kasse");
      unterschrift(doc, x + sb + 5 * MM, doc.page.height - doc.page.margins.bottom - 4 * MM, sb, art === "einzahlung" ? "Unterschrift Aussteller" : "Unterschrift Zeuge");
    },
    { size: "A5", layout: "landscape", margin: 12 * MM },
  );
}
