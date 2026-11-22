import type { KaefigTyp } from "./kaefige";
import { MELDEARTEN, type Alter, type Meldeart } from "./types";

/** Ein Katalogeintrag mit allem, was für die Ausstellungsfolge zählt. */
export interface FolgeEintrag {
  id: number;
  /** Stelle der Teilschau (siehe teilschau.ts); fehlt = 0. Die Nummern laufen erst durch die ganze erste Teilschau. */
  teilschauFolge?: number;
  /** Reihenfolge aus den Stammdaten. null = nicht im Verzeichnis (AOC, Neuzüchtung). */
  sparteFolge: number | null;
  rasseFolge: number | null;
  farbFolge: number | null;
  /** Für Einträge ohne Stammdaten: freie Bezeichnung zum Sortieren. */
  freitext: string;
  art: Meldeart;
  geschlecht: string;
  alter: Alter;
  istJugend: boolean;
  ausstellerName: string;
  /** Verein des Ausstellers (Angabe beim Aussteller); leer = ohne Verein. */
  verein?: string;
  /** Aussteller (über alle seine Meldungen, auch Nachmeldungen); fehlt er, zählt die Meldung. */
  ausstellerId?: number | null;
  meldungId: number;
  position: number;
  /** Käfiggröße (siehe kaefige.ts) – nur für die Folge nach Käfigblöcken; null = ohne Käfig (Bruteier). */
  kaefigTyp?: KaefigTyp | null;
}

export interface Katalognummer {
  nr: number;
  suffix: string;
}

const OHNE = Number.MAX_SAFE_INTEGER;

/** 1,0 vor 0,1 (umgekehrt 0,1 vor 1,0), danach Stämme und Gruppen (z. B. 1,2). */
function geschlechtFolge(g: string, umgekehrt = false): number {
  if (g === "1,0") return umgekehrt ? 1 : 0;
  if (g === "0,1") return umgekehrt ? 0 : 1;
  return 2;
}

/**
 * Kriterien, nach denen die Katalognummern innerhalb der Gliederung (Jugend, Käfigblöcke, Volieren und Stämme vorn)
 * laufen. Die Reihenfolge der Liste ist die Rangfolge.
 */
export const SORTIER_KRITERIEN = ["sparte", "rasse", "farbenschlag", "meldeart", "verein", "aussteller", "ausstellernummer", "geschlecht", "alter"] as const;
export type SortierKriterium = (typeof SORTIER_KRITERIEN)[number];

export interface SortierSchritt {
  kriterium: SortierKriterium;
  /** Ausgeschaltet: zählt nicht (alle außer Sparte, Rasse, Farbenschlag). */
  aus?: boolean;
  /** Andere Richtung (nur Meldeart, Geschlecht, Alter), siehe SORTIER_RICHTUNG. */
  umgekehrt?: boolean;
}
export type KatalogSortierung = SortierSchritt[];

/** Ab Werk aus (nachträglich dazugekommen): eine Schau ohne eigene Wahl sortiert wie bisher. */
const STANDARD_AUS: readonly SortierKriterium[] = ["verein", "ausstellernummer"];

/** Bisherige Ausstellungsfolge: Sparte, Rasse, Farbenschlag, Meldeart, je Aussteller 1,0 jung, 1,0 alt, 0,1 jung, 0,1 alt. */
export const SORTIERUNG_STANDARD: KatalogSortierung = SORTIER_KRITERIEN.map((kriterium) => (STANDARD_AUS.includes(kriterium) ? { kriterium, aus: true } : { kriterium }));

export const SORTIER_LABEL: Record<SortierKriterium, string> = {
  sparte: "Sparte",
  rasse: "Rasse",
  farbenschlag: "Farbenschlag",
  meldeart: "Meldeart",
  verein: "Verein",
  aussteller: "Aussteller",
  ausstellernummer: "Ausstellernummer",
  geschlecht: "Geschlecht",
  alter: "Alter",
};

/** Richtungen [normal, umgekehrt]; ohne Eintrag gibt es keine Wahl (Verzeichnisfolge bzw. Name A–Z). */
export const SORTIER_RICHTUNG: Partial<Record<SortierKriterium, [string, string]>> = {
  meldeart: ["Einzeltier, Stamm, Voliere", "Voliere, Stamm, Einzeltier"],
  geschlecht: ["1,0 vor 0,1", "0,1 vor 1,0"],
  alter: ["jung vor alt", "alt vor jung"],
};

