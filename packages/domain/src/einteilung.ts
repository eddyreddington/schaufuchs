/**
 * Preisrichter-Einteilung nach Rassen: Vor der Nummernvergabe teilt die Ausstellungsleitung die Preisrichter nach Sparte,
 * Rasse und – wo eine Rasse geteilt wird – Farbenschlag ein. Aus den vergebenen Katalognummern ergeben sich daraus die
 * Nummernbereiche je Preisrichter (Grundlage für Tablet, Bewertung und Preise).
 */

/** Eine Regel: diese Rasse (bzw. dieser Farbenschlag der Rasse) geht an diesen Preisrichter. `farbenschlag` leer = ganze Rasse. */
export interface RassenRegel {
  preisrichterId: number;
  sparte: string;
  rasse: string;
  farbenschlag: string;
  /**
   * Nur für die Jugend der Rasse (Einstellung „Jugend in der Einteilung: separat“). Fehlt es (ältere Regeln) oder ist es
   * false, gilt die Regel für Senioren und Jugend – für die Jugend nur, soweit keine Jugendregel greift.
   */
  jugend?: boolean;
}

/** Was ein Tier für die Einteilung ausmacht. */
export interface EinteilTier {
  sparte: string | null;
  rasse: string;
  farbenschlag: string | null;
  /** Jugendtier einer Schau, die die Jugend separat einteilt (sonst false: die Jugend geht mit ihrer Rasse). */
  istJugend?: boolean;
}

const gleich = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Preisrichter für ein Tier: eine Regel für seinen Farbenschlag geht vor der Regel für die ganze Rasse. Ein Jugendtier
 * (bei „Jugend separat“) geht zuerst nach den Jugendregeln (Farbenschlag, dann Rasse), sonst wie die Senioren.
 */
export function richterNachRasse(t: EinteilTier, regeln: RassenRegel[]): number | null {
  const passend = regeln.filter((r) => gleich(r.sparte, t.sparte) && gleich(r.rasse, t.rasse));
  const stufe = (liste: RassenRegel[]) =>
    liste.find((r) => r.farbenschlag && gleich(r.farbenschlag, t.farbenschlag))?.preisrichterId ?? liste.find((r) => !r.farbenschlag)?.preisrichterId ?? null;
  if (t.istJugend) {
    const jugend = stufe(passend.filter((r) => r.jugend));
    if (jugend != null) return jugend;
  }
  return stufe(passend.filter((r) => !r.jugend));
}

/** Für die Folge der Einteilung: ein Tier mit den Stellen aus dem Verzeichnis (null = nicht im Verzeichnis). */
export interface EinteilFolgeTier extends EinteilTier {
  sparteFolge: number | null;
  rasseFolge: number | null;
  farbFolge: number | null;
}

/**
 * Folge der Einteilung nach Rassen: Sparte, Rasse, Farbenschlag (ohne Verzeichnis-Folge dahinter, nach dem Namen). Die
 * Jugend (bei „Jugend separat“) steht wie im Katalog: mit `jugendAmEnde` (Katalog mit Jugendblock) hinter allen Senioren,
 * sonst gleich hinter den Senioren ihrer Rasse.
 */
export function vergleicheEinteilFolge(a: EinteilFolgeTier, b: EinteilFolgeTier, opts: { jugendAmEnde: boolean }): number {
  const j = (t: EinteilFolgeTier) => (t.istJugend ? 1 : 0);
  const rasse = (x: EinteilFolgeTier, y: EinteilFolgeTier) =>
    (x.sparteFolge ?? 1e9) - (y.sparteFolge ?? 1e9) || (x.sparte ?? "").localeCompare(y.sparte ?? "") || (x.rasseFolge ?? 1e9) - (y.rasseFolge ?? 1e9) || x.rasse.localeCompare(y.rasse);
  const farbe = (x: EinteilFolgeTier, y: EinteilFolgeTier) => (x.farbFolge ?? 1e9) - (y.farbFolge ?? 1e9) || (x.farbenschlag ?? "").localeCompare(y.farbenschlag ?? "");
  return opts.jugendAmEnde ? j(a) - j(b) || rasse(a, b) || farbe(a, b) : rasse(a, b) || j(a) - j(b) || farbe(a, b);
}

