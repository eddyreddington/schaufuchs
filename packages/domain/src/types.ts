/** Fachliche Grundbegriffe einer Rassegeflügelschau. Geldbeträge immer in Cent. */

export const PHASEN = [
  "vorbereitung",
  "meldung",
  "katalog",
  "einlieferung",
  "bewertung",
  "preise",
  "schau",
  "abrechnung",
  "abgeschlossen",
] as const;
export type Phase = (typeof PHASEN)[number];

export const PHASEN_LABEL: Record<Phase, string> = {
  vorbereitung: "Vorbereitung",
  meldung: "Meldephase",
  katalog: "Halle & Katalog",
  einlieferung: "Einlieferung",
  bewertung: "Bewertung",
  preise: "Preise & Freigabe",
  schau: "Schau & Verkauf",
  abrechnung: "Aussetzen & Abrechnung",
  abgeschlossen: "Abgeschlossen",
};

export const MELDEARTEN = ["einzeltier", "stamm", "voliere", "bruteier"] as const;
export type Meldeart = (typeof MELDEARTEN)[number];

export const MELDEART_LABEL: Record<Meldeart, string> = {
  einzeltier: "Einzeltier",
  stamm: "Stamm",
  voliere: "Voliere",
  bruteier: "Bruteier (Satz)",
};

export const GEBUEHR_ARTEN = [...MELDEARTEN, "katalog", "kostenanteil"] as const;
export type GebuehrArt = (typeof GEBUEHR_ARTEN)[number];

export const GEBUEHR_LABEL: Record<GebuehrArt, string> = {
  ...MELDEART_LABEL,
  katalog: "Katalog",
  kostenanteil: "Kostenanteil je Aussteller",
};

export const ALTER = ["jung", "alt"] as const;
export type Alter = (typeof ALTER)[number];

export const EINGANG = ["online", "papier", "email"] as const;
export type Eingang = (typeof EINGANG)[number];

export const MELDUNG_STATUS = ["offen", "bestaetigt", "abgelehnt", "storniert"] as const;
export type MeldungStatus = (typeof MELDUNG_STATUS)[number];

export const EINTRAG_STATUS = ["gemeldet", "katalogisiert", "eingeliefert", "fehlt", "ausgesetzt"] as const;
export type EintragStatus = (typeof EINTRAG_STATUS)[number];

/**
 * Noten außerhalb der Punkteskala (BDRG):
 * u = ungenügend (0 Punkte), o.B. = ohne Bewertungsnote, u.M. = unnatürliche Merkmale, n.a. = nicht anerkannt.
 */
export const SONDERNOTEN = ["u", "oB", "uM", "nA"] as const;
export type Sondernote = (typeof SONDERNOTEN)[number];

export const PREIS_QUELLEN = ["standgeld", "stiftung"] as const;
/** Für wen eine Preisart gilt: alle Tiere, nur Jugendmeldungen oder nur Senioren (keine Jugend). */
export const PREIS_ZIELGRUPPEN = ["alle", "jugend", "senioren"] as const;
export type PreisZielgruppe = (typeof PREIS_ZIELGRUPPEN)[number];
export const PREIS_ZIELGRUPPE_LABEL: Record<PreisZielgruppe, string> = { alle: "alle Tiere", jugend: "nur Jugend", senioren: "nur Senioren" };

/** „Auf 10 Tiere 1 E“: nur volle Zehner zählen oder auch angefangene. */
export const RUNDUNGEN = ["voll", "angefangen"] as const;
export type Rundung = (typeof RUNDUNGEN)[number];

/** Worauf sich das Preiskontingent bezieht: die Tiere jedes Preisrichters oder alle Tiere der Schau. */
export const KONTINGENT_BASEN = ["preisrichter", "schau"] as const;
export type KontingentBasis = (typeof KONTINGENT_BASEN)[number];
export type PreisQuelle = (typeof PREIS_QUELLEN)[number];
