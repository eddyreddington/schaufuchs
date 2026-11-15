/**
 * Hallenplan von Hand: Leeres entfernen. Im festen Plan lassen sich leere Grundplatten, freie Käfigplätze und leere
 * Reihen entfernen, dazu (wie bisher) eingesetzte Käfigblöcke, Volieren und Flächen. Belegtes bleibt immer stehen und wird
 * mit Nummern genannt. Der feste Plan selbst bleibt unverändert: entfernte Platten und Plätze stehen in `halle.entfernt`
 * (gespeichert wie jede andere Änderung der Halle, rückgängig zu machen, mit Protokoll). Eine entfernte Platte bleibt im
 * Plan als Platzhalter (`PlanPlatte.entfernt`): die Nummern der übrigen Platten – und damit ihr `plattenVersatz` – ändern
 * sich nie, und dort wird keine Nachmeldung angebaut. Reine Rechnung ohne Datenbank.
 */
import { etageFeld, gleicheEtage, stabilerText, type EntfernterPlatz, type FesterPlan, type Halle, type Hallenplan, type PlanKaefig, type Rechteck } from "./hallenplan";
import type { HallenTeil } from "./hallenplan-gruppe";
import { nummernBereiche } from "./kaefige";

/** Ein freier Käfigplatz im festen Plan: Reihe und Lage im Reihensystem (wie `FreierPlatz.x/y`). */
export type FreierPlatzTeil = { art: "platz"; reihe: number; x: number; y: number; etage?: number };
/** Was im Editor gewählt sein kann: ein verschiebbares Teil oder ein freier Platz. */
export type PlanAuswahlTeil = HallenTeil | FreierPlatzTeil;

export interface EntfernenErgebnis {
  /** Die Halle danach (unverändert, wenn nichts zu entfernen ist). */
  halle: Halle;
  platten: number;
  plaetze: number;
  /** Eingesetzte Käfigblöcke und Volieren. */
  teile: number;
  flaechen: number;
  /** Was stehen bleibt, mit Grund, z. B. „Grundplatte 2 in R14 (belegt, Nr. 270, 271)“ oder „Platz in R3 (Platte einer Nachmeldung)“. */
  bleibt: string[];
  /** Ohne festen Plan lassen sich keine Platten und Plätze entfernen. */
  nurFest: boolean;
}

const nah = (a: number, b: number) => Math.abs(a - b) < 0.5;
const gleicherPlatz = (a: { reihe: number; art: string; x: number; y: number; etage?: number }, b: { reihe: number; art: string; x: number; y: number; etage?: number }) =>
  a.reihe === b.reihe && a.art === b.art && nah(a.x, b.x) && nah(a.y, b.y) && gleicheEtage(a, b);
/** Derselbe Platz (Lage im Reihensystem und Etage). */
const amPlatz = (a: { x: number; y: number; etage?: number }, b: { x: number; y: number; etage?: number }) => nah(a.x, b.x) && nah(a.y, b.y) && gleicheEtage(a, b);

/** Käfignummern als kurze Angabe „24–29, 31a“. */
function nummernText(k: { nr: string | null }[]): string {
  return nummernBereiche(
    k.map((x) => {
      const m = x.nr?.match(/^(\d+)(\D*)$/);
      return m ? { katalogNr: Number(m[1]), suffix: m[2] ?? "" } : { katalogNr: null };
    }),
  );
}
const nummern = (k: { nr: string | null }[]) => (nummernText(k) ? ` (Nr. ${nummernText(k)})` : "");
const belegtMit = (k: { nr: string | null }[]) => ` (belegt${nummernText(k) ? `, Nr. ${nummernText(k)}` : ""})`;

const ueberlappt = (q: Rechteck, a: Rechteck) => q.x < a.x + a.b - 0.5 && a.x < q.x + q.b - 0.5 && q.y < a.y + a.h - 0.5 && a.y < q.y + q.h - 0.5;

/**
 * Alles Leere der Auswahl entfernen. Eine Reihe zählt nur ganz leer; mit einer Platte gehen ihre freien Plätze mit. Der
 * Versatz der Platten bleibt, wie er ist (die Nummern ändern sich nicht).
 */
