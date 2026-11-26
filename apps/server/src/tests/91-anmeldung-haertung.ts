/**
 * Anmeldung: Langzeitgrenze für den zweiten Faktor mit Hinweismail, Notfallcodes mit Schlüssel, Gerätekennzeichen gegen
 * Aussperren hinter derselben Adresse, begrenzter Speicher der Bremsen, SMTP nur verschlüsselt. Teil des Schau-Ablaufs:
 * ablauf.test.ts bindet die Teile in fester Reihenfolge ein.
 */
import { describe, expect, setSystemTime, test } from "bun:test";
import { createServer, type AddressInfo } from "node:net";
import { adminKontext, leer, m } from "./kontext";

type Ctx = import("../trpc").Context;

/** Ein Browser: merkt sich gesetzte Cookies und schickt das Gerätekennzeichen mit, sobald er eins hat. */
function browser(ip: string) {
  const cookies: Record<string, string> = {};
  const ctx = (): Ctx => ({
    ...leer,
    ip,
    cookieTokens: { benutzer: undefined, richter: undefined, geraet: cookies.schau_geraet },
    setCookie: (w: string) => {
      const kv = w.split(";")[0]!;
      const i = kv.indexOf("=");
      cookies[kv.slice(0, i)] = kv.slice(i + 1);
    },
  });
  return { cookies, auth: () => m.appRouter.createCaller(ctx()).auth, richter: () => m.appRouter.createCaller(ctx()).richter };
}

async function legeKontoAn(email: string, passwort: string) {
  const { hashPasswort } = await import("../auth");
  const [b] = await m.db
    .insert(m.schema.benutzer)
    .values({ organisationId: adminKontext.benutzer!.organisationId, name: `Härtung ${email}`, email, passwortHash: await hashPasswort(passwort), rolle: "mitarbeiter" })
    .returning();
  return b!;
}

async function kontoMitZweitemFaktor(email: string, passwort: string) {
  const z = await import("../services/zweifaktor");
  const b = await legeKontoAn(email, passwort);
  const ich = m.appRouter.createCaller({ ...leer, ip: "198.51.100.1", benutzer: { id: b.id, organisationId: b.organisationId, name: b.name, email: b.email, rolle: "mitarbeiter" } });
  const e = await ich.auth.zweiFaktorEinrichten({ passwort });
  const geheim = z.ausBase32(e.geheim.replace(/\s/g, ""));
  const { notfallcodes } = await ich.auth.zweiFaktorBestaetigen({ code: z.totp(geheim, z.zeitschritt()) });
  /** Ein Code, der zu keinem der drei gerade gültigen Zeitschritte passt. */
  const falsch = () => {
    const s = z.zeitschritt();
    const gueltig = [s - 1, s, s + 1].map((x) => z.totp(geheim, x));
    return ["000000", "111111", "222222", "333333"].find((c) => !gueltig.includes(c))!;
  };
  // Der nächste Zeitschritt: der aktuelle Code ist beim Bestätigen schon verbraucht (gilt nur einmal).
  return { b, geheim, notfallcodes, ich, falsch, naechster: () => z.totp(geheim, z.zeitschritt() + 1) };
}

describe("Zweiter Faktor: Grenze über 24 Stunden und Hinweismail", () => {
  test("nach 30 falschen Codes ist die Anmeldung mit Code gesperrt, Notfallcode und Aufheben durch die AL helfen", async () => {
    const email = "lang-code@test.de";
    const passwort = "lang-code-passwort-1";
    const k = await kontoMitZweitemFaktor(email, passwort);
    const pub = browser("198.51.100.30");
    let t = Date.now();
    try {
      // Mit bekanntem Passwort über Stunden: je 15-Minuten-Fenster 9 falsche Codes, also nie die kurze Sperre.
      for (let i = 0; i < 30; i++) {
        if (i > 0 && i % 9 === 0) setSystemTime(new Date((t += 16 * 60_000)));
        const r = await pub.auth().anmelden({ email, passwort });
        expect(r.zweiterFaktor).toBe(true);
        await expect(pub.auth().anmeldenCode({ token: r.token, code: k.falsch() })).rejects.toThrow("Der Code stimmt nicht");
      }
      setSystemTime(new Date((t += 16 * 60_000)));
      const r = await pub.auth().anmelden({ email, passwort });
      // Auch der richtige Code hilft jetzt nicht mehr.
      await expect(pub.auth().anmeldenCode({ token: r.token, code: k.naechster() })).rejects.toThrow("Notfallcode");
      // Der Kontoinhaber erfährt davon: nach 5 falschen Codes und bei der Sperre.
      const mails = await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, email));
      const hinweise = mails.filter((x) => x.betreff.includes("Code")).sort((x, y) => x.id - y.id);
      expect(hinweise.map((x) => x.betreff)).toEqual(["Anmeldung: Code mehrmals falsch", "Anmeldung mit Code gesperrt"]);
      expect(hinweise[0]!.text).toContain("Passwort");
      // Ein Notfallcode kommt trotzdem hinein (für den echten Inhaber).
      const r2 = await pub.auth().anmelden({ email, passwort });
      expect((await pub.auth().anmeldenCode({ token: r2.token, code: k.notfallcodes[0]! })).ok).toBe(true);
      // Die Ausstellungsleitung hebt die Sperre auf.
      await m.appRouter.createCaller(adminKontext).auth.sperreAufheben({ id: k.b.id });
      const r3 = await pub.auth().anmelden({ email, passwort });
      expect((await pub.auth().anmeldenCode({ token: r3.token, code: k.naechster() })).ok).toBe(true);
    } finally {
      setSystemTime();
    }
  });
});

