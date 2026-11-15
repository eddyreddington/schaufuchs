import { describe, expect, test } from "bun:test";
import type { KaefigTyp } from "./kaefige";
import {
  nachmeldungsNummern,
  SORTIERUNG_STANDARD,
  sortierungNormal,
  sortierungText,
  vergebeKatalognummern,
  vergleicheFolge,
  type FolgeEintrag,
  type FolgeOptionen,
  type KatalogSortierung,
} from "./katalog";
import { MELDEARTEN } from "./types";

/** Die Ausstellungsfolge bis Version 1.0 (fest verdrahtet) – Maßstab für die Vorgabe. */
function bisher(a: FolgeEintrag, b: FolgeEintrag, opts: FolgeOptionen): number {
  const block = (e: FolgeEintrag) => {
    const f = opts.kaefigFolge;
    if (!f?.length) return 0;
    if (!e.kaefigTyp) return f.length + 1;
    const i = f.indexOf(e.kaefigTyp);
    return i < 0 ? f.length : i;
  };
  const abt = (e: FolgeEintrag) => (!opts.staemmeVorn ? 2 : e.art === "voliere" ? 0 : e.art === "stamm" ? 1 : 2);
  const ges = (g: string) => (g === "1,0" ? 0 : g === "0,1" ? 1 : 2);
  const keys = (e: FolgeEintrag): (number | string)[] => [
    opts.jugendSeparat ? (e.istJugend ? 1 : 0) : 0,
    block(e),
    abt(e),
    e.sparteFolge ?? Number.MAX_SAFE_INTEGER,
    e.rasseFolge ?? Number.MAX_SAFE_INTEGER,
    e.farbFolge ?? Number.MAX_SAFE_INTEGER,
    e.freitext.toLocaleLowerCase("de"),
    MELDEARTEN.indexOf(e.art),
    e.ausstellerName.toLocaleLowerCase("de"),
    e.ausstellerId ?? 1e12 + e.meldungId,
    ges(e.geschlecht),
    e.alter === "jung" ? 0 : 1,
    e.position,
  ];
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) {
    const x = ka[i]!;
    const y = kb[i]!;
    if (x === y) continue;
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "de");
    return (x as number) - (y as number);
  }
  return a.id - b.id;
}

/** Kleiner Zufallsgenerator mit festem Startwert (wiederholbar). */
function zufall(start: number) {
  let s = start;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
}

function zufallsTiere(anzahl: number, startwert: number): FolgeEintrag[] {
  const r = zufall(startwert);
  const namen = ["Abel", "ábel", "Becker", "Zander", "Müller", "Möller"];
  const typen: (KaefigTyp | null)[] = ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm", null];
  return Array.from({ length: anzahl }, (_, i) => {
    const ohneVerzeichnis = r(8) === 0;
    const meldungId = 1 + r(6);
    return {
      id: i + 1,
      sparteFolge: ohneVerzeichnis ? null : r(3),
      rasseFolge: ohneVerzeichnis ? null : r(4),
      farbFolge: ohneVerzeichnis || r(7) === 0 ? null : r(3),
      freitext: ohneVerzeichnis ? ["AOC Zwerg", "aoc huhn", "Neu"][r(3)]! : "",
      art: MELDEARTEN[r(4)]!,
      geschlecht: ["1,0", "0,1", "1,2", "2,0"][r(4)]!,
      alter: r(2) ? "alt" : "jung",
      istJugend: r(5) === 0,
      ausstellerName: namen[meldungId % namen.length]!,
      verein: ["", "RGZV Calau", "rgzv calau", "GZV Ahrensdorf"][r(4)]!,
      ausstellerId: r(9) === 0 ? null : meldungId,
      meldungId,
      position: r(5),
      kaefigTyp: typen[r(typen.length)]!,
    };
  });
}

const t = (id: number, over: Partial<FolgeEintrag> = {}): FolgeEintrag => ({
  id,
  sparteFolge: 1,
  rasseFolge: 1,
  farbFolge: 1,
  freitext: "",
  art: "einzeltier",
  geschlecht: "1,0",
  alter: "jung",
  istJugend: false,
  ausstellerName: "Abel",
  ausstellerId: 1,
  meldungId: 1,
  position: id,
  ...over,
});

/** Folge der Ids nach der Vergabe. */
function folge(tiere: FolgeEintrag[], opts: Partial<FolgeOptionen> = {}): number[] {
  const nr = vergebeKatalognummern(tiere, { start: 1, jugendSeparat: false, ...opts });
  return [...nr.entries()].sort((a, b) => a[1].nr - b[1].nr).map(([id]) => id);
}

