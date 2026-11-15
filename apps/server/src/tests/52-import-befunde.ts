/**
 * Import aus Altprogrammen, Befunde der Gegenprüfung (Entscheidung 015): große Dateien, einzelne fehlerhafte Zeilen,
 * gleicher Name mit anderer Registriernummer, gesperrte Aussteller, Zurücknehmen nach späteren Änderungen, Testschau.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Import: Befunde der Gegenprüfung", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const kopf = ["Vorname", "Nachname", "PLZ", "Ort", "Reg", "E-Mail", "Rasse", "Farbenschlag", "Geschlecht", "Alter"];
  const zuordnung = ["vorname", "nachname", "plz", "ort", "registriernummer", "email", "rasse", "farbenschlag", "geschlecht", "alter"] as const;
  let wy = { id: 0, rasse: "", farbenschlag: "" };
  const neueSchau = async (name: string) => {
    const { id } = await al().schau.anlegen({ name, ort: "Musterdorf" });
    if (!wy.id) wy = (await al().stammdaten.suche({ versionId: (await al().schau.get({ id })).stammdatenVersionId!, q: "Wyandotten" }))[0]!;
    return id;
  };
  const zeile = (vorname: string, nachname: string, plz: string, reg = "", email = "") => [vorname, nachname, plz, "Musterdorf", reg, email, wy.rasse, wy.farbenschlag, "1,0", "jung"];
  const eingabe = (schauId: number, zeilen: string[][]) => ({ art: "meldungen" as const, schauId, dateiname: "liste.csv", tabelle: JSON.stringify([kopf, ...zeilen]), zuordnung: [...zuordnung], mitKopf: true, rassen: {} });
  const uebernehmen = (schauId: number, zeilen: string[][]) => al().datenimport.uebernehmen({ ...eingabe(schauId, zeilen), bestaetigen: false, zustimmung: true });
  const meldungen = (schauId: number) => m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId));

  test("800 Zeilen lassen sich prüfen und übernehmen", async () => {
    const id = await neueSchau("Großimport");
    const zeilen = Array.from({ length: 800 }, (_, i) => zeile(`Züchter${Math.floor(i / 8)}`, "Großimport", `2${String(Math.floor(i / 8)).padStart(4, "0")}`));
    const p = await al().datenimport.pruefen(eingabe(id, zeilen));
    expect(p.zeilen.filter((z) => z.fehler.length)).toHaveLength(0);
    expect(await uebernehmen(id, zeilen)).toMatchObject({ meldungen: 100, tiere: 800 });
  }, 120_000);

  test("Eine Zeile, die beim Speichern scheitern würde, ist ein Fehler der Zeile – der Rest geht durch", async () => {
    const id = await neueSchau("Fehlerzeilen");
    await m.db.update(m.schema.schau).set({ auslandZugelassen: false }).where(m.eq(m.schema.schau.id, id));
    const zeilen = [zeile("Anna", "Gutzeile", "31111"), zeile("Berta", "Mailzeile", "31112", "", "anna@x..de"), zeile("Cora", "Auslandzeile", "31113", "NL 1234567")];
    const p = await al().datenimport.pruefen(eingabe(id, zeilen));
    // Eine E-Mail, die erst beim Speichern scheitert, wird weggelassen – die Zeile geht mit.
    const mail = p.zeilen.find((z) => z.aussteller.nachname === "Mailzeile")!;
    expect(mail.fehler).toEqual([]);
    expect(mail.hinweise.join()).toMatch(/E-Mail/);
    expect(p.zeilen.find((z) => z.aussteller.nachname === "Auslandzeile")!.fehler.join()).toMatch(/Ausland/);
    expect(await uebernehmen(id, zeilen)).toMatchObject({ meldungen: 2, ausgelassen: 1 });
  });

  test("Gleicher Name mit anderer Registriernummer ist ein anderer Aussteller; zwei Schreibweisen derselben Person bleiben eine", async () => {
    const id = await neueSchau("Vater und Sohn");
    const leer = { telefon: "", email: "", verein: "", kreisverband: "", istPreisrichter: false, iban: "", kontoinhaber: "", strasse: "Hof 1", ort: "Musterdorf" };
    const { id: vater } = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Hans", nachname: "Vatersohn", plz: "34567", registriernummer: "276 09 111 111 0001" } });
    const zeilen = [zeile("H.", "Vatersohn", "34567", "276091111110001"), zeile("Hans", "Vatersohn", "34567"), zeile("Hans", "Vatersohn", "34567", "276091111110002")];
    const p = await al().datenimport.pruefen(eingabe(id, zeilen));
    // Zeile 3 ohne Nummer kann Vater (Verzeichnis) oder Sohn (Datei) sein: nicht eindeutig.
    expect(p.zeilen.find((z) => z.nr === 3)!.fehler.join()).toMatch(/mehrere/);
    expect(p.aussteller.filter((a) => a.vorhanden?.id === vater).map((a) => a.zeilen)).toEqual([[2]]);
    expect(p.aussteller.filter((a) => !a.vorhanden).map((a) => a.zeilen)).toEqual([[4]]);
    expect(await uebernehmen(id, zeilen)).toMatchObject({ meldungen: 2, aussteller: 1 });
    // Zwei Schreibweisen derselben Person (eine mit, eine ohne Nummer) bleiben eine Gruppe.
    const { id: karla } = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Karla", nachname: "Schreib", plz: "34566", registriernummer: "276 09 111 111 0041" } });
    const zwei = await al().datenimport.pruefen(eingabe(await neueSchau("Schreibweisen"), [zeile("K.", "Schreib", "34566", "276091111110041"), zeile("Karla", "Schreib", "34566")]));
    expect(zwei.aussteller.filter((a) => a.vorhanden?.id === karla).map((a) => a.zeilen)).toEqual([[2, 3]]);
    const ms = await meldungen(id);
    const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.meldungId, ms.find((x) => x.ausstellerId === vater)!.id));
    expect(tiere).toHaveLength(1);
  });

  test("Zeile ohne Nummer vor Vater und Sohn; vorhandener ohne Nummer bei zwei Nummern: nicht zusammenlegen", async () => {
    const id = await neueSchau("Mehrdeutig");
    const zeilen = [zeile("Max", "Mehrdeutig", "34999"), zeile("Max", "Mehrdeutig", "34999", "276091111110011"), zeile("Max", "Mehrdeutig", "34999", "276091111110012")];
    const p = await al().datenimport.pruefen(eingabe(id, zeilen));
    expect(p.zeilen[0]!.fehler.join()).toMatch(/mehrere/);
    expect(p.aussteller.filter((a) => a.zeilen.length).map((a) => a.zeilen).sort()).toEqual([[3], [4]]);
    const leer = { strasse: "", ort: "Musterdorf", telefon: "", email: "", verein: "", kreisverband: "", istPreisrichter: false, iban: "", kontoinhaber: "", registriernummer: "" };
    await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Otto", nachname: "Ohnenummer", plz: "34998" } });
    const q = await al().datenimport.pruefen(eingabe(id, [zeile("Otto", "Ohnenummer", "34998", "276091111110021"), zeile("Otto", "Ohnenummer", "34998", "276091111110022")]));
    expect(q.zeilen.every((z) => /mehrere/.test(z.fehler.join()))).toBe(true);
    // Vater und Sohn schon im Verzeichnis, die Zeile ohne Nummer: nicht eindeutig.
    await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Paul", nachname: "Zweifach", plz: "34997", registriernummer: "276 09 111 111 0031" } });
    await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Paul", nachname: "Zweifach", plz: "34997", registriernummer: "276 09 111 111 0032" }, trotzdem: true });
    const r = await al().datenimport.pruefen(eingabe(id, [zeile("Paul", "Zweifach", "34997")]));
    expect(r.zeilen[0]!.fehler.join()).toMatch(/mehrere/);
  });

  test("Jugend bei einem vorhandenen, inzwischen erwachsenen Aussteller: Fehler der Zeile, kein Abbruch", async () => {
    const id = await neueSchau("Jugendimport");
    const { id: ex } = await al().verein.ausstellerSpeichern({ daten: { vorname: "Ex", nachname: "Jugendlicher", strasse: "", plz: "35111", ort: "Musterdorf", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" } });
    await m.db.update(m.schema.aussteller).set({ geburtsdatum: "1990-01-01" }).where(m.eq(m.schema.aussteller.id, ex));
    const k = [...kopf, "Jugend"];
    const e = { ...eingabe(id, []), tabelle: JSON.stringify([k, [...zeile("Ex", "Jugendlicher", "35111"), "ja"], [...zeile("Neu", "Erwachsen", "35112"), "nein"]]), zuordnung: [...zuordnung, "jugend" as const] };
    const p = await al().datenimport.pruefen(e);
    expect(p.zeilen[0]!.fehler.join()).toMatch(/jugendlich/);
    expect(await al().datenimport.uebernehmen({ ...e, bestaetigen: false, zustimmung: true })).toMatchObject({ meldungen: 1 });
  });

  test("Tabelle mit sehr vielen leeren Einträgen: abgelehnt, bevor sie gelesen wird", async () => {
    const id = await neueSchau("Strukturgrenze");
    await expect(al().datenimport.pruefen({ ...eingabe(id, []), tabelle: `[${"[],".repeat(400_000)}[]]` })).rejects.toThrow("umfangreich");
  });

  test("Gesperrter Aussteller: Zeile ist ein Fehler, kein zweiter Datensatz", async () => {
    const id = await neueSchau("Sperrimport");
    const { id: gesa } = await al().verein.ausstellerSpeichern({ daten: { vorname: "Gesa", nachname: "Gesperrtimport", strasse: "", plz: "45678", ort: "Musterdorf", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" } });
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date() }).where(m.eq(m.schema.aussteller.id, gesa));
    const zeilen = [zeile("Gesa", "Gesperrtimport", "45678"), zeile("Olaf", "Offenimport", "45679")];
    const p = await al().datenimport.pruefen(eingabe(id, zeilen));
    expect(p.zeilen[0]!.fehler.join()).toMatch(/gesperrt/);
    expect(await uebernehmen(id, zeilen)).toMatchObject({ meldungen: 1 });
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Gesperrtimport"))).toHaveLength(1);
  });

  test("Zurücknehmen: nicht nach späterer Änderung oder Abschluss; nachbearbeitete Aussteller bleiben; je Meldung im Protokoll", async () => {
    const a = await neueSchau("Rücknahme A");
    const r = await uebernehmen(a, [zeile("Ida", "Ruecknahme", "56781"), zeile("Jan", "Ruecknahme", "56782")]);
    const [jan] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.vorname, "Jan"));
    const j = jan!;
    const daten = { vorname: j.vorname, nachname: j.nachname, strasse: j.strasse, plz: j.plz, ort: j.ort, telefon: j.telefon, email: j.email, verein: j.verein, kreisverband: j.kreisverband, registriernummer: j.registriernummer, istPreisrichter: j.istPreisrichter, iban: j.iban, kontoinhaber: j.kontoinhaber };
    await al().verein.ausstellerSpeichern({ id: j.id, daten: { ...daten, strasse: "Nachgetragen 5" }, vorher: { ...daten, mitglied: j.mitglied } });
    expect(await al().datenimport.zuruecknehmen({ id: r.id })).toEqual({ meldungen: 2, aussteller: 1 });
    expect(await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, jan!.id))).toHaveLength(1);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, a));
    expect(prot.filter((x) => x.tabelle === "meldung" && x.aktion === "Import zurückgenommen")).toHaveLength(2);

    const b = await neueSchau("Rücknahme B");
    const rb = await uebernehmen(b, [zeile("Kai", "Ruecknahme", "56783")]);
    await al().meldung.statusSetzen({ id: (await meldungen(b))[0]!.id, status: "bestaetigt" });
    await expect(al().datenimport.zuruecknehmen({ id: rb.id })).rejects.toThrow("nach dem Import");

    // Ringnummer nachgetragen (protokolliert am Tier): auch das sperrt die Rücknahme.
    const d = await neueSchau("Rücknahme D");
    const rd = await uebernehmen(d, [zeile("Mia", "Ruecknahme", "56785")]);
    const [tier] = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, d));
    await al().halle.ringnummerSetzen({ schauId: d, id: tier!.id, ringnummern: "DE 26 AB 1" });
    await expect(al().datenimport.zuruecknehmen({ id: rd.id })).rejects.toThrow("nach dem Import");

    const c = await neueSchau("Rücknahme C");
    const rc = await uebernehmen(c, [zeile("Lea", "Ruecknahme", "56784")]);
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, c));
    await expect(al().datenimport.zuruecknehmen({ id: rc.id })).rejects.toThrow("Phase");
    expect(await meldungen(c)).toHaveLength(1);
  });

  test("„Unicode-Text“ aus Excel (UTF-16 mit BOM) wird gelesen", async () => {
    const r = await al().datenimport.lesen({ dateiname: "liste.txt", base64: Buffer.from("\ufeffName\tOrt\r\nMüller, Grete\tBeispielstadt\r\n", "utf16le").toString("base64") });
    expect(r.tabelle).toEqual([["Name", "Ort"], ["Müller, Grete", "Beispielstadt"]]);
  });

  test("Testschau: derselbe Import ein zweites Mal legt nichts doppelt an", async () => {
    const t = await neueSchau("Importtest");
    await m.db.update(m.schema.schau).set({ test: true }).where(m.eq(m.schema.schau.id, t));
    const zeilen = [zeile("Tina", "Testimport", "67891")];
    expect(await uebernehmen(t, zeilen)).toMatchObject({ meldungen: 1 });
    expect(await uebernehmen(t, zeilen)).toMatchObject({ meldungen: 0 });
    expect(await meldungen(t)).toHaveLength(1);
  });
});
