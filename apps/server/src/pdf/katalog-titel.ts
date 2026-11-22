/** Katalog-PDF, Titelseite: Hintergrund, Titel, Logo, Titelbild bzw. Stich und Termine je Stil. */
import { KATALOG_PAPIERTON, oeffnungszeitenZeilen } from "@schau/domain";
import { GRAU, MM, TINTE } from "./basis";
import { AUSZEICHNUNG, FETT, KURSIV, NORMAL } from "./katalog-schrift";
import type { KatalogKontext } from "./katalog-kontext";

/** Titelseite in den vier Stilen (Rahmen, modern, schlicht, klassisch). */
export function titelseite(K: KatalogKontext) {
  const { G, s, logo, titelbild, mitErgebnis, gestaltung, k, flaeche, aufFlaeche, akzent, akzentText, lk, schlicht, doc, stich, L, B, neueSeite, zierlinie, kicker } = K;
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
      if (s.ort) zeile(s.ort, NORMAL, G.h2, farbeText);
      zeiten.forEach((z, i) => zeile(z, NORMAL, G.text, farbeText, i === 0 && s.ort ? 4 * k : 0));
      unterZeilen.forEach((z, i) => zeile(z, NORMAL, G.liste, farbeKlein, i === 0 ? 6 * k : 0));
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
      doc.font(AUSZEICHNUNG).fontSize(G.titel).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(KURSIV).fontSize(G.h2).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
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
      doc.font(AUSZEICHNUNG).fontSize(G.titel);
      const titelH = doc.heightOfString(s.name, { width: B(), lineGap: -5 });
      doc.font(KURSIV).fontSize(G.h2);
      const unterH = gestaltung.untertitel ? doc.heightOfString(gestaltung.untertitel, { width: B() }) + 2 * k : 0;
      y = blockH - 11 * MM * k - unterH - titelH - G.klein * 1.35 - 5 * k;
      doc.font(FETT).fontSize(G.klein).fillColor(aufFlaeche).text(kopfzeile.toLocaleUpperCase("de"), L(), y, { width: B(), characterSpacing: 1.4 * k, lineBreak: false });
      y += G.klein * 1.35 + 5 * k;
      doc.font(AUSZEICHNUNG).fontSize(G.titel).fillColor(aufFlaeche).text(s.name, L(), y, { width: B(), lineGap: -5 });
      if (gestaltung.untertitel) {
        doc.save().fillOpacity(0.85);
        doc.font(KURSIV).fontSize(G.h2).fillColor(aufFlaeche).text(gestaltung.untertitel, L(), doc.y + 2 * k, { width: B() });
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
      doc.font(AUSZEICHNUNG).fontSize(G.titel).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(KURSIV).fontSize(G.h2).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
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
      doc.font(AUSZEICHNUNG).fontSize(G.titel).fillColor(TINTE).text(s.name, L(), y, { width: B(), align: "center", lineGap: -4 });
      y = doc.y + 1 * k;
      if (gestaltung.untertitel) {
        doc.font(KURSIV).fontSize(G.h2).fillColor(akzentText).text(gestaltung.untertitel, L(), y, { width: B(), align: "center" });
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
}