const mit = (aenderung: (s: KatalogSortierung) => KatalogSortierung) => aenderung(SORTIERUNG_STANDARD.map((x) => ({ ...x })));
const nachVorn = (s: KatalogSortierung, k: string) => [s.find((x) => x.kriterium === k)!, ...s.filter((x) => x.kriterium !== k)];

describe("Katalogsortierung: Vorgabe", () => {
  test("ergibt exakt die bisherige Ausstellungsfolge (alle Gliederungen, 40 Zufallsschauen)", () => {
    const varianten: FolgeOptionen[] = [];
    for (const jugendSeparat of [false, true])
      for (const staemmeVorn of [false, true])
        for (const kaefigFolge of [null, [], ["tauben", "huehner"] as KaefigTyp[]]) varianten.push({ jugendSeparat, staemmeVorn, kaefigFolge });
    for (let schau = 1; schau <= 40; schau++) {
      const tiere = zufallsTiere(60, schau);
      for (const v of varianten) {
        const erwartet = [...tiere].sort((a, b) => bisher(a, b, v)).map((x) => x.id);
        expect([...tiere].sort((a, b) => vergleicheFolge(a, b, v)).map((x) => x.id)).toEqual(erwartet);
        expect([...tiere].sort((a, b) => vergleicheFolge(a, b, { ...v, sortierung: null })).map((x) => x.id)).toEqual(erwartet);
        expect([...tiere].sort((a, b) => vergleicheFolge(a, b, { ...v, sortierung: SORTIERUNG_STANDARD })).map((x) => x.id)).toEqual(erwartet);
      }
    }
  }, 30_000); // 40 Zufallsschauen: auf dem CI-Runner (begrenzte CPU) über 5 s

  test("Normalisieren: leer, unbekannt, doppelt und fehlend ergibt eine vollständige Liste", () => {
    expect(sortierungNormal(null)).toEqual(SORTIERUNG_STANDARD);
    expect(sortierungNormal([])).toEqual(SORTIERUNG_STANDARD);
    const n = sortierungNormal([{ kriterium: "alter", umgekehrt: true }, { kriterium: "alter" }, { kriterium: "quatsch" as never }, { kriterium: "aussteller", aus: true }]);
    expect(n.map((x) => x.kriterium)).toEqual(["sparte", "rasse", "farbenschlag", "alter", "aussteller", "meldeart", "verein", "ausstellernummer", "geschlecht"]);
    expect(n[3]).toEqual({ kriterium: "alter", umgekehrt: true });
    expect(n[4]).toEqual({ kriterium: "aussteller", aus: true });
  });

  test("Normalisieren: Sparte, Rasse und Farbenschlag bleiben an, vorn und in dieser Reihenfolge", () => {
    const n = sortierungNormal([{ kriterium: "farbenschlag", aus: true }, { kriterium: "geschlecht" }, { kriterium: "rasse" }, { kriterium: "sparte", umgekehrt: true }]);
    expect(n.map((x) => x.kriterium)).toEqual(["sparte", "rasse", "farbenschlag", "geschlecht", "meldeart", "verein", "aussteller", "ausstellernummer", "alter"]);
    expect(n.filter((x) => ["sparte", "rasse", "farbenschlag"].includes(x.kriterium)).every((x) => !x.aus && !x.umgekehrt)).toBe(true);
    // Aussteller hat keine Richtung.
    expect(sortierungNormal([{ kriterium: "aussteller", umgekehrt: true }])[3]).toEqual({ kriterium: "aussteller" });
  });

  test("Text für die Seite Katalognummern", () => {
    expect(sortierungText(null)).toBe("Sparte, Rasse, Farbenschlag, Meldeart (Einzeltier, Stamm, Voliere), Aussteller, Geschlecht (1,0 vor 0,1), Alter (jung vor alt)");
    expect(sortierungText(mit((s) => nachVorn(s, "alter").map((x) => (x.kriterium === "alter" ? { ...x, umgekehrt: true } : x.kriterium === "aussteller" ? { ...x, aus: true } : x))))).toBe(
      "Sparte, Rasse, Farbenschlag, Alter (alt vor jung), Meldeart (Einzeltier, Stamm, Voliere), Geschlecht (1,0 vor 0,1)",
    );
  });
});

