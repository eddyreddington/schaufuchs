/**
 * Meisterschaftswertungen einer Schau: Summe der besten n Tiere je Aussteller und Rasse/Farbenschlag (Einzelwertung)
 * oder je Verein (Vereinswertung), mit einstellbaren Bedingungen und Gleichstandsregel. Einheitliche Regeln gibt es
 * nicht – AAB, BDRG, Landes- und Kreisverbände drehen an denselben Stellschrauben (Tierzahl je Sparte, Alter,
 * Geschlechter, Mindestpunkte, Mindestbeteiligung, Gleichstand). Rein und getestet. Entscheidung 014.
 */

export const GLEICHSTAND_KRITERIEN = ["einzelnoten", "preise", "hahn", "henne", "jung", "weitere"] as const;
export type GleichstandKriterium = (typeof GLEICHSTAND_KRITERIEN)[number];
export const GLEICHSTAND_LABEL: Record<GleichstandKriterium, string> = {
  einzelnoten: "höhere Einzelnoten der Reihe nach",
  preise: "höhere Preise (Reihenfolge der Preisarten)",
  hahn: "bester Hahn (1,0) vor bester Henne",
  henne: "beste Henne (0,1) vor bestem Hahn",
  jung: "mehr Jungtiere",
  weitere: "weitere Tiere über die Wertung hinaus",
};

export interface SparteRegel {
  /** Name der Sparte wie im Verzeichnis, z. B. „Zwerghühner“. */
  sparte: string;
  tiere: number;
  mindestPunkte: number | null;
  mindestPunkteJugend: number | null;
}

export interface MeisterschaftRegel {
  name: string;
  /** Einzelwertung je Aussteller und Rasse/Farbenschlag, oder Vereinswertung. */
  art: "einzel" | "verein";
  /** Einzelwertung: gewertet je Farbenschlag (Standard) oder je Rasse. */
  einheit: "farbenschlag" | "rasse";
  /** Gewertete Tiere (Standard; je Sparte abweichend in `sparten`). */
  tiere: number;
  mindestPunkte: number | null;
  mindestPunkteJugend: number | null;
  sparten: SparteRegel[];
  /** Nur Jungtiere, oder jung und alt (dann höchstens `maxAlttiere`, null = beliebig; nur Einzelwertung). */
  alter: "jung" | "beide";
  maxAlttiere: number | null;
  /** Beide Geschlechter müssen unter den gewerteten Tieren sein. */
  beideGeschlechter: boolean;
  nurEigeneZucht: boolean;
  /** Jugend gemeinsam mit den Senioren, getrennt gewertet, ausgeschlossen oder nur Jugend. */
  jugend: "gemeinsam" | "getrennt" | "ohne" | "nur";
  /** Nur Mitglieder des eigenen Vereins oder alle Aussteller. */
  berechtigung: "alle" | "vereinsmitglieder";
  /** Mindestbeteiligung je Einheit (Aussteller, Tiere); sonst kein Titel. */
  mindestAussteller: number;
  mindestTiere: number;
  gleichstand: GleichstandKriterium[];
  /** Nach allen Kriterien gleich: beide bekommen den Titel, oder die Ausstellungsleitung entscheidet. */
  beiGleichstand: "doppelt" | "offen";
  verein: { minZuechter: number; minSparten: number; maxTiereJeZuechter: number | null };
}

/** Ein bewertetes Tier für die Wertung (Einzeltiere; Stämme und Volieren zählen nicht). */
export interface MeisterschaftTier {
  id: number;
  katalogNr: number | null;
  ausstellerId: number;
  ausstellerName: string;
  verein: string;
  vereinsmitglied: boolean;
  sparte: string | null;
  rasse: string | null;
  farbenschlag: string | null;
  geschlecht: string;
  alter: "jung" | "alt";
  /** Punkte; Sondernoten (u, o. B.) = 0; null = nicht bewertet (zählt nicht). */
  punkte: number | null;
  eigeneZucht: boolean;
  istJugend: boolean;
  /** Höchster Preis des Tieres als Rang (1 = höchste Preisart), null = kein Preis. */
  preisRang: number | null;
}

