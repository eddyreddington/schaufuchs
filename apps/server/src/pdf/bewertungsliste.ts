/**
 * Bewertungsliste je Preisrichter (zum Mitnehmen in die Käfigreihe) wie die Papiervorlage: zwei Listen nebeneinander
 * je A4-Seite, laufend (Formatvorgabe A5: eine Liste je Seite, Entscheidung 029); Zwischenköpfe je Rasse und Farbenschlag; je Tier Spalten für Note und Punkte zum Eintragen;
 * Obmann im Kopf; Seitenzählung. Ohne Ausstellernamen (Entscheidung 005). Gliederung und Spalten rechnet
 * packages/domain/src/preisrichter-druck.ts.
 */
import { bewertungslisteBlatt, bewertungslisteSpalten, bewertungslisteZeilen, druckFormateLesen, type ListenSpalten, type ListenZeile } from "@schau/domain";

type ListenBlatt = ReturnType<typeof bewertungslisteBlatt>;
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { prEinteilung, preisrichter } from "../db/schema";
import { ladeEintraege, type Eintrag } from "../services/eintraege";
import { zuteilung } from "../services/pruefung";
import { briefkopf, datumDe, type Doc, erzeugePdf, fusszeilen, GRAU, HAARLINIE, MM, SANS, SANS_FETT, textImFeld, TINTE } from "./basis";
import { kopfzeile, ladeDesign, nr, type Schau, tier, unten, verein } from "./dokumente-gemeinsam";

/** Höhe des Spaltenkopfs und der Zeilen (Tierzeile mit Platz zum Eintragen von Hand). */
const SPALTENKOPF = 6 * MM;
const HOEHE = { rasse: 6.5 * MM, farbe: 5.5 * MM, tier: 6.5 * MM } as const;

type Tier = Eintrag & { rasse: string; farbenschlag: string };

/** Rasse und Farbenschlag für die Zwischenköpfe; freie Bezeichnung unter der gewählten Rasse, Zusatz (AOC …) beim Farbenschlag. */
function alsTier(e: Eintrag): Tier {
  const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
  const farbe = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
  return { ...e, rasse: e.rasse ?? e.einordnungRasse ?? "ohne Rasse", farbenschlag: zusatz ? `${farbe} (${zusatz})`.trim() : farbe };
}

/** Bewertungsliste für einen Preisrichter der Schau; ein fremder oder unbekannter ergibt ein Blatt „Preisrichter nicht gefunden“. */
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
  const [obmann] = pr?.obmannId != null ? await db.select({ name: preisrichter.name }).from(preisrichter).where(and(eq(preisrichter.id, pr.obmannId), eq(preisrichter.schauId, s.id))) : [];
  const zu = zuteilung(eintraege, einteilung);
  const meine = pr ? eintraege.filter((e) => zu.get(e.id) === pr.id).map(alsTier) : [];
  const blatt = bewertungslisteBlatt(druckFormateLesen(s.druckFormate).bewertungsliste);
  const bereiche = pr ? einteilung.filter((x) => x.preisrichterId === pr.id).map((x) => (x.vonNr === x.bisNr ? `${x.vonNr}` : `${x.vonNr}–${x.bisNr}`)).join(", ") : "";
  return erzeugePdf(
    `Bewertungsliste ${pr?.name ?? ""}`,
    (doc) => {
      briefkopf(doc, d, {
        verein: verein(s),
        zeile: kopfzeile(s),
        art: "Bewertungsliste",
        titel: pr?.name ?? "Preisrichter nicht gefunden",
        angabenBreite: blatt.kopfAngaben * MM,
        titelGroesse: blatt.kopfTitel,
        unter: pr ? "Zum Eintragen in der Käfigreihe – maßgeblich ist die Bewertungskarte." : undefined,
        angaben: pr
          ? [
              ["Bewertung", datumDe(s.bewertungAm) || "–"],
              // Leer, wenn kein Obmann zugeordnet ist – dann zum Eintragen.
              ["Obmann", obmann?.name ?? ""],
              ["Nummern", bereiche || "–"],
              ["Tiere", String(meine.length)],
            ]
          : [],
      });
      if (!pr) return;
      if (!meine.length) doc.font(SANS).fontSize(9).fillColor(GRAU).text("Keine Tiere zugeteilt.").fillColor(TINTE);
      else listen(doc, d.flaeche, d.farbe, meine, blatt);
      fusszeilen(doc, `Bewertungsliste ${pr.name} · ${s.name}`);
    },
    {
      size: [blatt.seite.breite * MM, blatt.seite.hoehe * MM],
      // Schmale Ränder: zwei Listen nebeneinander brauchen die Breite (gelocht wird links); Maße aus der Domain.
      margins: { top: blatt.raender.oben * MM, bottom: blatt.raender.unten * MM, left: blatt.raender.links * MM, right: blatt.raender.rechts * MM },
    },
  );
}

