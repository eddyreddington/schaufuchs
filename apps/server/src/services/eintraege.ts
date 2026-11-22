import { berechneMeldebetrag, kaefigTyp, teilschauenLesen, teilschauFolge, teilschauVon, tierart, type FolgeEintrag, type KaefigRegel, type NotenStufe } from "@schau/domain";
import { and, asc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db/client";
import {
  aussteller,
  bewertung,
  farbenschlag,
  gebuehr,
  katalogeintrag,
  meldung,
  preisart,
  schau,
  preisvergabe,
  rasse,
  sparte,
  spende,
  stiftung,
  verkauf,
  zahlung,
} from "../db/schema";

// Rasse und Sparte, bei denen ein Eintrag mit freier Bezeichnung eingeordnet ist.
const rasseFrei = alias(rasse, "rasse_frei");
const sparteFrei = alias(sparte, "sparte_frei");

/** Alle Katalogeinträge einer Schau mit allem, was Listen, Katalog und Preise brauchen. */
export async function ladeEintraege(schauId: number, opts: { nurMeldungId?: number; nurBestaetigt?: boolean; ex?: Tx } = {}) {
  // In Transaktionen deren Verbindung nutzen – eine zweite aus dem Pool kann bei Last zur Verklemmung führen.
  const ex = opts.ex ?? db;
  const where = [eq(katalogeintrag.schauId, schauId)];
  if (opts.nurMeldungId) where.push(eq(katalogeintrag.meldungId, opts.nurMeldungId));
  if (opts.nurBestaetigt) where.push(eq(meldung.status, "bestaetigt"));

  const rows = await ex
    .select({
      id: katalogeintrag.id,
      meldungId: katalogeintrag.meldungId,
      position: katalogeintrag.position,
      art: katalogeintrag.art,
      geschlecht: katalogeintrag.geschlecht,
      alter: katalogeintrag.alter,
      istAoc: katalogeintrag.istAoc,
      istNeuzuechtung: katalogeintrag.istNeuzuechtung,
      eigeneZucht: katalogeintrag.eigeneZucht,
      verkaufspreisCent: katalogeintrag.verkaufspreisCent,
      katalogNr: katalogeintrag.katalogNr,
      suffix: katalogeintrag.suffix,
      kaefig: katalogeintrag.kaefig,
      kaefigWahl: katalogeintrag.kaefigWahl,
      kaefigBlock: katalogeintrag.kaefigBlock,
      ringnummern: katalogeintrag.ringnummern,
      status: katalogeintrag.status,
      freitext: katalogeintrag.freitext,
      farbenschlagId: katalogeintrag.farbenschlagId,
      farbenschlag: farbenschlag.name,
      farbFolge: farbenschlag.folge,
      rasse: rasse.name,
      rasseFolge: rasse.folge,
      sparte: sparte.name,
      sparteFolge: sparte.folge,
      einordnungRasseId: katalogeintrag.rasseId,
      einordnungRasse: rasseFrei.name,
      einordnungRasseFolge: rasseFrei.folge,
      einordnungSparte: sparteFrei.name,
      einordnungSparteFolge: sparteFrei.folge,
      /** BDRG-Gruppe der Rasse (bei freier Bezeichnung die der gewählten Rasse); leer = nicht gepflegt. */
      gruppe: sql<string>`coalesce(${rasse.gruppe}, ${rasseFrei.gruppe}, '')`,
      ausstellerId: aussteller.id,
      vorname: aussteller.vorname,
      nachname: aussteller.nachname,
      ort: aussteller.ort,
      verein: aussteller.verein,
      // Herkunft (Viehverkehr): ausländische Nummer verlangt Gesundheitszertifikat und TRACES.
      registriernummer: aussteller.registriernummer,
      istJugend: meldung.istJugend,
      teilschau: meldung.teilschau,
      meldungStatus: meldung.status,
      zustimmungAm: meldung.zustimmungAm,
      onlineZustimmungAm: meldung.onlineZustimmungAm,
      namenWiderspruchAm: meldung.namenWiderspruchAm,
      // Gelöscht oder gesperrt (Löschwunsch während der Aufbewahrungsfrist): nirgends mehr mit Namen.
      ausstellerGesperrt: sql<boolean>`(${aussteller.gesperrtAm} is not null or ${aussteller.geloeschtAm} is not null)`,
      bewertungId: bewertung.id,
      punkte: bewertung.punkte,
      sondernote: bewertung.sondernote,
      vorzuege: bewertung.vorzuege,
      wuensche: bewertung.wuensche,
      maengel: bewertung.maengel,
      bewertetVon: bewertung.preisrichterId,
      obmannBestaetigtAm: bewertung.obmannBestaetigtAm,
      bewertungVersion: katalogeintrag.bewertungVersion,
      verkauftAn: verkauf.kaeuferName,
      verkaufBelegNr: verkauf.belegNr,
      // Krank, verdächtig oder verendet (Eintrag im Gesundheitsjournal mit Sperre): kein Verkauf, kein Preis.
      gesperrt: sql<boolean>`exists (select 1 from gesundheit g where g.katalogeintrag_id = "katalogeintrag"."id" and (g.sperre or g.verendet))`,
    })
    .from(katalogeintrag)
    .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
    .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
    .leftJoin(farbenschlag, eq(farbenschlag.id, katalogeintrag.farbenschlagId))
    .leftJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
    .leftJoin(sparte, eq(sparte.id, rasse.sparteId))
    .leftJoin(rasseFrei, eq(rasseFrei.id, katalogeintrag.rasseId))
    .leftJoin(sparteFrei, eq(sparteFrei.id, rasseFrei.sparteId))
    .leftJoin(bewertung, eq(bewertung.katalogeintragId, katalogeintrag.id))
    // Nur der gültige Verkauf – stornierte bleiben für die Verkaufsliste in der Tabelle stehen.
    .leftJoin(verkauf, and(eq(verkauf.katalogeintragId, katalogeintrag.id), isNull(verkauf.storniertAm)))
    .where(and(...where))
    .orderBy(asc(katalogeintrag.katalogNr), asc(katalogeintrag.suffix), asc(katalogeintrag.meldungId), asc(katalogeintrag.position));

  const ids = rows.map((r) => r.id);
  const preise = ids.length
    ? await ex
        .select({
          vergabeId: preisvergabe.id,
          katalogeintragId: preisvergabe.katalogeintragId,
          preisartId: preisart.id,
          kuerzel: preisart.kuerzel,
          name: preisart.name,
          // Betrag zum Zeitpunkt der Vergabe (ältere Vergaben ohne Eintrag: Betrag der Preisart).
          betragCent: sql<number>`coalesce(${preisvergabe.betragCent}, ${preisart.betragCent})`,
          quelle: preisart.quelle,
          preisrichterId: preisvergabe.preisrichterId,
          stiftungId: preisvergabe.stiftungId,
        })
        .from(preisvergabe)
        .innerJoin(preisart, eq(preisart.id, preisvergabe.preisartId))
        .where(inArray(preisvergabe.katalogeintragId, ids))
    : [];

  // Teilschauen der Schau: Stelle in der Katalogfolge und Name für Überschriften und Listen.
  const [sch] = await ex.select({ teilschauen: schau.teilschauen }).from(schau).where(eq(schau.id, schauId));
  const teilschauen = teilschauenLesen(sch?.teilschauen);
  return rows.map((r) => ({
    ...r,
    teilschauFolge: teilschauFolge(teilschauen, r.teilschau),
    teilschauName: teilschauVon(teilschauen, r.teilschau)?.name ?? null,
    // Freie Bezeichnung: Sparte der gewählten Rasse; AOC ans Ende der Rasse, Neuzüchtung ans Ende der Sparte.
    sparte: r.sparte ?? r.einordnungSparte,
    sparteFolge: r.sparteFolge ?? r.einordnungSparteFolge,
    rasseFolge: r.rasseFolge ?? (r.istNeuzuechtung ? null : r.einordnungRasseFolge),
    bezeichnung: bezeichnung(r),
    tierart: tierart(r.sparte ?? r.einordnungSparte, r.rasse ?? r.einordnungRasse),
    ausstellerName: `${r.nachname}, ${r.vorname}`,
    /** Name, Ort und Verein ausgeblendet (keine Zustimmung zur Veröffentlichung). */
    verdeckt: false,
    bewertet: r.punkte != null || r.sondernote != null,
    preise: preise.filter((p) => p.katalogeintragId === r.id),
  }));
}

export type Eintrag = Awaited<ReturnType<typeof ladeEintraege>>[number];

export const NICHT_VEROEFFENTLICHT = "nicht veröffentlicht";

/**
 * Blendet Name, Wohnort und Verein aus, wo die Zustimmung fehlt: im Druck ohne unterschriebenen Meldebogen,
 * im Internet zusätzlich ohne Einwilligung in die Online-Veröffentlichung. Nur für die Ausgabe –
 * Reihenfolge und Nummern hängen am echten Namen und sind vorher vergeben.
 */
export function verdeckeNamen<T extends Eintrag>(eintraege: T[], wo: "druck" | "online"): T[] {
  return eintraege.map((e) =>
    // Widerspruch gegen die Nennung (Art. 21 DSGVO): weder im Druck noch online.
    e.zustimmungAm && (wo === "druck" || e.onlineZustimmungAm) && !e.ausstellerGesperrt && !e.namenWiderspruchAm
      ? e
      : { ...e, vorname: "", nachname: NICHT_VEROEFFENTLICHT, ort: "", verein: "", ausstellerName: NICHT_VEROEFFENTLICHT, verdeckt: true },
  );
}

/** Anzeigename im Katalog: „Nachname, Vorname“ bzw. „Vorname Nachname“, ausgeblendet als „nicht veröffentlicht“. */
export function ausstellerAnzeige(e: { vorname: string; nachname: string; verdeckt: boolean }, form: "nachname" | "vorname" = "nachname") {
  if (e.verdeckt) return NICHT_VEROEFFENTLICHT;
  return form === "nachname" ? `${e.nachname}, ${e.vorname}` : `${e.vorname} ${e.nachname}`;
}

export function bezeichnung(r: { rasse: string | null; farbenschlag: string | null; freitext: string; istAoc: boolean; istNeuzuechtung: boolean }) {
  const basis = r.rasse ? `${r.rasse}, ${r.farbenschlag}` : r.freitext || "(ohne Bezeichnung)";
  const zusatz = [r.istAoc ? "AOC" : "", r.istNeuzuechtung ? "Neuzüchtung" : ""].filter(Boolean).join(", ");
  return zusatz ? `${basis} (${zusatz})` : basis;
}

/** Folge-Eintrag für die Katalognummern; mit den Käfigregeln der Schau auch die Käfiggröße (Folge nach Käfigblöcken). */
export function alsFolge(e: Eintrag, kaefigRegeln: KaefigRegel[] = []): FolgeEintrag {
  return {
    // Ohne die Käfigwahl je Tier: sie ist eine Ausnahme in der Halle (bei der Einlieferung) und verschiebt keine Nummern.
    kaefigTyp: kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse }, kaefigRegeln),
    id: e.id,
    teilschauFolge: e.teilschauFolge,
    sparteFolge: e.sparteFolge,
    rasseFolge: e.rasseFolge,
    farbFolge: e.farbFolge,
    freitext: e.freitext,
    art: e.art,
    geschlecht: e.geschlecht,
    alter: e.alter,
    istJugend: e.istJugend,
    ausstellerName: e.ausstellerName,
    verein: e.verein,
    ausstellerId: e.ausstellerId,
    meldungId: e.meldungId,
    position: e.position,
  };
}

