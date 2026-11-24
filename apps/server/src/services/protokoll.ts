import type { Tx } from "../db/client";
import { aenderung } from "../db/schema";

export interface Akteur {
  benutzer?: { id: number; name: string } | null;
  richter?: { id: number; name: string } | null;
  /** Für öffentliche Aktionen, z. B. "Aussteller (online)". */
  text?: string;
}

export interface Eintrag {
  schauId: number | null;
  tabelle: string;
  datensatzId: number | null;
  aktion: string;
  alt?: unknown;
  neu?: unknown;
  grund?: string;
  akteur: Akteur;
}

/** Gesammelte Einträge je Transaktion (siehe `protokollZuletzt`). */
const gesammelt = new WeakMap<object, Eintrag[]>();

/**
 * Schreibt einen Eintrag ins Änderungsprotokoll. Grundlage für Reklamationen. Der Eintrag sperrt die Protokoll-Kette
 * (eine Zeile für die ganze Installation) bis zum Commit – danach darf die Transaktion auf keine Sperre mehr warten
 * (Entscheidung 033). Läuft sie in `protokollZuletzt`, wird der Eintrag gesammelt und erst am Ende geschrieben.
 */
export async function protokolliere(tx: Tx, e: Eintrag) {
  const liste = gesammelt.get(tx);
  // Kopie: ein Aufrufer, der alt/neu danach weiterverwendet, ändert den gesammelten Eintrag nicht.
  if (liste) liste.push({ ...e, alt: structuredClone(e.alt), neu: structuredClone(e.neu) });
  else await schreibe(tx, e);
}

/**
 * Führt `f` aus und schreibt die dabei protokollierten Einträge erst danach, in derselben Reihenfolge (Entscheidung 033:
 * Protokoll zuletzt). Für Wege, die in einer Schleife protokollieren und weiter sperren (Import, Lastschrift buchen,
 * Löschwunsch). Verschachtelt: der äußere Aufruf schreibt. Innerhalb von `f` stehen die Einträge noch nicht in der Tabelle.
 */
export async function protokollZuletzt<T>(tx: Tx, f: () => Promise<T>): Promise<T> {
  if (gesammelt.has(tx)) return f();
  const liste: Eintrag[] = [];
  gesammelt.set(tx, liste);
  try {
    const r = await f();
    gesammelt.delete(tx);
    for (const e of liste) await schreibe(tx, e);
    return r;
  } finally {
    gesammelt.delete(tx);
  }
}

async function schreibe(tx: Tx, e: Eintrag) {
  await tx.insert(aenderung).values({
    schauId: e.schauId,
    tabelle: e.tabelle,
    datensatzId: e.datensatzId,
    aktion: e.aktion,
    alt: e.alt ?? null,
    neu: e.neu ?? null,
    grund: e.grund ?? "",
    benutzerId: e.akteur.benutzer?.id ?? null,
    preisrichterId: e.akteur.richter?.id ?? null,
    wer: e.akteur.benutzer?.name ?? (e.akteur.richter ? `PR ${e.akteur.richter.name}` : (e.akteur.text ?? "")),
  });
}
