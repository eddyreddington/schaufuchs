import { expect, test } from "bun:test";
import { HALLE_STANDARD, halleSchluessel, type Halle } from "@schau/domain";
import { vollstaendig } from "./hallenplan-geometrie";

// So legt der Server die Halle ab (HALLE_EINGABE): Tür nur an Eingängen und abweichend, Aussehen und Nummernfolge nur Abweichungen.
const halle: Halle = { ...HALLE_STANDARD, breite: 1500, laenge: 3000, flaechen: [] };
const eingang = { name: "Eingang", art: "eingang" as const, x: 600, y: 0, breite: 300, tiefe: 100 };

test("Entwurf so bereinigt wie der Server: Eingang mit Glastür wird Sperrfläche – derselbe Stand", () => {
  const entwurf = vollstaendig({ ...halle, flaechen: [{ ...eingang, art: "sperre", tuer: "glas" }] });
  expect(entwurf.flaechen[0]).toEqual({ ...eingang, art: "sperre" });
  expect(halleSchluessel(entwurf)).toBe(halleSchluessel({ ...halle, flaechen: [{ ...eingang, art: "sperre" }] }));
  // Tür wie die Vorgabe fällt weg, eine abweichende bleibt.
  expect(vollstaendig({ ...halle, flaechen: [{ ...eingang, tuer: "wand" }] }).flaechen[0]).toEqual(eingang);
  expect(vollstaendig({ ...halle, flaechen: [{ ...eingang, tuer: "holz" }] }).flaechen[0]).toEqual({ ...eingang, tuer: "holz" });
});

test("Aussehen und Nummernfolge wie der Server: nur Abweichungen, ohne Abweichung fällt das Feld weg", () => {
  const entwurf = vollstaendig({ ...halle, aussehen: { boden: "parkett", fenster: true }, nummerFolge: { absteigend: false, schlange: false } });
  expect("aussehen" in entwurf).toBe(false);
  expect("nummerFolge" in entwurf).toBe(false);
  expect(halleSchluessel(entwurf)).toBe(halleSchluessel(halle));
  const mit = vollstaendig({ ...halle, aussehen: { boden: "estrich", fenster: true, prallwand: "#6D8571" }, nummerFolge: { absteigend: true, schlange: false } });
  expect(mit.aussehen).toEqual({ boden: "estrich", prallwand: "#6d8571" });
  expect(mit.nummerFolge).toEqual({ absteigend: true });
});
