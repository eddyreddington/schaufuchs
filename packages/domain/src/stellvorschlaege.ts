import { HAUPTGANG_STANDARD, planeHalle, type Halle, type Hallenplan, type PlanTier } from "./hallenplan";
import { neuSetzen } from "./hallenplan-neu";
import type { KaefigMasse } from "./kaefige";

/** Ein Vorschlag, wie die Halle gestellt werden kann – mit dem durchgerechneten Plan. */
export interface StellVorschlag {
  halle: Halle;
  plan: Hallenplan;
  /** Kurz, was diese Aufstellung ausmacht. */
  titel: string;
  nichtPlatziert: number;
  /** Freie Grundplatten (Vorgabemaß) nach dem Stellen – Platz für Nachmeldungen. */
  freiePlatten: number;
  /** Reihen, in denen Käfige stehen. */
  reihen: number;
  /** Hinweise des Plans außer „… haben keinen Platz“ (z. B. Überschneidungen). */
  hinweise: string[];
}

const LAGE_TEXT: Record<string, string> = {
  anfang: "Hauptgang am Anfang der Reihen",
  ende: "Hauptgang am Ende der Reihen",
  beide: "Hauptgang an beiden Enden",
  mitte: "Hauptgang quer durch die Mitte",
  keiner: "ohne Hauptgang",
};

/** Beschreibung einer Aufstellung. */
export function stellTitel(h: Halle): string {
  const hg = h.hauptgang ?? HAUPTGANG_STANDARD;
  return [
    (h.richtung ?? "quer") === "quer" ? "Reihen quer" : "Reihen längs",
    h.wandreihen ? "mit Wandreihen" : "ohne Wandreihen",
    LAGE_TEXT[hg.lage] ?? hg.lage,
    (h.wandBuendig ?? true) ? "bündig an Wänden ohne Eingang" : "mit Gang an allen Wänden",
  ].join(", ");
}

/** `neu`: so, wie „Plan neu setzen“ die Halle stellt (ohne die bisherige Aufstellung, Käfigblöcke für den Rest). */
function bewerte(roh: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, neu = false): StellVorschlag {
  const { halle, plan } = neu ? neuSetzen(roh, tiere, masse) : { halle: roh, plan: planeHalle(roh, tiere, masse) };
  return {
    halle,
    plan,
    titel: stellTitel(halle),
    nichtPlatziert: plan.nichtPlatziert.length,
    freiePlatten: plan.reservePlatten,
    reihen: plan.reihen.filter((r) => r.kaefige.length).length,
    hinweise: plan.warnungen.filter((w) => !/keinen Platz/.test(w)),
  };
}

/** Hinweis des Plans, wenn die Gänge zwischen den Reihen an beiden Enden zu sind – so darf nicht gestellt werden. */
const GAENGE_ZU = /Gänge an beiden Enden zu/;

/**
 * Alle Aufstellungen derselben Halle zum Vergleich: Reihenrichtung (quer, längs), Wandreihen, bündig an Wänden und Lage des
 * Hauptgangs (Anfang, Ende, beide, Mitte, ohne) werden durchprobiert; Eingänge und Flächen bleiben, die Reihen weichen ihnen
 * aus. Ohne eingestellten Hauptgang hat er in den Vorschlägen die Vorgabebreite. Jeder Vorschlag ist so gestellt wie mit
 * „Plan neu setzen“ (`neuSetzen`): von Hand verschobene Reihen und Platten, eingesetzte Teile und Startreihen je Sparte
 * gehören zur bisherigen Aufstellung und fallen weg; was nicht in die Reihen passt, bekommt Käfigblöcke.
 * Weggelassen wird nur, was nicht geht: keine Reihe passt in die Halle, oder die Gänge wären an beiden Enden zu.
 * Reihenfolge: alle Tiere untergebracht, keine Hinweise, dann am meisten Platz für Nachmeldungen. Gleich aussehende
 * Aufstellungen kommen nur einmal.
 */
export function stellVorschlaege(halle: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, anzahl = Infinity): { aktuell: StellVorschlag; vorschlaege: StellVorschlag[] } {
  const aktuell = bewerte(halle, tiere, masse);
  const hg = halle.hauptgang ?? HAUPTGANG_STANDARD;
  const breite = hg.breite > 0 ? hg.breite : HAUPTGANG_STANDARD.breite;
  const lagen = ["anfang", "ende", "beide", "mitte", "keiner"] as const;
  const kandidaten: StellVorschlag[] = [];
  for (const richtung of ["quer", "laengs"] as const)
    for (const wandreihen of [true, false])
      for (const wandBuendig of [true, false])
        for (const lage of lagen) {
          const v: Halle = { ...halle, richtung, wandreihen, wandBuendig, hauptgang: { breite: lage === "keiner" ? 0 : breite, lage }, spartenStart: [] };
          const k = bewerte(v, tiere, masse, true);
          // Nicht möglich: keine Reihe in der Halle, oder die Gänge sind an beiden Enden zu.
          if (!k.plan.reihen.length || k.plan.warnungen.some((w) => GAENGE_ZU.test(w))) continue;
          kandidaten.push(k);
        }
  const besser = (a: StellVorschlag, b: StellVorschlag) =>
    a.nichtPlatziert - b.nichtPlatziert || a.hinweise.length - b.hinweise.length || b.freiePlatten - a.freiePlatten || a.reihen - b.reihen;
  kandidaten.sort(besser);
  // Gleiches Bild (gleiche Platten an gleicher Stelle) nur einmal – auch nicht noch einmal die bisherige Aufstellung.
  const lage = (q: { x: number; y: number; b: number; h: number }) => [Math.round(q.x), Math.round(q.y), Math.round(q.b), Math.round(q.h)];
  // Mit den eingesetzten Teilen: derselbe Plan neu gesetzt (andere Käfigblöcke) ist ein eigener Vorschlag.
  const bild = (p: Hallenplan) => JSON.stringify([p.reihen.flatMap((r) => r.platten.map((pl) => lage(pl.rechteck))), p.objekte.map((o) => lage(o.rechteck))]);
  const gesehen = new Set([bild(aktuell.plan)]);
  const vorschlaege: StellVorschlag[] = [];
  for (const k of kandidaten) {
    const b = bild(k.plan);
    if (gesehen.has(b)) continue;
    gesehen.add(b);
    vorschlaege.push(k);
    if (vorschlaege.length >= anzahl) break;
  }
  return { aktuell, vorschlaege };
}
