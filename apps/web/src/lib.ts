import { heuteBerlin, LOCALE, serverText } from "@schau/domain";
import { aktuelleSprache, ot } from "./sprache-jetzt";

export { formatEuro, parseEuro, formatKatalognummer } from "@schau/domain";

/**
 * Lesbarer Fehlertext aus einer tRPC-Antwort, inklusive Feldfehlern der Eingabeprüfung – in der Sprache der Oberfläche:
 * der Server schreibt deutsch, `serverText()` übersetzt bekannte Meldungen (Entscheidung 022).
 */
export function fehlerText(err: unknown): string {
  const t = ot().allgemein;
  if (!err || typeof err !== "object") return t.unbekannterFehler;
  const sprache = aktuelleSprache();
  const e = err as { message?: string; data?: { zod?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | null } };
  const zod = e.data?.zod;
  if (zod) {
    const texte = [...(zod.formErrors ?? []), ...Object.values(zod.fieldErrors ?? {}).flat()];
    // Die Texte kommen deutsch vom Server (eigene Texte der Schemas, sonst kurze Standardtexte).
    if (texte.length) return [...new Set(texte.map((x) => serverText(x, sprache)))].join(" ");
  }
  if (e.message?.startsWith("[") || e.message?.startsWith("{")) return t.eingabenPruefen;
  if (e.message === "Failed to fetch") return t.keineVerbindung;
  return e.message ? serverText(e.message, sprache) : t.unbekannterFehler;
}

/** Datum in der Sprache der Oberfläche (Deutsch: TT.MM.JJJJ). */
export function datum(d: string | Date | null | undefined): string {
  if (!d) return "–";
  const date = typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat(LOCALE[aktuelleSprache()], { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function datumZeit(d: string | Date | null | undefined): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat(LOCALE[aktuelleSprache()], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

/** Heute in deutscher Zeit (JJJJ-MM-TT), wie auf dem Server (packages/domain/src/datum.ts). */
export function heuteIso(): string {
  return heuteBerlin();
}

export function centZuText(cent: number | null | undefined): string {
  if (cent == null) return "";
  return (cent / 100).toFixed(2).replace(".", ",");
}

export const ALTER_LABEL = { jung: "jung", alt: "alt" } as const;
