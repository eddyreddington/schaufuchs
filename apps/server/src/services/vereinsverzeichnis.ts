import { vereinsSchluessel, verzeichnisVorschlaege } from "@schau/domain";
import { asc, count, max } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { vereinsverzeichnis } from "../db/schema";
import { protokolliere } from "./protokoll";

/** Höchstlänge für Namen und Kreisverbände (wie im öffentlichen Formular). */
const MAX_LAENGE = 100;

let ablage: { stand: string; geprueft: number; vorschlaege: ReturnType<typeof verzeichnisVorschlaege> } | null = null;

/**
 * Vorschläge aus dem Vereinsverzeichnis (Vereine mit eindeutigem Kreisverband, Kreisverbände), einmal gerechnet und im
 * Speicher gehalten. Höchstens einmal je Minute wird geprüft, ob sich das Verzeichnis geändert hat (Anzahl und letzte
 * Kennung) – das Einspielen läuft in einem eigenen Prozess.
 */
export async function verzeichnisVorschlaegeZwischengespeichert(): Promise<ReturnType<typeof verzeichnisVorschlaege>> {
  const jetzt = Date.now();
  if (ablage && jetzt - ablage.geprueft < 60_000) return ablage.vorschlaege;
  const [s] = await db.select({ n: count(), letzte: max(vereinsverzeichnis.id) }).from(vereinsverzeichnis);
  const stand = `${s?.n ?? 0}:${s?.letzte ?? 0}`;
  if (ablage && ablage.stand === stand) {
    ablage.geprueft = jetzt;
    return ablage.vorschlaege;
  }
  const zeilen = await db.select({ verein: vereinsverzeichnis.name, kreisverband: vereinsverzeichnis.kreisverband }).from(vereinsverzeichnis).orderBy(asc(vereinsverzeichnis.id)).limit(20000);
  ablage = { stand, geprueft: jetzt, vorschlaege: verzeichnisVorschlaege(zeilen) };
  return ablage.vorschlaege;
}

/** Für Tests: Zwischenspeicher leeren. */
export function verzeichnisVergessen() {
  ablage = null;
}

/** Steuer- und Formatzeichen (auch Richtungswechsel, Nullbreite) entfernen, Leerraum zusammenfassen. */
const sauber = (x: unknown) => (typeof x === "string" ? x.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "");
const nurHttp = (v: string) => (/^https?:\/\//i.test(v) && v.length <= 500 ? v : "");
/** Hinweise auf Personen oder Kontaktdaten – solche Zeilen werden nicht übernommen. */
const PERSONENBEZUG = /@|https?:|www\.|\b(?:tel|telefon|fax|mobil|vors(?:itzend)?|ansprechpartner|kontakt)\b|\+\d{2}|\d{3,}[\s/-]+\d{3,}/i;

/**
 * Vereinsnamen einspielen: nur Name, Kreisverband, Landesverband und Quelle. Vorhandene Einträge (gleicher Name und
 * Kreisverband ohne Rücksicht auf Schreibweise) bleiben unverändert. Zeilen mit leerem, zu langem oder verdächtigem Namen
 * (Kontaktdaten) werden mit Zeilennummer abgelehnt. Ein Eintrag im Protokoll mit den neuen Namen.
 */
export async function vereineEinspielen(eintraege: unknown[], opts: { datei?: string } = {}) {
  const abgelehnt: { zeile: number; grund: string }[] = [];
  const gesehen = new Set<string>();
  let doppeltInDatei = 0;
  const zeilen: { name: string; kreisverband: string; landesverband: string; quelle: string; schluessel: string }[] = [];
  eintraege.forEach((e, i) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const name = sauber(o.name), kreisverband = sauber(o.kreisverband), landesverband = sauber(o.landesverband);
    const zeile = i + 1;
    if (name.length < 3) return abgelehnt.push({ zeile, grund: "Name fehlt oder ist zu kurz" });
    if (name.length > MAX_LAENGE || kreisverband.length > MAX_LAENGE || landesverband.length > MAX_LAENGE) return abgelehnt.push({ zeile, grund: `länger als ${MAX_LAENGE} Zeichen` });
    if (PERSONENBEZUG.test(name) || PERSONENBEZUG.test(kreisverband) || PERSONENBEZUG.test(landesverband)) return abgelehnt.push({ zeile, grund: "sieht nach Kontaktdaten aus" });
    const schluessel = JSON.stringify([vereinsSchluessel(name), vereinsSchluessel(kreisverband)]);
    if (gesehen.has(schluessel)) {
      doppeltInDatei++;
      return;
    }
    gesehen.add(schluessel);
    zeilen.push({ name, kreisverband, landesverband, quelle: nurHttp(sauber(o.quelle)), schluessel });
  });
  const neu = await db.transaction(async (tx: Tx) => {
    const eingefuegt: string[] = [];
    for (let i = 0; i < zeilen.length; i += 500) {
      const r = await tx
        .insert(vereinsverzeichnis)
        .values(zeilen.slice(i, i + 500))
        // Gleicher Schlüssel (Name und Kreisverband): bleibt, wie er ist.
        .onConflictDoNothing({ target: vereinsverzeichnis.schluessel })
        .returning({ name: vereinsverzeichnis.name, kreisverband: vereinsverzeichnis.kreisverband });
      eingefuegt.push(...r.map((x) => (x.kreisverband ? `${x.name} (${x.kreisverband})` : x.name)));
    }
    await protokolliere(tx, {
      schauId: null,
      tabelle: "vereinsverzeichnis",
      datensatzId: null,
      aktion: "Vereinsverzeichnis eingespielt",
      neu: { datei: opts.datei ?? null, angeboten: eintraege.length, neu: eingefuegt.length, schonVorhanden: zeilen.length - eingefuegt.length, doppeltInDatei, abgelehnt: abgelehnt.length, eingefuegt },
      akteur: { text: "Einspiel-Skript" },
    });
    return eingefuegt.length;
  });
  verzeichnisVergessen();
  return { angeboten: eintraege.length, neu, schonVorhanden: zeilen.length - neu, doppeltInDatei, abgelehnt };
}
