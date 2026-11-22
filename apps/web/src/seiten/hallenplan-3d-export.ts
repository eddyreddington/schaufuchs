/** 3D-Modell herunterladen (Entscheidung 028): was in der Ansicht gerade ausgeblendet ist, kommt voll ins Modell. */
import type * as THREE from "three";

/**
 * Stoffe vorübergehend voll deckend (Wände, Prallwand, Fenster, Türen – ausgeblendet nur in der Ansicht). Glas behält seine
 * eigene Deckkraft (`userData.deckkraft`) und bleibt durchsichtig. Gibt zurück, wie es wieder wird.
 */
export function vollDeckend(stoffe: THREE.Material[]): () => void {
  const vorher = stoffe.map((m) => ({ m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }));
  for (const m of stoffe) {
    const eigen = typeof m.userData.deckkraft === "number" ? m.userData.deckkraft : null;
    m.opacity = eigen ?? 1;
    m.transparent = eigen != null;
    m.depthWrite = eigen == null;
  }
  return () => {
    for (const v of vorher) {
      v.m.opacity = v.opacity;
      v.m.transparent = v.transparent;
      v.m.depthWrite = v.depthWrite;
    }
  };
}
