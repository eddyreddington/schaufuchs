/** Runde 4: Betrieb, Anmeldung und Grenzen; Nachbesserungen zu Größengrenzen, superjson, öffentlichem Katalog. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config";
import { adminKontext, leer, m, pdfText, SRC } from "./kontext";

describe("Runde 4: Betrieb, Anmeldung und Grenzen", () => {
  const server = async () => (await import("../index")).default;
  const ausstellerDaten = (nachname: string, extra: object = {}) => ({ vorname: "Test", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "065350150099", geburtsdatum: null, istPreisrichter: false, ...extra });
  /** Schau mit einer bestätigten Meldung über `n` Wyandotten (katalogisiert). */
  async function schauMitTieren(name: string, n: number, aussteller: object = {}) {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name, ort: "Halle" });
    const s = await al.schau.get({ id });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al.meldung.speichern({ schauId: s.id, aussteller: ausstellerDaten(name, aussteller), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: Array.from({ length: n }, () => pos) });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al.katalog.nummernVergeben({ schauId: s.id });
    return { al, s, meldungId: r.meldungId, tiere: (await al.katalog.liste({ schauId: s.id })).sort((a, b) => a.katalogNr! - b.katalogNr!) };
  }
  const zaehleSitzungen = async (spalte: "benutzerId" | "preisrichterId", id: number) => (await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung[spalte], id))).length;

  test("Wartezeit statt Sperre: steigt nach Fehlversuchen, bekannte Geräte kommen durch, IPv6 je /64", async () => {
    const { Wartezeit, adressSchluessel } = await import("../services/bremse");
    const w = new Wartezeit(2, 60_000, 3_600_000, (s) => `bitte ${s} s warten`);
    w.versuch("konto", "192.0.2.1")(true); // erfolgreiche Anmeldung: Gerät ist bekannt
    w.versuch("konto", "203.0.113.9");
    w.versuch("konto", "203.0.113.9");
    w.versuch("konto", "203.0.113.9"); // dritter Fehlversuch: ab jetzt warten
    expect(() => w.versuch("konto", "203.0.113.9")).toThrow("warten");
    expect(() => w.versuch("konto", "198.51.100.4")).toThrow("warten");
    expect(() => w.versuch("konto", "192.0.2.1")).not.toThrow();
    expect(w.wartet("konto")).toBe(true);
    // Nur genau dieser Schlüssel: „kont“ (etwa ein ähnliches Konto eines anderen Vereins) hebt nichts auf.
    w.zuruecksetzen("kont");
    expect(w.wartet("konto")).toBe(true);
    w.zuruecksetzen("konto", true);
    expect(w.wartet("konto")).toBe(false);
    expect(() => w.versuch("konto", "203.0.113.9")).not.toThrow();

    expect(adressSchluessel("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(adressSchluessel("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(adressSchluessel("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(adressSchluessel("::ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(adressSchluessel("192.0.2.1")).toBe("192.0.2.1");
  });

  test("Anmeldung: Grenze je Adresse, Wartezeit je Konto, AL hebt auf, Sperren meldet überall ab", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    // Je Adresse höchstens 30 Fehlversuche über alle Konten.
    const spray = m.appRouter.createCaller({ ...leer, ip: "198.51.100.77" });
    for (let i = 0; i < 30; i++) await expect(spray.auth.anmelden({ email: `niemand${i}@test.de`, passwort: "falsch-falsch" })).rejects.toThrow("stimmt nicht");
    await expect(spray.auth.anmelden({ email: "noch-einer@test.de", passwort: "falsch-falsch" })).rejects.toThrow("von dieser Adresse");

    await al.auth.benutzerAnlegen({ name: "Warte Test", email: "warte@test.de", passwort: "richtig-richtig-1", rolle: "mitarbeiter" });
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "warte@test.de"));
    let cookie = "";
    const zuhause = m.appRouter.createCaller({ ...leer, ip: "192.0.2.50", setCookie: (c: string) => (cookie = c) });
    await zuhause.auth.anmelden({ email: "warte@test.de", passwort: "richtig-richtig-1" });
    expect(cookie).toContain("schau_sitzung=");
    // Fremde Adressen: nach 10 Fehlversuchen Wartezeit für das Konto …
    for (let i = 0; i < 11; i++) {
      await expect(m.appRouter.createCaller({ ...leer, ip: `203.0.113.${i + 1}` }).auth.anmelden({ email: "warte@test.de", passwort: "falsch-falsch" })).rejects.toThrow("stimmt nicht");
    }
    await expect(m.appRouter.createCaller({ ...leer, ip: "203.0.113.99" }).auth.anmelden({ email: "warte@test.de", passwort: "richtig-richtig-1" })).rejects.toThrow("Minute");
    expect((await al.auth.benutzerListe()).find((x) => x.id === b!.id)?.wartet).toBe(true);
    // … das bekannte Gerät kommt trotzdem herein, und die AL hebt die Wartezeit auf.
    await zuhause.auth.anmelden({ email: "warte@test.de", passwort: "richtig-richtig-1" });
    await al.auth.sperreAufheben({ id: b!.id });
    await m.appRouter.createCaller({ ...leer, ip: "203.0.113.99" }).auth.anmelden({ email: "warte@test.de", passwort: "richtig-richtig-1" });

    // Sperren meldet alle Geräte ab; nach dem Entsperren gelten die alten Sitzungen nicht wieder.
    expect(await zaehleSitzungen("benutzerId", b!.id)).toBe(3);
    await al.auth.benutzerAktiv({ id: b!.id, aktiv: false });
    expect(await zaehleSitzungen("benutzerId", b!.id)).toBe(0);
    await al.auth.benutzerAktiv({ id: b!.id, aktiv: true });
    expect(await zaehleSitzungen("benutzerId", b!.id)).toBe(0);
  });

  test("Tablet-PIN: 8 Ziffern, nur in den Tablet-Phasen, Abmeldung danach, Wartezeit aufhebbar", async () => {
    const { al, s } = await schauMitTieren("PIN Runde 4", 1);
    const pr = await al.preisrichter.speichern({ schauId: s.id, name: "PIN Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    const { pin } = await al.preisrichter.pinErzeugen({ schauId: s.id, id: pr.id });
    expect(pin).toMatch(/^\d{8}$/);
    const tablet = m.appRouter.createCaller({ ...leer, ip: "192.0.2.60" });
    const anmelden = (p = pin) => tablet.richter.anmelden({ slug: s.slug, preisrichterId: pr.id, pin: p });
    await expect(anmelden()).rejects.toThrow("nur von der Einlieferung");
    await expect(anmelden("123456")).rejects.toThrow("8 Ziffern");
    await m.db.update(m.schema.schau).set({ phase: "einlieferung" }).where(m.eq(m.schema.schau.id, s.id));
    await anmelden();
    expect(await zaehleSitzungen("preisrichterId", pr.id)).toBe(1);
    await al.schau.phaseSetzen({ id: s.id, phase: "bewertung", trotzdem: true, grund: "Test: Ablauf" });
    expect(await zaehleSitzungen("preisrichterId", pr.id)).toBe(1);
    // Nach den Preisen bleibt das Tablet angemeldet: wartende Noten bekommen beim Abgleich „geschlossen“ und bleiben
    // sichtbar. Erst der Abschluss meldet ab.
    await al.schau.phaseSetzen({ id: s.id, phase: "schau", trotzdem: true, grund: "Test: Ablauf" });
    expect(await zaehleSitzungen("preisrichterId", pr.id)).toBe(1);
    await al.schau.phaseSetzen({ id: s.id, phase: "abgeschlossen", trotzdem: true, grund: "Test Abschluss" });
    expect(await zaehleSitzungen("preisrichterId", pr.id)).toBe(0);

    // Wartezeit je Preisrichter nach Fehlversuchen von fremden Geräten; die AL hebt sie auf.
    await m.db.update(m.schema.schau).set({ phase: "bewertung", abgeschlossenAm: null }).where(m.eq(m.schema.schau.id, s.id));
    for (let i = 0; i < 11; i++) await expect(m.appRouter.createCaller({ ...leer, ip: `198.18.0.${i + 1}` }).richter.anmelden({ slug: s.slug, preisrichterId: pr.id, pin: "00000000" })).rejects.toThrow();
    expect((await al.preisrichter.liste({ schauId: s.id })).richter.find((r) => r.id === pr.id)?.pinWartet).toBe(true);
    // Abgewiesene Versuche (Wartezeit) verbrauchen nicht die Grenze des Hallennetzes – sonst wäre nach 60 Versuchen
    // die ganze Halle gesperrt, auch nach dem Aufheben.
    const halle = m.appRouter.createCaller({ ...leer, ip: "198.18.0.99" });
    for (let i = 0; i < 70; i++) await expect(halle.richter.anmelden({ slug: s.slug, preisrichterId: pr.id, pin })).rejects.toThrow("Minute");
    await anmelden(); // bekanntes Tablet
    await al.preisrichter.sperreAufheben({ schauId: s.id, id: pr.id });
    // Nach dem Aufheben bleibt der Preisrichter eine Weile ohne Wartezeit, auch wenn ein Fremder weiter probiert.
    for (let i = 0; i < 12; i++) await expect(m.appRouter.createCaller({ ...leer, ip: `198.19.0.${i + 1}` }).richter.anmelden({ slug: s.slug, preisrichterId: pr.id, pin: "00000000" })).rejects.toThrow("PIN stimmt nicht");
    await halle.richter.anmelden({ slug: s.slug, preisrichterId: pr.id, pin });
  });

  test("Grenzen: ungültige Kalenderdaten und zu große Zahlen sind Eingabefehler, kein Serverfehler", async () => {
    const { al, s, meldungId } = await schauMitTieren("Grenzen Runde 4", 1);
    const istEingabefehler = async (p: Promise<unknown>) => {
      const e = await p.then(() => null, (x: { code?: string }) => x);
      expect(e?.code).toBe("BAD_REQUEST");
    };
    await istEingabefehler(al.schau.protokoll({ schauId: s.id, q: "", cursor: 3_000_000_000, limit: 10 }));
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId: s.id, name: "Grenz Richter" }).returning();
    await istEingabefehler(al.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: [{ preisrichterId: pr!.id, vonNr: 1, bisNr: 3_000_000_000 }] }));
    const leerNachweis = { datum: null, impfstoff: "", tierarzt: "" };
    await istEingabefehler(al.halle.vetSetzen({ meldungId, nd: { ...leerNachweis, datum: "2026-13-45" }, pmv: leerNachweis, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: false }));
    await istEingabefehler(al.kasse.tagesabschluss({ schauId: s.id, datum: "2026-02-30", istCent: 0 }));
    await istEingabefehler(al.preise.stiftungSpeichern({ schauId: s.id, stifter: "X", betragCent: 100, eingegangenAm: "2026-02-30" } as never));
    const daten = await al.schau.get({ id: s.id });
    await istEingabefehler(al.schau.aktualisieren({ id: s.id, daten: { ...daten, meldeschluss: "2026-02-30" } as never }));
    await istEingabefehler(al.schau.aktualisieren({ id: s.id, daten: { ...daten, katalogStart: 3_000_000_000 } as never }));
    // Öffentlich über HTTP: ungültiges Geburtsdatum → 400 statt 500.
    const r = await (await server()).fetch(
      new Request("http://test/trpc/oeffentlich.melden", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.70" },
        body: JSON.stringify({ json: { slug: s.slug, aussteller: { ...ausstellerDaten("Datum"), geburtsdatum: "2012-02-30" }, positionen: [] } }),
      }),
    );
    expect(r.status).toBe(400);
    // kaefigSetzen (Ringnummern ohne Protokoll) gibt es nicht mehr.
    expect((m.appRouter._def.procedures as Record<string, unknown>)["katalog.kaefigSetzen"]).toBeUndefined();
  });

  test("Bildvorschau mit zu großer Nummer: 404 statt Datenbankfehler; SEPA-Datei nur für die AL", async () => {
    // Geprüft werden Grenzen und Rechte, nicht die 2FA-Pflicht (echte Sitzung eines Administrators ohne 2FA).
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
    const { neueSitzung } = await import("../auth");
    const { s } = await schauMitTieren("Datei Runde 4", 1);
    const [helferKonto] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: adminKontext.benutzer!.organisationId, email: "datei-helfer@test.de", name: "Datei Helfer", passwortHash: "x", rolle: "mitarbeiter" })
      .returning();
    const alCookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
    const helferCookie = `schau_sitzung=${await neueSitzung({ benutzerId: helferKonto!.id })}`;
    const hol = async (pfad: string, cookie: string) => (await server()).fetch(new Request(`http://test${pfad}`, { headers: { cookie } }));
    expect((await hol(`/datei/${s.id}/bild/99999999999`, alCookie)).status).toBe(404);
    expect((await hol(`/datei/${s.id}/ueberweisungen.xml`, helferCookie)).status).toBe(403);
    expect((await hol(`/datei/${s.id}/ueberweisungen.xml`, alCookie)).status).toBe(400); // keine offene Datei
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Helfer sehen die IBAN nur gekürzt – das Speichern behält die hinterlegte", async () => {
    const iban = "DE89370400440532013000";
    const { al, s, meldungId } = await schauMitTieren("Iban Runde 4", 1, { iban, kontoinhaber: "" });
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const [treffer] = await helfer.meldung.ausstellerSuche({ schauId: s.id, q: "Iban Runde" });
    expect(treffer!.iban).toBe("");
    expect(treffer!.ibanVerdeckt).toBe("DE… 3000");
    expect("gesperrtAm" in treffer!).toBe(false);
    expect((await al.meldung.ausstellerSuche({ schauId: s.id, q: "Iban Runde" }))[0]!.iban).toBe(iban);
    const vorhanden = await helfer.meldung.get({ id: meldungId });
    expect(vorhanden.aussteller.iban).toBe("");
    // Helfer speichert das Formular (IBAN-Feld leer) – die IBAN bleibt.
    const { id: aid, organisationId: _o, createdAt: _c, gesperrtAm: _g, geloeschtAm: _l, ibanVerdeckt: _v, ...a } = vorhanden.aussteller;
    await helfer.meldung.speichern({
      schauId: s.id,
      meldungId,
      aussteller: { ...a, id: aid, telefon: "0661 1" },
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: vorhanden.eintraege.map((e) => ({ id: e.id, farbenschlagId: e.farbenschlagId, freitext: e.freitext, art: e.art, geschlecht: e.geschlecht, alter: e.alter, istAoc: e.istAoc, istNeuzuechtung: e.istNeuzuechtung, eigeneZucht: e.eigeneZucht, verkaufspreisCent: e.verkaufspreisCent })) as never,
    });
    const [gespeichert] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, aid));
    expect(gespeichert!.iban).toBe(iban);
    expect(gespeichert!.telefon).toBe("0661 1");
    // Abrechnung: Helfer gekürzt, AL vollständig.
    await m.db.update(m.schema.schau).set({ phase: "abrechnung" }).where(m.eq(m.schema.schau.id, s.id));
    expect((await helfer.kasse.abrechnung({ schauId: s.id }))[0]!.iban).toBe("DE… 3000");
    expect((await al.kasse.abrechnung({ schauId: s.id }))[0]!.iban).toBe(iban);
  });

  test("„fehlt“ und gleichzeitige Note: nie ein bewertetes fehlendes Tier", async () => {
    const { al, s, tiere } = await schauMitTieren("Wettlauf Runde 4", 20);
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, s.id));
    const note = (id: number) => ({ schauId: s.id, katalogeintragId: id, punkte: 93, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" });
    await Promise.allSettled(
      tiere.flatMap((t, i) => [
        new Promise((r) => setTimeout(r, i % 3)).then(() => al.halle.statusSetzen({ schauId: s.id, ids: [t.id], status: "fehlt" })),
        new Promise((r) => setTimeout(r, (i + 1) % 3)).then(() => al.bewertung.setzen(note(t.id))),
      ]),
    );
    const ids = tiere.map((t) => t.id);
    const fehlend = await m.db.select().from(m.schema.katalogeintrag).where(m.inArray(m.schema.katalogeintrag.id, ids));
    const bewertet = new Set((await m.db.select().from(m.schema.bewertung).where(m.inArray(m.schema.bewertung.katalogeintragId, ids))).map((b) => b.katalogeintragId));
    expect(fehlend.filter((e) => e.status === "fehlt" && bewertet.has(e.id))).toEqual([]);
    expect(fehlend.filter((e) => e.status === "fehlt").length + bewertet.size).toBe(20);
  });

  test("Mailversand: Wiederholung bis 2 Tage, ungültige SMTP_URL legt den Server nicht lahm, Postausgang sichtbar", async () => {
    const { naechsterVersuch } = await import("../services/post");
    const t0 = new Date("2026-11-01T10:00:00Z");
    expect(naechsterVersuch(t0, 0)!.getTime()).toBe(t0.getTime());
    expect(naechsterVersuch(t0, 1)!.getTime() - t0.getTime()).toBe(5 * 60_000);
    expect(naechsterVersuch(t0, 7)!.getTime() - t0.getTime()).toBe((5 + 10 + 20 + 40 + 80 + 160 + 320) * 60_000);
    expect(naechsterVersuch(t0, 13)!.getTime() - t0.getTime()).toBe((635 + 6 * 360) * 60_000); // dann alle 6 Stunden
    expect(naechsterVersuch(t0, 14)).toBeNull(); // über 2 Tage
    // Sonderzeichen im Passwort: früher Absturz beim Laden, jetzt Start ohne Mailversand mit Hinweis.
    const r = Bun.spawnSync(["bun", "-e", "const p = await import('./src/services/post'); console.log(JSON.stringify(p.mailStatus())); process.exit(0)"], {
      cwd: join(SRC, ".."),
      env: { ...process.env, SMTP_URL: "smtp://verein@example.de:Ab#12/x?@mail.example.de:587" },
    });
    expect(r.exitCode).toBe(0);
    const status = JSON.parse(r.stdout.toString().trim().split("\n").pop()!) as { eingerichtet: boolean; fehler: string };
    expect(status.eingerichtet).toBe(false);
    expect(status.fehler).toContain("URL-kodieren");
    const al = m.appRouter.createCaller(adminKontext);
    const p = await al.schau.postausgang();
    expect(p.eingerichtet).toBe(false);
    const [mail] = await m.db.insert(m.schema.postausgang).values({ organisationId: adminKontext.benutzer!.organisationId, an: "x@test.de", betreff: "Test", text: "Test", status: "fehler", fehler: "Verbindung abgelehnt", versuche: 3 }).returning();
    expect((await al.schau.postausgang()).mails[0]!.id).toBe(mail!.id); // nicht versandte zuerst
    await expect(al.schau.postErneutSenden({ id: mail!.id })).rejects.toThrow("nicht eingerichtet");
  });

  test("Bestätigungsmail: höchstens 5 je Meldung und Tag", async () => {
    const { al, meldungId } = await schauMitTieren("Mailbremse Runde 4", 1, { email: "bremse@test.de" });
    for (let i = 0; i < 5; i++) await al.meldung.bestaetigungSenden({ id: meldungId });
    await expect(al.meldung.bestaetigungSenden({ id: meldungId })).rejects.toThrow("mehrmals");
  });

  test("Bilder: großes PNG mit Transparenz abgewiesen, JPEG-Abmessungen erkannt", async () => {
    const { bildMasse } = await import("../routers/katalog-gestaltung");
    const png = (breite: number, hoehe: number, farbtyp: number) => {
      const b = Buffer.alloc(45);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
      b.writeUInt32BE(13, 8);
      b.write("IHDR", 12, "latin1");
      b.writeUInt32BE(breite, 16);
      b.writeUInt32BE(hoehe, 20);
      b[24] = 8;
      b[25] = farbtyp;
      b.writeUInt32BE(0, 33);
      b.write("IDAT", 37, "latin1");
      return b;
    };
    expect(bildMasse(png(3000, 2000, 6))).toEqual({ breite: 3000, hoehe: 2000, entpacken: true });
    expect(bildMasse(png(3000, 2000, 2))).toEqual({ breite: 3000, hoehe: 2000, entpacken: false });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0xd0, 0x0b, 0xb8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(bildMasse(jpeg)).toEqual({ breite: 3000, hoehe: 2000, entpacken: false });
    const { s } = await schauMitTieren("Bild Runde 4", 1);
    const al = m.appRouter.createCaller(adminKontext);
    await expect(al.katalogGestaltung.bildHochladen({ schauId: s.id, rolle: "beitrag", name: "anzeige.png", base64: png(3000, 2000, 6).toString("base64") })).rejects.toThrow("durchsichtigem Hintergrund");
  });

  test("Öffentlicher Katalog: bei Änderungen höchstens alle 10 Minuten neu, Datenschutz sofort", async () => {
    const { s } = await schauMitTieren("Katalog Cache Runde 4", 1);
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true, phase: "schau" }).where(m.eq(m.schema.schau.id, s.id));
    const hol = async () => Buffer.from(await (await (await server()).fetch(new Request(`http://test/s/${s.slug}/katalog.pdf`, { headers: { "x-forwarded-for": "192.0.2.80" } }))).arrayBuffer());
    const { protokolliere } = await import("../services/protokoll");
    const eins = await hol();
    await Bun.sleep(1100); // anderes Erstellungsdatum, falls neu erzeugt würde
    await protokolliere(m.db, { schauId: s.id, tabelle: "bewertung", datensatzId: 1, aktion: "Test", akteur: { text: "Test" } });
    expect((await hol()).equals(eins)).toBe(true);
    await protokolliere(m.db, { schauId: s.id, tabelle: "meldung", datensatzId: 1, aktion: "Online-Veröffentlichung widerrufen", akteur: { text: "Test" } });
    const zwei = await hol();
    expect(zwei.equals(eins)).toBe(false);
    // Änderungen ohne Protokolleintrag (Gestaltung) erneuern ihn ebenfalls sofort.
    await Bun.sleep(1100);
    await m.appRouter.createCaller(adminKontext).katalogGestaltung.speichern({ schauId: s.id, daten: { format: "A5", untertitel: "Neu", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a" } });
    expect((await hol()).equals(zwei)).toBe(false);
  });

  test("Regression: einziger Obmann – eine am PC nachgetragene Note seines Tiers bestätigt ein anderer Preisrichter", async () => {
    const { al, s, tiere } = await schauMitTieren("Ein Obmann Runde 4", 1);
    const x = await al.preisrichter.speichern({ schauId: s.id, name: "Einziger Obmann", anschrift: "", email: "", telefon: "", istObmann: true });
    const y = await al.preisrichter.speichern({ schauId: s.id, name: "Zweiter Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    await al.preisrichter.einteilungSetzen({ schauId: s.id, einteilung: [{ preisrichterId: x.id, vonNr: 1, bisNr: 1 }] });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, s.id));
    const t = tiere[0]!;
    await al.bewertung.setzen({ schauId: s.id, katalogeintragId: t.id, punkte: 97, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "", basisVersion: 0 });
    await expect(al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t.id, obmannId: x.id })).rejects.toThrow("eigene Bewertung");
    await al.bewertung.obmannBestaetigen({ schauId: s.id, katalogeintragId: t.id, obmannId: y.id });
    const [b] = await m.db.select().from(m.schema.bewertung).where(m.eq(m.schema.bewertung.katalogeintragId, t.id));
    expect(b!.obmannBestaetigtVon).toBe(y.id);
  });

  test("Regression: abgeschlossene Schau – kein Storno, kein Preis, keine Stiftung mehr", async () => {
    const { al, s } = await schauMitTieren("Abschluss Runde 4", 1);
    const st = { schauId: s.id, stifter: "Firma Muster", preisartId: null, anzahl: 1, betragCent: 1000, vorgabe: "", eingegangenAm: null };
    await al.preise.stiftungSpeichern(st);
    const [stiftung] = await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.schauId, s.id));
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, s.id));
    await expect(al.preise.stiftungSpeichern(st)).rejects.toThrow("abgeschlossen");
    await expect(al.preise.stiftungLoeschen({ schauId: s.id, id: stiftung!.id })).rejects.toThrow("abgeschlossen");
    await expect(al.kasse.stornieren({ schauId: s.id, verkaufId: 999_999, grund: "Test" })).rejects.toThrow("abgeschlossen");
    await expect(al.kasse.auszahlungStornieren({ schauId: s.id, id: 999_999, grund: "Test" })).rejects.toThrow("abgeschlossen");
    await expect(al.preise.vergeben({ schauId: s.id, katalogeintragId: 999_999, preisartId: 999_999 })).rejects.toThrow("abgeschlossen");
  });

  test("Regression: Stiftungsdeckung nur für Stiftungspreise und mit „je Preisrichter“; Reklamation auch beim Vergeben", async () => {
    const { al, s, tiere } = await schauMitTieren("Stiftung Runde 4", 2);
    const { checkliste } = await import("../services/pruefung");
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId: s.id, name: "Stift Richter" }).returning();
    const [e, band] = await m.db
      .insert(m.schema.preisart)
      .values([
        { schauId: s.id, kuerzel: "E", name: "Ehrenpreis", betragCent: 0, quelle: "standgeld" as const, folge: 1 },
        { schauId: s.id, kuerzel: "B", name: "Band", betragCent: 0, quelle: "stiftung" as const, anzahlProPreisrichter: 1, folge: 2 },
      ])
      .returning();
    await m.db.insert(m.schema.preisvergabe).values([
      { katalogeintragId: tiere[0]!.id, preisartId: e!.id, preisrichterId: pr!.id, betragCent: 0 },
      { katalogeintragId: tiere[1]!.id, preisartId: band!.id, preisrichterId: pr!.id, betragCent: 0 },
    ]);
    // Versehentlich einer Standgeld-Preisart zugeordnete Stiftung: lässt sich löschen.
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Falsch zugeordnet", preisartId: e!.id, anzahl: 1, betragCent: 0, vorgabe: "", eingegangenAm: null });
    const [falsch] = await m.db.select().from(m.schema.stiftung).where(m.eq(m.schema.stiftung.stifter, "Falsch zugeordnet"));
    await al.preise.stiftungLoeschen({ schauId: s.id, id: falsch!.id });
    // Band: 1 je Preisrichter deckt die eine Vergabe auch ohne Stiftung – keine Fehlermeldung in der Prüfliste.
    await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, s.id));
    expect((await checkliste(s.id)).filter((p) => p.text.includes("Stiftungspreis"))).toEqual([]);

    // Vergeben nach der Abrechnung: nur als Reklamation der AL mit Grund.
    const [geld] = await m.db.insert(m.schema.preisart).values({ schauId: s.id, kuerzel: "G", name: "Geldstiftung", betragCent: 500, quelle: "stiftung" as const, folge: 3 }).returning();
    await al.preise.stiftungSpeichern({ schauId: s.id, stifter: "Geldgeber", preisartId: geld!.id, anzahl: 1, betragCent: 500, vorgabe: "", eingegangenAm: null });
    await m.db.insert(m.schema.bewertung).values({ katalogeintragId: tiere[1]!.id, punkte: 95 }).onConflictDoNothing();
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, s.id));
    await m.db.insert(m.schema.auszahlung).values({ schauId: s.id, ausstellerId: mel!.ausstellerId, betragCent: 0, art: "bar", quittungNr: 1 });
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    // Helfer vergeben am PC gar keine Preise (nur Ausstellungsleitung und Preisrichter).
    await expect(helfer.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[1]!.id, preisartId: geld!.id })).rejects.toThrow("Administratoren");
    await expect(al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[1]!.id, preisartId: geld!.id })).rejects.toThrow("Reklamation");
    await al.preise.vergeben({ schauId: s.id, katalogeintragId: tiere[1]!.id, preisartId: geld!.id, grund: "Preis versehentlich entzogen" });
  });

  test("Regression: Helfer verkaufen nicht auf Überweisung und sehen in der SEPA-Datei keine IBAN", async () => {
    const { s } = await schauMitTieren("Helferkasse Runde 4", 1);
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const al = m.appRouter.createCaller(adminKontext);
    await expect(
      helfer.kasse.verkaufen({ schauId: s.id, katalogeintragId: 1, kaeuferName: "Käufer", kaeuferAnschrift: "", kaeuferRegistriernummer: "276065350099", kaeuferAlter: "ab16", zahlart: "ueberweisung" }),
    ).rejects.toThrow("nur durch die Ausstellungsleitung");
    const iban = "DE89370400440532013000";
    await m.db.insert(m.schema.sepaLauf).values({ schauId: s.id, nachrichtId: `R4-${s.id}`, daten: { nachrichtId: `R4-${s.id}`, summeCent: 100, posten: [{ ausstellerId: 1, name: "X", kontoinhaber: "X", iban, betragCent: 100 }] } });
    expect((await helfer.kasse.ueberweisungsdatei({ schauId: s.id }))!.posten[0]!.iban).toBe("DE… 3000");
    expect((await al.kasse.ueberweisungsdatei({ schauId: s.id }))!.posten[0]!.iban).toBe(iban);
  });

  test("Regression: ein früher übersprungener Kassentag blockiert den Tagesabschluss nicht", async () => {
    const { al, s } = await schauMitTieren("Kassentage Runde 4", 1);
    const tag = (n: number) => new Date(Date.now() - n * 86_400_000);
    const datum = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
    await m.db.insert(m.schema.kassenbewegung).values([
      { schauId: s.id, art: "anfangsbestand" as const, betragCent: 10_000, createdAt: tag(3) },
      { schauId: s.id, art: "einlage" as const, betragCent: 500, createdAt: tag(2) },
    ]);
    // Alter Bestand: Tag -2 abgeschlossen, Tag -3 nie (früher erlaubt).
    await m.db.insert(m.schema.kassenabschluss).values({ schauId: s.id, datum: datum(tag(2)), sollCent: 10_500, istCent: 10_500, differenzCent: 0 });
    const k = await al.kasse.kassenbuch({ schauId: s.id });
    expect(k.vorschlag).toBe(k.heute);
    await al.kasse.tagesabschluss({ schauId: s.id, istCent: k.sollCent });
  });

  test("Kettenkopf: das heimliche Löschen des jüngsten Protokolleintrags fällt auf, Stand steht auf dem Kassenbericht", async () => {
    const { s } = await schauMitTieren("Kettenkopf Runde 4", 1);
    const al = m.appRouter.createCaller(adminKontext);
    const vorher = await al.schau.protokollPruefen({ schauId: s.id });
    expect(vorher.fehler).toEqual([]);
    expect(vorher.kopf.id).not.toBeNull();
    const { kassenberichtPdf } = await import("../pdf/dokumente");
    const [schauZeile] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, s.id));
    expect(pdfText(await kassenberichtPdf(schauZeile!))).toContain(`Nr. ${vorher.kopf.id}, Prüfwert ${vorher.kopf.pruefwert}`);
    // Jüngsten Eintrag an allen Schutz-Triggern vorbei löschen (wie mit direktem Datenbankzugriff) …
    const [zeile] = await m.sql`select row_to_json(a) as z from aenderung a where id = ${vorher.kopf.id!}`;
    await m.sql.begin(async (tx) => {
      await tx`alter table aenderung disable trigger user`;
      await tx`delete from aenderung where id = ${vorher.kopf.id!}`;
      await tx`alter table aenderung enable trigger user`;
    });
    const nachher = await al.schau.protokollPruefen({ schauId: s.id });
    expect(nachher.fehler.map((f) => f.grund)).toContain("jüngster Eintrag fehlt (gelöscht)");
    // … und für die folgenden Tests wieder herstellen.
    await m.sql.begin(async (tx) => {
      await tx`alter table aenderung disable trigger user`;
      await tx`insert into aenderung select * from json_populate_record(null::aenderung, ${JSON.stringify(zeile!.z)}::json)`;
      await tx`alter table aenderung enable trigger user`;
    });
    expect((await al.schau.protokollPruefen({ schauId: s.id })).fehler).toEqual([]);
  });
});

