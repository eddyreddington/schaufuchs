import { describe, expect, test } from "bun:test";
import { gleicheAb, kommendeSchauen, TERMINE_KEINE, leseIcal, schauTage, schreibeIcal, verbandSchluessel, zeitraumDe, type GespeicherterTermin, type KommenderTermin } from "./kommende-schauen";

const t = (x: Partial<KommenderTermin> & Pick<KommenderTermin, "name" | "von" | "ebene">): KommenderTermin => ({ ort: "", bis: null, kreisverband: "", landesverband: "", quelle: "eigene Eintragung", ...x });

describe("Tage der eigenen Schau", () => {
  test("aus Daten in den Öffnungszeiten, auch ohne Jahr und über den Jahreswechsel", () => {
    expect(schauTage("2026-12-11", "Sa. 12.12.2026 9–18 Uhr; So. 13.12.2026 9–15 Uhr")).toEqual({ von: "2026-12-12", bis: "2026-12-13" });
    expect(schauTage("2026-12-11", "Samstag, 12.12., 9–18 Uhr\nSonntag, 13.12., 9–15 Uhr")).toEqual({ von: "2026-12-12", bis: "2026-12-13" });
    expect(schauTage("2026-12-31", "Fr. 1.1. 10–16 Uhr; Sa. 2.1. 9–15 Uhr")).toEqual({ von: "2027-01-01", bis: "2027-01-02" });
  });
  test("aus Wochentagen nach dem Bewertungstag", () => {
    // 11.12.2026 ist ein Freitag.
    expect(schauTage("2026-12-11", "Sa. 9–18 Uhr; So. 9–15 Uhr")).toEqual({ von: "2026-12-12", bis: "2026-12-13" });
    expect(schauTage("2026-12-11", "Freitag 15–18 Uhr\nSamstag 9–18 Uhr\nSonntag 9–15 Uhr")).toEqual({ von: "2026-12-12", bis: "2026-12-18" });
  });
  test("ohne Angaben der Bewertungstag, ohne Bewertungstag nichts", () => {
    expect(schauTage("2026-12-11", "")).toEqual({ von: "2026-12-11", bis: "2026-12-11" });
    expect(schauTage("2026-12-11", "durchgehend geöffnet")).toEqual({ von: "2026-12-11", bis: "2026-12-11" });
    expect(schauTage(null, "Sa. 9–18 Uhr")).toBeNull();
    expect(schauTage(null, "Sa. 12.12.2026 9–18 Uhr")).toEqual({ von: "2026-12-12", bis: "2026-12-12" });
  });
});

