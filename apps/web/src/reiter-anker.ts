/**
 * Welcher Reiter gehört zum Anker der Adresse (…#druck)? Ein eigener Reiter oder – über `zuReiter` – ein Abschnitt
 * innerhalb eines Reiters (ältere Links). Unbekannt, leer oder nicht lesbar: undefined (die Seite bleibt beim gewählten).
 */
export function reiterAusAnker<T extends string>(anker: string, ids: readonly T[], zuReiter: Partial<Record<string, T>> = {}): T | undefined {
  let name: string;
  try {
    name = decodeURIComponent(anker.replace(/^#/, ""));
  } catch {
    return undefined;
  }
  if ((ids as readonly string[]).includes(name)) return name as T;
  return Object.hasOwn(zuReiter, name) ? zuReiter[name] : undefined;
}
