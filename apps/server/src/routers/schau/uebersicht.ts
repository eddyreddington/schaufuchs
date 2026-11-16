/** Schauen lesen: Verzeichnis der Veterinärämter, Liste der Schauen, eine Schau mit Gebühren und Preisarten, Übersicht. */
import { STANDARD_NOTENSKALA } from "@schau/domain";
import { asc, count, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { gebuehr, meldung, preisart, schau, zahlung } from "../../db/schema";
import { ladeEintraege } from "../../services/eintraege";
import { checkliste } from "../../services/pruefung";
import { benutzerProcedure, ladeSchau, dbId } from "../../trpc";
import type { Veterinaeramt } from "@schau/domain";
import veterinaeraemter from "../../daten/veterinaeraemter.json";

export const schauLesen = {
  /**
   * Verzeichnis der zuständigen Veterinärämter (öffentliche Behördenangaben mit Quelle, siehe daten/veterinaeraemter.json)
   * für die Vorschläge im Feld „Zuständiges Veterinäramt“. Ändert sich nur mit einer neuen Version des Programms.
   */
  veterinaeraemter: benutzerProcedure.query(() => ({
    stand: veterinaeraemter.stand,
    eintraege: veterinaeraemter.eintraege as Veterinaeramt[],
  })),

  liste: benutzerProcedure.query(({ ctx }) =>
    db
      .select({
        id: schau.id,
        name: schau.name,
        ort: schau.ort,
        phase: schau.phase,
        meldeschluss: schau.meldeschluss,
        bewertungAm: schau.bewertungAm,
        slug: schau.slug,
        test: schau.test,
      })
      .from(schau)
      .where(eq(schau.organisationId, ctx.benutzer.organisationId))
      .orderBy(desc(schau.createdAt)),
  ),

  get: benutzerProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    const [gebuehren, preisarten] = await Promise.all([
      db.select().from(gebuehr).where(eq(gebuehr.schauId, s.id)),
      db.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge), asc(preisart.id)),
    ]);
    return { ...s, notenskala: s.notenskala ?? STANDARD_NOTENSKALA, gebuehren, preisarten };
  }),

  uebersicht: benutzerProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    const [eintraege, meldungen, [bezahlt], punkte] = await Promise.all([
      ladeEintraege(s.id),
      db.select({ status: meldung.status, n: count() }).from(meldung).where(eq(meldung.schauId, s.id)).groupBy(meldung.status),
      db
        .select({ s: sum(zahlung.betragCent) })
        .from(zahlung)
        .innerJoin(meldung, eq(meldung.id, zahlung.meldungId))
        .where(eq(meldung.schauId, s.id)),
      checkliste(s.id),
    ]);
    const aktiv = eintraege.filter((e) => e.meldungStatus === "bestaetigt");
    const n = (st: string) => meldungen.find((m) => m.status === st)?.n ?? 0;
    return {
      schau: s,
      zahlen: {
        meldungen: meldungen.reduce((a, m) => a + m.n, 0),
        meldungenOffen: n("offen"),
        meldungenBestaetigt: n("bestaetigt"),
        tiereGemeldet: eintraege.filter((e) => e.meldungStatus !== "abgelehnt" && e.meldungStatus !== "storniert").length,
        tiereBestaetigt: aktiv.length,
        eingeliefert: aktiv.filter((e) => e.status === "eingeliefert" || e.status === "ausgesetzt").length,
        fehlt: aktiv.filter((e) => e.status === "fehlt").length,
        bewertet: aktiv.filter((e) => e.bewertet).length,
        preise: aktiv.reduce((a, e) => a + e.preise.length, 0),
        verkauft: aktiv.filter((e) => e.verkauftAn).length,
        bezahltCent: Number(bezahlt?.s ?? 0),
      },
      checkliste: punkte,
    };
  }),
};
