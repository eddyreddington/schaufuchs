/**
 * Gleichzeitiges Arbeiten an Geld und Meldungen (Entscheidung 033): Rücklastschrift gegen Zuwendungsbestätigung und
 * Löschwunsch, Buchungen gegen den Abschluss, Status gegen Verfall und Zahlung (keine Verklemmung), veraltetes
 * Meldeformular, doppelt gesendete neue Meldung, volle Halle online, Absage und Teilschauen gegen laufende Meldungen,
 * alter Wert im Protokoll. Das Rennen wird jeweils festgelegt: eine zweite Verbindung hält eine Sperre bzw. eine
 * Transaktion bleibt offen, bis der andere Aufruf wartet. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { fruehesteFaelligkeit } from "@schau/domain";
import { setzeDatenschluesselFuerTest } from "../db/geheim";
import { adminKontext, leer, m } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const pub = () => m.appRouter.createCaller(leer);
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const KASSE = 0x4b415353;
const leerA = { strasse: "Weg 1", plz: "12345", ort: "Musterdorf", telefon: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
const pos = (farbenschlagId: number) => ({ farbenschlagId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });

async function neueSchau(name: string) {
  const { id } = await al().schau.anlegen({ name, ort: "Halle" });
  await m.db.update(m.schema.schau).set({ vereinIban: "DE02120300000000202051", vereinBic: "BYLADEM1001", vereinKontoinhaber: "Musterverein e. V." }).where(m.eq(m.schema.schau.id, id));
  await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false }] });
  const s = await al().schau.get({ id });
  const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
  return { id, slug: s.slug, fid: farbe!.id };
}
const melde = (schauId: number, fid: number, vorname: string, extra: Record<string, unknown> = {}) =>
  al().meldung.speichern({ schauId, aussteller: { ...leerA, vorname, nachname: "Gleichzeitig", email: "" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(fid)], ...extra });

/** Zweite Verbindung mit offener Transaktion (hält Sperren bis `loesen`). */
async function halten() {
  const c = await m.sql.reserve();
  await c`begin`;
  return {
    c,
    loesen: async () => {
      await c`commit`;
      c.release();
    },
  };
}
/** Drizzle-Transaktion, die nach `schritt` offen bleibt, bis `frei()` – so liegt ein Aufruf genau dazwischen. */
function offeneTx<T>(schritt: (tx: Parameters<Parameters<typeof m.db.transaction>[0]>[0]) => Promise<T>) {
  let frei!: () => void;
  const tor = new Promise<void>((r) => (frei = r));
  let bereit!: () => void;
  const vorbereitet = new Promise<void>((r) => (bereit = r));
  const p = m.db.transaction(async (tx) => {
    const x = await schritt(tx);
    bereit();
    await tor;
    return x;
  });
  return { p, bereit: Promise.race([vorbereitet, p.then(() => undefined)]), frei };
}
const fehlerVon = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const zahlungen = (meldungId: number) => m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, meldungId));

