/**
 * Import aus Altprogrammen (Entscheidung 015): Es gibt kein Standardformat – Programme wie Vereins- und
 * Katalogprogramme exportieren Tabellen mit eigenen Überschriften. Deshalb: CSV lesen, Spalten raten und von Hand
 * zuordnen, Zeilen prüfen (Fehler und Hinweise je Zeile), Aussteller über Registriernummer bzw. Name und PLZ
 * wiedererkennen, Rassen und Farbenschläge mit Vorschlägen abgleichen. Rein und getestet; Excel liest der Server.
 */
import { normalisiereRegistriernummer, pruefeGeschlecht } from "./tiergesundheit";

export const IMPORT_FELDER = {
  name: "Name (Nachname, Vorname)",
  vorname: "Vorname",
  nachname: "Nachname",
  strasse: "Straße",
  plz: "PLZ",
  ort: "Ort",
  plzOrt: "PLZ und Ort",
  telefon: "Telefon",
  email: "E-Mail",
  verein: "Verein",
  kreisverband: "Kreisverband",
  registriernummer: "Registriernummer",
  rasse: "Rasse",
  farbenschlag: "Farbenschlag",
  rasseFarbe: "Rasse und Farbenschlag",
  geschlecht: "Geschlecht (1,0 / 0,1)",
  alter: "Alter (jung / alt)",
  verkaufspreis: "Verkaufspreis",
  ringnummer: "Ringnummer",
  jugend: "Jugend (ja / nein)",
} as const;
export type ImportFeld = keyof typeof IMPORT_FELDER;
export const AUSSTELLER_FELDER: ImportFeld[] = ["name", "vorname", "nachname", "strasse", "plz", "ort", "plzOrt", "telefon", "email", "verein", "kreisverband", "registriernummer"];
export const TIER_FELDER: ImportFeld[] = ["rasse", "farbenschlag", "rasseFarbe", "geschlecht", "alter", "verkaufspreis", "ringnummer", "jugend"];

