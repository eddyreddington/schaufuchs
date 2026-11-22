/**
 * Vorschlag für die Einteilung nach Nummern (und über Nummern je Farbenschlag auch nach Rassen): Tiere in Katalogfolge auf
 * die Preisrichter verteilen, an Rassengrenzen schneiden, nur an Preisrichter, die Sparte und BDRG-Gruppe bewerten.
 */
import { bdrgGruppe, bewertetGruppe, bewertetSparte } from "@schau/domain";

type Nummer = { nr: number; suffix?: string; rasse: string; sparte?: string | null; gruppe?: string | null };
/** Ganze Nummer (24 mit 24a, 24b) mit ihren Tieren: Anzahl, erste und letzte Rasse, Sparten und BDRG-Gruppen. */
type Block = { nr: number; anzahl: number; ersteRasse: string; letzteRasse: string; sparten: Set<string>; bdrg: Set<string> };
/** `gewicht`: Höchstzahl des Preisrichters (Obmann weniger) – die Tiere verteilen sich in diesem Verhältnis. Ohne Angabe 1. */
export type RichterWahl = { id: number; sparten: string[]; gruppen?: string[]; gewicht?: number };
const gewichtVon = (r: RichterWahl) => (r.gewicht && r.gewicht > 0 ? r.gewicht : 1);

/** Nummern in Katalogfolge zu ganzen Nummern bündeln (24, 24a, 24b gehören zusammen). */
function gruppieren(nummern: Nummer[]): Block[] {
  const sortiert = [...nummern].sort((a, b) => a.nr - b.nr || (a.suffix ?? "").localeCompare(b.suffix ?? ""));
  const gruppen: Block[] = [];
  for (const n of sortiert) {
    const g = gruppen.at(-1);
    if (g && g.nr === n.nr) {
      g.anzahl++;
      g.letzteRasse = n.rasse;
      g.sparten.add(n.sparte ?? "");
      g.bdrg.add(bdrgGruppe(n.gruppe));
    } else gruppen.push({ nr: n.nr, anzahl: 1, ersteRasse: n.rasse, letzteRasse: n.rasse, sparten: new Set([n.sparte ?? ""]), bdrg: new Set([bdrgGruppe(n.gruppe)]) });
  }
  return gruppen;
}

/**
 * Schneidet Gruppen in aufeinanderfolgende Bereiche mit den Zielgrößen `ziele` (der letzte nimmt den Rest) und schneidet
 * dabei möglichst an einer Rassengrenze (höchstens 25 % vom Ziel entfernt).
 */
function schneiden(gruppen: Block[], ziele: number[]): { von: number; bis: number }[] {
  const bloecke: { von: number; bis: number }[] = [];
  let start = 0;
  for (let r = 0; r < ziele.length && start < gruppen.length; r++) {
    if (r === ziele.length - 1) {
      bloecke.push({ von: gruppen[start]!.nr, bis: gruppen[gruppen.length - 1]!.nr });
      break;
    }
    const ziel = ziele[r]!;
    let ende = -1;
    let besterAbstand = Infinity;
    let naechste = start;
    let naechsterAbstand = Infinity;
    let anzahl = 0;
    for (let i = start; i < gruppen.length - 1; i++) {
      anzahl += gruppen[i]!.anzahl;
      const abstand = Math.abs(anzahl - ziel);
      if (abstand < naechsterAbstand) {
        naechsterAbstand = abstand;
        naechste = i;
      }
      if (anzahl < ziel * 0.75) continue;
      if (anzahl > ziel * 1.25) break;
      if (gruppen[i + 1]!.ersteRasse !== gruppen[i]!.letzteRasse && abstand < besterAbstand) {
        besterAbstand = abstand;
        ende = i;
      }
    }
    if (ende < 0) ende = naechste;
    bloecke.push({ von: gruppen[start]!.nr, bis: gruppen[ende]!.nr });
    start = ende + 1;
  }
  return bloecke;
}

