/**
 * Plan neu setzen: Beispielhalle (Rückmeldung 14.11.2026) – Reihen quer, Plan fest, Reihe und Platten verschoben, Reihe
 * gedreht, fehlende Käfige eingesetzt, dann längs und neu gesetzt. Dazu viele Kombinationen der Halle-Einstellungen mit
 * denselben Prüfungen: nichts überschneidet sich oder einen Gang, keine Lücken mitten in Reihen, alle Tiere gestellt oder
 * als ohne Platz gemeldet, eingesetzte Teile nur in den Reihen.
 */
import { describe, expect, test } from "bun:test";
import { blockFront, kaefigKanten, eingangsGang, festschreiben, frontDerReihe, frontFehler, gangVorKaefigen, HALLE_STANDARD, streifenVor, type Blick, istMoebel, planeHalle, teilGroesse, type Halle, type HallenObjekt, type Hallenplan, type PlanTier, type Rechteck } from "./hallenplan";
import { fehlendeEinsetzen } from "./hallenplan-fehlend";
import { pruefeLage, pruefeVerschiebung, type PlanKoerper } from "./hallenplan-gruppe";
import { belegtImPlan, fehlendeImPlan, neuSetzen, vonHandGeplant } from "./hallenplan-neu";
import type { KaefigMasse, KaefigTyp } from "./kaefige";

const T = 0.5;
const ueber = (a: Rechteck, b: Rechteck) => a.x < b.x + b.b - T && b.x < a.x + a.b - T && a.y < b.y + b.h - T && b.y < a.y + a.h - T;
const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - T && q.y >= a.y - T && q.x + q.b <= a.x + a.b + T && q.y + q.h <= a.y + a.h + T;

/** Alles, was an einem neu gesetzten Plan nicht stimmt (leer = sauber). */
function planFehler(halle: Halle, plan: Hallenplan, tiere: PlanTier[], masse: KaefigMasse): string[] {
  const f: string[] = [];
  if (halle.reihenVersatz?.length) f.push("Reihen von Hand verschoben");
  if (halle.plattenVersatz?.length) f.push("Platten von Hand verschoben");
  if (halle.entfernt?.length) f.push("entfernte Plätze");
  const quer = plan.quer;
  const entlang = (q: Rechteck) => (quer ? { von: q.x, bis: q.x + q.b } : { von: q.y, bis: q.y + q.h });
  const abschnitte = plan.reihen.flatMap((r) => r.flaechen.map((a) => ({ r, a })));
  type Teil = { name: string; q: Rechteck; typ?: KaefigTyp; sparte?: string; voll: boolean };
  const teile: Teil[] = [];
  for (const r of plan.reihen) {
    r.platten.forEach((pl, i) => {
      if (pl.entfernt) return;
      const name = `R${r.nr} Platte ${i + 1}`;
      if (!r.flaechen.some((a) => innen(pl.rechteck, a))) f.push(`${name} steht nicht in einem Abschnitt seiner Reihe`);
      const k = r.kaefige.find((x) => x.platte === i);
      teile.push({ name, q: pl.rechteck, typ: pl.typ, sparte: k?.sparte, voll: pl.belegt >= pl.plaetze });
    });
  }
  for (const o of plan.objekte) {
    if (istMoebel(o)) continue;
    const n = o.art === "voliere" ? (o.tier ? 1 : 0) : (o.kaefige?.length ?? 0);
    if (!n) f.push(`${o.name} ist leer`);
    if (!abschnitte.some(({ a }) => innen(o.rechteck, a))) f.push(`${o.name} steht nicht in einer Reihe`);
    teile.push({ name: o.name, q: o.rechteck, typ: o.art === "voliere" ? "voliere" : o.typ, sparte: o.kaefige?.[0]?.sparte ?? o.tier?.sparte, voll: n >= o.plaetze });
  }
  plan.volieren.forEach((v, i) => teile.push({ name: `Voliere ${i + 1}`, q: v.rechteck, voll: true }));
  for (let a = 0; a < teile.length; a++)
    for (let b = a + 1; b < teile.length; b++) if (ueber(teile[a]!.q, teile[b]!.q)) f.push(`${teile[a]!.name} überschneidet ${teile[b]!.name}`);
  const frei = [
    ...halle.flaechen.filter((x) => x.art !== "volieren").map((x) => ({ name: x.name, q: { x: x.x, y: x.y, b: x.breite, h: x.tiefe } })),
    ...halle.flaechen.filter((x) => x.art === "eingang").map((x) => ({ name: `Gang vor ${x.name}`, q: eingangsGang(halle, x) })),
    // Tische und Bänke: nichts steht auf ihnen.
    ...plan.objekte.filter(istMoebel).map((o) => ({ name: o.name, q: o.rechteck })),
  ];
  // Tische und Bänke stehen frei (auch im Gang vor Käfigen, Rückmeldung 14.11.2026), aber nicht aufeinander.
  const moebel = plan.objekte.filter(istMoebel);
  for (const o of moebel) for (const x of moebel) if (x !== o && x.id < o.id && ueber(o.rechteck, x.rechteck)) f.push(`${o.name} überschneidet ${x.name}`);
  for (const t of teile) {
    if (t.q.x < -T || t.q.y < -T || t.q.x + t.q.b > halle.breite + T || t.q.y + t.q.h > halle.laenge + T) f.push(`${t.name} ragt über die Halle hinaus`);
    for (const x of frei) if (ueber(t.q, x.q)) f.push(`${t.name} steht auf ${x.name}`);
  }
  // Keine Lücken mitten in einem Abschnitt einer Reihe: was darin steht, schließt aneinander an (außer dem Gang vor einer
  // neuen Sparte, wenn der Plan das meldet); eine nicht volle Platte steht nur am Ende ihrer Käfigart und Sparte.
  const gangErlaubt = plan.warnungen.some((w) => /folgt die nächste Sparte nach einem Gang/.test(w));
  for (const { r, a } of abschnitte) {
    const drin = teile.filter((t) => innen(t.q, a)).sort((x, y) => entlang(x.q).von - entlang(y.q).von);
    for (let i = 1; i < drin.length; i++) {
      const v = drin[i - 1]!, n = drin[i]!;
      const luecke = entlang(n.q).von - entlang(v.q).bis;
      const spartenGang = gangErlaubt && v.sparte !== n.sparte && Math.abs(luecke - halle.gang) < 1;
      if (luecke > T && !spartenGang) f.push(`R${r.nr}: Lücke von ${Math.round(luecke)} cm zwischen ${v.name} und ${n.name}`);
      if (!v.voll && v.typ === n.typ && v.sparte === n.sparte) f.push(`R${r.nr}: ${v.name} hat freie Plätze mitten in der Reihe`);
    }
  }
  // Jede Käfigfront zeigt zu einem Gang von mindestens Gangbreite: davor keine Wand, keine Platte, kein Block, keine Fläche
  // und keine Voliere (Rückmeldung: Rückwände dicht, vorne offen). Tische und Bänke dürfen davor stehen. Damit stehen Einzelreihen mit dem Rücken
  // zur Wand und Doppelreihen Rücken an Rücken.
  const frontHindernisse = [
    ...teile.filter((t) => !t.name.startsWith("Voliere ") || true).map((t) => ({ name: t.name, q: t.q })),
    ...halle.flaechen.filter((x) => x.art === "sperre").map((x) => ({ name: x.name, q: { x: x.x, y: x.y, b: x.breite, h: x.tiefe } })),
  ];
  const fronten: { name: string; q: Rechteck; blick: Blick }[] = [
    ...plan.reihen.flatMap((r) => r.platten.flatMap((pl, i) => (pl.entfernt ? [] : [{ name: `R${r.nr} Platte ${i + 1}`, q: pl.rechteck, blick: frontDerReihe(r, plan.quer, pl.drehung ?? 0) }]))),
    ...plan.objekte.filter((o) => o.art === "kaefigblock").map((o) => ({ name: o.name, q: o.rechteck, blick: ((o as { front?: Blick }).front ?? blockFront(o.rechteck)) as Blick })),
  ];
  for (const fr of fronten) {
    const st = streifenVor(fr.q, fr.blick, halle.gang);
    if (st.x < -T || st.y < -T || st.x + st.b > halle.breite + T || st.y + st.h > halle.laenge + T) f.push(`${fr.name}: Front zur Wand`);
    for (const h of frontHindernisse) if (h.q !== fr.q && ueber(st, h.q)) f.push(`${fr.name}: Front zu ${h.name}`);
  }
  // Alle Tiere: gestellt oder ohne Platz – und ohne Platz nur, wenn sich wirklich nichts mehr einsetzen lässt.
  const gestellt = [...plan.reihen.flatMap((r) => r.kaefige), ...plan.objekte.flatMap((o) => [...(o.kaefige ?? []), ...(o.tier ? [o.tier] : [])]), ...plan.volieren, ...plan.nichtPlatziert].map((t) => t.id);
  if (gestellt.length !== tiere.length || new Set(gestellt).size !== tiere.length) f.push(`${gestellt.length} statt ${tiere.length} Tiere im Plan`);
  // (Volieren setzt die Software nicht selbst in Reihen – sie brauchen einen Gang rundherum.)
  const ohneKaefig = plan.nichtPlatziert.filter((t) => t.typ !== "voliere");
  if (ohneKaefig.length && fehlendeEinsetzen({ ...plan, nichtPlatziert: ohneKaefig }, halle, masse, belegtImPlan(halle, plan)).einsaetze.length) f.push(`${ohneKaefig.length} ohne Platz, obwohl noch Platz frei ist`);
  if (plan.objekte.some((o) => o.art === "voliere")) f.push("Voliere von selbst eingesetzt");
  return f;
}

