import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { aenderung } from "../db/schema";

/**
 * Protokoll einer Schau, neueste zuerst, seitenweise (vorId = kleinste id der vorigen Seite).
 * Die Suche läuft in der Datenbank über alle Einträge, nicht nur über die geladene Seite.
 */
export function sucheProtokoll(schauId: number, o: { q?: string; vorId?: number | null; limit: number }) {
  const q = o.q?.trim();
  // % und _ sind in LIKE Platzhalter – wörtlich suchen.
  const muster = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : "";
  return db
    .select()
    .from(aenderung)
    .where(
      and(
        eq(aenderung.schauId, schauId),
        q
          ? or(
              ilike(aenderung.wer, muster),
              ilike(aenderung.aktion, muster),
              ilike(aenderung.tabelle, muster),
              ilike(aenderung.grund, muster),
              sql`${aenderung.neu}::text ilike ${muster}`,
              sql`${aenderung.alt}::text ilike ${muster}`,
            )
          : undefined,
        o.vorId ? lt(aenderung.id, o.vorId) : undefined,
      ),
    )
    .orderBy(desc(aenderung.id))
    .limit(o.limit);
}

/**
 * Prüft die Hash-Kette des Protokolls einer Schau: Jeder Eintrag muss zu seinem gespeicherten Hash passen, sein
 * Inhalt (falls nicht anonymisiert) zum Inhalts-Hash, und der Vorgänger zum Vorgänger-Hash. Fehlt ein Vorgänger,
 * ist das nur in Ordnung, wenn sein Löschen vermerkt ist (Entfernen eines ganzen Demo-Vereins); sonst ist die Kette
 * unterbrochen. Beginnt die Kette mitten im Bestand neu, wird das ebenfalls gemeldet.
 * Hash-Aufbau 1 (ältere Einträge): Felder mit „|“ verbunden; Aufbau 2: JSON-Array; Aufbau 3: Grund im Inhalts-Hash
 * (anonymisierbar). Einträge ohne Hash stammen aus
 * der Zeit vor der Kette und werden gezählt, aber nicht geprüft.
 */
