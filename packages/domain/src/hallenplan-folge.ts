/**
 * Reihenfolge der Käfige, wie sie im Plan stehen – Grundlage für „Nach Plan nummerieren“ nach dem Umstellen. Gezählt wird,
 * wie man durch die Halle geht: Reihe für Reihe (quer zu den Reihen aufsteigend), in jeder Reihe vom Anfang zum Ende –
 * in derselben Richtung, in der die Software stellt. Bei einem unveränderten Plan ergibt das genau die bisherige Folge.
 * Einheiten sind ganze Reihen, einzeln verschobene oder gedrehte Grundplatten und Käfigblöcke; jede zählt von ihrem
 * eigenen Anfang, auch gedreht. Volieren (Volierenbereich und eingesetzte Volieren) kommen ans Ende, in der Folge, in der
 * sie aufgebaut werden. Reine Rechnung ohne Datenbank.
 */
import { etageFeld, type FesterPlan, type Hallenplan, type PlanKaefig, type Rechteck } from "./hallenplan";
import type { KaefigTyp } from "./kaefige";

/** Ein Platz im Plan in der Folge des Plans: belegt (tierId) oder frei; Reihenplätze mit ihrer Lage im Reihensystem. */
export interface PlanPlatz {
  tierId: number | null;
  typ: KaefigTyp;
  /** Reihe (R-Nummer) und Lage im Reihensystem – so steht der Platz im festen Plan; null: Platz in einem Käfigblock. */
  reihe: number | null;
  x: number;
  y: number;
  /** Etage (fehlt: unten). */
  etage?: number;
  /** Nummer des Tieres (Katalognummer bzw. Käfignummer) – zum Erkennen, ob die Nummern dem Plan folgen. */
  nr: string | null;
  kaefig?: string | null;
  /** Laufende Nummer der Zeile im Plan (eine Reihe bzw. Linie, quer zu den Reihen gezählt). */
  zeile: number;
}

type Eintrag = Omit<PlanPlatz, "zeile"> & { rechteck: Rechteck };
type Einheit = { ps: Eintrag[]; a: number; b: { von: number; bis: number }; quer: boolean };

/**
 * Alle Plätze in Reihen und Käfigblöcken (belegt und frei) in der Folge des Plans: Reihe für Reihe (quer zu den Reihen
 * aufsteigend), in jeder Reihe vom Anfang zum Ende. Einheiten sind Grundplatten (eine gedrehte Reihe als Ganzes),
 * einzeln verschobene oder gedrehte Platten und Käfigblöcke; jede zählt von ihrem eigenen Anfang. Volieren nicht.
 */
