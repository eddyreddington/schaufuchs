/**
 * Sprache der Oberfläche (Entscheidung 022): am Konto gespeichert, nur die eigenen Sprachen, nur angemeldet.
 * Meldungen des Servers bleiben deutsch und werden erst in der Oberfläche übersetzt (serverText).
 */
import { describe, expect, test } from "bun:test";
import { ladeOberflaeche, serverText } from "@schau/domain";
import { adminKontext, leer, m } from "./kontext";

describe("Sprache der Oberfläche", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const sprache = async () => (await m.db.select({ s: m.schema.benutzer.sprache }).from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, adminKontext.benutzer!.id)))[0]?.s;

  test("eigene Sprache speichern, unbekannte abgelehnt, ohne Anmeldung nicht", async () => {
    await al().auth.spracheSetzen({ sprache: "pl" });
    expect(await sprache()).toBe("pl");
    await al().auth.spracheSetzen({ sprache: "de-CH" });
    expect(await sprache()).toBe("de-CH");
    await expect(al().auth.spracheSetzen({ sprache: "xx" as "de" })).rejects.toThrow();
    await expect(m.appRouter.createCaller(leer).auth.spracheSetzen({ sprache: "en" })).rejects.toThrow();
    await al().auth.spracheSetzen({ sprache: "de" });
  });

  test("Fehler des Servers kommen deutsch und lassen sich übersetzen", async () => {
    await ladeOberflaeche("en");
    const f = (await al().schau.get({ id: 2_000_000_000 }).catch((e: unknown) => e)) as Error;
    expect(f.message).toMatch(/[a-zäöü]/);
    expect(serverText(f.message, "de")).toBe(f.message);
    expect(serverText(f.message, "en")).not.toBe(f.message);
  });

  test("Fehlertexte der Datei-Adressen in der Sprache des Kontos bzw. des Links, sonst deutsch", async () => {
    const server = (await import("../index")).default;
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, setCookie: (c: string) => (cookie = c) }).auth.anmelden({ email: "al@test.de", passwort: "sehr-geheim-123" });
    const sitzung = cookie.split(";")[0]!;
    const hol = (pfad: string, mitSitzung = true) => server.fetch(new Request(`http://test${pfad}`, { headers: mitSitzung ? { cookie: sitzung } : {} }));
    try {
      // Angemeldet mit Englisch: eine fremde Schau ist „keine Berechtigung“ – auf Englisch, mit Status 403.
      await al().auth.spracheSetzen({ sprache: "en" });
      let r = await hol("/datei/2000000000/ueberweisungen.xml");
      expect(r.status).toBe(403);
      const englisch = await r.text();
      expect(englisch).toBe(serverText("Nicht angemeldet oder keine Berechtigung.", "en"));
      expect(englisch).not.toBe("Nicht angemeldet oder keine Berechtigung.");
      // Öffentliche Adressen richten sich nur nach dem Link (Zwischenspeicher), nicht nach dem Konto.
      expect(await (await hol("/s/gibt-es-nicht/a-bogen.pdf")).text()).toBe("Schau nicht gefunden.");
      // Ohne eigene Wahl: deutsch, wie bisher.
      await al().auth.spracheSetzen({ sprache: "de" });
      r = await hol("/datei/2000000000/ueberweisungen.xml");
      expect(await r.text()).toBe("Nicht angemeldet oder keine Berechtigung.");
      // Seiten für Aussteller: die Sprache kommt mit dem Link; ohne Anmeldung, ohne Link deutsch.
      r = await hol("/s/gibt-es-nicht/a-bogen.pdf?sprache=fr", false);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe(serverText("Schau nicht gefunden.", "fr"));
      expect(await (await hol("/s/gibt-es-nicht/a-bogen.pdf", false)).text()).toBe("Schau nicht gefunden.");
      // Unbekannte Sprache im Link: deutsch.
      expect(await (await hol("/s/gibt-es-nicht/a-bogen.pdf?sprache=xx", false)).text()).toBe("Schau nicht gefunden.");
    } finally {
      await al().auth.spracheSetzen({ sprache: "de" });
    }
  });
});
