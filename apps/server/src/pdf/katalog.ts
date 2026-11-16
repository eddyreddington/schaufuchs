/**
 * Katalog-PDF, Einstieg: lädt die Grundlage (katalog-kontext.ts) und setzt die Teile der Reihe nach – Titelseite
 * (katalog-titel.ts), Vorspann und Ehrentafel (katalog-vorspann.ts), Tierteil (katalog-tierteil.ts), Verzeichnisse
 * (katalog-verzeichnisse.ts), Anhang (katalog-anhang.ts); zum Schluss Inhaltsverzeichnis, Kopf- und Fußzeilen.
 * Hilfen ohne PDF in katalog-hilfen.ts.
 */
import { seitenbereiche } from "@schau/domain";
import { GRAU, HAARLINIE, MM, SANS, SANS_FETT } from "./basis";
import { anzeigenSeiten, kommendeSchauenSeite, notizSeiten } from "./katalog-anhang";
import { katalogKontext, type KatalogOptionen, type Schau } from "./katalog-kontext";
import { tierteilSetzen } from "./katalog-tierteil";
import { titelseite } from "./katalog-titel";
import { ausstellerverzeichnis, bildnachweisSeite, inhaltsverzeichnis, rassenverzeichnis } from "./katalog-verzeichnisse";
import { ehrentafel, vorspann } from "./katalog-vorspann";

export { bildnachweis, bildnachweisTeile, KURZ_JE_ABTEILUNG, kurzauswahl, kurzeAdresse, urheberKurz } from "./katalog-hilfen";

/**
 * Druckkatalog: Titelseite, Inhaltsverzeichnis, Grußworte, Organisation, Preisrichter, Preise, Legende,
 * Bestimmungen, freie Seiten, Tierteil mit Spartenseiten, Jugend, Ergebnisse, Ausstellerverzeichnis, Anzeigen.
 * A5 (Heft) oder A4. Bilder und Texte pflegt der Verein unter „Katalog gestalten“.
 */
/**
 * `kurz`: Kurzvorschau, vom Tierteil (und den Verzeichnissen dazu) nur die ersten Tiere je Abteilung.
 * `gliederung`: bekommt am Ende die Seitenbereiche der Teile (für die Vorschau in der Oberfläche).
 */
export async function katalogPdf(
  s: Schau,
  opts: KatalogOptionen = {},
): Promise<Buffer> {
  const K = await katalogKontext(s, opts);
  const { gestaltung, k, flaeche, aufFlaeche, akzentText, doc, fertig, seiten, L, B, neueSeite, marken } = K;

  titelseite(K);

  // ── Inhaltsverzeichnis (wird am Ende gefüllt) ─────────────────────────
  neueSeite();
  const inhaltSeite = seiten.length - 1;

  vorspann(K);
  ehrentafel(K);
  const register = tierteilSetzen(K);
  rassenverzeichnis(K, register);
  bildnachweisSeite(K, register);
  ausstellerverzeichnis(K);
  await kommendeSchauenSeite(K);
  anzeigenSeiten(K);
  notizSeiten(K);
  inhaltsverzeichnis(K, inhaltSeite);

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
