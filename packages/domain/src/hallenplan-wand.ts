/**
 * Einzelreihe an einer Wand: Zieht die Ausstellungsleitung eine Reihe an eine der beiden Wände, an denen die Reihen
 * entlanglaufen, stellt die Software dort eine Einzelreihe (Front zur Halle) und ordnet die übrigen Reihen neu – Gänge,
 * auch vor Eingängen und Notausgängen, bleiben frei. Von Hand verschobene Reihen bleiben, wo sie stehen. Reine Rechnung
 * ohne Datenbank.
 */
import type { Halle, Hallenplan, Rechteck, Reihe } from "./hallenplan";

export type WandSeite = "anfang" | "ende";

/** Reihensystem: x quer zu den Reihen (bei Reihen quer zur Halle entlang der Länge). */
const querZuReihen = (halle: Pick<Halle, "richtung">) => (halle.richtung ?? "quer") === "quer";

/**
 * Steht ein Rechteck (Hallenkoordinaten) an einer der Wände, an denen Einzelreihen stehen können? „anfang“: die Wand, an
 * der R1 steht; „ende“: gegenüber. `spiel`: so nah (cm) zählt als „an der Wand“.
 */
export function wandSeiteVon(halle: Pick<Halle, "richtung" | "breite" | "laenge">, q: Rechteck, spiel = 20): WandSeite | null {
  const quer = querZuReihen(halle);
  const von = quer ? q.y : q.x;
  const bis = quer ? q.y + q.h : q.x + q.b;
  const max = quer ? halle.laenge : halle.breite;
  if (von <= spiel) return "anfang";
  if (bis >= max - spiel) return "ende";
  return null;
}

/** Halle mit Einzelreihe an `seite` (eine schon vorhandene an der anderen Wand bleibt). */
export function mitWandreihe(halle: Halle, seite: WandSeite): Halle {
  const anfang = (halle.wandreihen && halle.wandreiheSeite !== "ende") || seite === "anfang";
  const ende = (halle.wandreihen && halle.wandreiheSeite !== "anfang") || seite === "ende";
  const { wandreiheSeite: _w, ...rest } = halle;
  return { ...rest, wandreihen: true, ...(anfang && ende ? {} : { wandreiheSeite: anfang ? ("anfang" as const) : ("ende" as const) }) };
}

/**
 * Versatz der von Hand verschobenen Reihen nach dem Umbau (neue Einzelreihe, andere Abstände): jede bleibt, wo sie steht.
 * Zugeordnet wird der Reihe nach – Einzelreihe am Anfang auf Einzelreihe am Anfang, Doppelreihen in ihrer Folge,
 * Einzelreihe am Ende auf Einzelreihe am Ende. Die Reihe `ohne` (die an die Wand gezogene) und Reihen ohne Gegenstück
 * fallen weg.
 */
export function reihenVersatzNachUmbau(
  alt: Pick<Hallenplan, "reihen">,
  neu: Pick<Hallenplan, "reihen">,
  versatz: NonNullable<Halle["reihenVersatz"]>,
  ohne: number,
  halle: Pick<Halle, "richtung">,
): NonNullable<Halle["reihenVersatz"]> {
  const quer = querZuReihen(halle);
  const rolle = (r: Reihe, alle: Reihe[]) => {
    if (r.art === "wand") return r.front === "rechts" ? "wand-anfang" : "wand-ende";
    return `doppel-${alle.filter((x) => x.art === "doppel").indexOf(r)}`;
  };
  const neuNach = new Map(neu.reihen.map((r) => [rolle(r, neu.reihen), r]));
  const aus: NonNullable<Halle["reihenVersatz"]> = [];
  for (const v of versatz) {
    if (v.nr === ohne) continue;
    const a = alt.reihen.find((r) => r.nr === v.nr);
    const n = a && neuNach.get(rolle(a, alt.reihen));
    if (!a || !n) continue;
    // Quer zu den Reihen liegt die neue Reihe um (n.x − a.x) anders: um so viel weniger verschieben.
    const d = a.x - n.x;
    aus.push({ ...v, nr: n.nr, dx: quer ? v.dx : v.dx + d, dy: quer ? v.dy + d : v.dy });
  }
  return aus.filter((v) => v.dx || v.dy || v.drehung);
}
