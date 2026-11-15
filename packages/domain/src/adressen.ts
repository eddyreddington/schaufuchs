/**
 * Vorschläge beim Erfassen von Ausstellern aus den eigenen Daten des Vereins (bisherige Aussteller): Ort zur PLZ,
 * Straßen im Ort, Vereine mit ihrem Kreisverband. Nichts geht nach außen; auf der öffentlichen Meldeseite nur Vereine
 * und Kreisverbände (keine Adressen anderer Aussteller).
 */
export interface AdressZeile {
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  verein?: string | null;
  kreisverband?: string | null;
}

export interface VereinVorschlag {
  verein: string;
  /** Kreisverband, wenn er für diesen Verein eindeutig ist – sonst leer. */
  kreisverband: string;
}

export interface AdressVorschlaege {
  orte: { plz: string; ort: string }[];
  strassen: { plz: string; ort: string; strasse: string }[];
  vereine: VereinVorschlag[];
  kreisverbaende: string[];
}

const sauber = (x: string | null | undefined) => (x ?? "").trim().replace(/\s+/g, " ");
const schluessel = (x: string) => x.toLocaleLowerCase("de");
// Ein Collator für alle Vergleiche: `localeCompare(…, "de")` legt bei jedem Aufruf neu an (bei Tausenden Namen spürbar).
const deutsch = new Intl.Collator("de");
const sortiert = (a: string, b: string) => deutsch.compare(a, b);

/** Straße ohne Hausnummer: „Lindenweg 12a“ → „Lindenweg“. */
export function strassenName(strasse: string | null | undefined): string {
  return sauber(strasse).replace(/\s+\d+\s*[a-zA-Z]?(\s*[-–/]\s*\d+\s*[a-zA-Z]?)?$/, "").trim();
}

/** Häufigste Schreibweise je Schlüssel (bei Gleichstand die zuerst gesehene). */
function haeufigste(werte: string[]): Map<string, string> {
  const zaehler = new Map<string, Map<string, number>>();
  for (const w of werte) {
    const k = schluessel(w);
    const m = zaehler.get(k) ?? new Map<string, number>();
    m.set(w, (m.get(w) ?? 0) + 1);
    zaehler.set(k, m);
  }
  const aus = new Map<string, string>();
  for (const [k, m] of zaehler) aus.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
  return aus;
}

export function adressVorschlaege(zeilen: AdressZeile[]): AdressVorschlaege {
  const orte = new Map<string, { plz: string; ort: string }>();
  const strassen = new Map<string, { plz: string; ort: string; strasse: string }>();
  const ortSchreibweise = haeufigste(zeilen.map((z) => sauber(z.ort)).filter(Boolean));
  for (const z of zeilen) {
    const plz = sauber(z.plz);
    const ortRoh = sauber(z.ort);
    if (!ortRoh) continue;
    const ort = ortSchreibweise.get(schluessel(ortRoh)) ?? ortRoh;
    if (/^\d{5}$/.test(plz)) orte.set(`${plz}|${schluessel(ort)}`, { plz, ort });
    const str = strassenName(z.strasse);
    if (str) strassen.set(`${plz}|${schluessel(ort)}|${schluessel(str)}`, { plz, ort, strasse: str });
  }
  const vereinSchreibweise = haeufigste(zeilen.map((z) => sauber(z.verein)).filter(Boolean));
  const kvSchreibweise = haeufigste(zeilen.map((z) => sauber(z.kreisverband)).filter(Boolean));
  const kvJeVerein = new Map<string, Set<string>>();
  for (const z of zeilen) {
    const v = sauber(z.verein);
    if (!v) continue;
    const kvs = kvJeVerein.get(schluessel(v)) ?? new Set<string>();
    const kv = sauber(z.kreisverband);
    if (kv) kvs.add(kvSchreibweise.get(schluessel(kv)) ?? kv);
    kvJeVerein.set(schluessel(v), kvs);
  }
  return {
    orte: [...orte.values()].sort((a, b) => a.plz.localeCompare(b.plz) || sortiert(a.ort, b.ort)),
    strassen: [...strassen.values()].sort((a, b) => sortiert(a.strasse, b.strasse)),
    vereine: [...kvJeVerein.entries()]
      .map(([k, kvs]) => ({ verein: vereinSchreibweise.get(k)!, kreisverband: kvs.size === 1 ? [...kvs][0]! : "" }))
      .sort((a, b) => sortiert(a.verein, b.verein)),
    kreisverbaende: [...kvSchreibweise.values()].sort(sortiert),
  };
}

/** Ort zu einer vollständigen PLZ, wenn er in den eigenen Daten eindeutig ist – sonst null. */
export function ortZurPlz(plz: string, orte: { plz: string; ort: string }[]): string | null {
  const p = plz.trim();
  if (!/^\d{5}$/.test(p)) return null;
  const treffer = [...new Set(orte.filter((o) => o.plz === p).map((o) => o.ort))];
  return treffer.length === 1 ? treffer[0]! : null;
}

