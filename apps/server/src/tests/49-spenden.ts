/**
 * Spenden (Entscheidung 013): steuerliche Angaben, Barspende mit Kassenbuch und Quittung, Spende bei der Meldung im
 * offenen Betrag, Zuwendungsbestätigung (Geld, Sache, Sammel) mit Sperren und Storno, Schutz in der Datenbank,
 * Datei-Adresse. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

const flach = (t: string) => t.replace(/\s+/g, " ");

describe("Spenden", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const org = () => adminKontext.benutzer!.organisationId;
  const leer = { vorname: "", nachname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  const steuer = { gemeinnuetzig: true, bescheidArt: "freistellung", finanzamt: "Musterstadt", steuernummer: "123/456/78901", bescheidDatum: "2024-03-15", veranlagungszeitraum: "2022", zwecke: "der Tierzucht", ort: "Musterdorf" };
  let schauId = 0;
  let spenderId = 0;
  let barId = 0;

  test("Ohne steuerliche Angaben keine Bestätigung; Angaben speichern ist protokolliert", async () => {
    expect((await al().spenden.steuer()).sperre).toMatch(/nicht als gemeinnützig/);
    await al().spenden.steuerSpeichern({ steuer });
    const r = await al().spenden.steuer();
    expect(r.sperre).toBeNull();
    expect(r.steuer.finanzamt).toBe("Musterstadt");
    const [p] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Steuerliche Angaben"));
    expect(p).toBeTruthy();
    // Name und Anschrift des Vereins stehen als Aussteller auf der Bestätigung.
    await m.db.update(m.schema.organisation).set({ anschrift: "Lindenweg 3\n12345 Musterdorf" }).where(m.eq(m.schema.organisation.id, org()));
  });

  test("Barspende: Kassenbuch, Spendenquittung im Belegarchiv", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Spendenschau", ort: "Musterdorf" }));
    ({ id: spenderId } = await al().spenden.spenderSpeichern({ daten: { vorname: "Bernd", nachname: "Bürger", strasse: "Rathausplatz 1", plz: "12345", ort: "Musterdorf" } }));
    ({ id: barId } = await al().spenden.erfassen({ schauId, spenderId, art: "geld", weg: "bar", betragCent: 10_000, zweck: "für die Ausstellung" }));
    const buch = await al().kasse.kassenbuch({ schauId });
    const b = buch.tage.flatMap((t) => t.bewegungen).find((x) => x.art === "spende")!;
    expect(b.betragCent).toBe(10_000);
    expect(b.text).toContain("Bernd Bürger");
    const belege = async (art: string) => (await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.schauId, schauId))).filter((x) => x.art === art);
    const [beleg] = await belege("spende");
    expect(flach(pdfText(beleg!.pdf))).toContain("keine Zuwendungsbestätigung im Sinne des § 10b EStG");
  });

  test("Einzelbestätigung: Wortlaut, fortlaufende Nummer, keine zweite, Storno nur nach Storno der Bestätigung", async () => {
    const r = await al().spenden.bestaetigen({ spendeId: barId });
    const [b] = await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.id, r.id));
    const text = flach(pdfText(b!.pdf));
    expect(text).toContain("Bestätigung über Geldzuwendungen/Mitgliedsbeitrag");
    expect(text).toContain("einhundert Euro");
    expect(text).toContain("Wir sind wegen Förderung der Tierzucht nach dem Freistellungsbescheid");
    expect(text).toContain("dass es sich nicht um einen Mitgliedsbeitrag handelt");
    expect(text).toContain("Bernd Bürger");
    await expect(al().spenden.bestaetigen({ spendeId: barId })).rejects.toThrow("schon bestätigt");
    await expect(al().spenden.stornieren({ spendeId: barId, grund: "Irrtum" })).rejects.toThrow("erst die Bestätigung stornieren");
    await al().spenden.bestaetigungStornieren({ id: r.id, grund: "falscher Betrag" });
    // Nach dem Storno der Bestätigung: Spende neu bestätigen ginge – hier stornieren wir sie.
    await al().spenden.stornieren({ spendeId: barId, grund: "falscher Betrag" });
    const buch = await al().kasse.kassenbuch({ schauId });
    expect(buch.tage.flatMap((t) => t.bewegungen).filter((x) => x.art.startsWith("spende")).reduce((n, x) => n + x.betragCent, 0)).toBe(0);
    const [storno] = (await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.schauId, schauId))).filter((x) => x.art === "spende-storno");
    expect(storno).toBeTruthy();
    // Neue Bestätigungen zählen weiter (Nummer 2), auch nach einem Storno.
    const neu = await al().spenden.erfassen({ schauId, spenderId, art: "geld", weg: "bank", betragCent: 5_000, datum: "2026-11-01" });
    expect((await al().spenden.bestaetigen({ spendeId: neu.id })).nummer).toBe(r.nummer + 1);
  });

  test("Gleichzeitig zweimal bestätigen: genau eine Bestätigung", async () => {
    const sp = await al().spenden.erfassen({ schauId, spenderId, art: "geld", weg: "bank", betragCent: 1_234, datum: "2026-11-04" });
    const r = await Promise.allSettled([al().spenden.bestaetigen({ spendeId: sp.id }), al().spenden.bestaetigen({ spendeId: sp.id })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toContain("schon bestätigt");
  });

  test("Sperren: Gegenleistung, Sache ohne Bezeichnung, Datum in der Zukunft", async () => {
    const sponsor = await al().spenden.erfassen({ schauId, spenderId, art: "geld", weg: "bank", betragCent: 20_000, datum: "2026-11-02", gegenleistung: true });
    await expect(al().spenden.bestaetigen({ spendeId: sponsor.id })).rejects.toThrow("Sponsoring");
    await expect(al().spenden.erfassen({ schauId, spenderId, art: "sache", weg: "bank", betragCent: 4500 })).rejects.toThrow("Sache bezeichnen");
    await expect(al().spenden.erfassen({ schauId, spenderId, art: "geld", weg: "bank", betragCent: 100, datum: "2099-01-01" })).rejects.toThrow("Zukunft");
    const sache = await al().spenden.erfassen({ schauId, spenderId, art: "sache", weg: "bank", betragCent: 4500, datum: "2026-11-03", sache: { bezeichnung: "Futtersack 25 kg, neu", herkunft: "privat", unterlagen: true } });
    const r = await al().spenden.bestaetigen({ spendeId: sache.id });
    const [b] = await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.id, r.id));
    const text = flach(pdfText(b!.pdf));
    expect(text).toContain("Bestätigung über Sachzuwendungen");
    expect(text).toContain("aus dem Privatvermögen");
    expect(text).not.toContain("Mitgliedsbeitrag handelt");
  });

  test("Sammelbestätigung: alle offenen Geldspenden des Jahres, mit Anlage", async () => {
    const zwei = await al().spenden.spenderSpeichern({ daten: { istFirma: true, nachname: "Musterbau GmbH", strasse: "Industriestraße 5", plz: "12345", ort: "Musterdorf" } });
    await al().spenden.erfassen({ schauId, spenderId: zwei.id, art: "geld", weg: "bank", betragCent: 3_000, datum: "2026-03-01", verzichtAufwand: true });
    await al().spenden.erfassen({ schauId, spenderId: zwei.id, art: "geld", weg: "bank", betragCent: 7_000, datum: "2026-10-01" });
    const r = await al().spenden.sammelbestaetigen({ spenderId: zwei.id, jahr: 2026 });
    const [b] = await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.id, r.id));
    expect(b!.betragCent).toBe(10_000);
    const text = flach(pdfText(b!.pdf));
    expect(text).toContain("Sammelbestätigung über Geldzuwendungen/Mitgliedsbeiträge");
    expect(text).toContain("Anlage zur Sammelbestätigung");
    expect(text).toContain("01.01.2026 – 31.12.2026");
    await expect(al().spenden.sammelbestaetigen({ spenderId: zwei.id, jahr: 2026 })).rejects.toThrow("keine Geldspende");
  });

  test("Spende bei der Meldung: im offenen Betrag, eingegangen mit der Zahlung", async () => {
    const s = await al().schau.get({ id: schauId });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId,
      aussteller: { ...leer, vorname: "Sonja", nachname: "Spender", strasse: "Gartenweg 2", plz: "12345", ort: "Musterdorf" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      spende: { betragCent: 2_500, nennen: true },
    });
    const { meldebetrag } = await import("../services/eintraege");
    const b = await meldebetrag(m.db as never, r.meldungId);
    expect(b.spendeCent).toBe(2_500);
    const liste = () => al().spenden.liste({ schauId });
    const vorher = (await liste()).find((z) => z.spende.meldungId === r.meldungId)!;
    expect(vorher.datum).toBeNull();
    expect(vorher.sperren.join()).toMatch(/noch nicht eingegangen/);
    expect(vorher.spender.nennungName).toBe(true);
    await al().meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: b.summeCent + b.spendeCent, datum: "2026-11-05", art: "ueberweisung" });
    const nachher = (await liste()).find((z) => z.spende.meldungId === r.meldungId)!;
    expect(nachher.datum).toBe("2026-11-05");
    expect(nachher.sperren).toEqual([]);
    // Gesamtabrechnung: Meldegeld, Spende und Bezahltes stehen einzeln auf der Quittung (abgerechnet werden bestätigte Meldungen).
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const { abrechnungPdf } = await import("../pdf/dokumente");
    const [sch] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const [meld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, r.meldungId));
    const quittung = pdfText(await abrechnungPdf(sch!, meld!.ausstellerId)).replace(/\s+/g, " ");
    expect(quittung).toContain("Gesamtabrechnung");
    expect(quittung).toContain("Spende für die Ausstellung");
    expect(quittung).toContain("bereits bezahlt");
    expect(quittung).toContain("Meldegeld");
    // Im Katalog nur, wer eingewilligt hat (Sonja Spender ja, Bernd Bürger nicht).
    const { spenderFuerKatalog } = await import("../services/spenden");
    const genannt = await spenderFuerKatalog(schauId);
    expect(genannt).toContain("Sonja Spender");
    expect(genannt.join()).not.toContain("Bürger");
  });

  test("Spende mit dem Meldegeld: storniert = nicht eingegangen, nach der Abrechnung kein Storno, in der Auskunft", async () => {
    const liste = await al().spenden.liste({ schauId });
    const z = liste.find((x) => x.spende.weg === "meldung")!;
    // In der Auskunft des Ausstellers stehen seine Spenden.
    const { ladeAuskunft } = await import("../services/datenschutz");
    const [mm] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, z.spende.meldungId!));
    const auskunft = await ladeAuskunft(org(), mm!.ausstellerId);
    expect(auskunft.spenden.map((x) => x.betragCent)).toContain(2_500);
    // Abgerechnet (Quittung): Die zugesagte Spende steckt im Saldo und lässt sich nicht mehr stornieren.
    await m.db.insert(m.schema.auszahlung).values({ schauId, ausstellerId: mm!.ausstellerId, betragCent: 0, quittungNr: 9001 });
    await expect(al().spenden.stornieren({ spendeId: z.spende.id, grund: "zurückgezogen" })).rejects.toThrow("abgerechnet");
    // Stornierte Meldung: Die Spende gilt nicht als eingegangen.
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.id, mm!.id));
    const nachher = (await al().spenden.liste({ schauId })).find((x) => x.spende.id === z.spende.id)!;
    expect(nachher.datum).toBeNull();
    await m.db.update(m.schema.meldung).set({ status: "bestaetigt" }).where(m.eq(m.schema.meldung.id, mm!.id));
  });

  test("Testschau: Spenden ja, Zuwendungsbestätigung nein", async () => {
    const { id: test } = await al().schau.anlegen({ name: "Übungsschau Spenden", ort: "Musterdorf", test: true });
    const sp = await al().spenden.erfassen({ schauId: test, spenderId, art: "geld", weg: "bank", betragCent: 900, datum: "2026-11-06" });
    await expect(al().spenden.bestaetigen({ spendeId: sp.id })).rejects.toThrow("Testschau");
  });

  test("Datenbank: Spenden und Bestätigungen nur stornieren, nie ändern oder löschen", async () => {
    const scheitert = async (q: PromiseLike<unknown>) => {
      try {
        await q;
        return false;
      } catch (e) {
        return String((e as { cause?: unknown }).cause ?? e);
      }
    };
    const [sp] = await m.db.select().from(m.schema.spende).where(m.eq(m.schema.spende.schauId, schauId)).limit(1);
    expect(await scheitert(m.db.update(m.schema.spende).set({ betragCent: 1 }).where(m.eq(m.schema.spende.id, sp!.id)))).toContain("nur einmal stornieren");
    expect(await scheitert(m.db.delete(m.schema.spende).where(m.eq(m.schema.spende.id, sp!.id)))).toContain("nicht löschen");
    const [zb] = await m.db.select().from(m.schema.zuwendungsbestaetigung).limit(1);
    expect(await scheitert(m.db.update(m.schema.zuwendungsbestaetigung).set({ betragCent: 1 }).where(m.eq(m.schema.zuwendungsbestaetigung.id, zb!.id)))).toContain("nur einmal stornieren");
    // Eine Schau mit Spenden lässt sich nicht löschen.
    await expect(al().schau.loeschen({ id: schauId, name: "Spendenschau", grund: "Test" })).rejects.toThrow("Spende");
  });

  test("Bereinigung: Spender und Bestätigungen innerhalb der Belegfrist bleiben", async () => {
    const { bereinige } = await import("../services/datenschutz");
    const n = await bereinige(new Date(), { organisationId: org() });
    expect(n.spender).toBe(0);
    const [bernd] = await m.db.select().from(m.schema.spender).where(m.eq(m.schema.spender.id, spenderId));
    expect(bernd!.nachname).toBe("Bürger");
    expect((await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.organisationId, org()))).length).toBeGreaterThan(0);
  });

  test("Bereinigung nach der Belegfrist: Bestätigung gelöscht, Spender anonymisiert, Betrag bleibt", async () => {
    const alt = new Date("2010-06-01T10:00:00Z");
    const [sr] = await m.db.insert(m.schema.spender).values({ organisationId: org(), vorname: "Otto", nachname: "Altspender", strasse: "Alter Weg 1", plz: "12345", ort: "Musterdorf", createdAt: alt }).returning();
    const [sp] = await m.db.insert(m.schema.spende).values({ schauId, spenderId: sr!.id, art: "geld", weg: "bank", betragCent: 777, datum: "2010-06-01", createdAt: alt }).returning();
    const [zb] = await m.db.insert(m.schema.zuwendungsbestaetigung).values({ organisationId: org(), nummer: 9000, spenderId: sr!.id, art: "einzel", betragCent: 777, pdf: Buffer.from("x"), sha256: "x", createdAt: alt }).returning();
    await m.db.insert(m.schema.bestaetigungSpende).values({ bestaetigungId: zb!.id, spendeId: sp!.id });
    const { bereinige } = await import("../services/datenschutz");
    const n = await bereinige(new Date(), { organisationId: org() });
    expect(n.spender).toBe(1);
    expect(await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.id, zb!.id))).toEqual([]);
    const [weg] = await m.db.select().from(m.schema.spender).where(m.eq(m.schema.spender.id, sr!.id));
    expect(weg).toMatchObject({ nachname: "Gelöscht", strasse: "", ort: "" });
    const [bleibt] = await m.db.select().from(m.schema.spende).where(m.eq(m.schema.spende.id, sp!.id));
    expect(bleibt!.betragCent).toBe(777);
  });

  test("Datei-Adresse: nur Ausstellungsleitung des eigenen Vereins", async () => {
    const server = (await import("../index")).default;
    const { neueSitzung } = await import("../auth");
    const [al2] = await m.db.insert(m.schema.benutzer).values({ organisationId: org(), email: "spende-al@test.de", name: "Spenden AL", passwortHash: "-", rolle: "admin", totpAktivSeit: new Date() }).returning();
    const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: al2!.id })}`;
    const [zb] = await m.db.select().from(m.schema.zuwendungsbestaetigung).where(m.eq(m.schema.zuwendungsbestaetigung.organisationId, org())).limit(1);
    const hole = (mitCookie: boolean) => server.fetch(new Request(`http://test/datei/zuwendungsbestaetigung/${zb!.id}.pdf`, { headers: mitCookie ? { cookie } : {} }));
    const ok = await hole(true);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-beleg-sha256")).toBe(zb!.sha256);
    expect((await hole(false)).status).toBe(403);
  });
});
