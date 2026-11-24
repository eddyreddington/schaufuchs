/**
 * Gleichzeitiges Arbeiten in Katalog und Halle (Entscheidung 033): Nummern vergeben, nach Hallenplan vergeben und
 * Festschreibung aufheben gegen eine gleichzeitige Note, Ausgabe gegen eine gleichzeitige Sperre im Gesundheitsjournal,
 * Impfnachweis von zwei Anfragen und gegen den Abschluss, Entscheiden für zwei Entwürfe, zwei Logos, doppelt aufgehobene
 * Sperre, Bestätigen gegen die gehaltene Einteilung (Protokoll zuletzt). Eine zweite Verbindung hält die Sperre bzw.
 * schreibt zwischen Lesen und Schreiben (deterministisch). Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";
import { wartetOderFertig } from "./sperren-hilfe";

const al = () => m.appRouter.createCaller(adminKontext);
const aussteller = (n: string) => ({ vorname: "Gleich", nachname: n, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Schau mit zwei bestätigten Tieren (nummeriert); gibt Schau, Meldung und Tiere zurück. */
async function schauMitTieren(name: string) {
  const { id } = await al().schau.anlegen({ name, ort: "Halle" });
  const v = (await al().schau.get({ id })).stammdatenVersionId!;
  const [f] = (await m.sql`select f.id from farbenschlag f join rasse r on r.id = f.rasse_id where r.version_id = ${v} order by f.id limit 1`) as unknown as { id: number }[];
  const r = await al().meldung.speichern({ schauId: id, aussteller: aussteller(name), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(f!.id), pos(f!.id)] });
  await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
  await al().katalog.nummernVergeben({ schauId: id });
  const tiere = (await al().katalog.liste({ schauId: id })).sort((a, b) => a.id - b.id);
  return { id, meldungId: r.meldungId, tiere };
}
const protokoll = async (schauId: number, aktion: string) =>
  (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, schauId))).filter((x) => x.aktion === aktion).sort((a, b) => a.id - b.id);

/** Eine zweite Verbindung: `vorher` in offener Transaktion, dann `lauf` starten, warten, committen und `lauf` abwarten. */
async function mitOffenerTransaktion<T>(vorher: (s: typeof m.sql) => Promise<unknown>, lauf: () => Promise<T>, dazwischen?: (s: typeof m.sql) => Promise<unknown>) {
  const s = await m.sql.reserve();
  try {
    await s`begin`;
    await vorher(s as unknown as typeof m.sql);
    const p = lauf().then(
      (wert) => ({ ok: true as const, wert }),
      (fehler: Error) => ({ ok: false as const, fehler }),
    );
    await wartetOderFertig(p);
    try {
      if (dazwischen) await dazwischen(s as unknown as typeof m.sql);
      await s`commit`;
    } catch (e) {
      // Z. B. Verklemmung (40P01) in der zweiten Verbindung: zurückrollen, damit die Verbindung sauber in den Pool geht.
      await s`rollback`.catch(() => {});
      await p;
      throw e;
    }
    return await p;
  } finally {
    s.release();
  }
}

