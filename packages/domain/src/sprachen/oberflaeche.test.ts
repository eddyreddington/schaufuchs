import { beforeAll, describe, expect, test } from "bun:test";
import { ladeAlleOberflaechen, oberflaeche, serverText, SPRACHEN, type Sprache } from ".";
import { mandatGueltig, pruefeGlaeubigerId, pruefeMandatsreferenz } from "../lastschrift";
import { pruefeBic, pruefeIban } from "../sepa";
import { deOberflaeche } from "./oberflaeche/de";

beforeAll(ladeAlleOberflaechen);

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
const GLEICH_ERLAUBT = /^[\s\d\W]*$|^(IBAN|BIC|PDF|CSV|XLSX|SEPA|E-Mail|OK|Status|Logo|Name|Total|Volière|Volieren|Kreis|Administrator)\b/;

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

  test("weitergereichte Fehler der Fachlogik: zusammengesetzt ganz übersetzt, kein deutscher Rest", () => {
    // Fehler aus lastschrift.ts / sepa.ts (Präfix + Grund aus der Prüfung) und aus dem Kontoauszug-Import.
    const faelle = [
      "Gläubiger-ID des Vereins: Die Gläubiger-ID fehlt.",
      "Vereinskonto: Die IBAN ist unvollständig oder enthält ungültige Zeichen.",
      "Vereinskonto: Die Prüfziffer der IBAN stimmt nicht – bitte auf Tippfehler prüfen.",
      "Die Datei ließ sich nicht lesen.",
      "Das ist kein Kontoauszug im Format camt.053.",
      "Unbekanntes Format: In der Datei fehlen die Spalten Buchungstag und Betrag. Bitte den Umsatzexport als CSV oder camt.053 (XML) hochladen.",
      // Demodaten (testschau.ts über routers/schau/anlegen.ts) und Anmeldung (auth.ts, TRPCError).
      "Demodaten nicht vollständig eingespielt: Es werden gerade schon Demodaten eingespielt – bitte gleich noch einmal versuchen.",
      "Demodaten nicht vollständig eingespielt: Die Schau steht in der Phase „Katalog & Halle“ – erwartet: Vorbereitung oder Meldephase.",
      "Demodaten nicht vollständig eingespielt: „Probe 7“ hat schon Meldungen – Testdaten nur in eine leere Schau (nichts wird überschrieben).",
      "Die Anmeldung ist abgelaufen. Bitte noch einmal anmelden.",
      "Der Server ist gerade ausgelastet. Bitte gleich noch einmal versuchen.",
    ];
    const rest: string[] = [];
    for (const s of SPRACHEN.filter((x) => x !== "de" && x !== "de-CH"))
      for (const f of faelle) {
        const ist = serverText(f, s);
        if (/Gläubiger|Vereinskonto|IBAN ist|Datei|Unbekanntes|Demodaten|Schau steht|erwartet|Meldungen|Anmeldung|Server ist/.test(ist)) rest.push(`${s}: ${ist}`);
      }
    expect(rest).toEqual([]);
  });

  test("Gründe aus den Prüffunktionen (IBAN, BIC, Gläubiger-ID, Mandat): allein und so eingesetzt wie im Server übersetzt", () => {
    // Wie der Server sie einsetzt: domain sepa.ts / lastschrift.ts („Vereinskonto: …“, „Gläubiger-ID des Vereins: …“,
    // „<Name>: …“), routers/lastschrift.ts und schau/einstellungen.ts (allein).
    const mandat = { unterschriebenAm: "2020-01-01", widerrufenAm: null, letzteNutzungAm: null, wiederkehrend: true };
    const ibanVorsatz = ["", "Vereinskonto: ", "Anna Muster: "];
    const faelle: [string | null, string[]][] = [
      [pruefeIban("DE12"), ibanVorsatz],
      [pruefeIban("DE8937040044053201300"), ibanVorsatz],
      [pruefeIban("DE89370400440532013001"), ibanVorsatz],
      [pruefeBic("ABC"), [""]],
      ...["", "DE98", "DE98ZZZ0999999999", "DE99ZZZ09999999999"].map((id): [string | null, string[]] => [pruefeGlaeubigerId(id), ["", "Gläubiger-ID des Vereins: "]]),
      ...["", "x".repeat(36), "Mandat Nr. 1"].map((r): [string | null, string[]] => [pruefeMandatsreferenz(r), ["", "Anna Muster: "]]),
      [mandatGueltig({ ...mandat, widerrufenAm: "2026-01-01" }, "2026-11-01"), [""]],
      [mandatGueltig({ ...mandat, unterschriebenAm: "2026-12-01" }, "2026-11-01"), [""]],
      [mandatGueltig({ ...mandat, wiederkehrend: false, letzteNutzungAm: "2026-01-01" }, "2026-11-01"), [""]],
      [mandatGueltig(mandat, "2026-11-01"), [""]],
    ];
    expect(faelle.every(([g]) => typeof g === "string")).toBe(true);
    const rest: string[] = [];
    for (const [g, vorsaetze] of faelle)
      for (const meldung of vorsaetze.map((v) => v + g))
        for (const s of SPRACHEN.filter((x) => x !== "de" && x !== "de-CH")) {
          const ist = serverText(meldung, s);
          if (ist.includes(g!) || /Vereinskonto|Gläubiger/.test(ist)) rest.push(`${s}: ${ist}`);
        }
    expect(rest).toEqual([]);
  });
});
