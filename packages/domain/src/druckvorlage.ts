/**
 * Druckvorlage der Bewertungskarte: welches Papier, wie viele Karten je Bogen, was auf der Karte steht und wo.
 * Reine Rechnung in Millimetern – der Server zeichnet danach (apps/server/src/pdf/bewertungskarte.ts).
 *
 * Zwei Arten zu drucken:
 * - „eigen“: SchauFUCHS druckt die ganze Karte. Bausteine lassen sich ein- und ausschalten und umstellen; ihre Höhe
 *   ergibt sich aus der Kartengröße, die Textfelder (Vorzüge, Wünsche, Mängel) bekommen den übrigen Platz.
 * - „vordruck“: Auf gekaufte Karten (Verbandsvordruck, Endloskarte) kommen nur die Daten, jedes Feld an eine frei
 *   einstellbare Stelle in Millimetern.
 * Entscheidung: docs/entscheidungen/011-druckvorlagen.md.
 */

export const MM_JE_ZOLL = 25.4;
/** Übliche Bogenlängen von Endlospapier: 12 Zoll und 6 Zoll (in mm, gerundet wie auf den Packungen). */
export const ENDLOS_12_ZOLL = 304.8;
export const ENDLOS_6_ZOLL = 152.4;

/** Papierformate in Millimetern (hochkant). */
export const PAPIER = { A4: { breite: 210, hoehe: 297 }, A5: { breite: 148, hoehe: 210 }, A6: { breite: 105, hoehe: 148 } } as const;

/** Wie die Karten auf dem Bogen liegen. Endlospapier: Bogen frei in mm, Karten in Spalten und Zeilen. */
export type KartenFormat =
  | { art: "a6-auf-a4" }
  | { art: "a5-auf-a4" }
  | { art: "a4" }
  | { art: "endlos"; bogenBreite: number; bogenLaenge: number; spalten: number; zeilen: number };

export const KARTEN_FORMAT_LABEL: Record<KartenFormat["art"], string> = {
  "a6-auf-a4": "DIN A6 – vier Karten je A4-Bogen",
  "a5-auf-a4": "DIN A5 – zwei Karten je A4-Bogen (quer)",
  a4: "DIN A4 – eine Karte je Seite",
  endlos: "Endlospapier oder eigenes Maß",
};

/** Feinabstimmung für den Drucker: Versatz der ganzen Seite und Längenkorrektur (Endlospapier rutscht über viele Bögen). */
export interface Druckeinstellung {
  /** mm nach rechts (negativ: links). */
  versatzX: number;
  /** mm nach unten (negativ: oben). */
  versatzY: number;
  /** Prozent, um die senkrechte Lage gestreckt (+) oder gestaucht (−) wird. */
  laengenKorrektur: number;
}

