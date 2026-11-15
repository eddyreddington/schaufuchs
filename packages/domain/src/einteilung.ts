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
}

/** Was ein Tier für die Einteilung ausmacht. */
export interface EinteilTier {
  sparte: string | null;
  rasse: string;
  farbenschlag: string | null;
}

const gleich = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Preisrichter für ein Tier: eine Regel für seinen Farbenschlag geht vor der Regel für die ganze Rasse. */
export function richterNachRasse(t: EinteilTier, regeln: RassenRegel[]): number | null {
  const passend = regeln.filter((r) => gleich(r.sparte, t.sparte) && gleich(r.rasse, t.rasse));
  const farbe = passend.find((r) => r.farbenschlag && gleich(r.farbenschlag, t.farbenschlag));
  if (farbe) return farbe.preisrichterId;
  return passend.find((r) => !r.farbenschlag)?.preisrichterId ?? null;
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
 * einen Preisrichter, eine Regel für die Rasse; ist sie geteilt, je Farbenschlag die Mehrheit.
 */
export function regelnAusZuteilung(tiere: (EinteilTier & { preisrichterId: number | null })[]): RassenRegel[] {
  const schluessel = (t: EinteilTier) => JSON.stringify([(t.sparte ?? "").trim(), t.rasse.trim()]);
  const rassen = new Map<string, (EinteilTier & { preisrichterId: number | null })[]>();
  for (const t of tiere) if (t.preisrichterId != null) rassen.set(schluessel(t), [...(rassen.get(schluessel(t)) ?? []), t]);
  const mehrheit = (liste: { preisrichterId: number | null }[]) => {
    const n = new Map<number, number>();
    for (const t of liste) if (t.preisrichterId != null) n.set(t.preisrichterId, (n.get(t.preisrichterId) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const regeln: RassenRegel[] = [];
  for (const liste of rassen.values()) {
    const { sparte, rasse } = liste[0]!;
    const richter = new Set(liste.map((t) => t.preisrichterId));
    const haupt = mehrheit(liste)!;
    regeln.push({ preisrichterId: haupt, sparte: (sparte ?? "").trim(), rasse: rasse.trim(), farbenschlag: "" });
    if (richter.size === 1) continue;
    const farben = new Map<string, typeof liste>();
    for (const t of liste) farben.set((t.farbenschlag ?? "").trim(), [...(farben.get((t.farbenschlag ?? "").trim()) ?? []), t]);
    for (const [farbe, f] of farben) {
      const r = mehrheit(f);
      if (farbe && r != null && r !== haupt) regeln.push({ preisrichterId: r, sparte: (sparte ?? "").trim(), rasse: rasse.trim(), farbenschlag: farbe });
    }
  }
  return regeln;
}
