/**
 * A-Bogen (Meldebogen): das Formular, das der Aussteller ausfüllt und unterschreibt – Anschrift, Registriernummer,
 * Tiere in der Reihenfolge des Meldebogens, Anerkennung der AAB und Sonderbestimmungen, Datenschutz.
 * Gegenstück ist der B-Bogen (Meldebestätigung mit Katalognummern). Hier nur die reinen Regeln für die Tierzeilen;
 * gezeichnet wird in apps/server/src/pdf/a-bogen.ts.
 */
import type { Alter, Meldeart } from "./types";

/** Kürzel der Meldeart in der schmalen Spalte „Art“ (Erklärung steht unter der Tabelle). */
export const MELDEART_KUERZEL: Record<Meldeart, string> = { einzeltier: "E", stamm: "S", voliere: "V", bruteier: "B" };
export const ALTER_KUERZEL: Record<Alter, string> = { jung: "j", alt: "a" };

/** Leerer A-Bogen: so viele Schreibzeilen, dass Tabelle und Unterschrift auf zwei Seiten passen. */
export const A_BOGEN_LEERZEILEN = 18;
/** Vorausgefüllter A-Bogen: nach den gemeldeten Tieren noch Platz für Nachträge. */
export const A_BOGEN_NACHTRAG = 3;

export interface ABogenTier {
  rasse: string;
  farbenschlag: string;
  art: Meldeart;
  geschlecht: string;
  alter: Alter;
  ringnummern: string;
  verkaufspreisCent: number | null;
  eigeneZucht: boolean;
  istAoc: boolean;
  istNeuzuechtung: boolean;
  /** Reihenfolge, wie gemeldet (Position in der Meldung). */
  position: number;
}

export interface ABogenZeile {
  nr: string;
  rasse: string;
  farbenschlag: string;
  art: string;
  geschlecht: string;
  alter: string;
  ring: string;
  preisCent: number | null;
  eigeneZucht: boolean;
}

const LEER: Omit<ABogenZeile, "nr"> = { rasse: "", farbenschlag: "", art: "", geschlecht: "", alter: "", ring: "", preisCent: null, eigeneZucht: false };

/**
 * Zeilen der Tiertabelle: gemeldete Tiere in der gemeldeten Reihenfolge (fortlaufend nummeriert), dann leere
 * Schreibzeilen – leerer Bogen `A_BOGEN_LEERZEILEN`, sonst `A_BOGEN_NACHTRAG`. Leere Zeilen tragen ihre Nummer mit,
 * damit Nachträge auf dem Papier eindeutig bleiben.
 */
export function aBogenZeilen(tiere: ABogenTier[]): ABogenZeile[] {
  const gemeldet = [...tiere]
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      // AOC und Neuzüchtung stehen wie im Katalog in Klammern hinter der Bezeichnung (eigene Spalte passt nicht).
      rasse: [t.rasse, t.istAoc ? "(AOC)" : "", t.istNeuzuechtung ? "(Neuzüchtung)" : ""].filter(Boolean).join(" "),
      farbenschlag: t.farbenschlag,
      art: MELDEART_KUERZEL[t.art],
      geschlecht: t.geschlecht,
      alter: ALTER_KUERZEL[t.alter],
      ring: t.ringnummern,
      preisCent: t.verkaufspreisCent,
      eigeneZucht: t.eigeneZucht,
    }));
  const leer = Array.from({ length: gemeldet.length ? A_BOGEN_NACHTRAG : A_BOGEN_LEERZEILEN }, () => ({ ...LEER }));
  return [...gemeldet, ...leer].map((z, i) => ({ nr: String(i + 1), ...z }));
}
