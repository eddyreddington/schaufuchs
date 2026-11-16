/**
 * Hallenplan – fester Plan: was beim Festschreiben gilt (`festGeometrie`), Festschreiben des gerechneten Plans,
 * Belegung eines Käfigblocks und die Rechnung mit festem Plan (`planeFest`: Plätze bleiben, Nachmeldungen in freie Plätze).
 */
import { kaefigMass, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { blickTausch, ueberlappt } from "./hallenplan-rechtecke";
import { abziehen, hinterStuecken, LEER, teilStueckeFest } from "./hallenplan-intern";
import { planeImReihensystem } from "./hallenplan-reihen";
import type { FesterPlan, Halle, Hallenplan, PlanObjekt, PlanTier } from "./hallenplan-typen";
import { etageFeld, gleicheEtage, GRUNDPLATTE_STANDARD, halleNormal, platteFuer, stabilerText } from "./hallenplan-vorgaben";

/** Belegung eines Käfigblocks je Platz (Tier-Id, null = frei), ohne freie Plätze am Ende. */
export function blockBelegung(o: Pick<PlanObjekt, "kaefige">): (number | null)[] {
  const aus: (number | null)[] = [];
  for (const k of o.kaefige ?? []) aus[k.blockPlatz ?? aus.length] = k.id;
  return Array.from(aus, (x) => x ?? null);
}

/** Was beim Festschreiben gilt: Hallenmaße, Reihen und Käfigmaße (nicht Flächen oder eingesetzte Teile). */
export function festGeometrie(h: Halle, masse: KaefigMasse | null | undefined): string {
  const n = halleNormal(h);
  return stabilerText({ breite: n.breite, laenge: n.laenge, umriss: n.umriss, richtung: n.richtung, gang: n.gang, wandreihen: n.wandreihen, wandreiheSeite: n.wandreihen ? n.wandreiheSeite : undefined, wandBuendig: n.wandBuendig, hauptgang: n.hauptgang, platte: n.platte, jePlatte: n.jePlatte, plattenMass: n.plattenMass, etagen: n.etagen, masse: masse ?? {} });
}

/** Den gerechneten Plan festschreiben (aus `planeHalle` ohne festen Plan). */
export function festschreiben(halle: Halle, plan: Hallenplan, masse: KaefigMasse | null | undefined, am: string): FesterPlan {
  return {
    am,
    geometrie: festGeometrie(halle, masse),
    reihen: plan.reihen
      // Auch leere Reihen: Nachmeldungen können dort ans Ende (z. B. Tauben in eine Reihe ohne Geflügel).
      .filter((r) => r.abschnitte.length)
      .map((r) => ({
        nr: r.nr,
        art: r.art,
        x: r.x,
        tiefe: r.tiefe,
        front: r.front,
        abschnitte: r.abschnitte,
        // Ohne Hand-Verschiebung der Platten: die bleibt einstellbar (wie bei den Reihen).
        platten: r.platten.map(({ rechteck: _, versatz: _v, drehung: _d, ...pl }) => pl),
        plaetze: [
          ...r.kaefige.map((k) => ({ tierId: k.id, typ: k.typ, x: k.x, y: k.y, breite: k.breite, tiefe: k.tiefe, ...etageFeld(k.etage) })),
          ...(r.freiePlaetze ?? []).map((f) => ({ tierId: null, typ: f.typ, x: f.x, y: f.y, breite: f.breite, tiefe: f.tiefe, ...etageFeld(f.etage) })),
        ],
      })),
    volieren: plan.volieren.map((v) => ({ tierId: v.id, x: v.x, y: v.y, breite: v.breite, tiefe: v.tiefe, ...(v.front ? { front: plan.quer ? blickTausch(v.front) : v.front } : {}) })),
    objektVolieren: plan.objekte.filter((o) => o.art === "voliere" && o.tier).map((o) => ({ objektId: o.id, tierId: o.tier!.id })),
    objektKaefige: plan.objekte.filter((o) => o.art === "kaefigblock" && o.kaefige?.length).map((o) => ({ objektId: o.id, tierIds: blockBelegung(o) })),
  };
}

/**
 * Fester Plan: die Plätze bleiben, wo sie sind. Wer noch da ist, behält seinen Platz; neue Tiere (Nachmeldung, andere
 * Käfiggröße) kommen in einen freien Platz gleicher Größe, sonst an ein freies Reihenende (eine ganze Platte direkt an die
 * letzte, möglichst hinter derselben Sparte oder in einer leeren Reihe), möglichst nahe dem Tier mit der nächstkleineren
 * Nummer. Sonst „noch zu stellen“. Volieren bleiben ebenso stehen.
 */
export function planeFest(halle: Halle, fest: FesterPlan, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren: boolean): Omit<Hallenplan, "quer" | "objekte"> {
  const gang = Math.max(0, halle.gang);
  const platte = halle.platte ?? GRUNDPLATTE_STANDARD;
  const fehlendeMasse = [...new Set(tiere.map((t) => t.typ).filter((t) => !kaefigMass(t, masse)))];
  const ohneMass = tiere.filter((t) => fehlendeMasse.includes(t.typ));
  const offen = new Map(tiere.filter((t) => t.typ !== "voliere" && !fehlendeMasse.includes(t.typ)).map((t) => [t.id, t]));
  type Platz = FesterPlan["reihen"][number]["plaetze"][number] & { tier: PlanTier | null; angebaut?: true };
  // Von Hand entfernte leere Platten und Plätze (mit einer Platte auch die Plätze darauf) zählen nicht mehr. Belegtes bleibt
  // immer: sitzt dort (wieder) ein Tier, etwa nach einem zurückgenommenen Storno, gilt die Entfernung nicht.
  const weg = halle.entfernt ?? [];
  const nah = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const belegt = (pl: FesterPlan["reihen"][number]["plaetze"][number]) => pl.tierId != null && offen.get(pl.tierId)?.typ === pl.typ;
  const gefiltert = fest.reihen.map((r) => {
    if (!weg.some((e) => e.reihe === r.nr)) return r;
    const auf = (p: { y: number; laenge: number }) => (pl: { y: number }) => pl.y >= p.y - 0.5 && pl.y < p.y + p.laenge - 0.5;
    const wegP = r.platten.filter((p) => weg.some((e) => e.reihe === r.nr && e.art === "platte" && nah(e.x, p.x) && nah(e.y, p.y)) && !r.plaetze.some((pl) => auf(p)(pl) && belegt(pl)));
    const platzWeg = (pl: FesterPlan["reihen"][number]["plaetze"][number]) =>
      !belegt(pl) && (weg.some((e) => e.reihe === r.nr && e.art === "platz" && nah(e.x, pl.x) && nah(e.y, pl.y) && gleicheEtage(e, pl)) || wegP.some((p) => auf(p)(pl)));
    return { ...r, platten: r.platten.map((p) => (wegP.includes(p) ? { ...p, entfernt: true as const } : p)), plaetze: r.plaetze.filter((pl) => !platzWeg(pl)) };
  });
  const reihen = gefiltert.map((r) => ({
    ...r,
    platten: [...r.platten],
    plaetze: r.plaetze.map((pl): Platz => {
      const t = pl.tierId != null ? offen.get(pl.tierId) : undefined;
      if (t && t.typ === pl.typ) {
        offen.delete(t.id);
        return { ...pl, tier: t };
      }
      return { ...pl, tier: null };
    }),
  }));
  type R = (typeof reihen)[number];
  const vorn = (r: R, t: number) => (r.front === "rechts" ? r.x : r.x + r.tiefe - t);
  // Eingesetzte Teile in den Reihen (auch nach dem Festschreiben eingesetzte): dort kommt keine neue Platte hin.
  const teile = teilStueckeFest(reihen, halle.flaechen, gang);
  /** Freies Ende eines Abschnitts: wo die nächste Platte beginnen würde (direkt hinter der letzten). */
  const endeIn = (r: R, a: { von: number; bis: number }, _typ: KaefigTyp) => {
    // Hinter der letzten Platte (bzw. dem letzten Platz, falls ältere feste Pläne keine passende Platte haben).
    const drin = [...r.plaetze.map((pl) => ({ y: pl.y, ende: pl.y + pl.breite, typ: pl.typ })), ...r.platten.map((pl) => ({ y: pl.y, ende: pl.y + pl.laenge, typ: pl.typ }))].filter(
      (x) => x.y >= a.von - 0.5 && x.y < a.bis,
    );
    if (!drin.length) return a.von;
    const letzter = drin.reduce((x, y) => (y.ende > x.ende ? y : x));
    return letzter.ende;
  };
  const nrWert = (nr: string | null) => (nr ? parseInt(nr, 10) : NaN);
  const nochZuStellen: PlanTier[] = [];
  for (const t of offen.values()) {
    // Bezug: der belegte Platz mit der nächstkleineren Nummer (24a neben 24).
    const wert = nrWert(t.nr);
    let bezug: { ri: number; y: number; nr: number } | null = null;
    reihen.forEach((r, ri) => {
      for (const pl of r.plaetze) {
        const n = pl.tier ? nrWert(pl.tier.nr) : NaN;
        if (!Number.isNaN(n) && n <= wert && (!bezug || n > bezug.nr)) bezug = { ri, y: pl.y, nr: n };
      }
    });
    const b = bezug as { ri: number; y: number } | null;
    const abstandZu = (ri: number, y: number) => (b ? Math.abs(ri - b.ri) * 1e6 + Math.abs(y - b.y) : ri * 1e6 + y);
    // 1. Freier Platz gleicher Größe.
    let bester: Platz | null = null;
    let besterAbstand = Infinity;
    reihen.forEach((r, ri) => {
      for (const pl of r.plaetze) {
        if (pl.tier || pl.typ !== t.typ) continue;
        const ab = abstandZu(ri, pl.y);
        if (ab < besterAbstand) {
          besterAbstand = ab;
          bester = pl;
        }
      }
    });
    // 2. Freies Reihenende: eine ganze neue Grundplatte (Einzelkäfige gibt es nicht), ihre übrigen Plätze frei. Nur hinter
    // derselben Sparte oder in einem leeren Abschnitt – keine Hühner hinter den Tauben; gibt es das nicht, jedes Reihenende.
    const mass = kaefigMass(t.typ, masse)!;
    const { n, etagen: et, laenge, tiefe: plTiefe } = platteFuer(t.typ, mass, halle);
    /** Sparte des hintersten belegten Platzes im Abschnitt (null: Abschnitt ohne Tier). */
    const letzteSparte = (r: R, a: { von: number; bis: number }) => {
      const belegt = r.plaetze.filter((pl) => pl.tier && pl.y >= a.von - 0.5 && pl.y < a.bis);
      if (!belegt.length) return null;
      return belegt.reduce((x, y) => (y.y > x.y ? y : x)).tier!.sparte ?? "";
    };
    let anbau: { r: R; y: number } | null = null;
    let anbauAbstand = Infinity;
    for (const nurGleicheSparte of [true, false]) {
      reihen.forEach((r, ri) => {
        for (const a of r.abschnitte) {
          const y = hinterStuecken(teile.get(r), endeIn(r, a, t.typ), laenge);
          if (y + laenge > a.bis + 1e-6) continue;
          // Ein von Hand ganz leer geräumter Abschnitt bekommt keine neue Platte.
          const imA = (pl: { y: number }) => pl.y >= a.von - 0.5 && pl.y < a.bis;
          if (r.platten.some((pl) => pl.entfernt && imA(pl)) && !r.platten.some((pl) => !pl.entfernt && imA(pl))) continue;
          if (nurGleicheSparte) {
            const letzte = letzteSparte(r, a);
            if (letzte != null && letzte !== (t.sparte ?? "")) continue;
          }
          const ab = abstandZu(ri, y);
          if (ab < anbauAbstand) {
            anbauAbstand = ab;
            anbau = { r, y };
          }
        }
      });
      if (anbau) break;
    }
    // Der freie Platz gewinnt, wenn er nicht weiter Reihen vom Nachbarn entfernt ist als das Reihenende (in derselben Reihe
    // also immer – keine neue Platte, solange dort ein Platz frei ist); nur ein freier Platz in einer ferneren Reihe (etwa im
    // Bereich einer anderen Sparte) verliert gegen die freie Platte direkt beim Nachbarn.
    if (bester && Math.floor(besterAbstand / 1e6) <= Math.floor(anbauAbstand / 1e6)) {
      (bester as Platz).tier = t;
      continue;
    }
    if (anbau) {
      const { r, y } = anbau as { r: R; y: number };
      for (let i = 0; i < n; i++)
        for (let e = 0; e < et; e++) r.plaetze.push({ tierId: null, typ: t.typ, x: vorn(r, mass.tiefe), y: y + i * mass.breite, breite: mass.breite, tiefe: mass.tiefe, ...etageFeld(e), tier: i === 0 && e === 0 ? t : null, angebaut: true });
      r.platten.push({ typ: t.typ, x: vorn(r, plTiefe), y, laenge, tiefe: plTiefe, plaetze: n * et, belegt: 1, angebaut: true });
      continue;
    }
    nochZuStellen.push(t);
  }

  // Volieren: festgeschriebene bleiben stehen; neue in frei gewordene Plätze, sonst in freie Stellplätze des Bereichs.
  const vTiere = tiere.filter((t) => t.typ === "voliere" && !fehlendeMasse.includes("voliere"));
  const vOffen = new Map(vTiere.map((t) => [t.id, t]));
  const vPlaetze = (fest.volieren ?? []).map((v) => {
    const t = vOffen.get(v.tierId);
    if (t) vOffen.delete(t.id);
    return { ...v, tier: t ?? null };
  });
  const neueVolieren = [...vOffen.values()];
  const stellplaetze = neueVolieren.length
    ? planeImReihensystem(halle, Array.from({ length: vPlaetze.length + neueVolieren.length }, (_, i) => ({ id: -1 - i, typ: "voliere" as KaefigTyp, nr: null, rasse: "", preisrichterId: null })), masse, eingesetzteVolieren).volieren
    : [];
  const deckt = (a: { x: number; y: number; breite: number; tiefe: number }, c: { x: number; y: number; breite: number; tiefe: number }) => ueberlappt({ x: a.x, y: a.y, b: a.breite, h: a.tiefe }, { x: c.x, y: c.y, b: c.breite, h: c.tiefe });
  const ohneVoliere: PlanTier[] = [];
  for (const t of neueVolieren) {
    const frei = vPlaetze.find((v) => !v.tier);
    if (frei) {
      frei.tier = t;
      continue;
    }
    const sp = stellplaetze.find((s) => !vPlaetze.some((v) => deckt(v, s)));
    if (sp) vPlaetze.push({ tierId: t.id, x: sp.x, y: sp.y, breite: sp.breite, tiefe: sp.tiefe, ...(sp.front ? { front: sp.front } : {}), tier: t });
    else ohneVoliere.push(t);
  }
  nochZuStellen.push(...ohneVoliere);

  // Warnungen der Flächen (ragt hinaus).
  const warnungen: string[] = halle.flaechen
    .filter((f) => f.x < 0 || f.y < 0 || f.x + f.breite > halle.breite || f.y + f.tiefe > halle.laenge)
    .map((f) => `„${f.name}“ ragt über die Halle hinaus.`);
  if (nochZuStellen.length) warnungen.push(`${nochZuStellen.length} ${nochZuStellen.length === 1 ? "Tier ist" : "Tiere sind"} noch zu stellen, kein passender Platz frei.`);

  // Reserve: frei gewordene Plätze und freie Reihenenden je Käfigart (jede Art für sich gerechnet).
  const typen = [...new Set(reihen.flatMap((r) => r.plaetze.map((pl) => pl.typ)))];
  const reserve = typen.map((typ) => {
    const km = kaefigMass(typ, masse);
    const { plaetze: jePl, laenge: plLaenge } = km ? platteFuer(typ, km, halle) : { plaetze: 1, laenge: Infinity };
    const frei = (r: R, a: { von: number; bis: number }) => (teile.get(r) ?? []).reduce((ab, b) => abziehen(ab, b.von, b.bis), [{ von: endeIn(r, a, typ), bis: a.bis }]);
    const enden = reihen.reduce((n, r) => n + r.abschnitte.reduce((m2, a) => m2 + frei(r, a).reduce((m3, st) => m3 + Math.max(0, Math.floor((st.bis - st.von + 1e-6) / plLaenge)) * jePl, 0), 0), 0);
    return { typ, anzahl: reihen.reduce((n, r) => n + r.plaetze.filter((pl) => !pl.tier && pl.typ === typ).length, 0) + enden };
  });
  return {
    reihen: reihen.map((r) => ({
      nr: r.nr,
      art: r.art,
      x: r.x,
      tiefe: r.tiefe,
      front: r.front,
      abschnitte: r.abschnitte,
      flaechen: [],
      beschriftung: LEER,
      versatz: { dx: 0, dy: 0 },
      drehung: 0,
      drehpunkt: { x: 0, y: 0 },
      // Belegung je Platte nach Storno und Nachmeldungen neu zählen.
      platten: r.platten.map((pl) => ({ ...pl, belegt: r.plaetze.filter((x) => x.tier && x.y >= pl.y - 0.5 && x.y < pl.y + pl.laenge - 0.5).length, rechteck: LEER })),
      kaefige: r.plaetze.filter((pl) => pl.tier).map((pl) => ({ ...pl.tier!, x: pl.x, y: pl.y, breite: pl.breite, tiefe: pl.tiefe, ...etageFeld(pl.etage), rechteck: LEER })),
      freiePlaetze: r.plaetze.filter((pl) => !pl.tier).map((pl) => ({ typ: pl.typ, x: pl.x, y: pl.y, breite: pl.breite, tiefe: pl.tiefe, ...etageFeld(pl.etage), rechteck: LEER, ...(pl.angebaut ? { angebaut: true as const } : {}) })),
    })),
    volieren: vPlaetze.filter((v) => v.tier).map((v) => ({ ...v.tier!, x: v.x, y: v.y, breite: v.breite, tiefe: v.tiefe, ...(v.front ? { front: v.front } : {}), rechteck: LEER })),
    nichtPlatziert: [...ohneMass, ...nochZuStellen],
    fehlendeMasse,
    reserve,
    reservePlatten: 0,
    warnungen,
  };
}
