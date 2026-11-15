/**
 * Meisterschaftswertungen einer Schau (Entscheidung 014): Tiere aus Katalog und Bewertung für die Fachregel
 * (packages/domain/src/meisterschaft.ts) aufbereiten und alle Regeln der Schau auswerten.
 */
import { istVereinsmitglied, meisterschaftLesen, werteMeisterschaft, type MeisterschaftTier } from "@schau/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, preisart, schau } from "../db/schema";
import { eigeneVereinsnamen } from "./aussteller";
import { ladeEintraege, NICHT_VEROEFFENTLICHT, verdeckeNamen } from "./eintraege";

/**
 * Bewertete Einzeltiere bestätigter Meldungen. Preisrang = Platz der höchsten Preisart in der Reihenfolge der Preise
 * (1 = höchster Preis). Gewertet wird immer mit allen Daten; Namen blendet meisterschaftErgebnisse danach aus.
 */
export async function meisterschaftTiere(s: { id: number; organisationId: number }) {
  const [eintraege, preisarten, namen] = await Promise.all([
    ladeEintraege(s.id, { nurBestaetigt: true }),
    db.select({ id: preisart.id }).from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge), asc(preisart.id)),
    eigeneVereinsnamen(db, s.organisationId),
  ]);
  const rang = new Map(preisarten.map((p, i) => [p.id, i + 1]));
  const ids = [...new Set(eintraege.map((e) => e.ausstellerId))];
  const mitglied = new Map(
    (ids.length ? await db.select({ id: aussteller.id, verein: aussteller.verein, mitglied: aussteller.mitglied }).from(aussteller).where(inArray(aussteller.id, ids)) : []).map((a) => [a.id, istVereinsmitglied(a, namen)]),
  );
  const tiere: MeisterschaftTier[] = eintraege
    .filter((e) => e.art === "einzeltier")
    .map((e) => ({
      id: e.id,
      katalogNr: e.katalogNr,
      ausstellerId: e.ausstellerId,
      ausstellerName: e.ausstellerName,
      verein: e.verein ?? "",
      vereinsmitglied: mitglied.get(e.ausstellerId) ?? false,
      sparte: e.sparte ?? null,
      rasse: e.rasse ?? e.einordnungRasse ?? null,
      farbenschlag: e.farbenschlag ?? (e.freitext || null),
      geschlecht: e.geschlecht,
      alter: e.alter,
      // Sondernoten (u, o. B. …) zählen mit 0 Punkten; nicht bewertete Tiere gar nicht.
      punkte: e.punkte ?? (e.sondernote ? 0 : null),
      eigeneZucht: e.eigeneZucht,
      istJugend: e.istJugend,
      preisRang: e.preise.length ? Math.min(...e.preise.map((p) => rang.get(p.preisartId) ?? 999)) : null,
    }));
  return { tiere, eintraege };
}

/**
 * Alle Meisterschaften der Schau ausgewertet. `wo`: für Druck bzw. Internet stehen Aussteller ohne Zustimmung als
 * „nicht veröffentlicht“ da (wie im Katalog) – gezählt werden sie trotzdem, auch für ihren Verein.
 */
export async function meisterschaftErgebnisse(schauId: number, wo: "intern" | "druck" | "online" = "intern") {
  const [s] = await db.select({ id: schau.id, organisationId: schau.organisationId, meisterschaften: schau.meisterschaften }).from(schau).where(eq(schau.id, schauId));
  if (!s || !s.meisterschaften.length) return [];
  const { tiere, eintraege } = await meisterschaftTiere(s);
  const verdeckt = new Set(wo === "intern" ? [] : verdeckeNamen(eintraege, wo).filter((e) => e.verdeckt).map((e) => e.ausstellerId));
  // Verdeckte Aussteller: ohne Namen und – damit ihr Verein nicht über den Katalog zuzuordnen ist – ohne Katalognummer.
  const anzeige = <T extends { ausstellerId: number; ausstellerName: string; katalogNr: number | null }>(t: T) => (verdeckt.has(t.ausstellerId) ? { ...t, ausstellerName: NICHT_VEROEFFENTLICHT, katalogNr: null } : t);
  return s.meisterschaften.map((roh) => {
    const regel = meisterschaftLesen(roh);
    const { gruppen } = werteMeisterschaft(regel, tiere);
    return {
      regel,
      gruppen: gruppen.map((g) => ({
        ...g,
        kandidaten: g.kandidaten.map((k) => ({
          ...k,
          name: regel.art === "einzel" && verdeckt.has(k.ausstellerId) ? NICHT_VEROEFFENTLICHT : k.name,
          gezaehlt: k.gezaehlt.map(anzeige),
        })),
      })),
    };
  });
}
