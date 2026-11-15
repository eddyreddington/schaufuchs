/** Reihenfolge der Käfige im Plan (zum Neu-Durchnummerieren nach dem Umstellen). */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, festschreiben, planeHalle, type Halle, type PlanTier } from "./hallenplan";
import { luekenlosAuffuellen, planFolge, planUnordnung } from "./hallenplan-folge";
import type { KaefigTyp } from "./kaefige";

const tier = (id: number, typ: KaefigTyp, sparte = "Hühner"): PlanTier => ({ id, typ, nr: String(id), rasse: "R", sparte, preisrichterId: null });
const viele = (n: number, typ: KaefigTyp, ab: number, sparte?: string) => Array.from({ length: n }, (_, i) => tier(ab + i, typ, sparte));
const basis: Halle = { ...HALLE_STANDARD, wandBuendig: false, hauptgang: { breite: 0, lage: "keiner" }, breite: 1000, laenge: 2000 };
const ids = (n: number, ab = 1) => Array.from({ length: n }, (_, i) => ab + i);

describe("Reihenfolge im Plan", () => {
  for (const richtung of ["quer", "laengs"] as const)
    test(`unveränderter Plan (Reihen ${richtung}): genau die Katalogfolge, auch über Doppelreihen und Sparten`, () => {
      const tiere = [...viele(30, "huehner", 1, "Hühner"), ...viele(20, "zwerghuehner", 31, "Zwerghühner"), ...viele(40, "tauben", 51, "Tauben")];
      const halle = { ...basis, richtung };
      const p = planeHalle(halle, tiere, {});
      expect(p.nichtPlatziert).toEqual([]);
      expect(planFolge(p, richtung)).toEqual(ids(90));
    });

  test("umgestellte Grundplatte: ihre Käfige zählen dort, wo sie jetzt steht", () => {
    const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
    const tiere = viele(6, "huehner", 1);
    const p0 = planeHalle(halle, tiere, {});
    // Reihe R1: Platte 0 (1–3), Platte 1 (4–6). Platte 0 hinter Platte 1 setzen (entlang der Reihe = y).
    const p = planeHalle({ ...halle, plattenVersatz: [{ reihe: 1, platte: 0, dx: 0, dy: 420 }] }, tiere, {});
    expect(planFolge(p0, "laengs")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(planFolge(p, "laengs")).toEqual([4, 5, 6, 1, 2, 3]);
  });

  test("umgestellte Reihe: zählt in der neuen Lage zwischen den anderen", () => {
    const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
    // Drei volle Reihen (je 8 Hühnerplatten = 16,80 m): R1 1–24, R2 25–48, R3 49–72.
    const tiere = viele(72, "huehner", 1, "Hühner");
    const p0 = planeHalle(halle, tiere, {});
    expect(p0.reihen.slice(0, 3).map((r) => r.kaefige.length)).toEqual([24, 24, 24]);
    expect(planFolge(p0, "laengs")).toEqual(ids(72));
    // R1 ganz nach hinten (quer zu den Reihen = x), hinter R3.
    const r3 = p0.reihen[2]!;
    const p = planeHalle({ ...halle, reihenVersatz: [{ nr: 1, dx: r3.x + 300, dy: 0 }] }, tiere, {});
    expect(planFolge(p, "laengs")).toEqual([...ids(48, 25), ...ids(24)]);
  });

  test("Volieren nach den Reihen, eingesetzte Käfigblöcke an ihrer Stelle", () => {
    const masse = { voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false, flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 1700, breite: 600, tiefe: 300 }] };
    const tiere = [tier(1, "voliere", "Ziergeflügel"), ...viele(3, "huehner", 2)];
    const p = planeHalle(halle, tiere, masse);
    expect(planFolge(p, "laengs")).toEqual([2, 3, 4, 1]);
  });
});

