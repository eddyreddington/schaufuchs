import { expect, test } from "bun:test";
import * as THREE from "three";
import { vollDeckend } from "./hallenplan-3d-export";

test("3D-Modell: ausgeblendete Wände, Prallwand, Fenster und Türen voll deckend, Glas bleibt durchsichtig; danach wie vorher", () => {
  const wand = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.08, depthWrite: false });
  const tuer = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4, depthWrite: false });
  const glas = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.03, depthWrite: false });
  glas.userData.deckkraft = 0.32;
  const zurueck = vollDeckend([wand, tuer, glas]);
  for (const m of [wand, tuer]) expect([m.opacity, m.transparent, m.depthWrite]).toEqual([1, false, true]);
  expect([glas.opacity, glas.transparent, glas.depthWrite]).toEqual([0.32, true, false]);
  zurueck();
  expect([wand.opacity, wand.transparent, wand.depthWrite]).toEqual([0.08, true, false]);
  expect([tuer.opacity, tuer.transparent, tuer.depthWrite]).toEqual([0.4, true, false]);
  expect([glas.opacity, glas.transparent, glas.depthWrite]).toEqual([0.03, true, false]);
});
