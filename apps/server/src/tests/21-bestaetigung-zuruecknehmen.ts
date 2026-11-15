/** Versehentlich bestätigt: Helfer und Ausstellungsleitung nehmen die Bestätigung zurück. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Bestätigung zurücknehmen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Helfer setzt eine bestätigte Meldung zurück auf offen (Protokoll); nicht mehr, wenn ein Tier eingeliefert ist; Stornieren bleibt bei der Ausstellungsleitung", async () => {
    const { id } = await al().schau.anlegen({ name: "Zurück Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = (nachname: string) =>
      al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Zurück", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    const a = (await melden("Versehen")).meldungId;
    await helfer().meldung.statusSetzen({ id: a, status: "bestaetigt" });
    await helfer().meldung.statusSetzen({ id: a, status: "offen", grund: "aus Versehen bestätigt" });
    expect((await al().meldung.get({ id: a })).meldung.status).toBe("offen");
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, a))).filter((p) => p.tabelle === "meldung" && p.aktion === "Status");
    expect(prot.map((p) => `${p.alt}→${p.neu}`)).toContain("bestaetigt→offen");

    // Stornieren bleibt bei der Ausstellungsleitung.
    await helfer().meldung.statusSetzen({ id: a, status: "bestaetigt" });
    await expect(helfer().meldung.statusSetzen({ id: a, status: "storniert", grund: "x" })).rejects.toThrow("Ausstellungsleitung");

    // Eingeliefert: zurücknehmen geht nicht mehr (auch nicht für die Ausstellungsleitung).
    await al().katalog.nummernVergeben({ schauId: id });
    const tier = (await helfer().halle.suche({ schauId: id, q: "Versehen" }))[0]!.tiere[0]!;
    await helfer().halle.statusSetzen({ schauId: id, ids: [tier.id], status: "eingeliefert", uebersteuern: "Nachweis liegt vor (Test)" });
    await expect(helfer().meldung.statusSetzen({ id: a, status: "offen" })).rejects.toThrow("nicht mehr");
  });
});