describe("Notfallcodes", () => {
  test("mit einem Schlüssel aus DATENSCHLUESSEL gehasht; frühere Codes (SHA-256 ohne Schlüssel) gelten weiter", async () => {
    const z = await import("../services/zweifaktor");
    const { sha256 } = await import("../auth");
    const { setzeDatenschluesselFuerTest } = await import("../db/geheim");
    const { klar, hashes } = z.neueNotfallcodes(3);
    expect(klar[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    // Aus einem Datenbank-Abzug allein nicht zurückzurechnen: nicht der bloße SHA-256 des Codes.
    expect(hashes[0]).not.toBe(sha256(klar[0]!.replace("-", "")));
    setzeDatenschluesselFuerTest(Buffer.alloc(32, 7));
    try {
      expect(z.hashNotfallcode(klar[0]!)).not.toBe(hashes[0]);
    } finally {
      setzeDatenschluesselFuerTest(null);
    }
    expect(z.hashNotfallcode(klar[0]!)).toBe(hashes[0]!);

    // Bestand aus früheren Versionen: SHA-256 ohne Schlüssel, weiter gültig (Anmelden und Abschalten).
    const email = "alte-notfallcodes@test.de";
    const passwort = "alte-codes-passwort-1";
    const k = await kontoMitZweitemFaktor(email, passwort);
    await m.db.update(m.schema.benutzer).set({ totpNotfall: [sha256("abcd2345"), sha256("wxyz6789"), ...hashes] }).where(m.eq(m.schema.benutzer.id, k.b.id));
    const pub = browser("198.51.100.31");
    const r = await pub.auth().anmelden({ email, passwort });
    expect((await pub.auth().anmeldenCode({ token: r.token, code: "ABCD-2345" })).ok).toBe(true);
    const [nach] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, k.b.id));
    expect(nach!.totpNotfall).toEqual([sha256("wxyz6789"), ...hashes]);
    const r2 = await pub.auth().anmelden({ email, passwort });
    await expect(pub.auth().anmeldenCode({ token: r2.token, code: "abcd2345" })).rejects.toThrow("stimmt nicht");
    const r3 = await pub.auth().anmelden({ email, passwort });
    expect((await pub.auth().anmeldenCode({ token: r3.token, code: klar[1]! })).ok).toBe(true);
    expect((await k.ich.auth.zweiFaktorAbschalten({ passwort, code: "wxyz-6789" })).ok).toBe(true);
  });
});

describe("Gerätekennzeichen: Fremde hinter derselben Adresse sperren bekannte Geräte nicht aus", () => {
  test("Passwort: zehn Fehlversuche eines Fremden im selben Netz treffen das bekannte Gerät nicht", async () => {
    const email = "nat-al@test.de";
    const passwort = "nat-passwort-1234";
    await legeKontoAn(email, passwort);
    const al = browser("198.51.100.20");
    expect((await al.auth().anmelden({ email, passwort })).ok).toBe(true);
    expect(al.cookies.schau_geraet?.length).toBeGreaterThan(20);
    const fremd = browser("198.51.100.20");
    for (let i = 0; i < 10; i++) await expect(fremd.auth().anmelden({ email, passwort: `falsch-falsch-${i}` })).rejects.toThrow("stimmt nicht");
    await expect(fremd.auth().anmelden({ email, passwort })).rejects.toThrow("Zu viele");
    // Ein erfundenes Kennzeichen hilft dem Fremden nicht.
    const erfunden = browser("198.51.100.20");
    erfunden.cookies.schau_geraet = "A".repeat(32);
    await expect(erfunden.auth().anmelden({ email, passwort })).rejects.toThrow("Zu viele");
    // Das Gerät der AL kommt weiter hinein.
    expect((await al.auth().anmelden({ email, passwort })).ok).toBe(true);
  });

  test("zweiter Faktor: das Kennzeichen gilt erst nach dem Code", async () => {
    const email = "nat-zwei@test.de";
    const passwort = "nat-zwei-passwort-1";
    const k = await kontoMitZweitemFaktor(email, passwort);
    const al = browser("198.51.100.21");
    const r = await al.auth().anmelden({ email, passwort });
    expect(al.cookies.schau_geraet).toBeUndefined();
    expect((await al.auth().anmeldenCode({ token: r.token, code: k.naechster() })).ok).toBe(true);
    expect(al.cookies.schau_geraet?.length).toBeGreaterThan(20);
    const fremd = browser("198.51.100.21");
    for (let i = 0; i < 10; i++) await expect(fremd.auth().anmelden({ email, passwort: `falsch-falsch-${i}` })).rejects.toThrow("stimmt nicht");
    expect((await al.auth().anmelden({ email, passwort })).zweiterFaktor).toBe(true);
  });

  test("PIN: acht Fehlversuche eines Fremden im Hallen-WLAN sperren das angemeldete Tablet nicht aus", async () => {
    const al = m.appRouter.createCaller(adminKontext);
    const s = await al.schau.anlegen({ name: "Härtung Anmeldung", ort: "Halle" });
    const { slug } = await al.schau.get({ id: s.id });
    const r = await al.preisrichter.speichern({ schauId: s.id, name: "Tablet Probe", anschrift: "", email: "", telefon: "", istObmann: false });
    const { pin } = await al.preisrichter.pinErzeugen({ schauId: s.id, id: r.id });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, s.id));
    const falsch = pin === "00000000" ? "11111111" : "00000000";
    const tablet = browser("198.51.100.22");
    expect((await tablet.richter().anmelden({ slug, preisrichterId: r.id, pin })).ok).toBe(true);
    expect(tablet.cookies.schau_geraet?.length).toBeGreaterThan(20);
    const fremd = browser("198.51.100.22");
    for (let i = 0; i < 8; i++) await expect(fremd.richter().anmelden({ slug, preisrichterId: r.id, pin: falsch })).rejects.toThrow("PIN stimmt nicht");
    await expect(fremd.richter().anmelden({ slug, preisrichterId: r.id, pin })).rejects.toThrow("Zu viele");
    expect((await tablet.richter().anmelden({ slug, preisrichterId: r.id, pin })).ok).toBe(true);
  });
});

