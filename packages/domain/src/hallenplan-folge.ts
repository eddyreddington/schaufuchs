/**
 * Reihenfolge der Käfige, wie sie im Plan stehen – Grundlage für „Nach Plan nummerieren“ nach dem Umstellen. Gezählt wird,
 * wie man durch die Halle geht: Reihe für Reihe (quer zu den Reihen aufsteigend), in jeder Reihe vom Anfang zum Ende –
 * in derselben Richtung, in der die Software stellt. Bei einem unveränderten Plan ergibt das genau die bisherige Folge.
 * Einheiten sind ganze Reihen, einzeln verschobene oder gedrehte Grundplatten und Käfigblöcke; jede zählt von ihrem
 * eigenen Anfang, auch gedreht. Volieren (Volierenbereich und eingesetzte Volieren) kommen ans Ende, in der Folge, in der
 * sie aufgebaut werden. Reine Rechnung ohne Datenbank.
 */
import { etageFeld, type FesterPlan, type Hallenplan, nummerFolgeAktiv, type NummerFolge, type PlanKaefig, type Rechteck } from "./hallenplan";
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
 * `folge`: Einstellung der Halle (Startreihe, Richtung, Schlangenlinie, Doppelreihen) – ohne bleibt es bei dieser Folge.
 */
export function planPlaetze(plan: { reihen: Hallenplan["reihen"]; objekte: Pick<Hallenplan["objekte"][number], "kaefige" | "rechteck">[] }, richtung: "quer" | "laengs", folge?: NummerFolge | null): PlanPlatz[] {
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
  const vorwaerts = zeilen.map((z) => z.es.sort((x, y) => x.a - y.a || x.b.von - y.b.von).flatMap((e) => e.ps));
  const ohneRechteck = (ps: Eintrag[], zeile: number) => ps.map(({ rechteck: _, ...p }) => ({ ...p, zeile }));
  if (!nummerFolgeAktiv(folge)) return vorwaerts.flatMap((ps, zeile) => ohneRechteck(ps, zeile));
  // Doppelreihen erkennen an den Reihen selbst (beide Seiten „doppel“, Rücken an Rücken) – nicht an der Lage der Platten,
  // sonst fiele ein Paar mit einer etwas verschobenen Platte still auseinander. Die Reihe einer Zeile: die meisten Plätze.
  const reiheVon = vorwaerts.map((ps) => {
    const n = new Map<number, number>();
    for (const p of ps) if (p.reihe != null) n.set(p.reihe, (n.get(p.reihe) ?? 0) + 1);
    return [...n].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;
  });
  const reihe = new Map(plan.reihen.map((r) => [r.nr, r]));
  const paar = (i: number, j: number) => {
    const x = reihe.get(reiheVon[i] ?? -1), y = reihe.get(reiheVon[j] ?? -1);
    return !!x && !!y && x.art === "doppel" && y.art === "doppel" && (Math.abs(x.x + x.tiefe - y.x) <= 1 || Math.abs(y.x + y.tiefe - x.x) <= 1);
  };
  return gezaehlt(vorwaerts, folge, aVon, paar).flatMap((ps, zeile) => ohneRechteck(ps, zeile));
}

/**
 * Zählung nach der Einstellung: Zeilen (bei Doppelreihen abwechselnd paarweise) in auf- oder absteigender Folge ab der
 * Startreihe (ringsum), jede vorwärts oder rückwärts (Schlangenlinie: im Wechsel). Rückwärts bleibt die Folge der Etagen
 * je Spalte (unten zuerst). Gibt je Gruppe die Plätze in Zählfolge zurück. `zeilen`: je Zeile die Plätze vorwärts (quer
 * zu den Reihen aufsteigend); `paar(i, i+1)`: die beiden Zeilen sind die Seiten einer Doppelreihe.
 */
function gezaehlt(zeilen: Eintrag[][], f: NummerFolge, aVon: (q: Rechteck) => number, paar: (i: number, j: number) => boolean): Eintrag[][] {
  // Gruppen: jede Zeile für sich, bei „abwechselnd“ die beiden Seiten einer Doppelreihe zusammen.
  let gruppen: number[][] = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (f.doppelAbwechselnd && i + 1 < zeilen.length && paar(i, i + 1)) gruppen.push([i, ++i]);
    else gruppen.push([i]);
  }
  if (f.absteigend) gruppen = gruppen.reverse().map((g) => [...g].reverse());
  const hatStart = (i: number) => zeilen[i]!.some((p) => p.reihe === f.startReihe);
  const start = f.startReihe == null ? -1 : gruppen.findIndex((g) => g.some(hatStart));
  if (start > 0) gruppen = [...gruppen.slice(start), ...gruppen.slice(0, start)];
  // Liegt die Startreihe auf der zweiten Seite ihres Paars, beginnt die Zählung dort (die 1 steht, wo man sie hinsetzt).
  if (start >= 0 && gruppen[0]!.length > 1 && !hatStart(gruppen[0]![0]!)) gruppen[0] = [...gruppen[0]!].reverse();
  return gruppen.map((g, k) => {
    const vor = !f.vomEnde !== (!!f.schlange && k % 2 === 1);
    // Lage entlang der Reihe auf ganze cm: beide Seiten derselben Spalte gelten als gleichauf (keine Rundungsfehler).
    const ps = g.flatMap((i, seite) => zeilen[i]!.map((p, idx) => ({ p, seite, idx, a: Math.round(aVon(p.rechteck)) })));
    // Entlang der Reihe vor- oder rückwärts; bei zwei Seiten im Wechsel, je Spalte die Seite in Gruppenfolge; in einer
    // Spalte (Etagen) bleibt die gewohnte Folge.
    ps.sort((x, y) => (vor ? x.a - y.a : y.a - x.a) || x.seite - y.seite || x.idx - y.idx);
    return g.length > 1 || !vor ? ps.map((x) => x.p) : zeilen[g[0]!]!;
  });
}

