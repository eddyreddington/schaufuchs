/**
 * Hallenplan – Vorgaben und Maße: Halle mit allen Vorgaben (`halleNormal`), Schlüssel für den Stand einer Halle, Größe
 * eingesetzter Teile, Standards für Hauptgang, Grundplatte und Halle, Käfige und Etagen je Grundplatte.
 */
import { kaefigMass, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { istRechteckUmriss, umrissNormal } from "./hallenplan-umriss";
import { istMoebel, moebelMass } from "./hallenplan-moebel";
import { VOLIERE_ERSATZ } from "./hallenplan-intern";
import type { Grundplatte, Halle, HallenObjekt, Hauptgang } from "./hallenplan-typen";

/** Halle mit allen Vorgaben ausgefüllt – ältere gespeicherte Hallen haben noch nicht jedes Feld. */
export function halleNormal(h: Halle): Halle {
  return {
    ...h,
    richtung: h.richtung ?? "quer",
    wandBuendig: h.wandBuendig ?? true,
    hauptgang: h.hauptgang ?? HAUPTGANG_STANDARD,
    platte: h.platte ?? GRUNDPLATTE_STANDARD,
    jePlatte: h.jePlatte ?? {},
    plattenMass: h.plattenMass ?? {},
    // Leer wie nicht da (ältere Hallen haben das Feld nicht; Schlüssel und feste Geometrie bleiben dieselben).
    etagen: etagenNormal(h.etagen),
    objekte: h.objekte ?? [],
    reihenVersatz: h.reihenVersatz ?? [],
    plattenVersatz: h.plattenVersatz ?? [],
    spartenStart: h.spartenStart ?? [],
    // Leer wie nicht da (ältere Hallen haben das Feld nicht; der Schlüssel bleibt derselbe).
    entfernt: h.entfernt?.length ? h.entfernt : undefined,
    // Ein Rechteck als Grundriss ist wie keiner (die Halle bleibt dieselbe).
    umriss: istRechteckUmriss(h.umriss) ? undefined : umrissNormal(h.umriss!),
  };
}

/** Text mit sortierten Schlüsseln (leere Felder fallen weg) – gleiche Halle ergibt immer denselben Text. */
export function stabilerText(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stabilerText).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stabilerText((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Kurzer Schlüssel für den Stand einer Halle – zum Erkennen gleichzeitiger Änderungen. */
export function halleSchluessel(h: Halle | null | undefined): string {
  if (!h) return "leer";
  const t = stabilerText(halleNormal(h));
  let x = 5381;
  for (let i = 0; i < t.length; i++) x = (Math.imul(x, 33) ^ t.charCodeAt(i)) >>> 0;
  return `${x.toString(36)}-${t.length}`;
}

/** Freier Gang zwischen Volierenreihen (cm). */
export const VOLIEREN_GANG = 150;

/**
 * Größe eines eingesetzten Teils, ungedreht (lange Seite in x): eine Voliere nach dem Volierenmaß, ein Käfigblock so groß
 * wie die Grundplatte seiner Käfigart (ohne Maß: die Grundplatte der Halle).
 */
export function teilGroesse(o: { art: HallenObjekt["art"]; typ?: KaefigTyp; laenge?: number; tiefe?: number; bankTiefe?: number }, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">, masse: KaefigMasse | null | undefined): { lang: number; kurz: number } {
  if (istMoebel(o)) {
    // Ungedreht liegt die Länge in x (wie bei Volieren und Blöcken die lange Seite).
    const m = moebelMass({ ...o, art: o.art });
    return { lang: m.laenge, kurz: m.gesamt };
  }
  if (o.art === "voliere") {
    const v = kaefigMass("voliere", masse) ?? VOLIERE_ERSATZ;
    return { lang: v.breite, kurz: v.tiefe };
  }
  const typ = o.typ ?? "huehner";
  const km = kaefigMass(typ, masse);
  const pl = km ? platteFuer(typ, km, halle) : (halle.platte ?? GRUNDPLATTE_STANDARD);
  return { lang: pl.laenge, kurz: pl.tiefe };
}

export const HAUPTGANG_STANDARD: Hauptgang = { breite: 300, lage: "anfang" };

export const GRUNDPLATTE_STANDARD: Grundplatte = { laenge: 210, tiefe: 70 };

export const HALLE_STANDARD: Halle = { breite: 2000, laenge: 4000, gang: 150, richtung: "quer", wandreihen: true, quergang: false, wandBuendig: true, hauptgang: HAUPTGANG_STANDARD, platte: GRUNDPLATTE_STANDARD, jePlatte: {}, flaechen: [] };

/** Länge, auf die eine Grundplatte ausgelegt ist (cm): rund 2 m. */
export const PLATTE_LAENGE = 200;
/** So viel länger darf eine Grundplatte werden, damit ihre Käfige ganz darauf passen (drei 70er: 2,10 m). */
const PLATTE_UEBERMASS = 15;

/**
 * Wie viele Käfige einer Art auf einer Grundplatte stehen: eigene Angabe, sonst so viele, wie auf ihr eigenes Plattenmaß
 * passen, sonst so viele, wie auf rund 2 m passen – höchstens 2,15 m (100er: 2, 70er: 3 auf 2,10 m, 60er: 3, 50er: 4,
 * 40er: 5; ein Stammkäfig über 1,07 m steht allein).
 */
export function kaefigeJePlatte(typ: KaefigTyp, breite: number, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">): number {
  const eigen = halle.jePlatte?.[typ];
  if (eigen && eigen >= 1) return Math.floor(eigen);
  const mass = halle.plattenMass?.[typ];
  if (mass) return Math.max(1, Math.floor((mass.laenge + 1e-6) / breite));
  return Math.max(1, Math.floor((PLATTE_LAENGE + PLATTE_UEBERMASS + 1e-6) / breite));
}

/**
 * Grundplatte einer Käfigart (Länge entlang der Reihe, Tiefe quer dazu) und wie viele Käfige darauf stehen. Eigenes
 * Plattenmaß der Käfigart geht vor; sonst ist die Platte so lang wie ihre Käfige zusammen (rund 2 m: zwei 100er, drei 70er
 * = 2,10 m, vier 50er, fünf 40er) und so tief wie ein Käfig.
 */
export function platteFuer(typ: KaefigTyp, mass: { breite: number; tiefe: number }, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass" | "etagen">): Grundplatte & { n: number; etagen: number; plaetze: number } {
  const n = kaefigeJePlatte(typ, mass.breite, halle);
  const etagen = etagenVon(typ, halle);
  const eigen = halle.plattenMass?.[typ];
  if (eigen) return { n, etagen, plaetze: n * etagen, laenge: Math.max(eigen.laenge, n * mass.breite), tiefe: Math.max(eigen.tiefe, mass.tiefe) };
  return { n, etagen, plaetze: n * etagen, laenge: n * mass.breite, tiefe: mass.tiefe };
}

/** Höchstens so viele Etagen übereinander. */
export const ETAGEN_MAX = 4;

/** Etagen einer Käfigart: eigene Angabe (1 bis 4), sonst eine. Volieren stehen nie übereinander. */
export function etagenVon(typ: KaefigTyp, halle: Pick<Halle, "etagen">): number {
  if (typ === "voliere") return 1;
  const e = Math.floor(halle.etagen?.[typ] ?? 1);
  return Math.min(ETAGEN_MAX, Math.max(1, Number.isFinite(e) ? e : 1));
}

/** Plätze auf einer Grundplatte: Käfige nebeneinander × Etagen. */
export function plaetzeJePlatte(typ: KaefigTyp, breite: number, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass" | "etagen">): number {
  return kaefigeJePlatte(typ, breite, halle) * etagenVon(typ, halle);
}

/** Nur Angaben über einer Etage; leer = nicht da. */
export function etagenNormal(e: Halle["etagen"]): Halle["etagen"] {
  const n = Object.fromEntries(Object.entries(e ?? {}).filter(([, v]) => v != null && Math.floor(v) > 1).map(([k, v]) => [k, Math.min(ETAGEN_MAX, Math.floor(v!))]));
  return Object.keys(n).length ? n : undefined;
}

/** Etage nur, wenn nicht unten (so bleiben Pläne ohne Etagen wie bisher). */
export const etageFeld = (e: number | undefined): { etage?: number } => (e ? { etage: e } : {});

/** Gleiche Etage (fehlt = unten). */
export const gleicheEtage = (a: { etage?: number }, b: { etage?: number }): boolean => (a.etage ?? 0) === (b.etage ?? 0);
