/**
 * Bewegung der Kamera in der 3D-Ansicht über das Ziehen mit Maus oder Finger hinaus: weiches Auslaufen, Zoom zum
 * Mauszeiger, per Doppelklick sanft hinfliegen, Gehen, Drehen und Zoomen per Taste oder Steuerkreuz (gleichmäßig, solange
 * gedrückt) und der automatische Rundgang durch die Gänge (Wegpunkte aus der Fachlogik, `HallenSzene.rundgang`). Jede
 * eigene Bewegung hält den Rundgang an. Der Rundgang fährt die Punkte gerade von Punkt zu Punkt ab (die Fachlogik rundet die
 * Ecken und prüft jede Strecke gegen die Hinderniskarte); der Blick dreht gemächlich, an Ecken geht es langsamer. Im Gang
 * gleitet man beim Gehen an Käfigen und Wänden entlang statt hindurch (`gleite`).
 *
 * Zwei Arten zu schauen: Steht die Kamera in Augenhöhe (unter `GANG_HOEHE`), ist man „im Gang“ – Drehen sieht sich auf der
 * Stelle um, Gehen in Schritttempo, Doppelklick bringt einen in Augenhöhe dorthin. Von weiter oben kreist die Ansicht um
 * den Blickpunkt, Gehen und Hinfliegen richten sich nach dem Abstand.
 */
import { gleite, type Hinderniskarte, type RundgangPunkt, wegZwischen } from "@schau/domain";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const M = 0.01; // cm → m
/** Schritttempo des Rundgangs (m/s) – gemütliches Gehen. */
const TEMPO = 1.1;
/** Gehtempo per Taste im Gang (m/s). */
const GEHEN = 1.5;
/** Drehen per Taste (rad/s) und Zoomen (Faktor je Sekunde als Exponent). */
const DREH = 1.4;
const ZOOM = 1.2;
/** Umschalt: schneller. */
const SCHNELL = 3;
/** Bis zu dieser Kamerahöhe (m) gilt „im Gang“ (Augenhöhe 1,65 m; der Rundgang bleibt in Augenhöhe). */
const GANG_HOEHE = 3.2;
/** Anflug zum Rundgang von oben: mindestens so hoch (m) – über allen Käfigen und Volieren –, dann senkrecht hinab. */
const UEBER_REIHEN = 3.5;
/** Drehen des Blicks im Rundgang (rad/s) und wie weit voraus (m) die Gehrichtung gilt. */
const RUNDGANG_DREH = 0.9;
const RICHTUNG_VORAUS = 1;
/** Im Käfiggang mit Fronten nur auf einer Seite neigt sich der Blick so stark zu ihnen (Anteil zur Gehrichtung, rund 20°). */
const NEIGUNG = 0.4;
/** Der Blick im Rundgang: so weit voraus (m) und so tief unter Augenhöhe (m). */
const VORAUS = 2.5;
const SENKUNG = 0.35;
const OBEN = new THREE.Vector3(0, 1, 0);

export type Richtung = "vor" | "zurueck" | "links" | "rechts" | "dreheLinks" | "dreheRechts" | "naeher" | "weiter";

/** Tasten der 3D-Ansicht nach `KeyboardEvent.key` (klein geschrieben); Umschalt zusätzlich für schneller. */
export const TASTE: Record<string, Richtung> = {
  arrowup: "vor",
  w: "vor",
  arrowdown: "zurueck",
  s: "zurueck",
  arrowleft: "links",
  a: "links",
  arrowright: "rechts",
  d: "rechts",
  q: "dreheLinks",
  e: "dreheRechts",
  "+": "naeher",
  "=": "naeher",
  "-": "weiter",
};

