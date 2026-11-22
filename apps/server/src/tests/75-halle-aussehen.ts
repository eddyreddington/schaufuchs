/**
 * Aussehen der Halle in 3D (Entscheidung 028): gespeichert mit der Halle (begrenzt, nur Abweichungen, mit Protokoll), ändert
 * im festen Plan weder Plan noch Nummern, kommt mit Entwürfen und Vorlagen mit. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { halleSchluessel, type Halle } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Aussehen der Halle (3D)", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const halle = { breite: 1000, laenge: 1600, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
  const zeile = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
  const protokoll = async (id: number) => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((p) => p.aktion === "Halle");

  test("speichern: nur Abweichungen von der Vorgabe, Farbe klein, unzulässige Werte abgelehnt, im Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Aussehen", ort: "Halle" });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const vorher = (await protokoll(id)).length;
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, aussehen: { boden: "parkett", prallwand: "#6D8571", prallwandHoehe: 250, wandHoehe: 600, fenster: true, decke: true, linien: true, geraete: false } } });
    expect((await zeile(id)).halle!.aussehen).toEqual({ prallwand: "#6d8571", prallwandHoehe: 250, wandHoehe: 600, decke: true, linien: true });
    const p = await protokoll(id);
    expect(p).toHaveLength(vorher + 1);
    expect(p.at(-1)!.neu).toEqual({ aussehen: { prallwand: "#6d8571", prallwandHoehe: 250, wandHoehe: 600, decke: true, linien: true } });

    for (const falsch of [{ prallwand: "rot" }, { prallwand: "url(x)" }, { wandHoehe: 99999 }, { wandHoehe: 100 }, { prallwandHoehe: -1 }, { boden: "rasen" }]) {
      await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, aussehen: falsch as never } })).rejects.toThrow();
    }
    // Prallwand höher als die Wand: begrenzt gespeichert.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, aussehen: { wandHoehe: 300, prallwandHoehe: 400 } } });
    expect((await zeile(id)).halle!.aussehen).toEqual({ wandHoehe: 300, prallwandHoehe: 270 });
    // Alles wie die Vorgabe: das Feld fällt weg (die Halle ist wie ohne Aussehen).
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, aussehen: { boden: "parkett", fenster: true } } });
    expect("aussehen" in (await zeile(id)).halle!).toBe(false);
  });

  test("fester Plan: Aussehen ändern lässt ihn fest, Käfige und Nummern bleiben", async () => {
    const { id } = await al().schau.anlegen({ name: "Aussehen fest", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Halle", nachname: "Aussehen", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 8 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.halleSetzen({ schauId: id, halle });
    await al().katalog.planFestschreiben({ schauId: id });
    const eintraege = async () => (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id))).map((e) => [e.id, e.katalogNr, e.kaefig]).sort();
    const vorher = { zeile: await zeile(id), eintraege: await eintraege(), plan: (await al().katalog.hallenplan({ schauId: id })).plan! };
    expect(vorher.zeile.hallenplanFest).not.toBeNull();

    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(vorher.zeile.halle as Halle), halle: { ...(vorher.zeile.halle as typeof halle), aussehen: { boden: "sportboden", wandHoehe: 700, geraete: true } } as never });
    const nachher = await zeile(id);
    expect(nachher.halle!.aussehen).toEqual({ boden: "sportboden", wandHoehe: 700, geraete: true });
    expect(nachher.hallenplanFest).toEqual(vorher.zeile.hallenplanFest);
    expect(await eintraege()).toEqual(vorher.eintraege);
    const plan = (await al().katalog.hallenplan({ schauId: id })).plan!;
    expect(plan.fest?.veraltet).toBe(false);
    expect(plan.reihen).toEqual(vorher.plan.reihen);
    expect(plan.warnungen).toEqual(vorher.plan.warnungen);
  });

  test("kommt mit: Entwurf aus dem Archiv in eine andere Schau laden, neue Schau aus Vorlage", async () => {
    const { id: a } = await al().schau.anlegen({ name: "Aussehen Quelle", ort: "Halle" });
    const aussehen = { prallwand: "#4d6f94", decke: true, linien: true, geraete: true };
    await al().katalog.halleSetzen({ schauId: a, halle: { ...halle, aussehen } });
    const { id: entwurf } = await al().hallenentwurf.speichern({ schauId: a, name: "Blaue Halle" });
    // Archiviert (für den aktuellen Plan entschieden): lädt sich in jeder Schau des Vereins.
    await al().hallenentwurf.entscheiden({ schauId: a });

    const { id: b } = await al().schau.anlegen({ name: "Aussehen Ziel", ort: "Halle" });
    await al().katalog.halleSetzen({ schauId: b, halle });
    await al().hallenentwurf.laden({ schauId: b, id: entwurf, bestaetigt: true });
    expect((await zeile(b)).halle!.aussehen).toEqual(aussehen);

    const { id: c } = await al().schau.anlegen({ name: "Aussehen Vorlage", ort: "Halle", vorlageId: a });
    expect((await zeile(c)).halle!.aussehen).toEqual(aussehen);
  });
});
