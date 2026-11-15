/**
 * Testschauen (Üben, Vorführen) sind von echten Schauen getrennt: Aussteller, die in einer Testschau angelegt oder
 * gemeldet werden, gehören nur ihr (`aussteller.testSchauId`). Echte Schauen, Vorschläge und die Aussteller-Verwaltung
 * sehen sie nie; eine Testschau sieht keine echten Aussteller (keine Übungsmeldungen in Auskunft und Protokoll echter
 * Personen). Mit dem Löschen der Testschau verschwinden ihre Aussteller (Kaskade).
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { aenderung, aussteller, meldung, schau } from "../db/schema";
import { fehler } from "../trpc";
import { sperreKasse } from "./kasse";
import { protokolliere, type Akteur } from "./protokoll";

type SchauBereich = { id: number; test: boolean };

const TEST_SPERRE = 0x54455354; // "TEST"
/** Jede Meldung hält diese Sperre geteilt; das Kennzeichnen als Testschau wartet exklusiv, bis keine mehr läuft. */
export async function sperreTestschauGeteilt(tx: Pick<Tx, "execute">, schauId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(${TEST_SPERRE}::int, ${schauId}::int)`);
}

/** Bedingung: Aussteller, die in dieser Schau vorkommen dürfen. */
export const ausstellerDerSchau = (s: SchauBereich) => (s.test ? eq(aussteller.testSchauId, s.id) : isNull(aussteller.testSchauId));

/** Bedingung: echte Aussteller (Verwaltung, Vorschläge, Schreibweisen). */
export const echteAussteller = () => isNull(aussteller.testSchauId);

/** Wert für `testSchauId` eines in dieser Schau neu angelegten Ausstellers. */
export const testSchauIdFuer = (s: SchauBereich) => (s.test ? s.id : null);

/** Wirft, wenn der Aussteller nicht in diese Schau gehört (Test-Aussteller in echter Schau oder umgekehrt). */
export function pruefeAusstellerZurSchau(a: { testSchauId: number | null }, s: SchauBereich) {
  if ((a.testSchauId ?? null) === testSchauIdFuer(s)) return;
  throw fehler(
    "BAD_REQUEST",
    a.testSchauId != null
      ? "Dieser Aussteller gehört zu einer Testschau und kann in einer anderen Schau nicht gemeldet werden."
      : "In einer Testschau lassen sich keine echten Aussteller melden – bitte einen Test-Aussteller neu anlegen.",
  );
}

/** Exklusiv: Kennzeichnen und Löschen einer Testschau warten, bis keine Meldung dieser Schau mehr läuft. */
export async function sperreTestschauExklusiv(tx: Pick<Tx, "execute">, schauId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${TEST_SPERRE}::int, ${schauId}::int)`);
}

const name = (a: { vorname: string; nachname: string }) => `${a.vorname} ${a.nachname}`;

/**
 * Was eine echte Schau ausmacht, die nicht mehr zur Testschau werden darf: Geld, Belege, Verkäufe, Kasse,
 * Gesundheitsjournal. Eine Testschau lässt sich samt allem löschen – das darf echte Aufzeichnungen nie treffen.
 */
async function geldUndBelege(tx: Pick<Tx, "execute">, schauId: number): Promise<string[]> {
  const zahl = async (q: ReturnType<typeof sql>) => Number(((await tx.execute(q)) as unknown as { n: number }[])[0]?.n ?? 0);
  const liste: [number, string][] = [
    [await zahl(sql`select count(*)::int as n from zahlung z join meldung m on m.id = z.meldung_id where m.schau_id = ${schauId}`), "Zahlung(en)"],
    [await zahl(sql`select count(*)::int as n from kassenbewegung where schau_id = ${schauId}`), "Kassenbuchung(en)"],
    [await zahl(sql`select count(*)::int as n from kassenabschluss where schau_id = ${schauId}`), "Tagesabschluss/-abschlüsse"],
    [await zahl(sql`select count(*)::int as n from auszahlung where schau_id = ${schauId}`), "Auszahlung(en)"],
    [await zahl(sql`select count(*)::int as n from sepa_lauf where schau_id = ${schauId}`), "SEPA-Datei(en)"],
    [await zahl(sql`select count(*)::int as n from beleg where schau_id = ${schauId}`), "Beleg(e)"],
    [await zahl(sql`select count(*)::int as n from verkauf v join katalogeintrag k on k.id = v.katalogeintrag_id where k.schau_id = ${schauId}`), "Verkauf/Verkäufe"],
    [await zahl(sql`select count(*)::int as n from stiftung where schau_id = ${schauId}`), "Stiftung(en)"],
    [await zahl(sql`select count(*)::int as n from gesundheit where schau_id = ${schauId}`), "Eintrag/Einträge im Gesundheitsjournal"],
  ];
  return liste.filter(([n]) => n > 0).map(([n, was]) => `${n} ${was}`);
}