const BASIS: MeisterschaftRegel = {
  name: "Meisterschaft",
  art: "einzel",
  einheit: "farbenschlag",
  tiere: 4,
  mindestPunkte: null,
  mindestPunkteJugend: null,
  sparten: [],
  alter: "jung",
  maxAlttiere: null,
  beideGeschlechter: true,
  nurEigeneZucht: true,
  jugend: "gemeinsam",
  berechtigung: "alle",
  mindestAussteller: 1,
  mindestTiere: 0,
  gleichstand: ["einzelnoten", "preise", "weitere"],
  beiGleichstand: "offen",
  verein: { minZuechter: 3, minSparten: 2, maxTiereJeZuechter: null },
};

/**
 * Voreinstellungen aus den Bestimmungen von AAB und BDRG (Stand November 2026). Werte vor jeder Schau mit den
 * aktuellen Bestimmungen abgleichen; Landes- und Kreisverbände stellen ihre Werte selbst ein.
 */
export const MEISTERSCHAFT_VORLAGEN = {
  zuchtpreis: { ...BASIS, name: "Zuchtpreis (AAB): 4 Jungtiere, 1,3 bis 3,1" },
  leistungspreis: { ...BASIS, name: "Leistungspreis (AAB): 6 Tiere, jung und alt", tiere: 6, alter: "beide" },
  bundessieger: {
    ...BASIS,
    name: "Bundessieger (BDRG)",
    tiere: 5,
    alter: "beide",
    sparten: [
      { sparte: "Großgeflügel", tiere: 4, mindestPunkte: null, mindestPunkteJugend: null },
      { sparte: "Wassergeflügel", tiere: 5, mindestPunkte: null, mindestPunkteJugend: null },
    ],
  },
  jugend: {
    ...BASIS,
    name: "Deutsche Jugendmeisterschaft (BDRG)",
    jugend: "nur",
    mindestPunkteJugend: 378,
    sparten: [
      { sparte: "Zwerghühner", tiere: 5, mindestPunkte: null, mindestPunkteJugend: 472 },
      { sparte: "Tauben", tiere: 5, mindestPunkte: null, mindestPunkteJugend: 472 },
    ],
  },
  verein: { ...BASIS, name: "Vereinsmeisterschaft: 12 Tiere, 3 Züchter, 2 Sparten", art: "verein", tiere: 12, alter: "beide", beideGeschlechter: false },
} satisfies Record<string, MeisterschaftRegel>;
export type MeisterschaftVorlage = keyof typeof MEISTERSCHAFT_VORLAGEN;

const zahl = (w: unknown, min: number, max: number, vorgabe: number) => (typeof w === "number" && Number.isFinite(w) ? Math.min(max, Math.max(min, Math.round(w))) : vorgabe);
const zahlOder = (w: unknown, min: number, max: number) => (w == null || w === "" ? null : zahl(w, min, max, min));
const text = (w: unknown, max: number, vorgabe: string) => (typeof w === "string" && w.trim() ? w.trim().slice(0, max) : vorgabe);
const eins = <T extends string>(w: unknown, werte: readonly T[], vorgabe: T): T => (werte.includes(w as T) ? (w as T) : vorgabe);

