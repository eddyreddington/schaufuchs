import { tagBerlin } from "@schau/domain";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { auszahlung, beleg, kassenabschluss, kassenbewegung, katalogeintrag, meldung, spende, spender, verkauf, zahlung } from "../db/schema";
import { heuteDe } from "./tiergesundheit";
import { kurzerFehler } from "./fehlertext";
import { mitVermerk } from "../pdf/basis";

type Abrechnungszeile = Awaited<ReturnType<typeof import("../routers/kasse").abrechnungListe>>[number];

/** Kalendertag in deutscher Zeit (JJJJ-MM-TT) – nach ihm richten sich Kassenbuch und Tagesabschluss. */
export const tagDe = (d: Date) => tagBerlin(d);

export interface Bewegung {
  zeit: Date;
  /** Gebucht nach dem (ersten) Tagesabschluss dieses Tages – gehört in einen Nachtragsabschluss. */
  nachtrag?: boolean;
  art: "verkauf" | "verkauf-storno" | "meldegeld" | "auszahlung" | "auszahlung-storno" | "anfangsbestand" | "einlage" | "entnahme" | "spende" | "spende-storno";
  text: string;
  betragCent: number;
}

/**
 * Kassenbuch der Barkasse: alle Bargeldbewegungen nach Tagen, mit Anfangsbestand, Soll-Endbestand und Tagesabschluss.
 * Quelle sind die Buchungen selbst (Verkauf bar, Meldegeld bar, Barauszahlung, Einlage/Entnahme, Barspende) – nichts wird doppelt
 * erfasst. Der Anfangsbestand eines Tages ist der gezählte Bestand des letzten Abschlusses, sonst das Soll des Vortags.
 *
 * Barbuchungen bleiben auch nach dem Tagesabschluss möglich: Sie stehen als Nachtrag im Kassenbuch und bekommen einen
 * eigenen Nachtragsabschluss. Bestehende Abschlüsse bleiben unverändert (die Datenbank lässt sie nicht ändern).
 */