describe("Auswahl für den Katalog", () => {
  const termine = [
    t({ name: "Kreisschau Musterstadt", von: "2026-12-19", ebene: "kreis", kreisverband: "KV Musterkreis" }),
    t({ name: "Kreisschau Leipzig", von: "2026-12-19", ebene: "kreis", kreisverband: "Kreisverband Leipzig e.V." }),
    t({ name: "Unsere Jungtierschau", von: "2027-10-02", ebene: "kreis", eigene: true }),
    t({ name: "LV-Schau Hessen", von: "2027-01-09", ebene: "land", landesverband: "LV Hessen" }),
    t({ name: "LV-Schau Sachsen", von: "2026-12-04", ebene: "land", landesverband: "Sachsen" }),
    t({ name: "Nationale", von: "2026-12-04", bis: "2026-12-06", ebene: "bund" }),
    t({ name: "VDT-Schau", von: "2026-12-18", bis: "2026-12-20", ebene: "bund" }),
    t({ name: "Vorbei", von: "2026-11-01", ebene: "bund" }),
    t({ name: "Gleichzeitig", von: "2026-11-29", ebene: "bund" }),
    t({ name: "Europaschau", von: "2028-11-16", ebene: "europa" }),
  ];

  test("nur nach der eigenen Schau, sortiert nach Ebene und Datum", () => {
    const r = kommendeSchauen(termine, { nach: "2026-11-29", kreis: "", land: "" });
    expect(r.map((g) => g.ebene)).toEqual(["kreis", "land", "bund", "europa"]);
    expect(r.find((g) => g.ebene === "bund")!.termine.map((x) => x.name)).toEqual(["Nationale", "VDT-Schau"]);
    expect(r.find((g) => g.ebene === "kreis")!.termine.map((x) => x.name)).toEqual(["Kreisschau Leipzig", "Kreisschau Musterstadt", "Unsere Jungtierschau"]);
  });

  test("Kreis und Land wählen: nur deren Schauen, eigene Schauen bleiben, Schreibweisen egal", () => {
    const r = kommendeSchauen(termine, { nach: "2026-11-29", kreis: "Leipzig", land: "Hessen" });
    expect(r.find((g) => g.ebene === "kreis")!.termine.map((x) => x.name)).toEqual(["Kreisschau Leipzig", "Unsere Jungtierschau"]);
    expect(r.find((g) => g.ebene === "land")!.termine.map((x) => x.name)).toEqual(["LV-Schau Hessen"]);
    expect(r.find((g) => g.ebene === "bund")!.termine).toHaveLength(2);
    expect(verbandSchluessel("Kreisverband der Rassegeflügelzüchter Leipzig e. V.")).toBe(verbandSchluessel("KV Leipzig"));
    expect(verbandSchluessel("LV Hessen")).toBe(verbandSchluessel("Hessen"));
  });

  test("„keine“: Kreis- bzw. Landesschauen ganz weglassen, auch die eigenen", () => {
    const ohneLand = kommendeSchauen(termine, { nach: "2026-11-29", kreis: "", land: TERMINE_KEINE });
    expect(ohneLand.map((g) => g.ebene)).toEqual(["kreis", "bund", "europa"]);
    const ohneBeide = kommendeSchauen(termine, { nach: "2026-11-29", kreis: TERMINE_KEINE, land: TERMINE_KEINE });
    expect(ohneBeide.map((g) => g.ebene)).toEqual(["bund", "europa"]);
  });

  test("je Ebene gekürzt, doppelte Einträge einmal, leere Ebenen fehlen", () => {
    const viele = Array.from({ length: 14 }, (_, i) => t({ name: `Schau ${i}`, von: `2027-01-${String(i + 1).padStart(2, "0")}`, ebene: "bund" }));
    const r = kommendeSchauen([...viele, t({ name: "schau 0", von: "2027-01-01", ebene: "bund", quelle: "anderer Kalender" })], { nach: "2026-12-31", kreis: "", land: "", jeEbene: 10 });
    expect(r).toHaveLength(1);
    expect(r[0]!.termine).toHaveLength(10);
    expect(r[0]!.gekuerzt).toBe(4);
    expect(kommendeSchauen(termine, { nach: "2030-01-01", kreis: "", land: "" })).toEqual([]);
  });

  test("Zeitraum in Worten", () => {
    expect(zeitraumDe("2026-12-04", "2026-12-06")).toBe("4.–6. Dezember 2026");
    expect(zeitraumDe("2026-11-30", "2026-12-02")).toBe("30. November – 2. Dezember 2026");
    expect(zeitraumDe("2026-12-31", "2027-01-01")).toBe("31. Dezember 2026 – 1. Januar 2027");
    expect(zeitraumDe("2027-01-02", null)).toBe("2. Januar 2027");
  });
});

