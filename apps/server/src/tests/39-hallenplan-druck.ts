/**
 * Hallenplan drucken: genau ein Blatt A4 (quer, wenn die Zeichnung breiter als hoch ist), auch bei einer großen Halle mit
 * vielen Käfigen, festgeschrieben und frei; die Aufbauliste ist ein eigenes PDF. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { halleSchluessel } from "@schau/domain";
import { adminKontext, m } from "./kontext";

const seiten = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
const format = (pdf: Buffer) => pdf.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)?.slice(1).map(Number);

describe("Hallenplan drucken", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  test("ein Blatt A4 – auch 15,5 × 27,5 m mit 271 Käfigen; Aufbauliste getrennt", async () => {
    const { hallenplanPdf, aufbaulistePdf } = await import("../pdf/hallenplan");
    const { id } = await al().schau.anlegen({ name: "Druck Schau", ort: "Halle" });
    const laden = async () => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!;
    // Ohne Halle: trotzdem genau ein Blatt (mit Hinweis).
    expect(seiten(await hallenplanPdf(await laden()))).toBe(1);

    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    for (let i = 0; i < 6; i++) {
      const n = i < 5 ? 50 : 21;
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Druck", nachname: `Nr${i}`, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: Array.from({ length: n }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    }
    await al().katalog.nummernVergeben({ schauId: id });
    await al().katalog.halleSetzen({
      schauId: id,
      halle: { breite: 1550, laenge: 2750, gang: 150, richtung: "quer", wandreihen: true, quergang: false, wandBuendig: true, hauptgang: { breite: 250, lage: "ende" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [{ name: "Notausgang", art: "eingang", x: 0, y: 200, breite: 50, tiefe: 150 }] },
    });
    const plan = (await al().katalog.hallenplan({ schauId: id })).plan!;
    expect(plan.reihen.reduce((n, r) => n + r.kaefige.length, 0)).toBe(271);

    // Frei (automatisch gestellt) und festgeschrieben: je genau ein Blatt A4 quer.
    for (const fest of [false, true]) {
      if (fest) await al().katalog.planFestschreiben({ schauId: id });
      const pdf = await hallenplanPdf(await laden());
      expect(seiten(pdf)).toBe(1);
      const [b, h] = format(pdf)!;
      expect(b).toBeCloseTo(841.89, 1);
      expect(h).toBeCloseTo(595.28, 1);
      // Käfignummern stehen im Plan (Text 1 … 271).
      expect(pdf.length).toBeGreaterThan(20_000);
    }
    // Aufbauliste: eigenes PDF, hochkant.
    const liste = await aufbaulistePdf(await laden());
    expect(seiten(liste)).toBeGreaterThanOrEqual(1);
    const [lb, lh] = format(liste)!;
    expect(lb).toBeLessThan(lh!);
  });

  test("Reihe an die Wand gezogen: dort eine Einzelreihe, Notausgang frei, übrige Reihen neu; im festen Plan nur bestätigt", async () => {
    const { id } = await al().schau.anlegen({ name: "Wand Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const r = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Wand", nachname: "Test", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: Array.from({ length: 40 }, () => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
    });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.halleSetzen({
      schauId: id,
      halle: { breite: 1550, laenge: 2750, gang: 150, richtung: "quer", wandreihen: false, quergang: false, wandBuendig: true, hauptgang: { breite: 250, lage: "ende" }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [{ name: "Notausgang", art: "eingang", x: 0, y: 0, breite: 50, tiefe: 60 }] },
    });
    const laden = () => al().katalog.hallenplan({ schauId: id });
    let d = await laden();
    expect(d.plan!.reihen[0]!.art).toBe("doppel");
    // Gerechneter Plan: ohne Rückfrage am Server (die macht die Oberfläche).
    await al().katalog.wandreiheStellen({ schauId: id, basis: halleSchluessel(d.halle), reihe: 1, seite: "anfang" });
    d = await laden();
    expect(d.halle).toMatchObject({ wandreihen: true, wandreiheSeite: "anfang" });
    expect(d.plan!.reihen[0]).toMatchObject({ art: "wand", x: 0 });
    expect(d.plan!.reihen.filter((x) => x.art === "wand")).toHaveLength(1);
    // Vor dem Notausgang (Hallen-x 0–50) bleibt der Gang frei.
    expect(d.plan!.reihen[0]!.abschnitte[0]!.von).toBeGreaterThanOrEqual(200);
    expect(d.plan!.nichtPlatziert).toHaveLength(0);
    // Fester Plan: nur mit neuSetzen, danach ist er wieder gerechnet.
    await al().katalog.planFestschreiben({ schauId: id });
    d = await laden();
    await expect(al().katalog.wandreiheStellen({ schauId: id, basis: halleSchluessel(d.halle), reihe: 2, seite: "ende" })).rejects.toThrow(/festgeschrieben/);
    await al().katalog.wandreiheStellen({ schauId: id, basis: halleSchluessel(d.halle), reihe: 2, seite: "ende", neuSetzen: true });
    d = await laden();
    expect(d.plan!.fest).toBeNull();
    expect(d.halle!.wandreihen).toBe(true);
    expect(d.halle!.wandreiheSeite).toBeUndefined();
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Einzelreihe an der Wand");
    expect(prot).toHaveLength(2);
    // Veralteter Stand: abgelehnt.
    await expect(al().katalog.wandreiheStellen({ schauId: id, basis: "alt", reihe: 2, seite: "ende" })).rejects.toThrow(/inzwischen/);
  });
});
