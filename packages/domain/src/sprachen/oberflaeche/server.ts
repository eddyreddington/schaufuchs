/**
 * Meldungen des Servers (Fehler, Prüfungen, Hinweise) in der Sprache der Oberfläche (Entscheidung 022).
 * Der Server schreibt weiter deutsch – so bleiben Protokoll, Tests und Drucke, wie sie sind. Die Gruppen `server*` in
 * `de/` enthalten jede Meldung wortgleich; Texte mit eingesetzten Werten als Funktion mit Text-Parametern ohne Logik:
 * `(nr: string) => \`Käfig ${nr} ist belegt.\``. `serverText()` erkennt die deutsche Meldung und gibt die Übersetzung mit
 * denselben eingesetzten Werten zurück (ist ein eingesetzter Wert selbst eine bekannte Meldung, wird er mit übersetzt).
 * Mehrzahl o. Ä. als eigene Einträge („1 Tier“ / „${n} Tiere“), nicht als Bedingung im Text. Unbekannte Meldungen bleiben deutsch.
 */
import type { Sprache } from "..";
import { oberflaeche } from ".";
import { deOberflaeche } from "./de";

type Muster = { pfad: string[]; genau?: string; regex?: RegExp; fest: number };

const MARKE = (i: number) => `\u0000${i}\u0000`;
const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let muster: Muster[] | null = null;

/** Alle Meldungen der Gruppen `server*`, genaue zuerst, dann die mit dem längsten festen Text. */
function alleMuster(): Muster[] {
  if (muster) return muster;
  const aus: Muster[] = [];
  const lauf = (pfad: string[], wert: unknown) => {
    if (typeof wert === "string") aus.push({ pfad, genau: wert, fest: wert.length });
    else if (typeof wert === "function") {
      const f = wert as (...a: string[]) => unknown;
      const vorlage = f(...Array.from({ length: f.length }, (_, i) => MARKE(i)));
      if (typeof vorlage !== "string") return;
      const teile = vorlage.split(/\u0000(\d+)\u0000/);
      // Ungerade Stellen sind die Nummern der Platzhalter: in der Reihenfolge des deutschen Textes einfangen.
      const quelle = teile.map((t, i) => (i % 2 ? `(?<p${t}_${i}>[\\s\\S]*?)` : regexText(t))).join("");
      aus.push({ pfad, regex: new RegExp(`^${quelle}$`), fest: teile.filter((_, i) => i % 2 === 0).join("").length });
    } else if (wert && typeof wert === "object") for (const [k, v] of Object.entries(wert)) lauf([...pfad, k], v);
  };
  for (const [gruppe, wert] of Object.entries(deOberflaeche)) if (gruppe.startsWith("server")) lauf([gruppe], wert);
  muster = aus.sort((a, b) => Number(!!a.regex) - Number(!!b.regex) || b.fest - a.fest);
  return muster;
}

function nachPfad(wurzel: unknown, pfad: string[]): unknown {
  return pfad.reduce<unknown>((w, k) => (w && typeof w === "object" ? (w as Record<string, unknown>)[k] : undefined), wurzel);
}

/** Eine ganze Meldung übersetzen; `null`, wenn sie nicht bekannt ist. */
function einzeln(text: string, sprache: Sprache, tiefe = 0): string | null {
  for (const m of alleMuster()) {
    let werte: string[] | null = null;
    if (m.genau !== undefined) {
      if (m.genau !== text) continue;
      werte = [];
    } else {
      const treffer = m.regex!.exec(text);
      if (!treffer) continue;
      werte = [];
      for (const [name, wert] of Object.entries(treffer.groups ?? {})) werte[Number(name.slice(1).split("_")[0])] = wert;
      // Eingesetzt kann wieder eine bekannte Meldung sein (z. B. ein Grund aus der Fachlogik): mit übersetzen.
      if (tiefe < 2) werte = werte.map((w) => (w ? (einzeln(w, sprache, tiefe + 1) ?? w) : w));
    }
    const ziel = nachPfad(oberflaeche(sprache), m.pfad);
    if (typeof ziel === "string") return ziel;
    if (typeof ziel === "function") {
      const r = (ziel as (...a: string[]) => unknown)(...werte);
      if (typeof r === "string") return r;
    }
    return null;
  }
  return null;
}

/**
 * Meldung des Servers in der Sprache der Oberfläche. Deutsch unverändert. Besteht eine Meldung aus mehreren bekannten
 * Sätzen (z. B. zusammengesetzte Prüfergebnisse), wird Satz für Satz übersetzt; sonst bleibt sie, wie sie ist.
 */
export function serverText(text: string, sprache: Sprache): string {
  if (sprache === "de" || !text) return text;
  const ganz = einzeln(text, sprache);
  if (ganz !== null) return ganz;
  const saetze = text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"(])/);
  if (saetze.length > 1) {
    const uebersetzt = saetze.map((s) => einzeln(s, sprache));
    if (uebersetzt.every((s) => s !== null)) return uebersetzt.join(" ");
  }
  return sprache === "de-CH" ? text.replace(/ß/g, "ss") : text;
}
