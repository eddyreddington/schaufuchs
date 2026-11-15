/**
 * Hallenplan räumlich: aus dem gerechneten Plan (`planeHalle`) die Körper für die 3D-Ansicht – Wände mit Türen, Aufsteller
 * unter den Grundplatten, Käfige mit Höhe, Volieren, Tiere. Keine zweite Rechnung: jede Grundfläche kommt aus dem Plan, hier
 * kommt nur die Höhe dazu. Reine Rechnung ohne Datenbank und ohne three.js.
 *
 * Koordinaten in cm, y nach oben; x und z wie in der Zeichnung des Plans (`zeichnungDerHalle`): x nach rechts, z nach unten. Liegt
 * die Halle im Plan quer (länger als breit), ist x die Hallenlänge und z die Breite – sonst x die Breite, z die Länge.
 */
import { BANK_HOEHE, blockPlatz, objektFront, etagenVon, frontDerReihe, istMoebel, moebelStuecke, TISCH_HOEHE, type Blick, type Halle, type HallenFlaeche, type Hallenplan, type PlanTier, type Rechteck } from "./hallenplan";
import { kaefigMass, type KaefigMasse, type KaefigTyp } from "./kaefige";
import { artenDerSparte } from "./textbausteine";
import { zeichnungDerHalle } from "./hallenplan-druck";

/** Aufsteller (Gestelle, auf denen die Grundplatten mit den Käfigen stehen). */
export interface Aufsteller {
  /** Höhe bis Oberkante Grundplatte (cm). */
  hoehe: number;
  /**
   * Verkleidung unter den Grundplatten (Stoff- oder Planenbanner, oft vom Sponsor): an/aus, Farbe, optional ein Bild der
   * Schau (Rolle „sockel“), das entlang der Reihe wiederholt wird. Fehlt die Angabe, gilt `VERKLEIDUNG_STANDARD`.
   */
  verkleidung?: Verkleidung;
}

export interface Verkleidung {
  an: boolean;
  /** Farbe als #rrggbb. */
  farbe: string;
  bildId: number | null;
}

export const AUFSTELLER_STANDARD: Aufsteller = { hoehe: 80 };
/** Vorgabe: verkleidet, weiße Plane (wie auf den Schauen üblich), ohne Bild. */
export const VERKLEIDUNG_STANDARD: Verkleidung = { an: true, farbe: "#f7f4ee", bildId: null };
/**
 * Frühere Vorgabe (dunkles Grün-Anthrazit, 14.11.2026 kurz live). Die Seite „Käfige“ speicherte sie beim Sichern der Höhe
 * mit, ohne dass jemand die Farbe gewählt hätte – sie gilt deshalb als nicht gesetzt und wird zur neuen Vorgabe (Weiß).
 */
export const VERKLEIDUNG_FRUEHERE_VORGABE = "#2f3a33";
export function verkleidungVon(a: Aufsteller | null | undefined): Verkleidung {
  const v = { ...VERKLEIDUNG_STANDARD, ...(a?.verkleidung ?? {}) };
  return v.farbe.toLowerCase() === VERKLEIDUNG_FRUEHERE_VORGABE ? { ...v, farbe: VERKLEIDUNG_STANDARD.farbe } : v;
}

/**
 * Kachel der Verkleidung mit einem Logo bzw. Banner (cm): eine weiße Bahn, auf der das Bild in regelmäßigem Abstand
 * wiederkehrt – mittig in der Höhe, Seitenverhältnis erhalten, mit Rand. Ein gewöhnliches Logo steht etwa alle 1,25 m
 * (zwischen 1 und 1,5 m, damit ein breites Logo Platz hat); ein breites Banner (Seitenverhältnis über 3:1) wird in Bahnhöhe
 * (abzüglich Rand) Stück für Stück wiederholt, mit kleinem Abstand. `laenge`: Länge der Kachel entlang der Bahn; `logo`: Lage
 * des Bildes in der Kachel (x entlang, y von unten).
 */
