/**
 * Meisterschaften (Entscheidung 014): Regeln speichern (Ausstellungsleitung, Protokoll), Wertung aus Katalog und
 * Bewertung, PDF und CSV. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { MEISTERSCHAFT_VORLAGEN } from "@schau/domain";
import { adminKontext, m, pdfText } from "./kontext";

describe("Meisterschaften", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const leer = { vorname: "", nachname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "GZV Musterdorf", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  let schauId = 0;

  test("Regeln speichern, Wertung aus Katalog und Bewertung", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Meisterschau", ort: "Musterdorf" }));
    const s = await al().schau.get({ id: schauId });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = (geschlecht: string) => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht, alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const melde = async (vorname: string, nachname: string) => {
      const r = await al().meldung.speichern({ schauId, aussteller: { ...leer, vorname, nachname }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos("1,0"), pos("1,0"), pos("0,1"), pos("0,1")] });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    const anna = await melde("Anna", "Meister");
    const berta = await melde("Berta", "Zweite");
    await al().katalog.nummernVergeben({ schauId });
    const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, schauId));
    const punkte = new Map([[anna, [96, 95, 96, 95]], [berta, [95, 94, 95, 94]]]);
    for (const [meldungId, p] of punkte) {
      const eigene = tiere.filter((t) => t.meldungId === meldungId).sort((a, b) => a.id - b.id);
      await m.db.insert(m.schema.bewertung).values(eigene.map((t, i) => ({ katalogeintragId: t.id, punkte: p[i]! })));
    }
    await al().meisterschaft.speichern({ schauId, regeln: [{ ...MEISTERSCHAFT_VORLAGEN.zuchtpreis, name: "Vereinsmeister", mindestPunkte: 380 }] });
    const [p] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Meisterschaften"));
    expect(p).toBeTruthy();
    const [e] = await al().meisterschaft.ergebnisse({ schauId });
    const g = e!.gruppen[0]!;
    expect(g.kandidaten.map((k) => [k.name, k.summe, k.rang, k.titel])).toEqual([
      ["Meister, Anna", 382, 1, true],
      ["Zweite, Berta", 378, 2, false],
    ]);
    expect(g.kandidaten[1]!.grund).toMatch(/380/);
  });

  test("PDF und CSV; nur der eigene Verein", async () => {
    const server = (await import("../index")).default;
    const { neueSitzung } = await import("../auth");
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, adminKontext.benutzer!.id));
    const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: b!.id })}`;
    const hole = (datei: string, mitCookie = true) => server.fetch(new Request(`http://test/datei/${schauId}/${datei}`, { headers: mitCookie ? { cookie } : {} }));
    const pdf = await hole("meisterschaften.pdf");
    expect(pdf.status).toBe(200);
    const text = pdfText(Buffer.from(await pdf.arrayBuffer())).replace(/\s+/g, " ");
    expect(text).toContain("Vereinsmeister");
    expect(text).toContain("382");
    const csv = await (await hole("meisterschaften.csv")).text();
    expect(csv).toContain("Meister, Anna;382;Titel");
    expect((await hole("meisterschaften.pdf", false)).status).toBe(403);
  });
});
