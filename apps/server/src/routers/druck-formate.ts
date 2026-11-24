/**
 * Formatvorgaben der Drucke einer Schau (Entscheidung 029), Teil von `druckvorlage`: Übersicht für den Reiter „Druck“
 * (die gewählten Formate, dazu Katalogformat und Kartenvorlage aus ihrer eigenen Quelle) und Speichern der Formate.
 * Lesen dürfen alle Benutzer der Schau, ändern nur die Ausstellungsleitung; jede Änderung steht im Protokoll.
 */
import { DRUCK_FORMAT_WAHL, druckFormateLesen, kartenVorlageLesen, KARTEN_VORGABE } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { druckvorlage, schau } from "../db/schema";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, benutzerProcedure, dbId, ladeSchau } from "../trpc";
import { ladeGestaltung } from "./katalog-gestaltung";

/** Nur die genannten Drucksachen ändern; fehlende bleiben, unbekannte Schlüssel oder Formate werden abgelehnt. */
const formateEingabe = z
  .object({
    bewertungsliste: z.enum(DRUCK_FORMAT_WAHL.bewertungsliste),
    hallenplan: z.enum(DRUCK_FORMAT_WAHL.hallenplan),
    kaufbeleg: z.enum(DRUCK_FORMAT_WAHL.kaufbeleg),
    kassenbeleg: z.enum(DRUCK_FORMAT_WAHL.kassenbeleg),
  })
  .partial()
  .strict();

export const druckFormateProzeduren = {
  /** Formate aller Drucke der Schau: eigene Vorgaben, Katalogformat (Katalog-Gestaltung) und Kartenvorlage (011). */
  formate: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [g, [v]] = await Promise.all([
      ladeGestaltung(s.id),
      s.vorlageBewertungskarteId != null
        ? db.select({ name: druckvorlage.name, daten: druckvorlage.daten }).from(druckvorlage).where(and(eq(druckvorlage.id, s.vorlageBewertungskarteId), eq(druckvorlage.organisationId, s.organisationId)))
        : Promise.resolve([]),
    ]);
    return {
      formate: druckFormateLesen(s.druckFormate),
      katalog: g.format,
      karten: { vorlageId: v ? s.vorlageBewertungskarteId : null, name: v?.name ?? null, format: kartenVorlageLesen(v?.daten ?? KARTEN_VORGABE).format.art },
    };
  }),

  formateSetzen: adminProcedure.input(z.object({ schauId: dbId, formate: formateEingabe })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return db.transaction(async (tx) => {
      // Gesperrt gelesen: zwei gleichzeitige Änderungen verschiedener Drucksachen überschreiben sich nicht.
      const [z0] = await tx.select({ roh: schau.druckFormate }).from(schau).where(eq(schau.id, s.id)).for("no key update");
      const alt = druckFormateLesen(z0!.roh);
      const neu = druckFormateLesen({ ...alt, ...input.formate });
      if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
      await tx.update(schau).set({ druckFormate: neu }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Druckformate", alt, neu, akteur: ctx });
      return { ok: true, geaendert: true };
    });
  }),
};
