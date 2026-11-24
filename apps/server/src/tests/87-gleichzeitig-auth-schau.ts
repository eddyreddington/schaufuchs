/**
 * Gleichzeitiges Arbeiten an Schau-Einstellungen, Phase, Postausgang und Benutzern (Entscheidung 033): Stand-Prüfung der
 * Stammangaben, Provision unter der Kassensperre, bedingte Schreibvorgänge bei Passwort und Zwei-Faktor, Vereinssperre
 * beim Anlegen, Willkommensmail in derselben Transaktion, Mailversand nur einmal. Wo sich ein Rennen nicht verlässlich
 * erzwingen lässt, hält eine zweite Verbindung die Sperre bzw. schreibt zwischen Lesen und Schreiben. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m, verkaufsbereit } from "./kontext";

const al = () => m.appRouter.createCaller(adminKontext);
const org = () => adminKontext.benutzer!.organisationId;
const IBAN = "DE89370400440532013000";

/** Wartet, bis mindestens n Sperranfragen in der Datenbank warten (die Aufrufe hängen dann an der gehaltenen Sperre). */
async function wartende(n: number) {
  for (let i = 0; i < 200; i++) {
    const [r] = (await m.sql`select count(*)::int as n from pg_locks where not granted`) as unknown as [{ n: number }];
    if (r.n >= n) return;
    await Bun.sleep(25);
  }
  throw new Error(`Es warten keine ${n} Sperranfragen.`);
}

/** Zweite Verbindung mit offener Transaktion – hält, was sie sperrt, bis `fertig()`. */
async function zweite() {
  const c = await m.sql.reserve();
  await c`begin`;
  return Object.assign(c, {
    fertig: async () => {
      await c`commit`;
      c.release();
    },
  });
}

/** Die Felder des Formulars „Stammangaben“ aus dem geladenen Stand (wie die Oberfläche sie schickt). */
async function felder(s: Record<string, unknown>) {
  const { schauFelder } = await import("../routers/schau/einstellungen");
  return Object.fromEntries(Object.keys(schauFelder.shape).map((k) => [k, s[k]])) as never as Parameters<ReturnType<typeof al>["schau"]["aktualisieren"]>[0]["daten"];
}

const helfer = async (name: string, email: string, passwort?: string) => {
  const r = await al().auth.benutzerAnlegen({ name, email, passwort, rolle: "mitarbeiter" });
  const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, r.id));
  return { b: b!, als: m.appRouter.createCaller({ ...leer, ip: "203.0.113.87", benutzer: { id: b!.id, organisationId: b!.organisationId, name: b!.name, email: b!.email, rolle: "mitarbeiter" } }) };
};
const zeile = async (id: number) => (await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, id)))[0]!;

