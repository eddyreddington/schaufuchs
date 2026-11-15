/** Vereinsverzeichnis: einspielen (nur Namen, nichts überschrieben, Prüfung auf Kontaktdaten, Protokoll) und Vorschläge in Verwaltung und öffentlicher Meldung (eigene Angaben gehen vor). Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { adminKontext, leer, m } from "./kontext";

describe("Vereinsverzeichnis", () => {
  test("einspielen: bereinigt, ohne Doppelte, Kontaktdaten und Übergroßes abgelehnt, mit Protokoll", async () => {
    const { vereineEinspielen } = await import("../services/vereinsverzeichnis");
    const r = await vereineEinspielen(
      [
        { name: "RGZV Verzeichnisdorf 1899", kreisverband: "KV Probe", landesverband: "LV Sachsen", quelle: "https://beispiel.test/vereine", telefon: "0123", vorsitz: "Max Muster" },
        { name: "  GZV ‮  Zweitort\u0007 ", kreisverband: "KV Probe", landesverband: "LV Sachsen", quelle: "javascript:alert(1)" },
        { name: "KTZV Neustadt", kreisverband: "KV Nord", landesverband: "LV A", quelle: "" },
        { name: "KTZV Neustadt", kreisverband: "KV Süd", landesverband: "LV B", quelle: "" },
        { name: "RGZV ÖHRINGEN-Süd", kreisverband: "KV ÜBERLINGEN", landesverband: "", quelle: "" },
        { name: "rgzv öhringen süd", kreisverband: "kv überlingen", landesverband: "", quelle: "" },
        { name: "x", kreisverband: "", landesverband: "", quelle: "" },
        { name: "GZV Telefonverein Tel. 0361 123456", kreisverband: "", landesverband: "", quelle: "" },
        { name: "GZV Kontakt info@verein.test", kreisverband: "", landesverband: "", quelle: "" },
        { name: "G".repeat(150), kreisverband: "", landesverband: "", quelle: "" },
      ],
      { datei: "probe.json" },
    );
    expect({ ...r, abgelehnt: r.abgelehnt.map((a) => a.zeile) }).toEqual({ angeboten: 10, neu: 5, schonVorhanden: 0, doppeltInDatei: 1, abgelehnt: [7, 8, 9, 10] });
    // Nochmal, anders geschrieben: nichts überschrieben, nichts doppelt.
    const r2 = await vereineEinspielen([{ name: "rgzv verzeichnisdorf 1899", kreisverband: "kv probe", landesverband: "anders", quelle: "" }]);
    expect([r2.neu, r2.schonVorhanden]).toEqual([0, 1]);
    const zeilen = await m.sql`select name, kreisverband, landesverband, quelle from vereinsverzeichnis where name ilike '%Verzeichnisdorf%' or name ilike '%Zweitort%' order by name`;
    expect([...zeilen]).toEqual([
      { name: "GZV Zweitort", kreisverband: "KV Probe", landesverband: "LV Sachsen", quelle: "" },
      { name: "RGZV Verzeichnisdorf 1899", kreisverband: "KV Probe", landesverband: "LV Sachsen", quelle: "https://beispiel.test/vereine" },
    ]);
    // Nur die vorgesehenen Felder – keine Personen oder Telefonnummern.
    const spalten = (await m.sql`select column_name from information_schema.columns where table_name = 'vereinsverzeichnis' order by ordinal_position`).map((x) => x.column_name);
    expect([...spalten].sort()).toEqual(["created_at", "id", "kreisverband", "landesverband", "name", "quelle", "schluessel"]);
    const prot = (await m.db.select().from(m.schema.aenderung)).filter((p) => p.tabelle === "vereinsverzeichnis").sort((a, b) => a.id - b.id);
    expect(prot[0]!.neu).toMatchObject({ datei: "probe.json", neu: 5, abgelehnt: 4, eingefuegt: expect.arrayContaining(["RGZV Verzeichnisdorf 1899 (KV Probe)"]) });
  });

  test("Vorschläge: eigene Schreibweise und eigener Kreisverband gehen vor, das Verzeichnis ergänzt", async () => {
    const { vereineEinspielen } = await import("../services/vereinsverzeichnis");
    const al = m.appRouter.createCaller(adminKontext);
    // Ein eigener Aussteller mit eigener Schreibweise und eigenem Kreisverband.
    await al.verein.ausstellerSpeichern({ daten: { vorname: "Eigen", nachname: "Schreibweise", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "GZV Eigenort 1900", kreisverband: "KV Eigen", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" } });
    await vereineEinspielen([{ name: "gzv eigenort 1900", kreisverband: "Kreisverband Eigen", landesverband: "", quelle: "" }]);
    const v = await al.meldung.adressVorschlaege();
    expect(v.vereine.filter((x) => x.verein.toLowerCase().startsWith("gzv eigenort"))).toEqual([{ verein: "GZV Eigenort 1900", kreisverband: "KV Eigen" }]);
    expect(v.vereine).toContainEqual({ verein: "RGZV Verzeichnisdorf 1899", kreisverband: "KV Probe" });
    // Gleicher Name in zwei Kreisen: ohne Kreisverband.
    expect(v.vereine).toContainEqual({ verein: "KTZV Neustadt", kreisverband: "" });
    expect(v.kreisverbaende).toContain("KV Eigen");
    // Öffentliche Meldeseite: auch dort als Vorschlag.
    const schauen = await al.schau.liste();
    const offen = schauen.find((s) => s.phase === "meldung" && !s.test) ?? schauen[0]!;
    const seite = await m.appRouter.createCaller(leer).oeffentlich.schau({ slug: offen.slug });
    expect(seite.vereine.map((x) => x.verein)).toContain("GZV Zweitort");
  });
});
