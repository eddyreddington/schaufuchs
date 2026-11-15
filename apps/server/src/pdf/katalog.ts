import { bewertungsText, bindungText, formatEuro, formatKatalognummer, gruppenAbteilung, KATALOG_LINIEN_INFO, KATALOG_PAPIERTON, kommendeSchauen, lizenzUrlVon, MELDEART_LABEL, oeffnungszeitenZeilen, schauTage, seitenbereiche, SONDERNOTE_LABEL, STANDARD_NOTENSKALA, TERMIN_EBENE_INFO, zeitraumDe, type KatalogGliederungsTeil, type KatalogSeitenbereich } from "@schau/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../db/client";
import { bild, katalogBeitrag, preisart, preisrichter, prEinteilung, rassebild, stiftung, type schau } from "../db/schema";
import { bildMasse, ladeGestaltung, pngLesbar, type KatalogVorschau } from "../routers/katalog-gestaltung";
import { oeffneBild, type GeoeffnetesBild } from "../services/rassebild";
import { ausstellerAnzeige, ladeEintraege, skalaVon, verdeckeNamen, type Eintrag } from "../services/eintraege";
import { ladeVereinsangaben } from "../services/datenschutz";
import { zuteilung } from "../services/pruefung";
import { spenderFuerKatalog } from "../services/spenden";
import { ladeKommende } from "../services/termine";
import { datumDe, GRAU, HAARLINIE, kontrast, lesbareFarbe, MM, registriereSchriften, SANS, SANS_FETT, SANS_KURSIV, SERIF, SERIF_FETT, SERIF_KURSIV, textImFeld, TINTE } from "./basis";
import { stichBild, stichFuer, type Stich } from "./illustrationen";

type Schau = typeof schau.$inferSelect;
type Beitrag = typeof katalogBeitrag.$inferSelect;

/** Seiteninfos für Kopf- und Fußzeilen, die erst am Ende gesetzt werden. */
interface Seite {
  kopf?: string;
  ohneFuss?: boolean;
}

/** Kurzvorschau: so viele Tiere je Abteilung (Sparte, Jugend getrennt) – zeigt die Aufteilung, bleibt bei jeder Schau klein. */
export const KURZ_JE_ABTEILUNG = 10;

/** Die ersten Tiere jeder Abteilung (`abteilung` liefert den Schlüssel), in der Reihenfolge des Katalogs. */
export function kurzauswahl<T>(liste: T[], abteilung: (e: T) => string, je = KURZ_JE_ABTEILUNG): T[] {
  const zahl = new Map<string, number>();
  return liste.filter((e) => {
    const k = abteilung(e);
    const n = zahl.get(k) ?? 0;
    zahl.set(k, n + 1);
    return n < je;
  });
}

/** „3 Tiere“, in den Abteilungen Stämme und Volieren aber „3 Stämme“ bzw. „3 Volieren“. */
function anzahlText(abteilung: string, n: number): string {
  if (abteilung === "Stämme") return `${n} ${n === 1 ? "Stamm" : "Stämme"}`;
  if (abteilung === "Volieren") return `${n} ${n === 1 ? "Voliere" : "Volieren"}`;
  return `${n} ${n === 1 ? "Tier" : "Tiere"}`;
}

/** Abschnitte für das Inhaltsverzeichnis. */
interface Inhalt {
  titel: string;
  seite: number;
  ebene: 0 | 1;
}

/**
 * Druckkatalog: Titelseite, Inhaltsverzeichnis, Grußworte, Organisation, Preisrichter, Preise, Legende,
 * Bestimmungen, freie Seiten, Tierteil mit Spartenseiten, Jugend, Ergebnisse, Ausstellerverzeichnis, Anzeigen.
 * A5 (Heft) oder A4. Bilder und Texte pflegt der Verein unter „Katalog gestalten“.
 */
/**
 * Zeile im Bildnachweis: Urheber, Lizenz mit Adresse (verlangen CC BY und CC BY-SA) und Quelle. Ohne jede Angabe ist es
 * ein eigenes Bild des Vereins; mit Lizenz oder Quelle, aber ohne Urheber, „Urheber unbekannt“.
 */
/** Adresse für den Druck: ohne „https://“ und „www.“, Umlaute statt %-Kodierung, ohne Schrägstrich am Ende. */
export function kurzeAdresse(url: string) {
  let u = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  try {
    u = decodeURI(u);
  } catch {
    // ungültige %-Folge: so lassen
  }
  return u;
}

/** Urheberangabe aus Wikimedia ohne Signatur-Zeitstempel und Hinweistexte („No machine-readable author …“). */
export function urheberKurz(urheber: string) {
  const ohneHinweis = urheber.match(/no machine-readable author provided\.\s*(.+?)\s+assumed/i)?.[1] ?? urheber;
  return ohneHinweis.replace(/\s*\d{1,2}:\d{2},\s*\d{1,2}\.?\s+\p{L}+\s+\d{4}\s*\(UTC\)/gu, "").replace(/\s+/g, " ").trim();
}

/** Bildnachweis für den Katalog in zwei Teilen: Angaben (Foto, Lizenz) und die Adressen von Quelle und Lizenz. */
export function bildnachweisTeile(b: { urheber: string; lizenz: string; lizenzUrl: string; quelle: string }) {
  const urheber = urheberKurz(b.urheber);
  if (!urheber && !b.lizenz && !b.lizenzUrl && !b.quelle) return { angaben: "eigenes Bild", adressen: "" };
  const angaben = [urheber ? `Foto: ${urheber}` : "Urheber unbekannt", b.lizenz].filter(Boolean).join(" · ");
  // CC-Lizenzen verlangen einen Link zur Lizenz – fehlt er in den Angaben, aus dem Lizenznamen.
  const lizenzUrl = b.lizenzUrl || lizenzUrlVon(b.lizenz);
  const adressen = [b.quelle && kurzeAdresse(b.quelle), lizenzUrl && `Lizenz: ${kurzeAdresse(lizenzUrl)}`].filter(Boolean).join("  ·  ");
  return { angaben, adressen };
}

export function bildnachweis(rasse: string, b: { urheber: string; lizenz: string; lizenzUrl: string; quelle: string }) {
  const lizenz = b.lizenz && b.lizenzUrl ? `${b.lizenz} (${b.lizenzUrl})` : b.lizenz || b.lizenzUrl;
  const teile = [lizenz, b.quelle].filter(Boolean);
  if (!b.urheber && !teile.length) return `${rasse}: eigenes Bild`;
  return `${rasse}: ${[b.urheber ? `Foto ${b.urheber}` : "Urheber unbekannt", ...teile].join(" · ")}`;
}

/**
 * `kurz`: Kurzvorschau, vom Tierteil (und den Verzeichnissen dazu) nur die ersten Tiere je Abteilung.
 * `gliederung`: bekommt am Ende die Seitenbereiche der Teile (für die Vorschau in der Oberfläche).
 */