describe("Gleichzeitig: Stammangaben der Schau", () => {
  test("Alter Stand überschreibt nicht still, was eine zweite Ausstellungsleitung gespeichert hat", async () => {
    const { id } = await al().schau.anlegen({ name: "Gleichzeitig Stamm", ort: "Halle" });
    const s = await al().schau.get({ id });
    const d = { ...(await felder(s)), girocode: false };
    const zwei = await al().schau.aktualisieren({ id, daten: { ...d, vereinKontoinhaber: "Verein", vereinIban: IBAN }, stand: s.stand });
    await expect(al().schau.aktualisieren({ id, daten: { ...d, meldeschluss: "2027-01-10" }, stand: s.stand })).rejects.toThrow("inzwischen geändert");
    expect((await al().schau.get({ id })).vereinIban).toBe(IBAN);
    // Mit dem Stand aus der Antwort geht es weiter; der neue Stand ist der, den die Schau jetzt zeigt.
    expect(zwei.stand).toBe((await al().schau.get({ id })).stand);
    await al().schau.aktualisieren({ id, daten: { ...d, vereinKontoinhaber: "Verein", vereinIban: IBAN, meldeschluss: "2027-01-10" }, stand: zwei.stand });
  });

  test("Provision: ein gleichzeitiger Verkauf rechnet nie mit einem anderen Satz, als die Schau dann hat", async () => {
    const { id } = await al().schau.anlegen({ name: "Gleichzeitig Provision", ort: "Halle" });
    const versionId = (await al().schau.get({ id })).stammdatenVersionId!;
    const [f] = (await m.sql`select f.id from farbenschlag f join rasse r on r.id = f.rasse_id where r.version_id = ${versionId} order by f.id limit 1`) as unknown as [{ id: number }];
    const aussteller = { vorname: "Prov", nachname: "Rennen", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
    const pos = { farbenschlagId: f.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: 3000 };
    const r = await al().meldung.speichern({ schauId: id, aussteller, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await al().katalog.nummernVergeben({ schauId: id });
    const [tier] = await al().katalog.liste({ schauId: id });
    await verkaufsbereit(id, [tier!.id]);
    const s = await al().schau.get({ id });

    // Eine andere Verbindung hält die Kassensperre: der Verkauf wartet darunter, die Änderung des Satzes kommt dazwischen.
    const sperre = await zweite();
    await sperre`select pg_advisory_xact_lock(${0x4b415353}::int, ${id}::int)`;
    const verkauf = al().kasse.verkaufen({ schauId: id, katalogeintragId: tier!.id, kaeuferName: "Käufer Rennen", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350222222", kaeuferAlter: "ab16" });
    await wartende(1);
    const aendern = al().schau.aktualisieren({ id, daten: { ...(await felder(s)), provisionBp: s.provisionBp + 500 }, stand: s.stand });
    await Bun.sleep(300);
    await sperre.fertig();
    const [v, a] = await Promise.allSettled([verkauf, aendern]);
    const jetzt = await al().schau.get({ id });
    expect(v.status).toBe("fulfilled");
    if (v.status === "fulfilled") expect(v.value.provisionBp).toBe(jetzt.provisionBp);
    if (a.status === "rejected") expect(String(a.reason)).toContain("Verkäufe");
  });
});

describe("Gleichzeitig: Phase der Schau", () => {
  test("Absage zwischen Lesen und Schreiben: die Phase springt nicht zurück in die Einlieferung", async () => {
    const { id } = await al().schau.anlegen({ name: "Gleichzeitig Phase", ort: "Halle" });
    await al().schau.phaseSetzen({ id, phase: "katalog", trotzdem: true, grund: "Test" });
    const sperre = await zweite();
    await sperre`update schau set abgesagt_am = now(), absage_grund = 'Verbot', phase = 'abrechnung' where id = ${id}`;
    const setzen = al().schau.phaseSetzen({ id, phase: "einlieferung", trotzdem: true, grund: "Test" });
    await wartende(1);
    await sperre.fertig();
    await expect(setzen).rejects.toThrow("inzwischen");
    const s = await al().schau.get({ id });
    expect([s.phase, !!s.abgesagtAm]).toEqual(["abrechnung", true]);
  });

  test("Doppelt gesetzte Phase: ein Eintrag im Protokoll", async () => {
    const { id } = await al().schau.anlegen({ name: "Gleichzeitig Phase zwei", ort: "Halle" });
    const r = await Promise.allSettled([1, 2].map(() => al().schau.phaseSetzen({ id, phase: "katalog", trotzdem: true, grund: "Test" })));
    expect(r.map((x) => x.status)).toEqual(["fulfilled", "fulfilled"]);
    const eintraege = (await m.sql`select id from aenderung where schau_id = ${id} and aktion = 'Phase' order by id`) as unknown as { id: number }[];
    expect(eintraege).toHaveLength(1);
  });

  test("Abschluss: eine Kassenbuchung unter der Sperre wird vor dem Abschluss gesehen", async () => {
    const { id } = await al().schau.anlegen({ name: "Gleichzeitig Abschluss", ort: "Halle" });
    await al().schau.absagen({ id, grund: "Ausstellungsverbot" });
    const sperre = await zweite();
    await sperre`select pg_advisory_xact_lock(${0x4b415353}::int, ${id}::int)`;
    const buchung = al().kasse.kassenbewegung({ schauId: id, art: "einlage", betragCent: 1000, grund: "Wechselgeld" });
    await wartende(1);
    const abschluss = al().schau.phaseSetzen({ id, phase: "abgeschlossen" });
    await wartende(2);
    await sperre.fertig();
    const [b, a] = await Promise.allSettled([buchung, abschluss]);
    expect(b.status).toBe("fulfilled");
    expect(a.status).toBe("rejected");
    expect(String((a as PromiseRejectedResult).reason)).toContain("ohne Tagesabschluss");
    expect((await al().schau.get({ id })).phase).toBe("abrechnung");
  });
});

describe("Gleichzeitig: Postausgang", () => {
  test("Zwei Versandversuche derselben Mail: sie geht einmal hinaus", async () => {
    const { versende } = await import("../services/post");
    const [mail] = await m.db.insert(m.schema.postausgang).values({ organisationId: org(), an: "doppelt@test.de", betreff: "Doppelt", text: "Text", status: "fehler", versuche: 1 }).returning();
    let n = 0;
    const transport = { sendMail: async () => { n++; await Bun.sleep(200); } };
    await Promise.all([versende(mail!.id, transport), versende(mail!.id, transport)]);
    expect(n).toBe(1);
    const [jetzt] = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.id, mail!.id));
    expect([jetzt!.status, jetzt!.versuche]).toEqual(["gesendet", 2]);
  });
});

describe("Gleichzeitig: Passwort und Zwei-Faktor", () => {
  test("Passwort ändern überschreibt kein Passwort, das die Ausstellungsleitung dazwischen gesetzt hat", async () => {
    const { pruefePasswort, hashPasswort } = await import("../auth");
    const { b, als } = await helfer("Gleich Passwort", "gleich-passwort@test.de", "eigenes-pw-123");
    const sperre = await zweite();
    await sperre`update benutzer set passwort_hash = ${await hashPasswort("al-reset-12345")} where id = ${b.id}`;
    const aendern = als.auth.passwortAendern({ alt: "eigenes-pw-123", neu: "angreifer-pw-123" });
    await wartende(1);
    await sperre.fertig();
    await expect(aendern).rejects.toThrow("inzwischen geändert");
    const jetzt = await zeile(b.id);
    expect(await pruefePasswort("al-reset-12345", jetzt.passwortHash)).toBe(true);
    expect(await pruefePasswort("angreifer-pw-123", jetzt.passwortHash)).toBe(false);
  });

  test("Zwei-Faktor: zweimal bestätigt, Zurücksetzen dazwischen, Einrichten nach dem Bestätigen", async () => {
    const z = await import("../services/zweifaktor");
    const code = (geheim: string) => z.totp(z.ausBase32(geheim.replace(/\s/g, "")), z.zeitschritt());

    // Zwei Tabs bestätigen gleichzeitig: genau einer gilt, und dessen Notfallcodes stehen in der Datenbank.
    const x = await helfer("Gleich Zwei", "gleich-zwei@test.de", "zwei-faktor-123");
    const e = await x.als.auth.zweiFaktorEinrichten({ passwort: "zwei-faktor-123" });
    let sperre = await zweite();
    await sperre`select id from benutzer where id = ${x.b.id} for update`;
    const beide = [1, 2].map(() => x.als.auth.zweiFaktorBestaetigen({ code: code(e.geheim) }));
    await wartende(2);
    await sperre.fertig();
    const r = await Promise.allSettled(beide);
    const ok = r.filter((y) => y.status === "fulfilled") as PromiseFulfilledResult<{ notfallcodes: string[] }>[];
    expect(ok).toHaveLength(1);
    expect((await zeile(x.b.id)).totpNotfall).toContain(z.hashNotfallcode(ok[0]!.value.notfallcodes[0]!));

    // Die Ausstellungsleitung setzt zurück, während bestätigt wird: nie „aktiv“ ohne Geheimnis.
    const y = await helfer("Gleich Zurueck", "gleich-zurueck@test.de", "zwei-faktor-123");
    const e2 = await y.als.auth.zweiFaktorEinrichten({ passwort: "zwei-faktor-123" });
    sperre = await zweite();
    await sperre`update benutzer set totp_geheim = null, totp_aktiv_seit = null where id = ${y.b.id}`;
    const bestaetigen = y.als.auth.zweiFaktorBestaetigen({ code: code(e2.geheim) });
    await wartende(1);
    await sperre.fertig();
    await expect(bestaetigen).rejects.toThrow("Einrichtung neu beginnen");
    expect((await zeile(y.b.id)).totpAktivSeit).toBeNull();

    // Ein zweiter Tab richtet neu ein, während der erste bestätigt: das gültige Geheimnis bleibt.
    const w = await helfer("Gleich Einrichten", "gleich-einrichten@test.de", "zwei-faktor-123");
    await w.als.auth.zweiFaktorEinrichten({ passwort: "zwei-faktor-123" });
    const vorher = (await zeile(w.b.id)).totpGeheim;
    sperre = await zweite();
    await sperre`update benutzer set totp_aktiv_seit = now() where id = ${w.b.id}`;
    const neu = w.als.auth.zweiFaktorEinrichten({ passwort: "zwei-faktor-123" });
    await wartende(1);
    await sperre.fertig();
    await expect(neu).rejects.toThrow("schon eingerichtet");
    expect((await zeile(w.b.id)).totpGeheim).toBe(vorher);
  });
});

describe("Gleichzeitig: Benutzer anlegen und Willkommensmail", () => {
  test("Dieselbe Adresse zweimal gleichzeitig: einer gilt, der andere bekommt die gewohnte Meldung", async () => {
    const email = "gleich-doppelt@test.de";
    const r = await Promise.allSettled([1, 2].map(() => al().auth.benutzerAnlegen({ name: "Gleich Doppelt", email, passwort: "doppelt-pw-123", rolle: "mitarbeiter" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toContain("lässt sich nicht verwenden");
    const eintraege = (await m.sql`select a.id from aenderung a join benutzer b on b.id = a.datensatz_id where a.tabelle = 'benutzer' and a.aktion = 'Benutzer angelegt' and b.email = ${email} order by a.id`) as unknown as { id: number }[];
    expect(eintraege).toHaveLength(1);
  });

  test("Eine gerade herabgestufte Ausstellungsleitung legt keinen Administrator mehr an", async () => {
    const r = await al().auth.benutzerAnlegen({ name: "Gleich Admin", email: "gleich-admin@test.de", passwort: "gleich-admin-123", rolle: "admin" });
    const zweiterAdmin = m.appRouter.createCaller({ ...leer, ip: "203.0.113.88", benutzer: { id: r.id, organisationId: org(), name: "Gleich Admin", email: "gleich-admin@test.de", rolle: "admin" } });
    const sperre = await zweite();
    await sperre`select pg_advisory_xact_lock(4711, ${org()})`;
    await sperre`update benutzer set rolle = 'mitarbeiter' where id = ${r.id}`;
    const anlegen = zweiterAdmin.auth.benutzerAnlegen({ name: "Neu Admin", email: "gleich-neu-admin@test.de", passwort: "neu-admin-12345", rolle: "admin" });
    await Bun.sleep(300);
    await sperre.fertig();
    await expect(anlegen).rejects.toThrow("Nur für Administratoren");
    expect(await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "gleich-neu-admin@test.de"))).toHaveLength(0);
  });

  test("Zwei Willkommensmails gleichzeitig: höchstens ein gültiger Einladungslink geht hinaus", async () => {
    const email = "gleich-einladung@test.de";
    const { id } = await al().auth.benutzerAnlegen({ name: "Gleich Einladung", email, rolle: "mitarbeiter" });
    // Eine andere Verbindung sperrt den Verein: Mails lassen sich dann nicht ablegen (Fremdschlüssel). Die erste Anfrage
    // wartet so beim Ablegen ihrer Mail, die zweite läuft dazwischen.
    const sperre = await zweite();
    await sperre`select id from organisation where id = ${org()} for update`;
    const erste = al().auth.benutzerWillkommen({ id });
    await wartende(1);
    const zweiteMail = al().auth.benutzerWillkommen({ id });
    await wartende(2);
    await sperre.fertig();
    await Promise.all([erste, zweiteMail]);
    const mails = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, email));
    const gueltig = mails.filter((x) => x.status !== "fehler" && /\/einladung#[A-Za-z0-9_-]{20,}/.test(x.text)).sort((a, b) => a.id - b.id);
    expect(gueltig).toHaveLength(1);
    const token = gueltig[0]!.text.match(/\/einladung#([A-Za-z0-9_-]+)/)![1]!;
    expect((await m.appRouter.createCaller({ ...leer, ip: "203.0.113.89" }).auth.einladungPruefen({ token })).email).toBe(email);
  });
});
