/**
 * Decke der 3D-Halle (Entscheidung 028): Holzdecke aus Profilbrettern – flach oder als Satteldach –, Leimbinder entlang der
 * Decke, Giebel an den Stirnseiten und Leuchtbänder. Die Rechnung kommt aus der Domain (hallenplan-3d-dach.ts); die Decke
 * zeigt sich nur von innen (`deckeSichtbar`) und wirft keinen Schatten (die Sonne bleibt in der Halle).
 */
import { BINDER, type Binder, dachVon, deckeSichtbar, deckenTeile, giebel, type HallenSzene, hoechstesInDerHalle, type Quader, type SzeneSeite } from "@schau/domain";
import * as THREE from "three";
import { deckenTextur } from "./hallenplan-3d-texturen";

const M = 0.01; // cm → m

type Merk = <T extends { dispose: () => void }>(x: T) => T;

/** Drehung um die Hochachse, damit lokal +z von der Wand in die Halle zeigt. */
const NACH_INNEN: Record<SzeneSeite, number> = { z0: 0, z1: Math.PI, x0: Math.PI / 2, x1: -Math.PI / 2 };

/**
 * Deckenfläche beim Rechteck (Meter): flach ein Rechteck, beim Satteldach zwei geneigte Flächen von den Längswänden zum
 * First. uv in Metern: u quer (die Neigung hinauf), v entlang der langen Seite – die Bretter der Textur laufen entlang v.
 */
