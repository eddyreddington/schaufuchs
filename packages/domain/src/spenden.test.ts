import { describe, expect, test } from "bun:test";
import { bescheidSperre, bestaetigungsSperren, sammelbestaetigung, spenderName, STEUER_VORGABE, steuerstatusLesen, type SpendeFuerBestaetigung } from "./spenden";

const verein = { ...STEUER_VORGABE, gemeinnuetzig: true, bescheidArt: "freistellung" as const, finanzamt: "Musterstadt", steuernummer: "12/345/67890", bescheidDatum: "2024-03-15", veranlagungszeitraum: "2022", zwecke: "Förderung der Tierzucht" };
const spender = { istFirma: false, vorname: "Karla", nachname: "Muster", strasse: "Lindenweg 12", plz: "12345", ort: "Musterdorf" };
const geld = (teil: Partial<SpendeFuerBestaetigung> = {}): SpendeFuerBestaetigung => ({ id: 1, art: "geld", betragCent: 10_000, datum: "2026-11-14", gegenleistung: false, verzichtAufwand: false, storniert: false, bestaetigt: false, sache: null, ...teil });

describe("Freistellungsbescheid", () => {
  test("Bescheid höchstens fünf Jahre alt, Feststellung nach § 60a AO höchstens drei", () => {
    expect(bescheidSperre(verein, "2029-03-15")).toBeNull();
    expect(bescheidSperre(verein, "2029-03-16")).toMatch(/älter als fünf Jahre/);
    const fest = { ...verein, bescheidArt: "feststellung60a" as const, bescheidDatum: "2024-03-15" };
    expect(bescheidSperre(fest, "2027-03-15")).toBeNull();
    expect(bescheidSperre(fest, "2027-03-16")).toMatch(/älter als drei Jahre/);
  });

  test("Nicht gemeinnützig oder Angaben fehlen: gesperrt", () => {
    expect(bescheidSperre({ ...verein, gemeinnuetzig: false }, "2026-11-15")).toMatch(/nicht als gemeinnützig/);
    expect(bescheidSperre({ ...verein, steuernummer: "" }, "2026-11-15")).toMatch(/Steuernummer/);
    expect(bescheidSperre({ ...verein, bescheidDatum: null }, "2026-11-15")).toMatch(/Datum des Bescheids/);
    expect(bescheidSperre({ ...verein, zwecke: " " }, "2026-11-15")).toMatch(/Zweck/);
    // Ein Bescheid aus der Zukunft ist ein Tippfehler.
    expect(bescheidSperre({ ...verein, bescheidDatum: "2027-01-01" }, "2026-11-15")).toMatch(/Zukunft/);
  });

  test("Einlesen begrenzt und ergänzt Fehlendes", () => {
    expect(steuerstatusLesen(undefined)).toEqual(STEUER_VORGABE);
    const s = steuerstatusLesen({ gemeinnuetzig: true, bescheidArt: "irgendwas", bescheidDatum: "15.03.2024", zwecke: "x".repeat(2000) });
    expect(s.gemeinnuetzig).toBe(true);
    expect(s.bescheidArt).toBe("freistellung");
    expect(s.bescheidDatum).toBeNull();
    expect(s.zwecke).toHaveLength(1000);
  });
});

describe("Sperren einer Zuwendungsbestätigung", () => {
  test("Gültige Geldzuwendung: keine Sperre", () => {
    expect(bestaetigungsSperren(geld(), spender, verein, "2026-11-15")).toEqual([]);
  });

  test("Gegenleistung, Storno, schon bestätigt, nicht eingegangen", () => {
    expect(bestaetigungsSperren(geld({ gegenleistung: true }), spender, verein, "2026-11-15").join()).toMatch(/Gegenleistung/);
    expect(bestaetigungsSperren(geld({ storniert: true }), spender, verein, "2026-11-15").join()).toMatch(/storniert/);
    expect(bestaetigungsSperren(geld({ bestaetigt: true }), spender, verein, "2026-11-15").join()).toMatch(/schon bestätigt/);
    expect(bestaetigungsSperren(geld({ datum: null }), spender, verein, "2026-11-15").join()).toMatch(/noch nicht eingegangen/);
  });

  test("Anschrift des Spenders muss vollständig sein", () => {
    expect(bestaetigungsSperren(geld(), { ...spender, strasse: "" }, verein, "2026-11-15").join()).toMatch(/Anschrift/);
  });

  test("Sachzuwendung braucht Bezeichnung und Wert", () => {
    const sache = geld({ art: "sache", sache: { bezeichnung: "", herkunft: "privat", unterlagen: true } });
    expect(bestaetigungsSperren(sache, spender, verein, "2026-11-15").join()).toMatch(/Bezeichnung/);
    const ohneWert = geld({ art: "sache", betragCent: 0, sache: { bezeichnung: "Futtersack 25 kg, neu", herkunft: "privat", unterlagen: true } });
    expect(bestaetigungsSperren(ohneWert, spender, verein, "2026-11-15").join()).toMatch(/Wert/);
  });

  test("Bescheid zu alt sperrt jede Bestätigung", () => {
    expect(bestaetigungsSperren(geld(), spender, verein, "2030-01-01").join()).toMatch(/älter als fünf Jahre/);
  });
});

describe("Sammelbestätigung", () => {
  test("Nur Geldzuwendungen eines Kalenderjahres, die bestätigt werden dürfen; Summe und Verzicht", () => {
    const spenden = [
      geld({ id: 1, betragCent: 5000, datum: "2026-03-01" }),
      geld({ id: 2, betragCent: 2500, datum: "2026-11-14", verzichtAufwand: true }),
      geld({ id: 3, betragCent: 9900, datum: "2025-12-31" }),
      geld({ id: 4, betragCent: 1000, datum: "2026-05-01", bestaetigt: true }),
      geld({ id: 5, betragCent: 1000, datum: "2026-05-02", gegenleistung: true }),
      geld({ id: 6, art: "sache", betragCent: 3000, datum: "2026-06-01", sache: { bezeichnung: "Käfig", herkunft: "privat", unterlagen: true } }),
      geld({ id: 7, betragCent: 700, datum: null }),
    ];
    const s = sammelbestaetigung(spenden, 2026);
    expect(s.spenden.map((x) => x.id)).toEqual([1, 2]);
    expect(s.summeCent).toBe(7500);
    expect(s.ausgelassen.map((x) => x.id)).toEqual([4, 5, 6, 7]);
  });
});

test("Name des Spenders", () => {
  expect(spenderName(spender)).toBe("Karla Muster");
  expect(spenderName({ istFirma: true, vorname: "", nachname: "Musterbau GmbH" })).toBe("Musterbau GmbH");
});
