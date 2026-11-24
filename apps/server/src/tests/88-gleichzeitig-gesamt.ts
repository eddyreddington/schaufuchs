/**
 * Gleichzeitiges Arbeiten über alle Bereiche (Entscheidung 033, eine Sperrreihenfolge): Schreibwege auf der Schau-Zeile
 * warten nicht auf Einfügungen, die auf die Schau verweisen (Protokoll, Bewertung, Kasse); Absage und Teilschauen sperren
 * Meldungen vor der Schau; Mischbetrieb vieler Schreibwege zugleich ohne Verklemmung, ohne Hänger, mit stimmigem Endstand.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const tablet = (r: { id: number; name: string }, schauId: number) => m.appRouter.createCaller({ ...leer, richter: { id: r.id, schauId, name: r.name, istObmann: false } });
const leerBew = { sondernote: null, vorzuege: "", wuensche: "", maengel: "" };
const person = (nachname: string) => ({ vorname: "Gesa", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false });

/** Wartet, bis in dieser Datenbank eine Verbindung auf eine Sperre wartet; sonst Fehler. */
async function wartet() {
  for (let i = 0; i < 100; i++) {
    const [{ n }] = (await m.sql`select count(*)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid where not l.granted and a.datname = current_database()`) as [{ n: number }];
    if (n > 0) return;
    await Bun.sleep(50);
  }
  throw new Error("Die Gegenseite wartet nicht auf die Sperre.");
}
/** Zweite Verbindung mit offener Transaktion; `fertig` führt `dann` aus, sobald die Gegenseite wartet, und bestätigt. */
async function zweite(sperren: (c: Bun.SQL) => Promise<unknown>) {
  const c = await m.sql.reserve();
  await c`begin`;
  await sperren(c as unknown as Bun.SQL);
  return {
    async fertig(dann?: (c: Bun.SQL) => Promise<unknown>, warten = true) {
      try {
        if (warten) await wartet();
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
const ergebnis = (p: Promise<unknown>) => p.then(() => "fertig", (e: unknown) => String(e));
const binnen = (p: Promise<string>, ms = 2000) => Promise.race([p, Bun.sleep(ms).then(() => "wartet")]);

/** Abgelehnt nur fachlich – keine Verklemmung (40P01, auch als „Bitte noch einmal“), kein Hänger, kein interner Fehler. */
function nurFachlich(r: PromiseSettledResult<unknown>[], namen: string[]) {
  r.forEach((x, i) => {
    if (x.status !== "rejected") return;
    const codes: unknown[] = [];
    for (let e: unknown = x.reason, j = 0; e && j < 5; e = (e as { cause?: unknown }).cause, j++) codes.push((e as { code?: unknown }).code);
    const code = String((x.reason as { code?: unknown }).code);
    expect({ weg: namen[i], codes, code, text: String(x.reason) }).toMatchObject({ weg: namen[i] });
    expect(codes).not.toContain("40P01");
    if (!["BAD_REQUEST", "CONFLICT", "FORBIDDEN", "PRECONDITION_FAILED"].includes(code)) throw new Error(`${namen[i]}: ${code} ${String(x.reason)}`);
  });
}
/** Ein Aufruf, der länger als `ms` braucht, gilt als Hänger. */
const hoechstens = <T,>(p: Promise<T>, ms = 20000) => Promise.race([p, Bun.sleep(ms).then(() => Promise.reject(new Error("Hänger: keine Antwort")))]);

/** Schau mit festgeschriebenem Katalog in der Phase „Preise“, Preisrichter A, Preisart „SG“, bewerteten Tieren. */
async function baue(name: string) {
  const { id } = await al().schau.anlegen({ name, ort: "Halle" });
  const s = await al().schau.get({ id });
  const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
  const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
  await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 400, befreitPreisrichter: false }] });
  const ids: number[] = [];
  for (const n of ["Tiere", "Zahlung", "Wechsel"]) {
    const r = await al().meldung.speichern({ schauId: id, aussteller: person(n), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: n === "Tiere" ? [pos, pos, pos, pos] : [pos] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    ids.push(r.meldungId);
  }
  await al().katalog.nummernVergeben({ schauId: id });
  const tiere = (await al().katalog.liste({ schauId: id })).filter((t) => t.meldungId === ids[0]).sort((a, b) => a.katalogNr! - b.katalogNr!);
  await al().preisrichter.speichern({ schauId: id, name: "A Ahorn", anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
  const [A] = await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id));
  await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: A!.id, vonNr: 1, bisNr: 9999 }] });
  await al().schau.preisartSpeichern({ schauId: id, kuerzel: "SG", name: "Siegerband", betragCent: 0, sachpreis: "Band", quelle: "standgeld", schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 9, mindestpunkte: 90, rundung: "voll", folge: 99 });
  const art = (await al().preise.uebersicht({ schauId: id })).preisarten.find((a) => a.kuerzel === "SG")!.id;
  await m.db.update(m.schema.schau).set({ katalogGedruckt: true, phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
  for (const t of tiere) {
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t.id));
    await al().bewertung.setzen({ schauId: id, katalogeintragId: t.id, punkte: 93, ...leerBew, geraetZeit: new Date(), grund: "" } as never);
  }
  await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, id));
  return { id, tiere, A: A!, art, pos, zahlung: ids[1]!, wechsel: ids[2]! };
}
const version = async (tierId: number) => (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, tierId)))[0]!.bewertungVersion;

