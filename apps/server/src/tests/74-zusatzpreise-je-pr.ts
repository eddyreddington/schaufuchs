/**
 * Gestiftete Preisarten mit „zusätzlich je Preisrichter“: Die Zusatzpreise ohne Stiftung zählen je Preisrichter (bei
 * Kontingent „je Schau“ für die ganze Schau), Preise aus einer Stiftung weiter gegen die Stiftung. Vergabe, Seite
 * „Preise“, Prüfliste, Freigabe und Preisverteilung zählen gleich. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText } from "./kontext";

describe("Zusatzpreise je Preisrichter", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const art = { betragCent: 0, sachpreis: "", schluesselProTiere: null, anzahlProSchluessel: 0, mindestpunkte: null, rundung: "voll" as const };
  let id = 0;
  let tiere: { id: number; katalogNr: number | null }[] = [];
  let anna = { id: 0, name: "Anna Ahorn" };
  let bert = { id: 0, name: "Bert Birke" };
  let zp = 0;
  let pe = 0;
  let stiftungId = 0;
  let sued = 0;
  const zpZeile = async () =>
    (await al().preise.uebersicht({ schauId: id })).kontingente.map((k) => `${k.name}: ${k.arten.filter((a) => a.preisartId === zp).map((a) => `${a.vergeben}/${a.verfuegbar}`).join("")}`);
  const ohne = (i: number) => al().preise.vergeben({ schauId: id, katalogeintragId: tiere[i]!.id, preisartId: zp, ohneStiftung: true });

  test("je Preisrichter: jeder nur seine Zusatzpreise, Stiftungen unberührt", async () => {
    ({ id } = await al().schau.anlegen({ name: "Zusatzzählschau", ort: "Halle" }));
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const aussteller = { vorname: "Zita", nachname: "Zählgeheim", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false };
    const r = await al().meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: 7 }, () => pos) });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    tiere = (await al().katalog.liste({ schauId: id })).sort((a, b) => a.katalogNr! - b.katalogNr!);
    const nr = (i: number) => tiere[i]!.katalogNr!;

    // ZP: 1 zusätzlich je Preisrichter (5 €), dazu eine Stiftung über 2 Preise; PE: nur gestiftet, ohne Zusatzpreise.
    await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "ZP", name: "Zusatzplakette", betragCent: 500, quelle: "stiftung", anzahlProPreisrichter: 1, folge: 90 });
    await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "PE", name: "Plakette", quelle: "stiftung", anzahlProPreisrichter: 0, folge: 91 });
    const arten = (await al().preise.uebersicht({ schauId: id })).preisarten;
    zp = arten.find((a) => a.kuerzel === "ZP")!.id;
    pe = arten.find((a) => a.kuerzel === "PE")!.id;
    await al().preise.stiftungSpeichern({ schauId: id, stifter: "Kreisverband Nord", preisartId: zp, anzahl: 2, betragCent: 2000, vorgabe: "", eingegangenAm: null });
    await al().preise.stiftungSpeichern({ schauId: id, stifter: "Verband Ost", preisartId: pe, anzahl: 2, betragCent: 0, vorgabe: "", eingegangenAm: null });
    await al().preise.stiftungSpeichern({ schauId: id, stifter: "Kreisverband Süd", preisartId: zp, anzahl: 1, betragCent: 0, vorgabe: "", eingegangenAm: null });
    [stiftungId, sued] = (await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.preisartId, zp))).map((st) => st.id).sort((x, y) => x - y) as [number, number];
    for (const name of [anna.name, bert.name]) await al().preisrichter.speichern({ schauId: id, name, anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
    const pr = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id))).sort((a, b) => a.name.localeCompare(b.name));
    anna = pr[0]!;
    bert = pr[1]!;
    // Anna: Tiere 0–3, Bert: 4–5, Tier 6 ohne Preisrichter.
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: anna.id, vonNr: nr(0), bisNr: nr(3) }, { preisrichterId: bert.id, vonNr: nr(4), bisNr: nr(5) }] });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
    for (const t of tiere) {
      await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t.id));
      await al().bewertung.setzen({ schauId: id, katalogeintragId: t.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
    }
    await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, id));

    // Anna vergibt ihren einen Zusatzpreis; einen zweiten nicht, auch wenn Bert seinen noch nicht genutzt hat.
    await ohne(0);
    await expect(ohne(1)).rejects.toThrow("ausgeschöpft");
    expect(await zpZeile()).toEqual(["Anna Ahorn: 1/1", "Bert Birke: 0/1"]);
    await ohne(4);
    // Ohne Preisrichter kein Zusatzpreis, wohl aber ein Preis aus einer Stiftung (zählt nur gegen die Stiftung).
    await expect(ohne(6)).rejects.toThrow("keinem Preisrichter");
    await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[6]!.id, preisartId: zp, stiftungId: sued });
    expect(await zpZeile()).toEqual(["Anna Ahorn: 1/1", "Bert Birke: 1/1"]);

    // Preise aus der Stiftung zählen gegen die Stiftung, nicht gegen Annas Zusatzpreis: beide an Annas Tiere.
    await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[1]!.id, preisartId: zp, stiftungId });
    await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[2]!.id, preisartId: zp });
    const ausStiftung = (await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.preisartId, zp))).filter((v) => v.stiftungId === stiftungId);
    expect(ausStiftung.map((v) => v.betragCent).sort()).toEqual([1000, 1000]);
    expect(await zpZeile()).toEqual(["Anna Ahorn: 1/1", "Bert Birke: 1/1"]);
    // Stiftung leer, Berts Zusatzpreis vergeben: kein weiterer ZP an Berts Tier.
    await expect(al().preise.vergeben({ schauId: id, katalogeintragId: tiere[5]!.id, preisartId: zp })).rejects.toThrow("ausgeschöpft");

    // PE ohne „zusätzlich je Preisrichter“: nur aus der Stiftung, nicht bewusst ohne.
    await expect(al().preise.vergeben({ schauId: id, katalogeintragId: tiere[0]!.id, preisartId: pe, ohneStiftung: true })).rejects.toThrow("Diesen Preis gibt es nur aus einer Stiftung.");
    await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[0]!.id, preisartId: pe });

    // Das Tablet zeigt nur die Kontingente aus dem Standgeld; gestiftete Preise vergibt die Ausstellungsleitung.
    const tablet = m.appRouter.createCaller({ ...leer, richter: { id: bert.id, schauId: id, name: bert.name, istObmann: false } });
    expect((await tablet.richter.daten()).kontingent.map((a) => a.preisartId)).not.toContain(zp);
    await expect(tablet.richter.preisVergeben({ katalogeintragId: tiere[5]!.id, preisartId: zp })).rejects.toThrow("Ausstellungsleitung");

    // Prüfliste: nichts überzogen, nichts ungedeckt.
    const pkt = await (await import("../services/pruefung")).checkliste(id);
    expect(pkt.filter((p) => /ZP|PE/.test(p.text) && p.art === "fehler")).toEqual([]);
  });

  test("je Schau: Zusatzpreise zählen für die ganze Schau", async () => {
    await m.db.update(m.schema.schau).set({ kontingentJe: "schau" }).where(m.eq(m.schema.schau.id, id));
    expect(await zpZeile()).toEqual(["Gesamte Schau: 2/2"]);
    await expect(ohne(3)).rejects.toThrow("ausgeschöpft");
    // Berts Zusatzpreis entfernt: Anna darf ihn nutzen – das Kontingent gilt für alle gemeinsam.
    const bertsPreis = (await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.katalogeintragId, tiere[4]!.id)))[0]!;
    await al().preise.entfernen({ schauId: id, preisvergabeId: bertsPreis.id });
    await ohne(3);
    expect(await zpZeile()).toEqual(["Gesamte Schau: 2/2"]);
    await expect(ohne(6)).rejects.toThrow("keinem Preisrichter");
  });

  test("zurück auf je Preisrichter: überzogen in Prüfliste, Freigabe und Preisverteilung", async () => {
    await m.db.update(m.schema.schau).set({ kontingentJe: "preisrichter" }).where(m.eq(m.schema.schau.id, id));
    expect(await zpZeile()).toEqual(["Anna Ahorn: 2/1", "Bert Birke: 0/1"]);
    const pkt = await (await import("../services/pruefung")).checkliste(id);
    expect(pkt.find((p) => p.art === "fehler" && p.text.startsWith("Kontingent überschritten"))?.text).toContain("Anna Ahorn: 2 von 1 ZP");
    // Freie Zusatzpreise sind kein Hinweis (sie sind ein Angebot), überzogene sperren die Freigabe.
    expect(pkt.find((p) => p.text.startsWith("Nicht vergebene Preise"))?.text ?? "").not.toContain("ZP");
    await expect(al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true })).rejects.toThrow("ZP 2 von 1 (Anna Ahorn)");
    // Schon freigegeben (z. B. nach der alten Zählung verteilt): überzogene Zusatzpreise nur als Hinweis, kein roter Punkt.
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, id));
    const frei = await (await import("../services/pruefung")).checkliste(id);
    expect(frei.filter((p) => p.art === "fehler" && /ZP/.test(p.text))).toEqual([]);
    expect(frei.find((p) => p.art === "hinweis" && p.text.startsWith("Kontingent überschritten"))?.text).toContain("Anna Ahorn: 2 von 1 ZP");
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: false }).where(m.eq(m.schema.schau.id, id));

    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const app = (await import("../index")).default;
      const blatt = async (pr: number) => pdfText(Buffer.from(await (await app.fetch(new Request(`http://test/datei/${id}/preisverteilung.pdf?preisrichter=${pr}`, { headers: { cookie } }))).arrayBuffer()));
      const a = await blatt(anna.id);
      // Annas Blatt: zwei Preise aus der Stiftung, zwei ohne – einer davon (der letzte) über dem Kontingent.
      expect(a.match(/ZP Zusatzplakette/g)!.length).toBe(4);
      expect(a.match(/über dem Kontingent/g)!.length).toBe(1);
      expect(a).toMatch(new RegExp(`ZP Zusatzplakette\\s+${tiere[3]!.katalogNr}\\s+5,00 €\\s+über dem Kontingent`));
      expect(a).not.toContain("Zählgeheim");
      // Bert: seine eine Zeile leer, nichts überzählig.
      const b = await blatt(bert.id);
      expect(b.match(/ZP Zusatzplakette/g)!.length).toBe(1);
      expect(b).not.toContain("über dem Kontingent");
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Freigabe: Preise ohne Stiftung bei Preisart ohne Zusatzpreise sind nicht gedeckt", async () => {
    // Je Schau: die Zusatzpreise passen (2/2), es bleibt nur die fehlende Deckung bei PE.
    await m.db.update(m.schema.schau).set({ kontingentJe: "schau" }).where(m.eq(m.schema.schau.id, id));
    // Zwei PE ohne Stiftung (z. B. aus der Zeit vor der Stiftungszuordnung), dazu der eine aus der Stiftung: 3 von 2.
    const ohneSt = await m.db
      .insert(m.schema.preisvergabe)
      .values([1, 2].map((i) => ({ katalogeintragId: tiere[i]!.id, preisartId: pe, preisrichterId: anna.id, betragCent: 0, stiftungId: null })))
      .returning();
    try {
      await expect(al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true })).rejects.toThrow("Stiftungspreise nicht gedeckt: PE 3 vergeben, 2 gestiftet");
    } finally {
      for (const v of ohneSt) await m.db.delete(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.id, v.id));
    }
  });
});
