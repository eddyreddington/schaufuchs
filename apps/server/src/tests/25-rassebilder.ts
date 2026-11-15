/** Rassebilder: pflegen (nur Ausstellungsleitung), je Verein getrennt, ungeprüfte nicht im Katalog; Einspielen überschreibt nichts. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adminKontext, m } from "./kontext";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
/** 4 × 2 Pixel, rot. */
const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKALXj/9k=";
/** PNG mit Alphakanal (Farbtyp 6), 8 × 8. */
const PNG_ALPHA = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQY02P8z8DQwIAHMDEQAMNDAQCRUAGPKArZ0gAAAABJRU5ErkJggg==";
/** Dasselbe JPEG mit EXIF-Ausrichtung 6 (Kamera hochkant): angezeigt 2 × 4. */
function gedreht() {
  const roh = Buffer.from(JPG, "base64");
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const inhalt = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (inhalt.length + 2) >> 8, (inhalt.length + 2) & 0xff]), inhalt]);
  return Buffer.concat([roh.subarray(0, 2), app1, roh.subarray(2)]).toString("base64");
}

describe("Rassebilder", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("hochladen, Angaben, prüfen, löschen; Helfer nur lesen; fremder Verein sieht nichts; Einspielen überschreibt nichts", async () => {
    const { id } = await al().schau.anlegen({ name: "Bilder Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const versionId = s.stammdatenVersionId!;
    const liste = await helfer().rassebild.liste({ versionId });
    const wy = liste.find((z) => z.rasse.includes("Wyandotten"))!;
    expect(wy.bild).toBeNull();

    await expect(helfer().rassebild.hochladen({ rasse: wy.rasse, base64: PNG })).rejects.toThrow();
    await expect(al().rassebild.hochladen({ rasse: wy.rasse, base64: Buffer.from("<svg/>").toString("base64") })).rejects.toThrow("JPEG");
    await expect(al().rassebild.hochladen({ rasse: wy.rasse, base64: PNG, quelle: "javascript:alert(1)" })).rejects.toThrow("http");
    await al().rassebild.hochladen({ rasse: wy.rasse, base64: JPG, urheber: "Test Fotograf", lizenz: "CC BY-SA 4.0", quelle: "https://example.org/bild" });
    const mit = (await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === wy.rasse)!;
    expect(mit.bild).toMatchObject({ urheber: "Test Fotograf", lizenz: "CC BY-SA 4.0", geprueft: true, breite: 4, hoehe: 2 });
    await al().rassebild.angabenSetzen({ id: mit.bild!.id, urheber: "Neu", lizenz: "CC0", lizenzUrl: "", quelle: "", geprueft: false });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === wy.rasse)!.bild).toMatchObject({ urheber: "Neu", geprueft: false });

    // Anderer Verein: eigene Liste ohne dieses Bild, Löschen fremder Bilder geht nicht.
    const [org2] = await m.db.insert(m.schema.organisation).values({ name: "Fremder Verein" }).returning();
    const fremd = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, organisationId: org2!.id } });
    await expect(fremd.rassebild.loeschen({ id: mit.bild!.id })).rejects.toThrow("nicht gefunden");

    // Einspielen: vorhandenes Bild bleibt, neues kommt dazu (Sicherheit „mittel“ = ungeprüft).
    const dir = join(tmpdir(), `rassebilder-${Date.now()}`);
    mkdirSync(join(dir, "bilder"), { recursive: true });
    writeFileSync(join(dir, "bilder", "001.jpg"), Buffer.from(JPG, "base64"));
    writeFileSync(join(dir, "bilder", "002.jpg"), Buffer.from(JPG, "base64"));
    const zweite = liste.find((z) => z.rasse !== wy.rasse)!;
    writeFileSync(join(dir, "ergebnis.json"), JSON.stringify([
      { rasse: wy.rasse, datei: "001.jpg", urheber: "Fremd", lizenz: "CC BY 2.0", sicherheit: "hoch" },
      { rasse: zweite.rasse, datei: "002.jpg", urheber: "Commons", lizenz: "CC0", sicherheit: "mittel" },
      { rasse: "Gibt es nicht", datei: null },
    ]));
    const { rassebilderEinspielen } = await import("../rassebilder-import");
    expect(await rassebilderEinspielen(dir, adminKontext.benutzer!.organisationId)).toEqual({ neu: 1, vorhanden: 1, fehler: 0 });
    const danach = await helfer().rassebild.liste({ versionId });
    expect(danach.find((z) => z.rasse === wy.rasse)!.bild!.urheber).toBe("Neu");
    expect(danach.find((z) => z.rasse === zweite.rasse)!.bild).toMatchObject({ urheber: "Commons", geprueft: false });

    // Katalog: geprüftes Bild bei der Rasse, ungeprüftes nicht.
    const pos = { farbenschlagId: (await al().stammdaten.suche({ versionId, q: "Wyandotten" }))[0]!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al().meldung.speichern({ schauId: id, aussteller: { vorname: "Bild", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos, pos] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const { katalogPdf } = await import("../pdf/katalog");
    const bilderIm = async () => ((await katalogPdf((await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!)).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
    const ohne = await bilderIm(); // Wyandotten-Bild ist gerade ungeprüft
    await al().rassebild.angabenSetzen({ id: mit.bild!.id, urheber: "Neu", lizenz: "CC0", lizenzUrl: "", quelle: "", geprueft: true });
    expect(await bilderIm()).toBeGreaterThan(ohne);

    await al().rassebild.loeschen({ id: mit.bild!.id });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === wy.rasse)!.bild).toBeNull();
    const prot = (await m.db.select().from(m.schema.aenderung)).filter((p) => p.tabelle === "rassebild").map((p) => p.aktion);
    expect(prot).toEqual(expect.arrayContaining(["Rassebild gespeichert", "Rassebild-Angaben", "Rassebild gelöscht"]));
  });

  test("Gegenprüfung: nur vollständige JPEG, kaputte Bilder halten den Katalog nicht auf, Ausrichtung, Online-Katalog, Protokoll, Bildnachweis, Einspielen ungeprüft", async () => {
    const { id } = await al().schau.anlegen({ name: "Bilder Schau 2", ort: "Halle" });
    const s = await al().schau.get({ id });
    const versionId = s.stammdatenVersionId!;
    const org = adminKontext.benutzer!.organisationId;
    const liste = await helfer().rassebild.liste({ versionId });
    const wy = liste.find((z) => z.rasse.includes("Wyandotten"))!;
    // Das Protokoll bleibt über Testläufe hinweg (geschützt), die Bild-Nummern beginnen neu – nur Einträge ab hier.
    const ab = (await m.db.select().from(m.schema.aenderung)).reduce((x, p) => Math.max(x, p.id), 0);

    // PNG nicht mehr (pdfkit entpackt PNG mit Alphakanal asynchron – ein Fehler darin hält den Katalog an).
    await expect(al().rassebild.hochladen({ rasse: wy.rasse, base64: PNG })).rejects.toThrow("JPEG");
    await expect(al().rassebild.hochladen({ rasse: wy.rasse, base64: PNG_ALPHA })).rejects.toThrow("JPEG");
    // Abgeschnittenes JPEG (abgebrochener Download).
    await expect(al().rassebild.hochladen({ rasse: wy.rasse, base64: Buffer.from(JPG, "base64").subarray(0, 120).toString("base64") })).rejects.toThrow("unvollständig");
    // EXIF-Ausrichtung 6: gespeichert werden die angezeigten Maße (2 × 4), sonst wird das Bild im Katalog verzerrt.
    await al().rassebild.hochladen({ rasse: wy.rasse, base64: gedreht(), urheber: "Kamera" });
    let bild = (await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === wy.rasse)!.bild!;
    expect({ breite: bild.breite, hoehe: bild.hoehe }).toEqual({ breite: 2, hoehe: 4 });

    // Protokoll: Datensatz und vorherige Angaben.
    await al().rassebild.angabenSetzen({ id: bild.id, urheber: "Andere", lizenz: "CC0", lizenzUrl: "https://creativecommons.org/publicdomain/zero/1.0/", quelle: "", geprueft: true });
    const prot = (await m.db.select().from(m.schema.aenderung)).filter((p) => p.id > ab && p.tabelle === "rassebild" && p.datensatzId === bild.id);
    expect(prot.find((p) => p.aktion === "Rassebild gespeichert")).toBeTruthy();
    expect(prot.find((p) => p.aktion === "Rassebild-Angaben")!.alt).toMatchObject({ urheber: "Kamera" });

    // Bildnachweis: Lizenz-Adresse dabei; ohne Urheber nicht „eigenes Bild“, wenn das Bild eine fremde Quelle hat.
    const { bildnachweis } = await import("../pdf/katalog");
    expect(bildnachweis("Wy", { urheber: "", lizenz: "CC BY 2.0", lizenzUrl: "https://creativecommons.org/licenses/by/2.0/", quelle: "https://commons.wikimedia.org/x" })).toBe(
      "Wy: Urheber unbekannt · CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/) · https://commons.wikimedia.org/x",
    );
    expect(bildnachweis("Wy", { urheber: "", lizenz: "", lizenzUrl: "", quelle: "" })).toBe("Wy: eigenes Bild");
    // Für den Druck: kurze, lesbare Adressen und Urheber ohne Wikimedia-Hinweistexte und Signatur-Zeitstempel.
    const { bildnachweisTeile, kurzeAdresse, urheberKurz } = await import("../pdf/katalog");
    expect(kurzeAdresse("https://commons.wikimedia.org/wiki/File:Pommerngans_G%C3%B6ssel.jpg")).toBe("commons.wikimedia.org/wiki/File:Pommerngans_Gössel.jpg");
    expect(kurzeAdresse("http://www.creativecommons.org/licenses/by-sa/3.0/")).toBe("creativecommons.org/licenses/by-sa/3.0");
    expect(urheberKurz("No machine-readable author provided. Rex assumed (based on copyright claims).")).toBe("Rex");
    expect(urheberKurz("Halved sandwich 00:07, 2 January 2007 (UTC)")).toBe("Halved sandwich");
    expect(bildnachweisTeile({ urheber: "Anna", lizenz: "CC BY-SA 4.0", lizenzUrl: "https://creativecommons.org/licenses/by-sa/4.0", quelle: "https://commons.wikimedia.org/wiki/File:A.jpg" })).toEqual({
      angaben: "Foto: Anna · CC BY-SA 4.0",
      adressen: "commons.wikimedia.org/wiki/File:A.jpg  ·  Lizenz: creativecommons.org/licenses/by-sa/4.0",
    });
    expect(bildnachweisTeile({ urheber: "", lizenz: "", lizenzUrl: "", quelle: "" })).toEqual({ angaben: "eigenes Bild", adressen: "" });

    // Kaputte Bilder aus älteren Ständen oder von Hand eingetragen: Katalog wird trotzdem fertig.
    const zwei = liste.filter((z) => z.rasse !== wy.rasse).slice(5, 7);
    const alpha = Buffer.from(PNG_ALPHA, "base64");
    const idat = alpha.indexOf("IDAT");
    alpha.fill(0x55, idat + 6, idat + 14); // Bilddaten zerstört, Kopf heil
    await m.db.insert(m.schema.rassebild).values([
      { organisationId: org, rasse: zwei[0]!.rasse, mime: "image/png", daten: alpha, breite: 8, hoehe: 8, geprueft: true },
      { organisationId: org, rasse: zwei[1]!.rasse, mime: "image/jpeg", daten: Buffer.from(JPG, "base64").subarray(0, 40), breite: 4, hoehe: 2, geprueft: true },
    ]);
    const melden = async (farbenschlagId: number) => {
      const pos = { farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
      const r = await al().meldung.speichern({ schauId: id, aussteller: { vorname: "Bild", nachname: "Kaputt", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    };
    for (const name of [wy.rasse, zwei[0]!.rasse, zwei[1]!.rasse]) await melden((await al().stammdaten.suche({ versionId, q: name }))[0]!.id);
    await al().katalog.nummernVergeben({ schauId: id });
    const { katalogPdf } = await import("../pdf/katalog");
    const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
    const pdf = await Promise.race([katalogPdf(zeile), new Promise<null>((ok) => setTimeout(() => ok(null), 8000))]);
    expect(pdf).not.toBeNull();
    // Fotos sind JPEG (DCTDecode); die Stiche der Titelseite und Spartenköpfe (PNG) zählen hier nicht mit.
    expect((pdf!.toString("latin1").match(/\/Filter \/DCTDecode/g) ?? []).length).toBe(1); // nur das heile Wyandotten-Bild

    // Öffentlicher Katalog: Löschen eines Bilds (z. B. auf Verlangen des Urhebers) macht den Zwischenspeicher sofort ungültig.
    const { oeffentlicherStand } = await import("../services/zwischenspeicher");
    const vorher = await oeffentlicherStand(id);
    await al().rassebild.loeschen({ id: bild.id });
    expect((await oeffentlicherStand(id)).zaehler).not.toBe(vorher.zaehler);

    // Einspielen: alles ungeprüft, außer ausdrücklich gewünscht; ein Protokolleintrag.
    const dir = join(tmpdir(), `rassebilder-b-${Date.now()}`);
    mkdirSync(join(dir, "bilder"), { recursive: true });
    writeFileSync(join(dir, "bilder", "001.jpg"), Buffer.from(JPG, "base64"));
    writeFileSync(join(dir, "ergebnis.json"), JSON.stringify([{ rasse: wy.rasse, datei: "001.jpg", urheber: "Commons", lizenz: "CC0", sicherheit: "hoch" }]));
    const { rassebilderEinspielen } = await import("../rassebilder-import");
    expect(await rassebilderEinspielen(dir, org)).toEqual({ neu: 1, vorhanden: 0, fehler: 0 });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === wy.rasse)!.bild!.geprueft).toBe(false);
    expect((await m.db.select().from(m.schema.aenderung)).some((p) => p.id > ab && p.tabelle === "rassebild" && p.aktion === "Rassebilder eingespielt")).toBe(true);
  });

  test("Gegenprüfung 2: kaputtes PNG bei Logo oder Titelbild hält den Katalog nicht an; Ersetzen bleibt ungeprüft bis zu den Angaben", async () => {
    const { id } = await al().schau.anlegen({ name: "Bilder Schau 3", ort: "Halle" });
    const s = await al().schau.get({ id });
    const versionId = s.stammdatenVersionId!;
    const kaputt = Buffer.from(PNG_ALPHA, "base64");
    const idat = kaputt.indexOf("IDAT");
    kaputt.fill(0x55, idat + 6, idat + 14);
    // Hochladen lehnt es ab (pdfkit entpackt PNG mit Alphakanal nebenbei – ein Fehler darin kommt nie zurück).
    await expect(al().katalogGestaltung.bildHochladen({ schauId: id, rolle: "logo", name: "logo.png", base64: kaputt.toString("base64") })).rejects.toThrow("lässt sich nicht lesen");
    await al().katalogGestaltung.bildHochladen({ schauId: id, rolle: "logo", name: "logo.png", base64: PNG_ALPHA }); // heil: geht
    // Älterer Stand oder von Hand eingetragen: der Katalog wird trotzdem fertig, ohne das kaputte Bild.
    await m.db.insert(m.schema.bild).values({ schauId: id, rolle: "titel", mime: "image/png", name: "titel.png", daten: kaputt });
    const pos = { farbenschlagId: (await al().stammdaten.suche({ versionId, q: "Wyandotten" }))[0]!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al().meldung.speichern({ schauId: id, aussteller: { vorname: "Titel", nachname: "Kaputt", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const { katalogPdf } = await import("../pdf/katalog");
    const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
    const pdf = await Promise.race([katalogPdf(zeile), new Promise<null>((ok) => setTimeout(() => ok(null), 8000))]);
    expect(pdf).not.toBeNull();

    // Ersetzen (Oberfläche schickt geprueft: false): erst „Angaben“ mit Haken bringt es in den Katalog.
    const rasse = (await helfer().rassebild.liste({ versionId })).find((z) => !z.bild)!.rasse;
    await al().rassebild.hochladen({ rasse, base64: JPG, geprueft: false });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === rasse)!.bild!.geprueft).toBe(false);
    // Ohne Lizenzangabe bleibt es ungeprüft (Gesamtprüfung 13.11.2026), mit „eigenes Bild“ ist es geprüft.
    await al().rassebild.hochladen({ rasse, base64: JPG });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === rasse)!.bild!.geprueft).toBe(false);
    await al().rassebild.hochladen({ rasse, base64: JPG, lizenz: "eigenes Bild" });
    expect((await helfer().rassebild.liste({ versionId })).find((z) => z.rasse === rasse)!.bild!.geprueft).toBe(true);
  });
});
