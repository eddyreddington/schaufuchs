/**
 * Schriften für den gedruckten Katalog: je ein Paar aus Titelschrift (Überschriften, Rassen, Farbenschläge) und
 * Textschrift (Listen, Tabellen, Zahlen). Alle unter der SIL Open Font License (apps/server/fonts).
 */
export const KATALOG_SCHRIFTEN = ["klassisch", "traditionell", "lesbar", "modern", "buchschmal", "ausgewogen"] as const;
export type KatalogSchrift = (typeof KATALOG_SCHRIFTEN)[number];

export const KATALOG_SCHRIFT_INFO: Record<KatalogSchrift, { name: string; beschreibung: string }> = {
  klassisch: { name: "Klassisch", beschreibung: "Spectral für Überschriften, IBM Plex Sans Condensed für Listen – schmal, viel passt auf eine Seite." },
  traditionell: { name: "Traditionell", beschreibung: "EB Garamond für Überschriften, Source Sans 3 für Listen – wie ein gedrucktes Buch." },
  lesbar: { name: "Gut lesbar", beschreibung: "Atkinson Hyperlegible durchgehend – für beste Lesbarkeit entworfen, etwas breiter." },
  modern: { name: "Modern", beschreibung: "Source Sans 3 durchgehend – klar und sachlich." },
  buchschmal: { name: "Buch, schmal", beschreibung: "EB Garamond für Überschriften, IBM Plex Sans Condensed für Listen – klassisch und platzsparend." },
  ausgewogen: { name: "Ausgewogen", beschreibung: "Spectral für Überschriften, Source Sans 3 für Listen – ruhig und gut lesbar." },
};

/** Gestaltung von Titelseite, Seiten- und Spartenköpfen des Katalogs (der Tierteil ist bei allen gleich). */
export const KATALOG_STILE = ["klassisch", "rahmen", "modern", "schlicht"] as const;
export type KatalogStil = (typeof KATALOG_STILE)[number];

export const KATALOG_STIL_INFO: Record<KatalogStil, { name: string; beschreibung: string }> = {
  klassisch: { name: "Klassisch", beschreibung: "Mittig gesetzt, Farbband oben und Farbfeld mit Ort und Öffnungszeiten unten." },
  rahmen: { name: "Mit Zierrahmen", beschreibung: "Doppelter Rahmen in der Vereinsfarbe, alles mittig – wie ein traditionelles Programmheft." },
  modern: { name: "Modern", beschreibung: "Große Schrift linksbündig, Farbblock auf der Titelseite, Spartenköpfe als Farbband mit dem Stich daneben." },
  schlicht: { name: "Schlicht", beschreibung: "Ohne Farbflächen, nur feine Linien in der Vereinsfarbe – spart Farbe beim Druck am Bürodrucker." },
};

/** Hintergrund der Titelseite. */
export const KATALOG_TITELHINTERGRUENDE = ["weiss", "getoent", "papier"] as const;
export type KatalogTitelhintergrund = (typeof KATALOG_TITELHINTERGRUENDE)[number];
export const KATALOG_TITELHINTERGRUND_INFO: Record<KatalogTitelhintergrund, string> = { weiss: "Weiß", getoent: "Zart in der Vereinsfarbe", papier: "Papierton" };
/** Papierton der Titelseite (warmes Creme). */
export const KATALOG_PAPIERTON = "#f6f0e1";

/** Titelfoto: in die Bildfläche eingepasst oder randlos bis an die Kanten (der Stich bleibt immer eingepasst). */
export const KATALOG_TITELBILDER = ["eingepasst", "randlos"] as const;
export type KatalogTitelbild = (typeof KATALOG_TITELBILDER)[number];
export const KATALOG_TITELBILD_INFO: Record<KatalogTitelbild, string> = { eingepasst: "Eingepasst", randlos: "Randlos" };

/** Fußzeile: Linie mit Seitenzahl außen und Schauname (bisher), Seitenzahl mittig, Seitenzahl im Farbfeld. */
export const KATALOG_FUSSZEILEN = ["linie", "mittig", "marke"] as const;
export type KatalogFusszeile = (typeof KATALOG_FUSSZEILEN)[number];
export const KATALOG_FUSSZEILE_INFO: Record<KatalogFusszeile, string> = { linie: "Linie und Schauname", mittig: "Seitenzahl mittig", marke: "Seitenzahl im Farbfeld" };

/** Stärke der Schmucklinien (Zierlinien, Balken, Rahmen). */
export const KATALOG_LINIEN = ["fein", "normal", "kraeftig"] as const;
export type KatalogLinien = (typeof KATALOG_LINIEN)[number];
export const KATALOG_LINIEN_INFO: Record<KatalogLinien, { name: string; faktor: number }> = {
  fein: { name: "Fein", faktor: 0.6 },
  normal: { name: "Normal", faktor: 1 },
  kraeftig: { name: "Kräftig", faktor: 1.7 },
};

