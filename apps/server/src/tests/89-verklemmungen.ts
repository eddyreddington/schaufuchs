/**
 * Verklemmungen und Hänger (Entscheidung 033): Ein Protokolleintrag nimmt erst die Protokoll-Kette (eine Zeile für die
 * ganze Installation) und danach FOR KEY SHARE auf Schau, Benutzer und Preisrichter (Fremdschlüssel). Eine zweite
 * Verbindung spielt diesen Eintrag nach: Sie hält die Kette und will danach die Zeile. Erwartet: keine 40P01. Dazu die
 * Grenze für das Warten auf Sperren (lock_timeout): ein Aufruf hängt nicht, er meldet „Bitte noch einmal“.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";
import { wartet } from "./sperren-hilfe";

const al = () => m.appRouter.createCaller(adminKontext);
const person = (vorname: string, nachname: string, plz: string) => ({ vorname, nachname, strasse: "Weg 1", plz, ort: "Ort", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" });

/** Zweite Verbindung: `sperren` in offener Transaktion; `fertig` führt `dann` aus, sobald die Gegenseite wartet. */
async function zweite(sperren: (c: Bun.SQL) => Promise<unknown>) {
  const c = await m.sql.reserve();
  await c`begin`;
  await sperren(c as unknown as Bun.SQL);
  return {
    async fertig(dann?: (c: Bun.SQL) => Promise<unknown>) {
      try {
        await wartet();
        if (dann) await dann(c as unknown as Bun.SQL);
        await c`commit`;
      } catch (e) {
        await c`rollback`;
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
const ergebnis = (p: Promise<unknown>) => p.then(() => "fertig", (e: unknown) => `${(e as { code?: string }).code ?? ""} ${String(e)}`);

describe("Verklemmungen: Protokoll-Kette und Fremdschlüssel", () => {
  test("Import gegen eine Meldung, die einen seiner Aussteller sperrt und protokolliert: keine Verklemmung", async () => {
    const { id } = await al().schau.anlegen({ name: "Verklemmung Import", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    // Otto gibt es schon (der Import hängt die Meldung an ihn und sperrt seine Zeile), Anna ist neu und kommt zuerst.
    const { id: otto } = await al().verein.ausstellerSpeichern({ daten: person("Otto", "Vorhanden", "23456") });
    const csv = [
      "Name;Straße;PLZ Ort;Rasse;Farbenschlag;Geschlecht;Alter;Preis",
      `Neu, Anna;Weg 1;12345 Ort;${wy!.rasse};${wy!.farbenschlag};1,0;jung;`,
      `Vorhanden, Otto;Weg 1;23456 Ort;${wy!.rasse};${wy!.farbenschlag};0,1;jung;`,
    ].join("\r\n");
    const r = await al().datenimport.lesen({ dateiname: "verklemmung.csv", base64: Buffer.from(csv, "latin1").toString("base64") });
    const eingabe = { art: "meldungen" as const, schauId: id, dateiname: "verklemmung.csv", tabelle: JSON.stringify(r.tabelle), zuordnung: r.zuordnung, mitKopf: true, rassen: {} as Record<string, number | null> };
    const p = await al().datenimport.pruefen(eingabe);
    expect(p.aussteller.map((a) => a.vorhanden?.id ?? null)).toEqual([null, otto]);
    // Eine Meldung für Otto (andere Verbindung) sperrt seine Zeile; während der Import auf sie wartet, protokolliert sie.
    const z = await zweite((c) => c`select id from aussteller where id = ${otto} for update`);
    const lauf = ergebnis(al().datenimport.uebernehmen({ ...eingabe, bestaetigen: false, zustimmung: true }));
    await z.fertig((c) => c`select letzte_id from aenderung_kette where id = 1 for update`);
    expect(await lauf).toBe("fertig");
  });

  test("Preisrichter bearbeiten gegen ein Tablet, das protokolliert: keine Verklemmung", async () => {
    const { id } = await al().schau.anlegen({ name: "Verklemmung Preisrichter", ort: "Halle" });
    await al().preisrichter.speichern({ schauId: id, name: "B Buche", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
    const [B] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id));
    // Das Tablet hält die Kette (Protokolleintrag begonnen); sein Eintrag verweist danach auf den Preisrichter.
    const z = await zweite((c) => c`select letzte_id from aenderung_kette where id = 1 for update`);
    const speichern = ergebnis(al().preisrichter.speichern({ schauId: id, id: B!.id, name: "B Buche", anschrift: "Neue Anschrift", telefon: "", email: "", istObmann: true, sparten: [] }));
    await z.fertig((c) => c`select id from preisrichter where id = ${B!.id} for key share`);
    expect(await speichern).toBe("fertig");
  });

  test("Vereinsangaben gegen eine Einfügung, die auf den Verein verweist: kein Warten", async () => {
    const org = adminKontext.benutzer!.organisationId;
    const z = await zweite((c) => c`select id from organisation where id = ${org} for key share`);
    const abm = await al().verein.abmeldung();
    const r = await Promise.race([ergebnis(al().verein.abmeldungSpeichern(abm)), Bun.sleep(2000).then(() => "wartet")]);
    await z.fertig().catch(() => {});
    expect(r).toBe("fertig");
  });
});

describe("Hänger: Grenze für das Warten auf Sperren", () => {
  test("Eine zu lange gehaltene Sperre: „Bitte noch einmal“ statt Hänger", async () => {
    const { id } = await al().schau.anlegen({ name: "Hänger Kasse", ort: "Halle" });
    const vorher = process.env.DB_LOCK_TIMEOUT;
    process.env.DB_LOCK_TIMEOUT = "300ms";
    const c = await m.sql.reserve();
    try {
      await c`begin`;
      await c`select pg_advisory_xact_lock(${0x4b415353}::int, ${id}::int)`;
      const r = await Promise.race([ergebnis(al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 500, befreitPreisrichter: false }] })), Bun.sleep(5000).then(() => "hängt")]);
      expect(r).toContain("SERVICE_UNAVAILABLE");
      expect(r).toContain("Bitte noch einmal");
    } finally {
      if (vorher === undefined) delete process.env.DB_LOCK_TIMEOUT;
      else process.env.DB_LOCK_TIMEOUT = vorher;
      await c`rollback`;
      c.release();
    }
  });
});

describe("Hänger: Tablet und Protokoll", () => {
  test("Tablet wartet zu lange auf die Einteilung: „spaeter“ statt „Interner Fehler“", async () => {
    const { id } = await al().schau.anlegen({ name: "Hänger Tablet", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al().meldung.speichern({ schauId: id, aussteller: { ...person("Tina", "Tablet", "12345"), geburtsdatum: null }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const [tier] = await al().katalog.liste({ schauId: id });
    await al().preisrichter.speichern({ schauId: id, name: "T Tanne", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
    const [T] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id));
    await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: T!.id, vonNr: 1, bisNr: 9999 }] });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, tier!.id));
    const tablet = m.appRouter.createCaller({ ...leer, richter: { id: T!.id, schauId: id, name: T!.name, istObmann: false } });
    const vorher = process.env.DB_LOCK_TIMEOUT;
    process.env.DB_LOCK_TIMEOUT = "300ms";
    const c = await m.sql.reserve();
    try {
      await c`begin`;
      // Eine Einteilung läuft (exklusiv): das Tablet wartet länger als die Grenze.
      await c`select pg_advisory_xact_lock(2026111201, ${id})`;
      const a = await tablet.richter.abgleich({ bewertungen: [{ katalogeintragId: tier!.id, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), basisVersion: null }] } as never);
      expect(a.ergebnisse[0]!.status).toBe("spaeter");
    } finally {
      if (vorher === undefined) delete process.env.DB_LOCK_TIMEOUT;
      else process.env.DB_LOCK_TIMEOUT = vorher;
      await c`rollback`;
      c.release();
    }
  });

  test("Protokoll zuletzt nur in einer Transaktion (sonst sammelte es Einträge anderer Anfragen)", async () => {
    const { protokollZuletzt } = await import("../services/protokoll");
    await expect(protokollZuletzt(m.db as never, async () => 1)).rejects.toThrow("Transaktion");
  });

  test("Viele gesammelte Einträge: in Reihenfolge, Kette unversehrt", async () => {
    const { id } = await al().schau.anlegen({ name: "Protokoll gesammelt", ort: "Halle" });
    const { protokollZuletzt, protokolliere } = await import("../services/protokoll");
    const N = 1203;
    await m.db.transaction((tx) =>
      protokollZuletzt(tx as never, async () => {
        for (let i = 0; i < N; i++) await protokolliere(tx as never, { schauId: id, tabelle: "test", datensatzId: i, aktion: `Eintrag ${i}`, neu: { i }, akteur: { text: "Test" } });
      }),
    );
    const zeilen = (await m.sql`select id, datensatz_id from aenderung where schau_id = ${id} and tabelle = 'test' order by id`) as unknown as { id: number; datensatz_id: number }[];
    expect(zeilen.map((z) => z.datensatz_id)).toEqual(Array.from({ length: N }, (_, i) => i));
    const { pruefeProtokoll } = await import("../services/protokoll-suche");
    expect((await pruefeProtokoll(id)).fehler).toEqual([]);
  });
});
