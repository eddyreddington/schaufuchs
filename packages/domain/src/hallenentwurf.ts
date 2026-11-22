/**
 * Hallenplan-Entwürfe (Entscheidung 017): Rückfrage, bevor ein Entwurf die Halle ersetzt. Nach dem Katalogdruck stimmen
 * Käfigplätze und Karten erst wieder nach „Käfigplätze nach Plan“; eingelieferte Tiere (auch als fehlend gemeldete und
 * ausgesetzte – ihr Käfig steht schon) müssen umgesetzt werden, wenn ihr Käfig woanders steht.
 */

/** Status eines Tiers, das schon in der Halle war: zählt für die Rückfrage. */
export const IN_DER_HALLE = ["eingeliefert", "fehlt", "ausgesetzt"] as const;

/** Text der Rückfrage oder `null`, wenn ohne Rückfrage geladen werden kann. */
export function entwurfRueckfrage(e: { gedruckt: boolean; eingeliefert: number }): string | null {
  const saetze: string[] = [];
  if (e.eingeliefert === 1) saetze.push("1 Tier ist schon eingeliefert – sitzt es nach dem Entwurf woanders, muss es in der Halle umgesetzt werden.");
  else if (e.eingeliefert > 1)
    saetze.push(`${e.eingeliefert} Tiere sind schon eingeliefert – sitzen sie nach dem Entwurf woanders, müssen sie in der Halle umgesetzt werden.`);
  if (e.gedruckt) saetze.push("Der Katalog ist gedruckt – Käfigplätze und Karten stimmen nach dem Laden erst wieder nach „Käfigplätze nach Plan“.");
  return saetze.length ? saetze.join(" ") : null;
}