/** Die Reihen eines Plans (Tiere und Lage) – zum Vergleich mit und ohne eingesetzte Teile. */
const reihenBild = (p: Hallenplan) => JSON.stringify(p.reihen.map((r) => r.kaefige.map((k) => [k.id, Math.round(k.rechteck.x), Math.round(k.rechteck.y)])));
/**
 * „Alle fehlenden Käfige einsetzen“ im automatischen Plan (ohne eingesetzte Teile) bringt genau so viel unter wie „Plan neu
 * setzen“, mit Volieren mindestens so viel; nach dem Neu-Setzen findet der Knopf nichts mehr. Die eingesetzten Blöcke sind
 * als automatisch gekennzeichnet: der Plan gilt nicht als von Hand geplant (keine Rückfrage beim Ändern der Halle).
 */
function pruefeKnopf(halle: Halle, tiere: PlanTier[], neu: Halle, plan: Hallenplan) {
  const lose = { ...neu, objekte: (neu.objekte ?? []).filter((o) => !o.auto) };
  const ohne = planeHalle(lose, tiere, masse);
  const knopf = fehlendeImPlan(lose, ohne, masse);
  const neuBloecke = (neu.objekte ?? []).filter((o) => o.auto);
  expect(knopf.einsaetze.length).toBe(neuBloecke.length);
  expect(fehlendeImPlan(lose, ohne, masse, { volieren: true }).einsaetze.length).toBeGreaterThanOrEqual(neuBloecke.length);
  expect(fehlendeImPlan(neu, plan, masse).einsaetze).toEqual([]);
  expect(neuBloecke.every((o) => o.art === "kaefigblock")).toBe(true);
  expect(vonHandGeplant(neu)).toBe(false);
  expect(vonHandGeplant(halle)).toBe((halle.objekte ?? []).some((o) => !istMoebel(o)) || !!halle.reihenVersatz?.length || !!halle.plattenVersatz?.length);
}

/** Wo jedes gestellte Tier steht (Reihen und Käfigblöcke). */
const lage = (p: Hallenplan) => new Map([...p.reihen.flatMap((r) => r.kaefige), ...p.objekte.flatMap((o) => o.kaefige ?? [])].map((k) => [k.id, `${Math.round(k.rechteck.x)}/${Math.round(k.rechteck.y)}`]));

/**
 * Festschreiben (das macht der Editor vor dem ersten Verschieben von selbst): Jedes gestellte Tier bleibt, wo es steht –
 * auch in den Käfigblöcken. Tiere ohne Platz und Nachmeldungen kommen auf freie Plätze oder angebaute Platten, nie auf
 * einen eingesetzten Block.
 */
function pruefeFest(halle: Halle, plan: Hallenplan, tiere: PlanTier[]) {
  const fest = festschreiben(halle, plan, masse, "2026-11-14T12:00:00.000Z");
  const nach = [...art(6, "tauben", "Tauben"), ...art(4, "zwerghuehner", "Zwerghühner"), ...art(3, "huehner", "Hühner")];
  const vorher = lage(plan);
  for (const p of [planeHalle(halle, tiere, masse, fest), planeHalle(halle, [...tiere, ...nach], masse, fest)]) {
    expect(p.warnungen.filter((w) => /überschneidet|ragt/.test(w))).toEqual([]);
    const danach = lage(p);
    expect([...vorher].filter(([id, l]) => danach.get(id) !== l)).toEqual([]);
  }
}

// Großkäfige 1 m tief: die Reihen sind 1 m tief (längs wie im Beispiel acht Reihen).
const masse: KaefigMasse = {
  grosskaefig: { breite: 100, tiefe: 100, hoehe: 100 },
  huehner: { breite: 70, tiefe: 70, hoehe: 70 },
  zwerghuehner: { breite: 50, tiefe: 50, hoehe: 50 },
  tauben: { breite: 40, tiefe: 40, hoehe: 40 },
  voliere: { breite: 200, tiefe: 100, hoehe: 180 },
};

let id = 0;
const art = (n: number, typ: KaefigTyp, sparte: string): PlanTier[] =>
  Array.from({ length: n }, () => {
    id++;
    return { id, typ, nr: String(id), rasse: `Rasse ${typ}`, sparte, preisrichterId: null };
  });