describe("Bremsen: Speicher begrenzt", () => {
  test("ein zurückgegebener Versuch hinterlässt keinen Eintrag, die Zahl der Einträge ist begrenzt, Sperren bleiben", async () => {
    const { Bremse, Wartezeit } = await import("../services/bremse");
    const b = new Bremse(3, 60_000, "Zu viele.", 100);
    b.versuch(["a"])();
    b.menge("m", 2)();
    expect(b.eintraege).toBe(0);
    for (let i = 0; i < 3; i++) b.versuch(["gesperrt"]);
    for (let i = 0; i < 500; i++) b.versuch([`k${i}`]);
    expect(b.eintraege).toBeLessThanOrEqual(100);
    expect(() => b.pruefe(["gesperrt"])).toThrow("Zu viele.");

    const w = new Wartezeit(2, 60_000, 60_000, () => "Warten.", 60_000, 60_000, 100);
    w.versuch("konto", "198.51.100.9")(false);
    expect(w.eintraege).toBe(0);
    for (let i = 0; i < 500; i++) w.versuch(`k${i}`, "198.51.100.9");
    expect(w.eintraege).toBeLessThanOrEqual(100);
  });
});

describe("SMTP nur verschlüsselt", () => {
  test("bietet der Server kein STARTTLS an, geht das Passwort nicht im Klartext hinaus; abschalten nur mit SMTP_OHNE_TLS", async () => {
    const { smtpOptionen } = await import("../services/post");
    const nodemailer = (await import("nodemailer")).default;
    const empfangen: string[] = [];
    // Ein Mailserver, dem jemand auf dem Weg das STARTTLS-Angebot gestrichen hat.
    const server = createServer((s) => {
      s.write("220 test ESMTP\r\n");
      s.on("data", (d) => {
        for (const zeile of d.toString().split("\r\n").filter(Boolean)) {
          empfangen.push(zeile);
          if (/^EHLO/i.test(zeile)) s.write("250-test\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (/^AUTH/i.test(zeile)) s.write("235 ok\r\n");
          else if (/^QUIT/i.test(zeile)) s.end("221 bye\r\n");
          else s.write("502 nein\r\n");
        }
      });
      s.on("error", () => {});
    });
    await new Promise<void>((weiter) => server.listen(0, "127.0.0.1", weiter));
    const port = (server.address() as AddressInfo).port;
    try {
      const t = nodemailer.createTransport(smtpOptionen(`smtp://verein:geheim@127.0.0.1:${port}`, false));
      await expect(t.verify()).rejects.toThrow();
      t.close();
      expect(empfangen.some((z) => /^AUTH/i.test(z))).toBe(false);
      // Auch Angaben in der Adresse schalten es nicht ab.
      expect(smtpOptionen("smtp://a:b@mail.example.de:587?requireTLS=false&ignoreTLS=true", false)).toMatchObject({ requireTLS: true, ignoreTLS: false });
      expect(smtpOptionen("smtps://a:b@mail.example.de?secure=false", false)).toMatchObject({ secure: true, port: 465 });
      // Nur ausdrücklich (SMTP_OHNE_TLS=1).
      expect(smtpOptionen("smtp://a:b@mail.example.de:25", true).requireTLS).toBe(false);
    } finally {
      server.close();
    }
  });
});
