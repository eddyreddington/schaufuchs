/**
 * Mehrfachauswahl im Hallenplan: mehrere Teile (Reihen, Grundplatten, eingesetzte Teile, Flächen) zusammen verschieben –
 * als eine Änderung der Halle, mit Prüfung auf Hallenwand und andere Teile.
 */
import { describe, expect, test } from "bun:test";
import { HALLE_STANDARD, planeHalle, platteFuer, type Halle, type PlanTier } from "./hallenplan";
import { anKantenEinrasten, auswahlBereinigen, auswahlUmschalten, pruefeVerschiebung, rasterAusrichten, teilSchluessel, verschiebeTeile, type HallenTeil, type PlanKoerper } from "./hallenplan-gruppe";

const halle: Halle = {
  ...HALLE_STANDARD,
  breite: 1000,
  laenge: 2000,
  flaechen: [{ name: "Sitzplätze", art: "sperre", x: 600, y: 100, breite: 300, tiefe: 200 }],
  objekte: [
    { id: "v1", art: "voliere", x: 100, y: 1500, drehung: 0 },
    { id: "b1", art: "kaefigblock", typ: "huehner", x: 400, y: 1500, drehung: 0 },
  ],
  reihenVersatz: [{ nr: 2, dx: 0, dy: 30 }],
  plattenVersatz: [{ reihe: 1, platte: 0, dx: 10, dy: 0, drehung: 90 }],
};

const reihe = (nr: number): HallenTeil => ({ art: "reihe", nr });
const platte = (r: number, i: number): HallenTeil => ({ art: "platte", reihe: r, i });
const objekt = (id: string): HallenTeil => ({ art: "objekt", id });
const flaeche = (i: number): HallenTeil => ({ art: "flaeche", i });

describe("Auswahl", () => {
  test("Umschalten fügt hinzu und nimmt wieder heraus", () => {
    let a: HallenTeil[] = [];
    a = auswahlUmschalten(a, reihe(1));
    a = auswahlUmschalten(a, objekt("v1"));
    expect(a.map(teilSchluessel)).toEqual([teilSchluessel(reihe(1)), teilSchluessel(objekt("v1"))]);
    a = auswahlUmschalten(a, reihe(1));
    expect(a).toEqual([objekt("v1")]);
  });

  test("Bereinigen: doppelte Teile einmal, Grundplatten einer gewählten Reihe gehen mit der Reihe", () => {
    expect(auswahlBereinigen([reihe(1), platte(1, 0), platte(2, 3), reihe(1), objekt("v1")])).toEqual([reihe(1), platte(2, 3), objekt("v1")]);
  });
});

describe("Gruppe verschieben", () => {
  test("alle Teile um denselben Weg – die Abstände untereinander bleiben", () => {
    const neu = verschiebeTeile(halle, [reihe(2), reihe(3), platte(1, 0), platte(1, 4), objekt("v1"), objekt("b1"), flaeche(0)], 50, -20);
    expect(neu.reihenVersatz).toEqual([
      { nr: 2, dx: 50, dy: 10 },
      { nr: 3, dx: 50, dy: -20 },
    ]);
    // Drehung einer Platte bleibt beim Verschieben erhalten.
    expect(neu.plattenVersatz).toEqual([
      { reihe: 1, platte: 0, dx: 60, dy: -20, drehung: 90 },
      { reihe: 1, platte: 4, dx: 50, dy: -20 },
    ]);
    expect(neu.objekte!.map((o) => [o.id, o.x, o.y])).toEqual([
      ["v1", 150, 1480],
      ["b1", 450, 1480],
    ]);
    expect(neu.flaechen[0]).toMatchObject({ x: 650, y: 80, breite: 300, tiefe: 200 });
    // Die Ausgangshalle bleibt unverändert.
    expect(halle.objekte![0]!.x).toBe(100);
  });

  test("eine Grundplatte einer gewählten Reihe wird nicht doppelt verschoben", () => {
    const neu = verschiebeTeile(halle, [reihe(1), platte(1, 0)], 100, 0);
    expect(neu.reihenVersatz!.find((r) => r.nr === 1)).toEqual({ nr: 1, dx: 100, dy: 0 });
    expect(neu.plattenVersatz).toEqual(halle.plattenVersatz!);
  });

  test("zurück an den Ausgangsplatz: der Versatz-Eintrag fällt weg", () => {
    const neu = verschiebeTeile(halle, [reihe(2)], 0, -30);
    expect(neu.reihenVersatz).toEqual([]);
  });

  test("ohne Weg ändert sich nichts", () => {
    expect(verschiebeTeile(halle, [reihe(1), objekt("v1")], 0, 0)).toBe(halle);
  });
});

