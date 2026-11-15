/**
 * Nach dem Umstellen im Hallenplan neu nummerieren: vor dem Festschreiben der Katalognummern die Katalognummern (und
 * Käfigplätze) in der Reihenfolge des Plans, danach nur die Käfigplätze. Nur Ausstellungsleitung, fester Plan nötig,
 * Protokoll, in der abgeschlossenen Schau gesperrt. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Nach Plan nummerieren", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Katalognummern bzw. Käfigplätze in Planfolge; Rückfragen der Oberfläche: Server sperrt ohne festen Plan, ohne Rechte und nach Abschluss", async () => {
    const { id } = await al().schau.anlegen({ name: "Nummern nach Plan", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Plan", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    };
    await melden("Folge", 6);
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = { breite: 800, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const eintraege = async () => (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id))).sort((a, b) => a.id - b.id);
    const vorher = await eintraege();
    expect(vorher.map((e) => e.katalogNr)).toEqual([1, 2, 3, 4, 5, 6]);

    // Ohne festen Plan: abgelehnt (sonst stellte die Software nach den neuen Nummern neu auf).
    await expect(al().katalog.nummernNachPlan({ schauId: id })).rejects.toThrow(/festschreiben|Frei planen/);
    await al().katalog.planFestschreiben({ schauId: id });
    // Nur die Ausstellungsleitung.
    await expect(helfer().katalog.nummernNachPlan({ schauId: id })).rejects.toThrow();

    // Platte 1 (Nr. 1–3) hinter Platte 2 (Nr. 4–6) gestellt: neue Katalognummern in der Folge des Plans.
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, plattenVersatz: [{ reihe: 1, platte: 0, dx: 0, dy: 420 }] } });
    const plan = (await helfer().katalog.hallenplan({ schauId: id })).plan!;
    const r1 = plan.reihen[0]!.kaefige.map((k) => k.id);
    expect(r1).toEqual(vorher.map((e) => e.id));
    const a = await al().katalog.nummernNachPlan({ schauId: id });
    expect(a).toMatchObject({ modus: "nummern", geaendert: 6, ohnePlatz: 0, einteilungVonHand: false });
    const nach = await eintraege();
    const ids = vorher.map((e) => e.id);
    const nr = (eid: number) => nach.find((e) => e.id === eid)!;
    expect([ids[3], ids[4], ids[5], ids[0], ids[1], ids[2]].map((eid) => nr(eid!).katalogNr)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nach.every((e) => e.kaefig === String(e.katalogNr) && e.suffix === "")).toBe(true);
    // Der Käfigblock (für spätere Nachmeldungen) ist gesetzt wie beim Vergeben der Katalognummern.
    expect(nach.every((e) => e.kaefigBlock != null)).toBe(true);
    // Der feste Plan bleibt: jedes Tier steht, wo es stand – nur die Nummern sind neu.
    const planNach = (await helfer().katalog.hallenplan({ schauId: id })).plan!;
    expect(planNach.reihen[0]!.kaefige.map((k) => [k.id, k.rechteck])).toEqual(plan.reihen[0]!.kaefige.map((k) => [k.id, k.rechteck]));
    // Noch einmal: nichts mehr zu ändern.
    expect((await al().katalog.nummernNachPlan({ schauId: id })).geaendert).toBe(0);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Katalognummern nach Hallenplan vergeben").sort((x, y) => x.id - y.id);
    expect(prot).toHaveLength(2);
    expect(JSON.stringify(prot[0]!.neu)).toContain(`"anzahl":6`);

    // Katalognummern festgeschrieben (Katalog gedruckt): die Nummern bleiben, nur die Käfigplätze folgen dem Plan.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, plattenVersatz: [] } });
    const b = await al().katalog.nummernNachPlan({ schauId: id });
    expect(b).toMatchObject({ modus: "plaetze", geaendert: 6 });
    const fest = await eintraege();
    expect(fest.map((e) => e.katalogNr)).toEqual(nach.map((e) => e.katalogNr));
    // Plan wieder in der ursprünglichen Lage: Käfig 1–6 in der Folge der ursprünglichen Tiere.
    expect(ids.map((eid) => fest.find((e) => e.id === eid)!.kaefig)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect((await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).map((x) => x.aktion)).toContain("Käfigplätze nach Hallenplan vergeben");
    // Nachmeldung danach: bekommt eine Unternummer, aber keine Käfignummer aus dem Katalog (die Käfige zählen nach dem Plan).
    await melden("Nachmeldung", 1);
    await al().katalog.nummernVergeben({ schauId: id });
    const mitNach = await eintraege();
    const nachgemeldet = mitNach.find((e) => !ids.includes(e.id))!;
    expect(nachgemeldet.suffix).not.toBe("");
    expect(nachgemeldet.kaefig).toBe("");
    // Käfigplätze erneut: die Nachmeldung bekommt ihren Platz, alle anderen behalten ihre Käfignummer.
    expect(await al().katalog.nummernNachPlan({ schauId: id })).toMatchObject({ modus: "plaetze", geaendert: 1 });
    const zuletzt = await eintraege();
    expect(zuletzt.find((e) => e.id === nachgemeldet.id)!.kaefig).toBe("7");
    expect(ids.map((eid) => zuletzt.find((e) => e.id === eid)!.kaefig)).toEqual(["1", "2", "3", "4", "5", "6"]);
    // Die Ansicht des Plans kennt den Stand (für Knopf und Rückfrage).
    expect(await helfer().katalog.hallenplan({ schauId: id })).toMatchObject({ katalogGedruckt: true, katalogStart: 1 });

    // Abgeschlossene Schau: gesperrt (die Oberfläche blendet den Knopf aus).
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, id));
    await expect(al().katalog.nummernNachPlan({ schauId: id })).rejects.toThrow(/abgeschlossen/);
    expect((await helfer().katalog.hallenplan({ schauId: id })).abgeschlossen).toBe(true);
  });

  test("lückenlos auffüllen: frei gewordene Plätze wandern ans Ende, die Nummern laufen durch; nach der Einlieferung nur nummerieren", async () => {
    const { id } = await al().schau.anlegen({ name: "Auffüllen nach Plan", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Auf", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    for (let i = 1; i <= 9; i++) await melden(`Nr${i}`, 1);
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.halleSetzen({ schauId: id, halle: { breite: 800, laenge: 1500, gang: 150, richtung: "laengs", wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] } });
    await al().katalog.planFestschreiben({ schauId: id });
    // Meldung des Tieres, das im Plan an Stelle y steht (R1, ab 150 je 70 cm).
    const meldungAn = async (y: number) => {
      const k = (await helfer().katalog.hallenplan({ schauId: id })).plan!.reihen[0]!.kaefige.find((x) => x.y === y)!;
      return (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, k.id)))[0]!.meldungId;
    };
    // Storno der Tiere auf Platz 3 und 4: zwei freie Plätze mitten in der Reihe; der Plan meldet das.
    const m3 = await meldungAn(290), m4 = await meldungAn(360);
    await al().meldung.statusSetzen({ id: m3, status: "storniert", grund: "Absage (Test)" });
    await al().meldung.statusSetzen({ id: m4, status: "storniert", grund: "Absage (Test)" });
    const vorher = await helfer().katalog.hallenplan({ schauId: id });
    expect(vorher.unordnung).toMatchObject({ freiDazwischen: 2 });
    expect(vorher.plan!.reihen[0]!.kaefige).toHaveLength(7);

    const a = await al().katalog.nummernNachPlan({ schauId: id });
    expect(a).toMatchObject({ modus: "nummern", aufgerueckt: 5, aufrueckenGesperrt: false });
    const nach = await helfer().katalog.hallenplan({ schauId: id });
    expect(nach.unordnung).toEqual({ freiDazwischen: 0, nichtInFolge: 0 });
    // Lückenlos ab dem Reihenanfang, Nummern 1–7 in der Folge, freie Plätze am Ende.
    const r = nach.plan!.reihen[0]!;
    expect(r.kaefige.map((k) => k.nr)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(r.kaefige.map((k) => k.y)).toEqual([150, 220, 290, 360, 430, 500, 570]);
    expect((r.freiePlaetze ?? []).map((f) => f.y)).toEqual([640, 710]);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Katalognummern nach Hallenplan vergeben");
    expect(JSON.stringify(prot.at(-1)!.neu)).toContain(`"aufgerueckt":5`);

    // Ein Tier ist schon eingeliefert (sitzt im Käfig): dann wird nicht umgesetzt, nur nummeriert – mit Hinweis.
    // Eindeutig das Tier mit Nr. 1 (ohne Sortierung lieferte die Datenbank manchmal ein Tier der gleich stornierten Meldung).
    const einer = (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id))).find((x) => x.katalogNr === 1);
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, einer!.id));
    await al().meldung.statusSetzen({ id: await meldungAn(500), status: "storniert", grund: "Absage (Test)" });
    expect((await helfer().katalog.hallenplan({ schauId: id })).unordnung!.freiDazwischen).toBe(1);
    expect((await helfer().katalog.hallenplan({ schauId: id })).eingeliefert).toBe(true);
    const b = await al().katalog.nummernNachPlan({ schauId: id });
    expect(b).toMatchObject({ aufgerueckt: 0, aufrueckenGesperrt: true });
    expect((await helfer().katalog.hallenplan({ schauId: id })).unordnung!.freiDazwischen).toBe(1);
  });
  test("eingesetzte Käfigblöcke: nach dem Nummerieren folgen die Nummern dem Plan, der Hinweis verschwindet, ein zweites Mal ändert nichts", async () => {
    const { id } = await al().schau.anlegen({ name: "Blöcke nach Plan", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Block", nachname: "Folge", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 24 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    // Eine Doppelreihe mit 2 × 9 Plätzen: 6 Tiere ohne Platz – zwei Käfigblöcke, der hintere zuerst eingesetzt.
    const halle = { breite: 440, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    await al().katalog.planFestschreiben({ schauId: id });
    const objekte = [
      { id: "hinten", art: "kaefigblock" as const, typ: "huehner" as const, x: 0, y: 780, drehung: 90 as const },
      { id: "vorn", art: "kaefigblock" as const, typ: "huehner" as const, x: 0, y: 0, drehung: 90 as const },
    ];
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte } });
    const vorher = await helfer().katalog.hallenplan({ schauId: id });
    expect(vorher.plan!.nichtPlatziert).toHaveLength(0);
    await al().katalog.nummernNachPlan({ schauId: id });
    const nach = await helfer().katalog.hallenplan({ schauId: id });
    expect(nach.unordnung).toEqual({ freiDazwischen: 0, nichtInFolge: 0 });
    // Jedes Tier steht noch im selben Block wie vorher.
    const inBlock = (p: typeof vorher) => p.plan!.objekte.map((o) => (o.kaefige ?? []).map((k) => k.id));
    expect(inBlock(nach)).toEqual(inBlock(vorher));
    expect((await al().katalog.nummernNachPlan({ schauId: id })).geaendert).toBe(0);
  });
});
