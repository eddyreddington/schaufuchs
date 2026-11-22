/**
 * Der Raum der 3D-Halle nach ihrem Aussehen (Entscheidung 028): Boden mit Belag, Folie und Meterraster, Spielfeldlinien,
 * Innenseiten der Wände mit Prallwand, Fenster, Geräte an den Wänden und die Decke (hallenplan-3d-decke.ts). Was an einer
 * Wand hängt, blendet mit ihr aus (`wandStoffe`, `wandSchatten`); die Decke zeigt sich nur von innen.
 */
import { fensterInWaenden, geraeteAnWaenden, type HallenSzene, LINIEN_BREITE, punktInUmriss, spielfeldLinien, type SzeneSeite, wandInnenseiten, type WandGeraet } from "@schau/domain";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { innenseitenGeometrie } from "./hallenplan-3d-bausteine";
import { baueDecke } from "./hallenplan-3d-decke";
import { BODEN_KACHEL, bodenTextur, brettTextur, FLUEGEL, fensterTextur, FOLIE_KACHEL, folienTextur, WAND_KACHEL, wandTextur } from "./hallenplan-3d-texturen";

const M = 0.01; // cm → m

type Merk = <T extends { dispose: () => void }>(x: T) => T;

/**
 * Lagen über dem Boden (Meter) und ihr Vorzug in der Tiefe (polygonOffset, je kleiner, desto weiter vorn): Linien unter der
 * Folie, die Folie unter den Flächen (Sperre, Volieren, Eingang), das Meterraster ganz oben. Die Höhen allein reichen im
 * flachen Blick aus der Ferne nicht (Tiefenauflösung), deshalb zusätzlich der Vorzug.
 */
export const BODEN_LAGEN = {
  linien: { y: 0.003, vorzug: -2 },
  folie: { y: 0.004, vorzug: -4 },
  flaechen: { y: 0.006, vorzug: -6 },
  raster: { y: 0.008 },
} as const;

export interface Raum {
  boden: THREE.Mesh;
  /** Stoffe je Wandstück (Index in `s.waende`), die mit der Wand aus- und einblenden. */
  wandStoffe: Map<number, THREE.Material[]>;
  /** Körper an einer Wand (Geräte), die nur Schatten werfen, solange ihre Wand zu sehen ist. */
  wandSchatten: Map<number, THREE.Mesh[]>;
  /** Decke zeigen oder verbergen (Kamera in Metern). */
  deckeNachfuehren: (kamera: THREE.Vector3) => void;
  /** Folie über dem Boden zeigen oder nicht (Umschalter in der Ansicht, ohne Neuaufbau). */
  folie: (an: boolean) => void;
  /** Für das 3D-Modell vorbereiten (Decke sichtbar); gibt zurück, wie es wieder wird. */
  fuerExport: () => () => void;
}

/** Drehung um die Hochachse, damit lokal +z von der Wand in die Halle zeigt (lokal +x entlang der Wand). */
export const NACH_INNEN: Record<SzeneSeite, number> = { z0: 0, z1: Math.PI, x0: Math.PI / 2, x1: -Math.PI / 2 };

/** Punkt an der Wand (Meter): entlang der Wand, Höhe, Abstand vor der Innenfläche. */
export function anWand(seite: SzeneSeite, ebene: number, entlang: number, y: number, vor: number): THREE.Vector3 {
  const innen = seite === "x0" || seite === "z0" ? 1 : -1;
  const quer = (ebene + innen * vor) * M;
  return seite[0] === "z" ? new THREE.Vector3(entlang * M, y * M, quer) : new THREE.Vector3(quer, y * M, entlang * M);
}

