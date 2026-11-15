/**
 * Reihenfolge der Katalognummern wählbar: speichern (nur Ausstellungsleitung, Vorgabe als null, Protokoll), Vergabe nach
 * der gewählten Folge, Sperre nach dem Festschreiben, Nachmeldungen behalten ihre Nummern; dazu die Prüfliste vor dem
 * Meldeschluss (keine Katalognummern) und der Phasenwechsel beim Überspringen. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { sortierungNormal } from "@schau/domain";
import { adminKontext, m } from "./kontext";

describe("Reihenfolge der Katalognummern", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });

  test("Vorgabe wie bisher, gewählte Folge beim nächsten Vergeben, gesperrt nach dem Festschreiben, Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Sortierung wählbar", ort: "Halle" });
    const s = await al().schau.get({ id });
    expect(s.katalogSortierung).toBeNull();
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melden = async (nachname: string, tiere: [string, "jung" | "alt"][]) => {
      const r = await al().meldung.speichern({
        schauId: id,
        aussteller: { vorname: "Folge", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: tiere.map(([geschlecht, alter]) => ({ farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht, alter, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null })),
      });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r.meldungId;
    };
    await melden("Zander", [["0,1", "alt"], ["1,0", "jung"]]);
    await melden("Abel", [["1,0", "alt"], ["0,1", "jung"]]);

    // Prüfliste vor dem Meldeschluss: bestätigte Tiere ohne Nummer sind (noch) kein Punkt.
    const punkte = async () => (await al().schau.uebersicht({ id })).checkliste.map((p) => p.text);
    expect((await punkte()).some((t) => t.includes("ohne Katalognummer"))).toBe(false);
    await m.db.update(m.schema.schau).set({ phase: "meldung" }).where(m.eq(m.schema.schau.id, id));
    expect((await punkte()).some((t) => t.includes("ohne Katalognummer"))).toBe(false);
    // Beim Überspringen der Katalogphase hält der Phasenwechsel trotzdem auf.
    await expect(al().schau.phaseSetzen({ id, phase: "einlieferung" })).rejects.toThrow("4 Tiere ohne Katalognummer");
    await expect(al().schau.phaseSetzen({ id, phase: "abgeschlossen" })).rejects.toThrow("4 Tiere ohne Katalognummer");
    await m.db.update(m.schema.schau).set({ phase: "katalog" }).where(m.eq(m.schema.schau.id, id));
    expect(await punkte()).toContain("4 Tiere ohne Katalognummer");

    const folge = async () =>
      (await al().katalog.liste({ schauId: id }))
        .sort((a, b) => a.katalogNr! - b.katalogNr! || a.suffix.localeCompare(b.suffix))
        .map((e) => `${e.katalogNr}${e.suffix} ${e.ausstellerName.split(",")[0]} ${e.geschlecht} ${e.alter}`);
    await al().katalog.nummernVergeben({ schauId: id });
    // Vorgabe: je Aussteller 1,0 jung, 1,0 alt, 0,1 jung, 0,1 alt.
    expect(await folge()).toEqual(["1 Abel 1,0 alt", "2 Abel 0,1 jung", "3 Zander 1,0 jung", "4 Zander 0,1 alt"]);

    // Nur die Ausstellungsleitung; doppelte Kriterien abgelehnt.
    await expect(helfer().schau.katalogSortierungSetzen({ id, sortierung: null })).rejects.toThrow();
    await expect(al().schau.katalogSortierungSetzen({ id, sortierung: [{ kriterium: "alter" }, { kriterium: "alter" }] })).rejects.toThrow("nur einmal");

    // Ohne Aussteller, Alter vor Geschlecht, alt vor jung.
    const gewaehlt = [
      { kriterium: "sparte" as const },
      { kriterium: "rasse" as const },
      { kriterium: "farbenschlag" as const },
      { kriterium: "meldeart" as const },
      { kriterium: "alter" as const, umgekehrt: true },
      { kriterium: "geschlecht" as const },
      { kriterium: "aussteller" as const, aus: true },
    ];
    // Gespeichert wird die vollständige Liste (dazu Verein und Ausstellernummer, aus).
    const sortierung = sortierungNormal(gewaehlt);
    expect(await al().schau.katalogSortierungSetzen({ id, sortierung: gewaehlt })).toEqual({ ok: true, geaendert: true });
    expect((await al().schau.get({ id })).katalogSortierung).toEqual(sortierung);
    // Nummern ändern sich erst beim nächsten Vergeben.
    expect(await folge()).toEqual(["1 Abel 1,0 alt", "2 Abel 0,1 jung", "3 Zander 1,0 jung", "4 Zander 0,1 alt"]);
    await al().katalog.nummernVergeben({ schauId: id });
    // Alt vor jung, darin 1,0 vor 0,1; bei Gleichstand nach Meldeeingang (Zander zuerst gemeldet).
    expect(await folge()).toEqual(["1 Abel 1,0 alt", "2 Zander 0,1 alt", "3 Zander 1,0 jung", "4 Abel 0,1 jung"]);

    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).filter((x) => x.aktion === "Reihenfolge der Katalognummern");
    expect(prot).toHaveLength(1);
    expect(prot[0]!.alt).toEqual({ sortierung: null });
    expect(prot[0]!.neu).toEqual({ sortierung });
    // Unverändert gespeichert: kein weiterer Eintrag.
    expect((await al().schau.katalogSortierungSetzen({ id, sortierung })).geaendert).toBe(false);

    // Festgeschrieben: Reihenfolge gesperrt; eine Nachmeldung bekommt eine Unternummer nach der gewählten Folge, die
    // übrigen Nummern bleiben.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    await expect(al().schau.katalogSortierungSetzen({ id, sortierung: null })).rejects.toThrow("festgeschrieben");
    await melden("Mitte", [["0,1", "alt"]]);
    await al().katalog.nummernVergeben({ schauId: id });
    expect(await folge()).toEqual(["1 Abel 1,0 alt", "2 Zander 0,1 alt", "2a Mitte 0,1 alt", "3 Zander 1,0 jung", "4 Abel 0,1 jung"]);

    // Wieder zur Vorgabe (nach Aufheben der Festschreibung): gespeichert als null.
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: false });
    await al().schau.katalogSortierungSetzen({ id, sortierung: [] });
    expect((await al().schau.get({ id })).katalogSortierung).toBeNull();

    // Verein an (vor dem Aussteller): Zanders Verein „ABC“ steht vor Abels leerem Verein.
    const zander = (await m.db.select().from(m.schema.aussteller)).filter((x) => x.nachname === "Zander" && x.vorname === "Folge");
    for (const z of zander) await m.db.update(m.schema.aussteller).set({ verein: "ABC Verein" }).where(m.eq(m.schema.aussteller.id, z.id));
    await al().schau.katalogSortierungSetzen({ id, sortierung: [{ kriterium: "sparte" }, { kriterium: "rasse" }, { kriterium: "farbenschlag" }, { kriterium: "meldeart" }, { kriterium: "verein" }] });
    await al().katalog.nummernVergeben({ schauId: id });
    expect((await folge()).map((x) => x.split(" ").slice(1, 2).join())).toEqual(["Zander", "Zander", "Abel", "Abel", "Mitte"]);
    // Neue Schau aus dieser als Vorlage übernimmt die Reihenfolge.
    await al().schau.katalogSortierungSetzen({ id, sortierung });
    const kopie = await al().schau.anlegen({ name: "Sortierung Folgejahr", ort: "Halle", vorlageId: id });
    expect((await al().schau.get({ id: kopie.id })).katalogSortierung).toEqual(sortierung);
  });
});
