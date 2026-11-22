import { beforeAll, describe, expect, test } from "bun:test";
import { arbeitsZiel, nachPlanVergeben, PRUEFLISTE_FOLGE, prueflistenGruppen } from "./ablauf";
import { ladeAlleOberflaechen, oberflaeche, type Sprache } from "./sprachen";
import { PHASEN } from "./types";

beforeAll(ladeAlleOberflaechen);

describe("Ablauf nach dem Meldeschluss: Hallenplan vor Katalognummern", () => {
  const stand = (s: Partial<{ halle: boolean; planFest: boolean; ohnePlatz: number; mitPlatz: number }> = {}) => ({ halle: true, planFest: true, ohnePlatz: 0, mitPlatz: 12, ...s });

  test("Phase „Halle & Katalog“: zum Hallenplan, solange keine Halle, Tiere ohne Platz oder Plan nicht fest", () => {
    expect(arbeitsZiel("katalog", null)).toBe("hallenplan");
    expect(arbeitsZiel("katalog", stand({ halle: false }))).toBe("hallenplan");
    expect(arbeitsZiel("katalog", stand({ ohnePlatz: 3 }))).toBe("hallenplan");
    expect(arbeitsZiel("katalog", stand({ planFest: false }))).toBe("hallenplan");
    // Plan steht (alle Tiere mit Platz, fest): jetzt die Katalognummern (nach dem Plan).
    expect(arbeitsZiel("katalog", stand())).toBe("katalog");
  });

  test("Seite „Katalognummern“: nach Hallenplan nur mit festem Plan und Tieren darin", () => {
    expect(nachPlanVergeben(stand())).toBe(true);
    // Mit Tieren ohne Platz trotzdem (sie kommen ans Ende, siehe nummernNachPlan).
    expect(nachPlanVergeben(stand({ ohnePlatz: 2 }))).toBe(true);
    expect(nachPlanVergeben(stand({ planFest: false }))).toBe(false);
    expect(nachPlanVergeben(stand({ mitPlatz: 0 }))).toBe(false);
    expect(nachPlanVergeben(stand({ halle: false }))).toBe(false);
    expect(nachPlanVergeben(null)).toBe(false);
  });

  test("andere Phasen wie bisher, der Hallenplan zählt dort nicht", () => {
    expect(arbeitsZiel("vorbereitung", null)).toBe("einstellungen");
    expect(arbeitsZiel("meldung", stand({ halle: false }))).toBe("meldungen");
    expect(arbeitsZiel("einlieferung", stand({ ohnePlatz: 2 }))).toBe("einlieferung");
    expect(arbeitsZiel("abgeschlossen")).toBe("protokoll");
    expect(PHASEN.map((p) => arbeitsZiel(p, stand()))).toEqual(["einstellungen", "meldungen", "katalog", "einlieferung", "bewertung", "preise", "verkauf", "abrechnung", "protokoll"]);
  });

  test("Phasenname in allen Sprachen: Halle vor Katalog", () => {
    expect(oberflaeche("de").fach.PHASEN_LABEL.katalog).toBe("Halle & Katalog");
    expect((["en", "fr", "nl", "pl", "cs"] as Sprache[]).map((l) => oberflaeche(l).fach.PHASEN_LABEL.katalog)).toEqual(["Hall & catalogue", "Salle & catalogue", "Hal & catalogus", "Hala i katalog", "Hala a katalog"]);
  });
});

describe("Prüfliste: Gruppen in der Folge des Ablaufs", () => {
  const p = (ziel: string | undefined, text = ziel ?? "", art: "fehler" | "hinweis" | "ok" = "hinweis") => ({ art, text, ...(ziel !== undefined ? { ziel } : {}) });

  test("Preisrichter, Hallenplan, Katalognummern, Katalog – egal, in welcher Folge die Punkte kommen", () => {
    const g = prueflistenGruppen([p("katalog/gestalten"), p("katalog", "ohne Nummer", "fehler"), p("preisrichter"), p("hallenplan"), p("katalog", "zweiter"), p(undefined, "Schau abschließen")]);
    expect(g.map((x) => x.ziel)).toEqual(["preisrichter", "hallenplan", "katalog", "katalog/gestalten", ""]);
    // In der Gruppe bleibt die Folge der Punkte.
    expect(g[2]!.punkte.map((x) => x.text)).toEqual(["ohne Nummer", "zweiter"]);
  });

  test("„ok“ zählt nicht; unbekannte Ziele hinter den bekannten, „Allgemein“ zuletzt", () => {
    expect(prueflistenGruppen([p(undefined, "Alles erledigt", "ok")])).toEqual([]);
    expect(prueflistenGruppen([p(undefined, "x"), p("woanders"), p("einstellungen")]).map((x) => x.ziel)).toEqual(["einstellungen", "woanders", ""]);
  });

  test("jedes Ziel der Folge hat eine Überschrift in jeder Sprache, und jede Überschrift steht in der Folge", () => {
    for (const l of ["de", "en", "fr", "nl", "pl", "cs"] as Sprache[]) expect(Object.keys(oberflaeche(l).schau.pruefliste.ziel)).toEqual([...PRUEFLISTE_FOLGE]);
  });
});
