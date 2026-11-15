/**
 * Automatische Abmeldung nach Untätigkeit (Rückmeldung 15.11.2026): Frist je Rolle unter „Verein und Datenschutz“, nur die
 * angebotenen Minuten, Protokoll; der Server beendet Büro-Sitzungen nach der Frist, am Tablet zählt die gemeldete Eingabe
 * (Bewerten ohne Netz). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

describe("Automatische Abmeldung", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const vor = (min: number) => new Date(Date.now() - min * 60_000);

  test("Einstellung je Rolle: Vorgabe, Speichern mit Protokoll, nur angebotene Minuten", async () => {
    expect(await al().verein.abmeldung()).toEqual({ admin: 60, mitarbeiter: 120, preisrichter: 120 });
    await al().verein.abmeldungSpeichern({ admin: 15, mitarbeiter: 30, preisrichter: 60 });
    expect(await al().verein.abmeldung()).toEqual({ admin: 15, mitarbeiter: 30, preisrichter: 60 });
    const [p] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Automatische Abmeldung")).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
    expect(p).toBeTruthy();
    expect(al().verein.abmeldungSpeichern({ admin: 7, mitarbeiter: 30, preisrichter: 60 })).rejects.toThrow();
    const status = await al().auth.status();
    expect(status.abmeldung.benutzer).toBe(15);
  });

  test("Büro: nach der Frist ohne Eingabe abgemeldet, mit Eingabe nicht; ein neuer Aufruf belebt nicht wieder", async () => {
    const { neueSitzung, ladeSitzung, sitzungsId } = await import("../auth");
    const token = await neueSitzung({ benutzerId: adminKontext.benutzer!.id });
    const id = sitzungsId(token);
    // 10 Minuten untätig (Frist 15): gilt, und eine frische Eingabe schiebt die Zeit nach vorn.
    await m.db.update(m.schema.sitzung).set({ zuletzt: vor(10) }).where(m.eq(m.schema.sitzung.id, id));
    expect((await ladeSitzung(token, undefined, 0)).benutzer?.id).toBe(adminKontext.benutzer!.id);
    const [s] = await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.id, id));
    expect(Date.now() - s!.zuletzt.getTime()).toBeLessThan(60_000);
    // 20 Minuten untätig: abgemeldet, auch wenn der Aufruf eine frische Eingabe meldet (neu geöffneter Tab).
    await m.db.update(m.schema.sitzung).set({ zuletzt: vor(20) }).where(m.eq(m.schema.sitzung.id, id));
    expect((await ladeSitzung(token, undefined, 0)).benutzer).toBeNull();
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.id, id))).toEqual([]);
  });

  test("Abfragen im Hintergrund (lange keine Eingabe) halten die Sitzung nicht", async () => {
    const { neueSitzung, ladeSitzung, sitzungsId } = await import("../auth");
    const token = await neueSitzung({ benutzerId: adminKontext.benutzer!.id });
    const id = sitzungsId(token);
    await m.db.update(m.schema.sitzung).set({ zuletzt: vor(10) }).where(m.eq(m.schema.sitzung.id, id));
    expect((await ladeSitzung(token, undefined, 12 * 60_000)).benutzer).not.toBeNull();
    const [s] = await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.id, id));
    expect(s!.zuletzt.getTime()).toBeLessThan(vor(9).getTime());
  });

  test("Tablet: Bewerten ohne Netz zählt (gemeldete Eingabe), Untätigkeit nicht", async () => {
    const { neueSitzung, ladeSitzung, sitzungsId } = await import("../auth");
    const { id: schauId } = await al().schau.anlegen({ name: "Abmeldung Tablet", ort: "Halle" });
    const [pr] = await m.db.insert(m.schema.preisrichter).values({ schauId, name: "Abmelde Richter" }).returning();
    const token = await neueSitzung({ preisrichterId: pr!.id });
    const id = sitzungsId(token);
    // Frist 60: 90 Minuten seit dem letzten Abgleich, aber vor 2 Minuten bewertet → angemeldet.
    await m.db.update(m.schema.sitzung).set({ zuletzt: vor(90) }).where(m.eq(m.schema.sitzung.id, id));
    expect((await ladeSitzung(undefined, token, 2 * 60_000)).richter?.id).toBe(pr!.id);
    // 90 Minuten ohne jede Eingabe → abgemeldet.
    await m.db.update(m.schema.sitzung).set({ zuletzt: vor(90) }).where(m.eq(m.schema.sitzung.id, id));
    expect((await ladeSitzung(undefined, token, 90 * 60_000)).richter).toBeNull();
    // Zurück auf die Vorgabe für die folgenden Teile.
    await al().verein.abmeldungSpeichern({ admin: 60, mitarbeiter: 120, preisrichter: 120 });
  });
});