describe("Reihenfolge im Plan: Gegenprüfung", () => {
  const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
  // Eigene Reihe je Sparte: R1 Hühner 1–3, R2 Zwerghühner 4–9, R3 Tauben 10–12.
  const tiere = [...viele(3, "huehner", 1, "Hühner"), ...viele(6, "zwerghuehner", 4, "Zwerghühner"), ...viele(3, "tauben", 10, "Tauben")];

  test("gedrehte Platte: ihre Käfige bleiben zusammen, an ihrer Stelle in der Reihe", () => {
    const p = planeHalle({ ...halle, plattenVersatz: [{ reihe: 1, platte: 1, dx: 0, dy: 0, drehung: 90 }] }, viele(9, "huehner", 1), {});
    expect(planFolge(p, "laengs")).toEqual(ids(9));
  });

  test("gedrehte Reihe quer ans Ende einer anderen gestellt: Reihe für Reihe, jede von ihrem Anfang", () => {
    const p = planeHalle({ ...halle, reihenVersatz: [{ nr: 2, dx: 0, dy: 1200, drehung: 90 }] }, tiere, {});
    expect(planFolge(p, "laengs")).toEqual(ids(12));
  });

  test("Volieren in der Folge, in der sie aufgebaut werden (auch bei der langen Seite quer zu den Reihen)", () => {
    const masse = { voliere: { breite: 200, tiefe: 100, hoehe: 180 } };
    const mitBereich: Halle = { ...halle, flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 1200, breite: 1000, tiefe: 800 }] };
    const v = Array.from({ length: 8 }, (_, i) => tier(20 + i, "voliere", "Ziergeflügel"));
    const p = planeHalle(mitBereich, [...viele(3, "huehner", 1), ...v], masse);
    expect(p.volieren).toHaveLength(8);
    expect(planFolge(p, "laengs")).toEqual([1, 2, 3, ...ids(8, 20)]);
  });
});

describe("Lückenlos auffüllen nach dem Umstellen (Rückmeldung: Nummern gemischt, freie Plätze mitten in der Reihe)", () => {
  const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
  const neun = viele(9, "huehner", 1);
  const fest = festschreiben(halle, planeHalle(halle, neun, {}), {}, "x");

  test("Storno mitten in der Reihe: die Tiere rücken in Planfolge nach, die freien Plätze stehen am Ende", () => {
    const tiere = neun.filter((t) => t.id !== 2 && t.id !== 5);
    const vorher = planeHalle(halle, tiere, {}, fest);
    expect(planUnordnung(vorher, "laengs")).toMatchObject({ freiDazwischen: 2 });
    const { fest: neu, verschoben } = luekenlosAuffuellen(fest, vorher, "laengs");
    expect(verschoben).toBe(6); // 3, 4, 6, 7, 8 und 9 rücken nach, die 1 bleibt
    const nachher = planeHalle(halle, tiere, {}, neu);
    const r = nachher.reihen[0]!;
    expect(r.kaefige.map((k) => [k.id, k.y])).toEqual([[1, 150], [3, 220], [4, 290], [6, 360], [7, 430], [8, 500], [9, 570]]);
    expect((r.freiePlaetze ?? []).map((f) => f.y)).toEqual([640, 710]);
    expect(planUnordnung(nachher, "laengs")).toMatchObject({ freiDazwischen: 0 });
  });

  test("nur in Plätze gleicher Größe: ein Zwerghuhn rückt nicht in einen freien Hühnerplatz", () => {
    const halle2: Halle = { ...halle, richtung: "laengs" };
    const tiere = [...viele(3, "huehner", 1), ...viele(4, "zwerghuehner", 10)];
    const f = festschreiben(halle2, planeHalle(halle2, tiere, {}), {}, "x");
    const ohne2 = tiere.filter((t) => t.id !== 2);
    const { fest: neu } = luekenlosAuffuellen(f, planeHalle(halle2, ohne2, {}, f), "laengs");
    const r = planeHalle(halle2, ohne2, {}, neu).reihen[0]!;
    // Huhn 3 rückt auf Platz 2; der freie Hühnerplatz bleibt am Ende der Hühnerplatte, die Zwerghühner bleiben stehen.
    expect(r.kaefige.filter((k) => k.typ === "huehner").map((k) => [k.id, k.y])).toEqual([[1, 150], [3, 220]]);
    expect(r.kaefige.filter((k) => k.typ === "zwerghuehner").map((k) => k.id)).toEqual([10, 11, 12, 13]);
    expect((r.freiePlaetze ?? []).map((f) => `${f.typ}@${f.y}`)).toEqual(["huehner@290"]);
  });

  test("umgestellte Platten: aufgefüllt wird in der Folge, in der die Platten jetzt stehen", () => {
    // Platte 1 (Tiere 1–3) hinter Platte 3 gestellt, Tier 8 storniert: Folge im Plan 4,5,6,7,_,9,1,2,3.
    const versetzt: Halle = { ...halle, plattenVersatz: [{ reihe: 1, platte: 0, dx: 0, dy: 630 }] };
    const tiere = neun.filter((t) => t.id !== 8);
    const vorher = planeHalle(versetzt, tiere, {}, fest);
    expect(planFolge(vorher, "laengs")).toEqual([4, 5, 6, 7, 9, 1, 2, 3]);
    expect(planUnordnung(vorher, "laengs")).toMatchObject({ freiDazwischen: 1, nichtInFolge: 1 });
    const { fest: neu } = luekenlosAuffuellen(fest, vorher, "laengs");
    const nachher = planeHalle(versetzt, tiere, {}, neu);
    expect(planFolge(nachher, "laengs")).toEqual([4, 5, 6, 7, 9, 1, 2, 3]);
    expect(planUnordnung(nachher, "laengs").freiDazwischen).toBe(0);
  });

  test("Nachmeldung auf einem frei gewordenen Platz: nichts zu verschieben, aber die Nummern folgen nicht dem Plan", () => {
    const tiere = [...neun.filter((t) => t.id !== 5), { ...tier(20, "huehner"), nr: "9a" }];
    // 9a kommt auf den freien Platz von 5 (gleiche Reihe) – lückenlos, aber zwischen 4 und 6.
    const p = planeHalle(halle, tiere, {}, fest);
    expect(p.reihen[0]!.kaefige.find((k) => k.id === 20)!.y).toBe(430);
    expect(luekenlosAuffuellen(fest, p, "laengs").verschoben).toBe(0);
    expect(planUnordnung(p, "laengs")).toEqual({ freiDazwischen: 0, nichtInFolge: 1 });
  });

  test("Nummern in Planfolge erkennen (Katalognummern bzw. Käfignummern)", () => {
    const p = planeHalle(halle, neun, {});
    expect(planUnordnung(p, "laengs")).toEqual({ freiDazwischen: 0, nichtInFolge: 0 });
    const vertauscht = neun.map((t) => (t.id === 2 ? { ...t, nr: "5" } : t.id === 5 ? { ...t, nr: "2" } : t));
    // 1, 5, 3, 4, 2, 6 …: zweimal fällt die Nummer (5 → 3, 4 → 2).
    expect(planUnordnung(planeHalle(halle, vertauscht, {}, fest), "laengs").nichtInFolge).toBe(2);
    // Käfignummern zählen, wenn angegeben (Katalog gedruckt).
    const mitKaefig = neun.map((t, i) => ({ ...t, kaefig: String(9 - i) }));
    expect(planUnordnung(planeHalle(halle, mitKaefig, {}, fest), "laengs", true).nichtInFolge).toBe(8);
    // Ohne eigene Käfignummer zählt die Katalognummer (Käfig = Katalognummer).
    expect(planUnordnung(planeHalle(halle, vertauscht, {}, fest), "laengs", true).nichtInFolge).toBe(2);
  });
});