export async function pruefeProtokoll(schauId: number) {
  const zeilen = (await db.execute(sql`
    select a.id, a.zeitpunkt, a.aktion,
      a.hash is null as alt,
      a.hash is not null and a.hash <> case when a.hash_version >= 2 then aenderung_eintrag_hash(a)
        else encode(sha256(convert_to(concat_ws('|', coalesce(a.vorher_hash, ''), a.id, a.schau_id, a.tabelle,
          a.datensatz_id, a.aktion, a.benutzer_id, a.preisrichter_id, a.wer, a.grund,
          to_char(a.zeitpunkt at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), a.inhalt_hash), 'UTF8')), 'hex') end as eintrag_falsch,
      -- Anonymisiert (alles geleert): nichts mehr zu prüfen.
      (a.alt is not null or a.neu is not null or (a.hash_version >= 3 and a.grund <> '')) and a.inhalt_hash <> case
        when a.hash_version >= 3 then aenderung_inhalt_hash(a.alt, a.neu, a.grund)
        when a.hash_version = 2 then aenderung_inhalt_hash(a.alt, a.neu)
        else encode(sha256(convert_to(coalesce(a.alt::text, '') || '|' || coalesce(a.neu::text, ''), 'UTF8')), 'hex') end as inhalt_falsch,
      p.id is not null and p.hash is distinct from a.vorher_hash as kette_falsch,
      a.vorher_id is not null and p.id is null and g.id is null as luecke,
      a.vorher_id is not null and p.id is null and g.id is not null as vermerkt,
      a.vorher_id is not null and p.id is null and g.id is not null and g.schau_id is not distinct from ${schauId} as vermerkt_eigen,
      a.hash is not null and a.vorher_id is null and exists (select 1 from aenderung x where x.id < a.id and x.hash is not null) as neubeginn,
      -- Geleert: Inhalt jetzt leer, der gespeicherte Inhalts-Hash gehört aber zu einem Inhalt.
      a.alt is null and a.neu is null and a.inhalt_hash is not null and a.inhalt_hash <> case
        when coalesce(a.hash_version, 1) >= 3 then aenderung_inhalt_hash(null, null, a.grund)
        when a.hash_version = 2 then aenderung_inhalt_hash(null, null)
        else encode(sha256(convert_to('|', 'UTF8')), 'hex') end as geleert,
      an.id is not null as anonymisiert
    from aenderung a
    left join aenderung p on p.id = a.vorher_id
    left join aenderung_geloescht g on g.id = a.vorher_id
    left join aenderung_anonymisiert an on an.id = a.id
    where a.schau_id = ${schauId}
    order by a.id`)) as unknown as {
    id: number;
    zeitpunkt: Date;
    aktion: string;
    alt: boolean;
    eintrag_falsch: boolean;
    inhalt_falsch: boolean;
    kette_falsch: boolean;
    luecke: boolean;
    vermerkt: boolean;
    vermerkt_eigen: boolean;
    neubeginn: boolean;
    geleert: boolean;
    anonymisiert: boolean;
  }[];
  const grund = (z: (typeof zeilen)[number]) =>
    z.eintrag_falsch ? "Eintrag verändert" : z.inhalt_falsch ? "Inhalt verändert" : z.kette_falsch ? "Kette unterbrochen" : z.luecke ? "Vorgänger fehlt (gelöscht)" : z.neubeginn ? "Kette neu begonnen" : z.geleert && !z.anonymisiert ? "Inhalt ohne Vermerk geleert" : "";
  const fehler: { id: number; zeitpunkt: Date | null; aktion: string; grund: string }[] = zeilen
    .filter((z) => grund(z))
    .map((z) => ({ id: z.id, zeitpunkt: z.zeitpunkt, aktion: z.aktion, grund: grund(z) }));
  // Kettenkopf: Der zuletzt verkettete Eintrag muss noch da und unverändert sein – sonst fiele das Löschen des
  // jüngsten Eintrags nicht auf (er hat noch keinen Nachfolger, der auf ihn zeigt).
  const kopf = await kettenkopf();
  if (kopf.id != null && !kopf.vermerkt && (!kopf.da || kopf.hashAbweichend)) {
    fehler.push({ id: kopf.id, zeitpunkt: null, aktion: "Kettenkopf", grund: kopf.da ? "jüngster Eintrag verändert" : "jüngster Eintrag fehlt (gelöscht)" });
  }
  return {
    /**
     * Stand zum Festhalten außerhalb der Datenbank (Kassenbericht, Ausdruck): der letzte eigene Eintrag dieser Schau.
     * Über die Verkettung sichert sein Prüfwert auch alle früheren Einträge; der globale Kettenkopf verriete die
     * Aktivität anderer Vereine.
     */
    kopf: await eigenerKopf(schauId),
    geprueft: zeilen.filter((z) => !z.alt).length,
    ohneKette: zeilen.filter((z) => z.alt).length,
    /** Lücken durch vermerktes Entfernen in dieser Schau – kein Fehler, aber sichtbar (fremde Vereine zählen nicht mit). */
    vermerkt: zeilen.filter((z) => z.vermerkt_eigen).length,
    /** Anonymisierte Einträge (Inhalt nach Fristablauf oder Löschwunsch geleert, mit Vermerk). */
    anonymisiert: zeilen.filter((z) => z.geleert && z.anonymisiert).length,
    fehler,
  };
}

/** Letzter verketteter Eintrag einer Schau mit gekürztem Prüfwert – für Ausdrucke und die Anzeige im Verein. */
export async function eigenerKopf(schauId: number) {
  const [k] = (await db.execute(sql`select id, hash from aenderung where schau_id = ${schauId} and hash is not null order by id desc limit 1`)) as unknown as {
    id: number;
    hash: string;
  }[];
  return { id: k?.id ?? null, pruefwert: k?.hash?.slice(0, 16) ?? "" };
}

/** Kopf der Hash-Kette: letzter verketteter Eintrag (über alle Vereine) mit gekürztem Prüfwert – nur für die interne Prüfung. */
export async function kettenkopf() {
  const [k] = (await db.execute(sql`
    select k.letzte_id as id, k.letzter_hash as hash, a.id is not null as da,
      a.id is not null and a.hash is distinct from k.letzter_hash as hash_abweichend, g.id is not null as vermerkt
    from aenderung_kette k
    left join aenderung a on a.id = k.letzte_id
    left join aenderung_geloescht g on g.id = k.letzte_id
    where k.id = 1`)) as unknown as { id: number | null; hash: string | null; da: boolean; hash_abweichend: boolean; vermerkt: boolean }[];
  return { id: k?.id ?? null, pruefwert: k?.hash?.slice(0, 16) ?? "", da: !!k?.da, hashAbweichend: !!k?.hash_abweichend, vermerkt: !!k?.vermerkt };
}