/**
 * Immer an, immer vorn und in dieser Reihenfolge: das Gerüst des Katalogs (Sparten- und Rassenköpfe, Rassenverzeichnis
 * mit Nummernbereich je Rasse) und des Hallenplans. Wählbar ist die Folge innerhalb des Farbenschlags.
 */
export const SORTIER_FEST: readonly SortierKriterium[] = ["sparte", "rasse", "farbenschlag"];

/**
 * Vollständige, gültige Sortierung aus einer gespeicherten (oder leeren) Liste: unbekannte und doppelte Einträge fallen
 * weg, fehlende kommen in Vorgabefolge ans Ende. Sparte, Rasse und Farbenschlag stehen immer an und vorn in dieser
 * Reihenfolge, die übrigen in der Reihenfolge der Liste dahinter. Richtung nur, wo es eine gibt.
 */
export function sortierungNormal(eingabe: readonly SortierSchritt[] | null | undefined): KatalogSortierung {
  const gesehen = new Set<SortierKriterium>();
  const liste: KatalogSortierung = [];
  for (const s of [...(eingabe ?? []), ...SORTIERUNG_STANDARD]) {
    if (!SORTIER_KRITERIEN.includes(s?.kriterium) || gesehen.has(s.kriterium)) continue;
    gesehen.add(s.kriterium);
    const fest = SORTIER_FEST.includes(s.kriterium);
    liste.push({ kriterium: s.kriterium, ...(s.aus && !fest ? { aus: true } : {}), ...(s.umgekehrt && SORTIER_RICHTUNG[s.kriterium] ? { umgekehrt: true } : {}) });
  }
  return [...SORTIER_FEST.map((kriterium) => ({ kriterium })), ...liste.filter((s) => !SORTIER_FEST.includes(s.kriterium))];
}

/** Ist das die Vorgabe? (Dann speichert die Schau nichts.) */
export function istStandardSortierung(s: readonly SortierSchritt[] | null | undefined): boolean {
  return JSON.stringify(sortierungNormal(s)) === JSON.stringify(SORTIERUNG_STANDARD);
}

/** Kurztext: „Sparte, Rasse, Farbenschlag, Meldeart, Aussteller, Geschlecht (1,0 vor 0,1), Alter (jung vor alt)“. */
export function sortierungText(s: readonly SortierSchritt[] | null | undefined): string {
  return sortierungNormal(s)
    .filter((x) => !x.aus)
    .map((x) => {
      const r = SORTIER_RICHTUNG[x.kriterium];
      return r ? `${SORTIER_LABEL[x.kriterium]} (${r[x.umgekehrt ? 1 : 0]})` : SORTIER_LABEL[x.kriterium];
    })
    .join(", ");
}

/** Meldeart: Einzeltier, Stamm, Voliere – umgekehrt Voliere, Stamm, Einzeltier; Bruteier immer am Ende. */
function meldeartFolge(art: Meldeart, umgekehrt: boolean): number {
  const i = MELDEARTEN.indexOf(art);
  return umgekehrt && art !== "bruteier" ? 2 - i : i;
}

function schluessel(e: FolgeEintrag, s: SortierSchritt): (number | string)[] {
  switch (s.kriterium) {
    case "sparte":
      return [e.sparteFolge ?? OHNE];
    case "rasse":
      return [e.rasseFolge ?? OHNE];
    case "farbenschlag":
      // Ohne Verzeichnis (AOC, Neuzüchtung) nach der freien Bezeichnung.
      return [e.farbFolge ?? OHNE, e.freitext.toLocaleLowerCase("de")];
    case "meldeart":
      return [meldeartFolge(e.art, !!s.umgekehrt)];
    case "verein":
      // Schreibweise egal; ohne Verein hinter allen Vereinen.
      return [e.verein?.trim() ? e.verein.trim().toLocaleLowerCase("de") : "\uffff"];
    case "ausstellernummer":
      // Nummer des Ausstellers im Verein (Reihenfolge der Erfassung); ohne Nummer je Meldung dahinter.
      return [e.ausstellerId ?? 1e12 + e.meldungId];
    case "aussteller":
      // Tiere eines Züchters stehen zusammen (auch über Nachmeldungen); ohne Ausstellernummer je Meldung, hinter allen bekannten.
      return [e.ausstellerName.toLocaleLowerCase("de"), e.ausstellerId ?? 1e12 + e.meldungId];
    case "geschlecht":
      return [geschlechtFolge(e.geschlecht, !!s.umgekehrt)];
    case "alter":
      return [(e.alter === "jung") !== !!s.umgekehrt ? 0 : 1];
  }
}