export function planPlaetze(plan: { reihen: Hallenplan["reihen"]; objekte: Pick<Hallenplan["objekte"][number], "kaefige" | "rechteck">[] }, richtung: "quer" | "laengs"): PlanPlatz[] {
  // A: entlang der Reihen, B: quer dazu (in Hallenkoordinaten; „quer“ = Reihen parallel zur kurzen Seite x).
  const aVon = (q: Rechteck) => (richtung === "quer" ? q.x : q.y);
  const aLang = (q: Rechteck) => (richtung === "quer" ? q.b : q.h);
  const bVon = (q: Rechteck) => (richtung === "quer" ? q.y : q.x);
  const bLang = (q: Rechteck) => (richtung === "quer" ? q.h : q.b);
  // `rahmen`: Lage der ganzen Einheit (Käfigblock) – so zählt ein halb belegter Block wie ein voller an derselben Stelle.
  const einheit = (ps: Eintrag[], rahmen?: Rechteck): Einheit | null => {
    if (!ps.length) return null;
    const qs = rahmen ? [rahmen] : ps.map((p) => p.rechteck);
    const a = Math.min(...qs.map((q) => aVon(q))), aBis = Math.max(...qs.map((q) => aVon(q) + aLang(q)));
    const von = Math.min(...qs.map((q) => bVon(q))), bis = Math.max(...qs.map((q) => bVon(q) + bLang(q)));
    return { ps, a, b: { von, bis }, quer: bis - von > aBis - a + 0.5 };
  };
  const einheiten: Einheit[] = [];
  for (const r of plan.reihen) {
    // Einzeln verschobene oder gedrehte Platten sind eigene Einheiten. Eine gedrehte Reihe zählt als Ganzes von ihrem
    // Anfang; in einer nicht gedrehten Reihe ist jede Grundplatte eine Einheit (so reiht sich eine versetzte Platte an
    // ihrer neuen Stelle ein).
    const eigen = new Set(r.platten.flatMap((pl, i) => (pl.versatz || pl.drehung ? [i] : [])));
    const alle: (Eintrag & { platte?: number })[] = [
      ...r.kaefige.map((k: PlanKaefig) => ({ tierId: k.id, typ: k.typ, reihe: r.nr, x: k.x, y: k.y, ...etageFeld(k.etage), nr: k.nr, kaefig: k.kaefig ?? null, rechteck: k.rechteck, platte: k.platte })),
      ...(r.freiePlaetze ?? []).map((f) => ({ tierId: null, typ: f.typ, reihe: r.nr, x: f.x, y: f.y, ...etageFeld(f.etage), nr: null, kaefig: null, rechteck: f.rechteck, platte: f.platte })),
    ].sort((a, b) => a.y - b.y || (a.etage ?? 0) - (b.etage ?? 0)); // Lage entlang der Reihe (Reihensystem): vom Reihenanfang, je Spalte unten zuerst
    const gruppen = new Map<string, Eintrag[]>();
    for (const p of alle) {
      const schluessel = p.platte != null && eigen.has(p.platte) ? `p${p.platte}` : r.drehung ? "reihe" : p.platte != null ? `p${p.platte}` : `y${p.y}`;
      gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), p]);
    }
    for (const ps of gruppen.values()) {
      const e = einheit(ps);
      if (e) einheiten.push(e);
    }
  }
  for (const o of plan.objekte) {
    const e = einheit((o.kaefige ?? []).map((k) => ({ tierId: k.id, typ: k.typ, reihe: null, x: 0, y: 0, ...etageFeld(k.etage), nr: k.nr, kaefig: k.kaefig ?? null, rechteck: k.rechteck })), o.rechteck);
    if (e) einheiten.push(e);
  }
  // Zeilen aus den Einheiten, die entlang der Reihen liegen (quer dazu auf gleicher Höhe, mindestens zur Hälfte
  // überlappend; die beiden Seiten einer Doppelreihe stoßen nur aneinander – zwei Zeilen). Quergestellte Einheiten kommen
  // in die Zeile, mit der sie sich am meisten überschneiden (sonst eine eigene).
  const ueber = (x: { von: number; bis: number }, y: { von: number; bis: number }) => Math.min(x.bis, y.bis) - Math.max(x.von, y.von);
  const zeilen: { b: { von: number; bis: number }; es: Einheit[] }[] = [];
  for (const e of einheiten.filter((x) => !x.quer).sort((x, y) => x.b.von - y.b.von || x.a - y.a)) {
    const z = zeilen.find((z) => ueber(z.b, e.b) > 0.5 * Math.min(z.b.bis - z.b.von, e.b.bis - e.b.von));
    if (z) z.es.push(e);
    else zeilen.push({ b: { ...e.b }, es: [e] });
  }
  for (const e of einheiten.filter((x) => x.quer)) {
    const beste = zeilen.map((z) => ({ z, u: ueber(z.b, e.b) })).filter((x) => x.u > 0.5).sort((x, y) => y.u - x.u)[0];
    if (beste) beste.z.es.push(e);
    else zeilen.push({ b: { ...e.b }, es: [e] });
  }
  zeilen.sort((x, y) => x.b.von - y.b.von);
  return zeilen.flatMap((z, zeile) => z.es.sort((x, y) => x.a - y.a || x.b.von - y.b.von).flatMap((e) => e.ps.map(({ rechteck: _, ...p }) => ({ ...p, zeile }))));
}

/** Tier-Ids in der Reihenfolge des Plans (nur Tiere mit Platz). richtung: wie die Halle („quer“: Reihen entlang x). */
export function planFolge(plan: Pick<Hallenplan, "reihen" | "objekte" | "volieren">, richtung: "quer" | "laengs"): number[] {
  const inReihen = planPlaetze(plan, richtung).flatMap((p) => (p.tierId != null ? [p.tierId] : []));
  // Volieren: in der Folge des Aufbaus (Volierenbereich, dann eingesetzte Volieren in der Folge des Einsetzens).
  return [...inReihen, ...plan.volieren.map((v) => v.id), ...plan.objekte.flatMap((o) => (o.tier ? [o.tier.id] : []))];
}