export interface Bewegung {
  /** Je Bild aufrufen (dt in Sekunden); true, solange sich noch etwas bewegt. */
  schritt: (dt: number) => boolean;
  /** Führt gerade der Rundgang die Kamera? Dann darf OrbitControls sie nicht nachführen. */
  imRundgang: () => boolean;
  /** Richtung gedrückt oder losgelassen (Taste, Steuerkreuz). */
  halten: (r: Richtung, an: boolean) => void;
  schnell: (an: boolean) => void;
  /** Alles loslassen (Fenster verliert den Fokus, Systemtaste). */
  loslassen: () => void;
  /** Rundgang starten oder beenden. */
  rundgang: (an: boolean) => void;
  rundgangMoeglich: boolean;
  /** Laufende Fahrt (Rundgang, Hinfliegen) beenden. */
  anhalten: () => void;
  /** Rest-Schwung der Maus verwerfen, bevor die Kamera neu gesetzt wird (Ansicht wählen). */
  beruhigen: () => void;
  entsorgen: () => void;
}

interface Flug {
  vonPos: THREE.Vector3;
  vonZiel: THREE.Vector3;
  nachPos: THREE.Vector3;
  nachZiel: THREE.Vector3;
  t: number;
  dauer: number;
  /** Danach (Rundgang beginnt nach dem Hinfliegen zum Start). */
  dann?: () => void;
}

