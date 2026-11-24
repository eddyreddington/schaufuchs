import { brauchtObmann, pruefeBewertung, pruefeNotenaenderung, SONDERNOTEN } from "@schau/domain";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db/client";
import { bewertung, katalogeintrag, meldung, preisart, preisvergabe, prEinteilung, schau, verkauf } from "../db/schema";
import { fehler, dbId } from "../trpc";
import { sperreEinteilungGeteilt } from "./einteilung";
import { ladeEintraege, skalaVon } from "./eintraege";
import { nachweisStand } from "./tiergesundheit";
import { protokolliere, type Akteur } from "./protokoll";

export const bewertungEingabe = z.object({
  katalogeintragId: dbId,
  punkte: z.number().int().nullable(),
  sondernote: z.enum(SONDERNOTEN).nullable(),
  vorzuege: z.string().max(500),
  wuensche: z.string().max(500),
  maengel: z.string().max(500),
  /** Zeitpunkt der Eingabe auf dem Gerät (nur noch Rückfall für ältere Tablets ohne basisVersion). */
  geraetZeit: z.coerce.date(),
  /** Version der Bewertung, die das Tablet beim Laden gesehen hat (null: noch keine). */
  basisVersion: z.number().int().nullable().optional(),
  /** Nach Rückfrage: trotz zwischenzeitlicher Änderung anderswo speichern. */
  erzwingen: z.boolean().optional(),
});
export type BewertungEingabe = z.infer<typeof bewertungEingabe>;

export type BewertungErgebnis =
  | { katalogeintragId: number; status: "gespeichert"; version?: number }
  | { katalogeintragId: number; status: "veraltet"; meldung: string }
  | { katalogeintragId: number; status: "fehler"; meldung: string }
  /** Vorübergehende Störung am Server (z. B. Datenbank): das Tablet behält den Eintrag und sendet erneut. */
  | { katalogeintragId: number; status: "spaeter"; meldung: string };

const KONFLIKT = "Inzwischen anderswo geändert (z. B. von der Ausstellungsleitung). Bitte prüfen und dann trotzdem senden oder verwerfen.";

/** Phasen, in denen Preisrichter am Tablet bewerten dürfen. */
export const RICHTER_PHASEN = ["einlieferung", "bewertung", "preise"];

type Wer = { akteur: Akteur; preisrichterId: number | null; quelle: "tablet" | "pc"; istAL: boolean; grund?: string; schauId: number };

/**
 * Lädt Tier und Schau und prüft, ob die Bewertung geändert werden darf.
 * Preisrichter dürfen nur in den Bewertungsphasen und bis zur Freigabe ändern;
 * die Ausstellungsleitung jederzeit, nach der Freigabe aber nur mit Begründung (Reklamation).
 */
async function ladeZumAendern(tx: Tx, id: number, wer: Wer) {
  // Sperrfolge Einteilung → Schau → Tier (ADR 033). Das Tablet hält die Einteilung geteilt: eine gleichzeitige Einteilung
  // hängt das Tier nicht um, während hier die Zuteilung geprüft wird.
  const vomTablet = !wer.istAL && wer.preisrichterId != null;
  if (vomTablet) await sperreEinteilungGeteilt(tx, wer.schauId);
  // Schau geteilt sperren: Freigabe und Notenskala warten auf diese Note, und die Note sieht eine gleichzeitige Freigabe.
  const [s] = await tx.select().from(schau).where(eq(schau.id, wer.schauId)).for("share");
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  // Zeile sperren: Prüfen und Schreiben des Versionszählers geschehen so ohne Wettlauf (zwei Geräte gleichzeitig).
  const [k] = await tx
    .select({ eintrag: katalogeintrag, meldungStatus: meldung.status })
    .from(katalogeintrag)
    .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
    .where(eq(katalogeintrag.id, id))
    .for("update", { of: katalogeintrag });
  if (!k || k.eintrag.schauId !== wer.schauId) return { ok: false as const, fehler: "Tier nicht gefunden." };

  if (k.meldungStatus !== "bestaetigt" || k.eintrag.katalogNr == null) return { ok: false as const, fehler: "Tier ist nicht im Katalog." };
  // Ein fehlendes Tier hat niemand gesehen – eine Note dafür widerspräche Kontingent, Ergebnis und Bewertungskarte.
  if (k.eintrag.status === "fehlt") return { ok: false as const, fehler: "Tier ist als fehlend gemeldet – erst die Einlieferung korrigieren." };
  if (vomTablet) {
    // Zuteilung unter der Sperre neu prüfen: die Vorprüfung im Router kann eine inzwischen geänderte Einteilung übersehen.
    const nr = k.eintrag.katalogNr;
    const bereiche = await tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, wer.schauId));
    if (bereiche.find((x) => nr >= x.vonNr && nr <= x.bisNr)?.preisrichterId !== wer.preisrichterId) return { ok: false as const, fehler: "Tier ist Ihnen nicht zugeteilt." };
  }
  if (s.phase === "abgeschlossen") return { ok: false as const, fehler: "Die Schau ist abgeschlossen – für Korrekturen erst mit Grund zurück zur Abrechnung." };
  if (!wer.istAL) {
    if (!RICHTER_PHASEN.includes(s.phase) || s.ergebnisseFreigegeben) {
      return { ok: false as const, fehler: "Bewertung ist geschlossen. Änderungen nur über die Ausstellungsleitung." };
    }
  } else if (s.ergebnisseFreigegeben && !wer.grund?.trim()) {
    return { ok: false as const, fehler: "Nach der Freigabe nur mit Begründung änderbar." };
  }
  const [alt] = await tx.select().from(bewertung).where(eq(bewertung.katalogeintragId, id));
  // Verkaufte Tiere: die Note gehört zum Kaufbeleg. Ändern nur die Ausstellungsleitung mit Grund.
  const [verkauft] = await tx.select({ belegNr: verkauf.belegNr }).from(verkauf).where(and(eq(verkauf.katalogeintragId, id), isNull(verkauf.storniertAm)));
  if (verkauft && (!wer.istAL || !wer.grund?.trim())) {
    return { ok: false as const, fehler: `Tier ist verkauft (Beleg ${verkauft.belegNr}) – die Note ändert nur die Ausstellungsleitung mit Grund.` };
  }
  const preise = await tx
    .select({ name: preisart.name, mindestpunkte: preisart.mindestpunkte })
    .from(preisvergabe)
    .innerJoin(preisart, eq(preisart.id, preisvergabe.preisartId))
    .where(eq(preisvergabe.katalogeintragId, id));
  return { ok: true as const, eintrag: k.eintrag, schau: s, alt, preise, verkauft: verkauft ?? null };
}