/**
 * Wer würde beim Kennzeichnen Test-Aussteller, und wer ist echt? Echt ist, wer auch in einer anderen Schau gemeldet,
 * von Hand als Vereinsmitglied gesetzt oder in der Aussteller-Verwaltung angelegt, bearbeitet oder per Datenschutz
 * gesperrt wurde (Protokoll ohne Schau). Stornierte Meldungen zählen mit – sie hängen weiter am Aussteller.
 * Echte bekommen beim Kennzeichnen eine Test-Kopie (`kopien`).
 */
async function einordnen(tx: Pick<Tx, "select" | "selectDistinct">, schauId: number, sperren: boolean) {
  const ids = (await tx.selectDistinct({ id: meldung.ausstellerId }).from(meldung).where(eq(meldung.schauId, schauId))).map((x) => x.id);
  if (!ids.length) return { werden: [], kopien: [] };
  const abfrage = tx.select().from(aussteller).where(inArray(aussteller.id, ids));
  const rows = sperren ? await abfrage.for("update") : await abfrage;
  const anderswo = new Set(
    (await tx.selectDistinct({ id: meldung.ausstellerId }).from(meldung).where(and(inArray(meldung.ausstellerId, ids), ne(meldung.schauId, schauId)))).map((x) => x.id),
  );
  const verwaltet = new Set(
    (await tx.selectDistinct({ id: aenderung.datensatzId }).from(aenderung).where(and(eq(aenderung.tabelle, "aussteller"), isNull(aenderung.schauId), inArray(aenderung.datensatzId, ids)))).map((x) => x.id),
  );
  const istEcht = (a: (typeof rows)[number]) => a.testSchauId != null || anderswo.has(a.id) || a.mitglied != null || verwaltet.has(a.id);
  const sortiert = [...rows].sort((x, y) => name(x).localeCompare(name(y), "de"));
  return { werden: sortiert.filter((a) => !istEcht(a)), kopien: sortiert.filter(istEcht) };
}

/** Vorschau für die Oberfläche: künftige Test-Aussteller, echte (bekommen eine Test-Kopie) und was das Kennzeichnen verhindert. */
export async function testschauVorschau(tx: Pick<Tx, "select" | "selectDistinct" | "execute">, schauId: number) {
  const { werden, kopien } = await einordnen(tx, schauId, false);
  return { werden: werden.map(name), kopien: kopien.map(name), hindernisse: await geldUndBelege(tx, schauId) };
}

export const KOPIE_AKTION = "Meldung auf Test-Kopie umgehängt";

/** Test-Kopien eines echten Ausstellers (für Auskunft und Löschen): über den Protokolleintrag beim Kennzeichnen. */
export async function testKopienVon(tx: Pick<Tx, "select">, ausstellerId: number) {
  const eintraege = await tx
    .select({ neu: aenderung.neu })
    .from(aenderung)
    .where(and(eq(aenderung.tabelle, "aussteller"), eq(aenderung.datensatzId, ausstellerId), eq(aenderung.aktion, KOPIE_AKTION)));
  const ids = eintraege.map((e) => Number((e.neu as { ausstellerId?: number } | null)?.ausstellerId)).filter((x) => Number.isInteger(x));
  if (!ids.length) return [];
  return tx
    .select({ id: aussteller.id, vorname: aussteller.vorname, nachname: aussteller.nachname, verein: aussteller.verein, schau: schau.name, testSchauId: aussteller.testSchauId })
    .from(aussteller)
    .innerJoin(schau, eq(schau.id, aussteller.testSchauId))
    .where(inArray(aussteller.id, ids));
}

/**
 * Eine Schau nachträglich als Testschau kennzeichnen. Nur ohne Geld, Belege, Verkäufe und Gesundheitsjournal
 * (`geldUndBelege`) – eine Testschau lässt sich samt allem löschen. Ihre Aussteller werden Test-Aussteller dieser
 * Schau. Echte Aussteller (siehe `einordnen`) bleiben unverändert; ihre Meldungen in dieser Schau gehen auf eine
 * Test-Kopie über, die nur Name und Verein trägt – nur mit `kopien: true`, also nach Bestätigung. `anzahl`: so viele
 * Aussteller hat die Vorschau gezeigt; ist es inzwischen anders, wird nichts geändert. Endgültig.
 */
