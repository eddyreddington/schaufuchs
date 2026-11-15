/** Stellvorschläge für die Halle: abrufen, übernehmen (Eingänge bleiben, Handarbeit der alten Aufstellung fällt weg). Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { halleSchluessel, HALLE_STANDARD } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Stellvorschläge", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Vorschläge abrufen und einen übernehmen", async () => {
    const { id } = await al().schau.anlegen({ name: "Stell Vorschlag", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Stell", nachname: "Vorschlag", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 12 }, () => pos),
    });
    const halle = { ...HALLE_STANDARD, breite: 800, laenge: 1800, flaechen: [{ name: "Eingang", art: "eingang" as const, x: 0, y: 300, breite: 50, tiefe: 300 }], reihenVersatz: [{ nr: 1, dx: 0, dy: 50 }] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const v = await helfer().katalog.stellVorschlaege({ schauId: id });
    expect(v.aktuell.titel).toContain("Reihen quer");
    expect(v.vorschlaege.length).toBeGreaterThan(0);
    // Übernehmen nur durch die Ausstellungsleitung, mit dem Stand, aus dem gerechnet wurde.
    const aktuell = (await al().schau.get({ id })).halle!;
    expect(v.basis).toBe(halleSchluessel(aktuell));
    const wahl = v.vorschlaege[0]!.halle;
    await expect(helfer().katalog.halleSetzen({ schauId: id, basis: v.basis, halle: wahl })).rejects.toThrow();
    // Inzwischen eine Fläche eingezeichnet: Der alte Vorschlag überschreibt sie nicht.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...aktuell, flaechen: [...aktuell.flaechen, { name: "Bühne", art: "sperre" as const, x: 300, y: 1200, breite: 200, tiefe: 200 }] } });
    await expect(al().katalog.halleSetzen({ schauId: id, basis: v.basis, halle: wahl })).rejects.toThrow("inzwischen");
    expect((await al().schau.get({ id })).halle!.flaechen.map((f) => f.name)).toEqual(["Eingang", "Bühne"]);
    await al().katalog.halleSetzen({ schauId: id, halle: aktuell });
    await al().katalog.halleSetzen({ schauId: id, basis: halleSchluessel(aktuell), halle: wahl });
    const neu = (await al().schau.get({ id })).halle!;
    expect([neu.richtung, neu.wandreihen, neu.wandBuendig, neu.hauptgang]).toEqual([wahl.richtung, wahl.wandreihen, wahl.wandBuendig, wahl.hauptgang]);
    expect(neu.flaechen).toEqual(halle.flaechen);
    expect(neu.reihenVersatz).toEqual([]);
    // Entwurf (geführter Ablauf): Vorschläge für eine noch nicht gespeicherte Halle; gespeichert wird dabei nichts, `basis`
    // ist der gespeicherte Stand.
    const vorher = (await al().schau.get({ id })).halle!;
    const entwurf = { ...vorher, laenge: 2400, flaechen: [...vorher.flaechen, { name: "Tor", art: "eingang" as const, x: 750, y: 1000, breite: 50, tiefe: 300 }] };
    // Nur Ausstellungsleitung; zu große Halle abgelehnt.
    await expect(helfer().katalog.stellVorschlaegeEntwurf({ schauId: id, entwurf })).rejects.toThrow();
    await expect(al().katalog.stellVorschlaegeEntwurf({ schauId: id, entwurf: { ...entwurf, breite: 30000, laenge: 30000 } })).rejects.toThrow("zu groß");
    const e = await al().katalog.stellVorschlaegeEntwurf({ schauId: id, entwurf });
    expect(e.aktuell.halle.laenge).toBe(2400);
    expect(e.aktuell.halle.flaechen.map((f) => f.name)).toContain("Tor");
    expect(e.basis).toBe(halleSchluessel(vorher));
    expect((await al().schau.get({ id })).halle).toEqual(vorher);
    await al().katalog.halleSetzen({ schauId: id, basis: e.basis, halle: e.aktuell.halle });
    expect((await al().schau.get({ id })).halle!.laenge).toBe(2400);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Halle");
    expect(prot.length).toBeGreaterThanOrEqual(2);
  });
});
