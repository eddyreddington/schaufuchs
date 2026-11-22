/**
 * Kleinere Ergänzungen: Rückfrage beim Laden und Entscheiden eines Hallenplan-Entwurfs, wenn der Katalog gedruckt ist
 * oder schon Tiere eingeliefert sind (Entscheidung 017). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

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
