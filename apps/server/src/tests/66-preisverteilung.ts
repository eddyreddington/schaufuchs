/**
 * Preisverteilung je Preisrichter als PDF (/datei/:schauId/preisverteilung.pdf): je Preisart so viele Zeilen wie sein
 * Kontingent, vergebene mit Katalognummer, gestiftete nur vergeben; ohne Ausstellernamen (Entscheidung 005).
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("Preisverteilung je Preisrichter", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const hol = async (pfad: string, cookie = "") => (await import("../index")).default.fetch(new Request(`http://test${pfad}`, { headers: cookie ? { cookie } : {} }));
  const eintrag = (id: number, werte: object) => m.db.update(m.schema.katalogeintrag).set(werte as never).where(m.eq(m.schema.katalogeintrag.id, id));
  const phase = (id: number, p: string) => m.db.update(m.schema.schau).set({ phase: p as never }).where(m.eq(m.schema.schau.id, id));
  const art = { betragCent: 0, sachpreis: "", quelle: "standgeld" as const, schluesselProTiere: null, anzahlProSchluessel: 1, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll" as const };

  test("Kontingent als Zeilen, vergebene mit Nummer, gestiftete nur vergeben; einzeln, alle, Rechte", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const { id } = await al().schau.anlegen({ name: "Verteilschau", ort: "Halle" });
      const s = await al().schau.get({ id });
      const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
      const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
      const aussteller = { vorname: "Vera", nachname: "Verteilgeheim", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350150098", geburtsdatum: null, istPreisrichter: false };
      const r = await al().meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: 5 }, () => pos) });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      await al().katalog.nummernVergeben({ schauId: id });
      const tiere = (await al().katalog.liste({ schauId: id })).sort((a, b) => a.katalogNr! - b.katalogNr!);

      // Neben den Standardpreisen der Schau (E, Z auf 10 Tiere – hier 0): VE auf 2 Tiere einer (5 Tiere → 2), Band VB
      // einer je Preisrichter, gestifteter Preis PE: kein Kontingent je Preisrichter.
      await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "VE", name: "Verteilpreis", betragCent: 1000, schluesselProTiere: 2, folge: 10 });
      await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "VB", name: "Verteilband", anzahlProPreisrichter: 1, folge: 20 });
      await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "PE", name: "Plakette", sachpreis: "Plakette", quelle: "stiftung", anzahlProSchluessel: 0, folge: 90 });
      const arten = (await al().preise.uebersicht({ schauId: id })).preisarten;
      const pe = arten.find((a) => a.kuerzel === "PE")!;
      await al().preise.stiftungSpeichern({ schauId: id, stifter: "Kreisverband Nord", preisartId: pe.id, anzahl: 1, betragCent: 2000, vorgabe: "", eingegangenAm: null });

      await al().preisrichter.speichern({ schauId: id, name: "Anton Ahorn", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
      await al().preisrichter.speichern({ schauId: id, name: "Berta Birke", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
      const [ahorn, birke] = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id))).sort((a, b) => a.name.localeCompare(b.name));
      await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: ahorn!.id, vonNr: tiere[0]!.katalogNr!, bisNr: tiere[4]!.katalogNr! }] });

      await phase(id, "bewertung");
      for (const t of tiere) {
        await eintrag(t.id, { status: "eingeliefert" });
        await al().bewertung.setzen({ schauId: id, katalogeintragId: t.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
      }
      await phase(id, "preise");
      const e = arten.find((a) => a.kuerzel === "VE")!;
      await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[3]!.id, preisartId: e.id });
      await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[1]!.id, preisartId: pe.id });

      const antwort = await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${ahorn!.id}`, cookie);
      expect(antwort.status).toBe(200);
      expect(antwort.headers.get("content-type")).toContain("application/pdf");
      const text = pdfText(Buffer.from(await antwort.arrayBuffer()));
      for (const t of ["Preisverteilung", "Anton Ahorn", "VE Verteilpreis", "VB Verteilband", "PE Plakette", "Kreisverband Nord", "10,00", "20,00", "Gesamtwert"]) expect(text).toContain(t);
      // Zwei Zeilen VE (vergeben + frei), ein Band, eine Plakette: Gesamtwert 10 + 10 + 20 = 40 €, davon vergeben 30 €.
      expect(text.match(/VE Verteilpreis/g)!.length).toBe(2);
      expect(text).toContain("40,00");
      expect(text).toContain("davon vergeben 30,00");
      // Vergebene stehen mit Katalognummer und Betrag darin, freie ohne Nummer; die Ausstellerin nicht (Entscheidung 005).
      expect(text).toMatch(new RegExp(`\\b1\\s+VE Verteilpreis\\s+${tiere[3]!.katalogNr}\\s+10,00`));
      expect(text).toMatch(/\b2\s+VE Verteilpreis\s+10,00/);
      expect(text).not.toContain("Verteilgeheim");
      expect(text).not.toContain("Berta Birke");

      // Alle Preisrichter: jeder ab neuer Seite mit eigener Seitenzählung; Berta ohne Tiere hat nur ihr Band.
      const alle = pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf`, cookie)).arrayBuffer()));
      expect(alle.indexOf("Anton Ahorn")).toBeLessThan(alle.indexOf("Berta Birke"));
      expect(alle.match(/Seite 1 von/g)!.length).toBe(2);
      // Nur Preise an Tieren seiner Nummern: Antons Vergaben stehen nicht auf Bertas Blatt.
      const berta = pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${birke!.id}`, cookie)).arrayBuffer()));
      expect(berta).toContain("VB Verteilband");
      for (const t of ["VE Verteilpreis", "Kreisverband Nord", "Anton Ahorn"]) expect(berta).not.toContain(t);

      // Zweite Vergabe an eine kleinere Nummer: beide in Katalogfolge, keine freie Zeile mehr.
      await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[0]!.id, preisartId: e.id });
      const nr = (i: number) => tiere[i]!.katalogNr;
      const voll = pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${ahorn!.id}`, cookie)).arrayBuffer()));
      expect(voll).toMatch(new RegExp(`\\b1\\s+VE Verteilpreis\\s+${nr(0)}\\s+10,00`));
      expect(voll).toMatch(new RegExp(`\\b2\\s+VE Verteilpreis\\s+${nr(3)}\\s+10,00`));
      // Danach zwei Tiere als fehlend gemeldet (3 Tiere → VE nur noch 1): überzählig ist der Preis am fehlenden Tier.
      for (const i of [0, 1]) await eintrag(tiere[i]!.id, { status: "fehlt" });
      const weniger = pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${ahorn!.id}`, cookie)).arrayBuffer()));
      expect(weniger).toMatch(new RegExp(`\\b1\\s+VE Verteilpreis\\s+${nr(0)}\\s+10,00 €\\s+Tier fehlt · über dem Kontingent`));
      expect(weniger).toMatch(new RegExp(`\\b2\\s+VE Verteilpreis\\s+${nr(3)}\\s+10,00 €\\s*\\n`));

      // Kontingent für die ganze Schau: nur das Vergebene, keine leeren Zeilen.
      await m.db.update(m.schema.schau).set({ kontingentJe: "schau" }).where(m.eq(m.schema.schau.id, id));
      const ganz = pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${ahorn!.id}`, cookie)).arrayBuffer()));
      expect(ganz).toContain("gesamte Schau");
      expect(ganz.match(/VE Verteilpreis/g)!.length).toBe(2);
      expect(ganz).not.toContain("über dem Kontingent");
      expect(ganz).not.toContain("VB Verteilband");

      // Fremder oder unsinniger Preisrichter: 404; ohne Anmeldung: 403.
      expect((await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${birke!.id + 100000}`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=abc`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${id}/preisverteilung.pdf`)).status).toBe(403);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Preisrichter einer fremden Schau: nicht über die eigene abrufbar", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const a = await al().schau.anlegen({ name: "Verteilschau A", ort: "A" });
      const b = await al().schau.anlegen({ name: "Verteilschau B", ort: "B" });
      await al().preisrichter.speichern({ schauId: b.id, name: "Fremdrichter Verteil", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
      const [fremd] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, b.id));
      expect((await hol(`/datei/${a.id}/preisverteilung.pdf?preisrichter=${fremd!.id}`, cookie)).status).toBe(404);
      // Der Knopf „Preisverteilung (PDF)“ erscheint nur mit Preisrichtern – auch bei Kontingent für die ganze Schau.
      await m.db.update(m.schema.schau).set({ kontingentJe: "schau" }).where(m.eq(m.schema.schau.id, a.id));
      const ohne = await al().preise.uebersicht({ schauId: a.id });
      expect([ohne.kontingente.length, ohne.anzahlPreisrichter]).toEqual([1, 0]);
      expect((await al().preise.uebersicht({ schauId: b.id })).anzahlPreisrichter).toBe(1);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });
});
