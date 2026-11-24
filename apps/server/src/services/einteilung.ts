import { bereicheAusRassen, formatKatalognummer, type EinteilTier, type RassenRegel } from "@schau/domain";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { katalogeintrag, prEinteilung, prZuteilung, schau } from "../db/schema";
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
 * Dieselbe Sperre geteilt: Tablets prüfen darunter, ob ihnen das Tier noch zugeteilt ist (ADR 033). Mehrere Tablets
 * zugleich, eine Einteilung oder Nummernvergabe wartet auf sie – und sie auf diese.
 */
export async function sperreEinteilungGeteilt(tx: Tx, schauId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(2026111201, ${schauId})`);
}

/**
 * Sparte, Rasse und Farbenschlag eines Tieres für die Einteilung. Ein Farbenschlag außerhalb des Verzeichnisses (freie
 * Angabe mit gewählter Rasse) zählt mit seinem Text; ohne Rasse steht der freie Text als Rasse. Jugend nur, wenn die Schau
 * die Jugend separat einteilt (`jugendSeparat`) – sonst geht sie mit ihrer Rasse.
 */
export function einteilTier(e: Pick<Eintrag, "sparte" | "rasse" | "farbenschlag" | "einordnungRasse" | "freitext"> & { istJugend?: boolean }, jugendSeparat = false): EinteilTier {
  const rasse = (e.rasse ?? e.einordnungRasse ?? e.freitext ?? "").trim();
  const farbenschlag = e.rasse ? e.farbenschlag : e.einordnungRasse ? e.freitext : null;
  return { sparte: e.sparte ?? null, rasse, farbenschlag: farbenschlag?.trim() || null, istJugend: jugendSeparat && !!e.istJugend };
}

/**
 * Gleicher Schlüssel für Anzeige, Speichern und Anwenden: ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen. Die
 * Jugend einer Rasse (Regel mit Merkmal) hat einen eigenen Schlüssel.
 */
export const einteilSchluessel = (sparte: string | null | undefined, rasse: string, farbenschlag?: string | null, jugend?: boolean) =>
  JSON.stringify([...[sparte ?? "", rasse, farbenschlag ?? ""].map((x) => x.trim().replace(/\s+/g, " ").toLowerCase()), ...(jugend ? ["jugend"] : [])]);

export async function ladeRegeln(ex: Tx, schauId: number): Promise<RassenRegel[]> {
  return ex
    .select({ preisrichterId: prZuteilung.preisrichterId, sparte: prZuteilung.sparte, rasse: prZuteilung.rasse, farbenschlag: prZuteilung.farbenschlag, jugend: prZuteilung.jugend })
    .from(prZuteilung)
    .where(eq(prZuteilung.schauId, schauId));
}

/** Teilt die Schau die Jugend in der Einteilung nach Rassen separat ein (Einstellung im Reiter „Einteilung nach Rassen“)? */
export async function jugendSeparatEingeteilt(ex: Tx, schauId: number): Promise<boolean> {
  const [s] = await ex.select({ separat: schau.einteilungJugendSeparat }).from(schau).where(eq(schau.id, schauId));
  return !!s?.separat;
}

/**
 * Nummernbereiche aus der Einteilung nach Rassen. Es zählen die bestätigten Tiere; Nummern nicht bestätigter (nach dem
 * Festschreiben behalten sie ihre Nummer) trennen die Bereiche. `jugendSeparat` fehlt: die Einstellung der Schau.
 */
export async function bereicheDerSchau(ex: Tx, schauId: number, regeln: RassenRegel[], jugendSeparat?: boolean) {
  const separat = jugendSeparat ?? (await jugendSeparatEingeteilt(ex, schauId));
  const eintraege = (await ladeEintraege(schauId, { ex })).filter((e) => e.katalogNr != null);
  const zaehlt = eintraege.filter((e) => e.meldungStatus === "bestaetigt");
  const b = bereicheAusRassen(
    eintraege.map((e) => ({ ...einteilTier(e, separat), id: e.id, nr: e.katalogNr!, suffix: e.suffix, zaehlt: e.meldungStatus === "bestaetigt" })),
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

/** Hat die Meldung Katalognummern? */
async function nummeriert(tx: Tx, meldungId: number) {
  const [x] = await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(and(eq(katalogeintrag.meldungId, meldungId), isNotNull(katalogeintrag.katalogNr))).limit(1);
  return !!x;
}

/**
 * Vor einem Statuswechsel: Hat die Meldung Katalognummern, die Einteilungssperre nehmen – am Anfang der Transaktion, vor
 * Zeilen und dem ersten `protokolliere()` (ADR 033). Danach hielte die Transaktion schon die Protokoll-Kette und die
 * Schau (KEY SHARE); ein Tablet mit geteilter Einteilungssperre oder „Nummern nach Plan“ verklemmten sich mit ihr.
 */
export async function sperreEinteilungFuerMeldung(tx: Tx, schauId: number, meldungId: number) {
  if (await nummeriert(tx, meldungId)) await sperreEinteilung(tx, schauId);
}

/**
 * Nach einem Statuswechsel einer Meldung mit Katalognummern (nach dem Festschreiben behalten sie ihre Nummern): Die
 * Bereiche folgen – eine wieder bestätigte Meldung bekommt ihren Preisrichter, eine zurückgesetzte trennt die Bereiche.
 * Die Sperre hat der Aufrufer vorher mit `sperreEinteilungFuerMeldung` genommen (hier nur noch einmal, ohne Warten).
 */
export async function einteilungNachStatus(tx: Tx, schauId: number, meldungId: number, akteur: Akteur) {
  if (!(await nummeriert(tx, meldungId))) return null;
  await sperreEinteilung(tx, schauId);
  return rassenEinteilungAnwenden(tx, schauId, akteur);
}
