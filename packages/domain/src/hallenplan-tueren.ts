/**
 * Türen in den Eingängen (3D, Entscheidung 028): Art der Tür je Eingang oder Ausgang – bündig wie die Wand, Glastür,
 * Holztür oder offen (nur die Öffnung wie bis 1.20). Reine Darstellung: Die Türart ändert nie Plan, Nummern oder den
 * festen Plan (`festGeometrie` kennt keine Flächen), nur den Stand der Halle (`halleSchluessel`).
 */
import type { HallenFlaeche } from "./hallenplan-typen";
import { type HallenSzene, type SzeneSeite, type SzeneTuer, wandSeiten } from "./hallenplan-3d";

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

/**
 * Tür in einer Öffnung `breite` × `hoehe` (cm): ab `ZWEIFLUEGELIG_AB` zwei gleiche Flügel mit den Griffen zur Mitte, sonst
 * einer mit dem Griff rechts. Offen: keine Tür (null).
 */
export function tuerAufbau(t: { art: TuerArt; breite: number; hoehe: number; notausgang: boolean }): TuerAufbau | null {
  if (t.art === "offen" || t.breite < 10 || t.hoehe < 10) return null;
  const zarge = Math.min(ZARGE[t.art], t.breite / 6);
  const innen = t.breite / 2 - zarge;
  const abstand = Math.min(10, innen / 4);
  const blaetter: TuerBlatt[] =
    tuerFluegel(t.breite) === 2
      ? [
          { von: -innen, bis: -MITTE / 2, griff: -MITTE / 2 - abstand },
          { von: MITTE / 2, bis: innen, griff: MITTE / 2 + abstand },
        ]
      : [{ von: -innen, bis: innen, griff: innen - abstand }];
  return { zarge, hoehe: t.hoehe - zarge - 1, blaetter, griffHoehe: Math.min(GRIFF_HOEHE, t.hoehe / 2), panik: t.notausgang };
}

/**
 * Lage einer Tür in der Szene (cm): Seite ihrer Wand, Ebene der Innenfläche (x bei x0/x1, z bei z0/z1), Mitte und Breite
 * entlang der Wand, Wandstärke. `richtung`: so läuft „rechts“ für den Blick aus der Halle auf die Tür in Szene-Koordinaten
 * (rechtshändig: oben y, in die Halle z, entlang x = y × z).
 */
export function tuerLage(t: Pick<SzeneTuer, "q" | "wand">, s: Pick<HallenSzene, "waende" | "breite" | "laenge">): { seite: SzeneSeite; ebene: number; mitte: number; breite: number; tiefe: number; richtung: 1 | -1 } {
  const q = t.q;
  const seite = s.waende[t.wand]?.seite ?? wandSeiten(q, s)[0] ?? "z0";
  const entlangX = seite === "z0" || seite === "z1";
  const ebene = seite === "x0" ? q.x + q.b : seite === "x1" ? q.x : seite === "z0" ? q.z + q.t : q.z;
  return {
    seite,
    ebene,
    mitte: entlangX ? q.x + q.b / 2 : q.z + q.t / 2,
    breite: entlangX ? q.b : q.t,
    tiefe: entlangX ? q.t : q.b,
    richtung: seite === "z0" || seite === "x1" ? 1 : -1,
  };
}
