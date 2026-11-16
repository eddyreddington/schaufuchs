/**
 * Die 3D-Szene der Halle: Licht, Landschaft, Boden, Wände, Käfige, Tiere, Volieren, Möbel, Beschriftungen, Kamera und
 * Steuerung. Gezeichnet wird nur bei Bedarf (Bewegung, Zeigen), nicht in Dauerschleife. Maßstab Meter (Fachlogik in cm).
 */
import { punktInUmriss, type Verkleidung, type SzeneSchuerze, richterFarbe, wandDeckkraft, wandInnenseiten, type Quader, type Blick, type Figur, type HallenSzene, type SzeneKaefig, type SzeneTier } from "@schau/domain";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ot } from "../sprache-jetzt";
import { figurTeile, gitterTextur, hell, innenseitenGeometrie, ladeBild, offenerKasten, schildSprite, schuerzenGeometrie, stoffKachel, type Teil, TURNHALLE_KACHEL, turnhallenWand, wackel } from "./hallenplan-3d-bausteine";
import { baueLandschaft, type HallenSeite } from "./hallenplan-3d-landschaft";
import { type Bewegung, bewegungFuer } from "./hallenplan-3d-steuerung";

const M = 0.01; // cm → m

export type Ansicht = "rundum" | "oben" | "gang";

export type Treffer = { art: "kaefig"; kaefig: SzeneKaefig } | { art: "voliere"; name: string; tier: SzeneTier | null };

export interface Welt {
  renderer: THREE.WebGLRenderer;
  ansicht: (a: Ansicht) => void;
  /** Tasten, Steuerkreuz, Doppelklick, Rundgang (hallenplan-3d-steuerung.ts). */
  bewegung: Bewegung;
  treffer: (e: PointerEvent) => Treffer | null;
  herunterladen: () => Promise<void>;
  entsorgen: () => void;
}

/** Drehung um die Hochachse, damit die Vorderseite (lokal +z) in Blickrichtung zeigt. */
const DREHUNG: Record<Blick, number> = { "z+": 0, "x+": Math.PI / 2, "z-": Math.PI, "x-": -Math.PI / 2 };

