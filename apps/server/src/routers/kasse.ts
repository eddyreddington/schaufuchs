/**
 * Kasse: Tierverkauf, Abrechnung und Auszahlung, SEPA-Sammelüberweisung und Kassenbuch. Die Prozeduren liegen nach
 * Thema in ./kasse; hier werden sie zu einem Router zusammengesetzt.
 */
import { offenerLauf } from "../services/kasse";
import { router } from "../trpc";
import { auszahlungen } from "./kasse/auszahlung";
import { barkasse } from "./kasse/kassenbuch";
import { sepaUeberweisung } from "./kasse/sepa";
import { tierverkauf } from "./kasse/verkauf";

// SEPA-Datei: Lauf und Sperre liegen in services/kasse.ts (auch die Preisvergabe braucht sie).
export { offenerLauf };
export { abrechnungListe, AUSZAHLUNG_PHASEN, SEPA_PHASEN, sepaXml, VERKAUF_PHASEN } from "./kasse/gemeinsam";

export const kasseRouter = router({ ...tierverkauf, ...auszahlungen, ...sepaUeberweisung, ...barkasse });