/** Linienzüge als flache Bänder (Meter, am Boden), alle in einer Geometrie. */
function linienGeometrie(zuege: { x: number; z: number }[][], breite: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const h = breite / 2;
  for (const p of zuege)
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!;
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l < 0.01) continue;
      // Etwas über die Enden hinaus, damit Ecken und Bögen ohne Lücke schließen.
      const dx = (b.x - a.x) / l, dz = (b.z - a.z) / l, nx = -dz * h, nz = dx * h, ex = dx * h, ez = dz * h;
      const q = [
        [a.x - ex + nx, a.z - ez + nz],
        [a.x - ex - nx, a.z - ez - nz],
        [b.x + ex - nx, b.z + ez - nz],
        [b.x + ex + nx, b.z + ez + nz],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k]![0]! * M, 0, q[k]![1]! * M);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** Basketballbrett mit Halterung und Ring (lokal: x entlang der Wand, z in die Halle, y ab Unterkante des Bretts, Meter). */
function korbTeile(g: WandGeraet): { brett: THREE.BufferGeometry; metall: THREE.BufferGeometry; ring: THREE.BufferGeometry } {
  const b = g.b * M, h = g.h * M, abstand = 0.25;
  const brett = new THREE.BoxGeometry(b, h, 0.03).translate(0, h / 2, abstand);
  const metall = mergeGeometries([
    new THREE.BoxGeometry(0.06, 0.06, abstand).translate(-b / 3, h / 2, abstand / 2),
    new THREE.BoxGeometry(0.06, 0.06, abstand).translate(b / 3, h / 2, abstand / 2),
  ])!;
  const ring = new THREE.TorusGeometry(0.23, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, 0.15, abstand + 0.04 + 0.23);
  return { brett, metall, ring };
}

/** Sprossenwand mit zwei Feldern: Holme und runde Sprossen etwa alle 14 cm (lokal wie beim Korb, Meter). */
function sprossenGeometrie(g: WandGeraet): THREE.BufferGeometry {
  const b = g.b * M, h = g.h * M, vor = 0.1;
  const teile: THREE.BufferGeometry[] = [];
  for (const x of [-b / 2, 0, b / 2]) teile.push(new THREE.BoxGeometry(0.07, h, 0.09).translate(x, h / 2, vor));
  const n = Math.floor((h - 0.1) / 0.14);
  for (let i = 1; i <= n; i++)
    for (const x of [-b / 4, b / 4]) teile.push(new THREE.CylinderGeometry(0.018, 0.018, b / 2 - 0.06, 8).rotateZ(Math.PI / 2).translate(x, i * 0.14, vor));
  const alle = teile.map((t) => (t.index ? t.toNonIndexed() : t));
  const aus = mergeGeometries(alle)!;
  for (const t of teile) t.dispose();
  return aus;
}

/**
 * Raum bauen. `szene`: Meterraster (nur Anzeige, nicht im heruntergeladenen Modell); `modell`: Boden, Folie, Linien,
 * Innenwände, Fenster, Geräte, Decke (im Modell die Folie, wie gerade gezeigt, und die Decke immer).
 */
