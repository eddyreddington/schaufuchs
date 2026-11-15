/**
 * Hallenplan: Wie stehen die Käfige in der Halle? Die Halle ist ein Rechteck (Maße in cm, x = Breite, die kurze
 * Seite; y = Länge). Die Reihen laufen meist quer (parallel zur kurzen Seite) und folgen über die Länge aufeinander;
 * „längs“ ist wählbar. An den beiden Wänden quer zu den Reihen steht je eine Einzelreihe (Front zum Gang), dazwischen
 * Doppelreihen Rücken an Rücken; zwischen allen Reihen und an den Reihenenden bleibt ein Gang (Gangbreite der Halle). Eingänge
 * halten rundherum einen Gang frei; an Freiflächen (Bühne, Kasse …) laufen die Käfige ohne Abstand bis an die Fläche – nur
 * im Gang vor den Käfigen darf keine Fläche stehen. Volieren stehen frei in eigenen Volierenbereichen.
 *
 * Die Käfige stehen auf Grundplatten von rund 2 m, je Platte eine Käfigart (zwei 100er, drei 70er, vier 50er, fünf 40er).
 * Gestellt wird streng in Katalogfolge (= Käfignummern) Reihe für Reihe, ohne Sonderregeln für Tauben oder Käfiggrößen:
 * die Platten stehen ganz und lückenlos aneinander, auch über Sparten und Käfigarten hinweg (Rückmeldung 14.11.2026); die
 * Käfige der nächsten Art stehen zuerst auf dem Rest der angefangenen Platte, wenn sie hineinpassen (`Halle.restPlaetze`),
 * frei bleibt sonst nur der Rest der letzten Platte. Die Reihen werden danach gleich lang gestellt (`planeAusgeglichen`). Reine Rechnung ohne Datenbank – Grundlage für Plan, Aufbauliste und
 * Platzreserve.
 */
