import { GEBUEHR_LABEL, type GebuehrArt, type Meldeart } from "./types";

export interface Gebuehr {
  art: GebuehrArt;
  jugend: boolean;
  betragCent: number;
  /** Amtierende Preisrichter zahlen diese Position nicht (typisch: Katalog). */
  befreitPreisrichter: boolean;
}

export interface MeldePosition {
  art: Meldeart;
}

export interface Rechnungszeile {
  art: GebuehrArt;
  label: string;
  anzahl: number;
  einzelCent: number;
  summeCent: number;
}

export interface Meldebetrag {
  zeilen: Rechnungszeile[];
  summeCent: number;
}

function tarif(gebuehren: Gebuehr[], art: GebuehrArt, jugend: boolean): Gebuehr | undefined {
  // Fehlt ein eigener Jugendtarif, gilt der Seniorentarif.
  return gebuehren.find((g) => g.art === art && g.jugend === jugend) ?? gebuehren.find((g) => g.art === art && !g.jugend);
}

/** Berechnet, was ein Aussteller für seine Meldung zahlen muss. */
export function berechneMeldebetrag(
  positionen: MeldePosition[],
  gebuehren: Gebuehr[],
  opts: { istJugend: boolean; istPreisrichter: boolean },
): Meldebetrag {
  const zeilen: Rechnungszeile[] = [];
  const anzahlJeArt = new Map<Meldeart, number>();
  for (const p of positionen) anzahlJeArt.set(p.art, (anzahlJeArt.get(p.art) ?? 0) + 1);

  const add = (art: GebuehrArt, anzahl: number) => {
    const g = tarif(gebuehren, art, opts.istJugend);
    if (!g || anzahl === 0) return;
    if (g.befreitPreisrichter && opts.istPreisrichter) return;
    zeilen.push({ art, label: GEBUEHR_LABEL[art], anzahl, einzelCent: g.betragCent, summeCent: g.betragCent * anzahl });
  };

  for (const [art, anzahl] of anzahlJeArt) add(art, anzahl);
  if (positionen.length > 0) {
    add("kostenanteil", 1);
    add("katalog", 1);
  }
  return { zeilen, summeCent: zeilen.reduce((s, z) => s + z.summeCent, 0) };
}

/** Jugendliche: am Stichtag noch nicht 18 Jahre alt. */
export const JUGEND_ALTERSGRENZE = 18;

/**
 * Alter in vollen Jahren am Stichtag (beide als JJJJ-MM-TT).
 * Wer am 29.02. geboren ist, wird in Nicht-Schaltjahren am 01.03. ein Jahr älter (§ 188 Abs. 3 BGB).
 */
export function alterAm(geburtsdatum: string, stichtag: string): number {
  const [gj, gm, gt] = geburtsdatum.split("-").map(Number) as [number, number, number];
  const [sj, sm, st] = stichtag.split("-").map(Number) as [number, number, number];
  const vorGeburtstag = sm < gm || (sm === gm && st < gt);
  return sj - gj - (vorGeburtstag ? 1 : 0);
}

/** Darf zum Jugendtarif und im Jugendblock ausstellen: am Stichtag jünger als die Altersgrenze. */
export function istJugendlich(geburtsdatum: string, stichtag: string, altersgrenze = JUGEND_ALTERSGRENZE): boolean {
  return alterAm(geburtsdatum, stichtag) < altersgrenze;
}

/**
 * Was eine Meldung insgesamt fordert: Meldegeld plus die mit ihr zugesagte Ehrenpreisstiftung und Spende. Beide werden
 * mit dem Meldegeld bezahlt, sind aber kein Meldegeld.
 */
export function gefordertCent(b: { summeCent: number; stiftungCent: number; spendeCent: number }): number {
  return b.summeCent + b.stiftungCent + b.spendeCent;
}