/** Meldung mit Mandat, eingezogen über eine gebuchte Lastschrift. */
async function eingezogen(s: { id: number; fid: number }, namen: string[], extra: Record<string, unknown> = {}) {
  const r = [];
  for (const n of namen) {
    const x = await melde(s.id, s.fid, n, extra);
    await al().meldung.statusSetzen({ id: x.meldungId, status: "bestaetigt" });
    await al().lastschrift.mandatAnlegen({ ausstellerId: x.ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" });
    r.push(x);
  }
  await al().lastschrift.erstellen({ schauId: s.id, faelligAm: fruehesteFaelligkeit(heute), vorabankuendigung: false });
  await m.db.update(m.schema.lastschriftLauf).set({ faelligAm: heute }).where(m.eq(m.schema.lastschriftLauf.schauId, s.id));
  const u = await al().lastschrift.uebersicht({ schauId: s.id });
  await al().lastschrift.buchen({ schauId: s.id, nachrichtId: u.offen!.nachrichtId });
  const [lauf] = await m.db.select().from(m.schema.lastschriftLauf).where(m.eq(m.schema.lastschriftLauf.schauId, s.id));
  return { r, lauf: lauf! };
}

describe("Gleichzeitig: Geld und Meldung", () => {
  test("Rücklastschrift wartet auf eine laufende Zuwendungsbestätigung und lehnt danach ab", async () => {
    const s = await neueSchau("Gleichzeitig Spende");
    const { r, lauf } = await eingezogen(s, ["Gustav"], { spende: { betragCent: 2_500, nennen: false } });
    const sp = (await al().spenden.liste({ schauId: s.id })).find((z) => z.spende.meldungId === r[0]!.meldungId)!;
    const { bestaetigeSpende } = await import("../services/zuwendungsbestaetigung");
    // Die Bestätigung ist ausgestellt, aber noch nicht committet, während die Rücklastschrift kommt.
    const b = offeneTx((tx) => bestaetigeSpende(tx, adminKontext.benutzer!.organisationId, sp.spende.id, adminKontext as never));
    await b.bereit;
    const rueck = fehlerVon(al().lastschrift.ruecklastschrift({ schauId: s.id, laufId: lauf.id, meldungId: r[0]!.meldungId, grund: "Widerspruch" }));
    await Bun.sleep(300);
    b.frei();
    await b.p;
    expect(await rueck).toContain("Zuwendungsbestätigung");
    expect((await zahlungen(r[0]!.meldungId)).filter((z) => z.betragCent < 0)).toEqual([]);
  });

  test("Rücklastschrift und Löschwunsch im selben Lauf: das Kennzeichen „zurück“ bleibt", async () => {
    const s = await neueSchau("Gleichzeitig Loeschen");
    const { r, lauf } = await eingezogen(s, ["Xaver", "Yvonne"]);
    const [x, y] = r;
    // Yvonne hat keine laufende Meldung mehr (nach dem Einzug storniert) – nur dann geht der Löschwunsch.
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.id, y!.meldungId));
    const h = await halten();
    await h.c`select id from lastschrift_lauf where id = ${lauf.id} for update`;
    const rueck = al().lastschrift.ruecklastschrift({ schauId: s.id, laufId: lauf.id, meldungId: x!.meldungId, grund: "Konto erloschen" });
    await Bun.sleep(300);
    const { loescheAussteller } = await import("../services/datenschutz");
    const loeschen = m.db.transaction((tx) => loescheAussteller(tx, adminKontext.benutzer!.organisationId, y!.ausstellerId, "Löschwunsch", adminKontext as never));
    await Bun.sleep(300);
    await h.loesen();
    await Promise.all([rueck, loeschen]);
    const [nachher] = await m.db.select().from(m.schema.lastschriftLauf).where(m.eq(m.schema.lastschriftLauf.id, lauf.id));
    expect(nachher!.daten.posten.find((p) => p.meldungId === x!.meldungId)!.zurueck).toBe(true);
    expect(nachher!.daten.posten.find((p) => p.meldungId === y!.meldungId)!.name).toBe("Gelöscht");
    await expect(al().lastschrift.ruecklastschrift({ schauId: s.id, laufId: lauf.id, meldungId: x!.meldungId, grund: "doppelt" })).rejects.toThrow("schon gebucht");
  });

  test("Buchung, die auf die Kasse wartet, sieht einen inzwischen gebuchten Abschluss", async () => {
    const s = await neueSchau("Gleichzeitig Abschluss");
    const mm = await melde(s.id, s.fid, "Anton");
    const b = await melde(s.id, s.fid, "Bruno");
    await al().meldung.statusSetzen({ id: b.meldungId, status: "storniert", grund: "Test" });
    const kassen = async () => (await m.db.select().from(m.schema.kassenbewegung).where(m.eq(m.schema.kassenbewegung.schauId, s.id))).length;
    const h = await halten();
    await h.c`select pg_advisory_xact_lock(${KASSE}, ${s.id})`;
    const einlage = fehlerVon(al().kasse.kassenbewegung({ schauId: s.id, art: "einlage", betragCent: 100 }));
    const zahlung = fehlerVon(al().meldung.zahlungErfassen({ meldungId: mm.meldungId, betragCent: 1100, datum: heute, art: "bar" }));
    const status = fehlerVon(al().meldung.statusSetzen({ id: b.meldungId, status: "offen", grund: "Versehen" }));
    await Bun.sleep(300);
    await h.c`update schau set phase = 'abgeschlossen' where id = ${s.id}`;
    await h.loesen();
    expect(await einlage).toContain("abgeschlossen");
    expect(await zahlung).toContain("abgeschlossen");
    expect(await status).toContain("abgeschlossen");
    expect(await kassen()).toBe(0);
    expect(await zahlungen(mm.meldungId)).toEqual([]);
    expect((await al().meldung.get({ id: b.meldungId })).meldung.status).toBe("storniert");
  });

  test("Abschluss prüft die Hindernisse unter der Kassensperre noch einmal", async () => {
    const s = await neueSchau("Gleichzeitig Kassentag");
    // Noch in der Vorbereitung: die Prüfliste meldet dann nur Hinweise, es bleiben allein die Kassenpunkte.
    const { sperreKasse } = await import("../services/kasse");
    const b = offeneTx(async (tx) => {
      await sperreKasse(tx, s.id);
      await tx.insert(m.schema.kassenbewegung).values({ schauId: s.id, art: "einlage", betragCent: 100, erfasstVon: adminKontext.benutzer!.id });
    });
    await b.bereit;
    const abschluss = fehlerVon(al().schau.phaseSetzen({ id: s.id, phase: "abgeschlossen" }));
    await Bun.sleep(300);
    b.frei();
    await b.p;
    expect(await abschluss).toContain("ohne Tagesabschluss");
    expect((await al().schau.get({ id: s.id })).phase).toBe("vorbereitung");
  });

  test("Status gegen Verfall: gesperrt neu geprüft, in beide Richtungen", async () => {
    const s = await neueSchau("Gleichzeitig Verfall");
    const a = await melde(s.id, s.fid, "Clara");
    const b = await melde(s.id, s.fid, "Dieter");
    for (const x of [a, b]) {
      await al().meldung.zahlungErfassen({ meldungId: x.meldungId, betragCent: 500, datum: heute, art: "ueberweisung" });
      await al().meldung.statusSetzen({ id: x.meldungId, status: "storniert", grund: "Rücktritt" });
    }
    // Wiederaufnahme wartet an der Zeile; inzwischen wird Verfall gebucht.
    let h = await halten();
    await h.c`select id from meldung where id = ${a.meldungId} for update`;
    const wieder = fehlerVon(al().meldung.statusSetzen({ id: a.meldungId, status: "offen", grund: "Versehen" }));
    await Bun.sleep(300);
    await h.c`update meldung set verfallen_cent = 500 where id = ${a.meldungId}`;
    await h.loesen();
    expect(await wieder).toContain("Verfall");
    expect((await al().meldung.get({ id: a.meldungId })).meldung.status).toBe("storniert");
    // Verfall wartet an der Zeile; inzwischen ist die Meldung wieder offen.
    h = await halten();
    await h.c`select id from meldung where id = ${b.meldungId} for update`;
    const verfall = fehlerVon(al().meldung.verfallBuchen({ id: b.meldungId, grund: "Rücktritt nach Meldeschluss" }));
    await Bun.sleep(300);
    await h.c`update meldung set status = 'offen' where id = ${b.meldungId}`;
    await h.loesen();
    expect(await verfall).toContain("nur bei stornierten");
    expect((await al().meldung.get({ id: b.meldungId })).meldung.verfallenCent).toBe(0);
  });

  test("Status und Zahlung verklemmen sich nicht (erst Kasse, dann Zeile)", async () => {
    const s = await neueSchau("Gleichzeitig Reihenfolge");
    const a = await melde(s.id, s.fid, "Emil");
    const h = await halten();
    await h.c`select pg_advisory_xact_lock(${KASSE}, ${s.id})`;
    const storno = fehlerVon(al().meldung.statusSetzen({ id: a.meldungId, status: "storniert", grund: "Rücktritt" }));
    await Bun.sleep(300);
    // Die andere Verbindung bucht unter der Kasse eine Zahlung (wie zahlungErfassen): Fremdschlüssel auf die Meldung.
    const eingefuegt = await h.c`insert into zahlung (meldung_id, betrag_cent, datum, art, erfasst_von, grund) values (${a.meldungId}, 1100, ${heute}, 'bar', ${adminKontext.benutzer!.id}, '') returning id`.then(
      () => "ok",
      (e: Error) => e.message,
    );
    if (eingefuegt === "ok") await h.loesen();
    else {
      await h.c`rollback`;
      h.c.release();
    }
    expect(eingefuegt).toBe("ok");
    expect(await storno).toBeNull();
  });

  test("Veraltetes Meldeformular überschreibt nicht und löscht kein neues Tier", async () => {
    const s = await neueSchau("Gleichzeitig Formular");
    const a = await melde(s.id, s.fid, "Frieda", { positionen: [pos(s.fid), pos(s.fid)] });
    const alt = await al().meldung.get({ id: a.meldungId });
    const eingabe = (g: typeof alt, extra: Record<string, unknown>) => ({
      schauId: s.id,
      meldungId: a.meldungId,
      aussteller: { ...leerA, id: a.ausstellerId, vorname: "Frieda", nachname: "Gleichzeitig", email: "" },
      eingang: "papier" as const,
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: g.eintraege.map((e) => ({ ...pos(s.fid), id: e.id })),
      stand: g.stand,
      ...extra,
    });
    // Ein anderer fügt ein drittes Tier hinzu.
    await al().meldung.speichern({ ...eingabe(alt, {}), positionen: [...alt.eintraege.map((e) => ({ ...pos(s.fid), id: e.id })), pos(s.fid)] });
    // Das alte Formular (2 Tiere, andere Bemerkung) kommt danach.
    await expect(al().meldung.speichern(eingabe(alt, { bemerkung: "aus altem Tab" }))).rejects.toThrow("inzwischen geändert");
    const jetzt = await al().meldung.get({ id: a.meldungId });
    expect(jetzt.eintraege.length).toBe(3);
    expect(jetzt.meldung.bemerkung).toBe("");
    // Mit dem neuen Stand geht es.
    await al().meldung.speichern(eingabe(jetzt, { bemerkung: "neu geladen" }));
  });

  test("Bearbeiten wartet an der Kasse und sieht danach einen Widerruf der Veröffentlichung", async () => {
    const s = await neueSchau("Gleichzeitig Widerruf");
    const a = await melde(s.id, s.fid, "Gerda", { onlineZustimmung: true });
    const g = await al().meldung.get({ id: a.meldungId });
    const token = g.meldung.zugangsToken;
    const h = await halten();
    await h.c`select pg_advisory_xact_lock(${KASSE}, ${s.id})`;
    const speichern = al().meldung.speichern({
      schauId: s.id,
      meldungId: a.meldungId,
      aussteller: { ...leerA, id: a.ausstellerId, vorname: "Gerda", nachname: "Gleichzeitig", email: "" },
      eingang: "papier",
      istJugend: false,
      bemerkung: "Käfig unten",
      zustimmung: true,
      onlineZustimmung: true,
      onlineZustimmungVorher: true,
      positionen: g.eintraege.map((e) => ({ ...pos(s.fid), id: e.id })),
    });
    await Bun.sleep(300);
    await pub().oeffentlich.onlineVeroeffentlichung({ slug: s.slug, token, erlaubt: false });
    await h.loesen();
    await speichern;
    const [nachher] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, a.meldungId));
    expect(nachher!.onlineZustimmungAm).toBeNull();
    expect(nachher!.bemerkung).toBe("Käfig unten");
  });

  test("Neue Meldung zweimal gesendet (gleiche Anfrage): eine Meldung, ein Aussteller", async () => {
    const s = await neueSchau("Gleichzeitig Anfrage");
    const anfrageId = crypto.randomUUID();
    const [r1, r2] = await Promise.all([melde(s.id, s.fid, "Hanna", { anfrageId }), melde(s.id, s.fid, "Hanna", { anfrageId })]);
    expect(r2.meldungId).toBe(r1.meldungId);
    expect(r2.ausstellerId).toBe(r1.ausstellerId);
    expect((await al().meldung.liste({ schauId: s.id })).length).toBe(1);
    // Ohne Kennung (älterer Aufrufer) wie bisher; eine andere Anfrage legt eine neue Meldung an.
    await melde(s.id, s.fid, "Ida", { anfrageId: crypto.randomUUID() });
    expect((await al().meldung.liste({ schauId: s.id })).length).toBe(2);
  });

  test("Zahlung an der Meldung zweimal mit angezeigtem offenen Betrag: einmal gebucht", async () => {
    const s = await neueSchau("Gleichzeitig Zahlung");
    const a = await melde(s.id, s.fid, "Jakob");
    const offen = (await al().meldung.get({ id: a.meldungId })).betrag.summeCent;
    const zahlen = () => fehlerVon(al().meldung.zahlungErfassen({ meldungId: a.meldungId, betragCent: offen, datum: heute, art: "ueberweisung", erwartetOffenCent: offen }));
    const e = await Promise.all([zahlen(), zahlen()]);
    expect(e.filter((x) => x === null).length).toBe(1);
    expect(e.find((x) => x !== null)).toContain("schon kassiert");
    expect((await zahlungen(a.meldungId)).length).toBe(1);
  });

  test("Online melden: zwei gleichzeitige Meldungen überbuchen die Halle nicht", async () => {
    const s = await neueSchau("Gleichzeitig Halle");
    await m.db.update(m.schema.schau).set({ phase: "meldung", kapazitaet: 10 }).where(m.eq(m.schema.schau.id, s.id));
    const online = (n: number) =>
      fehlerVon(
        pub().oeffentlich.melden({
          slug: s.slug,
          aussteller: { vorname: `Online${n}`, nachname: "Halle", strasse: "Weg 1", plz: "12345", ort: "Ort", telefon: "", email: `halle${n}@test.de`, verein: "GZV", kreisverband: "", registriernummer: `06535088880${n}`, geburtsdatum: null },
          istJugend: false,
          istPreisrichter: false,
          positionen: Array.from({ length: 6 }, () => pos(s.fid)),
          zustimmung: true,
          stiftung: null,
          bemerkung: "",
        }),
      );
    const e = await Promise.all([online(1), online(2)]);
    expect(e.filter((x) => x === null).length).toBe(1);
    expect((await al().katalog.liste({ schauId: s.id })).length).toBeLessThanOrEqual(10);
  });

  test("Absage gegen laufende Meldung und gegen eine zweite Absage", async () => {
    const s = await neueSchau("Gleichzeitig Absage");
    await m.db.update(m.schema.schau).set({ phase: "meldung" }).where(m.eq(m.schema.schau.id, s.id));
    const { speichereMeldung } = await import("../services/meldung");
    const neu = { schauId: s.id, aussteller: { ...leerA, vorname: "Kurt", nachname: "Gleichzeitig", email: "" }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, onlineZustimmung: false, erziehungsberechtigter: "", erklaerungen: false, positionen: [pos(s.fid)] };
    const b = offeneTx((tx) => speichereMeldung(tx, adminKontext.benutzer!.organisationId, neu as never, adminKontext as never, { istAdmin: true }));
    await b.bereit;
    const h = await halten();
    await h.c`select pg_advisory_xact_lock(${KASSE}, ${s.id})`;
    const absagen = [fehlerVon(al().schau.absagen({ id: s.id, grund: "Seuchenverbot" })), fehlerVon(al().schau.absagen({ id: s.id, grund: "Seuchenverbot" }))];
    await Bun.sleep(300);
    b.frei();
    await b.p;
    await h.loesen();
    const e = await Promise.all(absagen);
    expect(e.filter((x) => x === null).length).toBe(1);
    expect(e.find((x) => x !== null)).toContain("schon abgesagt");
    const laufend = (await al().meldung.liste({ schauId: s.id })).filter((x) => x.status === "offen" || x.status === "bestaetigt");
    expect(laufend).toEqual([]);
    const eintraege = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, s.id))).sort((x, y) => x.id - y.id).filter((x) => x.aktion === "Schau abgesagt");
    expect(eintraege.length).toBe(1);
    // Danach nimmt die Schau keine neue Meldung mehr an.
    await expect(melde(s.id, s.fid, "Lena")).rejects.toThrow("abgesagt");
  });

  test("Teilschau entfernen gegen eine Meldung, die die alte Liste gelesen hat", async () => {
    const s = await neueSchau("Gleichzeitig Teilschau");
    await al().schau.teilschauenSetzen({ id: s.id, teilschauen: [{ name: "Haupt" }, { name: "Jung" }] });
    const ts = (await al().schau.get({ id: s.id })).teilschauen as { id: string; name: string }[];
    const [haupt, jung] = ts;
    const [person] = await m.db.insert(m.schema.aussteller).values({ organisationId: adminKontext.benutzer!.organisationId, vorname: "Max", nachname: "Gleichzeitig" }).returning();
    // Die Meldung hat die Schau (mit „Jung“) gelesen und wartet am Aussteller – eine andere Verbindung hält ihn.
    const h = await halten();
    await h.c`select id from aussteller where id = ${person!.id} for update`;
    const zweite = { schauId: s.id, aussteller: { ...leerA, id: person!.id, vorname: "Max", nachname: "Gleichzeitig", email: "" }, eingang: "papier" as const, istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos(s.fid)], teilschau: jung!.id };
    const meldung = fehlerVon(al().meldung.speichern(zweite));
    await Bun.sleep(300);
    const entfernen = fehlerVon(al().schau.teilschauenSetzen({ id: s.id, teilschauen: [haupt!] }));
    await Bun.sleep(300);
    await h.loesen();
    const [em, et] = await Promise.all([meldung, entfernen]);
    const inJung = (await al().meldung.liste({ schauId: s.id })).filter((x) => x.teilschau === jung!.id);
    // Entweder ist „Jung“ entfernt und keine Meldung steht darin, oder das Entfernen wurde abgelehnt.
    if (et === null) expect(inJung).toEqual([]);
    else expect(et).toContain("noch 1 Meldungen");
    expect(em === null || et === null).toBe(true);
    expect(em === null && et === null).toBe(false);
  });

  test("Alter Wert im Protokoll ist der überschriebene (Gläubiger-ID, Spender, Vereinsangaben)", async () => {
    const org = adminKontext.benutzer!.organisationId;
    const [o] = await m.db.select().from(m.schema.organisation).where(m.eq(m.schema.organisation.id, org));
    const letzter = async (tabelle: string, aktion: string) =>
      (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, tabelle))).sort((x, y) => x.id - y.id).filter((x) => x.aktion === aktion).at(-1)!;
    // Gläubiger-ID
    await m.db.update(m.schema.organisation).set({ glaeubigerId: "" }).where(m.eq(m.schema.organisation.id, org));
    let h = await halten();
    await h.c`update organisation set glaeubiger_id = 'HALTEWERT' where id = ${org}`;
    const g = al().lastschrift.glaeubigerIdSetzen({ glaeubigerId: "DE98ZZZ09999999999" });
    await Bun.sleep(300);
    await h.loesen();
    await g;
    expect((await letzter("organisation", "Gläubiger-ID")).alt).toBe("HALTEWERT");
    await m.db.update(m.schema.organisation).set({ glaeubigerId: o!.glaeubigerId }).where(m.eq(m.schema.organisation.id, org));
    // Spender
    const { id: spenderId } = await al().spenden.spenderSpeichern({ daten: { vorname: "Paul", nachname: "Spender", strasse: "Weg 1", plz: "12345", ort: "Altort" } as never });
    h = await halten();
    await h.c`update spender set ort = 'Zwischenort' where id = ${spenderId}`;
    const sp = al().spenden.spenderSpeichern({ id: spenderId, daten: { vorname: "Paul", nachname: "Spender", strasse: "Weg 1", plz: "12345", ort: "Neuort" } as never });
    await Bun.sleep(300);
    await h.loesen();
    await sp;
    expect(((await letzter("spender", "Spender geändert")).alt as { ort: string }).ort).toBe("Zwischenort");
    // Vereinsangaben
    const v = (await al().verein.get()).angaben;
    h = await halten();
    await h.c`update organisation set name = 'Zwischenname e. V.' where id = ${org}`;
    const vs = al().verein.speichern({ ...(v as never as Record<string, string>), name: "Neuer Name e. V." } as never);
    await Bun.sleep(300);
    await h.loesen();
    await vs;
    expect(((await letzter("organisation", "Vereinsangaben")).alt as { name: string }).name).toBe("Zwischenname e. V.");
    await al().verein.speichern({ ...(v as never as Record<string, string>) } as never);
  });
});