import { KAEFIG_TYP_LABEL, kaefigMass, kaefigName, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { istRechteckUmriss, mitUmrissSperren, type Punkt, tuerOeffnung, umrissNormal } from "./hallenplan-umriss";
import { blockFolge } from "./hallenplan-folge";

export interface HallenFlaeche {
  name: string;
  /** „sperre“: hier stehen keine Käfige; „eingang“: Ein- oder Ausgang (frei, im Plan als Tür); „volieren“: Platz für Volieren. */
  art: "sperre" | "eingang" | "volieren";
  x: number;
  y: number;
  breite: number;
  tiefe: number;
  /** Nur intern: eingesetzte Voliere – wie ein Eingang mit einem Gang rundherum (sonst gilt das Teil als Freifläche). */
  mitGang?: boolean;
  /** Nur intern: außerhalb des Grundrisses (Entscheidung 019) – Sperrfläche für die Planung, nie gespeichert oder gezeichnet. */
  aussen?: boolean;
  /**
   * Nur intern: eingesetzter Käfigblock. Steht er ganz in einer Reihe, belegt er dort nur sein Stück – die Platten der Reihe
   * stehen davor und dahinter, die Abschnitte und damit die Folge der Sparten bleiben dieselben.
   */
  teil?: boolean;
  /** Nur intern: eingesetzter Tisch, Bank oder Garnitur – für die Reihen wie eine Freifläche. */
  moebel?: boolean;
}

export interface Halle {
  /** Umschließendes Rechteck (cm); bei freiem Grundriss dessen Breite und Länge. */
  breite: number;
  laenge: number;
  /**
   * Freier, rechtwinkliger Grundriss (Entscheidung 019): Ecken in cm, links oben bei 0/0, im Uhrzeigersinn (`umrissNormal`).
   * Fehlt er, ist die Halle das Rechteck aus Breite und Länge.
   */
  umriss?: Punkt[];
  /** Mindestbreite der Gänge (cm). */
  gang: number;
  /** „quer“: Reihen parallel zur kurzen Seite (üblich); „laengs“: parallel zur langen Seite. */
  richtung: "quer" | "laengs";
  /** Einzelreihen an den beiden Wänden, an denen die Reihen entlanglaufen. */
  wandreihen: boolean;
  /**
   * Einzelreihe nur an einer dieser Wände (mit `wandreihen`): „anfang“ an der Wand, an der R1 steht, „ende“ gegenüber.
   * Fehlt die Angabe, an beiden.
   */
  wandreiheSeite?: "anfang" | "ende";
  /** Früher: Quergang zwischen zwei Käfiggrößen. Wird nicht mehr beachtet (Käfige stehen lückenlos), bleibt für ältere Hallen. */
  quergang: boolean;
  /**
   * Reihenenden an Wänden ohne Eingang (und ohne Hauptgang) bündig an die Wand – so wird üblich gestellt. Fehlt die
   * Angabe (ältere Hallen), gilt bündig.
   */
  wandBuendig?: boolean;
  /** Breiter Hauptgang an den Reihenenden (bei Reihen quer: an der Längsseite) oder quer durch die Mitte. */
  hauptgang?: Hauptgang;
  /** Früher: einheitliche große Grundplatte. Bestimmt die Platten nicht mehr (sie richten sich nach den Käfigen), bleibt für ältere Hallen. */
  platte?: Grundplatte;
  /** Käfige je Grundplatte, abweichend von der Vorgabe (siehe `kaefigeJePlatte`). */
  jePlatte?: Partial<Record<KaefigTyp, number>>;
  /** Grundplatte je Käfigart, abweichend von der Vorgabe (siehe `platteFuer`), z. B. 160 × 40 für 40er-Käfige. */
  plattenMass?: Partial<Record<KaefigTyp, Grundplatte>>;
  /** Käfige übereinander je Käfigart (Etagen auf einer Grundplatte); fehlt die Angabe, eine Etage. Siehe `etagenVon`. */
  etagen?: Partial<Record<KaefigTyp, number>>;
  flaechen: HallenFlaeche[];
  /** Von Hand eingesetzte Volieren (nehmen die gemeldeten Volieren der Reihe nach auf) und leere Käfigblöcke. */
  objekte?: HallenObjekt[];
  /** Von Hand verschobene und gedrehte Reihen (Versatz in cm, Hallenkoordinaten; Drehung in 90°-Schritten um die Mitte). */
  reihenVersatz?: { nr: number; dx: number; dy: number; drehung?: Drehung }[];
  /**
   * Von Hand verschobene oder gedrehte einzelne Grundplatten mit ihren Käfigen: Reihe (R-Nummer), Platte (laufende Nummer
   * in der Reihe, ab 0), Versatz in cm (Hallenkoordinaten) und Drehung um die Mitte der Platte.
   */
  plattenVersatz?: { reihe: number; platte: number; dx: number; dy: number; drehung?: Drehung }[];
  /**
   * Übrige Plätze auf der letzten Platte einer Käfigart, wenn danach eine andere Art folgt. „naechsteArt“ (Standard, Rückmeldung
   * 14.11.2026: „Ja, mischen erlaubt“): passen die Käfige der nächsten Art auf den Rest (Länge und Tiefe der Platte reichen),
   * stehen sie zuerst dort – so bleibt mitten in der Reihe kein „frei“. „frei“: jede Platte sortenrein, die übrigen Plätze
   * bleiben frei, die nächste Art beginnt auf ihrer eigenen Platte (früheres Verhalten, ohne Schalter in der Oberfläche).
   */
  restPlaetze?: "frei" | "naechsteArt";
  /** Früher: Startreihe je Sparte. Wird nicht mehr beachtet (strenge Katalogfolge), bleibt für ältere Hallen. */
  spartenStart?: { sparte: string; reihe: number }[];
  /**
   * Im festen Plan entfernte leere Grundplatten und freie Käfigplätze: Reihe und Lage im Reihensystem (wie im festen Plan).
   * Der feste Plan selbst bleibt unverändert; „Plan neu setzen“ und neues Festschreiben leeren die Liste. Siehe
   * `leereEntfernen`.
   */
  entfernt?: EntfernterPlatz[];
}

/** Entfernte leere Grundplatte (Lage der Platte) bzw. entfernter freier Platz im festen Plan. */
export interface EntfernterPlatz {
  reihe: number;
  art: "platte" | "platz";
  x: number;
  y: number;
  /** Platz: Etage (fehlt: unten). */
  etage?: number;
}

export type Drehung = 0 | 90 | 180 | 270;

/** Rechteck um den Punkt c in 90°-Schritten drehen (Hallenkoordinaten x/y). */
export function dreheRechteck(q: Rechteck, c: { x: number; y: number }, grad: Drehung | number): Rechteck {
  const g = ((grad % 360) + 360) % 360;
  if (g === 90) return { x: c.x - (q.y + q.h - c.y), y: c.y + (q.x - c.x), b: q.h, h: q.b };
  if (g === 180) return { x: 2 * c.x - (q.x + q.b), y: 2 * c.y - (q.y + q.h), b: q.b, h: q.h };
  if (g === 270) return { x: c.x + (q.y - c.y), y: c.y - (q.x + q.b - c.x), b: q.h, h: q.b };
  return q;
}

/** Richtung, in die eine Käfigfront zeigt (Hallenkoordinaten: x+ zu größerem x, z+ zu größerem y). */
export type Blick = "x+" | "x-" | "z+" | "z-";

/** Richtung in 90°-Schritten drehen (wie `dreheRechteck`: 90° führt x in y über). */
export function dreheBlick(b: Blick, grad: Drehung | number): Blick {
  const folge: Blick[] = ["x+", "z+", "x-", "z-"];
  const g = ((((grad ?? 0) % 360) + 360) % 360) / 90;
  return folge[(folge.indexOf(b) + g) % 4]!;
}

/** Front der Käfige einer Reihe in der Halle (Reihensystem: „rechts“ = zu größerem x; bei Reihen quer ist das Hallen-y). */
export function frontDerReihe(r: { front: "links" | "rechts"; drehung?: Drehung }, quer: boolean, plattenDrehung: Drehung | number = 0): Blick {
  const roh: Blick = quer ? (r.front === "rechts" ? "z+" : "z-") : r.front === "rechts" ? "x+" : "x-";
  return dreheBlick(dreheBlick(roh, r.drehung ?? 0), plattenDrehung);
}

/** Streifen der Breite `tief` vor der Seite `blick` eines Rechtecks. */
export function streifenVor(q: Rechteck, blick: Blick, tief: number): Rechteck {
  if (blick === "x+") return { x: q.x + q.b, y: q.y, b: tief, h: q.h };
  if (blick === "x-") return { x: q.x - tief, y: q.y, b: tief, h: q.h };
  if (blick === "z+") return { x: q.x, y: q.y + q.h, b: q.b, h: tief };
  return { x: q.x, y: q.y - tief, b: q.b, h: tief };
}

/** Der Gang vor den Käfigen jeder Grundplatte (Gangbreite der Halle, in Richtung der Front) – dort steht kein Tisch und keine Bank. */
export function gangVorKaefigen(plan: { quer: boolean; reihen: Pick<Reihe, "nr" | "front" | "drehung" | "platten">[] }, gang: number): { name: string; rechteck: Rechteck }[] {
  return plan.reihen.flatMap((r) =>
    r.platten.flatMap((pl) => (pl.entfernt ? [] : [{ name: `Gang vor R${r.nr}`, rechteck: streifenVor(pl.rechteck, frontDerReihe(r, plan.quer, pl.drehung ?? 0), Math.max(0, gang)) }])),
  );
}

/**
 * Feld eines Käfigs im Plan, wenn Käfige übereinander stehen: die Grundfläche quer zur Front in so viele Streifen geteilt,
 * wie es Etagen gibt – die unterste vorn am Gang, darüber nach hinten. So stehen beide Nummern einer Spalte im Plan.
 */
export function etagenStreifen(q: Rechteck, etage: number, etagen: number, front: Blick): Rechteck {
  if (etagen <= 1) return q;
  const e = Math.min(etagen - 1, Math.max(0, etage));
  if (front === "x+" || front === "x-") {
    const d = q.b / etagen;
    return { x: front === "x+" ? q.x + q.b - (e + 1) * d : q.x + e * d, y: q.y, b: d, h: q.h };
  }
  const d = q.h / etagen;
  return { x: q.x, y: front === "z+" ? q.y + q.h - (e + 1) * d : q.y + e * d, b: q.b, h: d };
}

/** Richtung im gedrehten Koordinatensystem (x und y vertauscht: Reihensystem bei Reihen quer, Zeichnung der Halle quer). */
export const blickTausch = (b: Blick): Blick => ((b[0] === "x" ? "z" : "x") + b[1]) as Blick;

/** Strecke von (x1, y1) nach (x2, y2) in Hallenkoordinaten. */
export interface Strecke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Kanten eines Käfigs, einer Grundplatte oder eines Blocks mit Front `front`: die dichte Rückwand gegenüber der Front, die
 * beiden dichten Seitenwände und die offene Front (Gitter). Für die Zeichnung im Plan und im Druck.
 */
export function kaefigKanten(q: Rechteck, front: Blick): { rueck: Strecke; seiten: [Strecke, Strecke]; front: Strecke } {
  const x1 = q.x, y1 = q.y, x2 = q.x + q.b, y2 = q.y + q.h;
  const senk = (x: number): Strecke => ({ x1: x, y1, x2: x, y2 });
  const waag = (y: number): Strecke => ({ x1, y1: y, x2, y2: y });
  if (front === "x+") return { front: senk(x2), rueck: senk(x1), seiten: [waag(y1), waag(y2)] };
  if (front === "x-") return { front: senk(x1), rueck: senk(x2), seiten: [waag(y1), waag(y2)] };
  if (front === "z+") return { front: waag(y2), rueck: waag(y1), seiten: [senk(x1), senk(x2)] };
  return { front: waag(y1), rueck: waag(y2), seiten: [senk(x1), senk(x2)] };
}

/** Front eines eingesetzten Käfigblocks ohne eigene Angabe: zur langen Seite (ungedreht zu größerem y, gedreht zu größerem x). */
export const blockFront = (q: Rechteck): Blick => (q.b >= q.h ? "z+" : "x+");

/**
 * Front eines Käfigblocks: seine Angabe `front`, wenn sie zu einer langen Seite zeigt (ungedreht z±, gedreht x±), sonst wie
 * `blockFront`. Die Front ist offen (Gitter), Rück- und Seitenwände sind dicht.
 */
export function objektFront(o: { front?: Blick; rechteck: Rechteck }): Blick {
  const lang = o.rechteck.b >= o.rechteck.h;
  if (o.front && (lang ? o.front[0] === "z" : o.front[0] === "x")) return o.front;
  return blockFront(o.rechteck);
}

/** Mitte des umschließenden Rechtecks. */
export function mitteVon(q: Rechteck[]): { x: number; y: number } {
  if (!q.length) return { x: 0, y: 0 };
  const x1 = Math.min(...q.map((a) => a.x)), y1 = Math.min(...q.map((a) => a.y));
  const x2 = Math.max(...q.map((a) => a.x + a.b)), y2 = Math.max(...q.map((a) => a.y + a.h));
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/** Tisch, Bank und Garnitur (Biertisch mit zwei Bänken): eingesetzte Teile ohne Käfigplatz. */
export type MoebelArt = "tisch" | "bank" | "garnitur";
export const MOEBEL_ARTEN: readonly MoebelArt[] = ["tisch", "bank", "garnitur"];
export const MOEBEL_NAME: Record<MoebelArt, string> = { tisch: "Tisch", bank: "Bank", garnitur: "Garnitur" };
/** Biertisch 220 × 50 cm, Bierbank 220 × 25 cm; in der Garnitur je eine Bank an jeder langen Seite, 15 cm vom Tisch. */
export const TISCH_STANDARD = { laenge: 220, tiefe: 50 } as const;
export const BANK_STANDARD = { laenge: 220, tiefe: 25 } as const;
export const GARNITUR_ABSTAND = 15;
/** Höhen (cm) für die 3D-Ansicht. */
export const TISCH_HOEHE = 77;
export const BANK_HOEHE = 47;

export const istMoebel = (o: { art: string }): o is { art: MoebelArt } => o.art === "tisch" || o.art === "bank" || o.art === "garnitur";

/** Maße eines Möbelstücks mit Vorgaben: Länge, Tiefe (Tisch bzw. Bank) und bei der Garnitur die Tiefe der Bänke. */
export function moebelMass(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }): { laenge: number; tiefe: number; bankTiefe: number; gesamt: number } {
  const std = o.art === "bank" ? BANK_STANDARD : TISCH_STANDARD;
  const laenge = o.laenge && o.laenge > 0 ? o.laenge : std.laenge;
  const tiefe = o.tiefe && o.tiefe > 0 ? o.tiefe : std.tiefe;
  const bankTiefe = o.bankTiefe && o.bankTiefe > 0 ? o.bankTiefe : BANK_STANDARD.tiefe;
  return { laenge, tiefe, bankTiefe, gesamt: o.art === "garnitur" ? tiefe + 2 * (bankTiefe + GARNITUR_ABSTAND) : tiefe };
}

/**
 * Tisch, Bank oder Garnitur in der Lage `q` (Hallenkoordinaten): die Körper darin – eine Garnitur als Bank, Tisch, Bank quer
 * zur Länge. Grundlage für Plan, Druck und 3D.
 */
export function moebelStuecke(o: { art: MoebelArt; laenge?: number; tiefe?: number; bankTiefe?: number }, q: Rechteck): { art: "tisch" | "bank"; q: Rechteck }[] {
  if (o.art !== "garnitur") return [{ art: o.art, q }];
  const m = moebelMass(o);
  const xLang = Math.abs(q.b - m.laenge) <= Math.abs(q.h - m.laenge);
  const stueck = (von: number, tief: number): Rechteck => (xLang ? { x: q.x, y: q.y + von, b: q.b, h: tief } : { x: q.x + von, y: q.y, b: tief, h: q.h });
  return [
    { art: "bank", q: stueck(0, m.bankTiefe) },
    { art: "tisch", q: stueck(m.bankTiefe + GARNITUR_ABSTAND, m.tiefe) },
    { art: "bank", q: stueck(m.gesamt - m.bankTiefe, m.bankTiefe) },
  ];
}

export interface HallenObjekt {
  id: string;
  art: "voliere" | "kaefigblock" | MoebelArt;
  /** Käfigart des Blocks (nur Käfigblock). */
  typ?: KaefigTyp;
  /** Tisch, Bank, Garnitur: Länge (lange Seite) und Tiefe des Tisches bzw. der Bank in cm; fehlt: Vorgabe. */
  laenge?: number;
  tiefe?: number;
  /** Garnitur: Tiefe der beiden Bänke (cm); fehlt: Vorgabe. */
  bankTiefe?: number;
  /** Linke vordere Ecke in der Halle (cm). */
  x: number;
  y: number;
  /** 0: lange Seite entlang der Breite (x); 90: gedreht. */
  drehung: 0 | 90;
  /** Käfigblock: Seite mit der offenen Front (Hallenkoordinaten, zu einer langen Seite); fehlt: siehe `blockFront`. */
  front?: Blick;
  /**
   * Von der Software eingesetzt („Plan neu setzen“, „Fehlende Käfige einsetzen“): gehört zum automatischen Plan, fällt beim
   * nächsten Neu-Setzen ohne Rückfrage weg. Wird der Block von Hand verschoben oder gedreht, entfällt das Kennzeichen.
   */
  auto?: boolean;
}

/** Halle mit allen Vorgaben ausgefüllt – ältere gespeicherte Hallen haben noch nicht jedes Feld. */
export function halleNormal(h: Halle): Halle {
  return {
    ...h,
    richtung: h.richtung ?? "quer",
    wandBuendig: h.wandBuendig ?? true,
    hauptgang: h.hauptgang ?? HAUPTGANG_STANDARD,
    platte: h.platte ?? GRUNDPLATTE_STANDARD,
    jePlatte: h.jePlatte ?? {},
    plattenMass: h.plattenMass ?? {},
    // Leer wie nicht da (ältere Hallen haben das Feld nicht; Schlüssel und feste Geometrie bleiben dieselben).
    etagen: etagenNormal(h.etagen),
    objekte: h.objekte ?? [],
    reihenVersatz: h.reihenVersatz ?? [],
    plattenVersatz: h.plattenVersatz ?? [],
    spartenStart: h.spartenStart ?? [],
    // Leer wie nicht da (ältere Hallen haben das Feld nicht; der Schlüssel bleibt derselbe).
    entfernt: h.entfernt?.length ? h.entfernt : undefined,
    // Ein Rechteck als Grundriss ist wie keiner (die Halle bleibt dieselbe).
    umriss: istRechteckUmriss(h.umriss) ? undefined : umrissNormal(h.umriss!),
  };
}

/** Text mit sortierten Schlüsseln (leere Felder fallen weg) – gleiche Halle ergibt immer denselben Text. */
export function stabilerText(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stabilerText).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stabilerText((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Kurzer Schlüssel für den Stand einer Halle – zum Erkennen gleichzeitiger Änderungen. */
export function halleSchluessel(h: Halle | null | undefined): string {
  if (!h) return "leer";
  const t = stabilerText(halleNormal(h));
  let x = 5381;
  for (let i = 0; i < t.length; i++) x = (Math.imul(x, 33) ^ t.charCodeAt(i)) >>> 0;
  return `${x.toString(36)}-${t.length}`;
}

/** Freier Gang zwischen Volierenreihen (cm). */
export const VOLIEREN_GANG = 150;

/**
 * Gang vor einem Eingang oder Notausgang (samt dem Ausgang selbst): in Fluchtrichtung, so breit wie der Ausgang und einen
 * Gang tief – seitlich daneben darf man bis an den Ausgang heran. In einer Ecke zählt die Wand, an der er flach anliegt.
 * Ein Eingang, der an keiner Wand liegt, behält einen Gang rundherum. Gilt in Hallen- wie im Reihensystem.
 */
export function eingangsGang(halle: Pick<Halle, "breite" | "laenge" | "gang" | "umriss">, f: Pick<HallenFlaeche, "x" | "y" | "breite" | "tiefe">): Rechteck {
  const g = Math.max(0, halle.gang);
  // Freier Grundriss (Entscheidung 019): die Wand, an der der Eingang liegt (auch eine Innenwand), wie bei der Türöffnung.
  if (!istRechteckUmriss(halle.umriss)) {
    const o = tuerOeffnung(umrissNormal(halle.umriss!), { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, 1);
    if (o) {
      if (o.y + o.h <= f.y + 0.5) return { x: f.x, y: f.y, b: f.breite, h: f.tiefe + g };
      if (o.y >= f.y + f.tiefe - 0.5) return { x: f.x, y: f.y - g, b: f.breite, h: f.tiefe + g };
      if (o.x + o.b <= f.x + 0.5) return { x: f.x, y: f.y, b: f.breite + g, h: f.tiefe };
      return { x: f.x - g, y: f.y, b: f.breite + g, h: f.tiefe };
    }
  }
  const waende = [
    f.x <= 1 && { quer: f.breite, q: { x: f.x, y: f.y, b: f.breite + g, h: f.tiefe } },
    f.x + f.breite >= halle.breite - 1 && { quer: f.breite, q: { x: f.x - g, y: f.y, b: f.breite + g, h: f.tiefe } },
    f.y <= 1 && { quer: f.tiefe, q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe + g } },
    f.y + f.tiefe >= halle.laenge - 1 && { quer: f.tiefe, q: { x: f.x, y: f.y - g, b: f.breite, h: f.tiefe + g } },
  ].filter((w): w is { quer: number; q: Rechteck } => !!w);
  const wand = waende.sort((a, b) => a.quer - b.quer)[0];
  return wand ? wand.q : { x: f.x - g, y: f.y - g, b: f.breite + 2 * g, h: f.tiefe + 2 * g };
}

/** Voliere ohne eingetragenes Maß: 2 × 1 m. */
const VOLIERE_ERSATZ = { breite: 200, tiefe: 100, hoehe: 180 };

/**
 * Größe eines eingesetzten Teils, ungedreht (lange Seite in x): eine Voliere nach dem Volierenmaß, ein Käfigblock so groß
 * wie die Grundplatte seiner Käfigart (ohne Maß: die Grundplatte der Halle).
 */
export function teilGroesse(o: { art: HallenObjekt["art"]; typ?: KaefigTyp; laenge?: number; tiefe?: number; bankTiefe?: number }, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">, masse: KaefigMasse | null | undefined): { lang: number; kurz: number } {
  if (o.art === "tisch" || o.art === "bank" || o.art === "garnitur") {
    // Ungedreht liegt die Länge in x (wie bei Volieren und Blöcken die lange Seite).
    const m = moebelMass({ ...o, art: o.art });
    return { lang: m.laenge, kurz: m.gesamt };
  }
  if (o.art === "voliere") {
    const v = kaefigMass("voliere", masse) ?? VOLIERE_ERSATZ;
    return { lang: v.breite, kurz: v.tiefe };
  }
  const typ = o.typ ?? "huehner";
  const km = kaefigMass(typ, masse);
  const pl = km ? platteFuer(typ, km, halle) : (halle.platte ?? GRUNDPLATTE_STANDARD);
  return { lang: pl.laenge, kurz: pl.tiefe };
}

export interface Hauptgang {
  breite: number;
  /** „anfang“: an der linken Längsseite (Reihen quer) bzw. vorn (längs); „ende“: gegenüber; „beide“; „mitte“: quer durch die Reihen. */
  lage: "anfang" | "ende" | "beide" | "mitte" | "keiner";
}

export const HAUPTGANG_STANDARD: Hauptgang = { breite: 300, lage: "anfang" };

/** Grundplatte eines Käfigblocks: Länge entlang der Reihe, Tiefe quer dazu. */
export interface Grundplatte {
  laenge: number;
  tiefe: number;
}

export const GRUNDPLATTE_STANDARD: Grundplatte = { laenge: 210, tiefe: 70 };

export const HALLE_STANDARD: Halle = { breite: 2000, laenge: 4000, gang: 150, richtung: "quer", wandreihen: true, quergang: false, wandBuendig: true, hauptgang: HAUPTGANG_STANDARD, platte: GRUNDPLATTE_STANDARD, jePlatte: {}, flaechen: [] };

/** Länge, auf die eine Grundplatte ausgelegt ist (cm): rund 2 m. */
export const PLATTE_LAENGE = 200;
/** So viel länger darf eine Grundplatte werden, damit ihre Käfige ganz darauf passen (drei 70er: 2,10 m). */
const PLATTE_UEBERMASS = 15;

/**
 * Wie viele Käfige einer Art auf einer Grundplatte stehen: eigene Angabe, sonst so viele, wie auf ihr eigenes Plattenmaß
 * passen, sonst so viele, wie auf rund 2 m passen – höchstens 2,15 m (100er: 2, 70er: 3 auf 2,10 m, 60er: 3, 50er: 4,
 * 40er: 5; ein Stammkäfig über 1,07 m steht allein).
 */
export function kaefigeJePlatte(typ: KaefigTyp, breite: number, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass">): number {
  const eigen = halle.jePlatte?.[typ];
  if (eigen && eigen >= 1) return Math.floor(eigen);
  const mass = halle.plattenMass?.[typ];
  if (mass) return Math.max(1, Math.floor((mass.laenge + 1e-6) / breite));
  return Math.max(1, Math.floor((PLATTE_LAENGE + PLATTE_UEBERMASS + 1e-6) / breite));
}

/**
 * Grundplatte einer Käfigart (Länge entlang der Reihe, Tiefe quer dazu) und wie viele Käfige darauf stehen. Eigenes
 * Plattenmaß der Käfigart geht vor; sonst ist die Platte so lang wie ihre Käfige zusammen (rund 2 m: zwei 100er, drei 70er
 * = 2,10 m, vier 50er, fünf 40er) und so tief wie ein Käfig.
 */
export function platteFuer(typ: KaefigTyp, mass: { breite: number; tiefe: number }, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass" | "etagen">): Grundplatte & { n: number; etagen: number; plaetze: number } {
  const n = kaefigeJePlatte(typ, mass.breite, halle);
  const etagen = etagenVon(typ, halle);
  const eigen = halle.plattenMass?.[typ];
  if (eigen) return { n, etagen, plaetze: n * etagen, laenge: Math.max(eigen.laenge, n * mass.breite), tiefe: Math.max(eigen.tiefe, mass.tiefe) };
  return { n, etagen, plaetze: n * etagen, laenge: n * mass.breite, tiefe: mass.tiefe };
}

/** Höchstens so viele Etagen übereinander. */
export const ETAGEN_MAX = 4;

/** Etagen einer Käfigart: eigene Angabe (1 bis 4), sonst eine. Volieren stehen nie übereinander. */
export function etagenVon(typ: KaefigTyp, halle: Pick<Halle, "etagen">): number {
  if (typ === "voliere") return 1;
  const e = Math.floor(halle.etagen?.[typ] ?? 1);
  return Math.min(ETAGEN_MAX, Math.max(1, Number.isFinite(e) ? e : 1));
}

/** Plätze auf einer Grundplatte: Käfige nebeneinander × Etagen. */
export function plaetzeJePlatte(typ: KaefigTyp, breite: number, halle: Pick<Halle, "platte" | "jePlatte" | "plattenMass" | "etagen">): number {
  return kaefigeJePlatte(typ, breite, halle) * etagenVon(typ, halle);
}

/** Nur Angaben über einer Etage; leer = nicht da. */
export function etagenNormal(e: Halle["etagen"]): Halle["etagen"] {
  const n = Object.fromEntries(Object.entries(e ?? {}).filter(([, v]) => v != null && Math.floor(v) > 1).map(([k, v]) => [k, Math.min(ETAGEN_MAX, Math.floor(v!))]));
  return Object.keys(n).length ? n : undefined;
}

/** Belegung eines Käfigblocks je Platz (Tier-Id, null = frei), ohne freie Plätze am Ende. */
export function blockBelegung(o: Pick<PlanObjekt, "kaefige">): (number | null)[] {
  const aus: (number | null)[] = [];
  for (const k of o.kaefige ?? []) aus[k.blockPlatz ?? aus.length] = k.id;
  return Array.from(aus, (x) => x ?? null);
}

/**
 * Lage eines Platzes in einem eingesetzten Käfigblock: die Plätze liegen entlang der langen Seite, je Spalte die Etagen
 * übereinander (gezählt unten zuerst). `plaetze`: alle Plätze (Spalten × Etagen).
 */
export function blockPlatz(q: Rechteck, plaetze: number, etagen: number, i: number): { rechteck: Rechteck; etage: number; breite: number; tiefe: number } {
  const lang = q.b >= q.h;
  const spalten = Math.max(1, Math.ceil(plaetze / Math.max(1, etagen)));
  const platz = (lang ? q.b : q.h) / spalten;
  const s = Math.floor(i / Math.max(1, etagen));
  return {
    rechteck: lang ? { x: q.x + s * platz, y: q.y, b: platz, h: q.h } : { x: q.x, y: q.y + s * platz, b: q.b, h: platz },
    etage: i % Math.max(1, etagen),
    breite: platz,
    tiefe: lang ? q.h : q.b,
  };
}

/** Ein Tier in Katalogfolge, wie es in einen Käfig kommt. */
export interface PlanTier {
  id: number;
  typ: KaefigTyp;
  /** Käfignummer (= Katalognummer), sobald vergeben. */
  nr: string | null;
  /** Käfigplatz, wenn er von der Katalognummer abweicht („Käfigplätze nach Plan“). */
  kaefig?: string | null;
  rasse: string;
  /** Sparte (Hühner, Zwerghühner, Tauben …) – für die Reihen je Sparte. */
  sparte?: string;
  preisrichterId: number | null;
}

/** Rechteck in Hallenkoordinaten (x entlang der Breite, y entlang der Länge) – zum Zeichnen. */
export interface Rechteck {
  x: number;
  y: number;
  b: number;
  h: number;
}

/**
 * Überschneiden sich zwei Rechtecke? Berühren zählt nicht, ebenso eine Überlappung bis `spiel` cm (Rundung beim
 * Rechnen in Zentimetern). Eine Stelle für Plan-Warnungen, Entfernen und Volieren, damit alle dieselbe Lage gleich sehen.
 */
export function ueberlappt(a: Rechteck, c: Rechteck, spiel = 0.5): boolean {
  return a.x < c.x + c.b - spiel && c.x < a.x + a.b - spiel && a.y < c.y + c.h - spiel && c.y < a.y + a.h - spiel;
}

export interface PlanKaefig extends PlanTier {
  /** Laufende Nummer der Grundplatte in ihrer Reihe (ab 0), auf der der Käfig steht. */
  platte?: number;
  /** Lage im Reihensystem (x quer zu den Reihen, y entlang der Reihe). */
  x: number;
  y: number;
  /** Frontbreite und Tiefe des Käfigs. */
  breite: number;
  tiefe: number;
  /** Etage (0 = unten; fehlt: unten). Käfige derselben Spalte haben dieselbe Grundfläche. */
  etage?: number;
  /** Voliere im Volierenbereich: Seite der offenen Front (zum Gang). */
  front?: Blick;
  /** Lage in der Halle. */
  rechteck: Rechteck;
  /** Nur bei mehreren Etagen: Feld im Plan (die Grundfläche quer zur Front geteilt, siehe `etagenStreifen`). */
  zeichnung?: Rechteck;
  /** Käfig in einem Käfigblock: laufende Nummer des Platzes darin (ab 0, siehe `blockPlatz`). */
  blockPlatz?: number;
}

export interface Reihe {
  nr: number;
  art: "wand" | "doppel";
  /** Linke Kante und Tiefe der Reihe (cm). */
  x: number;
  tiefe: number;
  /** Seite, zu der die Käfigfronten zeigen. */
  front: "links" | "rechts";
  /** Nutzbare Abschnitte entlang der Länge (y von–bis), nach Abzug der Sperrflächen. */
  abschnitte: { von: number; bis: number }[];
  /** Die Abschnitte als Rechtecke in der Halle (zum Vorzeichnen der Reihe). */
  flaechen: Rechteck[];
  /** Platz für die Beschriftung „R1“ vor dem Reihenanfang (in der Halle). */
  beschriftung: Rechteck;
  /** Von Hand verschoben (cm, Hallenkoordinaten). */
  versatz: { dx: number; dy: number };
  /** Von Hand gedreht (in 90°-Schritten um den Anfang der Reihe). */
  drehung: Drehung;
  /** Punkt, um den gedreht wird (Mitte des ersten Platzes der Reihe, mit Versatz; Hallenkoordinaten). */
  drehpunkt: { x: number; y: number };
  /** Grundplatten in dieser Reihe, lückenlos aneinander (je Platte nur eine Käfigart). */
  platten: PlanPlatte[];
  kaefige: PlanKaefig[];
  /** Nicht belegte Plätze auf Grundplatten (angefangene Platte, im festen Plan auch Storno oder Käfiggröße geändert) – für Nachmeldungen. */
  freiePlaetze?: FreierPlatz[];
}

export interface FreierPlatz {
  typ: KaefigTyp;
  /** Im festen Plan: Platz auf einer für eine Nachmeldung angebauten Platte (nicht im festen Plan, lässt sich nicht entfernen). */
  angebaut?: true;
  /** Laufende Nummer der Grundplatte in ihrer Reihe (ab 0). */
  platte?: number;
  x: number;
  y: number;
  breite: number;
  tiefe: number;
  /** Etage (0 = unten; fehlt: unten). */
  etage?: number;
  rechteck: Rechteck;
  /** Nur bei mehreren Etagen: Feld im Plan (siehe `etagenStreifen`). */
  zeichnung?: Rechteck;
}

/**
 * Festgeschriebener Plan: die Lage jedes Käfigs im Reihensystem (ohne Versatz und Drehung, die bleiben einstellbar).
 * Danach rechnet die Automatik nicht mehr neu; Nachmeldungen kommen in freie Plätze, sonst „noch zu stellen“.
 */
export interface FesterPlan {
  am: string;
  /** Maße von Halle und Käfigen beim Festschreiben – ändern sie sich, passt der feste Plan nicht mehr. */
  geometrie: string;
  reihen: {
    nr: number;
    art: Reihe["art"];
    x: number;
    tiefe: number;
    front: Reihe["front"];
    abschnitte: { von: number; bis: number }[];
    platten: Omit<PlanPlatte, "rechteck">[];
    plaetze: { tierId: number | null; typ: KaefigTyp; x: number; y: number; breite: number; tiefe: number; etage?: number }[];
  }[];
  /** Volieren im Volierenbereich (Reihensystem) und in eingesetzten Volieren (Teil → Tier). */
  volieren?: { tierId: number; x: number; y: number; breite: number; tiefe: number; front?: Blick }[];
  objektVolieren?: { objektId: string; tierId: number }[];
  /**
   * Tiere in eingesetzten Käfigblöcken (Teil → Tiere in der Folge der Plätze): sie bleiben dort, solange gemeldet. `null`:
   * Platz von Hand frei gemacht (Tier versetzt) – die Tiere dahinter rücken nicht nach.
   */
  objektKaefige?: { objektId: string; tierIds: (number | null)[] }[];
  /**
   * Von Hand versetzte oder getauschte Tiere (Tier versetzen, Rückmeldung 15.11.2026): „Lückenlos auffüllen“ vor dem
   * Nummerieren lässt sie, wo sie stehen.
   */
  vonHand?: number[];
  /** Reihenplätze, von denen ein Tier von Hand weg versetzt wurde: beim Auffüllen bleiben sie frei (keine Lücke). */
  freiGemacht?: { reihe: number; x: number; y: number; etage?: number }[];
}

export interface PlanPlatte {
  typ: KaefigTyp;
  /** Lage im Reihensystem. */
  x: number;
  y: number;
  laenge: number;
  tiefe: number;
  /** Plätze auf der Platte und davon belegt. */
  plaetze: number;
  belegt: number;
  rechteck: Rechteck;
  /** Von Hand verschoben bzw. gedreht (einzelne Platte, zusätzlich zur Reihe). */
  versatz?: { dx: number; dy: number };
  drehung?: Drehung;
  /**
   * Im festen Plan leer entfernt (`halle.entfernt`): bleibt als Platzhalter ohne Plätze stehen, damit die Nummern der
   * folgenden Platten (und ihr `plattenVersatz`) gleich bleiben und dort keine Nachmeldung angebaut wird. Nicht zeichnen,
   * nicht zählen.
   */
  entfernt?: true;
  /** Im festen Plan für eine Nachmeldung angebaut (nicht im festen Plan). */
  angebaut?: true;
  /** Trägt auf dem Rest auch Käfige einer anderen Art (siehe `Halle.restPlaetze`); `typ` ist die Art, mit der sie beginnt. */
  gemischt?: true;
}

export interface PlanObjekt extends HallenObjekt {
  rechteck: Rechteck;
  /** Bezeichnung im Plan, z. B. „Voliere 2“ oder „Block 50 × 50 × 50 cm“. */
  name: string;
  /** Voliere: das Tier darin (oder leer). */
  tier: PlanTier | null;
  /** Käfigblock: Zahl der Plätze. */
  plaetze: number;
  /** Käfigblock: die Tiere darin (aus „noch zu stellen“ zugeordnet); die übrigen Plätze sind leer. */
  kaefige?: PlanKaefig[];
}

export interface Hallenplan {
  /** Reihen quer zur Halle (parallel zur kurzen Seite). */
  quer: boolean;
  /** Von Hand eingesetzte Volieren und Käfigblöcke. */
  objekte: PlanObjekt[];
  reihen: Reihe[];
  volieren: PlanKaefig[];
  /** Tiere ohne Platz (Halle voll, Maß fehlt oder kein Volierenbereich). */
  nichtPlatziert: PlanTier[];
  /** Käfigarten, die gebraucht werden, aber kein Maß haben (Stamm, Voliere). */
  fehlendeMasse: KaefigTyp[];
  /** Wie viele Käfige je Art in den freien Rest der Reihen noch passen würden (jede Art für sich gerechnet). */
  reserve: { typ: KaefigTyp; anzahl: number }[];
  /** Freie Grundplatten in den Reihen. */
  reservePlatten: number;
  warnungen: string[];
  /** Festgeschrieben (Zeitpunkt); veraltet = Hallen- oder Käfigmaße danach geändert. */
  fest?: ({ am: string; veraltet: boolean } & Pick<FesterPlan, "vonHand" | "freiGemacht">) | null;
}

type Abschnitt = { von: number; bis: number };


/** Was beim Festschreiben gilt: Hallenmaße, Reihen und Käfigmaße (nicht Flächen oder eingesetzte Teile). */
export function festGeometrie(h: Halle, masse: KaefigMasse | null | undefined): string {
  const n = halleNormal(h);
  return stabilerText({ breite: n.breite, laenge: n.laenge, umriss: n.umriss, richtung: n.richtung, gang: n.gang, wandreihen: n.wandreihen, wandreiheSeite: n.wandreihen ? n.wandreiheSeite : undefined, wandBuendig: n.wandBuendig, hauptgang: n.hauptgang, platte: n.platte, jePlatte: n.jePlatte, plattenMass: n.plattenMass, etagen: n.etagen, masse: masse ?? {} });
}

/** Etage nur, wenn nicht unten (so bleiben Pläne ohne Etagen wie bisher). */
export const etageFeld = (e: number | undefined): { etage?: number } => (e ? { etage: e } : {});

/** Gleiche Etage (fehlt = unten). */
export const gleicheEtage = (a: { etage?: number }, b: { etage?: number }): boolean => (a.etage ?? 0) === (b.etage ?? 0);

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
function planeFest(halle: Halle, fest: FesterPlan, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren: boolean): Omit<Hallenplan, "quer" | "objekte"> {
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

/** Platzhalter im Reihensystem; die Lage in der Halle setzt `planeHalle`. */
const LEER: Rechteck = { x: 0, y: 0, b: 0, h: 0 };

/** Zieht von den Abschnitten das Intervall [von, bis] ab. */
/**
 * Stücke eingesetzter Teile (siehe `HallenFlaeche.teil`), die ganz im Streifen einer Reihe stehen – je Reihe, entlang der
 * Reihe sortiert. Dort steht keine Platte; die Abschnitte der Reihe bleiben, wie sie sind.
 */
function teilStuecke<R extends { x: number; tiefe: number }>(reihen: R[], flaechen: HallenFlaeche[]): Map<R, Abschnitt[]> {
  const m = new Map<R, Abschnitt[]>();
  for (const f of flaechen) {
    if (!f.teil) continue;
    const r = reihen.find((q) => f.x >= q.x - 0.5 && f.x + f.breite <= q.x + q.tiefe + 0.5);
    if (r) m.set(r, [...(m.get(r) ?? []), { von: f.y, bis: f.y + f.tiefe }].sort((a, b) => a.von - b.von));
  }
  return m;
}

/**
 * Im festen Plan: Stücke je Reihe, auf die keine angebaute Platte darf – jedes eingesetzte Teil, das in den Streifen der
 * Reihe ragt (Volieren samt Gang rundherum), auch wenn es nicht ganz darin steht.
 */
function teilStueckeFest<R extends { x: number; tiefe: number }>(reihen: R[], flaechen: HallenFlaeche[], gang: number): Map<R, Abschnitt[]> {
  const m = new Map<R, Abschnitt[]>();
  for (const f of flaechen) {
    if (!f.teil && !f.mitGang && !f.moebel) continue;
    // Tische und Bänke: auch nicht davor (der Gang vor der neuen Platte bleibt frei).
    const g = f.mitGang || f.moebel ? gang : 0;
    for (const r of reihen) {
      if (f.x - g >= r.x + r.tiefe - 0.5 || f.x + f.breite + g <= r.x + 0.5) continue;
      m.set(r, [...(m.get(r) ?? []), { von: f.y - g, bis: f.y + f.tiefe + g }].sort((a, b) => a.von - b.von));
    }
  }
  return m;
}

/** Erste Stelle ab `y`, an der `laenge` frei von den Stücken ist (sortiert, siehe `teilStuecke`). */
function hinterStuecken(stuecke: Abschnitt[] | undefined, y: number, laenge: number): number {
  for (const b of stuecke ?? []) if (b.von < y + laenge - 1e-6 && y < b.bis - 1e-6) y = b.bis;
  return y;
}

function abziehen(abschnitte: Abschnitt[], von: number, bis: number): Abschnitt[] {
  const aus: Abschnitt[] = [];
  for (const a of abschnitte) {
    if (bis <= a.von || von >= a.bis) aus.push(a);
    else {
      if (von > a.von) aus.push({ von: a.von, bis: von });
      if (bis < a.bis) aus.push({ von: bis, bis: a.bis });
    }
  }
  return aus;
}

const m = (cm: number) => `${(cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} m`;

/**
 * Plan der Halle. Gerechnet wird im Reihensystem (x quer zu den Reihen, y entlang der Reihen); bei Reihen quer zur Halle
 * sind dafür Breite und Länge vertauscht. Die Rechtecke kommen in Hallenkoordinaten zurück.
 */
export function planeHalle(eingabe: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, fest?: FesterPlan | null): Hallenplan {
  // Freier Grundriss: außerhalb wird Sperrfläche – die Reihen planen um sie herum wie um jede andere (Entscheidung 019).
  const halle = mitUmrissSperren(eingabe);
  const quer = (halle.richtung ?? "quer") === "quer";
  const platte = halle.platte ?? GRUNDPLATTE_STANDARD;

  // Eingesetzte Teile: Größe, Lage in der Halle; Volieren nehmen die gemeldeten Volieren der Reihe nach auf.
  const volierenMass = kaefigMass("voliere", masse) ?? VOLIERE_ERSATZ;
  const freieVolieren = tiere.filter((t) => t.typ === "voliere");
  // Fester Plan: eine eingesetzte Voliere behält ihr Tier (solange es gemeldet ist); frei gewordene nehmen neue auf.
  const festeObjektVoliere = new Map<string, PlanTier>();
  for (const z of fest?.objektVolieren ?? []) {
    const i = freieVolieren.findIndex((t) => t.id === z.tierId);
    if (i >= 0 && (halle.objekte ?? []).some((o) => o.id === z.objektId && o.art === "voliere")) festeObjektVoliere.set(z.objektId, freieVolieren.splice(i, 1)[0]!);
  }
  let vNr = 0;
  const moebelNr: Record<MoebelArt, number> = { tisch: 0, bank: 0, garnitur: 0 };
  const objekte: PlanObjekt[] = (halle.objekte ?? []).map((o) => {
    const istVoliere = o.art === "voliere";
    const typ = o.typ ?? "huehner";
    // Ein Käfigblock hat die Grundplatte seiner Käfigart (ohne Maß: die Grundplatte der Halle).
    const { lang, kurz } = teilGroesse(o, halle, masse);
    const rechteck = o.drehung === 90 ? { x: o.x, y: o.y, b: kurz, h: lang } : { x: o.x, y: o.y, b: lang, h: kurz };
    if (istVoliere) {
      vNr++;
      return { ...o, rechteck, front: objektFront({ front: o.front, rechteck }), name: `Voliere ${vNr}`, tier: festeObjektVoliere.get(o.id) ?? freieVolieren.shift() ?? null, plaetze: 1 };
    }
    // Tisch, Bank, Garnitur: kein Käfigplatz.
    if (istMoebel(o)) return { ...o, rechteck, name: `${MOEBEL_NAME[o.art]} ${++moebelNr[o.art]}`, tier: null, plaetze: 0 };
    const mass = kaefigMass(typ, masse);
    return { ...o, typ, rechteck, front: objektFront({ front: o.front, rechteck }), name: `Block ${mass ? kaefigName(typ, masse) : KAEFIG_TYP_LABEL[typ]}`, tier: null, plaetze: mass ? plaetzeJePlatte(typ, mass.breite, halle) : 0 };
  });
  // Fester Plan: ein eingesetzter Käfigblock behält seine Tiere (gleiche Käfigart, noch gemeldet, höchstens so viele wie Plätze).
  const imBlock = new Map(tiere.filter((t) => t.typ !== "voliere").map((t) => [t.id, t]));
  // Je Platz das Tier (null: von Hand frei gemacht – bleibt frei, die Tiere dahinter rücken nicht nach). Ein nicht mehr
  // gemeldetes Tier fällt weg, die übrigen rücken wie bisher auf.
  const festeBlockTiere = new Map<string, (PlanTier | null)[]>();
  for (const z of fest?.objektKaefige ?? []) {
    const o = objekte.find((x) => x.id === z.objektId && x.art === "kaefigblock");
    if (!o) continue;
    const drin: (PlanTier | null)[] = [];
    for (const id of z.tierIds) {
      if (id == null) drin.push(null);
      else {
        const t = imBlock.get(id);
        if (t && t.typ === o.typ) {
          drin.push(t);
          imBlock.delete(id);
        }
      }
    }
    while (drin.length && drin.at(-1) == null) drin.pop();
    const platz = drin.slice(0, o.plaetze);
    // Mehr als Plätze (Block kleiner geworden): die übrigen sind wieder ohne Platz.
    for (const t of drin.slice(o.plaetze)) if (t) imBlock.set(t.id, t);
    if (platz.some((t) => t)) festeBlockTiere.set(o.id, platz);
  }
  const vergeben = new Set([...objekte.map((o) => o.tier?.id).filter((x) => x != null), ...[...festeBlockTiere.values()].flat().flatMap((t) => (t ? [t.id] : []))]);
  // Eingesetzte Teile sind für die Reihen Hindernisse: Volieren mit Gang rundherum, ein Käfigblock wie eine Freifläche – so
  // lässt er sich direkt an eine Reihe ansetzen (verlängert sie oder schließt eine Lücke).
  const hindernisse: HallenFlaeche[] = objekte.map((o) => ({ name: o.name, art: "sperre", x: o.rechteck.x, y: o.rechteck.y, breite: o.rechteck.b, tiefe: o.rechteck.h, mitGang: o.art === "voliere", teil: o.art === "kaefigblock", ...(istMoebel(o) ? { moebel: true } : {}) }));
  const alleFlaechen = [...halle.flaechen, ...hindernisse];

  const sys: Halle = quer
    ? { ...halle, breite: halle.laenge, laenge: halle.breite, flaechen: alleFlaechen.map((f) => ({ ...f, x: f.y, y: f.x, breite: f.tiefe, tiefe: f.breite })) }
    : { ...halle, flaechen: alleFlaechen };
  const rest = tiere.filter((t) => !vergeben.has(t.id));
  const eingesetzt = objekte.some((o) => o.art === "voliere");
  let p = fest ? planeFest(sys, fest, rest, masse, eingesetzt) : planeAusgeglichen(sys, rest, masse, eingesetzt);
  if (!fest) {
    // Käfigblöcke, die ganz in einer Reihe stehen, stehen meist dort, wo die Reihen ohne sie frei bleiben (so setzt „Fehlende
    // Käfige einsetzen“ und „Plan neu setzen“ sie ein). Dann gilt der Plan ohne sie – genau so, wie die Blöcke eingesetzt
    // wurden (sonst rückten z. B. Platten nicht mehr an eine Freifläche). Nur wenn eine Platte dort stünde, stellt die
    // Rechnung die Platten um die Blöcke herum.
    const inReihe = sys.flaechen.filter((f) => f.teil && p.reihen.some((r) => f.x >= r.x - 0.5 && f.x + f.breite <= r.x + r.tiefe + 0.5));
    if (inReihe.length) {
      const ohne = planeAusgeglichen({ ...sys, flaechen: sys.flaechen.filter((f) => !inReihe.includes(f)) }, rest, masse, eingesetzt);
      const auf = (r: Rechteck) => inReihe.some((f) => ueberlappt(r, { x: f.x, y: f.y, b: f.breite, h: f.tiefe }));
      if (!ohne.reihen.some((r) => r.platten.some((pl) => auf({ x: pl.x, y: pl.y, b: pl.tiefe, h: pl.laenge })))) p = ohne;
    }
  }
  const zuHalle = (x: number, y: number, b: number, h: number): Rechteck => (quer ? { x: y, y: x, b: h, h: b } : { x, y, b, h });
  const schieben = (q: Rechteck, v: { dx: number; dy: number }): Rechteck => ({ ...q, x: q.x + v.dx, y: q.y + v.dy });
  const versatzVon = (nr: number) => {
    const v = (halle.reihenVersatz ?? []).find((x) => x.nr === nr);
    return { dx: v?.dx ?? 0, dy: v?.dy ?? 0, drehung: (v?.drehung ?? 0) as Drehung };
  };
  const reihen: Reihe[] = p.reihen.map((r) => {
    const { drehung, ...v } = versatzVon(r.nr);
    // Gedreht wird um den Anfang der Reihe (Mitte ihres ersten Platzes), danach verschoben – kommen Tiere dazu, wächst die
    // gedrehte Reihe nur nach einer Seite und rückt nicht.
    const anfang = r.abschnitte[0]?.von ?? 0;
    const c = mitteVon([zuHalle(r.x, anfang, r.tiefe, r.tiefe)]);
    const lage = (q: Rechteck) => schieben(dreheRechteck(q, c, drehung), v);
    const von = r.abschnitte[0]?.von ?? 0;
    // Beschriftung „R1“ vor dem Reihenanfang; steht die Reihe bündig an der Wand, außen vor der Wand (im Rand der Zeichnung).
    const lang = Math.min(60, Math.max(30, halle.gang * 0.4));
    // Vor der Wand mit deutlichem Abstand (rund 80 cm Luft), damit „R1“ frei über der Wandlinie steht.
    const vorn = von >= lang + 10 ? von - lang - 5 : -lang - 80;
    // Einzelne Grundplatten: Käfige (und freie Plätze) gehören zu der Platte, auf der sie stehen (Reihensystem).
    const plattenLage = r.platten.map((pl) => lage(zuHalle(pl.x, pl.y, pl.tiefe, pl.laenge)));
    // Nur über die Lage entlang der Reihe: Platten einer Reihe überlappen sich dort nicht, und ein Käfig, der tiefer ist als
    // die Platte, steht quer zur Reihe vor ihr (Front links) – über x wäre er keiner Platte zugeordnet.
    const plattenNr = (_x: number, y: number) => r.platten.findIndex((pl) => y >= pl.y - 0.5 && y < pl.y + pl.laenge - 0.5);
    const pv = (i: number) => {
      const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === r.nr && x.platte === i);
      return e && (e.dx || e.dy || e.drehung) ? { dx: e.dx, dy: e.dy, drehung: (e.drehung ?? 0) as Drehung } : null;
    };
    const aufPlatte = (q: Rechteck, i: number) => {
      const e = i >= 0 ? pv(i) : null;
      return e ? schieben(dreheRechteck(q, mitteVon([plattenLage[i]!]), e.drehung), e) : q;
    };
    // Mehrere Etagen: Feld im Plan quer zur Front geteilt.
    const streifen = (typ: KaefigTyp, etage: number | undefined, q: Rechteck, i: number) => {
      const et = etagenVon(typ, halle);
      return et > 1 ? { zeichnung: etagenStreifen(q, etage ?? 0, et, frontDerReihe({ front: r.front, drehung }, quer, pv(i)?.drehung ?? 0)) } : {};
    };
    return {
      ...r,
      versatz: v,
      drehung,
      drehpunkt: { x: c.x + v.dx, y: c.y + v.dy },
      flaechen: r.abschnitte.map((a) => lage(zuHalle(r.x, a.von, r.tiefe, a.bis - a.von))),
      beschriftung: lage(zuHalle(r.x, vorn, r.tiefe, lang)),
      platten: r.platten.map((pl, i) => {
        const e = pv(i);
        return { ...pl, rechteck: aufPlatte(plattenLage[i]!, i), ...(e ? { versatz: { dx: e.dx, dy: e.dy }, drehung: e.drehung } : {}) };
      }),
      kaefige: r.kaefige.map((k) => {
        const i = plattenNr(k.x, k.y);
        const rechteck = aufPlatte(lage(zuHalle(k.x, k.y, k.tiefe, k.breite)), i);
        return { ...k, ...(i >= 0 ? { platte: i } : {}), rechteck, ...streifen(k.typ, k.etage, rechteck, i) };
      }),
      ...(r.freiePlaetze
        ? {
            freiePlaetze: r.freiePlaetze.map((f) => {
              const i = plattenNr(f.x, f.y);
              const rechteck = aufPlatte(lage(zuHalle(f.x, f.y, f.tiefe, f.breite)), i);
              return { ...f, ...(i >= 0 ? { platte: i } : {}), rechteck, ...streifen(f.typ, f.etage, rechteck, i) };
            }),
          }
        : {}),
    };
  });
  // Volieren stehen frei im Volierenbereich (dort zeilenweise im Reihensystem gelegt).
  const volieren = p.volieren.map((v) => ({ ...v, ...(v.front ? { front: quer ? blickTausch(v.front) : v.front } : {}), rechteck: quer ? { x: v.y, y: v.x, b: v.tiefe, h: v.breite } : { x: v.x, y: v.y, b: v.breite, h: v.tiefe } }));

  // Von Hand eingesetzte Käfigblöcke nehmen Tiere ohne Platz auf: passende Käfiggröße, in Katalogfolge. Die Plätze liegen
  // entlang der langen Seite des Blocks.
  // Die Blöcke in der Folge des Plans (wie „Nach Plan nummerieren“ zählt), die Tiere in der Folge ihrer Käfignummer (bei
  // gedrucktem Katalog die Käfigplätze, sonst die Katalognummer), ohne Nummer in Katalogfolge – so bleibt nach dem
  // Nummerieren jedes Tier in seinem Block und die Nummern folgen dem Plan.
  let nichtPlatziert = [...p.nichtPlatziert];
  const folge = new Map(tiere.map((t, i) => [t.id, i]));
  const kaefigNr = (t: PlanTier) => {
    const m = /^(\d+)/.exec((t.kaefig ?? t.nr ?? "").trim());
    return m ? Number(m[1]) : Infinity;
  };
  for (const i of blockFolge(reihen, objekte, quer ? "quer" : "laengs")) {
    const o = objekte[i]!;
    if (o.art !== "kaefigblock" || !o.plaetze) continue;
    const fix = festeBlockTiere.get(o.id) ?? [];
    const passend = nichtPlatziert.filter((t) => t.typ === o.typ).sort((a, b) => kaefigNr(a) - kaefigNr(b) || folge.get(a.id)! - folge.get(b.id)!);
    if (!passend.length && !fix.some((t) => t)) continue;
    // Plätze des Blocks: die festen, dahinter die Tiere ohne Platz. Von Hand frei gemachte Plätze bleiben frei.
    const rein: (PlanTier | null)[] = [...fix, ...passend.slice(0, o.plaetze - fix.length)];
    const et = etagenVon(o.typ!, halle);
    o.kaefige = rein.flatMap((t, i) => {
      if (!t) return [];
      const b = blockPlatz(o.rechteck, o.plaetze, et, i);
      return [{ ...t, x: 0, y: 0, breite: b.breite, tiefe: b.tiefe, ...etageFeld(b.etage), rechteck: b.rechteck, blockPlatz: i, ...(et > 1 ? { zeichnung: etagenStreifen(b.rechteck, b.etage, et, objektFront(o)) } : {}) }];
    });
    const ids = new Set(o.kaefige.map((t) => t.id));
    nichtPlatziert = nichtPlatziert.filter((t) => !ids.has(t.id));
  }

  // Prüfen, was von Hand verschoben oder eingesetzt ist: über die Halle hinaus oder überschneidend?
  // Eingesetzte Teile gingen als Hindernisse in die Rechnung ein – ihr „ragt hinaus“ meldet die Prüfung unten selbst.
  const teilNamen = new Set(objekte.map((o) => `„${o.name}“ ragt über die Halle hinaus.`));
  // Zahl der Tiere ohne Platz neu, nachdem die Käfigblöcke gefüllt sind.
  const zahlWarnung = (w: string) => / keinen Platz\.$/.test(w) || / noch zu stellen, /.test(w);
  const warnungen = p.warnungen.filter((w) => !teilNamen.has(w) && !zahlWarnung(w));
  if (nichtPlatziert.length)
    warnungen.push(
      fest
        ? `${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier ist" : "Tiere sind"} noch zu stellen, kein passender Platz frei.`
        : `${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier hat" : "Tiere haben"} keinen Platz.`,
    );
  const innen = (q: Rechteck) => q.x >= -0.5 && q.y >= -0.5 && q.x + q.b <= halle.breite + 0.5 && q.y + q.h <= halle.laenge + 0.5;
  const teile: { name: string; flaechen: Rechteck[]; bewegt: boolean; moebel?: true; freiBereich?: true }[] = [
    ...reihen
      .filter((r) => r.platten.some((pl) => !pl.versatz && !pl.entfernt))
      .map((r) => ({ name: `R${r.nr}`, flaechen: r.platten.filter((pl) => !pl.versatz && !pl.entfernt).map((pl) => pl.rechteck), bewegt: !!fest || r.versatz.dx !== 0 || r.versatz.dy !== 0 || r.drehung !== 0 })),
    // Einzeln verschobene Grundplatten prüfen sich für sich (auch gegen die übrigen Platten ihrer Reihe).
    ...reihen.flatMap((r) => r.platten.flatMap((pl, i) => (pl.versatz && !pl.entfernt ? [{ name: `R${r.nr} Platte ${i + 1}`, flaechen: [pl.rechteck], bewegt: true }] : []))),
    ...objekte.map((o) => ({ name: o.name, flaechen: [o.rechteck], bewegt: true, ...(istMoebel(o) ? { moebel: true as const } : {}) })),
    // Im festen Plan können Volieren nach dem Festschreiben auf Reihen geraten (Volierenbereich verschoben oder neu).
    ...(fest ? volieren.map((v) => ({ name: `Voliere ${v.nr ? `Nr. ${v.nr}` : v.rasse}`, flaechen: [v.rechteck], bewegt: true })) : []),
    ...halle.flaechen.filter((f) => f.art !== "volieren").map((f) => ({ name: `„${f.name}“`, flaechen: [{ x: f.x, y: f.y, b: f.breite, h: f.tiefe }], bewegt: false, ...(f.art === "sperre" ? { freiBereich: true as const } : {}) })),
  ];
  const meldungen: string[] = [];
  for (const t of teile) if (t.bewegt && t.flaechen.some((q) => !innen(q))) meldungen.push(`${t.name} ragt über die Halle hinaus.`);
  for (let a = 0; a < teile.length; a++) {
    for (let b = a + 1; b < teile.length; b++) {
      const A = teile[a]!, B = teile[b]!;
      if (!A.bewegt && !B.bewegt) continue;
      // Tische und Bänke dürfen in einem freien Bereich stehen (Cafeteria …).
      if ((A.moebel && B.freiBereich) || (B.moebel && A.freiBereich)) continue;
      if (A.flaechen.some((x) => B.flaechen.some((y) => ueberlappt(x, y)))) meldungen.push(`${A.name} überschneidet ${B.name}.`);
    }
  }
  // Tische und Bänke stehen frei, auch vor Käfigen. Im Gang vor einem Ein- oder Ausgang (Fluchtweg) nur ein Hinweis.
  const fluchtwege = halle.flaechen.filter((f) => f.art === "eingang").map((f) => ({ name: `Gang vor „${f.name}“`, rechteck: eingangsGang(halle, f) }));
  for (const o of objekte) {
    if (!istMoebel(o)) continue;
    const g = fluchtwege.find((x) => ueberlappt(o.rechteck, x.rechteck));
    if (g) meldungen.push(`${o.name} steht im ${g.name}.`);
  }
  // Von Hand gesetzte Volieren: mindestens 1,50 m Abstand (direkt aneinander = Rücken an Rücken oder nebeneinander, erlaubt).
  const handVolieren = objekte.filter((o) => o.art === "voliere");
  for (let a = 0; a < handVolieren.length; a++) {
    for (let b = a + 1; b < handVolieren.length; b++) {
      const A = handVolieren[a]!.rechteck, B = handVolieren[b]!.rechteck;
      const dx = Math.max(0, B.x - (A.x + A.b), A.x - (B.x + B.b));
      const dy = Math.max(0, B.y - (A.y + A.h), A.y - (B.y + B.h));
      const abstand = Math.max(dx, dy);
      if (abstand > 0.5 && abstand < VOLIEREN_GANG - 0.5)
        meldungen.push(`${handVolieren[a]!.name} und ${handVolieren[b]!.name} stehen nur ${m(abstand)} auseinander (mindestens ${m(VOLIEREN_GANG)} Gang).`);
    }
  }
  // Käfigfronten: offen zum Gang (siehe `frontFehler`).
  meldungen.push(...frontFehler(halle, { quer, reihen, objekte, volieren }).map((x) => `${x}.`));
  warnungen.push(...meldungen.slice(0, 6), ...(meldungen.length > 6 ? [`… und ${meldungen.length - 6} weitere Überschneidungen.`] : []));
  const veraltet = !!fest && fest.geometrie !== festGeometrie(halle, masse);
  if (veraltet) warnungen.unshift("Maße nach dem Festschreiben geändert.");
  return {
    ...p,
    quer,
    reihen,
    volieren,
    objekte,
    nichtPlatziert,
    warnungen,
    fest: fest ? { am: fest.am, veraltet, ...(fest.vonHand?.length ? { vonHand: fest.vonHand } : {}), ...(fest.freiGemacht?.length ? { freiGemacht: fest.freiGemacht } : {}) } : null,
  };
}

/**
 * Automatische Aufstellung mit ruhigem Bild (Rückmeldung 14.11.2026): Die Tiere stehen streng in Katalogfolge Reihe für Reihe,
 * lückenlos – auch über Sparten und Käfigarten hinweg (kleinere direkt an größere). Danach werden die Reihen so kurz und
 * gleich lang wie möglich: Gesucht ist die kleinste Länge je Reihenstück (vom Anfang her), bei der nicht mehr Tiere ohne
 * Platz bleiben und nicht mehr Reihen gebraucht werden als ohne Begrenzung. So beginnen alle Reihen bündig und enden etwa
 * gleich; der Rest jeder Reihe bleibt als Reserve für Nachmeldungen frei. Läuft die Halle über (ein Tier für die Reihen
 * ohne Platz), bleibt es bei der Aufstellung vom Anfang her: es gibt keine Reserve zu verteilen, und kein Tier mit einer
 * früheren Nummer verliert seinen Platz an ein späteres (Gegenprüfung 14.11.2026).
 */
function planeAusgeglichen(halle: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren = false): Omit<Hallenplan, "quer" | "objekte"> {
  const roh = planeImReihensystem(halle, tiere, masse, eingesetzteVolieren);
  const genutzt = (p: Omit<Hallenplan, "quer" | "objekte">) => p.reihen.filter((r) => r.platten.length).length;
  const reihenRoh = genutzt(roh);
  if (reihenRoh <= 1) return roh;
  // Volieren und Tiere ohne Maß stehen nicht in den Reihen – sie zählen hier nicht.
  if (roh.nichtPlatziert.some((t) => t.typ !== "voliere" && kaefigMass(t.typ, masse))) return roh;
  const passt = (p: Omit<Hallenplan, "quer" | "objekte">) => p.nichtPlatziert.length <= roh.nichtPlatziert.length && genutzt(p) <= reihenRoh;
  let unten = 0;
  let oben = Math.max(0, ...roh.reihen.flatMap((r) => r.abschnitte.map((a) => a.bis - a.von)));
  let beste = roh;
  // Auf 5 cm genau; die Platten stehen ganz, die Länge springt also in Plattenschritten.
  while (oben - unten > 5) {
    const mitte = Math.round((unten + oben) / 2);
    const p = planeImReihensystem(halle, tiere, masse, eingesetzteVolieren, mitte);
    if (passt(p)) {
      oben = mitte;
      beste = p;
    } else unten = mitte;
  }
  return beste;
}

/**
 * Stellen im Reihensystem. `kappe`: höchstens so lang wird jedes Reihenstück (ab seinem Anfang) belegt – für gleich lange
 * Reihen (siehe `planeAusgeglichen`).
 */
export function planeImReihensystem(halle: Halle, tiere: PlanTier[], masse: KaefigMasse | null | undefined, eingesetzteVolieren = false, kappe = Infinity): Omit<Hallenplan, "quer" | "objekte"> {
  const warnungen: string[] = [];
  const gang = Math.max(0, halle.gang);
  const mischen = halle.restPlaetze !== "frei";
  const fehlendeMasse = [...new Set(tiere.map((t) => t.typ))].filter((t) => !kaefigMass(t, masse));
  const nichtPlatziert: PlanTier[] = tiere.filter((t) => fehlendeMasse.includes(t.typ));
  const inReihen = tiere.filter((t) => t.typ !== "voliere" && !fehlendeMasse.includes(t.typ));
  const volierenTiere = tiere.filter((t) => t.typ === "voliere" && !fehlendeMasse.includes(t.typ));

  for (const f of halle.flaechen) {
    if (f.x < 0 || f.y < 0 || f.x + f.breite > halle.breite || f.y + f.tiefe > halle.laenge) warnungen.push(`„${f.name}“ ragt über die Halle hinaus.`);
  }

  // Einheiten: Grundplatte mit n Käfigen einer Art; ein Käfig, der länger ist als die Platte, steht für sich.
  const platte = halle.platte ?? GRUNDPLATTE_STANDARD;
  const einheit = (typ: KaefigTyp) => {
    const mass = kaefigMass(typ, masse)!;
    // Eine Grundplatte steht immer ganz (Einzelkäfige gibt es nicht), in der Größe ihrer Käfigart. Nicht belegte Plätze
    // bleiben auf der Platte frei.
    const pl = platteFuer(typ, mass, halle);
    return { mass, n: pl.n, etagen: pl.etagen, laenge: pl.laenge, plattenTiefe: pl.tiefe, tiefe: Math.max(pl.tiefe, mass.tiefe) };
  };
  // Reihentiefe: tiefste Einheit, die in Reihen steht (alle Reihen gleich tief, damit die Gänge gerade bleiben).
  const typenInReihen = [...new Set(inReihen.map((t) => t.typ))];
  const tiefe = Math.max(0, ...typenInReihen.map((t) => einheit(t).tiefe));
  const reihen: Reihe[] = [];
  /** Je Reihe: wo Freiflächen beginnen und enden (dort laufen die Käfige ohne Abstand an die Fläche). */
  const anFreiflaeche = new Map<Reihe, { anfaenge: number[]; enden: number[] }>();
  /** Je Reihe: Stücke, auf denen eingesetzte Teile stehen (dort keine Platte; Abschnitte bleiben, wie sie sind). */
  let besetzt = new Map<Reihe, Abschnitt[]>();
  if (tiefe > 0) {
    // Einzelreihen an beiden Wänden oder nur an einer (siehe `wandreiheSeite`).
    const wandAnfang = halle.wandreihen && halle.wandreiheSeite !== "ende";
    const wandEnde = halle.wandreihen && halle.wandreiheSeite !== "anfang";
    const wandTiefe = wandAnfang ? tiefe : 0;
    const innen = halle.breite - (wandAnfang ? tiefe : 0) - (wandEnde ? tiefe : 0);
    const doppel = Math.max(0, Math.floor((innen - gang) / (2 * tiefe + gang)));
    // Überschüssige Breite gleichmäßig auf die Gänge verteilen.
    const luecke = doppel > 0 ? (innen - doppel * 2 * tiefe) / (doppel + 1) : 0;
    const neu = (art: Reihe["art"], x: number, front: Reihe["front"]) => reihen.push({ nr: reihen.length + 1, art, x, tiefe, front, abschnitte: [], flaechen: [], beschriftung: LEER, versatz: { dx: 0, dy: 0 }, drehung: 0, drehpunkt: { x: 0, y: 0 }, platten: [], kaefige: [] });
    if (wandAnfang) neu("wand", 0, "rechts");
    for (let i = 0; i < doppel; i++) {
      const x0 = wandTiefe + luecke + i * (2 * tiefe + luecke);
      neu("doppel", x0, "links");
      neu("doppel", x0 + tiefe, "rechts");
    }
    if (wandEnde && halle.breite - (wandAnfang ? 2 : 1) * tiefe >= gang) neu("wand", halle.breite - tiefe, "links");
    if (reihen.length === 0 || (wandAnfang && wandEnde && halle.breite - 2 * tiefe < gang)) warnungen.push(`Die Halle ist zu schmal für Reihen mit ${m(tiefe)} Tiefe und ${m(gang)} Gang.`);

    // Nutzbare Abschnitte: Reihenenden frei (Gang bzw. Hauptgang). Eingänge, Volierenbereiche und eingesetzte Volieren mit
    // einem Gang Abstand rundherum. Freiflächen ohne Abstand: die Käfige laufen bis direkt an die Fläche – nur wo die Fläche
    // im Gang vor den Käfigen steht, bleibt die Reihe frei (der Gang behält seine volle Breite).
    const hg = halle.hauptgang ?? HAUPTGANG_STANDARD;
    // Reihenenden: Hauptgang, sonst bündig an die Wand (Vorgabe) bzw. Gang. Ein Eingang oder Notausgang hält nur dort einen
    // Gang frei, wo er ist (siehe unten) – nicht an der ganzen Wand. Damit die Gänge zwischen den Reihen nicht an beiden
    // Enden zu sind, bleibt ohne Hauptgang am Ende der Reihen ein Quergang (die Reihen füllen sich vom Anfang her).
    const buendig = halle.wandBuendig ?? true;
    const randGang = buendig ? 0 : gang;
    const anfang = hg.lage === "anfang" || hg.lage === "beide" ? Math.max(gang, hg.breite) : randGang;
    const endeRoh = hg.lage === "ende" || hg.lage === "beide" ? Math.max(gang, hg.breite) : randGang;
    const ende = anfang === 0 && endeRoh === 0 && hg.lage !== "mitte" && reihen.length > 1 ? gang : endeRoh;
    // Eine Wandreihe an einer Wand ohne Eingang läuft über die ganze Wand – auch durch den Hauptgang bis in die Ecke
    // (dort muss niemand durch); an einer Wand mit Eingang enden die Reihen wie alle anderen.
    const eingangAnSeite = (r: Reihe) => halle.flaechen.some((f) => f.art === "eingang" && (r.x <= 0 ? f.x <= 1 : f.x + f.breite >= halle.breite - 1));
    const durchgehend = (r: Reihe) => r.art === "wand" && buendig && !eingangAnSeite(r);
    besetzt = teilStuecke(reihen, halle.flaechen);
    for (const r of reihen) {
      const [von, bis] = durchgehend(r) ? [0, halle.laenge] : [anfang, halle.laenge - ende];
      let ab: Abschnitt[] = bis - von > 0 ? [{ von, bis }] : [];
      if (hg.lage === "mitte" && !durchgehend(r)) ab = abziehen(ab, (halle.laenge - hg.breite) / 2, (halle.laenge + hg.breite) / 2);
      const kanten = { anfaenge: [] as number[], enden: [] as number[] };
      for (const f of halle.flaechen) {
        // Eingesetztes Teil ganz in einer Reihe (z. B. ein Käfigblock aus „Fehlende Käfige einsetzen“): belegt dort nur sein
        // Stück (siehe `teilStuecke`), für alle anderen Reihen und Gänge ist es kein Hindernis. Sonst wie bisher (Freifläche
        // bzw. Voliere mit Gang).
        if (f.teil && reihen.some((q) => f.x >= q.x - 0.5 && f.x + f.breite <= q.x + q.tiefe + 0.5)) continue;
        // Tische, Bänke, Garnituren stehen frei: sie verschieben keine Reihe (Rückmeldung 14.11.2026).
        if (f.moebel) continue;
        if (f.art === "sperre" && !f.mitGang) {
          // Reihe samt Gang vor ihren Käfigen (Front zum Gang).
          const v1 = r.front === "rechts" ? r.x : r.x - gang;
          const v2 = r.front === "rechts" ? r.x + r.tiefe + gang : r.x + r.tiefe;
          if (f.x + f.breite <= v1 + 0.5 || f.x >= v2 - 0.5) continue;
          ab = abziehen(ab, f.y, f.y + f.tiefe);
          kanten.anfaenge.push(f.y);
          kanten.enden.push(f.y + f.tiefe);
          continue;
        }
        // Eingang: Gang nur davor (in Fluchtrichtung, so breit wie er); Volierenbereich und eingesetzte Voliere: rundherum.
        const z = f.art === "eingang" ? eingangsGang(halle, f) : { x: f.x - gang, y: f.y - gang, b: f.breite + 2 * gang, h: f.tiefe + 2 * gang };
        if (z.x + z.b <= r.x + 0.5 || z.x >= r.x + r.tiefe - 0.5) continue;
        ab = abziehen(ab, z.y, z.y + z.h);
      }
      r.abschnitte = ab;
      anFreiflaeche.set(r, kanten);
    }
  }

  // Stellen: streng aufsteigend in Katalogfolge, Reihe für Reihe und Abschnitt für Abschnitt, lückenlos – auch eine neue
  // Sparte geht direkt weiter (Rückmeldung 14.11.2026: „die reihen sollen ein bild bekommen und keine lücken“).
  // Jede Grundplatte trägt nur Käfige ihrer Art; die Platten stehen ganz und lückenlos aneinander. Füllen die Tiere die
  // letzte Platte einer Käfigart nicht, bleiben deren übrige Plätze frei (für Nachmeldungen), die nächste Käfigart beginnt
  // direkt dahinter auf ihrer eigenen Platte. Eine Platte, die nicht mehr ganz in den Abschnitt passt, beginnt im nächsten
  // (sie wird nie geteilt). Was keinen Platz mehr findet, bleibt ohne Platz (nie verstreut auf freie Plätze weiter vorn).
  // Längster freier Abschnitt: eine längere Platte passt nirgends (sofort aussortieren statt alle Reihen abzusuchen).
  const laengsterAbschnitt = Math.max(0, ...reihen.flatMap((r) => r.abschnitte.map((a) => a.bis - a.von)));
  // Ein Abschnitt kürzer als jede Grundplatte (z. B. das Wandstück neben einer Tür) bleibt frei.
  const kuerzestePlatte = Math.min(...typenInReihen.map((t) => einheit(t).laenge));
  const stellbar = (a: Abschnitt) => a.bis - a.von >= kuerzestePlatte - 1e-6;
  // Platte und Käfige stehen hinten: in der Doppelreihe Rücken an Rücken an der Partnerreihe, in der Wandreihe an der Wand.
  // Ist die Reihe tiefer (wegen größerer Käfige anderswo), wird der Rest vorn Gang, nicht Luft dazwischen.
  const vornIn = (r: Reihe, t: number) => (r.front === "rechts" ? r.x : r.x + r.tiefe - t);
  // pos: Spalte, die gerade gefüllt wird; etage: nächste freie Etage darin (Spalte für Spalte, unten zuerst).
  type Stand = { ri: number; ai: number; pos: number; etage: number; plEnde: number; letzter: { typ: KaefigTyp; mass: { breite: number; tiefe: number }; etagen: number } | null };
  const st: Stand = { ri: 0, ai: 0, pos: 0, etage: 0, plEnde: 0, letzter: null };
  while (st.ri < reihen.length && !reihen[st.ri]!.abschnitte.length) st.ri++;
  st.pos = st.plEnde = reihen[st.ri]?.abschnitte[0]?.von ?? 0;
  /** Rest der letzten Platte bis `bis`: freie Plätze ihrer Käfigart (für Nachmeldungen). */
  const restFrei = (bis: number) => {
    const r = reihen[st.ri];
    if (!r || !st.letzter) return;
    const { typ, mass, etagen } = st.letzter;
    const n = Math.floor((bis - st.pos + 1e-6) / mass.breite);
    for (let i = 0; i < n; i++)
      for (let e = i === 0 ? st.etage : 0; e < etagen; e++) (r.freiePlaetze ??= []).push({ typ, x: vornIn(r, mass.tiefe), y: st.pos + i * mass.breite, breite: mass.breite, tiefe: mass.tiefe, ...etageFeld(e), rechteck: LEER });
  };
  const hinterTeilen = (r: Reihe, y: number, laenge: number) => hinterStuecken(besetzt.get(r), y, laenge);
  /** Freie Stücke zwischen `von` und `bis` (ohne die Stücke eingesetzter Teile). */
  const stuecke = (r: Reihe, von: number, bis: number) => (besetzt.get(r) ?? []).reduce((ab, b) => abziehen(ab, b.von, b.bis), bis > von ? [{ von, bis }] : []);
  const naechsterAbschnitt = () => {
    restFrei(st.plEnde);
    st.ai++;
    while (st.ri < reihen.length && !reihen[st.ri]!.abschnitte[st.ai]) {
      st.ri++;
      st.ai = 0;
    }
    st.pos = st.plEnde = reihen[st.ri]?.abschnitte[st.ai]?.von ?? 0;
    st.etage = 0;
    st.letzter = null;
  };
  for (const t of inReihen) {
    const e = einheit(t.typ);
    if (e.laenge > laengsterAbschnitt + 1e-6) {
      nichtPlatziert.push(t);
      continue;
    }
    // Findet das Tier keinen Platz mehr, bleibt die Stelle für die folgenden (kleineren) erhalten.
    const vorher = { ...st, frei: reihen.map((r) => r.freiePlaetze?.length ?? 0) };
    let gestellt = false;
    while (st.ri < reihen.length) {
      const r = reihen[st.ri]!;
      const a = r.abschnitte[st.ai]!;
      if (!stellbar(a)) {
        naechsterAbschnitt();
        continue;
      }
      // Mischen (Standard, siehe `Halle.restPlaetze`): die nächste Käfigart steht zuerst auf dem Rest der Platte, wenn ihre
      // Käfige dort hineinpassen – Länge und Tiefe der Platte reichen (eine angefangene Spalte der vorigen Art bleibt, wie
      // sie ist; die Etagen gelten je Käfigart). Die Platte wird nie gekürzt.
      if (mischen && st.letzter && st.letzter.typ !== t.typ && e.mass.tiefe <= (r.platten.at(-1)?.tiefe ?? 0) + 1e-6) {
        const pos = st.etage > 0 ? st.pos + st.letzter.mass.breite : st.pos;
        if (pos + e.mass.breite <= st.plEnde + 1e-6) {
          st.pos = pos;
          st.etage = 0;
          st.letzter = { typ: t.typ, mass: e.mass, etagen: e.etagen };
          r.platten.at(-1)!.gemischt = true;
        }
      }
      // Andere Käfigart oder die Platte ist voll: der Rest der Platte bleibt frei, eine neue ganze Platte direkt daneben.
      if ((st.letzter && st.letzter.typ !== t.typ) || st.pos + e.mass.breite > st.plEnde + 1e-6) {
        // Steht dort ein eingesetztes Teil, beginnt die Platte dahinter.
        const start = hinterTeilen(r, st.plEnde, e.laenge);
        if (start + e.laenge > Math.min(a.bis, a.von + kappe) + 1e-6) {
          // Passt nicht mehr in den Abschnitt: weiter im nächsten.
          naechsterAbschnitt();
          continue;
        }
        restFrei(st.plEnde);
        r.platten.push({ typ: t.typ, x: vornIn(r, e.plattenTiefe), y: start, laenge: e.laenge, tiefe: e.plattenTiefe, plaetze: e.n * e.etagen, belegt: 0, rechteck: LEER });
        st.pos = start;
        st.etage = 0;
        st.plEnde = start + e.laenge;
      }
      r.kaefige.push({ ...t, x: vornIn(r, e.mass.tiefe), y: st.pos, breite: e.mass.breite, tiefe: e.mass.tiefe, ...etageFeld(st.etage), rechteck: LEER });
      // Nächste Etage derselben Spalte, sonst die nächste Spalte.
      if (++st.etage >= e.etagen) {
        st.etage = 0;
        st.pos += e.mass.breite;
      }
      st.letzter = { typ: t.typ, mass: e.mass, etagen: e.etagen };
      gestellt = true;
      break;
    }
    if (!gestellt) {
      nichtPlatziert.push(t);
      const { frei, ...stand } = vorher;
      Object.assign(st, stand);
      reihen.forEach((r, i) => {
        if (r.freiePlaetze) r.freiePlaetze.length = frei[i]!;
      });
    }
  }
  if (st.ri < reihen.length) restFrei(st.plEnde);
  // Was frei bleibt (Reserve für Nachmeldungen): je Reihenstück der Rest hinter seiner letzten Platte – die Reihen sind
  // gleich lang gestellt (siehe `planeAusgeglichen`), der Rest jeder Reihe bleibt frei. Auch ein Stück, das für die
  // bisherigen Platten zu kurz ist, zählt: eine kürzere Platte einer anderen Art passt vielleicht.
  const freiLaengen: number[] = [];
  for (const r of reihen)
    for (const a of r.abschnitte) {
      const drin = r.platten.filter((pl) => pl.y >= a.von - 0.5 && pl.y < a.bis - 0.5);
      const ende = drin.length ? Math.max(...drin.map((pl) => pl.y + pl.laenge)) : a.von;
      for (const s of stuecke(r, ende, a.bis)) freiLaengen.push(s.bis - s.von);
    }
  // Endet ein Abschnitt an einer Freifläche (und beginnt nicht an einer), rücken seine Platten und Käfige bis an die Fläche;
  // der Rest bleibt am Gang bzw. an der Wand.
  for (const r of reihen) {
    const k = anFreiflaeche.get(r);
    if (!k) continue;
    for (const a of r.abschnitte) {
      if (!k.anfaenge.some((y) => Math.abs(y - a.bis) < 0.5) || k.enden.some((y) => Math.abs(y - a.von) < 0.5)) continue;
      const drin = (y: number) => y >= a.von - 0.5 && y < a.bis - 0.5;
      const platten = r.platten.filter((pl) => drin(pl.y));
      // Stehen eingesetzte Teile im Abschnitt, rückt nichts (sonst liefen Platten auf sie).
      if (!platten.length || (besetzt.get(r) ?? []).some((b) => b.von < a.bis && a.von < b.bis)) continue;
      const d = a.bis - Math.max(...platten.map((pl) => pl.y + pl.laenge));
      if (d < 0.5) continue;
      for (const x of [...platten, ...r.kaefige.filter((x) => drin(x.y)), ...(r.freiePlaetze ?? []).filter((x) => drin(x.y))]) x.y += d;
    }
  }
  for (const r of reihen)
    for (const pl of r.platten) {
      const auf = (x: { y: number }) => x.y >= pl.y - 0.5 && x.y < pl.y + pl.laenge - 0.5;
      pl.belegt = r.kaefige.filter(auf).length;
      // Gemischte Platte: so viele Plätze, wie darauf stehen (belegt und frei).
      if (pl.gemischt) pl.plaetze = pl.belegt + (r.freiePlaetze ?? []).filter(auf).length;
    }

  // Volieren in den Volierenbereichen: Reihen entlang der längeren Seite des Bereichs, nebeneinander ohne Abstand. An einer
  // Hallenwand eine Einzelreihe (Front zur Halle), sonst Doppelreihen Rücken an Rücken; zwischen den Reihen immer 1,50 m
  // frei. Stellplätze auf eingesetzten Teilen, Sperrflächen oder Eingängen fallen weg.
  const volieren: PlanKaefig[] = [];
  const bereiche = halle.flaechen.filter((f) => f.art === "volieren");
  if (volierenTiere.length && !bereiche.length)
    warnungen.push(eingesetzteVolieren ? `${volierenTiere.length} Volieren ohne Platz.` : "Für die Volieren fehlt ein Volierenbereich.");
  const hindernisseVolieren = halle.flaechen.filter((f) => f.art !== "volieren" && !f.moebel);
  const vmass = kaefigMass("voliere", masse);
  const plaetze: { x: number; y: number; w: number; h: number; front: Blick }[] = [];
  if (vmass && volierenTiere.length) {
    const fw = vmass.breite, fd = vmass.tiefe;
    for (const b of bereiche) {
      const laengs = b.breite >= b.tiefe;
      const L = laengs ? b.breite : b.tiefe;
      const Q = laengs ? b.tiefe : b.breite;
      const qStart = laengs ? b.y : b.x;
      const hallenQ = laengs ? halle.laenge : halle.breite;
      const wandAnfang = qStart <= 1;
      const wandEnde = qStart + Q >= hallenQ - 1;
      // Je Volierenreihe die Seite ihrer Front (zum Gang): an der Wand von der Wand weg, Doppelreihen Rücken an Rücken.
      const reihenQ: { q: number; vor: 1 | -1 }[] = [];
      let q = 0;
      if (wandAnfang && fd <= Q) {
        reihenQ.push({ q: 0, vor: 1 });
        q = fd + VOLIEREN_GANG;
      }
      const endeFrei = wandEnde ? fd + VOLIEREN_GANG : 0;
      while (q + 2 * fd <= Q - endeFrei) {
        reihenQ.push({ q, vor: -1 }, { q: q + fd, vor: 1 });
        q += 2 * fd + VOLIEREN_GANG;
      }
      if (wandEnde ? Q - fd >= q : q + fd <= Q) reihenQ.push({ q: wandEnde ? Q - fd : q, vor: -1 });
      for (const { q: rq, vor } of reihenQ)
        for (let l = 0; l + fw <= L; l += fw)
          plaetze.push(laengs ? { x: b.x + l, y: b.y + rq, w: fw, h: fd, front: vor > 0 ? "z+" : "z-" } : { x: b.x + rq, y: b.y + l, w: fd, h: fw, front: vor > 0 ? "x+" : "x-" });
    }
  }
  const freiePlaetze = plaetze.filter((pl) => !hindernisseVolieren.some((h) => pl.x < h.x + h.breite && h.x < pl.x + pl.w && pl.y < h.y + h.tiefe && h.y < pl.y + pl.h));
  volierenTiere.forEach((t, i) => {
    const pl = freiePlaetze[i];
    // breite/tiefe hier als Ausdehnung in x/y (Reihensystem) – planeHalle rechnet daraus die Lage in der Halle.
    if (pl) volieren.push({ ...t, x: pl.x, y: pl.y, breite: pl.w, tiefe: pl.h, front: pl.front, rechteck: LEER });
    else nichtPlatziert.push(t);
  });

  // Platzreserve: ganze Platten im freien Rest (siehe `freiLaengen`), dazu die freien Plätze auf angefangenen Platten.
  const reserve = typenInReihen.map((typ) => {
    const e = einheit(typ);
    const aufPlatten = reihen.reduce((n, r) => n + (r.freiePlaetze ?? []).filter((f) => f.typ === typ).length, 0);
    return { typ, anzahl: freiLaengen.reduce((n, f) => n + Math.floor((f + 1e-6) / e.laenge) * e.n * e.etagen, 0) + aufPlatten };
  });
  const reservePlatten = tiefe > 0 ? freiLaengen.reduce((n, f) => n + Math.floor((f + 1e-6) / PLATTE_LAENGE), 0) : 0;

  if (nichtPlatziert.length) warnungen.push(`${nichtPlatziert.length} ${nichtPlatziert.length === 1 ? "Tier hat" : "Tiere haben"} keinen Platz.`);
  return { reihen, volieren, nichtPlatziert, fehlendeMasse, reserve, reservePlatten, warnungen };
}

/**
 * Käfigfronten, die nicht zu einem Gang zeigen: Die Front (Gitter) eines Käfigs ist offen, Rück- und Seitenwände sind dicht –
 * vor jeder Front muss ein Gang von mindestens Gangbreite frei sein. Davor darf keine Wand, keine Platte oder Rückwand einer
 * anderen Reihe, kein Block, keine Voliere und keine Fläche stehen; vor einem Block auch kein Tisch und keine Bank (vor den
 * Reihen meldet das schon „… steht im Gang vor R…“). Je Reihe höchstens ein Hinweis, z. B. „R3: Front zu R4“,
 * „Block 40 × 40 × 40 cm: Front zur Wand“.
 */
export function frontFehler(halle: Pick<Halle, "breite" | "laenge" | "gang" | "flaechen">, plan: Pick<Hallenplan, "quer" | "reihen" | "objekte" | "volieren">): string[] {
  const T = 0.5;
  const ueber = (a: Rechteck, b: Rechteck) => a.x < b.x + b.b - T && b.x < a.x + a.b - T && a.y < b.y + b.h - T && b.y < a.y + a.h - T;
  const innen = (q: Rechteck) => q.x >= -T && q.y >= -T && q.x + q.b <= halle.breite + T && q.y + q.h <= halle.laenge + T;
  const hindernisse = [
    ...plan.reihen.flatMap((r) => r.platten.filter((pl) => !pl.entfernt).map((pl) => ({ name: `R${r.nr}`, q: pl.rechteck, moebel: false }))),
    ...plan.objekte.map((o) => ({ name: o.name, q: o.rechteck, moebel: istMoebel(o) })),
    ...plan.volieren.map((v) => ({ name: `Voliere${v.nr ? ` Nr. ${v.nr}` : ""}`, q: v.rechteck, moebel: false })),
    ...halle.flaechen.filter((f) => f.art === "sperre").map((f) => ({ name: `„${f.name}“`, q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, moebel: false })),
  ];
  // Tische und Bänke dürfen vor Käfigen stehen (Rückmeldung 14.11.2026) – sie zählen hier nicht.
  const fehler = (q: Rechteck, blick: Blick, _mitMoebel: boolean): string | null => {
    const s = streifenVor(q, blick, Math.max(0, halle.gang));
    // Was direkt davor steht, zuerst nennen; sonst die Wand.
    const h = hindernisse.find((x) => x.q !== q && !x.moebel && ueberlappt(s, x.q));
    if (h) return `Front zu ${h.name}`;
    return innen(s) ? null : "Front zur Wand";
  };
  const aus: string[] = [];
  for (const r of plan.reihen) {
    for (const pl of r.platten) {
      if (pl.entfernt) continue;
      const f = fehler(pl.rechteck, frontDerReihe(r, plan.quer, pl.drehung ?? 0), false);
      if (f) {
        aus.push(`R${r.nr}: ${f}`);
        break;
      }
    }
  }
  for (const o of plan.objekte) {
    if (o.art !== "kaefigblock") continue;
    const f = fehler(o.rechteck, objektFront(o), true);
    if (f) aus.push(`${o.name}: ${f}`);
  }
  return aus;
}
