/**
 * Tiere ohne Platz im Hallenplan, nach Käfiggröße zusammengefasst: wie viele, welche (Katalognummer und Rasse, ohne
 * Aussteller) und was sich einsetzen lässt – ein Käfigblock der Größe (wie viele davon nötig sind) oder eine Voliere.
 * Reine Rechnung ohne Datenbank.
 */
import { frontDerReihe, plaetzeJePlatte, teilGroesse, type Blick, type Halle, type Hallenplan, type PlanTier, type Rechteck } from "./hallenplan";
import { kaefigMass, type KaefigMasse, type KaefigTyp } from "./kaefige";

/** Käfigarten, für die es im Editor einen Käfigblock gibt. */
export const KAEFIGBLOCK_TYPEN: readonly KaefigTyp[] = ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm"];

export interface FehlendeKaefige {
  typ: KaefigTyp;
  anzahl: number;
  /** In der Folge des Plans (Katalogfolge). */
  tiere: { id: number; nr: string | null; rasse: string }[];
  /** Was die Tiere aufnimmt: Käfigblock dieser Größe, Voliere – oder nichts (Käfigmaß fehlt, keine Blockart). */
  einsetzen: "kaefigblock" | "voliere" | null;
  /** Käfigblöcke, die es dafür braucht (je Block eine Grundplatte); bei Volieren je Tier eine. */
  noetig: number;
}

/** Tiere ohne Platz je Käfiggröße, in der Reihenfolge, in der die Größen zuerst vorkommen. */
export function fehlendeKaefige(ohnePlatz: PlanTier[], masse: KaefigMasse | null | undefined, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">): FehlendeKaefige[] {
  const gruppen = new Map<KaefigTyp, FehlendeKaefige>();
  for (const t of ohnePlatz) {
    let g = gruppen.get(t.typ);
    if (!g) {
      const mass = kaefigMass(t.typ, masse);
      const einsetzen = !mass ? null : t.typ === "voliere" ? "voliere" : KAEFIGBLOCK_TYPEN.includes(t.typ) ? "kaefigblock" : null;
      g = { typ: t.typ, anzahl: 0, tiere: [], einsetzen, noetig: 0 };
      gruppen.set(t.typ, g);
    }
    g.anzahl++;
    g.tiere.push({ id: t.id, nr: t.nr, rasse: t.rasse });
  }
  for (const g of gruppen.values()) {
    const mass = kaefigMass(g.typ, masse);
    if (g.einsetzen === "voliere") g.noetig = g.anzahl;
    else if (g.einsetzen === "kaefigblock" && mass) g.noetig = Math.ceil(g.anzahl / Math.max(1, plaetzeJePlatte(g.typ, mass.breite, halle)));
  }
  return [...gruppen.values()];
}

/**
 * Freier Platz für ein neues Teil der Größe `groesse`: möglichst nah an `start` (Raster `schritt`, ringförmig nach außen),
 * ganz in der Halle und auf nichts von `belegt`. Ist nirgends Platz, bleibt es bei `start`.
 */
export function freieStelle(halle: { breite: number; laenge: number }, belegt: Rechteck[], groesse: { b: number; h: number }, start: { x: number; y: number }, schritt = 50): { x: number; y: number } {
  const frei = (x: number, y: number) =>
    x >= 0 && y >= 0 && x + groesse.b <= halle.breite + 0.5 && y + groesse.h <= halle.laenge + 0.5 &&
    !belegt.some((q) => x < q.x + q.b - 0.5 && q.x < x + groesse.b - 0.5 && y < q.y + q.h - 0.5 && q.y < y + groesse.h - 0.5);
  const ringe = Math.ceil(Math.max(halle.breite, halle.laenge) / schritt);
  for (let r = 0; r <= ringe; r++) {
    const kandidaten: { x: number; y: number; d: number }[] = [];
    for (let i = -r; i <= r; i++)
      for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]] as const) kandidaten.push({ x: start.x + dx * schritt, y: start.y + dy * schritt, d: dx * dx + dy * dy });
    kandidaten.sort((a, b) => a.d - b.d);
    const k = kandidaten.find((c) => frei(c.x, c.y));
    if (k) return { x: k.x, y: k.y };
  }
  return start;
}

/** Ein Teil, das „fehlende Käfige einsetzen“ in die Halle stellt (wie `HallenObjekt`, ohne id). */
export interface Einsatz {
  art: "kaefigblock" | "voliere";
  typ: KaefigTyp;
  x: number;
  y: number;
  drehung: 0 | 90;
  rechteck: Rechteck;
  /** Front des Blocks: die Front der Reihe, in die er kommt (zum Gang). */
  front: Blick;
}

/** Was schon Platz einnimmt (Platten, Teile, Flächen, Gang vor Eingängen …); bei Grundplatten mit Käfigart. */
export type Belegt = { q: Rechteck; typ?: KaefigTyp };

/**
 * Stellen für die fehlenden Käfige: Käfigblöcke (bzw. Volieren) nur in die nutzbaren Abschnitte der Reihen – dort, wo die
 * Planung selbst Platten stellen würde, also nie in die Gänge zwischen den Reihen, den Quergang oder Hauptgang, den Gang vor
 * Eingängen, eine Lücke zwischen zwei Teilen einer Reihe oder auf Freiflächen – in Reihenrichtung und hinten wie die Platten (Rücken an Rücken bzw. an der Wand). Bevorzugt
 * bündig an eine Platte derselben Käfigart, dann an eine andere Platte oder ein Teil, dann an das Ende des Abschnitts. Nichts
 * davon steht auf etwas aus `belegt` (dieselbe Prüfung wie beim Verschieben). Von Hand gedrehte Reihen bleiben aus.
 * `nur`/`hoechstens`: nur diese Käfigart, höchstens so viele Teile. `ohne`: Tiere, die danach noch keinen Platz haben.
 */
