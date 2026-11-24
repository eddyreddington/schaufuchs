/**
 * Katalog kürzt nicht (Entscheidung 032, Rückmeldung eines Vereins: „Im Katalog wird abgekürzt, das darf nicht sein“):
 * Testschau mit sehr langen Namen – Sparte, Rasse, Farbenschlag mit Zusatz, Preisrichter, Doppelname des Ausstellers,
 * Verein und Schau – über jede Schriftwahl, jede Aufteilung, A4 und A5, mit und ohne Ergebnisse und den Kurzkatalog.
 * Jeder Name steht vollständig im PDF (Umbrüche und Trennstriche beim Vergleich entfernt), nirgends „…“, keine zwei
 * Wörter überlappen (pdftotext -bbox), keine Warnung „Text ohne Platz“. Teil des Schau-Ablaufs.
 * Mit KATALOG_ABLAGE=<Ordner> legt der Test die PDFs dort ab (Sichtprüfung mit pdftoppm).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KATALOG_AUFTEILUNGEN, KATALOG_SCHRIFTEN, KATALOG_STILE } from "@schau/domain";
import { adminKontext, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const LANG = {
  schau: "Kreisjungtierschau des Kreisverbands Oberes Talgrund-Wiesengebiet mit angeschlossener Jugendschau",
  teilschau: "Landesverbandsjugendschau des Landesverbands Oberes Talgrund-Wiesengebiet", // höchstens 80 Zeichen
  sparte: "Zwerghühner, Groß- und Wassergeflügel der Sonderabteilung Nordwest",
  rasse: "Niederländische Zwerg-Barthühner mit sehr langem Namen",
  farbenschlag: "silber-schwarzgesäumt mit weißem Bart und Haube",
  zusatz: "(AOC, Neuzüchtung)",
  richter: "Prof. Dr. Friedrich-Wilhelm Hohenlohe-Langenburg-Schillingsfürst",
  vorname: "Hans-Joachim Maximilian",
  nachname: "Müller-Lüdenscheidt-Hohenzollern von Grünberg",
  verein: "Rassegeflügelzuchtverein Oberes Talgrund-Wiesengebiet und Umgebung von 1898",
};

/** Text in der Reihenfolge des Setzens (pdftotext -raw): die Zeilen eines umbrochenen Felds stehen beieinander. */
function pdf2(pdf: Buffer, ...args: string[]): string {
  const datei = join(tmpdir(), `schau-kuerzen-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(datei, pdf);
  try {
    const r = Bun.spawnSync(["pdftotext", ...args, datei, "-"]);
    if (r.exitCode !== 0) throw new Error(`pdftotext fehlgeschlagen: ${r.stderr.toString()}`);
    return r.stdout.toString();
  } finally {
    rmSync(datei, { force: true });
  }
}
/** Ohne Leerraum, Binde- und Trennstriche: so zählen Umbrüche (auch mitten im Wort) nicht. */
const norm = (t: string) => t.replace(/[\s­\-–]+/g, "");
const anzahl = (text: string, teil: string) => norm(text).split(norm(teil)).length - 1;

/** Wörter, die über den rechten Rand der Seite hinausragen (weniger als 8 mm Rand; Seitenbreite aus pdftotext -bbox). */
function ueberRand(pdf: Buffer): string[] {
  return pdf2(pdf, "-bbox")
    .split("<page ")
    .slice(1)
    .flatMap((seite, i) => {
      const breite = +(seite.match(/width="([\d.]+)"/)?.[1] ?? 0);
      return [...seite.matchAll(/xMax="([\d.]+)" yMax="[\d.]+">([^<]*)</g)].filter((x) => +x[1]! > breite - (8 / 25.4) * 72).map((x) => `S. ${i + 1}: „${x[2]}“`);
    });
}
/** Spaltenköpfe, die ohne Luft aneinanderstoßen (pdftotext liest sie dann als ein Wort, z. B. „PREISAUSSTELLER“). */
const KOEPFE = "NR\\.|KLASSE|FARBENSCHLAG|AUSSTELLER|NOTE|NOTIZ|PREIS|VKPR\\.";
const KOEPFE_ZUSAMMEN = new RegExp(`(?:${KOEPFE})(?:${KOEPFE})`, "g");

/** Paare von Wörtern auf derselben Seite, deren Kästen sich überschneiden (mehr als ein Drittel der Höhe, > 0,5 pt breit). */
function ueberlappungen(pdf: Buffer): string[] {
  const funde: string[] = [];
  pdf2(pdf, "-bbox")
    .split("<page ")
    .slice(1)
    .forEach((seite, i) => {
      const w = [...seite.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map((x) => ({ x0: +x[1]!, y0: +x[2]!, x1: +x[3]!, y1: +x[4]!, t: x[5]! }));
      for (let a = 0; a < w.length; a++)
        for (let b = a + 1; b < w.length; b++) {
          const p = w[a]!;
          const q = w[b]!;
          const dx = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
          const dy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
          if (dx > 0.5 && dy > Math.min(p.y1 - p.y0, q.y1 - q.y0) / 3) funde.push(`S. ${i + 1}: „${p.t}“ / „${q.t}“`);
        }
    });
  return funde;
}

describe("Katalog kürzt nicht", () => {
  test("lange Namen brechen um: vollständig, ohne „…“, ohne Überlappung – jede Schrift, Aufteilung, Format", async () => {
    const { katalogPdf } = await import("../pdf/katalog");
    const { id } = await al().schau.anlegen({ name: LANG.schau, ort: "Halle" });
    const s0 = await al().schau.get({ id });
    const vid = s0.stammdatenVersionId!;
    // Eine Teilschau mit langem Namen: er steht über jeder Abteilung in der Versalzeile.
    await al().schau.teilschauenSetzen({ id, teilschauen: [{ name: LANG.teilschau }] });
    const [sp] = await m.db.insert(m.schema.sparte).values({ versionId: vid, name: LANG.sparte, folge: 999 }).returning();
    const [ra] = await m.db.insert(m.schema.rasse).values({ versionId: vid, sparteId: sp!.id, name: LANG.rasse, folge: 999 }).returning();
    const [fs] = await m.db.insert(m.schema.farbenschlag).values({ versionId: vid, rasseId: ra!.id, name: LANG.farbenschlag, folge: 1 }).returning();
    const aussteller = (vorname: string, nachname: string) => ({ vorname, nachname, strasse: "", plz: "", ort: "Talgrund-Wiesengebiet", telefon: "", email: "", verein: LANG.verein, kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
    const pos = (geschlecht: string) => ({ farbenschlagId: fs!.id, freitext: "", art: "einzeltier" as const, geschlecht, alter: "jung" as const, istAoc: true, istNeuzuechtung: true, eigeneZucht: true, verkaufspreisCent: 2500 });
    const melde = async (istJugend: boolean, n: number) => {
      const r = await al().meldung.speichern({ schauId: id, aussteller: aussteller(LANG.vorname, LANG.nachname), eingang: "papier", istJugend, bemerkung: "", zustimmung: true, positionen: Array.from({ length: n }, (_, i) => pos(i % 2 ? "0,1" : "1,0")) });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    };
    await melde(false, 4);
    await melde(true, 2);
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId: id, name: LANG.richter }).returning();
    await m.db.insert(m.schema.prEinteilung).values({ schauId: id, preisrichterId: pr!.id, vonNr: 1, bisNr: 9999 });
    const [preis] = await m.db.insert(m.schema.preisart).values({ schauId: id, kuerzel: "SE", name: "Siegerehrenpreis des Kreisverbands" }).returning();

    /** Jugend eingereiht (mit „Jgd.“) ohne Ergebnisse, als eigener Block mit Ergebnissen. */
    const stand = async (mitErgebnis: boolean) => {
      await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), jugendSeparat: mitErgebnis } });
      await al().katalog.nummernVergeben({ schauId: id });
      const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id));
      if (mitErgebnis) {
        for (const t of tiere) await m.db.insert(m.schema.bewertung).values({ katalogeintragId: t.id, preisrichterId: pr!.id, punkte: 96 }).onConflictDoNothing();
        await m.db.insert(m.schema.preisvergabe).values({ katalogeintragId: tiere[0]!.id, preisartId: preis!.id }).onConflictDoNothing();
      }
      const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id));
      return { ...s!, ergebnisseFreigegeben: mitErgebnis };
    };

    const ablage = process.env.KATALOG_ABLAGE;
    if (ablage) mkdirSync(ablage, { recursive: true });
    const warnungen: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => void warnungen.push(a.map(String).join(" "));
    const fehler: unknown[] = [];
    let i = 0;
    try {
      for (const mitErgebnis of [false, true]) {
        const s = await stand(mitErgebnis);
        for (const schrift of KATALOG_SCHRIFTEN) {
          const faelle = [
            ...KATALOG_AUFTEILUNGEN.map((aufteilung) => ({ aufteilung, format: "A4" as const, kurz: false })),
            { aufteilung: "zweispaltig" as const, format: "A5" as const, kurz: false },
            { aufteilung: "tabelle" as const, format: "A5" as const, kurz: false },
            { aufteilung: "zweispaltig" as const, format: "A5" as const, kurz: true },
          ];
          for (const { aufteilung, format, kurz } of faelle) {
            const stil = KATALOG_STILE[i++ % KATALOG_STILE.length]!;
            const fall = `${mitErgebnis ? "mit" : "ohne"}/${schrift}/${aufteilung}/${format}/${stil}${kurz ? "/kurz" : ""}`;
            const pdf = await katalogPdf(s, { kurz, vorschau: { schrift, aufteilung, format, stil } });
            if (ablage) writeFileSync(join(ablage, `${fall.replaceAll("/", "-")}.pdf`), pdf);
            const text = pdf2(pdf, "-raw");
            // Jeder Name ganz: Rasse (Kopf, Kolumnentitel, Verzeichnis), Farbenschlag mit Zusatz, Preisrichter, Aussteller
            // in jeder Tierzeile (6 Tiere) und im Verzeichnis, Sparte, Verein, Schau.
            const mindestens: [string, number][] = [
              [LANG.rasse, 2],
              [`${LANG.farbenschlag} ${LANG.zusatz}`, 1],
              [`Preisrichter: ${LANG.richter}`, 1],
              [LANG.nachname, 7],
              [`${LANG.nachname}, ${LANG.vorname}`, 1],
              [LANG.sparte, 2],
              [LANG.verein, 1],
              [LANG.schau, 1],
            ];
            const fehlt = mindestens.filter(([t, n]) => anzahl(text, t) < n).map(([t, n]) => `${t}: ${anzahl(text, t)} statt ${n}`);
            // Die Teilschau steht in der Versalzeile über jeder Abteilung (in Großbuchstaben) und davor, nicht angehängt.
            const gross = (t: string) => t.toLocaleUpperCase("de");
            if (anzahl(gross(text), `${gross(LANG.teilschau)} · SPARTE`) < 1) fehlt.push("Teilschau in der Versalzeile");
            const gekuerzt = text.replace(/… und \d+ weitere/g, "").match(/\S*…\S*/g) ?? [];
            const ueber = ueberlappungen(pdf);
            const rand = ueberRand(pdf);
            const koepfe = text.match(KOEPFE_ZUSAMMEN) ?? [];
            if (fehlt.length || gekuerzt.length || ueber.length || rand.length || koepfe.length) fehler.push({ fall, fehlt, gekuerzt, ueber: ueber.slice(0, 4), rand: rand.slice(0, 4), koepfe: [...new Set(koepfe)] });
          }
        }
      }
      // Titelseite einer Testschau, vorläufig, A5, Stil „modern“: die lange Versalzeile passt, ohne den Titel zu berühren.
      const [zeile] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id));
      const st = { ...zeile!, ergebnisseFreigegeben: false, test: true, katalogGedruckt: false };
      const titel = await katalogPdf(st, { kurz: false, vorschau: { schrift: "klassisch", aufteilung: "zweispaltig", format: "A5", stil: "modern" } });
      const ersteSeite = pdf2(titel, "-f", "1", "-l", "1", "-raw");
      if (!/TESTSCHAU – KEINE ECHTE AUSSTELLUNG · AUSSTELLUNGSKATALOG · VORLÄUFIG\n/.test(ersteSeite) || ueberRand(titel).length || ueberlappungen(titel).length)
        fehler.push({ fall: "Testschau/A5/modern", titel: ersteSeite.split("\n").slice(0, 3), rand: ueberRand(titel), ueber: ueberlappungen(titel) });
    } finally {
      console.warn = warn;
    }
    expect(fehler).toEqual([]);
    expect(warnungen.filter((w) => w.includes("Text ohne Platz"))).toEqual([]);
  }, 300_000);
});