/** Seite mit den meisten Eingängen (Notausgänge zählen nicht): dort liegt der Parkplatz. Ohne Eingang: die Längsseite unten. */
function vorneSeite(s: HallenSzene): HallenSeite {
  const zahl: Record<HallenSeite, number> = { x0: 0, x1: 0, z0: 0, z1: 0 };
  for (const t of s.tueren) {
    if (t.notausgang) continue;
    const cx = t.q.x + t.q.b / 2, cz = t.q.z + t.q.t / 2;
    const abstand: [HallenSeite, number][] = [["x0", cx], ["x1", s.breite - cx], ["z0", cz], ["z1", s.laenge - cz]];
    zahl[abstand.sort((a, b) => a[1] - b[1])[0]![0]]++;
  }
  const beste = (Object.entries(zahl) as [HallenSeite, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return beste[1] > 0 ? beste[0] : "z1";
}

export function baueWelt(
  kasten: HTMLDivElement,
  s: HallenSzene,
  richterIndex: Map<number, number>,
  schauId: number,
  verkleidung: Verkleidung,
  /** Meldet Start und Ende des Rundgangs an die Seite (Knopf). */
  beiRundgang: (laeuft: boolean) => void,
): Welt {
  let entsorgt = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  kasten.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", ot().halleBild.dreiD.raeumlich);

  const scene = new THREE.Scene();
  /** Was ins 3D-Modell kommt (ohne Beschriftungen). */
  const modell = new THREE.Group();
  modell.name = "Halle"; // bleibt deutsch (Name im 3D-Modell, wie Dateien und Drucke)
  scene.add(modell);
  const zuEntsorgen: { dispose: () => void }[] = [];
  const merk = <T extends { dispose: () => void }>(x: T): T => {
    zuEntsorgen.push(x);
    return x;
  };

  const B = s.breite * M, L = s.laenge * M;
  const groesse = Math.max(B, L);
  const mitte = new THREE.Vector3(B / 2, 0, L / 2);

  // Licht: Himmel (leicht blau) und Wiese, dazu eine warme Sonne mit Schatten über der Halle.
  scene.add(new THREE.HemisphereLight("#e4efff", "#a7b48c", 1.55));
  const sonne = new THREE.DirectionalLight("#fff1dc", 1.75);
  sonne.position.set(mitte.x - groesse * 0.4, groesse * 0.9, mitte.z - groesse * 0.3);
  sonne.target.position.copy(mitte);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(2048, 2048);
  const sc = sonne.shadow.camera;
  sc.left = -groesse * 0.8;
  sc.right = groesse * 0.8;
  sc.top = groesse * 0.8;
  sc.bottom = -groesse * 0.8;
  sc.far = groesse * 3;
  sonne.shadow.bias = -0.0005;
  scene.add(sonne, sonne.target);

  // Außen: Himmel, Wiese, Hof, Bäume und Hügel (hallenplan-3d-landschaft.ts); innen der Hallenboden mit Meterraster.
  baueLandschaft(scene, B, L, merk, vorneSeite(s));
  // Hallenboden: das Rechteck oder der freie Grundriss (Entscheidung 019); das Meterraster nur innerhalb.
  const bodenStoff = merk(new THREE.MeshStandardMaterial({ color: "#ecdcbc" }));
  let boden: THREE.Mesh;
  if (s.umriss) {
    const form = new THREE.Shape(s.umriss.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
    boden = new THREE.Mesh(merk(new THREE.ShapeGeometry(form)), bodenStoff);
    boden.rotation.x = -Math.PI / 2;
  } else {
    boden = new THREE.Mesh(merk(new THREE.PlaneGeometry(B, L)), bodenStoff);
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(B / 2, 0, L / 2);
  }
  boden.receiveShadow = true;
  modell.add(boden);
  const drin = (x: number, z: number) => !s.umriss || punktInUmriss({ x: x / M, y: z / M }, s.umriss);
  const raster: number[] = [];
  for (let x = 1; x < B; x++) for (let z = 0; z < L; z++) if (drin(x, z + 0.5)) raster.push(x, 0.002, z, x, 0.002, Math.min(L, z + 1));
  for (let z = 1; z < L; z++) for (let x = 0; x < B; x++) if (drin(x + 0.5, z)) raster.push(x, 0.002, z, Math.min(B, x + 1), 0.002, z);
  const rasterGeo = merk(new THREE.BufferGeometry());
  rasterGeo.setAttribute("position", new THREE.Float32BufferAttribute(raster, 3));
  scene.add(new THREE.LineSegments(rasterGeo, merk(new THREE.LineBasicMaterial({ color: "#dccaa5" }))));

  // Flächen am Boden: freier Bereich, Volierenbereich, Eingang.
  const flaechenFarbe = { sperre: "#cfd4dc", volieren: "#d6e8dc", eingang: "#ffffff" } as const;
  for (const f of s.flaechen) {
    const m = new THREE.Mesh(merk(new THREE.PlaneGeometry(f.q.b * M, f.q.h * M)), merk(new THREE.MeshStandardMaterial({ color: flaechenFarbe[f.art] })));
    m.rotation.x = -Math.PI / 2;
    m.position.set((f.q.x + f.q.b / 2) * M, 0.004, (f.q.y + f.q.h / 2) * M);
    m.receiveShadow = true;
    modell.add(m);
  }

  // Wände (mit Türöffnungen) und Schilder über den Notausgängen.
  // Wände warmweiß (auch im Dunkelmodus – die Halle ist ein Raum), innen ein feiner grauer Sockel gegen den Boden.
  // Leichtes Eigenleuchten: auch die Wände im Schatten wirken weiß statt grau.
  const wandStoff = merk(new THREE.MeshStandardMaterial({ color: "#f8f5ef", emissive: "#5e5a52", roughness: 0.9 }));
  const einheitsWuerfel = merk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const kiste = (q: { x: number; y: number; z: number; b: number; t: number; h: number }, stoff: THREE.Material) => {
    const k = new THREE.Mesh(einheitsWuerfel, stoff);
    k.scale.set(q.b * M, q.h * M, q.t * M);
    k.position.set((q.x + q.b / 2) * M, q.y * M, (q.z + q.t / 2) * M);
    return k;
  };
  // Jede Wand mit eigenem Stoff: Wände, die zwischen Kamera und Halle stehen, blenden sich weich aus (siehe `wandDeckkraft`).
  const wandTeile: { w: Quader; mesh: THREE.Mesh; stoff: THREE.MeshStandardMaterial; deck: number; mit: THREE.Material[] }[] = [];
  for (const w of s.waende) {
    const stoff = merk(wandStoff.clone());
    const k = kiste(w, stoff);
    k.castShadow = true;
    k.receiveShadow = true;
    modell.add(k);
    wandTeile.push({ w, mesh: k, stoff, deck: -1, mit: [] as THREE.Material[] });
  }
  // Innenseite wie in einer Turnhalle: Holz-Prallwand bis 2 m, Abschlussleiste, schmales Farbband, darüber hell gestrichen,
  // oben ein Lichtband. Eine kleine Textur (Canvas), entlang der Wand wiederholt; leichtes Eigenleuchten aus derselben
  // Textur, damit die Wand auch im Schatten hell bleibt. Je Wandstück ein eigener Stoff (blendet mit der Wand aus).
  const innenTex = merk(turnhallenWand(s.wandHoehe));
  innenTex.wrapS = THREE.RepeatWrapping;
  innenTex.repeat.set(1 / TURNHALLE_KACHEL, 1);
  const innenStoff = merk(new THREE.MeshStandardMaterial({ map: innenTex, emissive: "#ffffff", emissiveMap: innenTex, emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide }));
  for (const f of wandInnenseiten(s)) {
    const stoff = merk(innenStoff.clone());
    const m = new THREE.Mesh(merk(innenseitenGeometrie(f, s)), stoff);
    m.receiveShadow = true;
    modell.add(m);
    wandTeile[f.wand]?.mit.push(stoff);
  }
  // Türen auch bei ausgeblendeter Wand erkennbar: Umriss am Boden.
  const tuerLinie = merk(new THREE.LineBasicMaterial({ color: "#2b2f36" }));
  for (const t of s.tueren) {
    const x1 = t.q.x * M, x2 = (t.q.x + t.q.b) * M, z1 = t.q.z * M, z2 = (t.q.z + t.q.t) * M, y = 0.01;
    const geo = merk(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z1), new THREE.Vector3(x2, y, z2), new THREE.Vector3(x1, y, z2)]));
    modell.add(new THREE.LineLoop(geo, tuerLinie));
  }
  const notStoff = merk(new THREE.MeshStandardMaterial({ color: "#13894a", emissive: "#0c5e33" }));
  for (const t of s.tueren) {
    if (!t.notausgang) continue;
    const schild = kiste({ x: t.q.x + t.q.b / 2 - 25, y: t.q.y + t.q.h + 10, z: t.q.z + t.q.t / 2 - 25, b: Math.min(50, t.q.b), t: Math.min(50, t.q.t), h: 18 }, notStoff);
    modell.add(schild);
  }

  // Aufsteller: Grundplatte (Holz) auf vier Beinen.
  const ah = s.aufsteller;
  const plattenStoff = merk(new THREE.MeshStandardMaterial({ color: "#c7a77a", roughness: 0.85 }));
  const beinStoff = merk(new THREE.MeshStandardMaterial({ color: "#6b7280", metalness: 0.4, roughness: 0.5 }));
  const PLATTE = 4; // cm stark
  const BEIN = 5;
  const platten = new THREE.InstancedMesh(einheitsWuerfel, plattenStoff, Math.max(1, ah.length));
  const beine = new THREE.InstancedMesh(einheitsWuerfel, beinStoff, Math.max(1, ah.length * 4));
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(), skal = new THREE.Vector3(), quat = new THREE.Quaternion();
  const setze = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, dreh = 0) => {
    pos.set(x, y, z);
    skal.set(sx, sy, sz);
    quat.setFromAxisAngle(OBEN, dreh);
    mat.compose(pos, quat, skal);
    im.setMatrixAt(i, mat);
  };
  ah.forEach((a, i) => {
    const hp = Math.min(PLATTE, a.h);
    setze(platten, i, (a.x + a.b / 2) * M, (a.h - hp) * M, (a.z + a.t / 2) * M, a.b * M, hp * M, a.t * M);
    const hb = Math.max(0, a.h - hp);
    const ecken = [
      [a.x + BEIN, a.z + BEIN],
      [a.x + a.b - BEIN, a.z + BEIN],
      [a.x + BEIN, a.z + a.t - BEIN],
      [a.x + a.b - BEIN, a.z + a.t - BEIN],
    ];
    ecken.forEach(([x, z], j) => setze(beine, i * 4 + j, x! * M, 0, z! * M, BEIN * M, hb * M, BEIN * M));
  });
  platten.count = ah.length;
  beine.count = ah.length * 4;
  // Verkleidung der Sockel: weiße Plane (bzw. die gewählte Farbe) mit leichten Falten, matt. An der Gangseite kehrt ein
  // hochgeladenes Logo in regelmäßigem Abstand wieder (verkleidungsKachel), die Stirnseiten bleiben schlicht. Je Art eine
  // Geometrie und eine Textur. Sie gehört zu den Reihen und blendet nicht mit den Wänden aus.
  if (s.schuerzen.length) {
    const hoehe = s.schuerzen[0]!.q.h;
    const bahn = (teile: SzeneSchuerze[], kachel: { canvas: HTMLCanvasElement; laenge: number }) => {
      const tex = merk(new THREE.CanvasTexture(kachel.canvas));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      tex.repeat.set(1 / kachel.laenge, 1);
      // Leichtes Eigenleuchten aus derselben Kachel: die weiße Plane wirkt auch im Schatten weiß, das Logo bleibt kräftig.
      const stoff = merk(new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.35, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
      const m = new THREE.Mesh(merk(schuerzenGeometrie(teile)), stoff);
      m.receiveShadow = true;
      modell.add(m);
      return { stoff, tex };
    };
    const vorn = s.schuerzen.filter((b) => !b.stirn);
    const stirn = s.schuerzen.filter((b) => b.stirn);
    if (stirn.length) bahn(stirn, stoffKachel(verkleidung.farbe, hoehe, null));
    if (vorn.length) {
      const gang = bahn(vorn, stoffKachel(verkleidung.farbe, hoehe, null));
      if (verkleidung.bildId != null) {
        void ladeBild(`/datei/${schauId}/bild/${verkleidung.bildId}`)
          .then((logo) => {
            if (!logo || entsorgt) return;
            const k = stoffKachel(verkleidung.farbe, hoehe, logo);
            const tex = merk(new THREE.CanvasTexture(k.canvas));
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.anisotropy = 4;
            tex.repeat.set(1 / k.laenge, 1);
            gang.stoff.map = tex;
            gang.stoff.emissiveMap = tex;
            gang.stoff.needsUpdate = true;
            zeichne();
          })
          .catch(() => undefined);
      }
    }
  }
  for (const im of [platten, beine]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    modell.add(im);
  }

  // Tische und Bänke: Platte auf zwei Klappbeinen nahe den Enden (wie eine Bierzeltgarnitur).
  if (s.moebel.length) {
    const holz = merk(new THREE.MeshStandardMaterial({ color: "#c49a63", roughness: 0.8 }));
    const gestell = merk(new THREE.MeshStandardMaterial({ color: "#5b6270", metalness: 0.5, roughness: 0.5 }));
    const oben = new THREE.InstancedMesh(einheitsWuerfel, holz, s.moebel.length);
    const fuesse = new THREE.InstancedMesh(einheitsWuerfel, gestell, s.moebel.length * 2);
    s.moebel.forEach((m, i) => {
      const q = m.q;
      const st = 3; // Plattenstärke (cm)
      setze(oben, i, (q.x + q.b / 2) * M, (q.h - st) * M, (q.z + q.t / 2) * M, q.b * M, st * M, q.t * M);
      const laengsX = q.b >= q.t;
      const lang = laengsX ? q.b : q.t, kurz = laengsX ? q.t : q.b;
      const ein = Math.min(30, lang / 5);
      [ein, lang - ein].forEach((a, j) => {
        const x = laengsX ? q.x + a : q.x + q.b / 2, z = laengsX ? q.z + q.t / 2 : q.z + a;
        setze(fuesse, i * 2 + j, x * M, 0, z * M, (laengsX ? 4 : kurz * 0.85) * M, (q.h - st) * M, (laengsX ? kurz * 0.85 : 4) * M);
      });
    });
    for (const im of [oben, fuesse]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      modell.add(im);
    }
  }

  // Käfige wie Ausstellungskäfige: Seitenwände links und rechts und die Rückwand dicht (die Tiere sehen sich nicht), Boden dicht,
  // vorn und oben Gitter. Die Front kommt aus dem Plan (Reihe bzw. Block) – steht etwas falsch herum, sieht man es sofort.
  // Je Käfig eine Instanz, gefärbt nach Preisrichter wie im 2D-Plan; jede Etage gleich gebaut.
  const kastenGeo = merk(offenerKasten());
  const kaefigStoff = merk(new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.7 }));
  const kaefige = new THREE.InstancedMesh(kastenGeo, kaefigStoff, Math.max(1, s.kaefige.length));
  const gitterTex = merk(gitterTextur(8, 1));
  const gitterGeo = merk(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0.5));
  const gitterStoff = merk(new THREE.MeshStandardMaterial({ color: "#9aa3ad", map: gitterTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5 }));
  const gitter = new THREE.InstancedMesh(gitterGeo, gitterStoff, Math.max(1, s.kaefige.length));
  // Deckel: Gitter mit Stäben in beiden Richtungen, waagrecht oben auf dem Kasten.
  const deckelTex = merk(gitterTextur(8, 8));
  const deckelGeo = merk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 1, 0));
  const deckelStoff = merk(new THREE.MeshStandardMaterial({ color: "#9aa3ad", map: deckelTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5 }));
  const deckel = new THREE.InstancedMesh(deckelGeo, deckelStoff, Math.max(1, s.kaefige.length));
  const farbe = new THREE.Color();
  s.kaefige.forEach((k, i) => {
    const q = k.q;
    const quer = k.front === "x+" || k.front === "x-";
    setze(kaefige, i, (q.x + q.b / 2) * M, q.y * M, (q.z + q.t / 2) * M, (quer ? q.t : q.b) * M, q.h * M, (quer ? q.b : q.t) * M, DREHUNG[k.front]);
    gitter.setMatrixAt(i, mat);
    deckel.setMatrixAt(i, mat);
    const ri = k.tier?.preisrichterId != null ? richterIndex.get(k.tier.preisrichterId) : undefined;
    farbe.set(k.tier ? (ri != null ? hell(richterFarbe(ri)) : "#f6f4ef") : "#d5dae1");
    kaefige.setColorAt(i, farbe);
  });
  kaefige.count = gitter.count = deckel.count = s.kaefige.length;
  kaefige.castShadow = true;
  kaefige.receiveShadow = true;
  kaefige.instanceMatrix.needsUpdate = gitter.instanceMatrix.needsUpdate = deckel.instanceMatrix.needsUpdate = true;
  if (kaefige.instanceColor) kaefige.instanceColor.needsUpdate = true;
  modell.add(kaefige, gitter, deckel);

  // Volieren: Gitterkörper in ihren Maßen, mit Rahmen.
  const volierenTreffer: { mesh: THREE.Mesh; name: string; tier: SzeneTier | null }[] = [];
  const rahmenStoff = merk(new THREE.LineBasicMaterial({ color: "#4b5563" }));
  const kanten = merk(new THREE.EdgesGeometry(einheitsWuerfel));
  const volierenWand = merk(new THREE.MeshStandardMaterial({ color: "#efe9df", side: THREE.DoubleSide, roughness: 0.85 }));
  for (const v of s.volieren) {
    if (v.front) {
      // Wie im Plan: Rückwand und Seiten dicht, vorn und oben Draht (die Front kommt aus der Aufstellung bzw. dem Drehen).
      const quer = v.front === "x+" || v.front === "x-";
      const [sx, sz] = quer ? [v.q.t, v.q.b] : [v.q.b, v.q.t];
      const draht = (breit: number, hoch: number) =>
        merk(new THREE.MeshStandardMaterial({ color: "#5d6673", map: merk(gitterTextur(Math.max(4, Math.round(breit / 10)), Math.max(4, Math.round(hoch / 10)), 512, 2)), transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.3 }));
      const teile = [new THREE.Mesh(kastenGeo, volierenWand), new THREE.Mesh(gitterGeo, draht(sx, v.q.h)), new THREE.Mesh(deckelGeo, draht(sx, sz))];
      for (const m of teile) {
        m.position.set((v.q.x + v.q.b / 2) * M, 0, (v.q.z + v.q.t / 2) * M);
        m.rotation.y = DREHUNG[v.front];
        m.scale.set(sx * M, v.q.h * M, sz * M);
        m.castShadow = true;
        modell.add(m);
      }
      modell.add(kiste({ ...v.q, y: 0, h: 1 }, plattenStoff));
      volierenTreffer.push({ mesh: teile[0]!, name: v.name, tier: v.tier });
      continue;
    }
    // Ohne Front (ältere feste Pläne): rundum Draht alle 10 cm, dünn und durchscheinend.
    const tex = merk(gitterTextur(Math.max(4, Math.round(v.q.b / 10)), Math.max(4, Math.round(v.q.h / 10)), 512, 2));
    const stoff = merk(new THREE.MeshStandardMaterial({ color: "#5d6673", map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.3 }));
    const k = kiste(v.q, stoff);
    k.castShadow = true;
    modell.add(k);
    const r = new THREE.LineSegments(kanten, rahmenStoff);
    r.scale.copy(k.scale);
    r.position.copy(k.position);
    modell.add(r);
    const streu = kiste({ ...v.q, y: 0, h: 1 }, plattenStoff);
    modell.add(streu);
    volierenTreffer.push({ mesh: k, name: v.name, tier: v.tier });
  }

  // Tiere: Figuren aus Grundkörpern, je Figur und Farbe ein Instanzen-Netz.
  const figuren: { figur: Figur; gefieder: string; x: number; y: number; z: number; dreh: number; groesse: number }[] = [];
  for (const k of s.kaefige) {
    if (!k.tier) continue;
    figuren.push({ figur: k.tier.figur, gefieder: k.tier.gefieder, x: k.q.x + k.q.b / 2, y: k.q.y, z: k.q.z + k.q.t / 2, dreh: DREHUNG[k.front] + wackel(k.tier.id), groesse: k.tier.groesse });
  }
  for (const v of s.volieren) {
    if (!v.tier) continue;
    const n = v.figuren;
    const spalten = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const sx = (i % spalten) + 0.5, sz = Math.floor(i / spalten) + 0.5;
      const zeilen = Math.ceil(n / spalten);
      figuren.push({ figur: v.tier.figur, gefieder: v.tier.gefieder, x: v.q.x + (sx / spalten) * v.q.b, y: 1, z: v.q.z + (sz / zeilen) * v.q.t, dreh: wackel(v.tier.id * 7 + i) * 6, groesse: v.tier.groesse });
    }
  }
  const teile = figurTeile();
  for (const [figur, liste] of Object.entries(teile) as [Figur, Teil[]][]) {
    const diese = figuren.filter((f) => f.figur === figur);
    if (!diese.length) continue;
    for (const t of liste) {
      const geo = merk(t.geo);
      const stoff = merk(new THREE.MeshStandardMaterial({ color: t.farbe ?? "#ffffff", flatShading: true, roughness: 0.8 }));
      const im = new THREE.InstancedMesh(geo, stoff, diese.length);
      diese.forEach((f, i) => {
        setze(im, i, f.x * M, f.y * M, f.z * M, f.groesse * M, f.groesse * M, f.groesse * M, f.dreh);
        if (!t.farbe) im.setColorAt(i, farbe.set(f.gefieder));
      });
      im.castShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      modell.add(im);
    }
  }

  // Beschriftungen (Reihen, Flächen) als Schilder, die zur Kamera zeigen.
  for (const b of s.beschriftungen) {
    const schild = schildSprite(b.text);
    merk(schild.material);
    merk(schild.material.map!);
    schild.position.set(b.x * M, b.y * M, b.z * M);
    scene.add(schild);
  }

  // Kamera und Steuerung.
  const kamera = new THREE.PerspectiveCamera(50, 1, 0.05, groesse * 10);
  const steuerung = new OrbitControls(kamera, renderer.domElement);
  steuerung.screenSpacePanning = true;
  steuerung.maxPolarAngle = Math.PI * 0.495;
  steuerung.minDistance = 0.3;
  steuerung.maxDistance = groesse * 4;
  // Hindernisse für den Doppelklick: Käfige, Volieren und Wände, die gerade zu sehen sind (ausgeblendete nicht).
  const hindernisse = () => [kaefige, ...volierenTreffer.map((x) => x.mesh), ...wandTeile.filter((x) => x.deck > 0.5).map((x) => x.mesh)];
  const bewegung = bewegungFuer({ kamera, steuerung, dom: renderer.domElement, boden, hindernisse, punkte: s.rundgang, zeichne: () => zeichne(), beiRundgang });
  /** Deckkraft der Wände zur Kamera nachführen (weich); true, solange sich noch etwas ändert. */
  const waendeAnpassen = (): boolean => {
    const k = { x: kamera.position.x / M, y: kamera.position.y / M, z: kamera.position.z / M };
    const z = { x: steuerung.target.x / M, y: steuerung.target.y / M, z: steuerung.target.z / M };
    let weiter = false;
    for (const t of wandTeile) {
      const ziel = wandDeckkraft(t.w, s, k, z);
      t.deck = t.deck < 0 || Math.abs(ziel - t.deck) < 0.01 ? ziel : t.deck + (ziel - t.deck) * 0.25;
      if (t.deck !== ziel) weiter = true;
      t.stoff.opacity = t.deck;
      const durch = t.deck < 0.999;
      if (t.stoff.transparent !== durch) {
        t.stoff.transparent = durch;
        t.stoff.needsUpdate = true;
      }
      t.stoff.depthWrite = t.deck > 0.6;
      t.mesh.castShadow = t.deck > 0.5;
      // Die Innenseite (Prallwand, Anstrich) geht mit.
      for (const m of t.mit) {
        m.opacity = t.deck;
        if (!m.transparent) {
          m.transparent = true;
          m.needsUpdate = true;
        }
        m.depthWrite = t.deck > 0.6;
      }
    }
    return weiter;
  };
  let warten = 0;
  let zuletzt = 0; // Zeitpunkt des letzten Bildes (ms)
  const zeichne = () => {
    if (warten) return;
    warten = requestAnimationFrame((jetzt) => {
      warten = 0;
      // Das erste Bild einer Bewegung zählt 1/60 s, nicht die Pause davor; langsame Geräte höchstens 0,1 s je Bild.
      const dt = zuletzt ? Math.min(0.1, (jetzt - zuletzt) / 1000) : 1 / 60;
      const faehrt = bewegung.schritt(dt);
      zuletzt = faehrt ? jetzt : 0;
      // Weiches Auslaufen nach Ziehen oder Rad: update() meldet „change“ (also das nächste Bild), bis die Kamera steht.
      // Im Rundgang führt der Rundgang die Kamera; OrbitControls würde sie sonst um den Rest-Schwung verschieben.
      if (!bewegung.imRundgang()) steuerung.update();
      const weiter = waendeAnpassen() || faehrt;
      // Dunst beginnt knapp hinter der Halle (wie weit die Kamera auch weg ist): die Halle bleibt scharf, die Umgebung tritt zurück.
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.near = kamera.position.distanceTo(steuerung.target) + groesse * 0.7;
        scene.fog.far = scene.fog.near + groesse * 2.8;
      }
      renderer.render(scene, kamera);
      if (weiter) zeichne();
    });
  };
  steuerung.addEventListener("change", zeichne);

  const groesseAnpassen = () => {
    const w = kasten.clientWidth || 1, h = kasten.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    zeichne();
  };
  const beobachter = new ResizeObserver(groesseAnpassen);
  beobachter.observe(kasten);
  groesseAnpassen();

  const ansicht = (a: Ansicht) => {
    bewegung.anhalten();
    bewegung.beruhigen();
    kamera.up.set(0, 1, 0);
    if (a === "oben") {
      // Ganze Halle samt Wänden im Bild; die Wandkronen liegen näher an der Kamera, daher die Wandhöhe obendrauf.
      const rand = 2 * s.wandDicke * M;
      const h = (Math.max(L + rand, (B + rand) / kamera.aspect) / 2 / Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2))) * 1.06 + s.wandHoehe * M;
      kamera.position.set(mitte.x, h, mitte.z + 0.001);
      steuerung.target.set(mitte.x, 0, mitte.z);
    } else if (a === "gang") {
      kamera.position.set(s.gang.von.x * M, s.gang.von.y * M, s.gang.von.z * M);
      steuerung.target.set(s.gang.nach.x * M, s.gang.nach.y * M, s.gang.nach.z * M);
    } else {
      const d = groesse * 0.95;
      kamera.position.set(mitte.x - d * 0.45, d * 0.62, mitte.z + d * 0.75);
      steuerung.target.set(mitte.x, 0.6, mitte.z);
    }
    steuerung.update();
    zeichne();
  };

  const strahl = new THREE.Raycaster();
  const punkt = new THREE.Vector2();
  const treffer = (e: PointerEvent): Treffer | null => {
    const r = renderer.domElement.getBoundingClientRect();
    punkt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(punkt, kamera);
    const ziele: THREE.Object3D[] = [kaefige, ...volierenTreffer.map((v) => v.mesh)];
    const h = strahl.intersectObjects(ziele, false)[0];
    if (!h) return null;
    if (h.object === kaefige && h.instanceId != null) {
      const k = s.kaefige[h.instanceId];
      return k ? { art: "kaefig", kaefig: k } : null;
    }
    const v = volierenTreffer.find((x) => x.mesh === h.object);
    return v ? { art: "voliere", name: v.name, tier: v.tier } : null;
  };

  const herunterladen = async () => {
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const daten = await new GLTFExporter().parseAsync(modell, { binary: true });
    const url = URL.createObjectURL(new Blob([daten as ArrayBuffer], { type: "model/gltf-binary" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hallenplan.glb";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return {
    renderer,
    ansicht,
    bewegung,
    treffer,
    herunterladen,
    entsorgen: () => {
      entsorgt = true;
      beobachter.disconnect();
      if (warten) cancelAnimationFrame(warten);
      bewegung.entsorgen();
      steuerung.dispose();
      for (const x of zuEntsorgen) x.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

const OBEN = new THREE.Vector3(0, 1, 0);