describe("Gleichzeitig in Katalog und Halle", () => {
  test("Nummern vergeben: eine gleichzeitige Note (auch ohne Zeilensperre) verhindert das Umnummerieren", async () => {
    for (const zeilensperre of [true, false]) {
      const { id, tiere } = await schauMitTieren(`Nummern ${zeilensperre}`);
      const x = tiere[1]!;
      const r = await mitOffenerTransaktion(
        async (s) => {
          if (zeilensperre) await s`select id from katalogeintrag where id = ${x.id} for update`;
          await s`insert into bewertung (katalogeintrag_id, punkte) values (${x.id}, 93)`;
        },
        () => al().katalog.nummernVergeben({ schauId: id }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fehler.message).toContain("Neu nummerieren geht nicht mehr");
    }
  });

  test("Festschreibung aufheben: eine gleichzeitige Note verhindert es", async () => {
    const { id, tiere } = await schauMitTieren("Festschreibung");
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    const x = tiere[0]!;
    const r = await mitOffenerTransaktion(
      (s) => s`insert into bewertung (katalogeintrag_id, punkte) values (${x.id}, 93)`,
      () => al().katalog.gedrucktSetzen({ schauId: id, gedruckt: false }),
    );
    expect(r.ok).toBe(false);
    expect((await al().schau.get({ id })).katalogGedruckt).toBe(true);
  });

  test("Ausgabe gegen eine gleichzeitige Sperre im Gesundheitsjournal", async () => {
    const { id, tiere } = await schauMitTieren("Ausgabe Sperre");
    const x = tiere[0]!;
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, x.id));
    // Die zweite Verbindung hält das Tier, die Ausgabe hat schon geladen (ohne Sperre) und wartet; dann kommt die Sperre.
    const r = await mitOffenerTransaktion(
      (s) => s`select id from katalogeintrag where id = ${x.id} for update`,
      () => al().halle.statusSetzen({ schauId: id, ids: [x.id], status: "ausgesetzt" }),
      (s) => s`insert into gesundheit (schau_id, katalogeintrag_id, befund, sperre) values (${id}, ${x.id}, 'Verdacht', true)`,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.message).toContain("Gesperrt");
    const [e] = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, x.id));
    expect(e!.status).toBe("eingeliefert");
    // Mit Grund geht die Ausgabe, und das Protokoll nennt die Ausnahme.
    await al().halle.statusSetzen({ schauId: id, ids: [x.id], status: "ausgesetzt", uebersteuern: "Tierarzt ordnet an" });
    expect((await protokoll(id, `Status ausgesetzt, gesperrt: ${x.katalogNr}${x.suffix}`)).length).toBe(1);

    // Absicherung (kein Nachweis eines Funds): Erfassen wartet auf ein gehaltenes Tier. Das täte es auch ohne die
    // ausdrückliche Tiersperre – der Fremdschlüssel gesundheit → katalogeintrag nimmt beim Einfügen FOR KEY SHARE.
    const y = tiere[1]!;
    const s = await m.sql.reserve();
    await s`begin`;
    await s`select id from katalogeintrag where id = ${y.id} for update`;
    const erfassen = al().halle.gesundheitErfassen({ schauId: id, nr: `${y.katalogNr}${y.suffix}`, befund: "Verdacht", sperre: true });
    await Bun.sleep(300);
    const waehrend = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.katalogeintragId, y.id));
    await s`commit`;
    s.release();
    await erfassen;
    expect(waehrend.length).toBe(0);
  });

  test("Impfnachweis: zwei Anfragen nacheinander geprüft – Protokoll und Endstand passen", async () => {
    const { id, meldungId } = await schauMitTieren("Impfnachweis");
    const nd = { datum: "2026-09-01", impfstoff: "Nobilis ND", tierarzt: "Dr. Huhn" };
    const leer = { datum: null, impfstoff: "", tierarzt: "" };
    const wg = { datum: null, sentinel: false, stelle: "" };
    const r = await mitOffenerTransaktion(
      (s) => s`select id from meldung where id = ${meldungId} for update`,
      async () => {
        const a = al().halle.vetSetzen({ meldungId, nd, pmv: leer, wg, geprueft: false });
        await Bun.sleep(50);
        const b = al().halle.vetSetzen({ meldungId, nd, pmv: leer, wg, geprueft: true });
        return Promise.all([a, b]);
      },
    );
    expect(r.ok).toBe(true);
    const eintraege = await protokoll(id, "Impfnachweis");
    expect(eintraege.length).toBe(2);
    const erster = eintraege[0]!;
    const zweiter = eintraege[1]!;
    expect(zweiter.alt).toEqual(erster.neu);
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    expect((zweiter.neu as { geprueft: boolean }).geprueft).toBe(!!mel!.vetGeprueftAm);
  });

  test("Entscheiden für zwei Entwürfe gleichzeitig: Halle und Protokoll nennen denselben", async () => {
    const { id: schauId } = await al().schau.anlegen({ name: "Entscheiden gleichzeitig", ort: "Halle" });
    const halle = { breite: 1000, laenge: 2000, gang: 150, richtung: "laengs" as const, wandreihen: true, quergang: true, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId, halle });
    const { id: e1 } = await al().hallenentwurf.speichern({ schauId, name: "E1 – 10 m" });
    await al().katalog.halleSetzen({ schauId, halle: { ...halle, breite: 1400 } });
    const { id: e2 } = await al().hallenentwurf.speichern({ schauId, name: "E2 – 14 m" });
    await m.db.update(m.schema.hallenentwurf).set({ fest: null }).where(m.inArray(m.schema.hallenentwurf.id, [e1, e2]));
    const r = await mitOffenerTransaktion(
      (s) => s`select id from schau where id = ${schauId} for update`,
      () => Promise.allSettled([al().hallenentwurf.entscheiden({ schauId, id: e1, bestaetigt: true }), al().hallenentwurf.entscheiden({ schauId, id: e2, bestaetigt: true })]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wert.filter((x) => x.status === "fulfilled").length).toBe(1);
    const entschieden = await protokoll(schauId, "Hallenplan entschieden");
    expect(entschieden.length).toBe(1);
    const gewaehlt = (entschieden[0]!.neu as { gewaehlt: string }).gewaehlt;
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    expect(s!.halle!.breite).toBe(gewaehlt.startsWith("E1") ? 1000 : 1400);
  });

  test("Zwei Logos gleichzeitig: es bleibt eins", async () => {
    const { id: schauId } = await al().schau.anlegen({ name: "Logo gleichzeitig", ort: "Halle" });
    const daten = Buffer.from(PNG, "base64");
    const r = await mitOffenerTransaktion(
      (s) => s`insert into bild (schau_id, rolle, mime, name, daten) values (${schauId}, 'logo', 'image/png', 'a.png', ${daten})`,
      () => al().katalogGestaltung.bildHochladen({ schauId, rolle: "logo", name: "b.png", base64: PNG }),
    );
    expect(r.ok).toBe(true);
    const logos = (await m.db.select().from(m.schema.bild).where(m.eq(m.schema.bild.schauId, schauId))).filter((b) => b.rolle === "logo");
    expect(logos.map((b) => b.name)).toEqual(["b.png"]);
  });

  test("Sperre zweimal aufheben: der zweite Aufruf ändert nichts", async () => {
    const { id, tiere } = await schauMitTieren("Sperre aufheben");
    const x = tiere[0]!;
    await al().halle.gesundheitErfassen({ schauId: id, nr: `${x.katalogNr}${x.suffix}`, befund: "Verdacht", sperre: true });
    const [g] = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.katalogeintragId, x.id));
    await al().halle.gesundheitFreigeben({ schauId: id, id: g!.id, grund: "Tierarzt A" });
    await al().halle.gesundheitFreigeben({ schauId: id, id: g!.id, grund: "Tierarzt B" });
    const [nachher] = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.id, g!.id));
    expect(nachher!.aufhebungGrund).toBe("Tierarzt A");
    // Gleichzeitig: eine neue Sperre; die zweite Verbindung hält sie und hebt sie auf, während der Aufruf wartet.
    await al().halle.gesundheitErfassen({ schauId: id, nr: `${x.katalogNr}${x.suffix}`, befund: "Verdacht 2", sperre: true });
    const [g2] = (await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.katalogeintragId, x.id))).filter((y) => y.id !== g!.id);
    const r = await mitOffenerTransaktion(
      (s) => s`select id from gesundheit where id = ${g2!.id} for update`,
      () => al().halle.gesundheitFreigeben({ schauId: id, id: g2!.id, grund: "Tierarzt D" }),
      (s) => s`update gesundheit set sperre = false, aufgehoben_am = now(), aufhebung_grund = 'Tierarzt C' where id = ${g2!.id}`,
    );
    expect(r.ok).toBe(true);
    const [nachher2] = await m.db.select().from(m.schema.gesundheit).where(m.eq(m.schema.gesundheit.id, g2!.id));
    expect(nachher2!.aufhebungGrund).toBe("Tierarzt C");
    expect((await protokoll(id, "Sperre aufgehoben")).map((p) => p.datensatzId)).toEqual([g!.id]);
  });

  test("Nach Plan nummerieren: eine gleichzeitige Note verhindert das Umnummerieren", async () => {
    const { id, tiere } = await schauMitTieren("Nach Plan gleichzeitig");
    const halle = { breite: 800, laenge: 1000, gang: 150, richtung: "laengs" as const, wandreihen: false, quergang: false, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" as const }, platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, objekte: [], reihenVersatz: [], plattenVersatz: [], spartenStart: [], flaechen: [] };
    await al().katalog.halleSetzen({ schauId: id, halle });
    await al().katalog.planFestschreiben({ schauId: id });
    const r = await mitOffenerTransaktion(
      (s) => s`insert into bewertung (katalogeintrag_id, punkte) values (${tiere[1]!.id}, 93)`,
      () => al().katalog.nummernNachPlan({ schauId: id }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.message).toContain("Neu nummerieren geht nicht mehr");
    expect(await protokoll(id, "Katalognummern nach Hallenplan vergeben")).toHaveLength(0);
  });

  test("Meldung bestätigen (Katalog festgeschrieben): erst die Einteilungssperre, dann das Protokoll – keine Verklemmung", async () => {
    const { id, meldungId } = await schauMitTieren("Bestaetigen Einteilung");
    await al().katalog.gedrucktSetzen({ schauId: id, gedruckt: true });
    await al().meldung.statusSetzen({ id: meldungId, status: "offen" });
    // Die zweite Verbindung hält die Einteilung (wie die Nummernvergabe) und protokolliert danach (Kette).
    const r = await mitOffenerTransaktion(
      (s) => s`select pg_advisory_xact_lock(2026111201, ${id})`,
      () => al().meldung.statusSetzen({ id: meldungId, status: "bestaetigt" }),
      (s) => s`select letzte_id from aenderung_kette where id = 1 for update`,
    );
    expect(r.ok).toBe(true);
    expect((await protokoll(id, "Status")).map((p) => p.neu)).toEqual(["bestaetigt", "offen", "bestaetigt"]);
  });

  test("Impfnachweis gegen einen gleichzeitigen Abschluss der Schau", async () => {
    const { id, meldungId } = await schauMitTieren("Impfnachweis Abschluss");
    const r = await mitOffenerTransaktion(
      (s) => s`update schau set phase = 'abgeschlossen' where id = ${id}`,
      () => al().halle.vetSetzen({ meldungId, nd: { datum: "2026-09-01", impfstoff: "Nobilis ND", tierarzt: "Dr. Huhn" }, pmv: { datum: null, impfstoff: "", tierarzt: "" }, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: false }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.message).toContain("abgeschlossen");
    expect(await protokoll(id, "Impfnachweis")).toHaveLength(0);
  });
});
