/**
 * Überweisung mit Referenz und GiroCode (Entscheidung 021): nur mit vollständigem Vereinskonto, Referenz je Meldung im
 * Verwendungszweck, Code über den offenen Betrag – auf Dankseite, „Meine Meldung“, in der Mail, im vorausgefüllten
 * A-Bogen und im B-Bogen. Ohne Schalter bleibt alles wie bisher.
 */
import { describe, expect, test } from "bun:test";
import { rfReferenz, texte } from "@schau/domain";
import { adminKontext, leer, m, pdfText } from "./kontext";

describe("GiroCode und Referenz", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const pub = () => m.appRouter.createCaller({ ...leer, ip: "198.51.100.59" });
  const KONTO = { vereinKontoinhaber: "Geflügelzuchtverein Girostadt e.V.", vereinIban: "DE89370400440532013000", vereinBic: "" };
  let slug = "";
  let schauId = 0;
  let farbeId = 0;
  const schauRow = async () => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId)))[0]!;
  const einstellen = async (werte: Record<string, unknown>) => al().schau.aktualisieren({ id: schauId, daten: { ...(await al().schau.get({ id: schauId })), ...werte } });
  const mailAn = async (an: string) => (await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an)).orderBy(m.schema.postausgang.id)).at(-1)!;
  const melden = (vorname: string, email: string, reg: string, sprache: "de" | "en" = "de") =>
    pub().oeffentlich.melden({
      slug,
      sprache,
      aussteller: { vorname, nachname: "Girotest", strasse: "Weg 1", plz: "34117", ort: "Kassel", telefon: "", email, verein: "GZV", kreisverband: "", registriernummer: reg, geburtsdatum: null },
      istJugend: false,
      istPreisrichter: false,
      positionen: [{ farbenschlagId: farbeId, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      zustimmung: true,
      erklaerungen: true,
      stiftung: null,
      bemerkung: "",
    });
  const meldungZu = async (token: string) => (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, token)))[0]!;

  test("Schalter nur mit vollständigem Vereinskonto; außerhalb des EWR mit BIC", async () => {
    const s = await al().schau.anlegen({ name: "Giroschau", ort: "Kassel" });
    schauId = s.id;
    const d = await al().schau.get({ id: s.id });
    slug = d.slug;
    await expect(einstellen({ girocode: true, vereinKontoinhaber: "", vereinIban: "" })).rejects.toThrow("Für den GiroCode bitte Kontoinhaber und IBAN");
    await expect(einstellen({ girocode: true, ...KONTO, vereinKontoinhaber: "" })).rejects.toThrow("Für den GiroCode bitte Kontoinhaber und IBAN");
    await expect(einstellen({ girocode: true, ...KONTO, vereinIban: "CH9300762011623852957" })).rejects.toThrow("außerhalb des EWR");
    await expect(einstellen({ girocode: true, ...KONTO, vereinKontoinhaber: "V".repeat(71) })).rejects.toThrow("höchstens 70 Zeichen");
    // Außerhalb des EWR mit BIC geht.
    await einstellen({ girocode: true, ...KONTO, vereinIban: "CH9300762011623852957", vereinBic: "UBSWCHZH80A" });
    // Bei Zahlung bei der Einlieferung spielt der Schalter keine Rolle – kein Konto nötig.
    await einstellen({ girocode: true, zahlungBeiEinlieferung: true, vereinKontoinhaber: "", vereinIban: "" });
    await einstellen({ girocode: true, zahlungBeiEinlieferung: false, ...KONTO, bankverbindung: "Freier Text, IBAN DE00 0000", bewertungAm: "2026-11-21", erklaerungen: "Nicht aus Sperrbezirk." });
    await al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 300, befreitPreisrichter: false }] });
    farbeId = (await al().stammdaten.suche({ versionId: d.stammdatenVersionId!, q: "Wyandotten weiß" }))[0]!.id;
    await al().schau.phaseSetzen({ id: schauId, phase: "meldung", trotzdem: true });
    // Aussteller sehen das Vereinskonto (wie im Code), nicht den freien Text.
    expect((await pub().oeffentlich.schau({ slug })).bankverbindung).toBe("Geflügelzuchtverein Girostadt e.V., IBAN DE89 3704 0044 0532 0130 00");
  });

  test("Online-Meldung: Referenz im Verwendungszweck, Code über den offenen Betrag, Mail mit Zweck", async () => {
    const r = await melden("Gerda", "gerda@test.de", "06 535 012 0591");
    const md = await meldungZu(r.token);
    const zweck = `${rfReferenz(md.id)} Meldegeld Girotest, Gerda`;
    expect(r.ueberweisung?.zweck).toBe(zweck);
    expect(r.ueberweisung?.giroCode?.split("\n")).toEqual(["BCD", "002", "1", "SCT", "", KONTO.vereinKontoinhaber, KONTO.vereinIban, "EUR3.00", "", "", zweck]);
    const mail = await mailAn("gerda@test.de");
    expect(mail.text).toContain(`Bankverbindung: Geflügelzuchtverein Girostadt e.V., IBAN DE89 3704 0044 0532 0130 00\nVerwendungszweck: ${zweck}\n${texte("de").mail.giroCode}`);
    expect(mail.text).not.toContain("Freier Text");

    // „Meine Meldung“: gleicher Zweck; nach einer Teilzahlung nur noch der Rest im Code, bezahlt kein Code mehr.
    const meine = () => pub().oeffentlich.meineMeldung({ slug, token: r.token });
    expect((await meine()).ueberweisung).toEqual(r.ueberweisung);
    await al().meldung.zahlungErfassen({ meldungId: md.id, betragCent: 100, datum: "2026-11-02", art: "ueberweisung" });
    expect((await meine()).ueberweisung?.giroCode?.split("\n")[7]).toBe("EUR2.00");
    await al().meldung.zahlungErfassen({ meldungId: md.id, betragCent: 200, datum: "2026-11-03", art: "ueberweisung" });
    expect((await meine()).ueberweisung).toBeNull();
  });

  test("Mail in der Sprache der Meldung; storniert ohne Code", async () => {
    const r = await melden("Eddie", "eddie@test.de", "06 535 012 0592", "en");
    const md = await meldungZu(r.token);
    expect((await mailAn("eddie@test.de")).text).toContain(`Payment reference: ${rfReferenz(md.id)} Meldegeld Girotest, Eddie`);
    await al().meldung.statusSetzen({ id: md.id, status: "storniert", grund: "Test" });
    expect((await pub().oeffentlich.meineMeldung({ slug, token: r.token })).ueberweisung).toBeNull();
  });

  test("PDF: vorausgefüllter A-Bogen und B-Bogen mit Zweck, A-Bogen bleibt gleich lang; leerer Bogen ohne Referenz", async () => {
    const { aBogenPdf } = await import("../pdf/a-bogen");
    const { ausstellerUnterlagenPdf } = await import("../pdf/dokumente");
    const r = await melden("Paul", "paul@test.de", "06 535 012 0593");
    const md = await meldungZu(r.token);
    const ref = rfReferenz(md.id);
    const mitCode = pdfText((await aBogenPdf(await schauRow(), md.id))!);
    expect(mitCode).toContain(ref);
    expect(mitCode).toContain("Verwendungszweck");
    const leerBogen = pdfText((await aBogenPdf(await schauRow()))!);
    expect(leerBogen).not.toContain("RF");
    // Zweispaltig gesetzt: pdftotext mischt die Zeilen beider Spalten, daher die Teile einzeln.
    expect(leerBogen).toContain("Geflügelzuchtverein Girostadt e.V., IBAN");
    expect(leerBogen).toContain("DE89 3704 0044 0532 0130 00");
    // B-Bogen gibt es für bestätigte Meldungen; hier noch mit offenem Betrag.
    await al().meldung.statusSetzen({ id: md.id, status: "bestaetigt" });
    expect(pdfText(await ausstellerUnterlagenPdf(await schauRow(), [md.id]))).toContain(ref);

    // Gegenprobe ohne Schalter: freier Text, kein Zweck, keine Referenz – und der A-Bogen hat gleich viele Seiten.
    await einstellen({ girocode: false });
    const ohne = pdfText((await aBogenPdf(await schauRow(), md.id))!);
    expect(ohne).not.toContain(ref);
    expect(ohne).toContain("Freier Text");
    expect(ohne.split("\f").length).toBe(mitCode.split("\f").length);
    expect(pdfText(await ausstellerUnterlagenPdf(await schauRow(), [md.id]))).not.toContain(ref);
    expect((await pub().oeffentlich.meineMeldung({ slug, token: r.token })).ueberweisung).toBeNull();
    await al().meldung.bestaetigungSenden({ id: md.id });
    expect((await mailAn("paul@test.de")).text).not.toContain("Verwendungszweck");
    expect((await mailAn("paul@test.de")).text).toContain("Bankverbindung: Freier Text, IBAN DE00 0000");
  });

  test("Kein zweiter Zahlweg: kein Code bei Lastschrift, ab der Einlieferung und bei Zahlung bei der Einlieferung", async () => {
    await einstellen({ girocode: true, zahlungBeiEinlieferung: false });
    const meine = async (token: string) => (await pub().oeffentlich.meineMeldung({ slug, token })).ueberweisung;
    const a = await melden("Lars", "lars@test.de", "06 535 012 0594");
    const b = await melden("Lea", "lea@test.de", "06 535 012 0595");
    expect(await meine(a.token)).not.toBeNull();
    // Gültiges Mandat: das Meldegeld wird eingezogen – kein GiroCode, sonst zahlte der Aussteller doppelt.
    await al().lastschrift.mandatAnlegen({ ausstellerId: (await meldungZu(a.token)).ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" });
    expect(await meine(a.token)).toBeNull();
    expect(await meine(b.token)).not.toBeNull();

    // Fehlt das Feld beim Speichern (älterer Browser-Tab), bleibt der Code an.
    const { girocode: _weg, ...ohneFeld } = await al().schau.get({ id: schauId });
    await al().schau.aktualisieren({ id: schauId, daten: ohneFeld });
    expect((await schauRow()).girocode).toBe(true);

    // Zahlung bei der Einlieferung: kein Code und der freie Text, obwohl der Schalter in der Datenbank an ist.
    await einstellen({ zahlungBeiEinlieferung: true });
    expect(await meine(b.token)).toBeNull();
    expect((await pub().oeffentlich.schau({ slug })).bankverbindung).toBe("Freier Text, IBAN DE00 0000");
    await einstellen({ zahlungBeiEinlieferung: false });
    expect(await meine(b.token)).not.toBeNull();

    // Ab der Einlieferung zahlt man an der Kasse bzw. wird verrechnet: kein Code mehr.
    await al().schau.phaseSetzen({ id: schauId, phase: "einlieferung", trotzdem: true, grund: "Test" });
    expect(await meine(b.token)).toBeNull();
  });

  test("Neue Schau aus der Vorlage übernimmt die Einstellung", async () => {
    const neu = await al().schau.anlegen({ name: "Giroschau 2027", ort: "Kassel", vorlageId: schauId });
    expect((await al().schau.get({ id: neu.id })).girocode).toBe(true);
  });
});
