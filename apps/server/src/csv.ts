/** CSV für Excel: Semikolon, BOM, Schutz vor Formel-Injektion. Genutzt von den Datei-Adressen. */

/** `{ zahl }`: Betrag für die CSV, bleibt unverändert (auch mit Minus) und wird nicht als Text geschützt. */
export type Zelle = string | number | { zahl: string };

export function csv(zeilen: Zelle[][]): string {
  const zelle = (v: Zelle) => {
    let t = typeof v === "object" ? v.zahl : String(v);
    // Text, der mit = + - @ oder Tab/Wagenrücklauf beginnt, wertet Excel als Formel aus (Formel-Injektion).
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[";\r\n]/.test(t) || t.startsWith("'") ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // BOM, damit Excel die Umlaute richtig liest; Semikolon wie in deutschem Excel üblich.
  return "\ufeff" + zeilen.map((z) => z.map(zelle).join(";")).join("\r\n");
}
