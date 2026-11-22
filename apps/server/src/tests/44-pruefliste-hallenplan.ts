/**
 * Prüfliste ab der Phase „Halle & Katalog“: Hinweise zum Hallenplan (Tiere ohne Platz, Käfigfront zur Wand oder zu einer
 * Reihe, Nummern nicht in Planfolge, Plan nicht festgeschrieben) – gelb, mit Link auf den Hallenplan, halten keinen
 * Phasenwechsel auf; vor dem Meldeschluss nicht. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { PHASEN_LABEL } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Prüfliste: Hallenplan", () => {
  const al = () => m.appRouter.createCaller(adminKontext);

  test("Hinweise ab „Halle & Katalog“, nicht vorher, halten nichts auf", async () => {
    expect(PHASEN_LABEL.katalog).toBe("Halle & Katalog");
    const { id } = await al().schau.anlegen({ name: "Prüfliste Halle", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Halle", nachname: "Prüfer", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 6 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = { breite: 800, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    // Zu kleine Halle: kein Tier hat Platz.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, breite: 100, laenge: 100 } });
    const hallenpunkte = async () => (await al().schau.uebersicht({ id })).checkliste.filter((p) => p.ziel === "hallenplan");

    // Vor dem Meldeschluss: nichts zum Hallenplan.
    expect(await hallenpunkte()).toEqual([]);
    await m.db.update(m.schema.schau).set({ phase: "meldung" }).where(m.eq(m.schema.schau.id, id));
    expect(await hallenpunkte()).toEqual([]);

    await m.db.update(m.schema.schau).set({ phase: "katalog" }).where(m.eq(m.schema.schau.id, id));
    expect(await hallenpunkte()).toEqual([{ art: "hinweis", text: "6 Tiere ohne Platz", ziel: "hallenplan" }]);

    // Käfigblock an der Wand mit der Front zur Wand.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte: [{ id: "b1", art: "kaefigblock" as const, typ: "tauben" as const, x: 0, y: 500, drehung: 90 as const, front: "x-" as const }] } });
    const front = await hallenpunkte();
    expect(front.map((p) => p.text)).toEqual(["Käfigfront zur Wand oder zu einer Reihe"]);
    expect(front[0]!.zusatz).toContain("Front zur Wand");
    expect(front[0]!.art).toBe("hinweis");

    // Nummern festgeschrieben, Plan nicht: Hinweis. Fester Plan, Platte umgestellt: Nummern nicht in Planfolge.
    await al().katalog.halleSetzen({ schauId: id, halle });
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    expect((await hallenpunkte()).map((p) => p.text)).toEqual(["Hallenplan nicht festgeschrieben"]);
    await al().katalog.planFestschreiben({ schauId: id });
    expect(await hallenpunkte()).toEqual([]);
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, plattenVersatz: [{ reihe: 1, platte: 0, dx: 0, dy: 420 }] } });
    expect((await hallenpunkte()).map((p) => p.text)).toEqual(["Käfignummern nicht in Planfolge"]);

    // Gelbe Hinweise halten den Wechsel nicht auf (der Grund wäre sonst Pflicht).
    await al().schau.phaseSetzen({ id, phase: "einlieferung", trotzdem: false }).catch((e: Error) => {
      expect(e.message).not.toContain("Planfolge");
    });
  });
});
