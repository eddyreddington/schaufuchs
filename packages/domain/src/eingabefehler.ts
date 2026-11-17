/**
 * Fehler in den Angaben (hochgeladene Datei, Konto, Mandat), dessen Text der Server wörtlich als Meldung zeigen darf.
 * Router reichen nur diesen weiter – `catch (e) { if (e instanceof EingabeFehler) throw fehler("BAD_REQUEST", e.message);
 * throw e; }` –, jeder andere Fehler bleibt intern und erscheint nicht im Wortlaut (z. B. ein Programmfehler).
 */
export class EingabeFehler extends Error {
  override name = "EingabeFehler";
}
