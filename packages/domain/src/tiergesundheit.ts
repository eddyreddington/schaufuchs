import type { Meldeart } from "./types";

/**
 * Tierseuchenrecht auf der Schau: Tierart aus Sparte und Rasse, nötige Nachweise je Aussteller,
 * Fristen der Nachweise und die Registriernummer nach § 26 ViehVerkV.
 * Grundlagen: § 7 GeflPestSchV (Fassung 2005, ND-Impfung Hühner und Truthühner), Sonderbestimmungen der Schauen
 * (PMV-Impfung Tauben), HMLU-Erlass 28.08.2026 Nr. 3 und 6 (Wassergeflügel auf Anordnung). Prüfhinweis: Länder und
 * Veterinärämter regeln Einzelheiten unterschiedlich – die Schau-Einstellungen bilden das ab.
 */

export const TIERARTEN = ["huehner", "puten", "perlhuehner", "enten", "gaense", "tauben", "wachteln", "sonstige"] as const;
export type Tierart = (typeof TIERARTEN)[number];

export const TIERART_LABEL: Record<Tierart, string> = {
  huehner: "Hühner und Zwerghühner",
  puten: "Puten",
  perlhuehner: "Perlhühner",
  enten: "Enten",
  gaense: "Gänse",
  tauben: "Tauben",
  wachteln: "Wachteln",
  sonstige: "Sonstige",
};

/** Großgeflügel nach Rasse: Puten vor Gänsen prüfen („Narragansett-Puten“ enthält „gans“). */
function grossgefluegel(t: string): Tierart | null {
  if (/perlh/.test(t)) return "perlhuehner";
  if (/pute|truth/.test(t)) return "puten";
  if (/gänse\b|gans\b/.test(t)) return "gaense";
  return null;
}

/**
 * Ordnet Sparte und Rasse einer Tierart zu. Zuerst zählt die Sparte (Hühner, Zwerghühner, Tauben, Wassergeflügel,
 * Großgeflügel, Wachteln) – die Rassennamen sind nicht genormt und enthalten Teilwörter wie „king“ (Dorking) oder
 * „gans“ (Narragansett). Nur ohne erkennbare Sparte entscheidet die Rasse, dann mit Wortgrenzen.
 */
export function tierart(sparte: string | null | undefined, rasse: string | null | undefined): Tierart {
  const s = (sparte ?? "").toLowerCase();
  const r = (rasse ?? "").toLowerCase();
  const t = `${s} ${r}`;
  if (/taube/.test(s)) return "tauben";
  if (/wachtel/.test(s)) return "wachteln";
  if (/großgeflügel|grossgefluegel/.test(s)) return grossgefluegel(t) ?? "sonstige";
  if (/wasser/.test(s)) return /gänse\b|gans\b/.test(t) ? "gaense" : "enten";
  if (/hühner|huhn/.test(s)) return "huehner";
  // Sparte unbekannt: nach der Rasse, mit Wortgrenzen.
  if (/\btaube|tauben\b|tümmler|kröpfer|mövchen|modeneser|strasser|\bking\b/.test(t)) return "tauben";
  if (/wachtel/.test(t)) return "wachteln";
  const gross = grossgefluegel(t);
  if (gross) return gross;
  if (/ente\b|enten\b|wasser/.test(t)) return "enten";
  if (/huhn|hühner|bantam/.test(t)) return "huehner";
  return "sonstige";
}

export const NACHWEISARTEN = ["nd", "pmv", "wg", "kl", "gz"] as const;
export type Nachweisart = (typeof NACHWEISARTEN)[number];

export const NACHWEIS_LABEL: Record<Nachweisart, string> = {
  nd: "ND-Impfung (Hühner, Puten)",
  pmv: "PMV-Impfung (Tauben)",
  wg: "Untersuchung Wassergeflügel (Enten, Gänse)",
  kl: "Klinische Untersuchung (tierärztliche Bescheinigung)",
  gz: "Gesundheitszertifikat / TRACES (Herkunft im Ausland)",
};

