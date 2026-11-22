/**
 * Käfige an den Wänden mit der Rückwand an die Wand (Rückmeldung 14.11.2026): Ein Käfig hat vorn die offene Gitterfront, Rück- und
 * Seitenwände sind dicht. Steht eine Grundplatte, ein Käfigblock oder eine Voliere mit einer langen Seite an einer Hallenwand
 * (bündig oder bis `WAND_FANG`), gehört die Rückwand an die Wand und die Front in die Halle. Die Front liegt immer an einer
 * langen Seite – zeigt sie zur Wand, genügt es, das Teil an Ort und Stelle um 180° zu drehen (es bleibt auf derselben Fläche,
 * nichts kann dabei anstoßen). Teile, die nur mit der kurzen Seite an der Wand stehen (z. B. jedes Reihenende bündig an der
 * Wand), bleiben, wie sie sind. Reine Rechnung.
 */
import { frontDerReihe, objektFront, type Blick, type Drehung, type Halle, type Hallenplan, type Rechteck } from "./hallenplan";
import type { HallenTeil } from "./hallenplan-gruppe";
import { istRechteckUmriss, umrissNormal, umrissSperren } from "./hallenplan-umriss";

/** So nah (cm) an einer Wand gilt ein Teil als an der Wand. */
export const WAND_FANG = 30;

/** Ein Teil, das an einer Wand stehen könnte: wie es gezeichnet ist (Lage, Front). */
export interface WandKandidat {
  teil: Extract<HallenTeil, { art: "platte" } | { art: "objekt" }>;
  rechteck: Rechteck;
  front: Blick;
  /** Belegte Käfige darauf – ab zwei kehrt das Drehen ihre Folge um. */
  belegt: number;
}

/** Eine nötige Drehung: um 180° an Ort und Stelle, danach Front `front`. */
export interface WandDrehung {
  teil: WandKandidat["teil"];
  grad: 180;
  front: Blick;
  belegt: number;
}

/**
 * Wand, an der die lange Seite eines Teils liegt (bündig oder bis `fang`), als Richtung von dort in die Halle (= Front, die
 * es haben soll); null, wenn keine lange Seite an einer Wand liegt. In einer Ecke zählt die lange Seite.
 */
export function wandRichtung(halle: Pick<Halle, "breite" | "laenge">, q: Rechteck, fang = WAND_FANG): Blick | null {
  const waagrecht = q.b >= q.h;
  if (waagrecht) {
    if (q.y <= fang) return "z+";
    if (q.y + q.h >= halle.laenge - fang) return "z-";
  } else {
    if (q.x <= fang) return "x+";
    if (q.x + q.b >= halle.breite - fang) return "x-";
  }
  return null;
}

/** So viel (cm) müssen sich zwei Seiten mindestens überlappen, damit sie aneinander stehen (kürzere Seiten: ganz). */
export const UEBERLAPP_MIN = 30;
/** Rechenspiel (cm): so viel Überschneidung gilt noch als bündig. */
const T = 0.5;

/** Richtung umkehren. */
export const gegen = (b: Blick): Blick => `${b[0]}${b[1] === "+" ? "-" : "+"}` as Blick;

/**
 * Liegt n an der Seite `blick` von q an? Bündig oder bis `fang` davor, und entlang der Seite mindestens `UEBERLAPP_MIN`
 * überlappend (ist eine der beiden Seiten kürzer, ganz) – Ecke an Ecke oder ein paar Zentimeter zählen nicht.
 */
export function liegtAn(q: Rechteck, blick: Blick, n: Rechteck, fang = WAND_FANG): boolean {
  const x = blick[0] === "x";
  const abstand = blick === "x+" ? n.x - (q.x + q.b) : blick === "x-" ? q.x - (n.x + n.b) : blick === "z+" ? n.y - (q.y + q.h) : q.y - (n.y + n.h);
  if (abstand < -T || abstand > fang) return false;
  const ueberlappt = x ? Math.min(q.y + q.h, n.y + n.h) - Math.max(q.y, n.y) : Math.min(q.x + q.b, n.x + n.b) - Math.max(q.x, n.x);
  return ueberlappt > T && ueberlappt >= Math.min(UEBERLAPP_MIN, x ? q.h : q.b, x ? n.h : n.b) - T;
}

/** Innenwände eines freien Grundrisses (Entscheidung 019) als Rechtecke außerhalb; beim Rechteck keine. */
export function innenWaende(halle: Partial<Pick<Halle, "umriss">>): Rechteck[] {
  return istRechteckUmriss(halle.umriss) ? [] : umrissSperren(umrissNormal(halle.umriss!));
}

/**
 * Wie `wandRichtung`, dazu die Innenwände eines freien Grundrisses: Liegt eine lange Seite an einer davon, zeigt die Front
 * von dort weg.
 */
