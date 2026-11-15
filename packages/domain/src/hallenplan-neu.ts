/**
 * Plan neu setzen: Die Software stellt alle Käfige neu – nach den Einstellungen der Halle (Maße, Gänge, Richtung,
 * Wandreihen, Grundplatten) und ihren Flächen. Was zur bisherigen Aufstellung gehörte, passt zu einem neu gerechneten Plan
 * nicht mehr und fällt weg: von Hand verschobene und gedrehte Reihen und Platten, entfernte leere Plätze und die
 * eingesetzten Käfigblöcke und Volieren (Tische, Bänke und Garnituren bleiben). Tiere, die danach nicht in die Reihen passen, bekommen Käfigblöcke wie mit
 * „Alle fehlenden Käfige einsetzen“ – nur in den nutzbaren Stücken der Reihen, nie in Gänge.
 * Volieren ohne Volierenbereich bleiben ohne Platz (von Hand einsetzen, mit Gang rundherum). Reine Rechnung.
 */
import { eingangsGang, istMoebel, planeHalle, type Halle, type Hallenplan, type HallenObjekt, type PlanTier, type Rechteck } from "./hallenplan";
import { fehlendeEinsetzen, type Belegt, type Einsatz } from "./hallenplan-fehlend";
import type { KaefigMasse, KaefigTyp } from "./kaefige";

/**
 * Was im Plan Platz einnimmt: Grundplatten (mit Käfigart), eingesetzte Teile, Flächen außer Volierenbereichen, der Gang vor
 * Eingängen und Notausgängen und die Volieren. Dieselbe Grundlage wie beim Einsetzen im Editor.
 */
export function belegtImPlan(halle: Pick<Halle, "breite" | "laenge" | "gang" | "flaechen">, plan: Pick<Hallenplan, "reihen" | "objekte" | "volieren">): Belegt[] {
  const flaeche = (f: Halle["flaechen"][number]): Rechteck => ({ x: f.x, y: f.y, b: f.breite, h: f.tiefe });
  return [
    ...plan.reihen.flatMap((r) => r.platten.filter((pl) => !pl.entfernt).map((pl) => ({ q: pl.rechteck, typ: pl.typ }))),
    ...plan.objekte.map((o) => ({ q: o.rechteck })),
    ...halle.flaechen.filter((f) => f.art !== "volieren").map((f) => ({ q: flaeche(f) })),
    ...halle.flaechen.filter((f) => f.art === "eingang").map((f) => ({ q: eingangsGang(halle, f) })),
    ...plan.volieren.map((v) => ({ q: v.rechteck })),
  ];
}

/**
 * Halle ohne alles, was zur bisherigen Aufstellung gehört (siehe oben); `reihenVersatz` bleibt nur, wenn angegeben. Tische,
 * Bänke und Garnituren bleiben stehen: sie gehören zur Halle wie die Flächen, die Reihen weichen ihnen aus.
 */
export function halleZumNeuSetzen(halle: Halle, reihenVersatz: Halle["reihenVersatz"] = []): Halle {
  const { entfernt: _e, ...rest } = halle;
  return { ...rest, objekte: (halle.objekte ?? []).filter(istMoebel), reihenVersatz, plattenVersatz: [] };
}

/**
 * Halle für einen neu gesetzten Plan: ohne die bisherige Aufstellung, mit Käfigblöcken (bzw. Volieren) für die Tiere, die
 * nicht in die Reihen passen. `ohne`: Tiere, die auch so keinen Platz haben (die Halle ist zu klein).
 * `reihenVersatz`: von Hand verschobene Reihen, die bleiben sollen (Einzelreihe an der Wand); in ihnen wird nichts
 * eingesetzt.
 */
