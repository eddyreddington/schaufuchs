/** Rassebilder für den Katalog: prüfen und speichern (Oberfläche und Einspielen aus dem Netz). */
import { and, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { Tx } from "../db/client";
import { rassebild } from "../db/schema";
import { bildTyp } from "../routers/katalog-gestaltung";
import { fehler } from "../trpc";

/** Höchstens 2 MB und 4 Millionen Pixel – die Oberfläche verkleinert vorher auf 1200 Pixel. */
export const RASSEBILD_MAX_BYTES = 2 * 1024 * 1024;
const RASSEBILD_MAX_PIXEL = 4_000_000;

export type RassebildAngaben = { urheber: string; lizenz: string; lizenzUrl: string; quelle: string };

/**
 * Öffnet ein JPEG so, wie pdfkit es beim Einbetten tut, und gibt die angezeigten Maße zurück (bei EXIF-Ausrichtung
 * 5–8 sind Breite und Höhe vertauscht – pdfkit dreht das Bild). Wirft bei Dateien, die pdfkit nicht lesen kann.
 */
export function jpegAnzeige(daten: Buffer): { breite: number; hoehe: number } {
  const { breite, hoehe } = oeffneBild(new PDFDocument({ autoFirstPage: false }), daten);
  return { breite, hoehe };
}

/** Von pdfkit geöffnetes Bild (in den Typen von pdfkit fehlt `openImage`); `doc.image(bild, …)` bettet es ein. */
export type GeoeffnetesBild = { width: number; height: number; orientation?: number };

/** Öffnet ein Bild in `doc` (einmal einbetten, mehrfach zeigen) mit den angezeigten Maßen nach der EXIF-Ausrichtung. */
export function oeffneBild(doc: PDFKit.PDFDocument, daten: Buffer) {
  const bild = (doc as unknown as { openImage(d: Buffer): GeoeffnetesBild }).openImage(daten);
  const gedreht = (bild.orientation ?? 1) > 4;
  return { bild, breite: gedreht ? bild.height : bild.width, hoehe: gedreht ? bild.width : bild.height };
}

/**
 * Prüft ein Bild und gibt Typ und angezeigte Maße zurück. Nur JPEG: pdfkit bettet JPEG ein, ohne es zu entpacken.
 * PNG mit Alphakanal entpackt es dagegen nebenbei – ein Fehler in den Bilddaten hielte die Katalog-Erzeugung für alle
 * Vereine an. Die Oberfläche wandelt jedes Foto vorher in JPEG um.
 */
export function pruefeRassebild(daten: Buffer) {
  if (daten.length > RASSEBILD_MAX_BYTES) throw fehler("BAD_REQUEST", "Das Bild ist größer als 2 MB. Bitte verkleinern.");
  if (bildTyp(daten) !== "image/jpeg") throw fehler("BAD_REQUEST", "Nur Bilder im Format JPEG. Bitte das Foto als JPEG speichern.");
  // Ende-Markierung fehlt: abgeschnittene Datei, z. B. abgebrochener Download (am Ende darf etwas Füllmaterial stehen).
  const ende = daten.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (ende < 0 || ende < daten.length - 1024) throw fehler("BAD_REQUEST", "Das Bild ist unvollständig. Bitte neu speichern oder herunterladen.");
  let m: { breite: number; hoehe: number };
  try {
    m = jpegAnzeige(daten);
  } catch {
    throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen. Bitte als JPEG neu speichern.");
  }
  if (!m.breite || !m.hoehe) throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen. Bitte als JPEG neu speichern.");
  if (m.breite * m.hoehe > RASSEBILD_MAX_PIXEL) throw fehler("BAD_REQUEST", `Das Bild ist mit ${m.breite} × ${m.hoehe} Pixeln zu groß. Bitte verkleinern (z. B. 1200 Pixel breit).`);
  return { mime: "image/jpeg" as const, breite: m.breite, hoehe: m.hoehe };
}

/**
 * Speichert das Bild einer Rasse (in der Transaktion `tx`, damit das Protokoll dazu passt). `nurWennLeer`: ein
 * vorhandenes Bild bleibt (Einspielen aus dem Netz überschreibt nichts, was der Verein selbst gepflegt hat).
 * Gibt die Nummer des Bilds und die vorherigen Angaben zurück – oder null, wenn nichts gespeichert wurde.
 */
export async function speichereRassebild(
  tx: Tx,
  organisationId: number,
  rasse: string,
  daten: Buffer,
  angaben: RassebildAngaben,
  opts: { geprueft: boolean; nurWennLeer?: boolean },
): Promise<{ id: number; alt: (RassebildAngaben & { geprueft: boolean }) | null } | null> {
  const { mime, breite, hoehe } = pruefeRassebild(daten);
  const [da] = await tx
    .select({ id: rassebild.id, urheber: rassebild.urheber, lizenz: rassebild.lizenz, lizenzUrl: rassebild.lizenzUrl, quelle: rassebild.quelle, geprueft: rassebild.geprueft })
    .from(rassebild)
    .where(and(eq(rassebild.organisationId, organisationId), eq(rassebild.rasse, rasse)))
    .for("update"); // gleichzeitiges Ersetzen: alte Angaben im Protokoll passend zum eigenen Schreiben
  if (da && opts.nurWennLeer) return null;
  const werte = { organisationId, rasse, mime, daten, breite, hoehe, ...angaben, geprueft: opts.geprueft };
  const [neu] = opts.nurWennLeer
    ? await tx.insert(rassebild).values(werte).onConflictDoNothing().returning({ id: rassebild.id })
    : await tx
        .insert(rassebild)
        .values(werte)
        .onConflictDoUpdate({ target: [rassebild.organisationId, rassebild.rasse], set: { mime, daten, breite, hoehe, ...angaben, geprueft: opts.geprueft, createdAt: new Date() } })
        .returning({ id: rassebild.id });
  if (!neu) return null;
  return { id: neu.id, alt: da ? { urheber: da.urheber, lizenz: da.lizenz, lizenzUrl: da.lizenzUrl, quelle: da.quelle, geprueft: da.geprueft } : null };
}
