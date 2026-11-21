/**
 * Tiere im festen Hallenplan von Hand versetzen (Rückmeldung 15.11.2026: „ich will auch käfige frei zuordnen können im
 * halleneditor und ggf tiere versetzen“): ein Tier in einen freien Käfig gleicher Größe, oder zwei Tiere gleicher Größe
 * tauschen. Gilt nur im festen Plan (bei „Automatisch planen“ stellt die Software alles nach der Katalogfolge). Die
 * Katalognummern bleiben; danach greifen die Hinweise „Nummern nicht in Planfolge“ bzw. „Käfigplätze nach Plan“.
 *
 * Gespeichert wird im festen Plan selbst (Platz → Tier, in Käfigblöcken je Platz). Vorher wird dort die Belegung
 * eingetragen, wie der Plan sie gerade zeigt (auch Nachmeldungen auf freien Plätzen und Tiere in Käfigblöcken) – so
 * bleibt beim Versetzen alles andere, wo es ist. Reine Rechnung.
 */
import { blockBelegung, gleicheEtage, type FesterPlan, type Hallenplan, type PlanTier } from "./hallenplan";
import type { KaefigTyp } from "./kaefige";

/** Ein Käfigplatz: in einer Reihe (Lage im Reihensystem wie im festen Plan) oder in einem Käfigblock (Platz ab 0). */
export type KaefigPlatz = { art: "reihe"; reihe: number; x: number; y: number; etage?: number } | { art: "block"; objektId: string; i: number };

/** Wer auf einem Platz sitzt (null = frei) und welche Größe er hat; null: diesen Platz gibt es im Plan nicht. */
export interface PlatzBelegung {
  typ: KaefigTyp;
  tierId: number | null;
  /** Platz einer für eine Nachmeldung angebauten Platte (nicht im festen Plan). */
  angebaut?: true;
}

const nah = (a: number, b: number) => Math.abs(a - b) < 0.5;
const amPlatz = (p: Extract<KaefigPlatz, { art: "reihe" }>) => (k: { x: number; y: number; etage?: number }) => nah(k.x, p.x) && nah(k.y, p.y) && gleicheEtage(k, p);

/** Wo ein Tier im Plan steht (Reihe oder Käfigblock); null: ohne Platz, Voliere oder unbekannt. */
export function platzImPlan(plan: Pick<Hallenplan, "reihen" | "objekte">, tierId: number): KaefigPlatz | null {
  for (const r of plan.reihen) {
    const k = r.kaefige.find((x) => x.id === tierId);
    if (k) return { art: "reihe", reihe: r.nr, x: k.x, y: k.y, ...(k.etage ? { etage: k.etage } : {}) };
  }
  for (const o of plan.objekte) {
    const k = o.kaefige?.find((x) => x.id === tierId);
    if (k) return { art: "block", objektId: o.id, i: k.blockPlatz ?? o.kaefige!.indexOf(k) };
  }
  return null;
}

/** Belegung eines Platzes, wie der Plan sie zeigt. */
export function belegungImPlan(plan: Pick<Hallenplan, "reihen" | "objekte">, p: KaefigPlatz): PlatzBelegung | null {
  if (p.art === "reihe") {
    const r = plan.reihen.find((x) => x.nr === p.reihe);
    if (!r) return null;
    const k = r.kaefige.find(amPlatz(p));
    if (k) return { typ: k.typ, tierId: k.id };
    const f = (r.freiePlaetze ?? []).find(amPlatz(p));
    return f ? { typ: f.typ, tierId: null, ...(f.angebaut ? { angebaut: true as const } : {}) } : null;
  }
  const o = plan.objekte.find((x) => x.id === p.objektId && x.art === "kaefigblock");
  if (!o?.typ || !Number.isInteger(p.i) || p.i < 0 || p.i >= o.plaetze) return null;
  const k = o.kaefige?.find((x) => (x.blockPlatz ?? o.kaefige!.indexOf(x)) === p.i);
  return { typ: o.typ, tierId: k?.id ?? null };
}

export type VersetzenErgebnis =
  | { ok: true; fest: FesterPlan; von: KaefigPlatz | null; getauscht: number | null }
  | { ok: false; fehler: string };