// Beispielhalle: 15,5 × 27,5 m, Gang 1,5 m, Hauptgang 3 m an beiden Seiten, Einzelreihen an beiden Wänden; Notausgang
// oben links, Nebeneingang und E2 an der gegenüberliegenden Längswand, E1 an der Stirnwand.
const beispielhalle: Halle = {
  ...HALLE_STANDARD,
  breite: 1550,
  laenge: 2750,
  gang: 150,
  richtung: "quer",
  wandreihen: true,
  wandBuendig: true,
  hauptgang: { breite: 300, lage: "beide" },
  flaechen: [
    { name: "Notausgang", art: "eingang", x: 0, y: 100, breite: 50, tiefe: 120 },
    { name: "Nebeneingang", art: "eingang", x: 1500, y: 600, breite: 50, tiefe: 150 },
    { name: "E2", art: "eingang", x: 1500, y: 800, breite: 50, tiefe: 100 },
    { name: "E1", art: "eingang", x: 1150, y: 2700, breite: 300, tiefe: 50 },
  ],
};
// 271 Tiere: Hühner (auch Großkäfige), Zwerghühner, Tauben, dazu Jugend.
id = 0;
const tiereBeispiel: PlanTier[] = [
  ...art(3, "huehner", "Hühner"),
  ...art(4, "grosskaefig", "Hühner"),
  ...art(55, "huehner", "Hühner"),
  ...art(95, "zwerghuehner", "Zwerghühner"),
  ...art(100, "tauben", "Tauben"),
  ...art(6, "zwerghuehner", "Jugend Zwerghühner"),
  ...art(8, "tauben", "Jugend Tauben"),
];

describe("Plan neu setzen: Beispielhalle von quer auf längs", () => {
  test("Folge wie in einem Beispiel: danach ein sauberer Plan ohne Reste der alten Aufstellung", () => {
    expect(tiereBeispiel).toHaveLength(271);
    // 1. Reihen quer, Plan fest.
    const quer = planeHalle(beispielhalle, tiereBeispiel, masse);
    const fest = festschreiben(beispielhalle, quer, masse, "2026-11-14T10:00:00.000Z");
    // 2. Eine Reihe und Platten von Hand verschoben, eine Reihe gedreht.
    const letzte = quer.reihen.filter((r) => r.platten.length).at(-1)!.nr;
    let halle: Halle = {
      ...beispielhalle,
      reihenVersatz: [{ nr: 2, dx: 0, dy: 40 }, { nr: letzte, dx: 0, dy: 0, drehung: 90 }],
      plattenVersatz: Array.from({ length: 6 }, (_, i) => ({ reihe: 4, platte: i, dx: 30, dy: 0 })),
    };
    // 3. Alle fehlenden Käfige eingesetzt (wie im Editor).
    const mitVersatz = planeHalle(halle, tiereBeispiel, masse, fest);
    const { einsaetze } = fehlendeEinsetzen(mitVersatz, halle, masse, belegtImPlan(halle, mitVersatz));
    // Im festen Plan sind die Reste der Reihen schon mit angebauten Platten belegt. Dazu Käfigblöcke wie in dem Beispielplan quer
    // in den Reihen (im Bild längs senkrecht bei 16 m, 20 m und 24 m).
    const vonHand = [
      ...[300, 500, 700, 900].map((x) => ({ typ: "tauben" as const, x, y: 2400 })),
      ...[1600, 1950, 1990].map((y) => ({ typ: "tauben" as const, x: 900, y })),
      ...[300, 500, 700].map((x) => ({ typ: "zwerghuehner" as const, x, y: 1950 })),
    ];
    halle = {
      ...halle,
      objekte: [
        ...einsaetze.map((e, i) => ({ id: `b${i}`, art: e.art, typ: e.typ, x: e.x, y: e.y, drehung: e.drehung })),
        ...vonHand.map((v, i) => ({ id: `h${i}`, art: "kaefigblock" as const, ...v, drehung: 0 as const })),
      ],
    };
    // So stand es bisher nach „längs“ und „Plan neu setzen“: Blöcke und verschobene Reihen blieben – der Plan ist nicht sauber.
    const bisher: Halle = { ...halle, richtung: "laengs", plattenVersatz: [] };
    expect(planFehler(bisher, planeHalle(bisher, tiereBeispiel, masse), tiereBeispiel, masse).length).toBeGreaterThan(0);
    // 4. Längs und neu gesetzt.
    const { halle: neu, plan, ohne } = neuSetzen({ ...halle, richtung: "laengs" }, tiereBeispiel, masse);
    expect(neu.richtung).toBe("laengs");
    expect(planFehler(neu, plan, tiereBeispiel, masse)).toEqual([]);
    expect(plan.warnungen.filter((w) => /überschneidet|ragt/.test(w))).toEqual([]);
    expect(ohne).toBe(0);
    // Die eingesetzten Teile ändern die Reihen nicht (sie stehen nur, wo die Reihen frei lassen).
    expect(reihenBild(plan)).toBe(reihenBild(planeHalle({ ...neu, objekte: [] }, tiereBeispiel, masse)));
    pruefeFest(neu, plan, tiereBeispiel);
    // Und wieder zurück auf quer: ebenso sauber.
    const zurueck = neuSetzen({ ...neu, richtung: "quer" }, tiereBeispiel, masse);
    expect(planFehler(zurueck.halle, zurueck.plan, tiereBeispiel, masse)).toEqual([]);
    pruefeFest(zurueck.halle, zurueck.plan, tiereBeispiel);
  });

  test("eingesetzte Käfigblöcke ändern die Reihen nicht: die Reihen bleiben lückenlos", () => {
    // Quer, Hauptgang in der Mitte: die Halle läuft über; die Blöcke kommen in die Reste der Reihen (Sparten laufen
    // seit 14.11.2026 ohne Lücke durch, Reste bleiben nur an den Reihenenden).
    const h: Halle = { ...beispielhalle, hauptgang: { breite: 300, lage: "mitte" } };
    id = 1000;
    const viele = [...art(70, "huehner", "Hühner"), ...art(110, "zwerghuehner", "Zwerghühner"), ...art(420, "tauben", "Tauben")];
    const ohneTeile = planeHalle(h, viele, masse);
    expect(ohneTeile.nichtPlatziert.length).toBeGreaterThan(0);
    const { halle, plan } = neuSetzen(h, viele, masse);
    expect(halle.objekte!.length).toBeGreaterThan(0);
    expect(reihenBild(plan)).toBe(reihenBild(ohneTeile));
    expect(planFehler(halle, plan, viele, masse)).toEqual([]);
    pruefeFest(halle, plan, viele);
  });
});