export function leereEntfernen(halle: Halle, plan: Pick<Hallenplan, "reihen" | "objekte" | "volieren" | "fest">, ziele: PlanAuswahlTeil[]): EntfernenErgebnis {
  const fest = !!plan.fest;
  const bleibt: string[] = [];
  const neu: EntfernterPlatz[] = [];
  const plattenWeg = new Map<number, Set<number>>();
  const objekte = new Set<string>();
  const flaechen = new Set<number>();
  let platten = 0, plaetze = 0;
  const reiheVon = (nr: number) => plan.reihen.find((r) => r.nr === nr);
  const platteWeg = (r: Hallenplan["reihen"][number], i: number) => {
    const pl = r.platten[i];
    if (!pl || pl.entfernt || plattenWeg.get(r.nr)?.has(i)) return;
    plattenWeg.set(r.nr, new Set([...(plattenWeg.get(r.nr) ?? []), i]));
    neu.push({ reihe: r.nr, art: "platte", x: pl.x, y: pl.y });
    platten++;
  };
  const platzWeg = (reihe: number, f: { x: number; y: number; etage?: number }) => {
    const e: EntfernterPlatz = { reihe, art: "platz", x: f.x, y: f.y, ...etageFeld(f.etage) };
    if (neu.some((x) => gleicherPlatz(x, e))) return;
    neu.push(e);
    plaetze++;
  };
  let ohneFest = false;
  const nurFest = () => {
    ohneFest = true;
  };
  const belegtAuf = (r: Hallenplan["reihen"][number], i: number): PlanKaefig[] => r.kaefige.filter((k) => k.platte === i);
  const ganzeReihen = new Set(ziele.flatMap((z) => (z.art === "reihe" ? [z.nr] : [])));

  // Erst Reihen und Platten, dann die einzelnen Plätze (die mit ihrer Platte schon wegfallen können).
  for (const z of ziele) {
    if (z.art === "reihe") {
      const r = reiheVon(z.nr);
      if (!r) continue;
      if (!fest) {
        nurFest();
        continue;
      }
      if (r.kaefige.length) {
        bleibt.push(`R${r.nr}${belegtMit(r.kaefige)}`);
        continue;
      }
      r.platten.forEach((_, i) => platteWeg(r, i));
      for (const f of r.freiePlaetze ?? []) if (f.platte == null && !f.angebaut) platzWeg(r.nr, f);
    } else if (z.art === "platte") {
      if (ganzeReihen.has(z.reihe)) continue;
      const r = reiheVon(z.reihe);
      if (!r?.platten[z.i] || r.platten[z.i]!.entfernt) continue;
      const name = `Grundplatte ${z.i + 1} in R${r.nr}`;
      if (!fest) {
        nurFest();
        continue;
      }
      const drauf = belegtAuf(r, z.i);
      if (drauf.length) bleibt.push(`${name}${belegtMit(drauf)}`);
      else platteWeg(r, z.i);
    } else if (z.art === "objekt") {
      const o = plan.objekte.find((x) => x.id === z.id);
      // Eben eingesetzt (der Plan ist noch nicht neu gerechnet): leer.
      if (!o) {
        if ((halle.objekte ?? []).some((x) => x.id === z.id)) objekte.add(z.id);
        continue;
      }
      const drin = [...(o.tier ? [o.tier] : []), ...(o.kaefige ?? [])];
      if (drin.length) bleibt.push(`${o.name}${belegtMit(drin)}`);
      else objekte.add(o.id);
    } else if (z.art === "flaeche") {
      const f = halle.flaechen[z.i];
      if (!f) continue;
      const q = { x: f.x, y: f.y, b: f.breite, h: f.tiefe };
      const volieren = f.art === "volieren" ? plan.volieren.filter((v) => ueberlappt(v.rechteck, q)) : [];
      if (volieren.length) bleibt.push(`${f.name}${belegtMit(volieren)}`);
      else flaechen.add(z.i);
    }
  }
  for (const z of ziele) {
    if (z.art !== "platz" || ganzeReihen.has(z.reihe)) continue;
    const r = reiheVon(z.reihe);
    if (!r) continue;
    const f = (r.freiePlaetze ?? []).find((x) => amPlatz(x, z));
    if (f?.platte != null && plattenWeg.get(r.nr)?.has(f.platte)) continue;
    if (!fest) {
      nurFest();
      continue;
    }
    if (f?.angebaut) {
      bleibt.push(`Platz in R${r.nr} (Platte einer Nachmeldung)`);
      continue;
    }
    if (f) {
      platzWeg(r.nr, f);
      continue;
    }
    const k = r.kaefige.find((x) => amPlatz(x, z));
    if (k) bleibt.push(`Platz in R${r.nr}${belegtMit([k])}`);
  }

  if (!neu.length && !objekte.size && !flaechen.size) return { halle, platten: 0, plaetze: 0, teile: 0, flaechen: 0, bleibt, nurFest: ohneFest };
  const entfernt = [...(halle.entfernt ?? []), ...neu.filter((e) => !(halle.entfernt ?? []).some((x) => gleicherPlatz(x, e)))];
  return {
    halle: {
      ...halle,
      flaechen: halle.flaechen.filter((_, i) => !flaechen.has(i)),
      objekte: (halle.objekte ?? []).filter((o) => !objekte.has(o.id)),
      ...(entfernt.length ? { entfernt } : {}),
    },
    platten,
    plaetze,
    teile: objekte.size,
    flaechen: flaechen.size,
    bleibt,
    nurFest: ohneFest,
  };
}