/**
 * Teilt nummerierte Tiere auf die Preisrichter auf und schneidet dabei möglichst an einer Rassengrenze.
 * Nachmeldungen (24, 24a, 24b) haben dieselbe Nummer und bleiben beim selben Preisrichter – die Einteilung
 * arbeitet mit ganzen Nummern, ein Schnitt dazwischen ergäbe überlappende Bereiche.
 *
 * Bewertet ein Preisrichter nur bestimmte Sparten, bekommt er nur diese: Die Nummern werden in Abschnitte gleicher
 * Sparte(n) geteilt; jeder Abschnitt geht an so wenige passende Preisrichter wie nötig (eine Sparte möglichst bei einem),
 * die am wenigsten zu tun haben – die engsten Abschnitte zuerst, damit am Ende alle etwa gleich viel bewerten.
 * `fehlend`: Sparten, die niemand bewertet (diese Nummern bleiben ohne Preisrichter).
 */
export function schlageEinteilungVor(
  nummern: Nummer[],
  richterEingabe: number[] | RichterWahl[],
): { preisrichterId: number; vonNr: number; bisNr: number }[] & { fehlend?: string[] } {
  const richter: RichterWahl[] = richterEingabe.map((r) => (typeof r === "number" ? { id: r, sparten: [] } : r));
  const gruppen = gruppieren(nummern);
  if (gruppen.length === 0 || richter.length === 0) return [];
  // Ohne Einschränkungen: gleichmäßig in Katalogfolge.
  if (richter.every((r) => !r.sparten.length && !r.gruppen?.length)) return schneidenGleichmaessig(gruppen, richter);
  // Abschnitte: aufeinanderfolgende Nummern mit denselben passenden Preisrichtern.
  const passend = (g: Block) => richter.filter((r) => [...g.sparten].every((sp) => bewertetSparte(r, sp)) && [...g.bdrg].every((gr) => bewertetGruppe(r, gr)));
  const abschnitte: { gruppen: Block[]; richter: RichterWahl[]; anzahl: number; index: number }[] = [];
  for (const g of gruppen) {
    const p = passend(g);
    const a = abschnitte.at(-1);
    if (a && a.richter.length === p.length && a.richter.every((r, i) => r.id === p[i]!.id)) {
      a.gruppen.push(g);
      a.anzahl += g.anzahl;
    } else abschnitte.push({ gruppen: [g], richter: p, anzahl: g.anzahl, index: abschnitte.length });
  }
  // Ohne Preisrichter: je Sparte; Tiere ohne Sparte und Nummern mit gemischten Sparten (Nachmeldung 24a einer anderen
  // Sparte als 24 – eine Nummer geht nur an einen Preisrichter) eigens benannt.
  const fehlend = [
    ...new Set(
      abschnitte
        .filter((a) => !a.richter.length)
        .flatMap((a) => a.gruppen)
        .map((g) => {
          const sp = [...g.sparten];
          if (sp.length > 1) return `Nr. ${g.nr} (${sp.map((x) => x || "ohne Sparte").join(" und ")})`;
          // Die Sparte bewertet jemand, nur nicht diese Gruppe: die Gruppe nennen.
          const gr = [...g.bdrg].find((x) => x && richter.some((r) => bewertetSparte(r, sp[0]) && !bewertetGruppe(r, x)));
          if (gr && richter.some((r) => bewertetSparte(r, sp[0]))) return `Gruppe ${gr}`;
          return sp[0] || "Tiere ohne Sparte";
        }),
    ),
  ];
  const zuteilbar = abschnitte.filter((a) => a.richter.length);
  const last = new Map(richter.map((r) => [r.id, 0]));
  const ergebnis: { preisrichterId: number; vonNr: number; bisNr: number }[] = [];
  /**
   * Auffüllen: Füllstand h (Last je Höchstzahl) mit Summe max(0, h · Gewicht − Last) = Anzahl; je Preisrichter sein
   * Anteil – ein Obmann mit kleinerer Höchstzahl ist so früher „voll“.
   */
  const auffuellen = (ids: RichterWahl[], anzahl: number) => {
    const lasten = ids.map((r) => last.get(r.id)!);
    const gewichte = ids.map(gewichtVon);
    const stand = lasten.map((l, i) => l / gewichte[i]!);
    let lo = Math.min(...stand), hi = Math.max(...stand) + anzahl / Math.min(...gewichte);
    for (let i = 0; i < 50; i++) {
      const h = (lo + hi) / 2;
      if (lasten.reduce((n, l, j) => n + Math.max(0, h * gewichte[j]! - l), 0) < anzahl) lo = h;
      else hi = h;
    }
    return ids.map((r, i) => ({ r, anteil: Math.max(0, hi * gewichte[i]! - lasten[i]!) }));
  };
  // Engste Abschnitte zuerst (die wenigsten passenden Preisrichter), dann die großen.
  for (const a of [...zuteilbar].sort((x, y) => x.richter.length - y.richter.length || y.anzahl - x.anzahl || x.index - y.index)) {
    // Auf alle passenden nach ihrer Last verteilen; Anteile unter 15 Tieren fallen weg (ein kleiner Abschnitt bleibt so
    // ganz bei einem Preisrichter) – niemand bekommt eine Handvoll Tiere einer Sparte.
    let kandidaten = [...a.richter];
    let mit = auffuellen(kandidaten, a.anzahl);
    const mindest = Math.min(15, a.anzahl);
    while (mit.length > 1 && mit.some((x) => x.anteil < mindest)) {
      const kleinster = mit.reduce((x, y) => (y.anteil < x.anteil ? y : x));
      kandidaten = kandidaten.filter((r) => r !== kleinster.r);
      mit = auffuellen(kandidaten, a.anzahl);
    }
    mit = mit.filter((x) => x.anteil >= 0.5).sort((x, y) => richter.indexOf(x.r) - richter.indexOf(y.r));
    const bloecke = schneiden(a.gruppen, mit.map((x) => x.anteil));
    bloecke.forEach((b, i) => {
      const r = mit[i]!.r;
      ergebnis.push({ preisrichterId: r.id, vonNr: b.von, bisNr: b.bis });
      last.set(r.id, last.get(r.id)! + a.gruppen.filter((g) => g.nr >= b.von && g.nr <= b.bis).reduce((n, g) => n + g.anzahl, 0));
    });
  }
  // Aneinandergrenzende Bereiche desselben Preisrichters zusammenfassen (1–3 und 4–29 → 1–29) – nur, wenn keine Nummer
  // dazwischen liegt (sonst bekäme er Tiere einer Sparte, die er nicht bewertet).
  const naechsteNr = new Map(gruppen.map((g, i) => [g.nr, gruppen[i + 1]?.nr]));
  const sortiert: typeof ergebnis = [];
  for (const e of ergebnis.sort((x, y) => x.vonNr - y.vonNr)) {
    const vor = sortiert.at(-1);
    if (vor && vor.preisrichterId === e.preisrichterId && naechsteNr.get(vor.bisNr) === e.vonNr) vor.bisNr = e.bisNr;
    else sortiert.push({ ...e });
  }
  return Object.assign(sortiert, { fehlend });
}