/** CSV lesen: Trennzeichen (; , Tab) aus der ersten Zeile, Anführungszeichen nach RFC 4180, BOM weg, leere Zeilen weg. */
export function csvLesen(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const erste = t.slice(0, t.search(/\r?\n/) === -1 ? t.length : t.search(/\r?\n/));
  const zaehle = (z: string) => erste.split(z).length - 1;
  const trenner = [";", "\t", ","].sort((a, b) => zaehle(b) - zaehle(a))[0]!;
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let inAnf = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inAnf) {
      if (c === '"' && t[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"' && feld === "") inAnf = true;
    else if (c === trenner) {
      zeile.push(feld);
      feld = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = "";
    } else feld += c;
  }
  if (feld !== "" || zeile.length) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen.map((z) => z.map((f) => f.trim())).filter((z) => z.some((f) => f !== ""));
}

/** Kleinbuchstaben, Umlaute ausgeschrieben, ß → ss, Satzzeichen zu Leerzeichen. */
export function suchNorm(t: string): string {
  return t
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Überschriften aus Altprogrammen → Feld. Reihenfolge zählt: genauere Muster zuerst. */
const MUSTER: [RegExp, ImportFeld][] = [
  [/^(plz ?(und|u|\/)? ?ort|plz ort|ort ?plz)$/, "plzOrt"],
  [/^(rasse ?(und|\/|u)? ?(farbe|farbenschlag)|rasse farbe|bezeichnung|rasse farbenschlag)$/, "rasseFarbe"],
  [/^(vorname)$/, "vorname"],
  [/^(nachname|familienname|zuname)$/, "nachname"],
  [/^(name|aussteller|zuechter|zuchter|name vorname)$/, "name"],
  [/^(strasse|str|anschrift|adresse|strasse nr|strasse hausnummer)$/, "strasse"],
  [/^(plz|postleitzahl)$/, "plz"],
  [/^(ort|wohnort|stadt)$/, "ort"],
  [/^(telefon|tel|telefonnummer|handy|mobil)$/, "telefon"],
  [/^(e ?mail|mail|email adresse)$/, "email"],
  [/^(verein|ortsverein|ov)$/, "verein"],
  [/^(kreisverband|kv)$/, "kreisverband"],
  [/^(reg ?nr|registriernummer|registrier nr|vvvo|vvvo nr|betriebsnummer)$/, "registriernummer"],
  [/^(rasse)$/, "rasse"],
  [/^(farbe|farbenschlag|farbschlag)$/, "farbenschlag"],
  [/^(geschlecht|geschl|1 0 0 1|1 0|m w)$/, "geschlecht"],
  [/^(alter|j a|jung alt|jahrgang)$/, "alter"],
  [/^(preis|verkaufspreis|vk|vk preis|kaufpreis)$/, "verkaufspreis"],
  [/^(ring|ringnummer|ring nr|ringnr)$/, "ringnummer"],
  [/^(jugend|jgd)$/, "jugend"],
];

/** Für jede Spalte das wahrscheinliche Feld (oder null); jedes Feld höchstens einmal. */
export function spaltenRaten(kopf: string[]): (ImportFeld | null)[] {
  const vergeben = new Set<ImportFeld>();
  const felder = kopf.map((k): ImportFeld | null => {
    const n = suchNorm(k);
    const treffer = MUSTER.find(([m, f]) => !vergeben.has(f) && m.test(n));
    if (!treffer) return null;
    vergeben.add(treffer[1]);
    return treffer[1];
  });
  // „Name“ neben einer Spalte „Vorname“ ist in deutschen Listen der Nachname.
  const i = felder.indexOf("name");
  if (i >= 0 && felder.includes("vorname") && !felder.includes("nachname")) felder[i] = "nachname";
  return felder;
}

/** Geschlecht als „1,0“ usw.; null, wenn nicht lesbar. */
export function geschlechtLesen(t: string): string | null {
  const s = suchNorm(t);
  if (/^\d{1,2} \d{1,2}$/.test(s)) return s.replace(" ", ",");
  // Excel speichert eine getippte „1,0“ als Zahl 1 (und „2,0“ als 2): ganze Zahl = so viele männliche Tiere.
  if (/^[1-9]\d?$/.test(s)) return `${s},0`;
  if (/^(m|maennlich|hahn|haehne|taeuber|erpel|ganter|puter|hahn 1 0)$/.test(s)) return "1,0";
  if (/^(w|weiblich|henne|hennen|taeubin|ente|gans|pute)$/.test(s)) return "0,1";
  return null;
}

export function alterLesen(t: string): "jung" | "alt" | null {
  const s = suchNorm(t);
  if (/^(j|jung|jt|jungtier|jk)$/.test(s)) return "jung";
  if (/^(a|alt|at|alttier|vj|vorjaehrig|ak)$/.test(s)) return "alt";
  return null;
}

/** Preis in Cent: „25“, „25,50“, „25,-“, „12,5 €“, „1.250,00“; leer, „-“ oder Text → null. */
export function preisLesen(t: string): number | null {
  const s = t.replace(/€|eur/gi, "").trim().replace(/,[-–]$/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [euro, cent = ""] = s.replace(/\./g, "").split(",");
  return Number(euro) * 100 + Number(cent.padEnd(2, "0"));
}

const jaNein = (t: string) => /^(ja|j|x|1|true|wahr)$/i.test(t.trim());

/** Wiedererkennen: gültige Registriernummer, sonst Vorname, Nachname und PLZ. */
export function ausstellerSchluessel(a: { vorname: string; nachname: string; plz: string; registriernummer: string }): string {
  const reg = a.registriernummer ? normalisiereRegistriernummer(a.registriernummer) : null;
  // Mit Ländercode („NL1234567“), sonst fielen gleiche Ziffern aus zwei Ländern zusammen.
  if (reg) return `reg:${reg.replace(/\s/g, "")}`;
  return `name:${a.vorname.trim().toLowerCase()}|${a.nachname.trim().toLowerCase()}|${a.plz.trim()}`;
}

/** Ähnlichkeit zweier Texte (Dice-Koeffizient über Buchstabenpaare), 0 bis 1. */
export function aehnlichkeit(a: string, b: string): number {
  if (a === b) return 1;
  const paare = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const pa = paare(a);
  const pb = paare(b);
  let gemeinsam = 0;
  for (const [k, n] of pa) gemeinsam += Math.min(n, pb.get(k) ?? 0);
  const summe = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * gemeinsam) / summe;
}

/** Vorschläge aus dem Verzeichnis für Rasse und Farbenschlag aus der Datei; genaue Treffer zuerst. */
export function rassenVorschlaege<T extends { id: number; rasse: string; farbenschlag: string }>(rasse: string, farbenschlag: string, liste: T[], n = 5): (T & { genau: boolean; wert: number })[] {
  const ziel = suchNorm(`${rasse} ${farbenschlag}`);
  const zr = suchNorm(rasse);
  const zf = suchNorm(farbenschlag);
  return liste
    .map((x) => {
      const r = suchNorm(x.rasse);
      const f = suchNorm(x.farbenschlag);
      const genau = (r === zr && f === zf) || suchNorm(`${x.rasse} ${x.farbenschlag}`) === ziel;
      // Rasse zählt mehr als der Farbenschlag; „Zwerg“ gehört zur Rasse und trennt so Zwerg- von Großrassen.
      const wert = genau ? 1 : 0.65 * aehnlichkeit(r, zr) + 0.35 * aehnlichkeit(f, zf);
      return { ...x, genau, wert };
    })
    .filter((x) => x.genau || x.wert >= 0.45)
    .sort((a, b) => b.wert - a.wert)
    .slice(0, n);
}

export interface ImportAussteller {
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  verein: string;
  kreisverband: string;
  registriernummer: string;
}

export interface ImportTier {
  rasse: string;
  farbenschlag: string;
  geschlecht: string;
  art: "einzeltier" | "stamm";
  alter: "jung" | "alt";
  verkaufspreisCent: number | null;
  ringnummern: string;
  istJugend: boolean;
}

export interface ImportZeile {
  /** Zeilennummer in der Datei (1 = erste Zeile). */
  nr: number;
  aussteller: ImportAussteller;
  tier: ImportTier | null;
  fehler: string[];
  hinweise: string[];
}

/** Zeilen der Tabelle nach der Spaltenzuordnung auswerten. */
export function zeilenAuswerten(tabelle: string[][], zuordnung: (ImportFeld | null)[], opts: { mitKopf: boolean; art: "aussteller" | "meldungen" }): ImportZeile[] {
  const daten = opts.mitKopf ? tabelle.slice(1) : tabelle;
  return daten.map((z, i) => {
    const wert = (f: ImportFeld) => {
      const s = zuordnung.indexOf(f);
      return s >= 0 ? (z[s] ?? "").trim() : "";
    };
    const fehler: string[] = [];
    const hinweise: string[] = [];
    let vorname = wert("vorname");
    let nachname = wert("nachname");
    const name = wert("name");
    if (name && !vorname && !nachname) {
      if (name.includes(",")) [nachname, vorname] = name.split(",").map((x) => x.trim()) as [string, string];
      else {
        const teile = name.split(/\s+/);
        nachname = teile.pop() ?? "";
        vorname = teile.join(" ");
        if (vorname) hinweise.push("Name ohne Komma: letzter Teil als Nachname gelesen.");
      }
    }
    let plz = wert("plz");
    let ort = wert("ort");
    const plzOrt = wert("plzOrt");
    if (plzOrt && !plz && !ort) {
      const m = plzOrt.match(/^(\d{4,5})\s+(.+)$/);
      if (m) [, plz, ort] = m as unknown as [string, string, string];
      else ort = plzOrt;
    }
    const aussteller: ImportAussteller = {
      vorname,
      nachname,
      strasse: wert("strasse"),
      plz,
      ort,
      telefon: wert("telefon"),
      email: wert("email"),
      verein: wert("verein"),
      kreisverband: wert("kreisverband"),
      registriernummer: wert("registriernummer"),
    };
    // Dieselben Grenzen wie beim Speichern (ausstellerEingabe): was dort scheitert, ist hier ein Fehler der Zeile –
    // oder wird, wo es entbehrlich ist, mit Hinweis weggelassen.
    if (!nachname) fehler.push("Name fehlt.");
    else if (!vorname) fehler.push("Vorname fehlt.");
    if (vorname.length > 100) fehler.push("Vorname zu lang.");
    if (nachname.length > 100) fehler.push("Nachname zu lang.");
    if (plz.length > 20) fehler.push("PLZ zu lang.");
    // Excel speichert eine PLZ wie 07743 als Zahl 7743.
    if (/^\d{4}$/.test(plz)) {
      aussteller.plz = `0${plz}`;
      hinweise.push(`PLZ ${plz} als ${aussteller.plz} gelesen (führende 0).`);
    }
    if (!aussteller.strasse || !plz || !ort) hinweise.push("Anschrift unvollständig.");
    if (aussteller.registriernummer && !normalisiereRegistriernummer(aussteller.registriernummer)) {
      hinweise.push("Registriernummer nicht lesbar – wird nicht übernommen.");
      aussteller.registriernummer = "";
    }
    if (aussteller.email && (aussteller.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aussteller.email))) {
      hinweise.push(`E-Mail „${aussteller.email.slice(0, 40)}“ nicht lesbar – wird nicht übernommen.`);
      aussteller.email = "";
    }
    if (aussteller.telefon.length > 50) {
      hinweise.push("Telefon zu lang – wird nicht übernommen.");
      aussteller.telefon = "";
    }
    let tier: ImportTier | null = null;
    if (opts.art === "meldungen") {
      let rasse = wert("rasse");
      let farbenschlag = wert("farbenschlag");
      const rf = wert("rasseFarbe");
      if (rf && !rasse) {
        const k = rf.indexOf(",");
        if (k >= 0) {
          rasse = rf.slice(0, k).trim();
          farbenschlag = rf.slice(k + 1).trim();
        } else rasse = rf;
      }
      const geschlecht = geschlechtLesen(wert("geschlecht"));
      const alter = alterLesen(wert("alter"));
      if (!rasse) fehler.push("Rasse fehlt.");
      if (!geschlecht) fehler.push(`Geschlecht „${wert("geschlecht")}“ nicht lesbar (1,0 oder 0,1).`);
      if (!alter) fehler.push(`Alter „${wert("alter")}“ nicht lesbar (jung oder alt).`);
      const preisText = wert("verkaufspreis");
      const preis = preisText ? preisLesen(preisText) : null;
      if (preisText && preis == null && !/^(-|–|0|unverk|nv|n v)/i.test(preisText)) hinweise.push(`Verkaufspreis „${preisText}“ nicht lesbar – unverkäuflich.`);
      const g = geschlecht ?? "1,0";
      const summe = g.split(",").reduce((n, x) => n + Number(x), 0);
      const art = summe > 1 ? "stamm" : "einzeltier";
      const gf = geschlecht ? pruefeGeschlecht(art, g) : null;
      if (gf) fehler.push(`Geschlecht ${g}: ${gf}`);
      if (preis != null && preis > 10_000_000) fehler.push("Verkaufspreis über 100.000 €.");
      const ringnummern = wert("ringnummer");
      if (ringnummern.length > 200) fehler.push("Ringnummer zu lang (höchstens 200 Zeichen).");
      // Preis 0 heißt unverkäuflich.
      tier = { rasse, farbenschlag, geschlecht: g, art, alter: alter ?? "jung", verkaufspreisCent: preis || null, ringnummern, istJugend: jaNein(wert("jugend")) };
    }
    return { nr: i + 1 + (opts.mitKopf ? 1 : 0), aussteller, tier, fehler, hinweise };
  });
}