export function bewegungFuer(o: {
  kamera: THREE.PerspectiveCamera;
  steuerung: OrbitControls;
  dom: HTMLElement;
  /** Hallenboden – Ziel eines Doppelklicks. */
  boden: THREE.Object3D;
  /** Was davor liegen kann (Käfige, Volieren, sichtbare Wände): ein Doppelklick darauf fliegt nicht. */
  hindernisse: () => THREE.Object3D[];
  punkte: RundgangPunkt[];
  /** Hinderniskarte der Szene (cm): Gehen im Gang und der Weg zum Anfang des Rundgangs bleiben frei. */
  karte: Hinderniskarte | null;
  zeichne: () => void;
  /** Meldet Start und Ende des Rundgangs (auch wenn er von selbst endet). */
  beiRundgang: (laeuft: boolean) => void;
}): Bewegung {
  const { kamera, steuerung, dom } = o;
  steuerung.enableDamping = true;
  steuerung.dampingFactor = 0.12;
  steuerung.zoomToCursor = true;

  let flug: Flug | null = null;
  const rundgangPunkte = o.punkte.map((p) => new THREE.Vector3(p.x * M, p.y * M, p.z * M));
  const rundgangZu = o.punkte.map((p) => p.zu ?? null);
  let bahn = bahnAus(rundgangPunkte, rundgangZu);
  const moeglich = bahn.laenge > 0.01;
  let weg: number | null = null; // zurückgelegt (m), solange der Rundgang läuft
  let blick = 0; // Blickrichtung im Rundgang (Winkel um die Hochachse)
  let laeuft = false; // Rundgang gemeldet (auch während des Hinflugs zum Start)
  const gedrueckt = new Set<Richtung>();
  let flink = false;

  const imGang = () => kamera.position.y < GANG_HOEHE;
  const beruhigen = () => {
    steuerung.enableDamping = false;
    steuerung.update();
    steuerung.enableDamping = true;
  };
  const anhalten = () => {
    flug = null;
    weg = null;
    if (laeuft) {
      laeuft = false;
      o.beiRundgang(false);
    }
  };
  // Eigene Bewegung mit Maus, Finger oder Rad übernimmt sofort (OrbitControls bleibt dabei an und bewegt gleich mit).
  const uebernehmen = () => anhalten();
  dom.addEventListener("pointerdown", uebernehmen);
  dom.addEventListener("wheel", uebernehmen, { passive: true });

  // Doppelklick auf den Hallenboden: im Gang in Augenhöhe dorthin (Blickrichtung bleibt), sonst halb so weit weg darüber.
  const strahl = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const doppelklick = (e: MouseEvent) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(ndc, kamera);
    const h = strahl.intersectObjects([o.boden, ...o.hindernisse()], false)[0];
    if (!h || h.object !== o.boden) return;
    anhalten();
    const vonPos = kamera.position.clone(), vonZiel = steuerung.target.clone();
    if (imGang()) {
      const nachPos = new THREE.Vector3(h.point.x, vonPos.y, h.point.z);
      flug = { vonPos, vonZiel, nachPos, nachZiel: nachPos.clone().add(vonZiel.clone().sub(vonPos)), t: 0, dauer: 0.7 };
    } else {
      const abstand = vonPos.clone().sub(vonZiel).multiplyScalar(0.5);
      if (abstand.length() < 2) abstand.setLength(2);
      flug = { vonPos, vonZiel, nachPos: h.point.clone().add(abstand), nachZiel: h.point.clone(), t: 0, dauer: 0.7 };
    }
    o.zeichne();
  };
  dom.addEventListener("dblclick", doppelklick);

  const weich = (t: number) => t * t * (3 - 2 * t);
  const v = new THREE.Vector3(), seit = new THREE.Vector3();

  /** Kamera auf den Rundgang nach `m` Metern setzen, Blick in Richtung `winkel` (2,5 m voraus, leicht gesenkt). */
  const stelleAufWeg = (m: number, winkel: number, pos: THREE.Vector3, ziel: THREE.Vector3) => {
    bahnPunkt(bahn, m, pos);
    ziel.set(pos.x + Math.sin(winkel) * VORAUS, pos.y - SENKUNG, pos.z + Math.cos(winkel) * VORAUS);
  };
  /** Ein Schritt im Rundgang: Blick dreht höchstens `RUNDGANG_DREH` zur Gehrichtung, je größer die Drehung, desto langsamer. */
  const rundgangSchritt = (dt: number) => {
    const soll = blickWinkel(bahn, weg! + RICHTUNG_VORAUS);
    const rest = Math.atan2(Math.sin(soll - blick), Math.cos(soll - blick));
    blick += Math.max(-RUNDGANG_DREH * dt, Math.min(RUNDGANG_DREH * dt, rest));
    weg = Math.min(bahn.laenge, weg! + TEMPO * dt * Math.max(0, 1 - Math.abs(rest) / (Math.PI / 2)));
    stelleAufWeg(weg, blick, kamera.position, steuerung.target);
    kamera.lookAt(steuerung.target);
    if (weg >= bahn.laenge) anhalten();
  };
  const blickVonKamera = () => Math.atan2(steuerung.target.x - kamera.position.x, steuerung.target.z - kamera.position.z);

  /** Gedrückte Richtungen für dt Sekunden anwenden. */
  const tasten = (dt: number) => {
    const f = flink ? SCHNELL : 1;
    const gang = imGang();
    const abstand = kamera.position.distanceTo(steuerung.target);
    // Im Gang Schritttempo, von oben wächst das Tempo mit dem Abstand.
    const tempo = (gang ? GEHEN : Math.max(2, abstand * 0.6)) * f * dt;
    const vor = (gedrueckt.has("vor") ? 1 : 0) - (gedrueckt.has("zurueck") ? 1 : 0);
    const quer = (gedrueckt.has("rechts") ? 1 : 0) - (gedrueckt.has("links") ? 1 : 0);
    if (vor || quer) {
      v.subVectors(steuerung.target, kamera.position).setY(0);
      if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
      v.normalize();
      seit.crossVectors(v, OBEN).normalize();
      const d = v.multiplyScalar(vor * tempo).add(seit.multiplyScalar(quer * tempo));
      if (gang && o.karte) {
        // Im Gang nicht durch Käfige und Wände: an ihnen entlang gleiten.
        const von = { x: kamera.position.x / M, z: kamera.position.z / M };
        const nach = gleite(o.karte, von, { x: von.x + d.x / M, z: von.z + d.z / M });
        d.set((nach.x - von.x) * M, 0, (nach.z - von.z) * M);
      }
      kamera.position.add(d);
      steuerung.target.add(d);
    }
    const dreh = (gedrueckt.has("dreheLinks") ? 1 : 0) - (gedrueckt.has("dreheRechts") ? 1 : 0);
    if (dreh) {
      const winkel = dreh * DREH * f * dt;
      if (gang) {
        // Im Gang: auf der Stelle umsehen (sonst schwenkte die Kamera um den Blickpunkt in die Käfige).
        v.subVectors(steuerung.target, kamera.position).applyAxisAngle(OBEN, winkel);
        steuerung.target.copy(kamera.position).add(v);
      } else {
        // Von oben: um den Blickpunkt kreisen, wie Ziehen mit der Maus.
        v.subVectors(kamera.position, steuerung.target).applyAxisAngle(OBEN, winkel);
        kamera.position.copy(steuerung.target).add(v);
      }
    }
    const zoom = (gedrueckt.has("weiter") ? 1 : 0) - (gedrueckt.has("naeher") ? 1 : 0);
    if (zoom) {
      v.subVectors(kamera.position, steuerung.target);
      v.setLength(Math.min(steuerung.maxDistance, Math.max(steuerung.minDistance, abstand * Math.exp(zoom * ZOOM * f * dt))));
      kamera.position.copy(steuerung.target).add(v);
    }
  };

  return {
    rundgangMoeglich: moeglich,
    imRundgang: () => weg != null,
    schritt: (dt) => {
      if (gedrueckt.size) {
        tasten(dt);
        return true;
      }
      if (flug) {
        flug.t = Math.min(1, flug.t + dt / flug.dauer);
        const w = weich(flug.t);
        kamera.position.lerpVectors(flug.vonPos, flug.nachPos, w);
        steuerung.target.lerpVectors(flug.vonZiel, flug.nachZiel, w);
        if (flug.t >= 1) {
          const dann = flug.dann;
          flug = null;
          dann?.();
        }
        return true;
      }
      if (weg != null) {
        rundgangSchritt(dt);
        return true;
      }
      return false;
    },
    halten: (r, an) => {
      if (an) {
        anhalten();
        gedrueckt.add(r);
        o.zeichne();
      } else gedrueckt.delete(r);
    },
    schnell: (an) => {
      flink = an;
    },
    loslassen: () => {
      gedrueckt.clear();
      flink = false;
    },
    rundgang: (an) => {
      if (!an || !moeglich) return anhalten();
      gedrueckt.clear();
      beruhigen();
      laeuft = true;
      o.beiRundgang(true);
      bahn = bahnAus(rundgangPunkte, rundgangZu);
      const start = rundgangPunkte[0]!;
      const los = (winkel: number) => () => {
        blick = winkel;
        weg = 0;
      };
      // Steht man im Gang: zu Fuß auf freiem Weg zum Anfang (Blick dreht unterwegs mit).
      const zuFuss = imGang() && o.karte ? wegZwischen(o.karte, { x: kamera.position.x / M, z: kamera.position.z / M }, { x: start.x / M, z: start.z / M }) : null;
      if (zuFuss) {
        bahn = bahnAus([...zuFuss.map((p) => new THREE.Vector3(p.x * M, start.y, p.z * M)), ...rundgangPunkte.slice(1)], [...zuFuss.map(() => null), ...rundgangZu.slice(1)]);
        const winkel = blickVonKamera(), nachPos = new THREE.Vector3(), nachZiel = new THREE.Vector3();
        stelleAufWeg(0, winkel, nachPos, nachZiel);
        flug = { vonPos: kamera.position.clone(), vonZiel: steuerung.target.clone(), nachPos, nachZiel, t: 0, dauer: 0.4, dann: los(winkel) };
        return o.zeichne();
      }
      // Sonst von oben: hinauf über die Reihen, waagrecht über den Anfang, senkrecht hinab – nie durch Käfige.
      const winkel = bahnWinkel(bahn, RICHTUNG_VORAUS), hoch = Math.max(kamera.position.y, UEBER_REIHEN);
      const oben = new THREE.Vector3(kamera.position.x, hoch, kamera.position.z), ueber = new THREE.Vector3(start.x, hoch, start.z);
      const boden = new THREE.Vector3(start.x + Math.sin(winkel), 0, start.z + Math.cos(winkel));
      const nachPos = new THREE.Vector3(), nachZiel = new THREE.Vector3();
      stelleAufWeg(0, winkel, nachPos, nachZiel);
      const hinab: Flug = { vonPos: ueber, vonZiel: boden, nachPos, nachZiel, t: 0, dauer: Math.min(2.5, 0.6 + (hoch - nachPos.y) / 6), dann: los(winkel) };
      const hinueber: Flug = { vonPos: oben, vonZiel: steuerung.target.clone().add(oben).sub(kamera.position), nachPos: ueber, nachZiel: boden, t: 0, dauer: Math.min(2.5, 0.5 + oben.distanceTo(ueber) / 20), dann: () => (flug = hinab) };
      const hinauf: Flug = { vonPos: kamera.position.clone(), vonZiel: steuerung.target.clone(), nachPos: oben, nachZiel: hinueber.vonZiel.clone(), t: 0, dauer: Math.max(0.01, (hoch - kamera.position.y) / 2.5), dann: () => (flug = hinueber) };
      flug = hoch > kamera.position.y + 0.01 ? hinauf : hinueber;
      o.zeichne();
    },
    anhalten,
    beruhigen,
    entsorgen: () => {
      dom.removeEventListener("pointerdown", uebernehmen);
      dom.removeEventListener("wheel", uebernehmen);
      dom.removeEventListener("dblclick", doppelklick);
    },
  };
}

