/**
 * Briefvorlage des Vereins: speichern (Protokoll), eigene Texte im B-Bogen, Serienbrief an Mitglieder, alle Aussteller
 * oder die einer Schau – ohne gesperrte und Test-Aussteller –, Rechte der Datei-Adressen. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { BRIEF_VORGABE } from "@schau/domain";
import { adminKontext, m, pdfText } from "./kontext";

const flach = (t: string) => t.replace(/\s+/g, " ");
const seiten = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("Briefvorlage und Serienbrief", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const leer = { vorname: "", nachname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  let schauId = 0;
  let meldungId = 0;

  test("Vorlage speichern, B-Bogen mit eigenen Texten", async () => {
    expect((await al().druckvorlage.brief()).vorlage).toEqual(BRIEF_VORGABE);
    await al().druckvorlage.briefSpeichern({
      daten: { ...BRIEF_VORGABE, form: "A", meldebestaetigung: { einleitung: "{Anrede}, herzlich willkommen zur {Schau}.", hinweise: "Bitte pünktlich einliefern.\n\nKäfigkarten mitbringen.", gruss: "Ihr Ausstellungsteam" } },
    });
    expect((await al().druckvorlage.brief()).vorlage.form).toBe("A");
    const [p] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Briefvorlage gespeichert"));
    expect(p).toBeTruthy();

    ({ id: schauId } = await al().schau.anlegen({ name: "Briefschau", ort: "Musterdorf" }));
    const s = await al().schau.get({ id: schauId });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId,
      aussteller: { ...leer, vorname: "Bruno", nachname: "Brief", strasse: "Lindenweg 1", plz: "12345", ort: "Musterdorf" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    meldungId = r.meldungId;
    await al().meldung.statusSetzen({ id: meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId });
    const { ausstellerUnterlagenPdf } = await import("../pdf/dokumente");
    const [zeile] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const text = flach(pdfText(await ausstellerUnterlagenPdf(zeile!, [meldungId])));
    expect(text).toContain("Guten Tag Bruno Brief, herzlich willkommen zur Briefschau.");
    expect(text).toContain("Bitte pünktlich einliefern.");
    expect(text).toContain("Käfigkarten mitbringen.");
    expect(text).toContain("Ihr Ausstellungsteam");
    expect(text).not.toContain("Impfnachweis");
  });

  test("Kassenbeleg: Briefkopf aus der Vorlage, farbig aus", async () => {
    await al().druckvorlage.briefSpeichern({ daten: { ...BRIEF_VORGABE, kopf: "Kopfverein Musterdorf e. V.\nLindenweg 3", farbig: false } });
    const [k] = await m.db.insert(m.schema.kassenbewegung).values({ schauId, art: "einlage", betragCent: 5000, grund: "Wechselgeld" }).returning();
    const { kassenbelegPdf } = await import("../pdf/dokumente");
    const [zeile] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const text = flach(pdfText((await kassenbelegPdf(zeile!, "eigenbeleg", k!.id))!));
    expect(text).toContain("Kopfverein Musterdorf e. V.");
    expect(text).toContain("Lindenweg 3");
  });

  test("Empfänger: Mitglieder, alle Aussteller, eine Schau – nie gesperrte oder Test-Aussteller", async () => {
    const { serienbriefEmpfaenger } = await import("../services/serienbrief");
    const mitglied = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Maria", nachname: "Mitbrief", verein: "GZV Irgendwo" }, mitglied: "ja" });
    const extern = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Erik", nachname: "Fremdbrief", verein: "GZV Anderswo" }, mitglied: "nein" });
    const gesperrt = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Gerd", nachname: "Sperrbrief", verein: "GZV Irgendwo" }, mitglied: "ja" });
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date() }).where(m.eq(m.schema.aussteller.id, gesperrt.id));
    const org = adminKontext.benutzer!.organisationId;
    const ids = async (a: "mitglieder" | "aussteller" | "schau", sid?: number) => (await serienbriefEmpfaenger(org, a, sid)).map((x) => x.id);
    const mit = await ids("mitglieder");
    expect(mit).toContain(mitglied.id);
    expect(mit).not.toContain(extern.id);
    expect(mit).not.toContain(gesperrt.id);
    const alle = await ids("aussteller");
    expect(alle).toEqual(expect.arrayContaining([mitglied.id, extern.id]));
    expect(alle).not.toContain(gesperrt.id);
    const [bruno] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    expect(await ids("schau", schauId)).toEqual([bruno!.ausstellerId]);
    expect(await al().druckvorlage.serienbriefAnzahl({ auswahl: "schau", schauId })).toEqual({ anzahl: 1, ohneAnschrift: 0 });
  });

  test("Die Briefvorlage ist keine Bewertungskarte: nicht überschreiben, löschen oder wählen", async () => {
    const briefe = await m.db.select().from(m.schema.druckvorlage).where(m.eq(m.schema.druckvorlage.art, "brief"));
    const brief = briefe.find((b) => b.organisationId === adminKontext.benutzer!.organisationId);
    const { KARTEN_VORGABE } = await import("@schau/domain");
    await expect(al().druckvorlage.speichern({ id: brief!.id, name: "Karte", daten: KARTEN_VORGABE })).rejects.toThrow("nicht gefunden");
    await expect(al().druckvorlage.loeschen({ id: brief!.id })).rejects.toThrow("nicht gefunden");
    await expect(al().druckvorlage.waehlen({ schauId, vorlageId: brief!.id })).rejects.toThrow("nicht gefunden");
  });

  test("Datei-Adressen: Serienbrief je Empfänger eine Seite, Vorschau der Vorlage, nur Ausstellungsleitung", async () => {
    const server = (await import("../index")).default;
    const { neueSitzung } = await import("../auth");
    const [al2] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: adminKontext.benutzer!.organisationId, email: "brief-al@test.de", name: "Brief AL", passwortHash: "-", rolle: "admin", totpAktivSeit: new Date() })
      .returning();
    const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: al2!.id })}`;
    const post = (pfad: string, koerper: unknown, mitCookie = true) =>
      server.fetch(new Request(`http://test${pfad}`, { method: "POST", body: JSON.stringify(koerper), headers: { ...(mitCookie ? { cookie } : {}), "content-type": "application/json" } }));
    const brief = await post("/datei/serienbrief.pdf", { auswahl: "schau", schauId, betreff: "Ergebnisse der {Schau}", text: "{Anrede},\nanbei die Ergebnisse.", gruss: "Viele Grüße" });
    expect(brief.status).toBe(200);
    const pdf = Buffer.from(await brief.arrayBuffer());
    expect(seiten(pdf)).toBe(1);
    expect(flach(pdfText(pdf))).toContain("Ergebnisse der Briefschau");
    expect(flach(pdfText(pdf))).toContain("Guten Tag Bruno Brief,");
    expect((await post("/datei/druckvorlage/brief.pdf", { daten: BRIEF_VORGABE })).status).toBe(200);
    expect((await post("/datei/serienbrief.pdf", { auswahl: "mitglieder" }, false)).status).toBe(403);
    expect((await post("/datei/serienbrief.pdf", { auswahl: "irgendwer" })).status).toBe(400);
    // „Aussteller einer Schau“ ohne Schau: Fehler statt still die neueste Schau.
    expect((await post("/datei/serienbrief.pdf", { auswahl: "schau" })).status).toBe(400);
    // Seitenzahlen zählen je Brief, nicht über den ganzen Stapel.
    const alle = Buffer.from(await (await post("/datei/serienbrief.pdf", { auswahl: "aussteller", betreff: "Rundbrief", text: "Kurz.", gruss: "" })).arrayBuffer());
    expect(seiten(alle)).toBeGreaterThan(1);
    expect(flach(pdfText(alle))).not.toMatch(/Seite \d+ von [2-9]/);
    // Vorlage für die folgenden Teile zurück auf die Vorgabe.
    await al().druckvorlage.briefSpeichern({ daten: BRIEF_VORGABE });
  });
});
