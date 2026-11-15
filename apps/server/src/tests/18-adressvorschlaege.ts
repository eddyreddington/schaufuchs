/** Vorschläge für Ort, Straße, Verein und Kreisverband aus den eigenen Ausstellerdaten. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Adressvorschläge", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  test("am PC aus den bisherigen Ausstellern; öffentlich nur Vereine und Kreisverbände, keine Adressen", async () => {
    const { id } = await al().schau.anlegen({ name: "Vorschlag Schau", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const { meldungId } = await al().meldung.speichern({
      schauId: id,
      aussteller: { vorname: "Vor", nachname: "Schlag", strasse: "Eichenallee 17b", plz: "35321", ort: "Laubach", telefon: "", email: "", verein: "GZV Laubach-Vorschlag", kreisverband: "KV Vorschlag", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" },
      eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
      positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
    });
    const v = await helfer().meldung.adressVorschlaege();
    expect(v.orte).toContainEqual({ plz: "35321", ort: "Laubach" });
    expect(v.strassen).toContainEqual({ plz: "35321", ort: "Laubach", strasse: "Eichenallee" });
    expect(v.vereine).toContainEqual({ verein: "GZV Laubach-Vorschlag", kreisverband: "KV Vorschlag" });
    expect(v.kreisverbaende).toContain("KV Vorschlag");

    // Öffentliche Seite: Verein und Kreisverband ja (nur aus bestätigten Meldungen), aber weder Straße noch PLZ, Ort oder Name.
    expect((await m.appRouter.createCaller({ ...adminKontext, benutzer: null }).oeffentlich.schau({ slug: s.slug }).catch(() => ({ vereine: [] }))).vereine).not.toContainEqual({ verein: "GZV Laubach-Vorschlag", kreisverband: "KV Vorschlag" });
    await al().meldung.statusSetzen({ id: meldungId, status: "bestaetigt" });
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    const pub = await m.appRouter.createCaller({ ...adminKontext, benutzer: null }).oeffentlich.schau({ slug: s.slug });
    expect(pub.vereine).toContainEqual({ verein: "GZV Laubach-Vorschlag", kreisverband: "KV Vorschlag" });
    expect(pub.kreisverbaende).toContain("KV Vorschlag");
    const text = JSON.stringify(pub);
    for (const geheim of ["Eichenallee", "35321", "Schlag"]) expect(text).not.toContain(geheim);

    // Gesperrter Aussteller (Löschwunsch): keine Vorschläge mehr, weder am PC noch öffentlich.
    await m.db.update(m.schema.aussteller).set({ gesperrtAm: new Date() }).where(m.eq(m.schema.aussteller.nachname, "Schlag"));
    const danach = await helfer().meldung.adressVorschlaege();
    expect(danach.strassen.some((x) => x.strasse === "Eichenallee")).toBe(false);
    expect(danach.vereine.some((x) => x.verein === "GZV Laubach-Vorschlag")).toBe(false);
    const pubDanach = await m.appRouter.createCaller({ ...adminKontext, benutzer: null }).oeffentlich.schau({ slug: s.slug });
    expect(pubDanach.vereine.some((x) => x.verein === "GZV Laubach-Vorschlag")).toBe(false);
  });
});
