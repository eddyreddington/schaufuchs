/** Bausteine der 3D-Halle: Texturen (Gitter, Stoff, Turnhallenwand), Geometrien (Kasten, Schürzen, Innenseiten), Figuren, Schilder. */
import { verkleidungsKachel, type SzeneSchuerze, type WandInnenseite, type Figur, type HallenSzene } from "@schau/domain";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const M = 0.01; // cm → m

/** Preisrichter-Farbe aufgehellt wie im 2D-Plan (45 % Deckung auf Weiß). */
export function hell(hex: string): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), 0.55);
  return `#${c.getHexString()}`;
}


/** Kleine feste Abweichung der Blickrichtung je Tier (sieht lebendiger aus, bleibt beim Neuzeichnen gleich). */
export function wackel(id: number): number {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.7;
}

/**
 * Pokal als Drehkörper, 1 hoch und 1 breit (Boden in der Mitte bei y = 0): Sockel, Fuß, Schale und zwei Henkel – für die
 * Pokaltische.
 */
export function pokalGeometrie(): THREE.BufferGeometry {
  const profil = [[0, 0], [0.32, 0], [0.32, 0.1], [0.12, 0.12], [0.06, 0.18], [0.05, 0.42], [0.12, 0.46], [0.3, 0.58], [0.38, 0.78], [0.4, 1], [0.36, 1], [0.34, 0.8], [0, 0.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const koerper = new THREE.LatheGeometry(profil, 20);
  const henkel = [-1, 1].map((s) => new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI).rotateZ(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(s * 0.38, 0.8, 0));
  const alle = [koerper, ...henkel].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of alle) g.deleteAttribute("uv");
  return mergeGeometries(alle)!;
}

/** Einheitswürfel (Boden in der Mitte bei y = 0) ohne Vorderseite (+z) und Decke (+y): Seiten, Rückwand und Boden bleiben. */
export function offenerKasten(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Gruppen der BoxGeometry: +x, −x, +y, −y, +z, −z – Decke (+y) und Vorderseite (+z) fallen weg (dort sitzt das Gitter).
  const index = box.getIndex()!;
  const behalten: number[] = [];
  box.groups.forEach((g, i) => {
    if (i === 2 || i === 4) return;
    for (let j = g.start; j < g.start + g.count; j++) behalten.push(index.getX(j));
  });
  box.setIndex(behalten);
  box.clearGroups();
  return box;
}

/** Gitter als Textur: senkrechte (und waagrechte) Stäbe, dazwischen durchsichtig. */
export function gitterTextur(senkrecht: number, waagrecht: number, n = 256, staerke = n / 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, n, n);
  g.fillStyle = "#ffffff";
  const stab = Math.max(1, staerke);
  for (let i = 0; i <= senkrecht; i++) g.fillRect(Math.min(n - stab, (i / senkrecht) * n - stab / 2), 0, stab, n);
  for (let i = 0; i <= waagrecht; i++) g.fillRect(0, Math.min(n - stab, (i / waagrecht) * n - stab / 2), n, stab);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function schildSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const schrift = 44;
  g.font = `600 ${schrift}px system-ui, sans-serif`;
  const breite = Math.min(1024, Math.ceil(g.measureText(text).width) + 28);
  c.width = breite;
  c.height = schrift + 22;
  g.font = `600 ${schrift}px system-ui, sans-serif`;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.roundRect(0, 0, c.width, c.height, 12);
  g.fill();
  g.fillStyle = "#1f2a44";
  g.textBaseline = "middle";
  g.fillText(text, 14, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const h = 0.32;
  sp.scale.set((h * c.width) / c.height, h, 1);
  return sp;
}

export type Teil = { geo: THREE.BufferGeometry; farbe?: string };

/**
 * Figuren aus Grundkörpern, 1 Einheit hoch (Füße bei y = 0, Blick nach +z); skaliert auf die Größe des Tieres. Teile ohne
 * Farbe tragen das Gefieder (je Tier), die übrigen haben feste Farben (Kamm, Schnabel, Beine). Teile gleicher Farbe sind
 * zusammengefasst – so bleibt es bei wenigen Netzen auch mit vielen Tieren.
 */
export function figurTeile(): Record<Figur, Teil[]> {
  const ei = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) => new THREE.SphereGeometry(r, 9, 7).scale(sx, sy, sz).rotateX(rx).translate(x, y, z);
  const kugel = (r: number, x: number, y: number, z: number) => new THREE.SphereGeometry(r, 8, 6).translate(x, y, z);
  const kegel = (r: number, h: number, x: number, y: number, z: number, rx: number) => new THREE.ConeGeometry(r, h, 6).rotateX(rx).translate(x, y, z);
  const walze = (r1: number, r2: number, h: number, x: number, y: number, z: number, rx = 0) => new THREE.CylinderGeometry(r1, r2, h, 6).rotateX(rx).translate(x, y, z);
  const kiste = (b: number, h: number, t: number, x: number, y: number, z: number, rx = 0) => new THREE.BoxGeometry(b, h, t).rotateX(rx).translate(x, y, z);
  const beine = (h: number, abstand: number, r = 0.022) => [walze(r, r, h, -abstand, h / 2, 0), walze(r, r, h, abstand, h / 2, 0)];
  const zusammen = (geos: THREE.BufferGeometry[], farbe?: string): Teil => {
    const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false)!;
    for (const x of geos) x.dispose();
    return { geo: g, farbe };
  };
  const ROT = "#c62828", GELB = "#e0b13a", ORANGE = "#e8892c";
  const huhn = (): Teil[] => [
    zusammen([
      ei(0.5, 0.42, 0.4, 0.66, 0, 0.48, -0.02),
      ei(0.5, 0.16, 0.3, 0.16, 0, 0.7, 0.18),
      kugel(0.11, 0, 0.84, 0.22),
      kegel(0.14, 0.34, 0, 0.72, -0.3, -0.7),
      ei(0.5, 0.08, 0.26, 0.46, 0.2, 0.5, -0.04),
      ei(0.5, 0.08, 0.26, 0.46, -0.2, 0.5, -0.04),
    ]),
    zusammen([kiste(0.035, 0.1, 0.16, 0, 0.97, 0.22), kugel(0.035, 0, 0.74, 0.31)], ROT),
    zusammen([kegel(0.035, 0.1, 0, 0.83, 0.36, Math.PI / 2), ...beine(0.3, 0.08)], GELB),
  ];
  return {
    huhn: huhn(),
    zwerghuhn: huhn(),
    taube: [
      zusammen([
        ei(0.5, 0.34, 0.34, 0.6, 0, 0.4, 0, -0.2),
        ei(0.5, 0.18, 0.28, 0.18, 0, 0.6, 0.16),
        kugel(0.11, 0, 0.74, 0.24),
        kiste(0.2, 0.04, 0.32, 0, 0.36, -0.38, 0.3),
        ei(0.5, 0.08, 0.24, 0.44, 0.16, 0.42, -0.05, -0.2),
        ei(0.5, 0.08, 0.24, 0.44, -0.16, 0.42, -0.05, -0.2),
      ]),
      zusammen([kegel(0.03, 0.09, 0, 0.73, 0.38, Math.PI / 2)], "#d8c7a2"),
      zusammen(beine(0.24, 0.06, 0.02), "#c0454a"),
    ],
    ente: [
      zusammen([ei(0.5, 0.4, 0.32, 0.68, 0, 0.36, 0), walze(0.06, 0.08, 0.3, 0, 0.6, 0.26, 0.2), kugel(0.11, 0, 0.78, 0.3), kegel(0.08, 0.16, 0, 0.44, -0.36, -1.0)]),
      zusammen([kiste(0.09, 0.035, 0.16, 0, 0.75, 0.44), ...beine(0.22, 0.08, 0.025)], ORANGE),
    ],
    gans: [
      zusammen([ei(0.5, 0.46, 0.38, 0.74, 0, 0.36, -0.04), walze(0.05, 0.08, 0.44, 0, 0.66, 0.24, 0.3), kugel(0.09, 0, 0.9, 0.3), kegel(0.1, 0.18, 0, 0.44, -0.42, -1.0)]),
      zusammen([kegel(0.04, 0.16, 0, 0.88, 0.43, Math.PI / 2), ...beine(0.2, 0.09, 0.028)], ORANGE),
    ],
    pute: [
      zusammen([ei(0.5, 0.5, 0.46, 0.64, 0, 0.5, 0), walze(0.4, 0.4, 0.04, 0, 0.62, -0.3, Math.PI / 2 - 0.35)]),
      zusammen([walze(0.05, 0.07, 0.24, 0, 0.8, 0.24, 0.3), kugel(0.08, 0, 0.93, 0.3), kugel(0.03, 0, 0.87, 0.38)], "#c45a64"),
      zusammen([kegel(0.035, 0.08, 0, 0.93, 0.38, Math.PI / 2), ...beine(0.3, 0.1, 0.028)], "#b9a184"),
    ],
  };
}

