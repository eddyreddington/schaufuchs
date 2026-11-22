/**
 * Aussehen der Halle in der 3D-Ansicht (Entscheidung 028): Boden, Prallwand, Wandhöhe, Fenster, Decke, Spielfeldlinien und
 * Geräte. Reine Anschauung – das Aussehen ändert nie Plan, Nummern oder den festen Plan (`festGeometrie` kennt es nicht).
 * Fehlt es (ältere Hallen), gilt die Vorgabe; gespeichert wird nur, was davon abweicht (`aussehenBereinigt`).
 */
import { type Punkt, punktInUmriss } from "./hallenplan-umriss";

export const HALLEN_BOEDEN = ["parkett", "sportboden", "estrich"] as const;
export type HallenBoden = (typeof HALLEN_BOEDEN)[number];

export interface HallenAussehen {
  /** Bodenbelag: Mosaikparkett (Vorgabe), Sportboden (Kunststoff) oder Estrich. */
  boden?: HallenBoden;
  /** Farbe der Prallwand unten an der Wand: „holz“ (helles Holz, Vorgabe) oder #rrggbb. */
  prallwand?: string;
  /** Höhe der Prallwand (cm). */
  prallwandHoehe?: number;
  /** Höhe der Wände bis zur Decke (cm). */
  wandHoehe?: number;
  /** Fensterband oben an den Längsseiten. */
  fenster?: boolean;
  /** Holzdecke mit Bindern und Leuchtbändern (nur von innen zu sehen). */
  decke?: boolean;
  /** Spielfeldlinien (Handball, Volleyball, Basketball) am Boden. */
  linien?: boolean;
  /** Basketballbretter an den Stirnwänden und eine Sprossenwand. */
  geraete?: boolean;
}

export type VollesAussehen = Required<HallenAussehen>;

/** Vorgabe: wie die Halle bis 1.19 aussah (Holz-Prallwand bis 2 m, 3,50 m hoch, Lichtband bzw. Fenster oben). */
export const AUSSEHEN_STANDARD: VollesAussehen = { boden: "parkett", prallwand: "holz", prallwandHoehe: 200, wandHoehe: 350, fenster: true, decke: false, linien: false, geraete: false };

/** Grenzen (cm): Die Wand reicht über die Türen (2,50 m), die Prallwand bleibt mindestens 30 cm unter der Decke. */
export const WAND_HOEHE_MIN = 280;
export const WAND_HOEHE_MAX = 1500;
export const PRALLWAND_HOEHE_MAX = 400;

/** Farben der Prallwand zur Auswahl (wie in Sporthallen üblich); daneben jede Farbe frei. */
export const PRALLWAND_VORGABEN = [
  { name: "holz", farbe: "holz" },
  { name: "graugruen", farbe: "#6d8571" },
  { name: "grau", farbe: "#8b9095" },
  { name: "blau", farbe: "#4d6f94" },
] as const;

/** Holz oder eine Farbe #rrggbb. */
export const istPrallwandFarbe = (x: unknown): x is string => x === "holz" || (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x));

const zahl = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const grenze = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Aussehen mit allen Vorgaben, Werte begrenzt (ungültige Angaben gelten als nicht gesetzt). */
export function aussehenVon(a: HallenAussehen | null | undefined): VollesAussehen {
  const s = AUSSEHEN_STANDARD;
  const x = a ?? {};
  const wandHoehe = zahl(x.wandHoehe) ? grenze(x.wandHoehe, WAND_HOEHE_MIN, WAND_HOEHE_MAX) : s.wandHoehe;
  const prallMax = Math.min(PRALLWAND_HOEHE_MAX, wandHoehe - 30);
  const ja = (v: unknown, vorgabe: boolean) => (typeof v === "boolean" ? v : vorgabe);
  return {
    boden: (HALLEN_BOEDEN as readonly string[]).includes(x.boden as string) ? x.boden! : s.boden,
    prallwand: istPrallwandFarbe(x.prallwand) ? x.prallwand.toLowerCase() : s.prallwand,
    prallwandHoehe: grenze(zahl(x.prallwandHoehe) ? x.prallwandHoehe : s.prallwandHoehe, 0, prallMax),
    wandHoehe,
    fenster: ja(x.fenster, s.fenster),
    decke: ja(x.decke, s.decke),
    linien: ja(x.linien, s.linien),
    geraete: ja(x.geraete, s.geraete),
  };
}

/** Zum Speichern: nur, was von der Vorgabe abweicht; ohne Abweichung nichts (die Halle bleibt wie ohne Aussehen). */
export function aussehenBereinigt(a: HallenAussehen | null | undefined): HallenAussehen | undefined {
  if (!a) return undefined;
  const v = aussehenVon(a);
  const aus = Object.fromEntries((Object.keys(AUSSEHEN_STANDARD) as (keyof VollesAussehen)[]).filter((k) => v[k] !== AUSSEHEN_STANDARD[k]).map((k) => [k, v[k]]));
  return Object.keys(aus).length ? (aus as HallenAussehen) : undefined;
}

/**
 * Ist die Decke zu sehen? Nur von innen: Kamera unter der Decke und über der Grundfläche der Halle (cm, Szene). Von oben
 * oder außen versperrte sie den Blick auf die Käfige.
 */
export function deckeSichtbar(s: { breite: number; laenge: number; wandHoehe: number; umriss?: Punkt[] }, kamera: { x: number; y: number; z: number }): boolean {
  if (kamera.y >= s.wandHoehe - 5) return false;
  if (s.umriss) return punktInUmriss({ x: kamera.x, y: kamera.z }, s.umriss);
  return kamera.x > 0 && kamera.x < s.breite && kamera.z > 0 && kamera.z < s.laenge;
}
