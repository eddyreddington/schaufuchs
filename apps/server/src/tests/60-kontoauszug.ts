/**
 * Kontoauszug-Import (Entscheidung 023): Datei prüfen (Zuordnung über Referenz bzw. Name und Betrag), ausgewählte
 * Gutschriften buchen, Meldung bestätigt sich bei voller Zahlung. Nichts doppelt, nichts Fremdes gespeichert, Betrag aus
 * der Datei statt aus dem Browser, nur für Administratoren.
 */
import { describe, expect, test } from "bun:test";
import { rfReferenz } from "@schau/domain";
import { adminKontext, leer, m } from "./kontext";

describe("Kontoauszug-Import", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const pub = () => m.appRouter.createCaller({ ...leer, ip: "198.51.100.60" });
  let schauId = 0;
  let slug = "";
  let farbeId = 0;
  const ids: Record<string, number> = {};
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const melden = (vorname: string, nachname: string, email: string, reg: string) =>
    pub().oeffentlich.melden({
      slug,
      aussteller: { vorname, nachname, strasse: "Weg 1", plz: "34117", ort: "Kassel", telefon: "", email, verein: "GZV", kreisverband: "", registriernummer: reg, geburtsdatum: null },
      istJugend: false,
      istPreisrichter: false,
      positionen: [{ farbenschlagId: farbeId, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      zustimmung: true,
      erklaerungen: true,
      stiftung: null,
      bemerkung: "",
    });
  const csv = () =>
    [
      "Buchungstag;Betrag;Verwendungszweck;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter",
      `03.11.2026;3,00;${rfReferenz(ids.Anna!)} Meldegeld Auszug, Anna;Anna Auszug;DE02120300000000202051`,
      `04.11.2026;3,00;Meldegeld Kreisschau;Bruno Bankmann;DE02100500000054540402`,
      `04.11.2026;99,00;Rechnung 4711;Fremdfirma GmbH;DE89370400440532013000`,
      `05.11.2026;-12,00;Porto;Post;DE89370400440532013000`,
    ].join("\n");

  test("Prüfen: Referenz sicher, Name mit passendem Betrag als Vorschlag, Fremdes ohne Zuordnung, Lastschrift nicht dabei", async () => {
    const s = await al().schau.anlegen({ name: "Auszugschau", ort: "Kassel" });
    schauId = s.id;
    const d = await al().schau.get({ id: s.id });
    slug = d.slug;
    await al().schau.aktualisieren({ id: s.id, daten: { ...d, bewertungAm: "2026-11-21", erklaerungen: "Nicht aus Sperrbezirk." } });
    await al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 300, befreitPreisrichter: false }] });
    farbeId = (await al().stammdaten.suche({ versionId: d.stammdatenVersionId!, q: "Wyandotten weiß" }))[0]!.id;
    await al().schau.phaseSetzen({ id: schauId, phase: "meldung", trotzdem: true });
    for (const [vor, nach, nr] of [["Anna", "Auszug", "1"], ["Bruno", "Bankmann", "2"]] as const) {
      const r = await melden(vor, nach, `${vor.toLowerCase()}@auszug.test`, `06 535 012 060${nr}`);
      ids[vor] = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token)))[0]!.id;
    }

    const r = await al().kontoauszug.pruefen({ schauId, base64: b64(csv()) });
    expect(r.posten.map((p) => [p.betragCent, p.meldungId, p.sicherheit, p.hinweis, p.gebucht])).toEqual([
      [300, ids.Anna!, "referenz", "passt", false],
      [300, ids.Bruno!, "name", "passt", false],
      [9900, null, null, null, false],
    ]);
    expect(r.posten.every((p) => /^[0-9a-f]{64}$/.test(p.schluessel))).toBe(true);
    expect(r.meldungen.map((x) => x.name)).toEqual(["Auszug, Anna", "Bankmann, Bruno"]);
    // Prüfen bucht nichts.
    expect(await m.db.select().from(m.schema.zahlung).where(m.inArray(m.schema.zahlung.meldungId, [ids.Anna!, ids.Bruno!]))).toHaveLength(0);
  });

  test("Buchen: Betrag aus der Datei, Meldung bestätigt, zweites Hochladen bucht nichts doppelt", async () => {
    const r = await al().kontoauszug.pruefen({ schauId, base64: b64(csv()) });
    const offen = (id: number) => r.meldungen.find((x) => x.id === id)!.offenCent;
    const gewaehlt = r.posten.filter((p) => p.meldungId).map((p) => ({ schluessel: p.schluessel, meldungId: p.meldungId!, offenCent: offen(p.meldungId!) }));
    const e = await al().kontoauszug.buchen({ schauId, base64: b64(csv()), posten: gewaehlt });
    expect(e).toEqual({ gebucht: 2, bestaetigt: 2, nichtBestaetigt: 0, uebersprungen: [] });
    const zs = await m.db.select().from(m.schema.zahlung).where(m.inArray(m.schema.zahlung.meldungId, [ids.Anna!, ids.Bruno!]));
    expect(zs.map((z) => [z.betragCent, z.datum, z.art]).sort()).toEqual([[300, "2026-11-03", "ueberweisung"], [300, "2026-11-04", "ueberweisung"]]);
    expect(zs.every((z) => /^[0-9a-f]{64}$/.test(z.bankBuchung ?? ""))).toBe(true);
    const [ma] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, ids.Anna!));
    expect(ma!.status).toBe("bestaetigt");

    // Noch einmal derselbe Auszug: als gebucht markiert, Buchen überspringt.
    const nochmal = await al().kontoauszug.pruefen({ schauId, base64: b64(csv()) });
    expect(nochmal.posten.slice(0, 2).every((p) => p.gebucht)).toBe(true);
    const e2 = await al().kontoauszug.buchen({ schauId, base64: b64(csv()), posten: gewaehlt });
    expect(e2.gebucht).toBe(0);
    expect(e2.uebersprungen.map((u) => u.grund)).toEqual(["schon gebucht", "schon gebucht"]);
    expect(await m.db.select().from(m.schema.zahlung).where(m.inArray(m.schema.zahlung.meldungId, [ids.Anna!, ids.Bruno!]))).toHaveLength(2);
  });

  test("Schutz: Posten nicht aus der Datei, fremde Meldung, Helfer, unbekanntes Format; Fremdes nicht gespeichert", async () => {
    const r = await al().kontoauszug.pruefen({ schauId, base64: b64(csv()) });
    const fremd = r.posten.find((p) => p.meldungId == null)!;
    await expect(al().kontoauszug.buchen({ schauId, base64: b64(csv()), posten: [{ schluessel: "0".repeat(64), meldungId: ids.Anna!, offenCent: 0 }] })).rejects.toThrow("steht nicht in dieser Datei");
    // Meldung einer anderen Schau: übersprungen, nicht gebucht.
    const andere = await al().schau.anlegen({ name: "Andere Auszugschau", ort: "Kassel" });
    const e = await al().kontoauszug.buchen({ schauId: andere.id, base64: b64(csv()), posten: [{ schluessel: fremd.schluessel, meldungId: ids.Anna!, offenCent: 0 }] });
    expect(e.uebersprungen[0]!.grund).toBe("Meldung nicht offen oder bestätigt");
    await expect(al().kontoauszug.pruefen({ schauId, base64: b64("Hallo;Welt\n1;2") })).rejects.toThrow("Buchungstag und Betrag");

    const [org] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, adminKontext.benutzer!.id));
    const [h] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: org!.organisationId, email: "auszug-helfer@test.de", name: "Helfer Auszug", passwortHash: "-", rolle: "mitarbeiter" })
      .returning();
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id: h!.id, organisationId: h!.organisationId, name: h!.name, email: h!.email, rolle: "mitarbeiter" } });
    await expect(helfer.kontoauszug.pruefen({ schauId, base64: b64(csv()) })).rejects.toThrow();

    // Vom Auszug steht nichts Fremdes in Protokoll oder Zahlungen.
    const protokoll = JSON.stringify(await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId)));
    expect(protokoll).not.toContain("Fremdfirma");
    expect(protokoll).not.toContain("DE02120300000000202051");
    expect(protokoll).toContain("Kontoauszug");
  });

  test("Vorher geprüft: ein falscher Posten bucht gar nichts; inzwischen bar kassiert wird übersprungen; zwei Teilzahlungen gehen", async () => {
    const r = await melden("Carla", "Cash", "carla@auszug.test", "06 535 012 0603");
    ids.Carla = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token)))[0]!.id;
    const r2 = await melden("Dora", "Doppel", "dora@auszug.test", "06 535 012 0604");
    ids.Dora = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r2.token)))[0]!.id;
    const datei = [
      "Buchungstag;Betrag;Verwendungszweck;Name Zahlungsbeteiligter",
      `06.11.2026;3,00;${rfReferenz(ids.Carla!)};Carla Cash`,
      `06.11.2026;1,00;${rfReferenz(ids.Dora!)} Teil 1;Dora Doppel`,
      `07.11.2026;2,00;${rfReferenz(ids.Dora!)} Teil 2;Dora Doppel`,
    ].join("\n");
    const p = await al().kontoauszug.pruefen({ schauId, base64: b64(datei) });
    const auswahl = p.posten.map((x) => ({ schluessel: x.schluessel, meldungId: x.meldungId!, offenCent: 300 }));
    const zahlungen = async () => m.db.select().from(m.schema.zahlung).where(m.inArray(m.schema.zahlung.meldungId, [ids.Carla!, ids.Dora!]));

    // Ein Posten aus einer anderen Datei: abgelehnt, bevor irgendetwas gebucht ist.
    await expect(al().kontoauszug.buchen({ schauId, base64: b64(datei), posten: [...auswahl, { schluessel: "f".repeat(64), meldungId: ids.Carla!, offenCent: 300 }] })).rejects.toThrow("steht nicht in dieser Datei");
    expect(await zahlungen()).toHaveLength(0);

    // Carla zahlt inzwischen bar: die Gutschrift wird nicht zusätzlich gebucht. Dora: beide Teilzahlungen, dann bestätigt.
    await al().meldung.zahlungErfassen({ meldungId: ids.Carla!, betragCent: 300, datum: "2026-11-06", art: "bar" });
    const e = await al().kontoauszug.buchen({ schauId, base64: b64(datei), posten: auswahl });
    expect(e.uebersprungen.map((u) => u.grund)).toEqual(["inzwischen anders bezahlt – bitte neu prüfen"]);
    expect(e.gebucht).toBe(2);
    expect((await zahlungen()).map((z) => `${z.meldungId}:${z.betragCent}:${z.art}`).sort()).toEqual([`${ids.Carla}:300:bar`, `${ids.Dora}:100:ueberweisung`, `${ids.Dora}:200:ueberweisung`].sort());
    expect((await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, ids.Dora!)))[0]!.status).toBe("bestaetigt");
  });

  test("Bestätigen scheitert (Sperre wartet zu lange): Zahlung gebucht, Meldung offen, im Ergebnis gemeldet statt verschluckt", async () => {
    const r = await melden("Emil", "Eilig", "emil@auszug.test", "06 535 012 0605");
    ids.Emil = (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token)))[0]!.id;
    const datei = ["Buchungstag;Betrag;Verwendungszweck;Name Zahlungsbeteiligter", `08.11.2026;3,00;${rfReferenz(ids.Emil!)};Emil Eilig`].join("\n");
    const p = await al().kontoauszug.pruefen({ schauId, base64: b64(datei) });
    const vorher = process.env.DB_LOCK_TIMEOUT;
    process.env.DB_LOCK_TIMEOUT = "300ms";
    // Eine andere Verbindung hält die Meldungszeile (z. B. eine laufende Bearbeitung): Buchen geht, Bestätigen nicht.
    const c = await m.sql.reserve();
    try {
      await c`begin`;
      await c`select id from meldung where id = ${ids.Emil!} for no key update`;
      const e = await al().kontoauszug.buchen({ schauId, base64: b64(datei), posten: [{ schluessel: p.posten[0]!.schluessel, meldungId: ids.Emil!, offenCent: 300 }] });
      expect(e).toEqual({ gebucht: 1, bestaetigt: 0, nichtBestaetigt: 1, uebersprungen: [] });
    } finally {
      if (vorher === undefined) delete process.env.DB_LOCK_TIMEOUT;
      else process.env.DB_LOCK_TIMEOUT = vorher;
      await c`rollback`;
      c.release();
    }
    expect((await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, ids.Emil!))).map((z) => z.betragCent)).toEqual([300]);
    expect((await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, ids.Emil!)))[0]!.status).toBe("offen");
  });
});