describe("Plan neu setzen: viele Kombinationen der Halle", () => {
  // Zwei Belegungen: passt (271 Tiere) und läuft über (die Halle ist zu klein, dazu Volieren ohne Volierenbereich).
  id = 5000;
  const zuViele = [...art(80, "huehner", "Hühner"), ...art(150, "zwerghuehner", "Zwerghühner"), ...art(400, "tauben", "Tauben"), ...art(12, "tauben", "Jugend Tauben"), ...art(3, "voliere", "Volieren")];
  const lagen = ["anfang", "ende", "beide", "mitte", "keiner"] as const;
  const wand = [{ wandreihen: false }, { wandreihen: true }, { wandreihen: true, wandreiheSeite: "anfang" as const }, { wandreihen: true, wandreiheSeite: "ende" as const }];
  const faelle: { name: string; halle: Halle; tiere: PlanTier[] }[] = [];
  for (const richtung of ["quer", "laengs"] as const)
    for (const lage of lagen)
      for (const w of wand)
        for (const [tn, tiere] of [["271", tiereBeispiel], ["zu viele", zuViele]] as const)
          faelle.push({ name: `${richtung}, Hauptgang ${lage}, ${w.wandreihen ? (w.wandreiheSeite ?? "beide Wände") : "ohne Wandreihen"}, ${tn}`, halle: { ...beispielhalle, richtung, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage }, ...w }, tiere });

  test.each(faelle.map((x) => [x.name, x] as const))("%s", (_n, { halle, tiere }) => {
    // Mit Resten einer alten Aufstellung in der anderen Richtung (verschoben, gedreht, eingesetzt) …
    const andere: Halle = { ...halle, richtung: halle.richtung === "quer" ? "laengs" : "quer" };
    const alt = planeHalle(andere, tiere, masse);
    const { einsaetze } = fehlendeEinsetzen(alt, andere, masse, belegtImPlan(andere, alt));
    const mitResten: Halle = {
      ...halle,
      objekte: [...einsaetze.map((e, i) => ({ id: `a${i}`, art: e.art, typ: e.typ, x: e.x, y: e.y, drehung: e.drehung })), { id: "leer", art: "kaefigblock", typ: "tauben", x: 700, y: 1200, drehung: 90 }],
      reihenVersatz: [{ nr: 3, dx: 0, dy: 50, drehung: 90 }],
      plattenVersatz: [{ reihe: 2, platte: 1, dx: 20, dy: 0 }],
      entfernt: [{ reihe: 1, art: "platte", x: 0, y: 0 }],
    };
    // … neu gesetzt: sauber.
    const { halle: neu, plan } = neuSetzen(mitResten, tiere, masse);
    expect(planFehler(neu, plan, tiere, masse)).toEqual([]);
    expect(reihenBild(plan)).toBe(reihenBild(planeHalle({ ...neu, objekte: [] }, tiere, masse)));
    pruefeFest(neu, plan, tiere);
    // Ohne Reste ebenso.
    const frisch = neuSetzen(halle, tiere, masse);
    expect(planFehler(frisch.halle, frisch.plan, tiere, masse)).toEqual([]);
  });
});

describe("Plan neu setzen: Zufallshallen (Gegenprüfung 14.11.2026)", () => {
  // Feste Folge von Zufallszahlen: jede Halle ist reproduzierbar (Nummer im Testnamen).
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const lagen = ["anfang", "ende", "beide", "mitte", "keiner"] as const;
  const faelle: { i: number; halle: Halle; tiere: PlanTier[] }[] = [];
  for (let i = 0; faelle.length < 300 && i < 5000; i++) {
    id = 100_000 + i * 1000;
    const breite = ri(8, 25) * 100, laenge = ri(15, 45) * 100;
    const tiere = [...art(ri(0, 4), "grosskaefig", "Hühner"), ...art(ri(0, 80), "huehner", "Hühner"), ...art(ri(0, 150), "zwerghuehner", "Zwerghühner"), ...art(ri(0, 300), "tauben", "Tauben"), ...art(ri(0, 20), "tauben", "Jugend"), ...(rnd() < 0.2 ? art(ri(1, 3), "voliere", "Volieren") : [])];
    if (!tiere.length) continue;
    const flaechen: Halle["flaechen"] = [];
    // Freiflächen (Bühne, Kasse …), auch quer über die ganze Halle; dazu manchmal ein Eingang.
    for (let k = ri(0, 3); k > 0; k--) {
      const b = rnd() < 0.3 ? breite : ri(1, 6) * 50, t = ri(1, 6) * 50;
      flaechen.push({ name: `F${k}`, art: "sperre", x: ri(0, (breite - b) / 50) * 50, y: ri(0, (laenge - t) / 50) * 50, breite: b, tiefe: t });
    }
    if (rnd() < 0.5) flaechen.push({ name: "E", art: "eingang", x: 0, y: ri(1, (laenge - 300) / 50) * 50, breite: 50, tiefe: 150 });
    const lage = lagen[ri(0, 4)]!;
    const halle: Halle = { ...HALLE_STANDARD, breite, laenge, gang: [120, 150, 200][ri(0, 2)]!, richtung: rnd() < 0.5 ? "quer" : "laengs", wandreihen: rnd() < 0.7, wandBuendig: rnd() < 0.7, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage }, flaechen };
    // Nur Hallen, in denen etwas überläuft (sonst setzt neuSetzen nichts ein).
    if (planeHalle(halle, tiere, masse).nichtPlatziert.length) faelle.push({ i, halle, tiere });
  }

  test.each(faelle.map((x) => [x.i, x] as const))("Halle %i", (_i, { halle, tiere }) => {
    const ohneTeile = planeHalle(halle, tiere, masse);
    const { halle: neu, plan } = neuSetzen(halle, tiere, masse);
    expect(planFehler(neu, plan, tiere, masse)).toEqual([]);
    expect(reihenBild(plan)).toBe(reihenBild(ohneTeile));
    expect(plan.nichtPlatziert.length).toBeLessThanOrEqual(ohneTeile.nichtPlatziert.length);
    pruefeFest(neu, plan, tiere);
    pruefeKnopf(halle, tiere, neu, plan);
  });
});

describe("Fester Plan: Nachmeldungen nie auf eingesetzte Teile", () => {
  test.each([
    ["Käfigblock, 30 cm Richtung Gang verschoben", { id: "b", art: "kaefigblock" as const, typ: "huehner" as const, dx: 30 }],
    ["Voliere, tiefer als die Reihe", { id: "v", art: "voliere" as const, dx: 0 }],
  ])("%s", (_n, teil) => {
    const halle: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    id = 900_000;
    const tiere = art(6, "huehner", "Hühner");
    const plan = planeHalle(halle, tiere, masse);
    const fest = festschreiben(halle, plan, masse, "2026-11-14T12:00:00.000Z");
    const r1 = plan.reihen[0]!;
    const ende = Math.max(...r1.platten.map((pl) => pl.rechteck.y + pl.rechteck.h));
    const { dx, ...o } = teil;
    const mit: Halle = { ...halle, objekte: [{ ...o, x: r1.platten[0]!.rechteck.x + dx, y: ende, drehung: 90 }] };
    const p = planeHalle(mit, [...tiere, ...art(4, "huehner", "Hühner")], masse, fest);
    expect(p.warnungen.filter((w) => /überschneidet/.test(w))).toEqual([]);
    expect(p.nichtPlatziert.filter((t) => t.typ === "huehner").length + p.reihen[0]!.kaefige.length + p.reihen.slice(1).reduce((n, r) => n + r.kaefige.length, 0) + p.objekte.reduce((n, x) => n + (x.kaefige?.length ?? 0), 0)).toBe(10);
  });
});

