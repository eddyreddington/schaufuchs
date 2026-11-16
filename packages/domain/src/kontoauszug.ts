/**
 * Kontoauszug-Import (Entscheidung 023): Der Kassierer lädt den Auszug aus dem Onlinebanking hoch (camt.053 oder
 * Bank-CSV); SchauFUCHS liest die Gutschriften und ordnet sie über die Referenz im Verwendungszweck (Entscheidung 021)
 * den Meldungen zu. Kein Kontozugang, keine Zugangsdaten – nur die Datei. Hier nur Lesen und Zuordnen, rein und getestet.
 */
import { istRfReferenz, rfReferenz } from "./girocode";
import { csvLesen } from "./import";

/** Eine Gutschrift auf dem Vereinskonto. */
export interface Buchung {
  /** Buchungstag JJJJ-MM-TT. */
  datum: string;
  betragCent: number;
  /** Name des Zahlers. */
  name: string;
  iban: string;
  /** Verwendungszweck bzw. Referenz. */
  zweck: string;
}

/** Bytes der Datei als Text: UTF-8, sonst Windows-1252 (ältere CSV-Exporte deutscher Banken). */
export function dekodiere(daten: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(daten).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(daten);
  }
}

/** Liest camt.053 oder Bank-CSV; nur Gutschriften in Euro. Wirft mit verständlicher Meldung, wenn das Format unbekannt ist. */
export function leseKontoauszug(daten: Uint8Array): Buchung[] {
  const text = dekodiere(daten);
  return text.trimStart().startsWith("<") ? leseCamt(text) : leseCsv(text);
}

// ── camt.053 ────────────────────────────────────────────────────────────

function entities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Alle Blöcke <tag>…</tag> (ohne Verschachtelung gleichnamiger Tags, die camt nicht kennt). */
function bloecke(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]!);
}

function erster(xml: string, ...pfad: string[]): string {
  let teil = xml;
  for (const tag of pfad) {
    const b = bloecke(teil, tag)[0];
    if (b === undefined) return "";
    teil = b;
  }
  return entities(teil.trim());
}