describe("Prüfung beim Verschieben", () => {
  const groesse = { breite: 1000, laenge: 2000 };
  // Zwei Grundplatten nebeneinander in R1, eine einzelne in R2 und eine Voliere; Volieren im Volierenbereich stehen fest.
  const koerper: PlanKoerper[] = [
    { teil: platte(1, 0), name: "Grundplatte 1 in R1", rechteck: { x: 0, y: 0, b: 70, h: 200 } },
    { teil: platte(1, 1), name: "Grundplatte 2 in R1", rechteck: { x: 0, y: 200, b: 70, h: 200 } },
    { teil: platte(2, 0), name: "Grundplatte 1 in R2", rechteck: { x: 300, y: 0, b: 70, h: 200 } },
    { teil: objekt("v1"), name: "Voliere 1", rechteck: { x: 400, y: 600, b: 200, h: 100 } },
    { teil: null, name: "Voliere Nr. 12", rechteck: { x: 600, y: 1200, b: 200, h: 100 } },
    { teil: flaeche(0), name: "Sitzplätze", rechteck: { x: 600, y: 1600, b: 300, h: 200 }, nurGrenze: true },
  ];

  test("freier Weg: in Ordnung", () => {
    expect(pruefeVerschiebung(groesse, koerper, [reihe(1)], 100, 0)).toEqual({ ok: true });
  });

  test("Gruppe trifft ein anderes Teil: die ganze Gruppe bleibt, Meldung nennt beide", () => {
    const p = pruefeVerschiebung(groesse, koerper, [reihe(1), objekt("v1")], 280, 0);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.grund).toBe("kollision");
    expect(p.meldung).toContain("Grundplatte 1 in R1");
    expect(p.meldung).toContain("Grundplatte 1 in R2");
    expect(p.meldung).toContain("ganze Auswahl");
  });

  test("Teile der Gruppe untereinander stören sich nicht", () => {
    // Beide Platten von R1 rücken zusammen um 200 cm – die zweite landet, wo die erste stand.
    expect(pruefeVerschiebung(groesse, koerper, [platte(1, 0), platte(1, 1)], 0, 200)).toEqual({ ok: true });
  });

  test("Grundplatten gehen mit ihrer Reihe, auch ohne einzeln gewählt zu sein", () => {
    const p = pruefeVerschiebung(groesse, koerper, [reihe(2)], -250, 0);
    expect(p.ok).toBe(false);
  });

  test("Anstoßen ist erlaubt, Überlappen nicht", () => {
    expect(pruefeVerschiebung(groesse, koerper, [platte(2, 0)], -230, 0)).toEqual({ ok: true });
    expect(pruefeVerschiebung(groesse, koerper, [platte(2, 0)], -240, 0).ok).toBe(false);
  });

  test("fest stehende Volieren zählen als Hindernis", () => {
    const p = pruefeVerschiebung(groesse, koerper, [objekt("v1")], 100, 600);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.meldung).toContain("Voliere Nr. 12");
  });

  test("Hallenwand: nichts darf neu über die Wand ragen", () => {
    const p = pruefeVerschiebung(groesse, koerper, [reihe(1), reihe(2)], -10, 0);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.grund).toBe("grenze");
    expect(p.meldung).toContain("Hallenwand");
    expect(pruefeVerschiebung(groesse, koerper, [flaeche(0)], 200, 0).ok).toBe(false);
  });

  test("Flächen nur gegen die Wand geprüft (Volieren dürfen in den Volierenbereich)", () => {
    expect(pruefeVerschiebung(groesse, koerper, [flaeche(0)], 0, -1000)).toEqual({ ok: true });
    expect(pruefeVerschiebung(groesse, koerper, [objekt("v1")], 300, 1000)).toEqual({ ok: true });
  });

  test("was schon vorher überlappt oder über die Wand ragt, lässt sich herausziehen", () => {
    const schief: PlanKoerper[] = [
      { teil: platte(1, 0), name: "A", rechteck: { x: -50, y: 0, b: 70, h: 200 } },
      { teil: platte(2, 0), name: "B", rechteck: { x: 0, y: 100, b: 70, h: 200 } },
    ];
    // A ragt 50 cm über die linke Wand und überlappt B: nach rechts heraus (weniger Überstand) bzw. B nach unten weg.
    expect(pruefeVerschiebung(groesse, [schief[0]!], [platte(1, 0)], 30, 0)).toEqual({ ok: true });
    expect(pruefeVerschiebung(groesse, schief, [platte(2, 0)], 0, 100)).toEqual({ ok: true });
    expect(pruefeVerschiebung(groesse, schief, [platte(1, 0)], 50, 0).ok).toBe(false); // tiefer hinein
  });

  test("ragt etwas schon über eine Wand, darf es nicht zusätzlich über eine zweite", () => {
    const schief: PlanKoerper[] = [{ teil: platte(1, 0), name: "A", rechteck: { x: -20, y: 1850, b: 70, h: 100 } }];
    // 20 cm links über der Wand; nach unten verschoben ragte es zusätzlich 15 cm über die untere Wand.
    expect(pruefeVerschiebung(groesse, schief, [platte(1, 0)], 0, 65).ok).toBe(false);
    expect(pruefeVerschiebung(groesse, schief, [platte(1, 0)], 10, 50)).toEqual({ ok: true });
  });

  test("freie Bereiche und Eingänge sind Hindernisse, aber nicht füreinander", () => {
    const mitFlaechen: PlanKoerper[] = [
      { teil: platte(1, 0), name: "Grundplatte 1 in R1", rechteck: { x: 0, y: 0, b: 70, h: 200 } },
      { teil: flaeche(0), name: "Sitzplätze", rechteck: { x: 300, y: 0, b: 300, h: 200 }, flaeche: true },
      { teil: flaeche(1), name: "Eingang", rechteck: { x: 700, y: 0, b: 200, h: 50 }, flaeche: true },
    ];
    const p = pruefeVerschiebung(groesse, mitFlaechen, [platte(1, 0)], 300, 0);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.meldung).toContain("Sitzplätze");
    // Die Fläche selbst auf die Platte schieben geht ebenso wenig.
    expect(pruefeVerschiebung(groesse, mitFlaechen, [flaeche(0)], -280, 0).ok).toBe(false);
    // Fläche über Fläche (Eingang in den Sitzplätzen) meldet die Prüfung nicht.
    expect(pruefeVerschiebung(groesse, mitFlaechen, [flaeche(1)], -300, 0)).toEqual({ ok: true });
  });

  test("Meldung bei einem einzelnen Teil ohne Hinweis auf die Auswahl", () => {
    const p = pruefeVerschiebung(groesse, koerper, [platte(2, 0)], -300, 0);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.meldung).not.toContain("Auswahl");
  });
});

