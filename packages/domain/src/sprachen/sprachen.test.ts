import { describe, expect, test } from "bun:test";
import { datenschutzKurz } from "../datenschutz";
import { formatEuro } from "../geld";
import { datumIn, euroIn, istSprache, passendeSprache, SPRACHEN, SPRACHNAME, texte, type Sprache } from ".";

/** Alle Texte als Liste [Pfad, Wert]; Texte mit Platzhaltern werden mit Beispielwerten aufgerufen. */
function alleTexte(sprache: Sprache): [string, string][] {
  const aus: [string, string][] = [];
  // Immer dieselben Beispielwerte (überzählige ignoriert der Text); die Umschreibung für Schweiz/Französisch hat keine feste Stellenzahl.
  const beispiel = (f: (...a: never[]) => unknown) => (f as (...a: unknown[]) => unknown)("WERT_A", 7, "WERT_2", "WERT_3");
  const lauf = (pfad: string, wert: unknown) => {
    if (typeof wert === "string") aus.push([pfad, wert]);
    else if (typeof wert === "function") {
      const r = beispiel(wert as (...a: never[]) => unknown);
      for (const [i, x] of (Array.isArray(r) ? r : [r]).entries()) aus.push([`${pfad}()${Array.isArray(r) ? `[${i}]` : ""}`, String(x)]);
    } else if (wert && typeof wert === "object") for (const [k, v] of Object.entries(wert)) lauf(pfad ? `${pfad}.${k}` : k, v);
  };
  lauf("", texte(sprache));
  return aus;
}

