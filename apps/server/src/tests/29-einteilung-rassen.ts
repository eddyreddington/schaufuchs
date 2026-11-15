/** Preisrichter nach Rassen einteilen, vor den Katalognummern; die Bereiche folgen der Nummernvergabe. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Einteilung nach Rassen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("vor den Nummern einteilen, Vorschlag, Bereiche bei Vergabe und Nachmeldung, Sparten, von Hand nach Nummern hebt auf, Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Rassen Einteilung", ort: "Halle" });
    const s = await al().schau.get({ id });
    const such = async (q: string) => (await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q }))[0]!;
    const wyW = await such("Wyandotten weiß");
    const wyS = await such("Wyandotten schwarz");
    const st = await such("Strasser");
    const pos = (f: { id: number }) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const melde = (n: number, positionen: ReturnType<typeof pos>[]) =>
      al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Rasse", nachname: `Test${n}`, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen,
      });
    const r1 = await melde(1, [...Array.from({ length: 4 }, () => pos(wyW)), ...Array.from({ length: 3 }, () => pos(wyS)), ...Array.from({ length: 5 }, () => pos(st))]);
    await al().meldung.statusSetzen({ id: r1.meldungId, status: "bestaetigt" });

    // Vor den Nummern: alle Rassen mit Tierzahl und Farbenschlägen.
    const z = await al().preisrichter.zuteilung({ schauId: id });
    expect(z.nummeriert).toBe(false);
    const wy = z.gruppen.find((g) => g.rasse === wyW.rasse)!;
    const stG = z.gruppen.find((g) => g.rasse === st.rasse)!;
    expect(wy.anzahl).toBe(7);
    expect(wy.farben.map((f) => f.anzahl).sort()).toEqual([3, 4]);
    expect(stG.anzahl).toBe(5);

    const huhn = await al().preisrichter.speichern({ schauId: id, name: "Rasse Huhn", anschrift: "", email: "", telefon: "", istObmann: true, sparten: [wy.sparte] });
    const zwei = await al().preisrichter.speichern({ schauId: id, name: "Rasse Zwei", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [] });
    const taube = await al().preisrichter.speichern({ schauId: id, name: "Rasse Taube", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [stG.sparte] });

    // Vorschlag: jede Sparte bei ihrem Preisrichter, nichts fehlt.
    const v = await al().preisrichter.zuteilungVorschlagen({ schauId: id });
    expect(v.fehlend).toEqual([]);
    expect(v.regeln.find((x) => x.rasse === st.rasse && !x.farbenschlag)!.preisrichterId).not.toBe(huhn.id);

    // Sparte passt nicht: abgelehnt mit Namen.
    await expect(al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: huhn.id, sparte: stG.sparte, rasse: stG.rasse, farbenschlag: "" }] })).rejects.toThrow("Rasse Huhn bewertet keine");
    // Nur der Ausstellungsleitung.
    await expect(helfer().preisrichter.zuteilungSetzen({ schauId: id, regeln: [] })).rejects.toThrow();

    // Wyandotten an Huhn, schwarz an Zwei, Strasser an Taube – noch ohne Nummern: nur gespeichert.
    const regeln = [
      { preisrichterId: huhn.id, sparte: wy.sparte, rasse: wy.rasse, farbenschlag: "" },
      { preisrichterId: zwei.id, sparte: wy.sparte, rasse: wy.rasse, farbenschlag: wyS.farbenschlag },
      { preisrichterId: taube.id, sparte: stG.sparte, rasse: stG.rasse, farbenschlag: "" },
    ];
    expect((await al().preisrichter.zuteilungSetzen({ schauId: id, regeln })).bereiche).toBeNull();
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln).toHaveLength(3);
    expect((await al().preisrichter.liste({ schauId: id })).richter.every((r) => r.einteilung.length === 0)).toBe(true);

    // Nummern vergeben: Bereiche folgen der Einteilung.
    const k = await al().katalog.nummernVergeben({ schauId: id });
    expect(k.ohnePreisrichter).toBe(0);
    const liste = await al().katalog.liste({ schauId: id });
    const l = await al().preisrichter.liste({ schauId: id });
    expect(l.ohneZuteilung).toBe(0);
    const wer = (nr: number) => l.richter.find((r) => r.einteilung.some((e) => nr >= e.vonNr && nr <= e.bisNr))?.id;
    for (const e of liste) {
      const soll = e.rasse === st.rasse ? taube.id : e.farbenschlag === wyS.farbenschlag ? zwei.id : huhn.id;
      expect(wer(e.katalogNr!)).toBe(soll);
    }
    expect(l.richter.find((r) => r.id === huhn.id)!.tiere).toBe(4);

    // Nach den Nummern ändern: Bereiche gleich neu (schwarz jetzt auch an Huhn).
    const neu = await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: regeln.filter((x) => x.farbenschlag === "" ) });
    expect(neu.bereiche).not.toBeNull();
    expect((await al().preisrichter.liste({ schauId: id })).richter.find((r) => r.id === huhn.id)!.tiere).toBe(7);

    // Nachmeldung nach dem Festschreiben: Unternummer, Bereiche bleiben richtig.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    const r2 = await melde(2, [pos(st)]);
    await al().meldung.statusSetzen({ id: r2.meldungId, status: "bestaetigt" });
    const k2 = await al().katalog.nummernVergeben({ schauId: id });
    expect(k2.nachmeldungen).toBe(true);
    const l2 = await al().preisrichter.liste({ schauId: id });
    expect(l2.ohneZuteilung).toBe(0);
    expect(l2.richter.find((r) => r.id === taube.id)!.tiere).toBe(6);

    // Von Hand nach Nummern: Einteilung nach Rassen aufgehoben (Protokoll).
    const [{ ab }] = (await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }];
    const bereiche = l2.richter.flatMap((r) => r.einteilung.map((e) => ({ preisrichterId: r.id, vonNr: e.vonNr, bisNr: e.bisNr })));
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: bereiche });
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln).toEqual([]);
    const prot = (await m.db.select().from(m.schema.aenderung)).filter((p) => p.id > ab && p.schauId === id).sort((x, y) => x.id - y.id).map((p) => `${p.tabelle}:${p.aktion}`);
    expect(prot).toEqual(["pr_zuteilung:Einteilung nach Rassen aufgehoben (von Hand nach Nummern)", "pr_einteilung:gesetzt"]);
    // Ohne Regeln bleibt eine Einteilung von Hand bei der Nummernvergabe stehen.
    const r3 = await melde(3, [pos(wyW)]);
    await al().meldung.statusSetzen({ id: r3.meldungId, status: "bestaetigt" });
    expect((await al().katalog.nummernVergeben({ schauId: id })).ohnePreisrichter).toBeNull();
    expect((await al().preisrichter.liste({ schauId: id })).richter.flatMap((r) => r.einteilung.map((e) => [r.id, e.vonNr, e.bisNr]))).toEqual(
      l2.richter.flatMap((r) => r.einteilung.map((e) => [r.id, e.vonNr, e.bisNr])),
    );
  });
});