export function verkleidungsKachel(bahnHoehe: number, bildBreite: number, bildHoehe: number): { laenge: number; logo: { x: number; y: number; b: number; h: number } } {
  const seiten = bildBreite > 0 && bildHoehe > 0 ? bildBreite / bildHoehe : 1;
  const rand = Math.max(3, bahnHoehe * 0.12);
  const hoch = Math.max(1, bahnHoehe - 2 * rand);
  if (seiten > 3) {
    const b = hoch * seiten;
    const laenge = b + 2 * rand;
    return { laenge, logo: { x: rand, y: rand, b, h: hoch } };
  }
  // Logo höchstens 80 cm breit und so hoch wie die Bahn ohne Rand; die Kachel 1–1,5 m, mindestens Logo plus Rand.
  let h = hoch, b = h * seiten;
  if (b > 80) {
    b = 80;
    h = b / seiten;
  }
  const laenge = Math.min(150, Math.max(100, 125, b + 4 * rand));
  return { laenge, logo: { x: (laenge - b) / 2, y: (bahnHoehe - h) / 2, b, h } };
}

/** Stärke der Grundplatte auf dem Aufsteller (cm) – die Verkleidung reicht bis darunter. */
export const PLATTEN_STAERKE = 4;

/** Verkleidung eines Sockels: dünne Bahn (Körper) vor seiner Seite, `aussen` zeigt vom Sockel weg, `laenge` entlang der Bahn. */
export interface SzeneSchuerze {
  q: Quader;
  aussen: Blick;
  laenge: number;
  /** Stirnseite (Ende eines Stücks Reihe): nur weiß, ohne Logo. Sonst die Bahn an der Gangseite. */
  stirn: boolean;
}

/** Körper: linke vordere Ecke am Boden (x, z), Unterkante y; Ausdehnung b (in x), t (in z), h (nach oben). */
export interface Quader {
  x: number;
  y: number;
  z: number;
  b: number;
  t: number;
  h: number;
}


export type Figur = "huhn" | "zwerghuhn" | "taube" | "ente" | "gans" | "pute";

/** Ein Tier, wie es die 3D-Ansicht zeigt – nur Nummer, Rasse, Sparte und Preisrichter, nie der Aussteller. */
export interface SzeneTier {
  id: number;
  nr: string | null;
  rasse: string;
  sparte: string;
  preisrichterId: number | null;
  figur: Figur;
  /** Gefiederfarbe (Hex), aus Farbenschlag bzw. Rasse geschätzt. */
  gefieder: string;
  /** Höhe der Figur (cm), passend in den Käfig. */
  groesse: number;
}

export interface SzeneKaefig {
  q: Quader;
  typ: KaefigTyp;
  front: Blick;
  tier: SzeneTier | null;
  /** Reihe bzw. eingesetzter Block, zu dem der Käfig gehört (für die Anzeige). */
  ort: string;
}

export interface SzeneVoliere {
  q: Quader;
  name: string;
  tier: SzeneTier | null;
  /** So viele Figuren laufen darin (nur belegt). */
  figuren: number;
  /** Offene Front (Gitter) wie im Plan; Rückwand und Seiten sind dicht. Fehlt sie (ältere feste Pläne), ist rundum Gitter. */
  front?: Blick;
}

export interface SzeneTuer {
  /** Öffnung in der Wand (über die Wanddicke). */
  q: Quader;
  name: string;
  notausgang: boolean;
}

export interface SzeneFlaeche {
  art: HallenFlaeche["art"];
  name: string;
  q: Rechteck;
}

export interface SzeneBeschriftung {
  text: string;
  x: number;
  y: number;
  z: number;
}

export interface HallenSzene {
  breite: number;
  laenge: number;
  wandHoehe: number;
  wandDicke: number;
  waende: Quader[];
  tueren: SzeneTuer[];
  flaechen: SzeneFlaeche[];
  aufsteller: Quader[];
  kaefige: SzeneKaefig[];
  volieren: SzeneVoliere[];
  /** Tische und Bänke (eine Garnitur als Tisch mit zwei Bänken); q bis Oberkante der Platte. */
  moebel: { art: "tisch" | "bank"; q: Quader; name: string }[];
  /** Verkleidung der Sockel unter den Grundplatten: Front zum Gang und Stirnseiten je Stück Reihe (nicht an Rücken und Wand). */
  schuerzen: SzeneSchuerze[];
  beschriftungen: SzeneBeschriftung[];
  /** Standpunkt für die Ansicht im Gang: Augenhöhe, Blick den Gang entlang. */
  gang: { von: { x: number; y: number; z: number }; nach: { x: number; y: number; z: number } };
}

