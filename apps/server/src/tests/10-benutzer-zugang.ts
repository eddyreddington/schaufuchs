/** Benutzer, Zwei-Faktor-Anmeldung, Verzeichnis ergänzen, Willkommensmail, Einladungslink. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Willkommensmail für neue Benutzer", () => {
  test("Anlegen legt eine Mail ohne Passwort in den Postausgang", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const r = await al.auth.benutzerAnlegen({ name: "Neu Willkommen", email: "willkommen@test.de", passwort: "geheim-geheim-42", rolle: "mitarbeiter" });
    expect(r.willkommensmail).toBe(true);
    const [mail] = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "willkommen@test.de"));
    expect(mail!.betreff).toContain("Ihr Zugang zu SchauFUCHS");
    expect(mail!.text).toContain("/anmelden");
    expect(mail!.text).toContain("Helfer");
    expect(mail!.text).not.toContain("geheim-geheim-42");
  });
});

describe("Zwei-Faktor-Anmeldung", () => {
  test("TOTP nach RFC 6238 und Base32 stimmen", async () => {
    const z = await import("../services/zweifaktor");
    const geheim = Buffer.from("12345678901234567890");
    expect(z.totp(geheim, 1)).toBe("287082");
    expect(z.totp(geheim, Math.floor(1111111109 / 30))).toBe("081804");
    expect(z.ausBase32(z.base32(geheim)).toString()).toBe("12345678901234567890");
    expect(z.base32(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  test("Einrichten, Anmelden mit Code, kein zweites Mal derselbe Code, Notfallcode, Zurücksetzen", async () => {
    const z = await import("../services/zweifaktor");
    const al = m.appRouter.createCaller(adminKontext);
    const passwort = "zwei-faktor-123";
    await al.auth.benutzerAnlegen({ name: "Zwei Faktor", email: "zwei-faktor@test.de", passwort, rolle: "mitarbeiter" });
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "zwei-faktor@test.de"));
    const ich = m.appRouter.createCaller({ ...leer, ip: "203.0.113.150", benutzer: { id: b!.id, organisationId: b!.organisationId, name: b!.name, email: b!.email, rolle: "mitarbeiter" } });
    await expect(ich.auth.zweiFaktorEinrichten({ passwort: "falsch-falsch" })).rejects.toThrow("Passwort");
    const e = await ich.auth.zweiFaktorEinrichten({ passwort });
    expect(e.adresse).toStartWith("otpauth://totp/");
    const geheim = e.geheim.replace(/\s/g, "");
    // Zeitschritt einmal festhalten: sonst wäre „der aktuelle Code“ nach einem 30-Sekunden-Wechsel ein anderer (Wackler).
    const schritt0 = z.zeitschritt();
    const codeBei = (versatz: number) => z.totp(z.ausBase32(geheim), schritt0 + versatz);
    await expect(ich.auth.zweiFaktorBestaetigen({ code: "000000" === codeBei(0) ? "111111" : "000000" })).rejects.toThrow("Code");
    const { notfallcodes } = await ich.auth.zweiFaktorBestaetigen({ code: codeBei(0) });
    expect(notfallcodes).toHaveLength(10);

    let gesetzt = "";
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.150", setCookie: (w: string) => { gesetzt = w; } });
    const r1 = await pub.auth.anmelden({ email: "zwei-faktor@test.de", passwort });
    expect(r1.zweiterFaktor).toBe(true);
    expect(gesetzt).toBe("");
    // Der beim Bestätigen benutzte Code gilt nicht noch einmal; der nächste schon.
    await expect(pub.auth.anmeldenCode({ token: r1.token, code: codeBei(0) })).rejects.toThrow("stimmt nicht");
    expect((await pub.auth.anmeldenCode({ token: r1.token, code: codeBei(1) })).ok).toBe(true);
    expect(gesetzt).toContain("schau_sitzung=");
    // Token ist verbraucht.
    await expect(pub.auth.anmeldenCode({ token: r1.token, code: codeBei(1) })).rejects.toThrow("abgelaufen");

    gesetzt = "";
    const r2 = await pub.auth.anmelden({ email: "zwei-faktor@test.de", passwort });
    expect((await pub.auth.anmeldenCode({ token: r2.token, code: notfallcodes[0]! })).ok).toBe(true);
    const r3 = await pub.auth.anmelden({ email: "zwei-faktor@test.de", passwort });
    await expect(pub.auth.anmeldenCode({ token: r3.token, code: notfallcodes[0]! })).rejects.toThrow("stimmt nicht");
    expect((await ich.auth.zweiFaktorStatus()).notfallUebrig).toBe(9);

    // Nach 5 falschen Codes ist der Zwischenstand verbraucht.
    const r4 = await pub.auth.anmelden({ email: "zwei-faktor@test.de", passwort });
    for (let i = 0; i < 4; i++) await expect(pub.auth.anmeldenCode({ token: r4.token, code: "12345" + i })).rejects.toThrow();
    await expect(pub.auth.anmeldenCode({ token: r4.token, code: codeBei(0) })).rejects.toThrow();

    expect((await al.auth.benutzerListe()).find((x) => x.id === b!.id)?.zweiFaktor).toBe(true);
    await al.auth.zweiFaktorZuruecksetzen({ id: b!.id });
    gesetzt = "";
    const r5 = await pub.auth.anmelden({ email: "zwei-faktor@test.de", passwort });
    expect(r5.zweiterFaktor).toBe(false);
    expect(gesetzt).toContain("schau_sitzung=");
  });
});

describe("Benutzerverwaltung: Rolle und Passwort durch die AL", () => {
  test("Rolle ändern, nicht die eigene; neues Passwort meldet ab und schickt eine Hinweismail ohne Passwort", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    await al.auth.benutzerAnlegen({ name: "Rolle Test", email: "rolle@test.de", passwort: "anfang-anfang-1", rolle: "mitarbeiter" });
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "rolle@test.de"));
    await expect(al.auth.benutzerRolle({ id: adminKontext.benutzer!.id, rolle: "mitarbeiter" })).rejects.toThrow("eigene Rolle");
    await al.auth.benutzerRolle({ id: b!.id, rolle: "admin" });
    expect((await al.auth.benutzerListe()).find((x) => x.id === b!.id)?.rolle).toBe("admin");
    await al.auth.benutzerRolle({ id: b!.id, rolle: "mitarbeiter" });
    const { neueSitzung } = await import("../auth");
    await neueSitzung({ benutzerId: b!.id });
    await al.auth.benutzerPasswortSetzen({ id: b!.id, passwort: "neu-gesetzt-12345" });
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.benutzerId, b!.id))).toHaveLength(0);
    const mails = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, "rolle@test.de"));
    expect(mails.some((x) => x.betreff.includes("neu gesetzt") && !x.text.includes("neu-gesetzt-12345"))).toBe(true);
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.160" });
    expect((await pub.auth.anmelden({ email: "rolle@test.de", passwort: "neu-gesetzt-12345" })).ok).toBe(true);
    await expect(al.auth.benutzerPasswortSetzen({ id: adminKontext.benutzer!.id, passwort: "egal-egal-egal" })).rejects.toThrow("Eigenes Passwort");
  });
});

describe("Benutzerseite: Angaben, Geräte, fremde Vereine", () => {
  test("Einzelabruf, Name und E-Mail ändern mit Protokoll, alle Geräte abmelden, nur im eigenen Verein", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const r = await al.auth.benutzerAnlegen({ name: "Seite Test", email: "seite@test.de", passwort: "seite-seite-123", rolle: "mitarbeiter" });
    expect(r.id).toBeGreaterThan(0);
    const b = await al.auth.benutzerGet({ id: r.id });
    expect(b.email).toBe("seite@test.de");
    expect(b.geraete).toBe(0);
    expect(b.zuletzt).toBeNull();

    await al.auth.benutzerSpeichern({ id: r.id, name: "Seite Geändert", email: "Seite-Neu@Test.de" });
    const neu = await al.auth.benutzerGet({ id: r.id });
    expect(neu.name).toBe("Seite Geändert");
    expect(neu.email).toBe("seite-neu@test.de");
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, r.id));
    expect(prot.some((p) => p.tabelle === "benutzer" && p.aktion === "Benutzer geändert")).toBe(true);
    await expect(al.auth.benutzerSpeichern({ id: r.id, name: "Seite Geändert", email: adminKontext.benutzer!.email })).rejects.toThrow("lässt sich nicht verwenden");
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.170" });
    expect((await pub.auth.anmelden({ email: "seite-neu@test.de", passwort: "seite-seite-123" })).ok).toBe(true);

    const { neueSitzung } = await import("../auth");
    await neueSitzung({ benutzerId: r.id });
    await neueSitzung({ benutzerId: r.id });
    const mitGeraeten = await al.auth.benutzerGet({ id: r.id });
    expect(mitGeraeten.geraete).toBeGreaterThanOrEqual(2);
    expect(mitGeraeten.zuletzt).toBeInstanceOf(Date);
    expect((await al.auth.benutzerAbmelden({ id: r.id })).abgemeldet).toBeGreaterThanOrEqual(2);
    expect((await al.auth.benutzerGet({ id: r.id })).geraete).toBe(0);

    // Fremder Verein: weder lesen noch ändern noch abmelden.
    const [org] = await m.db.insert(m.schema.organisation).values({ name: "Fremdverein Seite" }).returning();
    const [fremd] = await m.db.insert(m.schema.benutzer).values({ organisationId: org!.id, name: "Fremd", email: "fremd-seite@test.de", passwortHash: "x", rolle: "admin" }).returning();
    await expect(al.auth.benutzerGet({ id: fremd!.id })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerSpeichern({ id: fremd!.id, name: "Übernommen", email: "fremd-seite@test.de" })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerAbmelden({ id: fremd!.id })).rejects.toThrow("nicht gefunden");

    // Helfer dürfen das alles nicht.
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id: r.id, organisationId: adminKontext.benutzer!.organisationId, name: "Seite", email: "seite-neu@test.de", rolle: "mitarbeiter" } });
    await expect(helfer.auth.benutzerGet({ id: r.id })).rejects.toThrow();
    await expect(helfer.auth.benutzerSpeichern({ id: r.id, name: "Selbst", email: "seite-neu@test.de" })).rejects.toThrow();
  });
});

describe("Verzeichnis von Hand ergänzen", () => {
  test("Farbenschlag, Rasse und Sparte ergänzen: richtige Folge, Doppelte übersprungen, Protokoll, nur eigene Versionen", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const csv = "Sparte;Rasse;Farbenschlag\nHühner;Altsteirer;weiß\nHühner;Altsteirer;wildbraun\nHühner;Bielefelder;kennhuhnfarbig\nTauben;Altdeutsche Mövchen;blau\n";
    const { versionId } = await al.stammdaten.importieren({ name: "Ergänzen-Test", jahr: 2026, quelle: "Test", csv });

    // Farbenschlag zu vorhandener Rasse: landet direkt hinter deren Farbenschlägen, vor der nächsten Rasse.
    const r1 = await al.stammdaten.ergaenzen({ versionId, sparte: "hühner", rasse: "ALTSTEIRER", farbenschlaege: ["schwarz", "Weiß", "schwarz"] });
    expect(r1).toMatchObject({ sparte: "Hühner", rasse: "Altsteirer", neueSparte: false, neueRasse: false, angelegt: ["schwarz"] });
    expect(r1.schonDa).toEqual(["Weiß", "schwarz"]);
    // Neue Rasse in vorhandener Sparte: ans Ende der Sparte, vor die Tauben.
    const r2 = await al.stammdaten.ergaenzen({ versionId, sparte: "Hühner", rasse: "Zwerg-Testhuhn", farbenschlaege: ["gold"] });
    expect(r2.neueRasse).toBe(true);
    // Neue Sparte: ganz ans Ende.
    const r3 = await al.stammdaten.ergaenzen({ versionId, sparte: "Ziergeflügel", rasse: "Testfasan", farbenschlaege: ["rot", "gelb"] });
    expect(r3.neueSparte).toBe(true);

    const baum = (await al.stammdaten.baum({ versionId })).map((z) => `${z.sparte}/${z.rasse}/${z.farbenschlag}`);
    expect(baum).toEqual([
      "Hühner/Altsteirer/weiß",
      "Hühner/Altsteirer/wildbraun",
      "Hühner/Altsteirer/schwarz",
      "Hühner/Bielefelder/kennhuhnfarbig",
      "Hühner/Zwerg-Testhuhn/gold",
      "Tauben/Altdeutsche Mövchen/blau",
      "Ziergeflügel/Testfasan/rot",
      "Ziergeflügel/Testfasan/gelb",
    ]);
    expect((await al.stammdaten.suche({ versionId, q: "Testfasan gelb" })).map((x) => x.farbenschlag)).toEqual(["gelb"]);
    expect((await al.stammdaten.versionen()).find((v) => v.id === versionId)?.farbenschlaege).toBe(8);

    await expect(al.stammdaten.ergaenzen({ versionId, sparte: "Hühner", rasse: "Altsteirer", farbenschlaege: ["schwarz"] })).rejects.toThrow("schon");
    await expect(al.stammdaten.ergaenzen({ versionId, sparte: "Hühner", rasse: "Altsteirer", farbenschlaege: [] })).rejects.toThrow();
    await expect(al.stammdaten.ergaenzen({ versionId, sparte: " ", rasse: "Altsteirer", farbenschlaege: ["x"] })).rejects.toThrow();

    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, versionId));
    expect(prot.filter((p) => p.tabelle === "stammdaten_version" && p.aktion === "Verzeichnis ergänzt")).toHaveLength(3);

    // Betreiber-Version (für alle Vereine): nicht ergänzbar.
    const { importiereStammdaten } = await import("../routers/stammdaten");
    const betreiber = await importiereStammdaten({ name: "Betreiber Ergänzen", jahr: 2025, quelle: "B", csv, organisationId: null });
    await expect(al.stammdaten.ergaenzen({ versionId: betreiber.versionId, sparte: "Hühner", rasse: "Neu", farbenschlaege: ["x"] })).rejects.toThrow("für alle Vereine");
    // Version eines anderen Vereins: unsichtbar.
    const [org] = await m.db.insert(m.schema.organisation).values({ name: "Fremdverein Verzeichnis" }).returning();
    const fremd = await importiereStammdaten({ name: "Fremd Ergänzen", jahr: 2025, quelle: "F", csv, organisationId: org!.id });
    await expect(al.stammdaten.ergaenzen({ versionId: fremd.versionId, sparte: "Hühner", rasse: "Neu", farbenschlaege: ["x"] })).rejects.toThrow("nicht gefunden");
    await expect(al.stammdaten.gliederung({ versionId: fremd.versionId })).rejects.toThrow();
    // Helfer dürfen nicht ergänzen, aber die Gliederung lesen.
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
    await expect(helfer.stammdaten.ergaenzen({ versionId, sparte: "Hühner", rasse: "Neu", farbenschlaege: ["x"] })).rejects.toThrow();
    const g = await helfer.stammdaten.gliederung({ versionId });
    expect(g.sparten.map((s) => s.name)).toEqual(["Hühner", "Tauben", "Ziergeflügel"]);
  });
});

describe("Benutzer löschen", () => {
  test("ohne Spuren ganz weg, mit Spuren entfernt: keine Anmeldung, nicht wiederzubeleben, E-Mail frei, Name bleibt im Protokoll", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const org = adminKontext.benutzer!.organisationId;

    const leerer = await al.auth.benutzerAnlegen({ name: "Versehen Angelegt", email: "versehen@test.de", passwort: "versehen-12345", rolle: "mitarbeiter" });
    expect((await al.auth.benutzerLoeschen({ id: leerer.id })).ganz).toBe(true);
    expect(await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, leerer.id))).toHaveLength(0);

    const passwort = "spuren-spuren-1";
    const mit = await al.auth.benutzerAnlegen({ name: "Helfer Mit Spuren", email: "spuren@test.de", passwort, rolle: "mitarbeiter" });
    const helferKontext = { ...leer, benutzer: { id: mit.id, organisationId: org, name: "Helfer Mit Spuren", email: "spuren@test.de", rolle: "mitarbeiter" as const } };
    const { protokolliere } = await import("../services/protokoll");
    await protokolliere(m.db, { schauId: null, tabelle: "test", datensatzId: null, aktion: "Spur hinterlassen", akteur: helferKontext });
    const { neueSitzung } = await import("../auth");
    await neueSitzung({ benutzerId: mit.id });

    expect((await al.auth.benutzerLoeschen({ id: mit.id })).ganz).toBe(false);
    const [rest] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, mit.id));
    expect(rest).toMatchObject({ name: "Helfer Mit Spuren", aktiv: false, passwortHash: "-", totpGeheim: null });
    expect(rest!.email).not.toContain("spuren@test.de");
    expect(rest!.geloeschtAm).toBeInstanceOf(Date);
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.benutzerId, mit.id))).toHaveLength(0);
    const spur = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Spur hinterlassen"));
    expect(spur[0]!.benutzerId).toBe(mit.id);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, mit.id));
    expect(prot.some((p) => p.tabelle === "benutzer" && p.aktion.startsWith("Benutzer entfernt"))).toBe(true);

    // Nicht in der Liste, nicht abrufbar, nicht wiederzubeleben.
    expect((await al.auth.benutzerListe()).some((b) => b.id === mit.id)).toBe(false);
    await expect(al.auth.benutzerGet({ id: mit.id })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerAktiv({ id: mit.id, aktiv: true })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerPasswortSetzen({ id: mit.id, passwort: "wieder-da-12345" })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerSpeichern({ id: mit.id, name: "Wieder Da", email: "wieder@test.de" })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerRolle({ id: mit.id, rolle: "admin" })).rejects.toThrow("nicht gefunden");
    await expect(al.auth.benutzerLoeschen({ id: mit.id })).rejects.toThrow("nicht gefunden");
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.180" });
    await expect(pub.auth.anmelden({ email: "spuren@test.de", passwort })).rejects.toThrow("stimmt nicht");
    // Die Adresse ist wieder frei.
    const neu = await al.auth.benutzerAnlegen({ name: "Neu Auf Alter Adresse", email: "spuren@test.de", passwort, rolle: "mitarbeiter" });
    expect(neu.id).not.toBe(mit.id);

    // Nicht sich selbst, nicht fremde Vereine, nicht als Helfer.
    await expect(al.auth.benutzerLoeschen({ id: adminKontext.benutzer!.id })).rejects.toThrow("selbst");
    const [o] = await m.db.insert(m.schema.organisation).values({ name: "Fremdverein Löschen" }).returning();
    const [fremd] = await m.db.insert(m.schema.benutzer).values({ organisationId: o!.id, name: "Fremd", email: "fremd-loeschen@test.de", passwortHash: "x", rolle: "admin" }).returning();
    await expect(al.auth.benutzerLoeschen({ id: fremd!.id })).rejects.toThrow("nicht gefunden");
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id: neu.id, organisationId: org, name: "Neu", email: "spuren@test.de", rolle: "mitarbeiter" } });
    await expect(helfer.auth.benutzerLoeschen({ id: leerer.id })).rejects.toThrow();
  });
});

describe("Willkommensmail erneut senden", () => {
  test("nach Tippfehler korrigieren und an die neue Adresse schicken, auch einzeln; ohne Passwort, protokolliert, nicht für Gesperrte", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const pw = "tippfehler-12345";
    const { id } = await al.auth.benutzerAnlegen({ name: "Tipp Fehlr", email: "tipp-fehlr@test.de", passwort: pw, rolle: "mitarbeiter" });
    const mailsAn = (an: string) => m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an));

    // Ohne Haken keine Mail.
    expect((await al.auth.benutzerSpeichern({ id, name: "Tipp Fehler", email: "tipp-fehlr@test.de" })).willkommensmail).toBe(false);
    expect(await mailsAn("tipp-fehler@test.de")).toHaveLength(0);
    // Mit Haken an die korrigierte Adresse, mit korrigiertem Namen.
    expect((await al.auth.benutzerSpeichern({ id, name: "Tipp Fehler", email: "tipp-fehler@test.de", willkommensmail: true })).willkommensmail).toBe(true);
    const [mail] = await mailsAn("tipp-fehler@test.de");
    expect(mail!.text).toContain("Guten Tag Tipp Fehler,");
    expect(mail!.text).toContain("tipp-fehler@test.de");
    expect(mail!.text).not.toContain(pw);

    // Einzeln noch einmal schicken.
    expect((await al.auth.benutzerWillkommen({ id })).an).toBe("tipp-fehler@test.de");
    expect(await mailsAn("tipp-fehler@test.de")).toHaveLength(2);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, id));
    expect(prot.filter((p) => p.tabelle === "benutzer" && p.aktion === "Willkommensmail gesendet")).toHaveLength(2);

    // Gesperrt: keine Mail. Helfer, fremde Vereine und entfernte Benutzer: nicht.
    await al.auth.benutzerAktiv({ id, aktiv: false });
    await expect(al.auth.benutzerWillkommen({ id })).rejects.toThrow("gesperrt");
    expect((await al.auth.benutzerSpeichern({ id, name: "Tipp Fehler", email: "tipp-fehler@test.de", willkommensmail: true })).willkommensmail).toBe(false);
    await al.auth.benutzerAktiv({ id, aktiv: true });
    const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id, organisationId: adminKontext.benutzer!.organisationId, name: "Tipp Fehler", email: "tipp-fehler@test.de", rolle: "mitarbeiter" } });
    await expect(helfer.auth.benutzerWillkommen({ id })).rejects.toThrow();
    const [o] = await m.db.insert(m.schema.organisation).values({ name: "Fremdverein Willkommen" }).returning();
    const [fremd] = await m.db.insert(m.schema.benutzer).values({ organisationId: o!.id, name: "Fremd", email: "fremd-willkommen@test.de", passwortHash: "x", rolle: "admin" }).returning();
    await expect(al.auth.benutzerWillkommen({ id: fremd!.id })).rejects.toThrow("nicht gefunden");
    expect(await mailsAn("fremd-willkommen@test.de")).toHaveLength(0);
    await al.auth.benutzerLoeschen({ id });
    await expect(al.auth.benutzerWillkommen({ id })).rejects.toThrow("nicht gefunden");
  });
});

describe("Einladungslink statt Passwort", () => {
  test("Anlegen ohne Passwort: Mail mit Link, nur Hash gespeichert, einmal gültig, Anmeldung erst danach; alte Links verfallen", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id, einladung } = await al.auth.benutzerAnlegen({ name: "Eva Eingeladen", email: "eva@test.de", rolle: "mitarbeiter" });
    expect(einladung).toBe(true);
    const linkAus = async (an: string) => {
      const mails = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an)).orderBy(m.desc(m.schema.postausgang.id));
      return /\/einladung#([A-Za-z0-9_-]{40,})/.exec(mails[0]!.text)?.[1] ?? "";
    };
    const token1 = await linkAus("eva@test.de");
    expect(token1.length).toBeGreaterThan(40);
    const [roh] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, id));
    expect(roh!.passwortHash).toBe("-");
    expect(roh!.einladungHash).not.toContain(token1);
    expect((await al.auth.benutzerGet({ id })).einladungOffen).toBe(true);

    // Vor der Annahme: Anmeldung scheitert wie bei falschem Passwort (kein Serverfehler).
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.190" });
    await expect(pub.auth.anmelden({ email: "eva@test.de", passwort: "-" })).rejects.toThrow("stimmt nicht");
    await expect(pub.auth.anmelden({ email: "eva@test.de", passwort: "irgendwas-123" })).rejects.toThrow("stimmt nicht");

    // Neu schicken: alter Link ungültig, neuer gilt.
    expect((await al.auth.benutzerWillkommen({ id })).einladung).toBe(true);
    const token2 = await linkAus("eva@test.de");
    expect(token2).not.toBe(token1);
    await expect(pub.auth.einladungPruefen({ token: token1 })).rejects.toThrow("ungültig oder abgelaufen");
    expect(await pub.auth.einladungPruefen({ token: token2 })).toMatchObject({ name: "Eva Eingeladen", email: "eva@test.de", verein: "Testverein e. V." });
    // Solange kein Benutzer der Installation ein Passwort hat (erster Administrator per `schaufuchs einrichten`), gibt es
    // keine Ausstellungsleitung zum Fragen: dann nennt der Hinweis den Befehl. Nachgestellt in einer Transaktion, die
    // alle Passwörter leert und zurückgerollt wird.
    const { einladungFehler } = await import("../routers/auth/gemeinsam");
    expect((await einladungFehler(m.db)).message).toContain("Bitte die Ausstellungsleitung um eine neue Einladung.");
    let offen = "";
    await m.db
      .transaction(async (tx) => {
        await tx.update(m.schema.benutzer).set({ passwortHash: "-" });
        offen = (await einladungFehler(tx)).message;
        tx.rollback();
      })
      .catch(() => undefined);
    expect(offen).toBe("Die Einrichtung ist noch nicht abgeschlossen. Einen neuen Link erzeugt, wer diese SchauFUCHS-Installation betreut (Befehl „schaufuchs einrichten“).");
    // Zurückgerollt: wieder der gewohnte Hinweis.
    const danach = await einladungFehler(m.db);
    expect(danach.code).toBe("NOT_FOUND");
    expect(danach.message).toContain("Bitte die Ausstellungsleitung um eine neue Einladung.");

    // Annehmen: Passwort gesetzt, Sitzung da, Link verbraucht, protokolliert.
    let cookie = "";
    const annehmer = m.appRouter.createCaller({ ...leer, ip: "203.0.113.191", setCookie: (c: string) => { cookie = c; } });
    await expect(annehmer.auth.einladungAnnehmen({ token: token2, passwort: "kurz" })).rejects.toThrow();
    await annehmer.auth.einladungAnnehmen({ token: token2, passwort: "eva-eigenes-123" });
    expect(cookie).toContain("schau_sitzung=");
    await expect(annehmer.auth.einladungAnnehmen({ token: token2, passwort: "noch-einmal-123" })).rejects.toThrow("ungültig oder abgelaufen");
    expect((await pub.auth.anmelden({ email: "eva@test.de", passwort: "eva-eigenes-123" })).ok).toBe(true);
    const nachher = await al.auth.benutzerGet({ id });
    expect(nachher.einladungOffen).toBe(false);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, id));
    expect(prot.some((p) => p.tabelle === "benutzer" && p.aktion.startsWith("Einladung angenommen") && p.benutzerId === id)).toBe(true);
    // Mit Passwort: erneute Willkommensmail ohne Link.
    expect((await al.auth.benutzerWillkommen({ id })).einladung).toBe(false);
    expect(await linkAus("eva@test.de")).toBe("");
  });

  test("Link verfällt bei Adressänderung, Sperre, Passwort durch die AL, Ablauf und Entfernen", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const pub = m.appRouter.createCaller({ ...leer, ip: "203.0.113.192" });
    const neuerLink = async (id: number, an: string) => {
      await al.auth.benutzerWillkommen({ id });
      const [mail] = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an)).orderBy(m.desc(m.schema.postausgang.id));
      return /\/einladung#([A-Za-z0-9_-]+)/.exec(mail!.text)![1]!;
    };
    const { id } = await al.auth.benutzerAnlegen({ name: "Vertippt", email: "vertipt@test.de", rolle: "admin" });

    // Adresse korrigiert: der Link an die vertippte Adresse gilt nicht mehr.
    let t = await neuerLink(id, "vertipt@test.de");
    await al.auth.benutzerSpeichern({ id, name: "Vertippt", email: "vertippt@test.de" });
    await expect(pub.auth.einladungPruefen({ token: t })).rejects.toThrow("ungültig");

    // Gesperrt: Link weg, auch nach dem Entsperren.
    t = await neuerLink(id, "vertippt@test.de");
    await al.auth.benutzerAktiv({ id, aktiv: false });
    await al.auth.benutzerAktiv({ id, aktiv: true });
    await expect(pub.auth.einladungPruefen({ token: t })).rejects.toThrow("ungültig");

    // Abgelaufen.
    t = await neuerLink(id, "vertippt@test.de");
    await m.db.update(m.schema.benutzer).set({ einladungBis: new Date(Date.now() - 1000) }).where(m.eq(m.schema.benutzer.id, id));
    await expect(pub.auth.einladungAnnehmen({ token: t, passwort: "zu-spaet-12345" })).rejects.toThrow("abgelaufen");

    // Passwort durch die AL: Link weg.
    t = await neuerLink(id, "vertippt@test.de");
    await al.auth.benutzerPasswortSetzen({ id, passwort: "von-der-al-123" });
    await expect(pub.auth.einladungPruefen({ token: t })).rejects.toThrow("ungültig");

    // Entfernt (mit Spuren): Link weg.
    const { id: id2 } = await al.auth.benutzerAnlegen({ name: "Mit Spur Eingeladen", email: "spur-einladung@test.de", rolle: "mitarbeiter" });
    const t2 = await neuerLink(id2, "spur-einladung@test.de");
    const { protokolliere } = await import("../services/protokoll");
    await protokolliere(m.db, { schauId: null, tabelle: "test", datensatzId: null, aktion: "Spur", akteur: { benutzer: { id: id2, name: "x" } } });
    expect((await al.auth.benutzerLoeschen({ id: id2 })).ganz).toBe(false);
    await expect(pub.auth.einladungPruefen({ token: t2 })).rejects.toThrow("ungültig");

    // Raten wird gebremst.
    const rater = m.appRouter.createCaller({ ...leer, ip: "203.0.113.193" });
    for (let i = 0; i < 20; i++) await expect(rater.auth.einladungPruefen({ token: `falsch-falsch-falsch-${i}` })).rejects.toThrow("ungültig");
    await expect(rater.auth.einladungPruefen({ token: "falsch-falsch-falsch-x" })).rejects.toThrow("Zu viele");

    // Mit selbst vergebenem Passwort: keine Einladung.
    const { einladung } = await al.auth.benutzerAnlegen({ name: "Selbst Vergeben", email: "selbst-pw@test.de", passwort: "selbst-vergeben-1", rolle: "mitarbeiter" });
    expect(einladung).toBe(false);
  });
});
