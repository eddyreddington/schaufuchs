/**
 * Import aus Altprogrammen (Entscheidung 015), nur Administratoren: Datei lesen (CSV oder Excel), prüfen, übernehmen,
 * Importläufe anzeigen und zurücknehmen. Die Regeln stehen in packages/domain/src/import.ts und services/import.ts.
 */
import { csvLesen, IMPORT_FELDER, type ImportFeld, spaltenRaten } from "@schau/domain";
import { z } from "zod";
import { db } from "../db/client";
import { XlsxFehler, xlsxLesen } from "../import/xlsx";
import { importLaeufe, importPruefen, importUebernehmen, importZuruecknehmen } from "../services/import";
import { adminProcedure, dbId, fehler, router, strukturZuGross } from "../trpc";

/** Größte Datei (ungepackt bzw. als Excel-Datei); eine Meldeliste ist weit kleiner. */
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ZEILEN = 5000;
const MAX_SPALTEN = 60;
/** Text insgesamt in einer Tabelle (Meldelisten sind weit kleiner). */
const MAX_ZEICHEN = 6 * 1024 * 1024;

const felder = Object.keys(IMPORT_FELDER) as [ImportFeld, ...ImportFeld[]];
/**
 * Die Tabelle kommt als ein JSON-Text: als Liste wären es bis zu 300.000 Werte – weit über den allgemeinen Grenzen
 * jeder Anfrage (trpc.ts, pruefeUmfang). Geprüft wird sie hier: Zeilen, Spalten, Länge jeder Zelle.
 */
const tabelleText = z
  .string()
  .max(11 * 1024 * 1024)
  .transform((t, c) => {
    // Erst die Struktur zählen (Einträge, Tiefe) – JSON.parse bände bei sehr vielen leeren Einträgen Hunderte MB.
    if (strukturZuGross(t, (MAX_ZEILEN + 1) * (MAX_SPALTEN + 2))) {
      c.addIssue({ code: "custom", message: "Die Anfrage ist zu umfangreich." });
      return z.NEVER;
    }
    let v: unknown;
    try {
      v = JSON.parse(t);
    } catch {
      v = null;
    }
    const ok =
      Array.isArray(v) &&
      v.length >= 1 &&
      v.length <= MAX_ZEILEN + 1 &&
      v.every((z) => Array.isArray(z) && z.length <= MAX_SPALTEN && z.every((x) => typeof x === "string" && x.length <= 500));
    if (!ok) {
      c.addIssue({ code: "custom", message: `Die Tabelle ist ungültig (höchstens ${MAX_ZEILEN} Zeilen, ${MAX_SPALTEN} Spalten, 500 Zeichen je Zelle).` });
      return z.NEVER;
    }
    return v as string[][];
  });
const eingabe = z.object({
  art: z.enum(["aussteller", "meldungen"]),
  schauId: dbId.optional(),
  dateiname: z.string().max(200).default(""),
  tabelle: tabelleText,
  zuordnung: z.array(z.enum(felder).nullable()).max(MAX_SPALTEN),
  mitKopf: z.boolean(),
  rassen: z.record(z.string().max(300), dbId.nullable()).default({}),
});
const pruefeArt = (e: z.infer<typeof eingabe>) => {
  if (e.art === "meldungen" && !e.schauId) throw fehler("BAD_REQUEST", "Bitte die Schau wählen, in die die Meldungen gehen.");
  if (new Set(e.zuordnung.filter(Boolean)).size !== e.zuordnung.filter(Boolean).length) throw fehler("BAD_REQUEST", "Jedes Feld darf nur einer Spalte zugeordnet sein.");
};

/**
 * Text einer CSV-Datei: UTF-16 mit BOM („Unicode-Text“ aus Excel), UTF-8, sonst Windows-1252 (so speichern ältere
 * Programme und Excel unter Windows).
 */
