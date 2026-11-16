/**
 * Katalog-PDF, Grundlage für alle Teile: lädt die Daten der Schau, legt das PDF an und stellt die gemeinsamen
 * Satzhilfen bereit (Seiten, Inhaltsverzeichnis, Gliederung, Seitentitel, Absätze, Angabenlisten, Stiche).
 */
import { bewertungsText, gruppenAbteilung, KATALOG_LINIEN_INFO, type KatalogGliederungsTeil, type KatalogSeitenbereich, STANDARD_NOTENSKALA } from "@schau/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../db/client";
import { bild, katalogBeitrag, prEinteilung, preisart, preisrichter, rassebild, type schau, stiftung } from "../db/schema";
import { bildMasse, type KatalogVorschau, ladeGestaltung, pngLesbar } from "../routers/katalog-gestaltung";
import { type GeoeffnetesBild } from "../services/rassebild";
import { type Eintrag, ladeEintraege, skalaVon, verdeckeNamen } from "../services/eintraege";
import { ladeVereinsangaben } from "../services/datenschutz";
import { zuteilung } from "../services/pruefung";
import { spenderFuerKatalog } from "../services/spenden";
import { GRAU, HAARLINIE, kontrast, lesbareFarbe, MM, registriereSchriften, SANS, SANS_FETT, SANS_KURSIV, SERIF, SERIF_FETT, TINTE } from "./basis";
import { type Stich, stichBild } from "./illustrationen";
import { kurzauswahl } from "./katalog-hilfen";

export type Schau = typeof schau.$inferSelect;
export type Beitrag = typeof katalogBeitrag.$inferSelect;

/** Seiteninfos für Kopf- und Fußzeilen, die erst am Ende gesetzt werden. */
export interface Seite {
  kopf?: string;
  ohneFuss?: boolean;
}

/** Abschnitte für das Inhaltsverzeichnis. */
export interface Inhalt {
  titel: string;
  seite: number;
  ebene: 0 | 1;
}

/** Optionen von `katalogPdf` (siehe dort). */
export type KatalogOptionen = { online?: boolean; vorschau?: KatalogVorschau; kurz?: boolean; gliederung?: (bereiche: KatalogSeitenbereich[]) => void };