describe("Nachbesserung Runde 4: Größengrenzen erst nach geprüfter Sitzung", () => {
  const server = async () => (await import("../index")).default;
  const post = async (pfad: string, rumpf: string, cookie = "") =>
    (await server()).fetch(new Request(`http://test/trpc/${pfad}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: rumpf }));
  const text = (kb: number) => JSON.stringify({ json: { x: "x".repeat(kb * 1024) } });
  const bild = "katalogGestaltung.bildHochladen";
  const sitzung = async (id: number) => {
    const { COOKIE, neueSitzung } = await import("../auth");
    return `${COOKIE}=${await neueSitzung({ benutzerId: id })}`;
  };
  let helferId = 0;

  test("Erfundene Cookies bringen nichts: Grenze wie ohne Anmeldung, auch bei den großen Aufrufen", async () => {
    const { COOKIE, COOKIE_RICHTER } = await import("../auth");
    for (const cookie of [`${COOKIE}=erfunden`, `${COOKIE_RICHTER}=erfunden`]) {
      // Abgewiesen, ohne den Rumpf zu lesen; 401 wie bei einer abgelaufenen Anmeldung (das Tablet bietet dann „neu anmelden“).
      const r = await post("meldung.speichern", text(300), cookie);
      expect(r.status).toBe(401);
      expect(((await r.json()) as { error: { json: { data: { code: string } } } }).error.json.data.code).toBe("UNAUTHORIZED");
      expect((await post(bild, text(2048), cookie)).status).toBe(401);
    }
  });

  test("Was die Längenangabe schon verrät, wird ohne Datenbank abgewiesen", async () => {
    const { COOKIE } = await import("../auth");
    const mit = async (pfad: string, laenge: number, cookie = "") =>
      (await server()).fetch(new Request(`http://test/trpc/${pfad}`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(laenge), ...(cookie ? { cookie } : {}) }, body: "{}" }));
    expect((await mit("oeffentlich.melden", 300 * 1024)).status).toBe(413);
    expect((await mit("meldung.speichern", 2 * 1024 * 1024, `${COOKIE}=erfunden`)).status).toBe(413);
    expect((await mit(bild, 13 * 1024 * 1024, `${COOKIE}=erfunden`)).status).toBe(413);
  });

  test("Helfer 1 MB, 12 MB nur Administratoren und nur für Bild und Import", async () => {
    // Geprüft werden Grenzen und Rechte, nicht die 2FA-Pflicht (echte Sitzung eines Administrators ohne 2FA).
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
    const al = m.appRouter.createCaller(adminKontext);
    await al.auth.benutzerAnlegen({ name: "Grenzen Helfer", email: "grenzen-helfer@test.de", passwort: "sehr-geheim-123", rolle: "mitarbeiter" });
    const [h] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "grenzen-helfer@test.de"));
    helferId = h!.id;
    const helfer = await sitzung(helferId);
    const admin = await sitzung(adminKontext.benutzer!.id);
    expect((await post("meldung.speichern", text(300), helfer)).status).not.toBe(413);
    expect((await post("meldung.speichern", text(1100), helfer)).status).toBe(413);
    expect((await post(bild, text(2048), helfer)).status).toBe(413);
    expect((await post(bild, text(2048), admin)).status).not.toBe(413);
    expect((await post("stammdaten.importieren", text(2048), admin)).status).not.toBe(413);
    expect((await post("meldung.speichern", text(2048), admin)).status).toBe(413);
    expect((await post(`${bild},auth.status?batch=1`, text(2048), admin)).status).toBe(413);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Abgelaufene Sitzung und gesperrtes Konto zählen nicht als angemeldet", async () => {
    const helfer = await sitzung(helferId);
    await m.db.update(m.schema.benutzer).set({ aktiv: false }).where(m.eq(m.schema.benutzer.id, helferId));
    expect((await post("meldung.speichern", text(300), helfer)).status).toBe(401);
    await m.db.update(m.schema.benutzer).set({ aktiv: true }).where(m.eq(m.schema.benutzer.id, helferId));
  });

  test("Ohne Längenangabe gilt dieselbe Grenze", async () => {
    const { COOKIE } = await import("../auth");
    const stueck = new TextEncoder().encode("x".repeat(64 * 1024));
    const body = new ReadableStream({ start(k) { for (let i = 0; i < 5; i++) k.enqueue(stueck); k.close(); } });
    const r = await (await server()).fetch(new Request("http://test/trpc/meldung.speichern", { method: "POST", headers: { "content-type": "application/json", cookie: `${COOKIE}=erfunden` }, body, duplex: "half" } as RequestInit));
    expect(r.status).toBe(401);
    const ohneCookie = new ReadableStream({ start(k) { for (let i = 0; i < 5; i++) k.enqueue(stueck); k.close(); } });
    const r2 = await (await server()).fetch(new Request("http://test/trpc/oeffentlich.melden", { method: "POST", headers: { "content-type": "application/json" }, body: ohneCookie, duplex: "half" } as RequestInit));
    expect(r2.status).toBe(413);
  });

  test("Tiefe Verschachtelung wird vor dem Parsen abgewiesen, auch in den Metadaten und bei GET", async () => {
    const { strukturZuGross } = await import("../trpc");
    expect(strukturZuGross("[".repeat(33))).toBe(true);
    expect(strukturZuGross(`${"[".repeat(32)}${"]".repeat(32)}`)).toBe(false);
    // Geschlossene Klammern zählen nicht weiter: viele flache Einträge sind keine Tiefe.
    expect(strukturZuGross(`[${"[],".repeat(1000)}[]]`)).toBe(false);
    const flut = `{"json":{"a":1},"meta":{"values":${'{"a":'.repeat(14_000)}["undefined"]${"}".repeat(14_000)}}}`;
    const vorher = process.memoryUsage().rss;
    const r = await post("auth.anmelden", flut);
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("zu umfangreich");
    expect(process.memoryUsage().rss - vorher).toBeLessThan(100 * 1024 * 1024);
    const get = await (await server()).fetch(new Request(`http://test/trpc/oeffentlich.schau?input=${encodeURIComponent(`{"json":{"slug":"x"},"meta":{"values":${'{"a":'.repeat(100)}["undefined"]${"}".repeat(100)}}}`)}`));
    expect(await get.text()).toContain("zu umfangreich");
  });

  test("Zu viele Strukturzeichen werden vor dem Parsen abgewiesen, Text in Zeichenketten zählt nicht", async () => {
    const { strukturZuGross } = await import("../trpc");
    expect(strukturZuGross(`[${"{},".repeat(70_000)}{}]`)).toBe(true);
    expect(strukturZuGross(JSON.stringify({ csv: ",".repeat(200_000) }))).toBe(false);
    expect(strukturZuGross(JSON.stringify({ csv: `"${"[".repeat(200_000)}` }))).toBe(false);
    expect(strukturZuGross(`{"a":"\\\\",${"{}".repeat(10)}`, 5)).toBe(true);
    const r = await post("oeffentlich.melden", `{"json":[${"{},".repeat(70_000)}{}]}`);
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("zu umfangreich");
    // Ein großer Text in einer Zeichenkette (Bild, CSV) bleibt erlaubt.
    expect(await (await post(bild, JSON.stringify({ json: { base64: ",".repeat(100_000) } }), await sitzung(adminKontext.benutzer!.id))).text()).not.toContain("zu umfangreich");
  });
});

