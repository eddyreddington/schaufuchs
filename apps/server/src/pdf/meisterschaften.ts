/**
 * Ergebnisse der Meisterschaften als PDF (A4): je Meisterschaft und Rasse/Farbenschlag die Rangfolge mit den gewerteten
 * Tieren (Katalognummer und Punkte), der Summe und dem Titel. Namen wie im gedruckten Katalog.
 */
import { datumDe, type Design, erzeugePdf, fusszeilen, GRAU, kicker, MM, SANS, SANS_FETT, SERIF, tabelle, TINTE } from "./basis";
import type { meisterschaftErgebnisse } from "../services/meisterschaften";

type Ergebnisse = Awaited<ReturnType<typeof meisterschaftErgebnisse>>;

export function meisterschaftenPdf(d: Design, schau: { name: string; ort: string }, ergebnisse: Ergebnisse) {
  return erzeugePdf(
    `Meisterschaften ${schau.name}`,
    (doc) => {
      const x = doc.page.margins.left;
      const w = doc.page.width - x - doc.page.margins.right;
      kicker(doc, "Meisterschaften", x, doc.y, d.farbe, w);
      doc.font(SERIF).fontSize(18).fillColor(TINTE).text(schau.name, x, doc.y + 10, { width: w });
      doc.font(SANS).fontSize(9).fillColor(GRAU).text([schau.ort, `Stand ${datumDe(new Date())}`].filter(Boolean).join(" · "), x, doc.y + 2, { width: w });
      if (!ergebnisse.length) doc.font(SANS).fontSize(10).fillColor(TINTE).text("Für diese Schau sind keine Meisterschaften eingerichtet.", x, doc.y + 8 * MM);
      for (const e of ergebnisse) {
        if (doc.y > doc.page.height - 60 * MM) doc.addPage();
        doc.font(SANS_FETT).fontSize(12.5).fillColor(TINTE).text(e.regel.name, x, doc.y + 8 * MM, { width: w });
        if (!e.gruppen.length) doc.font(SANS).fontSize(9).fillColor(GRAU).text("Keine gewerteten Tiere.", x, doc.y + 2);
        for (const g of e.gruppen) {
          if (doc.y > doc.page.height - 45 * MM) doc.addPage();
          const titel = e.regel.art === "verein" ? "Vereine" : [g.sparte, g.rasse, g.farbenschlag].filter(Boolean).join(" · ");
          doc.font(SANS_FETT).fontSize(9.5).fillColor(d.farbe).text(`${titel}${g.jugend ? " (Jugend)" : ""}`, x, doc.y + 4 * MM, { width: w });
          if (g.hinweis) doc.font(SANS).fontSize(8.5).fillColor(GRAU).text(g.hinweis, x, doc.y + 1, { width: w });
          doc.y += 2;
          tabelle(
            doc,
            [
              { titel: "Platz", breite: 12 * MM, align: "right" },
              { titel: e.regel.art === "verein" ? "Verein" : "Aussteller", breite: 48 * MM },
              { titel: "Gewertete Tiere (Kat.-Nr. Punkte)", breite: w - 12 * MM - 48 * MM - 16 * MM - 36 * MM },
              { titel: "Summe", breite: 16 * MM, align: "right", fett: true },
              { titel: "", breite: 36 * MM },
            ],
            g.kandidaten.map((k) => [
              k.rang != null ? `${k.rang}.` : "",
              k.name,
              k.gezaehlt.map((t) => `${t.katalogNr ?? "–"}: ${t.punkte}`).join(", "),
              String(k.summe),
              k.titel ? "Titel" : (k.grund ?? ""),
            ]),
            { schrift: 8.5, streifen: d.flaeche },
          );
        }
      }
      fusszeilen(doc, `Meisterschaften · ${schau.name}`);
    },
    { margins: { top: 15 * MM, bottom: 18 * MM, left: 18 * MM, right: 15 * MM } },
  );
}
