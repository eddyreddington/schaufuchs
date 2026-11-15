/**
 * Entwürfe des Hallenplans (Entscheidung 017): speichern, laden, umbenennen, löschen; entscheiden legt die übrigen ins
 * Archiv; aus dem Archiv in eine spätere Schau laden. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Hallenplan-Entwürfe", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: true, quergang: true, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] };
  const breite = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!.halle!.breite;
  let schauId = 0;

  test("Varianten speichern und laden, mit Protokoll", async () => {
    ({ id: schauId } = await al().schau.anlegen({ name: "Entwurfschau", ort: "Musterdorf" }));
    // Eine neue Schau übernimmt die Halle der letzten; ohne Halle gibt es nichts zu speichern.
    await m.db.update(m.schema.schau).set({ halle: null }).where(m.eq(m.schema.schau.id, schauId));
    await expect(al().hallenentwurf.speichern({ schauId, name: "A" })).rejects.toThrow("Erst die Halle anlegen");
    await al().katalog.halleSetzen({ schauId, halle });
    const { id: a } = await al().hallenentwurf.speichern({ schauId, name: "Variante A – 10 m" });
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, breite: 1400 } });
    const { id: b } = await al().hallenentwurf.speichern({ schauId, name: "Variante B – 14 m" });
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, breite: 1800 } });
    await al().hallenentwurf.speichern({ schauId, name: "Variante C – 18 m" });

    await al().hallenentwurf.laden({ schauId, id: a });
    expect(await breite(schauId)).toBe(1000);
    const l = await al().hallenentwurf.liste({ schauId });
    expect(l.entwuerfe.map((e) => e.name)).toEqual(["Variante C – 18 m", "Variante B – 14 m", "Variante A – 10 m"]);
    expect(l.entwuerfe.find((e) => e.id === b)!.masse).toEqual({ breite: 1400, laenge: 2000 });
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId));
    expect(prot.some((p) => p.aktion === "Hallenplan als Entwurf gespeichert")).toBe(true);
    expect(prot.some((p) => p.aktion === "Hallenplan neu gesetzt" && p.grund === "Entwurf „Variante A – 10 m“ geladen")).toBe(true);

    await al().hallenentwurf.umbenennen({ id: a, name: "Variante A" });
    expect((await al().hallenentwurf.liste({ schauId })).entwuerfe.some((e) => e.name === "Variante A")).toBe(true);
  });

  test("Entscheiden: gewählter Entwurf gilt, die übrigen gehen ins Archiv", async () => {
    const vorher = (await al().hallenentwurf.liste({ schauId })).entwuerfe;
    const b = vorher.find((e) => e.name.startsWith("Variante B"))!;
    expect(await al().hallenentwurf.entscheiden({ schauId, id: b.id })).toEqual({ archiviert: 2 });
    expect(await breite(schauId)).toBe(1400);
    const l = await al().hallenentwurf.liste({ schauId });
    expect(l.entwuerfe).toHaveLength(0);
    expect(l.archiv.map((e) => e.name).sort()).toEqual(["Variante A", "Variante C – 18 m"]);
    expect(l.archiv.every((e) => e.herkunft === "Entwurfschau" && e.archiviertAm)).toBe(true);
  });

  test("Spätere Schau: aus dem Archiv laden; fremde Entwürfe nicht", async () => {
    const { id: neu } = await al().schau.anlegen({ name: "Spätere Schau", ort: "Musterdorf" });
    const l = await al().hallenentwurf.liste({ schauId: neu });
    expect(l.entwuerfe).toHaveLength(0);
    const c = l.archiv.find((e) => e.name.startsWith("Variante C"))!;
    await al().hallenentwurf.laden({ schauId: neu, id: c.id });
    expect(await breite(neu)).toBe(1800);
    // Entwurf einer anderen Schau (nicht im Archiv) lässt sich hier nicht laden.
    await al().katalog.halleSetzen({ schauId, halle });
    const { id: x } = await al().hallenentwurf.speichern({ schauId, name: "Nur für die Entwurfschau" });
    await expect(al().hallenentwurf.laden({ schauId: neu, id: x })).rejects.toThrow("anderen Schau");
    await expect(al().hallenentwurf.laden({ schauId: neu, id: 999_999 })).rejects.toThrow("nicht gefunden");
    await al().hallenentwurf.loeschen({ id: x });
    expect((await al().hallenentwurf.liste({ schauId })).entwuerfe).toHaveLength(0);
  });
});
