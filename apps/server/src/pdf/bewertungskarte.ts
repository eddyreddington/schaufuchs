/**
 * Bewertungskarten nach der Druckvorlage der Schau (Format, Bausteine oder Vordruck-Felder, Versatz) – dazu die
 * Vorschau für den Designer und der Probedruck mit Millimeterraster. Die Rechnung (wo liegt was, in mm) steht in
 * packages/domain/src/druckvorlage.ts; hier wird nur gezeichnet.
 */
import {
  bewertungsText,
  bogen,
  brauchtObmann,
  formatKatalognummer,
  kartenLayout,
  kartenMassstab,
  kartenVorlageLesen,
  korrigiert,
  KARTEN_RAND,
  KARTEN_VORGABE,
  MELDEART_LABEL,
  STANDARD_NOTENSKALA,
  type KartenBaustein,
  type KartenVorlage,
  type NotenStufe,
  type VordruckFeldId,
} from "@schau/domain";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { bewertung, druckvorlage, katalogeintrag, preisrichter, prEinteilung, type schau } from "../db/schema";
import { ladeEintraege, skalaVon, type Eintrag } from "../services/eintraege";
import { zuteilung } from "../services/pruefung";
import { datumDe, type Design, type Doc, erzeugePdf, GRAU, HAARLINIE, kicker, MM, SANS, SANS_FETT, SERIF, textImFeld, TINTE, unterschrift } from "./basis";

type Schau = typeof schau.$inferSelect;

/** Alles, was auf einer Karte steht – unabhängig davon, woher es kommt (Schau oder Beispiel für die Vorschau). */
export interface KartenDaten {
  nummer: string;
  bezeichnung: string;
  klasse: string;
  kaefig: string;
  ringnummer: string;
  vorzuege: string;
  wuensche: string;
  maengel: string;
  note: string;
  punkte: string;
  preis: string;
  preisrichter: string;
  obmann: string;
  /** Feld für die Obmann-Unterschrift zeigen (bei v und u.M. sowie auf leeren Karten). */
  mitObmann: boolean;
}

interface KartenKopf {
  /** „Schau · Ort · Bewertung am …“ */
  unterzeile: string;
  /** „97 v · 96 hv · …“ */
  legende: string;
}

/** Vorlage der Schau (oder die Vorgabe, wenn keine gewählt ist). */
export async function ladeKartenVorlage(s: Schau): Promise<KartenVorlage> {
  if (!s.vorlageBewertungskarteId) return KARTEN_VORGABE;
  const [v] = await db.select({ daten: druckvorlage.daten }).from(druckvorlage).where(eq(druckvorlage.id, s.vorlageBewertungskarteId));
  return kartenVorlageLesen(v?.daten);
}

export function kartenKopf(s: Pick<Schau, "name" | "ort" | "bewertungAm">, skala: NotenStufe[] | undefined): KartenKopf {
  const legende = [
    ...(skala ?? STANDARD_NOTENSKALA).map((n) => {
      const p = [...n.punkte].sort((x, y) => y - x);
      return `${p.length > 1 ? `${p[0]}–${p[p.length - 1]}` : p[0]} ${n.kuerzel}`;
    }),
    "0 u",
    "o.B. · u.M. · n.a.",
  ].join(" · ");
  return { unterzeile: [s.name, s.ort, s.bewertungAm ? `Bewertung am ${datumDe(s.bewertungAm)}` : ""].filter(Boolean).join(" · "), legende };
}

/** Bewertungskarten einer Schau (nur bestätigte Tiere mit Katalognummer), optional nur eines Preisrichters. */
export async function bewertungskartenPdf(s: Schau, d: Design, nurPreisrichterId?: number) {
  const [eintraege, einteilung, richter, obmaenner, vorlage] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    db.select().from(preisrichter).where(eq(preisrichter.schauId, s.id)),
    db
      .select({ katalogeintragId: bewertung.katalogeintragId, von: bewertung.obmannBestaetigtVon })
      .from(bewertung)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, bewertung.katalogeintragId))
      .where(and(eq(katalogeintrag.schauId, s.id), isNotNull(bewertung.obmannBestaetigtVon))),
    ladeKartenVorlage(s),
  ]);
  const zu = zuteilung(eintraege, einteilung);
  const obmannVon = new Map(obmaenner.map((o) => [o.katalogeintragId, o.von]));
  const skala = skalaVon(s);
  const name = (id: number | null | undefined) => richter.find((r) => r.id === id)?.name ?? "";
  const karten = eintraege
    .filter((e) => e.katalogNr != null && (nurPreisrichterId == null || zu.get(e.id) === nurPreisrichterId))
    .map((e) => kartenDaten(e, skala, name(zu.get(e.id)), name(obmannVon.get(e.id))));
  return zeichneKartenPdf(`Bewertungskarten ${s.name}`, karten, vorlage, d, kartenKopf(s, skala), "Keine Tiere mit Katalognummer.");
}