/** Vorgaben der Gestaltung – so sah jeder Katalog vor diesen Einstellungen aus. `akzent` leer: wie die Vereinsfarbe. */
export const KATALOG_GESTALTUNG_VORGABE = { akzent: "", titelHintergrund: "weiss", titelbild: "eingepasst", fusszeile: "linie", linien: "normal" } as const;

/**
 * Vereinsfarben nach Farbfamilien, alle dunkel genug für Linien und Flächen im Druck. Eigene Farben bleiben möglich;
 * zu helle druckt der Katalog für Schrift dunkler (siehe kontrastZuWeiss).
 */
export const KATALOG_FARBFAMILIEN: { name: string; farben: [string, string][] }[] = [
  { name: "Grün", farben: [["#1e4d2b", "Dunkelgrün"], ["#2f5d3a", "Tannengrün"], ["#3f7d3a", "Grasgrün"], ["#4a5d23", "Moosgrün"], ["#6b8e23", "Olivgrün"], ["#5b8c5a", "Salbei"], ["#7a9a3a", "Lindgrün"]] },
  { name: "Blau", farben: [["#14284b", "Nachtblau"], ["#1f3a5f", "Marineblau"], ["#1d4e89", "Königsblau"], ["#3b5b78", "Stahlblau"], ["#2e6fa7", "Himmelblau"], ["#4a6f8a", "Taubenblau"], ["#1d5c63", "Petrol"]] },
  { name: "Rot", farben: [["#5c1a1b", "Weinrot"], ["#7a2e2e", "Bordeaux"], ["#9b1b30", "Karminrot"], ["#a52a2a", "Rotbraun"], ["#b5532c", "Ziegelrot"], ["#c0392b", "Signalrot"], ["#b03a5b", "Beere"]] },
  { name: "Gelb und Braun", farben: [["#5a3a22", "Kastanie"], ["#6b4a1e", "Nussbraun"], ["#8a6d1d", "Ocker"], ["#b8860b", "Gold"], ["#c77c11", "Bernstein"], ["#d4a017", "Senfgelb"], ["#d35400", "Orange"]] },
  { name: "Violett und Türkis", farben: [["#4b2e5c", "Aubergine"], ["#5e2750", "Pflaume"], ["#6c3483", "Violett"], ["#7d3c98", "Lila"], ["#0f5e7a", "Ozean"], ["#0e6655", "Smaragd"], ["#138d75", "Türkis"]] },
  { name: "Neutral", farben: [["#1d1d1b", "Schwarz"], ["#33383d", "Anthrazit"], ["#4a4a48", "Graphit"], ["#5d6d7e", "Schiefergrau"], ["#7f6a55", "Taupe"], ["#8a8378", "Warmgrau"], ["#8c7b6b", "Sandgrau"]] },
];

/** Abgestimmte Paare aus Vereinsfarbe (Flächen) und Akzentfarbe (Linien, kleine Überschriften, Seitenzahlen). */
export const KATALOG_PALETTEN: { name: string; haupt: string; akzent: string }[] = [
  { name: "Tanne und Gold", haupt: "#2f5d3a", akzent: "#b8860b" },
  { name: "Wald und Rost", haupt: "#1e4d2b", akzent: "#b5532c" },
  { name: "Marine und Rot", haupt: "#1f3a5f", akzent: "#c0392b" },
  { name: "Königsblau und Ocker", haupt: "#1d4e89", akzent: "#8a6d1d" },
  { name: "Petrol und Bernstein", haupt: "#1d5c63", akzent: "#c77c11" },
  { name: "Bordeaux und Gold", haupt: "#7a2e2e", akzent: "#b8860b" },
  { name: "Weinrot und Salbei", haupt: "#5c1a1b", akzent: "#5b8c5a" },
  { name: "Aubergine und Senf", haupt: "#4b2e5c", akzent: "#d4a017" },
  { name: "Nussbraun und Himmelblau", haupt: "#6b4a1e", akzent: "#2e6fa7" },
  { name: "Anthrazit und Signalrot", haupt: "#33383d", akzent: "#c0392b" },
  { name: "Anthrazit und Grün", haupt: "#33383d", akzent: "#3f7d3a" },
  { name: "Schwarz und Gold", haupt: "#1d1d1b", akzent: "#b8860b" },
];

/** Kontrast einer Farbe #RRGGBB zu weißem Papier nach WCAG (1 bis 21). Ab 4,5 ist kleine Schrift gut lesbar. */
export function kontrastZuWeiss(hex: string): number {
  const k = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 1.05 / (0.2126 * k(1) + 0.7152 * k(3) + 0.0722 * k(5) + 0.05);
}

/** Aufteilung des Tierteils: Tabelle über die ganze Breite, zwei oder drei Spalten (drei nur auf A4). */
export const KATALOG_AUFTEILUNGEN = ["zweispaltig", "tabelle", "dreispaltig"] as const;
export type KatalogAufteilung = (typeof KATALOG_AUFTEILUNGEN)[number];

