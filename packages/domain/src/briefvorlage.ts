/**
 * Briefvorlage des Vereins: wie Briefe aussehen (DIN 5008 für Fensterumschläge, Briefkopf, Fußzeile) und welche Texte
 * in ihnen stehen. Texte dürfen Platzhalter wie {Vorname} oder {Schau} enthalten; fuelle() setzt sie ein.
 * Genutzt für die Meldebestätigung (B-Bogen), Serienbriefe an Aussteller oder Mitglieder, die Preisrichterverpflichtung
 * und – Kopf und Fußzeile – für Abrechnung und Quittungen. Gezeichnet wird in apps/server/src/pdf/brief.ts. Entscheidung 011/012.
 */

/** Platzhalter, die in Brieftexten erlaubt sind, mit Erklärung für die Oberfläche. */
export const BRIEF_PLATZHALTER = {
  Anrede: "„Guten Tag Vorname Nachname“",
  Vorname: "Vorname des Empfängers",
  Nachname: "Nachname des Empfängers",
  Name: "Vor- und Nachname",
  Verein: "Name des eigenen Vereins",
  Schau: "Name der Schau",
  Ort: "Ort der Schau",
  Meldeschluss: "Meldeschluss der Schau",
  Einlieferung: "Einlieferung der Schau",
  Bewertungstag: "Bewertungstag der Schau",
  Rückmeldung: "Rückmeldung der Preisrichter bis",
  Datum: "heutiges Datum",
} as const;
export type BriefPlatzhalter = keyof typeof BRIEF_PLATZHALTER;

export interface BriefVorlage {
  /** DIN 5008: Form A (Anschriftfeld 27 mm von oben, kleiner Briefkopf) oder Form B (45 mm, großer Briefkopf). */
  form: "A" | "B";
  /** Briefkopf: Logo zeigen, eigene Zeilen (leer: Vereinsname und Schau). */
  logo: boolean;
  kopf: string;
  /** Rücksendeangabe über der Anschrift (leer: Vereinsname). */
  absender: string;
  /** Fußzeile in drei Spalten, z. B. Anschrift | Bank | Vorstand (alle leer: Verein und Kontakt in einer Zeile). */
  fuss: [string, string, string];
  farbig: boolean;
  falzmarken: boolean;
  meldebestaetigung: { einleitung: string; hinweise: string; gruss: string };
  serienbrief: { betreff: string; text: string; gruss: string };
  /** Preisrichterverpflichtung; leer = fester Text (verpflichtungBrief in preisrichter-druck.ts), Gruß wie im Serienbrief. */
  verpflichtung: { betreff: string; text: string };
}

/** So sahen Briefe bisher aus – Ausgangspunkt jeder Vorlage. */
export const BRIEF_VORGABE: BriefVorlage = {
  form: "B",
  logo: true,
  kopf: "",
  absender: "",
  fuss: ["", "", ""],
  farbig: true,
  falzmarken: true,
  meldebestaetigung: {
    einleitung: "{Anrede}, Ihre Meldung ist bestätigt. Ihre Tiere haben diese Katalog- und Käfignummern:",
    hinweise: [
      "Bringen Sie zur Einlieferung den gültigen Impfnachweis Ihrer Tiere mit.",
      "Die Ringkarten auf den folgenden Seiten ausgefüllt und unterschrieben abgeben – je Tier zwei gleiche Abschnitte.",
      "Nur Tiere mit Katalognummer werden angenommen.",
    ].join("\n"),
    gruss: "",
  },
  serienbrief: { betreff: "Einladung zur {Schau}", text: "{Anrede},\n\n", gruss: "Mit freundlichen Grüßen\n{Verein}" },
  verpflichtung: { betreff: "", text: "" },
};

/** Lage des Anschriftfelds nach DIN 5008 in mm (Form A / B): oben links, Rücksendezone zuerst, dann die Anschrift. */
export function anschriftfeld(form: BriefVorlage["form"]): { x: number; y: number; breite: number; hoehe: number; anschriftAb: number } {
  return form === "A" ? { x: 20, y: 27, breite: 85, hoehe: 45, anschriftAb: 44.7 } : { x: 20, y: 45, breite: 85, hoehe: 45, anschriftAb: 62.7 };
}

