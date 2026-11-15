import { describe, expect, test } from "bun:test";
import { MEISTERSCHAFT_VORLAGEN, meisterschaftLesen, werteMeisterschaft, type MeisterschaftTier } from "./meisterschaft";

let n = 0;
/** Tier eines Ausstellers: Wyandotten weiß (Hühner), jung, eigene Zucht, bewertet. */
const tier = (aussteller: number, punkte: number | null, teil: Partial<MeisterschaftTier> = {}): MeisterschaftTier => ({
  id: ++n,
  katalogNr: n,
  ausstellerId: aussteller,
  ausstellerName: `Aussteller ${aussteller}`,
  verein: "GZV Musterdorf",
  vereinsmitglied: true,
  sparte: "Hühner",
  rasse: "Wyandotten",
  farbenschlag: "weiß",
  geschlecht: "1,0",
  alter: "jung",
  punkte,
  eigeneZucht: true,
  istJugend: false,
  preisRang: null,
  ...teil,
});
const henne = (a: number, p: number, teil: Partial<MeisterschaftTier> = {}) => tier(a, p, { geschlecht: "0,1", ...teil });
const zucht = meisterschaftLesen(MEISTERSCHAFT_VORLAGEN.zuchtpreis);

describe("Einzelmeisterschaft (Zuchtpreis: 4 Jungtiere, beide Geschlechter)", () => {
  test("Summe der 4 besten, beide Geschlechter Pflicht: notfalls schwächeres Tier des anderen Geschlechts", () => {
    // Aussteller 1: vier sehr gute Hähne, eine schwache Henne → 3 beste Hähne + Henne.
    const tiere = [tier(1, 97), tier(1, 96), tier(1, 95), tier(1, 95), henne(1, 92)];
    const [g] = werteMeisterschaft(zucht, tiere).gruppen;
    const k = g!.kandidaten[0]!;
    expect(k.summe).toBe(97 + 96 + 95 + 92);
    expect(k.gezaehlt.map((t) => t.geschlecht).sort()).toEqual(["0,1", "1,0", "1,0", "1,0"]);
  });

  test("Alttiere, fremde Zucht und unbewertete Tiere zählen nicht; zu wenige Tiere: keine Wertung", () => {
    const tiere = [tier(2, 97), henne(2, 96, { alter: "alt" }), henne(2, 96, { eigeneZucht: false }), henne(2, 95), tier(2, null), tier(2, 93)];
    const k = werteMeisterschaft(zucht, tiere).gruppen[0]!.kandidaten[0]!;
    expect(k.summe).toBe(97 + 95 + 93);
    expect(k.erfuellt).toBe(false);
    expect(k.grund).toMatch(/4 Tiere/);
  });

  test("Rangfolge je Farbenschlag, Titel nur mit Mindestpunkten", () => {
    const regel = { ...zucht, mindestPunkte: 380 };
    const tiere = [
      ...[tier(3, 96), tier(3, 95), henne(3, 95), henne(3, 94)], // 380
      ...[tier(4, 97), tier(4, 96), henne(4, 96), henne(4, 95)], // 384
      ...[tier(5, 93), tier(5, 93), henne(5, 93), henne(5, 93), tier(5, 90, { farbenschlag: "schwarz" })],
    ];
    const r = werteMeisterschaft(regel, tiere);
    const weiss = r.gruppen.find((g) => g.farbenschlag === "weiß")!;
    expect(weiss.kandidaten.map((k) => [k.ausstellerId, k.rang, k.titel])).toEqual([
      [4, 1, true],
      [3, 2, false],
      [5, 3, false],
    ]);
    expect(weiss.kandidaten[2]!.grund).toMatch(/380/);
  });

  test("Gleichstand: Einzelnoten der Reihe nach, dann Preise; sonst je nach Regel doppelt oder offen", () => {
    const a = [tier(6, 97), tier(6, 93), henne(6, 95), henne(6, 95)]; // 380: 97,95,95,93
    const b = [tier(7, 96), tier(7, 96), henne(7, 95), henne(7, 93)]; // 380: 96,96,95,93
    const [g] = werteMeisterschaft({ ...zucht, gleichstand: ["einzelnoten"] }, [...a, ...b]).gruppen;
    expect(g!.kandidaten.map((k) => k.ausstellerId)).toEqual([6, 7]);
    // Gleiche Noten: der bessere Preis entscheidet (kleinerer Rang = höherer Preis).
    const c = [tier(8, 96, { preisRang: 2 }), tier(8, 95), henne(8, 95), henne(8, 94)];
    const d = [tier(9, 96, { preisRang: 1 }), tier(9, 95), henne(9, 95), henne(9, 94)];
    const [g2] = werteMeisterschaft({ ...zucht, gleichstand: ["einzelnoten", "preise"] }, [...c, ...d]).gruppen;
    expect(g2!.kandidaten.map((k) => k.ausstellerId)).toEqual([9, 8]);
    // Völlig gleich: doppelt → beide Titel; offen → kein Titel, Hinweis.
    const e = [tier(10, 95), tier(10, 95), henne(10, 95), henne(10, 95)];
    const f = [tier(11, 95), tier(11, 95), henne(11, 95), henne(11, 95)];
    const doppelt = werteMeisterschaft({ ...zucht, beiGleichstand: "doppelt" }, [...e, ...f]).gruppen[0]!;
    expect(doppelt.kandidaten.map((k) => [k.rang, k.titel])).toEqual([[1, true], [1, true]]);
    const offen = werteMeisterschaft({ ...zucht, beiGleichstand: "offen" }, [...e, ...f]).gruppen[0]!;
    expect(offen.kandidaten.every((k) => !k.titel)).toBe(true);
    expect(offen.hinweis).toMatch(/Gleichstand/);
  });

  test("Mindestbeteiligung je Farbenschlag und Jugend getrennt", () => {
    const tiere = [tier(12, 95), tier(12, 95), henne(12, 95), henne(12, 95), ...[tier(13, 94), tier(13, 94), henne(13, 94), henne(13, 94)].map((t) => ({ ...t, istJugend: true }))];
    const r = werteMeisterschaft({ ...zucht, mindestAussteller: 2, jugend: "getrennt" }, tiere);
    expect(r.gruppen.map((g) => [g.jugend, g.kandidaten.length, g.hinweis ?? ""])).toEqual([
      [false, 1, expect.stringMatching(/mindestens 2 Aussteller/)],
      [true, 1, expect.stringMatching(/mindestens 2 Aussteller/)],
    ]);
    expect(r.gruppen.every((g) => g.kandidaten.every((k) => !k.titel))).toBe(true);
  });

  test("Tierzahl und Mindestpunkte je Sparte (z. B. Zwerghühner 5)", () => {
    const regel = { ...zucht, sparten: [{ sparte: "Zwerghühner", tiere: 5, mindestPunkte: 472, mindestPunkteJugend: null }] };
    const zw = { sparte: "Zwerghühner", rasse: "Zwerg-Wyandotten" };
    const tiere = [tier(14, 95, zw), tier(14, 95, zw), henne(14, 95, zw), henne(14, 94, zw), henne(14, 93, zw)];
    const k = werteMeisterschaft(regel, tiere).gruppen[0]!.kandidaten[0]!;
    expect(k.gezaehlt).toHaveLength(5);
    expect(k.summe).toBe(472);
    expect(k.titel).toBe(true);
  });
});

