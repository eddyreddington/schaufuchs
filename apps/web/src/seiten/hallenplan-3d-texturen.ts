/**
 * Texturen der 3D-Halle, aus kleinen Canvas-Bildern gerechnet (keine Bilddateien): Bodenbeläge (Mosaikparkett, Sportboden,
 * Estrich), Innenwand mit Prallwand, Fenster mit Sprossen, Holzdecke aus Profilbrettern, Basketballbrett. Jede Kachel
 * wiederholt sich; Zufall mit festem Startwert, damit die Halle bei jedem Aufbau gleich aussieht.
 */
import type { HallenBoden, VollesAussehen } from "@schau/domain";
import * as THREE from "three";

/** Zufallszahlen 0–1 mit festem Startwert (mulberry32). */
export function zufall(start: number): () => number {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leinwand(b: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = b;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function textur(c: HTMLCanvasElement, wiederholen = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wiederholen) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Farbe mit Helligkeitsfaktor (im sRGB-Wert gerechnet, wie die Farbe im Canvas steht). */
function ton(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.round(Math.min(255, v * f));
  return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`;
}

/** Feines Rauschen (Körnung) über das ganze Bild. */
function koernung(g: CanvasRenderingContext2D, b: number, h: number, zahl: number, staerke: number, r: () => number) {
  for (let i = 0; i < zahl; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${staerke * r()})` : `rgba(255,255,255,${staerke * r()})`;
    g.fillRect(r() * b, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
}

/** Kachelgröße der Bodenbeläge (cm). */
export const BODEN_KACHEL: Record<HallenBoden, number> = { parkett: 128, sportboden: 200, estrich: 300 };

/**
 * Mosaikparkett Eiche hell: Würfel aus sechs kurzen Stäben, im Wechsel quer und längs (wie in Sporthallen üblich), jeder
 * Stab leicht anders im Ton und mit feiner Maserung. 8 × 8 Würfel zu 16 cm.
 */
function parkett(): HTMLCanvasElement {
  const n = 512, zelle = n / 8, staebe = 6, s = zelle / staebe;
  const [c, g] = leinwand(n, n);
  const r = zufall(7);
  const toene = ["#dcc08f", "#d6b682", "#e0c697", "#d2b07b", "#d9bb89", "#e3cb9e", "#cfab76"];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const quer = (i + j) % 2 === 0;
      for (let k = 0; k < staebe; k++) {
        const [x, y, b, h] = quer ? [i * zelle, j * zelle + k * s, zelle, s] : [i * zelle + k * s, j * zelle, s, zelle];
        g.fillStyle = ton(toene[Math.floor(r() * toene.length)]!, 0.97 + r() * 0.06);
        g.fillRect(x, y, b, h);
        // Maserung: ein paar feine Linien entlang des Stabs.
        g.strokeStyle = `rgba(120,80,40,${0.05 + r() * 0.07})`;
        g.lineWidth = 0.7;
        for (let m = 0; m < 3; m++) {
          g.beginPath();
          if (quer) {
            const yy = y + r() * h;
            g.moveTo(x, yy);
            g.bezierCurveTo(x + b / 3, yy + (r() - 0.5) * 2, x + (2 * b) / 3, yy + (r() - 0.5) * 2, x + b, yy + (r() - 0.5));
          } else {
            const xx = x + r() * b;
            g.moveTo(xx, y);
            g.bezierCurveTo(xx + (r() - 0.5) * 2, y + h / 3, xx + (r() - 0.5) * 2, y + (2 * h) / 3, xx + (r() - 0.5), y + h);
          }
          g.stroke();
        }
        // Fuge zwischen den Stäben.
        g.fillStyle = "rgba(90,60,30,0.18)";
        if (quer) g.fillRect(x, y, b, 0.8);
        else g.fillRect(x, y, 0.8, h);
      }
      g.fillStyle = "rgba(90,60,30,0.22)";
      g.fillRect(i * zelle, j * zelle, zelle, 1);
      g.fillRect(i * zelle, j * zelle, 1, zelle);
    }
  return c;
}

/** Sportboden (Kunststoff): gedecktes Graublau, fein gesprenkelt, mit leichten Wolken. */
function sportboden(): HTMLCanvasElement {
  const n = 256;
  const [c, g] = leinwand(n, n);
  const r = zufall(11);
  g.fillStyle = "#7f9aa6";
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 40; i++) {
    const v = g.createRadialGradient(r() * n, r() * n, 0, r() * n, r() * n, 20 + r() * 50);
    v.addColorStop(0, `rgba(255,255,255,${0.03 * r()})`);
    v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v;
    g.fillRect(0, 0, n, n);
  }
  koernung(g, n, n, 3000, 0.12, r);
  return c;
}

/** Estrich: helles Betongrau, wolkig, mit Poren und einer Dehnfuge am Rand der Kachel (alle 3 m). */
function estrich(): HTMLCanvasElement {
  const n = 256;
  const [c, g] = leinwand(n, n);
  const r = zufall(13);
  g.fillStyle = "#bdb9b0";
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 60; i++) {
    const x = r() * n, y = r() * n;
    const v = g.createRadialGradient(x, y, 0, x, y, 15 + r() * 60);
    const d = r() < 0.5 ? "0,0,0" : "255,255,255";
    v.addColorStop(0, `rgba(${d},${0.05 * r()})`);
    v.addColorStop(1, `rgba(${d},0)`);
    g.fillStyle = v;
    g.fillRect(0, 0, n, n);
  }
  koernung(g, n, n, 2500, 0.18, r);
  g.fillStyle = "rgba(60,60,60,0.35)";
  g.fillRect(0, 0, n, 1);
  g.fillRect(0, 0, 1, n);
  return c;
}

