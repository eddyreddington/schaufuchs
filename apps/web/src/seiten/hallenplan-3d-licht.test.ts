import { expect, test } from "bun:test";
import { lichtWerte } from "./hallenplan-3d-licht";

const mitte = { x: 10, y: 0, z: 15 };

test("Schatten der Sonne sind hell und weich, damit sie im Bild nicht unruhig wirken", () => {
  const l = lichtWerte(30, mitte);
  // Höchstens halb so dunkel wie ein voller Schatten, mit weichem Rand.
  expect(l.schatten.intensitaet).toBeLessThanOrEqual(0.5);
  expect(l.schatten.intensitaet).toBeGreaterThan(0);
  expect(l.schatten.radius).toBeGreaterThanOrEqual(4);
});

test("Sonne steht hoch (mindestens 65° über dem Horizont): kurze Schatten statt langer Streifen über die Reihen", () => {
  const { position } = lichtWerte(30, mitte).sonne;
  const waagrecht = Math.hypot(position.x - mitte.x, position.z - mitte.z);
  const winkel = (Math.atan2(position.y - mitte.y, waagrecht) * 180) / Math.PI;
  expect(winkel).toBeGreaterThanOrEqual(65);
});

test("Die Halle bleibt so hell wie vorher: Himmel und Sonne zusammen mindestens 3,5", () => {
  const l = lichtWerte(30, mitte);
  expect(l.himmel.staerke + l.sonne.staerke).toBeGreaterThanOrEqual(3.5);
  // Die Sonne überwiegt nicht mehr: das Himmelslicht trägt die Helligkeit.
  expect(l.himmel.staerke).toBeGreaterThan(l.sonne.staerke);
});