/** Gespeicherte Regel in eine gültige bringen; Fehlendes gilt als Vorgabe. */
export function meisterschaftLesen(roh: unknown): MeisterschaftRegel {
  const r = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  const v = r.verein && typeof r.verein === "object" ? (r.verein as Record<string, unknown>) : {};
  const sparten = Array.isArray(r.sparten) ? r.sparten : [];
  const kriterien = Array.isArray(r.gleichstand) ? r.gleichstand.filter((k): k is GleichstandKriterium => GLEICHSTAND_KRITERIEN.includes(k)) : BASIS.gleichstand;
  return {
    name: text(r.name, 80, BASIS.name),
    art: eins(r.art, ["einzel", "verein"], "einzel"),
    einheit: eins(r.einheit, ["farbenschlag", "rasse"], "farbenschlag"),
    tiere: zahl(r.tiere, 1, 20, BASIS.tiere),
    mindestPunkte: zahlOder(r.mindestPunkte, 0, 2000),
    mindestPunkteJugend: zahlOder(r.mindestPunkteJugend, 0, 2000),
    sparten: sparten
      .slice(0, 12)
      .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
      .filter((s) => typeof s.sparte === "string" && s.sparte.trim())
      .map((s) => ({ sparte: text(s.sparte, 60, ""), tiere: zahl(s.tiere, 1, 20, BASIS.tiere), mindestPunkte: zahlOder(s.mindestPunkte, 0, 2000), mindestPunkteJugend: zahlOder(s.mindestPunkteJugend, 0, 2000) })),
    alter: eins(r.alter, ["jung", "beide"], "jung"),
    maxAlttiere: zahlOder(r.maxAlttiere, 0, 20),
    beideGeschlechter: r.beideGeschlechter !== false,
    nurEigeneZucht: r.nurEigeneZucht !== false,
    jugend: eins(r.jugend, ["gemeinsam", "getrennt", "ohne", "nur"], "gemeinsam"),
    berechtigung: eins(r.berechtigung, ["alle", "vereinsmitglieder"], "alle"),
    mindestAussteller: zahl(r.mindestAussteller, 1, 50, 1),
    mindestTiere: zahl(r.mindestTiere, 0, 500, 0),
    gleichstand: [...new Set(kriterien)],
    beiGleichstand: eins(r.beiGleichstand, ["doppelt", "offen"], "offen"),
    verein: { minZuechter: zahl(v.minZuechter, 1, 20, 3), minSparten: zahl(v.minSparten, 1, 10, 2), maxTiereJeZuechter: zahlOder(v.maxTiereJeZuechter, 1, 50) },
  };
}

export interface Kandidat {
  /** Aussteller (Einzelwertung) bzw. erster Züchter (Vereinswertung). */
  ausstellerId: number;
  name: string;
  gezaehlt: MeisterschaftTier[];
  summe: number;
  /** Vollständig gewertet (Tierzahl, Geschlechter, Vereinsbedingungen) – bekommt einen Platz. */
  gewertet: boolean;
  /** Dazu die Mindestpunktzahl erreicht – kann den Titel bekommen. */
  erfuellt: boolean;
  grund: string | null;
  rang: number | null;
  titel: boolean;
}

export interface Gruppe {
  sparte: string;
  rasse: string;
  farbenschlag: string;
  jugend: boolean;
  kandidaten: Kandidat[];
  hinweis: string | null;
}

/** Wertet eine Meisterschaft aus. Gruppen in Katalogfolge der Tiere, Kandidaten nach Rang. */
export function werteMeisterschaft(regel: MeisterschaftRegel, alle: MeisterschaftTier[]): { gruppen: Gruppe[] } {
  const tiere = alle
    .filter((t) => t.punkte != null && t.rasse && t.sparte)
    .filter((t) => (regel.nurEigeneZucht ? t.eigeneZucht : true))
    .filter((t) => (regel.alter === "jung" ? t.alter === "jung" : true))
    .filter((t) => (regel.berechtigung === "vereinsmitglieder" ? t.vereinsmitglied : true))
    .filter((t) => (regel.jugend === "ohne" ? !t.istJugend : regel.jugend === "nur" ? t.istJugend : true));
  const jugendTeile = regel.jugend === "getrennt" ? [false, true] : [regel.jugend === "nur"];
  const gruppen: Gruppe[] = [];
  for (const jugend of jugendTeile) {
    const teil = regel.jugend === "getrennt" ? tiere.filter((t) => t.istJugend === jugend) : tiere;
    if (regel.art === "verein") {
      gruppen.push(vereinsgruppe(regel, teil, jugend));
      continue;
    }
    const schluessel = (t: MeisterschaftTier) => [t.sparte, t.rasse, regel.einheit === "farbenschlag" ? t.farbenschlag : ""].join("\u0001");
    for (const key of [...new Set(teil.map(schluessel))]) {
      const einheit = teil.filter((t) => schluessel(t) === key);
      const [sparte, rasse, farbenschlag] = key.split("\u0001") as [string, string, string];
      const sr = regel.sparten.find((s) => s.sparte.toLowerCase() === sparte.toLowerCase());
      const n = sr?.tiere ?? regel.tiere;
      // Jugend: eigener Wert der Sparte, sonst deren Seniorenwert; ohne Spartenregel der allgemeine Jugend- bzw. Seniorenwert.
      const mindest = jugend ? (sr ? (sr.mindestPunkteJugend ?? sr.mindestPunkte) : (regel.mindestPunkteJugend ?? regel.mindestPunkte)) : (sr?.mindestPunkte ?? regel.mindestPunkte);
      const kandidaten = [...new Set(einheit.map((t) => t.ausstellerId))].map((a) => {
        const eigene = einheit.filter((t) => t.ausstellerId === a);
        const { gezaehlt: auswahl, bedingungen } = besteAuswahl(eigene, n, regel);
        // Gescheitert an den Bedingungen: nicht gewertet – nur zum Nachvollziehen gezeigt.
        const gezaehlt = auswahl;
        const vollstaendig = auswahl.length === n && !bedingungen;
        const summe = gezaehlt.reduce((s, t) => s + (t.punkte ?? 0), 0);
        const grund = bedingungen
          ? `Keine Auswahl von ${n} Tieren erfüllt die Bedingungen (${[regel.beideGeschlechter && "beide Geschlechter", regel.maxAlttiere != null && `höchstens ${regel.maxAlttiere} Alttiere`].filter(Boolean).join(", ")}).`
          : gezaehlt.length < n
            ? `Weniger als ${n} Tiere${regel.beideGeschlechter ? " beider Geschlechter" : ""} in der Wertung.`
            : mindest != null && summe < mindest
              ? `Unter der Mindestpunktzahl ${mindest}.`
              : null;
        return { ausstellerId: a, name: eigene[0]!.ausstellerName, gezaehlt, summe, gewertet: vollstaendig, erfuellt: grund == null, grund, rang: null, titel: false, rest: eigene } as Kandidat & { rest: MeisterschaftTier[] };
      });
      const beteiligt = kandidaten.length;
      const hinweis =
        beteiligt < regel.mindestAussteller ? `Kein Titel: mindestens ${regel.mindestAussteller} Aussteller nötig.` : einheit.length < regel.mindestTiere ? `Kein Titel: mindestens ${regel.mindestTiere} Tiere nötig.` : null;
      gruppen.push(rangiere({ sparte, rasse, farbenschlag, jugend, kandidaten, hinweis }, regel, n));
    }
  }
  return { gruppen };
}