/** Bild der Schau (Logo der Verkleidung) laden und auf höchstens 512 px verkleinern (Textur klein halten). null: nicht lesbar. */
export async function ladeBild(url: string): Promise<HTMLCanvasElement | null> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) return null;
  const bild = await createImageBitmap(await r.blob());
  const f = Math.min(1, 512 / Math.max(bild.width, bild.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bild.width * f));
  c.height = Math.max(1, Math.round(bild.height * f));
  c.getContext("2d")!.drawImage(bild, 0, 0, c.width, c.height);
  bild.close();
  return c;
}


/**
 * Alle Bahnen der Sockelverkleidung als eine Geometrie (Meter): je Bahn ein Rechteck auf ihrer Außenseite. u läuft in cm
 * von links nach rechts, wie man von außen draufschaut (die Kachel steht nie spiegelverkehrt), v vom Boden (0) nach oben (1).
 */
export function schuerzenGeometrie(bahnen: SzeneSchuerze[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const b of bahnen) {
    const { x, z, b: bx, t: bz, h } = b.q;
    // Ecken unten links/rechts aus Sicht von außen, und die Normale.
    const [l, r, n]: [[number, number], [number, number], [number, number]] =
      b.aussen === "x+" ? [[x + bx, z + bz], [x + bx, z], [1, 0]] :
      b.aussen === "x-" ? [[x, z], [x, z + bz], [-1, 0]] :
      b.aussen === "z+" ? [[x, z + bz], [x + bx, z + bz], [0, 1]] :
      [[x + bx, z], [x, z], [0, -1]];
    const i = pos.length / 3;
    for (const [[px, pz], hy, u, v] of [[l, 0, 0, 0], [r, 0, b.laenge, 0], [r, h, b.laenge, 1], [l, h, 0, 1]] as const) {
      pos.push(px * M, hy * M + 0.005, pz * M);
      nor.push(n[0], 0, n[1]);
      uv.push(u, v);
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Kachel der Verkleidung als Bild: Stoff in der Farbe der Verkleidung mit leichten senkrechten Falten, darauf (falls da) das
 * Logo nach `verkleidungsKachel` – Seitenverhältnis erhalten, mit Rand; durchsichtige Stellen eines PNG zeigen den Stoff.
 * Ohne Logo eine 60 cm lange Stoffkachel. `laenge` in cm (für die Wiederholung entlang der Bahn).
 */
export function stoffKachel(farbe: string, hoehe: number, logo: HTMLCanvasElement | null): { canvas: HTMLCanvasElement; laenge: number } {
  const k = logo ? verkleidungsKachel(hoehe, logo.width, logo.height) : { laenge: 60, logo: null };
  const pxJeCm = Math.min(6, 1024 / k.laenge);
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(k.laenge * pxJeCm));
  c.height = Math.max(2, Math.round(hoehe * pxJeCm));
  const g = c.getContext("2d")!;
  g.fillStyle = farbe;
  g.fillRect(0, 0, c.width, c.height);
  // Falten: alle 20 cm ein weicher Schatten, kaum sichtbar.
  const falte = 20 * pxJeCm;
  for (let x = 0; x < c.width; x += falte) {
    const v = g.createLinearGradient(x, 0, x + falte, 0);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.5, "rgba(0,0,0,0.045)");
    v.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = v;
    g.fillRect(x, 0, falte, c.height);
  }
  if (logo && k.logo) {
    const l = k.logo;
    g.drawImage(logo, l.x * pxJeCm, (hoehe - l.y - l.h) * pxJeCm, l.b * pxJeCm, l.h * pxJeCm);
  }
  return { canvas: c, laenge: k.laenge };
}

/** Länge einer Kachel der Turnhallen-Wand entlang der Wand (cm). */
export const TURNHALLE_KACHEL = 120;

/**
 * Innenseite einer Turnhalle als Textur, 120 cm breit und so hoch wie die Wand: unten Holz-Prallwand (helle Birke, senkrechte
 * Paneele mit Stoßfugen) bis 2 m, Abschlussleiste, ein schmales gedecktes Blau, darüber hell gestrichen, oben ein Lichtband.
 */
export function turnhallenWand(wandHoehe: number): THREE.CanvasTexture {
  const pxCm = 3;
  const c = document.createElement("canvas");
  c.width = TURNHALLE_KACHEL * pxCm;
  c.height = Math.round(wandHoehe * pxCm);
  const g = c.getContext("2d")!;
  const yVon = (cm: number) => c.height - cm * pxCm; // cm über dem Boden → Pixel von oben
  const band = (von: number, bis: number, farbe: string) => {
    g.fillStyle = farbe;
    g.fillRect(0, yVon(bis), c.width, (bis - von) * pxCm);
  };
  // Anstrich.
  band(0, wandHoehe, "#f6f4ee");
  // Prallwand: Paneele 20 cm breit, Ton leicht wechselnd, feine Maserung, dunklere Fugen.
  const holz = ["#dcc29a", "#d8bd93", "#dfc6a0", "#d6ba8f", "#dbc198", "#d9bf95"];
  for (let i = 0; i < TURNHALLE_KACHEL / 20; i++) {
    g.fillStyle = holz[i % holz.length]!;
    g.fillRect(i * 20 * pxCm, yVon(200), 20 * pxCm, 200 * pxCm);
    g.strokeStyle = "rgba(120,85,45,0.10)";
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const x = (i * 20 + 3 + k * 4.5) * pxCm;
      g.beginPath();
      g.moveTo(x, yVon(200));
      g.lineTo(x + ((k % 2) * 2 - 1) * 2, yVon(0));
      g.stroke();
    }
    g.fillStyle = "rgba(110,75,40,0.45)";
    g.fillRect(i * 20 * pxCm, yVon(200), 1, 200 * pxCm);
  }
  band(200, 205, "#b98d58"); // Abschlussleiste
  band(205, 220, "#46709a"); // Farbband (gedecktes Blau)
  // Lichtband unter der Decke: leicht bläulich, mit Pfosten.
  const lichtVon = Math.max(230, wandHoehe - 50), lichtBis = wandHoehe - 12;
  if (lichtBis > lichtVon) {
    band(lichtVon, lichtBis, "#dde9f2");
    g.fillStyle = "#c3cfd8";
    for (let x = 0; x < TURNHALLE_KACHEL; x += 60) g.fillRect(x * pxCm, yVon(lichtBis), 2 * pxCm, (lichtBis - lichtVon) * pxCm);
    band(lichtVon - 2, lichtVon, "#c3cfd8");
    band(lichtBis, lichtBis + 2, "#c3cfd8");
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Fläche auf der Innenseite eines Wandstücks (Meter), 0,5 cm vor der Wand; u in cm entlang der Wand, v = Höhe / Wandhöhe. */
export function innenseitenGeometrie(f: WandInnenseite, s: HallenSzene): THREE.BufferGeometry {
  const ab = 0.5;
  const ebene = f.seite === "x0" ? ab : f.seite === "x1" ? s.breite - ab : f.seite === "z0" ? ab : s.laenge - ab;
  const entlangX = f.seite === "z0" || f.seite === "z1";
  const p = (entlang: number, y: number): [number, number, number] => (entlangX ? [entlang * M, y * M, ebene * M] : [ebene * M, y * M, entlang * M]);
  const n = f.seite === "x0" ? [1, 0, 0] : f.seite === "x1" ? [-1, 0, 0] : f.seite === "z0" ? [0, 0, 1] : [0, 0, -1];
  const v0 = f.y / s.wandHoehe, v1 = (f.y + f.h) / s.wandHoehe;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...p(f.von, f.y), ...p(f.bis, f.y), ...p(f.bis, f.y + f.h), ...p(f.von, f.y + f.h)], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([f.von, v0, f.bis, v0, f.bis, v1, f.von, v1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