describe("Am Raster ausrichten", () => {
  const leer: Halle = { ...HALLE_STANDARD, breite: 1000, laenge: 2000, flaechen: [], objekte: [], reihenVersatz: [], plattenVersatz: [] };
  const pl = (r: number, i: number, x: number, y: number, b = 70, h = 200): PlanKoerper => ({ teil: platte(r, i), name: `Grundplatte ${i + 1} in R${r}`, rechteck: { x, y, b, h } });

  test("jede Reihe rückt mit ihrer linken oberen Ecke aufs nächste 10-cm-Raster; Abstände in der Reihe bleiben", () => {
    // R1: zwei Platten ab (13, 7); R2 ab (304, 0) – steht schon an der Wand oben.
    const k = [pl(1, 0, 13, 7), pl(1, 1, 13, 207), pl(2, 0, 304, 0)];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.bewegt).toBe(2);
    expect(e.halle.reihenVersatz).toEqual([
      { nr: 1, dx: -3, dy: 3 },
      { nr: 2, dx: -4, dy: 0 },
    ]);
  });

  test("an der Wand bündig bleibt bündig, auch wenn die Halle kein Vielfaches des Rasters ist", () => {
    const halle = { ...leer, breite: 1005 };
    // Platte rechts bündig an der Wand (935 + 70 = 1005).
    const e = rasterAusrichten(halle, [pl(1, 0, 935, 13)], null);
    expect(e.ok && e.halle.reihenVersatz).toEqual([{ nr: 1, dx: 0, dy: -3 }]);
  });

  test("Rücken an Rücken stehende Reihen (Doppelreihe) rücken gemeinsam – sie bleiben aneinander", () => {
    // R2 bei x 207 (Tiefe 75), R3 direkt dahinter bei x 282: einzeln gerundet stünden sie 210 und 280 – überlappend.
    const k = [pl(2, 0, 207, 0, 75), pl(3, 0, 282, 0, 75)];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok && e.halle.reihenVersatz).toEqual([
      { nr: 2, dx: 3, dy: 0 },
      { nr: 3, dx: 3, dy: 0 },
    ]);
  });

  test("überlappende Reihen gelten nicht als aneinander: jede richtet sich für sich aus, die andere bleibt stehen", () => {
    // R3 um (3, 7) verrutscht und 3 cm in R4 hinein; R4 steht am Raster.
    const k = [pl(3, 0, 3, 7), pl(4, 0, 70, 0)];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok && e.halle.reihenVersatz).toEqual([{ nr: 3, dx: -3, dy: 3 }]);
  });

  test("einzeln verschobene Grundplatte richtet sich für sich aus (zusätzlich zu ihrer Reihe)", () => {
    const halle = { ...leer, plattenVersatz: [{ reihe: 1, platte: 1, dx: 500, dy: 4 }] };
    // R1 Platte 0 bei (13, 0); Platte 1 einzeln verschoben bei (513, 204), berührt nichts.
    const e = rasterAusrichten(halle, [pl(1, 0, 13, 0), pl(1, 1, 513, 204)], null);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.halle.reihenVersatz).toEqual([{ nr: 1, dx: -3, dy: 0 }]);
    // Ziel der Platte: (510, 200) – mit der Reihe rückt sie schon um −3, dazu −0 bzw. −4.
    expect(e.halle.plattenVersatz).toEqual([{ reihe: 1, platte: 1, dx: 500, dy: 0 }]);
  });

  test("nur die gewählten Teile; Flächen und eingesetzte Teile ebenso", () => {
    const halle: Halle = { ...leer, flaechen: [{ name: "Kasse", art: "sperre", x: 602, y: 803, breite: 200, tiefe: 100 }], objekte: [{ id: "v1", art: "voliere", x: 101, y: 1499, drehung: 0 }] };
    const k: PlanKoerper[] = [
      pl(1, 0, 13, 7),
      { teil: flaeche(0), name: "Kasse", rechteck: { x: 602, y: 803, b: 200, h: 100 }, flaeche: true },
      { teil: objekt("v1"), name: "Voliere 1", rechteck: { x: 101, y: 1499, b: 200, h: 100 } },
    ];
    const e = rasterAusrichten(halle, k, [flaeche(0), objekt("v1")]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.halle.reihenVersatz).toEqual([]);
    expect(e.halle.flaechen[0]).toMatchObject({ x: 600, y: 800 });
    expect(e.halle.objekte![0]).toMatchObject({ x: 100, y: 1500 });
  });

  test("Reihe 2 cm vor einer fest stehenden Voliere: rückt bündig an sie statt aufs Raster in sie hinein", () => {
    const k: PlanKoerper[] = [pl(1, 0, 10, 6), { teil: null, name: "Voliere Nr. 5", rechteck: { x: 0, y: 208, b: 72, h: 100 } }];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok && e.halle.reihenVersatz).toEqual([{ nr: 1, dx: 0, dy: 2 }]);
  });

  test("zwei Nachbarn mit kleiner Lücke: der erste rückt an den zweiten, der zweite bleibt (kein Zusammenstoß)", () => {
    const k = [pl(1, 0, 10, 0, 96), pl(2, 0, 110, 0, 100)];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok && e.halle.reihenVersatz).toEqual([{ nr: 1, dx: 4, dy: 0 }]);
  });

  test("alles schon am Raster: nichts bewegt, Halle unverändert", () => {
    const e = rasterAusrichten(leer, [pl(1, 0, 10, 0)], null);
    expect(e).toEqual({ ok: true, halle: leer, bewegt: 0 });
  });

  test("Konflikt: nichts wird verändert, Meldung nennt beide Teile", () => {
    // R1 (x 17–87) steckt schon 2 cm in einer fest stehenden Voliere (ab x 85); aufs Raster (x 20) stäke sie 5 cm darin.
    const k: PlanKoerper[] = [pl(1, 0, 17, 0), { teil: null, name: "Voliere Nr. 5", rechteck: { x: 85, y: 0, b: 75, h: 100 } }];
    const e = rasterAusrichten(leer, k, null);
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.meldung).toContain("Grundplatte 1 in R1");
    expect(e.meldung).toContain("Voliere Nr. 5");
    expect(e.meldung).toContain("nichts verändert");
  });
});