function betragAus(xml: string): { cent: number; euro: boolean } | null {
  const m = /<Amt(?:\s[^>]*?Ccy=["']([A-Z]{3})["'])?[^>]*>\s*([0-9]+(?:\.[0-9]{1,2})?)\s*<\/Amt>/.exec(xml);
  if (!m) return null;
  const [ganz, nach = ""] = m[2]!.split(".");
  return { cent: Number(ganz) * 100 + Number(nach.padEnd(2, "0")), euro: (m[1] ?? "EUR") === "EUR" };
}

function leseCamt(roh: string): Buchung[] {
  // Namensraum-Präfixe (<c:Ntry>) entfernen; camt kennt keine gleichnamigen Tags aus verschiedenen Räumen.
  const xml = roh.replace(/<(\/?)[A-Za-z][\w.-]*:/g, "<$1");
  if (!/<BkToCstmrStmt[\s>]/.test(xml)) throw new Error("Das ist kein Kontoauszug im Format camt.053.");
  const ergebnis: Buchung[] = [];
  for (const eintrag of bloecke(xml, "Ntry")) {
    if (erster(eintrag, "CdtDbtInd") !== "CRDT") continue;
    // Nur gebuchte Umsätze; vorgemerkte (PDNG), Informationen (INFO) und künftige (FUTR) nicht.
    const status = /<Sts>\s*(?:<Cd>)?\s*([A-Z]{4})/.exec(eintrag)?.[1];
    if (status && status !== "BOOK") continue;
    const datum = gueltigesDatum((erster(eintrag, "BookgDt", "Dt") || erster(eintrag, "BookgDt", "DtTm") || erster(eintrag, "ValDt", "Dt")).slice(0, 10));
    if (!datum) continue;
    const gesamt = betragAus(eintrag.replace(/<NtryDtls>[\s\S]*<\/NtryDtls>/, ""));
    const details = bloecke(eintrag, "TxDtls");
    const zweckVon = (tx: string) => [...bloecke(tx, "Ustrd").map(entities), ...bloecke(tx, "Ref").map((r) => entities(r.trim()))].join(" ").replace(/\s+/g, " ").trim();
    const eigene = details.map((tx) => betragAus(tx.replace(/<RmtInf>[\s\S]*<\/RmtInf>/, "")));
    // Sammelbuchung ohne Einzelbeträge: ein Posten über den Gesamtbetrag – nie den Gesamtbetrag je Posten.
    if (details.length > 1 && eigene.some((b) => !b)) {
      if (gesamt?.euro && gesamt.cent > 0) ergebnis.push({ datum, betragCent: gesamt.cent, name: "", iban: "", zweck: details.map(zweckVon).filter(Boolean).join(" / ") });
      continue;
    }
    details.forEach((tx, i) => {
      const betrag = (details.length > 1 ? eigene[i] : null) ?? gesamt;
      if (!betrag || !betrag.euro || betrag.cent <= 0) return;
      const dbtr = bloecke(tx, "Dbtr")[0] ?? "";
      ergebnis.push({ datum, betragCent: betrag.cent, name: erster(dbtr, "Nm"), iban: erster(tx, "DbtrAcct", "IBAN"), zweck: zweckVon(tx) });
    });
    if (!details.length && gesamt?.euro && gesamt.cent > 0) ergebnis.push({ datum, betragCent: gesamt.cent, name: "", iban: "", zweck: "" });
  }
  return ergebnis;
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** Spaltennamen deutscher Banken (klein geschrieben); die erste vorhandene gilt. */
const SPALTEN = {
  datum: ["buchungstag", "buchungsdatum", "buchung", "datum", "valutadatum", "wertstellung"],
  betrag: ["betrag", "betrag (eur)", "betrag in eur", "umsatz", "betrag (€)", "umsatz in eur"],
  /** Getrennte Spalten (z. B. Deutsche Bank): Gutschriften stehen unter „Haben“. */
  haben: ["haben", "haben (eur)", "haben in eur"],
  zweck: ["verwendungszweck", "vwz", "vorgang/verwendungszweck", "buchungsdetails", "buchungstext"],
  name: [
    "beguenstigter/zahlungspflichtiger",
    "begünstigter/zahlungspflichtiger",
    "name zahlungsbeteiligter",
    "zahlungspflichtige*r",
    "auftraggeber/empfänger",
    "auftraggeber / empfänger",
    "begünstigter / auftraggeber",
    "begünstigter/auftraggeber",
    "auftraggeber / begünstigter",
    "auftraggeber/begünstigter",
    "empfänger/zahlungspflichtiger",
    "zahlungspflichtiger",
    "auftraggeber",
    "name",
  ],
  iban: ["kontonummer/iban", "iban zahlungsbeteiligter", "iban auftraggeber", "iban auftraggeberkonto", "iban"],
  waehrung: ["waehrung", "währung"],
  /** Sparkasse „Info“ (Umsatz gebucht/vorgemerkt), DKB „Status“ (Gebucht/Vorgemerkt). */
  status: ["info", "status"],
  /** Altes VR-Format: „S“/„H“ in einer eigenen Spalte, oft ohne Überschrift. */
  sollHaben: ["soll/haben", "s/h", "soll-haben-kennzeichen"],
} as const;

/** Echtes Kalenderdatum JJJJ-MM-TT (kein 31.02.) oder leer. */
function gueltigesDatum(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return "";
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.toISOString().slice(0, 10) === d ? d : "";
}

function datumAus(s: string): string {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return gueltigesDatum(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t);
  if (!m) return "";
  const jahr = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return gueltigesDatum(`${jahr}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
}

/** „1.234,56“, „-12,50“ oder „12.50“ in Cent; null, wenn es keine Zahl ist. */
function centAus(s: string): number | null {
  let t = s.replace(/\s|€|EUR/g, "");
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

function leseCsv(text: string): Buchung[] {
  // Gleicher Leser wie beim Import aus Altprogrammen (Trenner ; Tab oder Komma, Anführungszeichen).
  const zeilen = csvLesen(text).filter((z) => z.some((f) => f.trim()));
  // Kopfzeile suchen (manche Banken setzen Kontoangaben darüber).
  const kopfIndex = zeilen.findIndex((z) => {
    const k = z.map((f) => f.trim().toLowerCase());
    return k.some((f) => ([...SPALTEN.betrag, ...SPALTEN.haben] as string[]).includes(f)) && k.some((f) => (SPALTEN.datum as readonly string[]).includes(f));
  });
  if (kopfIndex < 0) throw new Error("Unbekanntes Format: In der Datei fehlen die Spalten Buchungstag und Betrag. Bitte den Umsatzexport als CSV oder camt.053 (XML) hochladen.");
  const kopf = zeilen[kopfIndex]!.map((f) => f.trim().toLowerCase());
  const spalte = (namen: readonly string[]) => {
    for (const n of namen) {
      const i = kopf.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const s = {
    datum: spalte(SPALTEN.datum),
    betrag: spalte(SPALTEN.betrag),
    haben: spalte(SPALTEN.haben),
    zweck: spalte(SPALTEN.zweck),
    name: spalte(SPALTEN.name),
    iban: spalte(SPALTEN.iban),
    waehrung: spalte(SPALTEN.waehrung),
    status: spalte(SPALTEN.status),
    sollHaben: spalte(SPALTEN.sollHaben),
  };
  const feld = (z: string[], i: number) => (i >= 0 ? (z[i] ?? "").trim() : "");
  const daten = zeilen.slice(kopfIndex + 1);
  // S/H-Spalte ohne Überschrift erkennen: nur „S“ oder „H“ darin (altes VR-Format, Betrag ohne Vorzeichen).
  if (s.sollHaben < 0) {
    s.sollHaben = kopf.findIndex((k, i) => !k && daten.some((z) => feld(z, i)) && daten.every((z) => /^[SH]?$/i.test(feld(z, i))));
  }
  const ergebnis: Buchung[] = [];
  for (const z of daten) {
    // Salden sind keine Umsätze.
    if (z.some((f) => /^(anfangs|end|neuer |alter )?saldo\b|^kontostand/i.test(f.trim()))) continue;
    if (/vormerk|vorgemerkt|pending/i.test(feld(z, s.status))) continue;
    let cent = s.betrag >= 0 ? centAus(feld(z, s.betrag)) : centAus(feld(z, s.haben));
    if (s.sollHaben >= 0 && cent != null && feld(z, s.sollHaben).toUpperCase() === "S") cent = -Math.abs(cent);
    const datum = datumAus(feld(z, s.datum));
    if (cent == null || cent <= 0 || !datum) continue;
    const waehrung = feld(z, s.waehrung);
    if (waehrung && waehrung.toUpperCase() !== "EUR") continue;
    ergebnis.push({ datum, betragCent: cent, name: feld(z, s.name), iban: feld(z, s.iban).replace(/\s+/g, "").toUpperCase(), zweck: feld(z, s.zweck).replace(/\s+/g, " ") });
  }
  return ergebnis;
}

/**
 * Schlüssel je Gutschrift, aus dem der Server den Fingerabdruck gegen Doppelbuchung bildet. Gleiche Gutschriften in
 * einer Datei (zweimal 25 € vom selben Konto, gleicher Zweck, gleicher Tag) werden durchgezählt – lädt man den Auszug
 * noch einmal hoch, ergeben sich dieselben Schlüssel.
 */
export function buchungsSchluessel(buchungen: Buchung[]): string[] {
  const gesehen = new Map<string, number>();
  return buchungen.map((b) => {
    const basis = [b.datum, b.betragCent, b.iban, b.name, b.zweck].join("|");
    const n = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, n);
    return `${basis}|${n}`;
  });
}

// ── Zuordnung ───────────────────────────────────────────────────────────

export interface OffeneMeldung {
  id: number;
  nachname: string;
  vorname: string;
  offenCent: number;
}

export interface Zuordnung {
  buchung: Buchung;
  meldungId: number | null;
  /** Woran erkannt: Referenz (sicher) oder Name und Betrag (Vorschlag, bitte prüfen). */
  sicherheit: "referenz" | "name" | null;
  /** Betrag im Vergleich zum offenen Betrag der Meldung. */
  hinweis: "passt" | "teilzahlung" | "ueberzahlung" | null;
}

/** Für den Namensvergleich: klein, ohne Akzente, Umlaute als ae/oe/ue, nur Buchstaben als Wörter. */
function woerter(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function enthaeltWoerter(text: string[], name: string): boolean {
  const n = woerter(name);
  return n.length > 0 && n.every((w) => text.includes(w));
}

/**
 * Ordnet Gutschriften Meldungen zu. Sicher ist nur die Referenz (Prüfziffer passt, Meldung gehört zur Liste).
 * Ohne Referenz ein Vorschlag, wenn genau eine Meldung mit diesem Nachnamen (bei mehreren: und Vornamen) im Namen
 * des Zahlers steht und der Betrag genau dem offenen Betrag entspricht.
 */
export function ordneZu(buchungen: Buchung[], meldungen: OffeneMeldung[]): Zuordnung[] {
  const nachReferenz = new Map(meldungen.map((m) => [rfReferenz(m.id), m]));
  const hinweis = (cent: number, m: OffeneMeldung): Zuordnung["hinweis"] => (cent === m.offenCent ? "passt" : cent < m.offenCent ? "teilzahlung" : "ueberzahlung");
  return buchungen.map((buchung) => {
    const kompakt = buchung.zweck.replace(/\s+/g, "").toUpperCase();
    // Längste Referenz zuerst – bei gleich langen Referenzen (siebenstellig) ist keine Anfang einer anderen.
    const treffer = [...nachReferenz.entries()].filter(([ref]) => kompakt.includes(ref)).sort((a, b) => b[0].length - a[0].length);
    if (treffer.length) {
      const m = treffer[0]![1];
      return { buchung, meldungId: m.id, sicherheit: "referenz", hinweis: hinweis(buchung.betragCent, m) };
    }
    // Eine gültige Referenz einer anderen Meldung (andere Schau, storniert): kein Rückfall auf den Namen.
    if ([...kompakt.matchAll(/RF\d{9}/g)].some((m) => istRfReferenz(m[0]))) return { buchung, meldungId: null, sicherheit: null, hinweis: null };
    // Nur der Name des Zahlers – im Zweck stünden auch Rassen und Tiere („1,0 Hahn“).
    const text = woerter(buchung.name);
    let kandidaten = meldungen.filter((m) => m.offenCent === buchung.betragCent && enthaeltWoerter(text, m.nachname));
    if (kandidaten.length > 1) kandidaten = kandidaten.filter((m) => enthaeltWoerter(text, m.vorname));
    if (kandidaten.length === 1) return { buchung, meldungId: kandidaten[0]!.id, sicherheit: "name", hinweis: "passt" };
    return { buchung, meldungId: null, sicherheit: null, hinweis: null };
  });
}