/**
 * Klinische Untersuchung nach § 7 Abs. 1 GeflPestSchV: Der Veranstalter stellt sicher, dass die Vögel vorher
 * tierärztlich untersucht sind – als Einlassuntersuchung oder per Bescheinigung aus dem Herkunftsbestand. Entfällt,
 * wenn alle Tiere aus dem eigenen oder einem angrenzenden Kreis stammen (regionale Schau).
 */
export const UNTERSUCHUNG_ARTEN = ["regional", "einlass", "bescheinigung"] as const;
export type Untersuchung = (typeof UNTERSUCHUNG_ARTEN)[number];
export const UNTERSUCHUNG_LABEL: Record<Untersuchung, string> = {
  regional: "Regionale Schau – alle Tiere aus dem eigenen oder einem angrenzenden Kreis (keine Untersuchung nötig)",
  einlass: "Einlassuntersuchung durch einen Tierarzt bei der Einlieferung",
  bescheinigung: "Tierärztliche Bescheinigung aus dem Herkunftsbestand je Aussteller",
};
/** Höchstalter der Bescheinigung vor der Schau (Merkblätter: 5 bis 6 Tage) – je Schau einstellbar. */
export const KL_TAGE = 6;

/** Ausländische Herkunft (Registriernummer mit Ländercode in Buchstaben, nicht DE). */
export function istAuslaendisch(registriernummer: string | null | undefined): boolean {
  const n = normalisiereRegistriernummer(registriernummer ?? "");
  return !!n && /^[A-Z]{2} /.test(n);
}

/** Welche Nachweise ein Aussteller mit diesen Tierarten bei der Einlieferung vorlegen muss. */
export function noetigeNachweise(arten: Tierart[], opts: { wassergefluegel: boolean; untersuchung?: Untersuchung | null; ausland?: boolean }): Nachweisart[] {
  const a = new Set(arten);
  return [
    // Aus anderen Mitgliedstaaten brauchen auch Tauben eine ND-Impfung (HMLU-Erlass 28.08.2026 Nr. 3).
    a.has("huehner") || a.has("puten") || (opts.ausland && a.has("tauben")) ? ("nd" as const) : null,
    a.has("tauben") ? ("pmv" as const) : null,
    opts.wassergefluegel && (a.has("enten") || a.has("gaense")) ? ("wg" as const) : null,
    opts.untersuchung === "bescheinigung" && a.size ? ("kl" as const) : null,
    opts.ausland && a.size ? ("gz" as const) : null,
  ].filter((x): x is Nachweisart => x != null);
}

/** Fristen der Schau nach dem Merkblatt des Veterinäramts (Tage vor dem Stichtag); leer = keine Frist. */
export interface NachweisFristen {
  ndMin?: number | null;
  ndMax?: number | null;
  pmvMin?: number | null;
  pmvMax?: number | null;
  klTage?: number | null;
}

/** Virologische Untersuchung höchstens 7 Tage, Sentinel-Bestätigung höchstens 12 Monate vor der Schau. */
export const WG_UNTERSUCHUNG_TAGE = 7;
export const WG_SENTINEL_TAGE = 365;

const tage = (von: string, bis: string) => Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);

/**
 * Prüft einen Nachweis: Datum vorhanden, nicht in der Zukunft, beim Wassergeflügel innerhalb der Frist vor dem Stichtag
 * (Bewertungstag). Rückgabe: Fehlertext oder null.
 */