export async function katalogPdf(
  s: Schau,
  opts: { online?: boolean; vorschau?: KatalogVorschau; kurz?: boolean; gliederung?: (bereiche: KatalogSeitenbereich[]) => void } = {},
): Promise<Buffer> {
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

  // ── Titelseite ─────────────────────────────────────────────────────────
  neueSeite({ ohneFuss: true });
  {
    const w = doc.page.width;
    const h = doc.page.height;
    // Flächen bis an den Seitenrand: unteren Rand kurz aufheben, sonst bricht pdfkit die Seite um.
    const randUnten = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    // Hintergrund (weiß = nichts zeichnen, wie bisher).
    if (gestaltung.titelHintergrund === "papier") doc.rect(0, 0, w, h).fill(KATALOG_PAPIERTON);
    else if (gestaltung.titelHintergrund === "getoent") doc.save().fillOpacity(0.07).rect(0, 0, w, h).fill(flaeche).restore();
    // Vor dem Festschreiben können sich die Nummern noch ändern – das steht dann auf dem Titel.
    const kopfzeile = `${s.test ? "Testschau – keine echte Ausstellung · " : ""}${mitErgebnis ? "Katalog mit Ergebnissen" : "Ausstellungskatalog"}${!s.katalogGedruckt && !mitErgebnis ? " · vorläufig" : ""}`;
    // Öffnungszeiten untereinander, je Tag eine Zeile.
    const zeiten = oeffnungszeitenZeilen(s.oeffnungszeiten);
    const unterZeilen = [s.veranstalter ? `Veranstalter: ${s.veranstalter}` : "", gestaltung.schirmherr ? `Schirmherrschaft: ${gestaltung.schirmherr}` : ""].filter(Boolean);
    /**
     * Bildfläche: Titelfoto des Vereins, sonst der Stich des Hahns. `randlos`: Fläche, die ein Foto bei „randlos“
     * ganz füllt (beschnitten, bis an die Kanten); der Stich bleibt eingepasst.
     */
    const bildFlaeche = (x: number, y: number, bw: number, bh: number, randlos?: { x: number; y: number; w: number; h: number }) => {
      if (bh < 20 * MM) return;
      if (titelbild && randlos && gestaltung.titelbild === "randlos" && randlos.h >= 20 * MM) {
        try {
          doc.save().rect(randlos.x, randlos.y, randlos.w, randlos.h).clip();
          doc.image(titelbild, randlos.x, randlos.y, { cover: [randlos.w, randlos.h], align: "center", valign: "center" });
          doc.restore();
          return;
        } catch {
          doc.restore();
        }
      }
      if (titelbild) {
        try {
          doc.image(titelbild, x, y, { fit: [bw, bh], align: "center", valign: "center" });
          return;
        } catch {
          // Unlesbares Foto: Stich statt Foto.
        }
      }
      doc.image(stich("hahn-titel"), x, y, { fit: [bw, bh], align: "center", valign: "center" });
    };
    /** Logo des Vereins in einer Fläche; gibt die gebrauchte Höhe zurück (0 ohne Logo). */
    const logoIn = (x: number, y: number, bw: number, bh: number, align: "center" | "left" = "center") => {
      if (!logo) return 0;
      try {
        doc.image(logo, x, y, { fit: [bw, bh], ...(align === "center" ? { align: "center" as const } : {}), valign: "center" });
        return bh;
      } catch {
        return 0;
      }
    };
    /** Ort, Öffnungszeiten, Veranstalter: Höhe messen bzw. setzen. */
    const termineBlock = (x: number, bw: number, align: "center" | "left", farbeText: string, farbeKlein: string, setzen: number | null) => {
      let y = setzen ?? 0;
      const zeile = (text: string, schrift: string, groesse: number, farbeZ: string, vor = 0) => {
        doc.font(schrift).fontSize(groesse);
        const hz = doc.heightOfString(text, { width: bw, align });
        if (setzen != null) doc.fillColor(farbeZ).text(text, x, y + vor, { width: bw, align });
        y += vor + hz;
      };
      if (s.ort) zeile(s.ort, SERIF, 14 * k, farbeText);
      zeiten.forEach((z, i) => zeile(z, SANS, 9.5 * k, farbeText, i === 0 && s.ort ? 4 * k : 0));
      unterZeilen.forEach((z, i) => zeile(z, SANS, 8 * k, farbeKlein, i === 0 ? 6 * k : 0));
      return y - (setzen ?? 0);
    };

    if (gestaltung.stil === "rahmen") {
      // Doppelter Rahmen in der Vereinsfarbe mit kleinen Rauten in den Ecken, alles mittig.
      const r = 8 * MM * k;
      const r2 = r + 2.2 * MM * k;
      doc.save().lineWidth(1.4 * lk).strokeColor(flaeche).rect(r, r, w - 2 * r, h - 2 * r).stroke();
      doc.lineWidth(0.45 * lk).rect(r2, r2, w - 2 * r2, h - 2 * r2).stroke().restore();
      for (const [cx, cy] of [[r, r], [w - r, r], [r, h - r], [w - r, h - r]] as const) doc.save().translate(cx, cy).rotate(45).rect(-2.4, -2.4, 4.8, 4.8).fill(akzent).restore();
      let y = r2 + 11 * MM * k;
      const lh = logoIn(L(), y, B(), 20 * MM * k);
      y += lh ? lh + 5 * MM * k : 2 * MM * k;
      kicker(kopfzeile, L(), y, B(), "center");
      y = doc.y + 4 * k;
      doc.font(SERIF).fontSize(30 * k).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(SERIF_KURSIV).fontSize(13.5 * k).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
        y = doc.y;
      }
      zierlinie(y + 7 * k, B() * 0.22);
      y += 16 * k;
      const infoH = termineBlock(L(), B(), "center", TINTE, GRAU, null);
      const infoY = h - r2 - 10 * MM * k - infoH;
      bildFlaeche(L(), y, B(), infoY - 10 * MM * k - y, { x: r2, y, w: w - 2 * r2, h: infoY - 10 * MM * k - y });
      if (infoH) zierlinie(infoY - 5 * MM * k, B() * 0.22);
      termineBlock(L(), B(), "center", TINTE, GRAU, infoY);
    } else if (gestaltung.stil === "modern") {
      // Farbblock oben mit großem Titel linksbündig, darunter Bild rechts und Angaben links; feiner Farbstreifen unten.
      const blockH = h * 0.44;
      doc.rect(0, 0, w, blockH).fill(flaeche);
      doc.rect(0, h - 2.5 * MM * k, w, 2.5 * MM * k).fill(flaeche);
      let y = 13 * MM * k;
      if (logo) {
        // Logo auf weißem Feld, damit es auf der Farbe lesbar bleibt.
        const lb = 34 * MM * k, lhoch = 17 * MM * k, pad = 2.5 * MM * k;
        doc.save().roundedRect(L() - pad, y - pad, lb + 2 * pad, lhoch + 2 * pad, 3).fill("#ffffff").restore();
        logoIn(L(), y, lb, lhoch, "left");
      }
      doc.font(SERIF).fontSize(34 * k);
      const titelH = doc.heightOfString(s.name, { width: B(), lineGap: -5 });
      doc.font(SERIF_KURSIV).fontSize(13 * k);
      const unterH = gestaltung.untertitel ? doc.heightOfString(gestaltung.untertitel, { width: B() }) + 2 * k : 0;
      y = blockH - 11 * MM * k - unterH - titelH - 7 * k * 1.35 - 5 * k;
      doc.font(SANS_FETT).fontSize(7 * k).fillColor(aufFlaeche).text(kopfzeile.toLocaleUpperCase("de"), L(), y, { width: B(), characterSpacing: 1.4 * k, lineBreak: false });
      y += 7 * k * 1.35 + 5 * k;
      doc.font(SERIF).fontSize(34 * k).fillColor(aufFlaeche).text(s.name, L(), y, { width: B(), lineGap: -5 });
      if (gestaltung.untertitel) {
        doc.save().fillOpacity(0.85);
        doc.font(SERIF_KURSIV).fontSize(13 * k).fillColor(aufFlaeche).text(gestaltung.untertitel, L(), doc.y + 2 * k, { width: B() });
        doc.restore();
      }
      const spalte = B() * 0.46;
      const infoH = termineBlock(L(), spalte, "left", TINTE, GRAU, null);
      termineBlock(L(), spalte, "left", TINTE, GRAU, h - 16 * MM * k - infoH);
      if (infoH) doc.save().rect(L(), h - 16 * MM * k - infoH - 6 * k, 10 * MM * k, 1.6 * lk).fill(akzent).restore();
      const bx = L() + spalte + 4 * MM;
      bildFlaeche(bx, blockH + 10 * MM * k, B() - spalte - 4 * MM, h - blockH - 26 * MM * k, { x: bx, y: blockH, w: w - bx, h: h - blockH - 2.5 * MM * k });
    } else if (schlicht) {
      // Schlicht: keine Farbflächen, eine Linie oben und unten in der Akzentfarbe, alles mittig in Schwarz.
      doc.save().rect(L(), 12 * MM * k, B(), 1.2 * lk).fill(akzent).restore();
      let y = 18 * MM * k;
      const lh = logoIn(L(), y, B(), 24 * MM * k);
      y += lh ? 29 * MM * k : 4 * MM * k;
      kicker(kopfzeile, L(), y, B(), "center");
      y = doc.y + 4 * k;
      doc.font(SERIF).fontSize(30 * k).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(SERIF_KURSIV).fontSize(13.5 * k).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
        y = doc.y;
      }
      zierlinie(y + 7 * k, B() * 0.22);
      y += 16 * k;
      const infoH = termineBlock(L(), B(), "center", TINTE, GRAU, null);
      const infoY = h - 22 * MM * k - infoH;
      bildFlaeche(L(), y, B(), infoY - 10 * MM * k - y, { x: 0, y, w, h: infoY - 10 * MM * k - y });
      doc.save().rect(L() + B() * 0.39, infoY - 6 * MM * k, B() * 0.22, 0.6 * lk).fill(akzent).restore();
      termineBlock(L(), B(), "center", TINTE, GRAU, infoY);
      doc.save().rect(L(), h - 12 * MM * k, B(), 1.2 * lk).fill(akzent).restore();
    } else {
      // Klassisch: schmales Farbband oben, unten ein Farbfeld mit Ort und Terminen, alles mittig.
      const fussH = 46 * MM * k;
      doc.rect(0, 0, w, 3.5 * MM * k).fill(flaeche);
      doc.rect(0, h - fussH, w, fussH).fill(flaeche);
      let y = 14 * MM * k;
      const lh = logoIn(L(), y, B(), 26 * MM * k);
      y += lh ? 31 * MM * k : 6 * MM * k;
      kicker(kopfzeile, L(), y, B(), "center");
      y = doc.y + 4 * k;
      doc.font(SERIF).fontSize(30 * k).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(SERIF_KURSIV).fontSize(13.5 * k).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
        y = doc.y;
      }
      zierlinie(y + 7 * k, B() * 0.22);
      y += 16 * k;
      bildFlaeche(L(), y, B(), h - fussH - 8 * MM * k - y, { x: 0, y, w, h: h - fussH - y });
      const infoH = termineBlock(L(), B(), "center", aufFlaeche, aufFlaeche, null);
      termineBlock(L(), B(), "center", aufFlaeche, aufFlaeche, h - fussH + Math.max(4 * MM * k, (fussH - infoH) / 2));
    }
    doc.page.margins.bottom = randUnten;
  }

  // ── Inhaltsverzeichnis (wird am Ende gefüllt) ─────────────────────────
  neueSeite();
  const inhaltSeite = seiten.length - 1;

  // ── Grußworte ──────────────────────────────────────────────────────────
  const grussworte = beitraege.filter((b) => b.art === "grusswort");
  for (const [i, g] of grussworte.entries()) {
    neueSeite();
    if (i === 0) {
      abschnitt("Grußworte");
      marke("grussworte");
    }
    grusswort(g);
  }

  function grusswort(g: Beitrag) {
    const foto = bildVon(g.bildId);
    const fotoB = 26 * MM * k;
    const fotoH = 33 * MM * k;
    const y0 = doc.y;
    let textX = L();
    if (foto) {
      try {
        doc.image(foto, L(), y0, { fit: [fotoB, fotoH] });
        textX = L() + fotoB + 5 * MM;
      } catch {
        textX = L();
      }
    }
    const ty = y0 + (foto && textX > L() ? 6 * k : 0);
    doc.save().rect(textX, ty, 10 * MM * k, 1.6 * lk).fill(akzent).restore();
    doc.font(SERIF).fontSize(19 * k).fillColor(TINTE).text(g.titel || "Grußwort", textX, ty + 5 * k, { width: L() + B() - textX, lineGap: -2 });
    if (g.unterzeile) doc.font(SANS_KURSIV).fontSize(8.5 * k).fillColor(GRAU).text(g.unterzeile, textX, doc.y + 2, { width: L() + B() - textX });
    doc.y = Math.max(doc.y + 12 * k, foto && textX > L() ? y0 + fotoH + 10 * k : 0);
    absatz(g.text);
    if (g.unterzeile) {
      platz(26 * k);
      doc.y += 6 * k;
      doc.font(SERIF_KURSIV).fontSize(10 * k).fillColor(TINTE).text(g.unterzeile, L() + B() * 0.35, doc.y, { width: B() * 0.65, align: "right" });
    }
  }

  // ── Organisation und Termine ───────────────────────────────────────────
  neueSeite();
  abschnitt("Ausstellungsleitung und Termine");
  marke("leitung");
  seitentitel("Ausstellungsleitung", s.veranstalter);
  const leitung = gestaltung.ausstellungsleitung
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z): [string, string] => {
      const i = z.indexOf(":");
      return i > 0 ? [z.slice(0, i).trim(), z.slice(i + 1).trim()] : ["", z];
    });
  angaben([...(gestaltung.schirmherr ? [["Schirmherrschaft", gestaltung.schirmherr] as [string, string]] : []), ...leitung]);
  doc.y += 10 * k;
  zwischentitel("Termine und Hinweise");
  angaben([
    ["Ausstellungsort", s.ort],
    ["Einlieferung", s.einlieferung],
    ["Bewertung", s.bewertungAm ? `${datumDe(s.bewertungAm)} (für Besucher geschlossen)` : ""],
    ["Öffnungszeiten", oeffnungszeitenZeilen(s.oeffnungszeiten).join("\n")],
    ["Eintritt", gestaltung.eintritt],
    ["Ausgabe der Tiere", s.aussetzen],
    ["Reklamationen", s.reklamationsfrist ? `schriftlich bis ${datumDe(s.reklamationsfrist)}` : ""],
    ["Kontakt", s.kontaktEmail],
  ]);
  {
    // Kasten wie in den Verbandskatalogen: Haftung, Verkauf, Umgang mit den Tieren.
    const hinweise = [
      "Alle Angaben ohne Gewähr. Maßgeblich sind die Bewertungskarten und die Listen der Preisrichter.",
      `Tiere mit Verkaufspreis gibt es nur über die Verkaufsstelle${s.provisionBp ? ` (Provision ${(s.provisionBp / 100).toLocaleString("de-DE")} %)` : ""}. Verkaufte Tiere werden erst zum Ausgabetermin herausgegeben.`,
      "Die Tiere dürfen nur von Ordnern aus den Käfigen genommen werden. Bitte nicht füttern und nicht in die Käfige greifen.",
    ];
    const innen = 4 * MM * k;
    const textB = B() - 2 * innen - 8 * k;
    const groesse = 8.6 * k;
    const abstand = 3 * k;
    // Höhe genau so messen, wie gesetzt wird – sonst läuft der Text aus dem Kasten.
    doc.font(SANS).fontSize(groesse);
    const hoehen = hinweise.map((t) => doc.heightOfString(t, { width: textB, lineGap: 1.2 * k }));
    const kopfH = 7 * k * 1.35 + 4 * k;
    const h = innen + kopfH + hoehen.reduce((n, x) => n + x + abstand, 0) - abstand + innen;
    doc.y += 12 * k;
    platz(h);
    const y = doc.y;
    if (!schlicht) doc.save().fillOpacity(0.08).rect(L(), y, B(), h).fill(flaeche).restore();
    doc.save().rect(L(), y, 2.2 * lk, h).fill(akzent).restore();
    kicker("Zur besonderen Beachtung", L() + innen, y + innen, B() - 2 * innen);
    let ty = y + innen + kopfH;
    hinweise.forEach((t, i) => {
      doc.font(SANS_FETT).fontSize(groesse).fillColor(farbe).text("•", L() + innen, ty, { lineBreak: false });
      doc.font(SANS).fontSize(groesse).fillColor(TINTE).text(t, L() + innen + 8 * k, ty, { width: textB, lineGap: 1.2 * k });
      ty += hoehen[i]! + abstand;
    });
    doc.y = y + h + 14 * k;
  }
  // ── Preisrichter ───────────────────────────────────────────────────────
  if (richter.length && !ohne.has("preisrichter")) {
    neueSeite();
    abschnitt("Preisrichter");
    marke("preisrichter");
    seitentitel("Preisrichter", "mit den Katalognummern, die sie bewerten");
    for (const r of richter) {
      const bereiche = einteilung.filter((x) => x.preisrichterId === r.id);
      const rassen = [...new Set(eintraege.filter((e) => (e.bewertetVon ?? zu.get(e.id)) === r.id).map((e) => e.rasse ?? e.einordnungRasse ?? e.freitext))].filter(Boolean);
      const nummern = bereiche.map((x) => (x.vonNr === x.bisNr ? `${x.vonNr}` : `${x.vonNr}–${x.bisNr}`)).join(", ");
      // Links Name und Nummern, rechts die Rassen – wie eine Karteikarte je Preisrichter.
      const lb = B() * 0.36;
      doc.font(SANS).fontSize(8.4 * k);
      const rh = doc.heightOfString(rassen.join(", ") || " ", { width: B() - lb, lineGap: 1 * k });
      const h = Math.max(rh, 34 * k) + 12 * k;
      platz(h);
      const y = doc.y;
      doc.font(SERIF_FETT).fontSize(11.5 * k).fillColor(TINTE).text(r.name, L(), y, { width: lb - 8 });
      if (r.istObmann) kicker("Obmann", L(), doc.y + 1, lb - 8);
      if (nummern) doc.font(SANS_FETT).fontSize(8.6 * k).fillColor(farbe).text(`Nr. ${nummern}`, L(), doc.y + 1, { width: lb - 8 });
      // Anschrift nur im gedruckten Katalog – online keine Wohnanschrift ohne Einwilligung.
      // Anschrift nur mit Einverständnis des Preisrichters (Schalter an der Preisrichter-Seite).
      if (r.anschrift && r.anschriftImKatalog && !opts.online) doc.font(SANS).fontSize(7.8 * k).fillColor(GRAU).text(r.anschrift.replace(/\n/g, ", "), L(), doc.y + 1, { width: lb - 8 });
      const yLinks = doc.y;
      if (rassen.length) doc.font(SANS).fontSize(8.4 * k).fillColor(TINTE).text(rassen.join(", "), L() + lb, y + 2 * k, { width: B() - lb, lineGap: 1 * k });
      const yl = Math.max(yLinks, doc.y) + 6 * k;
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), yl).lineTo(L() + B(), yl).stroke().restore();
      doc.y = yl + 7 * k;
    }
  }

  const meldeZahl = new Set(eintraege.map((e) => e.ausstellerId)).size;
  // Kennzahlen als ruhiger Block: Tiere, Aussteller, Preisrichter.
  {
    const kz: [string, string][] = [
      [String(eintraege.length), "Tiere"],
      [String(meldeZahl), "Aussteller"],
      [String(richter.length), "Preisrichter"],
    ];
    doc.y += 16 * k;
    const hoehe = 26 * k + 12 * k;
    // Nur wenn sie noch auf die Seite passen – keine Seite nur für drei Zahlen.
    if (doc.y + hoehe <= unten()) {
      const y = doc.y;
      const b = B() / kz.length;
      kz.forEach(([zahl, text], i) => {
        if (i) doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(L() + i * b, y + 4 * k).lineTo(L() + i * b, y + hoehe - 4 * k).stroke().restore();
        doc.font(SERIF).fontSize(24 * k).fillColor(farbe).text(zahl, L() + i * b, y, { width: b, align: "center", lineBreak: false });
        doc.font(SANS).fontSize(7.5 * k).fillColor(GRAU).text(text.toLocaleUpperCase("de"), L() + i * b, y + 28 * k, { width: b, align: "center", characterSpacing: 1 * k, lineBreak: false });
      });
      doc.y = y + hoehe;
    }
  }

  // ── Preise und Stifter ─────────────────────────────────────────────────
  if ((preisarten.length || stiftungen.length || spender.length) && !ohne.has("preise")) {
    neueSeite();
    abschnitt("Preise und Stifter");
    marke("preise");
    seitentitel("Preise", "Kürzel im Katalog und ihr Wert");
    angaben(
      preisarten.map((p): [string, string] => [
        `${p.kuerzel}  ${p.name}`,
        [p.betragCent ? formatEuro(p.betragCent) : p.sachpreis, p.mindestpunkte ? `ab ${p.mindestpunkte} Punkten` : "", bindungText(p), p.quelle === "stiftung" ? "gestiftet" : ""].filter(Boolean).join(" · ") || "–",
      ]),
      0.45,
    );
    if (stiftungen.length) {
      doc.y += 10 * k;
      zwischentitel("Wir danken den Stiftern");
      // Stifter mit Meldung nur, wenn diese Meldung bestätigt ist und der Name hier erscheinen darf (Meldebogen bzw.
      // Online-Einwilligung, nicht gesperrt); Stifter ohne Meldung im Internet nur mit Zustimmung.
      const sichtbar = (x: (typeof stiftungen)[number]) =>
        x.meldungId != null ? alle.some((e) => e.meldungId === x.meldungId && !e.verdeckt) : !opts.online || x.onlineNennen;
      const stifter = [...new Set(stiftungen.filter(sichtbar).map((x) => x.stifter.trim()).filter((x) => x && x !== "Gelöscht"))];
      doc.font(SERIF).fontSize(9.5 * k).fillColor(TINTE).text(stifter.join(" · "), L(), doc.y, { width: B(), align: "center", lineGap: 2 });
      // Mit Ergebnissen: welcher gestiftete Preis an welches Tier ging (Treuhand gegenüber dem Stifter).
      const vergaben = mitErgebnis
        ? stiftungen.filter(sichtbar).flatMap((st) => {
            const nr = alle.filter((e) => e.preise.some((p) => p.stiftungId === st.id)).map((e) => `${e.katalogNr}${e.suffix}`);
            const art = preisarten.find((p) => p.id === st.preisartId);
            return nr.length && st.stifter.trim() !== "Gelöscht" ? [[`${st.stifter.trim()}`, `${art?.kuerzel ?? "Preis"} an Nr. ${nr.join(", ")}`] as [string, string]] : [];
          })
        : [];
      if (vergaben.length) {
        doc.y += 8 * k;
        zwischentitel("Gestiftete Preise und ihre Gewinner");
        angaben(vergaben, 0.45);
      }
    }
    // Spender nur mit Einwilligung (Name, Betrag getrennt) – services/spenden.ts.
    if (spender.length) {
      doc.y += 10 * k;
      zwischentitel("Wir danken unseren Spendern");
      doc.font(SERIF).fontSize(9.5 * k).fillColor(TINTE).text(spender.join(" · "), L(), doc.y, { width: B(), align: "center", lineGap: 2 });
    }
  }

  // ── Bestimmungen ───────────────────────────────────────────────────────
  if (s.bestimmungen.trim() && !ohne.has("bestimmungen")) {
    neueSeite();
    abschnitt("Ausstellungsbestimmungen");
    marke("bestimmungen");
    seitentitel("Ausstellungsbestimmungen");
    absatz(s.bestimmungen, { groesse: 8.5 * k, schrift: SERIF });
  }

  // ── Freie Seiten (Hallenplan, Vereinsgeschichte …) ─────────────────────
  for (const b of beitraege.filter((x) => x.art === "seite")) {
    neueSeite();
    abschnitt(b.titel || "Seite");
    marke("seiten");
    seitentitel(b.titel || "", b.unterzeile || undefined);
    const foto = bildVon(b.bildId);
    if (foto) {
      const h = b.text.trim() ? (unten() - doc.y) * 0.6 : unten() - doc.y;
      try {
        doc.image(foto, L(), doc.y, { fit: [B(), h], align: "center" });
        doc.y += h + 6 * k;
      } catch {
        // Bild nicht lesbar – Text trotzdem setzen.
      }
    }
    if (b.text.trim()) absatz(b.text);
  }

  // ── Legende (direkt vor dem Tierteil, dort wird sie gebraucht) ─────────
  if (!ohne.has("legende")) {
  neueSeite();
  abschnitt("So lesen Sie den Katalog");
  marke("legende");
  seitentitel("So lesen Sie den Katalog");
  angaben([
    ["1,0 / 0,1", "ein männliches / ein weibliches Tier (Hahn, Erpel, Ganter, Täuber / Henne, Ente, Gans, Täubin)"],
    ["1,2 · 1,1 · 1,3", "Stamm oder Voliere: Zahl der männlichen, dann der weiblichen Tiere"],
    ["jung / alt", "Jungtier aus diesem Zuchtjahr / Alttier"],
    ["PR", "Preisrichter, der die folgenden Nummern bewertet"],
    ["AOC", "anerkannte Rasse in einem nicht anerkannten Farbenschlag"],
    ["Neuzüchtung", "Rasse oder Farbenschlag im Anerkennungsverfahren"],
    ["Vkpr.", "Verkaufspreis in Euro – Kauf nur über die Verkaufsstelle"],
  ]);
  doc.y += 10 * k;
  zwischentitel("Bewertung");
  angaben([
    ...(skala ?? STANDARD_NOTENSKALA).map((n): [string, string] => [n.kuerzel, `${n.name} – ${n.punkte.join(", ")} Punkte`]),
    ...Object.values(SONDERNOTE_LABEL).map((n): [string, string] => [n.kuerzel, n.name]),
    ["fehlt", "Tier nicht eingeliefert"],
  ]);
  if (preisarten.length) {
    doc.y += 10 * k;
    zwischentitel("Preise");
    angaben(preisarten.map((p): [string, string] => [p.kuerzel, [p.name, p.betragCent ? formatEuro(p.betragCent) : p.sachpreis].filter(Boolean).join(" – ")]));
  }
  }

  // ── Ehrentafel (nur mit Ergebnissen) ───────────────────────────────────
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
  if (mitErgebnis && !ohne.has("ehrentafel")) {
    const spitze = eintraege.filter((e) => e.punkte != null && e.punkte >= spitzePunkte).sort((a, b) => b.punkte! - a.punkte! || a.katalogNr! - b.katalogNr!);
    const mitPreis = eintraege.filter((e) => e.preise.length);
    if (spitze.length || mitPreis.length) {
      neueSeite({ kopf: "Ehrentafel" });
      abschnitt("Ehrentafel");
      marke("ehrentafel");
      seitentitel("Ehrentafel", "Wir gratulieren allen Preisträgern.");
      const liste = (titel: string, tiere: Eintrag[]) => {
        if (!tiere.length) return;
        doc.y += 4 * k;
        zwischentitel(titel);
        // Nr. | Tier (darf umbrechen) | Klasse | Note | Aussteller – feste Schrift, kein Schrumpfen.
        const nrB = 9 * MM * k;
        const klasseB = 13 * MM * k;
        const noteB = 11 * MM * k;
        const ausB = B() * 0.3;
        const tierB = B() - nrB - klasseB - noteB - ausB - 3 * MM;
        const gr = 8.4 * k;
        for (const e of tiere) {
          doc.font(SANS).fontSize(gr);
          const aus = ausstellerAnzeige(e, "vorname");
          const h = Math.max(doc.heightOfString(e.bezeichnung, { width: tierB }), doc.heightOfString(aus, { width: ausB }));
          platz(h + 3 * k);
          const y = doc.y;
          let x = L();
          doc.font(SANS_FETT).fontSize(gr).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: nrB - 2 * MM, align: "right", lineBreak: false });
          x += nrB;
          doc.font(SANS).fontSize(gr).fillColor(TINTE).text(e.bezeichnung, x, y, { width: tierB });
          x += tierB + 2 * MM;
          doc.fillColor(GRAU).text(`${e.geschlecht} ${e.alter}`, x, y, { width: klasseB, lineBreak: false });
          x += klasseB;
          doc.font(SANS_FETT).fillColor(farbe).text(note(e), x, y, { width: noteB, lineBreak: false });
          x += noteB + 1 * MM;
          doc.font(SANS).fillColor(TINTE).text(aus, x, y, { width: ausB });
          doc.y = y + h + 2.6 * k;
        }
        doc.y += 8 * k;
      };
      liste("Die besten Tiere der Schau", spitze);
      for (const p of preisarten) liste(`${p.name} (${p.kuerzel})`, mitPreis.filter((e) => e.preise.some((x) => x.preisartId === p.id)));
    }
  }

  // ── Tierteil: zwei Spalten wie in den Verbandskatalogen, oder Tabelle über die ganze Breite, oder drei Spalten ──
  // Drei Spalten nur auf A4 (auf A5 wären sie zu schmal) – dort mit der Schriftgröße des A5-Hefts.
  const aufteilung = gestaltung.aufteilung === "dreispaltig" && !a4 ? "zweispaltig" : (gestaltung.aufteilung ?? "zweispaltig");
  const tabelle = aufteilung === "tabelle";
  const SPALTEN = tabelle ? 1 : aufteilung === "dreispaltig" ? 3 : 2;
  const kt = aufteilung === "dreispaltig" ? 1 : k;
  const LUECKE = (SPALTEN === 3 ? 4 : 5) * MM * kt;
  const spB = () => (B() - (SPALTEN - 1) * LUECKE) / SPALTEN;
  let spalte = 0;
  let spaltenOben = 0;
  const spX = () => L() + spalte * (spB() + LUECKE);
  // Spalten der Tierzeile: Nr. | Bewertung | Preis | Aussteller | Vkpr. – in der Tabelle
  // Nr. | Klasse | Farbenschlag | Aussteller | Bewertung | Preis | Vkpr.
  const col = () => {
    const nr = 7.5 * MM * kt; // Nummer rechtsbündig, danach 2 mm Luft
    if (tabelle) {
      // Auf A5 enger, damit der Farbenschlag genug Platz behält.
      const note = (mitErgebnis ? (a4 ? 13 : 11) : a4 ? 24 : 18) * MM * kt;
      const preis = mitErgebnis ? (a4 ? 14 : 10) * MM * kt : 0;
      const vk = (a4 ? 11 : 9) * MM * kt;
      const klasse = (a4 ? 24 : 18) * MM * kt;
      const aussteller = spB() * (a4 ? 0.27 : 0.25);
      const farbenschlag = Math.max(10 * MM, spB() - nr - 2 * MM - klasse - aussteller - note - preis - vk - 3 * MM);
      return { nr, note, preis, vk, aussteller, klasse, farbenschlag };
    }
    const note = mitErgebnis ? 9.5 * MM * kt : 14 * MM * kt;
    const preis = mitErgebnis ? 7.5 * MM * kt : 0;
    const vk = 6.5 * MM * kt;
    return { nr, note, preis, vk, aussteller: spB() - nr - 2 * MM - note - preis - vk, klasse: 0, farbenschlag: 0 };
  };
  /** x-Positionen der Tabellenspalten (nur Aufteilung „Tabelle“). */
  const tabX = () => {
    const c = col();
    const klasse = spX() + c.nr + 2 * MM;
    const farbenschlag = klasse + c.klasse;
    const aussteller = farbenschlag + c.farbenschlag + 1.5 * MM;
    const note = aussteller + c.aussteller + 1.5 * MM;
    const preis = note + c.note;
    return { klasse, farbenschlag, aussteller, note, preis };
  };
  const GR = 8.2 * kt; // Schriftgröße der Tierzeilen
  const ZEILE = (tabelle ? 13 : 10.4) * kt; // Tabelle: Luft für die Trennlinie unter jeder Zeile
  /** Luft über einem Rassenkopf bzw. einer neuen Klasse, wenn darüber Tierzeilen stehen (Gruppen sichtbar trennen). */
  const ABSTAND_RASSE = 9 * kt;
  const ABSTAND_KLASSE = 4 * kt;
  const spaltenKopf = () => {
    const c = col();
    const y = doc.y;
    const nx = spX() + c.nr + 2 * MM;
    doc.font(SANS_FETT).fontSize(6 * kt).fillColor(GRAU);
    const opt = { lineBreak: false, characterSpacing: 0.6 * kt } as const;
    doc.text("NR.", spX(), y, { ...opt, width: c.nr, align: "right" });
    if (tabelle) {
      const t = tabX();
      doc.text("KLASSE", t.klasse, y, { ...opt, width: c.klasse });
      doc.text("FARBENSCHLAG", t.farbenschlag, y, { ...opt, width: c.farbenschlag });
      doc.text("AUSSTELLER", t.aussteller, y, { ...opt, width: c.aussteller });
      doc.text(mitErgebnis ? "NOTE" : "NOTIZ", t.note, y, { ...opt, width: c.note });
      if (mitErgebnis) doc.text("PREIS", t.preis, y, { ...opt, width: c.preis });
      doc.text("VKPR.", spX() + spB() - c.vk - 4 * MM, y, { ...opt, width: c.vk + 4 * MM, align: "right" });
      doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(spX(), y + 8.5 * kt).lineTo(spX() + spB(), y + 8.5 * kt).stroke().restore();
      doc.y = y + 12 * kt;
      doc.fillColor(TINTE);
      return;
    }
    doc.text(mitErgebnis ? "NOTE" : "NOTIZ", nx, y, { ...opt, width: c.note });
    if (mitErgebnis) doc.text("PREIS", nx + c.note, y, { ...opt, width: c.preis });
    doc.text("AUSSTELLER", nx + c.note + c.preis, y, { ...opt, width: c.aussteller });
    doc.text("VKPR.", spX() + spB() - c.vk - 4 * MM, y, { ...opt, width: c.vk + 4 * MM, align: "right" });
    doc.save().lineWidth(0.5).strokeColor(TINTE).moveTo(spX(), y + 8.5 * kt).lineTo(spX() + spB(), y + 8.5 * kt).stroke().restore();
    doc.y = y + 12 * kt;
    doc.fillColor(TINTE);
  };
  let tiefste = 0; // unterstes y beider Spalten der aktuellen Seite
  let imTierteil = false;
  let kopfJetzt = ""; // Kolumnentitel der laufenden Rasse für Folgeseiten
  let laufendeRasse = ""; // für „Fortsetzung“ oben in der neuen Spalte
  /** Was zuletzt in der Spalte steht: nach Tierzeilen bekommen Klassen- und Rassenkopf Luft, oben in der Spalte nicht. */
  let zuletzt: "kopf" | "tier" = "kopf";
  /** Rasse, deren Bild noch unter Überschrift und Preisrichter folgt. */
  let bildFolgt: string | null = null;
  const tierSeite = (info: Seite) => {
    neueSeite(info);
    spalte = 0;
    spaltenOben = doc.y;
    tiefste = 0;
    spaltenKopf();
    zuletzt = "kopf";
  };
  /**
   * Platz in der Spalte, sonst nächste Spalte bzw. Seite – Überschriften wandern mit.
   * Läuft eine Rasse weiter, steht oben in der neuen Spalte „Rasse (Fortsetzung)“.
   */
  const raum = (hoehe: number, neueRasse = false): boolean => {
    if (doc.y + hoehe <= unten()) return false;
    // Die nächste Spalte beginnt auf derselben Höhe: passt der Block auch dort nicht, gleich auf die nächste Seite
    // (sonst stünde z. B. ein Rassenkopf mit Bild allein unten in der rechten Spalte und die linke bliebe leer).
    if (spalte < SPALTEN - 1 && spaltenOben + 12 * kt + hoehe <= unten()) {
      tiefste = Math.max(tiefste, doc.y);
      spalte++;
      doc.y = spaltenOben;
      spaltenKopf();
    } else {
      tierSeite({ kopf: kopfJetzt });
    }
    zuletzt = "kopf";
    if (!neueRasse && laufendeRasse) {
      doc.font(SERIF_KURSIV).fontSize(8.5 * kt).fillColor(farbe);
      const yf = doc.y;
      doc.text(`${laufendeRasse} (Fortsetzung)`, spX(), yf, { width: spB(), lineBreak: false, ellipsis: true });
      // In der Tabelle folgt gleich die Tierzeile (keine Klassenzeile dazwischen) – nur eine Zeile Abstand.
      doc.y = tabelle ? yf + 12 * kt : doc.y + 11 * kt;
      doc.fillColor(TINTE);
    }
    return true;
  };

  /** Register für das Rassenverzeichnis: erste Seite, Nummernbereich, Anzahl. */
  // Bereiche mit Unternummer („24a“): Nachmeldungen sortieren hinter ihrer Hauptnummer ein.
  type Nr = { katalogNr: number | null; suffix: string };
  const nrVergleich = (a: Nr, b: Nr) => a.katalogNr! - b.katalogNr! || a.suffix.localeCompare(b.suffix);
  const nrBereich = (von: Nr, bis: Nr) => (nrVergleich(von, bis) === 0 ? formatKatalognummer(von) : `${formatKatalognummer(von)}–${formatKatalognummer(bis)}`);
  const register = new Map<string, { rasse: string; sparte: string; abteilung: string; seite: number; von: Nr; bis: Nr; anzahl: number; zusatz: string }>();

  /** Abteilung im Tierteil: „Volieren“ und „Stämme“ vorn, wenn eingestellt – sonst die Sparte. */
  const abteilungVon = (e: Eintrag) => gruppenAbteilung(e.art, s.staemmeVorn) ?? e.sparte ?? "Sonstige";

  // Teilschauen (Entscheidung 016) nacheinander, jede auf neuer Seite und mit ihrem Namen vor der Sparte; darin wie
  // ohne Teilschauen erst die Senioren, dann die Jugend. Ohne Teilschauen ist es eine einzige Gruppe ohne Namen.
  const teilschauGruppen = [...new Map(tierteilListe.map((e) => [e.teilschauFolge, e.teilschauName ?? ""] as const)).entries()].sort((a, b) => a[0] - b[0]);
  for (const [folge, name] of teilschauGruppen) {
    const liste = tierteilListe.filter((e) => e.teilschauFolge === folge);
    const erwachsen = liste.filter((e) => !(s.jugendSeparat && e.istJugend));
    const jugend = s.jugendSeparat ? liste.filter((e) => e.istJugend) : [];
    if (erwachsen.length) {
      imTierteil = false; // jede Teilschau beginnt auf neuer Seite
      tierteil(erwachsen, name);
    }
    if (jugend.length) {
      imTierteil = false; // Jugendabteilung beginnt auf neuer Seite
      tierteil(jugend, [name, "Jugend"].filter(Boolean).join(" · "));
    }
  }

  function tierteil(liste: Eintrag[], zusatz: string) {
    let sparte: string | null = null;
    let rasse: string | null = null;
    let klasse: string | null = null;
    let richterId: number | null | undefined;
    let kopfBasis = "";
    for (const e of liste) {
      const sp = abteilungVon(e);
      if (sp !== sparte) {
        kopfBasis = `${zusatz ? `${zusatz} · ` : ""}${sp}`;
        spartenKopf(sp, zusatz, kopfBasis, liste.filter((x) => abteilungVon(x) === sp), rasseBlock(e.rasse ?? e.einordnungRasse ?? e.freitext ?? ""));
        sparte = sp;
        rasse = null;
      }
      const ra = e.rasse ?? e.einordnungRasse ?? e.freitext ?? "";
      if (ra !== rasse) {
        // Rassenkopf nur mit Preisrichter, Bild, Klasse und mindestens zwei Tieren darunter.
        raum(rasseBlock(ra), true);
        rasseKopf(ra);
        bildFolgt = ra;
        laufendeRasse = ra;
        kopfJetzt = `${kopfBasis} · ${ra}`;
        // Der Kolumnentitel nennt die erste Rasse der Seite.
        const sNow = seiten[seiten.length - 1]!;
        if (!sNow.kopf || sNow.kopf === kopfBasis) seiten[seiten.length - 1] = { ...sNow, kopf: kopfJetzt };
        const key = `${zusatz}|${sp}|${ra}`;
        const r = register.get(key);
        if (r) {
          if (nrVergleich(e, r.bis) > 0) r.bis = { katalogNr: e.katalogNr, suffix: e.suffix };
          if (nrVergleich(e, r.von) < 0) r.von = { katalogNr: e.katalogNr, suffix: e.suffix };
          r.anzahl++;
        } else register.set(key, { rasse: ra, sparte: e.sparte ?? "Sonstige", abteilung: sp, seite: seitenNr(), von: { katalogNr: e.katalogNr, suffix: e.suffix }, bis: { katalogNr: e.katalogNr, suffix: e.suffix }, anzahl: 1, zusatz });
        rasse = ra;
        klasse = null;
        richterId = undefined;
      } else {
        const r = register.get(`${zusatz}|${sp}|${ra}`)!;
        if (nrVergleich(e, r.bis) > 0) r.bis = { katalogNr: e.katalogNr, suffix: e.suffix };
        if (nrVergleich(e, r.von) < 0) r.von = { katalogNr: e.katalogNr, suffix: e.suffix };
        r.anzahl++;
      }
      // Bewertete Tiere: wer tatsächlich bewertet hat (auch nach einer Umverteilung), sonst die Einteilung.
      const pr = e.bewertetVon ?? zu.get(e.id) ?? null;
      if (pr !== richterId) {
        raum(10 * kt + 16 * kt + ZEILE);
        if (pr != null) richterZeile(richterName.get(pr) ?? "");
        richterId = pr;
        klasse = null;
      }
      // Das Rassebild steht unter Überschrift und Preisrichter (Platz ist beim Rassenkopf schon reserviert).
      if (bildFolgt) {
        rassebildZeichnen(bildFolgt);
        bildFolgt = null;
      }
      const kl = `${e.bezeichnung}|${e.art}|${e.geschlecht}|${e.alter}`;
      if (kl !== klasse) {
        raum(ABSTAND_KLASSE + 12 * kt + ZEILE);
        klassenKopf(e);
        klasse = kl;
      }
      // Nach einem Spalten- oder Seitenwechsel steht die Klasse noch einmal über den Tieren.
      if (raum(ZEILE)) klassenKopf(e);
      tierZeile(e);
    }
  }

  /** Höhe, die ein Rassenkopf mindestens braucht: Überschrift, Preisrichter, Bild, Klasse und zwei Tiere. */
  function rasseBlock(ra: string) {
    const bm = bildMass(ra);
    return ABSTAND_RASSE + 17 * kt + 10 * kt + 16 * kt + 2 * ZEILE + (bm ? bm.h + 6 * kt : 0);
  }

  function spartenKopf(sparte: string, zusatz: string, kopf: string, tiere: Eintrag[], ersterBlock: number) {
    // Neue Sparte unter der vorigen, wenn noch knapp ein Drittel der Seite frei ist und Kopf samt erster Rasse
    // darunter passen – sonst neue Seite (keine Spartenüberschrift allein unten auf der Seite).
    const darunter = Math.max(tiefste, doc.y) + 12 * k;
    // Höhe des Spartenkopfs samt Spaltenkopf je Stil (gemessen; mit Rahmen steht das Bild über dem Namen).
    const kopfHoehe = 15 * MM * k + (gestaltung.stil === "rahmen" ? 88 * k : gestaltung.stil === "modern" ? 40 * k : 34 * k);
    if (imTierteil && !gestaltung.sparteNeueSeite && unten() - darunter > Math.max((unten() - doc.page.margins.top) * 0.3, kopfHoehe + ersterBlock)) {
      doc.y = darunter; // Kolumnentitel bleibt bei der ersten Rasse der Seite
    } else neueSeite({ kopf });
    imTierteil = true;
    tiefste = 0;
    laufendeRasse = "";
    abschnitt(`${zusatz ? `${zusatz}: ` : ""}${sparte}`, zusatz ? 1 : 0);
    marke("tierteil");
    const y0 = doc.y;
    const g = 15 * MM * k; // Höhe des Bildfelds
    const fw = g * 1.6; // Breite des Bildfelds (Stiche sind meist breiter als hoch)
    const gruppe = tiere.some((t) => gruppenAbteilung(t.art, s.staemmeVorn) === sparte);
    const bild = stich(stichFuer(sparte, gruppe));
    /** Stich der Sparte im Bildfeld fw × g (Stämme und Volieren: Hahn mit Henne). */
    const figur = (x: number, y: number, align: "center" | "right") => doc.image(bild, x, y, { fit: [fw, g], align, valign: "center" });
    const art = zusatz ? `${zusatz}abteilung` : gruppe ? "Abteilung" : "Sparte";
    const rassen = new Set(tiere.map((t) => t.rasse ?? t.einordnungRasse ?? t.freitext)).size;
    const nummern = [...tiere].sort(nrVergleich);
    const angabe = `${anzahlText(sparte, tiere.length)}  ·  ${rassen} ${rassen === 1 ? "Rasse" : "Rassen"}  ·  Nr. ${nrBereich(nummern[0]!, nummern.at(-1)!)}`;
    if (gestaltung.stil === "rahmen") {
      // Mittig: Bild, Art, Name der Sparte, Angaben, darunter eine doppelte Linie.
      figur(L() + (B() - fw) / 2, y0, "center");
      kicker(art, L(), y0 + g + 3 * k, B(), "center");
      doc.font(SERIF).fontSize(23 * k).fillColor(TINTE).text(sparte, L(), doc.y, { width: B(), align: "center", lineGap: -3 });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: B(), align: "center" });
      const y = doc.y + 5 * k;
      doc.save().rect(L(), y, B(), 1.4 * lk).fill(akzent).rect(L(), y + 3, B(), 0.45 * lk).fill(akzent).restore();
      doc.y = y + 12 * k;
    } else if (gestaltung.stil === "modern") {
      // Farbband mit Art und Name in Weiß, der Stich rechts neben dem Band; die Angaben darunter.
      const bandH = g + 4 * k;
      const bandB = B() - fw - 4 * MM;
      doc.rect(L(), y0, bandB, bandH).fill(flaeche);
      figur(L() + B() - fw, y0 + 2 * k, "right");
      doc.font(SANS_FETT).fontSize(7 * k).fillColor(aufFlaeche).text(art.toLocaleUpperCase("de"), L() + 4 * MM * k, y0 + 4 * k, { width: bandB - 8 * MM * k, characterSpacing: 1.4 * k, lineBreak: false });
      doc.font(SERIF).fontSize(21 * k).fillColor(aufFlaeche).text(sparte, L() + 4 * MM * k, y0 + 4 * k + 7 * k * 1.5, { width: bandB - 8 * MM * k, lineGap: -3, height: bandH, ellipsis: true });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), y0 + bandH + 3 * k, { width: B() });
      doc.y += 8 * k;
    } else {
      // Klassisch: kleines Bild rechts, Titel links – die Schrift trägt die Seite, nicht das Bild.
      figur(L() + B() - fw, y0, "right");
      const tb = B() - fw - 6 * MM;
      kicker(art, L(), y0 + 1 * k, tb);
      doc.font(SERIF).fontSize(23 * k).fillColor(TINTE).text(sparte, L(), doc.y, { width: tb, lineGap: -3 });
      doc.font(SANS).fontSize(8.4 * k).fillColor(GRAU).text(angabe, L(), doc.y + 1, { width: tb });
      const y = Math.max(doc.y, y0 + g) + 5 * k;
      doc.save().rect(L(), y, B(), 1.4 * lk).fill(akzent).restore();
      doc.y = y + 9 * k;
    }
    spalte = 0;
    spaltenOben = doc.y;
    spaltenKopf();
  }

  /**
   * Jedes Rassebild wird einmal geöffnet und eingebettet (kommt die Rasse mehrfach vor, z. B. in der Jugend, nutzt der
   * Katalog es wieder). Was pdfkit nicht lesen kann, fehlt im Katalog, statt ihn zu verhindern.
   */
  function rassebildOeffnen(rasse: string) {
    const b = bildDerRasse.get(rasse);
    if (!b) return null;
    if (!geoeffnet.has(rasse)) {
      try {
        geoeffnet.set(rasse, oeffneBild(doc, b.daten)); // pdfkit dreht nach der EXIF-Angabe
      } catch {
        geoeffnet.set(rasse, { bild: null, breite: 0, hoehe: 0 });
      }
    }
    const g = geoeffnet.get(rasse)!;
    return g.bild && g.breite && g.hoehe ? g : null;
  }

  /** Größe des Rassebilds in der Spalte (höchstens 20 mm hoch, Seitenverhältnis bleibt); null ohne Bild. */
  function bildMass(rasse: string) {
    if (gestaltung.rassebilder === false) return null;
    const g = rassebildOeffnen(rasse);
    if (!g) return null;
    const hoeheMax = (tabelle ? 50 : 62) * kt;
    const w = Math.min(spB(), (hoeheMax * g.breite) / g.hoehe);
    return { bild: g.bild!, w, h: (w * g.hoehe) / g.breite };
  }

  function rasseKopf(rasse: string) {
    doc.y += zuletzt === "tier" ? ABSTAND_RASSE : 2 * kt;
    const y = doc.y;
    const h = 14 * kt;
    // Heller Balken mit Farbkante statt Vollfläche: ruhiger und im Schwarz-Weiß-Druck gut lesbar.
    if (!schlicht) doc.save().fillOpacity(0.12).rect(spX(), y, spB(), h).fill(flaeche).restore();
    doc.save().rect(spX(), y, 2.2 * lk, h).fill(akzent).restore();
    textImFeld(doc, rasse, spX() + 6, aufLinie(SERIF_FETT, 10.5 * kt, y + h * 0.71), { breite: spB() - 10, groesse: 10.5 * kt, min: 8, schrift: SERIF_FETT, farbe: TINTE });
    doc.y = y + h + 3.5 * kt;
    zuletzt = "kopf";
    doc.fillColor(TINTE);
  }

  /** Rassebild mittig in der Spalte, unter Überschrift und Preisrichter (Urheber und Lizenz im Bildnachweis am Ende). */
  function rassebildZeichnen(rasse: string) {
    const bm = bildMass(rasse);
    if (!bm) return;
    doc.y += 1.5 * kt;
    // In der Tabelle an der Kante der Klassenspalte (wie Preisrichter und Zeilen), sonst mittig in der Spalte.
    const x = tabelle ? tabX().klasse : spX() + (spB() - bm.w) / 2;
    doc.image(bm.bild as unknown as Buffer, x, doc.y, { width: bm.w, height: bm.h });
    doc.save().lineWidth(0.4).strokeColor(HAARLINIE).rect(x, doc.y, bm.w, bm.h).stroke().restore();
    doc.y += bm.h + 4.5 * kt;
    genutzteBilder.add(rasse);
    zuletzt = "kopf";
  }

  /** Eine Zeile je Klasse wie in den Verbandskatalogen: „1,0 jung · blau mit Binden“. */
  function klassenKopf(e: Eintrag) {
    // In der Tabelle stehen Klasse und Farbenschlag in jeder Zeile – zwischen den Klassen nur etwas Luft.
    if (tabelle) return; // gleichmäßige Zeilen ohne Zwischenräume – die Klasse steht in jeder Zeile
    const farbschlag = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
    const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
    // In der eigenen Abteilung „Stämme“ ist der Zusatz „Stamm“ überflüssig.
    const art = e.art !== "einzeltier" && !gruppenAbteilung(e.art, s.staemmeVorn) ? `${MELDEART_LABEL[e.art]} ` : "";
    if (zuletzt === "tier") doc.y += ABSTAND_KLASSE;
    zuletzt = "kopf";
    const linie = doc.y + 9 * kt; // gemeinsame Grundlinie von Klasse und Farbenschlag
    const prefix = `${art}${e.geschlecht} ${e.alter}`;
    const c = col();
    // Klasse unter der Nummernspalte, Farbenschlag auf Höhe der Bewertung – alles fluchtet.
    doc.fillColor(farbe).text(prefix, spX(), aufLinie(SANS_FETT, 7 * kt, linie), { lineBreak: false });
    const pw = Math.max(c.nr + 2 * MM, doc.widthOfString(prefix) + 2 * MM);
    textImFeld(doc, `${farbschlag || "–"}${zusatz ? ` (${zusatz})` : ""}`, spX() + pw, aufLinie(SERIF_KURSIV, 9.6 * kt, linie), { breite: spB() - pw, groesse: 9.6 * kt, min: 7.5, schrift: SERIF_KURSIV, farbe: TINTE });
    doc.y = linie + 3.2 * kt;
  }

  function richterZeile(name: string) {
    const c = col();
    doc.font(SANS_KURSIV).fontSize(7.2 * kt).fillColor(GRAU).text(`Preisrichter: ${name}`, spX() + c.nr + 2 * MM, doc.y - 1 * kt, { width: spB() - c.nr - 2 * MM, lineBreak: false, ellipsis: true });
    doc.y += 8 * kt;
    zuletzt = "kopf";
    doc.fillColor(TINTE);
  }

  function tierZeile(e: Eintrag) {
    if (tabelle) return tabellenZeile(e);
    const c = col();
    const y = doc.y;
    const x = spX();
    doc.font(SANS_FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: c.nr, align: "right", lineBreak: false });
    const nx = x + c.nr + 2 * MM;
    if (mitErgebnis) {
      const n = note(e);
      // v und hv fett, damit Spitzentiere auch im Schwarz-Weiß-Druck auffallen.
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? SANS_FETT : SANS).fontSize(GR).fillColor(TINTE).text(n, nx, y, { width: c.note, lineBreak: false });
      const preise = e.preise.map((p) => p.kuerzel).join(" ");
      if (preise) textImFeld(doc, preise, nx + c.note, y, { breite: c.preis - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    } else {
      // Vorkatalog: feine Schreiblinie für eigene Notizen statt „kt. E.“ in jeder Zeile.
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(nx, y + 8 * kt).lineTo(nx + c.note + c.preis - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    textImFeld(doc, ausstellerAnzeige(e), nx + c.note + c.preis, y, { breite: c.aussteller - 1.5 * MM, groesse: GR, min: 6.8 * kt, schrift: SANS, farbe: TINTE });
    // Nicht verkäuflich: fehlende Tiere und gesperrte (Gesundheitsjournal) – kein Preis im Katalog.
    if (e.verkaufspreisCent && e.status !== "fehlt" && !e.gesperrt) {
      const verkauft = mitErgebnis && e.verkauftAn;
      const euro = e.verkaufspreisCent % 100 === 0 ? String(e.verkaufspreisCent / 100) : formatEuro(e.verkaufspreisCent).replace(/\s?€/, "");
      doc.font(verkauft ? SANS_KURSIV : SANS).fontSize(GR).fillColor(verkauft ? GRAU : TINTE).text(verkauft ? "verk." : euro, x + spB() - c.vk, y, { width: c.vk, align: "right", lineBreak: false });
    }
    doc.fillColor(TINTE);
    doc.y = y + ZEILE;
    zuletzt = "tier";
    tiefste = Math.max(tiefste, doc.y);
  }

  /** Eine Tabellenzeile: Nr. | Klasse | Farbenschlag | Aussteller | Bewertung | Preis | Vkpr. */
  function tabellenZeile(e: Eintrag) {
    const c = col();
    const t = tabX();
    const y0 = doc.y;
    const y = y0 + 1.6 * kt; // Text etwas unter der Oberkante, die Trennlinie liegt unter den Unterlängen
    const x = spX();
    // Gemeinsame Grundlinie: der kursive Farbenschlag (Titelschrift) steht auf derselben Linie wie die übrigen Spalten.
    const grund = y - aufLinie(SANS, GR, 0);
    const farbschlag = e.rasse ? (e.farbenschlag ?? "") : e.freitext;
    const zusatz = [e.istAoc ? "AOC" : "", e.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
    const art = e.art !== "einzeltier" && !gruppenAbteilung(e.art, s.staemmeVorn) ? `${MELDEART_LABEL[e.art]} ` : "";
    doc.font(SANS_FETT).fontSize(GR).fillColor(TINTE).text(formatKatalognummer(e), x, y, { width: c.nr, align: "right", lineBreak: false });
    textImFeld(doc, `${art}${e.geschlecht} ${e.alter}`, t.klasse, y, { breite: c.klasse - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    textImFeld(doc, `${farbschlag || "–"}${zusatz ? ` (${zusatz})` : ""}`, t.farbenschlag, aufLinie(SERIF_KURSIV, GR * 1.08, grund), { breite: c.farbenschlag, groesse: GR * 1.08, min: 6.5, schrift: SERIF_KURSIV, farbe: TINTE });
    textImFeld(doc, ausstellerAnzeige(e), t.aussteller, y, { breite: c.aussteller - 1.5 * MM, groesse: GR, min: 6.8 * kt, schrift: SANS, farbe: TINTE });
    if (mitErgebnis) {
      doc.font(e.punkte != null && e.punkte >= spitzePunkte ? SANS_FETT : SANS).fontSize(GR).fillColor(TINTE).text(note(e), t.note, y, { width: c.note, lineBreak: false });
      const preise = e.preise.map((p) => p.kuerzel).join(" ");
      if (preise) textImFeld(doc, preise, t.preis, y, { breite: c.preis - 1.5 * MM, groesse: GR, min: 6.5, schrift: SANS_FETT, farbe });
    } else {
      doc.save().lineWidth(0.3).strokeColor(HAARLINIE).dash(0.8, { space: 1.6 });
      doc.moveTo(t.note, y + 8 * kt).lineTo(t.note + c.note - 2 * MM, y + 8 * kt).stroke();
      doc.undash().restore();
    }
    // Nicht verkäuflich: fehlende Tiere und gesperrte (Gesundheitsjournal) – kein Preis im Katalog.
    if (e.verkaufspreisCent && e.status !== "fehlt" && !e.gesperrt) {
      const verkauft = mitErgebnis && e.verkauftAn;
      const euro = e.verkaufspreisCent % 100 === 0 ? String(e.verkaufspreisCent / 100) : formatEuro(e.verkaufspreisCent).replace(/\s?€/, "");
      doc.font(verkauft ? SANS_KURSIV : SANS).fontSize(GR).fillColor(verkauft ? GRAU : TINTE).text(verkauft ? "verk." : euro, x + spB() - c.vk, y, { width: c.vk, align: "right", lineBreak: false });
    }
    // Feine Linie unter jeder Zeile, damit das Auge in der breiten Tabelle die Zeile hält.
    doc.save().lineWidth(0.25).strokeColor(HAARLINIE).moveTo(x, y0 + ZEILE - 0.4 * kt).lineTo(x + spB(), y0 + ZEILE - 0.4 * kt).stroke().restore();
    doc.fillColor(TINTE);
    doc.y = y0 + ZEILE;
    zuletzt = "tier";
    tiefste = Math.max(tiefste, doc.y);
  }

  // ── Rassenverzeichnis ──────────────────────────────────────────────────
  if (register.size && !ohne.has("rassenverzeichnis")) {
    neueSeite({ kopf: "Rassenverzeichnis" });
    abschnitt("Rassenverzeichnis");
    marke("rassenverzeichnis");
    seitentitel("Rassenverzeichnis", "von A bis Z, mit Katalognummern und Seite");
    const zeilen = [...register.values()].sort((a, b) => a.rasse.localeCompare(b.rasse, "de") || nrVergleich(a.von, b.von));
    for (const r of zeilen) {
      platz(11 * k);
      const y = doc.y;
      doc.font(SANS).fontSize(8.5 * k).fillColor(TINTE);
      const name = `${r.rasse}${r.zusatz ? ` (${r.zusatz})` : ""}`;
      const nrText = nrBereich(r.von, r.bis);
      const w = doc.widthOfString(name);
      doc.text(name, L(), y, { lineBreak: false });
      // Bei Stämmen und Volieren steht die Sparte des Tiers, die Abteilung steckt in „2 Stämme“.
      textImFeld(doc, `${r.sparte} · ${anzahlText(r.abteilung, r.anzahl)}`, L() + B() * 0.5, y + 0.8, { breite: B() * 0.25, groesse: 7.5 * k, min: 6, schrift: SANS, farbe: GRAU });
      doc.font(SANS).fontSize(8.5 * k).fillColor(TINTE).text(`Nr. ${nrText}`, L() + B() * 0.76, y, { width: B() * 0.17, lineBreak: false });
      doc.font(SANS_FETT).text(String(r.seite), L(), y, { width: B(), align: "right", lineBreak: false });
      if (w < B() * 0.48) {
        doc.save().lineWidth(0.4).strokeColor(HAARLINIE).dash(0.5, { space: 2.5 }).moveTo(L() + w + 3, y + 7.5 * k).lineTo(L() + B() * 0.5 - 3, y + 7.5 * k).stroke().undash().restore();
      }
      doc.y = y + 11 * k;
    }
  }

  // ── Bildnachweis (Urheber und Lizenz, wie § 13 UrhG und die freien Lizenzen es verlangen) ──
  // Bilder des Vereins (Titelbild, Logo, Fotos zu Grußworten und Seiten) mit Angaben; eigene Fotos ohne Angaben fehlen.
  const beitragZu = (id: number) => beitraege.find((x) => x.bildId === id && x.art !== "anzeige");
  const vereinsbilder = bilder
    .filter((b) => (b.urheber || b.lizenz || b.quelle) && (b.rolle !== "beitrag" || beitragZu(b.id)))
    .map((b) => ({ name: b.rolle === "titel" ? "Titelbild" : b.rolle === "logo" ? "Vereinslogo" : beitragZu(b.id)!.titel || "Foto", b }));
  const anzeigenMitBild = beitraege.some((x) => x.art === "anzeige" && x.bildId != null);
  if (genutzteBilder.size || vereinsbilder.length || anzeigenMitBild) {
    // Ohne Rassenverzeichnis eigene Seite – sonst stünde der Nachweis mitten in den Spalten des Tierteils.
    const eigeneSeite = ohne.has("rassenverzeichnis") || !register.size;
    if (eigeneSeite) neueSeite({ kopf: "Bildnachweis" });
    const seiteVorher = seitenNr();
    platz(40 * k);
    doc.y += 10 * k;
    abschnitt("Bildnachweis");
    marke("bildnachweis", !eigeneSeite && seitenNr() === seiteVorher);
    doc.font(SERIF_FETT).fontSize(10 * k).fillColor(TINTE).text("Bildnachweis", L(), doc.y, { width: B() });
    doc.y += 5 * k;
    // Je Bild: Bezeichnung fett, dahinter Foto und Lizenz; darunter klein die Adressen von Quelle und Lizenz.
    const zeilen = [
      ...vereinsbilder.map((v) => ({ name: v.name, b: { urheber: v.b.urheber, lizenz: v.b.lizenz, lizenzUrl: "", quelle: v.b.quelle } })),
      ...[...genutzteBilder].sort((a, b) => a.localeCompare(b, "de")).map((name) => ({ name, b: bildDerRasse.get(name)! })),
    ];
    if (anzeigenMitBild) {
      doc.font(SANS_KURSIV).fontSize(7.2 * k).fillColor(GRAU).text("Für Bilder und Texte der Anzeigen sind die Inserenten verantwortlich.", L(), doc.y, { width: B() });
      doc.y += 3 * k;
    }
    for (const { name, b } of zeilen) {
      const { angaben, adressen } = bildnachweisTeile(b);
      doc.font(SANS).fontSize(7.2 * k);
      const h1 = doc.heightOfString(`${name}  ${angaben}`, { width: B() });
      doc.font(SANS).fontSize(6.3 * k);
      const h2 = adressen ? doc.heightOfString(adressen, { width: B() }) : 0;
      platz(h1 + h2 + 5 * k);
      doc.font(SANS_FETT).fontSize(7.2 * k).fillColor(TINTE).text(`${name}  `, L(), doc.y, { width: B(), continued: true });
      doc.font(SANS).fillColor(TINTE).text(angaben);
      if (adressen) doc.font(SANS).fontSize(6.3 * k).fillColor(GRAU).text(adressen, L(), doc.y + 0.5 * k, { width: B() });
      doc.y += 4 * k;
    }
    doc.fillColor(TINTE);
  }

  // ── Ausstellerverzeichnis ──────────────────────────────────────────────
  if (tierteilListe.some((e) => !e.verdeckt) && !ohne.has("ausstellerverzeichnis")) {
    neueSeite({ kopf: "Ausstellerverzeichnis" });
    abschnitt("Ausstellerverzeichnis");
    marke("ausstellerverzeichnis");
    seitentitel("Ausstellerverzeichnis", "alphabetisch, mit den Katalognummern ihrer Tiere");
    const jeAussteller = new Map<number, Eintrag[]>();
    // Ohne Zustimmung kein Eintrag im Verzeichnis – der Name stünde sonst doch im Katalog.
    for (const e of tierteilListe.filter((x) => !x.verdeckt)) jeAussteller.set(e.ausstellerId, [...(jeAussteller.get(e.ausstellerId) ?? []), e]);
    const liste = [...jeAussteller.values()].sort((a, b) => a[0]!.ausstellerName.localeCompare(b[0]!.ausstellerName, "de"));
    let buchstabe = "";
    for (const t of liste) {
      const a = t[0]!;
      const b0 = a.nachname.charAt(0).toLocaleUpperCase("de");
      const nummern = t.map((e) => formatKatalognummer(e)).join(", ");
      doc.font(SANS).fontSize(8 * k);
      const h = 11 * k + doc.heightOfString(nummern, { width: B() * 0.5 });
      if (b0 !== buchstabe) {
        platz(h + 18 * k);
        doc.moveDown(0.3);
        doc.font(SERIF_FETT).fontSize(13 * k).fillColor(farbe).text(b0, L(), doc.y);
        buchstabe = b0;
      }
      platz(h);
      const y = doc.y;
      doc.font(SANS_FETT).fontSize(8.5 * k).fillColor(TINTE).text(`${a.nachname}, ${a.vorname}`, L(), y, { width: B() * 0.5 - 4 });
      doc.font(SANS).fontSize(7.8 * k).fillColor(GRAU).text([a.ort, a.verein].filter(Boolean).join(" · "), L(), doc.y, { width: B() * 0.5 - 4 });
      const yLinks = doc.y;
      doc.font(SANS).fontSize(8 * k).fillColor(TINTE).text(nummern, L() + B() * 0.5, y + 0.6 * k, { width: B() * 0.5 });
      doc.y = Math.max(yLinks, doc.y) + 3 * k;
    }
  }

  // ── Kommende Schauen ───────────────────────────────────────────────────
  // Termine nach dem letzten Tag dieser Schau: Kreis und Landesverband wie gewählt, Bund und Europa alle (je Ebene gekürzt).
  const schauEnde = schauTage(s.bewertungAm, s.oeffnungszeiten)?.bis;
  const kommend =
    schauEnde && !ohne.has("kommendeSchauen")
      ? kommendeSchauen(await ladeKommende(s.organisationId, s.id), { nach: schauEnde, kreis: gestaltung.termineKreis, land: gestaltung.termineLand })
      : [];
  if (kommend.length) {
    neueSeite({ kopf: "Kommende Schauen" });
    abschnitt("Kommende Schauen");
    marke("kommendeSchauen");
    seitentitel("Kommende Schauen", "Termine nach unserer Schau – wir freuen uns auf ein Wiedersehen.");
    const datumBreite = B() * 0.34;
    for (const g of kommend) {
      const verband = g.ebene === "kreis" ? gestaltung.termineKreis : g.ebene === "land" ? gestaltung.termineLand : "";
      // „keine“ (TERMINE_KEINE) kommt hier nicht an – die Ebene fehlt dann ganz.
      zwischentitel(`${TERMIN_EBENE_INFO[g.ebene].titel}${verband ? ` – ${verband}` : ""}`);
      for (const t of g.termine) {
        const wann = zeitraumDe(t.von, t.bis);
        doc.font(SANS_FETT).fontSize(8.8 * k);
        const hName = doc.heightOfString(t.name, { width: B() - datumBreite });
        doc.font(SANS).fontSize(8 * k);
        const hOrt = t.ort ? doc.heightOfString(t.ort, { width: B() - datumBreite }) : 0;
        const h = Math.max(hName + hOrt, 10 * k);
        platz(h + 6 * k);
        const y = doc.y;
        doc.font(SANS).fontSize(8.6 * k).fillColor(GRAU).text(wann, L(), y + 0.3 * k, { width: datumBreite - 8 });
        doc.font(SANS_FETT).fontSize(8.8 * k).fillColor(TINTE).text(t.name, L() + datumBreite, y, { width: B() - datumBreite });
        if (t.ort) doc.font(SANS).fontSize(8 * k).fillColor(GRAU).text(t.ort, L() + datumBreite, doc.y, { width: B() - datumBreite });
        const yl = y + h + 2.6 * k;
        doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), yl).lineTo(L() + B(), yl).stroke().restore();
        doc.y = yl + 3 * k;
      }
      if (g.gekuerzt) doc.font(SANS_KURSIV).fontSize(7.8 * k).fillColor(GRAU).text(`… und ${g.gekuerzt} weitere`, L() + datumBreite, doc.y, { width: B() - datumBreite });
      doc.y += 4 * k;
    }
    const quellen = [...new Set(kommend.flatMap((g) => g.termine.map((t) => t.quelle)).filter(Boolean))];
    const hinweis = `Stand: ${datumDe(new Date())}${quellen.length ? ` · Quellen: ${quellen.join(", ")}` : ""} · Angaben ohne Gewähr – bitte vor dem Besuch beim Veranstalter nachsehen.`;
    doc.font(SANS_KURSIV).fontSize(7 * k);
    platz(doc.heightOfString(hinweis, { width: B() }) + 8 * k);
    doc.y += 4 * k;
    doc.fillColor(GRAU).text(hinweis, L(), doc.y, { width: B() });
    doc.fillColor(TINTE);
  }

  // ── Anzeigen ───────────────────────────────────────────────────────────
  const anzeigen = beitraege.filter((b) => b.art === "anzeige");
  if (anzeigen.length) {
    neueSeite({ kopf: "Unsere Förderer" });
    abschnitt("Unsere Förderer");
    marke("anzeigen");
    seitentitel("Unsere Förderer", "Wir danken allen, die diese Schau unterstützen.");
    // Raster aus 2 × 2 Feldern je Seite: ganz = alle vier, halb = eine Zeile, Viertel = ein Feld.
    let belegt = [false, false, false, false];
    let yStart = doc.y;
    const neueAnzeigenSeite = () => {
      neueSeite({ kopf: "Unsere Förderer" });
      yStart = doc.y;
      belegt = [false, false, false, false];
    };
    for (const a of anzeigen) {
      const felder =
        a.groesse === "ganz"
          ? [[0, 1, 2, 3]]
          : a.groesse === "halb"
            ? [[0, 1], [2, 3]]
            : [[0], [1], [2], [3]];
      let wahl = felder.find((f) => f.every((i) => !belegt[i]));
      if (!wahl) {
        neueAnzeigenSeite();
        wahl = felder[0]!;
      }
      const luecke = 4 * k;
      const zeileH = (unten() - yStart - luecke) / 2;
      const spalteB = (B() - luecke) / 2;
      const erstes = wahl[0]!;
      const x = L() + (a.groesse === "viertel" ? (erstes % 2) * (spalteB + luecke) : 0);
      const y = yStart + Math.floor(erstes / 2) * (zeileH + luecke);
      const w = a.groesse === "viertel" ? spalteB : B();
      const h = a.groesse === "ganz" ? unten() - yStart : zeileH;
      anzeige(a, x, y, w, h);
      for (const i of wahl) belegt[i] = true;
    }
  }

  function anzeige(a: Beitrag, x: number, y: number, w: number, h: number) {
    const foto = bildVon(a.bildId);
    if (foto) {
      try {
        doc.image(foto, x, y, { fit: [w, h], align: "center", valign: "center" });
        return;
      } catch {
        // Ohne lesbares Bild als Textanzeige setzen.
      }
    }
    doc.save().lineWidth(0.8 * lk).strokeColor(flaeche).rect(x, y, w, h).stroke().restore();
    // Textanzeige: Inhalt in der Mitte des Feldes, wie eine gesetzte Anzeige.
    const innen = 5 * MM * (w < B() ? 0.6 : 1);
    const ib = w - 2 * innen;
    const titelGr = (w < B() ? 12.5 : 17) * k;
    doc.font(SERIF_FETT).fontSize(titelGr);
    const hTitel = doc.heightOfString(a.titel, { width: ib });
    doc.font(SANS).fontSize(8 * k);
    const hUnter = a.unterzeile ? doc.heightOfString(a.unterzeile, { width: ib }) + 2 : 0;
    doc.font(SERIF).fontSize(9.5 * k);
    const hText = a.text ? Math.min(doc.heightOfString(a.text, { width: ib, lineGap: 1.5 * k }) + 8 * k, h - 2 * innen - hTitel - hUnter) : 0;
    let ty = y + Math.max(innen, (h - hTitel - hUnter - hText) / 2);
    doc.font(SERIF_FETT).fontSize(titelGr).fillColor(farbe).text(a.titel, x + innen, ty, { width: ib, align: "center" });
    ty = doc.y;
    if (a.unterzeile) {
      doc.font(SANS).fontSize(8 * k).fillColor(GRAU).text(a.unterzeile, x + innen, ty + 2, { width: ib, align: "center" });
      ty = doc.y;
    }
    if (a.text) doc.font(SERIF).fontSize(9.5 * k).fillColor(TINTE).text(a.text, x + innen, ty + 8 * k, { width: ib, height: Math.max(10, y + h - ty - innen - 8 * k), align: "center", lineGap: 1.5 * k, ellipsis: true });
  }

  // ── Notizen: Heftseiten zählen in Vierern (A5), A4 beidseitig in Zweiern ──
  const teiler = a4 ? 2 : 4;
  // Ohne Notizseiten bleiben die Füllseiten leer – das Heft braucht sie trotzdem.
  for (let n = 0; seiten.length % teiler !== 0; n++) {
    if (ohne.has("notizen")) {
      neueSeite({ ohneFuss: true });
      continue;
    }
    neueSeite({ kopf: "Notizen" });
    marke("notizen");
    if (n === 0) seitentitel("Notizen");
    for (let y = doc.y + 14 * k; y < unten() - 4; y += 14 * k) doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), y).lineTo(L() + B(), y).stroke().restore();
  }

  // ── Inhaltsverzeichnis nachtragen, unten das Impressum ─────────────────
  doc.switchToPage(inhaltSeite);
  doc.x = L();
  doc.y = doc.page.margins.top;
  seitentitel("Inhalt");
  // Impressum (Pressegesetze der Länder: Name und Anschrift von Herausgeber bzw.
  // Verleger und Druckerei) – zuerst messen, damit ein langes Verzeichnis es nicht überdeckt.
  const stand = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date());
  const herausgeber = [verein.name || s.veranstalter || s.name, verein.anschrift.replace(/\s*\n\s*/g, ", ")].filter(Boolean).join(", ");
  const impressum = [
    `Herausgeber: ${herausgeber}${verein.vertretung ? ` · vertreten durch ${verein.vertretung}` : ""}`,
    gestaltung.druck.trim() ? `Druck: ${gestaltung.druck.trim().replace(/\s*\n\s*/g, ", ")}` : "",
    gestaltung.ausstellungsleitung.split("\n").find((z) => /katalog/i.test(z))?.trim() ?? "",
    `Stand: ${stand}${mitErgebnis ? " · mit Ergebnissen" : ""}${!s.katalogGedruckt && !mitErgebnis ? " · vorläufig: Katalognummern noch nicht festgeschrieben, sie können sich noch ändern" : ""}`,
    opts.online
      ? "Angaben ohne Gewähr. Name, Wohnort und Verein stehen hier nur bei Ausstellern, die in die Veröffentlichung im Internet eingewilligt haben."
      : "Angaben ohne Gewähr. Name, Wohnort und Verein der Aussteller stehen nach den Ausstellungsbestimmungen im Katalog – ohne deren Anerkennung (Meldebogen oder Online-Meldung) oder bei Widerspruch nicht.",
  ].filter(Boolean);
  doc.font(SANS).fontSize(7 * k);
  const impressumH = impressum.reduce((n, t) => n + doc.heightOfString(t, { width: B() }) + 1.5, 0) + 8;
  // Lange Verzeichnisse (viele Sparten, Jugend) enger setzen: Zeilenabstand bis auf die Hälfte, Schrift bis auf 75 %.
  const benoetigt = inhalt.reduce((n, z) => n + (z.ebene ? 14 : 17) * k, 0);
  const verfuegbar = unten() - impressumH - 6 - doc.y;
  const f = Math.max(0.5, Math.min(1, verfuegbar / Math.max(benoetigt, 1)));
  for (const z of inhalt) {
    const y = doc.y;
    const einzug = z.ebene ? 8 * MM : 0;
    doc.font(z.ebene ? SANS : SERIF).fontSize((z.ebene ? 8.8 : 11.5) * k * Math.max(0.75, f)).fillColor(z.ebene ? GRAU : TINTE);
    const w = doc.widthOfString(z.titel);
    doc.text(z.titel, L() + einzug, y, { lineBreak: false });
    const nr = String(z.seite);
    const nw = doc.widthOfString(nr);
    doc.text(nr, L() + B() - nw, y, { lineBreak: false });
    // Punktführung zwischen Titel und Seitenzahl.
    doc.save().lineWidth(0.5).strokeColor(HAARLINIE).dash(0.5, { space: 2.5 });
    doc.moveTo(L() + einzug + w + 4, y + 9 * k * f).lineTo(L() + B() - nw - 4, y + 9 * k * f).stroke();
    doc.undash().restore();
    doc.y = y + (z.ebene ? 14 : 17) * k * f;
  }
  {
    // Fest am unteren Rand: weiter unten löste pdfkit eine neue Seite aus und verschöbe alle Seitenzahlen.
    let y = unten() - impressumH;
    doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(L(), y).lineTo(L() + B(), y).stroke().restore();
    y += 5;
    for (const t of impressum) {
      doc.font(SANS).fontSize(7 * k).fillColor(GRAU).text(t, L(), y, { width: B() });
      y = doc.y + 1.5;
    }
  }

  // ── Kopf- und Fußzeilen ────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    const info = seiten[i] ?? {};
    if (info.ohneFuss) continue;
    doc.switchToPage(i);
    const unterRand = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const gerade = (i + 1) % 2 === 0;
    const yF = doc.page.height - unterRand * 0.55;
    const nr = String(i + 1);
    if (gestaltung.fusszeile === "mittig") {
      doc.font(SANS_FETT).fontSize(8 * k).fillColor(akzentText).text(nr, L(), yF, { width: B(), align: "center", lineBreak: false });
    } else if (gestaltung.fusszeile === "marke") {
      // Seitenzahl weiß (bzw. dunkel) in einem kleinen Feld der Vereinsfarbe am äußeren Rand.
      const mb = 7 * MM * k;
      const mh = 5 * MM * k;
      const mx = gerade ? L() : L() + B() - mb;
      const my = yF - 1.6 * MM * k;
      doc.rect(mx, my, mb, mh).fill(flaeche);
      doc.font(SANS_FETT).fontSize(8 * k).fillColor(aufFlaeche).text(nr, mx, my + (mh - 8 * k) / 2 + 0.5, { width: mb, align: "center", lineBreak: false });
      doc.font(SANS).fontSize(7 * k).fillColor(GRAU).text(s.name, L() + (gerade ? mb + 3 * MM : 0), yF + 0.5, { width: B() - mb - 3 * MM, align: gerade ? "right" : "left", lineBreak: false });
    } else {
      doc.save().lineWidth(0.4).strokeColor(HAARLINIE).moveTo(L(), yF - 4).lineTo(L() + B(), yF - 4).stroke().restore();
      doc.font(SANS_FETT).fontSize(8 * k).fillColor(akzentText).text(nr, L(), yF, { width: B(), align: gerade ? "left" : "right", lineBreak: false });
      doc.font(SANS).fontSize(7 * k).fillColor(GRAU).text(s.name, L(), yF + 0.5, { width: B(), align: gerade ? "right" : "left", lineBreak: false });
    }
    if (info.kopf) {
      const yK = doc.page.margins.top * 0.45;
      doc.font(SANS).fontSize(7 * k).fillColor(GRAU).text(info.kopf, L(), yK, { width: B(), align: gerade ? "left" : "right", lineBreak: false, ellipsis: true });
    }
    doc.page.margins.bottom = unterRand;
  }

  marken.push({ schluessel: "titel", seite: 1 }, { schluessel: "inhalt", seite: inhaltSeite + 1 });
  opts.gliederung?.(seitenbereiche(marken, seiten.length));
  doc.end();
  return fertig;
}
