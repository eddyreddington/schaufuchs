/**
 * Typografie des gedruckten Katalogs (Entscheidung 032): genau eine Schriftfamilie je Katalog – die gewählte – für
 * Titel, Köpfe, Fließtext, Tabellen und Zahlen, unterschieden nur durch Schnitt (normal, fett, kursiv) und die festen
 * Größenstufen hier. Eine Auszeichnungsschrift gibt es nur für den Namen der Schau auf der Titelseite und nur bei den
 * Wahlen, die sie ausdrücklich nennen. Briefe, Belege und Karten haben ihre eigenen Schriften (nicht hier).
 */
import type { KatalogSchrift } from "./schriften";

/** Die drei Schnitte, mit denen der Katalog auszeichnet. */
export type KatalogSchnitt = "normal" | "fett" | "kursiv";
/** Schriftdateien einer Familie (apps/server/fonts). Fehlt ein Schnitt, steht dafür die Regular derselben Familie. */
export type FamilienDateien = { normal: string; fett?: string; kursiv?: string };

/** Die Familien, alle unter der SIL Open Font License. `pdfName`: PostScript-Name im PDF (Prüfung mit pdffonts). */
export const KATALOG_FAMILIEN = {
  plexSchmal: { name: "IBM Plex Sans Condensed", pdfName: "IBMPlexSansCond", dateien: { normal: "IBMPlexSansCondensed-Regular.ttf", fett: "IBMPlexSansCondensed-SemiBold.ttf", kursiv: "IBMPlexSansCondensed-Italic.ttf" } },
  sourceSans: { name: "Source Sans 3", pdfName: "SourceSans3", dateien: { normal: "SourceSans3-Regular.ttf", fett: "SourceSans3-SemiBold.ttf", kursiv: "SourceSans3-Italic.ttf" } },
  atkinson: { name: "Atkinson Hyperlegible", pdfName: "AtkinsonHyperlegible", dateien: { normal: "AtkinsonHyperlegible-Regular.ttf", fett: "AtkinsonHyperlegible-Bold.ttf", kursiv: "AtkinsonHyperlegible-Italic.ttf" } },
  garamond: { name: "EB Garamond", pdfName: "EBGaramond", dateien: { normal: "EBGaramond-Regular.ttf", fett: "EBGaramond-SemiBold.ttf", kursiv: "EBGaramond-Italic.ttf" } },
  spectral: { name: "Spectral", pdfName: "Spectral", dateien: { normal: "Spectral-Regular.ttf", fett: "Spectral-SemiBold.ttf", kursiv: "Spectral-Italic.ttf" } },
} as const satisfies Record<string, { name: string; pdfName: string; dateien: FamilienDateien }>;
export type KatalogFamilie = keyof typeof KATALOG_FAMILIEN;

/**
 * Familie je Schriftwahl. `titel`: Auszeichnung nur für den Namen der Schau auf der Titelseite (sonst ist auch er in
 * der Familie). Die Schlüssel bleiben die gespeicherten Werte der Gestaltung.
 */
export const KATALOG_SCHRIFT_FAMILIE: Record<KatalogSchrift, { familie: KatalogFamilie; titel?: KatalogFamilie }> = {
  klassisch: { familie: "plexSchmal" },
  traditionell: { familie: "garamond" },
  lesbar: { familie: "atkinson" },
  modern: { familie: "sourceSans" },
  buchschmal: { familie: "plexSchmal", titel: "garamond" },
  ausgewogen: { familie: "sourceSans", titel: "spectral" },
};

/** Datei eines Schnitts; fehlt er der Familie, die Regular derselben Familie (nie eine fremde Schrift). */
export function schnittDatei(dateien: FamilienDateien, schnitt: KatalogSchnitt): string {
  return (schnitt === "normal" ? undefined : dateien[schnitt]) ?? dateien.normal;
}

/** Schriftsatz einer Wahl: Dateien der drei Schnitte, der Auszeichnung (oder null) und die Namen im PDF. */
export function katalogSchriftsatz(schrift: KatalogSchrift) {
  const wahl = KATALOG_SCHRIFT_FAMILIE[schrift] ?? KATALOG_SCHRIFT_FAMILIE.klassisch;
  const f = KATALOG_FAMILIEN[wahl.familie];
  const t = wahl.titel ? KATALOG_FAMILIEN[wahl.titel] : null;
  return {
    normal: schnittDatei(f.dateien, "normal"),
    fett: schnittDatei(f.dateien, "fett"),
    kursiv: schnittDatei(f.dateien, "kursiv"),
    titel: t ? schnittDatei(t.dateien, "normal") : null,
    pdfNamen: [f.pdfName],
    titelPdfName: t ? t.pdfName : null,
  };
}

/** Größenstufen von groß nach klein. */
export const KATALOG_GROESSEN_STUFEN = ["titel", "h1", "h2", "h3", "text", "liste", "klein", "fein"] as const;
export type KatalogGroessenStufe = (typeof KATALOG_GROESSEN_STUFEN)[number];

/**
 * Schriftgrößen in pt für das A5-Heft; A4 multipliziert alle mit demselben Faktor (katalogGroessen).
 * titel: Name der Schau auf der Titelseite · h1: Seitentitel, Spartenköpfe, Grußwort-Titel, große Zahlen ·
 * h2: Untertitel der Titelseite, Buchstaben im Ausstellerverzeichnis, große Anzeigen · h3: Rasse, Zwischentitel,
 * Inhaltsverzeichnis, kleine Anzeigen · text: Fließtext, Farbenschlag, Stifter, Unterzeilen · liste: Tierzeilen,
 * Angaben, Verzeichnisse, Termine, Bestimmungen, Seitenzahl · klein: Fuß- und Kopfzeile, Versalzeilen, Klasse,
 * Preisrichter, Bildnachweis · fein: Spaltenköpfe und kleinste Vermerke.
 */
export const KATALOG_GROESSEN: Record<KatalogGroessenStufe, number> = {
  titel: 32,
  h1: 21,
  h2: 13,
  h3: 10.5,
  text: 9.5,
  liste: 8.2,
  klein: 7.2,
  fein: 6.2,
};

/** Die Größenstufen für ein Format (`faktor` 1 = A5-Heft). */
export function katalogGroessen(faktor: number): Record<KatalogGroessenStufe, number> {
  return Object.fromEntries(KATALOG_GROESSEN_STUFEN.map((s) => [s, KATALOG_GROESSEN[s] * faktor])) as Record<KatalogGroessenStufe, number>;
}

/** OpenType-Merkmal für Katalognummern, Noten und Preise: gleich breite Ziffern, damit Spalten fluchten. */
export const KATALOG_ZIFFERN = ["tnum"] as const;
