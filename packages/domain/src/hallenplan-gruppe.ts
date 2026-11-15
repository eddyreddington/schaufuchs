/**
 * Hallenplan von Hand bearbeiten: Teile wählen (auch mehrere) und zusammen verschieben. Ein Teil ist eine ganze Reihe,
 * eine einzelne Grundplatte mit ihren Käfigen, ein eingesetztes Teil (Voliere, Käfigblock) oder eine Fläche. Verschoben
 * wird immer die ganze Auswahl um denselben Weg – als eine Änderung der Halle (ein Speichern, ein Protokolleintrag).
 * Vorher prüft `pruefeVerschiebung`, ob dabei etwas neu über die Hallenwand ragt oder auf einem anderen Teil zu stehen
 * käme; dann bleibt die ganze Auswahl stehen. Reine Rechnung ohne Datenbank.
 */
import type { Halle, Rechteck } from "./hallenplan";

/** Ein von Hand verschiebbares Teil des Hallenplans (Fläche über ihre laufende Nummer in `halle.flaechen`). */
export type HallenTeil =
  | { art: "flaeche"; i: number }
  | { art: "objekt"; id: string }
  | { art: "reihe"; nr: number }
  | { art: "platte"; reihe: number; i: number };

/** Eindeutiger Schlüssel eines Teils (zum Vergleichen und Nachschlagen). */
export function teilSchluessel(t: HallenTeil): string {
  if (t.art === "flaeche") return `f${t.i}`;
  if (t.art === "objekt") return `o${t.id}`;
  if (t.art === "reihe") return `r${t.nr}`;
  return `p${t.reihe}.${t.i}`;
}

export const gleichesTeil = (a: HallenTeil | null | undefined, b: HallenTeil | null | undefined): boolean => !!a && !!b && teilSchluessel(a) === teilSchluessel(b);

/** Teil in die Auswahl aufnehmen bzw. wieder herausnehmen (Umschalt-, Strg- oder Cmd-Klick, Schalter „Mehrfachauswahl“). */
export function auswahlUmschalten(auswahl: HallenTeil[], t: HallenTeil): HallenTeil[] {
  const s = teilSchluessel(t);
  return auswahl.some((a) => teilSchluessel(a) === s) ? auswahl.filter((a) => teilSchluessel(a) !== s) : [...auswahl, t];
}

/**
 * Auswahl zum Verschieben: jedes Teil einmal; Grundplatten einer ebenfalls gewählten Reihe fallen weg – sie gehen mit
 * ihrer Reihe (sonst würden sie doppelt verschoben).
 */
export function auswahlBereinigen(auswahl: HallenTeil[]): HallenTeil[] {
  const reihen = new Set(auswahl.flatMap((t) => (t.art === "reihe" ? [t.nr] : [])));
  const gesehen = new Set<string>();
  return auswahl.filter((t) => {
    const s = teilSchluessel(t);
    if (gesehen.has(s) || (t.art === "platte" && reihen.has(t.reihe))) return false;
    gesehen.add(s);
    return true;
  });
}

/**
 * Alle Teile der Auswahl um dx/dy (cm, Hallenkoordinaten: x entlang der Breite, y entlang der Länge) verschieben. Die
 * Abstände der Teile untereinander bleiben. Drehungen bleiben erhalten; steht eine Reihe oder Platte danach wieder an
 * ihrem gerechneten Platz (ohne Drehung), fällt ihr Versatz-Eintrag weg.
 */
