/**
 * Preisrichter anlegen, ändern und löschen (`preisrichter.speichern`, `.loeschen`): Prüfung der Obmann-Zuordnung (unter
 * Sperre der Preisrichter der Schau) und der Gruppen, Protokoll der Änderungen. Hört ein Obmann auf, Obmann zu sein, oder
 * wird er gelöscht, verlieren die ihm zugeordneten Preisrichter die Zuordnung.
 */
import { bdrgGruppe, bdrgGruppeGueltig, pruefeObmann, type Zusage } from "@schau/domain";
import { and, asc, eq } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { preisrichter } from "../db/schema";
import { TRPCError } from "@trpc/server";
import { fehler } from "../trpc";
import { protokolliere, type Akteur } from "./protokoll";

export interface PreisrichterEingabe {
  schauId: number;
  id?: number;
  name: string;
  anschrift: string;
  email: string;
  telefon: string;
  istObmann: boolean;
  sparten: string[];
  anschriftImKatalog?: boolean;
  /** Fehlt eine der folgenden Angaben, bleibt der Stand. */
  gruppen?: string[];
  obmannId?: number | null;
  zusage?: Zusage;
  zugesagtFuer?: string;
  vorbehalt?: string;
}

type Zeile = typeof preisrichter.$inferSelect;
/** Felder mit altem und neuem Wert im Protokoll. */
const PROTOKOLL_FELDER = ["name", "anschriftImKatalog", "istObmann", "sparten", "gruppen", "obmannId", "zusage", "zugesagtFuer"] as const;
/**
 * Kontaktdaten und Vorbehalt (freier Text, kann Privates enthalten): das Protokoll lässt sich nicht löschen – nur
 * vermerken, dass sie sich geändert haben, ohne Werte.
 */
const OHNE_WERT_FELDER = ["anschrift", "email", "telefon", "vorbehalt"] as const;

/** Gruppen einheitlich (ohne Leerzeichen, groß), ohne Doppelte; eine ungültige lehnt ab. */
export function gruppenAusEingabe(gruppen: string[]): string[] {
  const aus: string[] = [];
  for (const g of gruppen) {
    const n = bdrgGruppe(g);
    if (!n) continue;
    if (!bdrgGruppeGueltig(n)) throw fehler("BAD_REQUEST", "Gruppe ungültig – kurzer Text wie A, Z1 oder BV.");
    if (!aus.includes(n)) aus.push(n);
  }
  return aus;
}

export async function speicherePreisrichter(input: PreisrichterEingabe, akteur: Akteur): Promise<{ id: number }> {
  const { id, gruppen, ...rest } = input;
  const werte = { ...rest, ...(gruppen ? { gruppen: gruppenAusEingabe(gruppen) } : {}) };
  return db.transaction(async (tx) => {
    // Gesperrt (in fester Folge): ändert eine andere Anfrage gleichzeitig den Haken „Obmann“, wartet diese und sieht
    // danach den neuen Stand – sonst zeigte die Zuordnung womöglich auf einen, der kein Obmann mehr ist.
    const derSchau = await tx
      .select({ id: preisrichter.id, istObmann: preisrichter.istObmann })
      .from(preisrichter)
      .where(eq(preisrichter.schauId, input.schauId))
      .orderBy(asc(preisrichter.id))
      .for("update");
    // Beim Ändern zählt der neue Stand des Preisrichters selbst (wird er gerade Obmann, ist er es noch nicht für sich).
    const grund = pruefeObmann(id, werte.obmannId, derSchau);
    if (grund === "selbst") throw fehler("BAD_REQUEST", "Ein Preisrichter kann nicht sein eigener Obmann sein.");
    if (grund === "unbekannt") throw fehler("BAD_REQUEST", "Obmann nicht gefunden.");
    if (grund === "keinObmann") throw fehler("BAD_REQUEST", "Der gewählte Preisrichter ist kein Obmann.");
    if (!id) {
      const [r] = await tx.insert(preisrichter).values(werte).returning();
      await protokolliere(tx, { schauId: input.schauId, tabelle: "preisrichter", datensatzId: r!.id, aktion: "angelegt", neu: auswahl(r!), akteur });
      return { id: r!.id };
    }
    const [alt] = await tx.select().from(preisrichter).where(eq(preisrichter.id, id));
    if (!alt || alt.schauId !== input.schauId) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
    const [neu] = await tx.update(preisrichter).set(werte).where(eq(preisrichter.id, id)).returning();
    const anders = (k: keyof Zeile) => JSON.stringify(alt[k]) !== JSON.stringify(neu![k]);
    const geaendert = PROTOKOLL_FELDER.filter(anders);
    const ohneWert = OHNE_WERT_FELDER.filter(anders);
    if (geaendert.length || ohneWert.length)
      await protokolliere(tx, {
        schauId: input.schauId,
        tabelle: "preisrichter",
        datensatzId: id,
        aktion: "geändert",
        alt: Object.fromEntries(geaendert.map((k) => [k, alt[k]])),
        neu: { ...Object.fromEntries(geaendert.map((k) => [k, neu![k]])), ...(ohneWert.length ? { geaendertOhneWert: ohneWert } : {}) },
        akteur,
      });
    if (alt.istObmann && !neu!.istObmann) await loeseZuordnungen(tx, input.schauId, id, akteur);
    return { id };
  });
}

/**
 * Löscht einen Preisrichter der Schau mit Protokoll (Felder wie beim Anlegen); die ihm als Obmann Zugeordneten verlieren
 * die Zuordnung vorher ausdrücklich, mit Protokoll. Hat er schon bewertet, lehnt die Datenbank ab (CONFLICT).
 */
export async function loeschePreisrichter(schauId: number, id: number, akteur: Akteur): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [alt] = await tx.select().from(preisrichter).where(and(eq(preisrichter.id, id), eq(preisrichter.schauId, schauId))).for("update");
      if (!alt) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
      await loeseZuordnungen(tx, schauId, id, akteur);
      await tx.delete(preisrichter).where(eq(preisrichter.id, id));
      await protokolliere(tx, { schauId, tabelle: "preisrichter", datensatzId: id, aktion: "gelöscht", alt: auswahl(alt), akteur });
    });
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw fehler("CONFLICT", "Der Preisrichter hat schon bewertet und kann nicht gelöscht werden.");
  }
}

/** Ein Preisrichter ist nicht mehr Obmann: die ihm zugeordneten verlieren die Zuordnung (je mit Protokoll). */
async function loeseZuordnungen(tx: Tx, schauId: number, obmannId: number, akteur: Akteur) {
  const geloest = await tx
    .update(preisrichter)
    .set({ obmannId: null })
    .where(and(eq(preisrichter.schauId, schauId), eq(preisrichter.obmannId, obmannId)))
    .returning({ id: preisrichter.id });
  for (const r of geloest)
    await protokolliere(tx, { schauId, tabelle: "preisrichter", datensatzId: r.id, aktion: "Obmann-Zuordnung gelöst", alt: { obmannId }, neu: { obmannId: null }, akteur });
}

function auswahl(r: Zeile) {
  return Object.fromEntries(PROTOKOLL_FELDER.map((k) => [k, r[k]]));
}
