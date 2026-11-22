/**
 * Dateien per Ziehen und Ablegen (rein, ohne DOM, mit Test): welche Datei eine Ablagefläche annimmt und wann ein
 * Ablegen außerhalb abgefangen wird. Ohne das öffnet der Browser eine fallen gelassene Datei selbst und verlässt die Seite.
 * Baustein dazu: `DateiAblage` in ui-ablage.tsx.
 */

type Datei = { name: string; type: string };

/** Bildformate der Bildfelder (Katalog, Rassebilder, Käfigsockel). */
export const BILD_TYPEN = ["image/jpeg", "image/png"] as const;

/** Zieht der Nutzer Dateien (nicht markierten Text oder einen Link)? `typen` wie `DataTransfer.types`. */
export function ziehtDateien(typen: ArrayLike<string> | null | undefined): boolean {
  // bleibt deutsch: kein Text, sondern der feste Typ in DataTransfer.types
  return !!typen && Array.from(typen).includes("Files");
}

/** Passt eine Datei zu Angaben wie im accept-Attribut („image/png“, „image/*“, „.csv“)? Ohne Angaben passt alles. */
export function passtZu(d: Datei, accept: readonly string[]): boolean {
  if (!accept.length) return true;
  const typ = d.type.toLowerCase();
  const name = d.name.toLowerCase();
  return accept.some((a) => {
    const x = a.trim().toLowerCase();
    if (x.startsWith(".")) return name.endsWith(x);
    if (x.endsWith("/*")) return typ.startsWith(x.slice(0, -1));
    return typ === x;
  });
}

/** Die abgelegte Datei: die erste passende, sonst die erste überhaupt (die Prüfung beim Hochladen meldet dann das Format). */
export function dateiAusAblage<T extends Datei>(dateien: ArrayLike<T> | null | undefined, accept: readonly string[]): T | undefined {
  const alle = dateien ? Array.from(dateien) : [];
  return alle.find((d) => passtZu(d, accept)) ?? alle[0];
}

/**
 * Ein Ziehen/Ablegen auf der Seite abfangen (preventDefault, kein Ablegen möglich)? Ja bei Dateien – außer eine
 * Ablagefläche hat das Ereignis schon angenommen, oder es geht auf ein sichtbares Dateifeld (das legt der Browser selbst ab).
 */
export function ablageAbfangen(e: { typen: ArrayLike<string> | null | undefined; defaultPrevented: boolean; aufDateifeld: boolean }): boolean {
  return ziehtDateien(e.typen) && !e.defaultPrevented && !e.aufDateifeld;
}