export async function kennzeichneAlsTestschau(tx: Tx, organisationId: number, schauId: number, akteur: Akteur, opts: { anzahl?: number; kopien?: boolean } = {}) {
  // Zuerst die Sperre: Laufende Meldungen dieser Schau (die noch „echt“ gelesen haben) sind dann fertig, neue warten
  // und lesen danach „Testschau“. Meldungen in anderen Schauen sperren die Ausstellerzeile (speichereMeldung).
  // Die Kassensperre hält Zahlungen und Kasse fest, bis das Kennzeichen gesetzt ist.
  await sperreTestschauExklusiv(tx, schauId);
  await sperreKasse(tx, schauId);
  const [s] = await tx.select().from(schau).where(and(eq(schau.id, schauId), eq(schau.organisationId, organisationId))).for("update");
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  if (s.test) return { aussteller: 0, kopien: 0 };
  const hindernisse = await geldUndBelege(tx, schauId);
  if (hindernisse.length) {
    throw fehler("BAD_REQUEST", `Die Schau hat schon ${hindernisse.join(", ")} – echte Aufzeichnungen, die nicht mit einer Testschau gelöscht werden dürfen. Sie lässt sich deshalb nicht als Testschau kennzeichnen.`);
  }
  const { werden, kopien } = await einordnen(tx, schauId, true);
  const liste = (l: { vorname: string; nachname: string }[]) => `${l.slice(0, 10).map(name).join(", ")}${l.length > 10 ? ` und ${l.length - 10} weitere` : ""}`;
  if (opts.anzahl != null && opts.anzahl !== werden.length + kopien.length) throw fehler("CONFLICT", "Inzwischen sind Meldungen dazugekommen – bitte die Vorschau neu öffnen.");
  if (kopien.length && !opts.kopien) {
    throw fehler("BAD_REQUEST", `In dieser Schau sind echte Aussteller gemeldet: ${liste(kopien)}. Ihre Meldungen gehen beim Kennzeichnen auf Test-Kopien über – bitte in der Vorschau bestätigen.`);
  }
  // Erst die Schau, dann die Aussteller: Die Datenbank-Trigger prüfen jeden Aussteller gegen seine Schauen.
  await tx.update(schau).set({ test: true }).where(eq(schau.id, schauId));
  for (const a of kopien) {
    // Test-Kopie nur mit Name und Verein (keine Anschrift, Kontakt-, Bank- oder Geburtsdaten); Sperr- und Löschstand
    // bleiben (gelöschte Daten kommen so nicht zurück). Die echten Stammdaten bleiben, wie sie sind.
    const [k] = await tx
      .insert(aussteller)
      .values({ organisationId, testSchauId: schauId, vorname: a.vorname, nachname: a.nachname, verein: a.verein, kreisverband: a.kreisverband, gesperrtAm: a.gesperrtAm, loeschenAb: a.loeschenAb, geloeschtAm: a.geloeschtAm })
      .returning({ id: aussteller.id });
    await tx.update(meldung).set({ ausstellerId: k!.id }).where(and(eq(meldung.schauId, schauId), eq(meldung.ausstellerId, a.id)));
    // Was über Meldungen dieser Schau an den echten Stammdaten geändert wurde, stand nur in ihrem Protokoll – das
    // verschwindet mit der Testschau. Deshalb ins Vereinsprotokoll übernehmen.
    const spuren = await tx.select().from(aenderung).where(and(eq(aenderung.schauId, schauId), eq(aenderung.tabelle, "aussteller"), eq(aenderung.datensatzId, a.id)));
    for (const p of spuren) {
      await protokolliere(tx, { schauId: null, tabelle: "aussteller", datensatzId: a.id, aktion: `${p.aktion} (aus „${s.name}“, jetzt Testschau)`, alt: p.alt, neu: p.neu, grund: p.grund || undefined, akteur });
    }
    await protokolliere(tx, { schauId, tabelle: "aussteller", datensatzId: a.id, aktion: KOPIE_AKTION, alt: { ausstellerId: a.id }, neu: { ausstellerId: k!.id }, akteur });
    await protokolliere(tx, { schauId: null, tabelle: "aussteller", datensatzId: a.id, aktion: KOPIE_AKTION, alt: { ausstellerId: a.id }, neu: { ausstellerId: k!.id, schau: s.name }, akteur });
  }
  if (werden.length) await tx.update(aussteller).set({ testSchauId: schauId }).where(inArray(aussteller.id, werden.map((a) => a.id)));
  const neu = { test: true, testAussteller: werden.length, testKopien: kopien.length };
  await protokolliere(tx, { schauId, tabelle: "schau", datensatzId: schauId, aktion: "Als Testschau gekennzeichnet", alt: { test: false }, neu, akteur });
  await protokolliere(tx, { schauId: null, tabelle: "schau", datensatzId: schauId, aktion: "Als Testschau gekennzeichnet", neu: { schau: s.name, ...neu }, akteur });
  return { aussteller: werden.length, kopien: kopien.length };
}
