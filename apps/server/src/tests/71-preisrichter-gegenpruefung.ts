/**
 * Preisrichter, Gegenprüfung: Zusage, Vorbehalt, Gruppen und Obmann in Auskunft, Bereinigung und Protokoll (Vorbehalt
 * nur als „geändert“), Vorlage ohne den alten Stand der Zusage, Löschen mit Protokoll, Obmann-Zuordnung unter Sperre.
 * Gruppen im Test erfunden (X1, X2). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Preisrichter: Gegenprüfung Datenschutz, Vorlage, Löschen, Sperre", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const org = () => adminKontext.benutzer!.organisationId;
  const protokollAb = async () => ((await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }])[0].ab;
  const protokoll = async (ab: number) => (await m.db.select().from(m.schema.aenderung)).filter((p) => p.id > ab && p.tabelle === "preisrichter").sort((x, y) => x.id - y.id);
  const richter = (schauId: number, name: string, mehr: Record<string, unknown> = {}) =>
    al().preisrichter.speichern({ schauId, name, anschrift: "", email: "", telefon: "", istObmann: false, sparten: [], ...mehr });
  const zeile = async (id: number) => (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.id, id)))[0]!;

  test("Auskunft mit Zusage, Vorbehalt, Gruppen und Obmann; Vorbehalt ohne Wert im Protokoll; Bereinigung leert ihn", async () => {
    const { id } = await al().schau.anlegen({ name: "Vorbehalt Datenschutz", ort: "Halle" });
    const ob = await richter(id, "Vorbehalt Obmann", { istObmann: true });
    const pr = await richter(id, "Vorbehalt Richterin", { obmannId: ob.id, gruppen: ["x1", "X2"], sparten: ["Tauben"] });
    const ab = await protokollAb();
    await richter(id, "Vorbehalt Richterin", { id: pr.id, sparten: ["Tauben"], zusage: "zugesagt", zugesagtFuer: "2027", vorbehalt: "nur vormittags, privat" });

    // Protokoll: Zusage mit Wert, der Vorbehalt (freier Text, kann Privates enthalten) nur als geändert.
    const p = await protokoll(ab);
    expect(p).toHaveLength(1);
    expect(JSON.stringify(p[0]!.alt) + JSON.stringify(p[0]!.neu)).not.toContain("nur vormittags");
    expect(p[0]!.alt).toEqual({ zusage: "offen", zugesagtFuer: "" });
    expect(p[0]!.neu).toEqual({ zusage: "zugesagt", zugesagtFuer: "2027", geaendertOhneWert: ["vorbehalt"] });
    // Auch beim Anlegen kein Vorbehalt im Protokoll.
    const neu = await richter(id, "Vorbehalt Neu", { vorbehalt: "Gesundheit, privat" });
    expect(JSON.stringify((await protokoll(ab)).find((x) => x.datensatzId === neu.id)!.neu)).not.toContain("Gesundheit");

    // Auskunft (Art. 15): alle Angaben zum Preisrichter.
    const { ladeAuskunftPerson, bereinige } = await import("../services/datenschutz");
    const a = (await ladeAuskunftPerson(org(), "Vorbehalt Richterin")).preisrichter[0]!;
    expect(a).toMatchObject({ zusage: "zugesagt", zugesagtFuer: "2027", vorbehalt: "nur vormittags, privat", gruppen: ["X1", "X2"], sparten: ["Tauben"], obmann: "Vorbehalt Obmann" });

    // Bereinigung nach dem Abschluss: Vorbehalt und „zugesagt für“ mit den Kontaktdaten leer.
    await bereinige(new Date(), { organisationId: org() });
    expect((await zeile(pr.id)).vorbehalt).toBe("nur vormittags, privat");
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen", abgeschlossenAm: new Date(Date.now() - 60 * 86_400_000) }).where(m.eq(m.schema.schau.id, id));
    const n = await bereinige(new Date(), { organisationId: org() });
    expect(n.preisrichter).toBeGreaterThan(0);
    const z = await zeile(pr.id);
    expect([z.vorbehalt, z.zugesagtFuer]).toEqual(["", ""]);
    expect((await zeile(neu.id)).vorbehalt).toBe("");
  });

  test("Vorlage: Zusage wieder offen, ohne Vorbehalt; „zugesagt für“ bleibt als Hinweis", async () => {
    const { id } = await al().schau.anlegen({ name: "Vorlage Zusage", ort: "Halle" });
    await richter(id, "Vorlage Zugesagt", { zusage: "zugesagt", zugesagtFuer: "2027 und 2028", vorbehalt: "Termin klären" });
    await richter(id, "Vorlage Abgesagt", { zusage: "abgesagt" });
    const kopie = await al().schau.anlegen({ name: "Vorlage Zusage Kopie", ort: "Halle", vorlageId: id });
    const k = (await al().preisrichter.liste({ schauId: kopie.id })).richter;
    const zu = k.find((x) => x.name === "Vorlage Zugesagt")!;
    expect([zu.zusage, zu.zugesagtFuer, zu.vorbehalt]).toEqual(["offen", "2027 und 2028", ""]);
    expect(k.find((x) => x.name === "Vorlage Abgesagt")!.zusage).toBe("offen");
  });

  test("Löschen: Protokoll, Zuordnungen zum gelöschten Obmann gelöst mit Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Löschen Obmann", ort: "Halle" });
    const ob = await richter(id, "Lösch Obmann", { istObmann: true, gruppen: ["X1"] });
    const pr = await richter(id, "Lösch Richter", { obmannId: ob.id });
    const ab = await protokollAb();
    await al().preisrichter.loeschen({ schauId: id, id: ob.id });
    const p = await protokoll(ab);
    expect(p.map((x) => [x.datensatzId, x.aktion])).toEqual([[pr.id, "Obmann-Zuordnung gelöst"], [ob.id, "gelöscht"]]);
    expect(p[1]!.alt).toMatchObject({ name: "Lösch Obmann", istObmann: true, gruppen: ["X1"] });
    expect((await zeile(pr.id)).obmannId).toBeNull();
    // Nicht gefunden: kein Protokoll.
    await expect(al().preisrichter.loeschen({ schauId: id, id: ob.id })).rejects.toThrow("Preisrichter nicht gefunden.");
    expect(await protokoll(ab)).toHaveLength(2);
  });

  test("Obmann-Zuordnung unter Sperre: wird der Obmann gleichzeitig zurückgesetzt, lehnt die Zuordnung ab", async () => {
    const { id } = await al().schau.anlegen({ name: "Obmann Sperre", ort: "Halle" });
    const ob = await richter(id, "Sperre Obmann", { istObmann: true });
    const pr = await richter(id, "Sperre Richter");
    let freigeben!: () => void;
    const frei = new Promise<void>((r) => (freigeben = r));
    let gesperrt!: () => void;
    const istGesperrt = new Promise<void>((r) => (gesperrt = r));
    // Andere Anfrage: nimmt dem Obmann den Haken und hält die Zeile, bis freigegeben wird.
    const andere = m.db.transaction(async (tx) => {
      await tx.update(m.schema.preisrichter).set({ istObmann: false }).where(m.eq(m.schema.preisrichter.id, ob.id));
      gesperrt();
      await frei;
    });
    await istGesperrt;
    const zuordnen = richter(id, "Sperre Richter", { id: pr.id, obmannId: ob.id }).then(
      () => "gespeichert",
      (e: Error) => e.message,
    );
    const vorFreigabe = await Promise.race([zuordnen, new Promise((r) => setTimeout(() => r("wartet"), 300))]);
    freigeben();
    await andere;
    expect(vorFreigabe).toBe("wartet");
    expect(await zuordnen).toBe("Der gewählte Preisrichter ist kein Obmann.");
    expect((await zeile(pr.id)).obmannId).toBeNull();
  });
});
