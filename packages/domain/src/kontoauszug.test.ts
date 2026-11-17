import { describe, expect, test } from "bun:test";
import { EingabeFehler } from "./eingabefehler";
import { rfReferenz } from "./girocode";
import { buchungsSchluessel, dekodiere, leseKontoauszug, ordneZu, type Buchung } from "./kontoauszug";

const bytes = (s: string) => new TextEncoder().encode(s);

// Erfundener Auszug im Aufbau camt.053.001.08 (zwei Gutschriften, davon eine Sammelbuchung, eine Lastschrift).
const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
<BkToCstmrStmt><Stmt><Id>1</Id>
<Ntry>
  <Amt Ccy="EUR">25.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
  <BookgDt><Dt>2026-11-02</Dt></BookgDt><AcctSvcrRef>BANK-1</AcctSvcrRef>
  <NtryDtls><TxDtls>
    <RltdPties><Dbtr><Pty><Nm>Hans M&#252;ller</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>DE02120300000000202051</IBAN></Id></DbtrAcct></RltdPties>
    <RmtInf><Ustrd>${rfReferenz(1234)} Meldegeld Mueller, Hans</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>
<Ntry>
  <Amt Ccy="EUR">40.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
  <BookgDt><DtTm>2026-11-03T10:15:00</DtTm></BookgDt>
  <NtryDtls>
    <TxDtls><Amt Ccy="EUR">15.00</Amt><RltdPties><Dbtr><Nm>Erna &amp; Kurt Schmidt</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Meldegeld</Ustrd><Ustrd> Schmidt</Ustrd></RmtInf></TxDtls>
    <TxDtls><Amt Ccy="EUR">25.00</Amt><RltdPties><Dbtr><Nm>Paul Wagner</Nm></Dbtr></RltdPties><RmtInf><Strd><CdtrRefInf><Ref>${rfReferenz(77)}</Ref></CdtrRefInf></Strd></RmtInf></TxDtls>
  </NtryDtls>
</Ntry>
<Ntry>
  <Amt Ccy="EUR">9.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-11-03</Dt></BookgDt>
  <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Druckerei</Nm></Cdtr></RltdPties></TxDtls></NtryDtls>
</Ntry>
</Stmt></BkToCstmrStmt></Document>`;

// Erfundene Exporte nach den üblichen Spaltennamen deutscher Banken.
const CSV_SPARKASSE = [
  `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"`,
  `"DE89370400440532013000";"02.11.26";"02.11.26";"GUTSCHR. UEBERWEISUNG";"${rfReferenz(1234)} Meldegeld Mueller; Hans";"";"";"";"";"";"";"Hans Müller";"DE02120300000000202051";"BYLADEM1001";"25,50";"EUR";"Umsatz gebucht"`,
  `"DE89370400440532013000";"03.11.26";"03.11.26";"FOLGELASTSCHRIFT";"Strom";"";"";"";"";"";"";"Stadtwerke";"DE02100500000054540402";"";"-1.234,00";"EUR";"Umsatz gebucht"`,
].join("\r\n");

const CSV_VOLKSBANK = [
  `Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz`,
  `Vereinskonto;DE89370400440532013000;;Testbank;04.11.2026;04.11.2026;Paul Wagner;DE02120300000000202051;;Gutschrift;RF 77 noch was;1.025,00;EUR;100,00;;;;;`,
].join("\n");