describe("Bedingungen und Kriterien", () => {
  test("Höchstens n Alttiere; scheitert die Auswahl daran, sagt der Grund das", () => {
    const regel = { ...zucht, alter: "beide" as const, maxAlttiere: 1 };
    const tiere = [tier(40, 97, { alter: "alt" }), henne(40, 97, { alter: "alt" }), tier(40, 93), henne(40, 92), tier(40, 91)];
    const k = werteMeisterschaft(regel, tiere).gruppen[0]!.kandidaten[0]!;
    expect(k.gezaehlt.filter((t) => t.alter === "alt")).toHaveLength(1);
    expect(k.summe).toBe(97 + 93 + 92 + 91);
    const nurAlt = [tier(41, 95, { alter: "alt" }), henne(41, 95, { alter: "alt" }), tier(41, 95, { alter: "alt" }), henne(41, 95, { alter: "alt" })];
    expect(werteMeisterschaft(regel, nurAlt).gruppen[0]!.kandidaten[0]!.grund).toMatch(/Bedingungen/);
  });

  test("Gleichstand nach bestem Hahn, nach Jungtieren", () => {
    const a = [tier(42, 97), tier(42, 93), henne(42, 95), henne(42, 95)];
    const b = [tier(43, 95), tier(43, 95), henne(43, 96), henne(43, 94)];
    expect(werteMeisterschaft({ ...zucht, gleichstand: ["hahn"] }, [...a, ...b]).gruppen[0]!.kandidaten.map((k) => k.ausstellerId)).toEqual([42, 43]);
    expect(werteMeisterschaft({ ...zucht, gleichstand: ["henne"] }, [...a, ...b]).gruppen[0]!.kandidaten.map((k) => k.ausstellerId)).toEqual([43, 42]);
    const regel = { ...zucht, alter: "beide" as const, gleichstand: ["jung" as const] };
    const c = [tier(44, 95, { alter: "alt" }), tier(44, 95), henne(44, 95), henne(44, 95)];
    const d = [tier(45, 95), tier(45, 95), henne(45, 95), henne(45, 95)];
    expect(werteMeisterschaft(regel, [...c, ...d]).gruppen[0]!.kandidaten.map((k) => k.ausstellerId)).toEqual([45, 44]);
  });

  test("Mindestpunkte Jugend: eigener Wert der Sparte, sonst deren Seniorenwert, sonst der allgemeine", () => {
    const zw = { sparte: "Zwerghühner", rasse: "Zwerg-Wyandotten", istJugend: true };
    const regel = { ...zucht, jugend: "nur" as const, mindestPunkteJugend: 378, sparten: [{ sparte: "Zwerghühner", tiere: 5, mindestPunkte: 474, mindestPunkteJugend: null }] };
    const tiere = [tier(46, 95, zw), tier(46, 95, zw), henne(46, 95, zw), henne(46, 94, zw), henne(46, 94, zw)]; // 473
    expect(werteMeisterschaft(regel, tiere).gruppen[0]!.kandidaten[0]!.grund).toMatch(/474/);
  });

  test("Laufzeit: 10 aus 40 Tieren in kurzer Zeit", () => {
    const regel = { ...zucht, tiere: 10, alter: "beide" as const, maxAlttiere: 3 };
    const viele = Array.from({ length: 40 }, (_, i) => tier(47, 90 + (i % 8), { geschlecht: i % 2 ? "1,0" : "0,1", alter: i % 3 ? "jung" : "alt" }));
    const t0 = performance.now();
    const k = werteMeisterschaft(regel, viele).gruppen[0]!.kandidaten[0]!;
    expect(performance.now() - t0).toBeLessThan(500);
    expect(k.gezaehlt).toHaveLength(10);
    expect(k.gezaehlt.filter((t) => t.alter === "alt").length).toBeLessThanOrEqual(3);
  });
});