export function wandSoll(halle: Pick<Halle, "breite" | "laenge">, q: Rechteck, fang: number, innen: Rechteck[]): Blick | null {
  const aussen = wandRichtung(halle, q, fang);
  if (aussen || !innen.length) return aussen;
  for (const seite of (q.b >= q.h ? ["z-", "z+"] : ["x-", "x+"]) as Blick[]) if (innen.some((w) => liegtAn(q, seite, w, fang))) return gegen(seite);
  return null;
}

/** Zeigen a und b in entgegengesetzte Richtungen? */
export const gegenueber = (a: Blick, b: Blick) => a[0] === b[0] && a[1] !== b[1];

/** Was zu drehen ist: Teile an einer Wand (auch einer Innenwand des Grundrisses), deren Front zur Wand zeigt. */
export function wandAusrichtung(halle: Pick<Halle, "breite" | "laenge"> & Partial<Pick<Halle, "umriss">>, kandidaten: WandKandidat[], fang = WAND_FANG): WandDrehung[] {
  const innen = innenWaende(halle);
  const aus: WandDrehung[] = [];
  for (const k of kandidaten) {
    const soll = wandSoll(halle, k.rechteck, fang, innen);
    if (soll && gegenueber(k.front, soll)) aus.push({ teil: k.teil, grad: 180, front: soll, belegt: k.belegt });
  }
  return aus;
}

/** Gehört das Teil zu `nur` (eine Reihe steht für alle ihre Platten)? null/undefined: alle. */
export function kandidatGewaehlt(t: WandKandidat["teil"], nur?: HallenTeil[] | null): boolean {
  return (
    !nur ||
    nur.some((n) => (t.art === "platte" ? (n.art === "platte" && n.reihe === t.reihe && n.i === t.i) || (n.art === "reihe" && n.nr === t.reihe) : n.art === "objekt" && n.id === t.id))
  );
}

/**
 * Kandidaten aus einem gerechneten Plan (Lage samt Versatz und Drehung): alle Grundplatten, Käfigblöcke und eingesetzten
 * Volieren. `nur`: nur diese Teile (eine Reihe steht für alle ihre Platten).
 */
export function wandKandidaten(plan: Pick<Hallenplan, "quer" | "reihen" | "objekte">, nur?: HallenTeil[] | null): WandKandidat[] {
  const gewaehlt = (t: WandKandidat["teil"]) => kandidatGewaehlt(t, nur);
  const aus: WandKandidat[] = [];
  for (const r of plan.reihen)
    r.platten.forEach((pl, i) => {
      if (pl.entfernt) return;
      const teil = { art: "platte" as const, reihe: r.nr, i };
      if (gewaehlt(teil)) aus.push({ teil, rechteck: pl.rechteck, front: frontDerReihe(r, plan.quer, pl.drehung ?? 0), belegt: pl.belegt });
    });
  for (const o of plan.objekte) {
    if (o.art !== "kaefigblock" && o.art !== "voliere") continue;
    const teil = { art: "objekt" as const, id: o.id };
    if (gewaehlt(teil)) aus.push({ teil, rechteck: o.rechteck, front: objektFront(o), belegt: o.art === "voliere" ? (o.tier ? 1 : 0) : (o.kaefige?.length ?? 0) });
  }
  return aus;
}

/** Drehungen in die Halle übernehmen: Grundplatten über ihre Drehung (um die eigene Mitte), Teile über ihre Front. */
export function wandDrehungenAnwenden(halle: Halle, drehungen: WandDrehung[]): Halle {
  if (!drehungen.length) return halle;
  let plattenVersatz = [...(halle.plattenVersatz ?? [])];
  const fronten = new Map<string, Blick>();
  for (const d of drehungen) {
    if (d.teil.art === "platte") {
      const t = d.teil;
      const gleich = (x: { reihe: number; platte: number }) => x.reihe === t.reihe && x.platte === t.i;
      const alt = plattenVersatz.find(gleich) ?? { reihe: t.reihe, platte: t.i, dx: 0, dy: 0 };
      const drehung = ((((alt.drehung ?? 0) + d.grad) % 360) as Drehung) || undefined;
      const neu = { ...alt, drehung };
      plattenVersatz = [...plattenVersatz.filter((x) => !gleich(x)), ...(neu.dx || neu.dy || neu.drehung ? [neu] : [])];
    } else fronten.set(d.teil.id, d.front);
  }
  return {
    ...halle,
    plattenVersatz,
    // Ein von Hand gedrehtes Teil gilt danach als von Hand gesetzt (kein automatisch eingesetzter Block mehr).
    objekte: (halle.objekte ?? []).map((o) => {
      if (!fronten.has(o.id)) return o;
      const { auto: _a, ...rest } = o;
      return { ...rest, front: fronten.get(o.id)! };
    }),
  };
}
