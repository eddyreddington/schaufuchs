/**
 * Kleinere Ergänzungen: Rückfrage beim Laden und Entscheiden eines Hallenplan-Entwurfs, wenn der Katalog gedruckt ist
 * oder schon Tiere eingeliefert sind (Entscheidung 017); gestiftete Preise „zusätzlich je Preisrichter“ auf der
 * Preisverteilung jedes Preisrichters. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("Hallenplan-Entwurf: Rückfrage nach Druck und Einlieferung", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: true, quergang: true, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] };
  const zeile = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;

  test("gedruckt: ohne Bestätigung nur die Rückfrage, es ändert sich nichts; mit Bestätigung geladen", async () => {
    const { id } = await al().schau.anlegen({ name: "Rückfrageschau", ort: "Musterdorf" });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const { id: a } = await al().hallenentwurf.speichern({ schauId: id, name: "Schmal" });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, breite: 1400 } });
    await m.db.update(m.schema.schau).set({ katalogGedruckt: true }).where(m.eq(m.schema.schau.id, id));
    const protVorher = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).length;

    const r = await al().hallenentwurf.laden({ schauId: id, id: a });
    expect("rueckfrage" in r && r.rueckfrage).toContain("Katalog ist gedruckt");
    expect((await zeile(id)).halle!.breite).toBe(1400);
    // Entscheiden für den Entwurf: ebenso nur die Rückfrage – nichts geladen, nichts archiviert, kein Protokoll.
    const e = await al().hallenentwurf.entscheiden({ schauId: id, id: a });
    expect("rueckfrage" in e && e.rueckfrage).toContain("Katalog ist gedruckt");
    expect((await al().hallenentwurf.liste({ schauId: id })).entwuerfe.map((x) => x.id)).toEqual([a]);
    expect((await zeile(id)).halle!.breite).toBe(1400);
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).length).toBe(protVorher);

    const ok = await al().hallenentwurf.laden({ schauId: id, id: a, bestaetigt: true });
    expect("rueckfrage" in ok).toBe(false);
    expect((await zeile(id)).halle!.breite).toBe(1000);
  });

  test("eingelieferte Tiere: Rückfrage mit Anzahl; Entscheiden für den aktuellen Plan fragt nicht", async () => {
    const { id } = await al().schau.anlegen({ name: "Einliefer-Rückfrage", ort: "Musterdorf" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Rück", nachname: "Frage", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 3 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const { id: a } = await al().hallenentwurf.speichern({ schauId: id, name: "Erster" });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, breite: 1600 } });
    const { id: b } = await al().hallenentwurf.speichern({ schauId: id, name: "Zweiter" });
    const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id));
    // Noch nichts eingeliefert und nicht gedruckt: ohne Rückfrage.
    expect("rueckfrage" in (await al().hallenentwurf.laden({ schauId: id, id: a }))).toBe(false);
    expect((await zeile(id)).halle!.breite).toBe(1000);

    const status = (i: number, st: string) => m.db.update(m.schema.katalogeintrag).set({ status: st as never }).where(m.eq(m.schema.katalogeintrag.id, tiere[i]!.id));
    await status(0, "eingeliefert");
    const eins = await al().hallenentwurf.laden({ schauId: id, id: b });
    expect("rueckfrage" in eins && eins.rueckfrage).toBe("1 Tier ist schon eingeliefert – sitzt es nach dem Entwurf woanders, muss es in der Halle umgesetzt werden.");
    expect((await zeile(id)).halle!.breite).toBe(1000);
    // Fehlend und ausgesetzt zählen mit (der Käfig steht schon, das Tier war da).
    await status(1, "fehlt");
    await status(2, "ausgesetzt");
    const drei = await al().hallenentwurf.entscheiden({ schauId: id, id: b });
    expect("rueckfrage" in drei && drei.rueckfrage).toContain("3 Tiere sind schon eingeliefert");
    expect((await al().hallenentwurf.liste({ schauId: id })).entwuerfe).toHaveLength(2);
    expect((await zeile(id)).halle!.breite).toBe(1000);
    // Gedruckt und eingeliefert: beide Sätze.
    await m.db.update(m.schema.schau).set({ katalogGedruckt: true }).where(m.eq(m.schema.schau.id, id));
    const beide = await al().hallenentwurf.laden({ schauId: id, id: b });
    expect("rueckfrage" in beide && beide.rueckfrage).toMatch(/^3 Tiere .* Der Katalog ist gedruckt/);

    // Für den aktuellen Plan entscheiden ändert die Halle nicht – keine Rückfrage, die Entwürfe gehen ins Archiv.
    const aktuell = await al().hallenentwurf.entscheiden({ schauId: id });
    expect(aktuell).toEqual({ archiviert: 2 });
    // Mit Bestätigung: aus dem Archiv geladen.
    expect("rueckfrage" in (await al().hallenentwurf.laden({ schauId: id, id: b, bestaetigt: true }))).toBe(false);
    expect((await zeile(id)).halle!.breite).toBe(1600);
  });

  test("Entscheiden mit Bestätigung: geladen und archiviert", async () => {
    const { id } = await al().schau.anlegen({ name: "Entscheid-Rückfrage", ort: "Musterdorf" });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const { id: a } = await al().hallenentwurf.speichern({ schauId: id, name: "Eins" });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, breite: 1200 } });
    await al().hallenentwurf.speichern({ schauId: id, name: "Zwei" });
    await m.db.update(m.schema.schau).set({ katalogGedruckt: true }).where(m.eq(m.schema.schau.id, id));
    expect(await al().hallenentwurf.entscheiden({ schauId: id, id: a, bestaetigt: true })).toEqual({ archiviert: 1 });
    expect((await zeile(id)).halle!.breite).toBe(1000);
  });
});

describe("Preisverteilung: gestiftet zusätzlich je Preisrichter", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const hol = async (pfad: string, cookie: string) => (await import("../index")).default.fetch(new Request(`http://test${pfad}`, { headers: { cookie } }));
  const art = { betragCent: 0, sachpreis: "", quelle: "standgeld" as const, schluesselProTiere: null, anzahlProSchluessel: 1, anzahlProPreisrichter: 0, mindestpunkte: null, rundung: "voll" as const };

  test("je Preisrichter so viele Zeilen wie „zusätzlich je Preisrichter“, vergebene mit Nummer und Stifter", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const { id } = await al().schau.anlegen({ name: "Zusatzpreisschau", ort: "Halle" });
      const s = await al().schau.get({ id });
      const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
      const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
      const aussteller = { vorname: "Zora", nachname: "Zusatzgeheim", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false };
      const r = await al().meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: 3 }, () => pos) });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      await al().katalog.nummernVergeben({ schauId: id });
      const tiere = (await al().katalog.liste({ schauId: id })).sort((a, b) => a.katalogNr! - b.katalogNr!);

      // Gestiftete Plakette ZP mit 2 zusätzlich je Preisrichter (Betrag der Preisart 5 €), dazu eine Stiftung über 30 €.
      await al().schau.preisartSpeichern({ schauId: id, ...art, kuerzel: "ZP", name: "Zusatzplakette", betragCent: 500, quelle: "stiftung", anzahlProSchluessel: 0, anzahlProPreisrichter: 2, folge: 90 });
      const zp = (await al().preise.uebersicht({ schauId: id })).preisarten.find((a) => a.kuerzel === "ZP")!;
      await al().preise.stiftungSpeichern({ schauId: id, stifter: "Kreisverband Süd", preisartId: zp.id, anzahl: 1, betragCent: 3000, vorgabe: "", eingegangenAm: null });
      for (const name of ["Carla Cedrus", "Dora Douglasie"]) await al().preisrichter.speichern({ schauId: id, name, anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
      const [carla, dora] = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id))).sort((a, b) => a.name.localeCompare(b.name));
      await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: carla!.id, vonNr: tiere[0]!.katalogNr!, bisNr: tiere[2]!.katalogNr! }] });

      await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
      for (const t of tiere) {
        await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t.id));
        await al().bewertung.setzen({ schauId: id, katalogeintragId: t.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" } as never);
      }
      await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, id));
      await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[1]!.id, preisartId: zp.id });

      const blatt = async (pr: number) => pdfText(Buffer.from(await (await hol(`/datei/${id}/preisverteilung.pdf?preisrichter=${pr}`, cookie)).arrayBuffer()));
      const c = await blatt(carla!.id);
      // Carla: die vergebene aus der Stiftung (30 €) mit Nummer und Stifter, dazu ihre zwei zusätzlichen leer zu 5 € –
      // ein Preis aus der Stiftung belegt keine der Zeilen „zusätzlich je Preisrichter“.
      expect(c.match(/ZP Zusatzplakette/g)!.length).toBe(3);
      expect(c).toMatch(new RegExp(`\\b1\\s+ZP Zusatzplakette\\s+${tiere[1]!.katalogNr}\\s+30,00 €\\s+Kreisverband Süd`));
      expect(c).toMatch(/\b2\s+ZP Zusatzplakette\s+5,00[\s\S]*\b3\s+ZP Zusatzplakette\s+5,00/);
      expect(c).not.toContain("über dem Kontingent");
      expect(c).not.toContain("Zusatzgeheim");
      // Dora ohne Tiere: ihre zwei Zeilen leer zum Eintragen.
      const d = await blatt(dora!.id);
      expect(d.match(/ZP Zusatzplakette/g)!.length).toBe(2);
      expect(d).toMatch(/\b1\s+ZP Zusatzplakette\s+5,00[\s\S]*\b2\s+ZP Zusatzplakette\s+5,00/);

      // Beide zusätzlichen auch vergeben: drei Zeilen, alle mit Nummer, keine überzählig.
      for (const i of [0, 2]) await al().preise.vergeben({ schauId: id, katalogeintragId: tiere[i]!.id, preisartId: zp.id, ohneStiftung: true });
      const mehr = await blatt(carla!.id);
      expect(mehr.match(/ZP Zusatzplakette/g)!.length).toBe(3);
      for (const i of [0, 2]) expect(mehr).toMatch(new RegExp(`ZP Zusatzplakette\\s+${tiere[i]!.katalogNr}\\s+5,00 €`));
      expect(mehr).not.toContain("über dem Kontingent");

      // Kontingent für die ganze Schau: nur das Vergebene – Dora hat keine Zeile.
      await m.db.update(m.schema.schau).set({ kontingentJe: "schau" }).where(m.eq(m.schema.schau.id, id));
      expect(await blatt(dora!.id)).not.toContain("ZP Zusatzplakette");
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });
});
