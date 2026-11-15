import { describe, expect, test } from "bun:test";
import { ABMELDUNG_VORGABE, abmeldungLesen, letzteEingabe, untaetigAbgelaufen } from "./abmeldung";

const t = (min: number) => new Date(Date.UTC(2026, 10, 15, 10, 0) + min * 60_000);

describe("Automatische Abmeldung", () => {
  test("Einstellung lesen: nur die angebotenen Minuten, sonst Vorgabe", () => {
    expect(abmeldungLesen(null)).toEqual(ABMELDUNG_VORGABE);
    expect(abmeldungLesen({ admin: 5, mitarbeiter: 30, preisrichter: 120 })).toEqual({ admin: 5, mitarbeiter: 30, preisrichter: 120 });
    expect(abmeldungLesen({ admin: 7, mitarbeiter: "30", preisrichter: 10 })).toEqual({ ...ABMELDUNG_VORGABE, preisrichter: 10 });
  });

  test("letzte Eingabe: Angabe der Oberfläche zählt, aber nie zurück und nie in die Zukunft", () => {
    expect(letzteEingabe(t(0), t(20), 5 * 60_000)).toEqual(t(15));
    expect(letzteEingabe(t(18), t(20), 5 * 60_000)).toEqual(t(18));
    expect(letzteEingabe(t(0), t(20), -60_000)).toEqual(t(20));
    expect(letzteEingabe(t(0), t(20), undefined)).toEqual(t(20));
    expect(letzteEingabe(t(0), t(20), Number.NaN)).toEqual(t(20));
  });

  test("abgelaufen erst nach Frist plus Kulanz", () => {
    expect(untaetigAbgelaufen(t(0), t(15), 15)).toBe(false);
    expect(untaetigAbgelaufen(t(0), t(16), 15)).toBe(false);
    expect(untaetigAbgelaufen(t(0), t(17), 15)).toBe(true);
    expect(untaetigAbgelaufen(t(0), t(119), 120)).toBe(false);
  });
});