/** Gleiche Plätze? */
export function gleicherPlatz(a: KaefigPlatz | null, b: KaefigPlatz | null): boolean {
  if (!a || !b) return a === b;
  if (a.art === "reihe" && b.art === "reihe") return a.reihe === b.reihe && amPlatz(a)(b);
  return a.art === "block" && b.art === "block" && a.objektId === b.objektId && a.i === b.i;
}

/**
 * Tier `tierId` auf Platz `ziel` versetzen (`plan`: der Plan aus `fest`, wie er gerade gerechnet ist). Ist das Ziel
 * belegt, tauschen die beiden Tiere (das andere kommt auf den bisherigen Platz). `ziel` null: das Tier kommt aus seinem
 * festen Platz heraus (zurück zu „noch zu stellen“ bzw. dorthin, wo der Plan Nachmeldungen stellt) – für Rückgängig.
 */
export function tierVersetzen(fest: FesterPlan, plan: Pick<Hallenplan, "reihen" | "objekte" | "nichtPlatziert">, tiere: Pick<PlanTier, "id" | "typ">[], tierId: number, ziel: KaefigPlatz | null): VersetzenErgebnis {
  const tier = tiere.find((t) => t.id === tierId);
  if (!tier) return { ok: false, fehler: "Dieses Tier gibt es im Plan nicht (mehr)." };
  if (tier.typ === "voliere") return { ok: false, fehler: "Volieren lassen sich hier nicht versetzen." };
  // Belegung so eintragen, wie der Plan sie zeigt (auch für Nachmeldungen angebaute Platten) – danach steht jedes Tier mit
  // Käfig fest, und beim Versetzen springt kein anderes in einen frei gewordenen Platz.
  const neu = mitBelegung(fest, plan);
  const vonImPlan = platzImPlan(plan, tierId);
  const vonFest = vonImPlan && imFesten(neu, vonImPlan) ? vonImPlan : null;
  let getauscht: number | null = null;
  if (ziel) {
    if (gleicherPlatz(vonImPlan, ziel)) return { ok: false, fehler: "Das Tier steht schon dort." };
    const b = belegungImPlan(plan, ziel);
    if (!b || !imFesten(neu, ziel)) return { ok: false, fehler: "Diesen Käfig gibt es im Plan nicht (mehr)." };
    if (b.typ !== tier.typ) return { ok: false, fehler: "Der Käfig hat eine andere Größe." };
    if (b.tierId != null) {
      if (!vonFest) return { ok: false, fehler: "Tauschen geht nur zwischen zwei Tieren mit festem Käfig – bitte einen freien Käfig wählen." };
      getauscht = b.tierId;
    }
  } else if (!vonFest) return { ok: false, fehler: "Das Tier hat keinen festen Käfig." };

  // Das Tier (und beim Tausch das andere) umsetzen.
  const raus = new Set([tierId, ...(getauscht != null ? [getauscht] : [])]);
  for (const r of neu.reihen) for (const p of r.plaetze) if (p.tierId != null && raus.has(p.tierId)) p.tierId = null;
  for (const b of neu.objektKaefige ?? []) b.tierIds = b.tierIds.map((id) => (id != null && raus.has(id) ? null : id));
  if (ziel) setze(neu, ziel, tierId);
  if (getauscht != null && vonFest) setze(neu, vonFest, getauscht);
  // Merken, was von Hand gesetzt ist (Rückmeldung 15.11.2026): der frei gemachte Platz zählt im Hinweis nicht als Lücke.
  neu.vonHand = [...new Set([...(neu.vonHand ?? []), tierId, ...(getauscht != null ? [getauscht] : [])])];
  const gleich = (a: KaefigPlatz) => (f: { reihe: number; x: number; y: number; etage?: number }) => a.art === "reihe" && f.reihe === a.reihe && amPlatz(a)(f);
  let frei = (neu.freiGemacht ?? []).filter((f) => !(ziel && gleich(ziel)(f)));
  if (getauscht == null && vonFest?.art === "reihe") frei = [...frei.filter((f) => !gleich(vonFest)(f)), { reihe: vonFest.reihe, x: vonFest.x, y: vonFest.y, ...(vonFest.etage ? { etage: vonFest.etage } : {}) }];
  neu.freiGemacht = frei;
  neu.objektKaefige = (neu.objektKaefige ?? [])
    .map((b) => {
      const ids = [...b.tierIds];
      while (ids.length && ids.at(-1) == null) ids.pop();
      return { ...b, tierIds: ids };
    })
    .filter((b) => b.tierIds.length);
  return { ok: true, fest: neu, von: vonImPlan, getauscht };
}

