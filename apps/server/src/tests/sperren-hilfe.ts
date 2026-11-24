/**
 * Hilfen für Tests zum gleichzeitigen Arbeiten (Entscheidung 033): statt fester Wartezeit nachsehen, ob die Gegenseite
 * tatsächlich auf eine Sperre wartet (pg_locks) – deterministisch und ohne unnötiges Warten.
 */
import { m } from "./kontext";

/**
 * Anzahl der Sperranfragen in dieser Datenbank, die gerade warten. Gezählt wird die ganze Datenbank: Die Tests brauchen
 * sie für sich allein (eigene TEST_DATABASE_URL je Lauf, kein Server daneben), sonst gilt ein fremder Wartender mit.
 */
async function wartende() {
  const [{ n }] = (await m.sql`select count(*)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid where not l.granted and a.datname = current_database()`) as [{ n: number }];
  return n;
}

/** Wartet, bis `anzahl` Sperranfragen warten (mehrere Aufrufe); sonst Fehler (die Gegenseite wartet nicht). */
export async function wartet(anzahl = 1) {
  for (let i = 0; i < 100; i++) {
    if ((await wartende()) >= anzahl) return;
    await Bun.sleep(50);
  }
  throw new Error("Die Gegenseite wartet nicht auf die Sperre.");
}

/** Wie `wartet`, endet aber auch, sobald `p` fertig ist (die Gegenseite brauchte keine Sperre). */
export async function wartetOderFertig(p: Promise<unknown>) {
  let fertig = false;
  void p.then(
    () => (fertig = true),
    () => (fertig = true),
  );
  for (let i = 0; i < 100 && !fertig; i++) {
    if ((await wartende()) > 0) return;
    await Bun.sleep(50);
  }
}
