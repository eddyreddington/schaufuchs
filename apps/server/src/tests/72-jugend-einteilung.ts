/**
 * Jugend separat oder eingereiht: Katalognummern (eigener Block am Ende oder in der Rasse) und Preisrichter-Einteilung
 * nach Rassen („mit der Rasse“ wie bisher oder „separat“ mit eigenen Zeilen und Regeln je Rasse), Vorschlag, Sparten der
 * Preisrichter, Protokoll, Rückfrage bei bewerteten Tieren, Vorlage. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (n: string) => ({ vorname: "Jugend", nachname: n, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
const melde = async (schauId: number, n: string, fids: number[], istJugend = false) => {
  const r = await al().meldung.speichern({ schauId, aussteller: aussteller(n), eingang: "papier", istJugend, bemerkung: "", zustimmung: true, positionen: fids.map(pos) });
  await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
  return r.meldungId;
};
/** Zwei Rassen derselben Sparte (die erste mit zwei Farbenschlägen) und eine Rasse einer anderen Sparte. */
async function rassen(versionId: number) {
  const zeilen = (await m.sql`
    select s.name as sparte, r.name as rasse, f.id as fid, f.name as farbe
    from rasse r join sparte s on s.id = r.sparte_id join farbenschlag f on f.rasse_id = r.id
    where r.version_id = ${versionId} order by s.folge, r.folge, f.folge`) as unknown as { sparte: string; rasse: string; fid: number; farbe: string }[];
  const jeRasse = [...new Map(zeilen.map((z) => [`${z.sparte}|${z.rasse}`, zeilen.filter((x) => x.sparte === z.sparte && x.rasse === z.rasse)])).values()];
  const a = jeRasse.find((l) => l.length >= 2)!;
  const b = jeRasse.find((l) => l[0]!.sparte === a[0]!.sparte && l[0]!.rasse !== a[0]!.rasse)!;
  const c = jeRasse.find((l) => l[0]!.sparte !== a[0]!.sparte)!;
  return { a, b, c, sp: a[0]!.sparte };
}
const richter = (schauId: number, name: string, sparten: string[] = []) => al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten });
/** Preisrichter je Tier: „Rasse“ bzw. „Jugend Rasse“ → Namen (Menge). */
const werHat = async (schauId: number) => {
  const l = await al().preisrichter.liste({ schauId });
  const kat = await al().katalog.liste({ schauId });
  const out = new Map<string, Set<string | null>>();
  for (const e of kat) {
    const name = l.richter.find((r) => r.einteilung.some((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr))?.name ?? null;
    const k = `${e.istJugend ? "Jugend " : ""}${e.rasse}`;
    out.set(k, new Set([...(out.get(k) ?? []), name]));
  }
  return Object.fromEntries([...out].map(([k, v]) => [k, [...v].join(",")]));
};
const protokoll = async (schauId: number, tabelle: string) => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId))).filter((p) => p.tabelle === tabelle).sort((x, y) => x.id - y.id);