/** Gefordertes Meldegeld und bisher bezahlter Betrag einer Meldung. */
export async function meldebetrag(tx: Tx, meldungId: number) {
  const [m] = await tx
    // Preisrichter-Befreiung aus der Meldung selbst: ein späterer Stammsatz-Wechsel ändert keine frühere Schau.
    .select({ schauId: meldung.schauId, istJugend: meldung.istJugend, istPreisrichter: meldung.istPreisrichter })
    .from(meldung)
    .where(eq(meldung.id, meldungId));
  if (!m) return { zeilen: [], summeCent: 0, bezahltCent: 0, stiftungCent: 0, spendeCent: 0 };
  const [positionen, gebuehren, [bez], [stift], [spend]] = await Promise.all([
    tx.select({ art: katalogeintrag.art }).from(katalogeintrag).where(eq(katalogeintrag.meldungId, meldungId)),
    tx.select().from(gebuehr).where(eq(gebuehr.schauId, m.schauId)),
    tx.select({ s: sum(zahlung.betragCent) }).from(zahlung).where(eq(zahlung.meldungId, meldungId)),
    tx.select({ s: sum(stiftung.betragCent) }).from(stiftung).where(eq(stiftung.meldungId, meldungId)),
    tx.select({ s: sum(spende.betragCent) }).from(spende).where(and(eq(spende.meldungId, meldungId), isNull(spende.storniertAm))),
  ]);
  const b = berechneMeldebetrag(positionen, gebuehren, { istJugend: m.istJugend, istPreisrichter: m.istPreisrichter });
  // Mit der Meldung zugesagte Ehrenpreisstiftung und Spende: werden mit dem Meldegeld gezahlt, sind aber kein Meldegeld.
  return { ...b, bezahltCent: Number(bez?.s ?? 0), stiftungCent: Number(stift?.s ?? 0), spendeCent: Number(spend?.s ?? 0) };
}