/** Kreisverband zum Verein, wenn eindeutig bekannt – sonst null. */
export function kreisverbandZumVerein(verein: string, vereine: VereinVorschlag[]): string | null {
  const v = schluessel(sauber(verein));
  if (!v) return null;
  return vereine.find((x) => schluessel(x.verein) === v)?.kreisverband || null;
}

/**
 * Vergleichsschlüssel für Vereinsnamen: klein, Satzzeichen und Bindestriche als Leerzeichen – „GZV Musterdorf-Lindenau“
 * und „gzv musterdorf lindenau“ sind derselbe Verein.
 */
export function vereinsSchluessel(verein: string | null | undefined): string {
  return (verein ?? "").toLocaleLowerCase("de").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Steht in der Vereinsangabe eine der Schreibweisen, die der Verein als seine eigenen festgelegt hat? */
export function istEigenerVerein(verein: string | null | undefined, schreibweisen: readonly string[]): boolean {
  const v = vereinsSchluessel(verein);
  return !!v && schreibweisen.some((s) => vereinsSchluessel(s) === v);
}

/** Vereinsmitglied: von Hand gesetzt (`mitglied` true/false) oder sonst nach der Vereinsangabe. */
export function istVereinsmitglied(a: { verein: string | null | undefined; mitglied: boolean | null }, schreibweisen: readonly string[]): boolean {
  return a.mitglied ?? istEigenerVerein(a.verein, schreibweisen);
}

/**
 * Vorschläge aus dem Vereinsverzeichnis (nur Namen und Kreisverband): je Verein der Kreisverband, wenn er im Verzeichnis
 * eindeutig ist, dazu alle Kreisverbände. Einmal rechnen und zwischenspeichern – das Verzeichnis ändert sich selten.
 */
export function verzeichnisVorschlaege(zeilen: { verein: string; kreisverband: string }[]): { vereine: VereinVorschlag[]; kreisverbaende: string[] } {
  const v = adressVorschlaege(zeilen);
  return { vereine: v.vereine, kreisverbaende: v.kreisverbaende };
}

/**
 * Eigene Vorschläge ergänzen um das Vereinsverzeichnis. Die eigenen Daten gehen vor: Schreibweise und Kreisverband eines
 * Vereins, den der eigene Bestand kennt, bleiben, wie sie sind (auch ein dort eindeutiger Kreisverband); aus dem
 * Verzeichnis kommen nur Vereine und Kreisverbände dazu, die der eigene Bestand nicht kennt.
 */
export function mitVerzeichnis(zeilen: AdressZeile[], verzeichnis: { vereine: VereinVorschlag[]; kreisverbaende: string[] }): AdressVorschlaege {
  const eigen = adressVorschlaege(zeilen);
  const bekannt = new Set(eigen.vereine.map((v) => vereinsSchluessel(v.verein)));
  const kvBekannt = new Set(eigen.kreisverbaende.map((k) => vereinsSchluessel(k)));
  // Eigene Schreibweise eines Kreisverbands auch für Vereine, die nur im Verzeichnis stehen.
  const kvEigen = new Map(eigen.kreisverbaende.map((k) => [vereinsSchluessel(k), k]));
  const kvSchreibweise = (k: string) => (k ? (kvEigen.get(vereinsSchluessel(k)) ?? k) : "");
  // Eigene Vereine, für die der eigene Bestand gar keinen Kreisverband kennt (nicht: mehrdeutig): Kreisverband aus dem Verzeichnis.
  const mitKv = new Set(zeilen.filter((z) => sauber(z.verein) && sauber(z.kreisverband)).map((z) => vereinsSchluessel(z.verein)));
  const ausVerzeichnis = new Map(verzeichnis.vereine.map((v) => [vereinsSchluessel(v.verein), v.kreisverband]));
  const eigeneErgaenzt = eigen.vereine.map((v) => {
    const k = vereinsSchluessel(v.verein);
    return !v.kreisverband && !mitKv.has(k) && ausVerzeichnis.get(k) ? { ...v, kreisverband: kvSchreibweise(ausVerzeichnis.get(k)!) } : v;
  });
  const nurVerzeichnis = verzeichnis.vereine.filter((v) => !bekannt.has(vereinsSchluessel(v.verein))).map((v) => ({ ...v, kreisverband: kvSchreibweise(v.kreisverband) }));
  const vereine = [...eigeneErgaenzt, ...nurVerzeichnis].sort((a, b) => sortiert(a.verein, b.verein));
  const kreisverbaende = [...eigen.kreisverbaende, ...verzeichnis.kreisverbaende.filter((k) => !kvBekannt.has(vereinsSchluessel(k)))].sort(sortiert);
  return { ...eigen, vereine, kreisverbaende };
}
