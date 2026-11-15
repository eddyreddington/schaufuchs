/** Nachbesserungen Runde 4 (Geld, Protokoll, Datenschutz, Bremsen) und Audit Runde 5. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminKontext, leer, m, SRC, verkaufsbereit, type Mod } from "./kontext";

describe("Nachbesserung Runde 4: Geld und Protokoll an allen Schreibwegen", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let helfer: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let farbe = 0;
  const pos = () => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3000 });
  const person = (n: string) => ({ vorname: n, nachname: "Nachbesserung", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350130088", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });

  test("Einrichtung", async () => {
    al = m.appRouter.createCaller(adminKontext);
    helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    schauId = (await al.schau.anlegen({ name: "Nachbesserung Geld", ort: "Halle" })).id;
    const daten = await al.schau.get({ id: schauId });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
  });

  test("Stiftung: an einer bestehenden Meldung ändert sie nur preise.stiftungSpeichern – nicht meldung.speichern", async () => {
    const r = await al.meldung.speichern({ schauId, aussteller: person("Stifter"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()], stiftung: { betragCent: 5000, vorgabe: "bestes Huhn" } });
    const [angelegt] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, r.meldungId)).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
    expect((angelegt!.neu as { stiftungCent?: number }).stiftungCent).toBe(5000);
    const [art] = await m.db.insert(m.schema.preisart).values({ schauId, kuerzel: "SP", name: "Stiftungspreis", betragCent: 0, quelle: "stiftung" as const, folge: 9 }).returning();
    const [vorher] = await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.meldungId, r.meldungId));
    await al.preise.stiftungSpeichern({ schauId, id: vorher!.id, stifter: vorher!.stifter, preisartId: art!.id, anzahl: 2, betragCent: 5000, vorgabe: vorher!.vorgabe, eingegangenAm: null });
    const d = await al.meldung.get({ id: r.meldungId });
    const eingabe = { schauId, meldungId: r.meldungId, aussteller: { ...person("Stifter"), id: r.ausstellerId }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, positionen: [{ ...pos(), id: d.eintraege[0]!.id }] };
    await expect(helfer.meldung.speichern({ ...eingabe, stiftung: { betragCent: 1, vorgabe: "" } })).rejects.toThrow("Stiftung");
    await expect(al.meldung.speichern({ ...eingabe, stiftung: { betragCent: 1, vorgabe: "" } })).rejects.toThrow("Stiftung");
    // Ohne Angabe zur Stiftung bleibt das normale Speichern möglich und die Stiftung unverändert.
    await helfer.meldung.speichern(eingabe);
    const [nachher] = await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.meldungId, r.meldungId));
    expect(nachher).toMatchObject({ id: vorher!.id, betragCent: 5000, preisartId: art!.id, anzahl: 2 });
  });

  test("Verkauf ohne Geldeingang (Karte, Überweisung) bucht nur die Ausstellungsleitung", async () => {
    const kauf = (zahlart: "karte" | "ueberweisung") => helfer.kasse.verkaufen({ schauId, katalogeintragId: 1, kaeuferName: "Käufer", kaeuferAnschrift: "", kaeuferRegistriernummer: "276065350099", kaeuferAlter: "ab16", zahlart });
    await expect(kauf("karte")).rejects.toThrow("nur durch die Ausstellungsleitung");
    await expect(kauf("ueberweisung")).rejects.toThrow("nur durch die Ausstellungsleitung");
  });

  test("Preise: Grund und Betrag stehen im Protokoll; nach der Freigabe nur mit Grund", async () => {
    const r = await al.meldung.speichern({ schauId, aussteller: person("Preis"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId });
    const tiere = (await al.katalog.liste({ schauId })).filter((e) => e.meldungId === r.meldungId);
    await verkaufsbereit(schauId, tiere.map((t) => t.id));
    await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, schauId));
    const [richter] = await m.db.insert(m.schema.preisrichter).values({ schauId, name: "Richter Preis" }).returning();
    await m.db.insert(m.schema.prEinteilung).values({ schauId, preisrichterId: richter!.id, vonNr: 1, bisNr: 999 });
    const [geld] = await m.db.insert(m.schema.preisart).values({ schauId, kuerzel: "GS", name: "Geldstiftung", betragCent: 700, quelle: "stiftung" as const, anzahlProPreisrichter: 5, folge: 8 }).returning();
    const letzte = async () => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "preisvergabe")).orderBy(m.desc(m.schema.aenderung.id)).limit(1))[0]!;
    await al.preise.vergeben({ schauId, katalogeintragId: tiere[0]!.id, preisartId: geld!.id, grund: "Reklamation: vergessen" });
    expect(await letzte()).toMatchObject({ aktion: "vergeben", grund: "Reklamation: vergessen", neu: { betragCent: 700 } });
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, schauId));
    const [p] = await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.katalogeintragId, tiere[0]!.id));
    await expect(al.preise.entfernen({ schauId, preisvergabeId: p!.id })).rejects.toThrow("Reklamation");
    await al.preise.entfernen({ schauId, preisvergabeId: p!.id, grund: "Reklamation: falsches Tier" });
    expect(await letzte()).toMatchObject({ aktion: "entfernt", grund: "Reklamation: falsches Tier" });
    await expect(al.preise.vergeben({ schauId, katalogeintragId: tiere[0]!.id, preisartId: geld!.id })).rejects.toThrow("Reklamation");
    await al.preise.vergeben({ schauId, katalogeintragId: tiere[0]!.id, preisartId: geld!.id, grund: "Reklamation: doch richtig" });
    expect(await letzte()).toMatchObject({ aktion: "vergeben", grund: "Reklamation: doch richtig" });
  });

  test("Migration 0014 lässt neuere Einträge in Ruhe, 0018 beseitigt den Fehlalarm bei schon geleerten", async () => {
    const { protokolliere } = await import("../services/protokoll");
    const lies = (name: string) => readFileSync(join(SRC, "../drizzle", name), "utf8");
    const id = await m.db.transaction(async (tx) => {
      await protokolliere(tx, { schauId, tabelle: "sepa_lauf", datensatzId: 1, aktion: "SEPA-Datei verworfen", neu: { nachrichtId: "X1", anzahl: 1, summe: 100 }, grund: "Bank hat abgelehnt", akteur: { text: "Test" } });
      return (await tx.select().from(m.schema.aenderung).orderBy(m.desc(m.schema.aenderung.id)).limit(1))[0]!.id;
    });
    const zeile = async () => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.id, id)))[0]!;
    const anweisung = lies("0014_protokoll_vermerke.sql").match(/UPDATE "aenderung" SET "neu" = NULL[^;]*;/)![0];
    await m.sql.unsafe(anweisung);
    expect((await zeile()).neu).toEqual({ nachrichtId: "X1", anzahl: 1, summe: 100 });
    // Schaden wie aus dem alten Stand von 0014: neu leer, Grund noch da.
    await m.sql`update aenderung set neu = null where id = ${id}`;
    expect((await al.schau.protokollPruefen({ schauId })).fehler.map((f) => f.grund)).toContain("Inhalt verändert");
    await m.sql.unsafe(lies("0018_sepa_verworfen_nachtrag.sql"));
    expect((await zeile()).grund).toBe("");
    expect((await al.schau.protokollPruefen({ schauId })).fehler).toEqual([]);
  });

  test("Endgültige Löschung leert auch Gründe bei Preisen und Noten, die Protokollprüfung bleibt ohne Fehler", async () => {
    const { protokolliere } = await import("../services/protokoll");
    const { loescheAussteller } = await import("../services/datenschutz");
    const orgId = adminKontext.benutzer!.organisationId;
    const r = await al.meldung.speichern({ schauId, aussteller: person("Geloescht"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
    const [tier] = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.meldungId, r.meldungId));
    await m.db.transaction(async (tx) => {
      await protokolliere(tx, { schauId, tabelle: "preisvergabe", datensatzId: tier!.id, aktion: "vergeben", neu: { nr: "1", preis: "E" }, grund: "Reklamation von Herrn Name", akteur: { text: "Test" } });
      await protokolliere(tx, { schauId, tabelle: "bewertung", datensatzId: tier!.id, aktion: "geändert", neu: { punkte: 93 }, grund: "Wunsch von Frau Name", akteur: { text: "Test" } });
    });
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.id, r.meldungId));
    await m.db.transaction((tx) => loescheAussteller(tx, orgId, r.ausstellerId, "Test Löschung", { text: "Test" }, new Date("2040-01-01")));
    const zeilen = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, tier!.id));
    expect(zeilen.filter((z) => ["preisvergabe", "bewertung"].includes(z.tabelle)).map((z) => z.grund)).toEqual(["", ""]);
    expect((await al.schau.protokollPruefen({ schauId })).fehler).toEqual([]);
  });
});

describe("Nachbesserung Runde 4: Datenschutz und Bremsen", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let slug = "";
  let farbe = 0;
  const pos = () => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
  const pub = (ip = "198.51.100.200") => m.appRouter.createCaller({ ...leer, ip });
  const online = (vorname: string, opt: { ip?: string; email?: string; tiere?: number; jugend?: boolean; online?: boolean } = {}) =>
    pub(opt.ip).oeffentlich.melden({
      slug,
      aussteller: { vorname, nachname: "Familie", strasse: "Hof 1", plz: "34117", ort: "Kassel", telefon: "", email: opt.email ?? "haus@test.de", verein: "GZV", kreisverband: "", registriernummer: "06 535 012 0066", geburtsdatum: opt.jugend ? "2012-05-05" : null },
      istJugend: opt.jugend ?? false,
      istPreisrichter: false,
      positionen: Array.from({ length: opt.tiere ?? 1 }, pos),
      zustimmung: true,
      onlineVeroeffentlichung: opt.online ?? false,
      erziehungsberechtigter: opt.jugend ? "Eltern Familie" : "",
      stiftung: null,
      bemerkung: "",
    });

  test("Einrichtung", async () => {
    al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Nachbesserung Datenschutz", ort: "Halle" });
    schauId = s.id;
    const daten = await al.schau.get({ id: s.id });
    slug = daten.slug;
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, bewertungAm: "2026-11-21" } });
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    const [wy] = await al.stammdaten.suche({ versionId: daten.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
  });

  test("Widerruf geht immer; gescheiterte Erteilungen zählen nicht", async () => {
    const { token } = await online("Wechsler", { online: true, email: "wechsel@test.de" });
    const setzen = (erlaubt: boolean, erziehungsberechtigter = "") => pub().oeffentlich.onlineVeroeffentlichung({ slug, token, erlaubt, erziehungsberechtigter });
    for (let i = 0; i < 10; i++) {
      await setzen(false);
      await setzen(true);
    }
    expect((await setzen(false)).online).toBe(false);
    await expect(setzen(true)).rejects.toThrow("oft geändert");
    const jung = await online("Jung", { jugend: true, email: "jung@test.de" });
    const eltern = (erziehungsberechtigter: string) => pub().oeffentlich.onlineVeroeffentlichung({ slug, token: jung.token, erlaubt: true, erziehungsberechtigter });
    for (let i = 0; i < 15; i++) await expect(eltern("")).rejects.toThrow("Erziehungsberechtigten");
    expect((await eltern("Eltern Familie")).online).toBe(true);
  });

  test("Familie mit gemeinsamer Adresse: Auskunft und Löschung nur für die eigenen Mails, Journal nur das eigene", async () => {
    const { ladeAuskunft, loescheAussteller } = await import("../services/datenschutz");
    const orgId = adminKontext.benutzer!.organisationId;
    await online("Vater", { email: "gemeinsam@test.de" });
    await online("Sohn", { email: "gemeinsam@test.de" });
    const [vater] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.vorname, "Vater")).orderBy(m.desc(m.schema.aussteller.id)).limit(1);
    const [sohn] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.vorname, "Sohn")).orderBy(m.desc(m.schema.aussteller.id)).limit(1);
    // Mail ohne Bezug zu einem Aussteller (alter Bestand) wird weiter über die Adresse gefunden.
    await m.db.insert(m.schema.postausgang).values({ organisationId: orgId, an: "gemeinsam@test.de", betreff: "Ohne Bezug", text: "x" });
    const anzahlSohn = async () => (await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.ausstellerId, sohn!.id))).length;
    expect((await ladeAuskunft(orgId, vater!.id)).emails.map((e) => e.betreff).sort()).toEqual(["Meldung Nachbesserung Datenschutz", "Ohne Bezug"]);
    expect(await anzahlSohn()).toBe(1);
    // Namensvetter: ein verknüpfter Journaleintrag eines anderen Ausstellers bleibt, ein Eintrag ohne Tier wird geleert.
    const [namens] = await m.db.insert(m.schema.aussteller).values({ organisationId: orgId, vorname: "Peter", nachname: "Vetter" }).returning();
    const [andere] = await m.db.insert(m.schema.meldung).values({ schauId, ausstellerId: namens!.id, eingang: "papier", zugangsToken: "namensvetter-token-1" }).returning();
    const [tier] = await m.db.insert(m.schema.katalogeintrag).values({ schauId, meldungId: andere!.id, art: "einzeltier", geschlecht: "1,0", alter: "jung", position: 0 }).returning();
    await m.db.insert(m.schema.gesundheit).values([
      { schauId, befund: "verknüpft", tierText: "7 Huhn (Vetter, Peter)", katalogeintragId: tier!.id },
      { schauId, befund: "lose", tierText: "8 Huhn (Vetter, Peter)" },
    ]);
    const [zuLoeschen] = await m.db.insert(m.schema.aussteller).values({ organisationId: orgId, vorname: "Peter", nachname: "Vetter" }).returning();
    await m.db.transaction((tx) => loescheAussteller(tx, orgId, zuLoeschen!.id, "Test Namensvetter", { text: "Test" }));
    const text = async (befund: string) => (await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.befund, befund)))[0]!.tierText;
    expect(await text("verknüpft")).toBe("7 Huhn (Vetter, Peter)");
    expect(await text("lose")).toBe("");
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.ausstellerId, vater!.id));
    await m.db.transaction((tx) => loescheAussteller(tx, orgId, vater!.id, "Test Familie", { text: "Test" }));
    expect(await anzahlSohn()).toBe(1);
  });

  test("Mailfehler im Log ohne Adressen; Mustertext nennt die Merkdauer der Anmeldeadressen", async () => {
    const { ohneAdressen } = await import("../services/post");
    expect(ohneAdressen("550 5.1.1 <max.mustermann@example.de>: Recipient rejected; an a@b.de")).toBe("550 5.1.1 <Adresse>: Recipient rejected; an <Adresse>");
    const { datenschutzAbschnitte } = await import("@schau/domain");
    const { ladeVereinsangaben } = await import("../services/datenschutz");
    const text = datenschutzAbschnitte(await ladeVereinsangaben(adminKontext.benutzer!.organisationId)).flatMap((a) => a.absaetze).join(" ");
    expect(text).toContain("bis zu 30 Tage");
    expect(text).toContain("bis zu 14 Tage");
  });

  test("Bekannte Geräte kommen an der Sperre je Adresse vorbei, die AL hebt sie für ein Konto auf", async () => {
    const { bremseJeAdresse } = await import("../routers/auth");
    const passwort = "sehr-geheim-123";
    for (const name of ["adresse-bekannt", "adresse-neu"]) await al.auth.benutzerAnlegen({ name, email: `${name}@test.de`, passwort, rolle: "mitarbeiter" });
    const ip = "203.0.113.177";
    const netz = m.appRouter.createCaller({ ...leer, ip });
    await netz.auth.anmelden({ email: "adresse-bekannt@test.de", passwort });
    for (let i = 0; i < 30; i++) bremseJeAdresse.versuch([`ip:${ip}`]);
    await expect(netz.auth.anmelden({ email: "fremd@test.de", passwort: "falsch-falsch" })).rejects.toThrow("von dieser Adresse");
    await expect(netz.auth.anmelden({ email: "adresse-neu@test.de", passwort })).rejects.toThrow("von dieser Adresse");
    expect((await netz.auth.anmelden({ email: "adresse-bekannt@test.de", passwort })).ok).toBe(true);
    const [neu] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "adresse-neu@test.de"));
    await al.auth.sperreAufheben({ id: neu!.id });
    expect((await netz.auth.anmelden({ email: "adresse-neu@test.de", passwort })).ok).toBe(true);
  }, 30_000);

  test("Tablets: bekannte Geräte kommen an der Sperre je Adresse vorbei", async () => {
    const { pinBremseJeAdresse } = await import("../routers/bewertung");
    const s = await al.schau.anlegen({ name: "Nachbesserung Tablet", ort: "Halle" });
    await al.schau.phaseSetzen({ id: s.id, phase: "bewertung", trotzdem: true, grund: "Test: Ablauf" });
    const daten = await al.schau.get({ id: s.id });
    const richter = async (name: string) => {
      const r = await al.preisrichter.speichern({ schauId: s.id, name, anschrift: "", email: "", telefon: "", istObmann: false });
      return { id: r.id, pin: (await al.preisrichter.pinErzeugen({ schauId: s.id, id: r.id })).pin };
    };
    const [a, b] = [await richter("Tablet Bekannt"), await richter("Tablet Neu")];
    const ip = "203.0.113.178";
    const halle = m.appRouter.createCaller({ ...leer, ip });
    const an = (x: { id: number; pin: string }) => halle.richter.anmelden({ slug: daten.slug, preisrichterId: x.id, pin: x.pin });
    await an(a);
    for (let i = 0; i < 60; i++) pinBremseJeAdresse.versuch([`ip:${ip}`]);
    await expect(an(b)).rejects.toThrow("von diesem Netz");
    expect((await an(a)).ok).toBe(true);
    await al.preisrichter.sperreAufheben({ schauId: s.id, id: b.id });
    expect((await an(b)).ok).toBe(true);
  }, 30_000);

  test("Benutzer anlegen: nur Konflikte zählen für die Bremse", async () => {
    // Eigener Administrator: frischer Zähler der Bremse (die Bremse zählt je Administrator).
    const [zweiter] = await m.db.insert(m.schema.benutzer).values({ organisationId: adminKontext.benutzer!.organisationId, name: "Zweite AL", email: "zweite-al-bremse@test.de", passwortHash: "-", rolle: "admin" }).returning();
    const admin = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, id: zweiter!.id, name: "Zweite AL" } });
    const neu = (n: string) => admin.auth.benutzerAnlegen({ name: `Viele ${n}`, email: `viele-${n}@test.de`, passwort: "sehr-geheim-123", rolle: "mitarbeiter" });
    for (let i = 0; i < 32; i++) await neu(String(i));
    for (let i = 0; i < 30; i++) await expect(neu("0")).rejects.toThrow("nicht verwenden");
    await expect(neu("0")).rejects.toThrow("Zu viele neue Benutzer");
  }, 60_000);

  test("Hallenkapazität: ein Anschluss belegt höchstens die halbe Halle, die Prüfliste nennt die Reservierungen", async () => {
    const { checkliste } = await import("../services/pruefung");
    const s = await al.schau.anlegen({ name: "Nachbesserung Kapazität", ort: "Halle" });
    const daten = await al.schau.get({ id: s.id });
    const alt = slug;
    slug = daten.slug;
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, kapazitaet: 100, bewertungAm: "2026-11-21" } });
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    const ip = (n: number) => `198.51.100.${n}`;
    // Zu große oder gescheiterte Meldungen verbrauchen nichts.
    await expect(online("Gross", { ip: ip(90), email: "g0@test.de", tiere: 31 })).rejects.toThrow("direkt bei der Ausstellungsleitung");
    // Mehrere /64-Netze eines Anschlusses zählen zusammen.
    await online("Vier", { ip: "2001:db8:1:2a01::/64", email: "g4@test.de", tiere: 30 });
    await expect(online("Fuenf", { ip: "2001:db8:1:2a02::/64", email: "g5@test.de", tiere: 21 })).rejects.toThrow("Von dieser Adresse");
    await online("Eins", { ip: ip(90), email: "g1@test.de", tiere: 30 });
    // Eine Familie am selben Anschluss kommt unter der Grenze durch.
    await online("Zwei", { ip: ip(90), email: "g2@test.de", tiere: 20 });
    await expect(online("Drei", { ip: ip(90), email: "g3@test.de", tiere: 1 })).rejects.toThrow("Von dieser Adresse");
    await online("Sechs", { ip: "2001:db8:1:2a02::/64", email: "g6@test.de", tiere: 20 });
    await expect(online("Sieben", { ip: ip(94), email: "g7@test.de", tiere: 1 })).rejects.toThrow("Hallenkapazität");
    expect((await checkliste(s.id)).some((p) => p.text.includes("Online-Meldung ist geschlossen"))).toBe(true);
    slug = alt;
  });

  test("Hinter einem Proxy ohne TRUST_PROXY (lokale Adresse) trifft die Grenze je Adresse nicht alle Besucher", async () => {
    const { istLokaleAdresse, adressSchluessel } = await import("../services/bremse");
    for (const a of ["127.0.0.1", "::ffff:10.1.2.3", "192.168.1.5", "172.17.0.1", "172.31.255.1", "::1", "fd00::1", "fe80::1", "unbekannt"]) expect(istLokaleAdresse(adressSchluessel(a))).toBe(true);
    for (const a of ["198.51.100.1", "172.32.0.1", "8.8.8.8", "2001:db8::1"]) expect(istLokaleAdresse(adressSchluessel(a))).toBe(false);
    const s = await al.schau.anlegen({ name: "Nachbesserung Proxy", ort: "Halle" });
    const daten = await al.schau.get({ id: s.id });
    const alt = slug;
    slug = daten.slug;
    await al.schau.aktualisieren({ id: s.id, daten: { ...daten, kapazitaet: 100, bewertungAm: "2026-11-21" } });
    await al.schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
    await online("Proxy1", { ip: "127.0.0.1", email: "p1@test.de", tiere: 30 });
    await online("Proxy2", { ip: "127.0.0.1", email: "p2@test.de", tiere: 30 });
    slug = alt;
  });

  test("Veraltetes Formular: das Protokoll nennt die wirksame Einwilligung, nicht die gesendete", async () => {
    const { meldungId } = await (async () => {
      const r = await online("Protokoll", { online: true, email: "protokoll@test.de" });
      const [z] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token));
      return { meldungId: z!.id };
    })();
    const [z] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    await pub().oeffentlich.onlineVeroeffentlichung({ slug, token: z!.zugangsToken, erlaubt: false });
    const d = await al.meldung.get({ id: meldungId });
    await al.meldung.speichern({ schauId, meldungId, aussteller: { ...d.aussteller, id: d.aussteller.id, istPreisrichter: false, iban: "", kontoinhaber: "" } as never, eingang: "online", istJugend: false, bemerkung: "", zustimmung: true, onlineZustimmung: true, onlineZustimmungVorher: true, positionen: [{ ...pos(), id: d.eintraege[0]!.id }] });
    const [nachher] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    expect(nachher!.onlineZustimmungAm).toBeNull();
    const [log] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, meldungId)).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
    expect((log!.neu as { online: boolean }).online).toBe(false);
  });
});

describe("Audit Runde 5: mittlere Befunde", () => {
  let al: ReturnType<Mod["appRouter"]["createCaller"]>;
  let helfer: ReturnType<Mod["appRouter"]["createCaller"]>;
  let farbe = 0;
  const pos = () => ({ farbenschlagId: farbe, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
  const person = (n: string, extra: object = {}) => ({ vorname: n, nachname: "Runde5", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350130077", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "", ...extra });
  const neueSchau = async (name: string) => {
    const { id } = await al.schau.anlegen({ name, ort: "Halle" });
    const s = await al.schau.get({ id });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    farbe = wy!.id;
    return s;
  };

  test("Erste IBAN: Helfer setzt sie nicht über eine zweite Schau, wenn anderswo schon Schau oder Abrechnung läuft", async () => {
    al = m.appRouter.createCaller(adminKontext);
    helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const eins = await neueSchau("R5 IBAN eins");
    const r = await al.meldung.speichern({ schauId: eins.id, aussteller: person("Bank"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await m.db.update(m.schema.schau).set({ phase: "schau" }).where(m.eq(m.schema.schau.id, eins.id));
    const zwei = await neueSchau("R5 IBAN zwei");
    const eingabe = { schauId: zwei.id, aussteller: person("Bank", { id: r.ausstellerId, iban: "DE89370400440532013000", kontoinhaber: "Helfer Privat" }), eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] };
    await expect(helfer.meldung.speichern(eingabe)).rejects.toThrow("Ausstellungsleitung");
    await al.meldung.speichern(eingabe);
    const vermerk = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, eins.id)).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
    expect(vermerk[0]!.aktion).toBe("Bankdaten geändert (in anderer Schau)");
    expect(JSON.stringify(vermerk[0]!.neu)).not.toContain("DE89370400440532013000");
  });

  test("Festgeschriebener Katalog: Storno behält die gedruckten Nummern, Wiederaufnahme bringt sie zurück", async () => {
    const s = await neueSchau("R5 Nummern");
    const r = await al.meldung.speichern({ schauId: s.id, aussteller: person("Nummer"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(), pos()] });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: s.id });
    const nummern = async () => (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.meldungId, r.meldungId))).map((e) => e.katalogNr).sort();
    const vorher = await nummern();
    expect(vorher.every((n) => n != null)).toBe(true);
    await m.db.update(m.schema.schau).set({ katalogGedruckt: true }).where(m.eq(m.schema.schau.id, s.id));
    await al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Test" });
    expect(await nummern()).toEqual(vorher);
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt", grund: "doch dabei" });
    expect(await nummern()).toEqual(vorher);
    // Ohne Festschreiben verliert eine stornierte Meldung ihre Nummern wie bisher.
    await m.db.update(m.schema.schau).set({ katalogGedruckt: false }).where(m.eq(m.schema.schau.id, s.id));
    await al.meldung.statusSetzen({ id: r.meldungId, status: "storniert", grund: "Test" });
    expect((await nummern()).every((n) => n == null)).toBe(true);
  });

  test("Online-Meldung eines bekannten Ausstellers nutzt den vorhandenen Stammsatz und überschreibt ihn nicht", async () => {
    const online = async (slug: string, strasse: string) =>
      m.appRouter.createCaller({ ...leer, ip: "203.0.113.201" }).oeffentlich.melden({
        slug,
        aussteller: { vorname: "Bernd", nachname: "Bekannt", strasse, plz: "34117", ort: "Kassel", telefon: "", email: "Bernd@Test.de", verein: "", kreisverband: "", registriernummer: "06 535 012 0055", geburtsdatum: null },
        istJugend: false, istPreisrichter: false, positionen: [pos()], zustimmung: true, stiftung: null, bemerkung: "",
      });
    const a = await neueSchau("R5 Online eins");
    await al.schau.phaseSetzen({ id: a.id, phase: "meldung", trotzdem: true });
    await online(a.slug, "Alte Straße 1");
    const b = await neueSchau("R5 Online zwei");
    await al.schau.phaseSetzen({ id: b.id, phase: "meldung", trotzdem: true });
    await online(b.slug, "Neue Straße 9");
    const saetze = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.nachname, "Bekannt"));
    expect(saetze).toHaveLength(1);
    expect(saetze[0]!.strasse).toBe("Alte Straße 1");
    expect(await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.ausstellerId, saetze[0]!.id))).toHaveLength(2);
  });

  test("Belegarchiv: unbekannte Belegart gibt 404, Storno-Art liefert nicht das Original", async () => {
    const server = (await import("../index")).default;
    const { COOKIE, neueSitzung } = await import("../auth");
    const cookie = `${COOKIE}=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
    const [s] = await m.db.select().from(m.schema.schau).limit(1);
    const hole = (art: string) => server.fetch(new Request(`http://test/datei/${s!.id}/beleg/${art}/999999.pdf`, { headers: { cookie } }));
    expect((await hole("quittungxyz")).status).toBe(404);
    expect((await hole("kaufbeleg-storno")).status).toBe(404);
    // Ein Kaufbeleg ohne Storno (aus den Verkäufen der früheren Teile): die Storno-Art liefert nicht das Original.
    const storniert = new Set((await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.art, "kaufbeleg-storno"))).map((x) => `${x.schauId}:${x.nummer}`));
    const b = (await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.art, "kaufbeleg"))).find((x) => !storniert.has(`${x.schauId}:${x.nummer}`));
    expect(b).toBeDefined();
    const original = await server.fetch(new Request(`http://test/datei/${b!.schauId}/beleg/kaufbeleg/${b!.nummer}.pdf`, { headers: { cookie } }));
    expect(original.status).toBe(200);
    const ohneStorno = await server.fetch(new Request(`http://test/datei/${b!.schauId}/beleg/kaufbeleg-storno/${b!.nummer}.pdf`, { headers: { cookie } }));
    expect(ohneStorno.status).toBe(404);
  });

  test("Speicherfristen: ein vertipptes Bewertungsjahr wird abgelehnt und löscht bei laufender Schau nichts", async () => {
    const { bereinige } = await import("../services/datenschutz");
    const s = await neueSchau("R5 Fristen");
    await expect(al.schau.aktualisieren({ id: s.id, daten: { ...s, bewertungAm: "2023-11-09" } })).rejects.toThrow("Jahr prüfen");
    await m.db.update(m.schema.schau).set({ bewertungAm: "2020-11-09", phase: "schau" }).where(m.eq(m.schema.schau.id, s.id));
    await m.db.insert(m.schema.gesundheit).values({ schauId: s.id, befund: "R5 laufende Schau" });
    await bereinige(new Date());
    expect(await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.befund, "R5 laufende Schau"))).toHaveLength(1);
  });

  test("Neue Vereine bekommen Textbausteine; lange Metapfade werden schnell abgewiesen", async () => {
    const { TEXTBAUSTEINE_GRUNDBESTAND } = await import("../services/textbausteine");
    expect(TEXTBAUSTEINE_GRUNDBESTAND.length).toBeGreaterThan(10);
    expect(readFileSync(join(SRC, "../drizzle/0019_textbausteine_grundbestand.sql"), "utf8")).toContain("gute Form");
    const server = (await import("../index")).default;
    const rumpf = `{"json":{},"meta":{"values":{"${"a.".repeat(30000)}a":{${Array.from({ length: 4000 }, (_, i) => `"k${i}":["Date"]`).join(",")}}}}}`;
    const t0 = Date.now();
    const r = await server.fetch(new Request("http://test/trpc/auth.abmelden", { method: "POST", headers: { "content-type": "application/json" }, body: rumpf }));
    expect(r.status).toBe(400);
    expect(Date.now() - t0).toBeLessThan(300);
  });
});
