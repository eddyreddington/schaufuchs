/**
 * Import aus Altprogrammen (Entscheidung 015): Datei lesen (CSV in Windows-1252, altes .xls abgelehnt), prüfen
 * (Aussteller wiedererkennen, Rassen zuordnen), übernehmen (vorhandene Aussteller unverändert, Zuordnung gelernt,
 * kein zweites Mal), zurücknehmen (nur solange nichts daran hängt). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Import aus Altprogrammen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  let schauId = 0;
  let wy = { id: 0, rasse: "", farbenschlag: "" };
  let karlId = 0;
  const base64 = (b: Buffer) => b.toString("base64");
  /** Meldeliste wie aus einem Altprogramm; „Wiandotten“ ist absichtlich falsch geschrieben. */
  const datei = () =>
    [
      "Name;Straße;PLZ Ort;Rasse;Farbenschlag;Geschlecht;Alter;Preis",
      `Muster, Karl;Neue Straße 9;12345 Musterdorf;${wy.rasse};${wy.farbenschlag};1,0;jung;25,00`,
      `Muster, Karl;Neue Straße 9;12345 Musterdorf;${wy.rasse};${wy.farbenschlag};0,1;alt;`,
      `Müller, Grete;Am Bach 1;12346 Beispielstadt;Wiandotten;${wy.farbenschlag};Henne;J;`,
      ";;;;;;;",
      `Ohne Rasse;Weg 2;12347 Probeort;;;1,0;jung;`,
    ].join("\r\n");

  const lesen = async () => {
    const r = await al().datenimport.lesen({ dateiname: "meldeliste.csv", base64: base64(Buffer.from(datei(), "latin1")) });
    return { art: "meldungen" as const, schauId, dateiname: "meldeliste.csv", tabelle: JSON.stringify(r.tabelle), zuordnung: r.zuordnung, mitKopf: true, rassen: {} as Record<string, number | null> };
  };

  test("Datei lesen: CSV in Windows-1252, Spalten erraten; altes .xls abgelehnt", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Importschau", ort: "Musterdorf" }));
    const s = await al().schau.get({ id: schauId });
    wy = (await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" }))[0]!;
    expect(wy?.id).toBeGreaterThan(0);
    const r = await al().datenimport.lesen({ dateiname: "meldeliste.csv", base64: base64(Buffer.from(datei(), "latin1")) });
    expect(r.tabelle[3]![0]).toBe("Müller, Grete");
    expect(r.zuordnung).toEqual(["name", "strasse", "plzOrt", "rasse", "farbenschlag", "geschlecht", "alter", "verkaufspreis"]);
    await expect(al().datenimport.lesen({ dateiname: "alt.xls", base64: base64(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])) })).rejects.toThrow(".xls");
  });

  test("Prüfen: vorhandener Aussteller erkannt, Rassen genau bzw. mit Vorschlag, Fehler je Zeile", async () => {
    ({ id: karlId } = await al().verein.ausstellerSpeichern({ daten: { vorname: "Karl", nachname: "Muster", strasse: "Alte Gasse 1", plz: "12345", ort: "Musterdorf", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "Karl Muster sen." } }));
    const p = await al().datenimport.pruefen(await lesen());
    expect(p.zeilen).toHaveLength(4);
    const karl = p.aussteller.find((a) => a.daten.nachname === "Muster")!;
    expect(karl.vorhanden?.id).toBe(karlId);
    expect(karl.zeilen).toEqual([2, 3]);
    const genau = p.rassen.find((r) => r.rasse === wy.rasse)!;
    expect(genau).toMatchObject({ farbenschlagId: wy.id, quelle: "genau", anzahl: 2 });
    const falsch = p.rassen.find((r) => r.rasse === "Wiandotten")!;
    expect(falsch.farbenschlagId).toBeNull();
    expect(falsch.vorschlaege.map((v) => v.id)).toContain(wy.id);
    expect(p.zeilen.find((z) => z.nr === 4)!.fehler).toContain("Rasse und Farbenschlag noch nicht zugeordnet.");
    expect(p.zeilen.find((z) => z.aussteller.nachname === "Rasse")!.fehler).toContain("Rasse fehlt.");
  });

  test("Übernehmen: vorhandener Aussteller bleibt, wie er ist; Zuordnung gelernt; kein zweites Mal", async () => {
    const e = await lesen();
    const p = await al().datenimport.pruefen(e);
    const falsch = p.rassen.find((r) => r.rasse === "Wiandotten")!;
    const r = await al().datenimport.uebernehmen({ ...e, rassen: { [falsch.schluessel]: wy.id }, bestaetigen: true, zustimmung: true });
    expect(r).toMatchObject({ aussteller: 1, meldungen: 2, tiere: 3, ausgelassen: 1 });
    const [karl] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, karlId));
    expect(karl).toMatchObject({ strasse: "Alte Gasse 1", kontoinhaber: "Karl Muster sen." });
    const meldungen = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId));
    expect(meldungen.map((x) => x.status)).toEqual(["bestaetigt", "bestaetigt"]);
    expect(meldungen.every((x) => x.eingang === "papier")).toBe(true);
    const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, schauId));
    expect(tiere.map((t) => t.verkaufspreisCent).sort()).toEqual([2500, null, null].sort());
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId));
    expect(prot.some((x) => x.aktion === "Import" && x.tabelle === "importlauf")).toBe(true);
    // Gelernt: beim nächsten Mal ist „Wiandotten“ schon zugeordnet – und beide sind schon gemeldet.
    const nochmal = await al().datenimport.pruefen(await lesen());
    expect(nochmal.rassen.find((x) => x.rasse === "Wiandotten")).toMatchObject({ farbenschlagId: wy.id, quelle: "gelernt" });
    expect(nochmal.aussteller.filter((a) => a.schonGemeldet)).toHaveLength(2);
    const zweiter = await al().datenimport.uebernehmen({ ...(await lesen()), bestaetigen: false, zustimmung: true });
    expect(zweiter.meldungen).toBe(0);
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId))).toHaveLength(2);
  });

  test("Zurücknehmen: Meldungen und neue Aussteller weg, vorhandene bleiben; gesperrt nach Katalognummern", async () => {
    // Zweite Schau: Import und vollständige Rücknahme.
    const { id: zweite } = await al().schau.anlegen({ name: "Zweite Importschau", ort: "Musterdorf" });
    const r = await al().datenimport.uebernehmen({ ...(await lesen()), schauId: zweite, bestaetigen: false, zustimmung: true });
    expect(r.meldungen).toBe(2);
    const neu = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Müller"));
    const z = await al().datenimport.zuruecknehmen({ id: r.id });
    expect(z).toEqual({ meldungen: 2, aussteller: 0 }); // Grete hat noch die Meldung in der ersten Schau
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, zweite))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Müller"))).toHaveLength(neu.length);
    await expect(al().datenimport.zuruecknehmen({ id: r.id })).rejects.toThrow("schon zurückgenommen");
    // Erste Schau: nach der Nummernvergabe bleibt alles stehen.
    const [erster] = (await al().datenimport.laeufe()).filter((l) => l.schauId === schauId && l.anzahlMeldungen > 0);
    await al().katalog.nummernVergeben({ schauId });
    await expect(al().datenimport.zuruecknehmen({ id: erster!.id })).rejects.toThrow("Katalognummern vergeben");
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId))).toHaveLength(2);
  });

  test("Aussteller ins Verzeichnis: neue angelegt, vorhandene übersprungen; Rücknahme löscht nur die neuen", async () => {
    const tabelle = [
      ["Vorname", "Nachname", "PLZ", "Ort"],
      ["Karl", "Muster", "12345", "Musterdorf"],
      ["Hanna", "Neu", "12348", "Neudorf"],
    ];
    const e = { art: "aussteller" as const, dateiname: "mitglieder.csv", tabelle: JSON.stringify(tabelle), zuordnung: ["vorname", "nachname", "plz", "ort"] as ("vorname" | "nachname" | "plz" | "ort")[], mitKopf: true, rassen: {} };
    const p = await al().datenimport.pruefen(e);
    expect(p.zeilen[0]!.hinweise.join(" ")).toContain("gibt es schon");
    const r = await al().datenimport.uebernehmen({ ...e, bestaetigen: false, zustimmung: false });
    expect(r.aussteller).toBe(1);
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Neu"))).toHaveLength(1);
    expect(await al().datenimport.zuruecknehmen({ id: r.id })).toEqual({ meldungen: 0, aussteller: 1 });
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Neu"))).toHaveLength(0);
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, karlId))).toHaveLength(1);
  });
});
