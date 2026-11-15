/**
 * SEPA-Lastschrift (Entscheidung 018): Gläubiger-ID, Mandate, Lastschriftdatei nur für offenes Meldegeld mit gültigem
 * Mandat, Vorabankündigung, Sperren während die Datei offen ist (Zahlung, Bearbeiten, Gebühren, Absage, Widerruf,
 * Auszahlung, Abschluss), kein doppelter Einzug, Einmal-Mandat nur einmal, Buchen, Rücklastschrift, Auskunft, Löschwunsch.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { fruehesteFaelligkeit, gefordertCent, vorgeschlageneFaelligkeit } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("SEPA-Lastschrift", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const leer = { strasse: "", plz: "", ort: "", telefon: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  let schauId = 0;
  let annaReferenz = "";
  const ids: Record<string, { meldungId: number; ausstellerId: number }> = {};
  const offen = async (meldungId: number) => {
    const { meldebetrag } = await import("../services/eintraege");
    const b = await meldebetrag(m.db, meldungId);
    return gefordertCent(b) - b.bezahltCent;
  };

  test("Gläubiger-ID, Mandate, Vorschau nur mit offenem Meldegeld und gültigem Mandat", async () => {
    await expect(al().lastschrift.glaeubigerIdSetzen({ glaeubigerId: "DE97ZZZ09999999999" })).rejects.toThrow("Prüfziffer");
    await al().lastschrift.glaeubigerIdSetzen({ glaeubigerId: "de98 zzz 09999999999" });
    expect((await al().lastschrift.einstellungen()).glaeubigerId).toBe("DE98ZZZ09999999999");

    ({ id: schauId } = await al().schau.anlegen({ name: "Lastschriftschau", ort: "Musterdorf" }));
    const s = await al().schau.get({ id: schauId });
    await m.db.update(m.schema.schau).set({ vereinIban: "DE02120300000000202051", vereinBic: "BYLADEM1001", vereinKontoinhaber: "Musterverein e. V." }).where(m.eq(m.schema.schau.id, schauId));
    await al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false }] });
    const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    for (const name of ["Anna", "Berta", "Carl", "Dora"]) {
      const r = await al().meldung.speichern({ schauId, aussteller: { ...leer, vorname: name, nachname: "Lastschrift", email: `${name.toLowerCase()}@test.de` }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [{ farbenschlagId: farbe!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }] });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      ids[name] = { meldungId: r.meldungId, ausstellerId: r.ausstellerId };
    }
    const mandat = (name: string, iban = "DE02100500000054540402") => al().lastschrift.mandatAnlegen({ ausstellerId: ids[name]!.ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban, kontoinhaber: "" });
    await expect(mandat("Anna", "DE00123")).rejects.toThrow();
    // Außerhalb von EU/EWR bräuchte die Lastschrift BIC und Anschrift – sonst scheiterte später die ganze Datei.
    await expect(mandat("Anna", "CH9300762011623852957")).rejects.toThrow("EU/EWR");
    const a = await mandat("Anna");
    // Die Referenz hängt an der Mandatsnummer: nach dem Löschen alter Mandate wird keine wiederverwendet.
    expect(a.referenz).toBe(`SF-M${a.id}`);
    annaReferenz = a.referenz;
    await expect(al().lastschrift.mandatAnlegen({ ausstellerId: ids.Carl!.ausstellerId, referenz: a.referenz, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" })).rejects.toThrow("gibt es schon");
    await mandat("Carl");
    const d = await mandat("Dora");
    await expect(al().lastschrift.mandatWiderrufen({ id: d.id, am: "2026-02-31" })).rejects.toThrow("Datum");
    await al().lastschrift.mandatWiderrufen({ id: d.id, am: "2026-10-15" });
    // Carl hat bar bezahlt – er steht nicht in der Datei.
    await al().meldung.zahlungErfassen({ meldungId: ids.Carl!.meldungId, betragCent: await offen(ids.Carl!.meldungId), datum: heute, art: "bar" });

    const u = await al().lastschrift.uebersicht({ schauId });
    expect(u.sperre).toBeNull();
    expect(u.frueheste).toBe(fruehesteFaelligkeit(heute));
    // Vorgeschlagen werden 14 Tage (Vorabankündigung), nicht das früheste Datum.
    expect(u.faelligAm).toBe(vorgeschlageneFaelligkeit(heute));
    expect(u.vorschau.map((p) => p.name)).toEqual(["Lastschrift, Anna"]);
    expect(u.ohneGueltigesMandat.map((p) => p.name)).toEqual(["Lastschrift, Dora"]);
  });

  test("Datei erstellen: Fälligkeit, Vorabankündigung, pain.008; solange offen keine weitere Zahlung", async () => {
    await expect(al().lastschrift.erstellen({ schauId, faelligAm: heute, vorabankuendigung: false })).rejects.toThrow("Frühestes");
    const faellig = fruehesteFaelligkeit(heute);
    // An Wochenende und Bankfeiertag bucht die Bank nicht.
    const samstag = new Date(`${faellig}T00:00:00Z`);
    do samstag.setUTCDate(samstag.getUTCDate() + 1);
    while (samstag.getUTCDay() !== 6);
    await expect(al().lastschrift.erstellen({ schauId, faelligAm: samstag.toISOString().slice(0, 10), vorabankuendigung: false })).rejects.toThrow("Bankarbeitstag");
    const r = await al().lastschrift.erstellen({ schauId, faelligAm: faellig, vorabankuendigung: true });
    expect(r).toMatchObject({ anzahl: 1, angekuendigt: 1 });
    const post = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "anna@test.de"));
    expect(post.some((p) => p.betreff.startsWith("Vorabankündigung SEPA-Lastschrift") && p.text.includes("DE98ZZZ09999999999"))).toBe(true);
    const { xml } = await al().lastschrift.datei({ schauId });
    expect(xml).toContain(`<MndtId>${annaReferenz}</MndtId>`);
    expect(xml).toContain(`<ReqdColltnDt>${faellig}</ReqdColltnDt>`);
    expect(xml).toContain("<InstdAmt Ccy=\"EUR\">11.00</InstdAmt>");
    await expect(al().lastschrift.erstellen({ schauId, faelligAm: faellig, vorabankuendigung: false })).rejects.toThrow("schon eine offene");
    await expect(al().meldung.zahlungErfassen({ meldungId: ids.Anna!.meldungId, betragCent: 1100, datum: heute, art: "bar" })).rejects.toThrow("offenen Lastschriftdatei");
    await expect(al().meldung.statusSetzen({ id: ids.Anna!.meldungId, status: "storniert" })).rejects.toThrow("Lastschriftdatei");
  });

  test("Buchen: Zahlung „Lastschrift“, Mandat genutzt, keine Bankdaten mehr im Lauf; Rücklastschrift einmal", async () => {
    const u = await al().lastschrift.uebersicht({ schauId });
    expect(await al().lastschrift.buchen({ schauId, nachrichtId: u.offen!.nachrichtId })).toMatchObject({ anzahl: 1, summeCent: 1100 });
    expect(await offen(ids.Anna!.meldungId)).toBe(0);
    const z = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, ids.Anna!.meldungId));
    expect(z.map((x) => x.art)).toEqual(["lastschrift"]);
    const [mandat] = await m.db.select().from(m.schema.sepaMandat).where(m.eq(m.schema.sepaMandat.ausstellerId, ids.Anna!.ausstellerId));
    expect(mandat!.letzteNutzungAm).toBe(fruehesteFaelligkeit(heute));
    const [lauf] = await m.db.select().from(m.schema.lastschriftLauf).where(m.eq(m.schema.lastschriftLauf.schauId, schauId));
    expect(lauf!.status).toBe("gebucht");
    expect(lauf!.daten.posten.every((p) => p.iban === "")).toBe(true);
    // Kassenbuch: Lastschrift ist kein Bargeld.
    const buch = await al().kasse.kassenbuch({ schauId });
    expect(buch.tage.flatMap((t) => t.bewegungen).some((b) => b.text.includes("Anna"))).toBe(false);

    // Zurückgebucht wird eine Lastschrift nur als Rücklastschrift (sonst ginge es zweimal: Storno und Rücklastschrift).
    await expect(al().meldung.zahlungStornieren({ id: z[0]!.id, grund: "Bank hat zurückgebucht" })).rejects.toThrow("Rücklastschrift");
    await al().lastschrift.ruecklastschrift({ schauId, laufId: lauf!.id, meldungId: ids.Anna!.meldungId, grund: "Konto erloschen (AC04)" });
    expect(await offen(ids.Anna!.meldungId)).toBe(1100);
    await expect(al().lastschrift.ruecklastschrift({ schauId, laufId: lauf!.id, meldungId: ids.Anna!.meldungId, grund: "doppelt" })).rejects.toThrow("schon gebucht");
  });

  test("Offene Datei: nichts ändert den eingezogenen Betrag oder entfernt die Meldung; Auszahlung verrechnet ihn nicht", async () => {
    const faellig = fruehesteFaelligkeit(heute);
    // Anna zahlt bar und bekommt das Geld zurück; das Storno der Erstattung zahlte das Meldegeld neben der Lastschrift.
    await al().meldung.zahlungErfassen({ meldungId: ids.Anna!.meldungId, betragCent: 1100, datum: heute, art: "bar" });
    await al().meldung.zahlungErfassen({ meldungId: ids.Anna!.meldungId, betragCent: -1100, datum: heute, art: "bar", grund: "Doch per Lastschrift" });
    const erstattung = (await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, ids.Anna!.meldungId))).find((z) => z.betragCent === -1100 && z.art === "bar")!;
    expect((await al().lastschrift.erstellen({ schauId, faelligAm: faellig, vorabankuendigung: false })).anzahl).toBe(1);
    const sperre = "Lastschrift";
    await expect(al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1200, befreitPreisrichter: false }] })).rejects.toThrow(sperre);
    const s = await al().schau.get({ id: schauId });
    const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const d = await al().meldung.get({ id: ids.Anna!.meldungId });
    const anna = { schauId, meldungId: ids.Anna!.meldungId, aussteller: { ...leer, vorname: "Anna", nachname: "Lastschrift", email: "anna@test.de", id: ids.Anna!.ausstellerId }, eingang: "papier" as const, istJugend: false, zustimmung: true };
    // Ein zweites Tier erhöhte das Meldegeld – die Bank zöge den alten Betrag ein.
    await expect(al().meldung.speichern({ ...anna, bemerkung: "", positionen: [{ ...pos, id: d.eintraege[0]!.id }, pos] })).rejects.toThrow(sperre);
    // Ohne Änderung am Betrag bleibt das Speichern möglich.
    await al().meldung.speichern({ ...anna, bemerkung: "Ruft vor der Schau an", positionen: [{ ...pos, id: d.eintraege[0]!.id }] });
    const [mandat] = await m.db.select().from(m.schema.sepaMandat).where(m.eq(m.schema.sepaMandat.ausstellerId, ids.Anna!.ausstellerId));
    await expect(al().lastschrift.mandatWiderrufen({ id: mandat!.id, am: heute })).rejects.toThrow(sperre);
    await expect(al().schau.absagen({ id: schauId, grund: "Vogelgrippe" })).rejects.toThrow(sperre);
    await expect(al().meldung.zahlungStornieren({ id: erstattung.id, grund: "versehentlich erstattet" })).rejects.toThrow(sperre);
    // Nach der Schau: keine Auszahlung, die das Meldegeld ein zweites Mal verrechnet; keine Überweisungsdatei; kein Abschluss.
    await m.db.update(m.schema.schau).set({ phase: "abrechnung" }).where(m.eq(m.schema.schau.id, schauId));
    await expect(al().kasse.auszahlen({ schauId, ausstellerId: ids.Anna!.ausstellerId })).rejects.toThrow(sperre);
    await expect(al().kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: faellig })).rejects.toThrow(sperre);
    await expect(al().schau.phaseSetzen({ id: schauId, phase: "abgeschlossen", trotzdem: true, grund: "Test" })).rejects.toThrow(sperre);
    // Eine ältere Fälligkeit, später gebucht, setzt die letzte Nutzung des Mandats nicht zurück (sonst verfiele es früher).
    const vorher = mandat!.letzteNutzungAm!;
    const u = await al().lastschrift.uebersicht({ schauId });
    await m.db.update(m.schema.lastschriftLauf).set({ faelligAm: "2026-10-20" }).where(m.eq(m.schema.lastschriftLauf.nachrichtId, u.offen!.nachrichtId));
    await al().lastschrift.buchen({ schauId, nachrichtId: u.offen!.nachrichtId });
    const [nachher] = await m.db.select().from(m.schema.sepaMandat).where(m.eq(m.schema.sepaMandat.id, mandat!.id));
    expect(nachher!.letzteNutzungAm).toBe(vorher);
  });

  test("Kein Einzug, wenn die Kasse das Meldegeld schon verrechnet hat", async () => {
    // Berta hat an der Kasse abgerechnet (das Meldegeld bar nachgezahlt), erst danach kam ihr Mandat.
    await al().kasse.auszahlen({ schauId, ausstellerId: ids.Berta!.ausstellerId });
    await al().lastschrift.mandatAnlegen({ ausstellerId: ids.Berta!.ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" });
    // Anna ist eingezogen; ohne die Prüfung stünde Berta noch einmal darin.
    expect((await al().lastschrift.uebersicht({ schauId })).vorschau.map((p) => p.name)).toEqual([]);
  });

  test("Einmal-Mandat nur in einer Datei; Rücklastschrift nicht nach Zuwendungsbestätigung; Auskunft und Löschung", async () => {
    const neueSchau = async (name: string) => {
      const { id } = await al().schau.anlegen({ name, ort: "Musterdorf" });
      await m.db.update(m.schema.schau).set({ vereinIban: "DE02120300000000202051", vereinBic: "BYLADEM1001", vereinKontoinhaber: "Musterverein e. V." }).where(m.eq(m.schema.schau.id, id));
      await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false }] });
      const s = await al().schau.get({ id });
      const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
      return { id, pos: { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null } };
    };
    const jung = await neueSchau("Jungtierschau Lastschrift");
    const haupt = await neueSchau("Hauptschau Lastschrift");
    const melden = async (sch: { id: number; pos: object }, vorname: string, extra: object = {}, ausstellerId?: number) => {
      const r = await al().meldung.speichern({ schauId: sch.id, aussteller: { ...leer, vorname, nachname: "Einmal", strasse: "Weg 1", plz: "12345", ort: "Musterdorf", email: "", ...(ausstellerId ? { id: ausstellerId } : {}) }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [sch.pos as never], ...extra });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r;
    };
    const f1 = await melden(jung, "Frieda");
    const f2 = await melden(haupt, "Frieda", {}, f1.ausstellerId);
    await al().lastschrift.mandatAnlegen({ ausstellerId: f1.ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: false, iban: "DE02300209000106531065", kontoinhaber: "" });
    const faellig = fruehesteFaelligkeit(heute);
    expect((await al().lastschrift.erstellen({ schauId: jung.id, faelligAm: faellig, vorabankuendigung: false })).anzahl).toBe(1);
    // Das einmalige Mandat steht schon in der Datei der Jungtierschau – in der Hauptschau nicht noch einmal.
    const h = await al().lastschrift.uebersicht({ schauId: haupt.id });
    expect(h.vorschau).toEqual([]);
    expect(h.ohneGueltigesMandat.map((x) => x.name)).toEqual(["Einmal, Frieda"]);
    expect(h.ohneGueltigesMandat[0]!.grund).toContain("anderen Lastschriftdatei");

    // Gustav spendet mit dem Meldegeld; nach Einzug und Zuwendungsbestätigung keine Rücklastschrift ohne Storno der Bestätigung.
    const g = await melden(haupt, "Gustav", { spende: { betragCent: 2_500, nennen: false } });
    await al().lastschrift.mandatAnlegen({ ausstellerId: g.ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" });
    await al().meldung.statusSetzen({ id: f2.meldungId, status: "storniert", grund: "Doppelt gemeldet" });
    const r = await al().lastschrift.erstellen({ schauId: haupt.id, faelligAm: faellig, vorabankuendigung: false });
    expect(r.anzahl).toBe(1);
    const lh = await al().lastschrift.uebersicht({ schauId: haupt.id });
    // Im Test zieht die Bank schon heute ein (sonst läge der Tag der Zuwendung für die Bestätigung in der Zukunft).
    await m.db.update(m.schema.lastschriftLauf).set({ faelligAm: heute }).where(m.eq(m.schema.lastschriftLauf.schauId, haupt.id));
    await al().lastschrift.buchen({ schauId: haupt.id, nachrichtId: lh.offen!.nachrichtId });
    const sp = (await al().spenden.liste({ schauId: haupt.id })).find((z) => z.spende.meldungId === g.meldungId)!;
    await al().spenden.bestaetigen({ spendeId: sp.spende.id });
    const [lauf] = await m.db.select().from(m.schema.lastschriftLauf).where(m.eq(m.schema.lastschriftLauf.schauId, haupt.id));
    await expect(al().lastschrift.ruecklastschrift({ schauId: haupt.id, laufId: lauf!.id, meldungId: g.meldungId, grund: "Widerspruch" })).rejects.toThrow("Zuwendungsbestätigung");

    // Auskunft (Art. 15): Mandat und eingezogene Lastschrift.
    const { ladeAuskunft } = await import("../services/datenschutz");
    const ak = await ladeAuskunft(adminKontext.benutzer!.organisationId, g.ausstellerId);
    expect(ak.lastschrift.mandate.map((x) => x.iban)).toEqual(["DE02100500000054540402"]);
    expect(ak.lastschrift.einzuege).toMatchObject([{ schau: "Hauptschau Lastschrift", faelligAm: heute, status: "gebucht", betragCent: 3_600 }]);

    // Löschwunsch: Name auch in früheren Lastschriftdateien weg.
    const lj = await al().lastschrift.uebersicht({ schauId: jung.id });
    await al().lastschrift.verwerfen({ schauId: jung.id, nachrichtId: lj.offen!.nachrichtId, grund: "Schau verschoben" });
    await al().meldung.statusSetzen({ id: f1.meldungId, status: "storniert", grund: "Schau verschoben" });
    await al().verein.ausstellerLoeschen({ id: f1.ausstellerId, grund: "Löschwunsch per Mail" });
    const [lj2] = await m.db.select().from(m.schema.lastschriftLauf).where(m.eq(m.schema.lastschriftLauf.schauId, jung.id));
    expect(JSON.stringify(lj2!.daten)).not.toContain("Frieda");
  });

  test("Löschwunsch: Mandat widerrufen, Bankdaten weg", async () => {
    // Ein Vereinsmitglied ohne laufende Meldung (mit laufender Meldung lehnt der Löschwunsch ab).
    const { id: aid } = await al().verein.ausstellerSpeichern({ daten: { vorname: "Ella", nachname: "Lastschrift", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" } });
    await al().lastschrift.mandatAnlegen({ ausstellerId: aid, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02300209000106531065", kontoinhaber: "" });
    await al().verein.ausstellerLoeschen({ id: aid, grund: "Löschwunsch per Mail" });
    const [mandat] = await m.db.select().from(m.schema.sepaMandat).where(m.eq(m.schema.sepaMandat.ausstellerId, aid));
    expect(mandat!.iban).toBe("");
    expect(mandat!.widerrufenAm).not.toBeNull();
    // Für gelöschte oder gesperrte Aussteller kein neues Mandat.
    await expect(al().lastschrift.mandatAnlegen({ ausstellerId: aid, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02300209000106531065", kontoinhaber: "" })).rejects.toThrow("gelöscht");
  });
});