function kartenDaten(e: Eintrag, skala: NotenStufe[] | undefined, pr: string, obmann: string): KartenDaten {
  const wert = { punkte: e.punkte, sondernote: e.sondernote };
  const text = e.bewertet ? bewertungsText(wert, skala) : "";
  const m = /^(\d+) (.+)$/.exec(text);
  return {
    nummer: formatKatalognummer(e),
    bezeichnung: e.bezeichnung,
    klasse: `${e.geschlecht} ${e.alter}${e.art !== "einzeltier" ? ` · ${MELDEART_LABEL[e.art]}` : ""}`,
    kaefig: e.kaefig && e.kaefig !== String(e.katalogNr) ? `Käfig ${e.kaefig}` : "",
    ringnummer: e.ringnummern ?? "",
    vorzuege: e.vorzuege ?? "",
    wuensche: e.wuensche ?? "",
    maengel: e.maengel ?? "",
    note: m ? m[2]! : text,
    punkte: m ? m[1]! : "",
    preis: e.preise.map((p) => p.kuerzel).join(" "),
    preisrichter: pr,
    obmann,
    mitObmann: !e.bewertet || brauchtObmann(wert, skala),
  };
}

/** Beispielkarten für die Vorschau im Designer: eine bewertete, eine leere, eine mit langem Text. */
export const BEISPIEL_KARTEN: KartenDaten[] = [
  { nummer: "12", bezeichnung: "Wyandotten, weiß", klasse: "1,0 jung", kaefig: "", ringnummer: "D 26 AB 123", vorzuege: "kräftiger Körper, gute Brustfülle, breiter Rücken", wuensche: "Kopf feiner", maengel: "", note: "sg", punkte: "95", preis: "E", preisrichter: "Max Muster", obmann: "", mitObmann: false },
  { nummer: "13", bezeichnung: "Wyandotten, weiß", klasse: "0,1 jung", kaefig: "Käfig 14", ringnummer: "", vorzuege: "", wuensche: "", maengel: "", note: "", punkte: "", preis: "", preisrichter: "Max Muster", obmann: "", mitObmann: true },
  { nummer: "101a", bezeichnung: "Deutsche Modeneser Gazzi, schwarz", klasse: "1,0 alt", kaefig: "", ringnummer: "DV 0815-25-123", vorzuege: "sehr gute Figur, edle Haltung, feiner Kopf mit gutem Auge, ausgezeichnete Zeichnung", wuensche: "Schwanz geschlossener", maengel: "Schwingen leicht hängend", note: "v", punkte: "97", preis: "BB SE", preisrichter: "Erika Beispiel", obmann: "Hans Probe", mitObmann: true },
];

/** Legt die Karten auf die Bögen der Vorlage und zeichnet sie (eigene Karte oder nur Daten auf einen Vordruck). */
export function zeichneKartenPdf(titel: string, karten: KartenDaten[], v: KartenVorlage, d: Design, kopf: KartenKopf, leer: string) {
  const b = bogen(v.format);
  const farbe = v.farbig ? d.farbe : TINTE;
  const flaeche = v.farbig ? d.flaeche : null;
  return erzeugePdf(
    titel,
    (doc) => {
      const jeBogen = b.nutzen.length;
      karten.forEach((k, i) => {
        if (i > 0 && i % jeBogen === 0) doc.addPage();
        if (i % jeBogen === 0 && v.schnittlinien && v.modus === "eigen") schnittlinien(doc, b.nutzen, v);
        const n = b.nutzen[i % jeBogen]!;
        // Karten-mm → Seitenpunkte, mit Versatz und Längenkorrektur.
        const pt = (x: number, y: number) => {
          const p = korrigiert(n.x + x, n.y + y, v.druck);
          return { x: p.x * MM, y: p.y * MM };
        };
        if (v.modus === "vordruck") vordruck(doc, k, v, pt, kopf);
        else eigeneKarte(doc, k, v, { breite: n.breite, hoehe: n.hoehe }, pt, { farbe, flaeche }, kopf);
      });
      if (karten.length === 0) doc.font(SANS).fontSize(10).fillColor(TINTE).text(leer, 20 * MM, 20 * MM);
    },
    { size: [b.breite * MM, b.hoehe * MM], margin: 0 },
  );
}