/** Eine Karte auf dem Bogen (mm, Ursprung oben links). */
export interface Nutzen {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/** Bogengröße und Lage aller Karten auf einem Bogen. */
export function bogen(format: KartenFormat): { breite: number; hoehe: number; nutzen: Nutzen[] } {
  const raster = (breite: number, hoehe: number, spalten: number, zeilen: number) => {
    const b = breite / spalten;
    const h = hoehe / zeilen;
    const nutzen: Nutzen[] = [];
    for (let z = 0; z < zeilen; z++) for (let s = 0; s < spalten; s++) nutzen.push({ x: s * b, y: z * h, breite: b, hoehe: h });
    return { breite, hoehe, nutzen };
  };
  switch (format.art) {
    case "a6-auf-a4":
      return raster(PAPIER.A4.breite, PAPIER.A4.hoehe, 2, 2);
    case "a5-auf-a4":
      // A4 quer: zwei A5-Karten hochkant nebeneinander.
      return raster(PAPIER.A4.hoehe, PAPIER.A4.breite, 2, 1);
    case "a4":
      return raster(PAPIER.A4.breite, PAPIER.A4.hoehe, 1, 1);
    case "endlos":
      return raster(format.bogenBreite, format.bogenLaenge, format.spalten, format.zeilen);
  }
}

/** Wendet Versatz und Längenkorrektur auf eine Stelle an (mm auf dem Bogen). */
export function korrigiert(x: number, y: number, d: Druckeinstellung): { x: number; y: number } {
  return { x: x + d.versatzX, y: y * (1 + d.laengenKorrektur / 100) + d.versatzY };
}

// ── Bausteine der eigenen Karte ───────────────────────────────────────────

export const KARTEN_BAUSTEINE = ["kopf", "tier", "klasse", "ringnummer", "texte", "ankreuzfeld", "note", "unterschriften", "legende", "fusstext"] as const;
export type KartenBaustein = (typeof KARTEN_BAUSTEINE)[number];

export const KARTEN_BAUSTEIN_LABEL: Record<KartenBaustein, string> = {
  kopf: "Kopf mit Schau und Katalognummer",
  tier: "Rasse und Farbenschlag",
  klasse: "Geschlecht, Alter, Käfig",
  ringnummer: "Ringnummer",
  texte: "Vorzüge, Wünsche, Mängel",
  ankreuzfeld: "Ankreuzfeld „Ausschließende Mängel“",
  note: "Note, Punkte, Preis",
  unterschriften: "Unterschriften Preisrichter und Obmann",
  legende: "Notenlegende",
  fusstext: "Eigener Text unten",
};

/** Höhe der festen Bausteine in mm auf einer A6-Karte (105 mm breit) bei 100 %; „texte“ füllt den Rest. */
const BAUSTEIN_HOEHE: Record<Exclude<KartenBaustein, "texte">, number> = {
  kopf: 16,
  tier: 6,
  klasse: 5,
  ringnummer: 5,
  ankreuzfeld: 4.5,
  note: 14.5,
  unterschriften: 12,
  legende: 4,
  fusstext: 4,
};
/** Mindesthöhe der drei Textfelder zusammen (A6, 100 %). */
const TEXTE_MIN = 33;
/** Rand der Karte rundum (A6, 100 %). */
export const KARTEN_RAND = 6;
const A6_BREITE = PAPIER.A6.breite;

/** Feld auf einem Vordruck: Lage in mm ab der oberen linken Ecke der Karte, Schriftgröße in pt. */
export interface VordruckFeld {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  groesse: number;
}

export const VORDRUCK_FELDER = ["katalognummer", "rasse", "klasse", "kaefig", "ringnummer", "vorzuege", "wuensche", "maengel", "note", "punkte", "preis", "preisrichter", "schau"] as const;
export type VordruckFeldId = (typeof VORDRUCK_FELDER)[number];

export const VORDRUCK_FELD_LABEL: Record<VordruckFeldId, string> = {
  katalognummer: "Katalognummer",
  rasse: "Rasse und Farbenschlag",
  klasse: "Geschlecht und Alter",
  kaefig: "Käfig",
  ringnummer: "Ringnummer",
  vorzuege: "Vorzüge",
  wuensche: "Wünsche",
  maengel: "Mängel",
  note: "Note",
  punkte: "Punkte",
  preis: "Preis",
  preisrichter: "Preisrichter",
  schau: "Schau und Datum",
};

export interface KartenVorlage {
  format: KartenFormat;
  druck: Druckeinstellung;
  modus: "eigen" | "vordruck";
  /** Reihenfolge von oben nach unten; ausgeschaltete stehen mit an: false in der Liste. */
  bausteine: { id: KartenBaustein; an: boolean }[];
  /** Schriften und feste Höhen in Prozent (70–150). */
  groesse: number;
  /** false: nur Schwarz (Nadeldrucker, Durchschlag). */
  farbig: boolean;
  schnittlinien: boolean;
  fusstext: string;
  felder: Record<VordruckFeldId, VordruckFeld>;
}

/** Die Karte, wie SchauFUCHS sie bisher gedruckt hat: A6, vier je A4, alle Bausteine außer dem eigenen Text. */
export const KARTEN_VORGABE: KartenVorlage = {
  format: { art: "a6-auf-a4" },
  druck: { versatzX: 0, versatzY: 0, laengenKorrektur: 0 },
  modus: "eigen",
  bausteine: KARTEN_BAUSTEINE.map((id) => ({ id, an: id !== "fusstext" })),
  groesse: 100,
  farbig: true,
  schnittlinien: true,
  fusstext: "",
  felder: vordruckFelderAusLayout(),
};

/** Maßstab der Karte gegenüber A6 bei 100 % (A5 ≈ 1,41, A4 = 2). */
export function kartenMassstab(kartenBreite: number, groesse: number): number {
  return (kartenBreite / A6_BREITE) * (groesse / 100);
}

/** Lage der eingeschalteten Bausteine auf einer Karte (mm ab Kartenoberkante, innerhalb des Rands). */
export function kartenLayout(v: Pick<KartenVorlage, "bausteine" | "groesse">, karte: { breite: number; hoehe: number }): { id: KartenBaustein; y: number; hoehe: number }[] {
  const m = kartenMassstab(karte.breite, v.groesse);
  const rand = KARTEN_RAND * (karte.breite / A6_BREITE);
  const an = v.bausteine.filter((b) => b.an).map((b) => b.id);
  const fest = an.filter((id): id is Exclude<KartenBaustein, "texte"> => id !== "texte").reduce((n, id) => n + BAUSTEIN_HOEHE[id] * m, 0);
  const verfuegbar = karte.hoehe - 2 * rand;
  // Die Textfelder bekommen den Rest, mindestens ihre Mindesthöhe; reicht es nicht, wird alles gleichmäßig gestaucht.
  const texte = an.includes("texte") ? Math.max(TEXTE_MIN * m, verfuegbar - fest) : 0;
  const stauchen = Math.min(1, verfuegbar / (fest + texte));
  let y = rand;
  return an.map((id) => {
    const hoehe = (id === "texte" ? texte : BAUSTEIN_HOEHE[id] * m) * stauchen;
    const teil = { id, y, hoehe };
    y += hoehe;
    return teil;
  });
}

/** Feldlagen für den Vordruck-Modus, abgeleitet aus der eigenen A6-Karte – Ausgangspunkt zum Verschieben. */
export function vordruckFelderAusLayout(): Record<VordruckFeldId, VordruckFeld> {
  const r = KARTEN_RAND;
  const b = A6_BREITE - 2 * r;
  const lage = Object.fromEntries(kartenLayout({ bausteine: KARTEN_BAUSTEINE.map((id) => ({ id, an: id !== "fusstext" })), groesse: 100 }, PAPIER.A6).map((t) => [t.id, t]));
  const y = (id: KartenBaustein) => lage[id]!.y;
  const drittel = lage.texte!.hoehe / 3;
  return {
    schau: { x: r, y: y("kopf"), breite: b - 27, hoehe: 8, groesse: 7 },
    katalognummer: { x: r + b - 25, y: y("kopf") + 3, breite: 25, hoehe: 10, groesse: 18 },
    rasse: { x: r, y: y("tier"), breite: b, hoehe: 6, groesse: 11 },
    klasse: { x: r, y: y("klasse"), breite: b / 2, hoehe: 5, groesse: 8.5 },
    kaefig: { x: r + b / 2, y: y("klasse"), breite: b / 2, hoehe: 5, groesse: 8.5 },
    ringnummer: { x: r + 13, y: y("ringnummer"), breite: b - 13, hoehe: 5, groesse: 8.5 },
    vorzuege: { x: r + 2, y: y("texte") + 4.6, breite: b - 4, hoehe: drittel - 6, groesse: 8 },
    wuensche: { x: r + 2, y: y("texte") + drittel + 4.6, breite: b - 4, hoehe: drittel - 6, groesse: 8 },
    maengel: { x: r + 2, y: y("texte") + 2 * drittel + 4.6, breite: b - 4, hoehe: drittel - 6, groesse: 8 },
    note: { x: r + 2, y: y("note") + 4, breite: b * 0.34 - 4, hoehe: 7, groesse: 13 },
    punkte: { x: r + b * 0.34 + 2, y: y("note") + 4, breite: b * 0.3 - 4, hoehe: 7, groesse: 13 },
    preis: { x: r + b * 0.64 + 2, y: y("note") + 4, breite: b * 0.36 - 4, hoehe: 7, groesse: 13 },
    preisrichter: { x: r, y: y("unterschriften") + 4, breite: b / 2, hoehe: 4, groesse: 7 },
  };
}

// ── Gespeicherte Vorlage einlesen ─────────────────────────────────────────

const zahl = (w: unknown, min: number, max: number, vorgabe: number) => (typeof w === "number" && Number.isFinite(w) ? Math.min(max, Math.max(min, w)) : vorgabe);
const objekt = (w: unknown) => (w && typeof w === "object" ? (w as Record<string, unknown>) : {});

/** Gespeicherten Wert (jsonb, ggf. alt oder unvollständig) in eine gültige Vorlage bringen; Unbekanntes gilt als Vorgabe. */
export function kartenVorlageLesen(roh: unknown): KartenVorlage {
  const r = objekt(roh);
  const f = objekt(r.format);
  const format: KartenFormat =
    f.art === "endlos"
      ? { art: "endlos", bogenBreite: zahl(f.bogenBreite, 50, 500, 240), bogenLaenge: zahl(f.bogenLaenge, 50, 600, ENDLOS_12_ZOLL), spalten: Math.round(zahl(f.spalten, 1, 4, 2)), zeilen: Math.round(zahl(f.zeilen, 1, 4, 2)) }
      : f.art === "a5-auf-a4" || f.art === "a4" || f.art === "a6-auf-a4"
        ? { art: f.art }
        : KARTEN_VORGABE.format;
  const d = objekt(r.druck);
  const gespeichert = Array.isArray(r.bausteine) ? r.bausteine.map(objekt) : [];
  // Jeder Baustein genau einmal: gespeicherte Reihenfolge, fehlende (neue) ausgeschaltet hinten an.
  const bausteine: KartenVorlage["bausteine"] = [];
  for (const b of gespeichert) if (KARTEN_BAUSTEINE.includes(b.id as KartenBaustein) && !bausteine.some((x) => x.id === b.id)) bausteine.push({ id: b.id as KartenBaustein, an: b.an !== false });
  for (const id of KARTEN_BAUSTEINE) if (!bausteine.some((x) => x.id === id)) bausteine.push({ id, an: gespeichert.length === 0 ? id !== "fusstext" : false });
  const felderRoh = objekt(r.felder);
  const felder = Object.fromEntries(
    VORDRUCK_FELDER.map((id) => {
      const v = objekt(felderRoh[id]);
      const vor = KARTEN_VORGABE.felder[id];
      return [id, { x: zahl(v.x, -50, 600, vor.x), y: zahl(v.y, -50, 600, vor.y), breite: zahl(v.breite, 1, 600, vor.breite), hoehe: zahl(v.hoehe, 1, 600, vor.hoehe), groesse: zahl(v.groesse, 4, 40, vor.groesse) }];
    }),
  ) as Record<VordruckFeldId, VordruckFeld>;
  return {
    format,
    druck: { versatzX: zahl(d.versatzX, -30, 30, 0), versatzY: zahl(d.versatzY, -30, 30, 0), laengenKorrektur: zahl(d.laengenKorrektur, -5, 5, 0) },
    modus: r.modus === "vordruck" ? "vordruck" : "eigen",
    bausteine,
    groesse: zahl(r.groesse, 70, 150, 100),
    farbig: r.farbig !== false,
    schnittlinien: r.schnittlinien !== false,
    fusstext: typeof r.fusstext === "string" ? r.fusstext.slice(0, 300) : "",
    felder,
  };
}
