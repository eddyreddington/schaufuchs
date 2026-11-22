/**
 * Aussehen der Halle in der 3D-Ansicht (Entscheidung 028): Boden und Folie, Prallwand, Wand- und Firsthöhe, Fenster, Decke,
 * Spielfeldlinien und Geräte. Reine Anschauung – das Aussehen ändert nie Plan, Nummern oder den festen Plan (`festGeometrie` kennt es nicht).
 * Fehlt es (ältere Hallen), gilt die Vorgabe; gespeichert wird nur, was davon abweicht (`aussehenBereinigt`).
 */

export const HALLEN_BOEDEN = ["parkett", "sportboden", "estrich"] as const;
export type HallenBoden = (typeof HALLEN_BOEDEN)[number];

export interface HallenAussehen {
  /** Bodenbelag: Mosaikparkett (Vorgabe), Sportboden (Kunststoff) oder Estrich. */
  boden?: HallenBoden;
  /** Boden mit grauer Schutzfolie abgedeckt (Parkett und Linien darunter unsichtbar). */
  abdeckung?: boolean;
  /** Farbe der Prallwand unten an der Wand: „holz“ (helles Holz, Vorgabe) oder #rrggbb. */
  prallwand?: string;
  /** Höhe der Prallwand (cm). */
  prallwandHoehe?: number;
  /** Höhe der Wände bis zur Decke bzw. Traufe (cm). */
  wandHoehe?: number;
  /** Höhe des Firsts (cm): höher als die Wand = Satteldach (mit Decke); fehlt oder gleich: flache Decke. */
  firstHoehe?: number;
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

/**
 * Vorgabe: Daten und Plan wie bis 1.19 (Holz-Prallwand bis 2 m, 3,50 m hoch, flach, oben Fenster statt des früheren
 * Lichtbands); die Darstellung ist überarbeitet (Parkett statt einfarbigem Boden, Texturen, Licht).
 */
export const AUSSEHEN_STANDARD: VollesAussehen = { boden: "parkett", abdeckung: false, prallwand: "holz", prallwandHoehe: 200, wandHoehe: 350, firstHoehe: 350, fenster: true, decke: false, linien: false, geraete: false };

/** Grenzen (cm): Die Wand reicht über die Türen (2,50 m), die Prallwand bleibt mindestens 30 cm unter der Decke. */
export const WAND_HOEHE_MIN = 280;
export const WAND_HOEHE_MAX = 1500;
export const PRALLWAND_HOEHE_MAX = 400;
export const FIRST_HOEHE_MAX = 2000;

/** Vorschlag beim Einschalten der Decke, solange Wand und First nie eingestellt waren: übliche Sporthalle. */
export const DECKE_VORSCHLAG = { wandHoehe: 700, firstHoehe: 900 } as const;

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
    abdeckung: ja(x.abdeckung, s.abdeckung),
    prallwand: istPrallwandFarbe(x.prallwand) ? x.prallwand.toLowerCase() : s.prallwand,
    prallwandHoehe: grenze(zahl(x.prallwandHoehe) ? x.prallwandHoehe : s.prallwandHoehe, 0, prallMax),
    wandHoehe,
    firstHoehe: zahl(x.firstHoehe) ? grenze(x.firstHoehe, wandHoehe, FIRST_HOEHE_MAX) : wandHoehe,
    fenster: ja(x.fenster, s.fenster),
    decke: ja(x.decke, s.decke),
    linien: ja(x.linien, s.linien),
    geraete: ja(x.geraete, s.geraete),
  };
}

/**
 * Zum Speichern: nur, was von der Vorgabe abweicht (der First nur, wenn er höher ist als die Wand); ohne Abweichung nichts
 * (die Halle bleibt wie ohne Aussehen).
 */
export function aussehenBereinigt(a: HallenAussehen | null | undefined): HallenAussehen | undefined {
  if (!a) return undefined;
  const v = aussehenVon(a);
  const weicht = (k: keyof VollesAussehen) => (k === "firstHoehe" ? v.firstHoehe > v.wandHoehe : v[k] !== AUSSEHEN_STANDARD[k]);
  const aus = Object.fromEntries((Object.keys(AUSSEHEN_STANDARD) as (keyof VollesAussehen)[]).filter(weicht).map((k) => [k, v[k]]));
  return Object.keys(aus).length ? (aus as HallenAussehen) : undefined;
}

/** Decke ein- oder ausschalten; beim Einschalten ohne je eingestellte Wand- und Firsthöhe mit `DECKE_VORSCHLAG`. */
export function deckeSchalten(a: HallenAussehen | null | undefined, an: boolean): HallenAussehen | undefined {
  const vorschlag = an && a?.wandHoehe == null && a?.firstHoehe == null ? DECKE_VORSCHLAG : {};
  return aussehenBereinigt({ ...(a ?? {}), decke: an, ...vorschlag });
}

/** Firsthöhe, die in 3D gilt: das Satteldach nur mit Decke und rechteckigem Grundriss, sonst flach in Wandhöhe. */
export const wirksamerFirst = (a: VollesAussehen, rechteck: boolean): number => (a.decke && rechteck ? a.firstHoehe : a.wandHoehe);