/**
 * Reihenplätze, je mit ihrem Lauf: zusammenhängende Plätze einer Käfiggröße in einer Zeile. Seit die Sparten ohne Lücke
 * hintereinander stehen (14.11.2026), kann dieselbe Größe in einer Reihe mehrmals vorkommen (Hühner, Zwerghühner, Hühner
 * Jugend) – Restplätze vor einer anderen Größe sind dann kein „Platz dazwischen“, und kein Tier rückt über die andere Größe.
 */
function reihenLaeufe(plan: Pick<Hallenplan, "reihen" | "objekte">, richtung: "quer" | "laengs"): (PlanPlatz & { lauf: number })[] {
  let lauf = 0;
  let vorher: PlanPlatz | null = null;
  const aus: (PlanPlatz & { lauf: number })[] = [];
  for (const p of planPlaetze(plan, richtung)) {
    if (!vorher || vorher.zeile !== p.zeile || vorher.typ !== p.typ) lauf++;
    vorher = p;
    if (p.reihe != null) aus.push({ ...p, lauf });
  }
  return aus;
}

/** Von Hand versetzte Tiere und von Hand frei gemachte Reihenplätze (siehe `FesterPlan.vonHand`/`freiGemacht`). */
function handZuordnung(fest: Pick<FesterPlan, "vonHand" | "freiGemacht"> | null | undefined) {
  const vonHand = new Set(fest?.vonHand ?? []);
  const frei = fest?.freiGemacht ?? [];
  const freiGemacht = (p: { reihe: number | null; x: number; y: number; etage?: number }) =>
    p.reihe != null && frei.some((f) => f.reihe === p.reihe && Math.abs(f.x - p.x) < 0.5 && Math.abs(f.y - p.y) < 0.5 && (f.etage ?? 0) === (p.etage ?? 0));
  return { vonHand, freiGemacht };
}

/** Nummer als vergleichbarer Wert: „12a“ → [12, "a"]; leer → null. */
function nummer(n: string | null | undefined): [number, string] | null {
  const m = /^(\d+)(.*)$/.exec((n ?? "").trim());
  return m ? [Number(m[1]), m[2]!] : null;
}

/**
 * Wie unordentlich der (feste) Plan nach dem Umstellen ist: freie Plätze mitten zwischen belegten derselben Käfiggröße
 * (dahinter steht noch ein Tier dieser Größe) und wie oft die Nummern in Planfolge fallen (Katalognummer, mit
 * `nachKaefig` die Käfignummer). Grundlage für den Hinweis „Jetzt nach Plan nummerieren“.
 */
export function planUnordnung(plan: Pick<Hallenplan, "reihen" | "objekte"> & { fest?: Hallenplan["fest"] }, richtung: "quer" | "laengs", nachKaefig = false): { freiDazwischen: number; nichtInFolge: number } {
  const plaetze = reihenLaeufe(plan, richtung);
  const { vonHand, freiGemacht } = handZuordnung(plan.fest);
  let freiDazwischen = 0;
  // Je Lauf (Zeile, zusammenhängend eine Käfiggröße): ein Reserveplatz am Ende ist kein „Platz dazwischen“, auch wenn
  // dieselbe Größe weiter hinten in der Reihe oder in einer anderen Reihe weitergeht. Von Hand versetzte Tiere und von Hand
  // frei gemachte Plätze zählen nicht (dort rückt beim Auffüllen nichts).
  for (const gruppe of new Set(plaetze.map((p) => p.lauf))) {
    const ps = plaetze.filter((p) => p.lauf === gruppe);
    const letzteBelegt = ps.map((p) => p.tierId != null && !vonHand.has(p.tierId)).lastIndexOf(true);
    freiDazwischen += ps.filter((p, i) => p.tierId == null && i < letzteBelegt && !freiGemacht(p)).length;
  }
  let nichtInFolge = 0;
  let vorher: [number, string] | null = null;
  for (const p of planPlaetze(plan, richtung)) {
    if (p.tierId == null) continue;
    const n = nummer(nachKaefig ? (p.kaefig ?? p.nr) : p.nr);
    if (!n) continue;
    if (vorher && (n[0] < vorher[0] || (n[0] === vorher[0] && n[1] < vorher[1]))) nichtInFolge++;
    vorher = n;
  }
  return { freiDazwischen, nichtInFolge };
}