/**
 * Beste n Tiere eines Ausstellers unter den Bedingungen (Geschlechter, Alttiere). Die Bedingungen hängen nur davon ab,
 * wie viele Tiere je Geschlecht und Alter gewählt sind – je Aufteilung sind die jeweils besten Tiere optimal. Durchsucht
 * werden also nur die Aufteilungen (höchstens einige Tausend), nicht alle Kombinationen.
 * Rückgabe: Auswahl und ob sie an den Bedingungen (statt an zu wenigen Tieren) scheiterte.
 */
function besteAuswahl(tiere: MeisterschaftTier[], n: number, regel: MeisterschaftRegel): { gezaehlt: MeisterschaftTier[]; bedingungen: boolean } {
  const sortiert = [...tiere].sort(besser);
  const topf = (g: string, a: string) => sortiert.filter((t) => t.geschlecht === g && t.alter === a);
  const [hj, ha, hn, hna] = [topf("1,0", "jung"), topf("1,0", "alt"), topf("0,1", "jung"), topf("0,1", "alt")];
  const verfuegbar = hj.length + ha.length + hn.length + hna.length;
  if (verfuegbar < n) return { gezaehlt: sortiert.slice(0, n), bedingungen: false };
  let beste: MeisterschaftTier[] = [];
  for (let a = 0; a <= Math.min(n, hj.length); a++)
    for (let b = 0; b <= Math.min(n - a, ha.length); b++)
      for (let c = 0; c <= Math.min(n - a - b, hn.length); c++) {
        const d = n - a - b - c;
        if (d > hna.length) continue;
        if (regel.beideGeschlechter && (a + b === 0 || c + d === 0)) continue;
        if (regel.maxAlttiere != null && b + d > regel.maxAlttiere) continue;
        const wahl = [...hj.slice(0, a), ...ha.slice(0, b), ...hn.slice(0, c), ...hna.slice(0, d)];
        if (beste.length === 0 || vergleicheNoten(wahl, beste) < 0) beste = wahl;
      }
  // Genug Tiere, aber keine Auswahl erfüllt die Bedingungen: die besten zeigen (zum Nachvollziehen), nicht gewertet.
  return beste.length ? { gezaehlt: beste.sort(besser), bedingungen: false } : { gezaehlt: sortiert.slice(0, n), bedingungen: true };
}