/**
 * Nummernbereiche aus der Einteilung nach Rassen. Aufeinanderfolgende Nummern desselben Preisrichters werden ein Bereich;
 * eine Nummer ohne Preisrichter trennt – auch die Nummer eines Tieres, das nicht zählt (Meldung nicht bestätigt: nach dem
 * Festschreiben behält sie ihre Nummer; ein Bereich darüber hinweg nähme das Tier mit, sobald es wieder bestätigt ist).
 * Nachmeldungen (24a) teilen die ganze Nummer mit 24 und gehen deshalb an deren Preisrichter – gehörte 24a nach seiner
 * Rasse zu einem anderen, steht es unter `abweichend`.
 */
export function bereicheAusRassen<T extends EinteilTier & { id: number; nr: number; suffix?: string | null; zaehlt?: boolean }>(
  tiere: T[],
  regeln: RassenRegel[],
): { bereiche: { preisrichterId: number; vonNr: number; bisNr: number }[]; abweichend: { id: number; nummer: string; preisrichterId: number | null }[]; ohne: number } {
  const jeNr = new Map<number, T[]>();
  for (const t of tiere) jeNr.set(t.nr, [...(jeNr.get(t.nr) ?? []), t]);
  const nummern = [...jeNr.keys()].sort((a, b) => a - b);
  const bereiche: { preisrichterId: number; vonNr: number; bisNr: number }[] = [];
  const abweichend: { id: number; nummer: string; preisrichterId: number | null }[] = [];
  let ohne = 0;
  let offen: { preisrichterId: number; vonNr: number; bisNr: number } | null = null;
  for (const nr of nummern) {
    const gruppe = jeNr.get(nr)!.filter((t) => t.zaehlt !== false).sort((a, b) => (a.suffix ?? "").localeCompare(b.suffix ?? ""));
    const richter = gruppe.length ? richterNachRasse(gruppe[0]!, regeln) : null;
    for (const t of gruppe.slice(1)) {
      const eigener = richterNachRasse(t, regeln);
      if (eigener !== richter) abweichend.push({ id: t.id, nummer: `${nr}${t.suffix ?? ""}`, preisrichterId: eigener });
    }
    if (richter == null) {
      ohne += gruppe.length;
      offen = null;
      continue;
    }
    if (offen && offen.preisrichterId === richter) offen.bisNr = nr;
    else {
      offen = { preisrichterId: richter, vonNr: nr, bisNr: nr };
      bereiche.push(offen);
    }
  }
  return { bereiche, abweichend, ohne };
}

/**
 * Aus einer Einteilung nach Nummern (z. B. dem gleichmäßigen Vorschlag) Regeln je Rasse machen: Geht eine Rasse ganz an
 * einen Preisrichter, eine Regel für die Rasse; ist sie geteilt, je Farbenschlag die Mehrheit. Die Jugend einer Rasse
 * (bei „Jugend separat“) ist eine eigene Einheit mit eigenen Regeln (Merkmal `jugend`).
 */
export function regelnAusZuteilung(tiere: (EinteilTier & { preisrichterId: number | null })[]): RassenRegel[] {
  const schluessel = (t: EinteilTier) => JSON.stringify([(t.sparte ?? "").trim(), t.rasse.trim(), !!t.istJugend]);
  const rassen = new Map<string, (EinteilTier & { preisrichterId: number | null })[]>();
  for (const t of tiere) if (t.preisrichterId != null) rassen.set(schluessel(t), [...(rassen.get(schluessel(t)) ?? []), t]);
  const mehrheit = (liste: { preisrichterId: number | null }[]) => {
    const n = new Map<number, number>();
    for (const t of liste) if (t.preisrichterId != null) n.set(t.preisrichterId, (n.get(t.preisrichterId) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const regeln: RassenRegel[] = [];
  for (const liste of rassen.values()) {
    const { sparte, rasse, istJugend } = liste[0]!;
    const merkmal = istJugend ? { jugend: true } : {};
    const richter = new Set(liste.map((t) => t.preisrichterId));
    const haupt = mehrheit(liste)!;
    regeln.push({ preisrichterId: haupt, sparte: (sparte ?? "").trim(), rasse: rasse.trim(), farbenschlag: "", ...merkmal });
    if (richter.size === 1) continue;
    const farben = new Map<string, typeof liste>();
    for (const t of liste) farben.set((t.farbenschlag ?? "").trim(), [...(farben.get((t.farbenschlag ?? "").trim()) ?? []), t]);
    for (const [farbe, f] of farben) {
      const r = mehrheit(f);
      if (farbe && r != null && r !== haupt) regeln.push({ preisrichterId: r, sparte: (sparte ?? "").trim(), rasse: rasse.trim(), farbenschlag: farbe, ...merkmal });
    }
  }
  return regeln;
}
