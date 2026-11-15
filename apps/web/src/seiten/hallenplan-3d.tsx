/**
 * Hallenplan in 3D: die Halle räumlich – drehen, zoomen, verschieben, von oben oder im Gang in Augenhöhe. Die Körper rechnet
 * die Fachlogik (`hallenSzene`) aus demselben Plan wie die 2D-Zeichnung; hier wird nur gezeichnet. three.js lädt nur diese
 * Datei (dynamischer Import aus dem Hallenplan), die übrigen Seiten bleiben klein.
 *
 * Maßstab: die Szene in Metern (Fachlogik in cm). Gezeichnet wird nur bei Bedarf (Bewegung, Zeigen), nicht in Dauerschleife.
 */
import { verkleidungsKachel, verkleidungVon, type Verkleidung, type SzeneSchuerze, hallenSzene, richterFarbe, wandDeckkraft, wandInnenseiten, type Quader, type WandInnenseite, type Blick, type Figur, type Halle, type HallenSzene, type Hallenplan, type KaefigMasse, type Aufsteller, type SzeneKaefig, type SzeneTier, KAEFIG_TYP_LABEL } from "@schau/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HilfeLink, Knopf, KnopfLink } from "../ui";
import { baueLandschaft, type HallenSeite } from "./hallenplan-3d-landschaft";

const M = 0.01; // cm → m

type Ansicht = "rundum" | "oben" | "gang";