/** Falz- und Lochmarken (mm von oben) je Form. */
export function falzmarkenMm(form: BriefVorlage["form"]): number[] {
  return form === "A" ? [87, 148.5, 192] : [105, 148.5, 210];
}

/** Ist name ein Platzhalter? Nur eigene Schlüssel – „constructor“ oder „toString“ zählen nicht. */
const istPlatzhalter = (name: string): name is BriefPlatzhalter => Object.hasOwn(BRIEF_PLATZHALTER, name);

/** Setzt Platzhalter ein; unbekannte bleiben, wie sie sind (siehe unbekanntePlatzhalter). */
export function fuelle(text: string, werte: Partial<Record<BriefPlatzhalter, string>>): string {
  return text.replace(/\{([A-Za-zÄÖÜäöüß]+)\}/g, (ganz, name: string) => (istPlatzhalter(name) ? (werte[name] ?? "") : ganz));
}

/** Platzhalter im Text, die es nicht gibt (Tippfehler wie {Vornahme}) – zum Anzeigen vor dem Speichern. */
export function unbekanntePlatzhalter(text: string): string[] {
  const namen = [...text.matchAll(/\{([^{}\s]{1,40})\}/g)].map((m) => m[1]!);
  return [...new Set(namen.filter((n) => !istPlatzhalter(n)))];
}

/** Werte der Platzhalter für einen Empfänger. */
export function briefWerte(
  p: { vorname: string; nachname: string },
  s: { verein: string; schau?: string; ort?: string; meldeschluss?: string; einlieferung?: string; bewertungstag?: string; rueckmeldung?: string; datum: string },
): Record<BriefPlatzhalter, string> {
  const name = `${p.vorname} ${p.nachname}`.trim();
  return {
    Anrede: name ? `Guten Tag ${name}` : "Guten Tag",
    Vorname: p.vorname,
    Nachname: p.nachname,
    Name: name,
    Verein: s.verein,
    Schau: s.schau ?? "",
    Ort: s.ort ?? "",
    Meldeschluss: s.meldeschluss ?? "",
    Einlieferung: s.einlieferung ?? "",
    Bewertungstag: s.bewertungstag ?? "",
    Rückmeldung: s.rueckmeldung ?? "",
    Datum: s.datum,
  };
}

const text = (w: unknown, max: number, vorgabe: string) => (typeof w === "string" ? w.slice(0, max) : vorgabe);
const objekt = (w: unknown) => (w && typeof w === "object" ? (w as Record<string, unknown>) : {});

/** Höchstzahl der Zeilen im Briefkopf (Form B: alle drei, Form A: zwei; der Rest wird beim Drucken mit „…“ gekürzt). */
export const BRIEFKOPF_ZEILEN = 3;

/** Gespeicherten Wert in eine gültige Vorlage bringen; Fehlendes gilt als Vorgabe. */
export function briefVorlageLesen(roh: unknown): BriefVorlage {
  const r = objekt(roh);
  const v = BRIEF_VORGABE;
  const fuss = Array.isArray(r.fuss) ? r.fuss : [];
  const mb = objekt(r.meldebestaetigung);
  const sb = objekt(r.serienbrief);
  const vp = objekt(r.verpflichtung);
  return {
    form: r.form === "A" ? "A" : "B",
    logo: r.logo !== false,
    kopf: text(r.kopf, 400, v.kopf).split("\n").slice(0, BRIEFKOPF_ZEILEN).join("\n"),
    absender: text(r.absender, 120, v.absender),
    fuss: [0, 1, 2].map((i) => text(fuss[i], 300, "")) as [string, string, string],
    farbig: r.farbig !== false,
    falzmarken: r.falzmarken !== false,
    meldebestaetigung: { einleitung: text(mb.einleitung, 1000, v.meldebestaetigung.einleitung), hinweise: text(mb.hinweise, 2000, v.meldebestaetigung.hinweise), gruss: text(mb.gruss, 300, v.meldebestaetigung.gruss) },
    serienbrief: { betreff: text(sb.betreff, 200, v.serienbrief.betreff), text: text(sb.text, 8000, v.serienbrief.text), gruss: text(sb.gruss, 300, v.serienbrief.gruss) },
    verpflichtung: { betreff: text(vp.betreff, 200, v.verpflichtung.betreff), text: text(vp.text, 8000, v.verpflichtung.text) },
  };
}