/** Höhere Punkte zuerst, bei gleichen Punkten der höhere Preis. */
const besser = (a: MeisterschaftTier, b: MeisterschaftTier) => (b.punkte ?? 0) - (a.punkte ?? 0) || (a.preisRang ?? 999) - (b.preisRang ?? 999) || a.id - b.id;

/** Größere Summe zuerst, dann höhere Einzelnoten der Reihe nach (negativ: a ist besser). */
function vergleicheNoten(a: MeisterschaftTier[], b: MeisterschaftTier[]) {
  const sa = a.reduce((s, t) => s + (t.punkte ?? 0), 0);
  const sb = b.reduce((s, t) => s + (t.punkte ?? 0), 0);
  if (sa !== sb) return sb - sa;
  return einzelnoten(a, b);
}

const einzelnoten = (a: MeisterschaftTier[], b: MeisterschaftTier[]) => {
  const na = a.map((t) => t.punkte ?? 0).sort((x, y) => y - x);
  const nb = b.map((t) => t.punkte ?? 0).sort((x, y) => y - x);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] ?? -1) !== (nb[i] ?? -1)) return (nb[i] ?? -1) - (na[i] ?? -1);
  return 0;
};

/** Vergleich zweier Kandidaten mit gleicher Summe nach einem Kriterium (negativ: a ist besser). */
function kriterium(k: GleichstandKriterium, a: Kandidat & { rest?: MeisterschaftTier[] }, b: Kandidat & { rest?: MeisterschaftTier[] }): number {
  const bestes = (ts: MeisterschaftTier[], g: string) => Math.max(-1, ...ts.filter((t) => t.geschlecht === g).map((t) => t.punkte ?? 0));
  switch (k) {
    case "einzelnoten":
      return einzelnoten(a.gezaehlt, b.gezaehlt);
    case "preise": {
      const ra = a.gezaehlt.map((t) => t.preisRang ?? 999).sort((x, y) => x - y);
      const rb = b.gezaehlt.map((t) => t.preisRang ?? 999).sort((x, y) => x - y);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return (ra[i] ?? 999) - (rb[i] ?? 999);
      return 0;
    }
    case "hahn":
      return bestes(b.gezaehlt, "1,0") - bestes(a.gezaehlt, "1,0");
    case "henne":
      return bestes(b.gezaehlt, "0,1") - bestes(a.gezaehlt, "0,1");
    case "jung":
      return b.gezaehlt.filter((t) => t.alter === "jung").length - a.gezaehlt.filter((t) => t.alter === "jung").length;
    case "weitere": {
      const weitere = (x: Kandidat & { rest?: MeisterschaftTier[] }) => (x.rest ?? []).filter((t) => !x.gezaehlt.includes(t)).sort(besser);
      return einzelnoten(weitere(a), weitere(b));
    }
  }
}

/**
 * Rangfolge: vollständig gewertete vor unvollständigen, dann Summe, dann die Gleichstandskriterien. Einen Platz bekommt
 * jeder vollständig Gewertete; den Titel nur Platz 1, wenn er auch die Mindestpunkte erreicht.
 */
function rangiere(g: Gruppe, regel: MeisterschaftRegel, _n: number): Gruppe {
  const vergleich = (a: Kandidat, b: Kandidat) => {
    if (a.gewertet !== b.gewertet) return a.gewertet ? -1 : 1;
    if (a.summe !== b.summe) return b.summe - a.summe;
    for (const k of regel.gleichstand) {
      const v = kriterium(k, a, b);
      if (v) return v;
    }
    return 0;
  };
  const sortiert = [...g.kandidaten].sort((a, b) => vergleich(a, b) || a.name.localeCompare(b.name, "de"));
  let rang = 0;
  sortiert.forEach((k, i) => {
    if (!k.gewertet) return;
    rang = i > 0 && vergleich(sortiert[i - 1]!, k) === 0 ? rang : i + 1;
    k.rang = rang;
  });
  const erste = sortiert.filter((k) => k.rang === 1 && k.erfuellt);
  let hinweis = g.hinweis;
  if (!hinweis && erste.length > 1 && regel.beiGleichstand === "offen") hinweis = "Gleichstand auf Platz 1 – die Ausstellungsleitung entscheidet.";
  else if (!hinweis) erste.forEach((k) => (k.titel = true));
  // Nur die Wertungsdaten zurückgeben (ohne Hilfsfeld).
  return { ...g, hinweis, kandidaten: sortiert.map(({ rest: _r, ...k }: Kandidat & { rest?: unknown }) => k) };
}

