/**
 * Formatvorgaben der Drucke (Entscheidung 029, Rückmeldung „Bei den Druckeinstellungen fehlen die Formatvorgaben“):
 * speichern, ablehnen, Protokoll, Rechte; Bewertungsliste, Hallenplan, Kaufbeleg, Kassenbeleg und Spendenquittung im
 * gewählten Format (Seitengröße aus der MediaBox, Text vollständig über pdftotext); Übernahme aus einer Vorlage; die
 * festen Formate der Übersicht stimmen mit den PDFs überein. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { DRUCK_FORMATE_VORGABE, DRUCKSACHEN, type DrucksacheId, KARTEN_VORGABE, kartenVorlageLesen, PAPIER_MM } from "@schau/domain";
import { adminKontext, m, pdfText, verkaufsbereit } from "./kontext";

/** Seitengrößen aller Seiten in mm (aus den MediaBoxen). */
function seitenMm(pdf: Buffer): [number, number][] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((x) => [Math.round((Number(x[1]) / 72) * 25.4), Math.round((Number(x[2]) / 72) * 25.4)]);
}
/** Eine Seitengröße für das ganze PDF. */
function seiteMm(pdf: Buffer): [number, number] {
  const alle = seitenMm(pdf);
  expect(alle.length).toBeGreaterThan(0);
  expect(new Set(alle.map((s) => s.join("x"))).size).toBe(1);
  return alle[0]!;
}
const flach = (t: string) => t.replace(/\s+/g, " ");
const textSeiten = (t: string) => t.split("\f").filter((s) => s.trim());

