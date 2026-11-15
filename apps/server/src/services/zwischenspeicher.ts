import { count, eq, max } from "drizzle-orm";
import { db } from "../db/client";
import { aenderung } from "../db/schema";

/**
 * Öffentlicher Katalog und Ergebnisse sind je Schau nach dem Stand des Protokolls zwischengespeichert. Ein paar
 * Änderungen landen nicht im Protokoll (Katalog-Gestaltung, Angaben der Preisrichter) – sie zählen hier mit.
 */
const zaehler = new Map<number, number>();

/** Nach einer Änderung ohne Protokolleintrag aufrufen, die öffentlich sichtbar ist. */
export function oeffentlichGeaendert(schauId: number) {
  zaehler.set(schauId, (zaehler.get(schauId) ?? 0) + 1);
}

/**
 * Rassebilder gelten für alle Schauen eines Vereins und stehen mit `schauId: null` im Protokoll – nach jeder Änderung
 * alle öffentlichen Kataloge sofort neu (selten, und ein gelöschtes Bild muss z. B. auf Verlangen des Urhebers sofort weg).
 */
let rassebilderStand = 0;
export function rassebilderGeaendert() {
  rassebilderStand++;
}
/** Ebenso die Termine für „Kommende Schauen“ (gelten für alle Schauen eines Vereins). */
export function termineGeaendert() {
  rassebilderStand++;
}

/**
 * Stand einer Schau für die Zwischenspeicher: Anzahl und jüngste Nummer der Protokolleinträge (die Anzahl ändert sich
 * auch, wenn eine ältere Transaktion erst nach einer jüngeren fertig wird) und der Zähler oben.
 */
export async function oeffentlicherStand(schauId: number) {
  const [x] = await db.select({ n: count(), max: max(aenderung.id) }).from(aenderung).where(eq(aenderung.schauId, schauId));
  const maxId = x?.max ?? 0;
  const z = (zaehler.get(schauId) ?? 0) + rassebilderStand; // beide zählen nur hoch – die Summe ändert sich mit jedem
  return { schluessel: `${x?.n ?? 0}:${maxId}:${z}`, maxId, zaehler: z };
}