export const KATALOG_AUFTEILUNG_INFO: Record<KatalogAufteilung, { name: string; beschreibung: string }> = {
  zweispaltig: { name: "Zweispaltig", beschreibung: "Zwei Spalten wie in den Verbandskatalogen: Klasse und Farbenschlag als Zwischenzeile, darunter die Tiere." },
  tabelle: { name: "Tabelle", beschreibung: "Eine Zeile je Tier über die ganze Breite: Nr., Klasse, Farbenschlag, Aussteller, Note, Preis, Verkaufspreis. Übersichtlich, braucht mehr Seiten." },
  dreispaltig: { name: "Dreispaltig", beschreibung: "Drei schmale Spalten mit etwas kleinerer Schrift – die wenigsten Seiten. Nur bei A4, bei A5 wird zweispaltig gedruckt." },
};

/** Teile des Katalogs, die sich ausblenden lassen (Titel, Inhalt, Termine und Tierteil stehen immer darin). */
export const KATALOG_TEILE = ["preisrichter", "preise", "bestimmungen", "legende", "ehrentafel", "rassenverzeichnis", "ausstellerverzeichnis", "kommendeSchauen", "notizen"] as const;
export type KatalogTeil = (typeof KATALOG_TEILE)[number];

export const KATALOG_TEIL_INFO: Record<KatalogTeil, string> = {
  preisrichter: "Preisrichter",
  preise: "Preise und Stifter",
  bestimmungen: "Ausstellungsbestimmungen",
  legende: "So lesen Sie den Katalog",
  ehrentafel: "Ehrentafel",
  rassenverzeichnis: "Rassenverzeichnis",
  ausstellerverzeichnis: "Ausstellerverzeichnis",
  kommendeSchauen: "Kommende Schauen",
  notizen: "Notizseiten",
};

/**
 * Aufbau des Katalogs in Druckreihenfolge (fest, wie in den Verbandskatalogen). `teil`: lässt sich abwählen;
 * `beitraege`: Grußworte, freie Seiten oder Anzeigen, deren Reihenfolge der Verein bestimmt.
 */
export const KATALOG_GLIEDERUNG = [
  { schluessel: "titel", name: "Titelseite" },
  { schluessel: "inhalt", name: "Inhalt und Impressum" },
  { schluessel: "grussworte", name: "Grußworte", beitraege: "grusswort" },
  { schluessel: "leitung", name: "Ausstellungsleitung und Termine" },
  { schluessel: "preisrichter", name: "Preisrichter", teil: "preisrichter" },
  { schluessel: "preise", name: "Preise und Stifter", teil: "preise" },
  { schluessel: "bestimmungen", name: "Ausstellungsbestimmungen", teil: "bestimmungen" },
  { schluessel: "seiten", name: "Freie Seiten", beitraege: "seite" },
  { schluessel: "legende", name: "So lesen Sie den Katalog", teil: "legende" },
  { schluessel: "ehrentafel", name: "Ehrentafel", teil: "ehrentafel" },
  { schluessel: "tierteil", name: "Tierteil" },
  { schluessel: "rassenverzeichnis", name: "Rassenverzeichnis", teil: "rassenverzeichnis" },
  { schluessel: "bildnachweis", name: "Bildnachweis" },
  { schluessel: "ausstellerverzeichnis", name: "Ausstellerverzeichnis", teil: "ausstellerverzeichnis" },
  { schluessel: "kommendeSchauen", name: "Kommende Schauen", teil: "kommendeSchauen" },
  { schluessel: "anzeigen", name: "Unsere Förderer (Anzeigen)", beitraege: "anzeige" },
  { schluessel: "notizen", name: "Notizseiten", teil: "notizen" },
] as const satisfies readonly { schluessel: string; name: string; teil?: KatalogTeil; beitraege?: "grusswort" | "seite" | "anzeige" }[];
export type KatalogGliederungsTeil = (typeof KATALOG_GLIEDERUNG)[number]["schluessel"];
/** Seiten eines Teils im erzeugten Katalog (1-basiert, `bis` einschließlich). */
export type KatalogSeitenbereich = { schluessel: KatalogGliederungsTeil; von: number; bis: number };

/**
 * Seitenbereiche aus den Anfangsseiten der Teile: ein Teil reicht bis vor den nächsten, außer der nächste beginnt auf
 * derselben Seite weiter unten (`mitten`, z. B. der Bildnachweis unter dem Rassenverzeichnis).
 */
export function seitenbereiche(marken: { schluessel: KatalogGliederungsTeil; seite: number; mitten?: boolean }[], seitenzahl: number): KatalogSeitenbereich[] {
  const sortiert = [...marken].sort((a, b) => a.seite - b.seite);
  return sortiert.map((x, i) => {
    const naechste = sortiert[i + 1];
    const bis = naechste ? (naechste.mitten ? naechste.seite : naechste.seite - 1) : seitenzahl;
    return { schluessel: x.schluessel, von: x.seite, bis: Math.max(x.seite, bis) };
  });
}
