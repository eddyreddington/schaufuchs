/**
 * Entwürfe des Hallenplans (Entscheidung 017): den aktuellen Plan einer Schau als Entwurf speichern, einen Entwurf (oder
 * einen archivierten aus einer früheren Schau) laden, sich für einen entscheiden – die übrigen Entwürfe der Schau gehen
 * dann ins Archiv des Vereins. Laden ersetzt die Halle der Schau über „Plan neu setzen“ (mit Protokoll).
 */
import { halleOhneFestenPlan } from "@schau/domain";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/client";
import { hallenentwurf, schau } from "../db/schema";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, benutzerProcedure, dbId, fehler, ladeSchau, router } from "../trpc";
import { HALLE_EINGABE, planNeuSetzenIn } from "./katalog";

/** Höchstens so viele Entwürfe je Schau (das Archiv ist nicht begrenzt). */
const ENTWUERFE_MAX = 30;
const name = z.string().trim().min(1, "Bitte einen Namen angeben.").max(100);

async function ladeEntwurf(q: Pick<Tx, "select">, organisationId: number, id: number) {
  const [e] = await q.select().from(hallenentwurf).where(and(eq(hallenentwurf.id, id), eq(hallenentwurf.organisationId, organisationId)));
  if (!e) throw fehler("NOT_FOUND", "Entwurf nicht gefunden.");
  return e;
}
const masse = (h: { breite: number; laenge: number }) => ({ breite: h.breite, laenge: h.laenge });