/** Strecken des Rundgangs (m) mit der Weglänge bis zu jedem Punkt. */
interface Bahn {
  punkte: THREE.Vector3[];
  bis: number[];
  laenge: number;
  /** Je Punkt: Richtung zu den Fronten (nur im Käfiggang mit Fronten auf einer Seite). */
  zu: (RundgangPunkt["zu"] | null)[];
}

function bahnAus(punkte: THREE.Vector3[], zu: Bahn["zu"] = []): Bahn {
  const bis = [0];
  for (let i = 1; i < punkte.length; i++) bis.push(bis[i - 1]! + punkte[i]!.distanceTo(punkte[i - 1]!));
  return { punkte, bis, laenge: bis.at(-1) ?? 0, zu };
}

/** Strecke, in der die Weglänge m liegt (Index des Anfangs). */
function streckeBei(b: Bahn, m: number): number {
  let lo = 0, hi = b.punkte.length - 1;
  while (hi - lo > 1) {
    const mitte = (lo + hi) >> 1;
    if (b.bis[mitte]! <= m) lo = mitte;
    else hi = mitte;
  }
  return lo;
}

/** Punkt nach m Metern, gerade zwischen den Wegpunkten (nie eine Kurve, die eine Ecke abschneidet). */
function bahnPunkt(b: Bahn, m: number, ziel: THREE.Vector3): THREE.Vector3 {
  if (b.punkte.length < 2) return ziel.copy(b.punkte[0] ?? ziel);
  const i = streckeBei(b, Math.max(0, Math.min(b.laenge, m)));
  const l = b.bis[i + 1]! - b.bis[i]!;
  return ziel.lerpVectors(b.punkte[i]!, b.punkte[i + 1]!, l > 0 ? Math.min(1, (Math.min(b.laenge, m) - b.bis[i]!) / l) : 0);
}

/** Gehrichtung nach m Metern als Winkel um die Hochachse (0: entlang +z). */
function bahnWinkel(b: Bahn, m: number): number {
  if (b.punkte.length < 2) return 0;
  const i = streckeBei(b, Math.max(0, Math.min(b.laenge - 1e-6, m)));
  const a = b.punkte[i]!, e = b.punkte[i + 1]!;
  return Math.atan2(e.x - a.x, e.z - a.z);
}

/** Blickrichtung nach m Metern: in Gehrichtung, im Käfiggang mit Fronten auf einer Seite leicht zu ihnen. */
function blickWinkel(b: Bahn, m: number): number {
  const w = bahnWinkel(b, m), zu = b.zu[streckeBei(b, Math.max(0, Math.min(b.laenge - 1e-6, m)))];
  return zu ? Math.atan2(Math.sin(w) + NEIGUNG * zu.x, Math.cos(w) + NEIGUNG * zu.z) : w;
}