export async function ladeKassenbuch(schauId: number, ex: Tx | typeof db = db) {
  const [verk, zahl, ausz, bew, abschluesse, spenden] = await Promise.all([
    ex
      .select({ v: verkauf, nr: katalogeintrag.katalogNr, suffix: katalogeintrag.suffix })
      .from(verkauf)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
      .where(and(eq(katalogeintrag.schauId, schauId), eq(verkauf.zahlart, "bar"))),
    ex
      .select({ z: zahlung })
      .from(zahlung)
      .innerJoin(meldung, eq(meldung.id, zahlung.meldungId))
      .where(and(eq(meldung.schauId, schauId), eq(zahlung.art, "bar"))),
    ex.select().from(auszahlung).where(and(eq(auszahlung.schauId, schauId), eq(auszahlung.art, "bar"))),
    ex.select().from(kassenbewegung).where(eq(kassenbewegung.schauId, schauId)),
    ex.select().from(kassenabschluss).where(eq(kassenabschluss.schauId, schauId)).orderBy(asc(kassenabschluss.datum), asc(kassenabschluss.nachtrag)),
    ex
      .select({ sp: spende, vorname: spender.vorname, nachname: spender.nachname, istFirma: spender.istFirma })
      .from(spende)
      .innerJoin(spender, eq(spender.id, spende.spenderId))
      .where(and(eq(spende.schauId, schauId), eq(spende.weg, "bar"), eq(spende.art, "geld"))),
  ]);
  const b: Bewegung[] = [];
  for (const { v, nr, suffix } of verk) {
    const tier = nr != null ? `Nr. ${nr}${suffix}` : "Tier";
    b.push({ zeit: v.createdAt, art: "verkauf", text: `Verkauf Beleg ${v.belegNr} (${tier})`, betragCent: v.preisCent });
    if (v.storniertAm) b.push({ zeit: v.storniertAm, art: "verkauf-storno", text: `Storno Beleg ${v.belegNr}: ${v.stornoGrund}`, betragCent: -v.preisCent });
  }
  for (const { z } of zahl) {
    b.push({ zeit: z.createdAt, art: "meldegeld", text: z.stornoVon ? `Storno Meldegeld (Zahlung ${z.stornoVon}): ${z.grund}` : z.betragCent < 0 ? `Erstattung Meldegeld: ${z.grund}` : z.grund ? `Meldegeld bar (${z.grund})` : "Meldegeld bar", betragCent: z.betragCent });
  }
  for (const a of ausz) {
    b.push({ zeit: a.createdAt, art: "auszahlung", text: `${a.betragCent < 0 ? "Rückzahlung an Verein" : "Auszahlung"}, Quittung ${a.quittungNr}`, betragCent: -a.betragCent });
    if (a.storniertAm) b.push({ zeit: a.storniertAm, art: "auszahlung-storno", text: `Storno Quittung ${a.quittungNr}: ${a.stornoGrund}`, betragCent: a.betragCent });
  }
  for (const k of bew) {
    const text = k.art === "anfangsbestand" ? "Anfangsbestand (Wechselgeld)" : k.art === "einlage" ? "Einlage" : "Entnahme";
    b.push({ zeit: k.createdAt, art: k.art, text: k.grund ? `${text}: ${k.grund}` : text, betragCent: k.art === "entnahme" ? -k.betragCent : k.betragCent });
  }
  for (const { sp, vorname, nachname, istFirma } of spenden) {
    const wer = istFirma ? nachname : `${vorname} ${nachname}`.trim();
    b.push({ zeit: sp.createdAt, art: "spende", text: `Spende Beleg S-${sp.id} (${wer})`, betragCent: sp.betragCent });
    if (sp.storniertAm) b.push({ zeit: sp.storniertAm, art: "spende-storno", text: `Storno Spende S-${sp.id}: ${sp.stornoGrund}`, betragCent: -sp.betragCent });
  }
  b.sort((x, y) => x.zeit.getTime() - y.zeit.getTime());

  const tage = [...new Set([...b.map((x) => tagDe(x.zeit)), ...abschluesse.map((a) => a.datum)])].sort();
  let bestand = 0;
  return tage.map((datum) => {
    const desTages = abschluesse.filter((a) => a.datum === datum);
    const erster = desTages[0];
    const bewegungen = b.filter((x) => tagDe(x.zeit) === datum).map((x) => ({ ...x, nachtrag: !!erster && x.zeit > erster.createdAt }));
    const anfangCent = bestand;
    const einnahmenCent = bewegungen.filter((x) => x.betragCent > 0).reduce((n, x) => n + x.betragCent, 0);
    const ausgabenCent = bewegungen.filter((x) => x.betragCent < 0).reduce((n, x) => n - x.betragCent, 0);
    const sollCent = anfangCent + einnahmenCent - ausgabenCent;
    /** Letzter Abschluss des Tages (Tagesabschluss oder jüngster Nachtrag). */
    const abschluss = desTages.at(-1) ?? null;
    const seitAbschluss = abschluss ? bewegungen.filter((x) => x.zeit > abschluss.createdAt) : [];
    // Nach dem Abschluss geht es mit dem gezählten Bestand weiter (plus Nachträge) – eine Differenz bleibt sichtbar.
    const endCent = abschluss ? abschluss.istCent + seitAbschluss.reduce((n, x) => n + x.betragCent, 0) : sollCent;
    bestand = endCent;
    return { datum, anfangCent, bewegungen, einnahmenCent, ausgabenCent, sollCent, endCent, abschluss, abschluesse: desTages, nachtragOffen: seitAbschluss.length > 0 };
  });
}
export type Kassentag = Awaited<ReturnType<typeof ladeKassenbuch>>[number];

/** Soll-Bestand am Ende eines Kassentags (Standard: heute) – für den Tagesabschluss. */
export async function sollBestand(schauId: number, ex: Tx | typeof db = db, datum = heuteDe()) {
  const tage = await ladeKassenbuch(schauId, ex);
  const t = tage.find((x) => x.datum === datum);
  if (t) return t.endCent;
  // Tag ohne Bewegung: Bestand des letzten Tages davor.
  const vorher = tage.filter((x) => x.datum < datum).at(-1);
  return vorher ? vorher.endCent : 0;
}

