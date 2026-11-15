/**
 * Historische Stiche für Titelseite und Spartenköpfe (apps/server/stiche, Quellen in QUELLEN.md).
 * Alle einheitlich aufbereitet – gleicher Papierton (keiner), gleiche Strichdichte, gleiche Druckfarbe –,
 * damit sie im Katalog wie aus einer Hand wirken.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Stich = "hahn" | "hahn-titel" | "huehner" | "henne" | "enten" | "gaense" | "tauben" | "puten" | "wachteln";

const geladen = new Map<Stich, Buffer>();

/** PNG des Stichs (Strichmaske in Druckfarbe, Papier durchsichtig). */
export function stichBild(name: Stich): Buffer {
  let b = geladen.get(name);
  if (!b) geladen.set(name, (b = readFileSync(join(import.meta.dir, "../../stiche", `${name}.png`))));
  return b;
}

/** Passender Stich zu einer Sparte (Bezeichnungen im Verzeichnis sind nicht genormt); Stämme und Volieren: Hahn mit Henne. */
export function stichFuer(sparte: string, gruppe = false): Stich {
  if (gruppe) return "huehner";
  const t = sparte.toLowerCase();
  if (/taube/.test(t)) return "tauben";
  if (/zwerg/.test(t)) return "henne";
  if (/wachtel/.test(t)) return "wachteln";
  if (/gans|gänse/.test(t)) return "gaense";
  if (/pute|groß/.test(t)) return "puten";
  if (/ente|wasser/.test(t)) return "enten";
  return "hahn";
}