describe("Plan neu setzen mit Tischen und Bänken (und Etagen)", () => {
  /** Möbel zufällig in die Halle: nicht in Eingänge, ihren Gang, Volierenbereiche oder aufeinander. */
  const moebelSetzen = (halle: Halle, zahl: number, rnd: () => number, tiere: PlanTier[] = []): HallenObjekt[] => {
    const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
    const aus: HallenObjekt[] = [];
    // Nicht auf Käfige, in eine Tür oder vor einen Ausgang; vor Käfigen und in Gängen dürfen sie stehen.
    const p0 = tiere.length ? planeHalle(halle, tiere, masse) : null;
    const sperre = [
      ...(p0 ? p0.reihen.flatMap((r) => r.platten.map((pl) => pl.rechteck)) : []),
      ...halle.flaechen.filter((x) => x.art !== "sperre").map((x) => ({ x: x.x, y: x.y, b: x.breite, h: x.tiefe })),
      ...halle.flaechen.filter((x) => x.art === "eingang").map((x) => eingangsGang(halle, x)),
    ];
    for (let v = 0; aus.length < zahl && v < 200; v++) {
      const art = (["tisch", "bank", "garnitur", "pokaltisch"] as const)[ri(0, 3)]!;
      const o: HallenObjekt = { id: `m${aus.length}`, art, x: 0, y: 0, drehung: rnd() < 0.5 ? 0 : 90 };
      const { lang, kurz } = teilGroesse(o, halle, masse);
      const [b, h] = o.drehung === 90 ? [kurz, lang] : [lang, kurz];
      o.x = ri(0, Math.floor((halle.breite - b) / 10)) * 10;
      o.y = ri(0, Math.floor((halle.laenge - h) / 10)) * 10;
      const q = { x: o.x, y: o.y, b, h };
      const belegt = [...sperre, ...aus.map((x) => planeHalle({ ...halle, objekte: [x] }, [], masse).objekte[0]!.rechteck)];
      if (belegt.some((x) => ueber(q, x))) continue;
      aus.push(o);
    }
    return aus;
  };

  test("Beispielhalle: Garnituren in der Cafeteria und Tische in der Halle bleiben beim Neu-Setzen, die Reihen bleiben, wie sie sind", () => {
    const cafe: Halle = {
      ...beispielhalle,
      flaechen: [...beispielhalle.flaechen, { name: "Cafeteria", art: "sperre", x: 400, y: 1900, breite: 700, tiefe: 600 }],
      objekte: [
        { id: "g1", art: "garnitur", x: 450, y: 1950, drehung: 0 },
        { id: "g2", art: "garnitur", x: 450, y: 2150, drehung: 0, laenge: 250, tiefe: 60, bankTiefe: 30 },
        { id: "t1", art: "tisch", x: 800, y: 1300, drehung: 90 },
        { id: "b1", art: "bank", x: 300, y: 600, drehung: 0 },
        { id: "alt", art: "kaefigblock", typ: "tauben", x: 700, y: 1200, drehung: 90 },
      ],
    };
    for (const richtung of ["quer", "laengs"] as const) {
      const { halle, plan } = neuSetzen({ ...cafe, richtung }, tiereBeispiel, masse);
      // Möbel unverändert da, der alte Block weg.
      expect(halle.objekte!.filter(istMoebel)).toEqual(cafe.objekte!.filter(istMoebel));
      expect(halle.objekte!.some((o) => o.id === "alt")).toBe(false);
      expect(plan.objekte.filter(istMoebel).map((o) => o.name)).toEqual(["Garnitur 1", "Garnitur 2", "Tisch 1", "Bank 1"]);
      // Die Reihen sind dieselben wie ohne Möbel; die Garnituren in der Cafeteria stören nichts. Tisch und Bank, die jetzt
      // auf Käfigen stehen, meldet der Plan (dort darf man sie nicht hinstellen).
      expect(reihenBild(plan)).toBe(reihenBild(neuSetzen({ ...cafe, richtung, objekte: [] }, tiereBeispiel, masse).plan));
      expect(plan.warnungen.filter((w) => /Garnitur/.test(w))).toEqual([]);
      const ohneTischBank = neuSetzen({ ...cafe, richtung, objekte: cafe.objekte!.filter((o) => o.art === "garnitur") }, tiereBeispiel, masse);
      expect(planFehler(ohneTischBank.halle, ohneTischBank.plan, tiereBeispiel, masse)).toEqual([]);
      pruefeFest(ohneTischBank.halle, ohneTischBank.plan, tiereBeispiel);
    }
    // Garnitur mit eigenen Maßen: 250 lang, 60 + 2 × (30 + 15) = 150 tief.
    const g2 = neuSetzen(cafe, tiereBeispiel, masse).plan.objekte.find((o) => o.id === "g2")!;
    expect([g2.rechteck.b, g2.rechteck.h]).toEqual([250, 150]);
  });

  test("Tisch im Gang vor Käfigen: erlaubt, ohne Hinweis; vor einem Ausgang nur ein Hinweis", () => {
    const plan0 = planeHalle(beispielhalle, tiereBeispiel, masse);
    const fest = festschreiben(beispielhalle, plan0, masse, "2026-11-14T12:00:00.000Z");
    const fluchtwege = beispielhalle.flaechen.filter((x) => x.art === "eingang").map((x) => eingangsGang(beispielhalle, x));
    const g = gangVorKaefigen(plan0, beispielhalle.gang).find((x) => !fluchtwege.some((e) => ueber(e, { ...x.rechteck, b: Math.max(x.rechteck.b, 200), h: Math.max(x.rechteck.h, 200) })))!;
    const mitTisch: Halle = { ...beispielhalle, objekte: [{ id: "t", art: "tisch", x: g.rechteck.x, y: g.rechteck.y, drehung: g.rechteck.b >= g.rechteck.h ? 0 : 90 }] };
    for (const p of [planeHalle(mitTisch, tiereBeispiel, masse, fest), planeHalle(mitTisch, tiereBeispiel, masse)]) expect(p.warnungen.filter((w) => /Tisch/.test(w))).toEqual([]);
    const e1 = eingangsGang(beispielhalle, beispielhalle.flaechen[3]!);
    const vorE1: Halle = { ...beispielhalle, objekte: [{ id: "t", art: "tisch", x: e1.x, y: e1.y, drehung: 0 }] };
    expect(planeHalle(vorE1, tiereBeispiel, masse, fest).warnungen).toContain("Tisch 1 steht im Gang vor „E1“.");
    // In einer Freifläche (Cafeteria) dagegen kein Hinweis.
    const cafe: Halle = { ...beispielhalle, flaechen: [...beispielhalle.flaechen, { name: "Cafeteria", art: "sperre", x: 400, y: 1900, breite: 700, tiefe: 600 }], objekte: [{ id: "t", art: "tisch", x: 500, y: 2000, drehung: 0 }] };
    expect(planeHalle(cafe, tiereBeispiel, masse).warnungen.filter((w) => /Tisch/.test(w))).toEqual([]);
  });

  test("Fester Plan: Nachmeldungen nie auf oder vor einen Tisch am Reihenende", () => {
    const halle: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    id = 950_000;
    const tiere = art(6, "huehner", "Hühner");
    const plan = planeHalle(halle, tiere, masse);
    const fest = festschreiben(halle, plan, masse, "2026-11-14T12:00:00.000Z");
    const r1 = plan.reihen[0]!;
    const ende = Math.max(...r1.platten.map((pl) => pl.rechteck.y + pl.rechteck.h));
    const mit: Halle = { ...halle, objekte: [{ id: "t", art: "tisch", x: r1.platten[0]!.rechteck.x, y: ende + 10, drehung: 90 }] };
    const p = planeHalle(mit, [...tiere, ...art(6, "huehner", "Hühner")], masse, fest);
    expect(p.warnungen.filter((w) => /überschneidet|steht im Gang/.test(w))).toEqual([]);
  });

  // Dieselben 300 Zufallshallen wie oben, dazu bis zu sechs Tische, Bänke, Garnituren und Pokaltische.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let seed2 = 11;
  const rnd2 = () => {
    seed2 = (seed2 * 1103515245 + 12345) % 2147483648;
    return seed2 / 2147483648;
  };
  const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const lagen = ["anfang", "ende", "beide", "mitte", "keiner"] as const;
  const faelle: { i: number; halle: Halle; tiere: PlanTier[] }[] = [];
  for (let i = 0; faelle.length < 300 && i < 5000; i++) {
    id = 100_000 + i * 1000;
    const breite = ri(8, 25) * 100, laenge = ri(15, 45) * 100;
    const tiere = [...art(ri(0, 4), "grosskaefig", "Hühner"), ...art(ri(0, 80), "huehner", "Hühner"), ...art(ri(0, 150), "zwerghuehner", "Zwerghühner"), ...art(ri(0, 300), "tauben", "Tauben"), ...art(ri(0, 20), "tauben", "Jugend"), ...(rnd() < 0.2 ? art(ri(1, 3), "voliere", "Volieren") : [])];
    if (!tiere.length) continue;
    const flaechen: Halle["flaechen"] = [];
    for (let k = ri(0, 3); k > 0; k--) {
      const b = rnd() < 0.3 ? breite : ri(1, 6) * 50, t = ri(1, 6) * 50;
      flaechen.push({ name: `F${k}`, art: "sperre", x: ri(0, (breite - b) / 50) * 50, y: ri(0, (laenge - t) / 50) * 50, breite: b, tiefe: t });
    }
    if (rnd() < 0.5) flaechen.push({ name: "E", art: "eingang", x: 0, y: ri(1, (laenge - 300) / 50) * 50, breite: 50, tiefe: 150 });
    const lage = lagen[ri(0, 4)]!;
    const halle: Halle = { ...HALLE_STANDARD, breite, laenge, gang: [120, 150, 200][ri(0, 2)]!, richtung: rnd() < 0.5 ? "quer" : "laengs", wandreihen: rnd() < 0.7, wandBuendig: rnd() < 0.7, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage }, flaechen };
    // Jede zweite Halle mit Tauben und Zwerghühnern in zwei Etagen.
    if (planeHalle(halle, tiere, masse).nichtPlatziert.length) {
      const mitEtagen: Halle = { ...halle, ...(faelle.length % 2 ? { etagen: { tauben: 2, zwerghuehner: 2 } } : {}) };
      faelle.push({ i, halle: { ...mitEtagen, objekte: moebelSetzen(mitEtagen, Math.floor(rnd2() * 7), rnd2, tiere) }, tiere });
    }
  }

  test("Zufallshallen mit Möbeln: genug Möbel dabei", () => {
    expect(faelle.length).toBe(300);
    expect(faelle.reduce((n, f) => n + f.halle.objekte!.length, 0)).toBeGreaterThan(600);
  });

  test.each(faelle.map((x) => [x.i, x] as const))("Halle %i mit Möbeln", (_i, { halle, tiere }) => {
    // Ohne Etagen läuft jede dieser Hallen über; mit zwei Etagen nicht unbedingt.
    const ohneTeile = planeHalle(halle, tiere, masse);
    // Möbel beeinflussen die Reihen nie (Rückmeldung: Bänke stellen verschiebt keine Käfige).
    expect(reihenBild(ohneTeile)).toBe(reihenBild(planeHalle({ ...halle, objekte: [] }, tiere, masse)));
    const { halle: neu, plan } = neuSetzen(halle, tiere, masse);
    expect(neu.objekte!.filter(istMoebel)).toEqual(halle.objekte!);
    expect(planFehler(neu, plan, tiere, masse)).toEqual([]);
    expect(reihenBild(plan)).toBe(reihenBild(ohneTeile));
    expect(plan.nichtPlatziert.length).toBeLessThanOrEqual(ohneTeile.nichtPlatziert.length);
    pruefeFest(neu, plan, tiere);
    pruefeKnopf(halle, tiere, neu, plan);
  });
});