describe("Kontoauszug lesen", () => {
  test("camt.053: nur Gutschriften in Euro, Sammelbuchung in Einzelposten, Referenz aus Text oder Feld", () => {
    const b = leseKontoauszug(bytes(CAMT));
    expect(b.map((x) => [x.datum, x.betragCent, x.name])).toEqual([
      ["2026-11-02", 2550, "Hans Müller"],
      ["2026-11-03", 1500, "Erna & Kurt Schmidt"],
      ["2026-11-03", 2500, "Paul Wagner"],
    ]);
    expect(b[0]!.iban).toBe("DE02120300000000202051");
    expect(b[0]!.zweck).toBe(`${rfReferenz(1234)} Meldegeld Mueller, Hans`);
    expect(b[1]!.zweck).toBe("Meldegeld Schmidt");
    expect(b[2]!.zweck).toBe(rfReferenz(77));
  });

  test("camt mit Namensraum-Präfix", () => {
    const mitPraefix = CAMT.replace(/<(\/?)([A-Za-z])/g, "<$1c:$2").replace("<c:?xml", "<?xml").replace('<c:Document xmlns=', '<c:Document xmlns:c=');
    expect(leseKontoauszug(bytes(mitPraefix)).map((x) => x.betragCent)).toEqual([2550, 1500, 2500]);
  });

  test("CSV Sparkasse (CSV-CAMT): Semikolon, Anführungszeichen, Datum zweistellig, Lastschrift ignoriert", () => {
    const b = leseKontoauszug(bytes(CSV_SPARKASSE));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ datum: "2026-11-02", betragCent: 2550, name: "Hans Müller", iban: "DE02120300000000202051" });
    expect(b[0]!.zweck).toContain("Mueller; Hans");
  });

  test("CSV Volksbank: ohne Anführungszeichen, Tausenderpunkt", () => {
    const b = leseKontoauszug(bytes(CSV_VOLKSBANK));
    expect(b).toEqual([{ datum: "2026-11-04", betragCent: 102500, name: "Paul Wagner", iban: "DE02120300000000202051", zweck: "RF 77 noch was" }]);
  });

  test("Zeichensatz: Windows-1252 (ältere Exporte) wird erkannt", () => {
    const latin = new Uint8Array([...bytes("Buchungstag;Betrag;Verwendungszweck;Name Zahlungsbeteiligter\n01.11.2026;5,00;x;M"), 0xfc, ...bytes("ller")]);
    expect(dekodiere(latin)).toContain("Müller");
    expect(leseKontoauszug(latin)[0]!.name).toBe("Müller");
  });

  test("altes VR-Format: Soll/Haben-Kennzeichen, Saldo-Zeilen verworfen", () => {
    const vr = [
      `"Buchungstag";"Valuta";"Auftraggeber/Zahlungsempfänger";"Empfänger/Zahlungspflichtiger";"Konto-Nr.";"IBAN";"BLZ";"BIC";"Vorgang/Verwendungszweck";"Kundenreferenz";"Währung";"Umsatz";" "`,
      `"02.11.2026";"02.11.2026";"Verein";"Hans Müller";"";"DE02120300000000202051";"";"";"Meldegeld";"";"EUR";"25,50";"H"`,
      `"03.11.2026";"03.11.2026";"Verein";"Druckerei";"";"";"";"";"Rechnung";"";"EUR";"12,00";"S"`,
      `"01.11.2026";"";"";"";"";"";"";"";"Anfangssaldo";"";"EUR";"1.000,00";"H"`,
      `"30.11.2026";"";"";"";"";"";"";"";"Endsaldo";"";"EUR";"1.013,50";"H"`,
    ].join("\n");
    expect(leseKontoauszug(bytes(vr)).map((x) => [x.betragCent, x.zweck])).toEqual([[2550, "Meldegeld"]]);
  });

  test("vorgemerkte Umsätze werden nicht gelesen (Sparkasse „Info“, DKB „Status“, camt nur BOOK)", () => {
    const spk = CSV_SPARKASSE.replace("Umsatz gebucht", "Umsatz vorgemerkt");
    expect(leseKontoauszug(bytes(spk))).toHaveLength(0);
    const dkb = `"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)"\n"03.11.26";"03.11.26";"Vorgemerkt";"Ina Kurz";"Verein";"Meldegeld";"Eingang";"DE02120300000000202051";"30,00 €"\n"04.11.26";"04.11.26";"Gebucht";"Ina Kurz";"Verein";"Meldegeld";"Eingang";"DE02120300000000202051";"30,00 €"`;
    expect(leseKontoauszug(bytes(dkb)).map((x) => [x.datum, x.betragCent, x.name])).toEqual([["2026-11-04", 3000, "Ina Kurz"]]);
    const info = CAMT.replace("<Sts><Cd>BOOK</Cd></Sts>", "<Sts><Cd>INFO</Cd></Sts>");
    expect(leseKontoauszug(bytes(info)).map((x) => x.betragCent)).toEqual([1500, 2500]);
  });

  test("Sammelbuchung ohne Einzelbeträge: ein Posten über den Gesamtbetrag, nie vervielfacht", () => {
    const sammler = CAMT.replace('<TxDtls><Amt Ccy="EUR">15.00</Amt>', "<TxDtls>").replace('<TxDtls><Amt Ccy="EUR">25.00</Amt>', "<TxDtls>");
    const b = leseKontoauszug(bytes(sammler));
    expect(b.map((x) => x.betragCent)).toEqual([2550, 4000]);
    expect(b[1]!.zweck).toContain(rfReferenz(77));
  });

  test("Fremdwährung auch mit einfachen Anführungszeichen; ungültiges oder fehlendes Datum verworfen", () => {
    expect(leseKontoauszug(bytes(CAMT.replace('<Amt Ccy="EUR">25.50</Amt>', "<Amt Ccy='USD'>25.50</Amt>"))).map((x) => x.betragCent)).toEqual([1500, 2500]);
    expect(leseKontoauszug(bytes(CAMT.replace("<BookgDt><Dt>2026-11-02</Dt></BookgDt>", "")))).toHaveLength(2);
    const csv = "Buchungstag;Betrag;Verwendungszweck\n31.02.2026;5,00;a\n2026-13-45;5,00;b\n28.02.2026;5,00;c";
    expect(leseKontoauszug(bytes(csv)).map((x) => x.zweck)).toEqual(["c"]);
  });

  test("weitere Banken: ING (Auftraggeber/Empfänger), getrennte Spalten Soll und Haben, Commerzbank (Buchungstext)", () => {
    const ing = "Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung\n02.11.2026;02.11.2026;Ina Kurz;Gutschrift;Meldegeld;100,00;EUR;30,00;EUR";
    expect(leseKontoauszug(bytes(ing))[0]).toMatchObject({ name: "Ina Kurz", betragCent: 3000 });
    const sh = "Buchungstag;Wert;Umsatzart;Begünstigter / Auftraggeber;Verwendungszweck;IBAN;Soll;Haben;Währung\n02.11.2026;02.11.2026;Gutschrift;Ina Kurz;Meldegeld;DE1;;30,00;EUR\n03.11.2026;03.11.2026;Lastschrift;Strom;x;DE2;-40,00;;EUR";
    expect(leseKontoauszug(bytes(sh)).map((x) => [x.name, x.betragCent])).toEqual([["Ina Kurz", 3000]]);
    const cb = `Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;Auftraggeberkonto;Bankleitzahl Auftraggeberkonto;IBAN Auftraggeberkonto;Kategorie\n02.11.2026;02.11.2026;Gutschrift;Ina Kurz ${rfReferenz(9)} Meldegeld;30,00;EUR;;;DE1;`;
    expect(leseKontoauszug(bytes(cb))[0]!.zweck).toContain(rfReferenz(9));
  });

  test("unbekanntes Format: verständlicher Fehler", () => {
    expect(() => leseKontoauszug(bytes("Hallo Welt\n1;2;3"))).toThrow("Spalten");
    expect(() => leseKontoauszug(bytes("<html><body>kein Auszug</body></html>"))).toThrow("camt");
    // Der Server darf beides wörtlich zeigen (EingabeFehler).
    for (const inhalt of ["Hallo Welt\n1;2;3", "<html><body>kein Auszug</body></html>"]) expect(() => leseKontoauszug(bytes(inhalt))).toThrow(EingabeFehler);
  });
});

