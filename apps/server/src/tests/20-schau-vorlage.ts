/** Neue Schau aus einer früheren als Vorlage: alles außer Meldungen und Geld. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Schau aus Vorlage", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("übernimmt Einstellungen, Gebühren, Preisarten, Preisrichter ohne PIN, Katalog, Bilder, Käfige und Halle – keine Meldungen, kein Geld, keine Termine", async () => {
    const { id: alt } = await al().schau.anlegen({ name: "Vorlage Schau 2025", ort: "Halle Alt" });
    const s = await al().schau.get({ id: alt });
    await al().schau.aktualisieren({ id: alt, daten: { ...s, bestimmungen: "Es gelten die AAB.", einlieferung: "Freitag 14–20 Uhr", meldeschluss: "2025-11-01", katalogStart: 100, zahlungBeiEinlieferung: true } as never });
    await al().schau.gebuehrenSetzen({ schauId: alt, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 450, befreitPreisrichter: false }] });
    const z = (await al().schau.get({ id: alt })).preisarten.find((p) => p.kuerzel === "Z")!;
    await al().schau.preisartSpeichern({ ...z, betragCent: 700 });
    const { id: richterId } = await al().preisrichter.speichern({ schauId: alt, name: "Vorlage Richter", anschrift: "Weg 1", email: "", telefon: "", istObmann: true });
    await al().preisrichter.pinErzeugen({ schauId: alt, id: richterId });
    await al().katalog.kaefigRegelSetzen({ schauId: alt, rasse: "Deutsche Wyandotten", typ: "grosskaefig" });
    await al().katalog.kaefigMassSetzen({ schauId: alt, typ: "huehner", mass: { breite: 70, tiefe: 60, hoehe: 70 } });
    await m.db.insert(m.schema.katalogGestaltung).values({ schauId: alt, untertitel: "Kreisschau", farbe: "#123456" });
    const [b] = await m.db.insert(m.schema.bild).values({ schauId: alt, rolle: "beitrag", mime: "image/png", name: "gruss.png", daten: Buffer.from([1, 2, 3]) }).returning();
    await m.db.insert(m.schema.katalogBeitrag).values({ schauId: alt, art: "grusswort", titel: "Grußwort", text: "Willkommen", bildId: b!.id });
    // Eine Meldung (darf nicht mitkommen).
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    await al().meldung.speichern({
      schauId: alt,
      aussteller: { vorname: "Alt", nachname: "Melder", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });

    // Geld und Katalognummern-Bezug in der Vorlage (darf alles nicht mitkommen).
    await al().preise.stiftungSpeichern({ schauId: alt, stifter: "Firma Vorlage", preisartId: null, anzahl: 1, betragCent: 2000, vorgabe: "", eingegangenAm: null });
    await al().kasse.kassenbewegung({ schauId: alt, art: "anfangsbestand", betragCent: 5000, grund: "Wechselgeld" });
    await m.db.insert(m.schema.prEinteilung).values({ schauId: alt, preisrichterId: richterId, vonNr: 1, bisNr: 50 });
    expect(await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.schauId, alt))).toHaveLength(1);
    await expect(helfer().schau.anlegen({ name: "Neue Schau 2026", ort: "Halle", vorlageId: alt })).rejects.toThrow("Administratoren");
    await expect(al().schau.anlegen({ name: "Neue Schau 2026", ort: "Halle", vorlageId: 99_999_999 })).rejects.toThrow();
    const { id: neu } = await al().schau.anlegen({ name: "Neue Schau 2026", ort: "Halle Neu", vorlageId: alt });
    const n = await al().schau.get({ id: neu });
    expect(n).toMatchObject({ name: "Neue Schau 2026", ort: "Halle Neu", phase: "vorbereitung", bestimmungen: "Es gelten die AAB.", einlieferung: "Freitag 14–20 Uhr", katalogStart: 100, zahlungBeiEinlieferung: true, meldeschluss: null, katalogGedruckt: false });
    expect(n.kaefigRegeln).toEqual([{ rasse: "Deutsche Wyandotten", typ: "grosskaefig" }]);
    expect(n.kaefigMasse).toEqual({ huehner: { breite: 70, tiefe: 60, hoehe: 70 } });
    expect(n.preisarten.find((p) => p.kuerzel === "Z")!.betragCent).toBe(700);
    const gebuehren = await m.db.select().from(m.schema.gebuehr).where(m.eq(m.schema.gebuehr.schauId, neu));
    expect(gebuehren.find((g) => g.art === "einzeltier" && !g.jugend)!.betragCent).toBe(450);
    const richter = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, neu));
    expect(richter).toMatchObject([{ name: "Vorlage Richter", anschrift: "Weg 1", istObmann: true, pinHash: null }]);
    const [g] = await m.db.select().from(m.schema.katalogGestaltung).where(m.eq(m.schema.katalogGestaltung.schauId, neu));
    expect(g).toMatchObject({ untertitel: "Kreisschau", farbe: "#123456" });
    const [nb] = await m.db.select().from(m.schema.bild).where(m.eq(m.schema.bild.schauId, neu));
    const [nk] = await m.db.select().from(m.schema.katalogBeitrag).where(m.eq(m.schema.katalogBeitrag.schauId, neu));
    expect(nb!.id).not.toBe(b!.id);
    expect(nk).toMatchObject({ titel: "Grußwort", bildId: nb!.id });
    // Keine Meldungen, kein Geld.
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, neu))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.kassenbewegung).where(m.eq(m.schema.kassenbewegung.schauId, neu))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.schauId, neu))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.prEinteilung).where(m.eq(m.schema.prEinteilung.schauId, neu))).toHaveLength(0);
    // Die Vorlage bleibt unverändert.
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, alt))).toHaveLength(1);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, neu))).filter((p) => p.aktion === "angelegt");
    expect(prot[0]!.neu).toMatchObject({ vorlage: "Vorlage Schau 2025" });
  });
});
