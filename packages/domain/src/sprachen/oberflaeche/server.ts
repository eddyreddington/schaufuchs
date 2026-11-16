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

let genaue: Map<string, string[]> | null = null;
/** Meldungen ohne Platzhalter, nachgeschlagen statt durchsucht. */
function genaueMeldungen(): Map<string, string[]> {
  if (!genaue) {
    genaue = new Map();
    for (const m of alleMuster()) if (m.genau !== undefined && !genaue.has(m.genau)) genaue.set(m.genau, m.pfad);
  }
  return genaue;
}

function nachPfad(wurzel: unknown, pfad: string[]): unknown {
  return pfad.reduce<unknown>((w, k) => (w && typeof w === "object" ? (w as Record<string, unknown>)[k] : undefined), wurzel);
}

/** Eine ganze Meldung übersetzen (genau oder nach Muster); `null`, wenn sie nicht bekannt ist. */
function einzeln(text: string, sprache: Sprache, tiefe: number): string | null {
  for (const m of alleMuster()) {
    let werte: string[] = [];
    if (m.genau !== undefined) {
      if (m.genau !== text) continue;
    } else {
      const treffer = m.regex!.exec(text);
      if (!treffer) continue;
      for (const [name, wert] of Object.entries(treffer.groups ?? {})) werte[Number(name.slice(1).split("_")[0])] = wert;
      // Eingesetzt kann wieder eine bekannte Meldung sein (z. B. ein Grund aus der Fachlogik): mit übersetzen.
      if (tiefe < 3) werte = werte.map((w) => (w ? (uebersetze(w, sprache, tiefe + 1) ?? w) : w));
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

/** Abkürzungen, nach denen kein neuer Satz beginnt. */
const ABKUERZUNG = /(?:^|[\s(])(?:z\. B|d\. h|u\. a|v\. a|o\. Ä|bzw|ggf|ca|Nr|Str|evtl|inkl|max|min|vgl|Abs|Art|Ziff|Kap|bspw|usw|etc)\.$/;

/** Sätze einer Meldung (neuer Satz nach . ! ? vor Großbuchstabe, Ziffer oder Anführungszeichen). */
function saetze(text: string): string[] {
  const aus: string[] = [];
  for (const teil of text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"(\d])/)) {
    if (aus.length && ABKUERZUNG.test(aus[aus.length - 1]!)) aus[aus.length - 1] += ` ${teil}`;
    else aus.push(teil);
  }
  return aus;
}

/** Alle Teile übersetzen, sonst `null`. */
function alleTeile(teile: string[], trenner: string, sprache: Sprache, tiefe: number): string | null {
  if (teile.length < 2 || tiefe >= 3) return null;
  const neu = teile.map((t) => uebersetze(t, sprache, tiefe + 1));
  return neu.every((t) => t !== null) ? neu.join(trenner) : null;
}

/**
 * Übersetzung einer Meldung oder `null`. Reihenfolge: genau bzw. nach Muster; Liste mit „; “ und mehrere Sätze Teil für
 * Teil (vor den Mustern, damit ein Platzhalter nicht über die Grenze hinweg alles schluckt – nur wenn jeder Teil bekannt
 * ist); zuletzt eine Liste mit „, “.
 */
function uebersetze(text: string, sprache: Sprache, tiefe: number): string | null {
  const genau = genaueMeldungen().get(text);
  if (genau) {
    const ziel = nachPfad(oberflaeche(sprache), genau);
    if (typeof ziel === "string") return ziel;
  }
  return (
    alleTeile(text.split("; "), "; ", sprache, tiefe) ??
    alleTeile(saetze(text), " ", sprache, tiefe) ??
    einzeln(text, sprache, tiefe) ??
    alleTeile(text.split(", "), ", ", sprache, tiefe)
  );
}

/**
 * Meldung des Servers in der Sprache der Oberfläche. Deutsch unverändert. Zusammengesetzte Meldungen (mehrere Sätze,
 * Listen mit „; “ oder „, “, bekannte Meldungen als eingesetzter Wert) werden Teil für Teil übersetzt, wenn jeder Teil
 * bekannt ist; sonst bleibt die Meldung, wie sie ist.
 */
export function serverText(text: string, sprache: Sprache): string {
  if (sprache === "de" || !text) return text;
  return uebersetze(text, sprache, 0) ?? (sprache === "de-CH" ? text.replace(/ß/g, "ss") : text);
}
