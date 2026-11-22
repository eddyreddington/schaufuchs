/**
 * Käfige ausrichten, wenn sie gestellt werden (Verschieben, Pfeiltasten, Einsetzen, Drehen) – Rückwand an die Wand und
 * Rückwand an Rückwand (Wunsch des Vereins: „Wenn Käfige aneinander gestellt werden, richte sie automatisch so aus, dass die
 * Rückwände aneinander stehen und nicht die Front verdecken.“; Entscheidung 029).
 *
 * Die Front eines eben gestellten Teils (Grundplatte, Käfigblock, eingesetzte Voliere) ist verdeckt, wenn sie zu einer Wand
 * zeigt (lange Seite bis `WAND_FANG` an der Hallenwand oder einer Innenwand des Grundrisses) oder ein anderes Teil an ihr
 * anliegt (bis `WAND_FANG`, mit dessen Front, Rück- oder Seitenwand, mindestens `UEBERLAPP_MIN` überlappend). Dann dreht das
 * Teil an Ort und Stelle um 180° – aber nur, wenn die Gegenrichtung frei ist: nach einer Wand nicht direkt an einem Teil oder
 * einer Wand, nach einem Nachbarn ein ganzer Gang (Gangbreite, wie `frontFehler`). Sonst bleibt alles, wie es ist. Es dreht nur,
 * was gestellt wurde, nie der ruhende Nachbar. Erst die Wand, dann die Nachbarn: So dreht nichts hin und her. Reine Rechnung.
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
 * anliegenden Teil. `alle`: alle Kandidaten im Plan (auch die ruhenden), `nur`: die gestellten Teile (eine Reihe steht für
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
  // Nicht direkt verdeckt: keine Wand, keine Innenwand und kein Teil bis `fang` vor der Seite.
  const direktFrei = (k: WandKandidat, b: WandKandidat["front"]) => !anWand(halle, k.rechteck, b, fang) && ![...andere(k), ...innen].some((n) => liegtAn(k.rechteck, b, n, fang));
  // Ein ganzer Gang frei (wie `frontFehler`): in der Halle, ohne Teil, Innenwand oder Sperrfläche; Möbel zählen nicht.
  const gangFrei = (k: WandKandidat, b: WandKandidat["front"]) => {
    const s = streifenVor(k.rechteck, b, Math.max(halle.gang, fang + 1));
    const drin = s.x >= -T && s.y >= -T && s.x + s.b <= halle.breite + T && s.y + s.h <= halle.laenge + T;
    return drin && ![...andere(k), ...innen, ...sperren].some((n) => ueberlappt(s, n));
  };
  const gestellt = jetzt.map((k, i) => ({ k, i })).filter(({ k }) => kandidatGewaehlt(k.teil, nur));

  const wand: WandDrehung[] = [];
  for (const { k, i } of gestellt) {
    const soll = wandSoll(halle, k.rechteck, fang, innen);
    if (!soll || !gegenueber(k.front, soll) || !direktFrei(k, soll)) continue;
    wand.push({ teil: k.teil, grad: 180, front: soll, belegt: k.belegt });
    jetzt[i] = { ...k, front: soll };
  }
  const ruecken: WandDrehung[] = [];
  for (const { i } of gestellt) {
    const k = jetzt[i]!;
    if (wand.some((d) => gleichesTeil(d.teil, k.teil))) continue;
    if (!andere(k).some((n) => liegtAn(k.rechteck, k.front, n, fang))) continue;
    const neu = gegen(k.front);
    if (!gangFrei(k, neu)) continue;
    ruecken.push({ teil: k.teil, grad: 180, front: neu, belegt: k.belegt });
    jetzt[i] = { ...k, front: neu };
  }
  return { wand, ruecken };
}
