/**
 * Meisterschaften einer Schau (Entscheidung 014): Regeln lesen und speichern (Ausstellungsleitung, mit Protokoll),
 * Vorlagen, Ergebnisse. Die Wertung selbst ist packages/domain/src/meisterschaft.ts.
 */
import { MEISTERSCHAFT_VORLAGEN, meisterschaftLesen } from "@schau/domain";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { schau } from "../db/schema";
import { meisterschaftErgebnisse } from "../services/meisterschaften";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, benutzerProcedure, dbId, fehler, ladeSchau, router } from "../trpc";

export const meisterschaftRouter = router({
  /** Regeln der Schau (gelesen und ergänzt) und die Vorlagen. */
  regeln: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return { regeln: s.meisterschaften.map(meisterschaftLesen), vorlagen: MEISTERSCHAFT_VORLAGEN };
  }),

  speichern: adminProcedure.input(z.object({ schauId: dbId, regeln: z.array(z.unknown()).max(20) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    const regeln = input.regeln.map(meisterschaftLesen);
    await db.transaction(async (tx) => {
      await tx.update(schau).set({ meisterschaften: regeln }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Meisterschaften", alt: s.meisterschaften, neu: regeln, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Ergebnisse aller Meisterschaften (intern, mit allen Namen). */
  ergebnisse: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return meisterschaftErgebnisse(input.schauId);
  }),
});