export function neuSetzen(
  halle: Halle,
  tiere: PlanTier[],
  masse: KaefigMasse | null | undefined,
  opt: { reihenVersatz?: Halle["reihenVersatz"] } = {},
): { halle: Halle; plan: Hallenplan; eingesetzt: number; ohne: number } {
  const basis = halleZumNeuSetzen(halle, opt.reihenVersatz ?? []);
  const plan = planeHalle(basis, tiere, masse);
  if (!plan.nichtPlatziert.length) return { halle: basis, plan, eingesetzt: 0, ohne: 0 };
  // Volieren setzt die Software nicht selbst ein (sie brauchen einen Gang rundherum): ohne Volierenbereich bleiben sie ohne
  // Platz und werden von Hand eingesetzt.
  const { einsaetze } = fehlendeImPlan(basis, plan, masse);
  const ids = new Set((basis.objekte ?? []).map((o) => o.id));
  let n = 0;
  const neueId = () => {
    let id: string;
    do id = `neu${++n}`;
    while (ids.has(id));
    return id;
  };
  const objekte: HallenObjekt[] = einsaetze.map((e) => ({ id: neueId(), art: e.art, ...(e.art === "kaefigblock" ? { typ: e.typ } : {}), x: e.x, y: e.y, drehung: e.drehung, ...(e.art === "kaefigblock" ? { front: e.front } : {}), auto: true }));
  const neu: Halle = { ...basis, objekte: [...(basis.objekte ?? []), ...objekte] };
  const fertig = planeHalle(neu, tiere, masse);
  return { halle: neu, plan: fertig, eingesetzt: objekte.length, ohne: fertig.nichtPlatziert.length };
}

/**
 * Stellen für die Tiere ohne Platz – dieselbe Suche für „Plan neu setzen“ und den Knopf „Alle fehlenden Käfige einsetzen“
 * (siehe `fehlendeEinsetzen`): Platz nehmen Platten, Teile, Flächen, Gänge vor Eingängen und Volieren ein (`belegtImPlan`,
 * dazu `belegtDazu`, z. B. eben eingesetzte, noch nicht gespeicherte Teile). Nie in gedrehte Reihen, im automatischen
 * Plan auch nicht in von Hand verschobene. Volieren nur mit `volieren` (im Editor), `nur`: eine Käfigart, höchstens so viele.
 */
export function fehlendeImPlan(
  halle: Pick<Halle, "breite" | "laenge" | "gang" | "flaechen" | "platte" | "jePlatte" | "plattenMass" | "etagen">,
  plan: Hallenplan,
  masse: KaefigMasse | null | undefined,
  opt: { volieren?: boolean; belegtDazu?: Belegt[]; nur?: { typ: KaefigTyp; hoechstens?: number } } = {},
): { einsaetze: Einsatz[]; ohne: number } {
  const fehlend = opt.volieren ? plan.nichtPlatziert : plan.nichtPlatziert.filter((t) => t.typ !== "voliere");
  const reihen = plan.reihen.filter((r) => !r.drehung && (plan.fest || (!r.versatz.dx && !r.versatz.dy)));
  return fehlendeEinsetzen({ ...plan, nichtPlatziert: fehlend, reihen }, halle, masse, [...belegtImPlan(halle, plan), ...(opt.belegtDazu ?? [])], opt.nur);
}

/**
 * Steht im Plan etwas von Hand Geplantes, das beim Neu-Setzen wegfiele? Verschobene oder gedrehte Reihen und Platten,
 * entfernte leere Plätze, von Hand eingesetzte Käfigblöcke und Volieren. Automatisch eingesetzte Blöcke (`auto`) und Möbel
 * (sie bleiben) zählen nicht.
 */
export function vonHandGeplant(h: Pick<Halle, "reihenVersatz" | "plattenVersatz" | "objekte" | "entfernt">): boolean {
  return !!h.reihenVersatz?.length || !!h.plattenVersatz?.length || !!h.entfernt?.length || (h.objekte ?? []).some((o) => !o.auto && !istMoebel(o));
}
