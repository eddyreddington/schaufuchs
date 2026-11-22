/** Katalog-PDF, Anhang: kommende Schauen, Anzeigen der Förderer und Notizseiten bis zur vollen Heftlage. */
import { kommendeSchauen, schauTage, TERMIN_EBENE_INFO, zeitraumDe } from "@schau/domain";
import { ladeKommende } from "../services/termine";
import { datumDe, GRAU, HAARLINIE, MM, TINTE } from "./basis";
import { FETT, KURSIV, NORMAL } from "./katalog-schrift";
import type { Beitrag, KatalogKontext } from "./katalog-kontext";

/** Kommende Schauen nach dieser Schau (Kreis, Land, Bund, Europa). */
export async function kommendeSchauenSeite(K: KatalogKontext) {
  const { G, s, gestaltung, k, ohne, doc, L, B, neueSeite, platz, abschnitt, marke, seitentitel, zwischentitel } = K;
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
        doc.font(FETT).fontSize(G.liste);
        const hName = doc.heightOfString(t.name, { width: B() - datumBreite });
        doc.font(NORMAL).fontSize(G.liste);
        const hOrt = t.ort ? doc.heightOfString(t.ort, { width: B() - datumBreite }) : 0;
        const h = Math.max(hName + hOrt, 10 * k);
        platz(h + 6 * k);
        const y = doc.y;
        doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(wann, L(), y + 0.3 * k, { width: datumBreite - 8 });
        doc.font(FETT).fontSize(G.liste).fillColor(TINTE).text(t.name, L() + datumBreite, y, { width: B() - datumBreite });
        if (t.ort) doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(t.ort, L() + datumBreite, doc.y, { width: B() - datumBreite });
        const yl = y + h + 2.6 * k;
        doc.save().lineWidth(0.3).strokeColor(HAARLINIE).moveTo(L(), yl).lineTo(L() + B(), yl).stroke().restore();
        doc.y = yl + 3 * k;
      }
      if (g.gekuerzt) doc.font(KURSIV).fontSize(G.klein).fillColor(GRAU).text(`… und ${g.gekuerzt} weitere`, L() + datumBreite, doc.y, { width: B() - datumBreite });
      doc.y += 4 * k;
    }
    const quellen = [...new Set(kommend.flatMap((g) => g.termine.map((t) => t.quelle)).filter(Boolean))];
    const hinweis = `Stand: ${datumDe(new Date())}${quellen.length ? ` · Quellen: ${quellen.join(", ")}` : ""} · Angaben ohne Gewähr – bitte vor dem Besuch beim Veranstalter nachsehen.`;
    doc.font(KURSIV).fontSize(G.klein);
    platz(doc.heightOfString(hinweis, { width: B() }) + 8 * k);
    doc.y += 4 * k;
    doc.fillColor(GRAU).text(hinweis, L(), doc.y, { width: B() });
    doc.fillColor(TINTE);
  }
}

/** Anzeigen der Förderer im Raster aus 2 × 2 Feldern. */
export function anzeigenSeiten(K: KatalogKontext) {
  const { G, beitraege, bildVon, k, flaeche, farbe, lk, doc, L, B, unten, neueSeite, abschnitt, marke, seitentitel } = K;
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
    const titelGr = w < B() ? G.h3 : G.h2;
    doc.font(FETT).fontSize(titelGr);
    const hTitel = doc.heightOfString(a.titel, { width: ib });
    doc.font(NORMAL).fontSize(G.liste);
    const hUnter = a.unterzeile ? doc.heightOfString(a.unterzeile, { width: ib }) + 2 : 0;
    doc.font(NORMAL).fontSize(G.text);
    const hText = a.text ? Math.min(doc.heightOfString(a.text, { width: ib, lineGap: 1.5 * k }) + 8 * k, h - 2 * innen - hTitel - hUnter) : 0;
    let ty = y + Math.max(innen, (h - hTitel - hUnter - hText) / 2);
    doc.font(FETT).fontSize(titelGr).fillColor(farbe).text(a.titel, x + innen, ty, { width: ib, align: "center" });
    ty = doc.y;
    if (a.unterzeile) {
      doc.font(NORMAL).fontSize(G.liste).fillColor(GRAU).text(a.unterzeile, x + innen, ty + 2, { width: ib, align: "center" });
      ty = doc.y;
    }
    if (a.text) doc.font(NORMAL).fontSize(G.text).fillColor(TINTE).text(a.text, x + innen, ty + 8 * k, { width: ib, height: Math.max(10, y + h - ty - innen - 8 * k), align: "center", lineGap: 1.5 * k, ellipsis: true });
  }
}

/** Notiz- bzw. Füllseiten bis zur vollen Heftlage. */
export function notizSeiten(K: KatalogKontext) {
  const { G, a4, k, ohne, doc, seiten, L, B, unten, neueSeite, marke, seitentitel } = K;
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
}
