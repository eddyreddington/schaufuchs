/**
 * Entwürfe des Hallenplans (Entscheidung 017): den aktuellen Plan einer Schau als Entwurf speichern, einen Entwurf (oder
 * einen archivierten aus einer früheren Schau) laden, sich für einen entscheiden – die übrigen Entwürfe der Schau gehen
 * dann ins Archiv des Vereins. Ein Entwurf derselben Schau kommt beim Laden genau so zurück, wie er gespeichert wurde
 * (Halle mit Versatz und festem Plan); ein Entwurf einer anderen Schau ersetzt die Halle über „Plan neu setzen“ (seine
 * festen Plätze gehörten zu anderen Tieren). Immer mit Protokoll.
 */
import { halleOhneFestenPlan, stabilerText } from "@schau/domain";
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

type Entwurf = Awaited<ReturnType<typeof ladeEntwurf>>;
type Akteur = { benutzer: { id: number; name: string } };

/**
 * Einen Entwurf zur Halle der Schau machen. Derselben Schau mit festem Plan: genau wie gespeichert – Halle samt Versatz
 * und fester Plan (bis 21.11.2026 wurde auch hier neu gesetzt; dabei gingen festgeschriebene Aufstellung und
 * Verschobenes verloren, Rückmeldung 21.11.2026). Ohne festen Plan (automatisch geplant, oder Entwurf von vorher) und aus
 * einer anderen Schau: „Plan neu setzen“ – Teile, die nur zum festen Plan gehören, passten sonst nicht mehr zu den Tieren.
 * `tx`: in der Transaktion des Aufrufers (Entscheiden: Laden und Archivieren zusammen).
 */
async function entwurfEinsetzen(akteur: Akteur, s: Awaited<ReturnType<typeof ladeSchau>>, e: Entwurf, grund: string, tx?: Tx) {
  if (e.schauId !== s.id || !e.fest) {
    const halle = HALLE_EINGABE.safeParse(e.schauId !== s.id ? halleOhneFestenPlan(e.halle) : e.halle);
    if (!halle.success) throw fehler("BAD_REQUEST", "Der Entwurf passt nicht mehr zu dieser Version und lässt sich nicht laden.");
    return planNeuSetzenIn(akteur, s, { halle: halle.data, grund });
  }
  if (!HALLE_EINGABE.safeParse(e.halle).success) throw fehler("BAD_REQUEST", "Der Entwurf passt nicht mehr zu dieser Version und lässt sich nicht laden.");
  const fest = e.fest;
  const einsetzen = async (t: Tx) => {
    const [akt] = await t.select({ halle: schau.halle, fest: schau.hallenplanFest, phase: schau.phase }).from(schau).where(eq(schau.id, s.id)).for("update");
    // Phase unter der Sperre: eine eben abgeschlossene Schau wird nicht mehr geändert.
    if (akt?.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    const vorher = (akt?.halle ?? {}) as Record<string, unknown>;
    const nachher = e.halle as unknown as Record<string, unknown>;
    const geaendert = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].filter((k) => stabilerText(vorher[k]) !== stabilerText(nachher[k]));
    await t.update(schau).set({ halle: e.halle, hallenplanFest: fest }).where(eq(schau.id, s.id));
    await protokolliere(t, {
      schauId: s.id,
      tabelle: "schau",
      datensatzId: s.id,
      aktion: "Hallenplan aus Entwurf geladen",
      // Der überschriebene feste Plan vollständig: so lässt sich der vorige Stand aus dem Protokoll wiederherstellen.
      alt: { festPlan: akt?.fest ?? null, ...Object.fromEntries(geaendert.map((k) => [k, vorher[k] ?? null])) },
      neu: { entwurfId: e.id, fest: fest.am, ...Object.fromEntries(geaendert.map((k) => [k, nachher[k] ?? null])) },
      grund,
      akteur,
    });
    return { eingesetzt: 0, ohne: 0 };
  };
  return tx ? einsetzen(tx) : db.transaction(einsetzen);
}

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
      const [akt] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
      if (!akt?.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
      const vorhanden = await tx.select({ id: hallenentwurf.id }).from(hallenentwurf).where(and(eq(hallenentwurf.schauId, s.id), eq(hallenentwurf.archiviert, false)));
      if (vorhanden.length >= ENTWUERFE_MAX) throw fehler("BAD_REQUEST", `Höchstens ${ENTWUERFE_MAX} Entwürfe je Schau – bitte erst einen löschen.`);
      const [e] = await tx
        .insert(hallenentwurf)
        .values({ organisationId: s.organisationId, schauId: s.id, name: input.name, halle: akt.halle, fest: akt.fest ?? null, herkunft: s.name, erstelltVon: ctx.benutzer.id })
        .returning({ id: hallenentwurf.id });
      await protokolliere(tx, { schauId: s.id, tabelle: "hallenentwurf", datensatzId: e!.id, aktion: "Hallenplan als Entwurf gespeichert", neu: { name: input.name, ...masse(akt.halle) }, akteur: ctx });
      return { id: e!.id };
    });
  }),

  /** Entwurf dieser Schau (auch archiviert) oder aus dem Archiv einer früheren Schau laden – siehe `entwurfEinsetzen`. */
  laden: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    const e = await ladeEntwurf(db, ctx.benutzer.organisationId, input.id);
    if (!e.archiviert && e.schauId !== s.id) throw fehler("BAD_REQUEST", "Dieser Entwurf gehört zu einer anderen Schau.");
    return entwurfEinsetzen(ctx, s, e, `Entwurf „${e.name}“ geladen`);
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
      gewaehlt = e.name;
      // Ohne festen Plan setzt `planNeuSetzenIn` in eigener Transaktion neu – das geht nur vorher.
      if (!e.fest) await entwurfEinsetzen(ctx, s, e, `Entschieden für Entwurf „${e.name}“`);
    }
    return db.transaction(async (tx) => {
      if (input.id) {
        // Mit festem Plan: Laden, Entwurf entfernen und Archivieren zusammen – alles oder nichts. Unter der Sperre noch
        // einmal prüfen, ob der Entwurf noch da und nicht inzwischen archiviert ist.
        const [e] = await tx.select().from(hallenentwurf).where(and(eq(hallenentwurf.id, input.id), eq(hallenentwurf.organisationId, ctx.benutzer.organisationId))).for("update");
        if (!e || e.archiviert || e.schauId !== s.id) throw fehler("BAD_REQUEST", "Entscheiden lässt sich nur für einen Entwurf dieser Schau.");
        if (e.fest) await entwurfEinsetzen(ctx, s, e, `Entschieden für Entwurf „${e.name}“`, tx);
        await tx.delete(hallenentwurf).where(eq(hallenentwurf.id, input.id));
      }
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
