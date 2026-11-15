/**
 * Empfänger eines Serienbriefs: Vereinsmitglieder, alle Aussteller des Vereins oder die Aussteller mit bestätigter
 * Meldung zu einer Schau. Nie: Test-Aussteller, gesperrte (Löschwunsch) und gelöschte. Sortiert nach Name.
 */
import { istVereinsmitglied } from "@schau/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { aussteller, meldung, schau } from "../db/schema";
import { eigeneVereinsnamen } from "./aussteller";
import { echteAussteller } from "./testschau";

export const SERIENBRIEF_AUSWAHL = ["mitglieder", "aussteller", "schau"] as const;
export type SerienbriefAuswahl = (typeof SERIENBRIEF_AUSWAHL)[number];

export async function serienbriefEmpfaenger(organisationId: number, auswahl: SerienbriefAuswahl, schauId?: number) {
  const felder = { id: aussteller.id, vorname: aussteller.vorname, nachname: aussteller.nachname, strasse: aussteller.strasse, plz: aussteller.plz, ort: aussteller.ort, verein: aussteller.verein, mitglied: aussteller.mitglied };
  const aktiv = and(eq(aussteller.organisationId, organisationId), isNull(aussteller.gesperrtAm), isNull(aussteller.geloeschtAm));
  if (auswahl === "schau") {
    if (schauId == null) return [];
    // Eine Testschau hat nur Test-Aussteller – dort sind sie die Empfänger; sonst nur echte.
    const zeilen = await db
      .selectDistinct(felder)
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .innerJoin(schau, eq(schau.id, meldung.schauId))
      .where(and(aktiv, eq(meldung.schauId, schauId), eq(schau.organisationId, organisationId), eq(meldung.status, "bestaetigt")))
      .orderBy(asc(aussteller.nachname), asc(aussteller.vorname));
    return zeilen;
  }
  const alle = await db.select(felder).from(aussteller).where(and(aktiv, echteAussteller())).orderBy(asc(aussteller.nachname), asc(aussteller.vorname));
  if (auswahl === "aussteller") return alle;
  const namen = await eigeneVereinsnamen(db, organisationId);
  return alle.filter((a) => istVereinsmitglied(a, namen));
}