// ── Belegarchiv ──────────────────────────────────────────────────────────

export type Belegart = (typeof beleg.$inferInsert)["art"];

/** Legt einen Beleg unveränderbar ab (einmal je Art und Nummer). Rückgabe: der archivierte Beleg. */
export async function archiviereBeleg(schauId: number, art: Belegart, nummer: number, pdf: Buffer) {
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  await db.insert(beleg).values({ schauId, art, nummer, pdf, sha256 }).onConflictDoNothing();
  return ladeBeleg(schauId, art, nummer);
}

export async function ladeBeleg(schauId: number, art: Belegart, nummer: number) {
  const [b] = await db.select().from(beleg).where(and(eq(beleg.schauId, schauId), eq(beleg.art, art), eq(beleg.nummer, nummer)));
  return b ?? null;
}

/** Spätestens so lange nach der Buchung gilt ein erzeugter Beleg als Original (Erzeugen direkt nach dem Commit). */
const BELEG_ORIGINAL_MINUTEN = 10;

/**
 * Entsteht ein Beleg erst beim Abruf (die Ablage nach der Buchung scheiterte), zeigt er den Stand beim Erzeugen –
 * dann als Zweitschrift gekennzeichnet.
 */
export function zweitschrift(gebucht: Date | null | undefined, jetzt = new Date()): string | null {
  if (!gebucht || jetzt.getTime() - gebucht.getTime() <= BELEG_ORIGINAL_MINUTEN * 60_000) return null;
  const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
  return `ZWEITSCHRIFT – erzeugt am ${f.format(jetzt)}, Stand beim Erzeugen (gebucht am ${f.format(gebucht)})`;
}

/** Archivierte Belege einer Schau ohne Inhalt (für Übersicht und Export). */
export async function belegListe(schauId: number) {
  return db
    .select({ id: beleg.id, art: beleg.art, nummer: beleg.nummer, sha256: beleg.sha256, createdAt: beleg.createdAt })
    .from(beleg)
    .where(eq(beleg.schauId, schauId))
    .orderBy(asc(beleg.art), asc(beleg.nummer));
}


/**
 * Erzeugt Kaufbeleg bzw. Quittung und legt sie ab – direkt nach dem Buchen, damit jeder Nachdruck genau den
 * Beleg von damals zeigt. Schlägt das Erzeugen fehl, bleibt die Buchung gültig; der Beleg entsteht beim ersten Abruf.
 */
export async function archiviereKaufbeleg(s: { id: number }, verkaufId: number, storno = false) {
  try {
    // Nur Verkäufe dieser Schau archivieren (die Belegnummer gilt je Schau).
    const [v] = await db
      .select({ belegNr: verkauf.belegNr })
      .from(verkauf)
      .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
      .where(and(eq(verkauf.id, verkaufId), eq(katalogeintrag.schauId, s.id)));
    if (!v) return null;
    const art = storno ? "kaufbeleg-storno" : "kaufbeleg";
    const schon = await ladeBeleg(s.id, art, v.belegNr);
    if (schon) return schon;
    const { kaufbelegPdf } = await import("../pdf/dokumente");
    const { schau } = await import("../db/schema");
    const [voll] = await db.select().from(schau).where(eq(schau.id, s.id));
    const [z] = await db.select({ am: storno ? verkauf.storniertAm : verkauf.createdAt }).from(verkauf).where(eq(verkauf.id, verkaufId));
    return await archiviereBeleg(s.id, art, v.belegNr, await mitVermerk(zweitschrift(z?.am), () => kaufbelegPdf(voll!, verkaufId)));
  } catch (e) {
    console.error("[belege] Kaufbeleg nicht archiviert:", kurzerFehler(e));
    return null;
  }
}

