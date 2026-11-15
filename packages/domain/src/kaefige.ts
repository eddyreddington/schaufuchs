/**
 * Käfige: Welche Käfiggröße braucht ein gemeldetes Tier, und welche Käfignummern (= Katalognummern) gehören zu welcher
 * Größe? Grundlage für den Käfigbedarf beim Aufbau der Halle. Ein Tier je Käfig; Stämme und Volieren je ein eigener.
 */
import { artenDerSparte } from "./textbausteine";
import type { Meldeart } from "./types";

export const KAEFIG_TYPEN = ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm", "voliere"] as const;
export type KaefigTyp = (typeof KAEFIG_TYPEN)[number];
export const KAEFIG_TYP_LABEL: Record<KaefigTyp, string> = {
  grosskaefig: "Großkäfig",
  huehner: "Hühnerkäfig",
  zwerghuehner: "Zwerghuhnkäfig",
  tauben: "Taubenkäfig",
  stamm: "Stammkäfig",
  voliere: "Voliere",
};

/** Mehrzahl der Käfigarten („34 Taubenkäfige“). */
export const KAEFIG_TYP_MEHRZAHL: Record<KaefigTyp, string> = {
  grosskaefig: "Großkäfige",
  huehner: "Hühnerkäfige",
  zwerghuehner: "Zwerghuhnkäfige",
  tauben: "Taubenkäfige",
  stamm: "Stammkäfige",
  voliere: "Volieren",
};

/** Anzahl mit Käfigart und Maß (Breite × Tiefe × Höhe): „34 Taubenkäfige (40 × 40 × 40 cm)“, ohne Maß nur die Art. */
export function kaefigAnzahl(n: number, typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const m = kaefigMass(typ, masse);
  const art = n === 1 ? KAEFIG_TYP_LABEL[typ] : KAEFIG_TYP_MEHRZAHL[typ];
  return m ? `${n} ${art} (${cm(m.breite)} × ${cm(m.tiefe)} × ${cm(m.hoehe)} cm)` : `${n} ${art}`;
}

/** Abweichende Käfiggröße für eine Rasse (gilt für Einzeltiere), z. B. Fasane im Großkäfig. */
export interface KaefigRegel {
  rasse: string;
  typ: KaefigTyp;
}

const norm = (x: string | null | undefined) => (x ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/**
 * Käfiggröße eines Eintrags. Bruteier brauchen keinen Käfig (null). Stamm und Voliere haben ihren eigenen Käfig. Für
 * Einzeltiere gilt zuerst die Regel der Rasse, sonst die Geflügelart: Puten und Gänse im Großkäfig, Tauben im
 * Taubenkäfig, Zwerghühner und Wachteln im Zwerghuhnkäfig, alles andere (Hühner, Enten, Perlhühner, Ziergeflügel) im
 * Hühnerkäfig.
 */
export function kaefigTyp(
  e: { art: Meldeart; sparte?: string | null; rasse?: string | null; /** Für dieses eine Tier gewählt (z. B. nur noch ein Großkäfig frei). */ wahl?: KaefigTyp | null },
  regeln: KaefigRegel[] = [],
): KaefigTyp | null {
  if (e.art === "bruteier") return null;
  if (e.wahl) return e.wahl;
  if (e.art === "stamm") return "stamm";
  if (e.art === "voliere") return "voliere";
  const regel = regeln.find((r) => norm(r.rasse) && norm(r.rasse) === norm(e.rasse));
  if (regel) return regel.typ;
  const arten = artenDerSparte(e.sparte, e.rasse) ?? [];
  const r = norm(e.rasse);
  if (arten.includes("tauben")) return "tauben";
  if (arten.length === 1 && arten[0] === "puten") return "grosskaefig";
  if (/gans|gänse|gaense/.test(r)) return "grosskaefig";
  if (arten.length === 1 && arten[0] === "wachteln") return "zwerghuehner";
  if (/zwerg/.test(norm(e.sparte)) || /^zwerg/.test(r)) return "zwerghuehner";
  return "huehner";
}

/**
 * Käfignummern kurz: „1–40, 52, 55–60, 100a, 100b“. Ganze Nummern werden zu Bereichen zusammengefasst, Unternummern
 * (Nachmeldungen) einzeln angehängt. Einträge ohne Nummer zählen nicht.
 */
export function nummernBereiche(eintraege: { katalogNr: number | null; suffix?: string | null }[]): string {
  const ganz = [...new Set(eintraege.filter((e) => e.katalogNr != null && !e.suffix).map((e) => e.katalogNr!))].sort((a, b) => a - b);
  const teile: string[] = [];
  for (let i = 0; i < ganz.length; i++) {
    let j = i;
    while (j + 1 < ganz.length && ganz[j + 1] === ganz[j]! + 1) j++;
    teile.push(j > i ? `${ganz[i]}–${ganz[j]}` : `${ganz[i]}`);
    i = j;
  }
  const unter = eintraege
    .filter((e) => e.katalogNr != null && e.suffix)
    .sort((a, b) => a.katalogNr! - b.katalogNr! || a.suffix!.localeCompare(b.suffix!))
    .map((e) => `${e.katalogNr}${e.suffix}`);
  return [...teile, ...unter].join(", ");
}

/**
 * Richtwerte für Ausstellungskäfige (Innenmaß, Kantenlänge, ein Tier) nach den BMEL-Leitlinien zur Ausrichtung von
 * Tierbörsen (2006), die Veterinärämter als Richtwert für Geflügelausstellungen übernehmen. Keine bundesweit verbindliche
 * Vorgabe – maßgeblich ist das Merkblatt des zuständigen Veterinäramts und der eigene Käfigbestand.
 */
export const KAEFIG_RICHTWERT: Record<KaefigTyp, string> = {
  grosskaefig: "100 cm",
  huehner: "70 cm (kleine Rassen und Perlhühner 60 cm)",
  zwerghuehner: "50 cm",
  tauben: "35–40 cm (große Rassen 50–60 cm)",
  stamm: "nach Besatz (höchstens 2 Tiere je Käfig, halbe Fläche frei)",
  voliere: "nach Besatz",
};

/** Maß eines Käfigs in cm (Innenmaß): Breite (Front), Tiefe, Höhe. */
export interface KaefigMass {
  breite: number;
  tiefe: number;
  hoehe: number;
}
/** Maße der eigenen Käfige je Käfigart. Fehlt eines, gilt der Richtwert. Grundlage für Anzeige und Hallenplan. */
export type KaefigMasse = Partial<Record<KaefigTyp, KaefigMass>>;

/**
 * Ohne eigene Maße: Würfel mit der Kantenlänge nach Richtwert (Tauben die obere Grenze 40 cm). Stamm und Voliere haben
 * kein festes Maß (nach Besatz) – null, bis der Verein seine Maße einträgt.
 */
export const KAEFIG_MASS_STANDARD: Record<KaefigTyp, KaefigMass | null> = {
  grosskaefig: { breite: 100, tiefe: 100, hoehe: 100 },
  huehner: { breite: 70, tiefe: 70, hoehe: 70 },
  zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 },
  tauben: { breite: 40, tiefe: 40, hoehe: 40 },
  stamm: null,
  voliere: null,
};

