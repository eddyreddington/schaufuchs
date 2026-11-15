/** Eingabeprüfung (zod 4): eigene Fehlertexte bleiben, Standardtexte auf Deutsch. Teil des Schau-Ablaufs. */
import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { leer, m } from "./kontext";

const issues = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const c = (e as { cause?: unknown }).cause;
    if (c instanceof ZodError) return c.issues.map((i) => i.message);
  }
  throw new Error("keine Prüffehler");
};

describe("Eingabeprüfung", () => {
  test("eigene Texte und deutsche Standardtexte", async () => {
    const pub = m.appRouter.createCaller(leer);
    const texte = await issues(
      pub.oeffentlich.melden({
        slug: "gibt-es-nicht",
        aussteller: { vorname: "x".repeat(500), nachname: "N", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", geburtsdatum: null },
        istJugend: false,
        istPreisrichter: false,
        positionen: [],
        zustimmung: false as true,
        stiftung: null,
        bemerkung: "",
      }),
    );
    expect(texte).toContain("Bitte die AAB und die Sonderbestimmungen anerkennen.");
    expect(texte).toContain("Bitte mindestens ein Tier melden.");
    // Kurze deutsche Standardtexte wie bisher in der Oberfläche.
    expect(texte).toContain("Höchstens 100 Zeichen.");
    expect(texte.some((t) => /too big|expected|erwartet/i.test(t))).toBe(false);
  });

  test("kurze Texte je Fehlerart", async () => {
    const { kurzerPruefText } = await import("../trpc");
    const { z } = await import("zod");
    const text = (schema: import("zod").ZodType, wert: unknown) => schema.safeParse(wert).error?.issues[0]?.message;
    expect(kurzerPruefText).toBeDefined();
    expect(text(z.string().max(5), "zu lang!")).toBe("Höchstens 5 Zeichen.");
    expect(text(z.string().min(1), "")).toBe("Pflichtfeld.");
    expect(text(z.string().min(3), "a")).toBe("Mindestens 3 Zeichen.");
    expect(text(z.object({ a: z.string() }), {})).toBe("Pflichtfeld.");
    expect(text(z.number().int(), 1.5)).toBe("Bitte eine ganze Zahl eingeben.");
    expect(text(z.number().max(10), 11)).toBe("Höchstens 10.");
    expect(text(z.number().min(0), -1)).toBe("Mindestens 0.");
    expect(text(z.array(z.number()).max(1), [1, 2])).toBe("Höchstens 1 Einträge.");
    expect(text(z.array(z.number()).min(1), [])).toBe("Mindestens 1 Eintrag.");
    expect(text(z.enum(["jung", "alt"]), "mittel")).toBe("Ungültige Auswahl.");
    expect(text(z.string().email(), "keine-mail")).toBe("Ungültige E-Mail-Adresse.");
    expect(text(z.coerce.date(), "kein Datum")).toBe("Ungültiges Datum.");
    expect(text(z.string(), 5)).toBe("Ungültige Eingabe.");
    // Eigener Text im Schema geht vor.
    expect(text(z.string().min(3, "Name fehlt."), "a")).toBe("Name fehlt.");
  });
});