/** Bodenbelag als Textur (Kachel `BODEN_KACHEL`, wiederholt). */
export function bodenTextur(art: HallenBoden): THREE.CanvasTexture {
  return textur(art === "parkett" ? parkett() : art === "sportboden" ? sportboden() : estrich());
}

/** Länge einer Kachel der Innenwand entlang der Wand (cm). */
export const WAND_KACHEL = 120;

/**
 * Innenwand als Textur, 1,20 m breit und so hoch wie die Wand: unten die Prallwand (helles Holz in senkrechten Paneelen
 * oder die gewählte Farbe in Paneelen mit feinen Fugen) mit einer Abschlussleiste, darüber weiß gestrichen. Ohne
 * Prallwand eine schmale Sockelleiste.
 */
export function wandTextur(a: Pick<VollesAussehen, "wandHoehe" | "prallwand" | "prallwandHoehe">): THREE.CanvasTexture {
  const pxCm = Math.min(3, 1024 / a.wandHoehe);
  const [c, g] = leinwand(WAND_KACHEL * pxCm, Math.round(a.wandHoehe * pxCm));
  const r = zufall(17);
  const y = (cm: number) => c.height - cm * pxCm;
  g.fillStyle = "#f3f1ec";
  g.fillRect(0, 0, c.width, c.height);
  koernung(g, c.width, c.height, 1200, 0.04, r);
  const ph = a.prallwandHoehe;
  if (ph <= 0) {
    g.fillStyle = "#9a9790";
    g.fillRect(0, y(8), c.width, 8 * pxCm);
  } else if (a.prallwand === "holz") {
    const holz = ["#dcc29a", "#d8bd93", "#dfc6a0", "#d6ba8f", "#dbc198", "#d9bf95"];
    for (let i = 0; i < WAND_KACHEL / 20; i++) {
      g.fillStyle = holz[i % holz.length]!;
      g.fillRect(i * 20 * pxCm, y(ph), 20 * pxCm, ph * pxCm);
      g.strokeStyle = "rgba(120,85,45,0.10)";
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const x = (i * 20 + 3 + k * 4.5) * pxCm;
        g.beginPath();
        g.moveTo(x, y(ph));
        g.lineTo(x + ((k % 2) * 2 - 1) * 2, y(0));
        g.stroke();
      }
      g.fillStyle = "rgba(110,75,40,0.45)";
      g.fillRect(i * 20 * pxCm, y(ph), 1, ph * pxCm);
    }
  } else {
    // Farbige Prallwand: zwei Paneele je Kachel, kaum sichtbar im Ton verschieden, feine Fugen, filzartig gekörnt.
    for (let i = 0; i < 2; i++) {
      g.fillStyle = ton(a.prallwand, 0.98 + i * 0.03);
      g.fillRect(i * 60 * pxCm, y(ph), 60 * pxCm, ph * pxCm);
    }
    g.save();
    g.beginPath();
    g.rect(0, y(ph), c.width, ph * pxCm);
    g.clip();
    koernung(g, c.width, c.height, 2500, 0.08, r);
    g.restore();
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(0, y(ph), 1, ph * pxCm);
    g.fillRect(60 * pxCm, y(ph), 1, ph * pxCm);
    if (ph > 160) g.fillRect(0, y(Math.round(ph * 0.55)), c.width, 1);
  }
  if (ph > 0) {
    g.fillStyle = a.prallwand === "holz" ? "#b98d58" : ton(a.prallwand, 0.75);
    g.fillRect(0, y(ph + 3), c.width, 3 * pxCm);
  }
  const t = textur(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Fensterflügel (cm): ein Flügel der Textur ist etwa so breit. */
export const FLUEGEL = 110;

/** Ein Fensterflügel: dunkler Rahmen, Kämpfer im oberen Drittel, helles, leicht bläuliches Glas mit Schimmer. */
export function fensterTextur(): THREE.CanvasTexture {
  const [c, g] = leinwand(128, 256);
  const glas = g.createLinearGradient(0, 0, 128, 256);
  glas.addColorStop(0, "#eef5fb");
  glas.addColorStop(0.45, "#cfe0ee");
  glas.addColorStop(0.55, "#dde9f3");
  glas.addColorStop(1, "#b8cddf");
  g.fillStyle = glas;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.moveTo(20, 256);
  g.lineTo(70, 0);
  g.lineTo(95, 0);
  g.lineTo(45, 256);
  g.fill();
  g.fillStyle = "#2c3238";
  g.fillRect(0, 0, 128, 7);
  g.fillRect(0, 249, 128, 7);
  g.fillRect(0, 0, 6, 256);
  g.fillRect(122, 0, 6, 256);
  g.fillRect(0, 88, 128, 6);
  return textur(c, false);
}

/** Holzdecke aus Profilbrettern (10 cm breit, mit Nut), warmes Holz; Kachel 1 × 1 m, Bretter entlang v. */
export function deckenTextur(): THREE.CanvasTexture {
  const [c, g] = leinwand(256, 256);
  const r = zufall(23);
  const brett = 256 / 10;
  for (let i = 0; i < 10; i++) {
    g.fillStyle = ton("#c4925f", 0.92 + r() * 0.16);
    g.fillRect(i * brett, 0, brett, 256);
    g.strokeStyle = `rgba(90,50,20,${0.08 + r() * 0.08})`;
    for (let m = 0; m < 4; m++) {
      const x = i * brett + 3 + r() * (brett - 6);
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 4, 85, x + (r() - 0.5) * 4, 170, x, 256);
      g.stroke();
    }
    g.fillStyle = "rgba(60,30,10,0.45)";
    g.fillRect(i * brett, 0, 1.5, 256);
  }
  return textur(c);
}

/** Basketballbrett: weiß, schwarzer Rand, kleines Zielfeld über dem Ring. */
export function brettTextur(): THREE.CanvasTexture {
  const [c, g] = leinwand(180, 105);
  g.fillStyle = "#fbfbf8";
  g.fillRect(0, 0, 180, 105);
  g.strokeStyle = "#202020";
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, 175, 100);
  g.lineWidth = 4;
  g.strokeRect(61, 46, 58, 45);
  return textur(c, false);
}
