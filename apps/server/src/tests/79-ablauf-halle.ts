/**
 * Ablauf nach dem Meldeschluss (Rückmeldung eines Vereins): Einteilung nach Rassen → Käfige → Hallenplan → Katalognummern
 * (nach dem Plan) → Katalog. Der Plan zeigt die Preisrichter schon vor den Nummern (aus der Einteilung nach Rassen, Jugend
 * separat), die Übersicht führt erst zum Hallenplan, dann zu den Katalognummern, die Prüfliste nennt den Hallenplan vor den
 * Katalognummern. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { PHASEN_LABEL, prueflistenGruppen, richterFolge } from "@schau/domain";
import { adminKontext, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (n: string) => ({ vorname: "Ablauf", nachname: n, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
const melde = async (schauId: number, n: string, fids: number[], istJugend = false) => {
  const r = await al().meldung.speichern({ schauId, aussteller: aussteller(n), eingang: "papier", istJugend, bemerkung: "", zustimmung: true, positionen: fids.map(pos) });
  await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
};
const HALLE = { breite: 800, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
const phase = (id: number, p: "meldung" | "katalog") => m.db.update(m.schema.schau).set({ phase: p }).where(m.eq(m.schema.schau.id, id));

describe("Ablauf: Hallenplan vor Katalognummern", () => {
  test("Plan farbig vor den Nummern, Übersicht und Prüfliste in der Folge des Ablaufs, Nummern nach Plan", async () => {
    expect(PHASEN_LABEL.katalog).toBe("Halle & Katalog");
    const { id } = await al().schau.anlegen({ name: "Ablauf Halle", ort: "Halle" });
    const s = await al().schau.get({ id });
    const zeilen = (await m.sql`
      select s.name as sparte, r.name as rasse, f.id as fid from rasse r join sparte s on s.id = r.sparte_id join farbenschlag f on f.rasse_id = r.id
      where r.version_id = ${s.stammdatenVersionId!} order by s.folge, r.folge, f.folge`) as unknown as { sparte: string; rasse: string; fid: number }[];
    const a = zeilen[0]!;
    const b = zeilen.find((z) => z.sparte === a.sparte && z.rasse !== a.rasse)!;
    await melde(id, "Senior", [a.fid, a.fid, b.fid]);
    await melde(id, "Junior", [a.fid], true);
    // Namensfolge ≠ Planfolge: X (Rasse A, vorn im Plan) heißt „Zacharias“, Y (hinten) „Anton“.
    const X = await al().preisrichter.speichern({ schauId: id, name: "Zacharias Ablauf", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [] });
    const Y = await al().preisrichter.speichern({ schauId: id, name: "Anton Ablauf", anschrift: "", email: "", telefon: "", istObmann: false, sparten: [] });
    // Einteilung nach Rassen vor allem anderen; die Jugend der Rasse A separat bei Y.
    await al().preisrichter.einteilungJugendSetzen({ schauId: id, separat: true });
    await al().preisrichter.zuteilungSetzen({
      schauId: id,
      regeln: [
        { preisrichterId: X.id, sparte: a.sparte, rasse: a.rasse, farbenschlag: "" },
        { preisrichterId: Y.id, sparte: b.sparte, rasse: b.rasse, farbenschlag: "" },
        { preisrichterId: Y.id, sparte: a.sparte, rasse: a.rasse, farbenschlag: "", jugend: true },
      ],
    });
    await phase(id, "katalog");
    const uebersicht = () => al().schau.uebersicht({ id });

    // Ohne Halle (eine neue Schau übernimmt sonst die Halle der vorigen): der Knopf der Phase führt zum Hallenplan.
    await m.db.update(m.schema.schau).set({ halle: null, hallenplanFest: null }).where(m.eq(m.schema.schau.id, id));
    expect((await uebersicht()).arbeit).toBe("hallenplan");
    expect(await al().katalog.nummernStand({ schauId: id })).toEqual({ halle: false, planFest: false, veraltet: false, ohnePlatz: 0, mitPlatz: 0, nummeriert: false });

    // Zu kleine Halle: Tiere ohne Platz – die Prüfliste nennt den Hallenplan vor den Katalognummern.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...HALLE, breite: 100, laenge: 100 } });
    const u = await uebersicht();
    expect(u.arbeit).toBe("hallenplan");
    const gruppen = prueflistenGruppen(u.checkliste).map((g) => g.ziel);
    expect(gruppen.indexOf("hallenplan")).toBeGreaterThanOrEqual(0);
    expect(gruppen.indexOf("hallenplan")).toBeLessThan(gruppen.indexOf("katalog"));
    expect(gruppen.indexOf("preisrichter") < 0 || gruppen.indexOf("preisrichter") < gruppen.indexOf("hallenplan")).toBe(true);

    // Halle groß genug, Plan automatisch mit allen Tieren: der Plan steht, weiter zu den Katalognummern.
    await al().katalog.halleSetzen({ schauId: id, halle: HALLE });
    expect((await uebersicht()).arbeit).toBe("katalog");
    expect(await al().katalog.nummernStand({ schauId: id })).toMatchObject({ halle: true, planFest: false, ohnePlatz: 0, mitPlatz: 4 });

    // Vor den Nummern: jeder Käfig trägt den Preisrichter aus der Einteilung nach Rassen, die Jugend separat.
    const liste = await al().katalog.liste({ schauId: id });
    expect(liste.every((e) => e.katalogNr == null)).toBe(true);
    const richterJeTier = async () => {
      const plan = (await al().katalog.hallenplan({ schauId: id })).plan!;
      const k = new Map(plan.reihen.flatMap((r) => r.kaefige).map((x) => [x.id, x.preisrichterId]));
      return liste.map((e) => `${e.istJugend ? "J " : ""}${e.rasse === a.rasse ? "A" : "B"}:${k.get(e.id) === X.id ? "AX" : k.get(e.id) === Y.id ? "AY" : String(k.get(e.id))}`).sort();
    };
    expect(await richterJeTier()).toEqual(["A:AX", "A:AX", "B:AY", "J A:AY"]);
    const jung = liste.find((e) => e.istJugend)!;
    // Ohne Nummer nur vorgesehen (die Bereiche entstehen erst mit den Nummern).
    expect(await al().katalog.kaefigInfo({ schauId: id, id: jung.id })).toMatchObject({ preisrichter: "Anton Ablauf", preisrichterVorgesehen: true });
    // Farben in der Folge des Plans, nicht nach Namen: Zacharias vorn.
    const farben = async () => {
      const h = await al().katalog.hallenplan({ schauId: id });
      return richterFolge(h.plan!, h.richter).map((x) => x.name);
    };
    expect(await farben()).toEqual(["Zacharias Ablauf", "Anton Ablauf"]);

    // Plan fest: jetzt zu den Katalognummern, und dort ist „Nach Hallenplan vergeben“ möglich.
    await al().katalog.planFestschreiben({ schauId: id });
    expect((await uebersicht()).arbeit).toBe("katalog");
    expect(await al().katalog.nummernStand({ schauId: id })).toEqual({ halle: true, planFest: true, veraltet: false, ohnePlatz: 0, mitPlatz: 4, nummeriert: false });

    // Käfigmaße danach geändert: der feste Plan ist veraltet – zurück zum Hallenplan, nicht „Nach Hallenplan vergeben“.
    const [{ masse }] = (await m.db.select({ masse: m.schema.schau.kaefigMasse }).from(m.schema.schau).where(m.eq(m.schema.schau.id, id))) as [{ masse: unknown }];
    await al().katalog.kaefigMassSetzen({ schauId: id, typ: "huehner", mass: { breite: 91, tiefe: 91, hoehe: 91 } });
    expect(await al().katalog.nummernStand({ schauId: id })).toMatchObject({ planFest: true, veraltet: true });
    expect((await uebersicht()).arbeit).toBe("hallenplan");
    // Zurück auf die Maße von vorher (direkt, wie beim Festschreiben): der Plan passt wieder.
    await m.db.update(m.schema.schau).set({ kaefigMasse: masse as never }).where(m.eq(m.schema.schau.id, id));
    expect(await al().katalog.nummernStand({ schauId: id })).toMatchObject({ veraltet: false });

    // Andere Phasen wie bisher.
    await phase(id, "meldung");
    expect((await uebersicht()).arbeit).toBe("meldungen");
    await phase(id, "katalog");

    // Nach Plan nummeriert: die Bereiche kommen aus der Einteilung, die Farben bleiben dieselben.
    const r = await al().katalog.nummernNachPlan({ schauId: id });
    expect([r.modus, r.geaendert, r.ohnePlatz]).toEqual(["nummern", 4, 0]);
    expect(await richterJeTier()).toEqual(["A:AX", "A:AX", "B:AY", "J A:AY"]);
    expect(await farben()).toEqual(["Zacharias Ablauf", "Anton Ablauf"]);
    expect((await al().katalog.kaefigInfo({ schauId: id, id: jung.id })).preisrichterVorgesehen).toBe(false);
    // Was beim Übertragen auf die Nummern auffiel, kommt mit (wie bei „Katalognummern vergeben“).
    expect(r.einteilung).toMatchObject({ ohne: 0, abweichend: [], nichtUebernommen: [] });
    const protokoll = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).sort((x, y) => x.id - y.id);
    expect(protokoll.filter((p) => p.tabelle === "katalogeintrag").map((p) => p.aktion).at(-1)).toBe("Katalognummern nach Hallenplan vergeben");

    // Mit Nummern zählen nur die Bereiche (wie bisher): ohne Bereiche kein Preisrichter, auch wenn die Rasse eingeteilt ist.
    await m.db.delete(m.schema.prEinteilung).where(m.eq(m.schema.prEinteilung.schauId, id));
    expect(await richterJeTier()).toEqual(["A:null", "A:null", "B:null", "J A:null"]);

    // Ohne Halle, aber schon nummeriert: der Knopf führt zu den Katalognummern.
    await m.db.update(m.schema.schau).set({ halle: null, hallenplanFest: null }).where(m.eq(m.schema.schau.id, id));
    expect((await uebersicht()).arbeit).toBe("katalog");
  });

  test("Nach Plan nur mit bestätigten Meldungen: sonst die Meldung dazu, nicht „folgen schon dem Plan“", async () => {
    const { id } = await al().schau.anlegen({ name: "Ablauf offen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [f] = (await m.sql`select f.id from farbenschlag f join rasse r on r.id = f.rasse_id where r.version_id = ${s.stammdatenVersionId!} limit 1`) as unknown as { id: number }[];
    // Nur eine offene Meldung: sie steht im Plan, bekommt aber keine Nummer.
    await al().meldung.speichern({ schauId: id, aussteller: aussteller("Offen"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(f!.id)] });
    await al().katalog.halleSetzen({ schauId: id, halle: HALLE });
    await al().katalog.planFestschreiben({ schauId: id });
    expect(await al().katalog.nummernStand({ schauId: id })).toMatchObject({ planFest: true, mitPlatz: 1 });
    await expect(al().katalog.nummernNachPlan({ schauId: id })).rejects.toThrow("Es gibt keine bestätigten Meldungen.");
  });
});
