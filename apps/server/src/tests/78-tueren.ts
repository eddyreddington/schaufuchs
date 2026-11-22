/**
 * Türen in den Eingängen (3D, Entscheidung 028): Türart je Eingang gespeichert mit der Halle (nur gültig, nur Abweichung von
 * der Vorgabe, mit Protokoll), ändert im festen Plan weder Plan noch Nummern. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { halleSchluessel, type Halle } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Türen in den Eingängen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const eingang = { name: "Eingang", art: "eingang" as const, x: 400, y: 0, breite: 200, tiefe: 100 };
  const notausgang = { name: "Notausgang", art: "eingang" as const, x: 0, y: 1200, breite: 100, tiefe: 100 };
  const halle = { breite: 1000, laenge: 1600, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [eingang, notausgang] };
  const zeile = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
  // Nach id sortiert: ohne ORDER BY liefert PostgreSQL die Zeilen in beliebiger Reihenfolge („der letzte“ wäre Zufall).
  const protokoll = async (id: number) => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id)).orderBy(m.schema.aenderung.id)).filter((p) => p.aktion === "Halle");

  test("speichern: Türart am Eingang, Vorgabe fällt weg, ungültige abgelehnt, im Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Türen", ort: "Halle" });
    await al().katalog.halleSetzen({ schauId: id, halle });
    const vorher = (await protokoll(id)).length;
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, flaechen: [{ ...eingang, tuer: "glas" }, { ...notausgang, tuer: "wand" }] } });
    expect((await zeile(id)).halle!.flaechen).toEqual([{ ...eingang, tuer: "glas" }, notausgang]);
    const p = await protokoll(id);
    expect(p).toHaveLength(vorher + 1);
    expect(p.at(-1)!.neu).toEqual({ flaechen: [{ ...eingang, tuer: "glas" }, notausgang] });
    expect(p.at(-1)!.alt).toEqual({ flaechen: [eingang, notausgang] });

    for (const falsch of ["stahl", "WAND", 1, ""]) {
      await expect(al().katalog.halleSetzen({ schauId: id, halle: { ...halle, flaechen: [{ ...eingang, tuer: falsch as never }, notausgang] } })).rejects.toThrow();
    }
    // Abgelehntes ändert nichts.
    expect((await zeile(id)).halle!.flaechen).toEqual([{ ...eingang, tuer: "glas" }, notausgang]);
    // Nur an Eingängen: an einer freien Fläche fällt die Angabe weg.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, flaechen: [{ ...eingang, tuer: "holz" }, { ...notausgang, art: "sperre", tuer: "glas" }] } });
    expect((await zeile(id)).halle!.flaechen).toEqual([{ ...eingang, tuer: "holz" }, { ...notausgang, art: "sperre" }]);
    // Zurück auf die Vorgabe: die Halle ist wie ohne Angabe.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, flaechen: [{ ...eingang, tuer: "wand" }, { ...notausgang, tuer: "offen" }] } });
    expect((await zeile(id)).halle!.flaechen).toEqual([eingang, { ...notausgang, tuer: "offen" }]);
  });

  test("fester Plan: Türart ändern lässt ihn fest, Käfige und Nummern bleiben", async () => {
    const { id } = await al().schau.anlegen({ name: "Türen fest", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Halle", nachname: "Türen", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
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

    const alt = vorher.zeile.halle as Halle;
    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(alt), halle: { ...(alt as typeof halle), flaechen: [{ ...eingang, tuer: "holz" }, { ...notausgang, tuer: "glas" }] } as never });
    const nachher = await zeile(id);
    expect(nachher.halle!.flaechen.map((f) => f.tuer)).toEqual(["holz", "glas"]);
    expect(halleSchluessel(nachher.halle as Halle)).not.toBe(halleSchluessel(alt));
    expect(nachher.hallenplanFest).toEqual(vorher.zeile.hallenplanFest);
    expect(await eintraege()).toEqual(vorher.eintraege);
    const plan = (await al().katalog.hallenplan({ schauId: id })).plan!;
    expect(plan.fest?.veraltet).toBe(false);
    expect(plan.reihen).toEqual(vorher.plan.reihen);
    expect(plan.warnungen).toEqual(vorher.plan.warnungen);
  });
});
