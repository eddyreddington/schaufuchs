/**
 * Spenden an den Verein: wann eine Zuwendungsbestätigung (§ 10b EStG, § 50 EStDV) ausgestellt werden darf, welche
 * Spenden in eine Sammelbestätigung gehören und die steuerlichen Angaben des Vereins (Freistellungsbescheid).
 * Rein und getestet; Speichern und Drucken im Server (routers/spenden.ts, pdf/spenden.ts). Entscheidung 013.
 */

export const SPENDE_ARTEN = ["geld", "sache"] as const;
export type SpendeArt = (typeof SPENDE_ARTEN)[number];

/** Wie das Geld kam: bar in die Kasse, aufs Konto oder mit dem Meldegeld (freiwilliger Posten der Tiermeldung). */
export const SPENDE_WEGE = ["bar", "bank", "meldung"] as const;
export type SpendeWeg = (typeof SPENDE_WEGE)[number];
export const SPENDE_WEG_LABEL: Record<SpendeWeg, string> = { bar: "bar", bank: "Überweisung", meldung: "mit dem Meldegeld" };

/** Herkunft einer Sachzuwendung – entscheidet, welcher Wert gilt (amtliches Muster). */
export const SACH_HERKUNFT = ["betrieb", "privat", "unbekannt"] as const;
export type SachHerkunft = (typeof SACH_HERKUNFT)[number];

export interface Sachangaben {
  /** Genaue Bezeichnung mit Alter, Zustand, Kaufpreis usw. */
  bezeichnung: string;
  herkunft: SachHerkunft;
  /** Unterlagen zur Wertermittlung (z. B. Rechnung, Gutachten) liegen vor. */
  unterlagen: boolean;
}

/** Steuerliche Angaben des Vereins für Zuwendungsbestätigungen. */
export interface Steuerstatus {
  gemeinnuetzig: boolean;
  /** Freistellungsbescheid bzw. Anlage zum Körperschaftsteuerbescheid, oder Feststellung nach § 60a AO. */
  bescheidArt: "freistellung" | "feststellung60a";
  finanzamt: string;
  steuernummer: string;
  /** Datum des Bescheids (JJJJ-MM-TT). */
  bescheidDatum: string | null;
  /** Letzter Veranlagungszeitraum laut Freistellungsbescheid, z. B. „2022“ oder „2020 bis 2022“. */
  veranlagungszeitraum: string;
  /** Steuerbegünstigte Zwecke im Wortlaut der Satzung bzw. des Bescheids, z. B. „Förderung der Tierzucht“. */
  zwecke: string;
  /**
   * Ort für „Ort, Datum und Unterschrift“. Unterschrieben wird immer von Hand: ohne Unterschrift (maschinelles
   * Verfahren, R 10b.1 Abs. 4 EStR) bräuchte es eine Anzeige beim Finanzamt und eine eingeblendete Unterschrift.
   */
  ort: string;
}

export const STEUER_VORGABE: Steuerstatus = {
  gemeinnuetzig: false,
  bescheidArt: "freistellung",
  finanzamt: "",
  steuernummer: "",
  bescheidDatum: null,
  veranlagungszeitraum: "",
  zwecke: "",
  ort: "",
};

const text = (w: unknown, max: number) => (typeof w === "string" ? w.slice(0, max) : "");
const isoDatum = (w: unknown) => (typeof w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w) && !Number.isNaN(Date.parse(w)) ? w : null);

/** Gespeicherten Wert in gültige Angaben bringen. */
export function steuerstatusLesen(roh: unknown): Steuerstatus {
  const r = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  return {
    gemeinnuetzig: r.gemeinnuetzig === true,
    bescheidArt: r.bescheidArt === "feststellung60a" ? "feststellung60a" : "freistellung",
    finanzamt: text(r.finanzamt, 120),
    steuernummer: text(r.steuernummer, 40),
    bescheidDatum: isoDatum(r.bescheidDatum),
    veranlagungszeitraum: text(r.veranlagungszeitraum, 40),
    zwecke: text(r.zwecke, 1000),
    ort: text(r.ort, 80),
  };
}

/** Datum plus volle Jahre (29. Februar → 28. Februar). */
function plusJahre(iso: string, jahre: number): string {
  const [j, m, t] = iso.split("-").map(Number) as [number, number, number];
  const letzter = new Date(Date.UTC(j + jahre, m, 0)).getUTCDate();
  return `${j + jahre}-${String(m).padStart(2, "0")}-${String(Math.min(t, letzter)).padStart(2, "0")}`;
}

/**
 * Darf der Verein heute Zuwendungsbestätigungen ausstellen? Nein, wenn er nicht gemeinnützig ist, Angaben fehlen
 * oder der Bescheid zu alt ist: Freistellungsbescheid höchstens fünf, Feststellung nach § 60a AO höchstens drei Jahre,
 * jeweils taggenau (§ 63 Abs. 5 AO).
 * Rückgabe: Grund der Sperre oder null.
 */
