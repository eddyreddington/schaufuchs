/**
 * Drucke für Preisrichter: Text und Gruppen zum Ankreuzen in der Preisrichterverpflichtung und die Gliederung der Bewertungsliste
 * (Zwischenköpfe je Rasse und Farbenschlag, zwei Spalten je Seite). Gezeichnet in apps/server/src/pdf/verpflichtung.ts
 * und apps/server/src/pdf/bewertungsliste.ts.
 */
import { type BriefPlatzhalter, fuelle } from "./briefvorlage";
import { bdrgGruppe } from "./preisrichter-zulassung";

/**
 * Muster für einen eigenen Text der Verpflichtung (Briefvorlage, „Muster einsetzen“). Mit Ort, Bewertungstag und
 * Rückmeldung ergibt es genau den festen Text; fehlt eine Angabe, bleibt im eigenen Text eine Lücke.
 */
export const VERPFLICHTUNG_MUSTER = {
  betreff: "Bitte um Bewertung – {Schau}",
  text: [
    "{Anrede},",
    "wir möchten Sie herzlich bitten, bei unserer Schau „{Schau}“ in {Ort} am {Bewertungstag} als Preisrichter zu bewerten.",
    "Bitte senden Sie uns den unteren Abschnitt bis {Rückmeldung} ausgefüllt und unterschrieben zurück. Kreuzen Sie dabei die Gruppen an, die Sie bewerten möchten.",
  ].join("\n\n"),
};

/**
 * Betreff und Text der Preisrichterverpflichtung: eigener Text der Briefvorlage mit Platzhaltern, sonst (leer) der feste
 * Text, der Ort, Bewertungstag und „Rückmeldung bis“ nur nennt, wenn sie feststehen.
 */
export function verpflichtungBrief(v: { betreff: string; text: string }, w: Record<BriefPlatzhalter, string>): { betreff: string; text: string } {
  const betreff = fuelle(v.betreff.trim() ? v.betreff : VERPFLICHTUNG_MUSTER.betreff, w);
  if (v.text.trim()) return { betreff, text: fuelle(v.text, w) };
  const wo = [w.Ort ? `in ${w.Ort}` : "", w.Bewertungstag ? `am ${w.Bewertungstag}` : ""].filter(Boolean).join(" ");
  const text = [
    `${w.Anrede},`,
    `wir möchten Sie herzlich bitten, bei unserer Schau „${w.Schau}“${wo ? ` ${wo}` : ""} als Preisrichter zu bewerten.`,
    `Bitte senden Sie uns den unteren Abschnitt${w.Rückmeldung ? ` bis ${w.Rückmeldung}` : ""} ausgefüllt und unterschrieben zurück. Kreuzen Sie dabei die Gruppen an, die Sie bewerten möchten.`,
  ].join("\n\n");
  return { betreff, text };
}

/** „Rückmeldung der Preisrichter bis“ (JJJJ-MM-TT) darf nicht nach dem Bewertungstag liegen; null = in Ordnung. */
export function rueckmeldungFehler(rueckmeldungBis: string | null | undefined, bewertungAm: string | null | undefined): string | null {
  if (!rueckmeldungBis || !bewertungAm || rueckmeldungBis <= bewertungAm) return null;
  return "Die Rückmeldung der Preisrichter liegt nach dem Bewertungstag – bitte das Datum prüfen.";
}

/** Gruppen zum Ankreuzen, wenn im Verzeichnis keine gepflegt sind: A bis M, Z1 bis Z3. */
export const GRUPPEN_VORGABE = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "Z1", "Z2", "Z3"] as const;

