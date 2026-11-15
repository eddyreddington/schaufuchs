/**
 * Umgebung der 3D-Halle (nur zur Anschauung, ohne Maße): Himmel mit Wolken, Wiese, ein heller Hof um die Halle, vor dem
 * Haupteingang ein Parkplatz, gegenüber ein Sportplatz, ein paar Bäume und Hügel am Horizont. Gehört nicht zum Modell (kein
 * glTF-Export, kein Zeigen). Bäume und Autos stehen fest nach der Hallengröße verteilt (kein Zufall bei jedem Öffnen); Bäume
 * mindestens `ABSTAND` Meter von der Halle und nie auf Parkplatz oder Sportplatz.
 */
import * as THREE from "three";

/** Mindestabstand der Bäume von der Hallenwand (m). */
const ABSTAND = 6;
const HORIZONT = "#dcebf5";

/** Fest eingestellter Zufall (mulberry32): dieselbe Halle zeigt immer dieselbe Landschaft. */
function zufall(saat: number): () => number {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kachel aus dem Zeichenbrett (Wiese, Wolke). */
function kachel(n: number, malen: (g: CanvasRenderingContext2D, n: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  malen(c.getContext("2d")!, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Seite der Halle (3D: x entlang der Breite, z entlang der Länge). */
export type HallenSeite = "x0" | "x1" | "z0" | "z1";

/** Gruppe in den Koordinaten einer Seite: x läuft an der Wand entlang (0 bis Seitenlänge), z von der Wand nach außen. */
function anSeite(seite: HallenSeite, B: number, L: number): { gruppe: THREE.Group; laenge: number } {
  const g = new THREE.Group();
  if (seite === "z1") g.position.set(0, 0, L);
  else if (seite === "z0") (g.position.set(B, 0, 0), (g.rotation.y = Math.PI));
  else if (seite === "x1") (g.position.set(B, 0, L), (g.rotation.y = Math.PI / 2));
  else g.rotation.y = -Math.PI / 2;
  return { gruppe: g, laenge: seite === "z0" || seite === "z1" ? B : L };
}

const GEGENUEBER: Record<HallenSeite, HallenSeite> = { x0: "x1", x1: "x0", z0: "z1", z1: "z0" };

/** Flache Fläche am Boden in den Koordinaten der Gruppe (x, z = Ecke; b entlang x, t entlang z). */
function bodenStueck(x: number, z: number, b: number, t: number, stoff: THREE.Material, hoehe: number, geo: THREE.PlaneGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geo, stoff);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(b, t, 1);
  m.position.set(x + b / 2, hoehe, z + t / 2);
  m.receiveShadow = true;
  return m;
}

/**
 * Baut die Umgebung um eine Halle von `B` × `L` Metern (Ecke bei 0/0) in die Szene. `merk` sammelt, was beim Schließen
 * entsorgt wird. Gibt den Radius der Himmelskuppel zurück (die Kamera bleibt innerhalb).
 */
export function baueLandschaft(scene: THREE.Scene, B: number, L: number, merk: <T extends { dispose: () => void }>(x: T) => T, vorne: HallenSeite = "z1"): number {
  const groesse = Math.max(B, L);
  const mitte = new THREE.Vector3(B / 2, 0, L / 2);
  const R = groesse * 4.6;
  const z = zufall(Math.round(B * 1000) * 31 + Math.round(L * 1000));

  // Dunst: erst weit hinter der Halle (die Kamera entfernt sich höchstens das Vierfache), am Rand der Wiese ganz Horizont.
  scene.background = new THREE.Color(HORIZONT);
  scene.fog = new THREE.Fog(HORIZONT, groesse * 4.2, R * 1.02);

  // Himmel: Kuppel mit Verlauf (oben kräftiges Blau, am Horizont hell), ohne Dunst.
  const himmel = new THREE.Mesh(
    merk(new THREE.SphereGeometry(R, 32, 16)),
    merk(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { oben: { value: new THREE.Color("#4f8fd0") }, horizont: { value: new THREE.Color(HORIZONT) }, unten: { value: new THREE.Color("#c9d6bd") } },
        vertexShader: "varying vec3 p; void main() { p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 oben; uniform vec3 horizont; uniform vec3 unten; varying vec3 p; void main() { float h = p.y; vec3 f = h > 0.0 ? mix(horizont, oben, pow(clamp(h * 1.6, 0.0, 1.0), 0.75)) : mix(horizont, unten, clamp(-h * 4.0, 0.0, 1.0)); gl_FragColor = vec4(f, 1.0); }",
      }),
    ),
  );
  himmel.position.copy(mitte);
  himmel.renderOrder = -1;
  scene.add(himmel);

  // Wolken: weiche, flache Bilder hoch am Himmel.
  const wolkenBild = merk(
    kachel(128, (g, n) => {
      for (let i = 0; i < 7; i++) {
        const x = n * (0.2 + 0.6 * (i / 6)), y = n * (0.55 + 0.12 * Math.sin(i * 1.7)), r = n * (0.16 + 0.07 * Math.cos(i * 2.3));
        const v = g.createRadialGradient(x, y, 0, x, y, r);
        v.addColorStop(0, "rgba(255,255,255,0.95)");
        v.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = v;
        g.fillRect(0, 0, n, n);
      }
    }),
  );
  const wolkenStoff = merk(new THREE.SpriteMaterial({ map: wolkenBild, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
  for (let i = 0; i < 14; i++) {
    const w = (i / 14) * Math.PI * 2 + z() * 0.4;
    const hoehe = THREE.MathUtils.degToRad(10 + z() * 22);
    const wolke = new THREE.Sprite(wolkenStoff);
    const d = R * 0.82;
    wolke.position.set(mitte.x + Math.cos(w) * Math.cos(hoehe) * d, Math.sin(hoehe) * d, mitte.z + Math.sin(w) * Math.cos(hoehe) * d);
    const s = groesse * (0.9 + z() * 0.9);
    wolke.scale.set(s * 1.8, s * 0.6, 1);
    scene.add(wolke);
  }

  // Wiese: Kreis bis zum Horizont, mit feiner Körnung (sonst wirkt sie wie Plastik).
  const gras = merk(
    kachel(256, (g, n) => {
      g.fillStyle = "#8fb06b";
      g.fillRect(0, 0, n, n);
      const zg = zufall(7);
      for (let i = 0; i < 2600; i++) {
        const hell = zg() > 0.5;
        g.fillStyle = hell ? `rgba(196,214,140,${0.25 + zg() * 0.3})` : `rgba(78,112,58,${0.2 + zg() * 0.3})`;
        g.fillRect(zg() * n, zg() * n, 1 + zg() * 2, 1 + zg() * 3);
      }
    }),
  );
  gras.wrapS = gras.wrapT = THREE.RepeatWrapping;
  gras.repeat.set(R / 4, R / 4);
  const wiese = new THREE.Mesh(merk(new THREE.CircleGeometry(R, 64)), merk(new THREE.MeshStandardMaterial({ map: gras, roughness: 1 })));
  wiese.rotation.x = -Math.PI / 2;
  wiese.position.set(mitte.x, -0.03, mitte.z);
  wiese.receiveShadow = true;
  scene.add(wiese);

  // Hof um die Halle (Pflaster), damit die Halle nicht direkt in der Wiese steht.
  const hof = new THREE.Mesh(merk(new THREE.PlaneGeometry(B + 8, L + 8)), merk(new THREE.MeshStandardMaterial({ color: "#d3cbbb", roughness: 1 })));
  hof.rotation.x = -Math.PI / 2;
  hof.position.set(mitte.x, -0.02, mitte.z);
  hof.receiveShadow = true;
  scene.add(hof);

  // Hügel am Horizont: flache Kegel im Dunst.
  const huegelGeo = merk(new THREE.ConeGeometry(1, 1, 9, 1, true));
  const huegelStoff = merk(new THREE.MeshStandardMaterial({ color: "#7e9a74", flatShading: true, roughness: 1 }));
  const huegelZahl = 12;
  const huegel = new THREE.InstancedMesh(huegelGeo, huegelStoff, huegelZahl);
  const m = new THREE.Matrix4();
  for (let i = 0; i < huegelZahl; i++) {
    const w = (i / huegelZahl) * Math.PI * 2 + z() * 0.3;
    const d = R * (0.78 + z() * 0.12);
    const r = groesse * (0.9 + z() * 0.8);
    const h = groesse * (0.12 + z() * 0.14);
    m.compose(new THREE.Vector3(mitte.x + Math.cos(w) * d, h / 2 - 0.05, mitte.z + Math.sin(w) * d), new THREE.Quaternion(), new THREE.Vector3(r, h, r));
    huegel.setMatrixAt(i, m);
  }
  scene.add(huegel);

  const einheit = merk(new THREE.PlaneGeometry(1, 1));
  const weiss = merk(new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.9 }));
  /** Weiße Linie am Boden von (x1, z1) nach (x2, z2), 12 cm breit (waagrecht oder senkrecht). */
  const linie = (g: THREE.Group, x1: number, z1: number, x2: number, z2: number, h: number) =>
    g.add(bodenStueck(Math.min(x1, x2) - (x1 === x2 ? 0.06 : 0), Math.min(z1, z2) - (z1 === z2 ? 0.06 : 0), Math.abs(x2 - x1) || 0.12, Math.abs(z2 - z1) || 0.12, weiss, h, einheit));

  // Parkplatz vor dem Haupteingang: zwei Reihen Stellplätze (2,5 × 5 m) an einer 6 m breiten Fahrgasse, ein paar Autos.
  const park = anSeite(vorne, B, L);
  const parkBreite = Math.max(30, Math.round(park.laenge / 2.5) * 2.5);
  const p0 = park.laenge / 2 - parkBreite / 2;
  park.gruppe.add(bodenStueck(p0 - 1, 5, parkBreite + 2, 20, merk(new THREE.MeshStandardMaterial({ color: "#62666b", roughness: 1 })), -0.012, einheit));
  const stellplaetze = Math.floor(parkBreite / 2.5);
  for (let k = 0; k <= stellplaetze; k++) {
    linie(park.gruppe, p0 + k * 2.5, 6, p0 + k * 2.5, 11, -0.008);
    linie(park.gruppe, p0 + k * 2.5, 18, p0 + k * 2.5, 23, -0.008);
  }
  const lackFarben = ["#b7312c", "#2f4f7f", "#d9d9d6", "#1d1f22", "#7b8288", "#355e3b", "#c9a227", "#8a8f94"];
  const autos: { x: number; z: number; farbe: THREE.Color }[] = [];
  for (let k = 0; k < stellplaetze; k++)
    for (const zr of [8.5, 20.5]) if (z() < 0.45) autos.push({ x: p0 + k * 2.5 + 1.25, z: zr, farbe: new THREE.Color(lackFarben[Math.floor(z() * lackFarben.length)]!) });
  const lackStoff = merk(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.2 }));
  const karosserie = new THREE.InstancedMesh(merk(new THREE.BoxGeometry(1.8, 0.75, 4.3).translate(0, 0.55, 0)), lackStoff, Math.max(1, autos.length));
  const kabine = new THREE.InstancedMesh(merk(new THREE.BoxGeometry(1.6, 0.6, 2.3).translate(0, 1.2, -0.2)), merk(new THREE.MeshStandardMaterial({ color: "#2b3138", roughness: 0.2, metalness: 0.4 })), Math.max(1, autos.length));
  karosserie.count = kabine.count = autos.length;
  autos.forEach((a, i) => {
    m.compose(new THREE.Vector3(a.x, 0, a.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    karosserie.setMatrixAt(i, m);
    karosserie.setColorAt(i, a.farbe);
    kabine.setMatrixAt(i, m);
  });
  for (const t of [karosserie, kabine]) {
    t.castShadow = true;
    park.gruppe.add(t);
  }
  scene.add(park.gruppe);

  // Sportplatz gegenüber: Rasenfeld 40 × 60 m mit Linien und Toren, rundherum eine rote Laufbahn (4 m).
  const sport = anSeite(GEGENUEBER[vorne], B, L);
  const sx = sport.laenge / 2, s0 = 14;
  sport.gruppe.add(bodenStueck(sx - 24, s0, 48, 68, merk(new THREE.MeshStandardMaterial({ color: "#b0573f", roughness: 1 })), -0.014, einheit));
  sport.gruppe.add(bodenStueck(sx - 20, s0 + 4, 40, 60, merk(new THREE.MeshStandardMaterial({ color: "#6fa451", roughness: 1 })), -0.012, einheit));
  const h = -0.008, a0 = s0 + 4, a1 = s0 + 64, am = (a0 + a1) / 2;
  linie(sport.gruppe, sx - 20, a0, sx + 20, a0, h);
  linie(sport.gruppe, sx - 20, a1, sx + 20, a1, h);
  linie(sport.gruppe, sx - 20, a0, sx - 20, a1, h);
  linie(sport.gruppe, sx + 20, a0, sx + 20, a1, h);
  linie(sport.gruppe, sx - 20, am, sx + 20, am, h);
  for (const [von, nach] of [[a0, a0 + 10], [a1, a1 - 10]] as const) {
    linie(sport.gruppe, sx - 12, von, sx - 12, nach, h);
    linie(sport.gruppe, sx + 12, von, sx + 12, nach, h);
    linie(sport.gruppe, sx - 12, nach, sx + 12, nach, h);
  }
  const kreis = new THREE.Mesh(merk(new THREE.RingGeometry(5.94, 6.06, 48)), weiss);
  kreis.rotation.x = -Math.PI / 2;
  kreis.position.set(sx, h, am);
  sport.gruppe.add(kreis);
  // Tore: zwei Pfosten und eine Latte (5 × 2 m), auf der Torlinie.
  const pfosten = merk(new THREE.BoxGeometry(0.12, 2, 0.12).translate(0, 1, 0));
  const latte = merk(new THREE.BoxGeometry(5.12, 0.12, 0.12).translate(0, 2, 0));
  for (const gz of [a0, a1]) {
    for (const px of [sx - 2.5, sx + 2.5]) {
      const p = new THREE.Mesh(pfosten, weiss);
      p.position.set(px, 0, gz);
      p.castShadow = true;
      sport.gruppe.add(p);
    }
    const l = new THREE.Mesh(latte, weiss);
    l.position.set(sx, 0, gz);
    l.castShadow = true;
    sport.gruppe.add(l);
  }
  scene.add(sport.gruppe);

  // Wo keine Bäume stehen: Parkplatz und Sportplatz mit etwas Rand.
  const frei = [park.gruppe, sport.gruppe].map((g) => {
    g.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(g).expandByScalar(4);
  });

  // Bäume: wenige Laubbäume (Kugelkrone) und Nadelbäume (Kegel), außerhalb von Halle, Hof, Parkplatz und Sportplatz.
  const stammGeo = merk(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6).translate(0, 1.2, 0));
  const laubGeo = merk(new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.5, 0));
  const nadelGeo = merk(new THREE.ConeGeometry(1.5, 4.8, 8).translate(0, 4.2, 0));
  const stammStoff = merk(new THREE.MeshStandardMaterial({ color: "#6b4f37", roughness: 1 }));
  const kroneStoff = merk(new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.95 }));
  const anzahl = Math.max(18, Math.min(45, Math.round(groesse * 0.8)));
  const orte: { x: number; z: number; s: number; nadel: boolean; farbe: THREE.Color }[] = [];
  const laub = ["#5f8f45", "#6f9c4c", "#4f7d3c", "#7aa556", "#88a94f"];
  const nadel = ["#3f6b45", "#36603d", "#4a7a50"];
  for (let versuch = 0; orte.length < anzahl && versuch < anzahl * 30; versuch++) {
    // Locker verteilt, eher am Rand des Geländes als dicht an der Halle.
    const w = z() * Math.PI * 2;
    const d = groesse * 0.9 + z() * (R * 0.66 - groesse * 0.9);
    const x = mitte.x + Math.cos(w) * d, y = mitte.z + Math.sin(w) * d;
    const ausserhalb = x < -ABSTAND || x > B + ABSTAND || y < -ABSTAND || y > L + ABSTAND;
    const aufPlatz = frei.some((f) => f.containsPoint(new THREE.Vector3(x, 0, y)));
    if (!ausserhalb || aufPlatz || orte.some((o) => (o.x - x) ** 2 + (o.z - y) ** 2 < 36)) continue;
    const istNadel = z() < 0.35;
    const reihe = istNadel ? nadel : laub;
    orte.push({ x, z: y, s: 0.75 + z() * 0.75, nadel: istNadel, farbe: new THREE.Color(reihe[Math.floor(z() * reihe.length)]!) });
  }
  const staemme = new THREE.InstancedMesh(stammGeo, stammStoff, orte.length);
  const laubKronen = new THREE.InstancedMesh(laubGeo, kroneStoff, Math.max(1, orte.filter((o) => !o.nadel).length));
  const nadelKronen = new THREE.InstancedMesh(nadelGeo, kroneStoff, Math.max(1, orte.filter((o) => o.nadel).length));
  laubKronen.count = orte.filter((o) => !o.nadel).length;
  nadelKronen.count = orte.filter((o) => o.nadel).length;
  let li = 0, ni = 0;
  orte.forEach((o, i) => {
    m.compose(new THREE.Vector3(o.x, 0, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), z() * Math.PI), new THREE.Vector3(o.s, o.s * (0.9 + z() * 0.3), o.s));
    staemme.setMatrixAt(i, m);
    if (o.nadel) {
      nadelKronen.setMatrixAt(ni, m);
      nadelKronen.setColorAt(ni++, o.farbe);
    } else {
      laubKronen.setMatrixAt(li, m);
      laubKronen.setColorAt(li++, o.farbe);
    }
  });
  for (const t of [staemme, laubKronen, nadelKronen]) {
    t.castShadow = true;
    t.receiveShadow = true;
    scene.add(t);
  }
  return R;
}
