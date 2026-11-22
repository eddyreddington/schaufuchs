/**
 * Türen in den Eingängen (3D, Entscheidung 028): Art der Tür je Eingang oder Ausgang – bündig wie die Wand, Glastür,
 * Holztür oder offen (nur die Öffnung wie bis 1.20). Reine Darstellung: Die Türart ändert nie Plan, Nummern oder den
 * festen Plan (`festGeometrie` kennt keine Flächen), nur den Stand der Halle (`halleSchluessel`).
 */
import type { HallenFlaeche } from "./hallenplan-typen";

export const TUER_ARTEN = ["wand", "glas", "holz", "offen"] as const;
export type TuerArt = (typeof TUER_ARTEN)[number];

/** Vorgabe ohne Angabe: Tür bündig in der Wand (wie in Sporthallen üblich, Rückmeldung 22.11.2026). */
export const TUER_VORGABE: TuerArt = "wand";

/** Breiter als das (cm entlang der Wand): zweiflügelige Tür. */
export const ZWEIFLUEGELIG_AB = 130;

/** Höhe des Drückers bzw. der Panikstange über dem Boden (cm). */
export const GRIFF_HOEHE = 105;

export const istTuerArt = (x: unknown): x is TuerArt => (TUER_ARTEN as readonly unknown[]).includes(x);

/** Türart eines Eingangs: die gültige Angabe, sonst die Vorgabe. */
export const tuerArtVon = (f: Pick<HallenFlaeche, "tuer"> | null | undefined): TuerArt => (istTuerArt(f?.tuer) ? f.tuer : TUER_VORGABE);

/** Flügel einer Tür aus ihrer Breite entlang der Wand (cm). */
export const tuerFluegel = (breite: number): 1 | 2 => (breite > ZWEIFLUEGELIG_AB ? 2 : 1);

/**
 * Zum Speichern: die Türart nur an Eingängen, nur gültig und nur, wenn sie von der Vorgabe abweicht – sonst fällt das Feld
 * weg (die Halle bleibt wie ohne Angabe, ihr Stand ändert sich nicht).
 */
export function flaecheBereinigt<F extends Pick<HallenFlaeche, "art"> & { tuer?: unknown }>(f: F): Omit<F, "tuer"> & { tuer?: TuerArt } {
  const { tuer, ...rest } = f;
  return f.art === "eingang" && istTuerArt(tuer) && tuer !== TUER_VORGABE ? { ...rest, tuer } : rest;
}

/** Ein Türblatt: Strecke entlang der Wand (cm, ab der Mitte der Öffnung) und wo der Griff sitzt. */
export interface TuerBlatt {
  von: number;
  bis: number;
  griff: number;
}

/** Aufbau einer geschlossenen Tür in ihrer Öffnung (cm): Zarge an den Seiten und oben, Blätter, Griffe, Panikstange. */
export interface TuerAufbau {
  zarge: number;
  /** Höhe der Blätter ab dem Boden (unten 1 cm Luft). */
  hoehe: number;
  blaetter: TuerBlatt[];
  griffHoehe: number;
  /** Notausgang: Panikstange innen quer über die Blätter. */
  panik: boolean;
}

/** Sichtbare Zarge (cm): bündige Tür nur eine feine Fuge, sonst ein Rahmen. */
const ZARGE: Record<Exclude<TuerArt, "offen">, number> = { wand: 1.2, glas: 6, holz: 6 };
/** Fuge zwischen zwei Flügeln (cm). */
const MITTE = 0.8;
/** Glastür: Rahmenprofil an den Seiten und oben, unten der höhere Sockel (cm). */
export const GLAS_PROFIL = 7;
export const GLAS_SOCKEL = 16;
/** Panikstange: so weit bleibt sie von den Kanten des Blatts (cm). */
export const PANIK_RAND = 8;
/** Schmaler (cm entlang der Wand) ist es keine Tür: Die Öffnung bleibt offen (Server erlaubt Flächen ab 10 cm). */
export const TUER_MIN_BREITE = 50;

/**
 * Tür in einer Öffnung `breite` × `hoehe` (cm): ab `ZWEIFLUEGELIG_AB` (oder wie `fluegel` sagt) zwei gleiche Flügel mit den
 * Griffen zur Mitte, sonst einer mit dem Griff rechts. Offen oder schmaler als `TUER_MIN_BREITE`: keine Tür (null).
 */
export function tuerAufbau(t: { art: TuerArt; breite: number; hoehe: number; notausgang: boolean; fluegel?: 1 | 2 }): TuerAufbau | null {
  if (t.art === "offen" || t.breite < TUER_MIN_BREITE || t.hoehe < 2 * (GLAS_PROFIL + GLAS_SOCKEL)) return null;
  const zarge = ZARGE[t.art];
  const innen = t.breite / 2 - zarge;
  const abstand = Math.min(10, innen / 4);
  const blaetter: TuerBlatt[] =
    (t.fluegel ?? tuerFluegel(t.breite)) === 2
      ? [
          { von: -innen, bis: -MITTE / 2, griff: -MITTE / 2 - abstand },
          { von: MITTE / 2, bis: innen, griff: MITTE / 2 + abstand },
        ]
      : [{ von: -innen, bis: innen, griff: innen - abstand }];
  return { zarge, hoehe: t.hoehe - zarge - 1, blaetter, griffHoehe: Math.min(GRIFF_HOEHE, t.hoehe / 2), panik: t.notausgang };
}