export function bescheidSperre(st: Steuerstatus, heute: string): string | null {
  if (!st.gemeinnuetzig) return "Der Verein ist nicht als gemeinnützig eingetragen (Verein und Datenschutz → Steuerliche Angaben).";
  const fehlt = [!st.finanzamt.trim() && "Finanzamt", !st.steuernummer.trim() && "Steuernummer", !st.bescheidDatum && "Datum des Bescheids", !st.zwecke.trim() && "Zweck"].filter(Boolean);
  if (st.bescheidArt === "freistellung" && !st.veranlagungszeitraum.trim()) fehlt.push("Veranlagungszeitraum");
  if (fehlt.length) return `Steuerliche Angaben fehlen: ${fehlt.join(", ")}.`;
  if (st.bescheidDatum! > heute) return "Das Datum des Bescheids liegt in der Zukunft – bitte prüfen.";
  const jahre = st.bescheidArt === "freistellung" ? 5 : 3;
  if (heute > plusJahre(st.bescheidDatum!, jahre))
    return st.bescheidArt === "freistellung"
      ? "Der Freistellungsbescheid ist älter als fünf Jahre – Zuwendungsbestätigungen erst wieder mit einem neuen Bescheid."
      : "Die Feststellung nach § 60a AO ist älter als drei Jahre – Zuwendungsbestätigungen erst wieder mit einem Freistellungsbescheid.";
  return null;
}

export interface SpendeFuerBestaetigung {
  id: number;
  art: SpendeArt;
  /** Betrag bzw. Wert der Sachzuwendung in Cent. */
  betragCent: number;
  /** Tag der Zuwendung (JJJJ-MM-TT); null, solange das Geld nicht eingegangen ist (Spende mit dem Meldegeld). */
  datum: string | null;
  gegenleistung: boolean;
  verzichtAufwand: boolean;
  storniert: boolean;
  /** Steht schon auf einer gültigen (nicht stornierten) Zuwendungsbestätigung. */
  bestaetigt: boolean;
  sache: Sachangaben | null;
}

export interface SpenderAnschrift {
  istFirma: boolean;
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
}

export const spenderName = (s: Pick<SpenderAnschrift, "istFirma" | "vorname" | "nachname">) => (s.istFirma ? s.nachname.trim() : `${s.vorname} ${s.nachname}`.trim());

/** Gründe, aus denen für diese Spende keine Zuwendungsbestätigung ausgestellt werden darf (leer: erlaubt). */
export function bestaetigungsSperren(sp: SpendeFuerBestaetigung, spender: SpenderAnschrift, st: Steuerstatus, heute: string): string[] {
  const g: string[] = [];
  const bescheid = bescheidSperre(st, heute);
  if (bescheid) g.push(bescheid);
  if (sp.storniert) g.push("Die Spende ist storniert.");
  if (sp.gegenleistung) g.push("Mit Gegenleistung (z. B. Werbung) ist es Sponsoring, keine Spende – keine Zuwendungsbestätigung.");
  if (sp.bestaetigt) g.push("Die Spende ist schon bestätigt – eine zweite Bestätigung ist nicht erlaubt.");
  if (!sp.datum) g.push("Das Geld ist noch nicht eingegangen.");
  else if (sp.datum > heute) g.push("Der Tag der Zuwendung liegt in der Zukunft.");
  if (!spenderName(spender) || !spender.strasse.trim() || !spender.plz.trim() || !spender.ort.trim()) g.push("Name und Anschrift des Spenders sind unvollständig.");
  if (sp.betragCent <= 0) g.push(sp.art === "sache" ? "Der Wert der Sachzuwendung fehlt." : "Der Betrag fehlt.");
  if (sp.art === "sache" && !sp.sache?.bezeichnung.trim()) g.push("Die genaue Bezeichnung der Sachzuwendung fehlt.");
  return g;
}

/**
 * Sammelbestätigung eines Kalenderjahres: alle Geldzuwendungen des Spenders aus diesem Jahr, die bestätigt werden
 * dürfen (Sachzuwendungen nie – sie brauchen je eine eigene Bestätigung). Die übrigen stehen in `ausgelassen`.
 * Ob der Verein selbst bestätigen darf, prüft bescheidSperre().
 */
export function sammelbestaetigung<T extends SpendeFuerBestaetigung>(spenden: T[], jahr: number) {
  const imJahr = spenden.filter((s) => !s.datum || s.datum.startsWith(`${jahr}-`));
  const passt = (s: T) => s.art === "geld" && !!s.datum && !s.storniert && !s.gegenleistung && !s.bestaetigt && s.betragCent > 0;
  const auswahl = imJahr.filter(passt).sort((a, b) => a.datum!.localeCompare(b.datum!) || a.id - b.id);
  return { spenden: auswahl, summeCent: auswahl.reduce((n, s) => n + s.betragCent, 0), ausgelassen: imJahr.filter((s) => !passt(s)) };
}
