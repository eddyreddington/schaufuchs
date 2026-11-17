/**
 * SEPA-Lastschrift für das Standgeld (Entscheidung 018): Gläubiger-Identifikationsnummer, Mandate der Aussteller und die
 * Datei für die Bank (pain.008.001.08, SEPA-Basislastschrift CORE). Rein und getestet; Mandate und Läufe speichert der
 * Server. Bar und Überweisung bleiben daneben überall möglich.
 */
import { EingabeFehler } from "./eingabefehler";
import { imEwr, normalisiereIban, pruefeIban, sepaText } from "./sepa";

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const betrag = (cent: number) => (cent / 100).toFixed(2);

/** Gläubiger-ID einheitlich geschrieben (ohne Leerzeichen, groß). */
export function normalisiereGlaeubigerId(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

/** Ziffernfolge für Mod 97: Buchstaben A = 10 … Z = 35. */
function mod97(s: string): number {
  let rest = 0;
  for (const c of s) {
    const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

/**
 * Gläubiger-Identifikationsnummer prüfen (Deutsche Bundesbank): Ländercode, zwei Prüfziffern, drei Zeichen
 * Geschäftsbereich (frei wählbar, zählt bei der Prüfziffer nicht mit), nationale Kennung. In Deutschland 18 Zeichen.
 */
export function pruefeGlaeubigerId(text: string): string | null {
  const id = normalisiereGlaeubigerId(text);
  if (!id) return "Die Gläubiger-ID fehlt.";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(id)) return "Die Gläubiger-ID hat die Form DE98ZZZ09999999999.";
  if (id.startsWith("DE") && id.length !== 18) return "Eine deutsche Gläubiger-ID hat 18 Zeichen.";
  const pruef = id.slice(7) + id.slice(0, 4);
  return mod97(pruef) === 1 ? null : "Die Prüfziffer der Gläubiger-ID stimmt nicht.";
}

/** Mandatsreferenz: 1 bis 35 Zeichen aus dem SEPA-Zeichensatz, ohne Leerzeichen (eindeutig je Verein). */
export function pruefeMandatsreferenz(text: string): string | null {
  if (!text) return "Die Mandatsreferenz fehlt.";
  if (text.length > 35) return "Die Mandatsreferenz hat höchstens 35 Zeichen.";
  if (!/^[A-Za-z0-9+?/\-:().,']+$/.test(text)) return "Die Mandatsreferenz enthält unerlaubte Zeichen (erlaubt: Buchstaben ohne Umlaute, Ziffern, + ? / - : ( ) . , ').";
  return null;
}

export interface MandatStand {
  /** Datum der Unterschrift (YYYY-MM-DD). */
  unterschriebenAm: string;
  widerrufenAm: string | null;
  /** Fälligkeit der letzten eingezogenen Lastschrift. */
  letzteNutzungAm: string | null;
  /** Wiederkehrend (RCUR) oder einmalig (OOFF). */
  wiederkehrend: boolean;
}

/** Monate zwischen zwei Daten (volle Monate, nach Kalender). */
function monate(von: string, bis: string): number {
  const [vj, vm, vt] = von.split("-").map(Number) as [number, number, number];
  const [bj, bm, bt] = bis.split("-").map(Number) as [number, number, number];
  return (bj - vj) * 12 + (bm - vm) - (bt < vt ? 1 : 0);
}

/** Ein Mandat verfällt nach so vielen Monaten ohne Lastschrift (SEPA-Regelwerk). */
export const MANDAT_VERFALL_MONATE = 36;
/** So lange nach Widerruf bzw. Verfall bleibt das Mandat als Nachweis (Widerspruchsfrist des Zahlers: 13 Monate). */
export const MANDAT_NACHWEIS_MONATE = 14;

/**
 * Darf mit dem Mandat zum Stichtag eingezogen werden? Null = ja, sonst der Grund. Ein Mandat verfällt, wenn es 36 Monate
 * nicht genutzt wurde (seit Unterschrift bzw. letzter Lastschrift); ein einmaliges Mandat gilt nur für eine Lastschrift.
 */
export function mandatGueltig(m: MandatStand, stichtag: string): string | null {
  if (m.widerrufenAm) return "Das Mandat ist widerrufen.";
  if (m.unterschriebenAm > stichtag) return "Das Mandat ist noch nicht unterschrieben.";
  if (!m.wiederkehrend && m.letzteNutzungAm) return "Das einmalige Mandat ist schon genutzt.";
  if (monate(m.letzteNutzungAm ?? m.unterschriebenAm, stichtag) >= MANDAT_VERFALL_MONATE) return `Das Mandat ist verfallen (${MANDAT_VERFALL_MONATE} Monate nicht genutzt).`;
  return null;
}

/**
 * Darf das Mandat zum Stichtag gelöscht werden? Ja, wenn seit dem Widerruf bzw. seit dem Verfall (36 Monate ohne
 * Nutzung) 14 Monate vergangen sind. So lange muss der Verein es bei einem Widerspruch des Zahlers vorlegen können.
 */
export function mandatLoeschbar(m: Pick<MandatStand, "widerrufenAm" | "letzteNutzungAm" | "unterschriebenAm">, stichtag: string): boolean {
  if (m.widerrufenAm && monate(m.widerrufenAm, stichtag) >= MANDAT_NACHWEIS_MONATE) return true;
  return monate(m.letzteNutzungAm ?? m.unterschriebenAm, stichtag) >= MANDAT_VERFALL_MONATE + MANDAT_NACHWEIS_MONATE;
}

const tag = (d: Date) => d.toISOString().slice(0, 10);
/** Ostersonntag (Gauß, gregorianisch). */
function ostern(j: number): Date {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), t = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(j, monat - 1, t));
}
/** Bankarbeitstag im SEPA-Zahlungsverkehr (TARGET2): kein Wochenende, nicht 1.1., Karfreitag, Ostermontag, 1.5., 25./26.12. */
export function bankarbeitstag(datum: string): boolean {
  return istBankarbeitstag(new Date(`${datum}T00:00:00Z`));
}
function istBankarbeitstag(d: Date): boolean {
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return false;
  const md = tag(d).slice(5);
  if (["01-01", "05-01", "12-25", "12-26"].includes(md)) return false;
  const o = ostern(d.getUTCFullYear()).getTime();
  const tg = 86_400_000;
  return d.getTime() !== o - 2 * tg && d.getTime() !== o + tg;
}

/**
 * Frühestes Fälligkeitsdatum ab heute: der zweite Bankarbeitstag nach heute. Eingereicht wird frühestens am nächsten
 * Bankarbeitstag, die Bank braucht die Datei einen Bankarbeitstag vor der Fälligkeit (CORE, D-1) – ein Tag bleibt als
 * Puffer für die Annahmeschlusszeit. Die Vorabankündigung an den Zahler kommt hinzu (vorgeschlageneFaelligkeit).
 */
export function fruehesteFaelligkeit(heute: string): string {
  const d = new Date(`${heute}T00:00:00Z`);
  for (let n = 0; n < 2; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (istBankarbeitstag(d)) n++;
  }
  return tag(d);
}

/** Vorlauf der Vorabankündigung, wenn mit dem Zahler nichts anderes vereinbart ist (SEPA-Regelwerk). */
export const VORABANKUENDIGUNG_TAGE = 14;

/** Vorschlag für die Fälligkeit: 14 Tage nach heute (Vorabankündigung), dann der nächste Bankarbeitstag. */
export function vorgeschlageneFaelligkeit(heute: string): string {
  const d = new Date(`${heute}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + VORABANKUENDIGUNG_TAGE);
  while (!istBankarbeitstag(d)) d.setUTCDate(d.getUTCDate() + 1);
  const f = fruehesteFaelligkeit(heute);
  return tag(d) > f ? tag(d) : f;
}

export interface LastschriftPosten {
  endToEndId: string;
  name: string;
  iban: string;
  betragCent: number;
  verwendungszweck: string;
  mandatsreferenz: string;
  unterschriebenAm: string;
  wiederkehrend: boolean;
}

export interface LastschriftAuftrag {
  nachrichtId: string;
  erstelltAm: Date;
  faelligAm: string;
  glaeubiger: { name: string; iban: string; bic: string; glaeubigerId: string };
  posten: LastschriftPosten[];
}

/** Erzeugt die XML-Datei für eine Sammellastschrift (pain.008.001.08, CORE). Wirft bei ungültigen Angaben. */
export function erzeugeSepaLastschrift(a: LastschriftAuftrag): string {
  if (a.posten.length === 0) throw new EingabeFehler("Keine Lastschriften.");
  const ciFehler = pruefeGlaeubigerId(a.glaeubiger.glaeubigerId);
  if (ciFehler) throw new EingabeFehler(`Gläubiger-ID des Vereins: ${ciFehler}`);
  const ibanFehler = pruefeIban(a.glaeubiger.iban);
  if (ibanFehler) throw new EingabeFehler(`Vereinskonto: ${ibanFehler}`);
  for (const p of a.posten) {
    if (p.betragCent <= 0) throw new EingabeFehler(`Betrag für ${p.name} muss positiv sein.`);
    const f = pruefeIban(p.iban);
    if (f) throw new EingabeFehler(`${p.name}: ${f}`);
    if (!imEwr(p.iban)) throw new EingabeFehler(`${p.name}: Konto außerhalb von EU/EWR – dafür bräuchte die Lastschrift BIC und Anschrift.`);
    const r = pruefeMandatsreferenz(p.mandatsreferenz);
    if (r) throw new EingabeFehler(`${p.name}: ${r}`);
  }
  const summe = (l: LastschriftPosten[]) => l.reduce((s, p) => s + p.betragCent, 0);
  const id = sepaText(a.nachrichtId, 35);
  const bic = a.glaeubiger.bic.replace(/\s+/g, "").toUpperCase();
  const agent = (b: string) => (b ? `<FinInstnId><BICFI>${xml(b)}</BICFI></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`);
  const zeit = a.erstelltAm.toISOString().replace(/\.\d{3}Z$/, "Z");
  const name = xml(sepaText(a.glaeubiger.name, 70));
  // Je Sequenz ein Block: wiederkehrende Mandate (RCUR) und einmalige (OOFF).
  const bloecke = (["RCUR", "OOFF"] as const)
    .map((seq) => ({ seq, posten: a.posten.filter((p) => p.wiederkehrend === (seq === "RCUR")) }))
    .filter((b) => b.posten.length);
  const pmtInf = bloecke
    .map(
      (b) => `    <PmtInf>
      <PmtInfId>${xml(sepaText(`${a.nachrichtId}-${b.seq}`, 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${b.posten.length}</NbOfTxs>
      <CtrlSum>${betrag(summe(b.posten))}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>${b.seq}</SeqTp></PmtTpInf>
      <ReqdColltnDt>${a.faelligAm}</ReqdColltnDt>
      <Cdtr><Nm>${name}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${normalisiereIban(a.glaeubiger.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agent(bic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${normalisiereGlaeubigerId(a.glaeubiger.glaeubigerId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${b.posten
  .map(
    (p) => `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${xml(sepaText(p.endToEndId, 35))}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${betrag(p.betragCent)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${xml(p.mandatsreferenz)}</MndtId><DtOfSgntr>${p.unterschriebenAm}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt>${agent("")}</DbtrAgt>
        <Dbtr><Nm>${xml(sepaText(p.name, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${normalisiereIban(p.iban)}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`,
  )
  .join("\n")}
    </PmtInf>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xml(id)}</MsgId>
      <CreDtTm>${zeit}</CreDtTm>
      <NbOfTxs>${a.posten.length}</NbOfTxs>
      <CtrlSum>${betrag(summe(a.posten))}</CtrlSum>
      <InitgPty><Nm>${name}</Nm></InitgPty>
    </GrpHdr>
${pmtInf}
  </CstmrDrctDbtInitn>
</Document>
`;
}
