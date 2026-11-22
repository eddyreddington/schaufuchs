/**
 * Preisverteilung eines Preisrichters (Blatt für die Preisvergabe in der Halle): je Preisart so viele Zeilen, wie der
 * Preisrichter vergeben darf. Schon vergebene Preise stehen mit Katalognummer darin, die übrigen Zeilen bleiben leer
 * zum Eintragen. Preisarten ohne Kontingent je Preisrichter (gestiftete Preise, Kontingent für die ganze Schau) zeigen
 * nur die vergebenen. Gestiftete mit „zusätzlich je Preisrichter“ haben ein Kontingent für die Preise ohne Stiftung;
 * Preise aus einer Stiftung belegen keine dieser Zeilen, kommen dazu und sind nie überzählig.
 */

/** Eine Preisart der Schau, in Druckfolge. */
export interface VerteilungArt {
  preisartId: number;
  kuerzel: string;
  name: string;
  /** Betrag der Preisart heute (für die noch freien Zeilen). */
  betragCent: number;
  /** Sachpreis statt Geld, z. B. „Pokal“; leer: keiner. */
  sachpreis: string;
  /**
   * Kontingent dieses Preisrichters (bei gestifteten Preisen: „zusätzlich je Preisrichter“ für Preise ohne Stiftung);
   * null: keins je Preisrichter (Stiftung ohne Zusatzpreise, Kontingent für die ganze Schau).
   */
  verfuegbar: number | null;
}

/** Ein vergebener Preis an einem Tier dieses Preisrichters, in Katalogfolge. */
export interface VerteilungVergabe {
  preisartId: number;
  /** Katalognummer, wie gedruckt. */
  nr: string;
  /** Betrag zum Zeitpunkt der Vergabe. */
  betragCent: number;
  /** Zusatz, z. B. der Stifter. */
  zusatz?: string;
  /** Das Tier ist als fehlend gemeldet (zählt nicht mehr zum Kontingent). */
  fehlt?: boolean;
  /** Aus einer Stiftung vergeben (nicht aus „zusätzlich je Preisrichter“). */
  ausStiftung?: boolean;
}

export interface VerteilungZeile {
  /** Laufende Nummer innerhalb der Preisart (Spalte „Anzahl“ auf dem Papier). */
  lfd: number;
  preisartId: number;
  kuerzel: string;
  name: string;
  /** Katalognummer; leer: noch nicht vergeben. */
  nr: string;
  betragCent: number;
  sachpreis: string;
  zusatz: string;
  fehlt: boolean;
  /**
   * Mehr vergeben, als das Kontingent heute erlaubt (z. B. weil danach Tiere als fehlend gemeldet wurden): überzählig
   * sind zuerst die Preise an fehlenden Tieren, dann die letzten in Katalogfolge.
   */
  ueberKontingent: boolean;
}

export function preisverteilung(arten: VerteilungArt[], vergaben: VerteilungVergabe[]) {
  const unbekannt = vergaben.find((v) => !arten.some((a) => a.preisartId === v.preisartId));
  // bleibt deutsch: interne Annahme (Vergaben gehören zu den übergebenen Preisarten der Schau)
  if (unbekannt) throw new Error(`Preisart ${unbekannt.preisartId} fehlt in der Preisverteilung.`);
  const zeilen: VerteilungZeile[] = [];
  for (const a of arten) {
    const vergeben = vergaben.filter((v) => v.preisartId === a.preisartId);
    // Leere Zeilen: was vom Kontingent noch frei ist. Preise aus einer Stiftung belegen keine davon und sind nie
    // überzählig (sie zählen gegen die Stiftung) – wie bei der Vergabe (zaehltZumKontingent).
    const imKontingent = vergeben.filter((v) => !v.ausStiftung);
    const anzahl = vergeben.length + Math.max(0, (a.verfuegbar ?? 0) - imKontingent.length);
    const zuViel = a.verfuegbar == null ? 0 : Math.max(0, imKontingent.length - a.verfuegbar);
    const ueber = new Set([...imKontingent.filter((v) => v.fehlt), ...imKontingent.filter((v) => !v.fehlt).reverse()].slice(0, zuViel));
    for (let i = 0; i < anzahl; i++) {
      const v = vergeben[i];
      zeilen.push({
        lfd: i + 1,
        preisartId: a.preisartId,
        kuerzel: a.kuerzel,
        name: a.name,
        nr: v?.nr ?? "",
        betragCent: v ? v.betragCent : a.betragCent,
        sachpreis: a.sachpreis,
        zusatz: v?.zusatz ?? "",
        fehlt: !!v?.fehlt,
        ueberKontingent: !!v && ueber.has(v),
      });
    }
  }
  const summe = (z: VerteilungZeile[]) => z.reduce((n, x) => n + x.betragCent, 0);
  return { zeilen, vergebenCent: summe(zeilen.filter((x) => x.nr)), gesamtCent: summe(zeilen) };
}
