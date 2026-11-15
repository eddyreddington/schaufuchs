export interface StammdatenZeile {
  sparte: string;
  rasse: string;
  farbenschlag: string;
}

export interface StammdatenBaum {
  sparten: {
    name: string;
    rassen: { name: string; farbenschlaege: string[] }[];
  }[];
}

const TRENNZEICHEN = [";", "\t", ","] as const;

/**
 * Zerlegt eine CSV-Zeile. Trennzeichen innerhalb von Anführungszeichen gehören zum Feld, "" steht für ".
 * `offen`: ein Anführungszeichen wurde nicht geschlossen.
 */
export function zerlegeZeile(line: string, sep: string): { teile: string[]; offen: boolean } {
  const teile: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inAnfuehrung) {
      if (c === '"' && line[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnfuehrung = false;
      else feld += c;
    } else if (c === '"' && feld.trim() === "") {
      // Anführungszeichen nur am Feldanfang öffnen – mitten im Feld ist es ein normales Zeichen.
      feld = "";
      inAnfuehrung = true;
    } else if (c === sep) {
      teile.push(feld.trim());
      feld = "";
    } else feld += c;
  }
  teile.push(feld.trim());
  return { teile, offen: inAnfuehrung };
}

/**
 * Trennzeichen der Datei. Es gibt drei Spalten, also gewinnt das erste Zeichen (; vor Tab vor ,),
 * das außerhalb von Anführungszeichen mindestens zweimal vorkommt. So bleibt
 * "Tauben;Modeneser;blau, gesäumt, mit Binden" eine Semikolon-Zeile, obwohl sie mehr Kommas hat.
 */
function erkenneTrennzeichen(line: string): string {
  const anzahl = (sep: string) => zerlegeZeile(line, sep).teile.length - 1;
  return TRENNZEICHEN.find((sep) => anzahl(sep) >= 2) ?? TRENNZEICHEN.find((sep) => anzahl(sep) >= 1) ?? ";";
}

/**
 * Liest eine CSV mit den Spalten Sparte;Rasse;Farbenschlag.
 * Die Reihenfolge der Zeilen ist die Ausstellungsfolge. Trennzeichen ; oder , oder Tab –
 * einmal aus der ersten Datenzeile bestimmt. Felder mit Trennzeichen in Anführungszeichen setzen.
 */
export function parseStammdatenCsv(text: string): { baum: StammdatenBaum; fehler: string[] } {
  const fehler: string[] = [];
  const zeilen = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const sparten: StammdatenBaum["sparten"] = [];
  const seen = new Set<string>();
  let sep: string | null = null;

  zeilen.forEach((roh, i) => {
    const line = roh.trim();
    if (!line || line.startsWith("#")) return;
    sep ??= erkenneTrennzeichen(line);
    const { teile, offen } = zerlegeZeile(line, sep);
    if (offen) {
      fehler.push(`Zeile ${i + 1}: Anführungszeichen nicht geschlossen.`);
      return;
    }
    const [sparte, rasse, farbenschlag] = teile;
    if (/^sparte$/i.test(sparte ?? "") && /^rasse$/i.test(rasse ?? "")) return; // Kopfzeile, auch nach Kommentaren
    if (!sparte || !rasse || !farbenschlag) {
      fehler.push(`Zeile ${i + 1}: drei Spalten erwartet (Sparte;Rasse;Farbenschlag).`);
      return;
    }
    // Leere Spalten am Ende (z. B. aus Excel) sind harmlos, Inhalt dort deutet auf ein Trennzeichen im Feld.
    if (teile.slice(3).some((t) => t !== "")) {
      fehler.push(`Zeile ${i + 1}: mehr als drei Spalten – Trennzeichen im Feld? Feld in Anführungszeichen setzen.`);
      return;
    }
    const key = `${sparte}|${rasse}|${farbenschlag}`.toLowerCase();
    if (seen.has(key)) {
      fehler.push(`Zeile ${i + 1}: doppelt (${rasse}, ${farbenschlag}).`);
      return;
    }
    seen.add(key);
    let s = sparten.find((x) => x.name === sparte);
    if (!s) sparten.push((s = { name: sparte, rassen: [] }));
    let r = s.rassen.find((x) => x.name === rasse);
    if (!r) s.rassen.push((r = { name: rasse, farbenschlaege: [] }));
    r.farbenschlaege.push(farbenschlag);
  });

  return { baum: { sparten }, fehler };
}