/**
 * Beleg für bares Meldegeld (Einzahlungsquittung, Nummer = Zahlung) bzw. für Wechselgeld, Einlage und Entnahme
 * (Eigenbeleg, Nummer = Kassenbewegung) – damit jede Barbewegung im Kassenbuch einen archivierten Beleg hat.
 */
export async function archiviereKassenbeleg(s: { id: number }, art: "einzahlung" | "eigenbeleg", nummer: number) {
  try {
    const schon = await ladeBeleg(s.id, art, nummer);
    if (schon) return schon;
    const { kassenbelegPdf } = await import("../pdf/dokumente");
    const { schau } = await import("../db/schema");
    const [voll] = await db.select().from(schau).where(eq(schau.id, s.id));
    const [z] =
      art === "einzahlung"
        ? await db.select({ am: zahlung.createdAt }).from(zahlung).where(eq(zahlung.id, nummer))
        : await db.select({ am: kassenbewegung.createdAt }).from(kassenbewegung).where(eq(kassenbewegung.id, nummer));
    const pdf = await mitVermerk(zweitschrift(z?.am), () => kassenbelegPdf(voll!, art, nummer));
    return pdf ? await archiviereBeleg(s.id, art, nummer, pdf) : null;
  } catch (e) {
    console.error("[belege] Kassenbeleg nicht archiviert:", kurzerFehler(e));
    return null;
  }
}

/** stand: Abrechnungszeile zum Buchungszeitpunkt (SEPA-Buchung archiviert im Hintergrund – der Beleg zeigt diesen Stand). */
export async function archiviereQuittung(s: { id: number }, ausstellerId: number, quittungNr: number, storno = false, stand?: Abrechnungszeile) {
  try {
    const art = storno ? "quittung-storno" : "quittung";
    const [a] = await db
      .select({ id: auszahlung.id })
      .from(auszahlung)
      .where(and(eq(auszahlung.schauId, s.id), eq(auszahlung.ausstellerId, ausstellerId), eq(auszahlung.quittungNr, quittungNr)));
    if (!a) return null;
    const schon = await ladeBeleg(s.id, art, quittungNr);
    if (schon) return schon;
    const { abrechnungPdf } = await import("../pdf/dokumente");
    const { schau } = await import("../db/schema");
    const [voll] = await db.select().from(schau).where(eq(schau.id, s.id));
    const [z] = await db
      .select({ am: storno ? auszahlung.storniertAm : auszahlung.createdAt })
      .from(auszahlung)
      .where(eq(auszahlung.id, a.id));
    // Mit festgehaltenem Stand (SEPA-Buchung) zeigt der Beleg den Stand der Buchung – dann keine Zweitschrift.
    return await archiviereBeleg(s.id, art, quittungNr, await mitVermerk(stand ? null : zweitschrift(z?.am), () => abrechnungPdf(voll!, ausstellerId, quittungNr, stand)));
  } catch (e) {
    console.error("[belege] Quittung nicht archiviert:", kurzerFehler(e));
    return null;
  }
}

/** Spendenquittung (Nummer = Spende) bzw. ihr Stornobeleg – abgelegt direkt nach dem Buchen, wie Kassenbelege. */
export async function archiviereSpendenquittung(s: { id: number }, spendeId: number, storno = false) {
  try {
    const art = storno ? "spende-storno" : "spende";
    const schon = await ladeBeleg(s.id, art, spendeId);
    if (schon) return schon;
    const { spendenquittung } = await import("./spenden-quittung");
    const [sp] = await db.select({ am: storno ? spende.storniertAm : spende.createdAt }).from(spende).where(and(eq(spende.id, spendeId), eq(spende.schauId, s.id)));
    if (!sp) return null;
    const pdf = await mitVermerk(zweitschrift(sp.am), () => spendenquittung(s.id, spendeId, storno));
    return pdf ? await archiviereBeleg(s.id, art, spendeId, pdf) : null;
  } catch (e) {
    console.error("[belege] Spendenquittung nicht archiviert:", kurzerFehler(e));
    return null;
  }
}
