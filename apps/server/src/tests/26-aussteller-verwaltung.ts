/** Aussteller-Verwaltung: anlegen, bearbeiten, Mitglieder und Externe getrennt (Schreibweisen des Vereins), Rechte, Protokoll, Bankdaten-Sperre. */
import { describe, expect, test } from "bun:test";
import { adminKontext, m } from "./kontext";

const leer = { strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" };

describe("Aussteller-Verwaltung", () => {
  const al = () => m.appRouter.createCaller(adminKontext);
  const helfer = () => m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, rolle: "mitarbeiter" } });
  const protokoll = async (id: number, ab: number) =>
    (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.tabelle, "aussteller"))).filter((p) => p.datensatzId === id && p.id > ab).sort((x, y) => x.id - y.id);
  /** Wie die Oberfläche: Formular mit dem gespeicherten Stand öffnen, ändern, mit Ausgangsstand speichern. */
  const bearbeite = async (id: number, aenderung: Record<string, unknown>, mitglied?: "auto" | "ja" | "nein") => {
    const { id: _i, mitglied: m0, ...felder } = await al().verein.ausstellerDaten({ id });
    return al().verein.ausstellerSpeichern({ id, daten: { ...felder, ...aenderung } as typeof felder, mitglied: mitglied ?? (m0 == null ? "auto" : m0 ? "ja" : "nein"), vorher: { ...felder, mitglied: m0 } });
  };

  test("anlegen, Mitglieder/Externe nach Schreibweise, von Hand umstellen, bearbeiten mit Protokoll, Rechte", async () => {
    const [{ ab }] = (await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }];
    const mitglied = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Vera", nachname: "Verwaltung", plz: "12347", verein: "GZV Musterdorf-Lindenau" } });
    const schreibweise2 = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Vito", nachname: "Verwaltung", verein: "gzv musterdorf lindenau" } });
    const extern = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Egon", nachname: "Verwaltung", verein: "GZV Feldberg 1896" } });
    const ohneVerein = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Olga", nachname: "Verwaltung" } });

    // Gleicher Name und PLZ: Rückfrage, bewusst doppelt geht.
    await expect(al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "vera", nachname: "VERWALTUNG", plz: "12347" } })).rejects.toThrow("gibt es schon");
    const doppelt = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Vera", nachname: "Verwaltung", plz: "12347" }, trotzdem: true });
    expect(doppelt.id).not.toBe(mitglied.id);

    const namen = async (gruppe: "alle" | "mitglieder" | "externe") => (await al().verein.aussteller({ q: "Verwaltung", gruppe })).map((x) => x.vorname).sort();
    // Ohne festgelegte Schreibweisen ist niemand automatisch Mitglied.
    expect(await namen("mitglieder")).toEqual([]);
    expect(await namen("externe")).toEqual(["Egon", "Olga", "Vera", "Vera", "Vito"]);

    // Schreibweisen festlegen: beide Musterdorf-Schreibweisen sind derselbe Verein, leere und doppelte fallen weg.
    const ang = await al().verein.vereinsangaben();
    expect(ang.angaben.find((a) => a.verein === "GZV Feldberg 1896")).toMatchObject({ eigen: false });
    const r = await al().verein.vereinsnamenSetzen({ namen: ["GZV Musterdorf-Lindenau", " ", "GZV  Musterdorf-Lindenau"] });
    expect(r.namen).toEqual(["GZV Musterdorf-Lindenau"]);
    expect(await namen("mitglieder")).toEqual(["Vera", "Vito"]);
    // Externe: auch die ohne Vereinsangabe und die automatisch bestimmten (kein NULL-Verlust in SQL).
    expect(await namen("externe")).toEqual(["Egon", "Olga", "Vera"]);
    expect(await namen("alle")).toHaveLength(5);
    expect((await al().verein.vereinsangaben()).angaben.filter((a) => a.eigen).map((a) => a.verein).sort()).toEqual(["GZV Musterdorf-Lindenau", "gzv musterdorf lindenau"]);

    // Von Hand: Externer wird Mitglied, Mitglied mit eigenem Verein wird extern.
    const egon = await al().verein.ausstellerDaten({ id: extern.id });
    expect(egon).not.toHaveProperty("geburtsdatum");
    await bearbeite(extern.id, {}, "ja");
    await bearbeite(schreibweise2.id, {}, "nein");
    expect(await namen("mitglieder")).toEqual(["Egon", "Vera"]);
    expect(await namen("externe")).toEqual(["Olga", "Vera", "Vito"]);
    const zeileEgon = (await al().verein.aussteller({ q: "Egon" })).find((x) => x.id === extern.id)!;
    expect(zeileEgon).toMatchObject({ mitglied: true, mitgliedVonHand: true });
    // Zurück auf automatisch: wieder nach Vereinsangabe.
    await bearbeite(extern.id, {}, "auto");
    expect(await namen("mitglieder")).toEqual(["Vera"]);

    // Bearbeiten: Änderungen im Protokoll, IBAN gekürzt; ungültige IBAN abgelehnt.
    await expect(bearbeite(ohneVerein.id, { iban: "DE00 1234" })).rejects.toThrow();
    // Ohne Ausgangsstand (altes Formular) speichert der Server nichts.
    await expect(al().verein.ausstellerSpeichern({ id: ohneVerein.id, daten: { ...leer, vorname: "Olga", nachname: "Verwaltung" } })).rejects.toThrow("neu öffnen");
    await bearbeite(ohneVerein.id, { nachname: "Verwaltung-Neu", ort: "Seehausen", telefon: "0361 999", iban: "DE89 3704 0044 0532 0130 00", kontoinhaber: "Olga V." });
    const olga = await al().verein.ausstellerDaten({ id: ohneVerein.id });
    expect(olga).toMatchObject({ nachname: "Verwaltung-Neu", ort: "Seehausen", iban: "DE89370400440532013000" });
    const p = await protokoll(ohneVerein.id, ab);
    expect(p.map((x) => x.aktion)).toEqual(["Aussteller angelegt", "Stammdaten geändert (Aussteller-Verwaltung)"]);
    // IBAN gekürzt; Telefon und Kontoinhaber nicht im Klartext (bleiben sonst nach einem Löschwunsch bis Fristende stehen).
    expect(p[1]!.neu).toEqual({ nachname: "Verwaltung-Neu", ort: "Seehausen", telefon: "(angegeben)", iban: "…3000", kontoinhaber: "(angegeben)" });
    expect(JSON.stringify(p)).not.toContain("DE89370400440532013000");
    expect(JSON.stringify(p)).not.toContain("0361 999");
    expect(JSON.stringify(p)).not.toContain("Olga V.");
    expect((await protokoll(extern.id, ab)).map((x) => (x.neu as { mitglied?: string }).mitglied)).toEqual(["automatisch", "ja", "automatisch"]);
    // Ohne Änderung kein Eintrag.
    await bearbeite(ohneVerein.id, {});
    expect(await protokoll(ohneVerein.id, ab)).toHaveLength(2);
    // Schreibweisen im Protokoll.
    const orgP = (await m.db.select().from(m.schema.aenderung).where(m.eq(m.schema.aenderung.aktion, "Schreibweisen des Vereins (Mitglieder)"))).filter((x) => x.id > ab);
    expect(orgP.map((x) => x.neu)).toEqual([{ namen: ["GZV Musterdorf-Lindenau"] }]);

    // Rechte: Helfer nichts, fremder Verein sieht und ändert nichts.
    await expect(helfer().verein.aussteller({ q: "" })).rejects.toThrow();
    await expect(helfer().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "X", nachname: "Y" } })).rejects.toThrow();
    await expect(helfer().verein.vereinsnamenSetzen({ namen: [] })).rejects.toThrow();
    const [org2] = await m.db.insert(m.schema.organisation).values({ name: "Fremder Verein Verwaltung" }).returning();
    const fremd = m.appRouter.createCaller({ ...adminKontext, benutzer: { ...adminKontext.benutzer!, organisationId: org2!.id } });
    expect(await fremd.verein.aussteller({ q: "Verwaltung" })).toEqual([]);
    await expect(fremd.verein.ausstellerDaten({ id: mitglied.id })).rejects.toThrow("nicht gefunden");
    const fremdVorher = { ...leer, vorname: "Vera", nachname: "Verwaltung", plz: "12347", verein: "GZV Musterdorf-Lindenau", mitglied: null };
    await expect(fremd.verein.ausstellerSpeichern({ id: mitglied.id, daten: { ...leer, vorname: "Ge", nachname: "Kapert" }, vorher: fremdVorher })).rejects.toThrow("nicht gefunden");
    expect((await al().verein.ausstellerDaten({ id: mitglied.id })).nachname).toBe("Verwaltung");
    expect((await fremd.verein.vereinsangaben()).angaben).toEqual([]);

    // Neu angelegt: bei der Meldungserfassung sofort zu finden.
    expect((await helfer().meldung.ausstellerSuche({ schauId: (await al().schau.liste()).find((x) => !x.test)!.id, q: "Verwaltung-Neu" })).map((x) => x.id)).toEqual([ohneVerein.id]);
  });

  test("veraltetes Formular, Bankdaten-Sperre, Protokoll je Schau (auch abgeschlossene), gesperrt nach Löschwunsch", async () => {
    const [{ ab }] = (await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }];
    const { id: schauId } = await al().schau.anlegen({ name: "Verwaltung Schau", ort: "Halle" });
    const { id: altId } = await al().schau.anlegen({ name: "Verwaltung Schau alt", ort: "Halle" });
    const versionId = (await al().schau.get({ id: schauId })).stammdatenVersionId!;
    const pos = { farbenschlagId: (await al().stammdaten.suche({ versionId, q: "Wyandotten" }))[0]!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const r = await al().meldung.speichern({ schauId, aussteller: { ...leer, vorname: "Sepa", nachname: "Verwaltung", geburtsdatum: null, iban: "DE89370400440532013000", kontoinhaber: "Sepa V." }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    const [mel] = await m.db.select().from(m.schema.meldung).where(m.eq(m.schema.meldung.id, r.meldungId));
    const aid = mel!.ausstellerId;
    // Dieselbe Person auch in einer abgeschlossenen Schau mit Katalognummer (Aufbewahrungsfrist läuft).
    const r2 = await al().meldung.speichern({ schauId: altId, aussteller: { ...leer, id: aid, vorname: "Sepa", nachname: "Verwaltung", geburtsdatum: null, iban: "DE89370400440532013000", kontoinhaber: "Sepa V." }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await m.db.update(m.schema.katalogeintrag).set({ katalogNr: 1 }).where(m.eq(m.schema.katalogeintrag.meldungId, r2.meldungId));
    await m.db.update(m.schema.schau).set({ phase: "abgeschlossen" }).where(m.eq(m.schema.schau.id, altId));
    const { oeffentlicherStand } = await import("../services/zwischenspeicher");
    const standAlt = (await oeffentlicherStand(altId)).schluessel;

    // Veraltetes Formular: jemand ändert inzwischen die IBAN über die Meldung – das alte Formular überschreibt sie nicht.
    const { id: _i, mitglied: m0, ...felder } = await al().verein.ausstellerDaten({ id: aid });
    await al().meldung.speichern({ schauId, meldungId: r.meldungId, aussteller: { ...leer, id: aid, vorname: "Sepa", nachname: "Verwaltung", geburtsdatum: null, iban: "DE02120300000000202051", kontoinhaber: "Sepa V." }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    await expect(al().verein.ausstellerSpeichern({ id: aid, daten: { ...felder, telefon: "0361 1" }, vorher: { ...felder, mitglied: m0 } })).rejects.toThrow("inzwischen geändert");
    expect((await al().verein.ausstellerDaten({ id: aid })).iban).toBe("DE02120300000000202051");

    // Ort ändern: im Protokoll der laufenden und der abgeschlossenen Schau; deren Online-Katalog ist damit sofort neu.
    await bearbeite(aid, { ort: "Musterstadt" });
    const eintraege = (await protokoll(aid, ab)).filter((x) => x.aktion === "Stammdaten geändert (Aussteller-Verwaltung)");
    expect(eintraege.map((x) => x.schauId).sort()).toEqual([null, schauId, altId].sort());
    expect((await oeffentlicherStand(altId)).schluessel).not.toBe(standAlt);
    // Nur Mitglied umgestellt: nur im Vereinsprotokoll, kein Neubau öffentlicher Seiten.
    const standVorher = (await oeffentlicherStand(schauId)).schluessel;
    await bearbeite(aid, {}, "ja");
    expect((await oeffentlicherStand(schauId)).schluessel).toBe(standVorher);
    expect((await protokoll(aid, ab)).filter((x) => (x.neu as { mitglied?: string } | null)?.mitglied === "ja").map((x) => x.schauId)).toEqual([null]);

    // Offene SEPA-Datei mit diesem Aussteller: Bankdaten gesperrt, anderes geht.
    await m.db.insert(m.schema.sepaLauf).values({ schauId, nachrichtId: `test-verwaltung-${aid}`, daten: { posten: [{ ausstellerId: aid, betragCent: 100 }] } });
    await expect(bearbeite(aid, { iban: "DE89370400440532013000" })).rejects.toThrow("offenen SEPA-Datei");
    await expect(bearbeite(aid, { kontoinhaber: "Jemand anders" })).rejects.toThrow("offenen SEPA-Datei");
    await bearbeite(aid, { telefon: "0361 1" });
    expect(await al().verein.ausstellerDaten({ id: aid })).toMatchObject({ iban: "DE02120300000000202051", telefon: "0361 1" });
    await m.db.update(m.schema.sepaLauf).set({ status: "verworfen" }).where(m.eq(m.schema.sepaLauf.schauId, schauId));
    await bearbeite(aid, { iban: "DE89370400440532013000" });
    expect((await al().verein.ausstellerDaten({ id: aid })).iban).toBe("DE89370400440532013000");

    // Löschwunsch: laufende Meldung storniert, Frist läuft (abgeschlossene Schau) – gesperrt, Mitglied-Kennzeichen weg,
    // nicht mehr zu bearbeiten; Telefon steht nirgends im Protokoll.
    await m.db.update(m.schema.meldung).set({ status: "storniert" }).where(m.eq(m.schema.meldung.id, r.meldungId));
    const los = await al().verein.ausstellerLoeschen({ id: aid, grund: "Test Verwaltung gesperrt" });
    expect(los.art).toBe("gesperrt");
    const [gesperrt] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, aid));
    expect(gesperrt).toMatchObject({ mitglied: null, telefon: "" });
    await expect(al().verein.ausstellerDaten({ id: aid })).rejects.toThrow("gesperrt");
    await expect(bearbeite(aid, {})).rejects.toThrow("gesperrt");
    expect(JSON.stringify(await protokoll(aid, ab))).not.toContain("0361 1");
    expect((await al().verein.aussteller({ q: "Sepa", filter: "gesperrt", gruppe: "externe" })).map((x) => x.id)).toContain(aid);

    // Endgültig gelöscht (ohne Frist): Mitglied-Kennzeichen weg, in „Gelöscht“ zu finden.
    const weg = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Weg", nachname: "Verwaltung" }, mitglied: "ja" });
    await al().verein.ausstellerLoeschen({ id: weg.id, grund: "Test Verwaltung" });
    await expect(al().verein.ausstellerDaten({ id: weg.id })).rejects.toThrow("gesperrt");
    const [geloescht] = await m.db.select().from(m.schema.aussteller).where(m.eq(m.schema.aussteller.id, weg.id));
    expect(geloescht!.mitglied).toBeNull();
    expect((await al().verein.aussteller({ q: "", filter: "geloescht", gruppe: "externe" })).map((x) => x.id)).toContain(weg.id);
  });

  test("über die Meldung geändert: Kontoinhaber, Telefon und E-Mail stehen nicht im Protokoll, die IBAN nur gekürzt", async () => {
    const { id: schauId } = await al().schau.anlegen({ name: "Maske Schau", ort: "Halle" });
    const s = await al().schau.get({ id: schauId });
    const [farbe] = await al().stammdaten.suche({ versionId: s.stammdatenVersionId!, q: "Wyandotten" });
    const pos = { farbenschlagId: farbe!.id, freitext: "", art: "einzeltier" as const, geschlecht: "1,0", alter: "jung" as const, istAoc: false, istNeuzuechtung: false, eigeneZucht: true, verkaufspreisCent: null };
    const vorher = await al().verein.ausstellerSpeichern({ daten: { ...leer, vorname: "Mia", nachname: "Maske", telefon: "0170 1112223", email: "mia.alt@test.de", kontoinhaber: "Mia Altkonto" }, trotzdem: true });
    const [{ ab }] = (await m.sql`select coalesce(max(id), 0)::int as ab from aenderung`) as unknown as [{ ab: number }];
    const neu = { telefon: "0170 9998887", email: "mia.neu@test.de", iban: "DE89 3704 0044 0532 0130 00", kontoinhaber: "Mia Neukonto" };
    await al().meldung.speichern({ schauId, aussteller: { ...leer, id: vorher.id, vorname: "Mia", nachname: "Maske", geburtsdatum: null, ...neu }, eingang: "papier", istJugend: false, bemerkung: "", zustimmung: true, positionen: [pos] });
    const p = (await protokoll(vorher.id, ab)).find((x) => x.aktion === "Stammdaten geändert");
    expect(p).toBeDefined();
    const text = JSON.stringify([p!.alt, p!.neu]);
    for (const klar of ["0170 1112223", "0170 9998887", "mia.alt@test.de", "mia.neu@test.de", "Mia Altkonto", "Mia Neukonto", "DE89"]) expect(text).not.toContain(klar);
    expect(p!.neu).toMatchObject({ telefon: "(angegeben)", email: "(angegeben)", kontoinhaber: "(angegeben)", iban: "…3000" });
    expect(p!.alt).toMatchObject({ telefon: "(angegeben)", email: "(angegeben)", kontoinhaber: "(angegeben)", iban: "" });
  });
});