describe("Jugend separat oder eingereiht", () => {
  test("Katalog: Jugend als eigener Block am Ende oder in der Rasse eingereiht", async () => {
    const { id } = await al().schau.anlegen({ name: "Jugend Katalog", ort: "Halle" });
    const s = await al().schau.get({ id });
    const { a, b } = await rassen(s.stammdatenVersionId!);
    await melde(id, "Senior", [a[0]!.fid, b[0]!.fid]);
    await melde(id, "Junior", [a[0]!.fid], true);
    const folge = async () => (await al().katalog.liste({ schauId: id })).sort((x, y) => x.katalogNr! - y.katalogNr!).map((e) => `${e.istJugend ? "J-" : ""}${e.rasse}`);
    await al().katalog.nummernVergeben({ schauId: id });
    expect(s.jugendSeparat).toBe(true);
    expect(await folge()).toEqual([a[0]!.rasse, b[0]!.rasse, `J-${a[0]!.rasse}`]);
    await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), jugendSeparat: false } });
    await al().katalog.nummernVergeben({ schauId: id });
    // Eingereiht: in ihrer Rasse nach der gewohnten Folge (hier Aussteller A–Z: „Junior“ vor „Senior“).
    expect(await folge()).toEqual([`J-${a[0]!.rasse}`, a[0]!.rasse, b[0]!.rasse]);
  });

  test("Kurzkatalog: die Jugend ist nur bei eigenem Block eine eigene Abteilung", async () => {
    const { id } = await al().schau.anlegen({ name: "Jugend Kurzkatalog", ort: "Halle" });
    const { a } = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    await melde(id, "Senior", Array.from({ length: 11 }, () => a[0]!.fid));
    await melde(id, "Junior", [a[0]!.fid, a[0]!.fid, a[0]!.fid], true);
    await al().katalog.nummernVergeben({ schauId: id });
    const { katalogKontext } = await import("../pdf/katalog-kontext");
    const kurz = async () => {
      const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id));
      return (await katalogKontext(s!, { kurz: true })).tierteilListe.length;
    };
    // Eigener Block: zehn Senioren und die drei Jugendlichen; eingereiht: zehn Tiere der Sparte.
    expect(await kurz()).toBe(13);
    await al().schau.aktualisieren({ id, daten: { ...(await al().schau.get({ id })), jugendSeparat: false } });
    expect(await kurz()).toBe(10);
  });

  test("Einteilung: „mit der Rasse“ wie bisher, „separat“ mit eigenen Regeln; Protokoll, Sparten, Rückfrage", async () => {
    const { id } = await al().schau.anlegen({ name: "Jugend Einteilung", ort: "Halle" });
    const s = await al().schau.get({ id });
    expect(s.einteilungJugendSeparat).toBe(false);
    const { a, b, c, sp } = await rassen(s.stammdatenVersionId!);
    const A = a[0]!.rasse;
    const B = b[0]!.rasse;
    await melde(id, "Senior", [a[0]!.fid, a[1]!.fid, b[0]!.fid]);
    await melde(id, "Junior", [a[0]!.fid, a[1]!.fid, b[0]!.fid, c[0]!.fid], true);
    const X = await richter(id, "JX");
    const Y = await richter(id, "JY");
    const Z = await richter(id, "JZ", [sp]);
    const regeln = [
      { preisrichterId: X.id, sparte: sp, rasse: A, farbenschlag: "" },
      { preisrichterId: Y.id, sparte: sp, rasse: B, farbenschlag: "" },
      { preisrichterId: Y.id, sparte: c[0]!.sparte, rasse: c[0]!.rasse, farbenschlag: "" },
    ];
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    await al().katalog.nummernVergeben({ schauId: id });
    // Mit der Rasse: keine Jugendzeilen, die Jugend geht an den Preisrichter ihrer Rasse.
    expect((await al().preisrichter.zuteilung({ schauId: id })).gruppen.every((g) => !g.jugend)).toBe(true);
    expect(await werHat(id)).toMatchObject({ [A]: "JX", [`Jugend ${A}`]: "JX", [`Jugend ${B}`]: "JY" });

    // Separat: eigene Zeilen „Jugend“ je Rasse mit ihren Farbenschlägen; alte Regeln ohne Merkmal gelten weiter für beide.
    await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: true });
    expect((await al().schau.get({ id })).einteilungJugendSeparat).toBe(true);
    const p = (await protokoll(id, "schau")).at(-1)!;
    expect([p.aktion, p.alt, p.neu]).toEqual(["Jugend in der Einteilung", { einteilungJugendSeparat: false }, { einteilungJugendSeparat: true }]);
    const z = await al().preisrichter.zuteilung({ schauId: id });
    const jA = z.gruppen.find((g) => g.jugend && g.rasse === A)!;
    expect([jA.anzahl, jA.farben.length]).toEqual([2, 2]);
    expect(z.gruppen.find((g) => !g.jugend && g.rasse === A)!.anzahl).toBe(2);
    // Katalog mit Jugendblock: die Jugendzeilen hinter allen Senioren.
    expect(z.gruppen.map((g) => g.jugend)).toEqual([...z.gruppen.filter((g) => !g.jugend), ...z.gruppen.filter((g) => g.jugend)].map((g) => g.jugend));
    expect(await werHat(id)).toMatchObject({ [`Jugend ${A}`]: "JX" });

    // Eigener Preisrichter für die Jugend einer Rasse und für einen Farbenschlag der Jugend.
    const mitJugend = [...regeln, { preisrichterId: Z.id, sparte: sp, rasse: A, farbenschlag: "", jugend: true }, { preisrichterId: Y.id, sparte: sp, rasse: A, farbenschlag: a[1]!.farbe, jugend: true }];
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: mitJugend });
    const kat = await al().katalog.liste({ schauId: id });
    const l = await al().preisrichter.liste({ schauId: id });
    const bei = (rasse: string, farbe: string, jugend: boolean) => {
      const e = kat.find((x) => x.rasse === rasse && x.farbenschlag === farbe && x.istJugend === jugend)!;
      return l.richter.find((r) => r.einteilung.some((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr))?.name;
    };
    expect([bei(A, a[0]!.farbe, false), bei(A, a[1]!.farbe, false), bei(A, a[0]!.farbe, true), bei(A, a[1]!.farbe, true), bei(B, b[0]!.farbe, true)]).toEqual(["JX", "JX", "JZ", "JY", "JY"]);
    const zp = (await protokoll(id, "pr_zuteilung")).at(-1)!;
    expect(zp.neu).toContainEqual({ preisrichter: "JZ", sparte: sp, rasse: A, jugend: true });
    const gespeichert = (await al().preisrichter.zuteilung({ schauId: id })).regeln;
    expect(gespeichert.filter((r) => r.jugend).map((r) => r.preisrichterId).sort()).toEqual([Y.id, Z.id].sort());
    expect(gespeichert.filter((r) => !r.jugend)).toHaveLength(3);

    // Sparten der Preisrichter gelten auch für die Jugendzeilen.
    await expect(
      al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [...regeln, { preisrichterId: Z.id, sparte: c[0]!.sparte, rasse: c[0]!.rasse, farbenschlag: "", jugend: true }] }),
    ).rejects.toThrow(`JZ bewertet keine ${c[0]!.sparte}`);

    // Vorschlag: die Jugend je Rasse als eigene Einheit (Regeln mit Merkmal), Sparten beachtet.
    const v = await al().preisrichter.zuteilungVorschlagen({ schauId: id });
    expect(v.regeln.some((r) => r.jugend && r.rasse === A)).toBe(true);
    expect(v.regeln.filter((r) => r.sparte === c[0]!.sparte).every((r) => r.preisrichterId !== Z.id)).toBe(true);

    // Bewertetes Jugendtier wechselte beim Zurückschalten den Preisrichter: nur mit Rückfrage.
    const jugendA = kat.find((x) => x.rasse === A && x.farbenschlag === a[0]!.farbe && x.istJugend)!;
    await m.db.insert(m.schema.bewertung).values({ katalogeintragId: jugendA.id, punkte: 94, preisrichterId: Z.id });
    await expect(al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: false })).rejects.toThrow("Bereits bewertete Tiere");
    expect((await al().schau.get({ id })).einteilungJugendSeparat).toBe(true);
    await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: false, bestaetigt: true });
    // Zurück „mit der Rasse“: Jugendregeln bleiben gespeichert, gelten aber nicht.
    expect(await werHat(id)).toMatchObject({ [`Jugend ${A}`]: "JX" });
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln.filter((r) => r.jugend)).toHaveLength(2);

    // Vorlage übernimmt die Einstellung.
    await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: true, bestaetigt: true });
    const kopie = await al().schau.anlegen({ name: "Jugend Einteilung Kopie", ort: "Halle", vorlageId: id });
    expect((await al().schau.get({ id: kopie.id })).einteilungJugendSeparat).toBe(true);
  });
});