/** Steht der Platz im festen Plan (eine Reihe dort mit diesem Platz, ein Käfigblock zählt immer)? */
function imFesten(fest: FesterPlan, p: KaefigPlatz): boolean {
  if (p.art === "block") return true;
  return !!fest.reihen.find((r) => r.nr === p.reihe)?.plaetze.some(amPlatz(p));
}

function setze(fest: FesterPlan, p: KaefigPlatz, tierId: number) {
  if (p.art === "reihe") {
    const platz = fest.reihen.find((r) => r.nr === p.reihe)!.plaetze.find(amPlatz(p))!;
    platz.tierId = tierId;
    return;
  }
  const liste = (fest.objektKaefige ??= []);
  let b = liste.find((x) => x.objektId === p.objektId);
  if (!b) liste.push((b = { objektId: p.objektId, tierIds: [] }));
  while (b.tierIds.length <= p.i) b.tierIds.push(null);
  b.tierIds[p.i] = tierId;
}

/**
 * Fester Plan mit der Belegung, wie der Plan sie zeigt: je Reihenplatz das Tier dort (ein nicht mehr gemeldetes Tier
 * bleibt eingetragen – kommt es zurück, bekommt es seinen Platz wieder), je Käfigblock die Tiere je Platz. Für
 * Nachmeldungen angebaute Platten kommen mit ihren Plätzen dazu (hinter die Platten der Reihe, in derselben Folge wie im
 * Plan – so bleiben die Nummern der Platten und ihr Versatz gleich). Tiefe Kopie. Auch vor „Nach Plan nummerieren“: Tiere,
 * die nicht im festen Plan stehen (Nachmeldungen), stehen sonst nach ihrer Nummer – und die ändert sich dabei.
 */
export function mitBelegung(fest: FesterPlan, plan: Pick<Hallenplan, "reihen" | "objekte">): FesterPlan {
  const imPlan = new Set([...plan.reihen.flatMap((r) => r.kaefige.map((k) => k.id)), ...plan.objekte.flatMap((o) => (o.kaefige ?? []).map((k) => k.id))]);
  return {
    ...fest,
    reihen: fest.reihen.map((r) => {
      const pr = plan.reihen.find((x) => x.nr === r.nr);
      const angebaut = (pr?.platten ?? []).flatMap((pl, i) => (pl.angebaut && !pl.entfernt ? [{ pl, i }] : []));
      const dazuPlaetze = angebaut.flatMap(({ i }) => [
        ...pr!.kaefige.filter((k) => k.platte === i).map((k) => ({ tierId: k.id as number | null, typ: k.typ, x: k.x, y: k.y, breite: k.breite, tiefe: k.tiefe, ...(k.etage ? { etage: k.etage } : {}) })),
        ...(pr!.freiePlaetze ?? []).filter((f) => f.platte === i).map((f) => ({ tierId: null as number | null, typ: f.typ, x: f.x, y: f.y, breite: f.breite, tiefe: f.tiefe, ...(f.etage ? { etage: f.etage } : {}) })),
      ]);
      return {
        ...r,
        platten: [
          ...r.platten.map((p) => ({ ...p })),
          ...angebaut.map(({ pl }) => ({ typ: pl.typ, x: pl.x, y: pl.y, laenge: pl.laenge, tiefe: pl.tiefe, plaetze: pl.plaetze, belegt: pl.belegt, ...(pl.gemischt ? { gemischt: true as const } : {}) })),
        ],
        plaetze: [
          ...r.plaetze.map((p) => {
            const k = pr?.kaefige.find(amPlatz({ art: "reihe", reihe: r.nr, x: p.x, y: p.y, ...(p.etage ? { etage: p.etage } : {}) }));
            if (k && k.typ === p.typ) return { ...p, tierId: k.id };
            // Frei im Plan: ein noch eingetragenes, nicht mehr gemeldetes Tier bleibt (zurückgenommener Storno), sonst frei.
            return { ...p, tierId: p.tierId != null && !imPlan.has(p.tierId) ? p.tierId : null };
          }),
          ...dazuPlaetze,
        ],
      };
    }),
    objektKaefige: plan.objekte.filter((o) => o.art === "kaefigblock" && o.kaefige?.length).map((o) => ({ objektId: o.id, tierIds: blockBelegung(o) })),
  };
}
