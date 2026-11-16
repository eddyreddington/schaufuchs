import { describe, expect, test } from "bun:test";
import { oberflaeche, serverText, SPRACHEN, type Sprache } from ".";
import { deOberflaeche } from "./oberflaeche/de";

const BEISPIEL = ["WERT_A", "WERT_B", "WERT_C", "WERT_D", "WERT_E", "WERT_F"];

/** Alle Texte der Oberfläche als [Pfad, Wert]; Texte mit Platzhaltern mit Beispielwerten aufgerufen. */
function alleTexte(wurzel: unknown): [string, string][] {
  const aus: [string, string][] = [];
  const lauf = (pfad: string, wert: unknown) => {
    if (typeof wert === "string") aus.push([pfad, wert]);
    else if (typeof wert === "function") {
      const r = (wert as (...a: unknown[]) => unknown)(...BEISPIEL);
      for (const [i, x] of (Array.isArray(r) ? r : [r]).entries()) aus.push([`${pfad}()${Array.isArray(r) ? `[${i}]` : ""}`, String(x)]);
    } else if (wert && typeof wert === "object") for (const [k, v] of Object.entries(wert)) lauf(pfad ? `${pfad}.${k}` : k, v);
  };
  lauf("", wurzel);
  return aus;
}

/** Gleich lautende Texte, die in einer Sprache wirklich so heißen (Fachwörter, Abkürzungen, Eigennamen). */
const GLEICH_ERLAUBT = /^[\s\d\W]*$|^(IBAN|BIC|PDF|CSV|XLSX|SEPA|E-Mail|OK|Status|Logo|Name|Total|Volière|Volieren|Kreis)\b/;

describe("Texte der Oberfläche (Entscheidung 022)", () => {
  test("jede Sprache hat jeden Text, keiner ist leer", () => {
    const schluessel = alleTexte(oberflaeche("de")).map(([p]) => p);
    for (const s of SPRACHEN) {
      const t = alleTexte(oberflaeche(s));
      expect(t.map(([p]) => p).sort()).toEqual([...schluessel].sort());
      expect(t.filter(([, w]) => !w.trim()).map(([p]) => `${s}: ${p}`)).toEqual([]);
    }
  });

  test("Übersetzungen sind keine Kopie des Deutschen", () => {
    const de = new Map(alleTexte(oberflaeche("de")));
    for (const s of SPRACHEN.filter((x) => !x.startsWith("de"))) {
      const gleich = alleTexte(oberflaeche(s)).filter(([p, w]) => de.get(p) === w && w.length > 12 && !GLEICH_ERLAUBT.test(w));
      expect(gleich.map(([p, w]) => `${s}: ${p} = ${w}`)).toEqual([]);
    }
  });

  test("Platzhalter: jeder eingesetzte Wert steht in jeder Sprache im Ergebnis", () => {
    const fehlt: string[] = [];
    const lauf = (pfad: string, de: unknown, ueb: Record<Sprache, unknown>) => {
      if (typeof de === "function") {
        const n = (de as (...a: unknown[]) => unknown).length;
        const werte = BEISPIEL.slice(0, n);
        const deText = String((de as (...a: unknown[]) => unknown)(...werte));
        for (const s of SPRACHEN) {
          const text = String((ueb[s] as (...a: unknown[]) => unknown)(...werte));
          // Nur Werte, die auch der deutsche Text zeigt (manche Texte nutzen einen Wert nur für die Mehrzahl).
          for (const w of werte) if (deText.includes(w) && !text.includes(w)) fehlt.push(`${s}: ${pfad} ohne ${w}`);
        }
      } else if (de && typeof de === "object")
        for (const [k, v] of Object.entries(de))
          lauf(`${pfad}.${k}`, v, Object.fromEntries(SPRACHEN.map((s) => [s, (ueb[s] as Record<string, unknown>)?.[k]])) as Record<Sprache, unknown>);
    };
    lauf("", deOberflaeche, Object.fromEntries(SPRACHEN.map((s) => [s, oberflaeche(s)])) as Record<Sprache, unknown>);
    expect(fehlt).toEqual([]);
  });

  test("Deutsch (Schweiz) ohne ß, Französisch mit geschütztem Leerzeichen", () => {
    expect(alleTexte(oberflaeche("de-CH")).filter(([, w]) => /ß/.test(w))).toEqual([]);
    expect(oberflaeche("de-CH").allgemein.schliessen).toBe("Schliessen");
    expect(alleTexte(oberflaeche("fr")).filter(([, w]) => / [:;?!»]/.test(w))).toEqual([]);
  });

  test("Deutsch ist genau die Grundlage, Fachbegriffe wie in der Domain", () => {
    expect(oberflaeche("de")).toBe(deOberflaeche);
    expect(oberflaeche("de").fach.PHASEN_LABEL.meldung).toBeTruthy();
  });
});

describe("Meldungen des Servers (serverText)", () => {
  /** Alle Meldungen der Gruppen server*: deutsch mit Beispielwerten → erwartete Übersetzung mit denselben Werten. */
  function meldungen(): { pfad: string; de: string; ziel: (s: Sprache) => string }[] {
    const aus: { pfad: string; de: string; ziel: (s: Sprache) => string }[] = [];
    const lauf = (pfad: string[], wert: unknown) => {
      if (typeof wert === "string" || typeof wert === "function") {
        const n = typeof wert === "function" ? wert.length : 0;
        const werte = BEISPIEL.slice(0, n);
        const text = (w: unknown) => (typeof w === "function" ? String((w as (...a: string[]) => unknown)(...werte)) : String(w));
        const hol = (s: Sprache) => pfad.reduce<unknown>((w, k) => (w as Record<string, unknown>)[k], oberflaeche(s));
        aus.push({ pfad: pfad.join("."), de: text(wert), ziel: (s) => text(hol(s)) });
      } else if (wert && typeof wert === "object") for (const [k, v] of Object.entries(wert)) lauf([...pfad, k], v);
    };
    for (const [g, w] of Object.entries(deOberflaeche)) if (g.startsWith("server")) lauf([g], w);
    return aus;
  }

  test("jede Meldung wird erkannt und eindeutig übersetzt", () => {
    const falsch: string[] = [];
    for (const m of meldungen())
      for (const s of SPRACHEN) {
        const ist = serverText(m.de, s);
        if (ist !== m.ziel(s)) falsch.push(`${s}: ${m.pfad}: „${m.de}“ → „${ist}“ statt „${m.ziel(s)}“`);
      }
    expect(falsch.slice(0, 20)).toEqual([]);
  });

  test("Deutsch und Unbekanntes bleiben unverändert, mehrere Sätze einzeln", () => {
    expect(serverText("Etwas ganz anderes.", "en")).toBe("Etwas ganz anderes.");
    expect(serverText("Straße gesperrt.", "de")).toBe("Straße gesperrt.");
    const zwei = meldungen().filter((m) => m.de.endsWith(".") && !m.de.slice(0, -1).includes(".")).slice(0, 2);
    if (zwei.length === 2) expect(serverText(`${zwei[0]!.de} ${zwei[1]!.de}`, "en")).toBe(`${zwei[0]!.ziel("en")} ${zwei[1]!.ziel("en")}`);
  });
});
