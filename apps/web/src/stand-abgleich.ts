/**
 * Abgleich nach „inzwischen geändert“ (Entscheidung 033): Ausgehend vom geladenen Stand (`basis`) gelten die eigenen
 * Änderungen, für alles andere der frische Stand vom Server. `beidseitig` nennt die Felder, die hier und anderswo
 * verschieden geändert wurden – dort gilt die eigene Eingabe, die Oberfläche weist darauf hin.
 */
export function standAbgleichen<T extends Record<string, unknown>>(basis: T, eigen: T, frisch: T): { daten: T; beidseitig: (keyof T & string)[] } {
  const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const hier = (Object.keys(frisch) as (keyof T & string)[]).filter((k) => !gleich(eigen[k], basis[k]));
  return {
    daten: { ...frisch, ...Object.fromEntries(hier.map((k) => [k, eigen[k]])) },
    beidseitig: hier.filter((k) => !gleich(frisch[k], basis[k]) && !gleich(frisch[k], eigen[k])),
  };
}
