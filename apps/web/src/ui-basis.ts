/** Gemeinsame Kleinteile der UI-Bausteine: Klassen verketten, Töne für Hinweise und Meldungen. */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type Ton = "info" | "ok" | "warnung" | "fehler";
export const TON: Record<Ton, string> = {
  info: "border-band/25 bg-band-hell",
  ok: "border-stall/25 bg-stall-hell",
  warnung: "border-stroh-dunkel/25 bg-stroh",
  fehler: "border-kamm/25 bg-kamm-hell",
};