/** Wofür die Käfigart gedacht ist – als Erklärung neben dem Maß. */
export const KAEFIG_FUER: Record<KaefigTyp, string> = {
  grosskaefig: "Puten, Gänse, Fasane",
  huehner: "Hühner, Enten",
  zwerghuehner: "Zwerghühner, Zwergenten",
  tauben: "Tauben",
  stamm: "Stämme",
  voliere: "Volieren",
};

/** Geltendes Maß: eigenes vor Richtwert; null bei Stamm und Voliere ohne eingetragenes Maß. */
export function kaefigMass(typ: KaefigTyp, masse?: KaefigMasse | null): KaefigMass | null {
  return masse?.[typ] ?? KAEFIG_MASS_STANDARD[typ];
}

const cm = (n: number) => String(n).replace(".", ",");

/** Anzeige eines Käfigs mit seinem Maß („70 × 60 × 70 cm“, Breite × Tiefe × Höhe); Stamm und Voliere mit Namen davor. */
export function kaefigName(typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const m = kaefigMass(typ, masse);
  if (!m) return KAEFIG_TYP_LABEL[typ];
  const text = `${cm(m.breite)} × ${cm(m.tiefe)} × ${cm(m.hoehe)} cm`;
  return typ === "stamm" || typ === "voliere" ? `${KAEFIG_TYP_LABEL[typ]} ${text}` : text;
}

/** Maß mit Verwendungszweck, für Auswahllisten: „70 × 70 × 70 cm – Hühner, Enten“. */
export function kaefigNameLang(typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const name = kaefigName(typ, masse);
  return name === KAEFIG_TYP_LABEL[typ] || typ === "stamm" || typ === "voliere" ? name : `${name} – ${KAEFIG_FUER[typ]}`;
}

export interface KaefigVorschlag {
  typ: KaefigTyp;
  grund: string;
}

/** Belegte Abweichungen von der Grundregel (Recherche 11.11.2026, BMEL-Leitlinien 2006 und Merkblätter der Veterinärämter). */
const VORSCHLAEGE: { muster: RegExp; typ: KaefigTyp; grund: string }[] = [
  { muster: /fasan/, typ: "grosskaefig", grund: "Fasane: Richtwert 100 cm" },
  { muster: /römer|roemer|montauban/, typ: "huehner", grund: "große Tauben (Römer, Montauban): Richtwert 60 cm statt 35–40 cm" },
  { muster: /strasser/, typ: "zwerghuehner", grund: "Strasser: Richtwert 50 cm statt 35–40 cm" },
];

/** Vorschlag für eine Rasse, wenn er von der automatischen Größe abweicht – sonst null. */
export function kaefigVorschlag(rasse: string | null | undefined, auto: KaefigTyp): KaefigVorschlag | null {
  const r = norm(rasse);
  const v = VORSCHLAEGE.find((x) => x.muster.test(r));
  return v && v.typ !== auto ? { typ: v.typ, grund: v.grund } : null;
}
