/**
 * SEPA-Lastschrift im Datenschutz (Entscheidung 018): was über Mandate und Einzüge in die Auskunft gehört (Art. 15),
 * was der Löschwunsch entfernt (Art. 17) und wann die Bereinigung Mandate löscht. Aufgerufen aus services/datenschutz.ts.
 */
import { mandatLoeschbar, tagBerlin } from "@schau/domain";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { lastschriftLauf, schau, sepaMandat } from "../db/schema";
import { fehler } from "../trpc";

/** Lastschriftläufe des Vereins, in denen der Aussteller steht (mit Namen der Schau). */
async function laeufeMit(ex: Pick<Tx, "select">, organisationId: number, ausstellerId: number) {
  const alle = await ex
    .select({ l: lastschriftLauf, schau: schau.name })
    .from(lastschriftLauf)
    .innerJoin(schau, eq(schau.id, lastschriftLauf.schauId))
    .where(eq(schau.organisationId, organisationId))
    .orderBy(lastschriftLauf.id);
  return alle.filter(({ l }) => l.daten.posten.some((p) => p.ausstellerId === ausstellerId));
}

/** Für die Auskunft: Mandate mit Bankverbindung und alle Einzüge (auch verworfene Dateien und Rücklastschriften). */
export async function lastschriftAuskunft(organisationId: number, ausstellerId: number) {
  const mandate = await db
    .select()
    .from(sepaMandat)
    .where(and(eq(sepaMandat.organisationId, organisationId), eq(sepaMandat.ausstellerId, ausstellerId)))
    .orderBy(sepaMandat.id);
  const laeufe = await laeufeMit(db, organisationId, ausstellerId);
  return {
    mandate: mandate.map((m) => ({
      referenz: m.referenz,
      unterschriebenAm: m.unterschriebenAm,
      wiederkehrend: m.wiederkehrend,
      iban: m.iban,
      kontoinhaber: m.kontoinhaber,
      widerrufenAm: m.widerrufenAm,
      letzteNutzungAm: m.letzteNutzungAm,
    })),
    einzuege: laeufe.flatMap(({ l, schau: name }) =>
      l.daten.posten
        .filter((p) => p.ausstellerId === ausstellerId)
        .map((p) => ({ schau: name, datei: l.nachrichtId, faelligAm: l.faelligAm, status: l.status, betragCent: p.betragCent, mandatsreferenz: p.mandatsreferenz, zurueckgebucht: !!p.zurueck })),
    ),
  };
}

/**
 * Löschwunsch: Mandate widerrufen und ohne Bankdaten (Referenz und Datum bleiben als Nachweis bis zur Frist), in
 * früheren Lastschriftdateien Name und Bankdaten weg (Betrag und Mandatsreferenz bleiben für die Buchhaltung).
 * Steht der Aussteller in einer offenen Datei, lehnt der Löschwunsch ab – sie geht mit IBAN und Name zur Bank.
 */
export async function loescheLastschriftDaten(tx: Tx, organisationId: number, ausstellerId: number, jetzt: Date) {
  const laeufe = await laeufeMit(tx, organisationId, ausstellerId);
  if (laeufe.some(({ l }) => l.status === "offen")) throw fehler("BAD_REQUEST", "Der Aussteller steht in einer offenen Lastschriftdatei – erst die Datei buchen oder verwerfen.");
  const heute = tagBerlin(jetzt);
  const mandate = await tx.select({ id: sepaMandat.id, widerrufenAm: sepaMandat.widerrufenAm }).from(sepaMandat).where(eq(sepaMandat.ausstellerId, ausstellerId));
  for (const m of mandate) await tx.update(sepaMandat).set({ iban: "", kontoinhaber: "", widerrufenAm: m.widerrufenAm ?? heute }).where(eq(sepaMandat.id, m.id));
  // Je Lauf gesperrt neu lesen (in Reihenfolge der IDs): eine gleichzeitige Rücklastschrift ändert dieselbe Zeile – mit
  // der Kopie von oben ginge ihr Kennzeichen „zurück“ verloren (Entscheidung 033).
  for (const { l: ungesperrt } of laeufe) {
    const [l] = await tx.select().from(lastschriftLauf).where(eq(lastschriftLauf.id, ungesperrt.id)).for("update");
    if (!l) continue;
    const posten = l.daten.posten.map((p) => (p.ausstellerId === ausstellerId ? { ...p, name: "Gelöscht", kontoinhaber: "", iban: "" } : p));
    await tx.update(lastschriftLauf).set({ daten: { ...l.daten, posten } }).where(eq(lastschriftLauf.id, l.id));
  }
}

/** Bereinigung: Mandate 14 Monate nach Widerruf bzw. Verfall löschen (Fristen in packages/domain/src/lastschrift.ts). */
export async function bereinigeMandate(jetzt: Date, organisationId?: number) {
  const stichtag = tagBerlin(jetzt);
  const kandidaten = await db
    .select({ id: sepaMandat.id, widerrufenAm: sepaMandat.widerrufenAm, letzteNutzungAm: sepaMandat.letzteNutzungAm, unterschriebenAm: sepaMandat.unterschriebenAm })
    .from(sepaMandat)
    .where(organisationId ? eq(sepaMandat.organisationId, organisationId) : undefined);
  const ids = kandidaten.filter((m) => mandatLoeschbar(m, stichtag)).map((m) => m.id);
  if (ids.length) await db.delete(sepaMandat).where(inArray(sepaMandat.id, ids));
  return ids.length;
}