function schnittlinien(doc: Doc, nutzen: { x: number; y: number; breite: number; hoehe: number }[], v: KartenVorlage) {
  doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(2, { space: 2.5 });
  for (const n of nutzen) {
    const a = korrigiert(n.x, n.y, v.druck);
    const e = korrigiert(n.x + n.breite, n.y + n.hoehe, v.druck);
    doc.rect(a.x * MM, a.y * MM, (e.x - a.x) * MM, (e.y - a.y) * MM).stroke();
  }
  doc.undash().restore();
}

/** Nur die Daten, jedes Feld an seiner Stelle (mm ab Kartenecke), schwarz – für gekaufte Vordrucke. */
function vordruck(doc: Doc, k: KartenDaten, v: KartenVorlage, pt: (x: number, y: number) => { x: number; y: number }, kopf: KartenKopf) {
  const werte: Record<VordruckFeldId, string> = {
    katalognummer: k.nummer,
    rasse: k.bezeichnung,
    klasse: k.klasse,
    kaefig: k.kaefig,
    ringnummer: k.ringnummer,
    vorzuege: k.vorzuege,
    wuensche: k.wuensche,
    maengel: k.maengel,
    note: k.note,
    punkte: k.punkte,
    preis: k.preis,
    preisrichter: k.preisrichter,
    schau: kopf.unterzeile,
  };
  for (const [id, text] of Object.entries(werte) as [VordruckFeldId, string][]) {
    if (!text) continue;
    const f = v.felder[id];
    const p = pt(f.x, f.y);
    const mehrzeilig = id === "vorzuege" || id === "wuensche" || id === "maengel";
    textImFeld(doc, text, p.x, p.y, { breite: f.breite * MM, hoehe: mehrzeilig ? f.hoehe * MM : undefined, groesse: f.groesse, min: Math.min(6, f.groesse), schrift: id === "katalognummer" || id === "punkte" ? SANS_FETT : SANS, farbe: TINTE });
  }
}

