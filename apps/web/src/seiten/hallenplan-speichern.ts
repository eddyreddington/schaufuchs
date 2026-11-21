// Knopf „Speichern“ im Hallenplan (Seite hallenplan.tsx): was er nach der Prüfung meldet.

/**
 * „Speichern“ im Hallenplan: Der Editor speichert jede Änderung sofort. Der Knopf prüft, ob das stimmt – er holt den
 * Stand vom Server und vergleicht ihn mit dem Entwurf im Editor (beide als `halleSchluessel`).
 */
export type SpeicherBericht = "gespeichert" | "fehler" | "anderswo";

export function speicherBericht(x: { letzteFehlgeschlagen: boolean; server: string; entwurf: string }): SpeicherBericht {
  if (x.letzteFehlgeschlagen) return "fehler";
  return x.server === x.entwurf ? "gespeichert" : "anderswo";
}