/** Speichert eine Bewertung (Tablet oder PC). */
export async function speichereBewertung(tx: Tx, eingabe: BewertungEingabe, wer: Wer): Promise<BewertungErgebnis> {
  let e = eingabe;
  const id = e.katalogeintragId;
  const z = await ladeZumAendern(tx, id, wer);
  if (!z.ok) return { katalogeintragId: id, status: "fehler", meldung: z.fehler };
  const { eintrag, schau: s, alt } = z;

  const skala = skalaVon(s);
  const problem = pruefeBewertung(e, skala);
  if (problem) return { katalogeintragId: id, status: "fehler", meldung: problem };
  const version = eintrag.bewertungVersion;
  const werte = {
    punkte: e.punkte,
    sondernote: e.sondernote,
    vorzuege: e.vorzuege.trim(),
    wuensche: e.wuensche.trim(),
    maengel: e.maengel.trim(),
  };
  // Schon so gespeichert (z. B. Antwort ging verloren, Tablet sendet erneut): kein Konflikt, nichts zu tun.
  const gleich =
    alt && alt.punkte === werte.punkte && alt.sondernote === werte.sondernote && alt.vorzuege === werte.vorzuege && alt.wuensche === werte.wuensche && alt.maengel === werte.maengel;
  if (gleich) return { katalogeintragId: id, status: "gespeichert", version };
  // Konflikt am Versionszähler des Tiers – er zählt auch das Zurücksetzen; die Tablet-Uhr spielt keine Rolle.
  // Am PC ebenso, wenn die Seite ihren Stand mitschickt (sonst überschriebe eine alte Zeile eine neuere Tablet-Note).
  if (!e.erzwingen && (wer.quelle === "tablet" || e.basisVersion !== undefined)) {
    if (e.basisVersion !== undefined) {
      if ((e.basisVersion ?? 0) !== version) return { katalogeintragId: id, status: "veraltet", meldung: KONFLIKT };
    } else if (alt && alt.geraetZeit > e.geraetZeit) {
      return { katalogeintragId: id, status: "veraltet", meldung: KONFLIKT };
    }
  }
  // Gerätezeiten aus der Zukunft (vorgehende Uhr) auf die Serverzeit begrenzen.
  if (e.geraetZeit.getTime() > Date.now()) e = { ...e, geraetZeit: new Date() };
  const neueVersion = version + 1;
  const zeile = {
    ...werte,
    geraetZeit: e.geraetZeit,
    erfasstAuf: wer.quelle,
    preisrichterId: wer.preisrichterId ?? alt?.preisrichterId ?? null,
    version: neueVersion,
    updatedAt: new Date(),
  };
  const preisProblem = pruefeNotenaenderung(e.punkte, z.preise);
  if (preisProblem) return { katalogeintragId: id, status: "fehler", meldung: preisProblem };

  // Eine Obmann-Bestätigung gilt nur für die bestätigte Note.
  const obmannBleibt = alt?.obmannBestaetigtAm && alt.punkte === e.punkte && alt.sondernote === e.sondernote && brauchtObmann(e, skala);
  const obmann = obmannBleibt ? {} : { obmannBestaetigtVon: null, obmannBestaetigtAm: null };

  if (alt) {
    await tx.update(bewertung).set({ ...zeile, ...obmann }).where(eq(bewertung.id, alt.id));
  } else {
    await tx.insert(bewertung).values({ katalogeintragId: id, ...zeile });
  }
  // Bewertet heißt: das Tier ist da. Als eingeliefert gilt es aber nur mit geprüftem Nachweis (wie bei der
  // Einlieferung) – sonst bleibt es offen, und die Prüfliste erinnert daran.
  let eingeliefert = false;
  if (eintrag.status === "katalogisiert") {
    const [m] = await tx.select().from(meldung).where(eq(meldung.id, eintrag.meldungId));
    const tiere = await ladeEintraege(wer.schauId, { nurMeldungId: eintrag.meldungId, ex: tx });
    const n = nachweisStand(m!, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer);
    if (!n.noetig.length || n.geprueft) {
      await tx.update(katalogeintrag).set({ status: "eingeliefert", bewertungVersion: neueVersion }).where(eq(katalogeintrag.id, id));
      eingeliefert = true;
    }
  }
  if (!eingeliefert) await tx.update(katalogeintrag).set({ bewertungVersion: neueVersion }).where(eq(katalogeintrag.id, id));
  await protokolliere(tx, {
    schauId: wer.schauId,
    tabelle: "bewertung",
    datensatzId: id,
    aktion: alt ? "geändert" : "erfasst",
    // Mit den Texten der Bewertungskarte: Grundlage für Reklamationen (was stand vorher auf der Karte?).
    alt: alt ? { punkte: alt.punkte, sondernote: alt.sondernote, vorzuege: alt.vorzuege, wuensche: alt.wuensche, maengel: alt.maengel } : null,
    neu: { nr: `${eintrag.katalogNr}${eintrag.suffix}`, punkte: e.punkte, sondernote: e.sondernote, vorzuege: werte.vorzuege, wuensche: werte.wuensche, maengel: werte.maengel, quelle: wer.quelle, ...(eingeliefert ? { status: "eingeliefert (über Bewertung)" } : {}) },
    grund: wer.grund,
    akteur: wer.akteur,
  });
  return { katalogeintragId: id, status: "gespeichert", version: neueVersion };
}