describe("Lückenlos auffüllen nur innerhalb einer Reihe", () => {
  test("Reserveplätze am Ende einer Reihe bleiben – keine Tiere aus der nächsten Reihe (oder Sparte) rücken dorthin", () => {
    const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
    // Eine Reihe, lückenlos: Hühner (4 Tiere: Platte zu 3, die zweite mit 2 freien Plätzen), Zwerghühner, wieder Hühner
    // (Jugend) – die freien Hühnerplätze stehen vor den Zwerghühnern, die Jugend-Hühner rücken nicht darüber nach vorn.
    const tiere = [...viele(4, "huehner", 1, "Hühner"), ...viele(4, "zwerghuehner", 10, "Zwerghühner"), ...viele(3, "huehner", 20, "Hühner Jugend")];
    const plan = planeHalle(halle, tiere, {});
    expect(plan.reihen[0]!.platten.map((pl) => pl.typ)).toEqual(["huehner", "huehner", "zwerghuehner", "huehner"]);
    const fest = festschreiben(halle, plan, {}, "x");
    const p = planeHalle(halle, tiere, {}, fest);
    expect(planUnordnung(p, "laengs")).toEqual({ freiDazwischen: 0, nichtInFolge: 0 });
    expect(luekenlosAuffuellen(fest, p, "laengs").verschoben).toBe(0);
  });

  test("Abmeldung mitten in den Hühnern: aufgefüllt wird nur bis zur nächsten Käfiggröße", () => {
    const halle: Halle = { ...basis, richtung: "laengs", wandreihen: false };
    const tiere = [...viele(4, "huehner", 1, "Hühner"), ...viele(4, "zwerghuehner", 10, "Zwerghühner"), ...viele(3, "huehner", 20, "Hühner Jugend")];
    const fest = festschreiben(halle, planeHalle(halle, tiere, {}), {}, "x");
    const ohne2 = tiere.filter((t) => t.id !== 2);
    const p = planeHalle(halle, ohne2, {}, fest);
    expect(planUnordnung(p, "laengs").freiDazwischen).toBe(1);
    const { fest: neu, verschoben } = luekenlosAuffuellen(fest, p, "laengs");
    // 3 und 4 rücken nach, die Jugend-Hühner bleiben hinter den Zwerghühnern.
    expect(verschoben).toBe(2);
    const danach = planeHalle(halle, ohne2, {}, neu);
    expect(planFolge(danach, "laengs")).toEqual([1, 3, 4, 10, 11, 12, 13, 20, 21, 22]);
    expect(planUnordnung(danach, "laengs").freiDazwischen).toBe(0);
  });
});

