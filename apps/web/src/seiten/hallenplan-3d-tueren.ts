/**
 * Türen in den Eingängen der 3D-Halle (Entscheidung 028): geschlossen in der Öffnung, leicht zurückgesetzt in der Wand,
 * von beiden Seiten zu sehen – bündig wie die Wand (Prallwand und Anstrich laufen über das Blatt, feine Fuge), Glastür
 * (dunkler Rahmen, Glas halb durchsichtig, Griffstangen) oder Holztür (Zarge, Drücker). Aufbau und Lage aus der Fachlogik
 * (`tuerAufbau`, `tuerLage`); je Tür und Stoff ein Körper. Alles blendet mit dem Sturz der Tür aus (`wandStoffe`).
 */
import { GLAS_PROFIL, GLAS_SOCKEL, type HallenSzene, PANIK_RAND, type SzeneTuer, tuerAufbau, tuerLage } from "@schau/domain";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { anWand, NACH_INNEN } from "./hallenplan-3d-raum";
import { holzTuerTextur, WAND_KACHEL, wandTextur } from "./hallenplan-3d-texturen";

const M = 0.01; // cm → m

type Merk = <T extends { dispose: () => void }>(x: T) => T;

/** Stärke eines Türblatts (cm). */
const BLATT = 4;
/** Abstand der Blätter hinter der Innenfläche der Wand (cm): bündig fast null, sonst wie eine gewöhnliche Zarge. */
const ZURUECK = { wand: 0.4, glas: 3, holz: 3 } as const;

type StoffArt = "rand" | "haut" | "fuge" | "metall" | "rahmen" | "glas" | "holz";

export interface Tueren {
  /** Stoffe je Wandstück (Sturz der Tür, Index in `s.waende`), die mit der Wand aus- und einblenden. */
  wandStoffe: Map<number, THREE.Material[]>;
  /** Körper, die nur Schatten werfen, solange ihre Wand zu sehen ist. */
  wandSchatten: Map<number, THREE.Mesh[]>;
  /** Geschlossene Türen: wie die Wand ein Hindernis für den Doppelklick, solange sie zu sehen ist. */
  wandHindernisse: Map<number, THREE.Mesh[]>;
}

/** Quader in Tür-Koordinaten (cm): x entlang der Wand ab der Mitte, y ab dem Boden, z in die Halle ab der Innenfläche. */
const kasten = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry((x1 - x0) * M, (y1 - y0) * M, (z1 - z0) * M).translate(((x0 + x1) / 2) * M, ((y0 + y1) / 2) * M, ((z0 + z1) / 2) * M);

/** Stange zwischen zwei Punkten entlang x bzw. y (cm). */
const stange = (r: number, laenge: number, senkrecht: boolean, x: number, y: number, z: number) => {
  const g = new THREE.CylinderGeometry(r * M, r * M, laenge * M, 10);
  if (!senkrecht) g.rotateZ(Math.PI / 2);
  return g.translate(x * M, y * M, z * M);
};

