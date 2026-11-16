/**
 * A-Bogen (Meldebogen zum Ausfüllen und Unterschreiben): leer öffentlich über die Schauseite, leer und vorausgefüllt
 * für die Ausstellungsleitung. Nur eigene Meldungen, keine Bankdaten, abgesagte Schau ohne Bogen.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m, pdfText } from "./kontext";

describe("A-Bogen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const server = async () => (await import("../index")).default;
  const hol = async (pfad: string, cookie = "") => (await server()).fetch(new Request(`http://test${pfad}`, { headers: cookie ? { cookie } : {} }));

  test("leer öffentlich, vorausgefüllt nur für die eigene Schau – ohne IBAN", async () => {
    const cfg = (await import("../config")).config;
    const pflichtVorher = cfg.zweiFaktorPflichtAdmin;
    cfg.zweiFaktorPflichtAdmin = false;
    try {
      const { neueSitzung } = await import("../auth");
      const cookie = `schau_sitzung=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
      const s = await al().schau.anlegen({ name: "Meldebogenschau", ort: "Papierstadt" });
      const d = await al().schau.get({ id: s.id });
      await al().schau.aktualisieren({ id: s.id, daten: { ...d, meldeschluss: "2026-12-01", erklaerungen: "Nicht aus einem Sperrbezirk." } });
      await al().schau.gebuehrenSetzen({ schauId: s.id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 450, befreitPreisrichter: false }] });
      const [farbe] = await al().stammdaten.suche({ versionId: d.stammdatenVersionId!, q: "Wyandotten weiß" });
      const r = await al().meldung.speichern({
        schauId: s.id,
        aussteller: { vorname: "Paula", nachname: "Papierbogen", strasse: "Feldweg 3", plz: "34117", ort: "Kassel", telefon: "", email: "paula@test.de", verein: "GZV Feld", kreisverband: "", registriernummer: "276 06 535 012 0058", geburtsdatum: null, istPreisrichter: false, iban: "DE02120300000000202051", kontoinhaber: "" },
        eingang: "papier",
        istJugend: false,
        bemerkung: "Käfige bitte nebeneinander",
        zustimmung: false,
        positionen: [
          { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier", geschlecht: "0,1", alter: "alt", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3500, ringnummern: "D 26 AZ 58" },
        ],
      });

      // Öffentlich: leerer Bogen mit Schau, Gebühr, Erklärung und Unterschriftsfeld – ohne Anmeldung.
      const offen = await hol(`/s/${d.slug}/a-bogen.pdf`);
      expect(offen.status).toBe(200);
      expect(offen.headers.get("content-type")).toContain("application/pdf");
      const leerText = pdfText(Buffer.from(await offen.arrayBuffer()));
      for (const t of ["Meldebogenschau", "Einzeltier", "4,50 €", "01.12.2026", "Nicht aus einem Sperrbezirk.", "Unterschrift Aussteller", "Registriernummer"]) expect(leerText).toContain(t);
      expect(leerText).not.toContain("Papierbogen");
      expect((await hol(`/s/gibt-es-nicht/a-bogen.pdf`)).status).toBe(404);

      // Ausstellungsleitung: vorausgefüllt aus der Meldung, die IBAN steht nie darauf.
      const voll = await hol(`/datei/${s.id}/a-bogen.pdf?meldung=${r.meldungId}`, cookie);
      expect(voll.status).toBe(200);
      const vollText = pdfText(Buffer.from(await voll.arrayBuffer()));
      for (const t of ["Paula", "Papierbogen", "Feldweg 3", "276 06 535 012 0058", "Wyandotten", "D 26 AZ 58", "35,00", `Nr. ${r.meldungId}`, "Käfige bitte nebeneinander", `/s/${d.slug}/datenschutz`]) expect(vollText).toContain(t);
      expect(vollText).not.toContain("DE02");
      expect((await hol(`/datei/${s.id}/a-bogen.pdf`, cookie)).status).toBe(200);
      // Ohne Anmeldung nichts; eine Meldung einer anderen Schau ergibt keinen Bogen.
      expect((await hol(`/datei/${s.id}/a-bogen.pdf?meldung=${r.meldungId}`)).status).toBe(403);
      const andere = await al().schau.anlegen({ name: "Andere Meldebogenschau", ort: "Anderswo" });
      expect((await hol(`/datei/${andere.id}/a-bogen.pdf?meldung=${r.meldungId}`, cookie)).status).toBe(404);
      expect((await hol(`/datei/${s.id}/a-bogen.pdf?meldung=abc`, cookie)).status).toBe(404);

      // Abgesagte Schau: kein Bogen mehr öffentlich.
      await al().schau.absagen({ id: s.id, grund: "Sperrbezirk eingerichtet" });
      expect((await hol(`/s/${d.slug}/a-bogen.pdf`)).status).toBe(404);
    } finally {
      cfg.zweiFaktorPflichtAdmin = pflichtVorher;
    }
  });
});
