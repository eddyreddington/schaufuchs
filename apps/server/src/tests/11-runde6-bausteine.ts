/** Audit Runde 6, Textbausteine, Zwei-Faktor-Pflicht. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminKontext, leer, m, SRC } from "./kontext";

describe("Audit Runde 6: Behebungen", () => {
  const orgId = () => adminKontext.benutzer!.organisationId;

  test("Passwort ändern ist gebremst und wird protokolliert", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.auth.benutzerAnlegen({ name: "Brems Test", email: "brems-pw@test.de", passwort: "brems-test-123", rolle: "mitarbeiter" });
    const ich = m.appRouter.createCaller({ ...leer, benutzer: { id, organisationId: orgId(), name: "Brems Test", email: "brems-pw@test.de", rolle: "mitarbeiter" } });
    await ich.auth.passwortAendern({ alt: "brems-test-123", neu: "brems-neu-12345" });
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, id));
    expect(prot.some((p) => p.tabelle === "benutzer" && p.aktion === "Eigenes Passwort geändert")).toBe(true);
    for (let i = 0; i < 5; i++) await expect(ich.auth.passwortAendern({ alt: `falsch-${i}-xxxxx`, neu: "egal-egal-egal" })).rejects.toThrow("stimmt nicht");
    await expect(ich.auth.passwortAendern({ alt: "brems-neu-12345", neu: "egal-egal-egal" })).rejects.toThrow("Zu viele");
  });

  test("Anlegen, Sperren, Entsperren, Abmelden und Sperre aufheben stehen im Protokoll; alte Adresse erfährt die Änderung", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.auth.benutzerAnlegen({ name: "Prot Test", email: "prot-alt@test.de", passwort: "prot-test-1234", rolle: "mitarbeiter" });
    await al.auth.benutzerAktiv({ id, aktiv: false });
    await al.auth.benutzerAktiv({ id, aktiv: true });
    await al.auth.benutzerAbmelden({ id });
    await al.auth.sperreAufheben({ id });
    await al.auth.benutzerSpeichern({ id, name: "Prot Test", email: "prot-neu@test.de" });
    const aktionen = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, id))).filter((p) => p.tabelle === "benutzer").map((p) => p.aktion);
    for (const a of ["Benutzer angelegt", "Benutzer gesperrt", "Benutzer entsperrt", "Auf allen Geräten abgemeldet", "Sperre nach Fehlversuchen aufgehoben", "Benutzer geändert"]) expect(aktionen).toContain(a);
    const [hinweis] = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "prot-alt@test.de")).orderBy(m.desc(m.schema.postausgang.id));
    expect(hinweis!.betreff).toContain("Anmeldeadresse");
    expect(hinweis!.text).toContain("prot-alt@test.de");
  });

  test("Entfernte Benutzer: Ersatzadresse ohne @, keine Anmeldung und keine Sitzung, auch wenn aktiv wieder gesetzt wäre; gleichzeitiges Entsperren belebt nicht", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { protokolliere } = await import("../services/protokoll");
    const { neueSitzung, ladeSitzung } = await import("../auth");
    const { id } = await al.auth.benutzerAnlegen({ name: "Nicht Wieder", email: "nicht-wieder@test.de", passwort: "nicht-wieder-1", rolle: "admin" });
    await protokolliere(m.db, { schauId: null, tabelle: "test", datensatzId: null, aktion: "Spur", akteur: { benutzer: { id, name: "x" } } });
    const token = await neueSitzung({ benutzerId: id });
    await Promise.all([al.auth.benutzerLoeschen({ id }), al.auth.benutzerAktiv({ id, aktiv: true }).catch(() => null), al.auth.benutzerPasswortSetzen({ id, passwort: "wieder-da-12345" }).catch(() => null)]);
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, id));
    expect(b!.geloeschtAm).toBeInstanceOf(Date);
    expect(b!.aktiv).toBe(false);
    expect(b!.email).not.toContain("@");
    expect(b!.passwortHash).toBe("-");
    // Selbst wenn "aktiv" durch einen Fehler wieder gesetzt wäre: keine Sitzung, keine Anmeldung.
    await m.db.update(m.schema.benutzer).set({ aktiv: true }).where(m.eq(m.schema.benutzer.id, id));
    const neu = await neueSitzung({ benutzerId: id });
    expect((await ladeSitzung(neu)).benutzer).toBeNull();
    expect((await ladeSitzung(token)).benutzer).toBeNull();
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.210" });
    await expect(pub.auth.anmelden({ email: b!.email, passwort: "wieder-da-12345" })).rejects.toThrow("stimmt nicht");
    await m.db.update(m.schema.benutzer).set({ aktiv: false }).where(m.eq(m.schema.benutzer.id, id));
  });

  test("Zwei Administratoren nehmen sich gleichzeitig die Rechte: einer bleibt", async () => {
    const [o] = await m.db.insert(m.schema.organisation).values({ name: "Zwei Admins" }).returning();
    const [a, b] = await m.db
      .insert(m.schema.benutzer)
      .values([
        { organisationId: o!.id, name: "A", email: "zwei-a@test.de", passwortHash: "-", rolle: "admin" },
        { organisationId: o!.id, name: "B", email: "zwei-b@test.de", passwortHash: "-", rolle: "admin" },
      ])
      .returning();
    const als = (x: typeof a) => m.appRouter.createCaller({ ...leer, benutzer: { id: x!.id, organisationId: o!.id, name: x!.name, email: x!.email, rolle: "admin" } });
    for (const [weg1, weg2] of [
      [() => als(a).auth.benutzerRolle({ id: b!.id, rolle: "mitarbeiter" }), () => als(b).auth.benutzerRolle({ id: a!.id, rolle: "mitarbeiter" })],
      [() => als(a).auth.benutzerAktiv({ id: b!.id, aktiv: false }), () => als(b).auth.benutzerAktiv({ id: a!.id, aktiv: false })],
    ] as const) {
      const r = await Promise.allSettled([weg1(), weg2()]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const admins = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.organisationId, o!.id));
      expect(admins.filter((x) => x.rolle === "admin" && x.aktiv && !x.geloeschtAm).length).toBeGreaterThanOrEqual(1);
      await m.db.update(m.schema.benutzer).set({ rolle: "admin", aktiv: true }).where(m.eq(m.schema.benutzer.organisationId, o!.id));
    }
  });

  test("Notfallcodes: zwei gleichzeitig eingelöste Codes sind beide verbraucht", async () => {
    const z = await import("../services/zweifaktor");
    const al = m.appRouter.createCaller(adminKontext);
    const passwort = "notfall-zwei-123";
    const { id } = await al.auth.benutzerAnlegen({ name: "Notfall Zwei", email: "notfall-zwei@test.de", passwort, rolle: "mitarbeiter" });
    const ich = m.appRouter.createCaller({ ...leer, ip: "203.0.113.211", benutzer: { id, organisationId: orgId(), name: "Notfall Zwei", email: "notfall-zwei@test.de", rolle: "mitarbeiter" } });
    const e = await ich.auth.zweiFaktorEinrichten({ passwort });
    const { notfallcodes } = await ich.auth.zweiFaktorBestaetigen({ code: z.totp(z.ausBase32(e.geheim.replace(/\s/g, "")), z.zeitschritt()) });
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.211" });
    const t1 = (await pub.auth.anmelden({ email: "notfall-zwei@test.de", passwort })).token;
    const t2 = (await pub.auth.anmelden({ email: "notfall-zwei@test.de", passwort })).token;
    await Promise.all([pub.auth.anmeldenCode({ token: t1, code: notfallcodes[0]! }), pub.auth.anmeldenCode({ token: t2, code: notfallcodes[1]! })]);
    expect((await ich.auth.zweiFaktorStatus()).notfallUebrig).toBe(8);
    const t3 = (await pub.auth.anmelden({ email: "notfall-zwei@test.de", passwort })).token;
    await expect(pub.auth.anmeldenCode({ token: t3, code: notfallcodes[0]! })).rejects.toThrow("stimmt nicht");
  });

  test("Verzeichnis: kein Wechsel bei gemeldeten Tieren, kein Löschen bei Verweisen, Name begrenzt", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const csv = readFileSync(join(SRC, "../seed/demo-stammdaten.csv"), "utf8");
    await expect(al.stammdaten.importieren({ name: "x".repeat(201), jahr: 2026, quelle: "", csv })).rejects.toThrow();
    const { id: schauId } = await al.schau.anlegen({ name: "R6 Versionswechsel", ort: "Halle" });
    const alt = await al.stammdaten.importieren({ name: "R6 bisherige Version", jahr: 2026, quelle: "", csv });
    const neu = await al.stammdaten.importieren({ name: "R6 andere Version", jahr: 2027, quelle: "", csv });
    await al.schau.aktualisieren({ id: schauId, daten: { ...(await al.schau.get({ id: schauId })), stammdatenVersionId: alt.versionId } });
    const s = await al.schau.get({ id: schauId });
    const [wy] = await al.stammdaten.suche({ versionId: alt.versionId, q: "Wyandotten weiß" });
    // Ohne Meldungen geht der Wechsel (und zurück).
    await al.schau.aktualisieren({ id: schauId, daten: { ...s, stammdatenVersionId: neu.versionId } });
    await al.schau.aktualisieren({ id: schauId, daten: { ...s } });
    await al.meldung.speichern({
      schauId,
      aussteller: { vorname: "Ver", nachname: "Sion", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await expect(al.schau.aktualisieren({ id: schauId, daten: { ...s, stammdatenVersionId: neu.versionId } })).rejects.toThrow("gemeldete Tiere");
    await expect(al.schau.aktualisieren({ id: schauId, daten: { ...s, stammdatenVersionId: null } })).rejects.toThrow("gemeldete Tiere");
    // Version mit Verweisen, aber ohne Schau: nicht löschbar (statt internem Fehler).
    await m.db.update(m.schema.schau).set({ stammdatenVersionId: neu.versionId }).where(m.eq(m.schema.schau.id, schauId));
    await expect(al.stammdaten.loeschen({ id: s.stammdatenVersionId! })).rejects.toThrow(/verwendet|verweisen/);
    await m.db.update(m.schema.schau).set({ stammdatenVersionId: s.stammdatenVersionId }).where(m.eq(m.schema.schau.id, schauId));
  });

  test("Öffentliche Farbenschlagsuche ist je Anschluss gebremst", async () => {
    const pub = m.appRouter.createCaller({ ...leer, ip: "198.51.100.77" });
    for (let i = 0; i < 120; i++) await pub.oeffentlich.farbenschlagSuche({ slug: "gibt-es-nicht", q: "ab" }).catch((e: Error) => expect(e.message).not.toContain("Zu viele"));
    await expect(pub.oeffentlich.farbenschlagSuche({ slug: "gibt-es-nicht", q: "ab" })).rejects.toThrow("Zu viele Suchanfragen");
  });

  test("superjson-Metadaten: verschachtelte Pfade sind über alle Ebenen begrenzt", async () => {
    const { pruefeMeta } = await import("../trpc");
    const lang = Array.from({ length: 40 }, () => "a").join(".");
    expect(() => pruefeMeta({ values: { [lang]: { [lang]: ["Date"] } } })).toThrow();
    expect(() => pruefeMeta({ values: { [".".repeat(100)]: ["Date"] } })).toThrow();
    expect(() => pruefeMeta({ values: { "daten.bewertungAm": ["Date"], "positionen.0.datum": ["undefined"] } })).not.toThrow();
  });

  test("Online-Meldung eines bekannten Ausstellers ändert dessen Geburtsdatum nicht; Meldung ohne Jugend löscht es nicht", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const schau = async (name: string) => {
      const { id } = await al.schau.anlegen({ name, ort: "Halle" });
      const s = await al.schau.get({ id });
      await al.schau.aktualisieren({ id, daten: { ...s, bewertungAm: "2026-12-09" } });
      await al.schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
      const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
      return { slug: s.slug, farbe: wy!.id };
    };
    const online = (slug: string, farbe: number, jugend: string | null) =>
      m.appRouter.createCaller({ ...leer, ip: "203.0.113.212" }).oeffentlich.melden({
        slug,
        aussteller: { vorname: "Jana", nachname: "Jugend", strasse: "Weg 1", plz: "34117", ort: "Kassel", telefon: "", email: "jana@test.de", verein: "", kreisverband: "", registriernummer: "06 535 012 0066", geburtsdatum: jugend },
        istJugend: jugend != null, erziehungsberechtigter: jugend ? "Eltern Jugend" : "", istPreisrichter: false, zustimmung: true, stiftung: null, bemerkung: "",
        positionen: [{ farbenschlagId: farbe, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    const a = await schau("R6 Geburt eins");
    await online(a.slug, a.farbe, "2014-05-01");
    const b = await schau("R6 Geburt zwei");
    await online(b.slug, b.farbe, null);
    const c = await schau("R6 Geburt drei");
    await online(c.slug, c.farbe, "2013-01-01");
    const saetze = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.email, "jana@test.de"));
    expect(saetze).toHaveLength(1);
    expect(String(saetze[0]!.geburtsdatum)).toContain("2014-05-01");
  });
});

describe("Textbausteine nach Merkmal und Geflügelart", () => {
  test("Speichern mit Merkmal und Art, Doppelte abgewiesen, Grundbestand ergänzt nur Fehlendes und lässt Eigenes stehen", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { TEXTBAUSTEINE_GRUNDBESTAND } = await import("../services/textbausteine");
    await al.bewertung.textbausteinSpeichern({ kategorie: "wunsch", text: "Eigener Wunsch zum Kamm", gruppe: "Kamm", art: "huehner" });
    await expect(al.bewertung.textbausteinSpeichern({ kategorie: "wunsch", text: "Eigener Wunsch zum Kamm", gruppe: "Kamm", art: "huehner" })).rejects.toThrow("gibt es schon");
    await expect(al.bewertung.textbausteinSpeichern({ kategorie: "wunsch", text: "ohne Art", gruppe: "Kamm", art: "elefanten" })).rejects.toThrow();
    const vorher = await al.bewertung.textbausteine();
    const eigen = vorher.find((b) => b.text === "Eigener Wunsch zum Kamm")!;
    expect(eigen).toMatchObject({ gruppe: "Kamm", art: "huehner" });
    // Einen Grundbaustein löschen: „Grundbestand übernehmen“ bringt genau ihn zurück, Eigenes bleibt.
    const g = vorher.find((b) => TEXTBAUSTEINE_GRUNDBESTAND.some((x) => x.text === b.text && x.kategorie === b.kategorie && x.gruppe === b.gruppe));
    expect(g).toBeDefined();
    await al.bewertung.textbausteinLoeschen({ id: g!.id });
    expect((await al.bewertung.textbausteine()).some((b) => b.id === g!.id)).toBe(false);
    const r1 = await al.bewertung.textbausteinGrundbestand();
    expect(r1.neu).toBe(1);
    expect((await al.bewertung.textbausteine()).some((b) => b.text === g!.text && b.kategorie === g!.kategorie && b.gruppe === g!.gruppe)).toBe(true);
    expect((await al.bewertung.textbausteinGrundbestand()).neu).toBe(0);
    const nachher = await al.bewertung.textbausteine();
    expect(nachher.some((b) => b.id === eigen.id)).toBe(true);
    for (const x of TEXTBAUSTEINE_GRUNDBESTAND) expect(nachher.some((b) => b.text.toLowerCase() === x.text.toLowerCase() && b.kategorie === x.kategorie && b.gruppe === x.gruppe && b.art === x.art)).toBe(true);
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await expect(helfer.bewertung.textbausteinGrundbestand()).rejects.toThrow();
  });

  test("Grundbestand: gültige Kategorien, Arten und Merkmale, keine Dubletten, kurze Texte", async () => {
    const { TEXTBAUSTEINE_GRUNDBESTAND } = await import("../services/textbausteine");
    const { BAUSTEIN_ART_LISTE, BAUSTEIN_KATEGORIEN } = await import("@schau/domain");
    const schluessel = new Set<string>();
    for (const b of TEXTBAUSTEINE_GRUNDBESTAND) {
      expect(BAUSTEIN_KATEGORIEN).toContain(b.kategorie);
      expect(BAUSTEIN_ART_LISTE).toContain(b.art);
      expect(b.gruppe.length).toBeGreaterThanOrEqual(2);
      expect(b.gruppe.length).toBeLessThanOrEqual(40);
      expect(b.text.length).toBeGreaterThanOrEqual(2);
      expect(b.text.length).toBeLessThanOrEqual(120);
      const k = `${b.kategorie}|${b.gruppe}|${b.art}|${b.text.toLowerCase()}`;
      expect(schluessel.has(k)).toBe(false);
      schluessel.add(k);
    }
  });
});

describe("Zwei-Faktor-Pflicht für Administratoren", () => {
  test("Administrator ohne 2FA: keine Verwaltung, Status meldet die Pflicht, Einrichten geht; mit 2FA alles", async () => {
    const z = await import("../services/zweifaktor");
    const { neueSitzung, ladeSitzung } = await import("../auth");
    const al = m.appRouter.createCaller(adminKontext);
    const passwort = "pflicht-admin-12";
    const { id } = await al.auth.benutzerAnlegen({ name: "Pflicht Admin", email: "pflicht-admin@test.de", passwort, rolle: "admin" });
    // So wie aus einer echten Sitzung geladen.
    const sitzung = await ladeSitzung(await neueSitzung({ benutzerId: id }));
    expect(sitzung.benutzer?.zweiFaktor).toBe(false);
    const ich = m.appRouter.createCaller({ ...leer, ip: "203.0.113.220", benutzer: sitzung.benutzer });
    await expect(ich.auth.benutzerListe()).rejects.toThrow("Pflicht");
    await expect(ich.schau.anlegen({ name: "Darf nicht", ort: "x" })).rejects.toThrow("Pflicht");
    expect((await ich.auth.status()).zweiFaktorPflicht).toBe(true);
    // Einrichten ist erlaubt (benutzerProcedure).
    const e = await ich.auth.zweiFaktorEinrichten({ passwort });
    await ich.auth.zweiFaktorBestaetigen({ code: z.totp(z.ausBase32(e.geheim.replace(/\s/g, "")), z.zeitschritt()) });
    const danach = await ladeSitzung(await neueSitzung({ benutzerId: id }));
    expect(danach.benutzer?.zweiFaktor).toBe(true);
    const ichMit = m.appRouter.createCaller({ ...leer, ip: "203.0.113.220", benutzer: danach.benutzer });
    expect((await ichMit.auth.status()).zweiFaktorPflicht).toBe(false);
    expect((await ichMit.auth.benutzerListe()).length).toBeGreaterThan(0);
    // Helfer ohne 2FA sind nicht betroffen.
    const { id: hid } = await al.auth.benutzerAnlegen({ name: "Pflicht Helfer", email: "pflicht-helfer@test.de", passwort, rolle: "mitarbeiter" });
    const h = await ladeSitzung(await neueSitzung({ benutzerId: hid }));
    expect((await m.appRouter.createCaller({ ...leer, benutzer: h.benutzer }).auth.status()).zweiFaktorPflicht).toBe(false);
  });
});
