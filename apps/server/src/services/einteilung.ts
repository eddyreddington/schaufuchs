import { bereicheAusRassen, formatKatalognummer, type EinteilTier, type RassenRegel } from "@schau/domain";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { katalogeintrag, prEinteilung, prZuteilung } from "../db/schema";
import { ladeEintraege, type Eintrag } from "./eintraege";
import { protokolliere, type Akteur } from "./protokoll";
import { zuteilung } from "./pruefung";

/**
 * Sperre je Schau für alles, was Nummern oder Preisrichter-Bereiche schreibt (Nummernvergabe, Einteilung nach Rassen und
 * nach Nummern): Sonst rechnete eine Einteilung mit Nummern, die eine gleichzeitige Vergabe gerade ändert.
 */
export async function sperreEinteilung(tx: Tx, schauId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(2026111201, ${schauId})`);
}

/**
 * Sparte, Rasse und Farbenschlag eines Tieres für die Einteilung. Ein Farbenschlag außerhalb des Verzeichnisses (freie
 * Angabe mit gewählter Rasse) zählt mit seinem Text; ohne Rasse steht der freie Text als Rasse.
 */
export function einteilTier(e: Pick<Eintrag, "sparte" | "rasse" | "farbenschlag" | "einordnungRasse" | "freitext">): EinteilTier {
  const rasse = (e.rasse ?? e.einordnungRasse ?? e.freitext ?? "").trim();
  const farbenschlag = e.rasse ? e.farbenschlag : e.einordnungRasse ? e.freitext : null;
  return { sparte: e.sparte ?? null, rasse, farbenschlag: farbenschlag?.trim() || null };
}

/** Gleicher Schlüssel für Anzeige, Speichern und Anwenden: ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen. */
export const einteilSchluessel = (sparte: string | null | undefined, rasse: string, farbenschlag?: string | null) =>
  JSON.stringify([sparte ?? "", rasse, farbenschlag ?? ""].map((x) => x.trim().replace(/\s+/g, " ").toLowerCase()));

export async function ladeRegeln(ex: Tx, schauId: number): Promise<RassenRegel[]> {
  return ex
    .select({ preisrichterId: prZuteilung.preisrichterId, sparte: prZuteilung.sparte, rasse: prZuteilung.rasse, farbenschlag: prZuteilung.farbenschlag })
    .from(prZuteilung)
    .where(eq(prZuteilung.schauId, schauId));
}

/**
 * Nummernbereiche aus der Einteilung nach Rassen. Es zählen die bestätigten Tiere; Nummern nicht bestätigter (nach dem
 * Festschreiben behalten sie ihre Nummer) trennen die Bereiche.
 */
export async function bereicheDerSchau(ex: Tx, schauId: number, regeln: RassenRegel[]) {
  const eintraege = (await ladeEintraege(schauId, { ex })).filter((e) => e.katalogNr != null);
  const zaehlt = eintraege.filter((e) => e.meldungStatus === "bestaetigt");
  const b = bereicheAusRassen(
    eintraege.map((e) => ({ ...einteilTier(e), id: e.id, nr: e.katalogNr!, suffix: e.suffix, zaehlt: e.meldungStatus === "bestaetigt" })),
    regeln,
  );
  return { nummeriert: zaehlt.length, ...b };
}

/**
 * Nach dem Vergeben der Katalognummern: Gibt es eine Einteilung nach Rassen, rechnet sie die Bereiche neu (sonst bleibt
 * eine von Hand gesetzte Einteilung nach Nummern stehen). Läuft in der Transaktion der Nummernvergabe (unter der Sperre).
 * Wechselte dabei ein schon bewertetes Tier oder eines mit Preis den Preisrichter, bleiben die Bereiche, wie sie sind –
 * das geht nur mit Rückfrage unter „Preisrichter“; die Nummern stehen dann unter `nichtUebernommen`.
 */
export async function rassenEinteilungAnwenden(tx: Tx, schauId: number, akteur: Akteur) {
  const regeln = await ladeRegeln(tx, schauId);
  if (!regeln.length) return null;
  const b = await bereicheDerSchau(tx, schauId, regeln);
  const [bisher, eintraege] = await Promise.all([tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, schauId)), ladeEintraege(schauId, { nurBestaetigt: true, ex: tx })]);
  const alt = zuteilung(eintraege, bisher);
  const neu = zuteilung(eintraege, b.bereiche);
  const umgehaengt = eintraege.filter((e) => (e.bewertet || e.preise.length > 0) && alt.has(e.id) && alt.get(e.id) !== neu.get(e.id)).map((e) => formatKatalognummer(e));
  const ergebnis = { ohne: b.ohne, abweichend: b.abweichend.map((x) => x.nummer), nichtUebernommen: umgehaengt };
  if (umgehaengt.length) return ergebnis;
  await tx.delete(prEinteilung).where(eq(prEinteilung.schauId, schauId));
  if (b.bereiche.length) await tx.insert(prEinteilung).values(b.bereiche.map((x) => ({ ...x, schauId })));
  await protokolliere(tx, {
    schauId,
    tabelle: "pr_einteilung",
    datensatzId: null,
    aktion: "aus Einteilung nach Rassen",
    neu: { bereiche: b.bereiche, ...(b.ohne ? { ohnePreisrichter: b.ohne } : {}), ...(b.abweichend.length ? { abweichend: ergebnis.abweichend } : {}) },
    akteur,
  });
  return ergebnis;
}

/**
 * Nach einem Statuswechsel einer Meldung mit Katalognummern (nach dem Festschreiben behalten sie ihre Nummern): Die
 * Bereiche folgen – eine wieder bestätigte Meldung bekommt ihren Preisrichter, eine zurückgesetzte trennt die Bereiche.
 */
export async function einteilungNachStatus(tx: Tx, schauId: number, meldungId: number, akteur: Akteur) {
  const [nummeriert] = await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(and(eq(katalogeintrag.meldungId, meldungId), isNotNull(katalogeintrag.katalogNr))).limit(1);
  if (!nummeriert) return null;
  await sperreEinteilung(tx, schauId);
  return rassenEinteilungAnwenden(tx, schauId, akteur);
}
