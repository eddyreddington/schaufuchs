/**
 * Formatvorgaben der Drucke je Schau (Entscheidung 029): welche Drucksachen es gibt, auf welchem Papier sie kommen,
 * welche sich umstellen lassen und wie die Seite dann aussieht. Reine Rechnung in Millimetern – die PDF-Erzeuger in
 * apps/server/src/pdf zeichnen danach. Katalog (Katalog-Gestaltung) und Bewertungskarten (Druckvorlage, 011) haben
 * ihre Einstellung schon an anderer Stelle; sie bleibt dort die einzige Quelle.
 */

/** Papierformate in Millimetern (hochkant). */
export const PAPIER_MM = {
  A3: { breite: 297, hoehe: 420 },
  A4: { breite: 210, hoehe: 297 },
  A5: { breite: 148, hoehe: 210 },
  A6: { breite: 105, hoehe: 148 },
} as const;
export type Papier = keyof typeof PAPIER_MM;

/** Seitengröße in mm. */
export interface Blatt {
  breite: number;
  hoehe: number;
}

/** Ein Papierformat hochkant oder quer. */
export function blatt(papier: Papier, quer = false): Blatt {
  const p = PAPIER_MM[papier];
  return quer ? { breite: p.hoehe, hoehe: p.breite } : { breite: p.breite, hoehe: p.hoehe };
}

/**
 * Formate, die sich je Schau wählen lassen; das erste ist die Vorgabe (so druckte SchauFUCHS bisher).
 * - bewertungsliste: A4 mit zwei Listen nebeneinander oder A5 mit einer Liste je Seite (Klemmbrett).
 * - hallenplan: ein Blatt A4 oder A3 (zum Aushängen), quer oder hoch nach der Zeichnung.
 * - kaufbeleg: A5 quer, oder derselbe Beleg oben auf A4 mit Schnittlinie (Drucker ohne A5-Fach).
 * - kassenbeleg: Einzahlungsquittung, Eigenbeleg und Spendenquittung, wie der Kaufbeleg.
 */
export const DRUCK_FORMAT_WAHL = {
  bewertungsliste: ["A4", "A5"],
  hallenplan: ["A4", "A3"],
  kaufbeleg: ["A5", "A4"],
  kassenbeleg: ["A5", "A4"],
} as const satisfies Record<string, readonly Papier[]>;
export type DruckFormatArt = keyof typeof DRUCK_FORMAT_WAHL;
export const DRUCK_FORMAT_ARTEN = Object.keys(DRUCK_FORMAT_WAHL) as DruckFormatArt[];
export type DruckFormate = { [K in DruckFormatArt]: (typeof DRUCK_FORMAT_WAHL)[K][number] };
export type BelegFormat = DruckFormate["kaufbeleg"];

export const DRUCK_FORMATE_VORGABE: DruckFormate = { bewertungsliste: "A4", hallenplan: "A4", kaufbeleg: "A5", kassenbeleg: "A5" };

/** Gespeicherten Wert begrenzen: Unbekanntes fällt weg, ein ungültiger Wert gilt als Vorgabe – je Drucksache für sich. */
export function druckFormateLesen(roh: unknown): DruckFormate {
  const o = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const aus = { ...DRUCK_FORMATE_VORGABE } as Record<DruckFormatArt, string>;
  for (const art of DRUCK_FORMAT_ARTEN) {
    const v = Object.hasOwn(o, art) ? o[art] : undefined;
    if (typeof v === "string" && (DRUCK_FORMAT_WAHL[art] as readonly string[]).includes(v)) aus[art] = v;
  }
  return aus as DruckFormate;
}

/** Was von der Vorgabe abweicht (leer = alles wie bisher) – für Protokoll und Anzeige. */
export function druckFormateAbweichung(f: DruckFormate): Partial<DruckFormate> {
  return Object.fromEntries(DRUCK_FORMAT_ARTEN.filter((a) => f[a] !== DRUCK_FORMATE_VORGABE[a]).map((a) => [a, f[a]])) as Partial<DruckFormate>;
}

/** Beleg (Kaufbeleg, Kassenbeleg, Spendenquittung): der Beleg ist immer A5 quer, das Papier A5 quer oder A4 hoch. */
export interface BelegBlatt {
  seite: Blatt;
  /** Fläche des Belegs oben links – gleich groß auf beiden Papieren, damit nichts anders umbricht. */
  beleg: Blatt;
  /** Schnittlinie in mm von oben (A4), sonst null. */
  schnittBei: number | null;
}
export function belegBlatt(format: BelegFormat): BelegBlatt {
  const beleg = blatt("A5", true);
  return format === "A4" ? { seite: blatt("A4"), beleg, schnittBei: beleg.hoehe } : { seite: beleg, beleg, schnittBei: null };
}

/** Spalten einer Bewertungsliste in mm: Nummer, Klasse, dann Note, Punkte und Preis zum Eintragen. */
export interface ListenSpalten {
  nr: number;
  klasse: number;
  note: number;
  pkt: number;
  preis: number;
}

/**
 * Bewertungsliste: Seite, wie viele Listen nebeneinander, Ränder (schmal, gelocht wird links), Lücke zwischen den
 * Listen und die Spaltenbreiten in mm. Die Klasse bekommt den Rest – in jedem Format mindestens 15 mm (Test).
 */
