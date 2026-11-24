/** Aussteller-Verwaltung des Vereins: anlegen, Stammdaten ändern, Vereinsmitglied (ohne Meldung, unter „Verein und Datenschutz“). */
import { istEigenerVerein, vereinsSchluessel } from "@schau/domain";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db/client";
import { aussteller, meldung, organisation, schau, sepaLauf } from "../db/schema";
import { fehler, dbId } from "../trpc";
import { sperreKasse } from "./kasse";
import { ausstellerEingabe } from "./meldung";
import { protokolliere, type Akteur } from "./protokoll";
import { echteAussteller } from "./testschau";

/** Wie bei der Meldung, ohne Geburtsdatum (zählt nur für den Jugendtarif und wird dort erfasst). */
export const ausstellerVerwaltungEingabe = z.object({
  id: dbId.optional(),
  daten: ausstellerEingabe.omit({ id: true, geburtsdatum: true }),
  /** „auto“: Mitglied nach der Vereinsangabe; „ja“/„nein“: von Hand. */
  mitglied: z.enum(["auto", "ja", "nein"]).default("auto"),
  /** Anlegen, obwohl es schon einen Aussteller mit gleichem Namen und gleicher PLZ gibt. */
  trotzdem: z.boolean().default(false),
  /**
   * Beim Bearbeiten: der Stand, mit dem das Formular geöffnet wurde. Hat ihn inzwischen jemand anders geändert
   * (z. B. die IBAN über eine Meldung), wird nichts gespeichert – sonst schriebe das alte Formular den alten Stand zurück.
   */
  vorher: z
    .object({
      ...Object.fromEntries(["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "verein", "kreisverband", "registriernummer", "iban", "kontoinhaber"].map((k) => [k, z.string().max(1000)])),
      istPreisrichter: z.boolean(),
      mitglied: z.boolean().nullable(),
    })
    .optional(),
});
export type AusstellerVerwaltungEingabe = z.infer<typeof ausstellerVerwaltungEingabe>;

const FELDER = ["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "verein", "kreisverband", "registriernummer", "istPreisrichter", "iban", "kontoinhaber"] as const;
/**
 * Im Protokoll steht die IBAN nur gekürzt; Telefon, E-Mail und Kontoinhaber gar nicht – sie werden bei einem
 * Löschwunsch sofort gelöscht, das Protokoll aber erst nach Ablauf der Aufbewahrungsfrist geleert.
 */
const maske = (k: string, v: string) => (k === "iban" && v ? `…${v.slice(-4)}` : (k === "telefon" || k === "email" || k === "kontoinhaber") && v ? "(angegeben)" : v);
const mitgliedWert = (m: "auto" | "ja" | "nein") => (m === "ja" ? true : m === "nein" ? false : null);
const mitgliedText = (m: boolean | null) => (m == null ? "automatisch" : m ? "ja" : "nein");

/** Kennung der Sperre je Verein und Name beim Anlegen (erster Schlüssel fest, zweiter aus Verein und Name). */
const NAMEN_SPERRE = 0x4e414d45; // "NAME"

/** Schreibweisen des eigenen Vereins. */
export async function eigeneVereinsnamen(tx: Pick<Tx, "select">, organisationId: number): Promise<string[]> {
  const [o] = await tx.select({ n: organisation.vereinsnamen }).from(organisation).where(eq(organisation.id, organisationId));
  return o?.n ?? [];
}

/** Legt einen Aussteller an oder ändert seine Stammdaten. Gibt die Nummer zurück. */
export async function speichereAussteller(tx: Tx, organisationId: number, input: AusstellerVerwaltungEingabe, akteur: Akteur) {
  const d = input.daten;
  const mitglied = mitgliedWert(input.mitglied);
  if (!input.id) {
    // Zwei gleichzeitige Anlagen derselben Person: die zweite wartet und sieht dann die erste.
    await tx.execute(sql`select pg_advisory_xact_lock(${NAMEN_SPERRE}::int, hashtext(lower(${`${organisationId}:${d.vorname} ${d.nachname}`})))`);
    if (!input.trotzdem) {
      const gleich = await tx
        .select({ id: aussteller.id })
        .from(aussteller)
        .where(
          and(
            eq(aussteller.organisationId, organisationId),
            isNull(aussteller.geloeschtAm),
            isNull(aussteller.gesperrtAm),
            echteAussteller(),
            sql`lower(${aussteller.vorname}) = lower(${d.vorname})`,
            sql`lower(${aussteller.nachname}) = lower(${d.nachname})`,
            eq(aussteller.plz, d.plz),
          ),
        )
        .limit(1);
      if (gleich.length) throw fehler("CONFLICT", `${d.vorname} ${d.nachname} mit PLZ ${d.plz || "(leer)"} gibt es schon. Bitte den vorhandenen Eintrag bearbeiten – oder bewusst ein zweites Mal anlegen.`);
    }
    const [a] = await tx.insert(aussteller).values({ ...d, mitglied, organisationId }).returning({ id: aussteller.id });
    await protokolliere(tx, {
      schauId: null,
      tabelle: "aussteller",
      datensatzId: a!.id,
      aktion: "Aussteller angelegt",
      neu: { ...Object.fromEntries(FELDER.map((k) => [k, maske(k, String(d[k] ?? ""))])), mitglied: mitgliedText(mitglied) },
      akteur,
    });
    return { id: a!.id };
  }

  if (!input.vorher) throw fehler("BAD_REQUEST", "Bitte das Formular neu öffnen.");
  const [vor] = await tx.select().from(aussteller).where(and(eq(aussteller.id, input.id), eq(aussteller.organisationId, organisationId)));
  if (!vor) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");

  // Schauen des Ausstellers: Protokoll (auch abgeschlossene – ihr Online-Katalog zeigt den Namen) und Bankdaten-Sperre.
  const schauen = await tx
    .selectDistinct({ id: schau.id, phase: schau.phase })
    .from(meldung)
    .innerJoin(schau, eq(schau.id, meldung.schauId))
    .where(eq(meldung.ausstellerId, input.id));
  schauen.sort((x, y) => x.id - y.id);
  const laufend = schauen.filter((s) => s.phase !== "abgeschlossen");
  // Bankdaten: Kassensperre jeder laufenden Schau – vor der Zeilensperre, in derselben Reihenfolge wie die Meldung
  // (erst Kasse, dann Aussteller), sonst verklemmen sich beide. Keine SEPA-Datei zwischen Prüfung und Speichern.
  const bankAbsehbar = d.iban !== vor.iban || d.kontoinhaber !== vor.kontoinhaber;
  if (bankAbsehbar) for (const s of laufend) await sperreKasse(tx, s.id);

  // Zeile sperren: gleichzeitige Änderungen schreiben sonst beide ihre „alten“ Werte ins Protokoll.
  const [a] = await tx.select().from(aussteller).where(and(eq(aussteller.id, input.id), eq(aussteller.organisationId, organisationId))).for("update");
  if (!a) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
  if (a.gesperrtAm || a.geloeschtAm) throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern.");
  const v = input.vorher;
  const veraltet = FELDER.some((k) => String(a[k] ?? "") !== String(v[k as keyof typeof v] ?? "")) || a.mitglied !== v.mitglied;
  if (veraltet) throw fehler("CONFLICT", "Die Angaben wurden inzwischen geändert (z. B. über eine Meldung). Bitte das Formular schließen und neu öffnen.");

  const aenderungen: { feld: string; alt: string; neu: string }[] = [];
  for (const k of FELDER) {
    const alt = String(a[k] ?? "");
    const neu = String(d[k] ?? "");
    if (alt !== neu) aenderungen.push({ feld: k, alt: maske(k, alt), neu: maske(k, neu) });
  }
  if (a.mitglied !== mitglied) aenderungen.push({ feld: "mitglied", alt: mitgliedText(a.mitglied), neu: mitgliedText(mitglied) });
  if (!aenderungen.length) return { id: a.id };

  const bank = aenderungen.some((x) => x.feld === "iban" || x.feld === "kontoinhaber");
  if (bank) {
    if (!bankAbsehbar) throw fehler("CONFLICT", "Die Bankdaten wurden inzwischen geändert. Bitte das Formular schließen und neu öffnen.");
    const offen = await tx
      .select({ daten: sepaLauf.daten })
      .from(sepaLauf)
      .innerJoin(schau, eq(schau.id, sepaLauf.schauId))
      .where(and(eq(sepaLauf.status, "offen"), eq(schau.organisationId, organisationId)));
    if (offen.some((l) => (l.daten as { posten: { ausstellerId: number }[] }).posten.some((p) => p.ausstellerId === a.id))) {
      throw fehler("BAD_REQUEST", "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen, dann die Bankdaten ändern.");
    }
  }

  await tx.update(aussteller).set({ ...d, mitglied }).where(eq(aussteller.id, a.id));
  const alt = Object.fromEntries(aenderungen.map((x) => [x.feld, x.alt]));
  const neu = Object.fromEntries(aenderungen.map((x) => [x.feld, x.neu]));
  const aktion = "Stammdaten geändert (Aussteller-Verwaltung)";
  // Test-Aussteller: nur im Protokoll ihrer Testschau (unten) – das Vereinsprotokoll gehört echten Ausstellern.
  if (!a.testSchauId) await protokolliere(tx, { schauId: null, tabelle: "aussteller", datensatzId: a.id, aktion, alt, neu, akteur });
  // Auch im Protokoll jeder Schau des Ausstellers: Reklamationen werden je Schau nachgesehen, und der Eintrag erneuert
  // Online-Katalog und Ergebnisse dieser Schau (Zwischenspeicher nach Protokollstand) – erst wenn alles gespeichert ist.
  // Nur das Mitglieds-Kennzeichen geändert: öffentlich ändert sich nichts.
  if (aenderungen.some((x) => x.feld !== "mitglied") || a.testSchauId) {
    for (const s of schauen) await protokolliere(tx, { schauId: s.id, tabelle: "aussteller", datensatzId: a.id, aktion, alt, neu, akteur });
  }
  return { id: a.id };
}

/** Schreibweisen des eigenen Vereins festlegen (leere und doppelte fallen weg). */
export async function setzeVereinsnamen(tx: Tx, organisationId: number, namen: string[], akteur: Akteur) {
  const gesehen = new Set<string>();
  const neu: string[] = [];
  for (const n of namen.map((x) => x.trim().replace(/\s+/g, " "))) {
    const k = vereinsSchluessel(n);
    if (!k || gesehen.has(k)) continue;
    gesehen.add(k);
    neu.push(n);
  }
  const [o] = await tx.select({ n: organisation.vereinsnamen }).from(organisation).where(eq(organisation.id, organisationId)).for("no key update");
  const alt = o?.n ?? [];
  if (JSON.stringify(alt) === JSON.stringify(neu)) return { namen: neu };
  await tx.update(organisation).set({ vereinsnamen: neu }).where(eq(organisation.id, organisationId));
  await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: organisationId, aktion: "Schreibweisen des Vereins (Mitglieder)", alt: { namen: alt }, neu: { namen: neu }, akteur });
  return { namen: neu };
}

/** Vereinsangaben der Aussteller mit Anzahl, für das Festlegen der eigenen Schreibweisen. */
export async function vereinsangabenUebersicht(tx: Pick<Tx, "select">, organisationId: number) {
  const [eigene, zeilen] = await Promise.all([
    eigeneVereinsnamen(tx, organisationId),
    tx
      .select({ verein: aussteller.verein, anzahl: sql<number>`count(*)::int` })
      .from(aussteller)
      .where(and(eq(aussteller.organisationId, organisationId), echteAussteller(), isNull(aussteller.geloeschtAm), ne(aussteller.verein, "")))
      .groupBy(aussteller.verein),
  ]);
  return {
    eigene,
    angaben: zeilen
      .map((z) => ({ ...z, eigen: istEigenerVerein(z.verein, eigene) }))
      .sort((x, y) => Number(y.eigen) - Number(x.eigen) || y.anzahl - x.anzahl || x.verein.localeCompare(y.verein, "de")),
  };
}