describe("Am Raster ausrichten: Gegenprüfung", () => {
  const leer: Halle = { ...HALLE_STANDARD, breite: 1000, laenge: 2000, flaechen: [], objekte: [], reihenVersatz: [], plattenVersatz: [] };
  const pl = (r: number, i: number, x: number, y: number, b = 70, h = 200): PlanKoerper => ({ teil: platte(r, i), name: `Grundplatte ${i + 1} in R${r}`, rechteck: { x, y, b, h } });

  test("Reihen, die an derselben Bühne enden, richten sich einzeln aus und bleiben an der Bühne", () => {
    const halle: Halle = { ...leer, flaechen: [{ name: "Bühne", art: "sperre", x: 0, y: 1500, breite: 1000, tiefe: 300 }] };
    const k: PlanKoerper[] = [pl(1, 0, 3, 1300), pl(4, 0, 517, 1300), { teil: flaeche(0), name: "Bühne", rechteck: { x: 0, y: 1500, b: 1000, h: 300 }, flaeche: true }];
    const e = rasterAusrichten(halle, k, null);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.bewegt).toBe(2);
    // Quer zur Bühne aufs Raster, entlang (an der Bühne) bleibt alles bündig.
    expect(e.halle.reihenVersatz).toEqual([
      { nr: 1, dx: -3, dy: 0 },
      { nr: 4, dx: 3, dy: 0 },
    ]);
    expect(e.halle.flaechen[0]).toMatchObject({ x: 0, y: 1500 });
  });

  test("nur eine Seite einer Doppelreihe gewählt: sie bleibt an der anderen (kein Spalt, kein Konflikt)", () => {
    const k = [pl(2, 0, 263.3, 0), pl(3, 0, 333.3, 0)];
    for (const gewaehlt of [2, 3]) {
      const e = rasterAusrichten(leer, k, [reihe(gewaehlt)]);
      expect(e).toEqual({ ok: true, halle: leer, bewegt: 0 });
    }
  });

  test("eine gewählte Platte mitten in ihrer Reihe bleibt in der Flucht der Reihe", () => {
    const k = [pl(1, 0, 13, 0), pl(1, 1, 13, 200), pl(1, 2, 13, 400)];
    const e = rasterAusrichten(leer, k, [platte(1, 1)]);
    expect(e).toEqual({ ok: true, halle: leer, bewegt: 0 });
  });
});

