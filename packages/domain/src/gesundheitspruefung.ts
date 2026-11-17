/**
 * Angaben der Gesundheitsprüfung `GET /api/gesund` für Überwachung und Update-Läufe (Entscheidung 024).
 */
import { plusTage, schauTage } from "./kommende-schauen";
import type { Phase } from "./types";

/** Was von einer Schau für die Schautage zählt. */
export interface SchauZeitraum {
  test: boolean;
  phase: Phase;
  bewertungAm: string | null;
  oeffnungszeiten: string;
}

/** Phasen, in denen die Halle arbeitet – nur maßgeblich, wenn die Schau keine Daten hat. */
const PHASEN_IN_DER_HALLE: readonly Phase[] = ["einlieferung", "bewertung", "preise", "schau"];

/** Höchstens so viele Tage nach dem ersten Schautag zählen noch als Schautage. */
const LAENGSTE_SCHAU_TAGE = 14;

/**
 * Laufen gerade Schautage? Gezählt wird vom Tag vor dem ersten Schautag (Einlieferung) bis zum letzten Öffnungstag
 * (`schauTage()`), höchstens zwei Wochen; erster Schautag ist der frühere von Bewertungstag und erstem Öffnungstag.
 * Hat eine Schau weder Bewertungstag noch Daten in den Öffnungszeiten, entscheidet ihre Phase. Testschauen und
 * abgeschlossene Schauen zählen nie. Es zählen die Schauen aller Vereine der Installation.
 */
export function schautageLaufen(schauen: readonly SchauZeitraum[], heute: string): boolean {
  return schauen.some((s) => {
    if (s.test || s.phase === "abgeschlossen") return false;
    const tage = schauTage(s.bewertungAm, s.oeffnungszeiten);
    if (!tage) return PHASEN_IN_DER_HALLE.includes(s.phase);
    const erster = s.bewertungAm && s.bewertungAm < tage.von ? s.bewertungAm : tage.von;
    // Freitext kann ein verirrtes Datum enthalten (z. B. „Abholung bis 20.1.“): länger als zwei Wochen dauert keine Schau.
    const letzter = tage.bis < plusTage(erster, LAENGSTE_SCHAU_TAGE) ? tage.bis : plusTage(erster, LAENGSTE_SCHAU_TAGE);
    return plusTage(erster, -1) <= heute && heute <= letzter;
  });
}

/**
 * Noch nicht eingespielte Migrationen: alle aus dem Verzeichnis (`when` in drizzle/meta/_journal.json), die jünger
 * sind als die zuletzt eingespielte – so entscheidet auch das Einspielen selbst (drizzle-orm, migrator).
 */
export function offeneMigrationen(verzeichnis: readonly number[], zuletztEingespielt: number | null): number {
  return verzeichnis.filter((w) => zuletztEingespielt == null || w > zuletztEingespielt).length;
}
