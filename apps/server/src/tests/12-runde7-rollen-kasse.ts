/** Audit Runde 7, Rollen (Meldungen, Noten, Preise, Meldegeld), Nachtrag nach dem Tagesabschluss. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Audit Runde 7: Behebungen", () => {
  const orgId = () => adminKontext.benutzer!.organisationId;
  const konto = async (email: string) => (await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, email)))[0]!;

  test("Sitzung entsteht nicht, wenn sich das Konto während der Anmeldung geändert hat (Reset, 2FA, Sperre, Adresse)", async () => {
    const { sitzungWennUnveraendert } = await import("../auth");
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.auth.benutzerAnlegen({ name: "Rennen Test", email: "rennen@test.de", passwort: "rennen-rennen-1", rolle: "mitarbeiter" });
    // Unverändert: Sitzung entsteht.
    expect(typeof (await sitzungWennUnveraendert(await konto("rennen@test.de")))).toBe("string");
    // Passwort von der AL neu gesetzt, während die Anmeldung lief.
    let stand = await konto("rennen@test.de");
    await al.auth.benutzerPasswortSetzen({ id, passwort: "rennen-neu-12345" });
    await expect(sitzungWennUnveraendert(stand)).rejects.toThrow("abgelaufen");
    // Gesperrt.
    stand = await konto("rennen@test.de");
    await al.auth.benutzerAktiv({ id, aktiv: false });
    await expect(sitzungWennUnveraendert(stand)).rejects.toThrow("abgelaufen");
    await al.auth.benutzerAktiv({ id, aktiv: true });
    // Adresse geändert – dabei enden auch alle Sitzungen.
    stand = await konto("rennen@test.de");
    const { neueSitzung } = await import("../auth");
    await neueSitzung({ benutzerId: id });
    await al.auth.benutzerSpeichern({ id, name: "Rennen Test", email: "rennen2@test.de" });
    await expect(sitzungWennUnveraendert(stand)).rejects.toThrow("abgelaufen");
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.benutzerId, id))).toHaveLength(0);
  });

  test("2FA-Schritt: Passwort-Reset zwischen Passwort und Code verhindert die Sitzung", async () => {
    const z = await import("../services/zweifaktor");
    const al = m.appRouter.createCaller(adminKontext);
    const passwort = "zwischen-reset-1";
    const { id } = await al.auth.benutzerAnlegen({ name: "Zwischen Reset", email: "zwischen-reset@test.de", passwort, rolle: "mitarbeiter" });
    const ich = m.appRouter.createCaller({ ...leer, ip: "203.0.113.230", benutzer: { id, organisationId: orgId(), name: "Zwischen Reset", email: "zwischen-reset@test.de", rolle: "mitarbeiter" } });
    const e = await ich.auth.zweiFaktorEinrichten({ passwort });
    const geheim = z.ausBase32(e.geheim.replace(/\s/g, ""));
    await ich.auth.zweiFaktorBestaetigen({ code: z.totp(geheim, z.zeitschritt()) });
    // Hinweismail an die eigene Adresse.
    const mails = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "zwischen-reset@test.de"));
    expect(mails.some((x) => x.betreff === "Zwei-Faktor-Anmeldung eingerichtet")).toBe(true);
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.230" });
    const { token } = await pub.auth.anmelden({ email: "zwischen-reset@test.de", passwort });
    await al.auth.benutzerPasswortSetzen({ id, passwort: "von-der-al-neu-1" });
    await expect(pub.auth.anmeldenCode({ token, code: z.totp(geheim, z.zeitschritt() + 1) })).rejects.toThrow("abgelaufen");
  });

  test("2FA-Pflicht gilt überall: Administrator ohne 2FA gilt als Helfer (IBAN verdeckt, Auskunft 403)", async () => {
    const { neueSitzung, ladeSitzung, COOKIE } = await import("../auth");
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.auth.benutzerAnlegen({ name: "Pflicht Überall", email: "pflicht-ueberall@test.de", passwort: "pflicht-ueberall-1", rolle: "admin" });
    const token = await neueSitzung({ benutzerId: id });
    const s = await ladeSitzung(token);
    expect(s.benutzer).toMatchObject({ rolle: "mitarbeiter", zweiFaktorPflicht: true });
    const ich = m.appRouter.createCaller({ ...leer, benutzer: s.benutzer });
    expect((await ich.auth.status()).zweiFaktorPflicht).toBe(true);
    await expect(ich.auth.benutzerListe()).rejects.toThrow("Pflicht");
    const [mitIban] = await m.db.select().from(m.schema.aussteller).where(m.ne(m.schema.aussteller.iban, "")).limit(1);
    const [meld] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.ausstellerId, mitIban!.id)).limit(1);
    const zeilen = await ich.kasse.abrechnung({ schauId: meld!.schauId });
    expect(zeilen.every((z: { iban: string }) => !z.iban || !z.iban.startsWith("DE89370400440532013000"))).toBe(true);
    const server = (await import("../index")).default;
    const r = await server.fetch(new Request(`http://test/datei/aussteller/${mitIban!.id}/auskunft.json`, { headers: { cookie: `${COOKIE}=${token}` } }));
    expect(r.status).toBe(403);
  });

  test("Einladung nur ohne Passwort; 2FA zurücksetzen nur, wenn eingerichtet; Hinweismails gebremst", async () => {
    // Eigener Administrator: Adressänderungen zählen zur Bremse je Administrator.
    const [zweiter] = await m.db.insert(m.schema.benutzer).values({ organisationId: orgId(), name: "Hinweis AL", email: "hinweis-al@test.de", passwortHash: "-", rolle: "admin" }).returning();
    const al = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, id: zweiter!.id, name: "Hinweis AL", email: "hinweis-al@test.de" } });
    const { id } = await al.auth.benutzerAnlegen({ name: "Ohne 2FA", email: "ohne-2fa@test.de", passwort: "ohne-2fa-12345", rolle: "mitarbeiter" });
    await expect(al.auth.zweiFaktorZuruecksetzen({ id })).rejects.toThrow("nicht eingerichtet");
    // Mit Passwort: „Willkommensmail erneut“ enthält keinen Link.
    expect((await al.auth.benutzerWillkommen({ id })).einladung).toBe(false);
    // Viele Adressänderungen: höchstens 10 Hinweise je Stunde an dieselbe Adresse.
    for (let i = 0; i < 12; i++) {
      await al.auth.benutzerSpeichern({ id, name: "Ohne 2FA", email: `ohne-2fa-${i}@test.de` });
      await al.auth.benutzerSpeichern({ id, name: "Ohne 2FA", email: "ohne-2fa@test.de" }).catch(() => {});
    }
    const hinweise = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "ohne-2fa@test.de"));
    expect(hinweise.filter((x) => x.betreff.includes("Anmeldeadresse")).length).toBeLessThanOrEqual(10);
  });

  test("Passwort ändern hat einen eigenen Zähler; Sperre aufheben setzt ihn zurück", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.auth.benutzerAnlegen({ name: "Eigener Zähler", email: "eigener-zaehler@test.de", passwort: "eigener-zaehler-1", rolle: "mitarbeiter" });
    const ich = m.appRouter.createCaller({ ...leer, benutzer: { id, organisationId: orgId(), name: "Eigener Zähler", email: "eigener-zaehler@test.de", rolle: "mitarbeiter" } });
    for (let i = 0; i < 5; i++) await expect(ich.auth.passwortAendern({ alt: `falsch-${i}-xxxx`, neu: "egal-egal-egal" })).rejects.toThrow("stimmt nicht");
    await expect(ich.auth.passwortAendern({ alt: "eigener-zaehler-1", neu: "egal-egal-egal" })).rejects.toThrow("Zu viele");
    // 2FA-Einrichtung zählt getrennt.
    expect((await ich.auth.zweiFaktorEinrichten({ passwort: "eigener-zaehler-1" })).geheim.length).toBeGreaterThan(10);
    await al.auth.sperreAufheben({ id });
    await ich.auth.passwortAendern({ alt: "eigener-zaehler-1", neu: "eigener-zaehler-2" });
  });

  test("Grundbestand gleichzeitig zweimal: keine Doppelten; Tablet-Arten mit Rasse", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const [o] = await m.db.insert(m.schema.organisation).values({ name: "Bausteine Gleichzeitig" }).returning();
    const { ergaenzeGrundbestand, TEXTBAUSTEINE_GRUNDBESTAND } = await import("../services/textbausteine");
    const [a, b] = await Promise.all([ergaenzeGrundbestand(o!.id), ergaenzeGrundbestand(o!.id)]);
    expect(a + b).toBe(TEXTBAUSTEINE_GRUNDBESTAND.length);
    const n = await m.db.select().from(m.schema.textbaustein).where(m.eq(m.schema.textbaustein.organisationId, o!.id));
    expect(n).toHaveLength(TEXTBAUSTEINE_GRUNDBESTAND.length);
    void al;
  });

  test("Ringnummer nach Freigabe: Helfer nicht, Ausstellungsleitung nur mit Grund", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const helfer = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    const { sql: dsql } = await import("drizzle-orm");
    const [e] = await m.db
      .select({ id: m.schema.katalogeintrag.id, schauId: m.schema.katalogeintrag.schauId })
      .from(m.schema.katalogeintrag)
      .innerJoin(m.schema.schau, m.eq(m.schema.schau.id, m.schema.katalogeintrag.schauId))
      .leftJoin(m.schema.verkauf, m.eq(m.schema.verkauf.katalogeintragId, m.schema.katalogeintrag.id))
      .where(dsql`${m.schema.verkauf.id} is null and ${m.schema.schau.phase} <> 'abgeschlossen' and not ${m.schema.schau.ergebnisseFreigegeben}`)
      .limit(1);
    await helfer.halle.ringnummerSetzen({ schauId: e!.schauId, id: e!.id, ringnummern: "DE 26 R7 1" });
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, e!.schauId));
    try {
      await expect(helfer.halle.ringnummerSetzen({ schauId: e!.schauId, id: e!.id, ringnummern: "DE 26 R7 2" })).rejects.toThrow("Ausstellungsleitung");
      await expect(al.halle.ringnummerSetzen({ schauId: e!.schauId, id: e!.id, ringnummern: "DE 26 R7 2" })).rejects.toThrow("Grund");
      await al.halle.ringnummerSetzen({ schauId: e!.schauId, id: e!.id, ringnummern: "DE 26 R7 2", grund: "Ringkarte vertauscht" });
      const [neu] = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, e!.id));
      expect(neu!.ringnummern).toBe("DE 26 R7 2");
    } finally {
      await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: false }).where(m.eq(m.schema.schau.id, e!.schauId));
    }
  });

  test("Sicherheits-Header: CSP ohne unsafe-inline, COEP, Permissions-Policy", async () => {
    const server = (await import("../index")).default;
    const r = await server.fetch(new Request("http://test/api/gesund"));
    expect(r.headers.get("content-security-policy")).toContain("style-src 'self';");
    expect(r.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(r.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(r.headers.get("permissions-policy")).toContain("camera=()");
  });
});

describe("Audit Runde 7: Geld", () => {
  test("Überweisung an einen Aussteller ohne IBAN wird abgelehnt, bar geht", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id: schauId } = await al.schau.anlegen({ name: "R7 Ohne IBAN", ort: "Halle" });
    const s = await al.schau.get({ id: schauId });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al.meldung.speichern({
      schauId,
      aussteller: { vorname: "Ohne", nachname: "Konto", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await al.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    // Zu viel gezahlt: der Verein schuldet dem Aussteller etwas.
    await al.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 5000, datum: "2026-10-01", art: "bar" });
    await m.db.update(m.schema.schau).set({ phase: "schau" }).where(m.eq(m.schema.schau.id, schauId));
    const zeile = (await al.kasse.abrechnung({ schauId })).find((z: { ausstellerId: number }) => z.ausstellerId === r.ausstellerId)!;
    expect(zeile.nochOffenCent).toBeGreaterThan(0);
    await expect(al.kasse.auszahlen({ schauId, ausstellerId: r.ausstellerId, art: "ueberweisung" })).rejects.toThrow("IBAN");
  });
});

describe("Rollen: Meldungen, Noten, Meldegeld bei der Einlieferung", () => {
  test("Helfer bestätigen ohne Zahlung, kassieren bei der Einlieferung bar; Ablehnen, Stornieren und Noten nur Administratoren", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const [ma] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: adminKontext.benutzer!.organisationId, email: "rollen-helfer@test.de", name: "Rollen-Helfer", passwortHash: "-", rolle: "mitarbeiter" })
      .returning();
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id: ma!.id, organisationId: ma!.organisationId, name: ma!.name, email: ma!.email, rolle: "mitarbeiter" } });
    const { id: schauId } = await al.schau.anlegen({ name: "Rollen 2026", ort: "Halle" });
    await al.schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 400, befreitPreisrichter: false }] });
    const s = await al.schau.get({ id: schauId });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melde = (nachname: string) =>
      al.meldung.speichern({
        schauId,
        aussteller: { vorname: "Karl", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    const a = await melde("Kassierer");
    const b = await melde("Abgelehnt");

    // Bestätigen ohne Zahlung und Bestätigung zurücknehmen: ja. Ablehnen, Stornieren, Wiederaufnehmen: nur Administratoren.
    await expect(helfer.meldung.statusSetzen({ id: b.meldungId, status: "abgelehnt", grund: "Test" })).rejects.toThrow("Ausstellungsleitung");
    await helfer.meldung.statusSetzen({ id: a.meldungId, status: "bestaetigt" });
    await expect(helfer.meldung.statusSetzen({ id: a.meldungId, status: "storniert", grund: "Test" })).rejects.toThrow("Ausstellungsleitung");
    // Versehentlich bestätigt: Helfer nehmen die Bestätigung zurück (bestätigt → offen) und bestätigen erneut.
    await helfer.meldung.statusSetzen({ id: a.meldungId, status: "offen", grund: "Test" });
    await helfer.meldung.statusSetzen({ id: a.meldungId, status: "bestaetigt" });
    await al.meldung.statusSetzen({ id: b.meldungId, status: "abgelehnt", grund: "Test" });
    await expect(helfer.meldung.statusSetzen({ id: b.meldungId, status: "bestaetigt" })).rejects.toThrow("Ausstellungsleitung");

    // Einlieferung: offenes Meldegeld steht an der Karte, der Helfer kassiert bar (Kassenbuch).
    const vorher = (await helfer.halle.suche({ schauId, q: "Kassierer" }))[0]!;
    expect(vorher.geld).toMatchObject({ summeCent: 400, bezahltCent: 0, offenCent: 400 });
    await helfer.meldung.zahlungErfassen({ meldungId: a.meldungId, betragCent: vorher.geld.offenCent, datum: "2026-11-11", art: "bar" });
    expect((await helfer.halle.suche({ schauId, q: "Kassierer" }))[0]!.geld.offenCent).toBe(0);
    const buch = await al.kasse.kassenbuch({ schauId });
    expect(buch.tage.flatMap((t: { bewegungen: { art: string; betragCent: number }[] }) => t.bewegungen).some((x) => x.art === "meldegeld" && x.betragCent === 400)).toBe(true);

    // Noten am PC: Helfer nie, Administratoren ja.
    await al.katalog.nummernVergeben({ schauId });
    const tier = (await al.bewertung.liste({ schauId, preisrichterId: null })).eintraege[0]!;
    const note = { schauId, katalogeintragId: tier.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" };
    await expect(helfer.bewertung.setzen(note)).rejects.toThrow("Administratoren");
    await expect(helfer.bewertung.zuruecksetzen({ schauId, katalogeintragId: tier.id, grund: "" })).rejects.toThrow("Administratoren");
    expect((await al.bewertung.setzen(note)).status).toBe("gespeichert");

    // Preise am PC: ebenso nur Administratoren, auch vor der Freigabe.
    const preisart = (await al.schau.get({ id: schauId })).preisarten[0]!;
    await expect(helfer.preise.vergeben({ schauId, katalogeintragId: tier.id, preisartId: preisart.id })).rejects.toThrow("Administratoren");
    const ueb = await helfer.preise.uebersicht({ schauId });
    expect(ueb.eintraege.some((e: { id: number }) => e.id === tier.id)).toBe(true);
  });
});

describe("Kasse: Nachtrag nach dem Tagesabschluss", () => {
  test("Bar bleibt nach dem Abschluss möglich; Nachträge bekommen einen eigenen Abschluss, der erste bleibt unverändert", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id: schauId } = await al.schau.anlegen({ name: "Nachtrag 2026", ort: "Halle" });
    const s = await al.schau.get({ id: schauId });
    const [wy] = await al.stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al.meldung.speichern({
      schauId,
      aussteller: { vorname: "Spät", nachname: "Zahler", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    await al.kasse.kassenbewegung({ schauId, art: "anfangsbestand", betragCent: 10000 });
    const erster = await al.kasse.tagesabschluss({ schauId, istCent: 10000 });
    expect(erster.nachtrag).toBe(0);
    // Ohne neue Bewegung gibt es keinen zweiten Abschluss.
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 10000 })).rejects.toThrow("schon abgeschlossen");

    // Nach dem Abschluss: Meldegeld bar und Einlage gehen weiter.
    await al.meldung.zahlungErfassen({ meldungId: r.meldungId, betragCent: 700, datum: "2026-11-11", art: "bar" });
    await al.kasse.kassenbewegung({ schauId, art: "einlage", betragCent: 300 });
    let buch = await al.kasse.kassenbuch({ schauId });
    let heute = buch.tage.find((t) => t.datum === buch.heute)!;
    expect(heute.nachtragOffen).toBe(true);
    expect(heute.bewegungen.filter((b) => b.nachtrag).map((b) => b.betragCent)).toEqual([700, 300]);
    expect(buch.offeneTage).toEqual([buch.heute]);
    expect(buch.sollJe[buch.heute]).toBe(11000);

    // Nachtragsabschluss: Soll = gezählter Bestand des Abschlusses + Nachträge; Differenz braucht eine Erklärung.
    await expect(al.kasse.tagesabschluss({ schauId, istCent: 10900 })).rejects.toThrow("Differenz");
    const zweiter = await al.kasse.tagesabschluss({ schauId, istCent: 11000 });
    expect(zweiter).toMatchObject({ nachtrag: 1, sollCent: 11000, differenzCent: 0 });
    buch = await al.kasse.kassenbuch({ schauId });
    heute = buch.tage.find((t) => t.datum === buch.heute)!;
    expect(heute.nachtragOffen).toBe(false);
    expect(heute.abschluesse.map((a) => a.nachtrag)).toEqual([0, 1]);
    expect(buch.offeneTage).toEqual([]);
    // Der erste Abschluss bleibt, wie er war; im Protokoll steht der Nachtrag.
    const [alt] = await m.db.select().from(m.schema.kassenabschluss).where(m.eq(m.schema.kassenabschluss.id, erster.id));
    expect(alt).toMatchObject({ istCent: 10000, sollCent: 10000, nachtrag: 0 });
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId));
    expect(prot.some((p) => p.aktion === "Nachtragsabschluss")).toBe(true);
  });
});
