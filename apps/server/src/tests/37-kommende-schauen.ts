/** Kommende Schauen: Termine pflegen, Kalender abonnieren ohne stilles Überschreiben, Katalogseite mit Kreiswahl, eigener Kalender. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, pdfText } from "./kontext";

const ics = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (uid: string, von: string, bis: string, name: string, ort = "") =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:${von}`, `DTEND;VALUE=DATE:${bis}`, `SUMMARY:${name}`, ...(ort ? [`LOCATION:${ort}`] : []), "END:VEVENT"].join("\r\n");

describe("Kommende Schauen", () => {
  test("Termine eintragen, Abo abgleichen, Katalogseite mit Kreiswahl, Kalender der eigenen Schauen", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const org = adminKontext.benutzer!.organisationId;
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.slug, "testschau-2026"));
    const vorher = { bewertungAm: s!.bewertungAm, oeffnungszeiten: s!.oeffnungszeiten };
    // Bewertung am Freitag, offen Samstag und Sonntag: Termine ab Montag, 14.12.2026, gehören auf die Seite.
    await m.db.update(m.schema.schau).set({ bewertungAm: "2026-12-11", oeffnungszeiten: "Sa. 9–18 Uhr; So. 9–15 Uhr" }).where(m.eq(m.schema.schau.id, s!.id));
    const schau = { ...s!, bewertungAm: "2026-12-11", oeffnungszeiten: "Sa. 9–18 Uhr; So. 9–15 Uhr" };
    const leerTermin = { ort: "", bis: null, kreisverband: "", landesverband: "", quelle: "", quelleUrl: "" };
    try {
      // ── Von Hand eintragen ──
      const nationale = await al.termine.speichern({ termin: { ...leerTermin, name: "108. Nationale", ort: "Leipzig, Neue Messe", von: "2026-12-04", bis: "2026-12-06", ebene: "bund", quelle: "bdrg.de (nachgesehen)" } });
      await al.termine.speichern({ termin: { ...leerTermin, name: "75. VDT-Schau", ort: "Messe Ulm", von: "2026-12-18", bis: "2026-12-20", ebene: "bund" } });
      await al.termine.speichern({ termin: { ...leerTermin, name: "Kreisschau Musterstadt", von: "2027-01-09", ebene: "kreis", kreisverband: "KV Musterkreis" } });
      await al.termine.speichern({ termin: { ...leerTermin, name: "Kreisschau Leipzig", von: "2027-01-16", ebene: "kreis", kreisverband: "KV Leipzig" } });
      await expect(al.termine.speichern({ termin: { ...leerTermin, name: "Falsch", von: "2027-01-10", bis: "2027-01-09", ebene: "bund" } })).rejects.toThrow("Ende liegt vor dem Beginn");
      await expect(al.termine.speichern({ termin: { ...leerTermin, name: "Falsch", von: "2027-02-30", ebene: "bund" } })).rejects.toThrow();
      await expect(al.termine.speichern({ termin: { ...leerTermin, name: "Link", von: "2027-01-10", ebene: "bund", quelleUrl: "javascript:alert(1)" } })).rejects.toThrow();
      const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "schautermin")).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
      expect(prot[0]!.aktion).toBe("Termin eingetragen");

      // Helfer dürfen sehen, aber nicht ändern; ein anderer Verein sieht und ändert nichts.
      const [ma] = await m.db.insert(m.schema.benutzer).values({ organisationId: org, email: "termine-helfer@test.de", name: "Termine Helfer", passwortHash: "-", rolle: "mitarbeiter" }).returning();
      const helfer = m.appRouter.createCaller({ ...leer, benutzer: { id: ma!.id, organisationId: org, name: ma!.name, email: ma!.email, rolle: "mitarbeiter" } });
      expect((await helfer.termine.laden({ schauId: s!.id })).termine.length).toBeGreaterThanOrEqual(4);
      await expect(helfer.termine.loeschen({ id: nationale.id })).rejects.toThrow("Administratoren");
      const [orgB] = await m.db.insert(m.schema.organisation).values({ name: "Termine fremd" }).returning();
      const [b] = await m.db.insert(m.schema.benutzer).values({ organisationId: orgB!.id, email: "termine-b@test.de", name: "AL Fremd", passwortHash: "-", rolle: "admin" }).returning();
      const fremd = m.appRouter.createCaller({ ...leer, benutzer: { id: b!.id, organisationId: orgB!.id, name: b!.name, email: b!.email, rolle: "admin" } });
      await expect(fremd.termine.loeschen({ id: nationale.id })).rejects.toThrow("nicht gefunden");
      await expect(fremd.termine.laden({ schauId: s!.id })).rejects.toThrow("nicht gefunden");

      // ── Kalender abonnieren: Adressen im eigenen Netz und andere Protokolle abgelehnt ──
      const aboDaten = { name: "Kalender LV Sachsen", ebene: "land" as const, kreisverband: "", landesverband: "LV Sachsen", aktiv: true };
      for (const url of ["http://127.0.0.1/x.ics", "http://192.168.1.2/kalender.ics", "http://[::1]/x.ics", "http://169.254.169.254/latest", "ftp://example.org/x.ics", "https://nutzer:pw@example.org/x.ics"]) {
        await expect(al.termine.aboSpeichern({ abo: { ...aboDaten, url } })).rejects.toThrow();
      }
      const { istInterneAdresse, aboAbrufen } = await import("../services/termine");
      expect(istInterneAdresse("10.1.2.3")).toBe(true);
      expect(istInterneAdresse("::ffff:192.168.0.1")).toBe(true);
      expect(istInterneAdresse("fd00::1")).toBe(true);
      expect(istInterneAdresse("93.184.216.34")).toBe(false);
      for (const ip of ["::127.0.0.1", "64:ff9b::a00:1", "64:ff9b::10.0.0.1", "2002:c0a8:101::1"]) expect(istInterneAdresse(ip)).toBe(true);
      // Auch beim Verbindungsaufbau selbst (gegen DNS-Rebinding zwischen Prüfung und Abruf): localhost wird abgewiesen.
      const { sichereAufloesung } = await import("../services/termine");
      const aufgeloest = await new Promise<string>((fertig) => sichereAufloesung("localhost", {}, (e) => fertig(e ? e.message : "verbunden")));
      expect(aufgeloest).toContain("eigenen Netz");
      // Abo direkt anlegen (die Adresse wird beim Speichern über DNS geprüft – im Test ohne Netz).
      const [abo] = await m.db.insert(m.schema.terminabo).values({ organisationId: org, url: "https://lv-thueringen.example/schauen.ics", ...aboDaten }).returning();
      const akteur = { text: "Test" };

      let r = await aboAbrufen(abo!.id, akteur, ics(ev("lv-1", "20270109", "20270111", "LV-Schau Sachsen", "Leipzig"), ev("lv-2", "20270123", "20270125", "Landesjugendschau"), ev("alt", "20261001", "20261003", "Vorbei")));
      expect(r).toMatchObject({ ok: true, anzahl: 3, neu: 2 });
      let liste = (await al.termine.laden({ schauId: s!.id })).termine.filter((t) => t.aboId === abo!.id);
      expect(liste.map((t) => [t.uid, t.status, t.landesverband, t.quelle])).toEqual([
        ["lv-1", "vorschlag", "LV Sachsen", "Kalender LV Sachsen"],
        ["lv-2", "vorschlag", "LV Sachsen", "Kalender LV Sachsen"],
      ]);
      // Vorschläge stehen nicht im Katalog.
      const { katalogPdf } = await import("../pdf/katalog");
      let text = pdfText(await katalogPdf(schau));
      expect(text).toContain("Kommende Schauen");
      expect(text).not.toContain("LV-Schau Sachsen");

      const lv1 = liste.find((t) => t.uid === "lv-1")!;
      const lv2 = liste.find((t) => t.uid === "lv-2")!;
      await al.termine.pruefen({ ids: [lv1.id], aktion: "uebernehmen" });
      await al.termine.pruefen({ ids: [lv2.id], aktion: "verwerfen" });

      // Quelle ändert das Datum des übernommenen Termins und den verworfenen: nichts wird überschrieben.
      r = await aboAbrufen(abo!.id, akteur, ics(ev("lv-1", "20270110", "20270112", "LV-Schau Sachsen", "Leipzig"), ev("lv-2", "20270124", "20270125", "Landesjugendschau neu")));
      expect(r).toMatchObject({ ok: true, neu: 0 });
      liste = (await al.termine.laden({ schauId: s!.id })).termine.filter((t) => t.aboId === abo!.id);
      const nachher1 = liste.find((t) => t.uid === "lv-1")!;
      expect(nachher1).toMatchObject({ von: "2027-01-09", status: "uebernommen", abweichung: { von: "2027-01-10", bis: "2027-01-11" } });
      expect(liste.find((t) => t.uid === "lv-2")).toMatchObject({ status: "verworfen", name: "Landesjugendschau" });
      await al.termine.abweichung({ id: nachher1.id, aktion: "uebernehmen" });
      liste = (await al.termine.laden({ schauId: s!.id })).termine.filter((t) => t.aboId === abo!.id);
      expect(liste.find((t) => t.uid === "lv-1")).toMatchObject({ von: "2027-01-10", bis: "2027-01-11", abweichung: null });

      // Fehler beim Abruf: sichtbar am Abo, Termine bleiben.
      r = await aboAbrufen(abo!.id, akteur, "<html>Seite nicht gefunden</html>");
      expect(r.ok).toBe(true); // Text ohne Termine ist ein leerer Kalender …
      const fehler = await aboAbrufen(abo!.id, akteur, undefined).catch(() => null);
      expect(fehler?.ok).toBe(false); // … der Abruf der Beispieladresse scheitert dagegen und steht am Abo.
      const [aboNachher] = await m.db.select().from(m.schema.terminabo).where(m.eq(m.schema.terminabo.id, abo!.id));
      expect(aboNachher!.letzterFehler).not.toBe("");
      // Steht der übernommene Termin nicht mehr im Kalender, wird er nur markiert.
      expect((await m.db.select().from(m.schema.schautermin).where(m.eq(m.schema.schautermin.id, nachher1.id)))[0]!.abweichung).toEqual({ entfallen: true });

      // ── Katalogseite ──
      await al.termine.abweichung({ id: nachher1.id, aktion: "ignorieren" });
      text = pdfText(await katalogPdf(schau));
      expect(text).toContain("Kommende Schauen");
      expect(text).toContain("75. VDT-Schau");
      expect(text).toContain("18.–20. Dezember 2026");
      expect(text).toContain("LV-Schau Sachsen");
      expect(text).toContain("Kreisschau Musterstadt");
      expect(text).toContain("Kreisschau Leipzig");
      expect(text).not.toContain("108. Nationale"); // vor der eigenen Schau
      expect(text).toMatch(/Quellen:.*bdrg\.de|Quellen:.*eigene Eintragung/s);
      expect(text).toContain("ohne Gewähr");
      // Kreis gewählt: nur dessen Kreisschauen.
      await al.termine.wahlSetzen({ schauId: s!.id, kreis: "Leipzig", land: "" });
      const geladen = await al.termine.laden({ schauId: s!.id });
      expect(geladen.wahl).toEqual({ kreis: "Leipzig", land: "" });
      expect(geladen.kreise).toEqual(["KV Leipzig", "KV Musterkreis"]);
      expect(geladen.schautage).toEqual({ von: "2026-12-12", bis: "2026-12-13" });
      text = pdfText(await katalogPdf(schau));
      expect(text).toContain("Kreisschau Leipzig");
      expect(text).not.toContain("Kreisschau Musterstadt");
      expect(text).toContain("Im Kreis – Leipzig");
      // „keine“: Landesschauen bzw. Kreisschauen fehlen ganz, die übrigen Ebenen bleiben.
      const { TERMINE_KEINE } = await import("@schau/domain");
      await al.termine.wahlSetzen({ schauId: s!.id, kreis: TERMINE_KEINE, land: TERMINE_KEINE });
      text = pdfText(await katalogPdf(schau));
      expect(text).not.toContain("LV-Schau Sachsen");
      expect(text).not.toContain("Kreisschau Leipzig");
      expect(text).toContain("75. VDT-Schau");
      expect((await al.termine.laden({ schauId: s!.id })).vorschau.map((g) => g.ebene)).toEqual(["bund"]);
      await al.termine.wahlSetzen({ schauId: s!.id, kreis: "Leipzig", land: "" });
      // Die Gestaltung speichert die Wahl nicht weg.
      const g = (await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung;
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { format: g.format, untertitel: g.untertitel, schirmherr: g.schirmherr, ausstellungsleitung: g.ausstellungsleitung, eintritt: g.eintritt, farbe: g.farbe } });
      expect((await al.termine.laden({ schauId: s!.id })).wahl.kreis).toBe("Leipzig");
      // Teil abgewählt (Vorschau oder Schalter im Abschnitt): keine Seite; die übrigen ausgeblendeten Teile bleiben.
      text = pdfText(await katalogPdf(schau, { vorschau: { ausgeblendet: ["kommendeSchauen"] } }));
      expect(text).not.toContain("Kommende Schauen");
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { format: g.format, untertitel: g.untertitel, schirmherr: g.schirmherr, ausstellungsleitung: g.ausstellungsleitung, eintritt: g.eintritt, farbe: g.farbe, ausgeblendet: ["notizen"] } });
      await al.termine.druckenSetzen({ schauId: s!.id, an: false });
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung.ausgeblendet).toEqual(["notizen", "kommendeSchauen"]);
      expect((await al.termine.laden({ schauId: s!.id })).teilAusgeblendet).toBe(true);
      expect(pdfText(await katalogPdf(schau))).not.toContain("Kommende Schauen");
      await expect(helfer.termine.druckenSetzen({ schauId: s!.id, an: true })).rejects.toThrow("Administratoren");
      await al.termine.druckenSetzen({ schauId: s!.id, an: true });
      await al.termine.druckenSetzen({ schauId: s!.id, an: true });
      expect((await al.katalogGestaltung.laden({ schauId: s!.id })).gestaltung.ausgeblendet).toEqual(["notizen"]);
      await al.katalogGestaltung.speichern({ schauId: s!.id, daten: { format: g.format, untertitel: g.untertitel, schirmherr: g.schirmherr, ausstellungsleitung: g.ausstellungsleitung, eintritt: g.eintritt, farbe: g.farbe, ausgeblendet: g.ausgeblendet } });

      // ── Abo beenden: Vorschläge und Verworfenes weg, Übernommenes bleibt ──
      await al.termine.aboLoeschen({ id: abo!.id });
      const rest = await m.db.select().from(m.schema.schautermin).where(m.eq(m.schema.schautermin.organisationId, org));
      expect(rest.some((t) => t.uid === "lv-1" && t.aboId === null)).toBe(true);
      expect(rest.some((t) => t.uid === "lv-2")).toBe(false);

      // ── Kalender der eigenen Schauen ──
      const server = (await import("../index")).default;
      const hol = (pfad: string) => server.fetch(new Request(`http://test${pfad}`));
      let antwort = await hol(`/o/${org}/schauen.ics`);
      expect(antwort.status).toBe(200);
      expect(antwort.headers.get("content-type")).toContain("text/calendar");
      const kalender = await antwort.text();
      const { leseIcal } = await import("@schau/domain");
      const eigene = leseIcal(kalender).find((t) => t.name === s!.name);
      expect(eigene).toMatchObject({ von: "2026-12-12", bis: "2026-12-13" });
      expect(eigene!.url).toContain("/s/testschau-2026");
      expect(kalender).not.toMatch(/@test\.de|Aussteller/); // keine Personendaten
      await al.termine.veroeffentlichenSetzen({ an: false });
      antwort = await hol(`/o/${org}/schauen.ics`);
      expect(antwort.status).toBe(404);
      expect((await hol(`/o/999999/schauen.ics`)).status).toBe(404);
    } finally {
      await al.termine.veroeffentlichenSetzen({ an: true });
      await al.termine.wahlSetzen({ schauId: s!.id, kreis: "", land: "" });
      await m.db.update(m.schema.schau).set(vorher).where(m.eq(m.schema.schau.id, s!.id));
    }
    // Drei Katalog-PDFs: bei voller Rechnerlast über 5 s (Standardgrenze) – wie die anderen PDF-Abläufe mehr Zeit.
  }, 30_000);

  test("Kalender-Abo: Netzfehler verständlich und übersetzbar statt technisch", async () => {
    const { holeKalender, netzFehler, KalenderFehler } = await import("../services/termine");
    const { ladeAlleOberflaechen, serverText } = await import("@schau/domain");
    await ladeAlleOberflaechen();
    const fall = (code: string) => netzFehler(Object.assign(new Error(`roh ${code}`), { code }), "kalender.example");
    const texte = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "EIRGENDWAS"].map(fall);
    for (const f of texte) {
      expect(f).toBeInstanceOf(KalenderFehler);
      expect(f.message).not.toContain("roh");
      expect(serverText(f.message, "en")).not.toBe(f.message);
    }
    expect(texte[0]!.message).toBe("Der Server kalender.example lehnt die Verbindung ab.");
    expect(texte[6]!.message).toContain("Zertifikat");
    // Echter Abruf auf einen geschlossenen Port (nur mit TERMINABO_LOKAL, wie beim Ausprobieren auf dem eigenen Rechner).
    const vorher = process.env.TERMINABO_LOKAL;
    process.env.TERMINABO_LOKAL = "1";
    try {
      const e = await holeKalender("http://127.0.0.1:9/x.ics").catch((x: unknown) => x);
      expect(e).toBeInstanceOf(KalenderFehler);
      expect((e as Error).message).toBe("Der Server 127.0.0.1 lehnt die Verbindung ab.");
    } finally {
      if (vorher === undefined) delete process.env.TERMINABO_LOKAL;
      else process.env.TERMINABO_LOKAL = vorher;
    }
  });
});
