/**
 * Preisrichterverpflichtung, Nachbesserung: Termin „Rückmeldung der Preisrichter bis“ in den Einstellungen der Schau
 * (Prüfung, Protokoll, nicht aus der Vorlage), im Brief und im Abschnitt zum Abtrennen; eigener Brieftext aus der
 * Briefvorlage mit Platzhaltern (leer: fester Text); Zusage beim Anlegen aus einer Vorlage wieder offen und leer.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("Preisrichter: Rückmeldetermin, Brieftext, Zusage aus der Vorlage", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const hol = async (pfad: string, cookie = "") => (await import("../index")).default.fetch(new Request(`http://test${pfad}`, { headers: cookie ? { cookie } : {} }));
  const text = async (pfad: string, cookie: string) => {
    const a = await hol(pfad, cookie);
    expect(a.status).toBe(200);
    return pdfText(Buffer.from(await a.arrayBuffer()));
  };
  // Zeilenumbrüche im PDF-Text zu Leerzeichen, damit Sätze über Zeilen hinweg zu finden sind.
  const flach = (t: string) => t.replace(/\s+/g, " ");
  const richter = (schauId: number, name: string, mehr: Record<string, unknown> = {}) =>
    al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten: [], ...mehr });
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
  /** Einstellungen speichern wie die Oberfläche: aktueller Stand plus Änderungen. */
  const einstellen = async (id: number, mehr: Record<string, unknown>) => {
    const s = await al().schau.get({ id });
    const { id: _, organisationId: __, test: ___, phase: ____, createdAt: _____, ...rest } = s as unknown as Record<string, unknown>;
    const felder = ["name", "slug", "veranstalter", "ort", "meldeschluss", "einlieferung", "bewertungAm", "oeffnungszeiten", "aussetzen", "reklamationsfrist", "kapazitaet", "stammdatenVersionId", "provisionBp", "katalogStart", "jugendSeparat", "staemmeVorn", "kontingentJe", "bestimmungen", "bankverbindung", "kontaktEmail", "vereinKontoinhaber", "vereinIban", "vereinBic"];
    const daten = Object.fromEntries(felder.map((f) => [f, rest[f]]));
    return al().schau.aktualisieren({ id, daten: { ...daten, ...mehr } as never });
  };

  test("Rückmeldung bis: Einstellung mit Prüfung und Protokoll, im Brief und im Abschnitt, nicht aus der Vorlage", () =>
    mitSitzung(async (cookie) => {
      const { id } = await al().schau.anlegen({ name: "Rückmeldeschau", ort: "Probedorf" });
      const b = await richter(id, "Bruno Buche");
      await einstellen(id, { bewertungAm: "2027-11-06" });
      expect((await al().schau.get({ id })).preisrichterRueckmeldungBis).toBeNull();
      // Ohne Termin: kein „bis“ im Brief.
      const ohne = flach(await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie));
      expect(ohne).toContain("Bitte senden Sie uns den unteren Abschnitt ausgefüllt und unterschrieben zurück.");
      expect(ohne).not.toContain("Rückmeldung bis");

      // Ungültig oder nach dem Bewertungstag: abgelehnt.
      await expect(einstellen(id, { preisrichterRueckmeldungBis: "2027-02-30" })).rejects.toThrow();
      await expect(einstellen(id, { preisrichterRueckmeldungBis: "2027-11-07" })).rejects.toThrow("nach dem Bewertungstag");
      await expect(einstellen(id, { bewertungAm: "2027-09-01", preisrichterRueckmeldungBis: "2027-10-01" })).rejects.toThrow("nach dem Bewertungstag");
      const ab = ((await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }])[0].ab;
      await einstellen(id, { preisrichterRueckmeldungBis: "2027-10-01" });
      expect((await al().schau.get({ id })).preisrichterRueckmeldungBis).toBe("2027-10-01");
      const prot = (await m.db.select().from(m.schema.aenderung)).filter((p) => p.id > ab && p.tabelle === "schau" && p.datensatzId === id);
      expect(prot.some((p) => (p.neu as Record<string, unknown>).preisrichterRueckmeldungBis === "2027-10-01")).toBe(true);
      // Ältere Oberfläche ohne das Feld: der Termin bleibt.
      await einstellen(id, { ort: "Probedorf Nord" });
      expect((await al().schau.get({ id })).preisrichterRueckmeldungBis).toBe("2027-10-01");

      const mit = await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie);
      expect(flach(mit)).toContain("Bitte senden Sie uns den unteren Abschnitt bis 01.10.2027 ausgefüllt und unterschrieben zurück.");
      const abschnitt = flach(mit.slice(mit.indexOf("hier abtrennen")));
      expect(abschnitt).toContain("Rückmeldung bis 01.10.2027");
      expect(mit.split("\f").filter((s) => s.trim())).toHaveLength(1);

      // Termine kommen nicht aus der Vorlage.
      const kopie = await al().schau.anlegen({ name: "Rückmeldeschau Kopie", ort: "Probedorf", vorlageId: id });
      expect((await al().schau.get({ id: kopie.id })).preisrichterRueckmeldungBis).toBeNull();
      // Leeren geht.
      await einstellen(id, { preisrichterRueckmeldungBis: null });
      expect((await al().schau.get({ id })).preisrichterRueckmeldungBis).toBeNull();
    }));

  test("Brieftext aus der Briefvorlage: eigener Text mit Platzhaltern, leer der feste Text", () =>
    mitSitzung(async (cookie) => {
      const { id } = await al().schau.anlegen({ name: "Brieftextschau", ort: "Textdorf" });
      const b = await richter(id, "Clara Eiche");
      await einstellen(id, { bewertungAm: "2027-11-13", preisrichterRueckmeldungBis: "2027-10-15" });
      const start = (await al().druckvorlage.brief()).vorlage;
      expect(start.verpflichtung).toEqual({ betreff: "", text: "" });
      try {
        await al().druckvorlage.briefSpeichern({ daten: { ...start, verpflichtung: { betreff: "Anfrage für {Schau}", text: "{Anrede}, Zusage bitte bis {Rückmeldung}. Bewertung am {Bewertungstag} in {Ort}." } } });
        expect((await al().druckvorlage.brief()).vorlage.verpflichtung.betreff).toBe("Anfrage für {Schau}");
        const eigen = flach(await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie));
        expect(eigen).toContain("Anfrage für Brieftextschau");
        expect(eigen).toContain("Guten Tag Clara Eiche, Zusage bitte bis 15.10.2027. Bewertung am 13.11.2027 in Textdorf.");
        expect(eigen).not.toContain("Bitte um Bewertung");
        expect(eigen).not.toContain("wir möchten Sie herzlich bitten");
        // Der Abschnitt zum Abtrennen bleibt.
        expect(eigen).toContain("hier abtrennen");
        expect(eigen).toContain("Rückmeldung bis 15.10.2027");

        // Leer: wieder der feste Text.
        await al().druckvorlage.briefSpeichern({ daten: { ...start, verpflichtung: { betreff: "", text: "" } } });
        const fest = flach(await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie));
        expect(fest).toContain("Bitte um Bewertung – Brieftextschau");
        expect(fest).toContain("wir möchten Sie herzlich bitten, bei unserer Schau „Brieftextschau“ in Textdorf am 13.11.2027 als Preisrichter zu bewerten.");
      } finally {
        await al().druckvorlage.briefSpeichern({ daten: start });
      }
    }));

  test("Vorlage: Preisrichter mit Gruppen, Sparten und Obmann, Zusage wieder offen und leer", async () => {
    const { id } = await al().schau.anlegen({ name: "Zusagevorlage", ort: "Halle" });
    const obmann = await richter(id, "Zusagevorlage Obmann", { istObmann: true, zusage: "zugesagt", zugesagtFuer: "2027", vorbehalt: "nur samstags" });
    await richter(id, "Zusagevorlage Richter", { sparten: ["Tauben"], gruppen: ["X1"], obmannId: obmann.id, zusage: "abgesagt", zugesagtFuer: "2027 und 2028", vorbehalt: "Termin klären" });
    const kopie = await al().schau.anlegen({ name: "Zusagevorlage Kopie", ort: "Halle", vorlageId: id });
    const k = (await al().preisrichter.liste({ schauId: kopie.id })).richter;
    expect(k.map((r) => r.name).sort()).toEqual(["Zusagevorlage Obmann", "Zusagevorlage Richter"]);
    for (const r of k) expect([r.zusage, r.zugesagtFuer, r.vorbehalt]).toEqual(["offen", "", ""]);
    const pr = k.find((r) => r.name === "Zusagevorlage Richter")!;
    const om = k.find((r) => r.name === "Zusagevorlage Obmann")!;
    expect([pr.sparten, pr.gruppen, pr.obmannId, om.istObmann]).toEqual([["Tauben"], ["X1"], om.id, true]);
    // Die Vorlage bleibt unverändert.
    const alt = (await al().preisrichter.liste({ schauId: id })).richter.find((r) => r.name === "Zusagevorlage Richter")!;
    expect([alt.zusage, alt.zugesagtFuer, alt.vorbehalt]).toEqual(["abgesagt", "2027 und 2028", "Termin klären"]);
  });
});