export const WAND_HOEHE = 350;
export const WAND_DICKE = 24;
/** Türhöhe (cm); darüber läuft die Wand weiter. */
export const TUER_HOEHE = 250;
export const AUGEN_HOEHE = 165;

/** Voliere ohne eingetragenes Maß (wie im Plan): 2 × 1 m, 1,80 m hoch. */
const VOLIERE_HOEHE = 180;

const klein = (x: string | null | undefined) => (x ?? "").toLocaleLowerCase("de").replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ß/g, "ss");

/** Welche Figur ein Tier bekommt: Taube, Ente, Gans, Pute, Zwerghuhn oder Huhn. */
export function figurFuer(t: Pick<PlanTier, "typ" | "sparte" | "rasse">): Figur {
  const arten = artenDerSparte(t.sparte, t.rasse) ?? [];
  const r = klein(t.rasse);
  const s = klein(t.sparte);
  if (arten.includes("tauben") || t.typ === "tauben") return "taube";
  if (arten.length === 1 && arten[0] === "puten") return "pute";
  if (/gans|gaense/.test(r)) return "gans";
  if (arten.length === 1 && arten[0] === "wasser") return "ente";
  if (t.typ === "zwerghuehner" || /zwerg|bantam/.test(s) || /^zwerg/.test(r) || (arten.length === 1 && arten[0] === "wachteln")) return "zwerghuhn";
  return "huhn";
}

/** Natürliche Größe der Figuren (cm, Scheitel über Boden). */
export const FIGUR_GROESSE: Record<Figur, number> = { huhn: 48, zwerghuhn: 30, taube: 28, ente: 36, gans: 62, pute: 72 };

/** Gefiederfarben: aus dem Farbenschlag (bzw. dem Rassenamen) – sonst eine feste Farbe je Rasse. */
const GEFIEDER: [RegExp, string][] = [
  [/schwarz|dunkel/, "#2a2a2e"],
  [/weiss/, "#f3f0e8"],
  [/gesperbert|kuckuck|sperber/, "#9d9d9f"],
  [/blau|silber|grau|perl/, "#8d97a6"],
  [/gold|gelb|isabell|ocker|lachs/, "#d6a24a"],
  [/rot|braun|rebhuhn|wildfarb|kupfer/, "#9c4f2a"],
];
const GEFIEDER_SONST = ["#efe9dd", "#b7743f", "#3a3634", "#c99a5b", "#8a8f99"];

