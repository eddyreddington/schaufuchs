/** Rechte, Tablet-Sperre, Kontingente, Stammdaten je Verein; Kassensperren, SEPA, Nummern, CSV. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminKontext, leer, m, SRC, verkaufsbereit, type Mod } from "./kontext";

describe("Audit Paket a: Rechte, Tablet-Sperre, Kontingent, Stammdaten je Verein", () => {
  let admin: ReturnType<Mod["appRouter"]["createCaller"]>;
  let mitarbeiter: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let prA = { id: 0, name: "Audit PR A" };
  let prB = { id: 0, name: "Audit PR B" };
  const nr = new Map<number, number>(); // Katalognummer → Eintrag-ID
  const tablet = (r: { id: number; name: string }, istObmann = false) => m.appRouter.createCaller({ ...leer, richter: { id: r.id, schauId, name: r.name, istObmann } });
  const note = (id: number, punkte: number) => ({ katalogeintragId: id, punkte, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date() });
  const letzteAenderung = async (tabelle: string) =>
    (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, tabelle)).orderBy(m.desc(m.schema.aenderung.id)).limit(1))[0]!;

  test("Stammdaten-Versionen gehören dem Verein, der sie eingespielt hat", async () => {
    admin = m.appRouter.createCaller(adminKontext);
    const [orgB] = await m.db.insert(m.schema.organisation).values({ name: "Anderer Verein" }).returning();
    const [b] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: orgB!.id, email: "b@test.de", name: "AL B", passwortHash: "-", rolle: "admin" })
      .returning();
    const andere = m.appRouter.createCaller({ ...leer, benutzer: { id: b!.id, organisationId: orgB!.id, name: b!.name, email: b!.email, rolle: "admin" } });
    const csv = readFileSync(join(SRC, "../seed/demo-stammdaten.csv"), "utf8");
    const fremd = await andere.stammdaten.importieren({ name: "Fremd 2100", jahr: 2100, quelle: "B", csv });

    const sichtbar = await admin.stammdaten.versionen();
    expect(sichtbar.some((v) => v.id === fremd.versionId)).toBe(false);
    const eigene = sichtbar.find((v) => v.name === "Test")!;
    expect(eigene.eigene).toBe(true);
    await expect(admin.stammdaten.loeschen({ id: fremd.versionId })).rejects.toThrow("nicht gefunden");
    await expect(admin.stammdaten.suche({ versionId: fremd.versionId, q: "Wyandotten" })).rejects.toThrow("gibt es nicht");
    await expect(admin.stammdaten.baum({ versionId: fremd.versionId })).rejects.toThrow("gibt es nicht");

    // Neue Schau bekommt die eigene Version, nicht die fremde mit dem höheren Jahr.
    const s = await admin.schau.anlegen({ name: "Audit Schau A", ort: "Halle" });
    schauId = s.id;
    const daten = await admin.schau.get({ id: schauId });
    expect(daten.stammdatenVersionId).toBe(eigene.id);
    await expect(admin.schau.aktualisieren({ id: schauId, daten: { ...daten, stammdatenVersionId: fremd.versionId } })).rejects.toThrow("gibt es nicht");

    // Vom Betreiber bereitgestellte Versionen (ohne Verein) sieht jeder, löschen kann sie kein Verein.
    const { importiereStammdaten } = await import("../routers/stammdaten");
    const global = await importiereStammdaten({ name: "Betreiber", jahr: 2025, quelle: "Betreiber", csv, organisationId: null });
    expect((await admin.stammdaten.versionen()).find((v) => v.id === global.versionId)?.eigene).toBe(false);
    expect((await andere.stammdaten.versionen()).some((v) => v.id === global.versionId)).toBe(true);
    await expect(admin.stammdaten.loeschen({ id: global.versionId })).rejects.toThrow("alle Vereine");

    await andere.stammdaten.loeschen({ id: fremd.versionId });
  });

  test("Schau mit zwei Preisrichtern, neue PIN meldet alte Tablets ab", async () => {
    const [ma] = await m.db
      .insert(m.schema.benutzer)
      .values({ organisationId: adminKontext.benutzer!.organisationId, email: "helfer@test.de", name: "Helfer", passwortHash: "-", rolle: "mitarbeiter" })
      .returning();
    mitarbeiter = m.appRouter.createCaller({ ...leer, benutzer: { id: ma!.id, organisationId: ma!.organisationId, name: ma!.name, email: ma!.email, rolle: "mitarbeiter" } });

    const versionId = (await admin.schau.get({ id: schauId })).stammdatenVersionId!;
    const farbe = (await admin.stammdaten.suche({ versionId, q: "Wyandotten weiß" }))[0]!;
    const r = await admin.meldung.speichern({
      schauId,
      aussteller: {
        vorname: "Audit",
        nachname: "Aussteller",
        strasse: "Weg 2",
        plz: "12345",
        ort: "Ort",
        telefon: "",
        email: "audit@test.de",
        verein: "GZV",
        kreisverband: "",
        registriernummer: "065359000001",
        geburtsdatum: null,
        istPreisrichter: false,
      },
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: Array.from({ length: 12 }, () => ({
        farbenschlagId: farbe.id,
        freitext: "",
        art: "einzeltier" as const,
        geschlecht: "1,0",
        alter: "jung" as const,
        istAoc: false,
        istNeuzuechtung: false,
        eigeneZucht: true,
        verkaufspreisCent: 0,
      })),
    });
    await admin.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await admin.katalog.nummernVergeben({ schauId });
    for (const e of await admin.katalog.liste({ schauId })) nr.set(e.katalogNr!, e.id);
    expect(nr.size).toBe(12);

    prA = { id: (await admin.preisrichter.speichern({ schauId, name: prA.name, anschrift: "", email: "", telefon: "", istObmann: true })).id, name: prA.name };
    // PR B ist zweiter Obmann: die „v“-Noten von PR A bestätigt nicht PR A selbst.
    prB = { id: (await admin.preisrichter.speichern({ schauId, name: prB.name, anschrift: "", email: "", telefon: "", istObmann: true })).id, name: prB.name };
    await admin.preisrichter.einteilungSetzen({ schauId, einteilung: [{ preisrichterId: prA.id, vonNr: 1, bisNr: 12 }] });

    const { pin } = await admin.preisrichter.pinErzeugen({ schauId, id: prA.id });
    await m.db.update(m.schema.schau).set({ phase: "einlieferung" }).where(m.eq(m.schema.schau.id, schauId));
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, setCookie: (c: string) => (cookie = c) }).richter.anmelden({ slug: "audit-schau-a", preisrichterId: prA.id, pin });
    const token = cookie.split(";")[0]!.split("=")[1]!;
    const { ladeSitzung } = await import("../auth");
    expect((await ladeSitzung(undefined, token)).richter?.id).toBe(prA.id);

    await admin.preisrichter.pinErzeugen({ schauId, id: prA.id });
    expect((await ladeSitzung(undefined, token)).richter).toBeNull();
    expect(await m.db.select().from(m.schema.sitzung).where(m.eq(m.schema.sitzung.preisrichterId, prA.id))).toHaveLength(0);
    expect((await letzteAenderung("preisrichter")).aktion).toBe("PIN neu, Sitzungen beendet");
  });

  test("Preise: fehlende Tiere, Kontingent, Einteilung ändern", async () => {
    await admin.schau.phaseSetzen({ id: schauId, phase: "bewertung", trotzdem: true, grund: "Test: Ablauf" });
    const a = tablet(prA, true);
    // Nr. 1 fehlt: es lässt sich weder bewerten noch prämieren.
    await mitarbeiter.halle.statusSetzen({ schauId, ids: [nr.get(1)!], status: "fehlt" });
    const { ergebnisse } = await a.richter.abgleich({ bewertungen: [...nr.values()].map((id) => note(id, 93)) });
    expect(ergebnisse.filter((x) => x.status === "gespeichert")).toHaveLength(11);
    expect(ergebnisse.find((x) => x.katalogeintragId === nr.get(1))!.status).toBe("fehler");
    const e = (await a.richter.daten()).preisarten.find((p) => p.kuerzel === "E")!;
    await expect(a.richter.preisVergeben({ katalogeintragId: nr.get(1)!, preisartId: e.id })).rejects.toThrow("fehlend");

    // Ein bewertetes oder prämiertes Tier war da – „fehlt“ geht dann nicht mehr (sonst stimmte das Kontingent nicht).
    await a.richter.preisVergeben({ katalogeintragId: nr.get(2)!, preisartId: e.id });
    await expect(mitarbeiter.halle.statusSetzen({ schauId, ids: [nr.get(2)!], status: "fehlt" })).rejects.toThrow("hat einen Preis");
    await expect(mitarbeiter.halle.statusSetzen({ schauId, ids: [nr.get(3)!], status: "fehlt" })).rejects.toThrow("ist bewertet");
    const k = (await admin.preise.uebersicht({ schauId })).kontingente.find((x) => x.preisrichterId === prA.id)!;
    expect(k.tiere).toBe(11);
    expect(k.arten.find((x) => x.kuerzel === "E")).toMatchObject({ verfuegbar: 1, vergeben: 1 });
    await expect(a.richter.preisVergeben({ katalogeintragId: nr.get(3)!, preisartId: e.id })).rejects.toThrow("ausgeschöpft");
    await mitarbeiter.halle.statusSetzen({ schauId, ids: [nr.get(1)!], status: "eingeliefert", uebersteuern: "Test: Bescheinigung liegt auf Papier vor" });
    expect((await a.richter.abgleich({ bewertungen: [note(nr.get(1)!, 93)] })).ergebnisse[0]!.status).toBe("gespeichert");
    await a.richter.preisEntfernen({ katalogeintragId: nr.get(2)!, preisartId: e.id });

    // Bewertete Tiere wechseln den Preisrichter nur nach Bestätigung; danach gehört der Preis dem neuen.
    await a.richter.preisVergeben({ katalogeintragId: nr.get(12)!, preisartId: e.id });
    const neu = [
      { preisrichterId: prA.id, vonNr: 1, bisNr: 6 },
      { preisrichterId: prB.id, vonNr: 7, bisNr: 12 },
    ];
    await expect(admin.preisrichter.einteilungSetzen({ schauId, einteilung: neu })).rejects.toThrow("wechseln den Preisrichter");
    await admin.preisrichter.einteilungSetzen({ schauId, einteilung: neu, bestaetigt: true });
    expect((await letzteAenderung("pr_einteilung")).neu).toMatchObject({ umgehaengt: ["7", "8", "9", "10", "11", "12"] });
    await expect(a.richter.preisEntfernen({ katalogeintragId: nr.get(12)!, preisartId: e.id })).rejects.toThrow("Nicht Ihr Preis");
    await tablet(prB).richter.preisEntfernen({ katalogeintragId: nr.get(12)!, preisartId: e.id });
  });

  test("Tablet außerhalb der Bewertungsphasen geschlossen", async () => {
    await admin.preisrichter.einteilungSetzen({ schauId, einteilung: [{ preisrichterId: prA.id, vonNr: 1, bisNr: 12 }], bestaetigt: true });
    const a = tablet(prA, true);
    const e = (await a.richter.daten()).preisarten.find((p) => p.kuerzel === "E")!;
    await a.richter.preisVergeben({ katalogeintragId: nr.get(1)!, preisartId: e.id });
    expect((await a.richter.abgleich({ bewertungen: [note(nr.get(4)!, 97)] })).ergebnisse[0]!.status).toBe("gespeichert");
    await admin.schau.phaseSetzen({ id: schauId, phase: "schau", trotzdem: true, grund: "Test: Ablauf" });
    await expect(a.richter.preisVergeben({ katalogeintragId: nr.get(2)!, preisartId: e.id })).rejects.toThrow("geschlossen");
    await expect(a.richter.preisEntfernen({ katalogeintragId: nr.get(1)!, preisartId: e.id })).rejects.toThrow("geschlossen");
    await expect(a.richter.obmannBestaetigen({ katalogeintragId: nr.get(4)! })).rejects.toThrow("geschlossen");
    // Die Ausstellungsleitung trägt die Bestätigung im Auftrag des Obmanns ein.
    await expect(mitarbeiter.bewertung.obmannBestaetigen({ schauId, katalogeintragId: nr.get(4)!, obmannId: prB.id })).rejects.toThrow("Administratoren");
    await admin.bewertung.obmannBestaetigen({ schauId, katalogeintragId: nr.get(4)!, obmannId: prB.id });
  });

  test("Nach der Freigabe ändern nur Administratoren", async () => {
    // Noten am PC (Papierkarten) trägt nur die Ausstellungsleitung ein – Helfer nie, auch nicht vor der Freigabe.
    await expect(mitarbeiter.bewertung.setzen({ schauId, ...note(nr.get(5)!, 94), grund: "" })).rejects.toThrow("Administratoren");
    await admin.bewertung.setzen({ schauId, ...note(nr.get(5)!, 94), grund: "" });
    await admin.preise.freigeben({ schauId, freigegeben: true, trotzdem: true });
    const vergabe = (await admin.preise.uebersicht({ schauId })).eintraege.find((x) => x.id === nr.get(1))!.preise[0]!;
    await expect(mitarbeiter.bewertung.setzen({ schauId, ...note(nr.get(5)!, 95), grund: "x" })).rejects.toThrow("Administratoren");
    await expect(mitarbeiter.bewertung.zuruecksetzen({ schauId, katalogeintragId: nr.get(6)!, grund: "x" })).rejects.toThrow("Administratoren");
    await expect(mitarbeiter.bewertung.obmannBestaetigen({ schauId, katalogeintragId: nr.get(4)!, obmannId: prB.id })).rejects.toThrow("Administratoren");
    await expect(mitarbeiter.preise.entfernen({ schauId, preisvergabeId: vergabe.vergabeId })).rejects.toThrow("Administratoren");
    await expect(mitarbeiter.preise.vergeben({ schauId, katalogeintragId: nr.get(3)!, preisartId: vergabe.preisartId })).rejects.toThrow("Administratoren");
    await admin.bewertung.setzen({ schauId, ...note(nr.get(5)!, 95), grund: "Reklamation" });
  });

  test("Stiftungen werden protokolliert", async () => {
    const st = { schauId, stifter: "Gönner", preisartId: null, anzahl: 5, betragCent: 5000, vorgabe: "", eingegangenAm: null };
    // Stiftungen (Geld, Kontingent der Stiftungspreise) ändert nur die Ausstellungsleitung.
    await expect(mitarbeiter.preise.stiftungSpeichern(st)).rejects.toThrow("Administratoren");
    await admin.preise.stiftungSpeichern(st);
    const angelegt = await letzteAenderung("stiftung");
    expect(angelegt.aktion).toBe("angelegt");
    const id = angelegt.datensatzId!;
    await admin.preise.stiftungSpeichern({ ...st, id, anzahl: 2 });
    const geaendert = await letzteAenderung("stiftung");
    expect(geaendert.aktion).toBe("geändert");
    expect(geaendert.alt).toMatchObject({ anzahl: 5, betragCent: 5000 });
    expect(geaendert.neu).toMatchObject({ anzahl: 2 });
    await expect(admin.preise.stiftungSpeichern({ ...st, id: 999_999 })).rejects.toThrow("nicht gefunden");
    await admin.preise.stiftungLoeschen({ schauId, id });
    const geloescht = await letzteAenderung("stiftung");
    expect(geloescht.aktion).toBe("gelöscht");
    expect(geloescht.benutzerId).not.toBeNull();
    await expect(admin.preise.stiftungLoeschen({ schauId, id })).rejects.toThrow("nicht gefunden");
  });
});

describe("Kasse: Sperren nach Abrechnung, SEPA-Datei, Nummern, CSV, Protokollsuche", () => {
  let admin: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let iban = { ausstellerId: 0, tiere: [] as number[] };
  let bar = { ausstellerId: 0, meldungId: 0, tiere: [] as number[] };

  const melden = async (n: number, extra: { iban?: string; ort?: string; tiere: number }) => {
    const [version] = await admin.stammdaten.versionen();
    const [farbe] = await admin.stammdaten.suche({ versionId: version!.id, q: "Wyandotten weiß" });
    const r = await admin.meldung.speichern({
      schauId,
      aussteller: {
        vorname: `Kasse${n}`,
        nachname: `Aussteller${n}`,
        strasse: "Weg 1",
        plz: "12345",
        ort: extra.ort ?? "Ort",
        telefon: "",
        email: `kasse${n}@test.de`,
        verein: "GZV",
        kreisverband: "",
        registriernummer: `0653500990${String(n).padStart(2, "0")}`,
        geburtsdatum: null,
        istPreisrichter: false,
        ...(extra.iban ? { iban: extra.iban } : {}),
      },
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: Array.from({ length: extra.tiere }, () => ({
        farbenschlagId: farbe!.id,
        freitext: "",
        art: "einzeltier" as const,
        geschlecht: "1,0",
        alter: "jung" as const,
        istAoc: false,
        istNeuzuechtung: false,
        eigeneZucht: true,
        verkaufspreisCent: 3000,
      })),
    });
    await admin.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    return r;
  };
  const verkaufe = async (katalogeintragId: number) => {
    await verkaufsbereit(schauId, [katalogeintragId]);
    return admin.kasse.verkaufen({ schauId, katalogeintragId, kaeuferName: "Käufer Kasse", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350222222", kaeuferAlter: "ab16" });
  };
  const zeile = async (ausstellerId: number) => (await admin.kasse.abrechnung({ schauId })).find((z) => z.ausstellerId === ausstellerId)!;

  test("Einrichtung", async () => {
    admin = m.appRouter.createCaller(adminKontext);
    const s = await admin.schau.anlegen({ name: "Kassenschau 2026", ort: "Halle" });
    schauId = s.id;
    await m.db.update(m.schema.schau).set({ vereinIban: "DE89370400440532013000", vereinKontoinhaber: "Testverein" }).where(m.eq(m.schema.schau.id, schauId));
    const a = await melden(1, { iban: "DE02120300000000202051", tiere: 3 });
    const b = await melden(2, { ort: "=SUMME(1;2)", tiere: 5 });
    await admin.katalog.nummernVergeben({ schauId });
    const liste = await admin.katalog.liste({ schauId });
    iban = { ausstellerId: a.ausstellerId, tiere: liste.filter((e) => e.meldungId === a.meldungId).map((e) => e.id) };
    bar = { ausstellerId: b.ausstellerId, meldungId: b.meldungId, tiere: liste.filter((e) => e.meldungId === b.meldungId).map((e) => e.id) };
    expect(iban.tiere).toHaveLength(3);
    expect(bar.tiere).toHaveLength(5);
  });

  test("Belegnummern: gleichzeitige Verkäufe eindeutig, nach Storno keine Wiederverwendung", async () => {
    const [v1, v2] = await Promise.all([verkaufe(bar.tiere[0]!), verkaufe(bar.tiere[1]!)]);
    expect(new Set([v1.belegNr, v2.belegNr])).toEqual(new Set([1, 2]));
    const hoechster = v1.belegNr > v2.belegNr ? v1 : v2;
    await expect(admin.kasse.stornieren({ schauId, verkaufId: hoechster.id, grund: "  " })).rejects.toThrow("Grund");
    await admin.kasse.stornieren({ schauId, verkaufId: hoechster.id, grund: "Käufer tritt zurück" });
    const v3 = await verkaufe(bar.tiere[2]!);
    expect(v3.belegNr).toBe(3);
  });

  test("Nach der Auszahlung sind Verkauf und Storno gesperrt, Abweichungen werden ausgewiesen", async () => {
    // Zu viel gezahltes Meldegeld (hier ohne Gebühren) wird ausgewiesen und steckt im Saldo.
    await admin.meldung.zahlungErfassen({ meldungId: bar.meldungId, betragCent: 500, datum: "2026-10-01", art: "bar" });
    const vorher = await zeile(bar.ausstellerId);
    expect(vorher.ueberzahltCent).toBe(500);
    expect(vorher.saldoCent).toBe(2 * (3000 - 450) + 500);
    expect(vorher.differenzCent).toBe(0);

    const q1 = await admin.kasse.auszahlen({ schauId, ausstellerId: bar.ausstellerId });
    await expect(verkaufe(bar.tiere[3]!)).rejects.toThrow("bereits abgerechnet");
    const [verkauft] = await admin.kasse.verkaeufe({ schauId });
    // Ein Storno nach der Auszahlung ist eine Reklamation der Ausstellungsleitung (Test „Runde 4: Geld …“).

    // Ändert sich der Saldo auf anderem Weg (hier: Meldegeld doppelt überwiesen), zeigt die Liste die Abweichung zur Quittung.
    // Verkäufe selbst lassen sich nicht mehr ändern (Datenbank-Schutz).
    await expect((async () => m.db.update(m.schema.verkauf).set({ preisCent: 3500 }).where(m.eq(m.schema.verkauf.id, verkauft!.id)))()).rejects.toThrow();
    await admin.meldung.zahlungErfassen({ meldungId: bar.meldungId, betragCent: 500, datum: "2026-10-03", art: "ueberweisung" });
    const danach = await zeile(bar.ausstellerId);
    expect(danach.auszahlung!.betragCent).toBe(vorher.saldoCent);
    expect(danach.differenzCent).toBe(500);

    // Korrektur nach echter Zahlung: nur der Unterschied wird gebucht – nie der volle Saldo noch einmal.
    const nach = await admin.kasse.auszahlen({ schauId, ausstellerId: bar.ausstellerId });
    expect(nach.betragCent).toBe(500);
    expect(nach.bezugQuittungNr).toBe(q1.quittungNr);
    expect(nach.quittungNr).toBe(q1.quittungNr + 1);
    const ausgeglichen = await zeile(bar.ausstellerId);
    expect(ausgeglichen.ausgezahltCent).toBe(vorher.saldoCent + 500);
    expect(ausgeglichen.differenzCent).toBe(0);
    await expect(admin.kasse.auszahlen({ schauId, ausstellerId: bar.ausstellerId })).rejects.toThrow("Bereits abgerechnet");

    // Zu viel gezahlt: die Differenzbuchung ist eine Rückforderung (negativ).
    const [doppelt] = await m.db.select().from(m.schema.zahlung).where(m.eq(m.schema.zahlung.datum, "2026-10-03"));
    await admin.meldung.zahlungStornieren({ id: doppelt!.id, grund: "Bank hat zurückgebucht" });
    const rueck = await admin.kasse.auszahlen({ schauId, ausstellerId: bar.ausstellerId });
    expect(rueck.betragCent).toBe(-500);
    expect((await zeile(bar.ausstellerId)).nochOffenCent).toBe(0);

    // Storno nur für Fehlbuchungen, von der jüngsten an; die Buchung bleibt sichtbar, Nummern werden nicht wieder vergeben.
    await expect(admin.kasse.auszahlungStornieren({ schauId, id: q1.id, grund: "Fehlbuchung" })).rejects.toThrow("spätere Quittung");
    await admin.kasse.auszahlungStornieren({ schauId, id: rueck.id, grund: "Fehlbuchung" });
    await admin.kasse.auszahlungStornieren({ schauId, id: nach.id, grund: "Fehlbuchung" });
    await admin.kasse.auszahlungStornieren({ schauId, id: q1.id, grund: "Geld nicht ausgegeben" });
    await expect(admin.kasse.auszahlungStornieren({ schauId, id: q1.id, grund: "doppelt" })).rejects.toThrow("bereits storniert");
    const storniert = await zeile(bar.ausstellerId);
    expect(storniert.buchungen.filter((b) => b.storniertAm)).toHaveLength(3);
    expect(storniert.ausgezahltCent).toBe(0);
    const v4 = await verkaufe(bar.tiere[3]!);
    expect(v4.belegNr).toBe(4);
    const q2 = await admin.kasse.auszahlen({ schauId, ausstellerId: bar.ausstellerId });
    expect(q2.quittungNr).toBe(q1.quittungNr + 3);
    expect(q2.bezugQuittungNr).toBeNull();
    expect(q2.betragCent).toBe(3 * (3000 - 450) + 500);
  });

  test("SEPA-Datei: gebucht wird genau der Inhalt der erstellten Datei", async () => {
    const kasse = await import("../routers/kasse");
    await verkaufe(iban.tiere[0]!);
    expect((await zeile(iban.ausstellerId)).ueberweisbar).toBe(true);
    // SEPA erst in der Abrechnung (nach der Schau).
    await expect(admin.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2030-11-02" })).rejects.toThrow("Abrechnung");
    await m.db.update(m.schema.schau).set({ phase: "abrechnung" }).where(m.eq(m.schema.schau.id, schauId));
    await expect(admin.kasse.ueberweisungenBuchen({ schauId, ausstellerIds: [iban.ausstellerId] })).rejects.toThrow("Keine offenen");

    // Erstellen und verwerfen (z. B. von der Bank abgelehnt).
    const verworfen = await admin.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2030-11-02" });
    await expect(admin.kasse.ueberweisungsdateiVerwerfen({ schauId, nachrichtId: verworfen.nachrichtId, grund: "" })).rejects.toThrow("Grund");
    await admin.kasse.ueberweisungsdateiVerwerfen({ schauId, nachrichtId: verworfen.nachrichtId, grund: "Bank hat abgelehnt" });
    expect(await admin.kasse.ueberweisungsdatei({ schauId })).toBeNull();

    await Bun.sleep(5); // eigene Nachrichten-ID
    const lauf = await admin.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2030-11-03" });
    expect(lauf.posten.map((p) => p.ausstellerId)).toEqual([iban.ausstellerId]);
    expect(lauf.summeCent).toBe(3000 - 450);
    await expect(admin.kasse.ueberweisungsdateiErstellen({ schauId, ausfuehrungAm: "2030-11-03" })).rejects.toThrow("offene SEPA-Datei");

    // Jeder Download liefert denselben Inhalt.
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    const offen = await kasse.offenerLauf(m.db, schauId);
    expect(offen!.nachrichtId).toBe(lauf.nachrichtId);
    expect(kasse.sepaXml(s!, offen!)).toBe(kasse.sepaXml(s!, (await kasse.offenerLauf(m.db, schauId))!));
    expect(kasse.sepaXml(s!, offen!)).toContain('<InstdAmt Ccy="EUR">25.50</InstdAmt>');

    // Solange die Datei offen ist: keine Barauszahlung, kein Verkauf, nicht erneut überweisbar.
    const z = await zeile(iban.ausstellerId);
    expect(z.ueberweisbar).toBe(false);
    expect(z.inUeberweisung?.nachrichtId).toBe(lauf.nachrichtId);
    await expect(admin.kasse.auszahlen({ schauId, ausstellerId: iban.ausstellerId })).rejects.toThrow("SEPA-Datei");
    // Verkauf ist in der Abrechnung ohnehin vorbei; im Angebot steht der Aussteller nicht mehr.
    expect((await admin.kasse.angebot({ schauId })).some((a) => iban.tiere.includes(a.id))).toBe(false);

    // Falsche Datei oder abweichende Auswahl wird nicht gebucht.
    await expect(admin.kasse.ueberweisungenBuchen({ schauId, nachrichtId: verworfen.nachrichtId })).rejects.toThrow("nicht mehr offen");
    await expect(admin.kasse.ueberweisungenBuchen({ schauId, nachrichtId: lauf.nachrichtId, ausstellerIds: [iban.ausstellerId, bar.ausstellerId] })).rejects.toThrow("weicht");

    const r = await admin.kasse.ueberweisungenBuchen({ schauId, nachrichtId: lauf.nachrichtId, ausstellerIds: [iban.ausstellerId] });
    expect(r).toEqual({ anzahl: 1, summeCent: 3000 - 450 });
    const gebucht = await zeile(iban.ausstellerId);
    expect(gebucht.auszahlung!.art).toBe("ueberweisung");
    expect(gebucht.auszahlung!.betragCent).toBe(3000 - 450);
    expect(gebucht.inUeberweisung).toBeNull();
    expect(await admin.kasse.ueberweisungsdatei({ schauId })).toBeNull();
    // Quittungsnummern laufen weiter (1–3 storniert, 4 bar, 5 Überweisung).
    expect(gebucht.auszahlung!.quittungNr).toBe(5);
  });

  test("CSV schützt Textfelder vor Formeln, Beträge bleiben Zahlen", async () => {
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, setCookie: (c: string) => (cookie = c) }).auth.anmelden({ email: "al@test.de", passwort: "sehr-geheim-123" });
    const server = (await import("../index")).default;
    const antwort = await server.fetch(new Request(`http://test/datei/${schauId}/abrechnung.csv`, { headers: { Cookie: cookie.split(";")[0]! } }));
    expect(antwort.status).toBe(200);
    const text = await antwort.text();
    expect(text).toContain(`"'=SUMME(1;2)"`);
    expect(text).not.toContain(";=SUMME");
    // Verkauf 90,00; Saldo, Quittung 4 (1–3 storniert), ausgezahlt; keine Abweichung.
    const zeileBar = text.split("\r\n").find((l) => l.startsWith("Aussteller2"))!;
    expect(zeileBar).toContain(";90,00;");
    expect(zeileBar.endsWith(";81,50;4;81,50;")).toBe(true);
  });

  test("Protokoll: Suche und Blättern über alle Einträge", async () => {
    const alle = await admin.schau.protokoll({ schauId, limit: 1000 });
    expect(alle.length).toBeGreaterThan(6);
    // Der Storno liegt außerhalb einer kleinen Seite, die Suche findet ihn trotzdem.
    const seite = await admin.schau.protokoll({ schauId, limit: 3 });
    expect(seite).toHaveLength(3);
    expect(seite.some((x) => x.grund === "Käufer tritt zurück")).toBe(false);
    const treffer = await admin.schau.protokoll({ schauId, limit: 3, q: "tritt zurück" });
    expect(treffer.map((x) => x.aktion)).toEqual(["storniert"]);
    expect((await admin.schau.protokoll({ schauId, limit: 50, q: "Bank hat abgelehnt" })).map((x) => x.aktion)).toEqual(["SEPA-Datei verworfen"]);
    // Platzhalter werden wörtlich gesucht.
    expect(await admin.schau.protokoll({ schauId, limit: 50, q: "%%%" })).toHaveLength(0);
    // Blättern: die zweite Seite schließt lückenlos an.
    const zweite = await admin.schau.protokoll({ schauId, limit: 3, cursor: seite[2]!.id });
    expect(zweite.map((x) => x.id)).toEqual(alle.slice(3, 6).map((x) => x.id));
  });
});