/**
 * Meldegeld für viele Meldungen einer Schau auf einmal (Einlieferungssuche): Gebühren einmal, Positionen, Zahlungen,
 * Stiftungen und Spenden je eine Abfrage – gleiches Ergebnis wie meldebetrag je Meldung.
 */
export async function meldebetraege(tx: Tx, schauId: number, meldungen: { id: number; istJugend: boolean; istPreisrichter: boolean }[]) {
  const ids = meldungen.map((m) => m.id);
  const ergebnis = new Map<number, Awaited<ReturnType<typeof meldebetrag>>>();
  if (!ids.length) return ergebnis;
  const [positionen, gebuehren, bezahlt, gestiftet, gespendet] = await Promise.all([
    tx.select({ meldungId: katalogeintrag.meldungId, art: katalogeintrag.art }).from(katalogeintrag).where(inArray(katalogeintrag.meldungId, ids)),
    tx.select().from(gebuehr).where(eq(gebuehr.schauId, schauId)),
    tx.select({ meldungId: zahlung.meldungId, s: sum(zahlung.betragCent) }).from(zahlung).where(inArray(zahlung.meldungId, ids)).groupBy(zahlung.meldungId),
    tx.select({ meldungId: stiftung.meldungId, s: sum(stiftung.betragCent) }).from(stiftung).where(inArray(stiftung.meldungId, ids)).groupBy(stiftung.meldungId),
    tx
      .select({ meldungId: spende.meldungId, s: sum(spende.betragCent) })
      .from(spende)
      .where(and(inArray(spende.meldungId, ids), isNull(spende.storniertAm)))
      .groupBy(spende.meldungId),
  ]);
  for (const m of meldungen) {
    const b = berechneMeldebetrag(positionen.filter((p) => p.meldungId === m.id), gebuehren, { istJugend: m.istJugend, istPreisrichter: m.istPreisrichter });
    ergebnis.set(m.id, {
      ...b,
      bezahltCent: Number(bezahlt.find((x) => x.meldungId === m.id)?.s ?? 0),
      stiftungCent: Number(gestiftet.find((x) => x.meldungId === m.id)?.s ?? 0),
      spendeCent: Number(gespendet.find((x) => x.meldungId === m.id)?.s ?? 0),
    });
  }
  return ergebnis;
}

export function skalaVon(s: { notenskala: NotenStufe[] | null }): NotenStufe[] | undefined {
  return s.notenskala ?? undefined;
}
