/**
 * Zuwendungsbestätigungen nach den amtlichen Mustern (BMF-Schreiben vom 7.11.2013, IV C 4 – S 2223/07/0018 :005,
 * BStBl I S. 1333; Anlagen 3, 4 und 14, Formulare 034122, 034123, 034132) für steuerbegünstigte Körperschaften im Sinne
 * des § 5 Abs. 1 Nr. 9 KStG. Wortlaut und Reihenfolge sind verbindlich und dürfen nicht verändert werden; weggelassen
 * werden nur nicht zutreffende Varianten (BMF Nr. 1 und 2). Hier stehen nur die Texte und welche Variante gilt –
 * gezeichnet wird in apps/server/src/pdf/spenden.ts. Entscheidung 013.
 */
import { datumKurz } from "./datum";
import { betragInWorten, formatEuro } from "./geld";
import { type Sachangaben, type Steuerstatus } from "./spenden";

export const UEBERSCHRIFT = {
  geld: "Bestätigung über Geldzuwendungen/Mitgliedsbeitrag",
  sache: "Bestätigung über Sachzuwendungen",
  sammel: "Sammelbestätigung über Geldzuwendungen/Mitgliedsbeiträge",
} as const;

export const UNTERZEILE =
  "im Sinne des § 10b des Einkommensteuergesetzes an eine der in § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes bezeichneten Körperschaften, Personenvereinigungen oder Vermögensmassen";

export const AUSSTELLER_TITEL = "Aussteller (Bezeichnung und Anschrift der steuerbegünstigten Einrichtung)";
export const ZUWENDENDER_TITEL = "Name und Anschrift des Zuwendenden:";

export const SACH_HERKUNFT_TEXT = {
  betrieb:
    "Die Sachzuwendung stammt nach den Angaben des Zuwendenden aus dem Betriebsvermögen. Die Zuwendung wurde nach dem Wert der Entnahme (ggf. mit dem niedrigeren gemeinen Wert) und nach der Umsatzsteuer, die auf die Entnahme entfällt, bewertet.",
  privat: "Die Sachzuwendung stammt nach den Angaben des Zuwendenden aus dem Privatvermögen.",
  unbekannt: "Der Zuwendende hat trotz Aufforderung keine Angaben zur Herkunft der Sachzuwendung gemacht.",
} as const;
export const SACH_UNTERLAGEN = "Geeignete Unterlagen, die zur Wertermittlung gedient haben, z. B. Rechnung, Gutachten, liegen vor.";

export const MITGLIEDSBEITRAG_TITEL = "Nur für steuerbegünstigte Einrichtungen, bei denen die Mitgliedsbeiträge steuerlich nicht abziehbar sind:";
export const MITGLIEDSBEITRAG_SATZ = "Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt, dessen Abzug nach § 10b Abs. 1 des Einkommensteuergesetzes ausgeschlossen ist.";

export const SAMMEL_KEINE_WEITEREN =
  "Es wird bestätigt, dass über die in der Gesamtsumme enthaltenen Zuwendungen keine weiteren Bestätigungen, weder formelle Zuwendungsbestätigungen noch Beitragsquittungen oder Ähnliches ausgestellt wurden und werden.";
export const SAMMEL_VERZICHT = "Ob es sich um den Verzicht auf Erstattung von Aufwendungen handelt, ist der Anlage zur Sammelbestätigung zu entnehmen.";

export const UNTERSCHRIFT_TITEL = "(Ort, Datum und Unterschrift des Zuwendungsempfängers)";

export const HINWEIS = [
  "Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG).",
  "Diese Bestätigung wird nicht als Nachweis für die steuerliche Berücksichtigung der Zuwendung anerkannt, wenn das Datum des Freistellungsbescheides länger als 5 Jahre bzw. das Datum der Feststellung der Einhaltung der satzungsmäßigen Voraussetzungen nach § 60a Abs. 1 AO länger als 3 Jahre seit Ausstellung des Bescheides zurückliegt (§ 63 Abs. 5 AO).",
] as const;

export const ANLAGE_TITEL = "Anlage zur Sammelbestätigung";
export const ANLAGE_SPALTEN = ["Datum der Zuwendung", "Art der Zuwendung (Geldzuwendung/Mitgliedsbeitrag)", "Verzicht auf die Erstattung von Aufwendungen (ja/nein)", "Betrag"] as const;


/** Satz zum Freistellungsbescheid bzw. zur Feststellung nach § 60a AO – nur die zutreffende Variante. */
export function bescheidSatz(st: Steuerstatus): string {
  const datum = st.bescheidDatum ? datumKurz(st.bescheidDatum) : "";
  return st.bescheidArt === "freistellung"
    ? `Wir sind wegen Förderung ${st.zwecke} nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes ${st.finanzamt} StNr. ${st.steuernummer}, vom ${datum} für den letzten Veranlagungszeitraum ${st.veranlagungszeitraum} nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.`
    : `Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde vom Finanzamt ${st.finanzamt}, StNr. ${st.steuernummer} mit Bescheid vom ${datum} nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung ${st.zwecke}.`;
}

/** „Es wird bestätigt, dass die Zuwendung nur zur Förderung … verwendet wird.“ */
export const verwendungSatz = (st: Steuerstatus) => `Es wird bestätigt, dass die Zuwendung nur zur Förderung ${st.zwecke} verwendet wird.`;

/** Betrag in Ziffern und Buchstaben (BMF Nr. 5). */
export function betragFelder(cent: number): { ziffern: string; buchstaben: string } {
  return { ziffern: formatEuro(cent), buchstaben: betragInWorten(cent) };
}

/** Text der Sachzuwendung: Bezeichnung und die zutreffenden Sätze zur Herkunft und zu den Unterlagen. */
export function sachSaetze(s: Sachangaben): string[] {
  return [SACH_HERKUNFT_TEXT[s.herkunft], ...(s.unterlagen ? [SACH_UNTERLAGEN] : [])];
}
