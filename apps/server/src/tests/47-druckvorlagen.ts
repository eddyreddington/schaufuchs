/**
 * Druckvorlagen für Bewertungskarten: Vorlagen des Vereins speichern, je Schau wählen, für eine Schau abwandeln,
 * löschen (Schau druckt dann wieder mit der Vorgabe); Format bestimmt die Seitengröße des PDFs; alles im Protokoll.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { KARTEN_VORGABE } from "@schau/domain";
import { adminKontext, m } from "./kontext";

/** Seitengröße der ersten Seite in mm (aus der MediaBox des PDFs). */
function seiteMm(pdf: Buffer): [number, number] {
  const t = pdf.toString("latin1");
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(t)!;
  return [Math.round((Number(box[1]) / 72) * 25.4), Math.round((Number(box[2]) / 72) * 25.4)];
}
const seiten = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("Druckvorlagen Bewertungskarte", () => {
  const al = () => m.appRouter.createCaller(adminKontext);

  test("Vorlage anlegen, für eine Schau wählen, Format wirkt auf das PDF, Löschen führt zur Vorgabe zurück", async () => {
    const { bewertungskartenPdf } = await import("../pdf/dokumente");
    const { id: schauId } = await al().schau.anlegen({ name: "Kartenprobe", ort: "Halle" });
    const s = await al().schau.get({ id: schauId });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId,
      aussteller: { vorname: "Karla", nachname: "Karte", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 5 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId });
    const laden = async () => m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId)).then((x) => x[0]!);

    // Ohne Vorlage: wie bisher A4-Bögen mit vier A6-Karten → 5 Tiere = 2 Seiten.
    let pdf = await bewertungskartenPdf(await laden());
    expect(seiteMm(pdf)).toEqual([210, 297]);
    expect(seiten(pdf)).toBe(2);

    const { id } = await al().druckvorlage.speichern({ name: "A5 schwarzweiß", daten: { ...KARTEN_VORGABE, format: { art: "a5-auf-a4" }, farbig: false } });
    await al().druckvorlage.waehlen({ schauId, vorlageId: id });
    pdf = await bewertungskartenPdf(await laden());
    expect(seiteMm(pdf)).toEqual([297, 210]);
    expect(seiten(pdf)).toBe(3);

    // Endlospapier 240 mm × 12 Zoll mit einer Karte je Bogen, Vordruck-Modus.
    await al().druckvorlage.speichern({ id, name: "Endlos", daten: { ...KARTEN_VORGABE, modus: "vordruck", format: { art: "endlos", bogenBreite: 240, bogenLaenge: 304.8, spalten: 1, zeilen: 1 } } });
    pdf = await bewertungskartenPdf(await laden());
    expect(seiteMm(pdf)).toEqual([240, 305]);
    expect(seiten(pdf)).toBe(5);

    // Für die Schau abwandeln: eigene Kopie, gleich gewählt; die Vereinsvorlage bleibt.
    const kopie = await al().druckvorlage.fuerSchauAnpassen({ schauId });
    expect(kopie.id).not.toBe(id);
    expect((await laden()).vorlageBewertungskarteId).toBe(kopie.id);
    const auswahl = await al().druckvorlage.fuerSchau({ schauId });
    expect(auswahl.wahl.map((w) => w.id).sort()).toEqual([id, kopie.id].sort());
    // Nochmal anpassen: dieselbe Kopie, keine weitere.
    expect((await al().druckvorlage.fuerSchauAnpassen({ schauId })).id).toBe(kopie.id);

    // Löschen der gewählten Vorlage: Schau druckt wieder mit der Vorgabe.
    await al().druckvorlage.loeschen({ id: kopie.id });
    expect((await laden()).vorlageBewertungskarteId).toBeNull();
    expect(seiteMm(await bewertungskartenPdf(await laden()))).toEqual([210, 297]);

    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "druckvorlage"));
    expect(prot.map((p) => p.aktion)).toEqual(expect.arrayContaining(["Druckvorlage angelegt", "Druckvorlage geändert", "Druckvorlage für die Schau angepasst", "Druckvorlage gelöscht"]));
    await al().druckvorlage.loeschen({ id });
  });

  test("Vorschau und Probedruck: PDF für die Ausstellungsleitung, sonst nichts", async () => {
    const server = (await import("../index")).default;
    const { neueSitzung } = await import("../auth");
    // Eigener Administrator mit eingerichteter Zwei-Faktor-Anmeldung (ohne sie gilt ein Administrator als Helfer).
    const [al2] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: adminKontext.benutzer!.organisationId, email: "druck-al@test.de", name: "Druck AL", passwortHash: "-", rolle: "admin", totpAktivSeit: new Date() })
      .returning();
    const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: al2!.id })}`;
    const helfer = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
    const post = (datei: string, koerper: unknown, kopf: Record<string, string> = { cookie, "content-type": "application/json" }) =>
      server.fetch(new Request(`http://test/datei/druckvorlage/${datei}`, { method: "POST", body: JSON.stringify(koerper), headers: kopf }));
    const endlos = { ...KARTEN_VORGABE, format: { art: "endlos", bogenBreite: 240, bogenLaenge: 304.8, spalten: 2, zeilen: 2 } };
    for (const datei of ["vorschau.pdf", "probedruck.pdf"]) {
      const r = await post(datei, { daten: endlos });
      expect(r.status).toBe(200);
      const pdf = Buffer.from(await r.arrayBuffer());
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(seiteMm(pdf)).toEqual([240, 305]);
    }
    expect((await post("vorschau.pdf", { daten: endlos }, { "content-type": "application/json" })).status).toBe(403);
    expect((await post("vorschau.pdf", { daten: endlos }, { cookie: helfer, "content-type": "application/json" })).status).toBe(403);
    expect((await post("vorschau.pdf", { daten: endlos }, { cookie, "content-type": "text/plain" })).status).toBe(415);
    expect((await post("anderes.pdf", { daten: endlos })).status).toBe(404);
  });

  test("Gespeichert wird nur Gültiges; fremde und schaufremde Vorlagen sind nicht wählbar", async () => {
    const { id } = await al().druckvorlage.speichern({ name: "Grenzen", daten: { groesse: 999, druck: { versatzX: 100 }, format: { art: "unsinn" } } });
    const v = (await al().druckvorlage.liste()).find((x) => x.id === id)!;
    expect(v.daten.groesse).toBe(150);
    expect(v.daten.druck.versatzX).toBe(30);
    expect(v.daten.format).toEqual(KARTEN_VORGABE.format);

    const { id: a } = await al().schau.anlegen({ name: "Schau A Vorlage", ort: "Halle" });
    const { id: b } = await al().schau.anlegen({ name: "Schau B Vorlage", ort: "Halle" });
    const nurA = await al().druckvorlage.fuerSchauAnpassen({ schauId: a });
    await expect(al().druckvorlage.waehlen({ schauId: b, vorlageId: nurA.id })).rejects.toThrow("anderen Schau");
    await expect(al().druckvorlage.waehlen({ schauId: b, vorlageId: 2_000_000_000 })).rejects.toThrow("nicht gefunden");
    await al().druckvorlage.loeschen({ id });
  });
});
