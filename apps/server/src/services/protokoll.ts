import type { Tx } from "../db/client";
import { aenderung } from "../db/schema";

export interface Akteur {
  benutzer?: { id: number; name: string } | null;
  richter?: { id: number; name: string } | null;
  /** Für öffentliche Aktionen, z. B. "Aussteller (online)". */
  text?: string;
}

/** Schreibt einen Eintrag ins Änderungsprotokoll. Grundlage für Reklamationen. */
export async function protokolliere(
  tx: Tx,
  e: {
    schauId: number | null;
    tabelle: string;
    datensatzId: number | null;
    aktion: string;
    alt?: unknown;
    neu?: unknown;
    grund?: string;
    akteur: Akteur;
  },
) {
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
