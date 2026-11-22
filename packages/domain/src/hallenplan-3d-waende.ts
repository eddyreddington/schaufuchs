/**
 * 3D-Wände entlang eines freien Grundrisses (Entscheidung 019). Eigene Datei, damit hallenplan-3d.ts überschaubar bleibt;
 * die Maße (Dicke, Höhe, Türhöhe) kommen von dort.
 */
import type { HallenFlaeche } from "./hallenplan";
import type { Quader, SzeneSeite, SzeneTuer } from "./hallenplan-3d";
import { type Punkt, tuerOeffnung, umrissKanten, umrissVersetzt, type WandAussen } from "./hallenplan-umriss";
import { tuerArtVon, tuerFluegel } from "./hallenplan-tueren";

/** Die Seite gehört nur zu Wänden, nicht zur Türöffnung. */
export const ohneSeite = ({ seite: _s, ...q }: Quader): Quader => q;

/**
 * Wände entlang eines freien Grundrisses (Entscheidung 019): je Kante ein Wandstück außen an der Kante, bis zum um die
 * Wanddicke versetzten Umriss – an äußeren Ecken verlängert, an inneren verkürzt, ohne Lücke. Türen (`tuerOeffnung`) wie
 * beim Rechteck: unten offen, darüber der Sturz.
 */
export function waendeImGrundriss(u: Punkt[], flaechen: HallenFlaeche[], m: { dicke: number; hoehe: number; tuerHoehe: number }): { waende: Quader[]; tueren: SzeneTuer[] } {
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
        tueren.push({ q: ohneSeite(stueck(von, x.bis, 0, TUER_HOEHE)), name: x.name, notausgang: /not/.test(x.name.toLowerCase()), art: x.art, fluegel: tuerFluegel(x.bis - von), wand: waende.length - 1 });
      }
      pos = Math.max(pos, x.bis);
    }
    if (b > pos + 0.5) waende.push(stueck(pos, b, 0, WAND_HOEHE));
  });
  return { waende, tueren };
}