/** Die Zeilen laufend in Listen nebeneinander (A4: links, rechts, nächste Seite links …; A5: eine je Seite). */
function listen(doc: Doc, flaeche: string, farbe: string, tiere: Tier[], blatt: ListenBlatt) {
  const x0 = doc.page.margins.left;
  const jeSeite = blatt.listenJeSeite;
  const LUECKE = blatt.luecke * MM;
  // Spalten in Punkt; die Breite einer Liste ist ihre Summe (bewertungslisteBlatt rechnet sie aus der Seite).
  const b = Object.fromEntries(Object.entries(blatt.spalten).map(([k, v]) => [k, v * MM])) as unknown as ListenSpalten;
  const cw = b.nr + b.klasse + b.note + b.pkt + b.preis;
  const ersteOben = doc.y;
  const oben = (i: number) => (i < jeSeite ? ersteOben : doc.page.margins.top);
  const spalten = bewertungslisteSpalten(bewertungslisteZeilen(tiere), (z) => HOEHE[z.art], (i) => unten(doc) - oben(i) - SPALTENKOPF);
  spalten.forEach((zeilen, i) => {
    if (i > 0 && i % jeSeite === 0) doc.addPage();
    const x = x0 + (i % jeSeite) * (cw + LUECKE);
    let y = oben(i);
    // Trennlinie zwischen den beiden Listen.
    if (i % jeSeite > 0) doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(x - LUECKE / 2, y).lineTo(x - LUECKE / 2, unten(doc)).stroke().restore();
    spaltenKopf(doc, b, x, y, cw);
    y += SPALTENKOPF;
    for (const z of zeilen) {
      zeile(doc, b, z, x, y, cw, flaeche, farbe);
      y += HOEHE[z.art];
    }
  });
  doc.x = x0;
  doc.fillColor(TINTE);
}

/** Spaltenkopf einer Liste: Nummer, Klasse, Note, Punkte, Preis (die letzten drei zum Eintragen). */
function spaltenKopf(doc: Doc, b: ListenSpalten, x: number, y: number, cw: number) {
  const titel: [string, number, "left" | "right"][] = [["Nr.", b.nr, "right"], ["Klasse", b.klasse, "left"], ["Note", b.note, "left"], ["Pkt.", b.pkt, "left"], ["Preis", b.preis, "left"]];
  let tx = x;
  doc.font(SANS_FETT).fontSize(7).fillColor(GRAU);
  for (const [t, w, align] of titel) {
    doc.text(t.toLocaleUpperCase("de"), tx + 2, y + 1 * MM, { width: w - 4, align, lineBreak: false, characterSpacing: 0.5 });
    tx += w;
  }
  doc.save().lineWidth(0.7).strokeColor(TINTE).moveTo(x, y + 4.5 * MM).lineTo(x + cw, y + 4.5 * MM).stroke().restore();
  doc.fillColor(TINTE);
}

function zeile(doc: Doc, b: ListenSpalten, z: ListenZeile<Tier>, x: number, y: number, cw: number, flaeche: string, farbe: string) {
  if (z.art !== "tier") {
    const text = z.fortsetzung ? `${z.text} (Forts.)` : z.text;
    if (z.art === "rasse") {
      doc.save().fillOpacity(0.12).rect(x, y + 0.8 * MM, cw, HOEHE.rasse - 1.3 * MM).fill(flaeche).restore();
      textImFeld(doc, text, x + 2 * MM, y + 1.9 * MM, { breite: cw - 4 * MM, groesse: 9, min: 7, schrift: SANS_FETT, farbe: TINTE });
    } else textImFeld(doc, text, x + 4 * MM, y + 1.4 * MM, { breite: cw - 6 * MM, groesse: 8.5, min: 6.5, schrift: SANS_FETT, farbe });
    doc.fillColor(TINTE);
    return;
  }
  const e = z.tier;
  const h = HOEHE.tier;
  textImFeld(doc, nr(e), x + 1, y + 1.6 * MM, { breite: b.nr - 3, groesse: 10, min: 7, schrift: SANS_FETT, farbe: TINTE, align: "right" });
  textImFeld(doc, tier(e), x + b.nr + 2, y + 2 * MM, { breite: b.klasse - 4, groesse: 8.5, min: 6.5, schrift: SANS, farbe: TINTE });
  if (e.status === "fehlt") textImFeld(doc, "fehlt", x + b.nr + b.klasse + 2, y + 2 * MM, { breite: b.note - 4, groesse: 8, schrift: SANS, farbe: GRAU });
  // Kästchen für Note, Punkte und Preis: senkrechte Linien, unten die Linie der Zeile.
  doc.save().lineWidth(0.3).strokeColor(HAARLINIE);
  for (const sx of [b.nr + b.klasse, b.nr + b.klasse + b.note, b.nr + b.klasse + b.note + b.pkt]) doc.moveTo(x + sx, y + 0.8 * MM).lineTo(x + sx, y + h).stroke();
  doc.moveTo(x, y + h).lineTo(x + cw, y + h).stroke().restore();
  doc.fillColor(TINTE);
}
