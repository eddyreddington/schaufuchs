/**
 * Bewegung der Kamera in der 3D-Ansicht über das Ziehen mit Maus oder Finger hinaus: weiches Auslaufen, Zoom zum
 * Mauszeiger, per Doppelklick sanft hinfliegen, Gehen, Drehen und Zoomen per Taste oder Steuerkreuz (gleichmäßig, solange
 * gedrückt) und der automatische Rundgang durch die Gänge (Wegpunkte aus der Fachlogik, `HallenSzene.rundgang`). Jede
 * eigene Bewegung hält den Rundgang an.
 *
 * Zwei Arten zu schauen: Steht die Kamera in Augenhöhe (unter `GANG_HOEHE`), ist man „im Gang“ – Drehen sieht sich auf der
 * Stelle um, Gehen in Schritttempo, Doppelklick bringt einen in Augenhöhe dorthin. Von weiter oben kreist die Ansicht um
 * den Blickpunkt, Gehen und Hinfliegen richten sich nach dem Abstand.
 */
import type { RundgangPunkt } from "@schau/domain";
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
/** Bis zu dieser Kamerahöhe (m) gilt „im Gang“ (Augenhöhe 1,65 m, im Rundgang über Reihenenden 3 m). */
const GANG_HOEHE = 3.2;
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
  zeichne: () => void;
  /** Meldet Start und Ende des Rundgangs (auch wenn er von selbst endet). */
  beiRundgang: (laeuft: boolean) => void;
}): Bewegung {
  const { kamera, steuerung, dom } = o;
  steuerung.enableDamping = true;
  steuerung.dampingFactor = 0.12;
  steuerung.zoomToCursor = true;

  let flug: Flug | null = null;
  // Rechtwinklige Kehren am Reihenende: "chordal" schwingt am wenigsten über die Wegpunkte hinaus (nicht in die Wand).
  const roh = o.punkte.length >= 2 ? new THREE.CatmullRomCurve3(o.punkte.map((p) => new THREE.Vector3(p.x * M, p.y * M, p.z * M)), false, "chordal") : null;
  const laenge = roh ? roh.getLength() : 0;
  const kurve = laenge > 0.01 ? roh : null;
  let weg: number | null = null; // zurückgelegt (m), solange der Rundgang läuft
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

  /** Punkt auf dem Rundgang nach `m` Metern; über das Ende hinaus geradeaus weiter (Blick am Schluss). */
  const aufWeg = (m: number, ziel: THREE.Vector3) => {
    if (m <= laenge) return kurve!.getPointAt(Math.max(0, m / laenge), ziel);
    kurve!.getPointAt(1, ziel);
    return ziel.add(kurve!.getTangentAt(1, v).multiplyScalar(m - laenge));
  };
  /** Kamera auf den Rundgang nach `m` Metern setzen (Ziel 2,5 m voraus, leicht gesenkt). */
  const stelleAufWeg = (m: number, pos: THREE.Vector3, ziel: THREE.Vector3) => {
    aufWeg(m, pos);
    aufWeg(m + VORAUS, ziel);
    ziel.y = pos.y - SENKUNG;
  };

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
    rundgangMoeglich: !!kurve,
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
      if (weg != null && kurve) {
        weg = Math.min(laenge, weg + TEMPO * dt);
        stelleAufWeg(weg, kamera.position, steuerung.target);
        kamera.lookAt(steuerung.target);
        if (weg >= laenge) anhalten();
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
      if (!an || !kurve) return anhalten();
      gedrueckt.clear();
      beruhigen();
      laeuft = true;
      o.beiRundgang(true);
      // Erst sanft an den Anfang, dann gehen – kein Sprung, wenn man gerade von oben schaut.
      const nachPos = new THREE.Vector3(), nachZiel = new THREE.Vector3();
      stelleAufWeg(0, nachPos, nachZiel);
      const dauer = Math.min(2, 0.6 + kamera.position.distanceTo(nachPos) / 25);
      flug = { vonPos: kamera.position.clone(), vonZiel: steuerung.target.clone(), nachPos, nachZiel, t: 0, dauer, dann: () => (weg = 0) };
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