/**
 * Lückenlos auffüllen (fester Plan): in jeder Reihe (Zeile des Plans) rücken die Tiere je Käfiggröße in der Folge des
 * Plans in die Plätze dieser Größe, die freien wandern ans Ende dieser Größe (je zusammenhängendem Lauf, `reihenLaeufe`). Kein Tier kommt in einen Platz anderer Größe; Volieren und Käfigblöcke
 * bleiben. Tiere auf angebauten Platten (Nachmeldungen, nicht im festen Plan) rücken in frei gewordene feste Plätze –
 * was danach übrig bleibt, stellt der feste Plan wie gewohnt.
 */
export function luekenlosAuffuellen(fest: FesterPlan, plan: Pick<Hallenplan, "reihen" | "objekte">, richtung: "quer" | "laengs"): { fest: FesterPlan; verschoben: number } {
  const schluessel = (reihe: number, x: number, y: number, etage?: number) => `${reihe}|${x}|${y}|${etage ?? 0}`;
  const imFest = new Set(fest.reihen.flatMap((r) => r.plaetze.map((p) => schluessel(r.nr, p.x, p.y, p.etage))));
  const plaetze = reihenLaeufe(plan, richtung);
  const { vonHand, freiGemacht } = handZuordnung(fest);
  const neu = new Map<string, number | null>();
  // Je Lauf (Zeile, zusammenhängend eine Käfiggröße) – kein Tier rückt in eine andere Reihe oder über eine andere Größe.
  // Von Hand versetzte Tiere bleiben, wo sie stehen, von Hand frei gemachte Plätze bleiben frei (Rückmeldung 15.11.2026); die
  // übrigen Tiere rücken in die übrigen Plätze.
  for (const gruppe of new Set(plaetze.map((p) => p.lauf))) {
    const ps = plaetze.filter((p) => p.lauf === gruppe);
    const bleibt = (p: (typeof ps)[number]) => (p.tierId != null && vonHand.has(p.tierId)) || (p.tierId == null && freiGemacht(p));
    const tiere = ps.flatMap((p) => (p.tierId != null && !bleibt(p) ? [p.tierId] : []));
    ps.filter((p) => !bleibt(p) && imFest.has(schluessel(p.reihe!, p.x, p.y, p.etage))).forEach((p, i) => neu.set(schluessel(p.reihe!, p.x, p.y, p.etage), tiere[i] ?? null));
  }
  // Wo steht jedes Tier jetzt im Plan (auch auf einer angebauten Platte)? Gezählt wird, wer einen anderen Platz bekommt.
  const bisher = new Map(plaetze.flatMap((p) => (p.tierId != null ? [[p.tierId, schluessel(p.reihe!, p.x, p.y, p.etage)] as const] : [])));
  let verschoben = 0;
  const reihen = fest.reihen.map((r) => ({
    ...r,
    plaetze: r.plaetze.map((p) => {
      const k = schluessel(r.nr, p.x, p.y, p.etage);
      if (!neu.has(k)) return p;
      const tierId = neu.get(k)!;
      if (tierId != null && bisher.get(tierId) !== k) verschoben++;
      return { ...p, tierId };
    }),
  }));
  return { fest: { ...fest, reihen }, verschoben };
}

/**
 * Folge der eingesetzten Käfigblöcke im Plan (Indizes in `objekte`) – dieselbe, in der „Nach Plan nummerieren“ zählt. In
 * dieser Folge nehmen die Blöcke die Tiere ohne Platz auf; so bleiben die Nummern nach dem Nummerieren in Planfolge.
 */
export function blockFolge(reihen: Hallenplan["reihen"], objekte: Pick<Hallenplan["objekte"][number], "art" | "typ" | "rechteck">[], richtung: "quer" | "laengs"): number[] {
  const merker = objekte.map((o, i) => ({
    rechteck: o.rechteck,
    kaefige: o.art === "kaefigblock" ? [{ id: -1 - i, typ: o.typ ?? ("huehner" as KaefigTyp), nr: null, rechteck: o.rechteck } as PlanKaefig] : [],
  }));
  return planPlaetze({ reihen, objekte: merker }, richtung).flatMap((p) => (p.tierId != null && p.tierId < 0 ? [-1 - p.tierId] : []));
}