describe("Katalogsortierung: Kriterien", () => {
  test("Geschlecht umgekehrt: 0,1 vor 1,0, Stämme und Gruppen dahinter", () => {
    const tiere = [t(1, { geschlecht: "1,0" }), t(2, { geschlecht: "1,2" }), t(3, { geschlecht: "0,1" })];
    expect(folge(tiere)).toEqual([1, 3, 2]);
    expect(folge(tiere, { sortierung: mit((s) => s.map((x) => (x.kriterium === "geschlecht" ? { ...x, umgekehrt: true } : x))) })).toEqual([3, 1, 2]);
  });

  test("Alter umgekehrt: alt vor jung", () => {
    const tiere = [t(1, { alter: "jung" }), t(2, { alter: "alt" })];
    expect(folge(tiere)).toEqual([1, 2]);
    expect(folge(tiere, { sortierung: mit((s) => s.map((x) => (x.kriterium === "alter" ? { ...x, umgekehrt: true } : x))) })).toEqual([2, 1]);
  });

  test("Alter vor Geschlecht: erst alle Jungtiere (1,0 und 0,1), dann die alten", () => {
    const tiere = [t(1, { geschlecht: "0,1", alter: "alt" }), t(2, { geschlecht: "1,0", alter: "alt" }), t(3, { geschlecht: "0,1", alter: "jung" }), t(4, { geschlecht: "1,0", alter: "jung" })];
    expect(folge(tiere)).toEqual([4, 2, 3, 1]);
    const alterVorn = mit((s) => {
      const ohne = s.filter((x) => x.kriterium !== "alter");
      ohne.splice(ohne.findIndex((x) => x.kriterium === "geschlecht"), 0, { kriterium: "alter" });
      return ohne;
    });
    expect(folge(tiere, { sortierung: alterVorn })).toEqual([4, 3, 2, 1]);
  });

  test("Meldeart umgekehrt: Volieren, Stämme, Einzeltiere – Bruteier bleiben am Ende", () => {
    const tiere = [t(1, { art: "bruteier" }), t(2, { art: "einzeltier" }), t(3, { art: "voliere" }), t(4, { art: "stamm" })];
    expect(folge(tiere)).toEqual([2, 4, 3, 1]);
    expect(folge(tiere, { sortierung: mit((s) => s.map((x) => (x.kriterium === "meldeart" ? { ...x, umgekehrt: true } : x))) })).toEqual([3, 4, 2, 1]);
  });

  test("Kein Merkmal vor Sparte, Rasse oder Farbenschlag: Rassen bleiben zusammen (Katalogköpfe, Rassenverzeichnis, Hallenplan)", () => {
    const tiere = [t(1, { rasseFolge: 1, art: "stamm" }), t(2, { rasseFolge: 2, art: "einzeltier", ausstellerName: "Abel" }), t(3, { rasseFolge: 1, art: "einzeltier", ausstellerName: "Zander", ausstellerId: 2 })];
    expect(folge(tiere)).toEqual([3, 1, 2]);
    const vorRasse = mit((s) => ["aussteller", "sparte", "meldeart", "rasse", "farbenschlag", "geschlecht", "alter"].map((k) => s.find((x) => x.kriterium === k)!));
    // Wird zu Sparte, Rasse, Farbenschlag, Aussteller, Meldeart …: Rasse 2 bleibt hinten, in Rasse 1 entscheidet der Aussteller.
    expect(folge(tiere, { sortierung: vorRasse })).toEqual([1, 3, 2]);
  });

  test("Aussteller aus: im Farbenschlag erst alle 1,0, dann alle 0,1 – gleiche Klasse nach Meldeeingang", () => {
    const tiere = [
      t(1, { ausstellerName: "Zander", ausstellerId: 2, meldungId: 1, position: 0, geschlecht: "0,1" }),
      t(2, { ausstellerName: "Zander", ausstellerId: 2, meldungId: 1, position: 1, geschlecht: "1,0" }),
      t(3, { ausstellerName: "Abel", ausstellerId: 1, meldungId: 2, position: 0, geschlecht: "1,0" }),
      t(4, { ausstellerName: "Abel", ausstellerId: 1, meldungId: 2, position: 1, geschlecht: "0,1" }),
    ];
    // Vorgabe: je Aussteller zusammen (Abel vor Zander).
    expect(folge(tiere)).toEqual([3, 4, 2, 1]);
    // Ohne Aussteller: 1,0 vor 0,1, innerhalb nach Meldung (Zanders Meldung kam zuerst).
    expect(folge(tiere, { sortierung: mit((s) => s.map((x) => (x.kriterium === "aussteller" ? { ...x, aus: true } : x))) })).toEqual([2, 3, 1, 4]);
  });

  test("Aussteller hinter dem Geschlecht: alle 1,0 je Aussteller, dann alle 0,1 je Aussteller", () => {
    const tiere = [
      t(1, { ausstellerName: "Zander", ausstellerId: 2, geschlecht: "1,0" }),
      t(2, { ausstellerName: "Zander", ausstellerId: 2, geschlecht: "0,1" }),
      t(3, { ausstellerName: "Abel", ausstellerId: 1, geschlecht: "0,1" }),
      t(4, { ausstellerName: "Abel", ausstellerId: 1, geschlecht: "1,0" }),
    ];
    const hinten = mit((s) => [...s.filter((x) => x.kriterium !== "aussteller"), { kriterium: "aussteller" as const }]);
    expect(folge(tiere, { sortierung: hinten })).toEqual([4, 1, 3, 2]);
  });

  test("Jugend getrennt und Stämme vorn gelten weiter vor der Sortierung", () => {
    const tiere = [t(1, { istJugend: true }), t(2, { art: "stamm", geschlecht: "1,2" }), t(3, { alter: "alt" })];
    const sortierung = mit((s) => s.map((x) => (x.kriterium === "alter" ? { ...x, umgekehrt: true } : x)));
    expect(folge(tiere, { jugendSeparat: true, staemmeVorn: true, sortierung })).toEqual([2, 3, 1]);
  });

  test("Nachmeldungen: Unternummer nach der gewählten Folge, vorhandene Nummern bleiben", () => {
    const sortierung = mit((s) => s.map((x) => (x.kriterium === "geschlecht" ? { ...x, umgekehrt: true } : x)));
    const opts = { start: 1, jugendSeparat: false, sortierung };
    const vorhanden = [
      { ...t(1, { geschlecht: "0,1" }), nr: 1, suffix: "" },
      { ...t(2, { geschlecht: "1,0" }), nr: 2, suffix: "" },
      { ...t(3, { geschlecht: "1,0", farbFolge: 2 }), nr: 3, suffix: "" },
    ];
    const neu = nachmeldungsNummern([t(9, { geschlecht: "0,1", position: 99 }), t(8, { geschlecht: "1,0", position: 98 })], vorhanden, opts);
    // 0,1 gehört (umgekehrt) hinter die vorhandene 0,1 Nr. 1, die 1,0 hinter Nr. 2.
    expect(neu.get(9)).toEqual({ nr: 1, suffix: "a", reihenfolgeVerletzt: false });
    expect(neu.get(8)).toEqual({ nr: 2, suffix: "a", reihenfolgeVerletzt: false });
    expect(vorhanden.map((v) => `${v.nr}${v.suffix}`)).toEqual(["1", "2", "3"]);
  });
});

