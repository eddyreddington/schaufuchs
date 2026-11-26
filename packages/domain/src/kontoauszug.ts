/**
 * Kontoauszug-Import (Entscheidung 023): Der Kassierer lädt den Auszug aus dem Onlinebanking hoch (camt.053 oder
 * Bank-CSV); SchauFUCHS liest die Gutschriften und ordnet sie über die Referenz im Verwendungszweck (Entscheidung 021)
 * den Meldungen zu. Kein Kontozugang, keine Zugangsdaten – nur die Datei. Hier nur Lesen und Zuordnen, rein und getestet.
 */
import { EingabeFehler } from "./eingabefehler";
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

// Alles hier nur mit indexOf und Regex auf kurzen, begrenzten Stücken: Eine Suche per Regex über die ganze Datei setzte
// bei kaputten Dateien (z. B. 4 MB „<Ntry>“ ohne Schluss-Tag) an jedem offenen Tag neu an und liefe jedes Mal bis zum
// Dateiende – quadratische Laufzeit, die den ganzen Server minutenlang anhielte.

/** Leerraum wie \s in XML (Leerzeichen, Tab, Zeilenwechsel). */
const leer = (z: string | undefined) => z === " " || z === "\t" || z === "\n" || z === "\r";

/** Nächstes öffnendes Tag <tag> bzw. <tag …> ab `ab` (nicht <tagXyz>): Anfang und Ende, null, wenn keins mehr kommt. */
function oeffnendesTag(xml: string, tag: string, ab: number): { anfang: number; ende: number } | null {
  for (let i = xml.indexOf(`<${tag}`, ab); i >= 0; i = xml.indexOf(`<${tag}`, i + 1)) {
    const z = xml[i + tag.length + 1];
    if (z !== ">" && !leer(z)) continue;
    const ende = xml.indexOf(">", i);
    return ende < 0 ? null : { anfang: i, ende: ende + 1 };
  }
  return null;
}

/**
 * Blöcke <tag>…</tag> (ohne Verschachtelung gleichnamiger Tags, die camt nicht kennt), höchstens `anzahl`. Fehlt ein
 * Schluss-Tag, endet die Suche: Dahinter kann keiner mehr kommen.
 */
function bloecke(xml: string, tag: string, anzahl = Infinity): string[] {
  const ergebnis: string[] = [];
  const schluss = `</${tag}>`;
  let ab = 0;
  while (ergebnis.length < anzahl) {
    const auf = oeffnendesTag(xml, tag, ab);
    const zu = auf ? xml.indexOf(schluss, auf.ende) : -1;
    if (!auf || zu < 0) break;
    ergebnis.push(xml.slice(auf.ende, zu));
    ab = zu + schluss.length;
  }
  return ergebnis;
}

/** Text ohne den Bereich vom ersten <tag> bis zum letzten </tag>. */
function ohneBereich(xml: string, tag: string): string {
  const auf = xml.indexOf(`<${tag}>`);
  const schluss = `</${tag}>`;
  const zu = xml.lastIndexOf(schluss);
  return auf < 0 || zu < auf + tag.length + 2 ? xml : xml.slice(0, auf) + xml.slice(zu + schluss.length);
}

function erster(xml: string, ...pfad: string[]): string {
  let teil = xml;
  for (const tag of pfad) {
    const b = bloecke(teil, tag, 1)[0];
    if (b === undefined) return "";
    teil = b;
  }
  return entities(teil.trim());
}

