/**
 * Sprache der Oberfläche (Entscheidung 022): am Konto gespeichert, nur die eigenen Sprachen, nur angemeldet.
 * Meldungen des Servers bleiben deutsch und werden erst in der Oberfläche übersetzt (serverText).
 */
import { describe, expect, test } from "bun:test";
import { serverText } from "@schau/domain";
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
    const f = (await al().schau.get({ id: 2_000_000_000 }).catch((e: unknown) => e)) as Error;
    expect(f.message).toMatch(/[a-zäöü]/);
    expect(serverText(f.message, "de")).toBe(f.message);
    expect(serverText(f.message, "en")).not.toBe(f.message);
  });
});