/** Teile einer Tür in Tür-Koordinaten, nach Stoff (Meter); die Haut mit u in cm entlang der Wand wie die Innenwand. */
function tuerTeile(t: SzeneTuer, lage: ReturnType<typeof tuerLage>, wandHoehe: number): Partial<Record<StoffArt, THREE.BufferGeometry[]>> | null {
  if (t.art === "offen") return null;
  const a = tuerAufbau({ art: t.art, breite: lage.breite, hoehe: t.q.h, notausgang: t.notausgang, fluegel: t.fluegel });
  if (!a) return null;
  const teile: Partial<Record<StoffArt, THREE.BufferGeometry[]>> = {};
  const dazu = (art: StoffArt, g: THREE.BufferGeometry) => (teile[art] ??= []).push(g);
  const B = lage.breite / 2, H = t.q.h, z = a.zarge, zr = ZURUECK[t.art];
  const hinten = -(zr + BLATT), vorn = -zr, unten = 0.5, oben = unten + a.hoehe;
  // Zarge: bündig nur eine dunkle Fuge, sonst ein Rahmen, der innen 1 cm vor der Wand steht.
  const zarge: StoffArt = t.art === "wand" ? "fuge" : "rahmen";
  const [zh, zv] = t.art === "wand" ? [hinten - 1, 0] : [hinten - 3, 1];
  dazu(zarge, kasten(-B, -B + z, 0, H, zh, zv));
  dazu(zarge, kasten(B - z, B, 0, H, zh, zv));
  dazu(zarge, kasten(-B + z, B - z, H - z, H, zh, zv));
  // Zwischen zwei Flügeln eine dunkle Schlagleiste.
  if (a.blaetter.length === 2) dazu("fuge", kasten(a.blaetter[0]!.bis, a.blaetter[1]!.von, unten, oben, hinten + 0.5, vorn - 0.5));
  for (const b of a.blaetter) {
    if (t.art === "wand") {
      // Blatt wie die Wand: außen hell gestrichen, innen die Haut mit Prallwand und Anstrich an derselben Stelle wie die Wand.
      // Die Haut 4 mm vor dem Blatt (und mit Tiefenvorzug): sonst flimmern beide aus der Ferne in großen Hallen.
      dazu("rand", kasten(b.von, b.bis, unten, oben, hinten, vorn - 0.5));
      const haut = new THREE.PlaneGeometry((b.bis - b.von) * M, a.hoehe * M).translate(((b.von + b.bis) / 2) * M, ((unten + oben) / 2) * M, (vorn - 0.1) * M);
      const p = haut.getAttribute("position"), uv = haut.getAttribute("uv");
      for (let i = 0; i < p.count; i++) uv.setXY(i, lage.mitte + lage.richtung * (p.getX(i) / M), p.getY(i) / M / wandHoehe);
      dazu("haut", haut);
    } else if (t.art === "holz") {
      dazu("holz", kasten(b.von, b.bis, unten, oben, hinten, vorn));
    } else {
      // Glastür: Rahmenprofil ringsum (unten höher), dazwischen das Glas in der Mitte des Blatts.
      const p = GLAS_PROFIL, sockel = GLAS_SOCKEL;
      dazu("rahmen", kasten(b.von, b.von + p, unten, oben, hinten, vorn));
      dazu("rahmen", kasten(b.bis - p, b.bis, unten, oben, hinten, vorn));
      dazu("rahmen", kasten(b.von + p, b.bis - p, oben - p, oben, hinten, vorn));
      dazu("rahmen", kasten(b.von + p, b.bis - p, unten, unten + sockel, hinten, vorn));
      dazu("glas", new THREE.PlaneGeometry((b.bis - b.von - 2 * p) * M, (a.hoehe - p - sockel) * M).translate(((b.von + b.bis) / 2) * M, ((unten + sockel + oben - p) / 2) * M, ((hinten + vorn) / 2) * M));
    }
    // Griffe beidseitig: Glastür eine senkrechte Stange, sonst ein flacher Drücker mit Rosette.
    const innen = b.griff < (b.von + b.bis) / 2 ? 1 : -1; // Drücker zeigen zur Blattmitte
    for (const [flaeche, aus] of [[vorn, 1], [hinten, -1]] as const) {
      if (t.art === "glas") {
        dazu("metall", stange(1.6, 100, true, b.griff, a.griffHoehe, flaeche + aus * 6));
        for (const dy of [-40, 40]) dazu("metall", kasten(b.griff - 0.8, b.griff + 0.8, a.griffHoehe + dy - 0.8, a.griffHoehe + dy + 0.8, Math.min(flaeche, flaeche + aus * 6), Math.max(flaeche, flaeche + aus * 6)));
      } else {
        dazu("metall", kasten(b.griff - 2.5, b.griff + 2.5, a.griffHoehe - 9, a.griffHoehe + 4, Math.min(flaeche, flaeche + aus * 1), Math.max(flaeche, flaeche + aus * 1)));
        dazu("metall", kasten(Math.min(b.griff, b.griff + innen * 13), Math.max(b.griff, b.griff + innen * 13), a.griffHoehe - 1, a.griffHoehe + 1.2, Math.min(flaeche + aus * 4, flaeche + aus * 6), Math.max(flaeche + aus * 4, flaeche + aus * 6)));
        dazu("metall", kasten(b.griff - 1, b.griff + 1, a.griffHoehe - 1, a.griffHoehe + 1, Math.min(flaeche, flaeche + aus * 5), Math.max(flaeche, flaeche + aus * 5)));
      }
    }
    // Notausgang: Panikstange innen quer über das Blatt, mit zwei Haltern.
    if (a.panik) {
      const l = b.bis - b.von - 2 * PANIK_RAND, mx = (b.von + b.bis) / 2;
      dazu("metall", stange(1.8, l, false, mx, a.griffHoehe - 5, vorn + 8));
      for (const x of [mx - l / 2 + 3, mx + l / 2 - 3]) dazu("metall", kasten(x - 2, x + 2, a.griffHoehe - 8, a.griffHoehe - 2, vorn, vorn + 8));
    }
  }
  return teile;
}

