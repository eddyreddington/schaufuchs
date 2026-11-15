/**
 * Plan neu setzen (Rückmeldung 14.11.2026: „wenn ich quer auf längs gehe und neu anordne macht er quatsch“): Plan fest, Reihe und
 * Platten verschoben, fehlende Käfige eingesetzt, dann die Reihenrichtung gewechselt und neu gesetzt. Danach darf nichts von
 * der alten Aufstellung übrig sein; Tiere, die nicht in die Reihen passen, bekommen Käfigblöcke in den Reihen, der Rest steht
 * als ohne Platz. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { belegtImPlan, fehlendeEinsetzen, halleSchluessel, type Halle, type Rechteck } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Hallenplan: Plan neu setzen", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("Richtung wechseln und neu setzen: keine Reste der alten Aufstellung, alle Tiere in Reihen oder Blöcken", async () => {
    const { id } = await al().schau.anlegen({ name: "Neu setzen", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const [st] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Strasser" });
    const melden = async (farbenschlagId: number, n: number) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Neu", nachname: "Setzen", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    };
    // 20 Hühner (sieben 70er-Platten), 90 Tauben (achtzehn 40er-Platten): die Halle läuft über; längs bleibt hinter den
    // Hühnern der ersten Reihe ein Rest von 2,05 m (für eine Hühnerplatte zu kurz, die Tauben stehen lückenlos dahinter in
    // der nächsten Reihe) – dort passt ein Taubenblock, quer nicht.
    await melden(wy!.id, 20);
    await melden(st!.id, 90);
    await al().katalog.nummernVergeben({ schauId: id });
    const halle = { breite: 800, laenge: 1405, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: true, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    const laden = async () => (await helfer().katalog.hallenplan({ schauId: id }))!;
    const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - 0.5 && q.y >= a.y - 0.5 && q.x + q.b <= a.x + a.b + 0.5 && q.y + q.h <= a.y + a.h + 0.5;
    /** Was an einem neu gesetzten Plan nicht stimmt (leer = sauber). */
    const fehler = async (alteTeile: string[]) => {
      const d = await laden();
      const h = d.halle!, p = d.plan!;
      const f: string[] = [];
      if (p.fest) f.push("fest");
      if (h.reihenVersatz?.length) f.push("Reihen verschoben");
      if (h.plattenVersatz?.length) f.push("Platten verschoben");
      if (h.entfernt?.length) f.push("entfernte Plätze");
      for (const o of p.objekte) {
        if (alteTeile.includes(o.id)) f.push(`${o.name} (${o.id}) aus der alten Aufstellung`);
        if (!o.kaefige?.length) f.push(`${o.name} leer`);
        if (!p.reihen.some((r) => r.flaechen.some((a) => innen(o.rechteck, a)))) f.push(`${o.name} nicht in einer Reihe`);
      }
      f.push(...p.warnungen.filter((w) => /überschneidet|ragt/.test(w)));
      const gestellt = p.reihen.reduce((n, r) => n + r.kaefige.length, 0) + p.objekte.reduce((n, o) => n + (o.kaefige?.length ?? 0), 0);
      if (gestellt + p.nichtPlatziert.length !== 110) f.push(`${gestellt + p.nichtPlatziert.length} statt 110 Tiere`);
      if (p.nichtPlatziert.length && !p.warnungen.some((w) => /keinen Platz/.test(w))) f.push("ohne Platz nicht gemeldet");
      return f;
    };

    // Fehlende Käfige eingesetzt (wie im Editor), Plan fest, R1 und eine Platte von Hand verschoben.
    let d = await laden();
    expect(d.plan!.nichtPlatziert.length).toBeGreaterThan(0);
    const { einsaetze } = fehlendeEinsetzen(d.plan!, d.halle!, d.masse, belegtImPlan(d.halle!, d.plan!));
    expect(einsaetze.length).toBeGreaterThan(0);
    const objekte = [...einsaetze.map((e, i) => ({ id: `alt${i}`, art: e.art, typ: e.typ, x: e.x, y: e.y, drehung: e.drehung })), { id: "altleer", art: "kaefigblock" as const, typ: "tauben" as const, x: 300, y: 600, drehung: 0 as const }];
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte } });
    await al().katalog.planFestschreiben({ schauId: id });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...halle, objekte, reihenVersatz: [{ nr: 1, dx: 20, dy: 0 }], plattenVersatz: [{ reihe: 2, platte: 0, dx: 0, dy: 30 }] } });
    d = await laden();
    expect(d.plan!.objekte.some((o) => o.kaefige?.length)).toBe(true);
    const alteTeile = objekte.map((o) => o.id);

    // Quer und neu setzen – in einem Schritt, wie die Seite es jetzt macht.
    await expect(al().katalog.planNeuSetzen({ schauId: id, basis: "anders", halle: { ...d.halle!, richtung: "quer" } as never, grund: "Halle: Reihenrichtung" })).rejects.toThrow(/inzwischen/);
    await expect(helfer().katalog.planNeuSetzen({ schauId: id, grund: "x" })).rejects.toThrow();
    const e = await al().katalog.planNeuSetzen({ schauId: id, basis: halleSchluessel(d.halle as Halle), halle: { ...d.halle!, richtung: "quer" } as never, grund: "Halle: Reihenrichtung" });
    expect(await fehler(alteTeile)).toEqual([]);
    d = await laden();
    expect(d.halle!.richtung).toBe("quer");
    expect(e.eingesetzt).toBe(d.plan!.objekte.length);
    expect(e.ohne).toBe(d.plan!.nichtPlatziert.length);
    // Was dann noch ohne Platz ist, findet auch „Alle fehlenden Käfige einsetzen“ keinen Platz mehr.
    expect(fehlendeEinsetzen(d.plan!, d.halle!, d.masse, belegtImPlan(d.halle!, d.plan!)).einsaetze).toEqual([]);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Hallenplan neu gesetzt");
    expect(prot).toHaveLength(1);
    expect(prot[0]!.grund).toBe("Halle: Reihenrichtung");
    expect(JSON.stringify(prot[0]!.alt)).toContain("altleer");
    expect(JSON.stringify(prot[0]!.alt)).toContain(`"richtung":"laengs"`);

    // Zurück auf längs mit dem früheren Weg (Halle speichern, dann „Plan neu setzen“ unter altem Namen): ebenso sauber.
    const mitResten = { ...d.halle!, reihenVersatz: [{ nr: 2, dx: 0, dy: 40, drehung: 90 as const }], objekte: [...(d.halle!.objekte ?? []), { id: "altleer2", art: "kaefigblock" as const, typ: "tauben" as const, x: 300, y: 600, drehung: 0 as const }] };
    await al().katalog.halleSetzen({ schauId: id, halle: mitResten as never });
    await al().katalog.halleSetzen({ schauId: id, halle: { ...mitResten, richtung: "laengs" } as never });
    await al().katalog.planLoesen({ schauId: id, grund: "Plan neu setzen" });
    expect(await fehler([...alteTeile, "altleer2"])).toEqual([]);
    d = await laden();
    expect(d.halle!.richtung).toBe("laengs");
    // Längs wieder ein Taubenblock hinter den Hühnern, belegt.
    expect(d.plan!.objekte.map((o) => [o.id, o.typ, o.kaefige?.length])).toEqual([["neu1", "tauben", 5]]);
    // Automatisch eingesetzt (gespeichert mit Kennzeichen): ändern der Halle fragt nicht nach, setzt einfach neu.
    expect(d.halle!.objekte!.map((o) => o.auto)).toEqual([true]);

    // Einzelreihe an die Wand: eingesetzte Teile werden ebenso neu gesetzt.
    d = await laden();
    await al().katalog.halleSetzen({ schauId: id, halle: { ...d.halle!, objekte: [...(d.halle!.objekte ?? []), { id: "altleer3", art: "kaefigblock", typ: "tauben", x: 300, y: 600, drehung: 0 }] } as never });
    d = await laden();
    await al().katalog.wandreiheStellen({ schauId: id, basis: halleSchluessel(d.halle as Halle), reihe: 1, seite: "anfang" });
    d = await laden();
    expect(d.halle!.wandreihen).toBe(true);
    expect(d.plan!.objekte.map((o) => o.id)).not.toContain("altleer3");
    expect(d.plan!.objekte.every((o) => o.kaefige?.length)).toBe(true);
    expect(d.plan!.warnungen.filter((w) => /überschneidet|ragt/.test(w))).toEqual([]);

    // Rückmeldung 14.11.2026: Bänke stellen verschiebt keine Käfige – im losen Plan (Automatisch planen: an) …
    const lage = (p: NonNullable<typeof d.plan>) => JSON.stringify([...p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck])), ...p.objekte.filter((o) => o.art === "kaefigblock").map((o) => o.rechteck)]);
    d = await laden();
    const vorher = lage(d.plan!);
    const gang = d.plan!.reihen.find((r) => r.platten.length)!.platten[0]!.rechteck;
    const bank = { id: "bank1", art: "bank" as const, x: gang.x, y: gang.y + 300, drehung: 90 as const };
    await al().katalog.halleSetzen({ schauId: id, halle: { ...d.halle!, objekte: [...(d.halle!.objekte ?? []), bank] } as never });
    d = await laden();
    expect(lage(d.plan!)).toBe(vorher);
    // … und im festen Plan (Automatisch planen: aus): dort bleibt auch bei einer geänderten Einstellung alles stehen.
    await al().katalog.planFestschreiben({ schauId: id });
    d = await laden();
    const fest = lage(d.plan!);
    await al().katalog.halleSetzen({ schauId: id, halle: { ...d.halle!, gang: 170, objekte: (d.halle!.objekte ?? []).filter((o) => o.id !== "bank1") } as never });
    d = await laden();
    expect(d.plan!.fest).not.toBeNull();
    expect(lage(d.plan!)).toBe(fest);
  });
});