describe("Vereinsmeisterschaft (12 Tiere, mindestens 3 Züchter aus 2 Sparten)", () => {
  test("Beste 12 unter den Bedingungen; zu wenige Züchter: keine Wertung", () => {
    const verein = meisterschaftLesen(MEISTERSCHAFT_VORLAGEN.verein);
    const a = (ausst: number, p: number, sparte = "Hühner", v = "GZV A") => tier(ausst, p, { sparte, verein: v });
    // Verein A: Züchter 20 hat 12 sehr gute Hühner, 21 und 22 je 2 Tauben → es müssen 3 Züchter und 2 Sparten hinein.
    const tiere = [...Array.from({ length: 12 }, () => a(20, 96)), a(21, 93, "Tauben"), a(21, 92, "Tauben"), a(22, 91, "Tauben"), a(22, 90)];
    // Verein B: nur ein Züchter.
    tiere.push(...Array.from({ length: 12 }, () => a(30, 97, "Hühner", "GZV B")));
    const r = werteMeisterschaft(verein, tiere);
    const [g] = r.gruppen;
    const va = g!.kandidaten.find((k) => k.name === "GZV A")!;
    expect(va.gezaehlt).toHaveLength(12);
    expect(new Set(va.gezaehlt.map((t) => t.ausstellerId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(va.gezaehlt.map((t) => t.sparte)).size).toBeGreaterThanOrEqual(2);
    expect(va.summe).toBe(10 * 96 + 93 + 91);
    expect(va.titel).toBe(true);
    // Höchstzahl je Züchter gilt auch beim Tausch für eine fehlende Sparte.
    const begrenzt = { ...verein, verein: { ...verein.verein, maxTiereJeZuechter: 6 } };
    const r2 = werteMeisterschaft(begrenzt, [...Array.from({ length: 8 }, () => a(50, 96)), a(50, 95, "Tauben"), ...Array.from({ length: 4 }, () => a(51, 94)), ...Array.from({ length: 4 }, () => a(52, 93))]);
    const k2 = r2.gruppen[0]!.kandidaten[0]!;
    expect(Math.max(...[50, 51, 52].map((z) => k2.gezaehlt.filter((t) => t.ausstellerId === z).length))).toBeLessThanOrEqual(6);
        const vb = g!.kandidaten.find((k) => k.name === "GZV B")!;
    expect(vb.erfuellt).toBe(false);
    expect(vb.grund).toMatch(/3 Züchter/);
  });
});

test("Einlesen: Vorgaben ergänzen, Werte begrenzen", () => {
  const r = meisterschaftLesen({ name: "x".repeat(200), tiere: 99, gleichstand: ["preise", "unsinn", "preise"] });
  expect(r.name).toHaveLength(80);
  expect(r.tiere).toBe(20);
  expect(r.gleichstand).toEqual(["preise"]);
  expect(meisterschaftLesen(undefined).art).toBe("einzel");
});