/** Daten laden, PDF anlegen, Satzhilfen bauen – alles, was die Teile des Katalogs gemeinsam brauchen. */
export async function katalogKontext(s: Schau, opts: KatalogOptionen) {
  const [roh, gespeichert, beitraege, bilder, richter, einteilung, preisarten, stiftungen, spender] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    ladeGestaltung(s.id),
    db.select().from(katalogBeitrag).where(eq(katalogBeitrag.schauId, s.id)).orderBy(asc(katalogBeitrag.folge), asc(katalogBeitrag.id)),
    // Beschädigte PNG fehlen im Katalog (siehe pngLesbar) – sonst würde er nie fertig.
    db
      .select()
      .from(bild)
      .where(eq(bild.schauId, s.id))
      .then((liste) => liste.filter((b) => !bildMasse(b.daten)?.entpacken || pngLesbar(b.daten, 512 * 1024 * 1024))),
    db.select().from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)).orderBy(asc(prEinteilung.vonNr)),
    db.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge), asc(preisart.id)),
    db.select().from(stiftung).where(eq(stiftung.schauId, s.id)).orderBy(asc(stiftung.stifter)),
    // Spender nur im gedruckten Katalog: ihre Einwilligung gilt dem Katalog, nicht dem Internet.
    opts.online ? Promise.resolve([] as string[]) : spenderFuerKatalog(s.id),
  ]);
  // Namen nur mit Zustimmung: gedruckt mit unterschriebenem Meldebogen, im Internet zusätzlich mit Online-Einwilligung.
  const alle = verdeckeNamen(roh, opts.online ? "online" : "druck");
  const eintraege = alle.filter((e) => e.katalogNr != null);
  // Tierteil, Rassebilder und Ausstellerverzeichnis; Kennzahlen, Preisrichter und Ehrentafel zählen immer alle Tiere.
  const tierteilListe = opts.kurz ? kurzauswahl(eintraege, (e) => `${gruppenAbteilung(e.art, s.staemmeVorn) ?? e.sparte ?? ""}|${e.istJugend}`) : eintraege;
  // Rassebilder des Vereins für die Rassen dieser Schau – nur geprüfte (automatisch gefundene erst nach dem Prüfen).
  const rassenNamen = [...new Set(tierteilListe.map((e) => e.rasse ?? e.einordnungRasse ?? "").filter(Boolean))];
  const rassebilder = rassenNamen.length
    ? await db
        .select()
        .from(rassebild)
        .where(and(eq(rassebild.organisationId, s.organisationId), eq(rassebild.geprueft, true), eq(rassebild.mime, "image/jpeg"), inArray(rassebild.rasse, rassenNamen)))
    : [];
  const bildDerRasse = new Map(rassebilder.map((b) => [b.rasse, b]));
  /** Geöffnete Rassebilder (siehe `rassebildOeffnen`). */
  const geoeffnet = new Map<string, { bild: GeoeffnetesBild | null; breite: number; hoehe: number }>();
  const genutzteBilder = new Set<string>();
  const bildVon = (id: number | null | undefined) => bilder.find((b) => b.id === id)?.daten ?? null;
  const logo = bilder.find((b) => b.rolle === "logo")?.daten ?? null;
  const titelbild = bilder.find((b) => b.rolle === "titel")?.daten ?? null;
  const zu = zuteilung(eintraege, einteilung);
  const richterName = new Map(richter.map((r) => [r.id, r.name]));
  const skala = skalaVon(s);
  const mitErgebnis = s.ergebnisseFreigegeben;
  // Vorschau: Darstellung (Format, Schrift, Aufteilung …) aus dem Formular, ohne sie zu speichern.
  const gestaltung = opts.vorschau ? { ...gespeichert, ...opts.vorschau } : gespeichert;
  const verein = await ladeVereinsangaben(s.organisationId);
  const a4 = gestaltung.format === "A4";
  const k = a4 ? 1.22 : 1; // Schriftgrößen wachsen mit dem Format mit
  // Flächen und Linien in der Vereinsfarbe (die Stiche immer in Druckfarbe, damit alle gleich aussehen); Schrift in einer lesbaren (notfalls abgedunkelten) Fassung.
  const flaeche = gestaltung.farbe;
  const farbe = lesbareFarbe(flaeche);
  const aufFlaeche = kontrast(flaeche, "#ffffff") >= kontrast(flaeche, TINTE) ? "#ffffff" : TINTE;
  /** Akzent für Linien, kleine Versalzeilen und Seitenzahlen; leer = Vereinsfarbe (so sah jeder Katalog bisher aus). */
  const akzent = gestaltung.akzent || flaeche;
  const akzentText = lesbareFarbe(akzent);
  /** Stärke der Schmucklinien (1 = bisher). */
  const lk = KATALOG_LINIEN_INFO[gestaltung.linien]?.faktor ?? 1;
  /** Schlicht: keine getönten Flächen, nur Linien – spart Farbe am Bürodrucker. */
  const schlicht = gestaltung.stil === "schlicht";
  /** Ausgeblendete Teile (Titel, Inhalt, Termine und Tierteil stehen immer darin). */
  const ohne = new Set(gestaltung.ausgeblendet ?? []);

  const doc = new PDFDocument({
    size: gestaltung.format,
    margins: a4 ? { top: 20 * MM, bottom: 20 * MM, left: 20 * MM, right: 20 * MM } : { top: 14 * MM, bottom: 16 * MM, left: 13 * MM, right: 13 * MM },
    bufferPages: true,
    autoFirstPage: false,
    info: { Title: `Katalog ${s.name}`, Author: s.veranstalter, Creator: "SchauFUCHS" },
  });
  const teile: Buffer[] = [];
  doc.on("data", (c: Buffer) => teile.push(c));
  const fertig = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);
  });
  registriereSchriften(doc, gestaltung.schrift);
  /** Jeder Stich wird einmal geöffnet und dann wiederverwendet – ein Buffer würde bei jedem Spartenkopf neu eingebettet. */
  const offeneStiche = new Map<Stich, Parameters<typeof doc.image>[0]>();
  const stich = (name: Stich) => {
    let b = offeneStiche.get(name);
    if (!b) offeneStiche.set(name, (b = (doc as unknown as { openImage: (x: Buffer) => Parameters<typeof doc.image>[0] }).openImage(stichBild(name))));
    return b;
  };

  const seiten: Seite[] = [];
  const inhalt: Inhalt[] = [];
  const L = () => doc.page.margins.left;
  const B = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const unten = () => doc.page.height - doc.page.margins.bottom;
  const neueSeite = (info: Seite = {}) => {
    doc.addPage();
    seiten.push(info);
    doc.fillColor(TINTE);
  };
  const seitenNr = () => seiten.length; // 1-basiert, aktuelle Seite
  /** Neue Seite, wenn weniger als `hoehe` Platz bleibt. */
  const platz = (hoehe: number, info?: Seite) => {
    if (doc.y + hoehe > unten()) neueSeite(info ?? { ...seiten[seiten.length - 1] });
  };
  const abschnitt = (titel: string, ebene: 0 | 1 = 0) => {
    inhalt.push({ titel, seite: seitenNr(), ebene });
    doc.outline.addItem(titel);
  };
  /** Anfangsseite eines Teils der Gliederung (nur die erste zählt); `mitten`: beginnt unter dem vorigen Teil. */
  const marken: { schluessel: KatalogGliederungsTeil; seite: number; mitten?: boolean }[] = [];
  const marke = (schluessel: KatalogGliederungsTeil, mitten = false) => {
    if (!marken.some((x) => x.schluessel === schluessel)) marken.push({ schluessel, seite: seitenNr(), mitten });
  };

  const zierlinie = (y: number, breite = B() * 0.35) => {
    const x = L() + (B() - breite) / 2;
    doc.save().lineWidth(0.8 * lk).strokeColor(akzent).moveTo(x, y).lineTo(x + breite, y).stroke();
    doc.circle(x + breite / 2, y, 1.6 * lk).fill(akzent).restore();
  };
  /** y für doc.text, damit Text dieser Schrift auf der Grundlinie `grundlinie` steht (Schriften mischen ohne Versatz). */
  const aufLinie = (schrift: string, groesse: number, grundlinie: number) => {
    doc.font(schrift).fontSize(groesse);
    return grundlinie - ((doc as unknown as { _font: { ascender: number } })._font.ascender / 1000) * groesse;
  };
  /** Kleine Versalzeile über Titeln („KATALOG MIT ERGEBNISSEN“, „ABTEILUNG“). */
  const kicker = (text: string, x: number, y: number, breite: number, align: "left" | "center" = "left") => {
    doc.font(SANS_FETT).fontSize(7 * k).fillColor(akzentText).text(text.toLocaleUpperCase("de"), x, y, { width: breite, align, characterSpacing: 1.4 * k, lineBreak: false });
    doc.y = y + 7 * k * 1.35;
  };
  /** Seitentitel je Stil: klassisch mit Farbstrich, mit Rahmen mittig über einer Zierlinie, modern mit Linie über die Breite. */
  const seitentitel = (titel: string, unter?: string) => {
    const y0 = doc.y;
    if (gestaltung.stil === "rahmen") {
      doc.font(SERIF).fontSize(21 * k).fillColor(TINTE).text(titel, L(), y0, { width: B(), align: "center", lineGap: -2 });
      if (unter) doc.font(SANS_KURSIV).fontSize(8.5 * k).fillColor(GRAU).text(unter, L(), doc.y + 1, { width: B(), align: "center" });
      zierlinie(doc.y + 6 * k, B() * 0.18);
      doc.y += 16 * k;
    } else if (gestaltung.stil === "modern") {
      doc.font(SERIF_FETT).fontSize(20 * k).fillColor(farbe).text(titel, L(), y0, { width: B(), lineGap: -2 });
      const yl = doc.y + 2 * k;
      doc.save().rect(L(), yl, B(), 1.4 * lk).fill(akzent).restore();
      doc.y = yl + 5 * k;
      if (unter) doc.font(SANS_KURSIV).fontSize(8.5 * k).fillColor(GRAU).text(unter, L(), doc.y, { width: B() });
      doc.y += 9 * k;
    } else {
      doc.save().rect(L(), y0, 14 * MM * k, 1.6 * lk).fill(akzent).restore();
      doc.font(SERIF).fontSize(21 * k).fillColor(TINTE).text(titel, L(), y0 + 5 * k, { width: B(), lineGap: -2 });
      if (unter) doc.font(SANS_KURSIV).fontSize(8.5 * k).fillColor(GRAU).text(unter, L(), doc.y + 1, { width: B() });
      doc.y += 11 * k;
    }
    doc.fillColor(TINTE);
  };
  /** Zwischentitel innerhalb einer Seite. */
  const zwischentitel = (text: string) => {
    platz(40 * k);
    doc.font(SERIF_FETT).fontSize(11.5 * k).fillColor(farbe).text(text, L(), doc.y, { width: B() });
    doc.y += 4 * k;
    doc.fillColor(TINTE);
  };
  const absatz = (text: string, opts: { groesse?: number; schrift?: string; farbe?: string; einzug?: number } = {}) => {
    const x = L() + (opts.einzug ?? 0);
    const groesse = opts.groesse ?? 9.8 * k;
    for (const teil of text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)) {
      doc.font(opts.schrift ?? SERIF).fontSize(groesse);
      // Kurze Absätze nicht trennen, lange dürfen über die Seite laufen.
      platz(Math.min(doc.heightOfString(teil, { width: B() - (opts.einzug ?? 0), lineGap: 2.4 * k }), 4 * groesse * 1.5));
      doc.fillColor(opts.farbe ?? TINTE).text(teil, x, doc.y, { width: B() - (opts.einzug ?? 0), lineGap: 2.4 * k });
      doc.y += groesse * 0.6;
    }
  };
  /** Zweispaltige Angabenliste („Bezeichnung … Wert“) mit feinen Trennlinien. */
  const angaben = (zeilen: [string, string][], linksBreite = 0.36) => {
    const lb = B() * linksBreite;
    for (const [a, b] of zeilen.filter(([, w]) => w.trim())) {
      doc.font(SANS).fontSize(8.6 * k);
      const h = Math.max(doc.heightOfString(a || " ", { width: lb - 8 }), doc.heightOfString(b, { width: B() - lb }));
      platz(h + 6 * k);
      const y = doc.y;
      doc.fillColor(GRAU).text(a, L(), y, { width: lb - 8 });
      doc.fillColor(TINTE).text(b, L() + lb, y, { width: B() - lb });
      const yl = y + h + 2.6 * k;
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), yl).lineTo(L() + B(), yl).stroke().restore();
      doc.y = yl + 3 * k;
    }
  };

  // Ehrentafel und Fettdruck: die beiden obersten Stufen der Notenskala der Schau (Standard: v und hv, ab 96 Punkten).
  // Die zwei höchsten Stufen der Skala (unabhängig von ihrer Reihenfolge): ab deren kleinster Punktzahl fett/Ehrentafel.
  const spitzePunkte = Math.min(
    ...[...(skala ?? STANDARD_NOTENSKALA)]
      .filter((st) => st.punkte.length)
      .sort((a, b) => Math.max(...b.punkte) - Math.max(...a.punkte))
      .slice(0, 2)
      .flatMap((st) => st.punkte),
  );
  const note = (e: Eintrag) => (e.status === "fehlt" ? "fehlt" : bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala));

  return {
    s, opts, beitraege, bilder, richter, einteilung, preisarten, stiftungen, spender, alle,
    eintraege, tierteilListe, bildDerRasse, geoeffnet, genutzteBilder, bildVon, logo, titelbild, zu, richterName,
    skala, mitErgebnis, gestaltung, verein, a4, k, flaeche, farbe, aufFlaeche, akzent,
    akzentText, lk, schlicht, ohne, doc, fertig, stich, seiten, inhalt, L,
    B, unten, neueSeite, seitenNr, platz, abschnitt, marken, marke, zierlinie, aufLinie,
    kicker, seitentitel, zwischentitel, absatz, angaben, spitzePunkte, note,
  };
}

export type KatalogKontext = Awaited<ReturnType<typeof katalogKontext>>;
