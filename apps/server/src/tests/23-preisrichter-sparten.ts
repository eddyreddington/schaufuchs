/** Preisrichter bewerten nur ihre Sparten: Einteilung (Vorschlag und von Hand) beachtet das. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Preisrichter je Sparte", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  test("Sparten speichern; Vorschlag gibt Tauben nur Taubenrichtern; falsche Einteilung von Hand wird abgelehnt; niemand für eine Sparte: Hinweis", async () => {
    const { id } = await al().schau.anlegen({ name: "Sparten Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const pos = (f: { id: number }) => ({ farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Sparte", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [...Array.from({ length: 6 }, () => pos(wy!)), ...Array.from({ length: 6 }, () => pos(st!))],
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const liste = await al().katalog.liste({ schauId: id });
    const sparteVon = (nr: number) => liste.find((e) => e.katalogNr === nr)!.sparte;
    const huhnSparte = liste.find((e) => e.rasse?.includes("Wyandotten"))!.sparte!;
    const taubenSparte = liste.find((e) => e.rasse?.includes("Strasser"))!.sparte!;

    // Nur Hühner: noch niemand für Tauben – Hinweis, Tauben ohne Preisrichter.
    const huhn = await al().preisrichter.speichern({ schauId: id, name: "Nur Huhn", anschrift: "", email: "", telefon: "", istObmann: true, sparten: [huhnSparte] });
    const nurHuhn = await al().preisrichter.einteilungVorschlagen({ schauId: id });
    expect(nurHuhn.fehlend).toEqual([taubenSparte]);
    for (const e of nurHuhn.einteilung) for (let nr = e.vonNr; nr <= e.bisNr; nr++) if (liste.some((x) => x.katalogNr === nr)) expect(sparteVon(nr)).toBe(huhnSparte);

    // Mit Taubenrichter: alles verteilt, jeder nur seine Sparte.
    const taube = await al().preisrichter.speichern({ schauId: id, name: "Nur Taube", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [taubenSparte] });
    const v = await al().preisrichter.einteilungVorschlagen({ schauId: id });
    expect(v.fehlend).toEqual([]);
    const wer = new Map<number, number>();
    for (const e of v.einteilung) for (let nr = e.vonNr; nr <= e.bisNr; nr++) wer.set(nr, e.preisrichterId);
    for (const e of liste) expect(wer.get(e.katalogNr!)).toBe(e.sparte === taubenSparte ? taube.id : huhn.id);
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: v.einteilung });
    expect((await al().preisrichter.liste({ schauId: id })).richter.find((x) => x.id === taube.id)!.sparten).toEqual([taubenSparte]);

    // Von Hand alles dem Hühnerrichter: abgelehnt mit Name und Sparte.
    const alle = { preisrichterId: huhn.id, vonNr: 1, bisNr: Math.max(...liste.map((e) => e.katalogNr!)) };
    await expect(al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [alle] })).rejects.toThrow(`Nur Huhn bewertet keine ${taubenSparte}`);
    // Ohne Einschränkung (Sparten leer) bewertet er alles.
    await al().preisrichter.speichern({ schauId: id, id: huhn.id, name: "Nur Huhn", anschrift: "", email: "", telefon: "", istObmann: true, sparten: [] });
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [alle] });
    // Name mit „|“ bleibt in der Meldung ganz.
    await al().preisrichter.speichern({ schauId: id, id: huhn.id, name: "Huhn|Meier", anschrift: "", email: "", telefon: "", istObmann: true, sparten: [huhnSparte] });
    await expect(al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [alle] })).rejects.toThrow(`Huhn|Meier bewertet keine ${taubenSparte}`);
  });
});
