/** Hallenplan festschreiben: Lage bleibt, Storno macht frei, Nachmeldung rückt nach; nur Ausstellungsleitung. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Hallenplan festschreiben", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("festschreiben (nur Administratoren, Protokoll); Storno gibt den Platz frei, Nachmeldung rückt hinein, sonst noch zu stellen; lösen rechnet neu", async () => {
    const { id } = await al().schau.anlegen({ name: "Fest Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Fest", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    await melden("Erster", 3);
    const zweiter = await melden("Zweiter", 1);
    await melden("Dritter", 2);
    await al().katalog.halleSetzen({ schauId: id, halle: { breite: 800, laenge: 1000, gang: 150, richtung: "laengs", wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] } });
    const lage = async () => Object.fromEntries((await helfer().katalog.hallenplan({ schauId: id })).plan!.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck])));
    const vorher = await lage();

    await expect(helfer().katalog.planFestschreiben({ schauId: id })).rejects.toThrow();
    await al().katalog.planFestschreiben({ schauId: id });
    expect((await helfer().katalog.hallenplan({ schauId: id })).plan!.fest).toMatchObject({ veraltet: false });

    // Storno des Zweiten: sein Platz bleibt frei, der Dritte rückt nicht auf.
    await al().meldung.statusSetzen({ id: zweiter, status: "storniert", grund: "Absage (Test)" });
    const nachStorno = await lage();
    expect(Object.keys(nachStorno)).toHaveLength(5);
    for (const [k, q] of Object.entries(nachStorno)) expect(q).toEqual(vorher[k]!);
    // Nachmeldung: die erste in den freien Platz, die zweite ans freie Reihenende; die anderen bleiben stehen.
    await melden("Vierter", 2);
    const p = (await helfer().katalog.hallenplan({ schauId: id })).plan!;
    expect(p.reihen.flatMap((r) => r.kaefige)).toHaveLength(7);
    expect(p.nichtPlatziert).toHaveLength(0);
    const jetzt = Object.fromEntries(p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck])));
    for (const [k, q] of Object.entries(nachStorno)) expect(jetzt[k]).toEqual(q);
    expect(Object.values(jetzt)).toContainEqual(Object.values(vorher).find((q) => !Object.values(nachStorno).some((x) => JSON.stringify(x) === JSON.stringify(q)))!);

    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).map((x) => x.aktion);
    expect(prot).toContain("Hallenplan festgeschrieben");
    // Lösen: die Automatik rechnet wieder, alle haben Platz.
    await expect(helfer().katalog.planLoesen({ schauId: id })).rejects.toThrow();
    await al().katalog.planLoesen({ schauId: id, grund: "neu aufstellen" });
    const neu = (await helfer().katalog.hallenplan({ schauId: id })).plan!;
    expect(neu.fest).toBeNull();
    expect(neu.nichtPlatziert).toHaveLength(0);
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).map((x) => x.aktion)).toContain("Hallenplan neu gesetzt");
  });
});