/**
 * Nimmt eine Bewertung zurück, damit das Tier neu bewertet werden kann.
 * Gleiche Rechte wie beim Speichern. Hat das Tier schon Preise, müssen die zuerst weg.
 */
/** basisVersion: Stand, den das Tablet kannte – weicht er ab, wurde inzwischen anderswo geändert (wie beim Speichern). */
export async function setzeBewertungZurueck(tx: Tx, id: number, wer: Wer, basisVersion?: number | null) {
  const z = await ladeZumAendern(tx, id, wer);
  if (!z.ok) throw fehler("BAD_REQUEST", z.fehler);
  if (basisVersion !== undefined && (basisVersion ?? 0) !== z.eintrag.bewertungVersion) throw fehler("CONFLICT", KONFLIKT);
  if (!z.alt) return { ok: true };
  // Verkauftes Tier: nie ohne Note – erst den Verkauf stornieren.
  if (z.verkauft) throw fehler("BAD_REQUEST", `Tier ist verkauft (Beleg ${z.verkauft.belegNr}) – erst den Verkauf stornieren.`);
  const preisProblem = pruefeNotenaenderung(null, z.preise);
  if (preisProblem) throw fehler("BAD_REQUEST", preisProblem);

  await tx.delete(bewertung).where(eq(bewertung.id, z.alt.id));
  // Version weiterzählen: ein Tablet mit dem alten Stand erkennt so das Zurücksetzen (sonst begänne sie wieder bei 1).
  await tx.update(katalogeintrag).set({ bewertungVersion: z.eintrag.bewertungVersion + 1 }).where(eq(katalogeintrag.id, id));
  await protokolliere(tx, {
    schauId: wer.schauId,
    tabelle: "bewertung",
    datensatzId: id,
    aktion: "zurückgesetzt",
    alt: { nr: `${z.eintrag.katalogNr}${z.eintrag.suffix}`, punkte: z.alt.punkte, sondernote: z.alt.sondernote, vorzuege: z.alt.vorzuege, wuensche: z.alt.wuensche, maengel: z.alt.maengel },
    grund: wer.grund,
    akteur: wer.akteur,
  });
  return { ok: true };
}