export interface FolgeOptionen {
  /** Jugendliche bekommen einen eigenen Block hinter den Senioren. */
  jugendSeparat: boolean;
  /**
   * Volieren und Stämme bilden eigene Abteilungen vor den Einzeltieren (Volieren → Stämme → Einzeltiere),
   * wie in den Katalogen großer Schauen. Sonst stehen sie bei ihrem Farbenschlag hinter den Einzeltieren.
   */
  staemmeVorn?: boolean;
  /**
   * Katalognummern nach Käfigblöcken in dieser Reihenfolge (so wie die Käfige in der Halle stehen); innerhalb eines Blocks
   * gilt die Ausstellungsfolge. Leer oder null = nach Sparten wie gewohnt. Bruteier (ohne Käfig) kommen ans Ende.
   */
  kaefigFolge?: readonly KaefigTyp[] | null;
  /** Reihenfolge innerhalb der Gliederung (siehe SORTIER_KRITERIEN); leer oder null = Vorgabe (SORTIERUNG_STANDARD). */
  sortierung?: readonly SortierSchritt[] | null;
}

/** Position des Käfigblocks: nach der Reihenfolge der Schau; unbekannte Größen dahinter, Bruteier ganz ans Ende. */
function blockFolge(e: FolgeEintrag, folge: readonly KaefigTyp[] | null | undefined): number {
  if (!folge?.length) return 0;
  if (!e.kaefigTyp) return folge.length + 1;
  const i = folge.indexOf(e.kaefigTyp);
  return i < 0 ? folge.length : i;
}

/** Eigene Abteilung im Katalog, wenn Stämme und Volieren vorn stehen – sonst null (Tier steht in seiner Sparte). */
export function gruppenAbteilung(art: Meldeart, staemmeVorn: boolean | undefined): "Volieren" | "Stämme" | null {
  if (!staemmeVorn) return null;
  if (art === "voliere") return "Volieren";
  if (art === "stamm") return "Stämme";
  return null;
}

function abteilungFolge(art: Meldeart, staemmeVorn: boolean | undefined): number {
  const a = gruppenAbteilung(art, staemmeVorn);
  return a === "Volieren" ? 0 : a === "Stämme" ? 1 : 2;
}

/**
 * Steht das Tier im eigenen Jugendblock (Einstellung „Jugend im Katalog: eigener Block am Ende“)? Bei „in der Rasse
 * eingereiht“ nie – dann ist die Jugend keine eigene Abteilung in Katalog, Kurzkatalog und Ergebnissen.
 */
export function istJugendBlock(e: { istJugend: boolean }, opts: { jugendSeparat: boolean }): boolean {
  return opts.jugendSeparat && e.istJugend;
}

export function vergleicheFolge(a: FolgeEintrag, b: FolgeEintrag, opts: FolgeOptionen): number {
  const schritte = sortierungNormal(opts.sortierung).filter((s) => !s.aus);
  // Stehen die Tiere eines Ausstellers nicht zusammen, gilt bei sonst Gleichem der Meldeeingang.
  const mitAussteller = schritte.some((s) => s.kriterium === "aussteller" || s.kriterium === "ausstellernummer");
  const keys = (e: FolgeEintrag): (number | string)[] => [
    e.teilschauFolge ?? 0,
    istJugendBlock(e, opts) ? 1 : 0,
    blockFolge(e, opts.kaefigFolge),
    abteilungFolge(e.art, opts.staemmeVorn),
    ...schritte.flatMap((s) => schluessel(e, s)),
    ...(mitAussteller ? [] : [e.meldungId]),
    e.position,
  ];
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) {
    const x = ka[i]!;
    const y = kb[i]!;
    if (x === y) continue;
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "de");
    return (x as number) - (y as number);
  }
  return a.id - b.id;
}

/** Vergibt alle Katalognummern neu, lückenlos ab `start`. */
export function vergebeKatalognummern(
  eintraege: FolgeEintrag[],
  opts: FolgeOptionen & { start: number },
): Map<number, Katalognummer> {
  const sortiert = [...eintraege].sort((a, b) => vergleicheFolge(a, b, opts));
  const result = new Map<number, Katalognummer>();
  sortiert.forEach((e, i) => result.set(e.id, { nr: opts.start + i, suffix: "" }));
  return result;
}