describe("Automatisch eingesetzte Blöcke (Hauptsitzung 14.11.2026)", () => {
  // Die 271 Tiere passen lückenlos in die Reihen (keine Blöcke nötig) – deshalb eine Halle, die überläuft.
  id = 970_000;
  const ueber = [...art(70, "huehner", "Hühner"), ...art(110, "zwerghuehner", "Zwerghühner"), ...art(420, "tauben", "Tauben")];
  const mitte: Halle = { ...beispielhalle, hauptgang: { breite: 300, lage: "mitte" } };
  test("Neu gesetzt: Blöcke automatisch, Plan nicht von Hand; ein von Hand verschobener Block oder eine verschobene Reihe zählt", () => {
    const { halle } = neuSetzen({ ...mitte, richtung: "quer" }, ueber, masse);
    expect(halle.objekte!.length).toBeGreaterThan(0);
    expect(halle.objekte!.every((o) => o.auto)).toBe(true);
    expect(vonHandGeplant(halle)).toBe(false);
    expect(vonHandGeplant({ ...halle, objekte: [...halle.objekte!, { id: "t", art: "tisch", x: 0, y: 0, drehung: 0 }] })).toBe(false);
    const [erster, ...rest] = halle.objekte!;
    expect(vonHandGeplant({ ...halle, objekte: [{ ...erster!, auto: undefined }, ...rest] })).toBe(true);
    expect(vonHandGeplant({ ...halle, reihenVersatz: [{ nr: 1, dx: 10, dy: 0 }] })).toBe(true);
  });

  test("Einstellung im automatischen Plan ändern = neu setzen: quer (mit Blöcken) und längs, gleich wie „Plan neu setzen“", () => {
    let halle = neuSetzen({ ...mitte, richtung: "quer" }, ueber, masse).halle;
    expect(halle.objekte!.length).toBeGreaterThan(0);
    for (const richtung of ["laengs", "quer", "laengs"] as const) {
      const r = neuSetzen({ ...halle, richtung }, ueber, masse);
      const direkt = neuSetzen({ ...mitte, richtung }, ueber, masse);
      expect(r.halle.objekte).toEqual(direkt.halle.objekte);
      expect(r.ohne).toBe(direkt.ohne);
      halle = r.halle;
    }
  });
});

