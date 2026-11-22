// Knopf „Speichern“ und Speicheranzeige im Hallenplan (Seite hallenplan.tsx).
import type { SpeicherStand } from "../ui-speichern";

/**
 * „Speichern“ im Hallenplan: Der Editor speichert jede Änderung sofort. Der Knopf prüft, ob das stimmt – er holt den
 * Stand vom Server und vergleicht ihn mit dem Entwurf im Editor (beide als `halleSchluessel`).
 */
export type SpeicherBericht = "gespeichert" | "fehler" | "anderswo";

export function speicherBericht(x: { letzteFehlgeschlagen: boolean; server: string; entwurf: string }): SpeicherBericht {
  if (x.letzteFehlgeschlagen) return "fehler";
  return x.server === x.entwurf ? "gespeichert" : "anderswo";
}

/**
 * Speicheranzeige oben rechts im Editor: „Keine Verbindung – wird erneut gesendet“, solange eine Speicherung auf das Netz
 * wartet (hallenplan-wiederholen.ts), sonst „Wird gespeichert …“, „Nicht gespeichert“ oder „Gespeichert“.
 */
export function speicherAnzeige(x: { bearbeiten: boolean; verbindung: boolean; speichertGerade: boolean; letzteFehlgeschlagen: boolean }): SpeicherStand | null {
  if (!x.bearbeiten) return null;
  if (x.verbindung) return "verbindung";
  if (x.speichertGerade) return "speichert";
  return x.letzteFehlgeschlagen ? "fehler" : "gespeichert";
}
