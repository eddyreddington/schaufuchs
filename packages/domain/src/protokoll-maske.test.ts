import { expect, test } from "bun:test";
import { stammdatumImProtokoll } from "./datenschutz";

test("Stammdaten im Protokoll: IBAN gekürzt; Kontoinhaber, Telefon, E-Mail, Geburtsdatum nur „angegeben“", () => {
  expect(stammdatumImProtokoll("iban", "DE89370400440532013000")).toBe("…3000");
  for (const feld of ["kontoinhaber", "telefon", "email", "geburtsdatum"]) {
    expect(stammdatumImProtokoll(feld, "Erika Beispiel")).toBe("(angegeben)");
    expect(stammdatumImProtokoll(feld, "")).toBe("");
  }
  expect(stammdatumImProtokoll("iban", "")).toBe("");
  // Was bei Löschwünschen nicht sofort verschwindet (Name, Anschrift, Verein), steht wie es ist.
  expect(stammdatumImProtokoll("nachname", "Beispiel")).toBe("Beispiel");
  expect(stammdatumImProtokoll("ort", "Musterdorf")).toBe("Musterdorf");
});