function naechstesSuffix(belegt: string[]): string {
  // a, b, …, z, aa, ab, … – reicht für jede realistische Zahl an Nachmeldungen.
  const toNum = (s: string) => [...s].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 96), 0);
  const max = belegt.reduce((m, s) => Math.max(m, s ? toNum(s) : 0), 0);
  let n = max + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(97 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface Nachmeldungsnummer extends Katalognummer {
  /**
   * Unter derselben Nummer gibt es schon eine Unternummer, die in der Ausstellungsfolge NACH dem neuen Tier kommt
   * (z. B. 1a = 0,1 jung, neu 1,0 alt → 1b). Die Nummer bleibt eindeutig, die Reihenfolge stimmt aber nicht –
   * die Ausstellungsleitung sollte das sehen.
   */
  reihenfolgeVerletzt: boolean;
}

/**
 * Nummer für eine Nachmeldung, ohne bestehende Nummern zu ändern:
 * Sie bekommt die Nummer ihres Vorgängers in der Ausstellungsfolge plus Unternummer (100a, 100b …).
 */
export function nachmeldungsNummer(
  neu: FolgeEintrag,
  vorhanden: (FolgeEintrag & Katalognummer)[],
  opts: FolgeOptionen & { start: number },
): Nachmeldungsnummer {
  const sortiert = [...vorhanden].sort((a, b) => a.nr - b.nr || a.suffix.localeCompare(b.suffix));
  let vorgaenger: (FolgeEintrag & Katalognummer) | undefined;
  for (const e of sortiert) {
    if (vergleicheFolge(e, neu, opts) <= 0) vorgaenger = e;
  }
  if (!vorgaenger) {
    if (sortiert.length === 0) return { nr: opts.start, suffix: "", reihenfolgeVerletzt: false };
    // Vor dem ersten Eintrag: Nummer davor, falls frei, sonst Unternummer an der ersten.
    const erste = sortiert[0]!;
    if (erste.nr > opts.start) return { nr: erste.nr - 1, suffix: "", reihenfolgeVerletzt: false };
    vorgaenger = erste;
  }
  const nr = vorgaenger.nr;
  const gleicheNr = vorhanden.filter((e) => e.nr === nr);
  // Die neue Unternummer steht hinter allen vorhandenen dieser Nummer.
  const reihenfolgeVerletzt = gleicheNr.some((e) => vergleicheFolge(e, neu, opts) > 0);
  return { nr, suffix: naechstesSuffix(gleicheNr.map((e) => e.suffix)), reihenfolgeVerletzt };
}

/**
 * Nummern für mehrere Nachmeldungen eines Laufs. Sie werden vorher in Ausstellungsfolge gebracht,
 * sonst bekäme z. B. eine früher gemeldete 0,1 jung die Unternummer vor einem später gemeldeten 1,0 alt.
 */
export function nachmeldungsNummern(
  neue: FolgeEintrag[],
  vorhanden: (FolgeEintrag & Katalognummer)[],
  opts: FolgeOptionen & { start: number },
): Map<number, Nachmeldungsnummer> {
  const belegt = [...vorhanden];
  const result = new Map<number, Nachmeldungsnummer>();
  for (const e of [...neue].sort((a, b) => vergleicheFolge(a, b, opts))) {
    const k = nachmeldungsNummer(e, belegt, opts);
    result.set(e.id, k);
    belegt.push({ ...e, nr: k.nr, suffix: k.suffix });
  }
  return result;
}

export function formatKatalognummer(k: { katalogNr: number | null; suffix: string } | null | undefined): string {
  if (!k || k.katalogNr == null) return "–";
  return `${k.katalogNr}${k.suffix}`;
}

/**
 * Plausibilität des Ringjahrs: Ein Jungtier trägt einen Ring des laufenden Jahrgangs. Erkennt das Jahr als
 * zweistellige Zahlengruppe („DE 26 1234“, „26/0815“); ohne erkennbares Jahr gilt der Ring als passend (nur Hinweis).
 */
export function ringjahrPasst(ringnummern: string, alter: string, schauJahr: number): boolean {
  if (alter !== "jung" || !ringnummern.trim()) return true;
  const jahre = ringnummern.match(/(?<!\d)\d{2}(?!\d)/g);
  if (!jahre) return true;
  const jj = String(schauJahr % 100).padStart(2, "0");
  return jahre.includes(jj);
}
