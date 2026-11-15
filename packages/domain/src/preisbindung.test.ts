import { expect, test } from "bun:test";
import { bindungText, passtZuPreisart } from "./preise";

test("Preisart mit Bindung: nur Jugend, nur Senioren, nur Sparte", () => {
  const jugend = { istJugend: true, sparte: "Tauben" };
  const senior = { istJugend: false, sparte: "Hühner" };
  expect(passtZuPreisart({}, jugend)).toBe(true);
  expect(passtZuPreisart({ zielgruppe: "jugend" }, senior)).toBe(false);
  expect(passtZuPreisart({ zielgruppe: "senioren" }, jugend)).toBe(false);
  expect(passtZuPreisart({ zielgruppe: "alle", sparte: "tauben" }, jugend)).toBe(true);
  expect(passtZuPreisart({ sparte: "Tauben" }, senior)).toBe(false);
  expect(bindungText({ zielgruppe: "jugend", sparte: "Tauben" })).toBe("nur Jugend, Sparte Tauben");
  expect(bindungText({ zielgruppe: "alle", sparte: "" })).toBe("");
});
