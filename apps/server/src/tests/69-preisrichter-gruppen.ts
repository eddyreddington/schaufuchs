/**
 * Preisrichter, Stufe 1: BDRG-Gruppen je Rasse (Verzeichnis, CSV) und je Preisrichter mit Prüfung in der Einteilung,
 * Zuordnung zu einem Obmann, Stand der Zusage. Gruppen im Test erfunden (X1, X2), keine echte Zuordnung. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Preisrichter: Gruppen, Obmann, Zusage", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  const protokollAb = async () => ((await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }])[0].ab;
  const protokoll = async (ab: number, tabelle: string) => (await m.db.select().from(m.schema.aenderung)).filter((p) => p.id > ab && p.tabelle === tabelle).sort((x, y) => x.id - y.id);
  const richter = (schauId: number, name: string, mehr: Record<string, unknown> = {}) =>
    al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten: [], ...mehr });

  test("Gruppen im Verzeichnis: CSV mit Spalte Gruppe, Pflege je Rasse, nur Ausstellungsleitung, Protokoll", async () => {
    // Jahr 2000: wird nie die Vorgabe für neue Schauen.
    const csv = "Sparte;Rasse;Farbenschlag;Gruppe\nTestsparte;Testhuhn;weiß;x1\nTestsparte;Testhuhn;rot;\nTestsparte;Probehuhn;blau";
    const imp = await al().stammdaten.importieren({ name: "Gruppentest", jahr: 2000, quelle: "Test", csv });
    expect(imp.hinweise).toEqual([]);
    const g = await al().stammdaten.gliederung({ versionId: imp.versionId });
    expect(g.rassen.map((r) => [r.name, r.gruppe])).toEqual([["Testhuhn", "X1"], ["Probehuhn", ""]]);
    expect((await al().stammdaten.baum({ versionId: imp.versionId })).map((z) => z.gruppe)).toEqual(["X1", "X1", ""]);

    const probe = g.rassen.find((r) => r.name === "Probehuhn")!;
    const ab = await protokollAb();
    expect(await al().stammdaten.gruppenSetzen({ versionId: imp.versionId, gruppen: [{ rasseId: probe.id, gruppe: " x 2" }] })).toEqual({ geaendert: 1 });
    expect((await al().stammdaten.gliederung({ versionId: imp.versionId })).rassen.find((r) => r.id === probe.id)!.gruppe).toBe("X2");
    const p = await protokoll(ab, "stammdaten_version");
    expect(p.map((x) => x.aktion)).toEqual(["Gruppen geändert"]);
    expect(p[0]!.neu).toEqual([{ rasse: "Probehuhn", alt: "", neu: "X2" }]);
    // Unverändert: nichts zu tun, kein Protokoll.
    expect(await al().stammdaten.gruppenSetzen({ versionId: imp.versionId, gruppen: [{ rasseId: probe.id, gruppe: "X2" }] })).toEqual({ geaendert: 0 });
    expect(await protokoll(ab, "stammdaten_version")).toHaveLength(1);

    await expect(al().stammdaten.gruppenSetzen({ versionId: imp.versionId, gruppen: [{ rasseId: probe.id, gruppe: "viel zu lang!" }] })).rejects.toThrow();
    await expect(helfer().stammdaten.gruppenSetzen({ versionId: imp.versionId, gruppen: [{ rasseId: probe.id, gruppe: "A" }] })).rejects.toThrow();
    // Rasse einer anderen Version: nicht gefunden.
    const andere = (await al().stammdaten.gliederung({ versionId: (await al().schau.get({ id: (await al().schau.liste())[0]!.id })).stammdatenVersionId! })).rassen[0]!;
    await expect(al().stammdaten.gruppenSetzen({ versionId: imp.versionId, gruppen: [{ rasseId: andere.id, gruppe: "A" }] })).rejects.toThrow("Rasse nicht gefunden");
    await al().stammdaten.loeschen({ id: imp.versionId });
  });

  test("Einteilung nach Rassen und nach Nummern: Rasse einer fremden Gruppe abgelehnt, Vorschlag beachtet die Gruppen", async () => {
    const { id } = await al().schau.anlegen({ name: "Gruppen Einteilung", ort: "Halle" });
    const s = await al().schau.get({ id });
    const versionId = s.stammdatenVersionId!;
    const such = async (q: string) => (await al().stammdaten.suche({ versionId, q }))[0]!;
    const wy = await such("Wyandotten weiß");
    const st = await such("Strasser");
    const setzeGruppen = (wyG: string, stG: string) => al().stammdaten.gruppenSetzen({ versionId, gruppen: [{ rasseId: wy.rasseId, gruppe: wyG }, { rasseId: st.rasseId, gruppe: stG }] });
    await setzeGruppen("X1", "X2");
    try {
      const pos = (f: { id: number }) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Gruppe", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [...Array.from({ length: 20 }, () => pos(wy)), ...Array.from({ length: 20 }, () => pos(st))],
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });

      // Erst der ohne Gruppen: ohne Prüfung der Gruppen bekäme „Gruppe Eins“ als zweiter in Katalogfolge die Strasser.
      const frei = await richter(id, "Gruppe Frei");
      const x1 = await richter(id, "Gruppe Eins", { gruppen: ["x1"] });
      expect((await al().preisrichter.liste({ schauId: id })).richter.find((x) => x.id === x1.id)!.gruppen).toEqual(["X1"]);
      await expect(richter(id, "Gruppe Falsch", { gruppen: ["viel zu lang!"] })).rejects.toThrow();

      const z = await al().preisrichter.zuteilung({ schauId: id });
      expect(z.gruppen.find((g) => g.rasse === st.rasse)!.gruppe).toBe("X2");
      const stG = z.gruppen.find((g) => g.rasse === st.rasse)!;
      const wyGr = z.gruppen.find((g) => g.rasse === wy.rasse)!;
      // Nach Rassen: Strasser (X2) nicht an den Preisrichter mit nur X1.
      await expect(al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: x1.id, sparte: stG.sparte, rasse: stG.rasse, farbenschlag: "" }] })).rejects.toThrow(
        "Gruppe Eins bewertet keine Gruppe X2 (Strasser). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Gruppe ergänzen.",
      );
      // Ein Farbenschlag zählt mit der Gruppe seiner Rasse.
      await expect(al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: x1.id, sparte: stG.sparte, rasse: stG.rasse, farbenschlag: st.farbenschlag }] })).rejects.toThrow("bewertet keine Gruppe X2");
      // Vorschlag: Strasser nie bei „Gruppe Eins“.
      const v = await al().preisrichter.zuteilungVorschlagen({ schauId: id });
      expect(v.fehlend).toEqual([]);
      expect(v.regeln.filter((x) => x.rasse === st.rasse).every((x) => x.preisrichterId === frei.id)).toBe(true);
      await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: x1.id, sparte: wyGr.sparte, rasse: wyGr.rasse, farbenschlag: "" }, { preisrichterId: frei.id, sparte: stG.sparte, rasse: stG.rasse, farbenschlag: "" }] });

      // Nach Nummern: ein Bereich über alle Nummern an „Gruppe Eins“ wird abgelehnt.
      await al().katalog.nummernVergeben({ schauId: id });
      const liste = await al().katalog.liste({ schauId: id });
      const nr = liste.map((e) => e.katalogNr!);
      await expect(al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: x1.id, vonNr: Math.min(...nr), bisNr: Math.max(...nr) }] })).rejects.toThrow(
        /^Gruppe Eins bewertet keine Gruppe X2 \(Nr\. .+\)\. Bitte die Bereiche anders verteilen oder beim Preisrichter die Gruppe ergänzen\.$/,
      );
      // Sparte und Gruppe zugleich falsch: der Schluss nennt beides.
      const taube = await richter(id, "Gruppe Taube", { sparten: [stG.sparte], gruppen: ["X1"] });
      await expect(al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: taube.id, vonNr: Math.min(...nr), bisNr: Math.max(...nr) }] })).rejects.toThrow(
        /^Gruppe Taube bewertet keine .+ \(Nr\. .+\); Gruppe Taube bewertet keine Gruppe X2 \(Nr\. .+\)\. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte bzw\. Gruppe ergänzen\.$/,
      );
      await al().preisrichter.loeschen({ schauId: id, id: taube.id });
      // Vorschlag nach Nummern: kein Strasser im Bereich von „Gruppe Eins“.
      const vn = await al().preisrichter.einteilungVorschlagen({ schauId: id });
      const strasserNr = liste.filter((e) => e.rasse === st.rasse).map((e) => e.katalogNr!);
      expect(vn.einteilung.filter((b) => b.preisrichterId === x1.id).some((b) => strasserNr.some((n) => n >= b.vonNr && n <= b.bisNr))).toBe(false);
      expect(vn.einteilung.some((b) => b.preisrichterId === x1.id)).toBe(true);

      // Ohne Gruppe an der Rasse keine Einschränkung über Gruppen.
      await setzeGruppen("X1", "");
      await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: x1.id, vonNr: Math.min(...nr), bisNr: Math.max(...nr) }] });
    } finally {
      await setzeGruppen("", "");
    }
  });

  test("Obmann-Zuordnung und Zusage: Prüfung, Liste, Protokoll, Obmann weg, Vorlage", async () => {
    const { id } = await al().schau.anlegen({ name: "Obmann Zusage", ort: "Halle" });
    const obmann = await richter(id, "Zusage Obmann", { istObmann: true });
    const pr = await richter(id, "Zusage Richter", { obmannId: obmann.id });
    const anderer = await richter(id, "Zusage Anderer");
    const l = (await al().preisrichter.liste({ schauId: id })).richter;
    const p = l.find((x) => x.id === pr.id)!;
    expect(p.obmannId).toBe(obmann.id);
    expect([p.zusage, p.zugesagtFuer, p.vorbehalt, p.gruppen]).toEqual(["offen", "", "", []]);

    await expect(richter(id, "Zusage Richter", { id: pr.id, obmannId: pr.id })).rejects.toThrow("Ein Preisrichter kann nicht sein eigener Obmann sein.");
    await expect(richter(id, "Zusage Richter", { id: pr.id, obmannId: anderer.id })).rejects.toThrow("Der gewählte Preisrichter ist kein Obmann.");
    const fremd = await al().schau.anlegen({ name: "Obmann Fremd", ort: "Halle" });
    const fremdObmann = await richter(fremd.id, "Fremd Obmann", { istObmann: true });
    await expect(richter(id, "Zusage Richter", { id: pr.id, obmannId: fremdObmann.id })).rejects.toThrow("Obmann nicht gefunden.");

    // Zusage ändern: Protokoll mit altem und neuem Stand (Vorbehalt nur als geändert); fehlende Angaben bleiben, wie sie sind.
    const ab = await protokollAb();
    await richter(id, "Zusage Richter", { id: pr.id, zusage: "zugesagt", zugesagtFuer: "2027 und 2028", vorbehalt: "klären wir, wenn der Termin bekannt ist" });
    const n = (await al().preisrichter.liste({ schauId: id })).richter.find((x) => x.id === pr.id)!;
    expect([n.zusage, n.zugesagtFuer, n.vorbehalt, n.obmannId]).toEqual(["zugesagt", "2027 und 2028", "klären wir, wenn der Termin bekannt ist", obmann.id]);
    const prot = await protokoll(ab, "preisrichter");
    expect(prot.map((x) => [x.datensatzId, x.aktion])).toEqual([[pr.id, "geändert"]]);
    expect(prot[0]!.alt).toEqual({ zusage: "offen", zugesagtFuer: "" });
    expect(prot[0]!.neu).toEqual({ zusage: "zugesagt", zugesagtFuer: "2027 und 2028", geaendertOhneWert: ["vorbehalt"] });
    const neuAngelegt = await richter(id, "Zusage Neu", { zusage: "abgesagt" });
    expect((await protokoll(ab, "preisrichter")).at(-1)!.aktion).toBe("angelegt");
    await expect(richter(id, "Zusage Falsch", { zusage: "vielleicht" })).rejects.toThrow();

    // Vorlage: die neue Schau bekommt eigene Preisrichter, der Obmann zeigt auf ihren Obmann; die Zusage startet wieder
    // bei „offen“, ohne „zugesagt für“ und Vorbehalt.
    const kopie = await al().schau.anlegen({ name: "Obmann Kopie", ort: "Halle", vorlageId: id });
    const k = (await al().preisrichter.liste({ schauId: kopie.id })).richter;
    const kr = k.find((x) => x.name === "Zusage Richter")!;
    expect(kr.obmannId).toBe(k.find((x) => x.name === "Zusage Obmann")!.id);
    expect([kr.zusage, kr.zugesagtFuer, kr.vorbehalt]).toEqual(["offen", "", ""]);

    // Obmann nicht mehr Obmann: Zuordnung gelöst (mit Protokoll); gelöscht: ebenso.
    await richter(id, "Zusage Obmann", { id: obmann.id, istObmann: false });
    expect((await al().preisrichter.liste({ schauId: id })).richter.find((x) => x.id === pr.id)!.obmannId).toBeNull();
    expect((await protokoll(ab, "preisrichter")).some((x) => x.datensatzId === pr.id && x.aktion === "Obmann-Zuordnung gelöst")).toBe(true);
    await richter(id, "Zusage Obmann", { id: obmann.id, istObmann: true });
    await richter(id, "Zusage Richter", { id: pr.id, obmannId: obmann.id });
    await al().preisrichter.loeschen({ schauId: id, id: obmann.id });
    expect((await al().preisrichter.liste({ schauId: id })).richter.find((x) => x.id === pr.id)!.obmannId).toBeNull();
    expect(neuAngelegt.id).toBeGreaterThan(0);
  });
});
