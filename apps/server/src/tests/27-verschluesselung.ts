/** Verschlüsselte Spalten: IBAN, Kontoinhaber, SEPA-Datei, Zwei-Faktor-Geheimnis; Umstellung des Altbestands; falscher Schlüssel. */
import { describe, expect, test } from "bun:test";
import { isNull } from "drizzle-orm";
import { adminKontext, m } from "./kontext";

describe("Verschlüsselung", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const leer = { strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false };
  const roh = async (id: number) => ((await m.sql`select iban, kontoinhaber from aussteller where id = ${id}`) as unknown as { iban: string; kontoinhaber: string }[])[0]!;

  test("in der Datenbank verschlüsselt, über die Anwendung lesbar; Leeres bleibt leer; Werte passen nur in ihre Spalte", async () => {
    const g = await import("../db/geheim");
    // Was die übrigen Teile des Ablaufs angelegt haben (SEPA-Dateien in Teil 02, Zwei-Faktor in Teil 10), steht verschlüsselt da.
    const [z] = (await m.sql`select (select count(*)::int from sepa_lauf) as sepa, (select count(*)::int from sepa_lauf where not (daten ? 'enc')) as sepa_klar,
      (select count(*)::int from benutzer where totp_geheim is not null and totp_geheim not like 'enc1:%') as totp_klar,
      (select count(*)::int from aussteller where iban <> '' and iban not like 'enc2:%') as iban_klar`) as unknown as { sepa: number; sepa_klar: number; totp_klar: number; iban_klar: number }[];
    expect(z!.sepa).toBeGreaterThan(0);
    expect(z).toMatchObject({ sepa_klar: 0, totp_klar: 0, iban_klar: 0 });
    const a = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Geheim", nachname: "Konto", iban: "DE89 3704 0044 0532 0130 00", kontoinhaber: "Gerda Geheim" }, trotzdem: true });
    const r = await roh(a.id);
    // Bankdaten an Feld und Zeile gebunden: enc2:<Nummer des Ausstellers>:…
    expect(r.iban.startsWith(`enc2:${a.id}:`)).toBe(true);
    expect(r.kontoinhaber.startsWith(`enc2:${a.id}:`)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("DE89");
    expect(JSON.stringify(r)).not.toContain("Gerda");
    expect(await al().verein.ausstellerDaten({ id: a.id })).toMatchObject({ iban: "DE89370400440532013000", kontoinhaber: "Gerda Geheim" });
    // Gleicher Klartext ergibt jedes Mal anderen Geheimtext (zufälliger IV).
    expect(g.verschluessele("x", "aussteller.iban")).not.toBe(g.verschluessele("x", "aussteller.iban"));
    // Leere IBAN bleibt leer – „IBAN angegeben?“ funktioniert in SQL weiter.
    const ohne = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Ohne", nachname: "Konto", iban: "", kontoinhaber: "" }, trotzdem: true });
    expect(await roh(ohne.id)).toEqual({ iban: "", kontoinhaber: "" });
    // Ein in eine andere Spalte kopierter Wert lässt sich nicht lesen.
    expect(() => g.entschluessele(r.iban, "aussteller.kontoinhaber")).toThrow("DATENSCHLUESSEL");
    // Falscher Schlüssel: klare Meldung statt Datensalat – und die Anwendung startet nicht (Prüfung in migrate.ts).
    const { pruefeDatenschluessel } = await import("../db/geheim-bestand");
    await pruefeDatenschluessel(m.db);
    g.setzeDatenschluesselFuerTest(Buffer.alloc(32, 7));
    try {
      expect(() => g.entschluessele(r.iban, "aussteller.iban")).toThrow("DATENSCHLUESSEL");
      await expect(pruefeDatenschluessel(m.db)).rejects.toThrow("DATENSCHLUESSEL");
    } finally {
      g.setzeDatenschluesselFuerTest(null);
    }
    // Kaputter Geheimtext (zu kurz): klare Meldung, kein roher Node-Fehler.
    expect(() => g.entschluessele("enc1:AAAA", "aussteller.iban")).toThrow("DATENSCHLUESSEL");
    // Klartext ohne Präfix: in Produktion (außer bei der Umstellung) abgelehnt – sonst ließe sich eine IBAN unbemerkt umleiten.
    g.erlaubeKlartext(false);
    try {
      expect(() => g.entschluessele("DE02120300000000202051", "aussteller.iban")).toThrow("unverschlüsselt");
      // Ebenso eine JSON-Spalte (SEPA- und Lastschriftdatei): Klartext-JSON mit fremder IBAN ginge sonst in die Bankdatei.
      expect(() => g.geheimJsonLesen({ iban: "DE02120300000000202051" }, "lastschriftLauf.daten")).toThrow("unverschlüsselt");
      await m.sql`update aussteller set iban = 'DE02120300000000202051' where id = ${a.id}`;
      await expect(al().verein.ausstellerDaten({ id: a.id })).rejects.toThrow();
    } finally {
      g.erlaubeKlartext(null);
      await m.sql`update aussteller set iban = ${r.iban} where id = ${a.id}`;
    }
    expect(g.entschluessele(r.iban, "aussteller.iban")).toBe("DE89370400440532013000");
    // Produktion ohne Schlüssel startet nicht.
    const vorher = [process.env.NODE_ENV, process.env.DATENSCHLUESSEL];
    g.setzeDatenschluesselFuerTest(null);
    process.env.NODE_ENV = "production";
    delete process.env.DATENSCHLUESSEL;
    try {
      expect(() => g.datenschluessel()).toThrow("DATENSCHLUESSEL fehlt");
      process.env.DATENSCHLUESSEL = Buffer.alloc(16).toString("base64");
      expect(() => g.datenschluessel()).toThrow("32 Byte");
    } finally {
      process.env.NODE_ENV = vorher[0];
      if (vorher[1] == null) delete process.env.DATENSCHLUESSEL;
      else process.env.DATENSCHLUESSEL = vorher[1];
      g.setzeDatenschluesselFuerTest(null);
    }
  });

  test("Altbestand im Klartext wird umgestellt (einmal), danach unverändert lesbar", async () => {
    const { verschluesseleBestand } = await import("../db/geheim-bestand");
    const a = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Alt", nachname: "Bestand" }, trotzdem: true });
    await m.sql`update aussteller set iban = 'DE02120300000000202051', kontoinhaber = 'Alt Bestand' where id = ${a.id}`;
    // Ein Benutzer ohne eingerichtete Zwei-Faktor-Anmeldung; sein Stand wird am Ende wiederhergestellt.
    const [b] = await m.db.select().from(m.schema.benutzer).where(isNull(m.schema.benutzer.totpAktivSeit)).limit(1);
    const [vorher] = (await m.sql`select totp_geheim from benutzer where id = ${b!.id}`) as unknown as { totp_geheim: string | null }[];
    await m.sql`update benutzer set totp_geheim = 'JBSWY3DPEHPK3PXP' where id = ${b!.id}`;
    const { id: schauId } = await al().schau.anlegen({ name: "Geheim Schau", ort: "Halle" });
    await m.sql`insert into sepa_lauf (schau_id, nachricht_id, daten, status) values (${schauId}, ${"geheim-alt-" + a.id}, ${JSON.stringify({ posten: [{ ausstellerId: a.id, iban: "DE02120300000000202051", kontoinhaber: "Alt Bestand", betragCent: 5 }] })}::jsonb, 'verworfen')`;
    // Klartext wird gelesen, als wäre nichts.
    expect((await al().verein.ausstellerDaten({ id: a.id })).iban).toBe("DE02120300000000202051");

    // Wie in Produktion: Klartext liest nur die Umstellung selbst.
    const g = await import("../db/geheim");
    g.erlaubeKlartext(false);
    let n: Awaited<ReturnType<typeof verschluesseleBestand>>;
    try {
      n = await verschluesseleBestand(m.db);
    } finally {
      g.erlaubeKlartext(null);
    }
    expect(n.aussteller).toBeGreaterThanOrEqual(1);
    expect(n.benutzer).toBeGreaterThanOrEqual(1);
    expect(n.sepa).toBeGreaterThanOrEqual(1);
    expect((await roh(a.id)).iban.startsWith(`enc2:${a.id}:`)).toBe(true);
    const [tb] = (await m.sql`select totp_geheim from benutzer where id = ${b!.id}`) as unknown as { totp_geheim: string }[];
    expect(tb!.totp_geheim.startsWith("enc1:")).toBe(true);
    const [sl] = (await m.sql`select daten::text as t from sepa_lauf where nachricht_id = ${"geheim-alt-" + a.id}`) as unknown as { t: string }[];
    expect(sl!.t).not.toContain("DE02");
    expect(sl!.t).toContain("enc1:");
    // Über die Anwendung unverändert.
    expect(await al().verein.ausstellerDaten({ id: a.id })).toMatchObject({ iban: "DE02120300000000202051", kontoinhaber: "Alt Bestand" });
    const [b2] = await m.db.select({ g: m.schema.benutzer.totpGeheim }).from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, b!.id));
    expect(b2!.g).toBe("JBSWY3DPEHPK3PXP");
    const [s2] = await m.db.select({ d: m.schema.sepaLauf.daten }).from(m.schema.sepaLauf).where(m.eq(m.schema.sepaLauf.nachrichtId, "geheim-alt-" + a.id));
    expect((s2!.d as { posten: { iban: string }[] }).posten[0]!.iban).toBe("DE02120300000000202051");
    // Zweiter Lauf: nichts mehr zu tun.
    expect(await verschluesseleBestand(m.db)).toEqual({ aussteller: 0, benutzer: 0, sepa: 0, mandate: 0 });
    await m.sql`update benutzer set totp_geheim = ${vorher!.totp_geheim} where id = ${b!.id}`;
  });

  test("Altbestand verschlüsselt ohne Zeile (enc1) bleibt lesbar und wird beim Start an seine Zeile gebunden", async () => {
    const { verschluesseleBestand } = await import("../db/geheim-bestand");
    const g = await import("../db/geheim");
    // Mit dem Entwicklungsschlüssel und dem Programmstand vor der Zeilenbindung erzeugt – so steht es in jeder
    // bestehenden Installation (nur das Feld in den Zusatzdaten).
    const ALT = {
      iban: "enc1:N33iJIeLpJMfys6xg4pUa09sfRPLeJ5fsV5tKg11S6WzM0zAZk9Bp8ZECvFl2D0A9hs=",
      kontoinhaber: "enc1:DaCd5qO6wChl+yAOdIar9LfUB0xUAUH+wGi+HY/A97ZXJ3/rZ1hH",
      mandatIban: "enc1:p99xro3PqWAuz+U3UafG+Z4M0MNnYuQbJJTsRO0UPXJaYHya2Q6IhObiqthiCcl5tb8=",
      mandatInhaber: "enc1:jvuIVbdsXEIJ1GuHPvVkGNGZoemFlVbFwM3pFTHFl0wIKd7nBmU=",
    };
    const a = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Alt", nachname: "Verschluesselt" }, trotzdem: true });
    const mandat = await al().lastschrift.mandatAnlegen({ ausstellerId: a.id, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE89370400440532013000", kontoinhaber: "" });
    await m.sql`update aussteller set iban = ${ALT.iban}, kontoinhaber = ${ALT.kontoinhaber} where id = ${a.id}`;
    await m.sql`update sepa_mandat set iban = ${ALT.mandatIban}, kontoinhaber = ${ALT.mandatInhaber} where id = ${mandat.id}`;
    const erwartet = { iban: "DE02120300000000202051", kontoinhaber: "Alt Bestand" };
    expect(await al().verein.ausstellerDaten({ id: a.id })).toMatchObject(erwartet);
    // Ein gebundener Wert aus einer fremden Zeile wird beim Umstellen nicht an diese Zeile gebunden (auch wenn daneben
    // noch Klartext steht) – sonst wüsche der Neustart eine kopierte IBAN rein.
    const fremd = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Fremd", nachname: "Gebunden", iban: "DE89370400440532013000" }, trotzdem: true });
    const kopie = (await roh(fremd.id)).iban;
    const c = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Kopie", nachname: "Gebunden" }, trotzdem: true });
    await m.sql`update aussteller set iban = ${kopie}, kontoinhaber = 'Kopie Klartext' where id = ${c.id}`;
    expect((await al().lastschrift.mandate({ ausstellerId: a.id }))[0]!.kontoinhaber).toBe("Alt Mandat");

    g.erlaubeKlartext(false);
    let n: Awaited<ReturnType<typeof verschluesseleBestand>>;
    try {
      // In Produktion gilt ein Bankwert ohne Zeile als von außen geschrieben (er könnte aus einer anderen Zeile stammen).
      await expect(al().verein.ausstellerDaten({ id: a.id })).rejects.toThrow("nicht an seine Zeile gebunden");
      n = await verschluesseleBestand(m.db);
      expect(await al().verein.ausstellerDaten({ id: a.id })).toMatchObject(erwartet);
      expect((await al().lastschrift.mandate({ ausstellerId: a.id }))[0]!.kontoinhaber).toBe("Alt Mandat");
    } finally {
      g.erlaubeKlartext(null);
    }
    expect(n.aussteller).toBe(2);
    expect(n.mandate).toBe(1);
    expect((await roh(c.id)).iban).toBe(kopie);
    expect((await roh(c.id)).kontoinhaber.startsWith(`enc2:${c.id}:`)).toBe(true);
    await m.sql`update aussteller set iban = '' where id = ${c.id}`;
    const r = await roh(a.id);
    expect(r.iban.startsWith(`enc2:${a.id}:`)).toBe(true);
    expect(r.kontoinhaber.startsWith(`enc2:${a.id}:`)).toBe(true);
    const [mr] = (await m.sql`select iban, kontoinhaber from sepa_mandat where id = ${mandat.id}`) as unknown as { iban: string; kontoinhaber: string }[];
    expect(mr!.iban.startsWith(`enc2:${mandat.id}:`)).toBe(true);
    expect(g.entschluessele(mr!.iban, "sepaMandat.iban")).toBe("DE02100500000054540402");
    expect(await verschluesseleBestand(m.db)).toEqual({ aussteller: 0, benutzer: 0, sepa: 0, mandate: 0 });
  });

  test("Bankdaten an ihre Zeile gebunden: ein in eine andere Zeile kopierter Geheimtext fällt auf", async () => {
    const g = await import("../db/geheim");
    const { id: schauId } = await al().schau.anlegen({ name: "Bindung Schau", ort: "Halle" });
    const s = await al().schau.get({ id: schauId });
    await al().schau.gebuehrenSetzen({ schauId, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 900, befreitPreisrichter: false }] });
    const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const melde = async (vorname: string, iban: string) => {
      const r = await al().meldung.speichern({ schauId, aussteller: { ...leer, vorname, nachname: "Bindung", geburtsdatum: null, iban, kontoinhaber: `${vorname} Bindung` }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
      await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
      return r;
    };
    const opfer = await melde("Olga", "DE89370400440532013000");
    const anderer = await melde("Theo", "DE02120300000000202051");
    const ro = await roh(opfer.ausstellerId);
    const rt = await roh(anderer.ausstellerId);
    expect(ro.iban.startsWith(`enc2:${opfer.ausstellerId}:`)).toBe(true);
    const ibanVon = async (id: number) => (await al().kasse.abrechnung({ schauId })).find((z) => z.ausstellerId === id)?.iban;
    expect(await ibanVon(opfer.ausstellerId)).toBe("DE89370400440532013000");

    // Schreibzugriff auf die Datenbank, aber kein Schlüssel: die eigene IBAN in die Zeile eines anderen kopiert.
    await m.sql`update aussteller set iban = ${rt.iban}, kontoinhaber = ${rt.kontoinhaber} where id = ${opfer.ausstellerId}`;
    try {
      await expect(al().kasse.abrechnung({ schauId })).rejects.toThrow("fremden Zeile");
      // Die Zeilenangabe umschreiben hilft nicht: sie ist mit verschlüsselt.
      const umgeschrieben = rt.iban.replace(`enc2:${anderer.ausstellerId}:`, `enc2:${opfer.ausstellerId}:`);
      expect(() => g.entschluessele(umgeschrieben, "aussteller.iban")).toThrow("DATENSCHLUESSEL");
    } finally {
      await m.sql`update aussteller set iban = ${ro.iban}, kontoinhaber = ${ro.kontoinhaber} where id = ${opfer.ausstellerId}`;
    }
    expect(await ibanVon(opfer.ausstellerId)).toBe("DE89370400440532013000");

    // Lastschrift: die IBAN eines anderen Mandats kopiert – sonst zöge die Bank vom falschen Konto ein.
    const mandat = (ausstellerId: number, iban: string) => al().lastschrift.mandatAnlegen({ ausstellerId, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban, kontoinhaber: "" });
    const mo = await mandat(opfer.ausstellerId, "DE02100500000054540402");
    const mt = await mandat(anderer.ausstellerId, "DE89370400440532013000");
    const mroh = async (id: number) => ((await m.sql`select iban from sepa_mandat where id = ${id}`) as unknown as { iban: string }[])[0]!.iban;
    const io = await mroh(mo.id);
    const it = await mroh(mt.id);
    expect(io.startsWith(`enc2:${mo.id}:`)).toBe(true);
    expect((await al().lastschrift.uebersicht({ schauId })).vorschau).toHaveLength(2);
    await m.sql`update sepa_mandat set iban = ${io} where id = ${mt.id}`;
    try {
      await expect(al().lastschrift.uebersicht({ schauId })).rejects.toThrow("fremden Zeile");
    } finally {
      await m.sql`update sepa_mandat set iban = ${it} where id = ${mt.id}`;
    }
    expect((await al().lastschrift.uebersicht({ schauId })).vorschau).toHaveLength(2);
    for (const x of [mo, mt]) await al().lastschrift.mandatWiderrufen({ id: x.id, am: "2026-10-15" });
  });
});
