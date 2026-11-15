/**
 * Verzeichnis der zuständigen Veterinärämter (je Landkreis, kreisfreie Stadt bzw. Bezirk ein Eintrag): Vorschläge für das
 * Feld „Zuständiges Veterinäramt“ in den Einstellungen einer Schau. Die Daten liegen im Server (öffentliche Behördenangaben
 * mit Quelle); hier nur Suche und Text.
 */
export type Veterinaeramt = {
  land: string;
  /** Gebietskörperschaft, für die der Eintrag gilt. */
  kreis: string;
  art: "Landkreis" | "Kreis" | "kreisfreie Stadt" | "Stadtkreis" | "Region" | "Regionalverband" | "Städteregion" | "Bezirk" | "Stadtstaat";
  amt: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  /** Offizielle Seite, auf der Name und Anschrift stehen. */
  quelle: string;
  /** Zuständig auch/nur für andere Gebiete bzw. bei einer anderen Behörde angesiedelt. */
  gemeinsam: string;
};

/** Für die Suche: klein, Umlaute ausgeschrieben, Akzente und Satzzeichen weg. */
export function suchNormal(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kreisname ohne Vorsatz („Landkreis Böblingen“ → „boeblingen“), normalisiert. */
export function kreisKern(kreis: string): string {
  return suchNormal(kreis).replace(/^(?:landkreis|kreis|stadtkreis|stadt|region|staedteregion|regionalverband|bezirk|bezirksamt)\s+/, "");
}

/** Ämter, auf die alle Wörter der Suche passen (Kreis, Amt, Ort, Land); Kreisname am Anfang zuerst. */
export function veterinaeramtSuchen(liste: readonly Veterinaeramt[], suche: string, max = 8): Veterinaeramt[] {
  const woerter = suchNormal(suche).split(" ").filter(Boolean);
  if (!woerter.length) return [];
  const treffer: { e: Veterinaeramt; rang: number; kreis: string }[] = [];
  for (const e of liste) {
    const kreis = kreisKern(e.kreis);
    const alles = `${suchNormal(e.kreis)} ${suchNormal(e.amt)} ${suchNormal(e.ort)} ${suchNormal(e.land)}`;
    if (!woerter.every((w) => alles.includes(w))) continue;
    const erstes = woerter[0]!;
    const rang = kreis.startsWith(erstes) ? 0 : kreis.split(" ").some((t) => t.startsWith(erstes)) ? 1 : kreis.includes(erstes) ? 2 : 3;
    treffer.push({ e, rang, kreis });
  }
  return treffer
    .sort((a, b) => a.rang - b.rang || a.kreis.length - b.kreis.length || a.kreis.localeCompare(b.kreis))
    .slice(0, max)
    .map((t) => t.e);
}

/** Text für das Feld: „Amt, Straße, PLZ Ort“ (leere Teile fallen weg). */
export function veterinaeramtText(e: Veterinaeramt): string {
  return [e.amt, e.strasse, [e.plz, e.ort].filter(Boolean).join(" ")].map((x) => x.trim()).filter(Boolean).join(", ");
}

/**
 * Vorschlag aus Ort bzw. Anschrift der Schau: der Kreis, dessen Name als ganzes Wort darin vorkommt (der längste gewinnt).
 * Bei gleichem Namen (Landkreis und kreisfreie Stadt, z. B. Kassel) zählt ein vorangestelltes „Landkreis“ bzw. „Kreis“.
 */
export function veterinaeramtZurSchau(liste: readonly Veterinaeramt[], ortText: string): Veterinaeramt | null {
  const text = ` ${suchNormal(ortText)} `;
  if (!text.trim()) return null;
  const mitKreis = /\b(?:land)?kreis\b/.test(text);
  let bester: Veterinaeramt | null = null;
  let laenge = 0;
  for (const e of liste) {
    const name = kreisKern(e.kreis);
    if (!name || !text.includes(` ${name} `)) continue;
    const istKreis = e.art !== "kreisfreie Stadt" && e.art !== "Stadtkreis";
    const besser = name.length > laenge || (name.length === laenge && bester && istKreis === mitKreis);
    if (besser) {
      bester = e;
      laenge = name.length;
    }
  }
  return bester;
}
