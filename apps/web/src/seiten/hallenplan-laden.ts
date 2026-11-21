// Was die Seite „Hallenplan“ beim Laden zeigt (Seite hallenplan.tsx).

/**
 * Fehlerseite nur, solange es noch keinen Plan zu zeigen gibt. Scheitert später das Nachladen (nach dem Speichern, beim
 * Knopf „Speichern“, Netz kurz weg), bleibt der Editor mit Auswahl und Rückgängig stehen; darüber steht ein Hinweis.
 */
export function hallenplanAnsicht(x: { hatDaten: boolean; hatFehler: boolean }): { zeige: "fehler" | "laden" | "inhalt"; nachladeFehler: boolean } {
  if (!x.hatDaten) return { zeige: x.hatFehler ? "fehler" : "laden", nachladeFehler: false };
  return { zeige: "inhalt", nachladeFehler: x.hatFehler };
}

/**
 * Nach einer Speicherung im Editor (hallenplan-entwurf.ts): den Stand vom Server in den Entwurf übernehmen? Nur, wenn
 * nichts mehr unterwegs ist und der Stand stimmt – also frisch nachgeladen, oder die Speicherung scheiterte (dann ist der
 * zuletzt geladene Stand der richtige). Gespeichert, aber nicht nachgeladen: Entwurf behalten, sonst spränge der Editor
 * auf den Stand vor der Änderung und Rückgängig ginge verloren.
 */
export function serverStandUebernehmen(x: { gespeichert: boolean; geladen: boolean; offen: number; hatServer: boolean }): boolean {
  return x.offen === 0 && x.hatServer && (x.geladen || !x.gespeichert);
}
