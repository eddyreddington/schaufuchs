/** Druckkatalog: Schrift und Gestaltung wählbar, A4 als Vorgabe, Stiche je Sparte (einmal eingebettet), Öffnungszeiten untereinander. */
import { describe, expect, test } from "bun:test";
import { KATALOG_SCHRIFTEN, KATALOG_STILE } from "@schau/domain";
import { adminKontext, m, pdfText } from "./kontext";

/** Kennzeichen der eingebetteten Titelschrift je Schriftpaar (PostScript-Name im PDF). */
/** 4 × 2 Pixel, rot. */
const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKALXj/9k=";
const TITELSCHRIFT = { klassisch: "Spectral", traditionell: "EBGaramond", lesbar: "AtkinsonHyperlegible", modern: "SourceSans3", buchschmal: "EBGaramond", ausgewogen: "Spectral" } as const;

describe("Druckkatalog gestalten", () => {
  test("Stiche: jede Sparte hat ihren Stich, alle Dateien sind lesbare PNG", async () => {
    const { stichBild, stichFuer } = await import("../pdf/illustrationen");
    expect(stichFuer("Hühner")).toBe("hahn");
    expect(stichFuer("Zwerghühner")).toBe("henne");
    expect(stichFuer("Tauben")).toBe("tauben");
    expect(stichFuer("Wassergeflügel")).toBe("enten");
    expect(stichFuer("Enten")).toBe("enten");
    expect(stichFuer("Gänse")).toBe("gaense");
    expect(stichFuer("Großgeflügel")).toBe("puten");
    expect(stichFuer("Puten")).toBe("puten");
    expect(stichFuer("Wachteln")).toBe("wachteln");
    expect(stichFuer("Hühner", true)).toBe("huehner"); // Stämme und Volieren: Hahn mit Henne
    for (const n of ["hahn", "hahn-titel", "huehner", "henne", "enten", "gaense", "tauben", "puten", "wachteln"] as const) {
      const b = stichBild(n);
      expect(b.subarray(1, 4).toString()).toBe("PNG");
    }
  });

  test("Schrift und Gestaltung speichern; jeder Stil mit jeder Schrift ergibt einen Katalog, Stiche nur einmal eingebettet", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const vorher = (await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung;
    const basis = { format: "A4" as const, untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a" };
    try {
      // Fehlt eine Angabe (ältere Oberfläche), bleibt der gespeicherte Wert; Unbekanntes wird abgelehnt.
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, stil: "rahmen", schrift: "lesbar", aufteilung: "tabelle", rassebilder: false } });
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: basis });
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toMatchObject({ format: "A4", schrift: "lesbar", stil: "rahmen", aufteilung: "tabelle", rassebilder: false });
      await expect(al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, aufteilung: "vierspaltig" as never } })).rejects.toThrow();
      await expect(al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, ausgeblendet: ["titelseite" as never] } })).rejects.toThrow();
      await expect(al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, stil: "bunt" as never } })).rejects.toThrow();
      await expect(al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, schrift: "comic" as never } })).rejects.toThrow();

      const { katalogPdf } = await import("../pdf/katalog");
      const schau = { ...s!, oeffnungszeiten: "Sa. 9–18 Uhr; So. 9–16 Uhr" };
      for (const stil of KATALOG_STILE) {
        for (const schrift of KATALOG_SCHRIFTEN) {
          await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, stil, schrift } });
          expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toMatchObject({ stil, schrift });
          const pdf = await katalogPdf(schau);
          expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
          const roh = pdf.toString("latin1");
          expect(roh).toContain(TITELSCHRIFT[schrift]);
          // Öffnungszeiten je Tag in einer eigenen Zeile.
          const text = pdfText(pdf);
          expect(text).toMatch(/Sa\. 9–18 Uhr\s*\n\s*So\. 9–16 Uhr/);
        }
      }

      // Stämme und Volieren sind zwei Abteilungen mit demselben Stich (Hahn mit Henne): eingebettet wird er nur einmal.
      const { id } = await al.schau.anlegen({ name: "Stich Schau", ort: "Halle" });
      const versionId = (await al.schau.get({ id })).stammdatenVersionId!;
      const farbenschlagId = (await al.stammdaten.suche({ versionId, q: "Wyandotten" }))[0]!.id;
      const pos = (art: "einzeltier" | "stamm" | "voliere", geschlecht: string) => ({ farbenschlagId, freitext: "", art, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
      const aussteller = { vorname: "Stich", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
      const r = await al.meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos("einzeltier", "1,0"), pos("stamm", "1,2"), pos("voliere", "1,3")] });
      await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      await al.katalog.nummernVergeben({ schauId: id });
      const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
      const roh = (await katalogPdf(zeile)).toString("latin1");
      const stiche = [...roh.matchAll(/\/Width (\d+)\n\/Height (\d+)\n\/Filter \/FlateDecode\n\/ColorSpace \/DeviceGray\n\/SMask/g)].map((x) => `${x[1]}×${x[2]}`);
      // Titel (Hahn), Hühner (Hahn), Stämme und Volieren (beide Hahn mit Henne) – drei verschiedene Stiche, jeder einmal.
      expect(stiche).toHaveLength(3);
      expect(new Set(stiche).size).toBe(3);
    } finally {
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { format: vorher.format, untertitel: vorher.untertitel, schirmherr: vorher.schirmherr, ausstellungsleitung: vorher.ausstellungsleitung, eintritt: vorher.eintritt, farbe: vorher.farbe, schrift: vorher.schrift, stil: vorher.stil, aufteilung: vorher.aufteilung, rassebilder: vorher.rassebilder, sparteNeueSeite: vorher.sparteNeueSeite, ausgeblendet: vorher.ausgeblendet } });
    }
  });

  test("Aufteilung (Tabelle, zwei-, dreispaltig), Rassebilder ein/aus, jede Sparte auf neuer Seite, Teile ausblenden", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { katalogPdf } = await import("../pdf/katalog");
    const { id } = await al.schau.anlegen({ name: "Aufteilung Schau", ort: "Halle" });
    const versionId = (await al.schau.get({ id })).stammdatenVersionId!;
    const fs = async (q: string) => (await al.stammdaten.suche({ versionId, q }))[0]!.id;
    const wy = await fs("Wyandotten");
    const gans = await fs("Pommerngänse");
    const pos = (farbenschlagId: number, geschlecht: string) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const aussteller = { vorname: "Auf", nachname: "Teilung", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
    const r = await al.meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(gans, "1,0"), pos(gans, "0,1"), ...Array.from({ length: 150 }, (_, i) => pos(wy, i % 2 ? "0,1" : "1,0"))] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: id });

    // Genug Wyandotten, dass der Tierteil alle Spalten der ersten Hühnerseite füllt.
    // Ein geprüftes Rassebild (JPEG) für die Wyandotten, damit „Rassebilder aus“ etwas zu prüfen hat.
    const zeileWy = (await al.rassebild.liste({ versionId })).find((z) => z.rasse.includes("Wyandotten"))!;
    if (zeileWy.bild) await al.rassebild.angabenSetzen({ id: zeileWy.bild.id, urheber: "Test", lizenz: "CC0", lizenzUrl: "", quelle: "", geprueft: true });
    else await al.rassebild.hochladen({ rasse: zeileWy.rasse, base64: JPG, urheber: "Test", lizenz: "CC0" });

    const basis = { format: "A4" as const, untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a" };
    const katalog = async (daten: Record<string, unknown>) => {
      await al.katalogGestaltung.speichern({ schauId: id, daten: { ...basis, ...daten } });
      const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
      const pdf = await katalogPdf(zeile);
      return { roh: pdf.toString("latin1"), seiten: pdfText(pdf).split("\f") };
    };
    // Spaltenköpfe und Kicker sind gesperrt gesetzt (pdftotext liest „AU SSTE L L E R“) – ohne Leerzeichen vergleichen.
    const flach = (t: string) => t.replace(/\s+/g, "");
    /**
     * Zahl der Spalten im Tierteil: Spaltenköpfe („AUSSTELLER“) je Seite; steht davor auf der Seite eine kleine Sparte
     * (die Gänse, eine Spalte), zählt ihr Kopf nicht mit.
     */
    const spalten = (seiten: string[]) =>
      Math.max(...seiten.map((t) => (flach(t).match(/AUSSTELLER/g) ?? []).length - Math.max(0, (flach(t).match(/SPARTE/g) ?? []).length - 1)));

    const zwei = await katalog({ aufteilung: "zweispaltig" });
    expect(spalten(zwei.seiten)).toBe(2);
    expect(flach(zwei.seiten.join(""))).not.toContain("FARBENSCHLAG");
    const tabelle = await katalog({ aufteilung: "tabelle" });
    expect(spalten(tabelle.seiten)).toBe(1);
    // In der Tabelle steht Klasse und Farbenschlag in jeder Tierzeile.
    expect(flach(tabelle.seiten.join(""))).toContain("FARBENSCHLAG");
    expect(tabelle.seiten.join("").match(/^\s*\d+\s+[01],[01] jung\s+\S/gm) ?? []).toHaveLength(152);
    expect(spalten((await katalog({ aufteilung: "dreispaltig" })).seiten)).toBe(3);
    // Auf A5 wären drei Spalten zu schmal – dort zweispaltig.
    expect(spalten((await katalog({ aufteilung: "dreispaltig", format: "A5" })).seiten)).toBe(2);

    // Rassebilder: Fotos sind JPEG (DCTDecode).
    expect((await katalog({ rassebilder: true })).roh).toContain("/DCTDecode");
    const ohneBilder = await katalog({ rassebilder: false });
    expect(ohneBilder.roh).not.toContain("/DCTDecode");
    expect(ohneBilder.seiten.join("")).not.toContain("Bildnachweis");

    // Jede Sparte auf neuer Seite: Wassergeflügel und Hühner nie zusammen auf einer Seite.
    const zusammen = (seiten: string[]) => seiten.some((t) => (flach(t).match(/SPARTE/g) ?? []).length > 1);
    expect(zusammen((await katalog({ sparteNeueSeite: false })).seiten)).toBe(true);
    expect(zusammen((await katalog({ sparteNeueSeite: true })).seiten)).toBe(false);

    // Teile ausblenden: weg sind genau die abgewählten, Titel, Inhalt, Termine und Tierteil bleiben.
    const alle = (await katalog({ ausgeblendet: [] })).seiten.join("");
    for (const t of ["So lesen Sie den Katalog", "Rassenverzeichnis", "Ausstellerverzeichnis", "Notizen"]) expect(alle).toContain(t);
    const ohne = await katalog({ ausgeblendet: ["legende", "rassenverzeichnis", "ausstellerverzeichnis", "notizen"], rassebilder: true });
    const text = ohne.seiten.join("");
    for (const t of ["So lesen Sie den Katalog", "Rassenverzeichnis", "Ausstellerverzeichnis", "Notizen"]) expect(text).not.toContain(t);
    for (const t of ["Inhalt", "Ausstellungsleitung", "Wyandotten", "Pommerngänse"]) expect(text).toContain(t);
    // Der Bildnachweis bleibt (Lizenzpflicht), auf eigener Seite statt mitten im Tierteil.
    expect(text).toContain("Bildnachweis");
    expect(flach(ohne.seiten.find((t) => t.includes("Foto: Test"))!)).not.toContain("AUSSTELLER");
    // Die Seitenzahl bleibt beidseitig druckbar (A4: gerade), auch ohne Notizseiten.
    expect((ohne.seiten.length - (ohne.seiten.at(-1)!.trim() === "" ? 1 : 0)) % 2).toBe(0);
  });

  test("Vorschau: Darstellung aus der Adresse, ohne zu speichern; nur angemeldet, nur bekannte Angaben", async () => {
    const { vorschauAus } = await import("../routers/katalog-gestaltung");
    expect(vorschauAus({})).toBeNull();
    expect(vorschauAus({ aufteilung: "tabelle", rassebilder: "0", neueSeite: "1", ohne: "notizen,legende,notizen", farbe: "#224466", format: "A5" })).toEqual({
      aufteilung: "tabelle", rassebilder: false, sparteNeueSeite: true, ausgeblendet: ["notizen", "legende"], farbe: "#224466", format: "A5",
    });
    expect(vorschauAus({ ohne: "" })).toEqual({ ausgeblendet: [] });
    // Unbekanntes und Texte (z. B. Namen) gehören nicht in die Adresse.
    for (const falsch of [{ aufteilung: "vierspaltig" }, { ohne: "titelseite" }, { farbe: "rot" }, { rassebilder: "ja" }, { untertitel: "Max Muster" }] as Record<string, string>[]) expect(vorschauAus(falsch)).toBe("ungueltig");

    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const server = (await import("../index")).default;
      const al = m.appRouter.createCaller(adminKontext);
      const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
      const vorher = (await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung;
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const hol = (pfad: string, mitCookie = true) => server.fetch(new Request(`http://test${pfad}`, { headers: mitCookie ? { cookie } : {} }));
      const andere = vorher.aufteilung === "tabelle" ? "dreispaltig" : "tabelle";
      const r = await hol(`/datei/${s!.id}/katalog.pdf?aufteilung=${andere}&ohne=notizen`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-disposition") ?? "").toContain("-vorschau.pdf");
      const text = pdfText(Buffer.from(await r.arrayBuffer())).replace(/\s+/g, "");
      expect(text.includes("FARBENSCHLAG")).toBe(andere === "tabelle");
      // Gespeichert bleibt, was vorher galt.
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toEqual(vorher);
      expect((await hol(`/datei/${s!.id}/katalog.pdf?aufteilung=vierspaltig`)).status).toBe(400);
      expect((await hol(`/datei/${s!.id}/katalog.pdf?untertitel=Max`)).status).toBe(400);
      expect((await hol(`/datei/${s!.id}/katalog.pdf?aufteilung=tabelle`, false)).status).toBe(403);
      // Der öffentliche Katalog kennt keine Vorschau: Angaben in der Adresse ändern dort nichts.
      expect(await (await hol(`/s/${s!.slug}/katalog.pdf?aufteilung=tabelle`, false)).text()).not.toContain("Ungültige Angaben");
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Live-Vorschau: Formular samt Texten im Rumpf, Kurzvorschau, Seitenbereiche im Kopf, nur die neueste je Benutzer", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const server = (await import("../index")).default;
      const al = m.appRouter.createCaller(adminKontext);
      // Die Schau aus dem Test oben: 150 Wyandotten und zwei Gänse.
      const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.name, "Aufteilung Schau"));
      const vorher = (await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung;
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const adresse = `http://test/datei/${s!.id}/katalog-vorschau.pdf`;
      const schick = (koerper: unknown, kopf: Record<string, string> = {}, signal?: AbortSignal) =>
        server.fetch(new Request(adresse, { method: "POST", body: typeof koerper === "string" ? koerper : JSON.stringify(koerper), headers: { cookie, "content-type": "application/json", ...kopf }, signal }));

      const kurz = await schick({ daten: { untertitel: "Unterzeile nur in der Vorschau", ausgeblendet: ["notizen"], aufteilung: "tabelle" }, kurz: true });
      expect(kurz.status).toBe(200);
      const kurzPdf = Buffer.from(await kurz.arrayBuffer());
      const kurzText = pdfText(kurzPdf);
      // Texte aus dem Formular stehen in der Vorschau, gespeichert wird nichts.
      expect(kurzText).toContain("Unterzeile nur in der Vorschau");
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toEqual(vorher);
      // Kurzvorschau: höchstens zehn Wyandotten (Tabelle: eine Zeile je Tier), die Seitenbereiche passen zum PDF.
      expect(kurzText.match(/^\s*\d+\s+[01],[01] jung\s+\S/gm)?.length).toBe(12);
      const bereiche = JSON.parse(kurz.headers.get("x-katalog-gliederung")!) as { schluessel: string; von: number; bis: number }[];
      const seitenzahl = kurzText.split("\f").filter((t, i, a) => i < a.length - 1 || t.trim()).length;
      expect(bereiche[0]).toEqual({ schluessel: "titel", von: 1, bis: 1 });
      expect(bereiche.map((b) => b.schluessel)).toEqual(expect.arrayContaining(["inhalt", "leitung", "legende", "tierteil", "rassenverzeichnis", "ausstellerverzeichnis"]));
      expect(bereiche.map((b) => b.schluessel)).not.toContain("notizen");
      expect(bereiche.at(-1)!.bis).toBe(seitenzahl);
      for (const [i, b] of bereiche.entries()) if (i) expect(b.von).toBeGreaterThanOrEqual(bereiche[i - 1]!.bis);
      // Ganzer Katalog: alle 152 Tiere.
      const ganz = await schick({ daten: { aufteilung: "tabelle" }, kurz: false });
      expect(pdfText(Buffer.from(await ganz.arrayBuffer())).match(/^\s*\d+\s+[01],[01] jung\s+\S/gm)?.length).toBe(152);

      // Nur JSON, nur von der eigenen Seite, nur angemeldet, nur bekannte Angaben, kleine Anfragen.
      expect((await schick({ daten: {}, kurz: true }, { "content-type": "text/plain" })).status).toBe(415);
      expect((await schick({ daten: {}, kurz: true }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await schick({ daten: {}, kurz: true }, { cookie: "" })).status).toBe(403);
      for (const falsch of [{ daten: { aufteilung: "vierspaltig" }, kurz: true }, { daten: { unbekannt: 1 }, kurz: true }, { daten: {} }, "kein json"]) expect((await schick(falsch)).status).toBe(400);
      expect((await schick({ daten: { ausstellungsleitung: "x".repeat(40_000) }, kurz: true })).status).toBe(413);

      // Abgebrochen, bevor sie dran ist: entfällt.
      const ab = new AbortController();
      ab.abort();
      expect((await schick({ daten: {}, kurz: true }, {}, ab.signal)).status).toBe(409);
      // Zwei Vorschauen hinter vollen Katalogen: die ältere entfällt, die neuere kommt.
      // Erst die Kataloge in die Schlange kommen lassen (Anmeldung ist asynchron), sonst ist die ältere Vorschau zuerst dran.
      const voll = Array.from({ length: 5 }, () => server.fetch(new Request(`http://test/datei/${s!.id}/katalog.pdf`, { headers: { cookie } })));
      await Bun.sleep(50);
      const alt = schick({ daten: { farbe: "#112233" }, kurz: true });
      await Bun.sleep(30);
      const neu = schick({ daten: { farbe: "#445566" }, kurz: true });
      expect((await alt).status).toBe(409);
      expect((await neu).status).toBe(200);
      await Promise.all(voll);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Mehr Gestaltung: Akzentfarbe, Titelhintergrund, randloses Titelbild, Fußzeilen, Linienstärke; Vorgaben wie bisher", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { katalogPdf } = await import("../pdf/katalog");
    const { inflateSync } = await import("node:zlib");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.name, "Aufteilung Schau"));
    const vorgaben = { akzent: "", titelHintergrund: "weiss", titelbild: "eingepasst", fusszeile: "linie", linien: "normal", stil: "klassisch" } as const;
    const basis = { format: "A4" as const, untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a", ...vorgaben };
    /** Farbe, wie pdfkit sie in den Zeichenbefehlen schreibt. */
    const rgb = (hex: string) => [1, 3, 5].map((i) => String(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");
    // Ohne gespeicherte Angaben gelten die Vorgaben – das bisherige Aussehen.
    expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toMatchObject({ akzent: "", titelHintergrund: "weiss", titelbild: "eingepasst", fusszeile: "linie", linien: "normal" });
    /** Entpackte Inhalte aller Ströme, ohne Bilder und Schriften – zum Vergleichen der Zeichenbefehle. */
    const inhalt = (pdf: Buffer) =>
      [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
        .map((x) => {
          try {
            return inflateSync(Buffer.from(x[1]!, "latin1")).toString("latin1");
          } catch {
            return "";
          }
        })
        .filter((t) => / Tf\b/.test(t))
        .join("\n");
    const katalog = async (daten: Record<string, unknown>) => {
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, ...daten } });
      const zeile = (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, s!.id)))[0]!;
      return inhalt(await katalogPdf(zeile));
    };
    const vorgabe = await katalog({});
    // Ausdrücklich gesetzte Vorgaben ändern nichts.
    expect(await katalog({ akzent: "", titelHintergrund: "weiss", titelbild: "eingepasst", fusszeile: "linie", linien: "normal" })).toBe(vorgabe);
    // Jede neue Einstellung wirkt und wird gespeichert.
    for (const daten of [{ akzent: "#b8860b" }, { titelHintergrund: "getoent" }, { titelHintergrund: "papier" }, { fusszeile: "mittig" }, { fusszeile: "marke" }, { linien: "fein" }, { linien: "kraeftig" }, { stil: "schlicht" }] as const) {
      const neu = await katalog(daten);
      expect(neu).not.toBe(vorgabe);
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung).toMatchObject(daten);
    }
    // Papierton als Fläche der Titelseite (#f6f0e1), Akzentfarbe Gold (#b8860b) als Farbe der Zierlinien.
    expect(await katalog({ titelHintergrund: "papier" })).toContain(`${rgb("#f6f0e1")} scn`);
    expect(vorgabe).not.toContain(rgb("#f6f0e1"));
    expect(await katalog({ akzent: "#b8860b", stil: "rahmen" })).toContain(`${rgb("#b8860b")} SCN`);
    expect(vorgabe).not.toContain(rgb("#b8860b"));
    // Schlicht: keine getönten Flächen (Rassebalken, Hinweiskasten), nur Linien.
    expect(await katalog({ stil: "schlicht" })).not.toContain("/Gs");
    // Unbekannte Werte lehnt der Server ab.
    for (const falsch of [{ akzent: "rot" }, { titelHintergrund: "bunt" }, { fusszeile: "oben" }, { linien: "dick" }, { titelbild: "gross" }])
      await expect(al.katalogGestaltung.speichern({ schauId: s!.id, daten: { ...basis, ...falsch } as never })).rejects.toThrow();
    await katalog({});
  });
});
