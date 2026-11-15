/** Info-Hinweise aus Audit Runde 7 (Mengenbremse je /48). Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Info-Hinweise Runde 7", () => {
  test("Farbenschlagsuche: zusätzlich je /48 gebremst – viele /56 eines Netzes helfen nicht", async () => {
    const { anschlussSchluessel, netz48Schluessel } = await import("../services/bremse");
    expect(netz48Schluessel("2001:db8:abcd:12ff::/64")).toBe("2001:db8:abcd::/48");
    expect(netz48Schluessel("198.51.100.7")).toBeNull();
    expect(anschlussSchluessel("2001:db8:abcd:12ff::/64")).toBe("2001:db8:abcd:1200::/56");
    // 610 Suchen reihum aus allen 256 /56 desselben /48 (höchstens 3 je /56, weit unter 120): nur die /48-Stufe kann greifen.
    let gebremst = 0;
    for (let i = 0; i < 610; i++) {
      const netz = ((i % 256) << 8).toString(16); // 0, 100, 200 … ff00 – jeweils eigenes /56
      const pub = m.appRouter.createCaller({ ...leer, ip: `2001:db8:feed:${netz}::/64` });
      await pub.oeffentlich.farbenschlagSuche({ slug: "gibt-es-nicht", q: "ab" }).catch((e: Error) => {
        if (e.message.includes("Zu viele")) gebremst++;
      });
    }
    expect(gebremst).toBe(10);
    // Ein anderes /48 ist davon nicht betroffen.
    await expect(m.appRouter.createCaller({ ...leer, ip: "2001:db8:beef:100::/64" }).oeffentlich.farbenschlagSuche({ slug: "gibt-es-nicht", q: "ab" })).rejects.not.toThrow("Zu viele");
  });

  test("Tablet-Anmeldung meldet den Abschluss der Schau (das Tablet löscht dann seine Daten)", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const { id } = await al.schau.anlegen({ name: "Abschluss Tablet", ort: "Halle" });
    const slug = (await al.schau.get({ id })).slug;
    const pub = m.appRouter.createCaller(leer);
    expect((await pub.richter.anmeldeInfo({ slug })).abgeschlossen).toBe(false);
    await al.schau.phaseSetzen({ id, phase: "abgeschlossen", trotzdem: true, grund: "Test: Tablet räumt auf" });
    const info = await pub.richter.anmeldeInfo({ slug });
    expect(info).toMatchObject({ abgeschlossen: true, offen: false, richter: [] });
  });
});
