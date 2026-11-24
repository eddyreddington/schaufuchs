/**
 * Verklemmungen und Hänger (Entscheidung 033): Ein Protokolleintrag nimmt erst die Protokoll-Kette (eine Zeile für die
 * ganze Installation) und danach FOR KEY SHARE auf Schau, Benutzer und Preisrichter (Fremdschlüssel). Eine zweite
 * Verbindung spielt diesen Eintrag nach: Sie hält die Kette und will danach die Zeile. Erwartet: keine 40P01. Dazu die
 * Grenze für das Warten auf Sperren (lock_timeout): ein Aufruf hängt nicht, er meldet „Bitte noch einmal“.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";
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
