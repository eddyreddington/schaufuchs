/** Kompletter Durchlauf einer Schau von der Einrichtung bis zur Abrechnung. Teil des Schau-Ablaufs: ablauf.test.ts bindet die Teile in fester Reihenfolge ein, sie bauen aufeinander auf. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminKontext, leer, m, setzeAdminKontext, SRC, type Mod } from "./kontext";

describe("kompletter Schau-Ablauf", () => {
  let admin: ReturnType<Mod["appRouter"]["createCaller"]>;
  let schauId = 0;
  let farben: { id: number }[] = [];

  test("Einrichtung, Stammdaten, Schau", async () => {
    const pub = m.appRouter.createCaller(leer);
    await pub.auth.einrichten({ organisation: "Testverein", name: "Test AL", email: "al@test.de", passwort: "sehr-geheim-123" });
    const [b] = await m.db.select().from(m.schema.benutzer);
    setzeAdminKontext({ ...leer, benutzer: { id: b!.id, organisationId: b!.organisationId, name: b!.name, email: b!.email, rolle: "admin" } });
    admin = m.appRouter.createCaller(adminKontext);

    const csv = readFileSync(join(SRC, "../seed/demo-stammdaten.csv"), "utf8");
    const imp = await admin.stammdaten.importieren({ name: "Test", jahr: 2026, quelle: "Test", csv });
    expect(imp.farbenschlaege).toBeGreaterThan(20);
    expect((await admin.stammdaten.versionen()).find((v) => v.id === imp.versionId)!.farbenschlaege).toBe(imp.farbenschlaege);
    farben = await admin.stammdaten.suche({ versionId: imp.versionId, q: "Wyandotten weiß" });
    expect(farben.length).toBeGreaterThan(0);
    // Passende Rasse vor Teiltreffern (Pekingenten); % ist kein Platzhalter.
    expect((await admin.stammdaten.suche({ versionId: imp.versionId, q: "King" }))[0]!.rasse).toBe("King");
    expect(await admin.stammdaten.suche({ versionId: imp.versionId, q: "%" })).toHaveLength(0);

    const s = await admin.schau.anlegen({ name: "Testschau 2026", ort: "Halle" });
    schauId = s.id;
    await admin.schau.gebuehrenSetzen({
      schauId,
      gebuehren: [
        { art: "einzeltier", jugend: false, betragCent: 1000, befreitPreisrichter: false },
        { art: "kostenanteil", jugend: false, betragCent: 500, befreitPreisrichter: false },
      ],
    });
    const preisarten = (await admin.schau.get({ id: schauId })).preisarten;
    for (const p of preisarten) await admin.schau.preisartSpeichern({ ...p, betragCent: p.kuerzel === "E" ? 1100 : 600, mindestpunkte: 93 });
    await admin.schau.phaseSetzen({ id: schauId, phase: "meldung", trotzdem: true });
  });

  const position = (farbenschlagId: number, geschlecht = "1,0") => ({
    farbenschlagId,
    freitext: "",
    art: "einzeltier" as const,
    geschlecht,
    alter: "jung" as const,
    istAoc: false,
    istNeuzuechtung: false,
    eigeneZucht: true,
    verkaufspreisCent: 3000,
  });
  const person = (n: number) => ({
    vorname: `Vor${n}`,
    nachname: `Nach${n}`,
    strasse: "Weg 1",
    plz: "12345",
    ort: "Ort",
    telefon: "",
    email: `a${n}@test.de`,
    verein: "GZV",
    kreisverband: "",
    registriernummer: `065350${String(n).padStart(6, "0")}`,
    geburtsdatum: null,
  });

  test("Online-Meldung, Zahlung bestätigt automatisch", async () => {
    const pub = m.appRouter.createCaller(leer);
    // 12 Tiere, damit ein Preisrichter mindestens ein E-Kontingent bekommt.
    const r = await pub.oeffentlich.melden({
      slug: "testschau-2026",
      aussteller: person(1),
      istJugend: false,
      istPreisrichter: false,
      positionen: Array.from({ length: 12 }, (_, i) => position(farben[0]!.id, i % 2 ? "0,1" : "1,0")),
      zustimmung: true,
      stiftung: null,
      bemerkung: "",
    });
    expect(r.betrag.summeCent).toBe(12 * 1000 + 500);
    await expect(
      pub.oeffentlich.melden({ slug: "testschau-2026", aussteller: person(1), istJugend: false, istPreisrichter: false, positionen: [position(farben[0]!.id)], zustimmung: true, stiftung: null, bemerkung: "" }),
    ).rejects.toThrow("schon gemeldet");

    const liste = await admin.meldung.liste({ schauId });
    expect(liste[0]!.status).toBe("offen");
    const z = await admin.meldung.zahlungErfassen({ meldungId: liste[0]!.id, betragCent: r.betrag.summeCent, datum: "2026-10-01", art: "ueberweisung" });
    expect(z.bestaetigt).toBe(true);
    expect((await pub.oeffentlich.meineMeldung({ slug: "testschau-2026", token: r.token })).status).toBe("bestaetigt");
  });

  test("Katalognummern und Preisrichter-Einteilung", async () => {
    const k = await admin.katalog.nummernVergeben({ schauId });
    expect(k.geaendert).toBe(12);
    const liste = await admin.katalog.liste({ schauId });
    expect(liste.map((e) => e.katalogNr)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // 1,0 vor 0,1
    expect(liste.slice(0, 6).every((e) => e.geschlecht === "1,0")).toBe(true);

    const a = await admin.preisrichter.speichern({ schauId, name: "PR Eins", anschrift: "", email: "", telefon: "", istObmann: true });
    const vorschlag = await admin.preisrichter.einteilungVorschlagen({ schauId });
    expect(vorschlag).toEqual({ einteilung: [{ preisrichterId: a.id, vonNr: 1, bisNr: 12 }], fehlend: [] });
    await admin.preisrichter.einteilungSetzen({ schauId, einteilung: vorschlag.einteilung });
    const { pin } = await admin.preisrichter.pinErzeugen({ schauId, id: a.id });
    expect(pin).toMatch(/^\d{8}$/);

    // Vor der Einlieferung gibt es keine Tablet-Anmeldung (PIN ließe sich sonst wochenlang durchprobieren).
    await expect(m.appRouter.createCaller(leer).richter.anmelden({ slug: "testschau-2026", preisrichterId: a.id, pin })).rejects.toThrow("nur von der Einlieferung");
    await m.db.update(m.schema.schau).set({ phase: "einlieferung" }).where(m.eq(m.schema.schau.id, schauId));
    let cookie = "";
    await m.appRouter.createCaller({ ...leer, setCookie: (c: string) => (cookie = c) }).richter.anmelden({ slug: "testschau-2026", preisrichterId: a.id, pin });
    expect(cookie).toContain("schau_richter=");
    await expect(m.appRouter.createCaller(leer).richter.anmelden({ slug: "testschau-2026", preisrichterId: a.id, pin: "00000000" })).rejects.toThrow("PIN");
  });

  test("Bewertung am Tablet, Obmann, Preise, Freigabe", async () => {
    // Hühner brauchen den ND-Nachweis: geprüft liefert die Bewertung das Tier automatisch ein.
    const [mel] = await admin.meldung.liste({ schauId });
    await admin.halle.vetSetzen({
      meldungId: mel!.id,
      nd: { datum: "2026-09-01", impfstoff: "Nobilis", tierarzt: "Dr. Test" },
      pmv: { datum: null, impfstoff: "", tierarzt: "" },
      wg: { datum: null, sentinel: false, stelle: "" },
      geprueft: true,
    });
    await admin.schau.phaseSetzen({ id: schauId, phase: "bewertung", trotzdem: true, grund: "Test: Ablauf" });
    const [pr] = await m.db.select().from(m.schema.preisrichter);
    const richter = m.appRouter.createCaller({ ...leer, richter: { id: pr!.id, schauId, name: pr!.name, istObmann: true } });
    const daten = await richter.richter.daten();
    expect(daten.tiere).toHaveLength(12);
    expect(JSON.stringify(daten.tiere)).not.toContain("Nach1"); // anonym

    const jetzt = Date.now();
    const punkte = [97, 96, 95, 95, 94, 94, 93, 93, 92, 91, 90, 95];
    const { ergebnisse } = await richter.richter.abgleich({
      bewertungen: daten.tiere.map((t, i) => ({
        katalogeintragId: t.id,
        punkte: punkte[i]!,
        sondernote: null,
        vorzuege: "gute Form",
        wuensche: "",
        maengel: "",
        geraetZeit: new Date(jetzt),
      })),
    });
    expect(ergebnisse.every((e) => e.status === "gespeichert")).toBe(true);

    // Ein älterer Stand vom Gerät überschreibt nichts.
    const alt = await richter.richter.abgleich({
      bewertungen: [{ katalogeintragId: daten.tiere[1]!.id, punkte: 90, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(jetzt - 60_000) }],
    });
    expect(alt.ergebnisse[0]!.status).toBe("veraltet");
    // Ungültige Punktzahl wird abgelehnt.
    const falsch = await richter.richter.abgleich({
      bewertungen: [{ katalogeintragId: daten.tiere[2]!.id, punkte: 89, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date() }],
    });
    expect(falsch.ergebnisse[0]!.status).toBe("fehler");

    await expect(admin.preise.freigeben({ schauId, freigegeben: true, trotzdem: true })).rejects.toThrow("Obmann");
    const d2 = await richter.richter.daten();
    // Die eigene Note bestätigt der Obmann nicht selbst – sie steht nicht in seiner Liste, das macht ein zweiter Obmann.
    expect(d2.obmannListe).toHaveLength(0);
    await expect(richter.richter.obmannBestaetigen({ katalogeintragId: daten.tiere[0]!.id })).rejects.toThrow("eigene Bewertung");
    const zwei = await admin.preisrichter.speichern({ schauId, name: "PR Zwei", anschrift: "", email: "", telefon: "", istObmann: true });
    const obmann2 = m.appRouter.createCaller({ ...leer, richter: { id: zwei.id, schauId, name: "PR Zwei", istObmann: true } });
    const liste2 = (await obmann2.richter.daten()).obmannListe;
    expect(liste2.map((x) => x.id)).toEqual([daten.tiere[0]!.id]);
    await obmann2.richter.obmannBestaetigen({ katalogeintragId: liste2[0]!.id });

    // 12 bewertete Tiere → 1 E, 2 Z.
    const e = d2.preisarten.find((p) => p.kuerzel === "E")!;
    await richter.richter.preisVergeben({ katalogeintragId: daten.tiere[0]!.id, preisartId: e.id });
    await expect(richter.richter.preisVergeben({ katalogeintragId: daten.tiere[1]!.id, preisartId: e.id })).rejects.toThrow("ausgeschöpft");
    const zp = d2.preisarten.find((p) => p.kuerzel === "Z")!;
    await expect(richter.richter.preisVergeben({ katalogeintragId: daten.tiere[0]!.id, preisartId: zp.id })).rejects.toThrow("Standgeld");
    await expect(richter.richter.preisVergeben({ katalogeintragId: daten.tiere[10]!.id, preisartId: zp.id })).rejects.toThrow("ab 93");
    await richter.richter.preisVergeben({ katalogeintragId: daten.tiere[1]!.id, preisartId: zp.id });

    // Zurücksetzen und neu bewerten.
    const ohnePreis = daten.tiere[5]!.id;
    await richter.richter.zuruecksetzen({ katalogeintragId: ohnePreis });
    expect((await richter.richter.daten()).tiere.find((t) => t.id === ohnePreis)!.punkte).toBeNull();
    const neu = await richter.richter.abgleich({
      bewertungen: [{ katalogeintragId: ohnePreis, punkte: 94, sondernote: null, vorzuege: "neu bewertet", wuensche: "", maengel: "", geraetZeit: new Date() }],
    });
    expect(neu.ergebnisse[0]!.status).toBe("gespeichert");
    // Mit Preis: erst den Preis entfernen, auch beim Herabsetzen unter die Mindestpunkte.
    await expect(richter.richter.zuruecksetzen({ katalogeintragId: daten.tiere[1]!.id })).rejects.toThrow("zuerst den Preis");
    await expect(
      admin.bewertung.setzen({ schauId, katalogeintragId: daten.tiere[1]!.id, punkte: 92, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" }),
    ).rejects.toThrow("erst ab 93");
    // Fremde Tiere darf der Preisrichter nicht zurücksetzen: PR Zwei hat keine Einteilung, das Tier ist nicht seins.
    const fremd = m.appRouter.createCaller({ ...leer, richter: { id: zwei.id, schauId, name: "PR Zwei", istObmann: false } });
    await expect(fremd.richter.zuruecksetzen({ katalogeintragId: ohnePreis })).rejects.toThrow("nicht zugeteilt");

    await admin.schau.phaseSetzen({ id: schauId, phase: "preise", trotzdem: true, grund: "Test: Ablauf" });
    await admin.preise.freigeben({ schauId, freigegeben: true, trotzdem: true });
    const nachFreigabe = await richter.richter.abgleich({
      bewertungen: [{ katalogeintragId: daten.tiere[3]!.id, punkte: 96, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date() }],
    });
    expect(nachFreigabe.ergebnisse[0]!.status).toBe("fehler");
    await expect(
      admin.bewertung.setzen({ schauId, katalogeintragId: daten.tiere[3]!.id, punkte: 96, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "" }),
    ).rejects.toThrow("Begründung");
    await expect(richter.richter.zuruecksetzen({ katalogeintragId: ohnePreis })).rejects.toThrow("geschlossen");
    await expect(admin.bewertung.zuruecksetzen({ schauId, katalogeintragId: ohnePreis, grund: "" })).rejects.toThrow("Begründung");
    // Ist im selben Browser auch ein Preisrichter angemeldet, steht trotzdem nur die Ausstellungsleitung im Protokoll.
    const alUndRichter = m.appRouter.createCaller({ ...adminKontext, richter: { id: pr!.id, schauId, name: pr!.name, istObmann: true } });
    await alUndRichter.bewertung.zuruecksetzen({ schauId, katalogeintragId: ohnePreis, grund: "Reklamation Test" });
    const [eintrag] = await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "zurückgesetzt")).orderBy(m.desc(m.schema.aenderung.id)).limit(1);
    expect(eintrag!.grund).toBe("Reklamation Test");
    expect(eintrag!.preisrichterId).toBeNull();
    expect(eintrag!.benutzerId).not.toBeNull();
    await admin.bewertung.setzen({ schauId, katalogeintragId: ohnePreis, punkte: 94, sondernote: null, vorzuege: "", wuensche: "", maengel: "", geraetZeit: new Date(), grund: "Reklamation Test" });

    const oeff = await m.appRouter.createCaller(leer).oeffentlich.ergebnisse({ slug: "testschau-2026" });
    expect(oeff.freigegeben).toBe(true);
    expect(oeff.tiere[0]!.ergebnis).toBe("97 v");
    expect(oeff.tiere[0]!.preise).toEqual(["E"]);
  });

  test("Verkauf und Abrechnung", async () => {
    await admin.schau.phaseSetzen({ id: schauId, phase: "schau", trotzdem: true, grund: "Test: Ablauf" });
    const t = await admin.kasse.tierSuchen({ schauId, nr: "1" });
    expect(t?.eintrag.katalogNr).toBe(1);
    await expect(
      admin.kasse.verkaufen({ schauId, katalogeintragId: t!.eintrag.id, kaeuferName: "Käufer", kaeuferAnschrift: "", kaeuferRegistriernummer: "", kaeuferAlter: "ab16" }),
    ).rejects.toThrow("Registriernummer");
    const v = await admin.kasse.verkaufen({ schauId, katalogeintragId: t!.eintrag.id, kaeuferName: "Käufer Eins", kaeuferAnschrift: "", kaeuferRegistriernummer: "065350111111", kaeuferAlter: "ab16" });
    expect(v.belegNr).toBe(1);
    expect(v.provisionCent).toBe(450);
    // Verkaufte Tiere stehen nicht mehr im Angebot.
    const angebot = await admin.kasse.angebot({ schauId });
    expect(angebot.every((a) => a.verkaufspreisCent > 0)).toBe(true);
    expect(angebot.some((a) => a.id === t!.eintrag.id)).toBe(false);

    const ab = await admin.kasse.abrechnung({ schauId });
    expect(ab).toHaveLength(1);
    // Preisgeld 1100 (E) + 600 (Z) + Verkauf 3000 − Provision 450
    expect(ab[0]!.saldoCent).toBe(1100 + 600 + 3000 - 450);
    // Barauszahlung nur, soweit das Kassenbuch Bargeld ausweist (Kasse: 30 € aus dem Verkauf).
    await expect(admin.kasse.auszahlen({ schauId, ausstellerId: ab[0]!.ausstellerId })).rejects.toThrow("Trotzdem buchen");
    await admin.kasse.kassenbewegung({ schauId, art: "anfangsbestand", betragCent: 10_000, grund: "Wechselgeld" });
    // Hat sich der Betrag seit der Anzeige geändert, wird nichts gebucht.
    await expect(admin.kasse.auszahlen({ schauId, ausstellerId: ab[0]!.ausstellerId, erwartetCent: 100 })).rejects.toThrow("hat sich geändert");
    const q = await admin.kasse.auszahlen({ schauId, ausstellerId: ab[0]!.ausstellerId, erwartetCent: ab[0]!.nochOffenCent });
    expect(q.quittungNr).toBe(1);
    await expect(admin.kasse.auszahlen({ schauId, ausstellerId: ab[0]!.ausstellerId })).rejects.toThrow("Bereits");
  });

  test("Nachmeldung nach Katalogdruck bekommt Unternummer", async () => {
    await admin.katalog.gedrucktSetzen({ schauId, gedruckt: true });
    const r = await admin.meldung.speichern({
      schauId,
      aussteller: { ...person(2), istPreisrichter: false },
      eingang: "papier",
      istJugend: false,
      bemerkung: "",
      zustimmung: true,
      positionen: [position(farben[0]!.id, "1,0")],
    });
    await admin.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    await admin.katalog.nummernVergeben({ schauId });
    const neu = (await admin.katalog.liste({ schauId })).find((e) => e.meldungId === r.meldungId)!;
    // Tiere eines Züchters stehen im Farbenschlag zusammen: hinter allen 12 Tieren von Züchter 1 (nicht hinter dessen 1,0).
    expect(neu.katalogNr).toBe(12);
    expect(neu.suffix).toBe("a");
  });

  test("Kontingent gemeinsam für die Schau und mit angefangenen Zehnern", async () => {
    const s = await admin.schau.get({ id: schauId });
    await admin.schau.aktualisieren({ id: schauId, daten: { ...s, kontingentJe: "schau" } });
    const z = s.preisarten.find((p) => p.kuerzel === "Z")!;
    // Nach der Vergabe bleiben Betrag und Quelle fest; Kontingent und Rundung lassen sich ändern, Mindestpunkte nur so,
    // dass die vergebenen Preise sie erfüllen (Z ging an ein Tier mit 96 Punkten).
    await expect(admin.schau.preisartSpeichern({ ...z, betragCent: z.betragCent + 100 })).rejects.toThrow("Betrag und Quelle");
    await expect(admin.schau.preisartSpeichern({ ...z, mindestpunkte: 97 })).rejects.toThrow("weniger Punkten");
    await admin.schau.preisartSpeichern({ ...z, rundung: "angefangen" });
    const u = await admin.preise.uebersicht({ schauId });
    expect(u.kontingente).toHaveLength(1);
    // 12 bewertete Tiere; die unbewertete, nicht eingelieferte Nachmeldung zählt nicht.
    expect(u.kontingente[0]!.tiere).toBe(12);
    const art = (k: string) => u.kontingente[0]!.arten.find((a) => a.kuerzel === k)!;
    expect(art("E").verfuegbar).toBe(1); // volle Zehner: 12 → 1
    expect(art("Z").verfuegbar).toBe(4); // angefangene Zehner: 12 → 2 × 2
  });

  test("IBAN wird geprüft und für die Überweisung vorgemerkt", async () => {
    const meldungMit = (iban: string) =>
      admin.meldung.speichern({
        schauId,
        aussteller: { ...person(3), istPreisrichter: false, iban },
        eingang: "papier",
        istJugend: false,
        bemerkung: "",
        zustimmung: true,
        positionen: [position(farben[0]!.id, "0,1")],
      });
    await expect(meldungMit("DE88 3704 0044 0532 0130 00")).rejects.toThrow("Prüfziffer");
    const r = await meldungMit("de89 3704 0044 0532 0130 00");
    await admin.meldung.statusSetzen({ id: r.meldungId, status: "bestaetigt" });
    const ab = await admin.kasse.abrechnung({ schauId });
    const zeile = ab.find((z) => z.ausstellerId === r.ausstellerId)!;
    expect(zeile.iban).toBe("DE89370400440532013000");
    // Meldegeld noch offen und keine Preise: kein Guthaben, also nichts zu überweisen (und ohne erstellte SEPA-Datei
    // nichts zu buchen – das Buchen selbst hängt nicht an der Phase).
    expect(zeile.ueberweisbar).toBe(false);
    await expect(admin.kasse.ueberweisungenBuchen({ schauId, ausstellerIds: [r.ausstellerId] })).rejects.toThrow("Keine offenen Überweisungen");
  });

  test("Protokoll hält Änderungen fest", async () => {
    const p = await admin.schau.protokoll({ schauId, limit: 500 });
    const aktionen = new Set(p.map((x) => `${x.tabelle}:${x.aktion}`));
    expect(aktionen.has("bewertung:erfasst")).toBe(true);
    expect(aktionen.has("bewertung:zurückgesetzt")).toBe(true);
    expect(aktionen.has("preisvergabe:vergeben")).toBe(true);
    expect(aktionen.has("verkauf:verkauft")).toBe(true);
  });
  test("Katalog gestalten: Bilder, Grußworte, Druckkatalog", async () => {
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    // Nur echte Bilder – die Angabe des Browsers zählt nicht.
    await expect(
      admin.katalogGestaltung.bildHochladen({ schauId, rolle: "logo", name: "x.png", base64: Buffer.from("<svg onload=alert(1)>").toString("base64") }),
    ).rejects.toThrow("JPEG oder PNG");
    await admin.katalogGestaltung.bildHochladen({ schauId, rolle: "logo", name: "alt.png", base64: PNG });
    const logo = await admin.katalogGestaltung.bildHochladen({ schauId, rolle: "logo", name: "neu.png", base64: PNG });
    const foto = await admin.katalogGestaltung.bildHochladen({ schauId, rolle: "beitrag", name: "foto.png", base64: PNG });
    await admin.katalogGestaltung.speichern({
      schauId,
      daten: { format: "A4", untertitel: "Test", schirmherr: "Bürgermeisterin Test", ausstellungsleitung: "Ausstellungsleiter: Test", eintritt: "frei", farbe: "#224466" },
    });
    await expect(admin.katalogGestaltung.speichern({ schauId, daten: { format: "A5", untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "rot" } })).rejects.toThrow();
    const a = await admin.katalogGestaltung.beitragSpeichern({ schauId, beitrag: { art: "grusswort", titel: "Grußwort A", unterzeile: "A", text: "Text A", bildId: foto.id, groesse: "ganz" } });
    const b = await admin.katalogGestaltung.beitragSpeichern({ schauId, beitrag: { art: "grusswort", titel: "Grußwort B", unterzeile: "B", text: "Text B", bildId: null, groesse: "ganz" } });
    await admin.katalogGestaltung.beitragSpeichern({ schauId, beitrag: { art: "anzeige", titel: "Firma", unterzeile: "", text: "Anzeige", bildId: null, groesse: "viertel" } });
    await admin.katalogGestaltung.beitraegeOrdnen({ schauId, ids: [b.id, a.id] });
    const d = await admin.katalogGestaltung.laden({ schauId });
    expect(d.bilder.filter((x) => x.rolle === "logo").map((x) => x.id)).toEqual([logo.id]); // neues Logo ersetzt das alte
    expect(d.beitraege.filter((x) => x.art === "grusswort").map((x) => x.titel)).toEqual(["Grußwort B", "Grußwort A"]);
    expect(d.gestaltung.format).toBe("A4");

    // Fremde Bilder lassen sich keinem Beitrag zuordnen.
    await expect(admin.katalogGestaltung.beitragSpeichern({ schauId, beitrag: { art: "seite", titel: "X", unterzeile: "", text: "", bildId: 999999, groesse: "ganz" } })).rejects.toThrow("gehört nicht");

    const { katalogPdf } = await import("../pdf/katalog");
    const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
    for (const freigegeben of [false, true]) {
      const pdf = await katalogPdf({ ...s!, ergebnisseFreigegeben: freigegeben });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(5000);
    }
  });
});