describe("Bündig einrasten (Fehlerbericht: Lücken bei 50er-Käfigen)", () => {
  const leer: Halle = { ...HALLE_STANDARD, breite: 1000, laenge: 2000, flaechen: [], objekte: [], reihenVersatz: [], plattenVersatz: [] };
  // Halle wie in der Schau, aus der der Bericht stammt: 15,5 × 27,5 m, Reihen quer, bündig, ohne Wandreihen, Grundplatte 2,10 m.
  const halle: Halle = {
    ...HALLE_STANDARD, breite: 1550, laenge: 2750, gang: 150, richtung: "quer", wandBuendig: true, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" },
    platte: { laenge: 210, tiefe: 70 }, jePlatte: {}, plattenMass: {}, flaechen: [],
  };
  const t = (id: number, typ: PlanTier["typ"]): PlanTier => ({ id, typ, nr: String(id), rasse: "R", sparte: "H", preisrichterId: null });
  const tiere = [t(1, "grosskaefig"), ...Array.from({ length: 30 }, (_, i) => t(10 + i, "zwerghuehner")), ...Array.from({ length: 30 }, (_, i) => t(100 + i, "huehner"))];
  const plan = planeHalle(halle, tiere, {});
  const koerper: PlanKoerper[] = plan.reihen.flatMap((r) => r.platten.map((pl, i) => ({ teil: platte(r.nr, i), name: `Grundplatte ${i + 1} in R${r.nr}`, rechteck: pl.rechteck })));

  test("eine 50er-Grundplatte ist 2,00 m lang (vier Käfige) – auch wenn die Grundplatte der Halle 2,10 m hat", () => {
    expect(platteFuer("zwerghuehner", { breite: 50, tiefe: 50 }, halle)).toEqual({ n: 4, etagen: 1, plaetze: 4, laenge: 200, tiefe: 50 });
  });

  test("die Reihen liegen quer zur Reihe nicht auf ganzen 10 cm (Gänge gleichmäßig verteilt) – im 10-cm-Raster bleibt eine Lücke oder es überlappt", () => {
    const r3 = plan.reihen[2]!.platten[0]!.rechteck;
    const pl = plan.reihen[0]!.platten[1]!.rechteck; // 50er-Platte in R1
    expect(r3.y % 10).not.toBe(0);
    // Platte vor R3 ziehen: bündig wäre y = r3.y − 50; im Raster geht nur 10 cm daneben.
    const buendig = r3.y - pl.h - pl.y;
    const imRaster = [Math.floor(buendig / 10) * 10, Math.ceil(buendig / 10) * 10];
    const ergebnis = imRaster.map((dy) => pruefeVerschiebung(halle, koerper, [platte(1, 1)], -200, dy));
    // Der eine Schritt lässt eine Lücke von mehreren Zentimetern, der andere überlappt (abgelehnt).
    expect(buendig - imRaster[0]!).toBeGreaterThan(5);
    expect(ergebnis[1]!.ok).toBe(false);
    // Mit Einrasten: bündig an R3, ohne Konflikt.
    const w = anKantenEinrasten(halle, koerper, [platte(1, 1)], -200, imRaster[0]!);
    expect(w).toEqual({ dx: -200, dy: buendig });
    expect(pruefeVerschiebung(halle, koerper, [platte(1, 1)], w.dx, w.dy)).toEqual({ ok: true });
  });

  test("Einrasten: Kante neben Kante, Flucht quer dazu, Hallenwand; weiter weg bleibt der Weg", () => {
    const k: PlanKoerper[] = [
      { teil: platte(1, 0), name: "A", rechteck: { x: 0, y: 3.75, b: 200, h: 50 } },
      { teil: platte(2, 0), name: "B", rechteck: { x: 300, y: 0, b: 210, h: 70 } },
    ];
    // A nach rechts: endet 5 cm vor B (x 295) → bündig (300); quer dazu 3,75 neben der Flucht von B → bündig in der Flucht.
    expect(anKantenEinrasten(leer, k, [platte(1, 0)], 95, 0)).toEqual({ dx: 100, dy: -3.75 });
    // Weit weg (über 10 cm von jeder Kante): der Weg bleibt.
    expect(anKantenEinrasten(leer, k, [platte(1, 0)], 40, 300)).toEqual({ dx: 40, dy: 300 });
    // Nahe der Wand: bündig an die Wand.
    expect(anKantenEinrasten(leer, k, [platte(1, 0)], 0, -10)).toEqual({ dx: 0, dy: -3.75 });
  });

  test("Am Raster ausrichten schließt eine kleine Lücke zum Nachbarn statt sie aufs Raster zu runden", () => {
    // Platte A endet 6,25 cm vor B (die nicht gewählt ist und nicht auf dem Raster steht).
    const k: PlanKoerper[] = [
      { teil: platte(1, 0), name: "A", rechteck: { x: 100, y: 10, b: 200, h: 50 } },
      { teil: platte(2, 0), name: "B", rechteck: { x: 306.25, y: 10, b: 210, h: 50 } },
    ];
    const e = rasterAusrichten({ ...leer, plattenVersatz: [{ reihe: 1, platte: 0, dx: 10, dy: 0 }] }, k, [platte(1, 0)]);
    expect(e.ok && e.halle.plattenVersatz).toEqual([{ reihe: 1, platte: 0, dx: 16.25, dy: 0 }]);
  });
});

