/**
 * Restpunkte aus Audit Runde 7 und Konzept-Abgleich: Meldephase nur mit Gebühren und Meldeschluss, Hinweise vor der
 * Freigabe, Zahlungsweise (vorab oder bei der Einlieferung), Textbausteine zusätzlich je Rasse. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Audit-Restpunkte und Konzept-Abgleich", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const aussteller = (nachname: string) => ({ vorname: "Konzept", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
  async function neueSchau(name: string) {
    const { id } = await al().schau.anlegen({ name, ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melde = (nachname: string) =>
      al().meldung.speichern({
        schauId: id,
        aussteller: aussteller(nachname),
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    return { id, melde };
  }
  const gebuehren = (schauId: number) => al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 400, befreitPreisrichter: false }] });
  const setze = async (id: number, aenderung: Record<string, unknown>) => {
    const s = await al().schau.get({ id });
    await al().schau.aktualisieren({ id, daten: { ...s, ...aenderung } as never });
  };

  test("Meldephase nur mit Gebühren und Meldeschluss – sonst Rückfrage, bewusst übersteuerbar", async () => {
    const { id } = await neueSchau("Konzept Meldephase");
    await expect(al().schau.phaseSetzen({ id, phase: "meldung" })).rejects.toThrow("keine Gebühren");
    await expect(al().schau.phaseSetzen({ id, phase: "meldung" })).rejects.toThrow("kein Meldeschluss");
    await gebuehren(id);
    const ohneSchluss = al().schau.phaseSetzen({ id, phase: "meldung" });
    await expect(ohneSchluss).rejects.toThrow("kein Meldeschluss");
    await expect(al().schau.phaseSetzen({ id, phase: "meldung" })).rejects.not.toThrow("keine Gebühren");
    await setze(id, { meldeschluss: "2026-12-01" });
    expect((await al().schau.phaseSetzen({ id, phase: "meldung" })).ok).toBe(true);
    expect((await al().schau.get({ id })).phase).toBe("meldung");

    const zweite = await neueSchau("Konzept Meldephase trotzdem");
    expect((await al().schau.phaseSetzen({ id: zweite.id, phase: "meldung", trotzdem: true })).ok).toBe(true);
  });

  test("Zahlungsweise: vorab per Überweisung oder bei der Einlieferung, 0,00 € ohne Zahlungsaufforderung", async () => {
    const { zahlungsZeilen } = await import("../routers/meldung");
    const konto = { girocode: false, vereinKontoinhaber: "", vereinIban: "", vereinBic: "" };
    const vorab = { ...konto, bankverbindung: "IBAN DE00 Testbank", zahlungBeiEinlieferung: false };
    const einlieferung = { ...konto, bankverbindung: "IBAN DE00 Testbank", zahlungBeiEinlieferung: true };
    expect(zahlungsZeilen(vorab, 800).join(" ")).toContain("Die Meldung wird erst nach Zahlungseingang bearbeitet.");
    expect(zahlungsZeilen(vorab, 800).join(" ")).toContain("IBAN DE00 Testbank");
    const bei = zahlungsZeilen(einlieferung, 800, 500).join(" ");
    expect(bei).toContain("bei der Einlieferung");
    expect(bei).toContain("13,00");
    expect(bei).not.toContain("IBAN");
    expect(bei).not.toContain("Zahlungseingang");
    expect(zahlungsZeilen(vorab, 0)).toEqual(["Für diese Meldung fällt kein Meldegeld an. Die Ausstellungsleitung bestätigt sie."]);

    const { id } = await neueSchau("Konzept Zahlung");
    const slug = (await al().schau.get({ id })).slug;
    await gebuehren(id);
    await setze(id, { meldeschluss: "2026-12-01", zahlungBeiEinlieferung: true });
    await al().schau.phaseSetzen({ id, phase: "meldung" });
    expect((await al().schau.get({ id })).zahlungBeiEinlieferung).toBe(true);
    expect((await m.appRouter.createCaller(leer).oeffentlich.schau({ slug })).zahlungBeiEinlieferung).toBe(true);
  });

  test("Freigabe: Hinweis auf frühe Phase und freie Preise, danach bewusst freigeben", async () => {
    const { id, melde } = await neueSchau("Konzept Freigabe");
    await gebuehren(id);
    await setze(id, { meldeschluss: "2026-12-01" });
    await al().schau.phaseSetzen({ id, phase: "meldung" });
    const r = await melde("Freigabe");
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const { id: prId } = await al().preisrichter.speichern({ schauId: id, name: "Konzept Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: prId, vonNr: 1, bisNr: 9999 }] });
    // Feste Preisart: ein Band je Preisrichter – bleibt frei, solange niemand es vergibt.
    await al().schau.preisartSpeichern({ schauId: id, kuerzel: "KB", name: "Konzeptband", betragCent: 0, sachpreis: "Band", quelle: "standgeld", schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 1, mindestpunkte: null, rundung: "voll", folge: 99 });
    await al().schau.phaseSetzen({ id, phase: "bewertung", trotzdem: true });
    const tier = (await al().bewertung.liste({ schauId: id, preisrichterId: null })).eintraege[0]!;
    await al().bewertung.setzen({ schauId: id, katalogeintragId: tier.id, punkte: 95, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" });

    await expect(al().preise.freigeben({ schauId: id, freigegeben: true })).rejects.toThrow("Phase „Bewertung“");
    expect((await al().schau.get({ id })).ergebnisseFreigegeben).toBe(false);
    await al().schau.phaseSetzen({ id, phase: "preise", trotzdem: true, grund: "Test: Ablauf" });
    // In der richtigen Phase bleibt nur der Hinweis auf freie Preise (das Band ist nicht vergeben).
    await expect(al().preise.freigeben({ schauId: id, freigegeben: true })).rejects.toThrow("Noch freie Preise: KB 1 von 1 (Konzept Richter).");
    await expect(al().preise.freigeben({ schauId: id, freigegeben: true })).rejects.not.toThrow("Phase");
    expect((await al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true })).ok).toBe(true);
    expect((await al().schau.get({ id })).ergebnisseFreigegeben).toBe(true);
  });

  test("Textbausteine je Rasse: zusätzlich zur Art; am Tablet nur für Tiere dieser Rasse; Grundbestand bleibt vollständig", async () => {
    const { id, melde } = await neueSchau("Konzept Bausteine");
    await melde("Baustein");
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, id));
    await al().meldung.statusSetzen({ id: mel!.id, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const { id: prId } = await al().preisrichter.speichern({ schauId: id, name: "Baustein Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: prId, vonNr: 1, bisNr: 9999 }] });
    const tablet = m.appRouter.createCaller({ ...leer, richter: { id: prId, schauId: id, name: "Baustein Richter", istObmann: false } });
    const rasse = (await tablet.richter.daten()).tiere[0]!.rasse!;
    expect(rasse).toMatch(/Wyandotten/);

    const b = { kategorie: "mangel" as const, text: "Kammzacken zu grob (Konzepttest)", gruppe: "Kamm", art: "huehner" };
    await al().bewertung.textbausteinSpeichern({ ...b, rasse });
    await expect(al().bewertung.textbausteinSpeichern({ ...b, rasse: rasse.toUpperCase() })).rejects.toThrow("gibt es schon");
    await al().bewertung.textbausteinSpeichern({ ...b, rasse: "Orpington" });
    await al().bewertung.textbausteinSpeichern({ ...b, rasse: "" }); // ohne Rasse: eigener Baustein
    const liste = (await al().bewertung.textbausteine()).filter((x) => x.text === b.text);
    expect(liste.map((x) => x.rasse).sort()).toEqual([null, "Orpington", rasse].sort());

    const amTablet = (await tablet.richter.daten()).textbausteine.filter((x) => x.text === b.text);
    expect(amTablet.map((x) => x.rasse).sort()).toEqual([null, rasse].sort()); // Orpington-Baustein kommt nicht aufs Tablet

    // Ein gleichlautender Baustein für eine Rasse ersetzt den allgemeinen Grundbaustein nicht.
    const { TEXTBAUSTEINE_GRUNDBESTAND } = await import("../services/textbausteine");
    const g = TEXTBAUSTEINE_GRUNDBESTAND.find((x) => x.art === "huehner")!;
    const vorhanden = (await al().bewertung.textbausteine()).find((x) => x.text === g.text && x.kategorie === g.kategorie && x.gruppe === g.gruppe && x.art === g.art && !x.rasse)!;
    await al().bewertung.textbausteinLoeschen({ id: vorhanden.id });
    await al().bewertung.textbausteinSpeichern({ kategorie: g.kategorie, text: g.text, gruppe: g.gruppe, art: g.art, rasse });
    expect((await al().bewertung.textbausteinGrundbestand()).neu).toBe(1);
  });
});