export function gefiederFarbe(farbe: string | null | undefined, rasse: string): string {
  for (const quelle of [farbe, rasse]) {
    const f = klein(quelle);
    if (!f) continue;
    for (const [re, hex] of GEFIEDER) if (re.test(f)) return hex;
  }
  let h = 0;
  for (const c of klein(rasse)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GEFIEDER_SONST[h % GEFIEDER_SONST.length]!;
}

function szeneTier(t: PlanTier & { farbe?: string | null }, platz: { b: number; t: number; h: number }): SzeneTier {
  const figur = figurFuer(t);
  // Die Figur passt in den Käfig: höchstens drei Viertel der Höhe und nicht breiter als der Käfig.
  const groesse = Math.max(8, Math.min(FIGUR_GROESSE[figur], platz.h * 0.75, Math.min(platz.b, platz.t) * 0.95));
  return { id: t.id, nr: t.nr, rasse: t.rasse, sparte: t.sparte ?? "", preisrichterId: t.preisrichterId, figur, gefieder: gefiederFarbe(t.farbe, t.rasse), groesse };
}

const quader = (q: Rechteck, y: number, h: number): Quader => ({ x: q.x, z: q.y, y, b: q.b, t: q.h, h });

/** Wand, an der eine Tür liegt (wie im 2D-Plan: die berührte Wand, an der ihre lange Seite liegt). */
function tuerWand(halle: Pick<Halle, "breite" | "laenge">, f: Pick<HallenFlaeche, "x" | "y" | "breite" | "tiefe">, spiel = 10): "x0" | "x1" | "z0" | "z1" | null {
  const stehend = f.tiefe > f.breite;
  const an = [
    { w: "x0" as const, an: f.x <= spiel, laengs: stehend },
    { w: "x1" as const, an: f.x + f.breite >= halle.breite - spiel, laengs: stehend },
    { w: "z0" as const, an: f.y <= spiel, laengs: !stehend },
    { w: "z1" as const, an: f.y + f.tiefe >= halle.laenge - spiel, laengs: !stehend },
  ].filter((x) => x.an);
  return (an.find((x) => x.laengs) ?? an[0])?.w ?? null;
}

/** Wände um die Halle (außen anliegend), mit Öffnungen an den Türen und einem Sturz darüber. */
function waendeUndTueren(halle: Pick<Halle, "breite" | "laenge" | "flaechen">): { waende: Quader[]; tueren: SzeneTuer[] } {
  const B = halle.breite, L = halle.laenge, d = WAND_DICKE;
  const oeffnungen: Record<"x0" | "x1" | "z0" | "z1", { von: number; bis: number; name: string }[]> = { x0: [], x1: [], z0: [], z1: [] };
  for (const f of halle.flaechen) {
    if (f.art !== "eingang") continue;
    const w = tuerWand(halle, f);
    if (!w) continue;
    const entlangX = w === "z0" || w === "z1";
    const von = Math.max(0, entlangX ? f.x : f.y);
    const bis = Math.min(entlangX ? B : L, entlangX ? f.x + f.breite : f.y + f.tiefe);
    if (bis - von > 1) oeffnungen[w].push({ von, bis, name: f.name });
  }
  const waende: Quader[] = [];
  const tueren: SzeneTuer[] = [];
  // Je Wand: Abschnitte zwischen den Öffnungen voll hoch, über den Öffnungen der Sturz. Die Wände an x laufen über die Ecken.
  const seiten = [
    { w: "z0" as const, len: B, q: (a: number, b: number, y: number, h: number): Quader => ({ x: a, z: -d, y, b: b - a, t: d, h }) },
    { w: "z1" as const, len: B, q: (a: number, b: number, y: number, h: number): Quader => ({ x: a, z: L, y, b: b - a, t: d, h }) },
    { w: "x0" as const, len: L, q: (a: number, b: number, y: number, h: number): Quader => ({ x: -d, z: a, y, b: d, t: b - a, h }) },
    { w: "x1" as const, len: L, q: (a: number, b: number, y: number, h: number): Quader => ({ x: B, z: a, y, b: d, t: b - a, h }) },
  ];
  for (const s of seiten) {
    const o = [...oeffnungen[s.w]].sort((a, b) => a.von - b.von);
    let pos = 0;
    for (const x of o) {
      if (x.von > pos + 0.5) waende.push(s.q(pos, x.von, 0, WAND_HOEHE));
      const von = Math.max(pos, x.von);
      if (x.bis > von + 0.5) {
        waende.push(s.q(von, x.bis, TUER_HOEHE, WAND_HOEHE - TUER_HOEHE));
        tueren.push({ q: s.q(von, x.bis, 0, TUER_HOEHE), name: x.name, notausgang: /not/.test(klein(x.name)) });
      }
      pos = Math.max(pos, x.bis);
    }
    if (s.len > pos + 0.5) waende.push(s.q(pos, s.len, 0, WAND_HOEHE));
  }
  // Ecken außen schließen.
  for (const [x, z] of [[-d, -d], [B, -d], [-d, L], [B, L]] as const) waende.push({ x, z, y: 0, b: d, t: d, h: WAND_HOEHE });
  return { waende, tueren };
}

/**
 * Standpunkt im Gang: zwischen den ersten beiden Reihen, deren Fronten sich gegenüberstehen (im Reihensystem, ohne Handversatz),
 * am Anfang der Reihen in Augenhöhe, Blick den Gang entlang. Ohne solche Reihen: an der Hallenwand, Blick in die Halle.
 */
export function gangStandpunkt(halle: Pick<Halle, "breite" | "laenge" | "richtung">, plan: Pick<Hallenplan, "reihen" | "quer">): HallenSzene["gang"] {
  const quer = plan.quer;
  const reihen = [...plan.reihen].filter((r) => r.abschnitte.length).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < reihen.length; i++) {
    const a = reihen[i]!, b = reihen[i + 1]!;
    if (a.front !== "rechts" || b.front !== "links") continue;
    const mitte = (a.x + a.tiefe + b.x) / 2;
    const von = Math.min(a.abschnitte[0]!.von, b.abschnitte[0]!.von);
    const bis = Math.max(a.abschnitte.at(-1)!.bis, b.abschnitte.at(-1)!.bis);
    const start = Math.max(0, von - 120);
    const ziel = Math.min(start + 600, bis);
    const punkt = (q: number, l: number, y: number) => (quer ? { x: l, y, z: q } : { x: q, y, z: l });
    return { von: punkt(mitte, start, AUGEN_HOEHE), nach: punkt(mitte, ziel, AUGEN_HOEHE - 25) };
  }
  return { von: { x: halle.breite / 2, y: AUGEN_HOEHE, z: 60 }, nach: { x: halle.breite / 2, y: AUGEN_HOEHE - 25, z: Math.min(halle.laenge, 660) } };
}

