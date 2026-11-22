/**
 * Katalog-Schriften (Entscheidung 032): jedes Katalog-PDF – jede Schriftwahl, jede Aufteilung, A4 und A5, Kurzkatalog
 * und /s/:slug/katalog.pdf – bettet nur Schnitte der gewählten Familie ein (keine Helvetica, keine Times, keine zweite
 * Familie für Tabellen oder Kursives). Eine Auszeichnungsschrift nur dort, wo die Wahl sie nennt, und nur auf der
 * Titelseite. Der Text steht vollständig darin, nichts mit „…“ gekürzt (pdftotext). Teil des Schau-Ablaufs.
 * Mit KATALOG_ABLAGE=<Ordner> legt der Test die PDFs dort ab (Sichtprüfung mit pdftoppm), mit KATALOG_NUR_ABLEGEN=1
 * zusätzlich ohne Prüfung (Stand vor einer Änderung festhalten).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatKatalognummer, KATALOG_AUFTEILUNGEN, KATALOG_SCHRIFTEN, KATALOG_STILE, type KatalogSchrift } from "@schau/domain";
import { adminKontext, m, pdfText } from "./kontext";

/** Erwartung unabhängig von der Domain: Name der Familie im PDF (PostScript) und die Auszeichnung der Titelseite. */
const ERWARTET: Record<KatalogSchrift, { familie: string; titel?: string }> = {
  klassisch: { familie: "IBMPlexSansCond" },
  traditionell: { familie: "EBGaramond" },
  lesbar: { familie: "AtkinsonHyperlegible" },
  modern: { familie: "SourceSans3" },
  buchschmal: { familie: "IBMPlexSansCond", titel: "EBGaramond" },
  ausgewogen: { familie: "SourceSans3", titel: "Spectral" },
};

/** Eingebettete Schriften (ohne Teilmengen-Kennung „ABCDEF+“), auf Wunsch erst ab Seite `ab`. */
function schriften(pdf: Buffer, ab = 1): string[] {
  const datei = join(tmpdir(), `schau-schriften-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(datei, pdf);
  try {
    const r = Bun.spawnSync(["pdffonts", "-f", String(ab), datei]);
    if (r.exitCode !== 0) throw new Error(`pdffonts fehlgeschlagen: ${r.stderr.toString()}`);
    const zeilen = r.stdout.toString().split("\n").slice(2).filter((z) => z.trim());
    return [...new Set(zeilen.map((z) => z.split(/\s+/)[0]!.replace(/^[A-Z]{6}\+/, "")))].sort();
  } finally {
    rmSync(datei, { force: true });
  }
}

const zurFamilie = (name: string, familie: string) => name === familie || name.startsWith(`${familie}-`);

describe("Katalog-Schriften: eine Familie je Katalog", () => {
  test("jede Schrift und jede Aufteilung: nur Schnitte der gewählten Familie, Text vollständig", async () => {
    const { katalogPdf } = await import("../pdf/katalog");
    const al = m.appRouter.createCaller(adminKontext);
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const nummern = (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, s!.id)))
      .filter((e) => e.katalogNr != null)
      .map((e) => formatKatalognummer(e));
    expect(nummern.length).toBeGreaterThan(5);
    const ablage = process.env.KATALOG_ABLAGE;
    if (ablage) mkdirSync(ablage, { recursive: true });

    const warnungen: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => void warnungen.push(a.map(String).join(" "));
    try {
      let i = 0;
      for (const schrift of KATALOG_SCHRIFTEN) {
        const { familie, titel } = ERWARTET[schrift];
        const faelle = [
          ...KATALOG_AUFTEILUNGEN.map((aufteilung) => ({ aufteilung, format: "A4" as const })),
          { aufteilung: "zweispaltig" as const, format: "A5" as const },
          { aufteilung: "tabelle" as const, format: "A5" as const },
        ];
        for (const { aufteilung, format } of faelle) {
          const stil = KATALOG_STILE[i++ % KATALOG_STILE.length]!;
          const pdf = await katalogPdf(s!, { vorschau: { schrift, aufteilung, format, stil } });
          if (ablage) {
            writeFileSync(join(ablage, `${schrift}-${aufteilung}-${format}.pdf`), pdf);
            if (process.env.KATALOG_NUR_ABLEGEN) continue;
          }
          const fall = `${schrift}/${aufteilung}/${format}/${stil}`;
          const alle = schriften(pdf);
          // Nur die Familie (normal, fett, kursiv) und höchstens die genannte Auszeichnung der Titelseite.
          expect({ fall, fremd: alle.filter((n) => !zurFamilie(n, familie) && !(titel && zurFamilie(n, titel))) }).toEqual({ fall, fremd: [] });
          expect({ fall, schnitte: alle.filter((n) => zurFamilie(n, familie)).length <= 3 }).toEqual({ fall, schnitte: true });
          expect({ fall, auszeichnung: alle.filter((n) => titel && zurFamilie(n, titel)).length <= 1 }).toEqual({ fall, auszeichnung: true });
          // Ab Seite 2 nur noch die Familie.
          expect({ fall, ab2: schriften(pdf, 2).filter((n) => !zurFamilie(n, familie)) }).toEqual({ fall, ab2: [] });
          const text = pdfText(pdf);
          expect(text).toContain(s!.name);
          const fehlend = nummern.filter((n) => !new RegExp(`(^|\\s)${n}(\\s|$)`, "m").test(text));
          expect({ fall, fehlend }).toEqual({ fall, fehlend: [] });
          // Nichts mit „…“ gekürzt (die Testschau hat keine überlangen Angaben).
          expect({ fall, gekuerzt: text.match(/\S*…/g) ?? [] }).toEqual({ fall, gekuerzt: [] });
        }
        // Kurzkatalog (Vorschau in der Oberfläche) in derselben Familie.
        const kurz = await katalogPdf(s!, { kurz: true, vorschau: { schrift } });
        if (ablage) writeFileSync(join(ablage, `${schrift}-kurz.pdf`), kurz);
        if (process.env.KATALOG_NUR_ABLEGEN) continue;
        expect({ schrift, fremd: schriften(kurz, 2).filter((n) => !zurFamilie(n, familie)) }).toEqual({ schrift, fremd: [] });
      }
      expect(warnungen.filter((w) => w.includes("Text ohne Platz"))).toEqual([]);
    } finally {
      console.warn = warn;
    }

    // Öffentlicher Katalog /s/:slug/katalog.pdf mit der gespeicherten Schrift.
    const vorher = (await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung;
    const server = (await import("../index")).default;
    // Eigene Adresse für die Bremse des öffentlichen Katalogs (die übrigen Tests teilen sich sonst eine).
    const cfg = (await import("../config")).config;
    const proxyVorher = cfg.trustProxy;
    cfg.trustProxy = true;
    const antwort = await Promise.resolve(server.fetch(new Request(`http://test/s/${s!.slug}/katalog.pdf`, { headers: { "x-forwarded-for": "192.0.2.82" } }))).finally(() => (cfg.trustProxy = proxyVorher));
    const pdf = Buffer.from(await antwort.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { familie, titel } = ERWARTET[vorher.schrift];
    expect(schriften(pdf).filter((n) => !zurFamilie(n, familie) && !(titel && zurFamilie(n, titel)))).toEqual([]);
  }, 300_000);
});