describe("Formatvorgaben der Drucke", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  const laden = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
  const protokoll = async (id: number) =>
    (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((p) => p.aktion === "Druckformate").sort((a, b) => a.id - b.id);
  const pos = (f: { id: number }, preis: number | null = null) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: preis });
  const ausstellerLeer = { strasse: "Formweg 1", plz: "12345", ort: "Formdorf", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  const hol = async (pfad: string, cookie: string) => (await import("../index")).default.fetch(new Request(`http://test${pfad}`, { headers: { cookie } }));
  const mitSitzung = async (f: (cookie: string) => Promise<void>) => {
    const cfg = (await import("../config")).config;
    const vorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      await f(`schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`);
    } finally {
      cfg.zweiFaktorPflichtAdmin = vorher;
    }
  };
  /** Schau mit einer bestätigten Meldung (Tiere mit Katalognummern) und einem Preisrichter für alle Nummern. */
  async function schauMitTieren(name: string, anzahl: number, preis: number | null = null) {
    const { id } = await al().schau.anlegen({ name, ort: "Formhalle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Fritz", nachname: "Formgeheim", ...ausstellerLeer },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: anzahl }, () => pos(wy!, preis)),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const liste = await al().katalog.liste({ schauId: id });
    const nummern = liste.map((e) => e.katalogNr!).sort((a, b) => a - b);
    const pr = await al().preisrichter.speichern({ schauId: id, name: "Petra Papierformat", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [] });
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: pr.id, vonNr: nummern[0]!, bisNr: nummern.at(-1)! }] });
    return { id, meldungId: r.meldungId, nummern, eintraege: liste, preisrichterId: pr.id };
  }

  test("Übersicht, speichern, ablehnen, Protokoll und Rechte", async () => {
    const { id } = await al().schau.anlegen({ name: "Formatschau", ort: "Formhalle" });
    // Neue Schau: überall die Vorgabe (so druckte SchauFUCHS bisher), Katalog A4, Karten nach der Vorgabe.
    const vorher = await helfer().druckvorlage.formate({ schauId: id });
    expect(vorher).toEqual({ formate: DRUCK_FORMATE_VORGABE, katalog: "A4", karten: { vorlageId: null, name: null, format: KARTEN_VORGABE.format.art } });
    expect((await laden(id)).druckFormate).toEqual({});

    // Nur die Ausstellungsleitung ändert.
    await expect(helfer().druckvorlage.formateSetzen({ schauId: id, formate: { hallenplan: "A3" } })).rejects.toThrow(/Administrator|Ausstellungsleitung|Berechtigung/);

    expect(await al().druckvorlage.formateSetzen({ schauId: id, formate: { hallenplan: "A3", kaufbeleg: "A4" } })).toEqual({ ok: true, geaendert: true });
    // Einzelne Drucksache ändern: die übrigen bleiben.
    await al().druckvorlage.formateSetzen({ schauId: id, formate: { bewertungsliste: "A5" } });
    const neu = { bewertungsliste: "A5", hallenplan: "A3", kaufbeleg: "A4", kassenbeleg: "A5" };
    expect((await al().druckvorlage.formate({ schauId: id })).formate).toEqual(neu as never);
    // Gleicher Stand: nichts geändert, kein weiterer Protokolleintrag.
    expect(await al().druckvorlage.formateSetzen({ schauId: id, formate: { hallenplan: "A3" } })).toEqual({ ok: true, geaendert: false });

    // Ablehnen: Format, das es für diese Drucksache nicht gibt, unbekannte Drucksache, fremde Schau.
    for (const formate of [{ hallenplan: "A5" }, { kaufbeleg: "A3" }, { bewertungsliste: "A6" }, { kassenbeleg: "" }, { fremd: "A4" }])
      await expect(al().druckvorlage.formateSetzen({ schauId: id, formate: formate as never })).rejects.toThrow();
    await expect(al().druckvorlage.formateSetzen({ schauId: 2_000_000_000, formate: { hallenplan: "A3" } })).rejects.toThrow();
    expect((await al().druckvorlage.formate({ schauId: id })).formate).toEqual(neu as never);

    // Protokoll: je Änderung ein Eintrag mit altem und neuem Stand, nach id geordnet.
    const p = await protokoll(id);
    expect(p).toHaveLength(2);
    expect(p[0]!.alt).toEqual(DRUCK_FORMATE_VORGABE);
    expect(p[0]!.neu).toEqual({ ...DRUCK_FORMATE_VORGABE, hallenplan: "A3", kaufbeleg: "A4" });
    expect(p[1]!.alt).toEqual(p[0]!.neu);
    expect(p[1]!.neu).toEqual(neu);
    expect(p[1]!.benutzerId).toBe(adminKontext.benutzer!.id);

    // Ungültiger Altbestand in der Datenbank wird beim Lesen begrenzt (Vorgabe), nicht gedruckt.
    await m.db.update(m.schema.schau).set({ druckFormate: { hallenplan: "A0", kaufbeleg: "A4", fremd: 1 } as never }).where(m.eq(m.schema.schau.id, id));
    expect((await al().druckvorlage.formate({ schauId: id })).formate).toEqual({ ...DRUCK_FORMATE_VORGABE, kaufbeleg: "A4" });
  });

  test("Bewertungsliste A4 (zwei Listen) und A5 (eine je Seite): Seitengröße und alle Nummern", async () => {
    const { preisrichterListePdf } = await import("../pdf/bewertungsliste");
    const { id, nummern, preisrichterId } = await schauMitTieren("Listenformat", 90);
    const pdfA4 = await preisrichterListePdf(await laden(id), preisrichterId);
    expect(seiteMm(pdfA4)).toEqual([210, 297]);
    const a4 = pdfText(pdfA4);
    // Zwei Listen nebeneinander (die letzte Seite kann mit der linken enden).
    expect(textSeiten(a4)[0]).toMatch(/NOTE\s+PKT\..*NOTE\s+PKT\./);

    await al().druckvorlage.formateSetzen({ schauId: id, formate: { bewertungsliste: "A5" } });
    const pdfA5 = await preisrichterListePdf(await laden(id), preisrichterId);
    expect(seiteMm(pdfA5)).toEqual([148, 210]);
    const a5 = pdfText(pdfA5);
    const seiten = textSeiten(a5);
    // Eine Liste je Seite: mehr Seiten, Spaltenkopf einmal je Zeile, Seitenzählung bis zum Ende.
    expect(seiten.length).toBeGreaterThan(textSeiten(a4).length);
    for (const s of seiten) {
      expect(s).toMatch(/NOTE\s+PKT\./);
      expect(s).not.toMatch(/NOTE\s+PKT\..*NOTE\s+PKT\./);
    }
    expect(a5).toContain(`Seite ${seiten.length} von ${seiten.length}`);
    // Nichts läuft über: jede Nummer steht im Text, der Kopf auch, keine Ausstellernamen.
    for (const n of nummern) expect(a5).toMatch(new RegExp(`(^|\\s)${n}(\\s|$)`, "m"));
    for (const x of ["Bewertungsliste", "Petra Papierformat", "90"]) expect(a5).toContain(x);
    expect(a5).not.toContain("Formgeheim");

    // Langer Name im Kopf auf A5: Kopf schmaler für die Angaben, Name ganz lesbar, eine Seite bei wenigen Tieren.
    const lang = "Hans-Joachim Freiherr von Schwarzenberg-Langenfeld";
    const obmann = "Wilhelmine Obfrau-Überlänge";
    const ob = await al().preisrichter.speichern({ schauId: id, name: obmann, anschrift: "", email: "", telefon: "", istObmann: true, sparten: [] });
    const pr2 = await al().preisrichter.speichern({ schauId: id, name: lang, anschrift: "", email: "", telefon: "", istObmann: false, sparten: [], obmannId: ob.id });
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: preisrichterId, vonNr: nummern[0]!, bisNr: nummern[84]! }, { preisrichterId: pr2.id, vonNr: nummern[85]!, bisNr: nummern.at(-1)! }] });
    const kurz = pdfText(await preisrichterListePdf(await laden(id), pr2.id));
    expect(textSeiten(kurz)).toHaveLength(1);
    const kopf = flach(textSeiten(kurz)[0]!.split("NR.")[0]!);
    // Auf A5 sind die Angaben rechts schmaler: der Name braucht höchstens drei Zeilen (vorher vier).
    const nameZeilen = textSeiten(kurz)[0]!.split("Zum Eintragen")[0]!.split("\n").filter((z) => /Hans-Joachim|Freiherr|Schwarzenberg|Langenfeld/.test(z));
    expect(nameZeilen.length).toBeLessThanOrEqual(3);
    for (const x of ["Schwarzenberg-", "Langenfeld", "Hans-Joachim", obmann, "Tiere", nummern.slice(85).length > 1 ? `${nummern[85]}–${nummern.at(-1)}` : String(nummern[85])]) expect(kopf).toContain(x);
    // Der Name bricht nur an Leerzeichen bzw. Bindestrich um, nie mitten im Wort.
    for (const wort of ["Freiherr", "Schwarzenberg-", "Langenfeld"]) expect(kopf).toMatch(new RegExp(`(^|\\s)${wort}`));
  });

  test("Hallenplan A3: ein Blatt in der Größe, Ausrichtung nach der Halle", async () => {
    const { hallenplanPdf } = await import("../pdf/hallenplan");
    const { id } = await schauMitTieren("Planformat", 12);
    await al().katalog.halleSetzen({
      schauId: id,
      halle: { breite: 1550, laenge: 2750, gang: 150, richtung: "quer", wandreihen: true, quergang: false, wandBuendig: true, hauptgang: { breite: 250, lage: "ende" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] },
    });
    const a4 = await hallenplanPdf(await laden(id));
    expect(seiteMm(a4)).toEqual([297, 210]);
    await al().druckvorlage.formateSetzen({ schauId: id, formate: { hallenplan: "A3" } });
    const a3 = await hallenplanPdf(await laden(id));
    expect(seitenMm(a3)).toEqual([[420, 297]]);
    const t = pdfText(a3);
    expect(textSeiten(t)).toHaveLength(1);
    for (const x of ["Hallenplan", "Planformat", "Halle 15,5 × 27,5 m", "Petra Papierformat"]) expect(flach(t)).toContain(x);
  });

  test("Kaufbeleg, Kassenbeleg und Spendenquittung: A5 quer oder oben auf A4, Text vollständig; archivierter Beleg bleibt", () =>
    mitSitzung(async (cookie) => {
      const { kaufbelegPdf, kassenbelegPdf } = await import("../pdf/dokumente");
      const { spendenquittung } = await import("../services/spenden-quittung");
      const { id, eintraege } = await schauMitTieren("Belegformat", 2, 2500);
      await verkaufsbereit(id, eintraege.map((e) => e.id));
      const kaufe = (e: (typeof eintraege)[number], name: string) =>
        al().kasse.verkaufen({ schauId: id, katalogeintragId: e.id, kaeuferName: name, kaeuferAnschrift: "Kaufgasse 2, 54321 Kaufstadt", kaeuferRegistriernummer: "065350111111", kaeuferAlter: "ab16" });
      const kaufbelegText = ["KAUFBELEG", "AUSGABESCHEIN", "zwanzig", "Unterschrift Verkaufsstelle", "Tier ausgegeben – Datum, Unterschrift", "Datenschutzhinweise"];

      // Vorgabe: A5 quer wie bisher; der Beleg wird beim Buchen archiviert.
      const v1 = await kaufe(eintraege[0]!, "Karl Käufer");
      const archivA5 = Buffer.from(await (await hol(`/datei/${id}/kaufbeleg/${v1.id}.pdf`, cookie)).arrayBuffer());
      expect(seitenMm(archivA5)).toEqual([[210, 148]]);

      await al().druckvorlage.formateSetzen({ schauId: id, formate: { kaufbeleg: "A4", kassenbeleg: "A4" } });
      const v2 = await kaufe(eintraege[1]!, "Kora Käuferin");
      const antwort = await hol(`/datei/${id}/kaufbeleg/${v2.id}.pdf`, cookie);
      expect(antwort.status).toBe(200);
      const archivA4 = Buffer.from(await antwort.arrayBuffer());
      expect(seitenMm(archivA4)).toEqual([[210, 297]]);
      const t = flach(pdfText(archivA4));
      for (const x of [...kaufbelegText, "Kora Käuferin", "Kaufgasse 2", String(v2.belegNr), "25,00"]) expect(t).toContain(x);
      // Erzeugt wie beim Abruf ohne Archiv: dieselbe Seite.
      expect(seitenMm(await kaufbelegPdf(await laden(id), v2.id))).toEqual([[210, 297]]);
      // Der erste Beleg bleibt der von damals (A5), auch nach dem Umstellen.
      expect(seiteMm(Buffer.from(await (await hol(`/datei/${id}/kaufbeleg/${v1.id}.pdf`, cookie)).arrayBuffer()))).toEqual([210, 148]);

      // Eigenbeleg auf A4: eine Seite, Unterschriften über der Schnittlinie.
      const [k] = await m.db.insert(m.schema.kassenbewegung).values({ schauId: id, art: "einlage", betragCent: 5000, grund: "Wechselgeld Formprobe" }).returning();
      const eigen = (await kassenbelegPdf(await laden(id), "eigenbeleg", k!.id))!;
      expect(seitenMm(eigen)).toEqual([[210, 297]]);
      const te = flach(pdfText(eigen));
      for (const x of ["Eigenbeleg Einlage", `K-${k!.id}`, "Wechselgeld Formprobe", "fünfzig", "Unterschrift Kasse", "Unterschrift Zeuge"]) expect(te).toContain(x);

      // Spendenquittung folgt den Kassenbelegen.
      const { id: spenderId } = await al().spenden.spenderSpeichern({ daten: { vorname: "Sina", nachname: "Spenderform", strasse: "Gabenweg 5", plz: "12345", ort: "Formdorf" } });
      const { id: spendeId } = await al().spenden.erfassen({ schauId: id, spenderId, art: "geld", weg: "bar", betragCent: 3000, zweck: "Formprobe" });
      const sq = (await spendenquittung(id, spendeId, false))!;
      expect(seitenMm(sq)).toEqual([[210, 297]]);
      const ts = flach(pdfText(sq));
      for (const x of ["Spendenquittung", "Sina Spenderform", "Formprobe", "dreißig", "Unterschrift Kasse", "Unterschrift Spender"]) expect(ts).toContain(x);

      // Zurück auf A5: wieder A5 quer, eine Seite (vorher liefen die Unterschriften des Eigenbelegs auf zwei Leerseiten).
      await al().druckvorlage.formateSetzen({ schauId: id, formate: { kassenbeleg: "A5" } });
      expect(seitenMm((await kassenbelegPdf(await laden(id), "eigenbeleg", k!.id))!)).toEqual([[210, 148]]);
      expect(seitenMm((await spendenquittung(id, spendeId, false))!)).toEqual([[210, 148]]);
    }));

  test("Schau aus Vorlage: Formatvorgaben und Kartenvorlage kommen mit", async () => {
    const { id: alt } = await al().schau.anlegen({ name: "Formvorlage alt", ort: "Formhalle" });
    await al().druckvorlage.formateSetzen({ schauId: alt, formate: { hallenplan: "A3", kassenbeleg: "A4" } });
    const { id: verein } = await al().druckvorlage.speichern({ name: "Formvorlage Verein", daten: { ...KARTEN_VORGABE, format: { art: "a5-auf-a4" } } });
    await al().druckvorlage.waehlen({ schauId: alt, vorlageId: verein });

    const { id: neu1 } = await al().schau.anlegen({ name: "Formvorlage neu", ort: "Formhalle", vorlageId: alt });
    const f1 = await al().druckvorlage.formate({ schauId: neu1 });
    expect(f1.formate).toEqual({ ...DRUCK_FORMATE_VORGABE, hallenplan: "A3", kassenbeleg: "A4" });
    // Vereinsvorlage: dieselbe.
    expect(f1.karten).toEqual({ vorlageId: verein, name: "Formvorlage Verein", format: "a5-auf-a4" });

    // Für die alte Schau abgewandelt: die neue bekommt eine eigene Kopie.
    const { id: kopieAlt } = await al().druckvorlage.fuerSchauAnpassen({ schauId: alt });
    const { id: neu2 } = await al().schau.anlegen({ name: "Formvorlage neu zwei", ort: "Formhalle", vorlageId: alt });
    const f2 = await al().druckvorlage.formate({ schauId: neu2 });
    expect(f2.karten.vorlageId).not.toBeNull();
    expect(f2.karten.vorlageId).not.toBe(kopieAlt);
    expect(f2.karten.format).toBe("a5-auf-a4");
    const [k] = await m.db.select().from(m.schema.druckvorlage).where(m.eq(m.schema.druckvorlage.id, f2.karten.vorlageId!));
    expect(k!.schauId).toBe(neu2);
    expect((await al().druckvorlage.fuerSchau({ schauId: neu2 })).vorlageId).toBe(k!.id);
    // Name nicht verschachtelt („neu: alt: Verein“), sondern wie „Für diese Schau anpassen“; Übernahme im Protokoll.
    expect(k!.name).toBe("Formvorlage neu zwei: Formvorlage Verein");
    const p2 = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, neu2))).filter((x) => x.tabelle === "druckvorlage").sort((a, b) => a.id - b.id);
    expect(p2.map((x) => [x.aktion, x.datensatzId, x.neu])).toEqual([["Druckvorlage aus der Vorlage übernommen", k!.id, { quelle: kopieAlt }]]);

    // Gespeicherter Altbestand wird über kartenVorlageLesen() begrenzt (ADR 011), nicht roh kopiert.
    await m.db.update(m.schema.druckvorlage).set({ daten: { ...KARTEN_VORGABE, fremd: "x", groesse: 1e9 } as never }).where(m.eq(m.schema.druckvorlage.id, kopieAlt));
    const { id: neu3 } = await al().schau.anlegen({ name: "Formvorlage neu drei", ort: "Formhalle", vorlageId: alt });
    const [k3] = await m.db.select().from(m.schema.druckvorlage).where(m.eq(m.schema.druckvorlage.id, (await al().druckvorlage.formate({ schauId: neu3 })).karten.vorlageId!));
    expect(k3!.daten).toEqual(kartenVorlageLesen({ ...KARTEN_VORGABE, fremd: "x", groesse: 1e9 }));
    expect(JSON.stringify(k3!.daten)).not.toContain("fremd");

    // Ohne Vorlage: Vorgabe.
    const { id: leer } = await al().schau.anlegen({ name: "Formvorlage leer", ort: "Formhalle" });
    expect((await al().druckvorlage.formate({ schauId: leer })).formate).toEqual(DRUCK_FORMATE_VORGABE);
  });

  test("Text ohne Platz (Breite ≤ 1) hängt nicht: das PDF ist in unter 2 s fertig, der Text fehlt", async () => {
    // pdfkit 0.15 begrenzt die Breite nur bei Zeilenumbruch; mit lineBreak:false und negativer Breite lief der
    // Zeilenumbruch endlos – Bun ist einthreadig, der ganze Server hing. Deshalb in einem eigenen Prozess mit Zeitlimit.
    const skript = `
      const { erzeugePdf } = await import("./src/pdf/basis");
      const pdf = await erzeugePdf("Probe", (doc) => {
        doc.text("vorher", 20, 20);
        doc.text("negativ", 20, 40, { width: -30, lineBreak: false });
        doc.text("null", 20, 60, { width: 0.5, lineBreak: false, ellipsis: true });
        doc.text("unendlich", 20, 80, { width: Number.NaN, lineBreak: false });
        doc.text("negativ umbrechend", 20, 100, { width: -30 });
        doc.text("nachher", 20, 120);
      });
      process.stdout.write(pdf.toString("base64"));
    `;
    const p = Bun.spawn(["bun", "-e", skript], { cwd: `${import.meta.dir}/../..`, stdout: "pipe", stderr: "pipe" });
    const zeit = setTimeout(() => p.kill(), 2000);
    const start = Date.now();
    const aus = await new Response(p.stdout).text();
    await p.exited;
    clearTimeout(zeit);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(p.exitCode).toBe(0);
    const t = pdfText(Buffer.from(aus, "base64"));
    expect(t).toContain("vorher");
    expect(t).toContain("nachher");
    for (const x of ["negativ", "null", "unendlich"]) expect(t).not.toContain(x);
  });

  test("Feste Formate der Übersicht stimmen mit den PDFs überein", () =>
    mitSitzung(async (cookie) => {
      const { id, meldungId } = await schauMitTieren("Festformat", 3);
      const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
      // Je feste Drucksache eine Adresse (Serienbrief und Zuwendungsbestätigung: eigene Tests 48 und 49).
      const adresse: Partial<Record<DrucksacheId, string[]>> = {
        aBogen: [`/datei/${id}/a-bogen.pdf`],
        bBogen: [`/datei/${id}/aussteller.pdf`],
        verpflichtung: [`/datei/${id}/preisrichter-verpflichtung.pdf`],
        preisverteilung: [`/datei/${id}/preisverteilung.pdf`],
        meisterschaften: [`/datei/${id}/meisterschaften.pdf`],
        kassenbericht: [`/datei/${id}/kassenbericht.pdf`],
        abrechnung: [`/datei/${id}/abrechnung.pdf?aussteller=${mel!.ausstellerId}`],
        abrechnungListe: [`/datei/${id}/abrechnung.pdf`],
        amtslisten: [`/datei/${id}/tierliste.pdf`, `/datei/${id}/verkaufsliste.pdf`],
        aufbauliste: [`/datei/${id}/aufbauliste.pdf`],
      };
      const ohneAdresse = ["serienbrief", "zuwendung"];
      for (const d of DRUCKSACHEN.filter((x) => x.fest)) {
        if (ohneAdresse.includes(d.id)) continue;
        expect(adresse[d.id]).toBeDefined();
        const p = PAPIER_MM[d.fest!.papier];
        const soll = d.fest!.lage === "quer" ? [p.hoehe, p.breite] : [p.breite, p.hoehe];
        for (const pfad of adresse[d.id]!) {
          const a = await hol(pfad, cookie);
          expect(a.status).toBe(200);
          expect([pfad, seiteMm(Buffer.from(await a.arrayBuffer()))]).toEqual([pfad, soll as [number, number]]);
        }
      }
    }));
});