/** Tisch, Bank oder Garnitur als Körper in ihrer Grundfläche (siehe `moebelStuecke`). */
function moebelTeile(art: "tisch" | "bank" | "garnitur", o: { laenge?: number; tiefe?: number; bankTiefe?: number }, q: Rechteck, name: string): HallenSzene["moebel"] {
  return moebelStuecke({ ...o, art }, q).map((m) => ({ art: m.art, q: quader(m.q, 0, m.art === "tisch" ? TISCH_HOEHE : BANK_HOEHE), name }));
}

/**
 * Die Szene der Halle. `farben`: Farbenschlag je Tier (für die Gefiederfarbe), sonst zählt der Rassename.
 */
export function hallenSzene(
  halle: Halle,
  plan: Hallenplan,
  masse: KaefigMasse | null | undefined,
  aufsteller: Aufsteller = AUFSTELLER_STANDARD,
  farben: Map<number, string | null> = new Map(),
): HallenSzene {
  const ah = Math.max(0, aufsteller.hoehe);
  const hoeheVon = (typ: KaefigTyp) => kaefigMass(typ, masse)?.hoehe ?? 50;
  const mitFarbe = (t: PlanTier) => ({ ...t, farbe: farben.get(t.id) ?? null });
  const kaefige: SzeneKaefig[] = [];
  const aufst: Quader[] = [];
  const beschriftungen: SzeneBeschriftung[] = [];

  /** Sockel mit ihrer Front – daraus die Verkleidung. */
  const sockel: { q: Rechteck; front: Blick }[] = [];
  for (const r of plan.reihen) {
    const platten = r.platten.filter((pl) => !pl.entfernt);
    for (const pl of platten) {
      aufst.push(quader(pl.rechteck, 0, ah));
      sockel.push({ q: pl.rechteck, front: frontDerReihe(r, plan.quer, pl.drehung ?? 0) });
    }
    const frontAuf = (platte: number | undefined) => frontDerReihe(r, plan.quer, platte != null ? (r.platten[platte]?.drehung ?? 0) : 0);
    for (const k of r.kaefige) {
      const h = hoeheVon(k.typ);
      // Etagen: übereinander, jede so hoch wie der Käfig.
      kaefige.push({ q: quader(k.rechteck, ah + (k.etage ?? 0) * h, h), typ: k.typ, front: frontAuf(k.platte), tier: szeneTier(mitFarbe(k), { b: k.breite, t: k.tiefe, h }), ort: `R${r.nr}` });
    }
    for (const f of r.freiePlaetze ?? []) {
      if (f.platte != null && r.platten[f.platte]?.entfernt) continue;
      kaefige.push({ q: quader(f.rechteck, ah + (f.etage ?? 0) * hoeheVon(f.typ), hoeheVon(f.typ)), typ: f.typ, front: frontAuf(f.platte), tier: null, ort: `R${r.nr}` });
    }
    if (platten.length || r.kaefige.length) {
      // Über dem Reihenanfang; steht „R1“ im 2D-Plan vor der Wand, rückt das Schild in die Halle (sonst verdeckt die Wand es).
      const b = r.beschriftung;
      const rein = (v: number, max: number) => Math.min(max - 40, Math.max(40, v));
      const hoch = Math.max(0, ...[...r.kaefige, ...(r.freiePlaetze ?? [])].map((k) => ((k.etage ?? 0) + 1) * hoeheVon(k.typ)));
      beschriftungen.push({ text: `R${r.nr}`, x: rein(b.x + b.b / 2, halle.breite), y: ah + hoch + 30, z: rein(b.y + b.h / 2, halle.laenge) });
    }
  }

  const volieren: SzeneVoliere[] = [];
  const moebel: HallenSzene["moebel"] = [];
  const vHoehe = kaefigMass("voliere", masse)?.hoehe ?? VOLIERE_HOEHE;
  const figurenIn = (q: Rechteck) => Math.max(2, Math.min(5, Math.round((q.b * q.h) / 6000)));
  for (const o of plan.objekte) {
    if (o.art === "voliere") {
      const tier = o.tier ? szeneTier(mitFarbe(o.tier), { b: o.rechteck.b, t: o.rechteck.h, h: vHoehe }) : null;
      volieren.push({ q: quader(o.rechteck, 0, vHoehe), name: o.name, tier, figuren: tier ? figurenIn(o.rechteck) : 0, front: objektFront(o) });
      continue;
    }
    if (istMoebel(o)) {
      moebel.push(...moebelTeile(o.art, o, o.rechteck, o.name));
      continue;
    }
    const typ = o.typ ?? "huehner";
    const h = hoeheVon(typ);
    const et = etagenVon(typ, halle);
    aufst.push(quader(o.rechteck, 0, ah));
    sockel.push({ q: o.rechteck, front: objektFront(o) });
    // Offene Front des Blocks (zum Gang), siehe `objektFront`.
    const front: Blick = objektFront(o);
    for (let i = 0; i < o.plaetze; i++) {
      const p = blockPlatz(o.rechteck, o.plaetze, et, i);
      // Je Platz das Tier dort (von Hand frei gemachte Plätze bleiben frei, siehe `blockPlatz` am Käfig).
      const t = o.kaefige?.find((k, j) => (k.blockPlatz ?? j) === i);
      kaefige.push({ q: quader(p.rechteck, ah + p.etage * h, h), typ, front, tier: t ? szeneTier(mitFarbe(t), { b: p.rechteck.b, t: p.rechteck.h, h }) : null, ort: o.name });
    }
  }
  for (const v of plan.volieren) {
    const tier = szeneTier(mitFarbe(v), { b: v.rechteck.b, t: v.rechteck.h, h: vHoehe });
    volieren.push({ q: quader(v.rechteck, 0, vHoehe), name: v.nr ? `Voliere ${v.nr}` : "Voliere", tier, figuren: figurenIn(v.rechteck), ...(v.front ? { front: v.front } : {}) });
  }

  const { waende, tueren } = waendeUndTueren(halle);
  const flaechen: SzeneFlaeche[] = halle.flaechen.map((f) => ({ art: f.art, name: f.name, q: { x: f.x, y: f.y, b: f.breite, h: f.tiefe } }));
  for (const f of flaechen) if (f.art !== "eingang") beschriftungen.push({ text: f.name, x: f.q.x + f.q.b / 2, y: 40, z: f.q.y + f.q.h / 2 });
  // Türen beschriftet (auch wenn ihre Wand gerade ausgeblendet ist), knapp in der Halle über dem Boden.
  for (const t of tueren) {
    const innen = { x: Math.min(halle.breite - 30, Math.max(30, t.q.x + t.q.b / 2)), z: Math.min(halle.laenge - 30, Math.max(30, t.q.z + t.q.t / 2)) };
    beschriftungen.push({ text: t.name, x: innen.x, y: 60, z: innen.z });
  }

  const szene: HallenSzene = {
    breite: halle.breite,
    laenge: halle.laenge,
    wandHoehe: WAND_HOEHE,
    wandDicke: WAND_DICKE,
    waende,
    tueren,
    flaechen,
    aufsteller: aufst,
    kaefige,
    volieren,
    moebel,
    schuerzen: verkleidungVon(aufsteller).an ? schuerzenFuer(sockel, Math.max(0, ah - PLATTEN_STAERKE)) : [],
    beschriftungen,
    gang: gangStandpunkt(halle, plan),
  };
  // Wie der 2D-Plan: liegt die Halle dort quer (lange Seite waagrecht), sind x und y vertauscht – dieselbe Abbildung hier,
  // sonst wäre die Halle in 3D spiegelverkehrt.
  return zeichnungDerHalle(halle).quer ? vertauscht(szene) : szene;
}

