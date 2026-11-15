import { heuteBerlin, istAuslaendisch, type Nachweisart, noetigeNachweise, pruefeNachweis, type Tierart } from "@schau/domain";
import type { meldung, schau } from "../db/schema";

/** Heute in deutscher Zeit als JJJJ-MM-TT. */
export function heuteDe(): string {
  return heuteBerlin();
}

/**
 * Welche Nachweise ein Aussteller mit diesen Tieren braucht und was daran noch fehlt.
 * Stichtag für die Fristen ist der Bewertungstag (sonst heute).
 */
export function nachweisStand(m: typeof meldung.$inferSelect, tierarten: Tierart[], s: typeof schau.$inferSelect, registriernummer?: string | null) {
  // Klinische Untersuchung je nach Schau, Gesundheitszertifikat bei Herkunft aus dem Ausland (§ 7 GeflPestSchV, Tiergesundheitsrecht).
  const noetig = noetigeNachweise(tierarten, { wassergefluegel: s.wassergefluegelUntersuchung, untersuchung: s.untersuchung, ausland: istAuslaendisch(registriernummer) });
  const heute = heuteDe();
  const stichtag = s.bewertungAm ?? heute;
  const daten: Record<Nachweisart, { datum: string | null; sentinel?: boolean; text?: string }> = {
    nd: { datum: m.vetImpfdatum },
    pmv: { datum: m.pmvImpfdatum },
    wg: { datum: m.wgDatum, sentinel: m.wgSentinel },
    kl: { datum: m.klDatum },
    gz: { datum: m.gzDatum, text: m.gzNummer },
  };
  const fristen = { ndMin: s.ndTageMin, ndMax: s.ndTageMax, pmvMin: s.pmvTageMin, pmvMax: s.pmvTageMax, klTage: s.untersuchungTage };
  const fehler = noetig.map((art) => pruefeNachweis(art, daten[art], stichtag, heute, fristen)).filter((x): x is string => x != null);
  return { noetig, fehler, geprueft: !!m.vetGeprueftAm };
}