describe("Nach Plan nummerieren mit eingesetzten Käfigblöcken (Rückmeldung: Hinweis „nicht in Planfolge“ bleibt)", () => {
  // Längs, eine Doppelreihe: 30 Taubenplätze; was darüber hinaus gemeldet ist, steht in Käfigblöcken (je 5 Plätze).
  const masse = { tauben: { breite: 40, tiefe: 40, hoehe: 40 } };
  const halle: Halle = { ...basis, richtung: "laengs", breite: 440, laenge: 1000, wandreihen: false, flaechen: [] };
  const aufbau = (n: number) => {
    const tauben = viele(n, "tauben", 1, "Tauben");
    return { tauben, fest: festschreiben(halle, planeHalle(halle, tauben, masse), masse, "2026-11-14") };
  };
  /** „Nach Plan nummerieren“ wie der Server: neue Nummern in Planfolge, die Tiere danach in der neuen Nummernfolge. */
  const nummerieren = (h: Halle, liste: PlanTier[], fest: ReturnType<typeof aufbau>["fest"]) => {
    const folge = planFolge(planeHalle(h, liste, masse, fest), "laengs");
    const neu = new Map(folge.map((id, i) => [id, i + 1]));
    return liste.map((t) => ({ ...t, nr: String(neu.get(t.id) ?? 999) })).sort((a, b) => Number(a.nr) - Number(b.nr));
  };
  const zweiBloecke: Halle = { ...halle, objekte: [{ id: "hinten", art: "kaefigblock", typ: "tauben", x: 0, y: 800, drehung: 90 }, { id: "vorn", art: "kaefigblock", typ: "tauben", x: 0, y: 0, drehung: 90 }] };

  test("der zuletzt eingesetzte Block steht im Plan vorn: nach dem Nummerieren folgen die Nummern dem Plan", () => {
    // Zuerst eingesetzt: Block hinten in der Halle; danach einer vorn – im Plan kommt der vordere zuerst.
    const { tauben, fest } = aufbau(40);
    expect(planeHalle(zweiBloecke, tauben, masse, fest).nichtPlatziert).toHaveLength(0);
    const neu = nummerieren(zweiBloecke, tauben, fest);
    expect(planUnordnung(planeHalle(zweiBloecke, neu, masse, fest), "laengs").nichtInFolge).toBe(0);
    // Ein zweites Nummerieren ändert nichts mehr.
    expect(nummerieren(zweiBloecke, neu, fest).map((t) => [t.id, t.nr])).toEqual(neu.map((t) => [t.id, t.nr]));
  });

  test("Nachbau wie im Beispiel: Blöcke, gedrehte Reihe, verschobene Platte – nach dem Nummerieren alles in Planfolge", () => {
    const { tauben, fest } = aufbau(45);
    const h: Halle = {
      ...halle,
      reihenVersatz: [{ nr: 2, dx: 0, dy: 0, drehung: 90 }],
      plattenVersatz: [{ reihe: 1, platte: 2, dx: 60, dy: 0 }],
      objekte: [
        { id: "b1", art: "kaefigblock", typ: "tauben", x: 300, y: 600, drehung: 90 },
        { id: "b2", art: "kaefigblock", typ: "tauben", x: 0, y: 0, drehung: 90 },
        { id: "b3", art: "kaefigblock", typ: "tauben", x: 300, y: 0, drehung: 90 },
      ],
    };
    const nachher = planeHalle(h, nummerieren(h, tauben, fest), masse, fest);
    expect(nachher.nichtPlatziert).toHaveLength(0);
    expect(planUnordnung(nachher, "laengs").nichtInFolge).toBe(0);
  });

  test("Katalog gedruckt: die Käfigplätze folgen dem Plan, auch in den Blöcken", () => {
    const { tauben, fest } = aufbau(40);
    // Käfigplätze 1, 2, 3 … in Planfolge; die Katalognummern bleiben.
    const folge = planFolge(planeHalle(zweiBloecke, tauben, masse, fest), "laengs");
    const platz = new Map(folge.map((id, i) => [id, String(i + 1)]));
    const mitPlatz = tauben.map((t) => ({ ...t, kaefig: platz.get(t.id) ?? null }));
    expect(planUnordnung(planeHalle(zweiBloecke, mitPlatz, masse, fest), "laengs", true).nichtInFolge).toBe(0);
  });
});
