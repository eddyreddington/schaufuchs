/** Protokoll der Schau (Suche, Prüfung der Hash-Kette) und Postausgang des Vereins. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { postausgang } from "../../db/schema";
import { mailStatus, naechsterVersuch, versende } from "../../services/post";
import { pruefeProtokoll, sucheProtokoll } from "../../services/protokoll-suche";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";

export const protokollUndPost = {
  protokoll: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        limit: z.number().int().min(1).max(1000).default(200),
        /** Suche in der Datenbank (Wer, Aktion, Bereich, Grund, Werte). */
        q: z.string().trim().max(200).optional(),
        /** Seitenweise: nur Einträge älter als diese id (kleinste id der vorigen Seite). */
        cursor: dbId.nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      return sucheProtokoll(input.schauId, { q: input.q, vorId: input.cursor, limit: input.limit });
    }),

  /** Prüft die Hash-Kette des Protokolls: wurde etwas nachträglich verändert? */
  protokollPruefen: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return pruefeProtokoll(input.schauId);
  }),

  /** Postausgang des Vereins: nicht versandte Mails zuerst, damit ein gestörter Mailserver auffällt. */
  postausgang: adminProcedure.query(async ({ ctx }) => {
    const mails = await db
      .select({ id: postausgang.id, an: postausgang.an, betreff: postausgang.betreff, status: postausgang.status, fehler: postausgang.fehler, versuche: postausgang.versuche, createdAt: postausgang.createdAt, gesendetAm: postausgang.gesendetAm })
      .from(postausgang)
      .where(eq(postausgang.organisationId, ctx.benutzer.organisationId))
      .orderBy(sql`${postausgang.status} = 'gesendet'`, desc(postausgang.createdAt))
      .limit(100);
    return {
      ...mailStatus(),
      // „sendet“ (gerade beim Mailserver) zeigt die Liste als „wartet“.
      mails: mails.map((m) => ({ ...m, status: m.status === "sendet" ? ("wartet" as const) : m.status, naechsterVersuch: m.status === "gesendet" ? null : naechsterVersuch(m.createdAt, m.versuche) })),
    };
  }),

  /** Nicht versandte Mail erneut senden (z. B. nach Korrektur der Mailserver-Einstellungen). */
  postErneutSenden: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    if (!mailStatus().eingerichtet) throw fehler("PRECONDITION_FAILED", "Der Mailversand ist nicht eingerichtet (SMTP_URL) – die Mail bleibt im Postausgang.");
    const [m] = await db
      .update(postausgang)
      .set({ status: "wartet", fehler: "", versuche: 0 })
      .where(and(eq(postausgang.id, input.id), eq(postausgang.organisationId, ctx.benutzer.organisationId), inArray(postausgang.status, ["wartet", "fehler"])))
      .returning({ id: postausgang.id });
    if (!m) throw fehler("NOT_FOUND", "Mail nicht gefunden oder schon versendet.");
    await versende(m.id);
    return { ok: true };
  }),
};