export function pruefeNachweis(
  art: Nachweisart,
  n: { datum: string | null; sentinel?: boolean; text?: string },
  stichtag: string,
  heute: string,
  fristen: NachweisFristen = {},
): string | null {
  if (!n.datum) return `${NACHWEIS_LABEL[art]}: Datum fehlt.`;
  if (n.datum > heute) return `${NACHWEIS_LABEL[art]}: Datum liegt in der Zukunft.`;
  if (art === "nd" || art === "pmv") {
    const alter = tage(n.datum, stichtag);
    const min = art === "nd" ? fristen.ndMin : fristen.pmvMin;
    const max = art === "nd" ? fristen.ndMax : fristen.pmvMax;
    if (min != null && alter < min) return `${NACHWEIS_LABEL[art]}: nur ${alter} Tage vor der Schau – mindestens ${min} Tage verlangt.`;
    if (max != null && alter > max) return `${NACHWEIS_LABEL[art]}: ${alter} Tage vor der Schau – höchstens ${max} Tage erlaubt.`;
  }
  if (art === "kl") {
    const grenze = fristen.klTage ?? KL_TAGE;
    if (tage(n.datum, stichtag) > grenze) return `${NACHWEIS_LABEL[art]}: älter als ${grenze} Tage vor der Schau.`;
  }
  if (art === "gz" && !n.text?.trim()) return `${NACHWEIS_LABEL[art]}: Nummer des Zertifikats bzw. der TRACES-Meldung fehlt.`;
  if (art === "wg") {
    const alter = tage(n.datum, stichtag);
    const grenze = n.sentinel ? WG_SENTINEL_TAGE : WG_UNTERSUCHUNG_TAGE;
    if (alter > grenze) return `${NACHWEIS_LABEL[art]}: ${n.sentinel ? "Sentinel-Bestätigung" : "Untersuchung"} ist älter als ${n.sentinel ? "12 Monate" : `${WG_UNTERSUCHUNG_TAGE} Tage`} vor der Schau.`;
  }
  return null;
}

/** Ländercodes der EU, des EWR und der Schweiz (ISO 3166-1; Griechenland auch „EL“). */
const LAENDER_EWR = new Set(
  "AT BE BG CY CZ DK EE ES FI FR GR EL HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK IS LI NO CH".split(" "),
);

/**
 * Registriernummer nach § 26 ViehVerkV: 12 Ziffern (8-stelliger Gemeindeschlüssel + 4-stellige Betriebsnummer),
 * oft mit Ländercode 276 davor. Ausländische Nummern beginnen mit dem Ländercode in Buchstaben (z. B. „NL …“).
 * Gibt die Nummer einheitlich geschrieben zurück („276 06 535 012 0001“) oder null, wenn sie nicht passt.
 */
export function normalisiereRegistriernummer(eingabe: string): string | null {
  const roh = eingabe.trim();
  const ausland = roh.toUpperCase().match(/^([A-Z]{2})[\s-]?([0-9A-Z][0-9A-Z\s./-]*)$/);
  if (ausland && ausland[1] !== "DE") {
    // Nur EU/EWR- und Schweizer Ländercodes mit einer Nummer aus mindestens 5 Ziffern – „keine“ oder „unbekannt“ sind keine Nummer.
    const [, land, rest] = ausland;
    if (!LAENDER_EWR.has(land!) || (rest!.match(/\d/g)?.length ?? 0) < 5) return null;
    return `${land} ${rest!.replace(/\s+/g, " ").trim()}`;
  }
  const ziffern = roh.replace(/^DE/i, "").replace(/[\s./-]/g, "");
  if (!/^\d+$/.test(ziffern)) return null;
  const nr = ziffern.length === 15 && ziffern.startsWith("276") ? ziffern.slice(3) : ziffern;
  if (nr.length !== 12) return null;
  return `276 ${nr.slice(0, 2)} ${nr.slice(2, 5)} ${nr.slice(5, 8)} ${nr.slice(8)}`;
}

export const REGISTRIERNUMMER_HINWEIS = "12 Ziffern, z. B. 276 06 535 012 0001 (Ländercode 276 darf fehlen); ausländische Nummern mit Ländercode, z. B. NL …";

/** Geschlechtsangabe „m,w“: mindestens ein Tier; Einzeltier genau eines, Stamm und Voliere höchstens 30. */
export function pruefeGeschlecht(art: Meldeart, geschlecht: string): string | null {
  const m = /^\s*(\d{1,2})\s*,\s*(\d{1,2})\s*$/.exec(geschlecht);
  if (!m) return "Geschlecht als 1,0 / 0,1 / 1,2 angeben.";
  if (art === "bruteier") return null;
  const n = Number(m[1]) + Number(m[2]);
  if (n === 0) return "Mindestens ein Tier angeben (0,0 ist kein Tier).";
  if (art === "einzeltier" && n !== 1) return "Ein Einzeltier ist 1,0 oder 0,1.";
  if (art !== "einzeltier" && n < 2) return "Stamm und Voliere bestehen aus mehreren Tieren.";
  if (n > 30) return "Höchstens 30 Tiere je Stamm oder Voliere.";
  return null;
}
