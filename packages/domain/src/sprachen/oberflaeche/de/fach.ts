/**
 * Bezeichnungen aus der Fachlogik (`@schau/domain`), wie die Oberfläche sie zeigt. Deutsch sind es genau die Konstanten
 * der Domain (Drucke und PDF nehmen sie weiter direkt); die Übersetzungen haben dieselben Schlüssel. Nur Texte, keine Zahlen.
 */
import { GEBUEHR_LABEL, MELDEART_LABEL, PHASEN_LABEL, PREIS_ZIELGRUPPE_LABEL } from "../../../types";
import { AUSSEN_NAME } from "../../../hallenplan-umriss";
import { MOEBEL_NAME } from "../../../hallenplan-moebel";
import { KAEFIG_FUER, KAEFIG_RICHTWERT, KAEFIG_TYP_LABEL, KAEFIG_TYP_MEHRZAHL } from "../../../kaefige";
import { SORTIER_LABEL } from "../../../katalog";
import { GLEICHSTAND_LABEL } from "../../../meisterschaft";
import { SONDERNOTE_LABEL } from "../../../noten";
import { BAUSTEIN_KATEGORIE_LABEL } from "../../../textbausteine";
import { KARTEN_BAUSTEIN_LABEL, KARTEN_FORMAT_LABEL, VORDRUCK_FELD_LABEL } from "../../../druckvorlage";
import {
  KATALOG_AUFTEILUNG_INFO,
  KATALOG_FUSSZEILE_INFO,
  KATALOG_LINIEN_INFO,
  KATALOG_SCHRIFT_INFO,
  KATALOG_STIL_INFO,
  KATALOG_TEIL_INFO,
  KATALOG_TITELBILD_INFO,
  KATALOG_TITELHINTERGRUND_INFO,
} from "../../../schriften";
import { TERMIN_EBENE_INFO } from "../../../kommende-schauen";
import { SPENDE_WEG_LABEL } from "../../../spenden";
import { NACHWEIS_LABEL, TIERART_LABEL, UNTERSUCHUNG_LABEL } from "../../../tiergesundheit";
import { ZAHLART_LABEL } from "../../../zahlart";

/** Nur die Namen (ohne Faktor) der Linienstärken. */
const linien = Object.fromEntries(Object.entries(KATALOG_LINIEN_INFO).map(([k, v]) => [k, { name: v.name }])) as {
  [K in keyof typeof KATALOG_LINIEN_INFO]: { name: string };
};

export const fach = {
  AUSSEN_NAME,
  BAUSTEIN_KATEGORIE_LABEL,
  GEBUEHR_LABEL,
  GLEICHSTAND_LABEL,
  KAEFIG_FUER,
  KAEFIG_RICHTWERT,
  KAEFIG_TYP_LABEL,
  KAEFIG_TYP_MEHRZAHL,
  KARTEN_BAUSTEIN_LABEL,
  KARTEN_FORMAT_LABEL,
  KATALOG_AUFTEILUNG_INFO,
  KATALOG_FUSSZEILE_INFO,
  KATALOG_LINIEN_INFO: linien,
  KATALOG_SCHRIFT_INFO,
  KATALOG_STIL_INFO,
  KATALOG_TEIL_INFO,
  KATALOG_TITELBILD_INFO,
  KATALOG_TITELHINTERGRUND_INFO,
  MELDEART_LABEL,
  MOEBEL_NAME,
  NACHWEIS_LABEL,
  PHASEN_LABEL,
  PREIS_ZIELGRUPPE_LABEL,
  SONDERNOTE_LABEL,
  SORTIER_LABEL,
  SPENDE_WEG_LABEL,
  TERMIN_EBENE_INFO,
  TIERART_LABEL,
  UNTERSUCHUNG_LABEL,
  VORDRUCK_FELD_LABEL,
  ZAHLART_LABEL,
};
