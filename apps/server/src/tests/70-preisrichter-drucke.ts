/**
 * Preisrichter, Stufe 2: Preisrichterverpflichtung als Brief mit Abschnitt zum Abtrennen
 * (/datei/:schauId/preisrichter-verpflichtung.pdf) und die Bewertungsliste in zwei Spalten mit Zwischenköpfen je Rasse
 * und Farbenschlag, Obmann im Kopf, ohne Ausstellernamen (Entscheidung 005). Gruppen im Test erfunden (X1). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("Preisrichter: Verpflichtung und Bewertungsliste", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const hol = async (pfad: string, cookie = "") => (await import("../index")).default.fetch(new Request(`http://test${pfad}`, { headers: cookie ? { cookie } : {} }));
  const text = async (pfad: string, cookie: string) => {
    const a = await hol(pfad, cookie);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toContain("application/pdf");
    return pdfText(Buffer.from(await a.arrayBuffer()));
  };
  const seiten = (t: string) => t.split("\f").filter((s) => s.trim());
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

  test("Verpflichtung: Brief mit Schau, Ort, Bewertungstag, Abschnitt zum Abtrennen; einzeln, alle, Rechte", () =>
    mitSitzung(async (cookie) => {
      const { id } = await al().schau.anlegen({ name: "Verpflichtungsschau", ort: "Probedorf" });
      await m.db.update(m.schema.schau).set({ bewertungAm: "2027-11-06" }).where(m.eq(m.schema.schau.id, id));
      const b = await richter(id, "Bruno Buche", { anschrift: "Musterweg 3\n99999 Probestadt" });
      await richter(id, "Anna Ahorn");

      const einzel = await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie);
      for (const t of ["Bruno Buche", "Musterweg 3", "99999 Probestadt", "Bitte um Bewertung", "Verpflichtungsschau", "Probedorf", "06.11.2027", "hier abtrennen", "Ich sage zu", "Ich sage ab", "Vorbehalt", "Datum", "Unterschrift"])
        expect(einzel).toContain(t);
      expect(einzel).not.toContain("Anna Ahorn");
      expect(seiten(einzel)).toHaveLength(1);
      // Ohne Gruppen im Verzeichnis: A bis M, Z1 bis Z3 zum Ankreuzen.
      const abschnitt = einzel.slice(einzel.indexOf("hier abtrennen"));
      expect(abschnitt).toContain("Bruno Buche");
      for (const g of ["A", "G", "M", "Z1", "Z2", "Z3"]) expect(abschnitt).toMatch(new RegExp(`(^|\\s)${g}(\\s|$)`, "m"));

      // Alle: je Brief ab neuer Seite, nach Namen.
      const alle = await text(`/datei/${id}/preisrichter-verpflichtung.pdf`, cookie);
      const s = seiten(alle);
      expect(s).toHaveLength(2);
      expect(s[0]).toContain("Anna Ahorn");
      expect(s[1]).toContain("Bruno Buche");
      expect(s[0]).not.toContain("Bruno Buche");

      // Gruppen im Verzeichnis der Schau: nur diese zum Ankreuzen.
      const versionId = (await al().schau.get({ id })).stammdatenVersionId!;
      const [wy] = await al().stammdaten.suche({ versionId, q: "Wyandotten weiß" });
      await al().stammdaten.gruppenSetzen({ versionId, gruppen: [{ rasseId: wy!.rasseId, gruppe: "X1" }] });
      try {
        const mitGruppen = await text(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${b.id}`, cookie);
        const ab = mitGruppen.slice(mitGruppen.indexOf("hier abtrennen"));
        expect(ab).toContain("X1");
        expect(ab).not.toMatch(/(^|\s)Z3(\s|$)/m);
      } finally {
        await al().stammdaten.gruppenSetzen({ versionId, gruppen: [{ rasseId: wy!.rasseId, gruppe: "" }] });
      }

      // Fremder oder unsinniger Preisrichter: 404; ohne Anmeldung: 403.
      const fremd = await al().schau.anlegen({ name: "Verpflichtung Fremd", ort: "Anderswo" });
      const f = await richter(fremd.id, "Fremdrichter Verpflichtung");
      expect((await hol(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=${f.id}`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${id}/preisrichter-verpflichtung.pdf?preisrichter=abc`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${id}/preisrichter-verpflichtung.pdf`)).status).toBe(403);
      // Ohne Preisrichter: ein Blatt mit Hinweis statt eines leeren PDFs.
      expect(await text(`/datei/${fremd.id}/preisrichter-verpflichtung.pdf?preisrichter=${f.id}`, cookie)).toContain("Fremdrichter Verpflichtung");
      const leer = await al().schau.anlegen({ name: "Verpflichtung Leer", ort: "Nirgends" });
      expect(await text(`/datei/${leer.id}/preisrichter-verpflichtung.pdf`, cookie)).toContain("Keine Preisrichter angelegt");
    }));

  test("Bewertungsliste: zwei Spalten, Zwischenköpfe je Rasse und Farbenschlag, Note und Punkte, Obmann, Seitenzählung", () =>
    mitSitzung(async (cookie) => {
      const { id } = await al().schau.anlegen({ name: "Listenschau", ort: "Halle" });
      const s = await al().schau.get({ id });
      const versionId = s.stammdatenVersionId!;
      const wyFarben = await al().stammdaten.suche({ versionId, q: "Wyandotten" });
      const wy1 = wyFarben[0]!;
      const wy2 = wyFarben.find((f) => f.rasseId === wy1.rasseId && f.id !== wy1.id)!;
      expect(wy2).toBeDefined();
      const [st] = await al().stammdaten.suche({ versionId, q: "Strasser" });
      const pos = (f: { id: number }) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Lisa", nachname: "Listengeheim", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [...Array.from({ length: 50 }, () => pos(wy1)), ...Array.from({ length: 30 }, () => pos(wy2)), ...Array.from({ length: 30 }, () => pos(st!))],
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      await al().katalog.nummernVergeben({ schauId: id });
      const nummern = (await al().katalog.liste({ schauId: id })).map((e) => e.katalogNr!).sort((a, b) => a - b);

      const obmann = await richter(id, "Otto Obmannlinde", { istObmann: true });
      const pr = await richter(id, "Paul Pappel", { obmannId: obmann.id });
      await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: pr.id, vonNr: nummern[0]!, bisNr: nummern.at(-1)! }] });

      const t = await text(`/datei/${id}/preisrichter/${pr.id}/liste.pdf`, cookie);
      // Kopf: Name, Obmann, Tiere; keine Ausstellernamen.
      for (const x of ["Bewertungsliste", "Paul Pappel", "Obmann", "Otto Obmannlinde", "110"]) expect(t).toContain(x);
      expect(t).not.toContain("Listengeheim");
      expect(t).not.toContain("Lisa");
      // Zwischenköpfe: Rasse und Farbenschläge; läuft eine Rasse in die nächste Spalte, steht sie dort als Fortsetzung.
      for (const x of [wy1.rasse, wy1.farbenschlag, wy2.farbenschlag, st!.rasse, "(Forts.)"]) expect(t).toContain(x);
      // Zwei Listen nebeneinander: Spaltenköpfe „Note“ und „Pkt.“ zweimal in einer Zeile, auf jeder Seite.
      const s2 = seiten(t);
      expect(s2).toHaveLength(2);
      for (const seite of s2) expect(seite).toMatch(/NOTE\s+PKT\..*NOTE\s+PKT\./);
      expect(t).toContain("Seite 1 von 2");
      expect(t).toContain("Seite 2 von 2");
      // Jede Nummer steht darin.
      for (const n of nummern) expect(t.match(new RegExp(`(^|\\s)${n}(\\s|$)`, "gm"))?.length ?? 0).toBeGreaterThanOrEqual(1);

      expect(t.match(/Otto Obmannlinde/g)!.length).toBe(1);
      // Ohne zugeordneten Obmann: das Feld bleibt leer (der Name steht nur als Titel und in der Fußzeile).
      const ohne = await text(`/datei/${id}/preisrichter/${obmann.id}/liste.pdf`, cookie);
      expect(ohne).toContain("Obmann");
      expect(ohne.match(/Otto Obmannlinde/g)!.length).toBe(2);
      expect(ohne).toContain("Keine Tiere zugeteilt");
      expect((await hol(`/datei/${id}/preisrichter/${pr.id}/liste.pdf`)).status).toBe(403);
    }));
});
