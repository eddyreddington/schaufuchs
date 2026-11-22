/**
 * 3D-Wände mit Türöffnungen: um die rechteckige Halle und entlang eines freien Grundrisses (Entscheidung 019), dazu die
 * Lage einer Tür in ihrer Wand. Eigene Datei, damit hallenplan-3d.ts überschaubar bleibt; die Maße (Dicke, Höhe, Türhöhe)
 * kommen als Parameter von dort.
 */
import type { Halle, HallenFlaeche } from "./hallenplan";
import type { HallenSzene, Quader, SzeneSeite, SzeneTuer } from "./hallenplan-3d";
import { istRechteckUmriss, type Punkt, tuerOeffnung, umrissKanten, umrissNormal, umrissVersetzt, type WandAussen } from "./hallenplan-umriss";
import { type TuerArt, tuerArtVon, tuerFluegel } from "./hallenplan-tueren";

/** Wanddicke, Wandhöhe und Türhöhe (cm). */
type Masse = { dicke: number; hoehe: number; tuerHoehe: number };

/** Ein Ausgang, dessen Name „Not…“ enthält, ist ein Notausgang (grünes Schild, Panikstange). */
const istNotausgang = (name: string) => /not/.test(name.toLocaleLowerCase("de"));

/** Die Seite gehört nur zu Wänden, nicht zur Türöffnung. */
export const ohneSeite = ({ seite: _s, ...q }: Quader): Quader => q;

/**
 * Wände entlang eines freien Grundrisses (Entscheidung 019): je Kante ein Wandstück außen an der Kante, bis zum um die
 * Wanddicke versetzten Umriss – an äußeren Ecken verlängert, an inneren verkürzt, ohne Lücke. Türen (`tuerOeffnung`) wie
 * beim Rechteck: unten offen, darüber der Sturz.
 */
export function waendeImGrundriss(u: Punkt[], flaechen: HallenFlaeche[], m: Masse): { waende: Quader[]; tueren: SzeneTuer[] } {
  const d = m.dicke, WAND_HOEHE = m.hoehe, TUER_HOEHE = m.tuerHoehe;
  const kanten = umrissKanten(u);
  const aussen = umrissVersetzt(u, d);
  const seiteVon: Record<WandAussen, SzeneSeite> = { oben: "z0", unten: "z1", links: "x0", rechts: "x1" };
  const oeffnungen = flaechen
    .filter((f) => f.art === "eingang")
    .flatMap((f) => {
      const o = tuerOeffnung(u, { x: f.x, y: f.y, b: f.breite, h: f.tiefe }, d);
      return o ? [{ o, name: f.name, art: tuerArtVon(f) }] : [];
    });
  const waende: Quader[] = [];
  const tueren: SzeneTuer[] = [];
  kanten.forEach((k, i) => {
    const p = aussen[i]!, q = aussen[(i + 1) % aussen.length]!;
    const seite = seiteVon[k.aussen];
    const waagrecht = k.y1 === k.y2;
    // Spanne: Kante und versetzte Kante zusammen – an äußeren Ecken bis zur Außenecke, an inneren bis in die Ecke (keine Lücke).
    const a = waagrecht ? Math.min(p.x, q.x, k.x1, k.x2) : Math.min(p.y, q.y, k.y1, k.y2), b = waagrecht ? Math.max(p.x, q.x, k.x1, k.x2) : Math.max(p.y, q.y, k.y1, k.y2);
    // Lage quer zur Wand: außen an der Kante.
    const quer = waagrecht ? (k.aussen === "oben" ? k.y1 - d : k.y1) : k.aussen === "links" ? k.x1 - d : k.x1;
    const stueck = (von: number, bis: number, y: number, h: number): Quader =>
      waagrecht ? { x: von, z: quer, y, b: bis - von, t: d, h, seite } : { x: quer, z: von, y, b: d, t: bis - von, h, seite };
    const hier = oeffnungen
      .filter(({ o }) => (waagrecht ? o.h === d && o.y === quer && o.x >= a - 0.5 && o.x + o.b <= b + 0.5 : o.b === d && o.x === quer && o.y >= a - 0.5 && o.y + o.h <= b + 0.5))
      .map(({ o, name, art }) => ({ von: waagrecht ? o.x : o.y, bis: waagrecht ? o.x + o.b : o.y + o.h, name, art }))
      .sort((x, y) => x.von - y.von);
    let pos = a;
    for (const x of hier) {
      if (x.von > pos + 0.5) waende.push(stueck(pos, x.von, 0, WAND_HOEHE));
      const von = Math.max(pos, x.von);
      if (x.bis > von + 0.5) {
        waende.push(stueck(von, x.bis, TUER_HOEHE, WAND_HOEHE - TUER_HOEHE));
        tueren.push({ q: ohneSeite(stueck(von, x.bis, 0, TUER_HOEHE)), name: x.name, notausgang: istNotausgang(x.name), art: x.art, fluegel: tuerFluegel(x.bis - von), wand: waende.length - 1 });
      }
      pos = Math.max(pos, x.bis);
    }
    if (b > pos + 0.5) waende.push(stueck(pos, b, 0, WAND_HOEHE));
  });
  return { waende, tueren };
}

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
export function waendeUndTueren(halle: Pick<Halle, "breite" | "laenge" | "flaechen" | "umriss">, m: Masse): { waende: Quader[]; tueren: SzeneTuer[] } {
  if (!istRechteckUmriss(halle.umriss)) return waendeImGrundriss(umrissNormal(halle.umriss!), halle.flaechen.filter((f) => !f.aussen), m);
  const B = halle.breite, L = halle.laenge, d = m.dicke, H = m.hoehe, TUER_HOEHE = m.tuerHoehe;
  const oeffnungen: Record<"x0" | "x1" | "z0" | "z1", { von: number; bis: number; name: string; art: TuerArt }[]> = { x0: [], x1: [], z0: [], z1: [] };
  for (const f of halle.flaechen) {
    if (f.art !== "eingang") continue;
    const w = tuerWand(halle, f);
    if (!w) continue;
    const entlangX = w === "z0" || w === "z1";
    const von = Math.max(0, entlangX ? f.x : f.y);
    const bis = Math.min(entlangX ? B : L, entlangX ? f.x + f.breite : f.y + f.tiefe);
    if (bis - von > 1) oeffnungen[w].push({ von, bis, name: f.name, art: tuerArtVon(f) });
  }
  const waende: Quader[] = [];
  const tueren: SzeneTuer[] = [];
  // Je Wand: Abschnitte zwischen den Öffnungen voll hoch, über den Öffnungen der Sturz. Die Wände an x laufen über die Ecken.
  const seiten = [
    { w: "z0" as const, len: B, q: (a: number, b: number, y: number, h: number): Quader => ({ x: a, z: -d, y, b: b - a, t: d, h, seite: "z0" }) },
    { w: "z1" as const, len: B, q: (a: number, b: number, y: number, h: number): Quader => ({ x: a, z: L, y, b: b - a, t: d, h, seite: "z1" }) },
    { w: "x0" as const, len: L, q: (a: number, b: number, y: number, h: number): Quader => ({ x: -d, z: a, y, b: d, t: b - a, h, seite: "x0" }) },
    { w: "x1" as const, len: L, q: (a: number, b: number, y: number, h: number): Quader => ({ x: B, z: a, y, b: d, t: b - a, h, seite: "x1" }) },
  ];
  for (const s of seiten) {
    const o = [...oeffnungen[s.w]].sort((a, b) => a.von - b.von);
    let pos = 0;
    for (const x of o) {
      if (x.von > pos + 0.5) waende.push(s.q(pos, x.von, 0, H));
      const von = Math.max(pos, x.von);
      if (x.bis > von + 0.5) {
        waende.push(s.q(von, x.bis, TUER_HOEHE, H - TUER_HOEHE));
        tueren.push({ q: ohneSeite(s.q(von, x.bis, 0, TUER_HOEHE)), name: x.name, notausgang: istNotausgang(x.name), art: x.art, fluegel: tuerFluegel(x.bis - von), wand: waende.length - 1 });
      }
      pos = Math.max(pos, x.bis);
    }
    if (s.len > pos + 0.5) waende.push(s.q(pos, s.len, 0, H));
  }
  // Ecken außen schließen.
  for (const [x, z] of [[-d, -d], [B, -d], [-d, L], [B, L]] as const) waende.push({ x, z, y: 0, b: d, t: d, h: H });
  return { waende, tueren };
}