describe("Katalogsortierung: Verein und Ausstellernummer", () => {
  test("Vorgabe: beide aus, gespeicherte Listen ohne sie bleiben gleich", () => {
    const v = SORTIERUNG_STANDARD.filter((x) => x.kriterium === "verein" || x.kriterium === "ausstellernummer");
    expect(v).toEqual([{ kriterium: "verein", aus: true }, { kriterium: "ausstellernummer", aus: true }]);
    const alt = [{ kriterium: "sparte" }, { kriterium: "rasse" }, { kriterium: "farbenschlag" }, { kriterium: "meldeart" }, { kriterium: "aussteller" }, { kriterium: "geschlecht" }, { kriterium: "alter" }] as KatalogSortierung;
    const n = sortierungNormal(alt);
    expect(n.slice(-2)).toEqual([{ kriterium: "verein", aus: true }, { kriterium: "ausstellernummer", aus: true }]);
    expect(sortierungText(alt)).toBe(sortierungText(null));
  });

  test("Verein an: im Farbenschlag die Tiere eines Vereins zusammen (Schreibweise egal), ohne Verein dahinter", () => {
    const tiere = [
      t(1, { ausstellerName: "Abel", ausstellerId: 1, verein: "GZV Ahrensdorf" }),
      t(2, { ausstellerName: "Becker", ausstellerId: 2, verein: "" }),
      t(3, { ausstellerName: "Zander", ausstellerId: 3, verein: "RGZV Calau" }),
      t(4, { ausstellerName: "Müller", ausstellerId: 4, verein: "rgzv calau" }),
    ];
    expect(folge(tiere)).toEqual([1, 2, 4, 3]);
    const mitVerein = mit((s) => s.map((x) => (x.kriterium === "verein" ? { kriterium: "verein" as const } : x)));
    expect(folge(tiere, { sortierung: mitVerein })).toEqual([1, 4, 3, 2]);
  });

  test("Ausstellernummer statt Name: nach der Nummer des Ausstellers, ohne Nummer dahinter", () => {
    const tiere = [
      t(1, { ausstellerName: "Abel", ausstellerId: 9, meldungId: 1 }),
      t(2, { ausstellerName: "Zander", ausstellerId: 2, meldungId: 2 }),
      t(3, { ausstellerName: "Becker", ausstellerId: null, meldungId: 3 }),
    ];
    expect(folge(tiere)).toEqual([1, 3, 2]);
    const nachNummer = mit((s) => s.map((x) => (x.kriterium === "aussteller" ? { ...x, aus: true } : x.kriterium === "ausstellernummer" ? { kriterium: "ausstellernummer" as const } : x)));
    expect(folge(tiere, { sortierung: nachNummer })).toEqual([2, 1, 3]);
    expect(sortierungText(nachNummer)).toContain("Ausstellernummer");
  });
});