export default function Hallenplan3D({
  halle,
  plan,
  masse,
  aufsteller,
  farben,
  richter,
  richterIndex,
  seite,
  schauId,
}: {
  halle: Halle;
  plan: Hallenplan;
  masse: KaefigMasse;
  aufsteller: Aufsteller;
  farben: [number, string][];
  richter: { id: number; name: string }[];
  richterIndex: Map<number, number>;
  /** Eigene Seite (eigener Tab): Stand der Daten, neu laden, zurück zum Hallenplan, Name der Schau. */
  seite: { stand: number; laedt: boolean; aktualisieren: () => void; zurueck: string; schau: string };
  /** Für die Bild-Adresse des Logos der Sockelverkleidung. */
  schauId: number;
}) {
  const szene = useMemo(() => hallenSzene(halle, plan, masse, aufsteller, new Map(farben)), [halle, plan, masse, aufsteller, farben]);
  const kastenRef = useRef<HTMLDivElement>(null);
  const rahmenRef = useRef<HTMLDivElement>(null);
  const welt = useRef<Welt | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("rundum");
  // Nach dem Neuladen bleibt die gewählte Ansicht.
  const ansichtRef = useRef<Ansicht>("rundum");
  ansichtRef.current = ansicht;
  const [zeiger, setZeiger] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const richterName = useMemo(() => new Map(richter.map((r) => [r.id, r.name])), [richter]);

  useEffect(() => {
    const kasten = kastenRef.current;
    if (!kasten) return;
    let w: Welt;
    try {
      w = baueWelt(kasten, szene, richterIndex, schauId, verkleidungVon(aufsteller));
    } catch {
      setFehler("3D-Ansicht nicht möglich (WebGL fehlt).");
      return;
    }
    welt.current = w;
    w.ansicht(ansichtRef.current);
    const beiZeigen = (e: PointerEvent) => {
      if (e.pointerType === "touch" && e.buttons) return;
      const k = w.treffer(e);
      setZeiger(k ? { x: e.clientX, y: e.clientY, text: kaefigText(k, richterName) } : null);
    };
    const weg = () => setZeiger(null);
    w.renderer.domElement.addEventListener("pointermove", beiZeigen);
    w.renderer.domElement.addEventListener("pointerleave", weg);
    // Antippen am Tablet zeigt die Angaben auch.
    w.renderer.domElement.addEventListener("pointerup", beiZeigen);
    return () => {
      w.renderer.domElement.removeEventListener("pointermove", beiZeigen);
      w.renderer.domElement.removeEventListener("pointerleave", weg);
      w.renderer.domElement.removeEventListener("pointerup", beiZeigen);
      w.entsorgen();
      welt.current = null;
    };
  }, [szene, richterIndex, richterName]);

  useEffect(() => {
    rahmenRef.current?.focus();
  }, []);

  const waehle = (a: Ansicht) => {
    setAnsicht(a);
    welt.current?.ansicht(a);
  };

  const tasten = (e: React.KeyboardEvent) => {
    const schritt: Record<string, [number, number]> = { ArrowUp: [1, 0], w: [1, 0], ArrowDown: [-1, 0], s: [-1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] };
    const s = schritt[e.key];
    if (s && welt.current) {
      e.preventDefault();
      welt.current.gehen(s[0] * 0.5, s[1] * 0.5);
    }
  };

  const belegt = szene.kaefige.filter((k) => k.tier).length;
  const legende = richter.filter((r) => richterIndex.has(r.id));
  return (
    <main ref={rahmenRef} aria-label="Hallenplan in 3D" tabIndex={-1} onKeyDown={tasten} className="fixed inset-0 flex flex-col bg-weiss outline-none">
      <div className="flex flex-wrap items-center gap-2 border-b border-linie px-3 py-2">
        <h1 className="mr-2 text-lg font-semibold">Halle in 3D{seite.schau ? <span className="font-normal text-grau"> · {seite.schau}</span> : null}</h1>
        <span className="text-sm text-grau">
          {belegt} Tiere · {szene.kaefige.length - belegt} freie Plätze · {szene.volieren.length} Volieren · Stand {new Date(seite.stand).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {(
            [
              ["rundum", "Rundum"],
              ["oben", "Von oben"],
              ["gang", "Im Gang"],
            ] as const
          ).map(([a, text]) => (
            <Knopf key={a} variante={ansicht === a ? "primaer" : "zweit"} aria-pressed={ansicht === a} onClick={() => waehle(a)}>
              {text}
            </Knopf>
          ))}
          <Knopf onClick={() => void welt.current?.herunterladen().catch(() => setFehler("3D-Modell konnte nicht erstellt werden."))}>3D-Modell herunterladen</Knopf>
          <Knopf laedt={seite.laedt} onClick={seite.aktualisieren}>
            Neu laden
          </Knopf>
          <HilfeLink abschnitt="hallenplan-3d">Hilfe zur 3D-Ansicht</HilfeLink>
          <KnopfLink href={seite.zurueck}>Zum Hallenplan</KnopfLink>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={kastenRef} className="absolute inset-0 touch-none" />
        {fehler && <p className="absolute left-3 top-3 rounded-md bg-weiss px-3 py-2 text-sm text-kamm shadow">{fehler}</p>}
        {legende.length > 0 && (
          <ul className="pointer-events-none absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-md bg-weiss/90 px-3 py-2 text-xs shadow" aria-label="Preisrichter">
            {legende.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border border-linie" style={{ background: hell(richterFarbe(richterIndex.get(r.id)!)) }} />
                {r.name}
              </li>
            ))}
          </ul>
        )}
        {zeiger && (
          <div className="pointer-events-none fixed z-50 rounded-md bg-kopf px-2.5 py-1.5 text-[13px] text-auf-kopf shadow" style={{ left: zeiger.x + 14, top: zeiger.y + 14 }}>
            {zeiger.text.map((t, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : ""}>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/** Angaben beim Draufzeigen: Nummer und Rasse, nie der Aussteller. */
function kaefigText(k: Treffer, richterName: Map<number, string>): string[] {
  if (k.art === "voliere") return k.tier ? [`${k.tier.nr ? `Nr. ${k.tier.nr} · ` : ""}${k.tier.rasse}`, k.name, ...richterZeile(k.tier, richterName)] : [k.name, "frei"];
  const t = k.kaefig.tier;
  if (!t) return ["Freier Platz", `${KAEFIG_TYP_LABEL[k.kaefig.typ]} · ${k.kaefig.ort}`];
  return [`${t.nr ? `Nr. ${t.nr} · ` : ""}${t.rasse}`, `${t.sparte} · ${k.kaefig.ort}`, ...richterZeile(t, richterName)];
}

const richterZeile = (t: SzeneTier, n: Map<number, string>) => (t.preisrichterId != null && n.get(t.preisrichterId) ? [`Preisrichter: ${n.get(t.preisrichterId)}`] : []);

/** Preisrichter-Farbe aufgehellt wie im 2D-Plan (45 % Deckung auf Weiß). */
function hell(hex: string): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), 0.55);
  return `#${c.getHexString()}`;
}

type Treffer = { art: "kaefig"; kaefig: SzeneKaefig } | { art: "voliere"; name: string; tier: SzeneTier | null };

interface Welt {
  renderer: THREE.WebGLRenderer;
  ansicht: (a: Ansicht) => void;
  gehen: (vor: number, seit: number) => void;
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

function baueWelt(kasten: HTMLDivElement, s: HallenSzene, richterIndex: Map<number, number>, schauId: number, verkleidung: Verkleidung): Welt {
  let entsorgt = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  kasten.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Halle räumlich");

  const scene = new THREE.Scene();
  /** Was ins 3D-Modell kommt (ohne Beschriftungen). */
  const modell = new THREE.Group();
  modell.name = "Halle";
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
  const boden = new THREE.Mesh(merk(new THREE.PlaneGeometry(B, L)), merk(new THREE.MeshStandardMaterial({ color: "#ecdcbc" })));
  boden.rotation.x = -Math.PI / 2;
  boden.position.set(B / 2, 0, L / 2);
  boden.receiveShadow = true;
  modell.add(boden);
  const raster: number[] = [];
  for (let x = 1; x < B; x++) raster.push(x, 0.002, 0, x, 0.002, L);
  for (let z = 1; z < L; z++) raster.push(0, 0.002, z, B, 0.002, z);
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
  const zeichne = () => {
    if (warten) return;
    warten = requestAnimationFrame(() => {
      warten = 0;
      const weiter = waendeAnpassen();
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

  // Gehen (Pfeiltasten / WASD): Kamera und Ziel zusammen, waagrecht in Blickrichtung bzw. seitlich.
  const vorwaerts = new THREE.Vector3(), seitwaerts = new THREE.Vector3();
  const gehen = (vor: number, seit: number) => {
    vorwaerts.subVectors(steuerung.target, kamera.position).setY(0);
    if (vorwaerts.lengthSq() < 1e-6) vorwaerts.set(0, 0, -1);
    vorwaerts.normalize();
    seitwaerts.crossVectors(vorwaerts, OBEN).normalize();
    const d = vorwaerts.multiplyScalar(vor).add(seitwaerts.multiplyScalar(seit));
    kamera.position.add(d);
    steuerung.target.add(d);
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
    gehen,
    treffer,
    herunterladen,
    entsorgen: () => {
      entsorgt = true;
      beobachter.disconnect();
      if (warten) cancelAnimationFrame(warten);
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

/** Kleine feste Abweichung der Blickrichtung je Tier (sieht lebendiger aus, bleibt beim Neuzeichnen gleich). */
function wackel(id: number): number {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.7;
}

/** Einheitswürfel (Boden in der Mitte bei y = 0) ohne Vorderseite (+z) und Decke (+y): Seiten, Rückwand und Boden bleiben. */
function offenerKasten(): THREE.BufferGeometry {
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
function gitterTextur(senkrecht: number, waagrecht: number, n = 256, staerke = n / 64): THREE.CanvasTexture {
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

function schildSprite(text: string): THREE.Sprite {
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

type Teil = { geo: THREE.BufferGeometry; farbe?: string };

/**
 * Figuren aus Grundkörpern, 1 Einheit hoch (Füße bei y = 0, Blick nach +z); skaliert auf die Größe des Tieres. Teile ohne
 * Farbe tragen das Gefieder (je Tier), die übrigen haben feste Farben (Kamm, Schnabel, Beine). Teile gleicher Farbe sind
 * zusammengefasst – so bleibt es bei wenigen Netzen auch mit vielen Tieren.
 */
function figurTeile(): Record<Figur, Teil[]> {
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
async function ladeBild(url: string): Promise<HTMLCanvasElement | null> {
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
function schuerzenGeometrie(bahnen: SzeneSchuerze[]): THREE.BufferGeometry {
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
function stoffKachel(farbe: string, hoehe: number, logo: HTMLCanvasElement | null): { canvas: HTMLCanvasElement; laenge: number } {
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
const TURNHALLE_KACHEL = 120;

/**
 * Innenseite einer Turnhalle als Textur, 120 cm breit und so hoch wie die Wand: unten Holz-Prallwand (helle Birke, senkrechte
 * Paneele mit Stoßfugen) bis 2 m, Abschlussleiste, ein schmales gedecktes Blau, darüber hell gestrichen, oben ein Lichtband.
 */
function turnhallenWand(wandHoehe: number): THREE.CanvasTexture {
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
function innenseitenGeometrie(f: WandInnenseite, s: HallenSzene): THREE.BufferGeometry {
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