/** Erster Betrag <Amt Ccy="EUR">12.50</Amt> (ohne Währung: Euro). */
function betragAus(xml: string): { cent: number; euro: boolean } | null {
  let zu = -1;
  for (let auf = oeffnendesTag(xml, "Amt", 0); auf; auf = oeffnendesTag(xml, "Amt", auf.ende)) {
    // Das nächste Schluss-Tag nur neu suchen, wenn das bisherige schon hinter uns liegt (sonst quadratisch bei vielen
    // offenen <Amt> vor einem einzigen </Amt>).
    if (zu < auf.ende) zu = xml.indexOf("</Amt>", auf.ende);
    if (zu < 0) return null;
    const wert = /^\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/.exec(xml.slice(auf.ende, zu));
    if (!wert) continue;
    const waehrung = /\sCcy=["']([A-Z]{3})["']/.exec(xml.slice(auf.anfang, auf.ende))?.[1];
    const [ganz, nach = ""] = wert[1]!.split(".");
    return { cent: Number(ganz) * 100 + Number(nach.padEnd(2, "0")), euro: (waehrung ?? "EUR") === "EUR" };
  }
  return null;
}

/** Code aus <Sts>BOOK</Sts> bzw. <Sts><Cd>BOOK</Cd></Sts>; leer, wenn keiner angegeben ist. */
function statusAus(xml: string): string {
  for (let i = xml.indexOf("<Sts>"); i >= 0; i = xml.indexOf("<Sts>", i + 1)) {
    let j = i + 5;
    while (leer(xml[j])) j++;
    if (xml.startsWith("<Cd>", j)) j += 4;
    while (leer(xml[j])) j++;
    const code = xml.slice(j, j + 4);
    if (/^[A-Z]{4}$/.test(code)) return code;
  }
  return "";
}

function leseCamt(roh: string): Buchung[] {
  // Namensraum-Präfixe (<c:Ntry>) entfernen; camt kennt keine gleichnamigen Tags aus verschiedenen Räumen.
  const xml = roh.replace(/<(\/?)[A-Za-z][\w.-]*:/g, "<$1");
  if (!/<BkToCstmrStmt[\s>]/.test(xml)) throw new EingabeFehler("Das ist kein Kontoauszug im Format camt.053.");
  const ergebnis: Buchung[] = [];
  for (const eintrag of bloecke(xml, "Ntry")) {
    if (erster(eintrag, "CdtDbtInd") !== "CRDT") continue;
    // Nur gebuchte Umsätze; vorgemerkte (PDNG), Informationen (INFO) und künftige (FUTR) nicht.
    const status = statusAus(eintrag);
    if (status && status !== "BOOK") continue;
    const datum = gueltigesDatum((erster(eintrag, "BookgDt", "Dt") || erster(eintrag, "BookgDt", "DtTm") || erster(eintrag, "ValDt", "Dt")).slice(0, 10));
    if (!datum) continue;
    const gesamt = betragAus(ohneBereich(eintrag, "NtryDtls"));
    const details = bloecke(eintrag, "TxDtls");
    const zweckVon = (tx: string) => [...bloecke(tx, "Ustrd").map(entities), ...bloecke(tx, "Ref").map((r) => entities(r.trim()))].join(" ").replace(/\s+/g, " ").trim();
    const eigene = details.map((tx) => betragAus(ohneBereich(tx, "RmtInf")));
    // Sammelbuchung ohne Einzelbeträge: ein Posten über den Gesamtbetrag – nie den Gesamtbetrag je Posten.
    if (details.length > 1 && eigene.some((b) => !b)) {
      if (gesamt?.euro && gesamt.cent > 0) ergebnis.push({ datum, betragCent: gesamt.cent, name: "", iban: "", zweck: details.map(zweckVon).filter(Boolean).join(" / ") });
      continue;
    }
    details.forEach((tx, i) => {
      const betrag = (details.length > 1 ? eigene[i] : null) ?? gesamt;
      if (!betrag || !betrag.euro || betrag.cent <= 0) return;
      const dbtr = bloecke(tx, "Dbtr", 1)[0] ?? "";
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
  if (kopfIndex < 0) throw new EingabeFehler("Unbekanntes Format: In der Datei fehlen die Spalten Buchungstag und Betrag. Bitte den Umsatzexport als CSV oder camt.053 (XML) hochladen.");
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
