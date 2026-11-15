/** Einteilung nach Rassen nach der Gegenprüfung: Sperre gegen gleichzeitige Nummernvergabe, Lücken, bewertete Tiere bei Nachmeldungen, Unternummern anderer Sparte, Schreibweise, Auskunft, Testschau. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (n: string) => ({ vorname: "Pruef", nachname: n, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number | null, extra: Record<string, unknown> = {}) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null, ...extra });
const melde = async (schauId: number, n: string, positionen: ReturnType<typeof pos>[], bestaetigen = true) => {
  const r = await al().meldung.speichern({ schauId, aussteller: aussteller(n), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen });
  if (bestaetigen) await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
  return r.meldungId;
};
/** Rassen in Ausstellungsfolge mit erstem Farbenschlag. */
async function rassen(versionId: number) {
  return (await m.sql`
    select distinct on (s.folge, r.folge) s.name as sparte, r.id as rasse_id, r.name as rasse, f.id as fid
    from rasse r join sparte s on s.id = r.sparte_id join farbenschlag f on f.rasse_id = r.id
    where r.version_id = ${versionId} order by s.folge, r.folge, f.folge`) as unknown as { sparte: string; rasse_id: number; rasse: string; fid: number }[];
}
const richter = (schauId: number, name: string, sparten: string[] = []) => al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten });
const werHat = async (schauId: number) => {
  const l = await al().preisrichter.liste({ schauId });
  const kat = await al().katalog.liste({ schauId });
  return new Map(kat.map((e) => [`${e.katalogNr}${e.suffix}`, l.richter.find((r) => r.einteilung.some((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr))?.name ?? null]));
};

describe("Einteilung nach Rassen (Gegenprüfung)", () => {
  test("Sperre: gleichzeitig geänderte Nummern – die Einteilung rechnet mit den neuen", async () => {
    const { id } = await al().schau.anlegen({ name: "Einteilung Rennen", ort: "Halle" });
    const r = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    const sp = r[0]!.sparte;
    const [a, b] = r.filter((x) => x.sparte === sp);
    await melde(id, "R1", [pos(b!.fid), pos(b!.fid)]);
    const X = await richter(id, "RX");
    const Y = await richter(id, "RY");
    const regeln = [
      { preisrichterId: X.id, sparte: sp, rasse: a!.rasse, farbenschlag: "" },
      { preisrichterId: Y.id, sparte: sp, rasse: b!.rasse, farbenschlag: "" },
    ];
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    await al().katalog.nummernVergeben({ schauId: id });
    await melde(id, "R2", [pos(a!.fid), pos(a!.fid), pos(a!.fid)]);
    const neueA = (await al().katalog.liste({ schauId: id })).filter((e) => e.katalogNr == null).map((e) => e.id);
    // Eine andere Verbindung hält die Sperre und nummeriert um (wie eine gleichzeitige Nummernvergabe).
    const sperre = await m.sql.reserve();
    await sperre`begin`;
    await sperre`select pg_advisory_xact_lock(2026111201, ${id})`;
    const setzen = al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    await Bun.sleep(300);
    await sperre`update katalogeintrag set katalog_nr = katalog_nr + 3 where schau_id = ${id} and katalog_nr is not null`;
    for (const [i, eid] of neueA.entries()) await sperre`update katalogeintrag set katalog_nr = ${i + 1} where id = ${eid}`;
    await sperre`commit`;
    sperre.release();
    await setzen;
    const wer = await werHat(id);
    for (const e of await al().katalog.liste({ schauId: id })) expect(wer.get(`${e.katalogNr}${e.suffix}`)).toBe(e.rasse === a!.rasse ? "RX" : "RY");
  });

  test("Lücke durch nicht bestätigte Meldung; Nachmeldung hängt bewertete Tiere nicht still um", async () => {
    const { id } = await al().schau.anlegen({ name: "Einteilung Luecke", ort: "Halle" });
    const r = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    const sp = r.find((x) => r.filter((y) => y.sparte === x.sparte).length >= 3)!.sparte;
    const [a, b, c] = r.filter((x) => x.sparte === sp);
    await melde(id, "M1", [pos(a!.fid), pos(c!.fid)]);
    const m2 = await melde(id, "M2", [pos(b!.fid)]);
    const X = await richter(id, "PX");
    const Y = await richter(id, "PY");
    const regeln = [
      { preisrichterId: X.id, sparte: sp, rasse: a!.rasse, farbenschlag: "" },
      { preisrichterId: Y.id, sparte: sp, rasse: b!.rasse, farbenschlag: "" },
      { preisrichterId: X.id, sparte: sp, rasse: c!.rasse, farbenschlag: "" },
    ];
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    const nrB = (await al().katalog.liste({ schauId: id })).find((e) => e.rasse === b!.rasse)!;
    // M2 wieder offen: ihre Nummer trennt die Bereiche von PX – nach dem Wiederbestätigen steht sie nicht bei PX.
    await al().meldung.statusSetzen({ id: m2, status: "offen", grund: "Versehen" });
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    const bereiche = (await al().preisrichter.liste({ schauId: id })).richter.flatMap((r) => r.einteilung);
    expect(bereiche.some((e) => nrB.katalogNr! >= e.vonNr && nrB.katalogNr! <= e.bisNr)).toBe(false);
    // Wieder bestätigt: die Bereiche folgen sofort (Nr. von M2 wieder bei PY).
    await al().meldung.statusSetzen({ id: m2, status: "bestaetigt" });
    expect((await werHat(id)).get(String(nrB.katalogNr))).toBe("PY");
    expect((await al().preisrichter.liste({ schauId: id })).ohneZuteilung).toBe(0);
    // PY bewertet; danach gehört die Rasse laut Regel PX (z. B. aus einer älteren Sitzung): Die Nachmeldung rechnet die
    // Bereiche nicht um, sondern meldet es.
    await m.db.insert(m.schema.bewertung).values({ katalogeintragId: nrB.id, punkte: 94, preisrichterId: Y.id });
    await m.sql`update pr_zuteilung set preisrichter_id = ${X.id} where schau_id = ${id} and rasse = ${b!.rasse}`;
    await melde(id, "M3", [pos(a!.fid)]);
    const k = await al().katalog.nummernVergeben({ schauId: id });
    expect(k.einteilung!.nichtUebernommen).toEqual([String(nrB.katalogNr)]);
    expect((await werHat(id)).get(String(nrB.katalogNr))).toBe("PY");
    // Unter „Preisrichter“ mit Rückfrage.
    await expect(al().preisrichter.zuteilungSetzen({ schauId: id, regeln: regeln.map((x) => ({ ...x, preisrichterId: X.id })) })).rejects.toThrow("Bereits bewertete Tiere");
  });

  test("Unternummer einer anderen Sparte: gemeldet, sperrt die Einteilung nicht", async () => {
    const { id } = await al().schau.anlegen({ name: "Einteilung Sparte", ort: "Halle" });
    const r = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    const [sp1, sp2] = [...new Set(r.map((x) => x.sparte))];
    const h = r.filter((x) => x.sparte === sp1).at(-1)!;
    const [t1, t2] = r.filter((x) => x.sparte === sp2);
    await melde(id, "H", [pos(h.fid), pos(t2!.fid)]);
    const X = await richter(id, "Nur Sp1", [sp1!]);
    const T = await richter(id, "Nur Sp2", [sp2!]);
    const regeln = [
      { preisrichterId: X.id, sparte: sp1!, rasse: h.rasse, farbenschlag: "" },
      { preisrichterId: T.id, sparte: sp2!, rasse: t1!.rasse, farbenschlag: "" },
      { preisrichterId: T.id, sparte: sp2!, rasse: t2!.rasse, farbenschlag: "" },
    ];
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    await melde(id, "N", [pos(t1!.fid)]);
    const k = await al().katalog.nummernVergeben({ schauId: id });
    const nach = (await al().katalog.liste({ schauId: id })).find((e) => e.suffix)!;
    expect(k.einteilung!.abweichend).toEqual([`${nach.katalogNr}${nach.suffix}`]);
    const s = await al().preisrichter.zuteilungSetzen({ schauId: id, regeln });
    expect(s.abweichend).toEqual([`${nach.katalogNr}${nach.suffix}`]);
  });

  test("Schreibweise: Farbenschläge, die sich nur in Groß-/Kleinschreibung unterscheiden, sind einer", async () => {
    const { id } = await al().schau.anlegen({ name: "Einteilung Schreibweise", ort: "Halle" });
    const r = await rassen((await al().schau.get({ id })).stammdatenVersionId!);
    const h = r.find((x) => x.rasse === "Wyandotten")!;
    await melde(id, "S", [pos(null, { rasseId: h.rasse_id, freitext: "Lavendel" }), pos(null, { rasseId: h.rasse_id, freitext: "lavendel " })]);
    const X = await richter(id, "SX");
    const Y = await richter(id, "SY");
    const g = (await al().preisrichter.zuteilung({ schauId: id })).gruppen.find((x) => x.rasse === "Wyandotten")!;
    expect(g.farben).toHaveLength(1);
    expect(g.farben[0]!.anzahl).toBe(2);
    const anzeige = g.farben[0]!.farbenschlag;
    expect(anzeige.toLowerCase()).toBe("lavendel");
    await al().preisrichter.zuteilungSetzen({
      schauId: id,
      regeln: [
        { preisrichterId: X.id, sparte: g.sparte, rasse: "Wyandotten", farbenschlag: "" },
        { preisrichterId: Y.id, sparte: g.sparte, rasse: "wyandotten", farbenschlag: "LAVENDEL" },
      ],
    });
    // Zurück in der Schreibweise der Anzeige.
    expect((await al().preisrichter.zuteilung({ schauId: id })).regeln.find((x) => x.farbenschlag)).toMatchObject({ rasse: "Wyandotten", farbenschlag: anzeige, preisrichterId: Y.id });
  });

  test("Auskunft nennt die Rassen-Einteilung; Testschau zurücksetzen leert sie", async () => {
    const { id } = await al().schau.anlegen({ name: "Einteilung Testschau", ort: "Halle", test: true });
    const s = await al().schau.get({ id });
    const r = await rassen(s.stammdatenVersionId!);
    const X = await richter(id, "Auskunft Einteilerin");
    await al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: X.id, sparte: r[0]!.sparte, rasse: r[0]!.rasse, farbenschlag: "" }] });
    const ds = await import("../services/datenschutz");
    const a = await ds.ladeAuskunftPerson(adminKontext.benutzer!.organisationId, "Auskunft Einteilerin");
    expect(a.preisrichter.find((p) => p.name === "Auskunft Einteilerin")!.einteilungNachRassen).toEqual([{ sparte: r[0]!.sparte, rasse: r[0]!.rasse, farbenschlag: "" }]);
    const { zuruecksetzen } = await import("../testschau");
    await zuruecksetzen(s.slug, { leise: true });
    expect((await m.sql`select count(*)::int n from pr_zuteilung where schau_id = ${id}`)[0]!.n).toBe(0);
  });
});
