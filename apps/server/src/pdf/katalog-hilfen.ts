/**
 * Katalog-PDF, gemeinsame Hilfen ohne PDF: Kurzvorschau-Auswahl, Anzahltexte („3 Stämme“) und der Bildnachweis
 * (Adressen kürzen, Urheber bereinigen, Angaben zusammensetzen).
 */
import { lizenzUrlVon } from "@schau/domain";

/** Kurzvorschau: so viele Tiere je Abteilung (Sparte, Jugend getrennt) – zeigt die Aufteilung, bleibt bei jeder Schau klein. */
export const KURZ_JE_ABTEILUNG = 10;

/** Die ersten Tiere jeder Abteilung (`abteilung` liefert den Schlüssel), in der Reihenfolge des Katalogs. */
export function kurzauswahl<T>(liste: T[], abteilung: (e: T) => string, je = KURZ_JE_ABTEILUNG): T[] {
  const zahl = new Map<string, number>();
  return liste.filter((e) => {
    const k = abteilung(e);
    const n = zahl.get(k) ?? 0;
    zahl.set(k, n + 1);
    return n < je;
  });
}

/** „3 Tiere“, in den Abteilungen Stämme und Volieren aber „3 Stämme“ bzw. „3 Volieren“. */
export function anzahlText(abteilung: string, n: number): string {
  if (abteilung === "Stämme") return `${n} ${n === 1 ? "Stamm" : "Stämme"}`;
  if (abteilung === "Volieren") return `${n} ${n === 1 ? "Voliere" : "Volieren"}`;
  return `${n} ${n === 1 ? "Tier" : "Tiere"}`;
}

/**
 * Zeile im Bildnachweis: Urheber, Lizenz mit Adresse (verlangen CC BY und CC BY-SA) und Quelle. Ohne jede Angabe ist es
 * ein eigenes Bild des Vereins; mit Lizenz oder Quelle, aber ohne Urheber, „Urheber unbekannt“.
 */
/** Adresse für den Druck: ohne „https://“ und „www.“, Umlaute statt %-Kodierung, ohne Schrägstrich am Ende. */
export function kurzeAdresse(url: string) {
  let u = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  try {
    u = decodeURI(u);
  } catch {
    // ungültige %-Folge: so lassen
  }
  return u;
}

/** Urheberangabe aus Wikimedia ohne Signatur-Zeitstempel und Hinweistexte („No machine-readable author …“). */
export function urheberKurz(urheber: string) {
  const ohneHinweis = urheber.match(/no machine-readable author provided\.\s*(.+?)\s+assumed/i)?.[1] ?? urheber;
  return ohneHinweis.replace(/\s*\d{1,2}:\d{2},\s*\d{1,2}\.?\s+\p{L}+\s+\d{4}\s*\(UTC\)/gu, "").replace(/\s+/g, " ").trim();
}

/** Bildnachweis für den Katalog in zwei Teilen: Angaben (Foto, Lizenz) und die Adressen von Quelle und Lizenz. */
export function bildnachweisTeile(b: { urheber: string; lizenz: string; lizenzUrl: string; quelle: string }) {
  const urheber = urheberKurz(b.urheber);
  if (!urheber && !b.lizenz && !b.lizenzUrl && !b.quelle) return { angaben: "eigenes Bild", adressen: "" };
  const angaben = [urheber ? `Foto: ${urheber}` : "Urheber unbekannt", b.lizenz].filter(Boolean).join(" · ");
  // CC-Lizenzen verlangen einen Link zur Lizenz – fehlt er in den Angaben, aus dem Lizenznamen.
  const lizenzUrl = b.lizenzUrl || lizenzUrlVon(b.lizenz);
  const adressen = [b.quelle && kurzeAdresse(b.quelle), lizenzUrl && `Lizenz: ${kurzeAdresse(lizenzUrl)}`].filter(Boolean).join("  ·  ");
  return { angaben, adressen };
}

export function bildnachweis(rasse: string, b: { urheber: string; lizenz: string; lizenzUrl: string; quelle: string }) {
  const lizenz = b.lizenz && b.lizenzUrl ? `${b.lizenz} (${b.lizenzUrl})` : b.lizenz || b.lizenzUrl;
  const teile = [lizenz, b.quelle].filter(Boolean);
  if (!b.urheber && !teile.length) return `${rasse}: eigenes Bild`;
  return `${rasse}: ${[b.urheber ? `Foto ${b.urheber}` : "Urheber unbekannt", ...teile].join(" · ")}`;
}