describe("Audit Runde 5: superjson-Metadaten", () => {
  const server = async () => (await import("../index")).default;
  const post = async (pfad: string, rumpf: string) => (await server()).fetch(new Request(`http://test/trpc/${pfad}`, { method: "POST", headers: { "content-type": "application/json" }, body: rumpf }));

  test("Binärfelder und andere Klassen in den Metadaten werden abgewiesen, bevor etwas erzeugt wird", async () => {
    const vorher = process.memoryUsage().rss;
    const r = await post("auth.abmelden", '{"json":12000000,"meta":{"values":[["typed-array","Uint8Array"]]}}');
    expect(r.status).toBe(400);
    expect(process.memoryUsage().rss - vorher).toBeLessThan(50 * 1024 * 1024);
    const get = await (await server()).fetch(new Request(`http://test/trpc/auth.status?input=${encodeURIComponent('{"json":12000000,"meta":{"values":[["typed-array","Uint8Array"]]}}')}`));
    expect(get.status).toBe(400);
    const { pruefeMeta, pruefeUmfang } = await import("../trpc");
    for (const typ of ["bigint", "set", "map", "regexp", "Error", "URL", "number"]) expect(() => pruefeMeta({ values: { a: [typ] } })).toThrow();
    expect(() => pruefeMeta({ values: [["custom", "x"]] })).toThrow();
    expect(() => pruefeMeta({ values: { ["a".repeat(121)]: ["Date"] } })).toThrow();
    expect(() => pruefeMeta({ referentialEqualities: { a: ["b".repeat(5000)] } })).toThrow();
    expect(() => pruefeUmfang(new Uint8Array(10))).toThrow();
    expect(() => pruefeUmfang({ a: new Map() })).toThrow();
  });

  test("Datumswerte, undefined und Verweise der Oberfläche gehen weiter durch", async () => {
    const { pruefeMeta } = await import("../trpc");
    const superjson = (await import("superjson")).default;
    const gleich = { x: 1 };
    const s = superjson.serialize({ bewertungen: Array.from({ length: 2000 }, (_, i) => ({ id: i, geraetZeit: new Date(), leer: undefined })), a: gleich, b: gleich });
    expect(() => pruefeMeta(s.meta)).not.toThrow();
    const r = await post("auth.status", JSON.stringify(superjson.serialize({ wann: new Date(), nichts: undefined })));
    expect(r.status).not.toBe(400);
  });
});