describe("Käfigfront zum Gang (Rückmeldung 14.11.2026: Rückwände dicht, vorne offen)", () => {
  test("eingesetzte Blöcke bekommen die Front ihrer Reihe (quer und längs)", () => {
    const blicke = new Set<string>();
    id = 960_000;
    const viele = [...art(40, "huehner", "Hühner"), ...art(60, "zwerghuehner", "Zwerghühner"), ...art(300, "tauben", "Tauben")];
    for (const richtung of ["quer", "laengs"] as const)
    for (const breite of [800, 1000, 1200, 1400, 1550])
    for (const lage of ["keiner", "anfang", "beide", "mitte"] as const)
    for (const wandreihen of [true, false]) {
      const { plan } = neuSetzen({ ...beispielhalle, breite, richtung, wandreihen, hauptgang: { breite: lage === "keiner" ? 0 : 300, lage } }, viele, masse);
      for (const o of plan.objekte.filter((x) => x.art === "kaefigblock")) {
        const r = plan.reihen.find((x) => x.flaechen.some((a) => innen(o.rechteck, a)))!;
        expect(o.front).toBe(frontDerReihe(r, plan.quer));
        blicke.add(o.front!);
      }
    }
    expect(blicke.size).toBeGreaterThanOrEqual(2);
  });

  test("Hinweis, wenn ein Block oder eine Reihe von Hand mit der Front zur Wand, oder zu einer Rückwand steht (ein Tisch davor ist erlaubt)", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: true, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [] };
    id = 950_000;
    const tiere = art(60, "huehner", "Hühner");
    const p0 = planeHalle(h, tiere, masse);
    expect(frontFehler(h, p0)).toEqual([]);
    // Block an der linken Wand mit der Front zur Wand.
    const zurWand = planeHalle({ ...h, objekte: [{ id: "b", art: "kaefigblock", typ: "huehner", x: 0, y: 1500, drehung: 90, front: "x-" }] }, tiere, masse);
    expect(zurWand.warnungen.some((w) => /^Block .*: Front zur Wand\.$/.test(w))).toBe(true);
    // Derselbe Block mit der Front zur Halle: kein Hinweis.
    const richtig = planeHalle({ ...h, objekte: [{ id: "b", art: "kaefigblock", typ: "huehner", x: 0, y: 1500, drehung: 90, front: "x+" }] }, tiere, masse);
    expect(frontFehler(h, richtig)).toEqual([]);
    // Ein Tisch direkt vor dem Block: erlaubt (Tische und Bänke stehen frei, Rückmeldung 14.11.2026).
    const tisch = planeHalle({ ...h, objekte: [{ id: "b", art: "kaefigblock", typ: "huehner", x: 0, y: 1500, drehung: 90, front: "x+" }, { id: "t", art: "tisch", x: 80, y: 1500, drehung: 90 }] }, tiere, masse);
    expect(frontFehler(h, tisch)).toEqual([]);
    // Wandreihe R1 um 180° gedreht: Front zur Wand.
    const gedreht = planeHalle({ ...h, reihenVersatz: [{ nr: 1, dx: 0, dy: 0, drehung: 180 }] }, tiere, masse);
    expect(gedreht.warnungen.some((w) => /^R1: Front zur Wand\.$/.test(w))).toBe(true);
    // Doppelreihe R2 (Front zu R1) bis auf 20 cm an R1 geschoben: kein Gang mehr vor ihren Käfigen.
    const r1 = p0.reihen[0]!.platten[0]!.rechteck, r2 = p0.reihen[1]!.platten[0]!.rechteck;
    const zuNah = planeHalle({ ...h, reihenVersatz: [{ nr: 2, dx: r1.x + r1.b + 20 - r2.x, dy: 0 }] }, tiere, masse);
    expect(zuNah.warnungen).toContain("R2: Front zu R1.");
  });
});