export function verschiebeTeile(halle: Halle, auswahl: HallenTeil[], dx: number, dy: number): Halle {
  if (!dx && !dy) return halle;
  const teile = auswahlBereinigen(auswahl);
  const flaechen = new Set(teile.flatMap((t) => (t.art === "flaeche" ? [t.i] : [])));
  const objekte = new Set(teile.flatMap((t) => (t.art === "objekt" ? [t.id] : [])));
  let reihenVersatz = [...(halle.reihenVersatz ?? [])];
  let plattenVersatz = [...(halle.plattenVersatz ?? [])];
  const bleibt = (v: { dx: number; dy: number; drehung?: number }) => !!(v.dx || v.dy || v.drehung);
  for (const t of teile) {
    if (t.art === "reihe") {
      const alt = reihenVersatz.find((x) => x.nr === t.nr) ?? { nr: t.nr, dx: 0, dy: 0 };
      const neu = { ...alt, dx: alt.dx + dx, dy: alt.dy + dy };
      reihenVersatz = [...reihenVersatz.filter((x) => x.nr !== t.nr), ...(bleibt(neu) ? [neu] : [])];
    } else if (t.art === "platte") {
      const gleich = (x: { reihe: number; platte: number }) => x.reihe === t.reihe && x.platte === t.i;
      const alt = plattenVersatz.find(gleich) ?? { reihe: t.reihe, platte: t.i, dx: 0, dy: 0 };
      const neu = { ...alt, dx: alt.dx + dx, dy: alt.dy + dy };
      plattenVersatz = [...plattenVersatz.filter((x) => !gleich(x)), ...(bleibt(neu) ? [neu] : [])];
    }
  }
  return {
    ...halle,
    flaechen: halle.flaechen.map((f, i) => (flaechen.has(i) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
    objekte: (halle.objekte ?? []).map((o) => (objekte.has(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o)),
    reihenVersatz,
    plattenVersatz,
  };
}

/**
 * Etwas, das im Plan Platz einnimmt, mit seiner Lage im aktuellen Entwurf. `teil`: das verschiebbare Teil, zu dem es
 * gehört (eine Grundplatte geht außerdem mit ihrer Reihe); `null` = steht fest (z. B. Volieren im Volierenbereich).
 * `nurGrenze`: nur gegen die Hallenwand prüfen, nicht gegen andere Teile (Volierenbereich – Volieren gehören hinein).
 * `flaeche`: freier Bereich oder Eingang – Hindernis für Reihen, Platten und Teile, aber nicht für andere Flächen (wie
 * die Hinweise unter dem Plan, siehe `planeHalle`).
 */
export interface PlanKoerper {
  teil: HallenTeil | null;
  name: string;
  rechteck: Rechteck;
  nurGrenze?: boolean;
  flaeche?: boolean;
  /** Tisch, Bank, Garnitur: darf in einem freien Bereich stehen (Cafeteria …). */
  moebel?: boolean;
  /** Freier Bereich (Bühne, Kasse, Cafeteria) – dort dürfen Tische und Bänke stehen. */
  freiBereich?: boolean;
  /** Hindernis nur für Tische und Bänke (früher der Gang vor den Käfigen; Tische und Bänke stehen jetzt frei). */
  nurMoebel?: boolean;
  /** Gang vor einem Ein- oder Ausgang: frei für Käfige; Tische und Bänke dürfen hinein (der Plan gibt dann einen Hinweis). */
  fluchtweg?: boolean;
}

export type VerschiebePruefung = { ok: true } | { ok: false; grund: "grenze" | "kollision"; meldung: string };

/** Stören sich zwei Körper? Flächen nicht untereinander, Möbel nicht mit freien Bereichen, der Gang vor Käfigen nur Möbel. */
const stoert = (k: PlanKoerper, f: PlanKoerper) =>
  !(k.flaeche && f.flaeche) &&
  !(k.moebel && (f.freiBereich || f.fluchtweg)) &&
  !((k.freiBereich || k.fluchtweg) && f.moebel) &&
  (!f.nurMoebel || !!k.moebel) &&
  (!k.nurMoebel || !!f.moebel);

/** Spiel in cm: Anstoßen ist erlaubt, Rundungen beim Drehen zählen nicht als Überlappung. */
const SPIEL = 1;

function ueberlappung(a: Rechteck, b: Rechteck): number {
  const w = Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > SPIEL && h > SPIEL ? w * h : 0;
}

/** Wie weit ein Rechteck über jede der vier Hallenwände ragt (cm; links, oben, rechts, unten). */
function ueberstand(q: Rechteck, halle: Pick<Halle, "breite" | "laenge">): number[] {
  return [-q.x, -q.y, q.x + q.b - halle.breite, q.y + q.h - halle.laenge].map((v) => Math.max(0, v));
}

const weiter = (q: Rechteck, dx: number, dy: number): Rechteck => ({ ...q, x: q.x + dx, y: q.y + dy });

/**
 * Darf die Auswahl um dx/dy verschoben werden? Nein, wenn danach ein verschobener Teil über eine Hallenwand weiter
 * hinausragt als vorher oder stärker mit einem nicht verschobenen Teil überlappt als vorher. Was schon schief steht, lässt sich so
 * immer noch herausziehen. Teile der Auswahl untereinander stören sich nicht (sie rücken gemeinsam).
 */
export function pruefeVerschiebung(halle: Pick<Halle, "breite" | "laenge">, koerper: PlanKoerper[], auswahl: HallenTeil[], dx: number, dy: number): VerschiebePruefung {
  if (!dx && !dy) return { ok: true };
  const teile = auswahlBereinigen(auswahl);
  const gewaehlt = new Set(teile.map(teilSchluessel));
  const reihen = new Set(teile.flatMap((t) => (t.art === "reihe" ? [t.nr] : [])));
  const bewegt = (k: PlanKoerper) => !!k.teil && (gewaehlt.has(teilSchluessel(k.teil)) || (k.teil.art === "platte" && reihen.has(k.teil.reihe)));
  const mit = koerper.filter(bewegt);
  const fest = koerper.filter((k) => !bewegt(k) && !k.nurGrenze);
  const nachsatz = teile.length > 1 ? " Die ganze Auswahl bleibt an ihrem Platz." : "";
  for (const k of mit) {
    const vorher = ueberstand(k.rechteck, halle);
    // Je Wand für sich: was schon über eine Wand ragt, darf nicht zusätzlich über eine andere.
    if (ueberstand(weiter(k.rechteck, dx, dy), halle).some((v, i) => v > vorher[i]! + 0.5))
      return { ok: false, grund: "grenze", meldung: `Nicht verschoben: „${k.name}“ ragte dann über die Hallenwand.${nachsatz}` };
  }
  for (const k of mit) {
    if (k.nurGrenze) continue;
    const q = weiter(k.rechteck, dx, dy);
    const anderes = fest.find((f) => stoert(k, f) && ueberlappung(q, f.rechteck) > ueberlappung(k.rechteck, f.rechteck) + 0.5);
    if (anderes) return { ok: false, grund: "kollision", meldung: `Nicht verschoben: „${k.name}“ stünde dann auf „${anderes.name}“.${nachsatz}` };
  }
  return { ok: true };
}

/**
 * Wege (cm) entlang einer Achse, um die eine Gruppe rücken müsste, damit eine ihrer Kanten bündig an einer Kante eines
 * anderen Teils steht: daneben (die Teile liegen quer dazu auf gleicher Höhe) oder in einer Flucht (die Teile liegen quer
 * dazu dicht beieinander, höchstens `fang` entfernt). Nur Wege unter `fang`.
 */
function kantenWege(gruppe: Rechteck[], andere: Rechteck[], achse: "x" | "y", fang: number, ueberlappend = false, flucht = true, linie: Rechteck[] = [], reichweite = 250): number[] {
  const v = (q: Rechteck) => (achse === "x" ? { a: q.x, l: q.b, qa: q.y, ql: q.h } : { a: q.y, l: q.h, qa: q.x, ql: q.b });
  const wege: number[] = [];
  for (const g of gruppe.map(v))
    for (const o of andere.map(v)) {
      const quer = Math.min(g.qa + g.ql, o.qa + o.ql) - Math.max(g.qa, o.qa);
      const entlang = Math.min(g.a + g.l, o.a + o.l) - Math.max(g.a, o.a);
      // Was sich schon überlappt, ist kein Nachbar zum Anlegen (beim Ziehen: knapp darüber geschoben → bündig zurück).
      if (quer > SPIEL) {
        if (entlang <= SPIEL || ueberlappend) wege.push(o.a + o.l - g.a, o.a - (g.a + g.l));
      } else if (flucht && -quer <= fang && quer <= SPIEL) wege.push(o.a - g.a, o.a + o.l - (g.a + g.l));
    }
  // Flucht in der Linie einer Reihe: Grundplatten, die quer zur Reihe überwiegend auf gleicher Höhe stehen (dieselbe Linie)
  // und entlang höchstens `reichweite` entfernt – vordere bzw. hintere Kante gleich (auch mit Abstand dazwischen).
  for (const g of gruppe.map(v))
    for (const o of linie.map(v)) {
      const quer = Math.min(g.qa + g.ql, o.qa + o.ql) - Math.max(g.qa, o.qa);
      const entlang = Math.min(g.a + g.l, o.a + o.l) - Math.max(g.a, o.a);
      // Nur quer zur Reihe (über die kurze Seite beider Platten) – Anfänge verschiedener Reihen richten sich nicht aneinander.
      const querZurReihe = g.l < g.ql && o.l < o.ql;
      if (querZurReihe && quer <= SPIEL && -quer <= reichweite && entlang > 0.5 * Math.min(g.l, o.l)) wege.push(o.a - g.a, o.a + o.l - (g.a + g.l));
    }
  return wege.filter((w) => Math.abs(w) < fang - 1e-9);
}

const naechster = (wege: number[]) => (wege.length ? wege.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)) : null);

/**
 * Beim Ziehen bündig einrasten: Landet eine Kante der Auswahl nach dem Weg dx/dy weniger als `fang` cm (Raster) neben einer
 * Kante eines anderen Teils oder der Hallenwand, rückt sie bündig daran bzw. in dessen Flucht. Sonst bleibt der Weg. So
 * steht eine Platte bündig an einer Reihe, auch wenn deren Kante nicht auf dem 10-cm-Raster liegt (die Software verteilt
 * die Gänge gleichmäßig) – statt einer Lücke von ein paar Zentimetern.
 */
export function anKantenEinrasten(halle: Pick<Halle, "breite" | "laenge">, koerper: PlanKoerper[], auswahl: HallenTeil[], dx: number, dy: number, fang = 10): { dx: number; dy: number } {
  const teile = auswahlBereinigen(auswahl);
  const gewaehlt = new Set(teile.map(teilSchluessel));
  const reihen = new Set(teile.flatMap((t) => (t.art === "reihe" ? [t.nr] : [])));
  const bewegt = (k: PlanKoerper) => !!k.teil && (gewaehlt.has(teilSchluessel(k.teil)) || (k.teil.art === "platte" && reihen.has(k.teil.reihe)));
  const mit = koerper.filter((k) => bewegt(k) && !k.nurGrenze).map((k) => weiter(k.rechteck, dx, dy));
  if (!mit.length) return { dx, dy };
  const andere = koerper.filter((k) => !bewegt(k)).map((k) => k.rechteck);
  const linie = koerper.filter((k) => !bewegt(k) && k.teil?.art === "platte").map((k) => k.rechteck);
  const wand = (achse: "x" | "y") => {
    const max = achse === "x" ? halle.breite : halle.laenge;
    return mit.flatMap((q) => (achse === "x" ? [-q.x, max - (q.x + q.b)] : [-q.y, max - (q.y + q.h)])).filter((w) => Math.abs(w) < fang - 1e-9);
  };
  const rund = (v: number) => Math.round(v * 100) / 100;
  const wx = naechster([...kantenWege(mit, andere, "x", fang, true, true, linie), ...wand("x")]);
  const wy = naechster([...kantenWege(mit, andere, "y", fang, true, true, linie), ...wand("y")]);
  return { dx: rund(dx + (wx ?? 0)), dy: rund(dy + (wy ?? 0)) };
}

export type AusrichtenErgebnis = { ok: true; halle: Halle; bewegt: number } | { ok: false; meldung: string };

/**
 * Am Raster ausrichten: jedes Teil (bzw. jede Gruppe aneinanderstehender Teile, z. B. die beiden Seiten einer Doppelreihe)
 * rückt mit seiner linken oberen Ecke auf den nächsten Rasterpunkt – oder bündig an die Hallenwand, wenn die näher liegt.
 * Was bündig an etwas anderem steht (Bühne, nicht gewähltes Teil), bleibt in dieser Richtung bündig.
 * auswahl null: alles; sonst nur die gewählten Teile. Ganze Reihen rücken als Reihe; eine einzeln verschobene Grundplatte
 * richtet sich für sich aus. Danach dieselbe Prüfung wie beim Verschieben (Hallenwand, andere Teile) – bei einem Konflikt
 * bleibt alles, wie es ist. Eine Änderung der Halle.
 */
export function rasterAusrichten(halle: Halle, koerper: PlanKoerper[], auswahl: HallenTeil[] | null, raster = 10): AusrichtenErgebnis {
  const gewaehlt = auswahl ? auswahlBereinigen(auswahl) : null;
  const gewaehltS = new Set((gewaehlt ?? []).map(teilSchluessel));
  const reihenGewaehlt = new Set((gewaehlt ?? []).flatMap((t) => (t.art === "reihe" ? [t.nr] : [])));
  const eigeneLage = (r: number, i: number) => (halle.plattenVersatz ?? []).some((v) => v.reihe === r && v.platte === i && (v.dx || v.dy || v.drehung));
  /** Einheit, mit der ein Körper rückt (null: bleibt stehen). */
  const einheit = (k: PlanKoerper): HallenTeil | null => {
    const t = k.teil;
    if (!t) return null;
    if (t.art === "platte") {
      const alsPlatte = gewaehlt ? gewaehltS.has(teilSchluessel(t)) || (reihenGewaehlt.has(t.reihe) && eigeneLage(t.reihe, t.i)) : eigeneLage(t.reihe, t.i);
      if (alsPlatte) return t;
      return !gewaehlt || reihenGewaehlt.has(t.reihe) ? { art: "reihe", nr: t.reihe } : null;
    }
    return !gewaehlt || gewaehltS.has(teilSchluessel(t)) ? t : null;
  };
  const einheiten = new Map<string, { teil: HallenTeil; koerper: PlanKoerper[] }>();
  const zuEinheit = new Map<PlanKoerper, string>();
  for (const k of koerper) {
    const e = einheit(k);
    if (!e) continue;
    const s = teilSchluessel(e);
    if (!einheiten.has(s)) einheiten.set(s, { teil: e, koerper: [] });
    einheiten.get(s)!.koerper.push(k);
    zuEinheit.set(k, s);
  }
  // Gruppen: Einheiten, deren Teile bündig aneinanderstoßen (±1 cm, z. B. die beiden Seiten einer Doppelreihe), rücken
  // gemeinsam – sie bleiben aneinander. Was sich überlappt, steht ohnehin schief und richtet sich für sich aus. Flächen
  // verbinden nichts (an einer Bühne enden viele Reihen; sie richten sich einzeln aus).
  const wurzel = new Map([...einheiten.keys()].map((s) => [s, s]));
  const finde = (s: string): string => (wurzel.get(s) === s ? s : finde(wurzel.get(s)!));
  const beruehrt = (a: Rechteck, b: Rechteck) => {
    const w = Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (Math.abs(w) <= SPIEL && h > SPIEL) || (Math.abs(h) <= SPIEL && w > SPIEL);
  };
  const bewegte = koerper.filter((k) => zuEinheit.has(k));
  for (let i = 0; i < bewegte.length; i++)
    for (let j = i + 1; j < bewegte.length; j++) {
      const a = zuEinheit.get(bewegte[i]!)!, b = zuEinheit.get(bewegte[j]!)!;
      const flaeche = (k: PlanKoerper) => k.flaeche || k.nurGrenze || k.moebel || k.teil?.art === "flaeche";
      if (flaeche(bewegte[i]!) || flaeche(bewegte[j]!)) continue;
      if (a !== b && finde(a) !== finde(b) && beruehrt(bewegte[i]!.rechteck, bewegte[j]!.rechteck)) wurzel.set(finde(a), finde(b));
    }
  // Weg je Gruppe: linke obere Ecke aufs Raster, oder bündig an die Wand, wenn das näher liegt.
  const einrasten = (v: number, groesse: number, max: number) => {
    const ziele = [Math.round(v / raster) * raster, ...(Math.abs(v) < raster ? [0] : []), ...(Math.abs(max - groesse - v) < raster ? [max - groesse] : [])];
    const ziel = ziele.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const d = Math.round((ziel - v) * 100) / 100;
    return Math.abs(d) < 0.01 ? 0 : d;
  };
  const gruppen = new Map<string, PlanKoerper[]>();
  for (const k of bewegte) {
    const g = finde(zuEinheit.get(k)!);
    gruppen.set(g, [...(gruppen.get(g) ?? []), k]);
  }
  // Was bündig an etwas anderem steht (Fläche, nicht gewähltes Teil, Nachbarplatte), rückt in dieser Richtung nicht – und
  // steht es mit ihm in einer Flucht, auch quer dazu nicht (eine gewählte Platte bleibt in der Flucht ihrer Reihe).
  const sperre = (g: string, ks: PlanKoerper[]) => {
    let x = false, y = false;
    for (const k of ks)
      for (const o of koerper) {
        if (zuEinheit.has(o) && finde(zuEinheit.get(o)!) === g) continue;
        const a = k.rechteck, b = o.rechteck;
        const w = Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (Math.abs(w) <= SPIEL && h > SPIEL) {
          x = true;
          if (Math.abs(a.y - b.y) <= SPIEL) y = true;
        }
        if (Math.abs(h) <= SPIEL && w > SPIEL) {
          y = true;
          if (Math.abs(a.x - b.x) <= SPIEL) x = true;
        }
      }
    return { x, y };
  };
  const weg = new Map<string, { dx: number; dy: number }>();
  /** Lage eines Körpers mit dem Weg, der für seine Gruppe schon feststeht (die Gruppen werden nacheinander gerechnet). */
  const jetzt = (o: PlanKoerper) => {
    const w = zuEinheit.has(o) ? weg.get(finde(zuEinheit.get(o)!)) : undefined;
    return w ? weiter(o.rechteck, w.dx, w.dy) : o.rechteck;
  };
  for (const [g, ks] of gruppen) {
    const x = Math.min(...ks.map((k) => k.rechteck.x)), y = Math.min(...ks.map((k) => k.rechteck.y));
    const b = Math.max(...ks.map((k) => k.rechteck.x + k.rechteck.b)) - x, h = Math.max(...ks.map((k) => k.rechteck.y + k.rechteck.h)) - y;
    const fest = sperre(g, ks);
    // Steht ein Nachbar (nicht in dieser Gruppe) weniger als ein Raster entfernt, rückt die Gruppe bündig an ihn bzw. in
    // seine Flucht – eine kleine Lücke schließt sich, statt aufs Raster gerundet zu werden.
    // Flächen legt man bewusst; sie richten sich nur am Raster aus, nicht an Nachbarn.
    const nurFlaeche = ks.every((k) => k.flaeche || k.nurGrenze || k.teil?.art === "flaeche");
    const eigene = ks.filter((k) => !(k.flaeche || k.nurGrenze)).map((k) => k.rechteck);
    const fremdeK = koerper.filter((o) => !(zuEinheit.has(o) && finde(zuEinheit.get(o)!) === g));
    const fremde = fremdeK.map(jetzt);
    const linie = fremdeK.filter((o) => o.teil?.art === "platte").map(jetzt);
    // Nur „bündig daneben“; die Flucht mit Teilen davor oder dahinter zählt beim Ausrichten nicht (die gibt das Raster vor).
    const nx = nurFlaeche ? null : naechster(kantenWege(eigene, fremde, "x", raster, false, false, linie));
    const ny = nurFlaeche ? null : naechster(kantenWege(eigene, fremde, "y", raster, false, false, linie));
    const runde = (v: number) => (Math.abs(v) < 0.01 ? 0 : Math.round(v * 100) / 100);
    weg.set(g, {
      dx: fest.x ? 0 : nx != null ? runde(nx) : einrasten(x, b, halle.breite),
      dy: fest.y ? 0 : ny != null ? runde(ny) : einrasten(y, h, halle.laenge),
    });
  }
  const wegVon = (k: PlanKoerper) => (zuEinheit.has(k) ? weg.get(finde(zuEinheit.get(k)!))! : { dx: 0, dy: 0 });
  if ([...weg.values()].every((w) => !w.dx && !w.dy)) return { ok: true, halle, bewegt: 0 };

  // Prüfen wie beim Verschieben: nichts neu über die Wand, nichts neu auf einem anderen Teil (je Gruppe eigener Weg).
  const nachsatz = " Es wurde nichts verändert.";
  for (const k of bewegte) {
    const w = wegVon(k);
    if (!w.dx && !w.dy) continue;
    const vorher = ueberstand(k.rechteck, halle);
    if (ueberstand(weiter(k.rechteck, w.dx, w.dy), halle).some((v, i) => v > vorher[i]! + 0.5))
      return { ok: false, meldung: `Nicht ausgerichtet: „${k.name}“ ragte dann über die Hallenwand.${nachsatz}` };
  }
  for (const k of bewegte) {
    const w = wegVon(k);
    if ((!w.dx && !w.dy) || k.nurGrenze) continue;
    const g = finde(zuEinheit.get(k)!);
    const q = weiter(k.rechteck, w.dx, w.dy);
    for (const f of koerper) {
      if (f === k || f.nurGrenze || !stoert(k, f)) continue;
      if (zuEinheit.has(f) && finde(zuEinheit.get(f)!) === g) continue;
      const wf = wegVon(f);
      const qf = weiter(f.rechteck, wf.dx, wf.dy);
      if (ueberlappung(q, qf) > ueberlappung(k.rechteck, f.rechteck) + 0.5) return { ok: false, meldung: `Nicht ausgerichtet: „${k.name}“ stünde dann auf „${f.name}“.${nachsatz}` };
    }
  }

  // Übernehmen: Reihen zuerst; eine eigene Platte rückt um ihren Weg abzüglich dessen, was ihre Reihe schon rückt.
  let neu = halle;
  let bewegt = 0;
  const wegEinheit = (s: string) => weg.get(finde(s))!;
  for (const [s, e] of einheiten) {
    if (e.teil.art === "platte") continue;
    const w = wegEinheit(s);
    if (!w.dx && !w.dy) continue;
    neu = verschiebeTeile(neu, [e.teil], w.dx, w.dy);
    bewegt++;
  }
  for (const [s, e] of einheiten) {
    if (e.teil.art !== "platte") continue;
    const w = wegEinheit(s);
    const r = einheiten.has(`r${e.teil.reihe}`) ? wegEinheit(`r${e.teil.reihe}`) : { dx: 0, dy: 0 };
    const dx = w.dx - r.dx, dy = w.dy - r.dy;
    if (w.dx || w.dy) bewegt++;
    if (dx || dy) neu = verschiebeTeile(neu, [e.teil], dx, dy);
  }
  return { ok: true, halle: neu, bewegt };
}

/**
 * Darf ein Teil künftig an `rechteck` stehen (z. B. nach dem Drehen)? Nein, wenn es dann weiter über eine Hallenwand ragt
 * oder stärker mit einem anderen Teil überlappt als jetzt – dieselben Regeln wie beim Verschieben (Käfige nicht auf
 * Freiflächen oder in den Gang vor Ausgängen, Tische und Bänke nicht auf Käfige).
 */
export function pruefeLage(halle: Pick<Halle, "breite" | "laenge">, koerper: PlanKoerper[], teil: HallenTeil, rechteck: Rechteck): VerschiebePruefung {
  const s = teilSchluessel(teil);
  const k = koerper.find((x) => x.teil && teilSchluessel(x.teil) === s);
  if (!k) return { ok: true };
  const vorher = ueberstand(k.rechteck, halle);
  if (ueberstand(rechteck, halle).some((v, i) => v > vorher[i]! + 0.5)) return { ok: false, grund: "grenze", meldung: `Nicht gedreht: „${k.name}“ ragte dann über die Hallenwand.` };
  const neu = { ...k, rechteck };
  const anderes = koerper.find((f) => f !== k && !f.nurGrenze && stoert(neu, f) && ueberlappung(rechteck, f.rechteck) > ueberlappung(k.rechteck, f.rechteck) + 0.5);
  if (anderes) return { ok: false, grund: "kollision", meldung: `Nicht gedreht: „${k.name}“ stünde dann auf „${anderes.name}“.` };
  return { ok: true };
}