/**
 * Gleichmäßig in Katalogfolge (ohne Sparten-Einschränkung): jedes Ziel aus dem Rest im Verhältnis der Höchstzahl zu den
 * übrigen Preisrichtern (Obmann weniger).
 */
function schneidenGleichmaessig(gruppen: Block[], richter: RichterWahl[]) {
  const ids = richter.map((r) => r.id);
  const bloecke: { von: number; bis: number }[] = [];
  let start = 0;
  for (let r = 0; r < ids.length && start < gruppen.length; r++) {
    const uebrig = ids.length - r;
    const restGruppen = gruppen.slice(start);
    if (uebrig === 1) {
      bloecke.push({ von: restGruppen[0]!.nr, bis: restGruppen.at(-1)!.nr });
      break;
    }
    const restGewicht = richter.slice(r).reduce((n, x) => n + gewichtVon(x), 0);
    const ziel = (restGruppen.reduce((n, g) => n + g.anzahl, 0) * gewichtVon(richter[r]!)) / restGewicht;
    const [erster] = schneiden(restGruppen, [ziel, Infinity]);
    bloecke.push(erster!);
    start = gruppen.findIndex((g) => g.nr === erster!.bis) + 1;
  }
  return bloecke.map((b, i) => ({ preisrichterId: ids[i]!, vonNr: b.von, bisNr: b.bis }));
}