describe("Zuordnung zu Meldungen", () => {
  const meldungen = [
    { id: 1234, nachname: "Müller", vorname: "Hans", offenCent: 2550 },
    { id: 77, nachname: "Wagner", vorname: "Paul", offenCent: 2500 },
    { id: 5, nachname: "Schmidt", vorname: "Erna", offenCent: 1500 },
    { id: 12, nachname: "Schmidt", vorname: "Kurt", offenCent: 1500 },
    { id: 9, nachname: "Kurz", vorname: "Ina", offenCent: 3000 },
  ];
  const b = (teil: Partial<Buchung>): Buchung => ({ datum: "2026-11-02", betragCent: 2550, name: "", iban: "", zweck: "", ...teil });

  test("Referenz im Text – auch mit Leerzeichen, klein geschrieben oder mit Anhang – ist sicher", () => {
    for (const zweck of [`${rfReferenz(1234)} Meldegeld`, "rf54 0001 234", `Meldegeld ${rfReferenz(1234)}2026`]) {
      expect(ordneZu([b({ zweck })], meldungen)[0]).toMatchObject({ meldungId: 1234, sicherheit: "referenz", hinweis: "passt" });
    }
  });

  test("Referenz mit falscher Prüfziffer oder fremder Meldung: keine Zuordnung über die Referenz", () => {
    expect(ordneZu([b({ zweck: "RF550001234" })], meldungen)[0]!.meldungId).toBeNull();
    expect(ordneZu([b({ zweck: rfReferenz(999) })], meldungen)[0]!.meldungId).toBeNull();
  });

  test("Teilzahlung und Überzahlung werden benannt", () => {
    expect(ordneZu([b({ zweck: rfReferenz(77), betragCent: 1000 })], meldungen)[0]!.hinweis).toBe("teilzahlung");
    expect(ordneZu([b({ zweck: rfReferenz(77), betragCent: 9000 })], meldungen)[0]!.hinweis).toBe("ueberzahlung");
  });

  test("gültige Referenz einer anderen Meldung: kein Rückfall auf den Namen", () => {
    expect(ordneZu([b({ name: "Ina Kurz", betragCent: 3000, zweck: rfReferenz(4711) })], meldungen)[0]!.meldungId).toBeNull();
  });

  test("Vorschlag nur aus dem Namen des Zahlers, nicht aus dem Verwendungszweck (Nachname „Hahn“ vs. „1 Hahn“)", () => {
    expect(ordneZu([b({ name: "Verein XY", zweck: "Meldegeld Kurz Ina", betragCent: 3000 })], meldungen)[0]!.meldungId).toBeNull();
  });

  test("ohne Referenz: Vorschlag nur bei eindeutigem Namen und passendem Betrag", () => {
    expect(ordneZu([b({ name: "Ina Kurz", betragCent: 3000 })], meldungen)[0]).toMatchObject({ meldungId: 9, sicherheit: "name" });
    // Betrag passt nicht: kein Vorschlag.
    expect(ordneZu([b({ name: "Ina Kurz", betragCent: 2000 })], meldungen)[0]!.meldungId).toBeNull();
    // Zwei Schmidts mit gleichem Betrag: nicht eindeutig.
    expect(ordneZu([b({ name: "Kurt Schmidt", betragCent: 1500 })], meldungen)[0]).toMatchObject({ meldungId: 12, sicherheit: "name" });
    expect(ordneZu([b({ name: "Familie Schmidt", betragCent: 1500 })], meldungen)[0]!.meldungId).toBeNull();
    // Nachname nur als Teil eines anderen Wortes zählt nicht („Kurzmann“ ist nicht „Kurz“).
    expect(ordneZu([b({ name: "Ina Kurzmann", betragCent: 3000 })], meldungen)[0]!.meldungId).toBeNull();
  });
});

describe("Schlüssel gegen Doppelbuchung", () => {
  test("gleiche Gutschriften werden durchgezählt, derselbe Auszug ergibt dieselben Schlüssel", () => {
    const x = { datum: "2026-11-02", betragCent: 2500, name: "A", iban: "DE1", zweck: "Z" };
    const k = buchungsSchluessel([x, { ...x }, { ...x, betragCent: 2600 }]);
    expect(new Set(k).size).toBe(3);
    expect(buchungsSchluessel([x, { ...x }, { ...x, betragCent: 2600 }])).toEqual(k);
    // Ein späterer Auszug mit nur einer der beiden gleichen Gutschriften trifft den ersten Schlüssel.
    expect(buchungsSchluessel([x])[0]).toBe(k[0]);
  });
});