describe("Flucht in der Linie einer Reihe (Beispiel: Platte 255–257 aus R13 in die Linie von R1 gezogen)", () => {
  // Hallenkoordinaten (Halle quer: x entlang der Reihen, y quer dazu), Werte aus dem Plan der Schau.
  const halle: Halle = { ...HALLE_STANDARD, breite: 1550, laenge: 2750, richtung: "quer", flaechen: [], objekte: [], reihenVersatz: [], plattenVersatz: [{ reihe: 13, platte: 1, dx: 120, dy: -2217.5 }] };
  const koerper: PlanKoerper[] = [
    { teil: platte(1, 0), name: "Grundplatte 1 in R1", rechteck: { x: 200, y: 170, b: 200, h: 100 } },
    { teil: platte(1, 1), name: "Grundplatte 2 in R1", rechteck: { x: 400, y: 170, b: 200, h: 100 } },
    // 255–257: hintere Kante 262,5 statt 270 (7,5 cm neben der Flucht), 20 cm hinter Platte 2 von R1.
    { teil: platte(13, 1), name: "Grundplatte 2 in R13", rechteck: { x: 620, y: 192.5, b: 210, h: 70 } },
  ];

  test("Am Raster ausrichten bringt die Platte in die Flucht der Reihe (hintere Kante wie die Nachbarplatten)", () => {
    const e = rasterAusrichten(halle, koerper, [platte(13, 1)]);
    expect(e.ok && e.halle.plattenVersatz).toEqual([{ reihe: 13, platte: 1, dx: 120, dy: -2210 }]);
  });

  test("beim Ziehen in die Linie einer Reihe rastet sie in deren Flucht ein, auch mit Abstand davor", () => {
    // Von 202,5 (knapp daneben) aus: Flucht der Reihe (hintere Kante 270) liegt 2,5 cm entfernt.
    const k = koerper.map((x) => (x.teil?.art === "platte" && x.teil.reihe === 13 ? { ...x, rechteck: { ...x.rechteck, y: 192.5 } } : x));
    expect(anKantenEinrasten(halle, k, [platte(13, 1)], 0, 10)).toEqual({ dx: 0, dy: 7.5 });
  });
});

