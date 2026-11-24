/**
 * Gemeinsame Hilfen der Dokumente einer Schau (dokumente.ts, dokumente-kasse.ts, dokumente-amt.ts): Design aus der
 * Katalog-Gestaltung, Vereinsname, Kopf- und Fußzeile, Maße.
 */
import { formatKatalognummer, MELDEART_LABEL } from "@schau/domain";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { bild, type schau } from "../db/schema";
import { ladeGestaltung } from "../routers/katalog-gestaltung";
import { type Eintrag } from "../services/eintraege";
import { design, type Design, type Doc, MM } from "./basis";

export type Schau = typeof schau.$inferSelect;


export const nr = (e: { katalogNr: number | null; suffix: string }) => formatKatalognummer(e);
export const klasse = (e: Eintrag) => `${e.geschlecht} ${e.alter}`;
export const tier = (e: Eintrag) => `${klasse(e)}${e.art !== "einzeltier" ? ` · ${MELDEART_LABEL[e.art]}` : ""}`;
// DIN 5008: links 25 mm, rechts 20 mm.
export const A4_RAENDER = { top: 14 * MM, bottom: 20 * MM, left: 25 * MM, right: 20 * MM };

/** Vereinsfarbe und Logo aus „Katalog“, damit alle Belege zum Katalog passen. */
export async function ladeDesign(s: Schau): Promise<Design> {
  const [g, [logo]] = await Promise.all([
    ladeGestaltung(s.id),
    // Das neueste Logo (falls es durch ein früheres gleichzeitiges Hochladen zwei gibt).
    db.select({ daten: bild.daten }).from(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "logo"))).orderBy(desc(bild.id)).limit(1),
  ]);
  return design(g.farbe, logo?.daten ?? null);
}

export const verein = (s: Schau) => s.veranstalter || s.name;
export const kopfzeile = (s: Schau) => [s.name, s.ort].filter(Boolean).join(" · ");
export const fusstext = (s: Schau) => [verein(s), s.kontaktEmail].filter(Boolean).join(" · ");
export const breite = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
export const unten = (doc: Doc) => doc.page.height - doc.page.margins.bottom;