/** Gruppen zum Ankreuzen: die im Verzeichnis der Schau vorkommenden (einheitlich, ohne Doppelte, A … Z1 … Z10), sonst die Vorgabe. */
export function verpflichtungGruppen(ausVerzeichnis: (string | null | undefined)[]): string[] {
  const g = [...new Set(ausVerzeichnis.map(bdrgGruppe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  return g.length ? g : [...GRUPPEN_VORGABE];
}

/** Eine Zeile der Bewertungsliste: Zwischenkopf (Rasse, Farbenschlag; `fortsetzung` oben in einer neuen Spalte) oder ein Tier. */
export type ListenZeile<T> = { art: "rasse"; text: string; fortsetzung?: boolean } | { art: "farbe"; text: string; fortsetzung?: boolean } | { art: "tier"; tier: T };

/** Text des Zwischenkopfs für ein Tier ohne Farbenschlag nach einem Farbenschlag derselben Rasse. */
export const OHNE_FARBENSCHLAG = "ohne Farbenschlag";

/**
 * Zwischenköpfe in die Tierfolge (Katalogfolge) einsetzen: ein Kopf, wo die Rasse wechselt, darunter einer, wo der
 * Farbenschlag wechselt. Tiere ohne Farbenschlag bekommen nur dann einen Kopf, wenn sie sonst unter einem fremden stünden.
 */
export function bewertungslisteZeilen<T extends { rasse: string; farbenschlag: string }>(tiere: T[]): ListenZeile<T>[] {
  const zeilen: ListenZeile<T>[] = [];
  let rasse: string | null = null;
  let farbe: string | null = null;
  for (const t of tiere) {
    if (t.rasse !== rasse) {
      zeilen.push({ art: "rasse", text: t.rasse });
      rasse = t.rasse;
      farbe = null;
    }
    if (t.farbenschlag !== (farbe ?? "")) {
      zeilen.push({ art: "farbe", text: t.farbenschlag || OHNE_FARBENSCHLAG });
      farbe = t.farbenschlag;
    }
    zeilen.push({ art: "tier", tier: t });
  }
  return zeilen;
}

/**
 * Zeilen auf Spalten verteilen (zwei je Seite, laufend: links, rechts, nächste Seite links …). `platz(i)` ist die
 * Höhe der Spalte i (die ersten beiden kleiner wegen des Kopfs), `hoehe` die einer Zeile. Ein Zwischenkopf steht nie
 * allein am Spaltenende: passt er mit dem ersten Tier darunter nicht mehr, beginnt er die nächste Spalte. Läuft eine
 * Rasse oder ein Farbenschlag in die nächste Spalte weiter, stehen dort die Köpfe noch einmal (als Fortsetzung).
 */
export function bewertungslisteSpalten<T>(zeilen: ListenZeile<T>[], hoehe: (z: ListenZeile<T>) => number, platz: (spalte: number) => number): ListenZeile<T>[][] {
  const spalten: ListenZeile<T>[][] = [];
  let akt: ListenZeile<T>[] = [];
  let frei = platz(0);
  let rasse: string | null = null;
  let farbe: string | null = null;
  const setze = (z: ListenZeile<T>) => {
    akt.push(z);
    frei -= hoehe(z);
  };
  const neueSpalte = (mitFarbe: boolean) => {
    spalten.push(akt);
    akt = [];
    frei = platz(spalten.length);
    if (rasse != null) setze({ art: "rasse", text: rasse, fortsetzung: true });
    if (mitFarbe && farbe != null) setze({ art: "farbe", text: farbe, fortsetzung: true });
  };
  zeilen.forEach((z, i) => {
    if (z.art === "tier") {
      // Eine Spalte ohne Tier nimmt das Tier in jedem Fall – sonst bliebe ein Kopf allein, oder es liefe endlos.
      if (akt.some((x) => x.art === "tier") && hoehe(z) > frei) neueSpalte(true);
      setze(z);
      return;
    }
    // Kopf mit allem bis zum ersten Tier darunter (Rasse, Farbenschlag, Tier) zusammenhalten.
    let ende = i;
    while (ende < zeilen.length && zeilen[ende]!.art !== "tier") ende++;
    const block = zeilen.slice(i, ende + 1).reduce((n, x) => n + hoehe(x), 0);
    // Der erste Kopf eines Blocks entscheidet; ein Farbenschlag-Kopf direkt nach seinem Rassen-Kopf bleibt dabei.
    const ersterImBlock = i === 0 || zeilen[i - 1]!.art === "tier";
    if (ersterImBlock && akt.some((x) => x.art === "tier") && block > frei) {
      // Beginnt eine neue Rasse, braucht die neue Spalte keine Fortsetzung; ein neuer Farbenschlag die seiner Rasse.
      if (z.art === "rasse") rasse = null;
      farbe = null;
      neueSpalte(false);
    }
    if (z.art === "rasse") {
      rasse = z.text;
      farbe = null;
    } else farbe = z.text;
    setze(z);
  });
  if (akt.length) spalten.push(akt);
  return spalten;
}