/**
 * Szene mit vertauschten Achsen (x ↔ z), wie `zeichnungDerHalle` die Halle zeichnet, wenn sie länger als breit ist. Danach
 * gilt für die Szene: x nach rechts und z nach unten wie in der Zeichnung des Plans.
 */
export function vertauscht(s: HallenSzene): HallenSzene {
  const q = (a: Quader): Quader => ({ x: a.z, z: a.x, y: a.y, b: a.t, t: a.b, h: a.h });
  const r = (a: Rechteck): Rechteck => ({ x: a.y, y: a.x, b: a.h, h: a.b });
  const blick: Record<Blick, Blick> = { "x+": "z+", "x-": "z-", "z+": "x+", "z-": "x-" };
  const p = (a: { x: number; y: number; z: number }) => ({ x: a.z, y: a.y, z: a.x });
  return {
    ...s,
    breite: s.laenge,
    laenge: s.breite,
    waende: s.waende.map(q),
    tueren: s.tueren.map((t) => ({ ...t, q: q(t.q) })),
    flaechen: s.flaechen.map((f) => ({ ...f, q: r(f.q) })),
    aufsteller: s.aufsteller.map(q),
    kaefige: s.kaefige.map((k) => ({ ...k, q: q(k.q), front: blick[k.front] })),
    volieren: s.volieren.map((v) => ({ ...v, q: q(v.q), ...(v.front ? { front: blick[v.front] } : {}) })),
    moebel: s.moebel.map((m) => ({ ...m, q: q(m.q) })),
    schuerzen: s.schuerzen.map((m) => ({ ...m, q: q(m.q), aussen: blick[m.aussen] })),
    beschriftungen: s.beschriftungen.map((b) => ({ ...b, x: b.z, z: b.x })),
    gang: { von: p(s.gang.von), nach: p(s.gang.nach) },
  };
}