export const hallenentwurfRouter = router({
  /** Entwürfe dieser Schau und das Archiv des Vereins (neueste zuerst). */
  liste: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const alle = await db
      .select({ id: hallenentwurf.id, schauId: hallenentwurf.schauId, name: hallenentwurf.name, halle: hallenentwurf.halle, archiviert: hallenentwurf.archiviert, herkunft: hallenentwurf.herkunft, createdAt: hallenentwurf.createdAt, archiviertAm: hallenentwurf.archiviertAm })
      .from(hallenentwurf)
      .where(eq(hallenentwurf.organisationId, ctx.benutzer.organisationId))
      .orderBy(desc(hallenentwurf.id))
      .limit(500);
    const kurz = ({ halle, ...e }: (typeof alle)[number]) => ({ ...e, masse: masse(halle) });
    return {
      entwuerfe: alle.filter((e) => !e.archiviert && e.schauId === s.id).map(kurz),
      archiv: alle.filter((e) => e.archiviert).map(kurz),
    };
  }),

  /** Den aktuellen Plan der Schau als Entwurf speichern. */
  speichern: adminProcedure.input(z.object({ schauId: dbId, name })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return db.transaction(async (tx) => {
      const [akt] = await tx.select({ halle: schau.halle }).from(schau).where(eq(schau.id, s.id)).for("update");
      if (!akt?.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
      const vorhanden = await tx.select({ id: hallenentwurf.id }).from(hallenentwurf).where(and(eq(hallenentwurf.schauId, s.id), eq(hallenentwurf.archiviert, false)));
      if (vorhanden.length >= ENTWUERFE_MAX) throw fehler("BAD_REQUEST", `Höchstens ${ENTWUERFE_MAX} Entwürfe je Schau – bitte erst einen löschen.`);
      const [e] = await tx
        .insert(hallenentwurf)
        .values({ organisationId: s.organisationId, schauId: s.id, name: input.name, halle: akt.halle, herkunft: s.name, erstelltVon: ctx.benutzer.id })
        .returning({ id: hallenentwurf.id });
      await protokolliere(tx, { schauId: s.id, tabelle: "hallenentwurf", datensatzId: e!.id, aktion: "Hallenplan als Entwurf gespeichert", neu: { name: input.name, ...masse(akt.halle) }, akteur: ctx });
      return { id: e!.id };
    });
  }),

  /**
   * Entwurf dieser Schau oder aus dem Archiv laden: ersetzt die Halle der Schau („Plan neu setzen“, ein fester Plan
   * entfällt). Aus dem Archiv ohne die Teile, die zu den Tieren der früheren Schau gehörten.
   */
  laden: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    const e = await ladeEntwurf(db, ctx.benutzer.organisationId, input.id);
    if (!e.archiviert && e.schauId !== s.id) throw fehler("BAD_REQUEST", "Dieser Entwurf gehört zu einer anderen Schau.");
    const halle = HALLE_EINGABE.safeParse(e.archiviert || e.schauId !== s.id ? halleOhneFestenPlan(e.halle) : e.halle);
    if (!halle.success) throw fehler("BAD_REQUEST", "Der Entwurf passt nicht mehr zu dieser Version und lässt sich nicht laden.");
    return planNeuSetzenIn(ctx, s, { halle: halle.data, grund: `Entwurf „${e.name}“ geladen` });
  }),

  umbenennen: adminProcedure.input(z.object({ id: dbId, name })).mutation(async ({ ctx, input }) => {
    const e = await ladeEntwurf(db, ctx.benutzer.organisationId, input.id);
    await db.transaction(async (tx) => {
      await tx.update(hallenentwurf).set({ name: input.name }).where(eq(hallenentwurf.id, e.id));
      await protokolliere(tx, { schauId: e.schauId, tabelle: "hallenentwurf", datensatzId: e.id, aktion: "Entwurf umbenannt", alt: { name: e.name }, neu: { name: input.name }, akteur: ctx });
    });
    return { ok: true };
  }),

  loeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const e = await ladeEntwurf(db, ctx.benutzer.organisationId, input.id);
    await db.transaction(async (tx) => {
      await tx.delete(hallenentwurf).where(eq(hallenentwurf.id, e.id));
      await protokolliere(tx, { schauId: e.schauId, tabelle: "hallenentwurf", datensatzId: e.id, aktion: e.archiviert ? "Entwurf aus dem Archiv gelöscht" : "Entwurf gelöscht", alt: { name: e.name, ...masse(e.halle) }, akteur: ctx });
    });
    return { ok: true };
  }),

  /**
   * Entscheidung: Mit `id` wird dieser Entwurf geladen und gilt; ohne gilt der aktuelle Plan. Alle übrigen Entwürfe der
   * Schau gehen ins Archiv des Vereins (für spätere Schauen); der gewählte Entwurf ist dann der Plan und fällt weg.
   */
  entscheiden: adminProcedure.input(z.object({ schauId: dbId, id: dbId.optional() })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    let gewaehlt: string | null = null;
    if (input.id) {
      const e = await ladeEntwurf(db, ctx.benutzer.organisationId, input.id);
      if (e.archiviert || e.schauId !== s.id) throw fehler("BAD_REQUEST", "Entscheiden lässt sich nur für einen Entwurf dieser Schau.");
      const halle = HALLE_EINGABE.safeParse(e.halle);
      if (!halle.success) throw fehler("BAD_REQUEST", "Der Entwurf passt nicht mehr zu dieser Version und lässt sich nicht laden.");
      await planNeuSetzenIn(ctx, s, { halle: halle.data, grund: `Entschieden für Entwurf „${e.name}“` });
      gewaehlt = e.name;
    }
    return db.transaction(async (tx) => {
      if (input.id) await tx.delete(hallenentwurf).where(eq(hallenentwurf.id, input.id));
      const archiviert = await tx
        .update(hallenentwurf)
        .set({ archiviert: true, archiviertAm: new Date() })
        .where(and(eq(hallenentwurf.schauId, s.id), eq(hallenentwurf.archiviert, false)))
        .returning({ id: hallenentwurf.id, name: hallenentwurf.name });
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Hallenplan entschieden", neu: { gewaehlt: gewaehlt ?? "aktueller Plan", insArchiv: archiviert.map((x) => x.name) }, akteur: ctx });
      return { archiviert: archiviert.length };
    });
  }),
});