/** Tier-Ids in der Reihenfolge des Plans (nur Tiere mit Platz). richtung: wie die Halle („quer“: Reihen entlang x). */
export function planFolge(plan: Pick<Hallenplan, "reihen" | "objekte" | "volieren">, richtung: "quer" | "laengs", folge?: NummerFolge | null): number[] {
  const inReihen = planPlaetze(plan, richtung, folge).flatMap((p) => (p.tierId != null ? [p.tierId] : []));
  // Volieren: in der Folge des Aufbaus (Volierenbereich, dann eingesetzte Volieren in der Folge des Einsetzens).
  return [...inReihen, ...plan.volieren.map((v) => v.id), ...plan.objekte.flatMap((o) => (o.tier ? [o.tier.id] : []))];
}

/**
 * Reihenplätze, je mit ihrem Lauf: zusammenhängende Plätze einer Käfiggröße in einer Zeile. Seit die Sparten ohne Lücke
 * hintereinander stehen (14.11.2026), kann dieselbe Größe in einer Reihe mehrmals vorkommen (Hühner, Zwerghühner, Hühner
 * Jugend) – Restplätze vor einer anderen Größe sind dann kein „Platz dazwischen“.
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
 * `nachKaefig` die Käfignummer; `folge`: Einstellung der Halle, wie nummeriert wird). Grundlage für den Hinweis „Jetzt
 * nach Plan nummerieren“. Die Lücken sind räumlich und hängen nicht an der Einstellung.
 */
export function planUnordnung(plan: Pick<Hallenplan, "reihen" | "objekte"> & { fest?: Hallenplan["fest"] }, richtung: "quer" | "laengs", nachKaefig = false, folge?: NummerFolge | null): { freiDazwischen: number; nichtInFolge: number } {
  const plaetze = reihenLaeufe(plan, richtung);
  const { vonHand, freiGemacht } = handZuordnung(plan.fest);
  let freiDazwischen = 0;
  // Je Lauf (Zeile, zusammenhängend eine Käfiggröße): ein Reserveplatz am Ende ist kein „Platz dazwischen“, auch wenn
  // dieselbe Größe weiter hinten in der Reihe oder in einer anderen Reihe weitergeht. Von Hand versetzte Tiere und von Hand
  // frei gemachte Plätze zählen nicht (bewusst frei gemacht, keine Lücke).
  for (const gruppe of new Set(plaetze.map((p) => p.lauf))) {
    const ps = plaetze.filter((p) => p.lauf === gruppe);
    const letzteBelegt = ps.map((p) => p.tierId != null && !vonHand.has(p.tierId)).lastIndexOf(true);
    freiDazwischen += ps.filter((p, i) => p.tierId == null && i < letzteBelegt && !freiGemacht(p)).length;
  }
  let nichtInFolge = 0;
  let vorher: [number, string] | null = null;
  for (const p of planPlaetze(plan, richtung, folge)) {
    if (p.tierId == null) continue;
    const n = nummer(nachKaefig ? (p.kaefig ?? p.nr) : p.nr);
    if (!n) continue;
    if (vorher && (n[0] < vorher[0] || (n[0] === vorher[0] && n[1] < vorher[1]))) nichtInFolge++;
    vorher = n;
  }
  return { freiDazwischen, nichtInFolge };
}

/**
 * Folge der eingesetzten Käfigblöcke im Plan (Indizes in `objekte`) – dieselbe, in der „Nach Plan nummerieren“ zählt. In
 * dieser Folge nehmen die Blöcke die Tiere ohne Platz auf; so bleiben die Nummern nach dem Nummerieren in Planfolge.
 */
export function blockFolge(reihen: Hallenplan["reihen"], objekte: Pick<Hallenplan["objekte"][number], "art" | "typ" | "rechteck">[], richtung: "quer" | "laengs", folge?: NummerFolge | null): number[] {
  const merker = objekte.map((o, i) => ({
    rechteck: o.rechteck,
    kaefige: o.art === "kaefigblock" ? [{ id: -1 - i, typ: o.typ ?? ("huehner" as KaefigTyp), nr: null, rechteck: o.rechteck } as PlanKaefig] : [],
  }));
  return planPlaetze({ reihen, objekte: merker }, richtung, folge).flatMap((p) => (p.tierId != null && p.tierId < 0 ? [-1 - p.tierId] : []));
}