/** Seite der Halle, an der eine Wand steht (Szene: x0 links, x1 rechts, z0 hinten/oben im Plan, z1 vorn/unten). */
export type SzeneSeite = "x0" | "x1" | "z0" | "z1";

/** An welchen Seiten ein Wandstück steht (eine Ecke an zweien). */
export function wandSeiten(w: Quader, s: Pick<HallenSzene, "breite" | "laenge">): SzeneSeite[] {
  const seiten: SzeneSeite[] = [];
  if (w.x + w.b <= 0.5) seiten.push("x0");
  if (w.x >= s.breite - 0.5) seiten.push("x1");
  if (w.z + w.t <= 0.5) seiten.push("z0");
  if (w.z >= s.laenge - 0.5) seiten.push("z1");
  return seiten;
}

const weich = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Kleinste Deckkraft ausgeblendeter Wände (ganz weg wirkt die Halle ohne Rand). */
export const WAND_DURCHSICHTIG = 0.08;

/**
 * Deckkraft einer Wand (0–1) aus Kamera und Blickziel (cm, Szene-Koordinaten): Steht die Kamera außerhalb der Halle hinter
 * der Wand (die Wand steht zwischen Kamera und Halle), wird sie fast unsichtbar – weich auf dem ersten Meter. Schaut die
 * Kamera von über der Wandhöhe hinein, werden zusätzlich alle Wände durchsichtiger, je näher sie dem Blickziel ist (ab 20 m,
 * am stärksten unter 6 m). In Augenhöhe in der Halle („Im Gang“) bleiben die Wände stehen – sie verdecken dort nichts.
 */
export function wandDeckkraft(w: Quader, s: Pick<HallenSzene, "breite" | "laenge" | "wandHoehe">, kamera: { x: number; y: number; z: number }, ziel: { x: number; y: number; z: number }): number {
  let deck = 1;
  for (const seite of wandSeiten(w, s)) {
    const aussen = seite === "x0" ? -kamera.x : seite === "x1" ? kamera.x - s.breite : seite === "z0" ? -kamera.z : kamera.z - s.laenge;
    deck = Math.min(deck, 1 - (1 - WAND_DURCHSICHTIG) * weich(-20, 100, aussen));
  }
  if (kamera.y > s.wandHoehe) {
    const abstand = Math.hypot(kamera.x - ziel.x, kamera.y - ziel.y, kamera.z - ziel.z);
    deck *= 1 - 0.65 * (1 - weich(600, 2000, abstand));
  }
  return Math.max(WAND_DURCHSICHTIG, Math.min(1, deck));
}

/** Innenseite eines Wandstücks (cm, Szene): Seite, Strecke entlang der Wand, Unterkante und Höhe, Wand (Index in `waende`). */
export interface WandInnenseite {
  wand: number;
  seite: SzeneSeite;
  von: number;
  bis: number;
  y: number;
  h: number;
}

