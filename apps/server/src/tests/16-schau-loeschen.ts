/** Leere Schau löschen (z. B. eine angelegte Test-Schau). Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Leere Schau löschen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });

  test("nur Administratoren, nur in der Vorbereitung ohne Meldungen, mit Name und Grund; Protokoll bleibt prüfbar", async () => {
    // Eine zweite Schau, deren Protokollkette nach dem Löschen weiter stimmen muss.
    const { id: bleibt } = await al().schau.anlegen({ name: "Bleibt bestehen", ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: bleibt, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 300, befreitPreisrichter: false }] });

    const { id } = await al().schau.anlegen({ name: "Test Schau Löschen", ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 400, befreitPreisrichter: false }] });
    await al().preisrichter.speichern({ schauId: id, name: "Test Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    const eingabe = { id, name: "Test Schau Löschen", grund: "Nur zum Ausprobieren angelegt" };

    await expect(helfer().schau.loeschen(eingabe)).rejects.toThrow("Administratoren");
    await expect(al().schau.loeschen({ ...eingabe, name: "Test Schau" })).rejects.toThrow("Namen");
    await expect(al().schau.loeschen({ ...eingabe, grund: "" })).rejects.toThrow("Grund");

    // In der Meldephase oder mit Meldungen: nicht löschbar.
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    await expect(al().schau.loeschen(eingabe)).rejects.toThrow("Vorbereitung");
    await al().schau.phaseSetzen({ id, phase: "vorbereitung", grund: "Test: zurück" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Lösch", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await expect(al().schau.loeschen(eingabe)).rejects.toThrow("Meldung");
    expect(await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id))).toHaveLength(1);

    // Leere Schau: die Meldung (Papier, unbezahlt) zuvor entfernen – dafür eine frische Schau.
    expect(r.meldungId).toBeGreaterThan(0);
    const { id: leer } = await al().schau.anlegen({ name: "Leere Test-Schau", ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: leer, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 500, befreitPreisrichter: false }] });
    await al().preisrichter.speichern({ schauId: leer, name: "Leer Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    const protokollVorher = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, leer));
    expect(protokollVorher.length).toBeGreaterThan(0);

    expect((await al().schau.loeschen({ id: leer, name: "Leere Test-Schau", grund: "Nur zum Ausprobieren angelegt" })).ok).toBe(true);
    expect(await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, leer))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, leer))).toHaveLength(0);
    // Vereinsprotokoll hält das Löschen fest (ohne Schau), die gelöschten Zeilen sind vermerkt.
    const vermerk = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Schau gelöscht"));
    const meiner = vermerk.find((v) => (v.alt as { id?: number } | null)?.id === leer)!;
    expect(meiner).toMatchObject({ schauId: null, tabelle: "schau", datensatzId: leer, grund: "Nur zum Ausprobieren angelegt" });
    const vermerkt = await m.db.select().from(m.schema.aenderungGeloescht).where(m.eq(m.schema.aenderungGeloescht.schauId, leer));
    expect(vermerkt.map((v) => v.id).sort()).toEqual(protokollVorher.map((p) => p.id).sort());
    // Die Kette der übrigen Schauen bleibt prüfbar.
    expect((await al().schau.protokollPruefen({ schauId: bleibt })).fehler).toEqual([]);
    // Doppelt löschen: nicht gefunden.
    await expect(al().schau.loeschen({ id: leer, name: "Leere Test-Schau", grund: "noch einmal" })).rejects.toThrow();
  });
});