/** Die ganze Karte aus Bausteinen (Reihenfolge und Auswahl aus der Vorlage, Höhen aus kartenLayout). */
function eigeneKarte(
  doc: Doc,
  k: KartenDaten,
  v: KartenVorlage,
  karte: { breite: number; hoehe: number },
  pt: (x: number, y: number) => { x: number; y: number },
  f: { farbe: string; flaeche: string | null },
  kopf: KartenKopf,
) {
  const m = kartenMassstab(karte.breite, v.groesse);
  const rand = KARTEN_RAND * (karte.breite / 105);
  const b = (karte.breite - 2 * rand) * MM;
  const feld = (x: number, y: number, w: number, h: number, titel: string) => {
    doc.save().lineWidth(0.5).strokeColor(HAARLINIE).rect(x, y, w, h).stroke().restore();
    doc.font(SANS_FETT).fontSize(6.5 * m).fillColor(f.farbe).text(titel.toLocaleUpperCase("de"), x + 2.2 * MM, y + 1.8 * MM, { width: w - 4 * MM, lineBreak: false, characterSpacing: 0.6 });
    doc.fillColor(TINTE);
  };
  const zeichne: Record<KartenBaustein, (x: number, y: number, h: number) => void> = {
    kopf: (x, y) => {
      const nrB = 25 * MM * m;
      const nrH = 14 * MM * m;
      kicker(doc, "Bewertungskarte", x, y, f.farbe, b - nrB);
      doc.font(SANS).fontSize(6.5 * m).fillColor(GRAU).text(kopf.unterzeile, x, y + 9 * m, { width: b - nrB - 2 * MM, height: 19 * m, ellipsis: true });
      if (f.flaeche) doc.save().rect(x + b - nrB, y - 1, nrB, nrH).fill(f.flaeche).restore();
      else doc.save().lineWidth(0.8).strokeColor(TINTE).rect(x + b - nrB, y - 1, nrB, nrH).stroke().restore();
      const schrift = f.flaeche ? "#ffffff" : TINTE;
      doc.font(SANS_FETT).fontSize(5.5 * m).fillColor(schrift).text("KATALOG-NR.", x + b - nrB, y + 0.8 * MM * m, { width: nrB, align: "center", characterSpacing: 0.6 });
      textImFeld(doc, k.nummer, x + b - nrB + 1.5 * MM, y + 3.8 * MM * m, { breite: nrB - 3 * MM, groesse: 22 * m, min: 12, schrift: SANS_FETT, farbe: schrift, align: "center" });
    },
    tier: (x, y) => textImFeld(doc, k.bezeichnung, x, y, { breite: b, groesse: 12 * m, min: 8, schrift: SERIF, farbe: TINTE }),
    klasse: (x, y) => {
      doc.font(SANS_FETT).fontSize(8.5 * m).fillColor(f.farbe).text(k.klasse, x, y, { lineBreak: false });
      if (k.kaefig) doc.font(SANS).fontSize(8.5 * m).fillColor(GRAU).text(k.kaefig, x, y, { width: b, align: "right", lineBreak: false });
    },
    ringnummer: (x, y) => {
      const lx = 13 * MM * m;
      doc.font(SANS_FETT).fontSize(6 * m).fillColor(f.farbe).text("RING-NR.", x, y + 1.2, { lineBreak: false, characterSpacing: 0.6 });
      if (k.ringnummer) doc.font(SANS).fontSize(8.5 * m).fillColor(TINTE).text(k.ringnummer, x + lx, y, { width: b - lx, lineBreak: false, ellipsis: true });
      doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(x + lx, y + 9 * m).lineTo(x + b, y + 9 * m).stroke().restore();
    },
    texte: (x, y, h) => {
      // Höhe nach Bedarf verteilen: langer Text bekommt mehr Platz, leere Felder behalten Schreiblinien.
      const texte: [string, string][] = [["Vorzüge", k.vorzuege], ["Wünsche", k.wuensche], ["Mängel", k.maengel]];
      const innen = 6.5 * MM * m;
      doc.font(SANS).fontSize(7.5 * m);
      const bedarf = texte.map(([, t]) => (t ? Math.max(11 * MM * m, doc.heightOfString(t, { width: b - 4 * MM }) + innen) : 14 * MM * m));
      const summe = bedarf.reduce((n, w) => n + w, 0);
      const hoehen = summe <= h ? bedarf.map((w) => w + (h - summe) / 3) : bedarf.map((w) => (w / summe) * h);
      let fy = y;
      texte.forEach(([titel, text], i) => {
        const fh = hoehen[i]!;
        feld(x, fy, b, fh - 1.2 * MM, titel);
        if (text) textImFeld(doc, text, x + 2 * MM, fy + 4.6 * MM * m, { breite: b - 4 * MM, hoehe: fh - innen, groesse: 9 * m, min: 6, schrift: SANS, farbe: TINTE });
        else for (let ly = fy + 9 * MM * m; ly < fy + fh - 2.5 * MM; ly += 5.5 * MM * m) doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x + 2 * MM, ly).lineTo(x + b - 2 * MM, ly).stroke().restore();
        fy += fh;
      });
    },
    ankreuzfeld: (x, y) => {
      const k2 = 2.6 * MM * m;
      doc.save().lineWidth(0.5).strokeColor(TINTE).rect(x, y + 0.4 * MM, k2, k2).stroke().restore();
      doc.font(SANS).fontSize(6.5 * m).fillColor(TINTE).text("Ausschließende Mängel in Kondition und/oder Pflege", x + k2 + 1.4 * MM, y + 0.7 * MM, { width: b - k2 - 1.4 * MM, lineBreak: false });
    },
    note: (x, y) => {
      const zellen: [string, string, number][] = [["Note", k.note, 0.34], ["Punkte", k.punkte, 0.3], ["Preis", k.preis, 0.36]];
      let zx = x;
      zellen.forEach(([titel, wert, anteil], i) => {
        const zb = b * anteil - (i < 2 ? 1.2 * MM : 0);
        feld(zx, y, zb, 11 * MM * m, titel);
        if (wert) textImFeld(doc, wert, zx + 2 * MM, y + 4 * MM * m, { breite: zb - 4 * MM, groesse: 15 * m, min: 8, schrift: SANS_FETT, farbe: titel === "Preis" ? f.farbe : TINTE });
        zx += b * anteil;
      });
    },
    unterschriften: (x, y) => {
      const ub = k.mitObmann ? (b - 4 * MM) / 2 : b;
      unterschrift(doc, x, y + 8 * MM * m, ub, "Unterschrift Preisrichter", k.preisrichter);
      if (k.mitObmann) unterschrift(doc, x + ub + 4 * MM, y + 8 * MM * m, ub, k.note ? "Unterschrift Obmann" : "Unterschrift Obmann (nur bei v und u.M.)", k.obmann);
    },
    legende: (x, y) => doc.font(SANS).fontSize(5.8 * m).fillColor(GRAU).text(kopf.legende, x, y + 0.5 * MM, { width: b, align: "center", lineBreak: false, ellipsis: true }),
    fusstext: (x, y) => doc.font(SANS).fontSize(6.5 * m).fillColor(GRAU).text(v.fusstext, x, y + 0.5 * MM, { width: b, align: "center", lineBreak: false, ellipsis: true }),
  };
  for (const teil of kartenLayout(v, karte)) {
    const p = pt(rand, teil.y);
    zeichne[teil.id](p.x, p.y, teil.hoehe * MM);
  }
  doc.fillColor(TINTE);
}

