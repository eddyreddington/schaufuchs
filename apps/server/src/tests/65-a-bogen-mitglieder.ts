/**
 * A-Bögen für die Vereinsmitglieder (Vereinsverwaltung, „Aussteller“): je Mitglied ein A-Bogen zur gewählten Schau,
 * vorausgefüllt mit Name und Anschrift. Nur Ausstellungsleitung (keine Helfer), nur eigene Mitglieder, nie gesperrte
 * oder externe, keine Bankdaten; ein einzelnes Mitglied geht auch.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("A-Bögen für Vereinsmitglieder", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const server = async () => (await import("../index")).default;
  const hol = async (pfad: string, cookie = "") => (await server()).fetch(new Request(`http://test${pfad}`, { headers: cookie ? { cookie } : {} }));
  const leer = { vorname: "", nachname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };

  test("je Mitglied ein vorausgefüllter Bogen – ohne Externe, Gesperrte und Bankdaten; einzeln ebenso", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const s = await al().schau.anlegen({ name: "Mitgliederbogenschau", ort: "Papierstadt" });
      const d = await al().schau.get({ id: s.id });
      await al().schau.aktualisieren({ id: s.id, daten: { ...d, meldeschluss: "2026-12-05", bewertungAm: "2026-12-12" } });

      // Zuerst angelegt, kommt aber nach dem Namen zuletzt: die Bögen folgen dem Namen, nicht der Datenbank.
      await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Zora", nachname: "Zbogenmitglied", strasse: "Zum Ende 9", verein: "GZV Musterstadt" }, mitglied: "ja" });
      const anna = await al().verein.ausstellerSpeichern({
        daten: { ...leer, vorname: "Anna", nachname: "Abogenmitglied", strasse: "Lindenweg 7", plz: "34117", ort: "Kassel", telefon: "0561 12345", email: "anna@example.org", verein: "GZV Musterstadt", registriernummer: "276 06 535 012 0065", iban: "DE02120300000000202051", istPreisrichter: true },
        mitglied: "ja",
      });
      // Jugendlich am Bewertungstag: Geburtsdatum steht darauf (Jugendtarif); bei Anna (erwachsen) nicht.
      // Das Geburtsdatum kommt sonst aus einer Meldung (Jugendtarif).
      const jana = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Jana", nachname: "Jbogenmitglied", strasse: "Schulweg 4", verein: "GZV Musterstadt" }, mitglied: "ja" });
      await m.db.update(m.schema.aussteller).set({ geburtsdatum: "2012-05-06" }).where(m.eq(m.schema.aussteller.id, jana.id));
      await m.db.update(m.schema.aussteller).set({ geburtsdatum: "1970-03-04" }).where(m.eq(m.schema.aussteller.id, anna.id));
      const bernd = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Bernd", nachname: "Bbogenmitglied", strasse: "Am Hang 2", plz: "34119", ort: "Kassel", verein: "GZV Musterstadt" }, mitglied: "ja" });
      const extern = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Erik", nachname: "Externbogen", strasse: "Weit weg 1", verein: "GZV Anderswo" }, mitglied: "nein" });
      const gesperrt = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Gerd", nachname: "Gesperrtbogen", strasse: "Sperrweg 1", verein: "GZV Musterstadt" }, mitglied: "ja" });
      await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date() }).where(m.eq(m.schema.aussteller.id, gesperrt.id));

      const r = await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf`, cookie);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("application/pdf");
      const text = pdfText(Buffer.from(await r.arrayBuffer()));
      for (const t of ["Mitgliederbogenschau", "05.12.2026", "Anna", "Abogenmitglied", "Lindenweg 7", "34117", "Kassel", "0561 12345", "anna@example.org", "GZV Musterstadt", "276 06 535 012 0065", "Bernd", "Bbogenmitglied", "Am Hang 2"]) {
        expect(text).toContain(t);
      }
      for (const t of ["Externbogen", "Gesperrtbogen", "DE02", "04.03.1970"]) expect(text).not.toContain(t);
      expect(text).toContain("06.05.2012");
      // Nach Namen sortiert, jeder Bogen zählt seine Seiten selbst.
      expect(text.indexOf("Abogenmitglied")).toBeLessThan(text.indexOf("Bbogenmitglied"));
      expect(text.indexOf("Bbogenmitglied")).toBeLessThan(text.indexOf("Zbogenmitglied"));
      expect(text.match(/Seite 1 von/g)!.length).toBeGreaterThanOrEqual(3);

      // Einzeln: nur dieses Mitglied; Externe gehen einzeln auch (die Ausstellungsleitung wählt bewusst), Gesperrte nicht.
      const einzel = pdfText(Buffer.from(await (await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=${bernd.id}`, cookie)).arrayBuffer()));
      expect(einzel).toContain("Bbogenmitglied");
      expect(einzel).not.toContain("Abogenmitglied");
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=${extern.id}`, cookie)).status).toBe(200);
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=${gesperrt.id}`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=abc`, cookie)).status).toBe(404);
      // Gelöschte und Test-Aussteller (gehören zu einer Testschau) bekommen keinen Bogen.
      const [geloescht] = await m.db.insert(m.schema.aussteller).values({ organisationId: adminKontext.benutzer!.organisationId, vorname: "Lena", nachname: "Loeschbogen", geloeschtAm: new Date() }).returning();
      const [probe] = await m.db.insert(m.schema.aussteller).values({ organisationId: adminKontext.benutzer!.organisationId, vorname: "Tina", nachname: "Testbogen", testSchauId: s.id }).returning();
      for (const x of [geloescht!, probe!]) expect(`${x.nachname} ${(await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=${x.id}`, cookie)).status}`).toBe(`${x.nachname} 404`);

      // Zu einer Testschau keine Mitgliederbögen (deren Bögen gehen nicht an echte Mitglieder).
      const t = await al().schau.anlegen({ name: "Bogentestschau", ort: "Probe" });
      await m.db.update(m.schema.schau).set({ test: true }).where(m.eq(m.schema.schau.id, t.id));
      expect((await hol(`/datei/${t.id}/a-bogen-mitglieder.pdf`, cookie)).status).toBe(404);

      // Ohne Anmeldung nichts, Helfer auch nicht: es sind Anschriften aller Mitglieder.
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf`)).status).toBe(403);
      const [helfer] = await m.db
        .insert(m.schema.benutzer)
        .values({ organisationId: adminKontext.benutzer!.organisationId, email: "abogen-helfer@example.org", name: "Bogen Helfer", passwortHash: "-", rolle: "mitarbeiter" })
        .returning();
      const helferCookie = `schau_sitzung=${await neueSitzung({ benutzerId: helfer!.id })}`;
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf`, helferCookie)).status).toBe(403);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });

  test("Fremder Verein: weder seine Aussteller noch seine Schau", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const [org] = await m.db.insert(m.schema.organisation).values({ name: "Fremdverein Bogen" }).returning();
      const [fremd] = await m.db.insert(m.schema.aussteller).values({ organisationId: org!.id, vorname: "Fritz", nachname: "Fremdbogen", verein: "Fremdverein Bogen" }).returning();
      const s = await al().schau.anlegen({ name: "Eigene Bogenschau", ort: "Hier" });
      expect((await hol(`/datei/${s.id}/a-bogen-mitglieder.pdf?aussteller=${fremd!.id}`, cookie)).status).toBe(404);
      const [fremdeSchau] = await m.db.insert(m.schema.schau).values({ organisationId: org!.id, name: "Fremde Bogenschau", ort: "Dort", slug: "fremde-bogenschau" }).returning();
      expect((await hol(`/datei/${fremdeSchau!.id}/a-bogen-mitglieder.pdf`, cookie)).status).toBe(403);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });
});
