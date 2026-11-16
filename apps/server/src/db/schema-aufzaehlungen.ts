/** Aufzählungstypen der Datenbank (pgEnum) – Phasen, Meldearten, Status, Zahlarten u. a. Über schema.ts exportiert. */
import { ALTER, EINGANG, EINTRAG_STATUS, GEBUEHR_ARTEN, KONTINGENT_BASEN, MELDEARTEN, MELDUNG_STATUS, PHASEN, PREIS_QUELLEN, RUNDUNGEN, SONDERNOTEN, ZAHLARTEN } from "@schau/domain";
import { pgEnum } from "drizzle-orm/pg-core";

export const phaseEnum = pgEnum("phase", PHASEN);
export const meldeartEnum = pgEnum("meldeart", MELDEARTEN);
export const gebuehrArtEnum = pgEnum("gebuehr_art", GEBUEHR_ARTEN);
export const alterEnum = pgEnum("alter", ALTER);
export const eingangEnum = pgEnum("eingang", EINGANG);
export const meldungStatusEnum = pgEnum("meldung_status", MELDUNG_STATUS);
export const eintragStatusEnum = pgEnum("eintrag_status", EINTRAG_STATUS);
export const sondernoteEnum = pgEnum("sondernote", SONDERNOTEN);
export const preisQuelleEnum = pgEnum("preis_quelle", PREIS_QUELLEN);
export const rolleEnum = pgEnum("rolle", ["admin", "mitarbeiter"]);
export const zahlartEnum = pgEnum("zahlart", ZAHLARTEN);
export const erfasstAufEnum = pgEnum("erfasst_auf", ["tablet", "pc"]);
export const rundungEnum = pgEnum("rundung", RUNDUNGEN);
export const kontingentBasisEnum = pgEnum("kontingent_basis", KONTINGENT_BASEN);
