/**
 * Gleichzeitiges Arbeiten bei Bewertung und Preisen (ADR 033): Freigabe gegen Tablet und Preise, Preisvergabe gegen
 * eine gleichzeitig geänderte Note, Tablet gegen eine gleichzeitig geänderte Einteilung, Notenskala gegen Freigabe.
 * Eine zweite Verbindung hält jeweils die Sperre und schreibt dazwischen – so ist das Rennen im Test deterministisch.
 * Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const tablet = (r: { id: number; name: string }, schauId: number) => m.appRouter.createCaller({ ...leer, richter: { id: r.id, schauId, name: r.name, istObmann: false } });
const leerBew = { sondernote: null, vorzuege: "", wuensche: "", maengel: "" };

/** Schau in der Phase „Bewertung“: 4 Tiere mit 93 Punkten, alle bei Preisrichter A; B ohne Tiere; Preisart „SG“ ab 94. */
async function baue(name: string) {
  const { id } = await al().schau.anlegen({ name, ort: "Halle" });
  const s = await al().schau.get({ id });
  const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten weiß" });
  const pos = { farbenschlagId: wy!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
  const aussteller = { vorname: "Gina", nachname: "Gleichzeit", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false };
  const r = await al().meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos, pos, pos, pos] });
  await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
  await al().katalog.nummernVergeben({ schauId: id });
  const tiere = (await al().katalog.liste({ schauId: id })).sort((a, b) => a.katalogNr! - b.katalogNr!);
  for (const n of ["A Ahorn", "B Birke"]) await al().preisrichter.speichern({ schauId: id, name: n, anschrift: "", telefon: "", email: "", istObmann: false, sparten: [] });
  const [A, B] = (await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.schauId, id))).sort((a, b) => a.name.localeCompare(b.name));
  await al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: A!.id, vonNr: tiere[0]!.katalogNr!, bisNr: tiere[3]!.katalogNr! }] });
  await al().schau.preisartSpeichern({ schauId: id, kuerzel: "SG", name: "Siegerband", betragCent: 0, sachpreis: "Band", quelle: "standgeld", schluesselProTiere: null, anzahlProSchluessel: 0, anzahlProPreisrichter: 2, mindestpunkte: 94, rundung: "voll", folge: 99 });
  const art = (await al().preise.uebersicht({ schauId: id })).preisarten.find((a) => a.kuerzel === "SG")!.id;
  await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
  for (const t of tiere) {
    await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.eq(m.schema.katalogeintrag.id, t.id));
    await al().bewertung.setzen({ schauId: id, katalogeintragId: t.id, punkte: 93, ...leerBew, geraetZeit: new Date(), grund: "" } as never);
  }
  return { id, tiere, A: A!, B: B!, art };
}
const version = async (tierId: number) => (await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, tierId)))[0]!.bewertungVersion;
const note = async (tierId: number) => (await m.db.select().from(m.schema.bewertung).where(m.eq(m.schema.bewertung.katalogeintragId, tierId)))[0] ?? null;
const freigegeben = async (id: number) => (await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!.ergebnisseFreigegeben;
/** Zweite Verbindung: offene Transaktion, die `sperren` ausführt; `dann` schreibt nach kurzer Wartezeit und bestätigt. */
async function zweite(sperren: (c: Bun.SQL) => Promise<unknown>) {
  const c = await m.sql.reserve();
  await c`begin`;
  await sperren(c as unknown as Bun.SQL);
  return {
    c,
    async fertig() {
      await Bun.sleep(300);
      await c`commit`;
      c.release();
    },
  };
}

describe("Gleichzeitig: Bewertung und Preise", () => {
  test("Freigabe gegen Tablet: das Tablet wartet und sieht dann die Freigabe", async () => {
    const { id, tiere, A } = await baue("Gleichzeit Freigabe");
    const X = tiere[0]!.id;
    // Die Freigabe (andere Verbindung) hat die Schau gesperrt und gibt frei; das Tablet sendet währenddessen 97 Punkte.
    const z = await zweite(async (c) => {
      await c`select 1 from schau where id = ${id} for no key update`;
      await c`update schau set ergebnisse_freigegeben = true where id = ${id}`;
    });
    const senden = tablet(A, id).richter.abgleich({ bewertungen: [{ katalogeintragId: X, punkte: 97, ...leerBew, geraetZeit: new Date(), basisVersion: await version(X) }] });
    await z.fertig();
    const { ergebnisse } = await senden;
    expect(ergebnisse[0]!.status).toBe("fehler");
    expect((await note(X))!.punkte).toBe(93);
  });

  test("Freigabe gegen Tablet: die Freigabe wartet und sieht dann das unbestätigte V", async () => {
    const { id, tiere } = await baue("Gleichzeit Freigabe zwei");
    const X = tiere[1]!.id;
    // Das Tablet (andere Verbindung) hält die Schau wie beim Speichern und schreibt 97 Punkte ohne Obmann.
    const z = await zweite(async (c) => {
      await c`select 1 from schau where id = ${id} for share`;
      await c`update bewertung set punkte = 97, obmann_bestaetigt_am = null where katalogeintrag_id = ${X}`;
    });
    const freigabe = al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true });
    await z.fertig();
    await expect(freigabe).rejects.toThrow("Obmann");
    expect(await freigegeben(id)).toBe(false);
  });

  test("Zwei Tabs: Zurücknehmen einer nicht freigegebenen Schau schreibt nichts", async () => {
    const { id } = await baue("Gleichzeit Tabs");
    await Promise.all([al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true }), al().preise.freigeben({ schauId: id, freigegeben: false, grund: "" }).catch((e: Error) => e)]);
    const prot = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id))).sort((a, b) => a.id - b.id);
    expect(prot.filter((p) => p.aktion === "Freigabe zurückgenommen" && !p.grund).length).toBe(0);
    // Ohne Freigabe: kein Eintrag „Freigabe zurückgenommen“, der Stand bleibt.
    const { id: id2 } = await baue("Gleichzeit Tabs zwei");
    await al().preise.freigeben({ schauId: id2, freigegeben: false, grund: "" });
    const prot2 = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id2))).sort((a, b) => a.id - b.id);
    expect(prot2.some((p) => p.aktion === "Freigabe zurückgenommen")).toBe(false);
  });

  test("Preisvergabe gegen Notenänderung: die Vergabe wartet und sieht die neue Note", async () => {
    const { id, tiere, art } = await baue("Gleichzeit Preis");
    const X = tiere[2]!.id;
    await al().bewertung.setzen({ schauId: id, katalogeintragId: X, punkte: 95, ...leerBew, geraetZeit: new Date(), grund: "" } as never);
    await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, id));
    // Die Bewertung (andere Verbindung) hat das Tier gesperrt und senkt auf 92 Punkte.
    const z = await zweite(async (c) => {
      await c`select 1 from katalogeintrag where id = ${X} for update`;
      await c`update bewertung set punkte = 92 where katalogeintrag_id = ${X}`;
    });
    const vergabe = al().preise.vergeben({ schauId: id, katalogeintragId: X, preisartId: art });
    await z.fertig();
    await expect(vergabe).rejects.toThrow("94");
    expect((await m.db.select().from(m.schema.preisvergabe).where(m.eq(m.schema.preisvergabe.katalogeintragId, X))).length).toBe(0);
  });

  test("Tablet gegen Einteilung: nach dem Umhängen nimmt der Server die Note nicht mehr an", async () => {
    const { id, tiere, A, B } = await baue("Gleichzeit Einteilung");
    const X = tiere[3]!.id;
    const v = await version(X);
    // Die Einteilung (andere Verbindung) hält ihre Sperre und gibt alle Tiere an B.
    const z = await zweite(async (c) => {
      await c`select pg_advisory_xact_lock(2026111201, ${id})`;
      await c`update pr_einteilung set preisrichter_id = ${B.id} where schau_id = ${id}`;
    });
    const senden = tablet(A, id).richter.abgleich({ bewertungen: [{ katalogeintragId: X, punkte: 95, ...leerBew, geraetZeit: new Date(), basisVersion: v }] });
    await z.fertig();
    const { ergebnisse } = await senden;
    expect(ergebnisse[0]).toMatchObject({ status: "fehler", meldung: "Tier ist Ihnen nicht zugeteilt." });
    expect((await note(X))!.punkte).toBe(93);
    // Zurücksetzen ebenso.
    const z2 = await zweite(async (c) => {
      await c`select pg_advisory_xact_lock(2026111201, ${id})`;
      await c`update pr_einteilung set preisrichter_id = ${A.id} where schau_id = ${id}`;
    });
    const zurueck = tablet(B, id).richter.zuruecksetzen({ katalogeintragId: X, basisVersion: v });
    await z2.fertig();
    await expect(zurueck).rejects.toThrow("nicht zugeteilt");
    expect(await note(X)).not.toBeNull();
  });

  test("Notenskala gegen Freigabe: nach der Freigabe bleibt die Skala", async () => {
    const { id } = await baue("Gleichzeit Skala");
    const z = await zweite(async (c) => {
      await c`select 1 from schau where id = ${id} for no key update`;
      await c`update schau set ergebnisse_freigegeben = true where id = ${id}`;
    });
    const skala = al().schau.notenskalaSetzen({ schauId: id, skala: [{ kuerzel: "v", name: "vorzüglich", punkte: [97] }, { kuerzel: "g", name: "gut", punkte: [90, 91, 92, 93, 94, 95, 96] }] });
    await z.fertig();
    await expect(skala).rejects.toThrow("freigegeben");
    expect((await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, id)))[0]!.notenskala).toBeNull();
  });

  test("Mischbetrieb ohne Verklemmung: Tablet, Preise, Freigabe und Einteilung zugleich", async () => {
    const { id, tiere, A, art } = await baue("Gleichzeit Misch");
    await m.db.update(m.schema.schau).set({ phase: "preise" }).where(m.eq(m.schema.schau.id, id));
    for (let i = 0; i < 5; i++) {
      const X = tiere[i % 4]!.id;
      const r = await Promise.allSettled([
        tablet(A, id).richter.abgleich({ bewertungen: [{ katalogeintragId: X, punkte: 94 + (i % 2), ...leerBew, geraetZeit: new Date(), basisVersion: await version(X) }] }),
        al().preise.vergeben({ schauId: id, katalogeintragId: tiere[(i + 1) % 4]!.id, preisartId: art }),
        al().preise.freigeben({ schauId: id, freigegeben: true, trotzdem: true }),
        al().preisrichter.einteilungSetzen({ schauId: id, einteilung: [{ preisrichterId: A.id, vonNr: tiere[0]!.katalogNr!, bisNr: tiere[3]!.katalogNr! }] }),
      ]);
      for (const x of r) if (x.status === "rejected") expect(String(x.reason)).not.toContain("deadlock");
      const t = r[0].status === "fulfilled" ? r[0].value.ergebnisse[0]! : null;
      if (t) expect(t.status).not.toBe("spaeter");
      if (await freigegeben(id)) await al().preise.freigeben({ schauId: id, freigegeben: false, grund: "Testlauf" , trotzdem: true });
    }
  });
});
