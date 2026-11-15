import { heuteBerlin } from "@schau/domain";

export { formatEuro, parseEuro, formatKatalognummer } from "@schau/domain";

/** Lesbarer Fehlertext aus einer tRPC-Antwort, inklusive Feldfehlern der Eingabeprüfung. */
export function fehlerText(err: unknown): string {
  if (!err || typeof err !== "object") return "Unbekannter Fehler.";
  const e = err as { message?: string; data?: { zod?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | null } };
  const zod = e.data?.zod;
  if (zod) {
    const texte = [...(zod.formErrors ?? []), ...Object.values(zod.fieldErrors ?? {}).flat()];
    // Die Texte kommen schon deutsch vom Server (eigene Texte der Schemas, sonst kurze Standardtexte).
    if (texte.length) return [...new Set(texte)].join(" ");
  }
  if (e.message?.startsWith("[") || e.message?.startsWith("{")) return "Bitte die Eingaben prüfen.";
  if (e.message === "Failed to fetch") return "Keine Verbindung zum Server.";
  return e.message ?? "Unbekannter Fehler.";
}


export function datum(d: string | Date | null | undefined): string {
  if (!d) return "–";
  const date = typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function datumZeit(d: string | Date | null | undefined): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
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
