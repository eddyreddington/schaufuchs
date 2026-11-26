/**
 * Online-Meldung an einen vorhandenen Stammsatz (Entscheidung 034): kein Zugangslink in der Antwort, die Meldung gilt
 * erst nach Bestätigung über den Link aus der Mail (oder durch die AL) – vorher kein Einzug per Mandat; Stiftung und
 * Spende aus Online-Meldungen nie per Lastschrift. Dazu: Bar-Quittung nur für bare Zahlungen, Einwilligung nur an
 * gültigen Meldungen und ohne sofortigen Neubau des Katalogs, Tiergrenze auch je IPv6-/48. Teil des Schau-Ablaufs.
 */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Online-Meldung an vorhandenen Stammsatz und Geld", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const pub = (ip = "198.51.100.231") => m.appRouter.createCaller({ ...leer, ip });
  const KONTO = { vereinKontoinhaber: "Musterverein e. V.", vereinIban: "DE89370400440532013000", vereinBic: "" };
  const ohne = { strasse: "", plz: "", ort: "", telefon: "", verein: "", kreisverband: "", geburtsdatum: null, istPreisrichter: false, iban: "", kontoinhaber: "" };
  let farbeId = 0;
  const pos = () => ({ farbenschlagId: farbeId, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null });
  const neueSchau = async (name: string, werte: Record<string, unknown> = {}) => {
    const { id } = await al().schau.anlegen({ name, ort: "Musterdorf" });
    const d = await al().schau.get({ id });
    farbeId = (await al().stammdaten.suche({ versionId: d.stammdatenVersionId!, q: "Wyandotten weiß" }))[0]!.id;
    await al().schau.aktualisieren({ id, daten: { ...d, ...werte } });
    await al().schau.gebuehrenSetzen({ schauId: id, gebuehren: [{ art: "einzeltier", jugend: false, betragCent: 1100, befreitPreisrichter: false }] });
    await al().schau.phaseSetzen({ id, phase: "meldung", trotzdem: true });
    return { id, slug: d.slug };
  };
  const person = (vorname: string, reg: string) => ({ vorname, nachname: "Stammsatz", strasse: "Weg 1", plz: "34117", ort: "Musterdorf", telefon: "", email: `${vorname.toLowerCase()}.stammsatz@test.de`, verein: "", kreisverband: "", registriernummer: reg, geburtsdatum: null });
  const melden = (slug: string, p: ReturnType<typeof person>, extra: Record<string, unknown> = {}, ip?: string) =>
    pub(ip).oeffentlich.melden({ slug, aussteller: p, istJugend: false, istPreisrichter: false, positionen: [pos()], zustimmung: true, stiftung: null, bemerkung: "", ...extra });
  const letzteMail = async (an: string) => (await m.db.select().from(m.schema.postausgang).where(m.eq(m.schema.postausgang.an, an)).orderBy(m.schema.postausgang.id)).at(-1)!;
  const tokenAusMail = async (an: string) => (await letzteMail(an)).text.match(/\/meldung\/([A-Za-z0-9_-]+)/)![1]!;

  const RITA = person("Rita", "06 535 012 0911");
  const OTTO = person("Otto", "06 535 012 0912");
  let b = { id: 0, slug: "" };
  let ritaMeldung = 0;

  test("Vorhandener Stammsatz: kein Link und keine Überweisungsdaten in der Antwort, Meldung erst nach Bestätigung", async () => {
    await al().lastschrift.glaeubigerIdSetzen({ glaeubigerId: "DE98ZZZ09999999999" });
    // Beide sind dem Verein bekannt (Papiermeldung einer früheren Schau); nur Rita hat ein Mandat.
    const alt = await neueSchau("Stammsatz früher");
    const stamm: Record<string, number> = {};
    for (const p of [RITA, OTTO]) {
      const r = await al().meldung.speichern({ schauId: alt.id, aussteller: { ...ohne, vorname: p.vorname, nachname: p.nachname, email: p.email, registriernummer: p.registriernummer }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
      stamm[p.vorname] = r.ausstellerId;
    }
    await al().lastschrift.mandatAnlegen({ ausstellerId: stamm.Rita!, unterschriebenAm: "2026-10-01", wiederkehrend: true, iban: "DE02100500000054540402", kontoinhaber: "" });

    b = await neueSchau("Stammsatz jetzt", { girocode: true, ...KONTO, zahlungBeiEinlieferung: false });
    await m.db.update(m.schema.schau).set({ vereinBic: "BYLADEM1001" }).where(m.eq(m.schema.schau.id, b.id));
    const r = await melden(b.slug, RITA, { stiftung: { betragCent: 5000, vorgabe: "" }, spende: { betragCent: 2000, nennen: false }, onlineVeroeffentlichung: true });
    const o = await melden(b.slug, OTTO);
    // Kein Zugangslink an den Absender – nur per Mail an die hinterlegte Adresse.
    expect(r.token).toBe("");
    expect(o.token).toBe("");
    // Die Antwort hängt nicht vom Mandat ab: ohne Link auch keine Überweisungsdaten.
    expect(r.ueberweisung).toBeNull();
    expect(o.ueberweisung).toBeNull();
    // Ein Neuer bekommt seinen Link wie bisher sofort.
    const neu = await melden(b.slug, person("Nina", "06 535 012 0913"));
    expect(neu.token.length).toBeGreaterThan(10);
    expect(neu.ueberweisung).not.toBeNull();

    const meldungen = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.schauId, b.id));
    const rita = meldungen.find((x) => x.ausstellerId === stamm.Rita)!;
    ritaMeldung = rita.id;
    // Am vorhandenen Stammsatz, aber die AAB hat der Inhaber noch nicht anerkannt.
    expect(rita.zustimmungAm).toBeNull();
    expect(meldungen.find((x) => x.ausstellerId === stamm.Otto)!.zustimmungAm).toBeNull();
    // Die Mail an die hinterlegte Adresse bittet um Bestätigung.
    expect((await letzteMail(RITA.email)).text).toContain("bestätigen");
    const punkte = (await (await import("../services/pruefung")).pruefliste(b.id)).punkte.map((p) => p.text);
    expect(punkte).toContain("2 Online-Meldungen nicht vom Aussteller bestätigt");
  });

  test("Lastschrift: unbestätigte Online-Meldung nicht, nach Bestätigung nur das Meldegeld", async () => {
    await al().meldung.statusSetzen({ id: ritaMeldung, status: "bestaetigt" });
    let u = await al().lastschrift.uebersicht({ schauId: b.id });
    expect(u.vorschau.map((p) => p.meldungId)).not.toContain(ritaMeldung);
    expect(u.ohneGueltigesMandat).toEqual([{ name: "Stammsatz, Rita", grund: "Online-Meldung noch nicht vom Aussteller bestätigt.", offenCent: 8100 }]);

    const token = await tokenAusMail(RITA.email);
    const vorher = await pub().oeffentlich.meineMeldung({ slug: b.slug, token });
    expect(vorher.bestaetigen).toBe(true);
    await pub().oeffentlich.meldungBestaetigen({ slug: b.slug, token });
    await pub().oeffentlich.meldungBestaetigen({ slug: b.slug, token }); // zweimal: kein zweiter Eintrag
    expect((await pub().oeffentlich.meineMeldung({ slug: b.slug, token })).bestaetigen).toBe(false);
    const [frisch] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, ritaMeldung));
    expect(frisch!.zustimmungAm).not.toBeNull();
    const eintraege = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.datensatzId, ritaMeldung));
    expect(eintraege.filter((e) => e.tabelle === "meldung" && e.aktion === "vom Aussteller bestätigt")).toHaveLength(1);

    u = await al().lastschrift.uebersicht({ schauId: b.id });
    // Eingezogen wird nur das Meldegeld; Stiftung und Spende zahlt der Aussteller selbst.
    expect(u.vorschau.filter((p) => p.meldungId === ritaMeldung).map((p) => p.betragCent)).toEqual([1100]);
    expect(u.ohneGueltigesMandat).toEqual([{ name: "Stammsatz, Rita", grund: "Stiftung und Spende aus der Online-Meldung: bitte per Überweisung oder bar.", offenCent: 7000 }]);
  });

  test("Einwilligung nur an gültigen Meldungen; Bestätigen nicht an stornierten", async () => {
    const r = await melden(b.slug, person("Sven", "06 535 012 0914"));
    const [md] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token));
    await al().meldung.statusSetzen({ id: md!.id, status: "storniert", grund: "Test" });
    await expect(pub().oeffentlich.onlineVeroeffentlichung({ slug: b.slug, token: r.token, erlaubt: true })).rejects.toThrow("storniert oder abgelehnt");
    await expect(pub().oeffentlich.meldungBestaetigen({ slug: b.slug, token: r.token })).rejects.toThrow("storniert oder abgelehnt");
  });

  test("Öffentlicher Katalog: Einwilligungen aus dem Netz erneuern ihn nicht sofort, nur der Widerruf eines sichtbaren Namens", async () => {
    const { datenschutzGeaendert } = await import("../datei-oeffentlich");
    const { protokolliere } = await import("../services/protokoll");
    const s = await neueSchau("Katalog Einwilligung");
    const sichtbar = await melden(s.slug, person("Vera", "06 535 012 0915"), {}, "198.51.100.232");
    const offen = await melden(s.slug, person("Olga", "06 535 012 0916"), {}, "198.51.100.232");
    const id = async (token: string) => (await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, token)))[0]!.id;
    const vera = await id(sichtbar.token);
    const olga = await id(offen.token);
    await al().meldung.statusSetzen({ id: vera, status: "bestaetigt" });
    const eintrag = async (datensatzId: number, aktion: string, akteur: string) => {
      const [x] = await m.db.select({ id: m.schema.aenderung.id }).from(m.schema.aenderung).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
      await protokolliere(m.db, { schauId: s.id, tabelle: "meldung", datensatzId, aktion, akteur: { text: akteur } });
      return datenschutzGeaendert(s.id, x!.id);
    };
    expect(await eintrag(vera, "Online-Veröffentlichung erlaubt", "Aussteller (online)")).toBe(false);
    expect(await eintrag(olga, "Online-Veröffentlichung widerrufen", "Aussteller (online)")).toBe(false);
    expect(await eintrag(vera, "Online-Veröffentlichung widerrufen", "Aussteller (online)")).toBe(true);
    // Änderungen der Ausstellungsleitung gelten wie bisher sofort.
    expect(await eintrag(olga, "Online-Veröffentlichung widerrufen", "Ausstellungsleitung")).toBe(true);
  });

  test("Belegarchiv: Bar-Quittung nur für bare Zahlungen", async () => {
    const server = (await import("../index")).default;
    const { COOKIE, neueSitzung } = await import("../auth");
    const cookie = `${COOKIE}=${await neueSitzung({ benutzerId: adminKontext.benutzer!.id })}`;
    const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const r = await melden(b.slug, person("Ulla", "06 535 012 0917"));
    const [md] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.zugangsToken, r.token));
    await al().meldung.zahlungErfassen({ meldungId: md!.id, betragCent: 500, datum: heute, art: "ueberweisung" });
    await al().meldung.zahlungErfassen({ meldungId: md!.id, betragCent: 600, datum: heute, art: "bar" });
    const zahlungen = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.meldungId, md!.id)).orderBy(m.schema.zahlung.id);
    const hole = (id: number) => server.fetch(new Request(`http://test/datei/${b.id}/beleg/einzahlung/${id}.pdf`, { headers: { cookie } }));
    expect((await hole(zahlungen[0]!.id)).status).toBe(404);
    const belege = await m.db.select().from(m.schema.beleg).where(m.eq(m.schema.beleg.schauId, b.id));
    expect(belege.filter((x) => x.art === "einzahlung" && x.nummer === zahlungen[0]!.id)).toHaveLength(0);
    expect((await hole(zahlungen[1]!.id)).status).toBe(200);
  });

  test("Tiere je Anschluss: auch ein ganzes IPv6-/48 zählt als ein Anschluss", async () => {
    const s = await neueSchau("Tiergrenze Netz", { kapazitaet: 60 });
    const viele = Array.from({ length: 30 }, () => pos());
    await melden(s.slug, person("Anja", "06 535 012 0918"), { positionen: viele }, "2001:db8:a5a5:100::/64");
    // Ein anderes /56 im selben /48: gesperrt.
    await expect(melden(s.slug, person("Bea", "06 535 012 0919"), {}, "2001:db8:a5a5:200::/64")).rejects.toThrow("Von dieser Adresse");
    // Ein anderes /48: frei.
    await melden(s.slug, person("Cleo", "06 535 012 0920"), {}, "2001:db8:a5a6:100::/64");
  });

  test("Bestätigen per Link nur für Online-Meldungen: eine Papiermeldung ohne Meldebogen bleibt unverändert", async () => {
    const s = await neueSchau("Bestätigen nur online");
    const r = await al().meldung.speichern({ schauId: s.id, aussteller: { ...ohne, vorname: "Pia", nachname: "Papier", email: "pia.papier@test.de", registriernummer: "06 535 012 0921" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: false, positionen: [pos()] });
    const token = (await al().meldung.get({ id: r.meldungId })).meldung.zugangsToken;
    await pub().oeffentlich.meldungBestaetigen({ slug: s.slug, token, sprache: "de" } as never).catch(() => undefined);
    const [z] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, r.meldungId));
    expect(z!.zustimmungAm).toBeNull();
  });

  test("Ablehnen mit erwartetem Status: inzwischen bestätigt → Konflikt, nichts geändert", async () => {
    const s = await neueSchau("Erwarteter Status");
    const r = await al().meldung.speichern({ schauId: s.id, aussteller: { ...ohne, vorname: "Ewa", nachname: "Erwartet", email: "", registriernummer: "06 535 012 0922" }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos()] });
    await al().meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await expect(al().meldung.statusSetzen({ id: r.meldungId, status: "abgelehnt", erwartet: "offen" } as never)).rejects.toThrow("inzwischen geändert");
    expect((await al().meldung.get({ id: r.meldungId })).meldung.status).toBe("bestaetigt");
    // Passt der Stand, geht es wie bisher.
    await al().meldung.statusSetzen({ id: r.meldungId, status: "offen", erwartet: "bestaetigt" } as never);
  });
});