describe("Tische und Bänke verschieben", () => {
  const halle = { breite: 1000, laenge: 1000 };
  const tisch: PlanKoerper = { teil: { art: "objekt", id: "t" }, name: "Tisch 1", rechteck: { x: 100, y: 100, b: 220, h: 50 }, moebel: true };
  const cafe: PlanKoerper = { teil: { art: "flaeche", i: 0 }, name: "Cafeteria", rechteck: { x: 400, y: 100, b: 400, h: 300 }, flaeche: true, freiBereich: true };
  const eingang: PlanKoerper = { teil: { art: "flaeche", i: 1 }, name: "E1", rechteck: { x: 0, y: 900, b: 200, h: 100 }, flaeche: true };
  const gang: PlanKoerper = { teil: null, name: "Gang vor R1", rechteck: { x: 100, y: 500, b: 400, h: 150 }, nurMoebel: true };
  const platte: PlanKoerper = { teil: { art: "platte", reihe: 1, i: 0 }, name: "Grundplatte 1 in R1", rechteck: { x: 100, y: 430, b: 210, h: 70 } };
  const alle = [tisch, cafe, eingang, gang, platte];
  const t = [{ art: "objekt" as const, id: "t" }];
  test("in einen freien Bereich ja, auf einen Eingang, in den Gang vor Käfigen oder auf eine Platte nein", () => {
    expect(pruefeVerschiebung(halle, alle, t, 400, 50).ok).toBe(true);
    expect(pruefeVerschiebung(halle, alle, t, -100, 800)).toMatchObject({ ok: false, meldung: expect.stringContaining("„E1“") });
    expect(pruefeVerschiebung(halle, alle, t, 0, 450)).toMatchObject({ ok: false, meldung: expect.stringContaining("Gang vor R1") });
    expect(pruefeVerschiebung(halle, alle, t, 0, 340)).toMatchObject({ ok: false, meldung: expect.stringContaining("Grundplatte 1") });
  });
  test("der Gang vor den Käfigen hält nur Möbel auf: eine Fläche oder Platte darf hinein", () => {
    expect(pruefeVerschiebung(halle, alle, [{ art: "flaeche", i: 0 }], -300, 420).ok).toBe(true);
  });
});
