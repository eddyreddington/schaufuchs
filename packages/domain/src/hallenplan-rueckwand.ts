/**
 * Käfige ausrichten, wenn sie gestellt werden (Verschieben, Pfeiltasten, Einsetzen, Drehen) – Rückwand an die Wand und
 * Rückwand an Rückwand (Wunsch des Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch so aus, dass die
 * Rückwände aneinander stehen und nicht die Front verdecken.“; Entscheidung 029).
 *
 * Die Front eines eben gestellten Teils (Grundplatte, Käfigblock, eingesetzte Voliere) ist verdeckt, wenn sie zu einer Wand
 * zeigt (lange Seite bis `WAND_FANG` an der Hallenwand oder einer Innenwand des Grundrisses) oder ein anderes Teil an ihr
 * anliegt (bis `WAND_FANG`, mit dessen Front, Rück- oder Seitenwand, mindestens `UEBERLAPP_MIN` überlappend). Dann dreht das
 * Teil an Ort und Stelle um 180° – aber nur, wenn die Gegenrichtung frei ist: nach einer Wand nicht direkt an einem Teil, einer
 * Sperrfläche oder Wand, nach einem Nachbarn ein ganzer Gang (Gangbreite, wie `frontFehler`). Sonst bleibt alles, wie es ist.
 * Grundplatten einer Reihe drehen nur alle zusammen (wenn danach jede Front frei ist) oder keine. Es dreht nur, was gestellt
 * wurde, nie der ruhende Nachbar. Die Wand geht vor, die Gangbreite verhindert das Hin- und Herdrehen. Reine Rechnung.
 */
import { streifenVor, ueberlappt } from "./hallenplan-rechtecke";
import type { Halle, Hallenplan, Rechteck } from "./hallenplan-typen";
import type { HallenTeil } from "./hallenplan-gruppe";
import { gegen, gegenueber, innenWaende, kandidatGewaehlt, liegtAn, WAND_FANG, wandSoll, type WandDrehung, type WandKandidat } from "./hallenplan-wandfront";

const T = 0.5;
const gleichesTeil = (a: WandKandidat["teil"], b: WandKandidat["teil"]) =>
  a.art === "platte" ? b.art === "platte" && a.reihe === b.reihe && a.i === b.i : b.art === "objekt" && a.id === b.id;

/** Ruhende Nachbarn, die nie selbst drehen: die Volieren im Volierenbereich. */
export const ruhendeNachbarn = (plan: Pick<Hallenplan, "volieren">): Rechteck[] => plan.volieren.map((v) => v.rechteck);

/** Liegt die Seite `blick` an der Hallenwand (bündig oder bis `fang`)? */
const anWand = (halle: Pick<Halle, "breite" | "laenge">, q: Rechteck, blick: string, fang: number) =>
  blick === "x+" ? q.x + q.b >= halle.breite - fang : blick === "x-" ? q.x <= fang : blick === "z+" ? q.y + q.h >= halle.laenge - fang : q.y <= fang;

/**
 * Was beim Stellen zu drehen ist, je um 180° an Ort und Stelle: `wand` – Front zu einer Wand, `ruecken` – Front an einem
 * anliegenden Teil (oder mit seiner Reihe gedreht). Grundplatten einer Reihe drehen nur alle zusammen oder keine. `alle`: alle Kandidaten im Plan (auch die ruhenden), `nur`: die gestellten Teile (eine Reihe steht für
 * ihre Platten; null = alle), `ruhend`: weitere Nachbarn, die nie drehen (`ruhendeNachbarn`).
 */
export function ausrichtungBeimStellen(
  halle: Pick<Halle, "breite" | "laenge" | "gang" | "flaechen"> & Partial<Pick<Halle, "umriss">>,
  alle: WandKandidat[],
  nur: HallenTeil[] | null,
  ruhend: Rechteck[] = [],
  fang = WAND_FANG,
): { wand: WandDrehung[]; ruecken: WandDrehung[] } {
  const innen = innenWaende(halle);
  const sperren = halle.flaechen.filter((f) => f.art === "sperre").map((f) => ({ x: f.x, y: f.y, b: f.breite, h: f.tiefe }));
  const jetzt = alle.map((k) => ({ ...k }));
  const andere = (k: WandKandidat) => [...jetzt.filter((n) => !gleichesTeil(n.teil, k.teil)).map((n) => n.rechteck), ...ruhend];
  // Nicht direkt verdeckt: keine Wand, keine Innenwand, keine Sperrfläche und kein Teil bis `fang` vor der Seite.
  const direktFrei = (k: WandKandidat, b: WandKandidat["front"]) =>
    !anWand(halle, k.rechteck, b, fang) && ![...andere(k), ...innen, ...sperren].some((n) => liegtAn(k.rechteck, b, n, fang));
  // Ein ganzer Gang frei (wie `frontFehler`): in der Halle, ohne Teil, Innenwand oder Sperrfläche; Möbel zählen nicht.
  const gangFrei = (k: WandKandidat, b: WandKandidat["front"]) => {
    const s = streifenVor(k.rechteck, b, Math.max(halle.gang, fang + 1));
    const drin = s.x >= -T && s.y >= -T && s.x + s.b <= halle.breite + T && s.y + s.h <= halle.laenge + T;
    return drin && ![...andere(k), ...innen, ...sperren].some((n) => ueberlappt(s, n));
  };
  // Warum die Front verdeckt ist: zur Wand (zuerst) oder an einem anderen Teil.
  const grund = (k: WandKandidat): "wand" | "ruecken" | null => {
    const soll = wandSoll(halle, k.rechteck, fang, innen);
    if (soll && gegenueber(k.front, soll)) return "wand";
    return andere(k).some((n) => liegtAn(k.rechteck, k.front, n, fang)) ? "ruecken" : null;
  };
  // Gestellte Teile in Einheiten: Grundplatten einer Reihe zusammen (sie drehen nur alle oder keine), sonst jedes für sich.
  const einheiten = new Map<string, WandKandidat[]>();
  for (const k of jetzt.filter((x) => kandidatGewaehlt(x.teil, nur))) {
    const schluessel = k.teil.art === "platte" ? `r${k.teil.reihe}` : `o${k.teil.id}`;
    einheiten.set(schluessel, [...(einheiten.get(schluessel) ?? []), k]);
  }
  const wand: WandDrehung[] = [];
  const ruecken: WandDrehung[] = [];
  for (const teile of einheiten.values()) {
    const gruende = teile.map(grund);
    if (!gruende.some(Boolean)) continue;
    // Nach einer Wand darf die neue Front nur nicht direkt an etwas stehen, sonst muss ein Gang frei sein.
    if (!teile.every((k, i) => (gruende[i] === "wand" ? direktFrei(k, gegen(k.front)) : gangFrei(k, gegen(k.front))))) continue;
    teile.forEach((k, i) => (gruende[i] === "wand" ? wand : ruecken).push({ teil: k.teil, grad: 180, front: gegen(k.front), belegt: k.belegt }));
  }
  return { wand, ruecken };
}