export function baueRaum(szene: THREE.Scene, modell: THREE.Group, s: HallenSzene, merk: Merk): Raum {
  const a = s.aussehen;
  const B = s.breite * M, L = s.laenge * M;
  const wandStoffe = new Map<number, THREE.Material[]>();
  const wandSchatten = new Map<number, THREE.Mesh[]>();
  const zurWand = (wand: number, stoff: THREE.Material) => {
    const l = wandStoffe.get(wand) ?? [];
    l.push(stoff);
    wandStoffe.set(wand, l);
  };

  // Boden: Belag als wiederholte Kachel (Rechteck oder freier Grundriss, Entscheidung 019).
  const kachel = BODEN_KACHEL[a.boden] * M;
  const bodenTex = merk(bodenTextur(a.boden));
  const bodenStoff = merk(new THREE.MeshStandardMaterial({ map: bodenTex, roughness: a.boden === "parkett" ? 0.55 : a.boden === "sportboden" ? 0.7 : 0.9, metalness: 0 }));
  let boden: THREE.Mesh;
  if (s.umriss) {
    // ShapeGeometry: uv = Lage in Metern.
    const form = new THREE.Shape(s.umriss.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
    boden = new THREE.Mesh(merk(new THREE.ShapeGeometry(form)), bodenStoff);
    bodenTex.repeat.set(1 / kachel, 1 / kachel);
  } else {
    boden = new THREE.Mesh(merk(new THREE.PlaneGeometry(B, L)), bodenStoff);
    boden.position.set(B / 2, 0, L / 2);
    bodenTex.repeat.set(B / kachel, L / kachel);
  }
  boden.rotation.x = -Math.PI / 2;
  boden.receiveShadow = true;
  modell.add(boden);

  // Folie: graue Schutzbahnen über dem Boden (deckt Belag und Linien ab), Bahnen entlang der langen Seite.
  const folienTex = merk(folienTextur());
  const fk = FOLIE_KACHEL * M;
  const folienStoff = merk(new THREE.MeshStandardMaterial({ map: folienTex, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: BODEN_LAGEN.folie.vorzug, polygonOffsetUnits: BODEN_LAGEN.folie.vorzug }));
  const folie = new THREE.Mesh(boden.geometry, folienStoff);
  folie.name = "Folie"; // bleibt deutsch (Name im 3D-Modell)
  folie.rotation.copy(boden.rotation);
  folie.position.copy(boden.position);
  folie.position.y = BODEN_LAGEN.folie.y;
  folie.receiveShadow = true;
  // Textur: gedreht wird vor dem Skalieren – bei gedrehter Kachel die Wiederholung über Kreuz.
  const quer = s.breite >= s.laenge;
  if (quer) folienTex.rotation = Math.PI / 2;
  if (s.umriss) folienTex.repeat.set(1 / fk, 1 / fk);
  else if (quer) folienTex.repeat.set(L / fk, B / fk);
  else folienTex.repeat.set(B / fk, L / fk);
  folie.visible = a.abdeckung;
  modell.add(folie);

  // Meterraster: fein, nur innerhalb des Grundrisses – zum Abschätzen von Maßen, ohne den Belag zu überdecken.
  const drin = (x: number, z: number) => !s.umriss || punktInUmriss({ x: x / M, y: z / M }, s.umriss);
  const raster: number[] = [];
  // Über Folie und Flächen, damit es auch auf der Folie zu sehen ist.
  const ry = BODEN_LAGEN.raster.y;
  for (let x = 1; x < B; x++) for (let z = 0; z < L; z++) if (drin(x, z + 0.5)) raster.push(x, ry, z, x, ry, Math.min(L, z + 1));
  for (let z = 1; z < L; z++) for (let x = 0; x < B; x++) if (drin(x + 0.5, z)) raster.push(x, ry, z, Math.min(B, x + 1), ry, z);
  const rasterGeo = merk(new THREE.BufferGeometry());
  rasterGeo.setAttribute("position", new THREE.Float32BufferAttribute(raster, 3));
  const rasterLinien = new THREE.LineSegments(rasterGeo, merk(new THREE.LineBasicMaterial({ color: "#5a4a30", transparent: true, opacity: 0.12, depthWrite: false })));
  szene.add(rasterLinien);

  // Spielfeldlinien: je Farbe ein Netz aus flachen Bändern knapp über dem Boden.
  const linien = spielfeldLinien(s);
  const FARBE = { schwarz: "#26282b", blau: "#1f78dc", rot: "#c23b2e" } as const;
  for (const farbe of ["schwarz", "blau", "rot"] as const) {
    const zuege = linien.filter((l) => l.farbe === farbe).map((l) => l.punkte);
    if (!zuege.length) continue;
    const m = new THREE.Mesh(merk(linienGeometrie(zuege, LINIEN_BREITE)), merk(new THREE.MeshStandardMaterial({ color: FARBE[farbe], roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: BODEN_LAGEN.linien.vorzug, polygonOffsetUnits: BODEN_LAGEN.linien.vorzug })));
    m.position.y = BODEN_LAGEN.linien.y;
    m.receiveShadow = true;
    modell.add(m);
  }

  // Innenseiten der Wände: Prallwand und Anstrich (eine Kachel entlang der Wand wiederholt), leichtes Eigenleuchten aus
  // derselben Textur, damit die Wand auch im Schatten hell bleibt. Je Wandstück ein eigener Stoff (blendet mit der Wand aus).
  const innenTex = merk(wandTextur(a));
  innenTex.repeat.set(1 / WAND_KACHEL, 1);
  const innenStoff = merk(new THREE.MeshStandardMaterial({ map: innenTex, emissive: "#ffffff", emissiveMap: innenTex, emissiveIntensity: 0.3, roughness: 0.9, side: THREE.DoubleSide }));
  for (const f of wandInnenseiten(s)) {
    const stoff = merk(innenStoff.clone());
    const m = new THREE.Mesh(merk(innenseitenGeometrie(f, s)), stoff);
    m.receiveShadow = true;
    modell.add(m);
    zurWand(f.wand, stoff);
  }

  // Fenster: je Wandstück eine Geometrie aus allen Fenstern (u in Flügeln, damit die Sprossen nicht gestreckt werden).
  const fenster = fensterInWaenden(s);
  if (fenster.length) {
    const tex = merk(fensterTextur());
    tex.wrapS = THREE.RepeatWrapping;
    const grund = merk(new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide }));
    for (const wand of new Set(fenster.map((f) => f.wand))) {
      const geos = fenster
        .filter((f) => f.wand === wand)
        .map((f) => {
          const breite = (f.bis - f.von) * M, hoehe = f.h * M;
          const g = new THREE.PlaneGeometry(breite, hoehe).translate(0, hoehe / 2, 0);
          const fluegel = Math.max(1, Math.round((f.bis - f.von) / FLUEGEL));
          const uv = g.getAttribute("uv");
          for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * fluegel);
          const p = anWand(f.seite, f.ebene, (f.von + f.bis) / 2, f.y, 1.5);
          return g.rotateY(NACH_INNEN[f.seite]).translate(p.x, p.y, p.z);
        });
      const stoff = merk(grund.clone());
      modell.add(new THREE.Mesh(merk(mergeGeometries(geos)!), stoff));
      for (const g of geos) g.dispose();
      zurWand(wand, stoff);
    }
  }

  // Geräte (Deko): Basketballbretter mit Ring, Sprossenwand.
  const geraete = geraeteAnWaenden(s);
  if (geraete.length) {
    const brettTex = merk(brettTextur());
    const stoffe = {
      brett: merk(new THREE.MeshStandardMaterial({ map: brettTex, roughness: 0.4 })),
      metall: merk(new THREE.MeshStandardMaterial({ color: "#6b7078", metalness: 0.5, roughness: 0.5 })),
      ring: merk(new THREE.MeshStandardMaterial({ color: "#e0662a", metalness: 0.3, roughness: 0.5 })),
      holz: merk(new THREE.MeshStandardMaterial({ color: "#d8b583", roughness: 0.7 })),
    };
    for (const g of geraete) {
      const teile: [THREE.BufferGeometry, THREE.MeshStandardMaterial][] =
        g.art === "korb"
          ? (() => {
              const k = korbTeile(g);
              return [[k.brett, stoffe.brett], [k.metall, stoffe.metall], [k.ring, stoffe.ring]];
            })()
          : [[sprossenGeometrie(g), stoffe.holz]];
      // Das Brett zeigt mit der bedruckten Seite in die Halle (BoxGeometry: Seite +z).
      for (const [geo, grund] of teile) {
        const stoff = merk(grund.clone());
        const m = new THREE.Mesh(merk(geo), stoff);
        m.position.copy(anWand(g.seite, g.ebene, g.mitte, g.y, 0));
        m.rotation.y = NACH_INNEN[g.seite];
        m.castShadow = true;
        modell.add(m);
        zurWand(g.wand, stoff);
        wandSchatten.set(g.wand, [...(wandSchatten.get(g.wand) ?? []), m]);
      }
    }
  }

  const decke = baueDecke(modell, s, merk, zurWand);
  return {
    boden,
    wandStoffe,
    wandSchatten,
    deckeNachfuehren: decke.nachfuehren,
    folie: (an) => void (folie.visible = an),
    fuerExport: decke.fuerExport,
  };
}