/**
 * Türen bauen (in `modell`, also auch im heruntergeladenen Modell). Offene Eingänge bleiben eine Öffnung. Die Grundstoffe
 * entstehen nur für Türarten, die es gibt; je Tür eine Kopie (sie blendet mit ihrer Wand aus).
 */
export function baueTueren(modell: THREE.Group, s: HallenSzene, merk: Merk): Tueren {
  const aus: Tueren = { wandStoffe: new Map(), wandSchatten: new Map(), wandHindernisse: new Map() };
  const zu = <T>(m: Map<number, T[]>, i: number, x: T) => m.set(i, [...(m.get(i) ?? []), x]);
  const grund = new Map<StoffArt, THREE.MeshStandardMaterial>();
  const stoff = (art: StoffArt): THREE.MeshStandardMaterial => {
    const da = grund.get(art);
    if (da) return da;
    let m: THREE.MeshStandardMaterial;
    if (art === "haut") {
      const tex = merk(wandTextur(s.aussehen));
      tex.repeat.set(1 / WAND_KACHEL, 1);
      m = new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    } else if (art === "holz") {
      const tex = merk(holzTuerTextur());
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: "#3a2412", emissiveIntensity: 0.25 });
    } else if (art === "glas") {
      // Hell und leicht bläulich, halb durchsichtig: der Hof bzw. die Halle dahinter schimmert durch.
      m = new THREE.MeshStandardMaterial({ color: "#d4e8f3", emissive: "#a9cbe0", emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
      m.userData.deckkraft = 0.32;
    } else {
      // Ohne Umgebungsbild wirkt echtes Metall schwarz: Edelstahl und Rahmen nur leicht metallisch, dafür hell bzw. anthrazit.
      const farbe = { rand: "#f8f5ef", fuge: "#2d3135", metall: "#d2d6db", rahmen: "#4f565e" }[art];
      m = new THREE.MeshStandardMaterial({ color: farbe, roughness: art === "metall" ? 0.4 : 0.75, metalness: art === "metall" ? 0.3 : art === "rahmen" ? 0.1 : 0, ...(art === "rand" ? { emissive: "#5e5a52" } : {}) });
    }
    grund.set(art, merk(m));
    return m;
  };
  for (const t of s.tueren) {
    const lage = tuerLage(t, s);
    const teile = tuerTeile(t, lage, s.wandHoehe);
    if (!teile) continue;
    const p = anWand(lage.seite, lage.ebene, lage.mitte, 0, 0);
    for (const [art, geos] of Object.entries(teile) as [StoffArt, THREE.BufferGeometry[]][]) {
      const geo = merk(mergeGeometries(geos)!);
      for (const g of geos) g.dispose();
      // Geometrie um die Türmitte, der Körper an der Tür: so sortiert three.js durchsichtige Teile (Glas) richtig.
      geo.rotateY(NACH_INNEN[lage.seite]);
      const m = merk(stoff(art).clone());
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(p.x, 0, p.z);
      mesh.name = `Tür ${t.name}`; // bleibt deutsch (Name im 3D-Modell)
      mesh.receiveShadow = art !== "glas";
      mesh.castShadow = art !== "glas";
      modell.add(mesh);
      zu(aus.wandStoffe, t.wand, m);
      if (art !== "glas") zu(aus.wandSchatten, t.wand, mesh);
      zu(aus.wandHindernisse, t.wand, mesh);
    }
  }
  return aus;
}