describe("Gleichzeitig gesamt: Sperrreihenfolge", () => {
  test("Käfigregel und Hallenplan warten nicht auf Einfügungen, die auf die Schau verweisen", async () => {
    const { id } = await al().schau.anlegen({ name: "Gesamt Schluessel", ort: "Halle" });
    // Jede Einfügung mit Fremdschlüssel auf die Schau (Protokoll nach der Kette, Bewertung, Kasse) hält FOR KEY SHARE.
    // Wer die Schau-Zeile FOR UPDATE sperrt und danach protokolliert, verklemmt sich mit ihr über die Protokoll-Kette.
    const z = await zweite((c) => c`select id from schau where id = ${id} for key share`);
    const regel = ergebnis(al().katalog.kaefigRegelSetzen({ schauId: id, rasse: "Deutsche Wyandotten", typ: "grosskaefig" }));
    const r = await binnen(regel);
    await z.fertig(undefined, false);
    await regel;
    expect(r).toBe("fertig");
  });

  test("Absage sperrt die Meldungen vor der Schau (wie der Impfnachweis): keine Verklemmung", async () => {
    const { id } = await al().schau.anlegen({ name: "Gesamt Absage", ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const { meldungId } = await al().meldung.speichern({ schauId: id, aussteller: person("Absage"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    // Der Impfnachweis sperrt erst die Meldung, dann die Schau geteilt; die Absage wartet derweil.
    const z = await zweite((c) => c`select id from meldung where id = ${meldungId} for update`);
    const absage = al().schau.absagen({ id, grund: "Seuchenlage" });
    await z.fertig((c) => c`select id from schau where id = ${id} for share`);
    await absage;
    const [mm] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    expect(mm!.status).toBe("storniert");
  });

  test("Teilschauen sperren die Meldungen vor der Schau: keine Verklemmung", async () => {
    const { id } = await al().schau.anlegen({ name: "Gesamt Teilschau", ort: "Halle" });
    await al().schau.teilschauenSetzen({ id, teilschauen: [{ name: "Landesschau" }, { name: "Jugendschau" }] });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
    const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const { meldungId } = await al().meldung.speichern({ schauId: id, aussteller: person("Teil"), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await m.db.update(m.schema.meldung).set({ teilschau: null }).where(m.eq(m.schema.meldung.id, meldungId));
    const [erste, zweiteTs] = ((await al().schau.get({ id })).teilschauen ?? []) as { id: string; name: string }[];
    const z = await zweite((c) => c`select id from meldung where id = ${meldungId} for update`);
    // Umsortieren: Meldungen ohne Angabe werden ausdrücklich der bisherigen ersten Teilschau zugeordnet.
    const setzen = al().schau.teilschauenSetzen({ id, teilschauen: [zweiteTs!, erste!] });
    await z.fertig((c) => c`select id from schau where id = ${id} for share`);
    await setzen;
    const [mm] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, meldungId));
    expect(mm!.teilschau).toBe(erste!.id);
  });
});

describe("Gleichzeitig gesamt: Mischbetrieb", () => {
  test("Mischbetrieb ohne Verklemmung: viele Schreibwege zugleich, mehrfach wiederholt", async () => {
    const b = await baue("Gesamt Misch");
    const { id, tiere, A, art } = b;
    // Ein Tier ist verkäuflich (Verkauf in der Phase „Preise“).
    await m.db.update(m.schema.katalogeintrag).set({ verkaufspreisCent: 2500 }).where(m.eq(m.schema.katalogeintrag.id, tiere[3]!.id));
    // Zweite Schau desselben Vereins in der Meldephase: Online-Meldung und Import laufen dort, Protokoll-Kette und
    // Vereinssperren teilen sie mit der ersten.
    const { id: oid } = await al().schau.anlegen({ name: "Gesamt Misch Online", ort: "Halle" });
    await al().schau.gebuehrenSetzen({ schauId: oid, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 400, befreitPreisrichter: false }] });
    await m.db.update(m.schema.schau).set({ phase: "meldung" }).where(m.eq(m.schema.schau.id, oid));
    const o = await al().schau.get({ id: oid });
    const [wy] = await al().stammdaten.suche({ versionId: o.stammdatenVersionId!, q: "Wyandotten weiß" });
    const [tierA] = (await al().katalog.liste({ schauId: id })).filter((t) => t.id === tiere[0]!.id);
    const online = (i: number) =>
      m.appRouter.createCaller(leer).oeffentlich.melden({
        slug: o.slug,
        aussteller: { vorname: `Online${i}`, nachname: "Misch", strasse: "Weg 1", plz: "12345", ort: "Ort", telefon: "", email: `misch${i}@test.de`, verein: "GZV", kreisverband: "", registriernummer: `06535077770${i}`, geburtsdatum: null },
        istJugend: false,
        istPreisrichter: false,
        positionen: [b.pos],
        zustimmung: true,
        stiftung: null,
        bemerkung: "",
      } as never);
    const importieren = async (i: number) => {
      const csv = ["Name;Straße;PLZ Ort;Rasse;Farbenschlag;Geschlecht;Alter;Preis", `Import${i}, Ida;Weg ${i};1234${i} Ort;${wy!.rasse};${wy!.farbenschlag};1,0;jung;`].join("\r\n");
      const r = await al().datenimport.lesen({ dateiname: "misch.csv", base64: Buffer.from(csv, "latin1").toString("base64") });
      return al().datenimport.uebernehmen({ art: "meldungen", schauId: oid, dateiname: "misch.csv", tabelle: JSON.stringify(r.tabelle), zuordnung: r.zuordnung, mitKopf: true, rassen: {}, bestaetigen: true, zustimmung: true } as never);
    };
    const leerNw = { datum: null, impfstoff: "", tierarzt: "" };
    let gezahlt = 0;
    for (let i = 0; i < 6; i++) {
      const X = tiere[i % 4]!;
      const Y = tiere[(i + 1) % 4]!;
      const wege: [string, () => Promise<unknown>][] = [
        ["Note Tablet", async () => tablet(A, id).richter.abgleich({ bewertungen: [{ katalogeintragId: X.id, punkte: 94 + (i % 2), ...leerBew, geraetZeit: new Date(), basisVersion: await version(X.id) }] })],
        ["Note AL", () => al().bewertung.setzen({ schauId: id, katalogeintragId: Y.id, punkte: 95, ...leerBew, geraetZeit: new Date(), grund: "Reklamation geprüft" } as never)],
        ["Preis", () => al().preise.vergeben({ schauId: id, katalogeintragId: tiere[(i + 2) % 4]!.id, preisartId: art })],
        ["Freigabe", () => al().preise.freigeben({ schauId: id, freigegeben: i % 2 === 0, grund: "Testlauf", trotzdem: true })],
        ["Einteilung", () => al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: A.id, vonNr: 1, bisNr: 9999 }] })],
        ["Meldung", () => al().meldung.speichern({ schauId: id, aussteller: person(`Nach ${i}`), eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [b.pos] })],
        ["Zahlung", () => al().meldung.zahlungErfassen({ meldungId: b.zahlung, betragCent: 100, datum: "2026-11-05", art: "ueberweisung" }).then((r) => ((gezahlt += 100), r))],
        ["Status", () => al().meldung.statusSetzen({ id: b.wechsel, status: i % 2 === 0 ? "offen" : "bestaetigt" })],
        ["Nummern", () => al().katalog.nummernVergeben({ schauId: id })],
        ["Absage", () => al().schau.absagen({ id, grund: "darf nicht gehen" })],
        ["Käfigregel", () => al().katalog.kaefigRegelSetzen({ schauId: id, rasse: "Deutsche Wyandotten", typ: i % 2 ? "grosskaefig" : null })],
        ["Preisrichter", () => al().preisrichter.speichern({ schauId: id, id: A.id, name: "A Ahorn", anschrift: `Weg ${i}`, telefon: "", email: "", istObmann: i % 2 === 0, sparten: [] } as never)],
        ["Einteilung Rassen", () => al().preisrichter.zuteilungSetzen({ schauId: id, regeln: [{ preisrichterId: A.id, sparte: tierA?.sparte ?? "", rasse: tierA?.rasse ?? "Wyandotten", farbenschlag: "" }], bestaetigt: true } as never)],
        ["Impfnachweis", () => al().halle.vetSetzen({ meldungId: b.zahlung, nd: { datum: "2026-09-01", impfstoff: `Nobilis ${i}`, tierarzt: "Dr. Huhn" }, pmv: leerNw, wg: { datum: null, sentinel: false, stelle: "" }, geprueft: false })],
        ["Einlieferung", () => al().halle.statusSetzen({ schauId: id, ids: [Y.id], status: "eingeliefert", uebersteuern: "Test" } as never)],
        ["Verkauf", () => al().kasse.verkaufen({ schauId: id, katalogeintragId: tiere[3]!.id, kaeuferName: `Käufer ${i}`, kaeuferAnschrift: "Kaufgasse 2", kaeuferRegistriernummer: "065350111111", kaeuferAlter: "ab16" } as never)],
        ["Online-Meldung", () => online(i)],
        ["Import", () => importieren(i)],
      ];
      const r = await Promise.allSettled(wege.map(([, f]) => hoechstens(f())));
      nurFachlich(r, wege.map(([n]) => n));
      // Die Absage wird in der Phase „Preise“ immer verweigert – fachlich, nicht durch eine Verklemmung.
      expect(r[9]!.status).toBe("rejected");
      // Das Tablet meldet nicht „später“ (so meldet es eine Verklemmung oder Wartezeit des Servers).
      if (r[0]!.status === "fulfilled") {
        const t = (r[0] as PromiseFulfilledResult<{ ergebnisse: { status: string }[] }>).value.ergebnisse[0];
        expect(t?.status).not.toBe("spaeter");
      }
    }
    // Endstand: Schau nicht abgesagt, Zahlungen vollständig, Protokoll-Kette dieser Schau unversehrt.
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id));
    expect(s!.abgesagtAm).toBeNull();
    expect(s!.phase).toBe("preise");
    const { meldebetrag } = await import("../services/eintraege");
    expect((await meldebetrag(m.db as never, b.zahlung)).bezahltCent).toBe(gezahlt);
    const { pruefeProtokoll } = await import("../services/protokoll-suche");
    expect((await pruefeProtokoll(id)).fehler).toEqual([]);
    // Jede Note gehört zu einem Tier mit Nummer in einer bestätigten Meldung.
    const lose = (await m.sql`select b.id from bewertung b join katalogeintrag k on k.id = b.katalogeintrag_id join meldung me on me.id = k.meldung_id where k.schau_id = ${id} and (k.katalog_nr is null or me.status <> 'bestaetigt')`) as unknown as unknown[];
    expect(lose).toHaveLength(0);
  }, 120000);
});
