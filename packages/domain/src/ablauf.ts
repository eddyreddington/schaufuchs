/**
 * Ablauf einer Schau für die Übersicht: wohin der Knopf der Phase führt und in welcher Folge die Prüfliste „Was noch zu tun
 * ist“ ihre Gruppen zeigt. Nach dem Meldeschluss gilt (Rückmeldung eines Vereins, 22.11.2026): Preisrichter nach Rassen
 * einteilen → Käfige → Hallenplan → Katalognummern (nach dem Plan) → Katalog gestalten → festschreiben.
 */
import type { Hallenplan, PlanTier } from "./hallenplan";
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

/** Stand des Hallenplans für den Ablauf (Übersicht, Seite „Katalognummern“). */
export interface HallenStand {
  /** Halle angelegt. */
  halle: boolean;
  /** Plan festgeschrieben. */
  planFest: boolean;
  /** Fester Plan passt nicht mehr zu Halle oder Käfigmaßen (erst „Plan neu setzen“). */
  veraltet: boolean;
  /** Tiere ohne Platz bzw. mit Platz im Plan (gemeldete Tiere, offen und bestätigt). */
  ohnePlatz: number;
  mitPlatz: number;
  /** Es gibt schon Katalognummern. */
  nummeriert: boolean;
}

/** Stand aus dem gerechneten Plan (`plan` null: keine Halle) und den Tieren des Plans (`planTiere`). */
export function hallenStandVon(plan: Pick<Hallenplan, "nichtPlatziert" | "fest"> | null, tiere: Pick<PlanTier, "nr">[], planFest: boolean): HallenStand {
  const nummeriert = tiere.some((t) => t.nr != null);
  if (!plan) return { halle: false, planFest: false, veraltet: false, ohnePlatz: 0, mitPlatz: 0, nummeriert };
  const ohnePlatz = plan.nichtPlatziert.length;
  return { halle: true, planFest, veraltet: planFest && !!plan.fest?.veraltet, ohnePlatz, mitPlatz: tiere.length - ohnePlatz, nummeriert };
}

/**
 * Was am Hallenplan noch zu tun ist, bevor die Katalognummern dran sind: der feste Plan ist veraltet, Tiere haben keinen
 * Platz (fester oder automatischer Plan), oder es gibt noch keine Halle und noch keine Nummern. null: der Plan steht – auch
 * ein automatischer Plan mit allen Tieren, und eine Schau ohne Halle, die schon nummeriert hat.
 */
export function hallenplanOffen(st: HallenStand): "veraltet" | "ohnePlatz" | "keineHalle" | null {
  if (!st.halle) return st.nummeriert ? null : "keineHalle";
  if (st.planFest && st.veraltet) return "veraltet";
  if (st.ohnePlatz > 0) return "ohnePlatz";
  return null;
}

/**
 * Seite „Katalognummern“: Steht ein fester, aktueller Plan mit Tieren, ist „Nach Hallenplan vergeben“ der empfohlene Weg
 * (die Nummern folgen den Käfigen; Tiere ohne Platz kommen ans Ende – die Seite nennt sie über `hallenplanOffen`). Im
 * automatischen Plan folgen umgekehrt die Käfige den Nummern; dort und ohne Halle wird in Ausstellungsfolge vergeben.
 */
export function nachPlanVergeben(st?: HallenStand | null): boolean {
  return !!st && st.halle && st.planFest && !st.veraltet && st.mitPlatz > 0;
}

/**
 * Ziel des Knopfs in der Übersicht. In der Phase „Halle & Katalog“ der Hallenplan, solange dort etwas zu tun ist
 * (`hallenplanOffen`), danach die Katalognummern. Ohne bekannten Stand (`null`, Rechnung gescheitert) der Hallenplan, der
 * den Fehler zeigt. Die übrigen Phasen wie in `ARBEIT`.
 */
export function arbeitsZiel(phase: Phase, st?: HallenStand | null): string {
  if (phase !== "katalog") return ARBEIT[phase];
  return !st || hallenplanOffen(st) ? "hallenplan" : "katalog";
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
