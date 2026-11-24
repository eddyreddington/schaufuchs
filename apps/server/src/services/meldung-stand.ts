/**
 * Stand einer Meldung für das Bearbeitungsformular (Entscheidung 033): ein Prüfwert über alles, was das Formular
 * zurückschreibt – Aussteller, Meldungsfelder und Tiere. Das Formular bekommt ihn mit meldung.get und sendet ihn beim
 * Speichern mit; weicht er dann ab, hat inzwischen jemand anders gespeichert, und das veraltete Formular überschriebe
 * dessen Änderung (oder löschte ein inzwischen hinzugefügtes Tier) still. Nicht dabei: Status, Zahlungen, Katalognummer,
 * Einlieferung und die Online-Einwilligung (die schützt schon onlineZustimmungVorher).
 */
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { aussteller, katalogeintrag, meldung } from "../db/schema";

export const MELDUNG_VERALTET = "Die Meldung wurde inzwischen geändert – bitte neu laden und die Änderung noch einmal machen.";

export async function meldungStand(ex: Pick<Tx, "select">, meldungId: number): Promise<string> {
  const [m] = await ex.select().from(meldung).where(eq(meldung.id, meldungId));
  if (!m) return "";
  const [a] = await ex.select().from(aussteller).where(eq(aussteller.id, m.ausstellerId));
  const tiere = await ex.select().from(katalogeintrag).where(eq(katalogeintrag.meldungId, meldungId)).orderBy(asc(katalogeintrag.id));
  const daten = {
    m: [m.istJugend, m.teilschau, m.istPreisrichter, m.bemerkung, !!m.zustimmungAm, m.erziehungsberechtigter, !!m.erklaerungenAm, !!m.namenWiderspruchAm],
    a: a ? [a.vorname, a.nachname, a.strasse, a.plz, a.ort, a.telefon, a.email, a.verein, a.kreisverband, a.registriernummer, a.geburtsdatum, a.istPreisrichter, a.iban, a.kontoinhaber] : null,
    t: tiere.map((e) => [e.id, e.farbenschlagId, e.rasseId, e.freitext, e.art, e.geschlecht, e.alter, e.istAoc, e.istNeuzuechtung, e.eigeneZucht, e.verkaufspreisCent, e.ringnummern]),
  };
  return createHash("sha256").update(JSON.stringify(daten)).digest("base64url").slice(0, 22);
}