describe("iCal", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:abc@kv-musterkreis",
    "DTSTART;VALUE=DATE:20261205",
    "DTEND;VALUE=DATE:20261207",
    "SUMMARY:Kreisschau Musterstadt\\, mit Jugend",
    "LOCATION:Mehrzweckhalle\\, Musterstadt",
    "URL:https://kv-musterkreis.example/schau",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:zeit@kv",
    'DTSTART;TZID="Europe/Berlin":20270109T090000',
    "DTEND;TZID=Europe/Berlin:20270110T160000",
    "SUMMARY:Lokalschau mit sehr langem Namen, der über mehrere Zeilen gefaltet",
    "  wird",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:utc@kv",
    "DTSTART:20261231T233000Z",
    "SUMMARY:Silvester",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:abgesagt",
    "DTSTART;VALUE=DATE:20261212",
    "STATUS:CANCELLED",
    "SUMMARY:Abgesagt",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:jede-woche",
    "DTSTART;VALUE=DATE:20261212",
    "RRULE:FREQ=WEEKLY",
    "SUMMARY:Stammtisch",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261299",
    "SUMMARY:Kaputt",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  test("lesen: ganztägig (Ende ausschließlich), Uhrzeit, UTC, Faltung, Escapes; ohne Abgesagte, Wiederholungen, Kaputte", () => {
    expect(leseIcal(ics)).toEqual([
      { uid: "abc@kv-musterkreis", name: "Kreisschau Musterstadt, mit Jugend", ort: "Mehrzweckhalle, Musterstadt", von: "2026-12-05", bis: "2026-12-06", url: "https://kv-musterkreis.example/schau" },
      { uid: "zeit@kv", name: "Lokalschau mit sehr langem Namen, der über mehrere Zeilen gefaltet wird", ort: "", von: "2027-01-09", bis: "2027-01-10", url: "" },
      // 23:30 UTC am 31.12. ist in Deutschland schon der 1.1.
      { uid: "utc@kv", name: "Silvester", ort: "", von: "2027-01-01", bis: null, url: "" },
    ]);
    expect(leseIcal("kein Kalender")).toEqual([]);
  });

  test("schreiben und wieder lesen ergibt dieselben Termine; lange Zeilen gefaltet, ohne Umlaute zu zerteilen", () => {
    const termine = [
      { uid: "schau-1@test", name: "Kreisschau; mit Jugend, Ziergeflügel und Tauben – großer Name für die Faltung über 75 Byte hinaus", ort: "Halle\nNord", von: "2026-12-12", bis: "2026-12-13", url: "https://schau.example/s/kreisschau" },
      { uid: "schau-2@test", name: "Eintägig", ort: "", von: "2027-01-02", bis: null },
    ];
    const text = schreibeIcal({ name: "Schauen GZV", prodid: "-//SchauFUCHS//DE" }, termine, new Date("2026-11-13T10:00:00Z"));
    expect(text).toContain("DTSTAMP:20261113T100000Z");
    expect(text).toContain("DTEND;VALUE=DATE:20261214");
    for (const zeile of text.split("\r\n")) expect(new TextEncoder().encode(zeile).length).toBeLessThanOrEqual(75);
    expect(leseIcal(text)).toEqual([
      { uid: "schau-1@test", name: termine[0]!.name, ort: "Halle Nord", von: "2026-12-12", bis: "2026-12-13", url: "https://schau.example/s/kreisschau" },
      { uid: "schau-2@test", name: "Eintägig", ort: "", von: "2027-01-02", bis: null, url: "" },
    ]);
  });
});

describe("Abgleich mit einem abonnierten Kalender", () => {
  const g = (x: Partial<GespeicherterTermin> & Pick<GespeicherterTermin, "id" | "uid" | "status">): GespeicherterTermin => ({ name: "Schau", ort: "", von: "2026-12-05", bis: null, ...x });
  const i = (uid: string, x: Partial<{ name: string; ort: string; von: string; bis: string | null }> = {}) => ({ uid, name: "Schau", ort: "", von: "2026-12-05", bis: null, url: "", ...x });

  test("neu wird Vorschlag, Vorschläge folgen der Quelle, Übernommenes wird nie überschrieben", () => {
    const r = gleicheAb(
      [
        g({ id: 1, uid: "a", status: "vorschlag" }),
        g({ id: 2, uid: "b", status: "uebernommen" }),
        g({ id: 3, uid: "c", status: "uebernommen" }),
        g({ id: 4, uid: "d", status: "verworfen" }),
        g({ id: 5, uid: "weg-v", status: "vorschlag" }),
        g({ id: 6, uid: "weg-u", status: "uebernommen" }),
        g({ id: 7, uid: "alt", status: "uebernommen", von: "2026-10-01" }),
      ],
      [i("a", { ort: "Musterstadt" }), i("b", { von: "2026-12-06" }), i("c"), i("d", { name: "Anders" }), i("neu"), i("neu-alt", { von: "2026-10-01" })],
      "2026-11-13",
    );
    expect(r.neu.map((x) => x.uid)).toEqual(["neu"]);
    expect(r.vorschlagAktualisieren).toEqual([{ id: 1, termin: i("a", { ort: "Musterstadt" }) }]);
    expect(r.vorschlagEntfernen).toEqual([5]);
    expect(r.abweichung).toEqual([
      { id: 2, abweichung: { name: "Schau", ort: "", von: "2026-12-06", bis: null } },
      { id: 6, abweichung: { entfallen: true } },
    ]);
    expect(r.abweichungErledigt).toEqual([3]);
  });
});