/** An welchen Seiten ein Wandstück steht (eine Ecke an zweien). */
export function wandSeiten(w: Quader, s: Pick<HallenSzene, "breite" | "laenge">): SzeneSeite[] {
  if (w.seite) return [w.seite];
  const seiten: SzeneSeite[] = [];
  if (w.x + w.b <= 0.5) seiten.push("x0");
  if (w.x >= s.breite - 0.5) seiten.push("x1");
  if (w.z + w.t <= 0.5) seiten.push("z0");
  if (w.z >= s.laenge - 0.5) seiten.push("z1");
  return seiten;
}

/**
 * Lage einer Tür in der Szene (cm): Seite ihrer Wand, Ebene der Innenfläche (x bei x0/x1, z bei z0/z1), Mitte und Breite
 * entlang der Wand, Wandstärke. `richtung`: so läuft „rechts“ für den Blick aus der Halle auf die Tür in Szene-Koordinaten
 * (rechtshändig: oben y, in die Halle z, entlang x = y × z).
 */
export function tuerLage(t: Pick<SzeneTuer, "q" | "wand">, s: Pick<HallenSzene, "waende" | "breite" | "laenge">): { seite: SzeneSeite; ebene: number; mitte: number; breite: number; tiefe: number; richtung: 1 | -1 } {
  const q = t.q;
  const seite = s.waende[t.wand]?.seite ?? wandSeiten(q, s)[0] ?? "z0";
  const entlangX = seite === "z0" || seite === "z1";
  const ebene = seite === "x0" ? q.x + q.b : seite === "x1" ? q.x : seite === "z0" ? q.z + q.t : q.z;
  return {
    seite,
    ebene,
    mitte: entlangX ? q.x + q.b / 2 : q.z + q.t / 2,
    breite: entlangX ? q.b : q.t,
    tiefe: entlangX ? q.t : q.b,
    richtung: seite === "z0" || seite === "x1" ? 1 : -1,
  };
}