/** Probedruck: Millimeterraster, Kartengrenzen mit Fadenkreuz und die Werte der Vorlage – zum Nachmessen am Drucker. */
export function probedruckPdf(v: KartenVorlage) {
  const b = bogen(v.format);
  return erzeugePdf(
    "Probedruck Bewertungskarten",
    (doc) => {
      const p = (x: number, y: number) => {
        const k = korrigiert(x, y, v.druck);
        return { x: k.x * MM, y: k.y * MM };
      };
      for (let x = 0; x <= b.breite; x += 5) {
        const a = p(x, 0);
        const e = p(x, b.hoehe);
        doc.save().lineWidth(x % 10 === 0 ? 0.4 : 0.15).strokeColor(x % 50 === 0 ? "#666666" : "#bbbbbb").moveTo(a.x, a.y).lineTo(e.x, e.y).stroke().restore();
      }
      for (let y = 0; y <= b.hoehe; y += 5) {
        const a = p(0, y);
        const e = p(b.breite, y);
        doc.save().lineWidth(y % 10 === 0 ? 0.4 : 0.15).strokeColor(y % 50 === 0 ? "#666666" : "#bbbbbb").moveTo(a.x, a.y).lineTo(e.x, e.y).stroke().restore();
        if (y % 50 === 0 && y > 0) doc.font(SANS).fontSize(6).fillColor(TINTE).text(`${y} mm`, a.x + 1 * MM, a.y - 7, { lineBreak: false });
      }
      for (const n of b.nutzen) {
        for (const [x, y] of [[n.x, n.y], [n.x + n.breite, n.y], [n.x, n.y + n.hoehe], [n.x + n.breite, n.y + n.hoehe]] as const) {
          const c = p(x, y);
          doc.save().lineWidth(0.8).strokeColor("#b42318").moveTo(c.x - 4 * MM, c.y).lineTo(c.x + 4 * MM, c.y).moveTo(c.x, c.y - 4 * MM).lineTo(c.x, c.y + 4 * MM).stroke().restore();
        }
      }
      const t = p(15, 15);
      doc.font(SANS_FETT).fontSize(9).fillColor(TINTE).text("Probedruck Bewertungskarten", t.x, t.y, { lineBreak: false });
      doc.font(SANS).fontSize(8).text(
        [
          `Bogen ${fmt(b.breite)} × ${fmt(b.hoehe)} mm, ${b.nutzen.length} Karte(n) je Bogen`,
          `Versatz ${fmt(v.druck.versatzX)} mm waagerecht, ${fmt(v.druck.versatzY)} mm senkrecht, Längenkorrektur ${fmt(v.druck.laengenKorrektur)} %`,
          "Rote Kreuze: Kartenecken. Mit dem Lineal nachmessen und Abweichungen in der Vorlage eintragen.",
        ].join("\n"),
        t.x,
        t.y + 13,
        { width: 160 * MM },
      );
    },
    { size: [b.breite * MM, b.hoehe * MM], margin: 0 },
  );
}

const fmt = (z: number) => z.toLocaleString("de-DE", { maximumFractionDigits: 1 });
