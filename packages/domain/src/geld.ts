const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEuro(cent: number): string {
  return EUR.format(cent / 100);
}

/** "11,50" oder "11.50" oder "11" → 1150. Ungültig → null. */
export function parseEuro(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "");
  if (t === "") return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}

/** Prozentsatz in Basispunkten (1500 = 15 %), kaufmännisch gerundet auf Cent. */
export function anteil(cent: number, basispunkte: number): number {
  return Math.round((cent * basispunkte) / 10000);
}

const EINER = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const ZEHNER = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];

/** 0 … 999 als Zahlwort in Kleinbuchstaben („einhundertfünfunddreißig“); 1 ergibt „ein“ (für „ein Euro“ wird ergänzt). */
function bisTausend(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let t = h ? `${EINER[h]}hundert` : "";
  if (r < 20) t += EINER[r]!;
  else t += `${r % 10 ? `${EINER[r % 10]}und` : ""}${ZEHNER[Math.floor(r / 10)]}`;
  return t;
}

function zahlwort(n: number): string {
  if (n === 0) return "null";
  const teile: string[] = [];
  const mio = Math.floor(n / 1_000_000);
  const tsd = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (mio) teile.push(mio === 1 ? "eine Million " : `${bisTausend(mio)} Millionen `);
  if (tsd) teile.push(`${bisTausend(tsd)}tausend`);
  // Vor „Euro“ heißt es „eintausendein Euro“, nicht „eintausendeins Euro“.
  if (rest) teile.push(rest === 1 ? "ein" : bisTausend(rest));
  return teile.join("").trim();
}

/**
 * Betrag in Worten für Quittungen: 23550 → „zweihundertfünfunddreißig Euro und fünfzig Cent“.
 * Negative Beträge werden ohne Vorzeichen geschrieben – die Richtung steht im Text der Quittung.
 */
export function betragInWorten(cent: number): string {
  const c = Math.abs(Math.round(cent));
  const euro = Math.floor(c / 100);
  const rest = c % 100;
  const e = euro === 1 ? "ein Euro" : `${zahlwort(euro)} Euro`;
  if (!rest) return e;
  return `${e} und ${rest === 1 ? "ein Cent" : `${zahlwort(rest)} Cent`}`;
}