/**
 * Prüfung beim Speichern der Halle (Server): Neu entfernte Platten und Plätze müssen im festen Plan stehen und leer sein.
 * `plan` ist mit den bisher entfernten gerechnet (ohne die neuen). Ergebnis: Meldung oder null.
 */
export function pruefeEntfernt(alt: EntfernterPlatz[] | undefined, neu: EntfernterPlatz[] | undefined, fest: FesterPlan | null | undefined, plan: Pick<Hallenplan, "reihen">): string | null {
  const neue = (neu ?? []).filter((e) => !(alt ?? []).some((x) => gleicherPlatz(x, e)));
  if (!neue.length) return null;
  if (!fest) return "Leere Plätze lassen sich nur im festen Plan entfernen.";
  for (const e of neue) {
    const fr = fest.reihen.find((r) => r.nr === e.reihe);
    const r = plan.reihen.find((x) => x.nr === e.reihe);
    if (e.art === "platte") {
      const i = r?.platten.findIndex((pl) => !pl.entfernt && !pl.angebaut && nah(pl.x, e.x) && nah(pl.y, e.y)) ?? -1;
      if (!r || i < 0 || !fr?.platten.some((pl) => nah(pl.x, e.x) && nah(pl.y, e.y))) return `Diese Grundplatte in R${e.reihe} gibt es im festen Plan nicht (mehr) – der Plan wird neu geladen.`;
      const drauf = r.kaefige.filter((k) => k.platte === i);
      if (drauf.length) return `Grundplatte ${i + 1} in R${e.reihe} ist belegt${nummern(drauf)} – nur Leeres lässt sich entfernen.`;
    } else {
      if (!r || !fr?.plaetze.some((pl) => amPlatz(pl, e))) return `Diesen Platz in R${e.reihe} gibt es im festen Plan nicht (mehr) – der Plan wird neu geladen.`;
      const k = r.kaefige.find((x) => amPlatz(x, e));
      if (k) return `Der Platz in R${e.reihe} ist belegt${nummern([k])} – nur Leeres lässt sich entfernen.`;
    }
  }
  return null;
}

/**
 * Prüfung beim Speichern der Halle (Server): Eingesetzte Käfigblöcke und Volieren, die wegfallen, müssen leer sein.
 * `plan` ist mit der bisherigen Halle gerechnet. Ergebnis: Meldung oder null.
 */
export function pruefeTeileEntfernt(alt: Halle | null | undefined, neu: Halle, plan: Pick<Hallenplan, "objekte">): string | null {
  const bleiben = new Set((neu.objekte ?? []).map((o) => o.id));
  const belegt = plan.objekte.filter((o) => !bleiben.has(o.id) && (alt?.objekte ?? []).some((x) => x.id === o.id) && (o.tier || o.kaefige?.length));
  if (!belegt.length) return null;
  return `Belegt, bleibt stehen: ${belegt.map((o) => `${o.name}${nummern([...(o.tier ? [o.tier] : []), ...(o.kaefige ?? [])])}`).join(", ")} – nur Leeres lässt sich entfernen.`;
}

/**
 * Halle für eine neue Schau (Vorlage, letzte Schau, Testschau): einzeln verschobene Platten und entfernte leere Plätze
 * gehören zum festen Plan der alten Schau (Platten nach ihrer Nummer, Plätze nach ihrer Lage) – sie fallen weg, ebenso die
 * Käfigblöcke (sie standen für die Tiere ohne Platz der alten Schau).
 */
export function halleOhneFestenPlan(h: Halle): Halle {
  const { entfernt: _e, ...rest } = h;
  return { ...rest, plattenVersatz: [], objekte: (h.objekte ?? []).filter((o) => o.art !== "kaefigblock") };
}

/**
 * Kennzeichen der Grundplatten eines Plans (je Reihe Lage, Länge und Käfigart jeder Platte). Der Editor schickt es beim
 * automatischen Festschreiben mit: Hat sich der Plan inzwischen geändert (Nachmeldung, Storno), stimmen die Nummern der
 * Platten nicht mehr mit dem überein, was der Editor zeigt – dann lehnt der Server ab, statt eine Verschiebung auf die
 * falsche Platte zu legen.
 */
export function plattenStand(plan: Pick<Hallenplan, "reihen">): string {
  const t = stabilerText(plan.reihen.map((r) => [r.nr, r.platten.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.laenge), p.typ, !!p.entfernt])]));
  let x = 5381;
  for (let i = 0; i < t.length; i++) x = (Math.imul(x, 33) ^ t.charCodeAt(i)) >>> 0;
  return `${x.toString(36)}-${t.length}`;
}