export function bewertungslisteBlatt(format: DruckFormate["bewertungsliste"]): {
  seite: Blatt;
  listenJeSeite: 1 | 2;
  raender: { oben: number; unten: number; links: number; rechts: number };
  luecke: number;
  spalten: ListenSpalten;
  /** Kopf: Platz für die Angaben rechts (Bewertung, Obmann, Nummern, Tiere) in mm und Schriftgröße des Namens in pt. */
  kopfAngaben: number;
  kopfTitel: number;
} {
  const seite = format === "A5" ? blatt("A5") : blatt("A4");
  const listenJeSeite = format === "A5" ? 1 : 2;
  const raender = { oben: 14, unten: 18, links: 15, rechts: 15 };
  const luecke = 6;
  const liste = (seite.breite - raender.links - raender.rechts - (listenJeSeite - 1) * luecke) / listenJeSeite;
  const fest = { nr: 14, note: 16, pkt: 13, preis: 17 };
  // Kopf: auf A5 schmalere Angaben, damit der Name des Preisrichters nicht in viele Zeilen zerfällt.
  const a5 = format === "A5";
  return { seite, listenJeSeite, raender, luecke, spalten: { ...fest, klasse: liste - fest.nr - fest.note - fest.pkt - fest.preis }, kopfAngaben: a5 ? 50 : 62, kopfTitel: a5 ? 16 : 20 };
}

/** Hallenplan: ein Blatt, quer, wenn die Zeichnung breiter als hoch ist. */
export function hallenplanBlatt(format: DruckFormate["hallenplan"], quer: boolean): Blatt {
  return blatt(format, quer);
}

// ── Übersicht aller Drucksachen ───────────────────────────────────────────

/** Wo das Format einer Drucksache eingestellt wird. */
export type DruckEinstellung =
  /** Formatvorgabe der Schau (DRUCK_FORMAT_WAHL), im Reiter „Druck“. */
  | "format"
  /** Katalog-Gestaltung (A5 oder A4). */
  | "katalog"
  /** Druckvorlage der Bewertungskarten (011). */
  | "druckvorlage"
  /** Fest A4 nach DIN 5008; Briefkopf und Texte aus der Briefvorlage (012). */
  | "briefvorlage"
  /** Fest. */
  | "fest";

export interface Drucksache {
  id: DrucksacheId;
  einstellung: DruckEinstellung;
  /** Seite, wenn sie sich nicht wählen lässt (Briefe: A4 hoch nach DIN 5008). */
  fest?: { papier: Papier; lage: "hoch" | "quer"; norm?: "din5008" | "amtlich" };
}

export type DrucksacheId =
  | "katalog"
  | "bewertungskarten"
  | "bewertungsliste"
  | "preisverteilung"
  | "verpflichtung"
  | "aBogen"
  | "bBogen"
  | "abrechnung"
  | "abrechnungListe"
  | "kaufbeleg"
  | "kassenbeleg"
  | "kassenbericht"
  | "zuwendung"
  | "serienbrief"
  | "hallenplan"
  | "aufbauliste"
  | "meisterschaften"
  | "amtslisten";

/** Alle Drucksachen einer Schau in der Folge des Ablaufs (Meldung → Bewertung → Kasse → Halle). */
export const DRUCKSACHEN: readonly Drucksache[] = [
  { id: "aBogen", einstellung: "fest", fest: { papier: "A4", lage: "hoch" } },
  { id: "bBogen", einstellung: "briefvorlage", fest: { papier: "A4", lage: "hoch", norm: "din5008" } },
  { id: "katalog", einstellung: "katalog" },
  { id: "bewertungskarten", einstellung: "druckvorlage" },
  { id: "bewertungsliste", einstellung: "format" },
  { id: "verpflichtung", einstellung: "briefvorlage", fest: { papier: "A4", lage: "hoch", norm: "din5008" } },
  { id: "preisverteilung", einstellung: "fest", fest: { papier: "A4", lage: "hoch" } },
  { id: "meisterschaften", einstellung: "fest", fest: { papier: "A4", lage: "hoch" } },
  { id: "kaufbeleg", einstellung: "format" },
  { id: "kassenbeleg", einstellung: "format" },
  { id: "kassenbericht", einstellung: "fest", fest: { papier: "A4", lage: "hoch" } },
  { id: "abrechnung", einstellung: "briefvorlage", fest: { papier: "A4", lage: "hoch", norm: "din5008" } },
  { id: "abrechnungListe", einstellung: "fest", fest: { papier: "A4", lage: "quer" } },
  { id: "zuwendung", einstellung: "fest", fest: { papier: "A4", lage: "hoch", norm: "amtlich" } },
  { id: "serienbrief", einstellung: "briefvorlage", fest: { papier: "A4", lage: "hoch", norm: "din5008" } },
  { id: "amtslisten", einstellung: "fest", fest: { papier: "A4", lage: "quer" } },
  { id: "hallenplan", einstellung: "format" },
  { id: "aufbauliste", einstellung: "fest", fest: { papier: "A4", lage: "hoch" } },
];