/**
 * Innenseiten der Wandstücke (ohne Ecken): voll hohe Stücke und die Stürze über den Türen. Dort sitzt die Gestaltung der Wand
 * wie in einer Turnhalle (Holz-Prallwand unten, darüber hell gestrichen, Farbband, Lichtband oben).
 */
export function wandInnenseiten(s: Pick<HallenSzene, "breite" | "laenge" | "waende">): WandInnenseite[] {
  const aus: WandInnenseite[] = [];
  s.waende.forEach((w, i) => {
    const seiten = wandSeiten(w, s);
    if (seiten.length !== 1) return;
    const seite = seiten[0]!;
    const entlangX = seite === "z0" || seite === "z1";
    const von = Math.max(0, entlangX ? w.x : w.z), bis = Math.min(entlangX ? s.breite : s.laenge, entlangX ? w.x + w.b : w.z + w.t);
    if (bis - von > 0.5) aus.push({ wand: i, seite, von, bis, y: w.y, h: w.h });
  });
  return aus;
}

/**
 * Verkleidung der Sockel: Sockel mit derselben Front, die quer zur Reihe gleich liegen und aneinanderstoßen, bilden ein Stück
 * Reihe. Je Stück eine Bahn an der Front (zum Gang) und je eine an beiden Stirnseiten; Rücken (Doppelreihe, Wand) bleiben
 * frei. Die Bahnen stehen 1 cm vor dem Sockel, vom Boden bis unter die Grundplatte (`hoehe`).
 */
export function schuerzenFuer(sockel: { q: Rechteck; front: Blick }[], hoehe: number): SzeneSchuerze[] {
  if (hoehe <= 0) return [];
  const D = 1;
  type Stueck = { front: Blick; quer: [number, number]; von: number; bis: number };
  const stuecke: Stueck[] = [];
  const querX = (f: Blick) => f[0] === "x"; // Front nach x±: die Reihe läuft entlang z
  const sortiert = [...sockel].sort((a, b) => (querX(a.front) ? a.q.y - b.q.y : a.q.x - b.q.x));
  for (const s of sortiert) {
    const [qv, qb] = querX(s.front) ? [s.q.x, s.q.x + s.q.b] : [s.q.y, s.q.y + s.q.h];
    const [lv, lb] = querX(s.front) ? [s.q.y, s.q.y + s.q.h] : [s.q.x, s.q.x + s.q.b];
    const st = stuecke.find((x) => x.front === s.front && Math.abs(x.quer[0] - qv) < 1 && Math.abs(x.quer[1] - qb) < 1 && lv <= x.bis + 1 && lb >= x.von - 1);
    if (st) {
      st.von = Math.min(st.von, lv);
      st.bis = Math.max(st.bis, lb);
    } else stuecke.push({ front: s.front, quer: [qv, qb], von: lv, bis: lb });
  }
  const aus: SzeneSchuerze[] = [];
  for (const st of stuecke) {
    const [q0, q1] = st.quer;
    const lang = st.bis - st.von, tief = q1 - q0;
    if (querX(st.front)) {
      // Front an x = q1 (x+) bzw. q0 (x−), die Reihe entlang z; Stirnseiten bei z = von und z = bis.
      aus.push({ q: { x: st.front === "x+" ? q1 : q0 - D, z: st.von, y: 0, b: D, t: lang, h: hoehe }, aussen: st.front, laenge: lang, stirn: false });
      aus.push({ q: { x: q0, z: st.von - D, y: 0, b: tief, t: D, h: hoehe }, aussen: "z-", laenge: tief, stirn: true });
      aus.push({ q: { x: q0, z: st.bis, y: 0, b: tief, t: D, h: hoehe }, aussen: "z+", laenge: tief, stirn: true });
    } else {
      aus.push({ q: { x: st.von, z: st.front === "z+" ? q1 : q0 - D, y: 0, b: lang, t: D, h: hoehe }, aussen: st.front, laenge: lang, stirn: false });
      aus.push({ q: { x: st.von - D, z: q0, y: 0, b: D, t: tief, h: hoehe }, aussen: "x-", laenge: tief, stirn: true });
      aus.push({ q: { x: st.bis, z: q0, y: 0, b: D, t: tief, h: hoehe }, aussen: "x+", laenge: tief, stirn: true });
    }
  }
  return aus;
}
