/**
 * Zulassung der Preisrichter: welche Tiere ein Preisrichter bewerten darf (Sparten und BDRG-Gruppen), Zuordnung zu einem
 * Obmann und Stand der Zusage. Gilt für die Einteilung nach Rassen und nach Nummern und für die Vorschläge.
 */

/** Stand der Zusage eines Preisrichters für die Schau. */
export const ZUSAGEN = ["offen", "zugesagt", "abgesagt"] as const;
export type Zusage = (typeof ZUSAGEN)[number];

/** Gruppe einheitlich: ohne Leerzeichen, groß geschrieben („ z 1“ → „Z1“). */
export const bdrgGruppe = (g: string | null | undefined) => (g ?? "").replace(/\s+/g, "").toUpperCase();

/** Gültige Gruppe: kurzer Text aus Buchstaben und Ziffern (A–M, Z1–Z3, BV o. ä.), höchstens 10 Zeichen. */
export const bdrgGruppeGueltig = (g: string | null | undefined) => /^[A-Z0-9]{1,10}$/.test(bdrgGruppe(g));

/** Bewertet dieser Preisrichter diese Sparte? Ohne Angabe bewertet er alle. */
export const bewertetSparte = (r: { sparten?: string[] | null }, sparte: string | null | undefined) => !r.sparten?.length || r.sparten.includes(sparte ?? "");

/**
 * Bewertet dieser Preisrichter diese Gruppe? Ohne eingetragene Gruppen keine Einschränkung über Gruppen. Eine Rasse ohne
 * Gruppe (im Verzeichnis nicht gepflegt) wird nicht über Gruppen geprüft – sonst sperrte jede ungepflegte Rasse alle.
 */
export function bewertetGruppe(r: { gruppen?: string[] | null }, gruppe: string | null | undefined): boolean {
  const g = bdrgGruppe(gruppe);
  if (!r.gruppen?.length || !g) return true;
  return r.gruppen.some((x) => bdrgGruppe(x) === g);
}

/** Darf der Preisrichter dieses Tier bewerten? Sparte und Gruppe müssen beide passen. */
export const darfBewerten = (r: { sparten?: string[] | null; gruppen?: string[] | null }, t: { sparte: string | null | undefined; gruppe?: string | null }) =>
  bewertetSparte(r, t.sparte) && bewertetGruppe(r, t.gruppe);

/**
 * Obmann für einen Preisrichter: leer oder ein Obmann derselben Schau, nicht er selbst. `richterId` fehlt beim Anlegen.
 * Ergebnis `null` = in Ordnung, sonst der Grund.
 */
export function pruefeObmann(
  richterId: number | undefined,
  obmannId: number | null | undefined,
  richterDerSchau: { id: number; istObmann: boolean }[],
): null | "selbst" | "unbekannt" | "keinObmann" {
  if (obmannId == null) return null;
  if (richterId != null && obmannId === richterId) return "selbst";
  const o = richterDerSchau.find((r) => r.id === obmannId);
  if (!o) return "unbekannt";
  return o.istObmann ? null : "keinObmann";
}