function deckenFlaeche(s: HallenSzene): THREE.BufferGeometry {
  const d = dachVon(s);
  const Lg = d.laengsX ? s.breite : s.laenge, Bq = d.laengsX ? s.laenge : s.breite;
  const P = (u: number, v: number, y: number) => (d.laengsX ? [u * M, y * M, v * M] : [v * M, y * M, u * M]);
  const flaechen: [number, number, number, number][] = d.sattel ? [[0, Bq / 2, d.traufe, d.first], [Bq, Bq / 2, d.traufe, d.first]] : [[0, Bq, d.traufe, d.traufe]];
  const pos: number[] = [], uv: number[] = [];
  for (const [v0, v1, y0, y1] of flaechen) {
    const hang = Math.hypot(v1 - v0, y1 - y0) * M;
    const ecken = [P(0, v0, y0), P(Lg, v0, y0), P(Lg, v1, y1), P(0, v1, y1)];
    const uvs = [[0, 0], [0, Lg * M], [hang, Lg * M], [hang, 0]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...ecken[i]!);
      uv.push(...uvs[i]!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Binder als Instanzen eines Quaders, Oberkante an der Decke von a nach b (auch geneigt). */
function binderNetz(liste: Binder[], einheit: THREE.BufferGeometry, stoff: THREE.Material): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(einheit, stoff, Math.max(1, liste.length));
  const mat = new THREE.Matrix4(), dreh = new THREE.Quaternion(), neig = new THREE.Quaternion(), pos = new THREE.Vector3(), skal = new THREE.Vector3();
  liste.forEach((b, i) => {
    const dx = (b.b.x - b.a.x) * M, dy = (b.b.y - b.a.y) * M, dz = (b.b.z - b.a.z) * M;
    const waag = Math.hypot(dx, dz);
    dreh.setFromAxisAngle(OBEN, Math.atan2(-dz, dx));
    neig.setFromAxisAngle(VORN, Math.atan2(dy, waag));
    pos.set(((b.a.x + b.b.x) / 2) * M, ((b.a.y + b.b.y) / 2) * M, ((b.a.z + b.b.z) / 2) * M);
    skal.set(Math.hypot(waag, dy), BINDER.hoehe * M, BINDER.breite * M);
    im.setMatrixAt(i, mat.compose(pos, dreh.multiply(neig), skal));
  });
  im.count = liste.length;
  return im;
}

const OBEN = new THREE.Vector3(0, 1, 0);
const VORN = new THREE.Vector3(0, 0, 1);

export interface Decke {
  /** Decke zeigen oder verbergen (Kamera in Metern). */
  nachfuehren: (kamera: THREE.Vector3) => void;
  /** Für das 3D-Modell: Decke sichtbar machen; gibt zurück, wie es wieder wird. */
  fuerExport: () => () => void;
}

/** Decke bauen (nur mit `aussehen.decke`); `zurWand`: Stoffe, die mit ihrer Wand ausblenden (Giebel). */
export function baueDecke(modell: THREE.Group, s: HallenSzene, merk: Merk, zurWand: (wand: number, stoff: THREE.Material) => void): Decke {
  const gruppe = new THREE.Group();
  gruppe.name = "Decke"; // bleibt deutsch (Name im 3D-Modell)
  gruppe.visible = false;
  if (!s.aussehen.decke) return { nachfuehren: () => undefined, fuerExport: () => () => undefined };
  const tex = merk(deckenTextur());
  const holz = merk(new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.8, side: THREE.DoubleSide }));
  if (s.umriss) {
    // Freier Grundriss (flach): uv = Lage in Metern, Bretter entlang der langen Seite.
    const flaeche = new THREE.Mesh(merk(new THREE.ShapeGeometry(new THREE.Shape(s.umriss.map((p) => new THREE.Vector2(p.x * M, -p.y * M))))), holz);
    if (s.breite >= s.laenge) tex.rotation = Math.PI / 2;
    flaeche.rotation.x = -Math.PI / 2;
    flaeche.position.y = s.wandHoehe * M;
    gruppe.add(flaeche);
  } else gruppe.add(new THREE.Mesh(merk(deckenFlaeche(s)), holz));

  const { binder, leuchten } = deckenTeile(s, hoechstesInDerHalle(s));
  const einheit = merk(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0));
  gruppe.add(binderNetz(binder, einheit, merk(new THREE.MeshStandardMaterial({ color: "#e2ad68", emissive: "#5a3a14", roughness: 0.7 }))));
  const quader = merk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const lampen = new THREE.InstancedMesh(quader, merk(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fffaf0", emissiveIntensity: 1, roughness: 0.4 })), Math.max(1, leuchten.length));
  const mat = new THREE.Matrix4();
  leuchten.forEach((q: Quader, i) => lampen.setMatrixAt(i, mat.makeScale(q.b * M, q.h * M, q.t * M).setPosition((q.x + q.b / 2) * M, q.y * M, (q.z + q.t / 2) * M)));
  lampen.count = leuchten.length;
  gruppe.add(lampen);

  // Giebel: weiße Dreiecke über den Stirnwänden, so stark wie die Wand; blenden mit ihrer Wand aus.
  const giebelStoff = new THREE.MeshStandardMaterial({ color: "#f3f1ec", emissive: "#8c8880", roughness: 0.9, side: THREE.DoubleSide });
  for (const g of giebel(s)) {
    const halb = ((g.bis - g.von) / 2) * M;
    const form = new THREE.Shape([new THREE.Vector2(-halb, 0), new THREE.Vector2(halb, 0), new THREE.Vector2(0, (g.spitze - g.y) * M)]);
    const geo = merk(new THREE.ExtrudeGeometry(form, { depth: g.dicke * M, bevelEnabled: false }).translate(0, 0, -g.dicke * M));
    const stoff = merk(giebelStoff.clone());
    const m = new THREE.Mesh(geo, stoff);
    const mitte = ((g.von + g.bis) / 2) * M, quer = g.ebene * M;
    m.position.set(g.seite[0] === "z" ? mitte : quer, g.y * M, g.seite[0] === "z" ? quer : mitte);
    m.rotation.y = NACH_INNEN[g.seite];
    gruppe.add(m);
    zurWand(g.wand, stoff);
  }
  giebelStoff.dispose();
  modell.add(gruppe);
  const k = { x: 0, y: 0, z: 0 };
  return {
    nachfuehren: (kamera) => {
      k.x = kamera.x / M;
      k.y = kamera.y / M;
      k.z = kamera.z / M;
      gruppe.visible = deckeSichtbar(s, k);
    },
    fuerExport: () => {
      const vorher = gruppe.visible;
      gruppe.visible = true;
      return () => void (gruppe.visible = vorher);
    },
  };
}
