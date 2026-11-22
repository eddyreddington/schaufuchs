/**
 * Jugend in der Einteilung, Gegenprüfung: Umschalten meldet Tiere ohne Preisrichter und Nachmeldungen wie das Speichern
 * der Einteilung; gespeicherte Jugendregeln überstehen bei „mit der Rasse“ ein Speichern ohne sie (etwa nach „Gleichmäßig
 * verteilen“). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (n: string) => ({ vorname: "Gegen", nachname: n, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
const melde = async (schauId: number, n: string, fids: number[], istJugend = false) => {
  const r = await al().meldung.speichern({ schauId, aussteller: aussteller(n), eingang: "papier", istJugend, bemerkung: "", zustimmung: true, positionen: fids.map(pos) });
  await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
};
/** Zwei Rassen derselben Sparte. */
async function rassen(versionId: number) {
  const zeilen = (await m.sql`
    select s.name as sparte, r.name as rasse, f.id as fid
    from rasse r join sparte s on s.id = r.sparte_id join farbenschlag f on f.rasse_id = r.id
    where r.version_id = ${versionId} order by s.folge, r.folge, f.folge`) as unknown as { sparte: string; rasse: string; fid: number }[];
  const a = zeilen[0]!;
  const b = zeilen.find((z) => z.sparte === a.sparte && z.rasse !== a.rasse)!;
  return { a, b };
}
const richter = (schauId: number, name: string) => al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten: [] });

describe("Jugend in der Einteilung: Gegenprüfung", () => {
  test("Umschalten meldet Tiere ohne Preisrichter; Jugendregeln bleiben bei „mit der Rasse“ gespeichert", async () => {
    const { id } = await al().schau.anlegen({ name: "Jugend Gegenprüfung", ort: "Halle" });
    const { a, b } = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    // Rasse A mit Senioren, Rasse B nur mit Jugend.
    await melde(id, "Senior", [a.fid]);
    await melde(id, "Junior", [a.fid, b.fid, b.fid], true);
    const X = await richter(id, "GX");
    const Y = await richter(id, "GY");
    // Vor den Nummern: nichts zu melden.
    expect(await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: true })).toEqual({ bereiche: null, ohne: 0, abweichend: [] });
    const senioren = [{ preisrichterId: X.id, sparte: a.sparte, rasse: a.rasse, farbenschlag: "" }];
    const jugend = { preisrichterId: Y.id, sparte: b.sparte, rasse: b.rasse, farbenschlag: "", jugend: true };
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [...senioren, jugend] });
    await al().katalog.nummernVergeben({ schauId: id });

    // Zurück „mit der Rasse“: die Jugend von B hat keine Rassenregel – zwei Tiere ohne Preisrichter, gemeldet wie beim Speichern.
    const r = await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: false });
    expect(r.bereiche).not.toBeNull();
    expect([r.ohne, r.abweichend]).toEqual([2, []]);

    // Speichern ohne die (unsichtbaren) Jugendregeln, etwa nach „Gleichmäßig verteilen“: sie bleiben gespeichert.
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ ...senioren[0]!, preisrichterId: Y.id }] });
    const regeln = (await al().preisrichter.zuteilung({ schauId: id })).regeln;
    expect(regeln.filter((x) => x.jugend).map((x) => [x.preisrichterId, x.rasse])).toEqual([[Y.id, b.rasse]]);
    expect(regeln.filter((x) => !x.jugend).map((x) => x.preisrichterId)).toEqual([Y.id]);
    // Jugendregeln in der Eingabe ändern bei „mit der Rasse“ nichts.
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [...senioren, { ...jugend, preisrichterId: X.id }] });
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln.filter((x) => x.jugend).map((x) => x.preisrichterId)).toEqual([Y.id]);

    // Wieder „separat“: die Jugend von B hat ihren Preisrichter wieder.
    const s = await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: true });
    expect(s.ohne).toBe(0);
    // Bei „separat“ ersetzt das Speichern auch die Jugendregeln.
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: senioren });
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln.filter((x) => x.jugend)).toEqual([]);
  });
});