function csvText(daten: Buffer): string {
  if (daten[0] === 0xff && daten[1] === 0xfe) return new TextDecoder("utf-16le").decode(daten);
  if (daten[0] === 0xfe && daten[1] === 0xff) return new TextDecoder("utf-16be").decode(daten);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(daten);
  } catch {
    return new TextDecoder("windows-1252").decode(daten);
  }
}

export const importRouter = router({
  /** Datei lesen: Excel (.xlsx) oder CSV. Liefert die Tabelle und einen Vorschlag für die Spaltenzuordnung. */
  lesen: adminProcedure
    .input(z.object({ dateiname: z.string().max(200), base64: z.string().max(Math.ceil((IMPORT_MAX_BYTES * 4) / 3) + 8) }))
    .mutation(({ input }) => {
      const daten = Buffer.from(input.base64, "base64");
      if (!daten.length) throw fehler("BAD_REQUEST", "Die Datei ist leer.");
      if (daten.length > IMPORT_MAX_BYTES) throw fehler("BAD_REQUEST", "Die Datei ist zu groß (höchstens 8 MB).");
      let tabelle: string[][];
      // Excel-Dateien sind ZIP-Archive und beginnen mit „PK“; das alte .xls-Format beginnt anders.
      if (daten[0] === 0x50 && daten[1] === 0x4b) {
        try {
          tabelle = xlsxLesen(daten);
        } catch (e) {
          throw fehler("BAD_REQUEST", e instanceof XlsxFehler ? e.message : "Die Excel-Datei ließ sich nicht lesen.");
        }
      } else if (daten[0] === 0xd0 && daten[1] === 0xcf) {
        throw fehler("BAD_REQUEST", "Das alte Excel-Format (.xls) wird nicht gelesen. Bitte in Excel bzw. LibreOffice als .xlsx oder .csv speichern.");
      } else tabelle = csvLesen(csvText(daten));
      if (!tabelle.length) throw fehler("BAD_REQUEST", "In der Datei stehen keine Zeilen.");
      if (tabelle.length > MAX_ZEILEN + 1) throw fehler("BAD_REQUEST", `Zu viele Zeilen (höchstens ${MAX_ZEILEN}). Bitte die Datei teilen.`);
      const breite = Math.min(MAX_SPALTEN, Math.max(...tabelle.map((z) => z.length)));
      const zugeschnitten = tabelle.map((z) => Array.from({ length: breite }, (_, i) => (z[i] ?? "").slice(0, 500)));
      // Eine kleine Excel-Datei kann viele lange, gleiche Texte enthalten (gemeinsame Texte) – die Antwort begrenzen.
      if (zugeschnitten.reduce((n, z) => n + z.reduce((m, x) => m + x.length, 0), 0) > MAX_ZEICHEN) throw fehler("BAD_REQUEST", "Die Tabelle ist zu groß. Bitte die Datei teilen.");
      return { tabelle: zugeschnitten, zuordnung: spaltenRaten(zugeschnitten[0]!), abgeschnitten: tabelle.some((z) => z.length > MAX_SPALTEN) };
    }),

  pruefen: adminProcedure.input(eingabe).mutation(async ({ ctx, input }) => {
    pruefeArt(input);
    return importPruefen(db, ctx.benutzer.organisationId, input);
  }),

  uebernehmen: adminProcedure.input(eingabe.extend({ bestaetigen: z.boolean(), zustimmung: z.boolean() })).mutation(async ({ ctx, input }) => {
    pruefeArt(input);
    return importUebernehmen(ctx.benutzer.organisationId, input, ctx);
  }),

  laeufe: adminProcedure.query(({ ctx }) => importLaeufe(db, ctx.benutzer.organisationId)),

  zuruecknehmen: adminProcedure.input(z.object({ id: dbId })).mutation(({ ctx, input }) => db.transaction((tx) => importZuruecknehmen(tx, ctx.benutzer.organisationId, input.id, ctx))),
});