/** Vereinswertung: je Verein die besten Tiere unter den Bedingungen (Züchter, Sparten, Höchstzahl je Züchter). */
function vereinsgruppe(regel: MeisterschaftRegel, tiere: MeisterschaftTier[], jugend: boolean): Gruppe {
  const { minZuechter, minSparten, maxTiereJeZuechter } = regel.verein;
  const n = regel.tiere;
  const vereine = [...new Set(tiere.map((t) => t.verein.trim()).filter(Boolean))];
  const kandidaten = vereine.map((v) => {
    const eigene = tiere.filter((t) => t.verein.trim() === v).sort(besser);
    const wahl: MeisterschaftTier[] = [];
    const jeZuechter = (id: number) => wahl.filter((t) => t.ausstellerId === id).length;
    for (const t of eigene) if (wahl.length < n && (maxTiereJeZuechter == null || jeZuechter(t.ausstellerId) < maxTiereJeZuechter)) wahl.push(t);
    // Zu wenige Züchter oder Sparten: das schwächste Tier gegen das beste eines neuen Züchters bzw. einer neuen Sparte tauschen.
    const ergaenze = (fehlt: () => boolean, neu: (t: MeisterschaftTier) => boolean) => {
      // Höchstens so viele Tausche, wie Tiere im Verein sind – jeder Tausch bringt einen neuen Züchter bzw. eine neue Sparte.
      for (let runde = 0; fehlt() && runde < eigene.length; runde++) {
        const kandidat = eigene.find((t) => !wahl.includes(t) && neu(t) && (maxTiereJeZuechter == null || jeZuechter(t.ausstellerId) < maxTiereJeZuechter));
        if (!kandidat) return;
        if (wahl.length < n) {
          wahl.push(kandidat);
          continue;
        }
        // Raus darf nur ein Tier, dessen Züchter und Sparte auch ohne es vertreten bleiben – das schwächste davon.
        const raus = [...wahl].sort(besser).reverse().find((t) => {
          const ohne = wahl.filter((x) => x !== t);
          return ohne.some((x) => x.ausstellerId === t.ausstellerId) && ohne.some((x) => x.sparte === t.sparte);
        });
        if (!raus) return;
        wahl.splice(wahl.indexOf(raus), 1, kandidat);
      }
    };
    const zuechter = () => new Set(wahl.map((t) => t.ausstellerId));
    const sparten = () => new Set(wahl.map((t) => t.sparte));
    ergaenze(() => zuechter().size < minZuechter, (t) => !zuechter().has(t.ausstellerId));
    ergaenze(() => sparten().size < minSparten, (t) => !sparten().has(t.sparte));
    wahl.sort(besser);
    const summe = wahl.reduce((s, t) => s + (t.punkte ?? 0), 0);
    const mindest = jugend ? (regel.mindestPunkteJugend ?? regel.mindestPunkte) : regel.mindestPunkte;
    const grund =
      wahl.length < n
        ? `Weniger als ${n} Tiere.`
        : zuechter().size < minZuechter
          ? `Weniger als ${minZuechter} Züchter.`
          : sparten().size < minSparten
            ? `Weniger als ${minSparten} Sparten.`
            : mindest != null && summe < mindest
              ? `Unter der Mindestpunktzahl ${mindest}.`
              : null;
    const gewertet = grund == null || grund.startsWith("Unter der Mindestpunktzahl");
    return { ausstellerId: wahl[0]?.ausstellerId ?? 0, name: v, gezaehlt: wahl, summe, gewertet, erfuellt: grund == null, grund, rang: null, titel: false, rest: eigene } as Kandidat & { rest: MeisterschaftTier[] };
  });
  const hinweis = kandidaten.length < regel.mindestAussteller ? `Kein Titel: mindestens ${regel.mindestAussteller} Vereine nötig.` : null;
  return rangiere({ sparte: "", rasse: "", farbenschlag: "", jugend, kandidaten, hinweis }, regel, n);
}
