/** SEPA-Überweisungen (pain.001.001.09, wie von deutschen Banken nach DK-Datenformat angenommen). */

export function normalisiereIban(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

export function formatIban(iban: string): string {
  if (iban.includes("…")) return iban; // schon gekürzt (verdeckeIban)
  return normalisiereIban(iban).replace(/(.{4})(?=.)/g, "$1 ");
}

/** Gekürzte IBAN für Helfer ohne Bankdaten-Recht: Land und die letzten vier Stellen, z. B. „DE… 3000“. */
export function verdeckeIban(iban: string): string {
  const n = normalisiereIban(iban);
  return n ? `${n.slice(0, 2)}… ${n.slice(-4)}` : "";
}

const LAENGE: Record<string, number> = { DE: 22, AT: 20, CH: 21, NL: 18, BE: 16, LU: 20, FR: 27, DK: 18, PL: 28, CZ: 24 };

/** Prüft eine IBAN (Aufbau, Länge für häufige Länder, Prüfziffer). Gibt eine Fehlermeldung oder null zurück. */
export function pruefeIban(text: string): string | null {
  const iban = normalisiereIban(text);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return "Die IBAN ist unvollständig oder enthält ungültige Zeichen.";
  const soll = LAENGE[iban.slice(0, 2)];
  if (soll && iban.length !== soll) return `Eine IBAN aus ${iban.slice(0, 2)} hat ${soll} Stellen, hier sind es ${iban.length}.`;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = [...umgestellt].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1 ? null : "Die Prüfziffer der IBAN stimmt nicht – bitte auf Tippfehler prüfen.";
}

/** Länder des EWR: nur dort reicht die IBAN; außerhalb (z. B. CH, GB) verlangt SEPA zusätzlich BIC und Anschrift. */
const EWR = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK".split(" "));
export function imEwr(iban: string): boolean {
  return EWR.has(normalisiereIban(iban).slice(0, 2));
}

export function pruefeBic(text: string): string | null {
  const bic = text.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? null : "Die BIC hat 8 oder 11 Zeichen.";
}

/** Auf den SEPA-Zeichensatz bringen (Umlaute umschreiben, Unerlaubtes ersetzen) und kürzen. */
export function sepaText(text: string, max: number): string {
  // Zeichen ohne Zerlegung in Grundbuchstabe + Akzent (Ø, Ł, Æ …) ausdrücklich umschreiben, sonst gingen sie verloren.
  const umschrift: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "&": "+",
    Ø: "O", ø: "o", Ł: "L", ł: "l", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", Đ: "D", đ: "d", Þ: "Th", þ: "th", ı: "i",
  };
  const t = [...text]
    .map((c) => umschrift[c] ?? c)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max);
}

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const betrag = (cent: number) => (cent / 100).toFixed(2);

export interface SepaPosten {
  endToEndId: string;
  name: string;
  iban: string;
  betragCent: number;
  verwendungszweck: string;
}

export interface SepaAuftrag {
  nachrichtId: string;
  erstelltAm: Date;
  ausfuehrungAm: string;
  auftraggeber: { name: string; iban: string; bic: string };
  posten: SepaPosten[];
}

/** Erzeugt die XML-Datei für eine Sammelüberweisung. Wirft bei ungültigen Angaben. */
export function erzeugeSepaUeberweisung(a: SepaAuftrag): string {
  if (a.posten.length === 0) throw new Error("Keine Überweisungen.");
  const ibanFehler = pruefeIban(a.auftraggeber.iban);
  if (ibanFehler) throw new Error(`Vereinskonto: ${ibanFehler}`);
  for (const p of a.posten) {
    if (p.betragCent <= 0) throw new Error(`Betrag für ${p.name} muss positiv sein.`);
    const f = pruefeIban(p.iban);
    if (f) throw new Error(`${p.name}: ${f}`);
    if (!imEwr(p.iban)) throw new Error(`${p.name}: Konto außerhalb des EWR – bitte bar auszahlen oder einzeln überweisen.`);
  }
  const summe = a.posten.reduce((s, p) => s + p.betragCent, 0);
  const anzahl = String(a.posten.length);
  const id = sepaText(a.nachrichtId, 35);
  const bic = a.auftraggeber.bic.replace(/\s+/g, "").toUpperCase();
  const agent = bic ? `<FinInstnId><BICFI>${xml(bic)}</BICFI></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
  const zeit = a.erstelltAm.toISOString().replace(/\.\d{3}Z$/, "Z");

  const posten = a.posten
    .map(
      (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(sepaText(p.endToEndId, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betrag(p.betragCent)}</InstdAmt></Amt>
        <Cdtr><Nm>${xml(sepaText(p.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${normalisiereIban(p.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xml(id)}</MsgId>
      <CreDtTm>${zeit}</CreDtTm>
      <NbOfTxs>${anzahl}</NbOfTxs>
      <CtrlSum>${betrag(summe)}</CtrlSum>
      <InitgPty><Nm>${xml(sepaText(a.auftraggeber.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xml(id)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${anzahl}</NbOfTxs>
      <CtrlSum>${betrag(summe)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${a.ausfuehrungAm}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${xml(sepaText(a.auftraggeber.name, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${normalisiereIban(a.auftraggeber.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${agent}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${posten}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
