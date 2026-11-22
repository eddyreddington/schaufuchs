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

/** Ein Eintrag aus drizzle/meta/_journal.json. */
export interface MigrationsEintrag {
  idx: number;
  when: number;
  tag: string;
}

/** Stand des Migrationsverzeichnisses: Journal, SQL-Dateien und Schnappschüsse (meta/NNNN_snapshot.json). */
export interface Migrationsverzeichnis {
  journal: readonly MigrationsEintrag[];
  dateien: readonly string[];
  schnappschuesse: readonly { datei: string; id: string; prevId: string }[];
}

/**
 * Fehler im Migrationsverzeichnis, wie sie entstehen, wenn zwei Zweige je eine Migration mit derselben Nummer anlegen
 * und beim Merge nur umbenannt wird. Das Einspielen (drizzle-orm) übernimmt nur Migrationen, deren `when` jünger ist
 * als die zuletzt eingespielte; ein älterer Wert hinter einer jüngeren Migration würde ohne Meldung übersprungen.
 * Abhilfe: die Migration des später gemergten Zweigs verwerfen und auf dem neuen Stand mit `db:generate` neu erzeugen.
 */
export function migrationsverzeichnisFehler(v: Migrationsverzeichnis): string[] {
  const fehler: string[] = [];
  const nummer = (i: number) => String(i).padStart(4, "0");
  v.journal.forEach((e, i) => {
    if (e.idx !== i) fehler.push(`Journal: ${e.tag} hat idx ${e.idx}, erwartet ${i}`);
    if (!e.tag.startsWith(`${nummer(i)}_`)) fehler.push(`Journal: ${e.tag} trägt nicht die Nummer ${nummer(i)}`);
    const davor = v.journal[i - 1];
    if (davor && e.when <= davor.when) fehler.push(`Journal: ${e.tag} ist nicht jünger als ${davor.tag} und würde beim Einspielen übersprungen`);
  });
  const erwartet = new Set(v.journal.map((e) => `${e.tag}.sql`));
  for (const d of v.dateien) if (!erwartet.has(d)) fehler.push(`Datei ${d} steht nicht im Journal`);
  for (const d of erwartet) if (!v.dateien.includes(d)) fehler.push(`Datei ${d} fehlt`);
  const kette = new Map(v.schnappschuesse.map((s) => [s.datei, s]));
  v.journal.forEach((_, i) => {
    const datei = `${nummer(i)}_snapshot.json`;
    const s = kette.get(datei);
    if (!s) return void fehler.push(`Schnappschuss ${datei} fehlt`);
    const davor = kette.get(`${nummer(i - 1)}_snapshot.json`);
    if (i > 0 && davor && s.prevId !== davor.id) fehler.push(`Schnappschuss ${datei} folgt nicht auf ${nummer(i - 1)}_snapshot.json`);
  });
  if (v.schnappschuesse.length > v.journal.length) fehler.push("Mehr Schnappschüsse als Migrationen im Journal");
  return fehler;
}
