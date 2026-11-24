/**
 * Teilschauen (Entscheidung 016): anlegen, umbenennen, nicht entfernen solange Meldungen daran hängen; Meldung intern
 * und online einer Teilschau zuordnen; Katalognummern fortlaufend über die Teilschauen; Überschriften im Katalog.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer as anonym, m, pdfText } from "./kontext";

describe("Teilschauen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const leer = { strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  let schauId = 0;
  let farben: { id: number }[] = [];
  const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
  const melde = async (vorname: string, teilschau: string | null | undefined, farbe: number) => {
    const r = await al().meldung.speichern({ schauId, aussteller: { ...leer, vorname, nachname: "Teilschau" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, ...(teilschau !== undefined ? { teilschau } : {}), positionen: [pos(farben[farbe]!.id)] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    return r.meldungId;
  };

  test("Teilschauen anlegen: Kennungen fest, Protokoll; unbekannte Teilschau abgelehnt", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Teilschauen-Schau", ort: "Musterdorf" }));
    const s = await al().schau.get({ id: schauId });
    farben = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    expect(farben.length).toBeGreaterThan(1);
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ name: "Landesschau" }, { name: "Jugendschau" }] });
    expect((await al().schau.get({ id: schauId })).teilschauen).toEqual([
      { id: "t1", name: "Landesschau" },
      { id: "t2", name: "Jugendschau" },
    ]);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId));
    expect(prot.some((x) => x.aktion === "Teilschauen")).toBe(true);
    // Ein Name über 80 Zeichen wird abgelehnt statt still gekürzt (die Oberfläche erlaubt ohnehin nur 80).
    await expect(al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: "L".repeat(81) }, { id: "t2", name: "Jugendschau" }] })).rejects.toThrow("Höchstens 80 Zeichen");
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: `  ${"L".repeat(80)}  ` }, { id: "t2", name: "Jugendschau" }] });
    expect((await al().schau.get({ id: schauId })).teilschauen[0]!.name).toBe("L".repeat(80));
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: "Landesschau" }, { id: "t2", name: "Jugendschau" }] });
    await expect(al().meldung.speichern({ schauId, aussteller: { ...leer, vorname: "X", nachname: "Unbekannt" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, teilschau: "t9", positionen: [pos(farben[0]!.id)] })).rejects.toThrow("gibt es in der Schau nicht");
  });

  test("Katalognummern fortlaufend: erst die ganze erste Teilschau, dann die zweite", async () => {
    // Die Rassenfolge allein würde die Teilschauen mischen (Farbenschlag 0 vor 1).
    const anna = await melde("Anna", null, 1); // ohne Angabe: erste Teilschau
    const berta = await melde("Berta", "t2", 0);
    const carl = await melde("Carl", "t1", 1);
    await al().katalog.nummernVergeben({ schauId });
    const tiere = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, schauId));
    const nr = (meldungId: number) => tiere.find((t) => t.meldungId === meldungId)!.katalogNr!;
    expect(Math.max(nr(anna), nr(carl))).toBeLessThan(nr(berta));

    const { katalogPdf } = await import("../pdf/katalog");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const text = pdfText(await katalogPdf(s!)).replace(/\s+/g, " ");
    expect(text).toContain("Landesschau");
    expect(text).toContain("Jugendschau");
  });

  test("Umbenennen geht; entfernen nicht, solange Meldungen daran hängen", async () => {
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: "Landesverbandsschau" }, { id: "t2", name: "Jugendschau" }] });
    await expect(al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: "Landesverbandsschau" }] })).rejects.toThrow("noch 1 Meldungen");
    expect((await al().schau.get({ id: schauId })).teilschauen).toHaveLength(2);
  });

  test("Umsortieren: Meldungen ohne Angabe bleiben in ihrer bisherigen (ersten) Teilschau", async () => {
    const anna = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId))).find((x) => x.teilschau == null)!;
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t2", name: "Jugendschau" }, { id: "t1", name: "Landesverbandsschau" }] });
    const [neu] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, anna.id));
    expect(neu!.teilschau).toBe("t1");
    await al().schau.teilschauenSetzen({ id: schauId, teilschauen: [{ id: "t1", name: "Landesverbandsschau" }, { id: "t2", name: "Jugendschau" }] });
  });

  test("Nach dem Festschreiben bleibt die Teilschau einer Meldung fest", async () => {
    const carl = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, schauId))).find((x) => x.teilschau === "t1")!;
    const [a] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, carl.ausstellerId));
    const d = await al().meldung.get({ id: carl.id });
    const eingabe = { schauId, meldungId: carl.id, aussteller: { ...leer, vorname: a!.vorname, nachname: a!.nachname, id: a!.id }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, positionen: [{ ...pos(d.eintraege[0]!.farbenschlagId!), id: d.eintraege[0]!.id }] };
    await m.db.update(m.schema.schau).set({ katalogGedruckt: true }).where(m.eq(m.schema.schau.id, schauId));
    try {
      await expect(al().meldung.speichern({ ...eingabe, teilschau: "t2" })).rejects.toThrow("festgeschrieben");
      await al().meldung.speichern({ ...eingabe, teilschau: "t1", bemerkung: "bleibt" });
    } finally {
      await m.db.update(m.schema.schau).set({ katalogGedruckt: false }).where(m.eq(m.schema.schau.id, schauId));
    }
  });

  test("Online-Meldung in eine Teilschau", async () => {
    const { id } = await al().schau.anlegen({ name: "Teilschau online", ort: "Musterdorf" });
    const s = await al().schau.get({ id });
    await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false }] });
    await al().schau.teilschauenSetzen({ id, teilschauen: [{ name: "Kreisschau" }, { name: "Sonderschau" }] });
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    const pub = m.appRouter.createCaller(anonym);
    expect((await pub.oeffentlich.schau({ slug: s.slug })).teilschauen.map((t) => t.name)).toEqual(["Kreisschau", "Sonderschau"]);
    const r = await pub.oeffentlich.melden({
      slug: s.slug,
      aussteller: { vorname: "Olga", nachname: "Online", strasse: "", plz: "", ort: "", telefon: "", email: "olga@test.de", verein: "", kreisverband: "", registriernummer: "065359990077", geburtsdatum: null },
      istJugend: false,
      istPreisrichter: false,
      teilschau: "t2",
      positionen: [pos(farben[0]!.id)],
      zustimmung: true,
      stiftung: null,
      bemerkung: "",
    });
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token));
    expect(mel!.teilschau).toBe("t2");
  });
});
