import { describe, expect, test } from "bun:test";
import { veterinaeramtSuchen, veterinaeramtText, veterinaeramtZurSchau, type Veterinaeramt } from "./veterinaeramt";

const amt = (kreis: string, amtName: string, ort: string, art: Veterinaeramt["art"] = "Landkreis", land = "Musterland"): Veterinaeramt => ({
  land,
  kreis,
  art,
  amt: amtName,
  strasse: "Musterstraße 1",
  plz: "99999",
  ort,
  telefon: "",
  email: "",
  quelle: "https://example.invalid",
  gemeinsam: "",
});

const LISTE: Veterinaeramt[] = [
  amt("Musterkreis", "Landratsamt Musterkreis – Veterinär- und Lebensmittelüberwachungsamt", "Musterkreis"),
  amt("Schmalkalden-Meiningen", "Landratsamt Schmalkalden-Meiningen – Veterinäramt", "Meiningen"),
  amt("Erfurt", "Stadtverwaltung Erfurt – Veterinär- und Lebensmittelüberwachungsamt", "Erfurt", "kreisfreie Stadt"),
  amt("Vogelsbergkreis", "Kreisausschuss des Vogelsbergkreises – Veterinärwesen", "Lauterbach", "Landkreis", "Hessen"),
  amt("Göttingen", "Landkreis Göttingen – Veterinäramt", "Göttingen", "Landkreis", "Niedersachsen"),
];

describe("Veterinärämter", () => {
  test("Suche nach Kreis, Ort oder Amt, ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute", () => {
    expect(veterinaeramtSuchen(LISTE, "musterkreis").map((e) => e.kreis)).toEqual(["Musterkreis"]);
    expect(veterinaeramtSuchen(LISTE, "meiningen").map((e) => e.kreis)).toEqual(["Schmalkalden-Meiningen"]);
    expect(veterinaeramtSuchen(LISTE, "goettingen").map((e) => e.kreis)).toEqual(["Göttingen"]);
    expect(veterinaeramtSuchen(LISTE, "Vogelsberg").map((e) => e.kreis)).toEqual(["Vogelsbergkreis"]);
  });

  test("Treffer am Wortanfang des Kreises vor Treffern mitten im Text; leere Suche ergibt nichts", () => {
    const l = [...LISTE, amt("Erfurter Land", "Amt X", "Musterkreis")];
    expect(veterinaeramtSuchen(l, "erfurt").map((e) => e.kreis)).toEqual(["Erfurt", "Erfurter Land"]);
    expect(veterinaeramtSuchen(LISTE, "  ")).toEqual([]);
    expect(veterinaeramtSuchen(LISTE, "a", 2)).toHaveLength(2);
  });

  test("mehrere Wörter müssen alle passen", () => {
    expect(veterinaeramtSuchen(LISTE, "landratsamt veterinäramt").map((e) => e.kreis)).toEqual(["Schmalkalden-Meiningen"]);
  });

  test("Text für das Feld: Amt, Anschrift", () => {
    expect(veterinaeramtText(LISTE[0]!)).toBe("Landratsamt Musterkreis – Veterinär- und Lebensmittelüberwachungsamt, Musterstraße 1, 99999 Musterkreis");
    expect(veterinaeramtText({ ...LISTE[0]!, strasse: "", plz: "" })).toBe("Landratsamt Musterkreis – Veterinär- und Lebensmittelüberwachungsamt, Musterkreis");
  });

  test("Vorschlag zur Schau aus Ort und Anschrift der Halle", () => {
    expect(veterinaeramtZurSchau(LISTE, "Mehrzweckhalle, Str. 5, 12345 Musterdorf (Landkreis Musterkreis)")?.kreis).toBe("Musterkreis");
    expect(veterinaeramtZurSchau(LISTE, "Messe Erfurt")?.kreis).toBe("Erfurt");
    expect(veterinaeramtZurSchau(LISTE, "Turnhalle Musterdorf")).toBeNull();
    expect(veterinaeramtZurSchau(LISTE, "")).toBeNull();
  });

  test("Vorsätze wie „Landkreis“, „Kreis“, „Stadt“ im Kreisnamen zählen beim Vorschlag nicht", () => {
    const l = [amt("Landkreis Böblingen", "Landratsamt Böblingen – Veterinäramt", "Böblingen", "Landkreis", "Baden-Württemberg"), amt("Stadt Bremen", "LMTVet Bremen", "Bremen", "kreisfreie Stadt", "Bremen"), amt("Kreis Höxter", "Kreis Höxter – Veterinäramt", "Höxter", "Kreis", "Nordrhein-Westfalen")];
    expect(veterinaeramtZurSchau(l, "Kleintierzüchterhalle, 71034 Böblingen")?.kreis).toBe("Landkreis Böblingen");
    expect(veterinaeramtZurSchau(l, "Messe Bremen")?.kreis).toBe("Stadt Bremen");
    expect(veterinaeramtZurSchau(l, "Schützenhalle Höxter")?.kreis).toBe("Kreis Höxter");
    expect(veterinaeramtSuchen(l, "boeb").map((e) => e.kreis)).toEqual(["Landkreis Böblingen"]);
  });
});
