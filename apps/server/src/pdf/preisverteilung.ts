/**
 * Preisverteilung je Preisrichter als PDF: welche Preise er vergeben darf, mit Katalognummer, sobald vergeben, und
 * leeren Zeilen zum Eintragen in der Halle. Ohne Ausstellernamen (Entscheidung 005). Die Zeilen rechnet
 * `preisverteilung` (packages/domain), das Kontingent `kontingente` – dieselbe Rechnung wie auf der Seite „Preise“.
 * Gestiftete Preisarten mit „zusätzlich je Preisrichter“ bekommen bei Kontingent je Preisrichter so viele Zeilen (ihr
 * Kontingent für Preise ohne Stiftung, mehr ist „über dem Kontingent“); Preise aus einer Stiftung belegen keine davon
 * und stehen zusätzlich darin.
 */
import { formatEuro, preisverteilung, type VerteilungArt } from "@schau/domain";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { prEinteilung, preisart, preisrichter, stiftung } from "../db/schema";
import { ladeEintraege } from "../services/eintraege";
import { ausgestellt, kontingente, zuteilung } from "../services/pruefung";
import { briefkopf, datumDe, erzeugePdf, fusszeilen, GRAU, MM, SANS, tabelle, TINTE } from "./basis";
import { A4_RAENDER, breite, kopfzeile, ladeDesign, nr, type Schau, verein } from "./dokumente-gemeinsam";

/** Alle Preisrichter der Schau (je einer ab neuer Seite) oder nur `preisrichterId`. Null: Preisrichter nicht in dieser Schau. */
export async function preisverteilungPdf(s: Schau, preisrichterId?: number) {
  const [eintraege, einteilung, richter, arten, stiftungen, d] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
    db.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge)),
    db.select({ id: stiftung.id, stifter: stiftung.stifter }).from(stiftung).where(eq(stiftung.schauId, s.id)),
    ladeDesign(s),
  ]);
  const auswahl = preisrichterId == null ? richter : richter.filter((r) => r.id === preisrichterId);
  if (preisrichterId != null && !auswahl.length) return null;
  const zu = zuteilung(eintraege, einteilung);
  // Kontingent je Preisrichter; gilt es für die ganze Schau, hat der einzelne Preisrichter keins (nur Vergebenes).
  const jePr = s.kontingentJe === "preisrichter";
  const kont = jePr ? kontingente(eintraege, zu, richter, arten, "preisrichter") : [];
  const stifter = new Map(stiftungen.map((x) => [x.id, x.stifter]));

  const blaetter = auswahl.map((r) => {
    const seine = eintraege.filter((e) => zu.get(e.id) === r.id);
    const k = kont.find((x) => x.preisrichterId === r.id);
    const vArten: VerteilungArt[] = arten.map((a) => ({
      preisartId: a.id,
      kuerzel: a.kuerzel,
      name: a.name,
      betragCent: a.betragCent,
      sachpreis: a.sachpreis,
      // Kontingent aus `kontingente` (Standgeld und Zusatzpreise „zusätzlich je Preisrichter“), wie bei der Vergabe;
      // gestiftete ohne Zusatzpreise haben keins.
      verfuegbar: k?.arten.find((x) => x.preisartId === a.id)?.verfuegbar ?? null,
    }));
    // Gleiche Zählung wie das Kontingent: alle Preise an Tieren seiner Nummern, in Katalogfolge; Preise aus einer
    // Stiftung zählen nicht zum Kontingent (ausStiftung).
    const vergaben = seine.flatMap((e) =>
      e.preise.map((p) => ({ preisartId: p.preisartId, nr: nr(e), betragCent: p.betragCent, zusatz: p.stiftungId ? (stifter.get(p.stiftungId) ?? "") : "", fehlt: e.status === "fehlt", ausStiftung: p.stiftungId != null })),
    );
    const bereiche = einteilung.filter((x) => x.preisrichterId === r.id).map((x) => (x.vonNr === x.bisNr ? `${x.vonNr}` : `${x.vonNr}–${x.bisNr}`)).join(", ");
    // Tierzahl wie beim Kontingent (ohne fehlende), auch wenn das Kontingent für die ganze Schau gilt.
    return { r, tiere: seine.filter(ausgestellt).length, bereiche, ...preisverteilung(vArten, vergaben) };
  });

  return erzeugePdf(
    "Preisverteilung",
    (doc) => {
      const anfaenge: number[] = [];
      if (!blaetter.length) {
        briefkopf(doc, d, { verein: verein(s), zeile: kopfzeile(s), art: "Preisverteilung", titel: "Keine Preisrichter angelegt" });
      }
      blaetter.forEach((b, i) => {
        if (i > 0) doc.addPage();
        anfaenge.push(doc.bufferedPageRange().count - 1);
        briefkopf(doc, d, {
          verein: verein(s),
          zeile: kopfzeile(s),
          art: "Preisverteilung",
          titel: b.r.name,
          unter: jePr ? "Leere Zeilen: noch zu vergeben. Katalognummer eintragen." : "Das Kontingent gilt für die gesamte Schau – hier stehen nur die vergebenen Preise.",
          angaben: [
            ["Bewertung", datumDe(s.bewertungAm) || "–"],
            ["Nummern", b.bereiche || "–"],
            ["Tiere", String(b.tiere)],
          ],
        });
        if (!b.zeilen.length) {
          doc.font(SANS).fontSize(9).fillColor(GRAU).text("Keine Preise zu vergeben.").fillColor(TINTE);
          return;
        }
        const w = breite(doc);
        // Zwischen „Wert“ (rechtsbündig) und „Bemerkung“ eine leere Spalte, sonst stoßen Betrag und Text aneinander.
        const fest = 18 * MM + 22 * MM + 26 * MM + 5 * MM + 50 * MM;
        tabelle(
          doc,
          [
            { titel: "Anzahl", breite: 18 * MM, align: "right" },
            { titel: "Preis", breite: w - fest },
            { titel: "Kat.-Nr.", breite: 22 * MM, align: "right", fett: true },
            { titel: "Wert", breite: 26 * MM, align: "right" },
            { titel: "", breite: 5 * MM },
            { titel: "Bemerkung", breite: 50 * MM },
          ],
          b.zeilen.map((z) => [
            String(z.lfd),
            `${z.kuerzel} ${z.name}`,
            z.nr,
            z.betragCent > 0 ? formatEuro(z.betragCent) : z.sachpreis || "–",
            "",
            [z.zusatz, z.fehlt ? "Tier fehlt" : "", z.ueberKontingent ? "über dem Kontingent" : ""].filter(Boolean).join(" · "),
          ]),
          // Zeilenhöhe 7 mm: Platz, um die Katalognummer von Hand einzutragen.
          { schrift: 9, zeilenhoehe: 20, streifen: d.flaeche, summe: ["", "Gesamtwert", "", formatEuro(b.gesamtCent), "", `davon vergeben ${formatEuro(b.vergebenCent)}`] },
        );
      });
      fusszeilen(doc, `Preisverteilung · ${s.name}`, anfaenge);
    },
    { margins: A4_RAENDER },
  );
}
