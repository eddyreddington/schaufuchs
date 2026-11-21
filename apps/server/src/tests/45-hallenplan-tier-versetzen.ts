/**
 * Tiere im Halleneditor versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im halleneditor und ggf
 * tiere versetzen“): nur im festen Plan, freier Käfig gleicher Größe oder Tausch, Rückfrage nach dem Druck bzw. bei
 * eingelieferten Tieren, Protokoll, Nummern bleiben, „Plan neu setzen“ verwirft die Handzuordnung. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { belegungImPlan, platzImPlan, type KaefigPlatz } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Tier versetzen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });

  test("frei, Tausch, falsche Größe, Rückgängig, Rückfrage nach dem Druck und bei Eingelieferten, Neu setzen verwirft", async () => {
    const { id } = await al().schau.anlegen({ name: "Versetzen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const melden = async (farbenschlagId: number, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Ver", nachname: "Setzen", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    };
    // 6 Hühner (zwei volle 70er-Platten), 7 Tauben (eine volle 40er-Platte, eine mit 3 freien Plätzen).
    await melden(wy!.id, 6);
    await melden(st!.id, 7);
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const laden = async () => (await helfer().katalog.hallenplan({ schauId: id }))!;
    const fest = async () => (await m.db.select({ f: m.schema.schau.hallenplanFest }).from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!.f;
    const prot = async (aktion: string) => (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === aktion).sort((a, b) => a.id - b.id);
    const nummern = async () => (await m.db.select({ id: m.schema.katalogeintrag.id, nr: m.schema.katalogeintrag.katalogNr, k: m.schema.katalogeintrag.kaefig }).from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.schauId, id))).sort((a, b) => a.id - b.id);

    let d = await laden();
    const kaefige = d.plan!.reihen.flatMap((r) => r.kaefige);
    const huhn = (n: number) => kaefige.filter((k) => k.typ === "huehner")[n]!.id;
    const taube = (n: number) => kaefige.filter((k) => k.typ === "tauben")[n]!.id;
    const freierTaubenplatz = (p: typeof d.plan): KaefigPlatz => {
      for (const r of p!.reihen) {
        const f = (r.freiePlaetze ?? []).find((x) => x.typ === "tauben");
        // Tauben stehen zweistöckig: die Etage gehört zum Platz.
        if (f) return { art: "reihe", reihe: r.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) };
      }
      throw new Error("kein freier Taubenplatz");
    };
    const ziel = freierTaubenplatz(d.plan);
    const t0 = taube(0);
    expect(belegungImPlan(d.plan!, ziel)).toEqual({ typ: "tauben", tierId: null });
    const vonT0 = platzImPlan(d.plan!, t0);

    // Automatik an: nicht versetzen.
    await expect(al().katalog.tierVersetzen({ schauId: id, tierId: t0, von: vonT0, ziel, erwartet: null })).rejects.toThrow(/Automatisch planen/);
    await al().katalog.planFestschreiben({ schauId: id });
    d = await laden();
    // Nur Ausstellungsleitung.
    await expect(helfer().katalog.tierVersetzen({ schauId: id, tierId: t0, von: vonT0, ziel, erwartet: null })).rejects.toThrow();
    // Der Editor zeigt einen anderen Stand (Ziel angeblich belegt): abgelehnt.
    await expect(al().katalog.tierVersetzen({ schauId: id, tierId: t0, von: vonT0, ziel, erwartet: taube(1) })).rejects.toThrow(/inzwischen geändert/);
    // Andere Größe: abgelehnt, der feste Plan bleibt.
    const vorher = JSON.stringify(await fest());
    await expect(al().katalog.tierVersetzen({ schauId: id, tierId: huhn(0), von: platzImPlan(d.plan!, huhn(0)), ziel, erwartet: null })).rejects.toThrow("Der Käfig hat eine andere Größe.");
    expect(JSON.stringify(await fest())).toBe(vorher);

    const nrVorher = await nummern();
    // In den freien Taubenkäfig.
    const r1 = await al().katalog.tierVersetzen({ schauId: id, tierId: t0, von: vonT0, ziel, erwartet: null });
    expect(r1).toMatchObject({ rueckfrage: null, getauscht: null });
    d = await laden();
    expect(platzImPlan(d.plan!, t0)).toEqual(ziel);
    expect(belegungImPlan(d.plan!, vonT0!)).toEqual({ typ: "tauben", tierId: null });
    expect(d.unordnung!.nichtInFolge).toBeGreaterThan(0);
    expect(await prot("Tier im Hallenplan versetzt")).toHaveLength(1);

    // Tausch zweier Hühner.
    const h0 = huhn(0), h4 = huhn(4);
    const p0 = platzImPlan(d.plan!, h0)!, p4 = platzImPlan(d.plan!, h4)!;
    const r2 = await al().katalog.tierVersetzen({ schauId: id, tierId: h0, von: p0, ziel: p4, erwartet: h4 });
    expect(r2.getauscht).toBe(h4);
    d = await laden();
    expect(platzImPlan(d.plan!, h0)).toEqual(p4);
    expect(platzImPlan(d.plan!, h4)).toEqual(p0);
    const tausch = await prot("Tiere im Hallenplan getauscht");
    // Je Tier ein Eintrag (Reklamationen suchen je Tier).
    expect(tausch.map((x) => x.datensatzId).sort()).toEqual([h0, h4].sort());
    // Rückgängig (wie der Editor): derselbe Tausch zurück, mit Grund im Protokoll.
    await al().katalog.tierVersetzen({ schauId: id, tierId: h0, von: p4, ziel: p0, erwartet: h4, grund: "Rückgängig" });
    d = await laden();
    expect(platzImPlan(d.plan!, h0)).toEqual(p0);
    expect((await prot("Tiere im Hallenplan getauscht")).at(-1)!.grund).toBe("Rückgängig");
    // Nummern, Käfignummern und Preisrichter-Einteilung (hängt an Nummern) bleiben unverändert.
    expect(await nummern()).toEqual(nrVorher);

    // Katalog gedruckt: erst Rückfrage (nichts geändert), mit Bestätigung versetzt.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    const t1 = taube(1);
    const ziel2 = freierTaubenplatz(d.plan);
    const stand = JSON.stringify(await fest());
    const frage = await al().katalog.tierVersetzen({ schauId: id, tierId: t1, von: platzImPlan(d.plan!, t1), ziel: ziel2, erwartet: null });
    expect(frage.rueckfrage).toMatch(/gedruckt/);
    expect(JSON.stringify(await fest())).toBe(stand);
    await al().katalog.tierVersetzen({ schauId: id, tierId: t1, von: platzImPlan(d.plan!, t1), ziel: ziel2, erwartet: null, bestaetigt: true });
    d = await laden();
    expect(platzImPlan(d.plan!, t1)).toEqual(ziel2);

    // Eingeliefert: Rückfrage nennt das Tier.
    await al().halle.statusSetzen({ schauId: id, ids: [h0], status: "eingeliefert", uebersteuern: "Test" });
    const nrH0 = d.plan!.reihen.flatMap((r) => r.kaefige).find((k) => k.id === h0)!.nr;
    const frage2 = await al().katalog.tierVersetzen({ schauId: id, tierId: h0, von: platzImPlan(d.plan!, h0), ziel: platzImPlan(d.plan!, h4), erwartet: h4 });
    expect(frage2.rueckfrage).toContain(`Nr. ${nrH0} ist schon eingeliefert`);

    // Plan neu setzen verwirft die Handzuordnung: alles wieder in Katalogfolge.
    await al().katalog.planNeuSetzen({ schauId: id, grund: "Test" });
    d = await laden();
    expect(d.plan!.fest).toBeNull();
    expect(platzImPlan(d.plan!, t0)).toEqual(vonT0);
    expect(d.unordnung).toBeNull();
  });

  test("nach dem Versetzen nach Plan nummerieren: das Tier bleibt, wo es hingesetzt wurde; nur die Nummern folgen dem Plan", async () => {
    const { id } = await al().schau.anlegen({ name: "Versetzen und nummerieren", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Ver", nachname: "Nummer", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 7 }, () => ({ farbenschlagId: st!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.halleSetzen({ schauId: id, halle: { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] } });
    await al().katalog.planFestschreiben({ schauId: id });
    const laden = async () => (await helfer().katalog.hallenplan({ schauId: id }))!;
    let d = await laden();
    const tauben = d.plan!.reihen.flatMap((x) => x.kaefige);
    const erstes = tauben[0]!.id;
    const alt = platzImPlan(d.plan!, erstes)!;
    let ziel: KaefigPlatz | null = null;
    for (const x of d.plan!.reihen) {
      const f = (x.freiePlaetze ?? []).at(-1);
      if (f) ziel = { art: "reihe", reihe: x.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) };
    }
    await al().katalog.tierVersetzen({ schauId: id, tierId: erstes, von: alt, ziel: ziel!, erwartet: null });
    d = await laden();
    expect(d.unordnung!.nichtInFolge).toBeGreaterThan(0);
    // Der frei gemachte Platz zählt nicht als Lücke.
    expect(d.unordnung!.freiDazwischen).toBe(0);
    await al().katalog.nummernNachPlan({ schauId: id });
    d = await laden();
    expect(platzImPlan(d.plan!, erstes)).toEqual(ziel);
    expect(belegungImPlan(d.plan!, alt)).toMatchObject({ tierId: null });
    expect(d.unordnung).toEqual({ freiDazwischen: 0, nichtInFolge: 0 });
    // Das versetzte Tier hat jetzt die letzte Nummer (es steht am Ende).
    const nr = d.plan!.reihen.flatMap((x) => x.kaefige).find((k) => k.id === erstes)!.nr;
    expect(nr).toBe("7");
  });
});
