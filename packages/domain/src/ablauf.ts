/**
 * Ablauf einer Schau für die Übersicht: wohin der Knopf der Phase führt und in welcher Folge die Prüfliste „Was noch zu tun
 * ist“ ihre Gruppen zeigt. Nach dem Meldeschluss gilt (Rückmeldung eines Vereins, 22.11.2026): Preisrichter nach Rassen
 * einteilen → Käfige → Hallenplan → Katalognummern (nach dem Plan) → Katalog gestalten → festschreiben.
 */
import type { Phase } from "./types";

/** Wo in welcher Phase die Arbeit liegt (Unterseite der Schau; Text des Knopfs: t.schau.uebersicht.arbeit). */
export const ARBEIT: Record<Phase, string> = {
  vorbereitung: "einstellungen",
  meldung: "meldungen",
  katalog: "katalog",
  einlieferung: "einlieferung",
  bewertung: "bewertung",
  preise: "preise",
  schau: "verkauf",
  abrechnung: "abrechnung",
  abgeschlossen: "protokoll",
};

/** Stand des Hallenplans: Halle angelegt, Plan festgeschrieben, Tiere ohne und mit Platz. */
export interface HallenStand {
  halle: boolean;
  planFest: boolean;
  ohnePlatz: number;
  mitPlatz: number;
}

/**
 * Seite „Katalognummern“: Steht ein Hallenplan – Halle angelegt, Plan fest, Tiere mit Platz –, ist „Nach Hallenplan
 * vergeben“ der empfohlene Weg (die Nummern folgen den Käfigen). Im automatischen Plan folgen umgekehrt die Käfige den
 * Nummern; dort und ohne Halle wird wie bisher in Ausstellungsfolge vergeben.
 */
export function nachPlanVergeben(halle?: HallenStand | null): boolean {
  return !!halle && halle.halle && halle.planFest && halle.mitPlatz > 0;
}

/**
 * Ziel des Knopfs in der Übersicht. In der Phase „Halle & Katalog“ erst der Hallenplan – solange keine Halle angelegt ist,
 * Tiere ohne Platz sind oder der Plan nicht fest ist –, danach die Katalognummern (nach dem Plan). Ohne bekannten Stand
 * (`null`) der Hallenplan. Die übrigen Phasen wie in `ARBEIT`.
 */
export function arbeitsZiel(phase: Phase, halle?: HallenStand | null): string {
  if (phase !== "katalog") return ARBEIT[phase];
  return !halle || !halle.halle || halle.ohnePlatz > 0 || !halle.planFest ? "hallenplan" : "katalog";
}

/**
 * Folge der Gruppen in der Prüfliste (je Unterseite, auf der man es erledigt) – wie der Ablauf der Schau: Hallenplan vor
 * Katalognummern, diese vor dem Katalog. Die Überschriften stehen in derselben Folge in t.schau.pruefliste.ziel.
 */
export const PRUEFLISTE_FOLGE = ["einstellungen", "/verein", "meldungen", "preisrichter", "hallenplan", "katalog", "katalog/gestalten", "einlieferung", "bewertung", "preise", "abrechnung", "kassenbuch"] as const;

/**
 * Punkte der Prüfliste nach Unterseite gruppiert, ohne „ok“: Gruppen in der Folge `PRUEFLISTE_FOLGE`, unbekannte Ziele
 * dahinter (in der Folge ihres ersten Punkts), Punkte ohne Ziel („Allgemein“, Schlüssel "") zuletzt. In einer Gruppe
 * bleibt die Folge der Punkte.
 */
export function prueflistenGruppen<P extends { art: string; ziel?: string }>(punkte: P[]): { ziel: string; punkte: P[] }[] {
  const gruppen: { ziel: string; punkte: P[] }[] = [];
  for (const p of punkte) {
    if (p.art === "ok") continue;
    const ziel = p.ziel ?? "";
    let g = gruppen.find((x) => x.ziel === ziel);
    if (!g) gruppen.push((g = { ziel, punkte: [] }));
    g.punkte.push(p);
  }
  const rang = (ziel: string) => {
    if (ziel === "") return Infinity;
    const i = (PRUEFLISTE_FOLGE as readonly string[]).indexOf(ziel);
    return i < 0 ? PRUEFLISTE_FOLGE.length : i;
  };
  // sort ist stabil: unbekannte Ziele (gleicher Rang) bleiben in der Folge ihres ersten Punkts.
  return gruppen.sort((a, b) => rang(a.ziel) - rang(b.ziel));
}
