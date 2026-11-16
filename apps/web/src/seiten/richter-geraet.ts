/** Preisrichter-Tablet: Datentypen und was im Gerät liegt (Schlüssel in IndexedDB/localStorage, gemerkter Preisrichter, Aufräumen). */
import type { Sondernote } from "@schau/domain";
import { del, delMany, get, keys } from "idb-keyval";
import { ot } from "../sprache-jetzt";
import type { Ausgabe } from "../trpc";

export type Daten = Ausgabe["richter"]["daten"];
export type Tier = Daten["tiere"][number];
export type Ergebnis = Ausgabe["richter"]["abgleich"]["ergebnisse"][number];
export interface Richter {
  id: number;
  name: string;
}
export interface Ausgang {
  katalogeintragId: number;
  punkte: number | null;
  sondernote: Sondernote | null;
  vorzuege: string;
  wuensche: string;
  maengel: string;
  geraetZeit: string;
  /** Katalognummer zur Anzeige (fehlt bei älteren Einträgen). */
  nr?: string;
  /** Wer bewertet hat. Ältere Einträge ohne Angabe gehören dem gerade angemeldeten Preisrichter. */
  preisrichterId?: number;
  preisrichterName?: string;
  /** Stand am Server beim Bewerten (Versionszähler) – zur Konflikterkennung ohne Geräteuhr. */
  basisVersion?: number | null;
  /** Nach Rückfrage trotz Änderung anderswo senden. */
  erzwingen?: boolean;
}
/** Vom Server abgelehnte Bewertung: bleibt im Gerät, bis der Preisrichter sie erneut sendet oder verwirft. */
export type Abgelehnt = Ausgang & { meldung: string; konflikt?: boolean };
/** Was die Karte zum Speichern übergibt. */
export type Eingabe = Omit<Ausgang, "geraetZeit" | "nr" | "preisrichterId" | "preisrichterName" | "basisVersion" | "erzwingen">;
/** Bewertungsstand einer Karte; Texte wie am Server getrimmt, damit eigenes Speichern nicht als fremde Änderung gilt. */
export type Stand = Pick<Ausgang, "punkte" | "sondernote" | "vorzuege" | "wuensche" | "maengel">;
export const standVon = (t: Stand): Stand => ({ punkte: t.punkte, sondernote: t.sondernote, vorzuege: t.vorzuege.trim(), wuensche: t.wuensche.trim(), maengel: t.maengel.trim() });
export const gleicherStand = (a: Stand, b: Stand) => JSON.stringify(standVon(a)) === JSON.stringify(standVon(b));

/** Grenze des Servers je Textfeld (services/bewertung.ts). */
export const MAX_TEXT = 500;
/** Meldung bei zu langem Text, in der aktuellen Sprache (zur Laufzeit aufrufen). */
export const textZuLang = () => ot().tablet.textZuLang(MAX_TEXT);

export const datenSchluessel = (slug: string, richterId: number) => `richter:${slug}:${richterId}`;
const zuletztSchluessel = (slug: string) => `richter-zuletzt:${slug}`;
/** Gemeinsamer Ausgang aller Preisrichter dieses Geräts; jeder Eintrag nennt seinen Preisrichter. */
export const ausgangSchluesselVon = (slug: string) => `richter-ausgang:${slug}`;
export const abgelehntSchluesselVon = (slug: string) => `richter-abgelehnt:${slug}`;
/** Liest public/start.html, damit die installierte App direkt auf dem Tablet startet. */
const LETZTE_SCHAU = "letzteRichterSchau";

export const gleicherEintrag = (a: Ausgang, b: Ausgang) => a.katalogeintragId === b.katalogeintragId && a.geraetZeit === b.geraetZeit;
export const fehlerCode = (e: unknown) => (e as { data?: { code?: string } | null } | null)?.data?.code;

export function leseZuletzt(slug: string): Richter | null {
  try {
    const r = JSON.parse(localStorage.getItem(zuletztSchluessel(slug)) ?? "null") as Richter | null;
    return r && typeof r.id === "number" ? r : null;
  } catch {
    return null;
  }
}

export function merkeZuletzt(slug: string, r: Richter | null) {
  try {
    if (r) {
      localStorage.setItem(zuletztSchluessel(slug), JSON.stringify({ id: r.id, name: r.name }));
      localStorage.setItem(LETZTE_SCHAU, slug);
    } else {
      localStorage.removeItem(zuletztSchluessel(slug));
      if (localStorage.getItem(LETZTE_SCHAU) === slug) localStorage.removeItem(LETZTE_SCHAU);
    }
  } catch {
    // Ohne localStorage startet die App eben auf der Startseite.
  }
}

/**
 * Nach dem Abschluss der Schau (oder wenn es sie nicht mehr gibt): gespeicherte Tierlisten und Bausteine aller
 * Preisrichter dieser Schau und den gemerkten Preisrichter vom Gerät löschen. Nicht übertragene Bewertungen bleiben – sie
 * sind die einzige Kopie und werden nur bewusst gelöscht. Rückgabe: ob etwas gelöscht wurde.
 */
export async function raeumeGeraetAuf(slug: string): Promise<boolean> {
  merkeZuletzt(slug, null);
  try {
    const weg = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(`richter:${slug}:`));
    if (weg.length) await delMany(weg);
    const [a, b] = await Promise.all([get<Ausgang[]>(ausgangSchluesselVon(slug)), get<Abgelehnt[]>(abgelehntSchluesselVon(slug))]);
    if (a && !a.length) await del(ausgangSchluesselVon(slug));
    if (b && !b.length) await del(abgelehntSchluesselVon(slug));
    return weg.length > 0;
  } catch {
    return false;
  }
}
