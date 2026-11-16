/**
 * Sprachen der Seiten und Mails für Aussteller (Entscheidung 020): Schauseite, Fehlermeldungen der Online-Meldung,
 * Sprache an der Meldung, Bestätigung, erneute Bestätigung, Absage – jeweils in der Sprache der Meldung.
 * Ohne Angabe bleibt alles deutsch wie bisher.
 */
import { describe, expect, test } from "bun:test";
import { texte } from "@schau/domain";
import { adminKontext, leer, m } from "./kontext";

describe("Sprachen für Aussteller", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const pub = () => m.appRouter.createCaller({ ...leer, ip: "198.51.100.57" });
  let slug = "";
  let schauId = 0;
  let farbeId = 0;
  const pos = () => ({ farbenschlagId: farbeId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
  const person = (vorname: string, email: string, reg: string) => ({ vorname, nachname: "Sprachtest", strasse: "Weg 1", plz: "34117", ort: "Kassel", telefon: "", email, verein: "GZV", kreisverband: "", registriernummer: reg, geburtsdatum: null });
  const mailAn = async (an: string) => (await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an)).orderBy(m.schema.postausgang.id)).at(-1)!;

  test("Schauseite: Grund und Datenschutz-Kurztext in der gewählten Sprache, ohne Angabe deutsch", async () => {
    const s = await al().schau.anlegen({ name: "Großschau Sprachen", ort: "Kassel" });
    schauId = s.id;
    const d = await al().schau.get({ id: s.id });
    slug = d.slug;
    await al().schau.aktualisieren({ id: s.id, daten: { ...d, bewertungAm: "2026-11-21", erklaerungen: "Nicht aus Sperrbezirk." } });
    await al().schau.gebuehrenSetzen({ schauId: s.id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 300, befreitPreisrichter: false }] });
    farbeId = (await al().stammdaten.suche({ versionId: d.stammdatenVersionId!, q: "Wyandotten weiß" }))[0]!.id;

    // Noch nicht in der Meldephase: der Grund kommt in der Sprache der Seite.
    expect((await pub().oeffentlich.schau({ slug })).meldung.grund).toBe("Die Online-Meldung ist zurzeit nicht geöffnet.");
    expect((await pub().oeffentlich.schau({ slug, sprache: "fr" })).meldung.grund).toBe(texte("fr").schau.meldungZu);
    expect((await pub().oeffentlich.schau({ slug, sprache: "en" })).datenschutzKurz[0]).toStartWith("Controller: ");
    expect((await pub().oeffentlich.schau({ slug })).datenschutzKurz[0]).toStartWith("Verantwortlich: ");
    // Unbekannte Sprache: abgelehnt, statt still eine falsche zu nehmen.
    await expect(pub().oeffentlich.schau({ slug, sprache: "xx" as "de" })).rejects.toThrow();
    await al().schau.phaseSetzen({ id: s.id, phase: "meldung", trotzdem: true });
  });

  test("Online-Meldung: Fehler in der Sprache des Formulars, Sprache an der Meldung, Mail und Link in dieser Sprache", async () => {
    const melden = (p: ReturnType<typeof person>, extra: Record<string, unknown> = {}) =>
      pub().oeffentlich.melden({ slug, aussteller: p, istJugend: false, istPreisrichter: false, positionen: [pos()], zustimmung: true, erklaerungen: true, stiftung: null, bemerkung: "", ...extra });

    await expect(melden(person("Ewa", "ewa@test.de", "06 535 012 0101"), { sprache: "en", erklaerungen: false })).rejects.toThrow(texte("en").fehler.erklaerungen);
    await expect(melden(person("Ewa", "ewa@test.de", "06 535 012 0101"), { sprache: "pl", istJugend: true, erziehungsberechtigter: "Mama Test" })).rejects.toThrow(texte("pl").fehler.jugendGeburtsdatum);
    // Ohne Sprache wie bisher deutsch.
    await expect(melden(person("Ewa", "ewa@test.de", "06 535 012 0101"), { erklaerungen: false })).rejects.toThrow("Bitte die Erklärungen zur Herkunft der Tiere bestätigen.");

    const pl = await melden(person("Ewa", "ewa@test.de", "06 535 012 0101"), { sprache: "pl" });
    const [mp] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, pl.token));
    expect(mp!.sprache).toBe("pl");
    const mailPl = await mailAn("ewa@test.de");
    expect(mailPl.betreff).toBe("Zgłoszenie Großschau Sprachen");
    expect(mailPl.text).toContain("Dzień dobry, Ewa Sprachtest,");
    expect(mailPl.text).toContain("Do zapłaty: 3,00");
    expect(mailPl.text).toContain(`/s/${slug}/meldung/${pl.token}?sprache=pl`);

    const de = await melden(person("Dieter", "dieter@test.de", "06 535 012 0102"));
    const [md] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, de.token));
    expect(md!.sprache).toBe("de");
    const mailDe = await mailAn("dieter@test.de");
    expect(mailDe.betreff).toBe("Meldung Großschau Sprachen");
    expect(mailDe.text).toContain("Guten Tag Dieter Sprachtest,");
    expect(mailDe.text).toContain(`/s/${slug}/meldung/${de.token}\n`);

    // Schweiz: „ss“ im festen Text, der Schauname bleibt mit „ß“.
    const ch = await melden(person("Urs", "urs@test.de", "06 535 012 0103"), { sprache: "de-CH" });
    const [mc] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, ch.token));
    expect(mc!.sprache).toBe("de-CH");
    expect((await mailAn("urs@test.de")).text).toContain("Ihre Meldung zur Schau „Großschau Sprachen“ ist eingegangen.");

    // Erneut verschickte Bestätigung (Ausstellungsleitung): wieder in der Sprache der Meldung.
    await al().meldung.bestaetigungSenden({ id: mp!.id });
    expect((await mailAn("ewa@test.de")).betreff).toBe("Zgłoszenie Großschau Sprachen");
  });

  test("Absage: jede Mail in der Sprache ihrer Meldung, der Grund wie geschrieben", async () => {
    await al().schau.absagen({ id: schauId, grund: "Geflügelpest im Sperrbezirk" });
    const pl = await mailAn("ewa@test.de");
    expect(pl.betreff).toBe("Odwołana: Großschau Sprachen");
    expect(pl.text).toContain("Powód: Geflügelpest im Sperrbezirk");
    expect(pl.text).toContain("Z poważaniem");
    const de = await mailAn("dieter@test.de");
    expect(de.betreff).toBe("Abgesagt: Großschau Sprachen");
    expect(de.text).toContain("Mit freundlichen Grüßen");
    const ch = await mailAn("urs@test.de");
    expect(ch.text).toContain("Mit freundlichen Grüssen");
    expect(ch.text).toContain("Grund: Geflügelpest im Sperrbezirk");
    // Nach der Absage: Grund auf der Schauseite in der Sprache der Seite.
    expect((await pub().oeffentlich.schau({ slug, sprache: "cs" })).meldung.grund).toBe(texte("cs").schau.abgesagt("Geflügelpest im Sperrbezirk"));
  });
});