describe("Sprachen der Aussteller-Seiten (Entscheidung 020)", () => {
  test("jede Sprache hat jeden Text, keiner ist leer (außer dem Hinweis „nur deutsch“ auf Deutsch)", () => {
    const schluessel = alleTexte("de").map(([p]) => p);
    for (const s of SPRACHEN) {
      const t = alleTexte(s);
      expect(t.map(([p]) => p).sort()).toEqual([...schluessel].sort());
      const leer = t.filter(([p, w]) => !w.trim() && !(p === "rahmen.nurDeutsch" && s.startsWith("de")));
      expect(leer).toEqual([]);
      expect(SPRACHNAME[s]).toBeTruthy();
    }
  });

  test("Übersetzungen sind keine Kopie des Deutschen (außer gleichlautenden Wörtern)", () => {
    const de = new Map(alleTexte("de"));
    for (const s of SPRACHEN.filter((x) => !x.startsWith("de"))) {
      const gleich = alleTexte(s).filter(([p, w]) => de.get(p) === w && w.length > 12);
      expect(gleich).toEqual([]);
    }
  });

  test("Platzhalter: der eingesetzte Text steht in jeder Sprache im Ergebnis", () => {
    for (const s of SPRACHEN) {
      const t = texte(s);
      expect(t.mail.eingegangen("Kreisschau Nord")).toContain("Kreisschau Nord");
      expect(t.schau.abgesagt("Vogelgrippe")).toContain("Vogelgrippe");
      expect(t.mail.lastschrift("Kreisschau", "12,00 €", "01.12.2026", "DE89 …")).toContain("DE89 …");
      expect(t.tiere.fehlerRingDoppelt("D26AZ1", 3)).toContain("D26AZ1");
      expect(t.datenschutzKurz("Verein X", 14, 3, 8).join(" ")).toContain("Verein X");
      // Leerer Name: Anrede ohne Namen, ohne Komma-Doppelung.
      expect(t.mail.gutenTag("")).not.toContain(" ,");
      expect(t.schau.abgesagt("")).not.toContain(": ");
    }
  });

  test("Deutsch (Schweiz): ss statt ß – aber nur im festen Text, eingesetzte Namen bleiben", () => {
    const ch = alleTexte("de-CH");
    expect(ch.filter(([, w]) => /ß/.test(w))).toEqual([]);
    const t = texte("de-CH");
    expect(t.person.strasse).toBe("Strasse und Hausnummer");
    expect(t.mail.gruesse).toBe("Mit freundlichen Grüssen");
    expect(t.mail.eingegangen("Großschau Weißenfels")).toBe("Ihre Meldung zur Schau „Großschau Weißenfels“ ist eingegangen.");
    expect(t.datenschutzKurz("Verein Groß", 14, 3, 8)[0]).toBe("Verantwortlich: Verein Groß.");
    // Sonst genau wie Deutsch.
    expect(t.tiere.zeilen(2)).toBe("2 Zeilen");
  });

  test("Französisch: geschütztes Leerzeichen vor Doppelpunkt und Fragezeichen, nicht im eingesetzten Wert", () => {
    const t = texte("fr");
    expect(t.formular.wofuer).toBe("Pour quoi ?");
    expect(t.schau.zahlungAn).toBe("Paiement à :");
    expect(t.mail.bankverbindung("IBAN : FR76")).toBe("Coordonnées bancaires : IBAN : FR76");
    expect(t.tiere.freiUebernehmen("Coq")).toBe("Reprendre « Coq » comme texte libre");
  });

  test("Mehrzahl in Polnisch und Tschechisch", () => {
    expect([1, 2, 5, 12, 22, 25].map((n) => texte("pl").meine.tiere(n))).toEqual(["1 zwierzę", "2 zwierzęta", "5 zwierząt", "12 zwierząt", "22 zwierzęta", "25 zwierząt"]);
    expect([1, 3, 5].map((n) => texte("cs").meine.tiere(n))).toEqual(["1 zvíře", "3 zvířata", "5 zvířat"]);
  });

  test("Deutsch bleibt wortgleich mit dem bisherigen Text (Oberfläche der Ausstellungsleitung unverändert)", () => {
    const v = { name: "GZV Musterdorf", anschrift: "Hauptstr. 1\n12345 Musterdorf", vertretung: "Erika Muster", email: "info@example.org", telefon: "" } as Parameters<typeof datenschutzKurz>[0];
    const kurz = datenschutzKurz(v);
    expect(kurz[0]).toBe("Verantwortlich: GZV Musterdorf, Hauptstr. 1, 12345 Musterdorf · Vertreten durch: Erika Muster · E-Mail: info@example.org.");
    expect(kurz).toHaveLength(5);
    expect(datenschutzKurz(v, "en")[0]).toBe("Controller: GZV Musterdorf, Hauptstr. 1, 12345 Musterdorf · Represented by: Erika Muster · E-mail: info@example.org.");
    expect(texte("de").tiere.besatz("1,2")).toBe("Vorgeschrieben ist 1,2. Falsch besetzte Stämme und Volieren bleiben ohne Bewertungsnote (o.B.).");
  });

  test("passende Sprache aus den Wünschen des Browsers", () => {
    expect(passendeSprache(["de-CH", "de"])).toBe("de-CH");
    expect(passendeSprache(["de-AT"])).toBe("de");
    expect(passendeSprache(["de_CH"])).toBe("de-CH");
    expect(passendeSprache(["fr-CH", "de-CH"])).toBe("fr");
    expect(passendeSprache(["en-US", "en"])).toBe("en");
    expect(passendeSprache(["it-IT", "nl-BE"])).toBe("nl");
    expect(passendeSprache(["cs"])).toBe("cs");
    expect(passendeSprache(["ja-JP"])).toBe("de");
    expect(passendeSprache([])).toBe("de");
    expect(istSprache("pl")).toBe(true);
    expect(istSprache("de-ch")).toBe(false);
  });

  test("Geld und Datum im Format der Sprache, Deutsch wie überall", () => {
    expect(euroIn(1250, "de")).toBe(formatEuro(1250));
    expect(euroIn(1250, "en")).toBe("€12.50");
    expect(euroIn(1250, "fr")).toMatch(/^12,50\s€$/);
    expect(datumIn("2026-11-21", "de")).toBe("21.11.2026");
    expect(datumIn("2026-11-21", "en")).toBe("21/11/2026");
    expect(datumIn(null, "pl")).toBe("–");
  });
});
