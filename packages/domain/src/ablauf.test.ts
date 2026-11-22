import { beforeAll, describe, expect, test } from "bun:test";
import { arbeitsZiel, hallenplanOffen, hallenStandVon, nachPlanVergeben, PRUEFLISTE_FOLGE, prueflistenGruppen } from "./ablauf";
import { HALLE_STANDARD, planeHalle, type PlanTier } from "./hallenplan";
import { ladeAlleOberflaechen, oberflaeche, type Sprache } from "./sprachen";
import { PHASEN } from "./types";

beforeAll(ladeAlleOberflaechen);

describe("Ablauf nach dem Meldeschluss: Hallenplan vor Katalognummern", () => {
  type St = { halle: boolean; planFest: boolean; veraltet: boolean; ohnePlatz: number; mitPlatz: number; nummeriert: boolean };
  const stand = (s: Partial<St> = {}): St => ({ halle: true, planFest: true, veraltet: false, ohnePlatz: 0, mitPlatz: 12, nummeriert: false, ...s });

  test("Phase „Halle & Katalog“: zum Hallenplan, solange dort noch etwas zu tun ist", () => {
    // Unbekannter Stand (Rechnung gescheitert): der Hallenplan zeigt den Fehler.
    expect(arbeitsZiel("katalog", null)).toBe("hallenplan");
    // Halle angelegt, Tiere ohne Platz – fest oder automatisch.
    expect(arbeitsZiel("katalog", stand({ ohnePlatz: 3 }))).toBe("hallenplan");
    expect(arbeitsZiel("katalog", stand({ planFest: false, ohnePlatz: 3 }))).toBe("hallenplan");
    // Fester Plan veraltet (Halle oder Käfigmaße danach geändert).
    expect(arbeitsZiel("katalog", stand({ veraltet: true }))).toBe("hallenplan");
    // Noch keine Halle und noch keine Nummern.
    expect(arbeitsZiel("katalog", stand({ halle: false, planFest: false, mitPlatz: 0 }))).toBe("hallenplan");
  });

  test("danach zu den Katalognummern: auch der automatische Plan mit allen Tieren und die Schau ohne Halle mit Nummern", () => {
    expect(arbeitsZiel("katalog", stand())).toBe("katalog");
    expect(arbeitsZiel("katalog", stand({ planFest: false }))).toBe("katalog");
    expect(arbeitsZiel("katalog", stand({ planFest: false, nummeriert: true }))).toBe("katalog");
    expect(arbeitsZiel("katalog", stand({ halle: false, planFest: false, mitPlatz: 0, nummeriert: true }))).toBe("katalog");
    // „veraltet“ zählt nur beim festen Plan.
    expect(arbeitsZiel("katalog", stand({ planFest: false, veraltet: true }))).toBe("katalog");
  });

  test("was am Hallenplan fehlt (hallenplanOffen) passt zum Knopf, in allen Fällen", () => {
    expect(hallenplanOffen(stand({ veraltet: true, ohnePlatz: 2 }))).toBe("veraltet");
    expect(hallenplanOffen(stand({ ohnePlatz: 2 }))).toBe("ohnePlatz");
    expect(hallenplanOffen(stand({ halle: false, planFest: false }))).toBe("keineHalle");
    expect(hallenplanOffen(stand())).toBeNull();
    const ja = [false, true];
    for (const halle of ja) for (const planFest of ja) for (const veraltet of ja) for (const nummeriert of ja) for (const ohnePlatz of [0, 1]) for (const mitPlatz of [0, 3]) {
      const st = stand({ halle, planFest: halle && planFest, veraltet, nummeriert, ohnePlatz: halle ? ohnePlatz : 0, mitPlatz: halle ? mitPlatz : 0 });
      expect(arbeitsZiel("katalog", st)).toBe(hallenplanOffen(st) ? "hallenplan" : "katalog");
      // „Nach Hallenplan vergeben“ nie mit veraltetem festem Plan, nie ohne festen Plan.
      if (nachPlanVergeben(st)) expect([st.halle, st.planFest, st.veraltet, st.mitPlatz > 0]).toEqual([true, true, false, true]);
    }
  });

  test("Seite „Katalognummern“: nach Hallenplan nur mit festem, aktuellem Plan und Tieren darin", () => {
    expect(nachPlanVergeben(stand())).toBe(true);
    // Mit Tieren ohne Platz trotzdem (sie kommen ans Ende); die Seite nennt dann, was am Plan fehlt (hallenplanOffen).
    expect(nachPlanVergeben(stand({ ohnePlatz: 2 }))).toBe(true);
    expect(nachPlanVergeben(stand({ veraltet: true }))).toBe(false);
    expect(nachPlanVergeben(stand({ planFest: false }))).toBe(false);
    expect(nachPlanVergeben(stand({ mitPlatz: 0 }))).toBe(false);
    expect(nachPlanVergeben(stand({ halle: false }))).toBe(false);
    expect(nachPlanVergeben(null)).toBe(false);
  });

  test("Stand aus dem gerechneten Plan", () => {
    const tier = (id: number, nr: string | null): PlanTier => ({ id, typ: "huehner", nr, rasse: "R", preisrichterId: null });
    const masse = { huehner: { breite: 70, tiefe: 70, hoehe: 70 } };
    const tiere = [tier(1, null), tier(2, null)];
    expect(hallenStandVon(null, tiere, false)).toEqual({ halle: false, planFest: false, veraltet: false, ohnePlatz: 0, mitPlatz: 0, nummeriert: false });
    const plan = planeHalle({ ...HALLE_STANDARD, flaechen: [] }, tiere, masse);
    expect(hallenStandVon(plan, tiere, false)).toEqual({ halle: true, planFest: false, veraltet: false, ohnePlatz: 0, mitPlatz: 2, nummeriert: false });
    const klein = planeHalle({ ...HALLE_STANDARD, breite: 100, laenge: 100, flaechen: [] }, tiere, masse);
    expect(hallenStandVon(klein, [tier(1, "1"), tier(2, null)], false)).toMatchObject({ ohnePlatz: 2, mitPlatz: 0, nummeriert: true });
    expect(hallenStandVon({ ...plan, fest: { am: "x", veraltet: true } }, tiere, true)).toMatchObject({ planFest: true, veraltet: true });
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