describe("Nachbesserung Runde 4: Öffentlicher Katalog aus der Datei", () => {
  test("Der Katalog kommt aus einer Datei; fehlt sie, wird er neu erzeugt", async () => {
    const { readdirSync } = await import("node:fs");
    const server = (await import("../index")).default;
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name: "Katalog aus Datei", ort: "Halle" });
    const s = await al.schau.get({ id });
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, id));
    const holen = () => server.fetch(new Request(`http://test/s/${s.slug}/katalog.pdf`));
    const r = await holen();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const inhalt = new Uint8Array(await r.arrayBuffer());
    expect(new TextDecoder().decode(inhalt.slice(0, 4))).toBe("%PDF");
    const verzeichnis = join(tmpdir(), `schau-katalog-${config.port}`);
    const dateien = readdirSync(verzeichnis);
    expect(dateien.length).toBeGreaterThan(0);
    expect(new Uint8Array(await (await holen()).arrayBuffer())).toEqual(inhalt);
    for (const d of readdirSync(verzeichnis)) rmSync(join(verzeichnis, d), { force: true });
    expect((await holen()).status).toBe(503);
    expect((await holen()).status).toBe(200);
    // Gleichzeitige Abrufe nach einer Änderung teilen sich eine neue Datei.
    const eigene = () => readdirSync(verzeichnis).filter((d) => d.startsWith(`${id}-`)).length;
    const vorher = eigene();
    const { protokolliere } = await import("../services/protokoll");
    await m.db.transaction((tx) => protokolliere(tx, { schauId: id, tabelle: "meldung", datensatzId: 1, aktion: "Online-Veröffentlichung widerrufen", akteur: { text: "Test" } }));
    const antworten = await Promise.all(Array.from({ length: 10 }, holen));
    expect(antworten.every((a) => a.status === 200)).toBe(true);
    expect(eigene()).toBe(vorher + 1);
  });
});
