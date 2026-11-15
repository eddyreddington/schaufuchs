/**
 * Prozeduren, die bisher in keinem Test aufgerufen wurden (Code-Review nach Runde 7): je Prozedur Wirkung, Rechte und
 * Grenzen. Teil des Schau-Ablaufs: läuft nach den übrigen Teilen und nutzt deren Daten (Verein, Bewertungen, Preise).
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Lücken aus dem Code-Review: bisher ungetestete Prozeduren", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  /** Fremder Verein: dieselben Prozeduren dürfen nichts von diesem Verein sehen. */
  const fremd = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, organisationId: 999_999 } });
  const aussteller = (nachname: string) => ({ vorname: "Lücke", nachname, strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" });
  async function neueSchau(name: string) {
    const { id } = await al().schau.anlegen({ name, ort: "Halle" });
    const s = await al().schau.get({ id });
    const [wy] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const melde = (nachname: string) =>
      al().meldung.speichern({
        schauId: id,
        aussteller: aussteller(nachname),
        eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true,
        positionen: [{ farbenschlagId: wy!.id, freitext: "", art: "einzeltier", geschlecht: "1,0", alter: "jung", istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null }],
      });
    return { id, s, melde };
  }

  test("auth.zweiFaktorAbschalten: nur mit Passwort und frischem Code, danach ausgeschaltet und protokolliert", async () => {
    const z = await import("../services/zweifaktor");
    const passwort = "luecke-zwei-faktor-1";
    await al().auth.benutzerAnlegen({ name: "Lücke Zwei", email: "luecke-2fa@test.de", passwort, rolle: "mitarbeiter" });
    const [b] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.email, "luecke-2fa@test.de"));
    const ich = m.appRouter.createCaller({ ...leer, ip: "203.0.113.171", benutzer: { id: b!.id, organisationId: b!.organisationId, name: b!.name, email: b!.email, rolle: "mitarbeiter" } });
    await expect(ich.auth.zweiFaktorAbschalten({ passwort, code: "123456" })).rejects.toThrow("nicht eingerichtet");
    const geheim = (await ich.auth.zweiFaktorEinrichten({ passwort })).geheim.replace(/\s/g, "");
    const codeBei = (versatz: number) => z.totp(z.ausBase32(geheim), z.zeitschritt() + versatz);
    await ich.auth.zweiFaktorBestaetigen({ code: codeBei(0) });

    await expect(ich.auth.zweiFaktorAbschalten({ passwort: "falsches-passwort", code: codeBei(1) })).rejects.toThrow("stimmt nicht");
    // Der schon benutzte Code gilt nicht noch einmal.
    await expect(ich.auth.zweiFaktorAbschalten({ passwort, code: codeBei(0) })).rejects.toThrow("stimmt nicht");
    expect((await ich.auth.zweiFaktorAbschalten({ passwort, code: codeBei(1) })).ok).toBe(true);

    const [nachher] = await m.db.select().from(m.schema.benutzer).where(m.eq(m.schema.benutzer.id, b!.id));
    expect([nachher!.totpAktivSeit, nachher!.totpGeheim, nachher!.totpNotfall]).toEqual([null, null, []]);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, b!.id));
    expect(prot.some((p) => p.tabelle === "benutzer" && p.aktion === "Zwei-Faktor-Anmeldung abgeschaltet")).toBe(true);
    await expect(ich.auth.zweiFaktorAbschalten({ passwort, code: codeBei(1) })).rejects.toThrow("nicht eingerichtet");
  });

  test("schau.liste: alle Schauen des eigenen Vereins, auch für Helfer – keine fremden", async () => {
    const { id } = await neueSchau("Lücke Liste");
    const liste = await al().schau.liste();
    const eintrag = liste.find((s) => s.id === id)!;
    expect(eintrag).toMatchObject({ name: "Lücke Liste", ort: "Halle", phase: "vorbereitung" });
    expect(liste[0]!.id).toBe(id); // neueste zuerst
    expect((await helfer().schau.liste()).map((s) => s.id)).toContain(id);
    expect(await fremd().schau.liste()).toEqual([]);
  });

  test("schau.preisartLoeschen: unbenutzte Preisart weg und protokolliert; vergebene und fremde nicht", async () => {
    const { id } = await neueSchau("Lücke Preisarten");
    const vorher = (await al().schau.get({ id })).preisarten;
    const weg = vorher.at(-1)!;
    await expect(helfer().schau.preisartLoeschen({ schauId: id, id: weg.id })).rejects.toThrow("Administratoren");
    expect((await al().schau.preisartLoeschen({ schauId: id, id: weg.id })).ok).toBe(true);
    expect((await al().schau.get({ id })).preisarten.map((p) => p.id)).not.toContain(weg.id);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id));
    expect(prot.some((p) => p.tabelle === "preisart" && p.aktion === "gelöscht" && p.datensatzId === weg.id)).toBe(true);
    // Preisart einer anderen Schau über diese Schau: nicht gefunden.
    await expect(al().schau.preisartLoeschen({ schauId: id, id: vorher[0]!.id + 100_000 })).rejects.toThrow("nicht gefunden");

    // Schon vergeben (aus dem Ablauf): bleibt.
    const [v] = await m.db
      .select({ preisartId: m.schema.preisart.id, schauId: m.schema.preisart.schauId })
      .from(m.schema.preisvergabe)
      .innerJoin(m.schema.preisart, m.eq(m.schema.preisart.id, m.schema.preisvergabe.preisartId))
      .innerJoin(m.schema.schau, m.eq(m.schema.schau.id, m.schema.preisart.schauId))
      .where(m.eq(m.schema.schau.organisationId, adminKontext.benutzer!.organisationId))
      .limit(1);
    expect(v).toBeDefined();
    await expect(al().schau.preisartLoeschen({ schauId: v!.schauId, id: v!.preisartId })).rejects.toThrow("schon");
    expect(await m.db.select().from(m.schema.preisart).where(m.eq(m.schema.preisart.id, v!.preisartId))).toHaveLength(1);
  });

  test("schau.notenskalaSetzen: eigene Skala, zurück auf Standard, nach der Freigabe fest", async () => {
    const { id } = await neueSchau("Lücke Notenskala");
    const standard = (await al().schau.get({ id })).notenskala;
    const eigene = [
      { kuerzel: "v", name: "vorzüglich", punkte: [97] },
      { kuerzel: "g", name: "gut", punkte: [92, 93, 94, 95, 96] },
    ];
    await expect(helfer().schau.notenskalaSetzen({ schauId: id, skala: eigene })).rejects.toThrow("Administratoren");
    await al().schau.notenskalaSetzen({ schauId: id, skala: eigene });
    expect((await al().schau.get({ id })).notenskala).toEqual(eigene);
    const prot = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.schauId, id));
    expect(prot.some((p) => p.aktion === "Notenskala")).toBe(true);
    await al().schau.notenskalaSetzen({ schauId: id, skala: null });
    expect((await al().schau.get({ id })).notenskala).toEqual(standard);
    await m.db.update(m.schema.schau).set({ ergebnisseFreigegeben: true }).where(m.eq(m.schema.schau.id, id));
    await expect(al().schau.notenskalaSetzen({ schauId: id, skala: eigene })).rejects.toThrow("freigegeben");
    expect((await al().schau.get({ id })).notenskala).toEqual(standard);
  });

  test("schau.uebersicht und meldung.zuletzt: Zahlen der Schau, die acht neuesten Meldungen", async () => {
    const { id, melde } = await neueSchau("Lücke Übersicht");
    const ersteMeldung = await melde("Erster");
    for (let i = 2; i <= 9; i++) await melde(`Nummer${i}`);
    await al().meldung.statusSetzen({ id: ersteMeldung.meldungId, status: "bestaetigt" });
    await al().meldung.zahlungErfassen({ meldungId: ersteMeldung.meldungId, betragCent: 300, datum: "2026-11-11", art: "bar" });

    const u = await helfer().schau.uebersicht({ id });
    expect(u.schau.id).toBe(id);
    expect(u.zahlen).toMatchObject({ meldungen: 9, meldungenOffen: 8, meldungenBestaetigt: 1, tiereGemeldet: 9, tiereBestaetigt: 1, bezahltCent: 300, bewertet: 0, verkauft: 0 });
    expect(Array.isArray(u.checkliste)).toBe(true);
    await expect(fremd().schau.uebersicht({ id })).rejects.toThrow();

    const zuletzt = await helfer().meldung.zuletzt({ schauId: id });
    expect(zuletzt).toHaveLength(8);
    expect(zuletzt[0]!.name).toBe("Nummer9, Lücke");
    expect(zuletzt.map((x) => x.name)).not.toContain("Erster, Lücke"); // älteste fällt heraus
    await expect(fremd().meldung.zuletzt({ schauId: id })).rejects.toThrow();
  });

  test("katalogGestaltung.bildLoeschen und beitragLoeschen: nur in der eigenen Schau, nur Administratoren", async () => {
    const a = await neueSchau("Lücke Katalog A");
    const b = await neueSchau("Lücke Katalog B");
    const g = al().katalogGestaltung;
    const bild = await g.bildHochladen({ schauId: a.id, rolle: "beitrag", name: "foto.png", base64: PNG });
    const beitrag = await g.beitragSpeichern({ schauId: a.id, beitrag: { art: "grusswort", titel: "Grußwort", unterzeile: "", text: "Text", bildId: null, groesse: "ganz" } });

    await expect(helfer().katalogGestaltung.bildLoeschen({ schauId: a.id, id: bild.id })).rejects.toThrow("Administratoren");
    await expect(helfer().katalogGestaltung.beitragLoeschen({ schauId: a.id, id: beitrag.id })).rejects.toThrow("Administratoren");
    // Über eine andere Schau geht nichts verloren.
    await g.bildLoeschen({ schauId: b.id, id: bild.id });
    await g.beitragLoeschen({ schauId: b.id, id: beitrag.id });
    let d = await g.laden({ schauId: a.id });
    expect(d.bilder.map((x) => x.id)).toContain(bild.id);
    expect(d.beitraege.map((x) => x.id)).toContain(beitrag.id);

    await g.bildLoeschen({ schauId: a.id, id: bild.id });
    await g.beitragLoeschen({ schauId: a.id, id: beitrag.id });
    d = await g.laden({ schauId: a.id });
    expect(d.bilder.map((x) => x.id)).not.toContain(bild.id);
    expect(d.beitraege.map((x) => x.id)).not.toContain(beitrag.id);
  });

  test("preisrichter.loeschen: ohne Bewertung weg, mit Bewertung bleibt er, fremde und doppelte nicht", async () => {
    const { id } = await neueSchau("Lücke Preisrichter");
    const { id: prId } = await al().preisrichter.speichern({ schauId: id, name: "Lücke Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    await expect(helfer().preisrichter.loeschen({ schauId: id, id: prId })).rejects.toThrow("Administratoren");
    expect((await al().preisrichter.loeschen({ schauId: id, id: prId })).ok).toBe(true);
    expect(await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.id, prId))).toHaveLength(0);
    await expect(al().preisrichter.loeschen({ schauId: id, id: prId })).rejects.toThrow("nicht gefunden");

    // Preisrichter mit Bewertungen (aus dem Ablauf) lässt sich nicht löschen.
    const [r] = await m.db
      .select({ id: m.schema.preisrichter.id, schauId: m.schema.preisrichter.schauId })
      .from(m.schema.bewertung)
      .innerJoin(m.schema.preisrichter, m.eq(m.schema.preisrichter.id, m.schema.bewertung.preisrichterId))
      .innerJoin(m.schema.schau, m.eq(m.schema.schau.id, m.schema.preisrichter.schauId))
      .where(m.eq(m.schema.schau.organisationId, adminKontext.benutzer!.organisationId))
      .limit(1);
    expect(r).toBeDefined();
    await expect(al().preisrichter.loeschen({ schauId: r!.schauId, id: r!.id })).rejects.toThrow("schon bewertet");
    // Über eine andere Schau: nicht gefunden.
    await expect(al().preisrichter.loeschen({ schauId: id, id: r!.id })).rejects.toThrow("nicht gefunden");
    expect(await m.db.select().from(m.schema.preisrichter).where(m.eq(m.schema.preisrichter.id, r!.id))).toHaveLength(1);
  });

  test("richter.anmeldeInfo und richter.abmelden: Namen nur während der Bewertung, Abmelden beendet die Tablet-Sitzung", async () => {
    const { id, s } = await neueSchau("Lücke Tablet");
    const { id: prId } = await al().preisrichter.speichern({ schauId: id, name: "Tablet Richter", anschrift: "", email: "", telefon: "", istObmann: false });
    const pub = m.appRouter.createCaller(leer);
    await expect(pub.richter.anmeldeInfo({ slug: "gibt-es-nicht-luecke" })).rejects.toThrow("nicht gefunden");
    expect(await pub.richter.anmeldeInfo({ slug: s.slug })).toEqual({ name: "Lücke Tablet", richter: [], offen: false, abgeschlossen: false, slug: s.slug });
    await m.db.update(m.schema.schau).set({ phase: "bewertung" }).where(m.eq(m.schema.schau.id, id));
    expect(await pub.richter.anmeldeInfo({ slug: s.slug })).toEqual({ name: "Lücke Tablet", richter: [{ id: prId, name: "Tablet Richter" }], offen: true, abgeschlossen: false, slug: s.slug });

    const { pin } = await al().preisrichter.pinErzeugen({ schauId: id, id: prId });
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, ip: "203.0.113.172", setCookie: (c: string) => (cookie = c) }).richter.anmelden({ slug: s.slug, preisrichterId: prId, pin });
    const token = cookie.split(";")[0]!.split("=")[1]!;
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.preisrichterId, prId))).toHaveLength(1);

    let geloescht = "";
    const r = await m.appRouter
      .createCaller({ ...leer, cookieTokens: { benutzer: undefined, richter: token }, setCookie: (c: string) => (geloescht = c) })
      .richter.abmelden();
    expect(r.ok).toBe(true);
    expect(geloescht).toMatch(/Max-Age=0/i);
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.preisrichterId, prId))).toHaveLength(0);
    const { ladeSitzung } = await import("../auth");
    expect((await ladeSitzung(undefined, token)).richter).toBeNull();
    // Ohne Sitzung schadet Abmelden nicht.
    expect((await pub.richter.abmelden()).ok).toBe(true);
  });

  test("verein.bereinigen: nur Administratoren, liefert die Zähler der Speicherfristen", async () => {
    await expect(helfer().verein.bereinigen()).rejects.toThrow("Administratoren");
    const n = await al().verein.bereinigen();
    for (const k of ["mails", "geburtsdaten", "preisrichter", "kaeufer", "protokoll", "belege", "journal", "nachweise", "anschriften", "geloescht"] as const) {
      expect(typeof n[k]).toBe("number");
    }
    // Ein Verein räumt keine Sitzungen anderer Vereine ab (nur die nächtliche Bereinigung ohne Verein).
    expect(n.sitzungen).toBe(0);
  });
});