describe("Gleichzeitig: Nachprüfung (Stand, Sperrreihenfolge, Phase)", () => {
  const MELS = 0x4d454c53;
  const bearbeiten = (s: { id: number; fid: number }, a: { meldungId: number; ausstellerId: number }, g: Awaited<ReturnType<ReturnType<typeof al>["meldung"]["get"]>>, extra: Record<string, unknown> = {}) => ({
    schauId: s.id,
    meldungId: a.meldungId,
    aussteller: { ...leerA, id: a.ausstellerId, vorname: g.aussteller.vorname, nachname: "Gleichzeitig", email: "" },
    eingang: "papier" as const,
    istJugend: false,
    bemerkung: "",
    zustimmung: true,
    positionen: g.eintraege.map((e) => ({ ...pos(s.fid), id: e.id })),
    stand: g.stand,
    ...extra,
  });

  test("Stand hängt vom Serverschlüssel ab (ohne ihn nicht nachzurechnen)", async () => {
    const s = await neueSchau("Gleichzeitig Schlüssel");
    const a = await melde(s.id, s.fid, "Kurt");
    const g = await al().meldung.get({ id: a.meldungId });
    setzeDatenschluesselFuerTest(Buffer.alloc(32, 7));
    try {
      expect((await al().meldung.get({ id: a.meldungId })).stand).not.toBe(g.stand);
    } finally {
      setzeDatenschluesselFuerTest(null);
    }
    expect((await al().meldung.get({ id: a.meldungId })).stand).toBe(g.stand);
  });

  test("Ausstellungsleitung erfasst eine Meldung mit Eingang „online“ auch außerhalb der Meldephase", async () => {
    const s = await neueSchau("Gleichzeitig Nachmeldung");
    await m.db.update(m.schema.schau).set({ phase: "katalog" }).where(m.eq(m.schema.schau.id, s.id));
    expect(await fehlerVon(melde(s.id, s.fid, "Lotte", { eingang: "online" }))).toBeNull();
  });

  test("Bearbeiten sperrt erst den Aussteller, dann die Meldung (wie der Löschwunsch, keine Verklemmung)", async () => {
    const s = await neueSchau("Gleichzeitig Reihenfolge");
    const a = await melde(s.id, s.fid, "Max");
    const g = await al().meldung.get({ id: a.meldungId });
    const h = await halten();
    await h.c`select id from aussteller where id = ${a.ausstellerId} for update`;
    const speichern = fehlerVon(al().meldung.speichern(bearbeiten(s, a, g, { bemerkung: "nach dem Löschwunsch" })));
    await Bun.sleep(300);
    const zweite = await h.c`update meldung set bemerkung = bemerkung where id = ${a.meldungId}`.then(
      () => null,
      (e: { code?: string }) => e.code ?? "fehler",
    );
    await h.loesen();
    expect(zweite).toBeNull();
    expect(await speichern).toBeNull();
  });

  test("Stand wird erst unter den Sperren von Aussteller und Tieren verglichen", async () => {
    const s = await neueSchau("Gleichzeitig Stand gesperrt");
    const a = await melde(s.id, s.fid, "Nora");
    const g = await al().meldung.get({ id: a.meldungId });
    // Aussteller: eine noch nicht committete Änderung (z. B. aussteller.speichern) wird nicht still überschrieben.
    let h = await halten();
    await h.c`update aussteller set telefon = '0123 45' where id = ${a.ausstellerId}`;
    let speichern = fehlerVon(al().meldung.speichern(bearbeiten(s, a, g, { bemerkung: "alt" })));
    await Bun.sleep(300);
    await h.loesen();
    expect(await speichern).toContain("inzwischen geändert");
    const [aus] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, a.ausstellerId));
    expect(aus!.telefon).toBe("0123 45");
    // Tiere: ebenso eine laufende Änderung an einem Tier der Meldung.
    const g2 = await al().meldung.get({ id: a.meldungId });
    const tier = g2.eintraege[0]!.id;
    h = await halten();
    await h.c`update katalogeintrag set freitext = 'zwischendurch' where id = ${tier}`;
    speichern = fehlerVon(al().meldung.speichern(bearbeiten(s, a, g2, { aussteller: { ...leerA, id: a.ausstellerId, vorname: "Nora", nachname: "Gleichzeitig", email: "", telefon: "0123 45" } })));
    await Bun.sleep(300);
    await h.loesen();
    expect(await speichern).toContain("inzwischen geändert");
    const [e] = await m.db.select().from(m.schema.katalogeintrag).where(m.eq(m.schema.katalogeintrag.id, tier));
    expect(e!.freitext).toBe("zwischendurch");
  });

  test("Phasenwechsel wartet auf laufende Kassen- und Online-Meldevorgänge", async () => {
    const s = await neueSchau("Gleichzeitig Phase");
    const phase = async () => (await m.db.select({ p: m.schema.schau.phase }).from(m.schema.schau).where(m.eq(m.schema.schau.id, s.id)))[0]!.p;
    for (const [sperre, von, nach] of [
      [KASSE, "schau", "preise"],
      [MELS, "meldung", "vorbereitung"],
    ] as const) {
      await m.db.update(m.schema.schau).set({ phase: von }).where(m.eq(m.schema.schau.id, s.id));
      const h = await halten();
      await h.c`select pg_advisory_xact_lock(${sperre}, ${s.id})`;
      const wechsel = fehlerVon(al().schau.phaseSetzen({ id: s.id, phase: nach, grund: "Test" }));
      await Bun.sleep(300);
      // Ein Verkauf bzw. eine Online-Meldung, die die alte Phase gelesen hat, läuft noch: der Wechsel wartet.
      const waehrenddessen = await phase();
      await h.loesen();
      expect(waehrenddessen).toBe(von);
      expect(await wechsel).toBeNull();
      expect(await phase()).toBe(nach);
    }
  });
});
