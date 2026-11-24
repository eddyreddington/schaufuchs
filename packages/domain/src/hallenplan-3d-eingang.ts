/**
 * Haupteingang der 3D-Halle: dort beginnt und endet der Rundgang, davor liegt in der Landschaft der Parkplatz. Notausgänge
 * zählen nicht. Heißt ein Eingang „Haupteingang“, ist er es; sonst liegt er an der Seite mit den meisten Eingängen (bei
 * Gleichstand die mit der größten Breite an Eingängen), dort der breiteste, Nebeneingänge zuletzt. Rein, ohne three.js.
 */
import type { HallenSzene, SzeneSeite, SzeneTuer } from "./hallenplan-3d";

export interface Haupteingang {
  tuer: SzeneTuer;
  /** Wand, in der er liegt (die nächste Seite des umschließenden Rechtecks). */
  seite: SzeneSeite;
}

type EingangSzene = Pick<HallenSzene, "breite" | "laenge" | "tueren">;

/** Seite des umschließenden Rechtecks, der die Tür am nächsten liegt. */
export function tuerSeite(s: Pick<HallenSzene, "breite" | "laenge">, t: SzeneTuer): SzeneSeite {
  const cx = t.q.x + t.q.b / 2, cz = t.q.z + t.q.t / 2;
  const abstand: [SzeneSeite, number][] = [["x0", cx], ["x1", s.breite - cx], ["z0", cz], ["z1", s.laenge - cz]];
  return abstand.sort((a, b) => a[1] - b[1])[0]![0];
}

const breite = (t: SzeneTuer) => Math.max(t.q.b, t.q.t);
const heisst = (t: SzeneTuer, muster: RegExp) => muster.test(t.name.toLocaleLowerCase("de"));

/** Der Haupteingang der Szene; null ohne Eingang (nur Notausgänge oder gar keine Tür). */
export function haupteingang(s: EingangSzene): Haupteingang | null {
  const eingaenge = s.tueren.filter((t) => !t.notausgang);
  if (!eingaenge.length) return null;
  const benannt = eingaenge.filter((t) => heisst(t, /haupt/)).sort((a, b) => breite(b) - breite(a))[0];
  if (benannt) return { tuer: benannt, seite: tuerSeite(s, benannt) };
  const je = new Map<SzeneSeite, SzeneTuer[]>();
  for (const t of eingaenge) je.set(tuerSeite(s, t), [...(je.get(tuerSeite(s, t)) ?? []), t]);
  const summe = (ts: SzeneTuer[]) => ts.reduce((n, t) => n + breite(t), 0);
  const [seite, tueren] = [...je.entries()].sort((a, b) => b[1].length - a[1].length || summe(b[1]) - summe(a[1]))[0]!;
  const tuer = [...tueren].sort((a, b) => Number(heisst(a, /neben/)) - Number(heisst(b, /neben/)) || breite(b) - breite(a))[0]!;
  return { tuer, seite };
}

/** Seite mit dem Haupteingang (dort der Parkplatz); ohne Eingang die Längsseite unten (z1). */
export function vorneSeite(s: EingangSzene): SzeneSeite {
  return haupteingang(s)?.seite ?? "z1";
}