describe("Möbel frei setzen, Käfige nie auf Freiflächen (Rückmeldung 14.11.2026)", () => {
  // Wortlaut der Rückmeldung: „wenn man bänke stellt darf nicht automatisch die ganzen käfige verschoben werden … auf freiflächen darf
  // man bänke und möbel setzen keine käfige“.
  const lage = (p: Hallenplan) => JSON.stringify([...p.reihen.flatMap((r) => r.platten.map((pl) => pl.rechteck)), ...p.objekte.filter((o) => !istMoebel(o)).map((o) => o.rechteck), ...p.reihen.flatMap((r) => r.kaefige.map((k) => [k.id, k.rechteck]))]);
  test("eine Bank mitten in den Reihen, im Gang vor Käfigen und im Hauptgang verschiebt keinen Käfig – im losen und im festen Plan", () => {
    const p0 = planeHalle(beispielhalle, tiereBeispiel, masse);
    const fest = festschreiben(beispielhalle, p0, masse, "2026-11-14T12:00:00.000Z");
    const g = gangVorKaefigen(p0, beispielhalle.gang)[3]!;
    for (const bank of [
      { id: "b", art: "bank" as const, x: 700, y: 1200, drehung: 0 as const },
      { id: "b", art: "bank" as const, x: g.rechteck.x, y: g.rechteck.y, drehung: (g.rechteck.b >= g.rechteck.h ? 0 : 90) as 0 | 90 },
      { id: "b", art: "garnitur" as const, x: 500, y: 20, drehung: 0 as const },
    ]) {
      const mit: Halle = { ...beispielhalle, objekte: [bank] };
      expect(lage(planeHalle(mit, tiereBeispiel, masse))).toBe(lage(p0));
      expect(lage(planeHalle(mit, tiereBeispiel, masse, fest))).toBe(lage(planeHalle(beispielhalle, tiereBeispiel, masse, fest)));
      // Neu-Setzen mit der Bank: dieselben Reihen wie ohne.
      expect(reihenBild(neuSetzen(mit, tiereBeispiel, masse).plan)).toBe(reihenBild(neuSetzen(beispielhalle, tiereBeispiel, masse).plan));
    }
  });

  test("Freifläche: Käfige weder durch Planung noch durch Verschieben oder Drehen darauf, Möbel schon", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "laengs", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [{ name: "Bühne", art: "sperre", x: 600, y: 1200, breite: 400, tiefe: 400 }] };
    id = 970_000;
    const tiere = art(80, "huehner", "Hühner");
    const p = planeHalle(h, tiere, masse);
    expect(planFehler(h, p, tiere, masse).filter((x) => /Bühne/.test(x))).toEqual([]);
    const koerper: PlanKoerper[] = [
      { teil: { art: "objekt", id: "b" }, name: "Block", rechteck: { x: 300, y: 1250, b: 70, h: 210 } },
      { teil: { art: "objekt", id: "t" }, name: "Tisch 1", rechteck: { x: 300, y: 1700, b: 80, h: 200 }, moebel: true },
      { teil: { art: "flaeche", i: 0 }, name: "Bühne", rechteck: { x: 600, y: 1200, b: 400, h: 400 }, flaeche: true, freiBereich: true },
      { teil: null, name: "Gang vor „E“", rechteck: { x: 0, y: 1700, b: 200, h: 100 }, flaeche: true, fluchtweg: true },
    ];
    // Block auf die Bühne: abgelehnt. Tisch auf die Bühne: erlaubt.
    expect(pruefeVerschiebung(h, koerper, [{ art: "objekt", id: "b" }], 350, 0)).toMatchObject({ ok: false, grund: "kollision" });
    expect(pruefeVerschiebung(h, koerper, [{ art: "objekt", id: "t" }], 350, -300)).toEqual({ ok: true });
    // Gang vor einem Ausgang: Tisch darf hinein (nur Hinweis im Plan), ein Block nicht.
    expect(pruefeVerschiebung(h, koerper, [{ art: "objekt", id: "t" }], -200, 0)).toEqual({ ok: true });
    expect(pruefeVerschiebung(h, koerper, [{ art: "objekt", id: "b" }], -250, 450)).toMatchObject({ ok: false, grund: "kollision" });
    // Drehen: ein Block, der gedreht auf der Bühne stünde, wird nicht gedreht.
    expect(pruefeLage(h, koerper, { art: "objekt", id: "b" }, { x: 300, y: 1250, b: 350, h: 70 })).toMatchObject({ ok: false, grund: "kollision" });
    expect(pruefeLage(h, koerper, { art: "objekt", id: "b" }, { x: 300, y: 1250, b: 210, h: 70 })).toEqual({ ok: true });
    expect(pruefeLage(h, koerper, { art: "objekt", id: "b" }, { x: 900, y: 100, b: 210, h: 70 })).toMatchObject({ ok: false, grund: "grenze" });
  });
});

describe("Rückwände im Plan (Rückmeldung 14.11.2026: von oben erkennen, wie herum ein Käfig steht)", () => {
  test("Kanten je Frontrichtung: Rückwand gegenüber der Front, Seiten quer dazu", () => {
    const q = { x: 100, y: 200, b: 70, h: 210 };
    expect(kaefigKanten(q, "x+")).toEqual({ front: { x1: 170, y1: 200, x2: 170, y2: 410 }, rueck: { x1: 100, y1: 200, x2: 100, y2: 410 }, seiten: [{ x1: 100, y1: 200, x2: 170, y2: 200 }, { x1: 100, y1: 410, x2: 170, y2: 410 }] });
    expect(kaefigKanten(q, "x-").rueck).toEqual({ x1: 170, y1: 200, x2: 170, y2: 410 });
    const w = { x: 0, y: 0, b: 210, h: 70 };
    expect(kaefigKanten(w, "z+").rueck).toEqual({ x1: 0, y1: 0, x2: 210, y2: 0 });
    expect(kaefigKanten(w, "z-").rueck).toEqual({ x1: 0, y1: 70, x2: 210, y2: 70 });
  });

  test("Wandreihen mit der Rückwand an der Wand, Doppelreihen Rücken an Rücken (eine gemeinsame Linie), quer und längs", () => {
    for (const richtung of ["quer", "laengs"] as const) {
      const p = planeHalle({ ...beispielhalle, richtung }, tiereBeispiel, masse);
      for (const r of p.reihen) {
        for (const pl of r.platten) {
          const k = kaefigKanten(pl.rechteck, frontDerReihe(r, p.quer, pl.drehung ?? 0));
          const aufWand = (s: { x1: number; y1: number; x2: number; y2: number }) => (s.x1 === s.x2 ? Math.abs(s.x1) < 1 || Math.abs(s.x1 - beispielhalle.breite) < 1 : Math.abs(s.y1) < 1 || Math.abs(s.y1 - beispielhalle.laenge) < 1);
          if (r.art === "wand") expect(aufWand(k.rueck)).toBe(true);
          else {
            // Partner: die andere Reihe der Doppelreihe – ihre Rückwand liegt auf derselben Linie.
            const partner = p.reihen.find((x) => x.art === "doppel" && x.nr === (r.front === "links" ? r.nr + 1 : r.nr - 1));
            const pk = partner?.platten[0] ? kaefigKanten(partner.platten[0].rechteck, frontDerReihe(partner, p.quer)) : null;
            if (pk) expect(pk.rueck.x1 === pk.rueck.x2 ? Math.abs(pk.rueck.x1 - k.rueck.x1) < 1 : Math.abs(pk.rueck.y1 - k.rueck.y1) < 1).toBe(true);
          }
        }
      }
    }
  });

  test("Volieren im Volierenbereich: Front zum Gang, auch im festen Plan", () => {
    const h: Halle = { ...HALLE_STANDARD, richtung: "quer", breite: 1000, laenge: 2000, wandreihen: false, hauptgang: { breite: 0, lage: "keiner" }, flaechen: [{ name: "Volieren", art: "volieren", x: 0, y: 1500, breite: 1000, tiefe: 500 }] };
    id = 990_000;
    const tiere = [...art(6, "huehner", "Hühner"), ...art(10, "voliere", "Volieren")];
    const p = planeHalle(h, tiere, masse);
    expect(p.volieren.length).toBeGreaterThan(4);
    for (const v of p.volieren) {
      expect(v.front).toBeDefined();
      // Vor der Front 1,50 m frei (kein Gitter an der Wand oder an einer anderen Voliere).
      const s = streifenVor(v.rechteck, v.front!, 150);
      expect(s.y >= -0.5 && s.y + s.h <= h.laenge + 0.5 && s.x >= -0.5 && s.x + s.b <= h.breite + 0.5).toBe(true);
      expect(p.volieren.some((x) => x !== v && ueber(x.rechteck, s))).toBe(false);
    }
    const fest = planeHalle(h, tiere, masse, festschreiben(h, p, masse, "2026-11-14T19:00:00.000Z"));
    expect(fest.volieren.map((v) => v.front)).toEqual(p.volieren.map((v) => v.front));
  });
});