export function fehlendeEinsetzen(
  plan: Pick<Hallenplan, "quer" | "reihen" | "nichtPlatziert">,
  halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">,
  masse: KaefigMasse | null | undefined,
  belegt: Belegt[],
  nur?: { typ: KaefigTyp; hoechstens?: number },
): { einsaetze: Einsatz[]; ohne: number } {
  const einsaetze: Einsatz[] = [];
  const alle = [...belegt];
  let ohne = 0;
  for (const g of fehlendeKaefige(plan.nichtPlatziert, masse, halle)) {
    const mass = kaefigMass(g.typ, masse);
    if (!g.einsetzen || !mass || (nur && g.typ !== nur.typ)) {
      ohne += g.anzahl;
      continue;
    }
    const { lang, kurz } = teilGroesse({ art: g.einsetzen, typ: g.typ }, halle, masse);
    const jeTeil = g.einsetzen === "voliere" ? 1 : Math.max(1, plaetzeJePlatte(g.typ, mass.breite, halle));
    const ziel = Math.min(g.noetig, nur?.hoechstens ?? Infinity);
    let gesetzt = 0;
    for (; gesetzt < ziel; gesetzt++) {
      const s = besteStelle(plan, alle, g.typ, lang, kurz);
      if (!s) break;
      einsaetze.push({ art: g.einsetzen, typ: g.typ, ...s });
      alle.push({ q: s.rechteck, typ: g.typ });
    }
    ohne += Math.max(0, g.anzahl - gesetzt * jeTeil);
  }
  return { einsaetze, ohne };
}

/** Beste freie Stelle in den Abschnitten der Reihen für ein Teil `lang` × `kurz` der Käfigart `typ` (siehe oben). */
function besteStelle(plan: Pick<Hallenplan, "quer" | "reihen">, belegt: Belegt[], typ: KaefigTyp, lang: number, kurz: number): Omit<Einsatz, "art" | "typ"> | null {
  const T = 0.5;
  let beste: { wert: number; nr: number; a: number; s: Omit<Einsatz, "art" | "typ"> } | null = null;
  for (const r of plan.reihen) {
    if (r.drehung) continue;
    for (const f of r.flaechen) {
      // Entlang der Reihe (a) und quer dazu (c), in Hallenkoordinaten.
      const a0 = plan.quer ? f.x : f.y, a1 = a0 + (plan.quer ? f.b : f.h);
      const c0 = plan.quer ? f.y : f.x, c1 = c0 + (plan.quer ? f.h : f.b);
      if (c1 - c0 < kurz - T || a1 - a0 < lang - T) continue;
      // Hinten wie die Platten: Front „rechts“ – hinten an der kleineren Kante.
      const c = r.front === "rechts" ? c0 : c1 - kurz;
      const sperren = belegt
        .map((b) => ({ b, s0: plan.quer ? b.q.x : b.q.y, s1: plan.quer ? b.q.x + b.q.b : b.q.y + b.q.h, q0: plan.quer ? b.q.y : b.q.x, q1: plan.quer ? b.q.y + b.q.h : b.q.x + b.q.b }))
        .filter((x) => x.q0 < c1 - T && c0 < x.q1 - T && x.s0 < a1 - T && a0 < x.s1 - T)
        .sort((x, y) => x.s0 - y.s0);
      // Freie Stücke des Abschnitts.
      let pos = a0;
      const frei: { von: number; bis: number; vor?: Belegt; nach?: Belegt }[] = [];
      let vor: Belegt | undefined;
      for (const x of sperren) {
        if (x.s0 > pos + T) frei.push({ von: pos, bis: x.s0, vor, nach: x.b });
        if (x.s1 > pos) {
          pos = x.s1;
          vor = x.b;
        }
      }
      if (a1 > pos + T) frei.push({ von: pos, bis: a1, vor });
      const wert = (n?: Belegt) => (!n ? 2 : n.typ === typ ? 0 : 1);
      for (const st of frei) {
        if (st.bis - st.von < lang - T) continue;
        // Nicht in eine Lücke zwischen zwei Teilen der Reihe (z. B. zwischen von Hand gesetzten Blöcken): ein Block füllte sie
        // nur zum Teil, und die Reihe bekäme eine Lücke. Die Planung selbst lässt keine Lücken mitten in der Reihe.
        if (st.vor && st.nach) continue;
        for (const [w, an] of [[wert(st.vor), st.von], [wert(st.nach), st.bis - lang]] as const) {
          if (beste && (w > beste.wert || (w === beste.wert && (r.nr > beste.nr || (r.nr === beste.nr && an >= beste.a))))) continue;
          const rechteck = plan.quer ? { x: an, y: c, b: lang, h: kurz } : { x: c, y: an, b: kurz, h: lang };
          beste = { wert: w, nr: r.nr, a: an, s: { x: rechteck.x, y: rechteck.y, drehung: plan.quer ? 0 : 90, rechteck, front: frontDerReihe(r, plan.quer) } };
        }
      }
    }
  }
  return beste?.s ?? null;
}
