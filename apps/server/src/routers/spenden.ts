/**
 * Spenden (Entscheidung 013): steuerliche Angaben des Vereins, Spenderverzeichnis, Spenden je Schau erfassen und
 * stornieren, Zuwendungsbestätigungen (einzeln und Sammelbestätigung) ausstellen und stornieren. Geld läuft über die
 * Kassensperre und das Protokoll; Barspenden stehen im Kassenbuch (services/kassenbuch.ts).
 */
import { bescheidSperre, bestaetigungsSperren, SACH_HERKUNFT, steuerstatusLesen } from "@schau/domain";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/client";
import { bestaetigungSpende, meldung, organisation, spende, spender, zuwendungsbestaetigung } from "../db/schema";
import { inOffenerLastschrift, LASTSCHRIFT_OFFEN, offenerLauf, pruefeNichtAbgerechnet, sperreKasseMitPhase } from "../services/kasse";
import { archiviereSpendenquittung } from "../services/kassenbuch";
import { protokolliere } from "../services/protokoll";
import { ladeSpenden, ladeSteuer, sperreBestaetigungen } from "../services/spenden";
import { heuteDe } from "../services/tiergesundheit";
import { bestaetigeSpende, sammelbestaetige, storniereBestaetigung } from "../services/zuwendungsbestaetigung";
import { adminProcedure, benutzerProcedure, dbId, fehler, kalenderdatum, ladeSchau, router } from "../trpc";

const kurz = (max: number) => z.string().trim().max(max);
const spenderEingabe = z.object({
  istFirma: z.boolean().default(false),
  vorname: kurz(80).default(""),
  nachname: kurz(120).min(1, "Name fehlt."),
  strasse: kurz(120).default(""),
  plz: kurz(10).default(""),
  ort: kurz(80).default(""),
  email: kurz(200).default(""),
  nennungName: z.boolean().default(false),
  nennungBetrag: z.boolean().default(false),
  notiz: kurz(1000).default(""),
});
const grund = z.string().trim().min(3, "Bitte einen Grund angeben.").max(500);

/** Spender des Vereins laden – ein fremder gilt als nicht vorhanden. */
async function ladeSpender(organisationId: number, id: number, tx?: Tx) {
  // In einer Transaktion gesperrt: der alte Stand fürs Protokoll ist dann der, den das Update überschreibt.
  const [s] = tx
    ? await tx.select().from(spender).where(and(eq(spender.id, id), eq(spender.organisationId, organisationId))).for("update")
    : await db.select().from(spender).where(and(eq(spender.id, id), eq(spender.organisationId, organisationId)));
  if (!s) throw fehler("NOT_FOUND", "Spender nicht gefunden.");
  return s;
}

export const spendenRouter = router({
  /** Steuerliche Angaben und ob der Verein heute Zuwendungsbestätigungen ausstellen darf. */
  steuer: adminProcedure.query(async ({ ctx }) => {
    const { steuer } = await ladeSteuer(ctx.benutzer.organisationId);
    return { steuer, sperre: bescheidSperre(steuer, heuteDe()) };
  }),

  steuerSpeichern: adminProcedure.input(z.object({ steuer: z.unknown() })).mutation(async ({ ctx, input }) => {
    const neu = steuerstatusLesen(input.steuer);
    await db.transaction(async (tx) => {
      const [alt] = await tx.select({ steuer: organisation.steuer }).from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId)).for("update");
      await tx.update(organisation).set({ steuer: neu }).where(eq(organisation.id, ctx.benutzer.organisationId));
      await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: "Steuerliche Angaben", alt: alt?.steuer ?? null, neu, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Spenderverzeichnis (ohne Test-Spender), optional gesucht nach Name oder Ort. */
  spender: benutzerProcedure.input(z.object({ q: kurz(80).default("") }).default({ q: "" })).query(({ ctx, input }) => {
    const such = input.q ? or(ilike(spender.nachname, `%${input.q}%`), ilike(spender.vorname, `%${input.q}%`), ilike(spender.ort, `%${input.q}%`)) : undefined;
    return db
      .select()
      .from(spender)
      .where(and(eq(spender.organisationId, ctx.benutzer.organisationId), isNull(spender.testSchauId), such))
      .orderBy(asc(spender.nachname), asc(spender.vorname))
      .limit(500);
  }),

  spenderSpeichern: benutzerProcedure.input(z.object({ id: dbId.optional(), daten: spenderEingabe })).mutation(async ({ ctx, input }) => {
    const org = ctx.benutzer.organisationId;
    return db.transaction(async (tx) => {
      if (input.id) {
        const alt = await ladeSpender(org, input.id, tx);
        await tx.update(spender).set(input.daten).where(eq(spender.id, input.id));
        await protokolliere(tx, { schauId: null, tabelle: "spender", datensatzId: input.id, aktion: "Spender geändert", alt, neu: input.daten, akteur: ctx });
        return { id: input.id };
      }
      const [s] = await tx.insert(spender).values({ ...input.daten, organisationId: org }).returning({ id: spender.id });
      await protokolliere(tx, { schauId: null, tabelle: "spender", datensatzId: s!.id, aktion: "Spender angelegt", neu: input.daten, akteur: ctx });
      return { id: s!.id };
    });
  }),

  /** Spenden einer Schau mit Eingangstag, Bestätigung und den Gründen, warum (noch) keine Bestätigung geht. */
  liste: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [zeilen, { steuer }] = await Promise.all([ladeSpenden(db, { schauId: input.schauId }), ladeSteuer(ctx.benutzer.organisationId)]);
    const heute = heuteDe();
    return zeilen.map((z) => ({ ...z, sperren: bestaetigungsSperren(z.fuerBestaetigung, z.spender, steuer, heute) }));
  }),

  /** Spenden eines Spenders über alle Schauen (für die Sammelbestätigung) und seine Bestätigungen. */
  spenderDetails: adminProcedure.input(z.object({ spenderId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSpender(ctx.benutzer.organisationId, input.spenderId);
    const [spenden, bestaetigungen] = await Promise.all([
      ladeSpenden(db, { spenderId: s.id }),
      db
        .select({ id: zuwendungsbestaetigung.id, nummer: zuwendungsbestaetigung.nummer, art: zuwendungsbestaetigung.art, betragCent: zuwendungsbestaetigung.betragCent, createdAt: zuwendungsbestaetigung.createdAt, storniertAm: zuwendungsbestaetigung.storniertAm, stornoGrund: zuwendungsbestaetigung.stornoGrund })
        .from(zuwendungsbestaetigung)
        .where(eq(zuwendungsbestaetigung.spenderId, s.id))
        .orderBy(desc(zuwendungsbestaetigung.nummer)),
    ]);
    return { spender: s, spenden, bestaetigungen };
  }),

  /** Spende erfassen: bar (Kasse, heute), Überweisung (Eingangstag) oder Sache. Mit Spendenquittung im Belegarchiv. */
  erfassen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        spenderId: dbId,
        art: z.enum(["geld", "sache"]),
        weg: z.enum(["bar", "bank"]),
        betragCent: z.number().int().min(1, "Betrag fehlt.").max(10_000_000),
        datum: kalenderdatum().optional(),
        zweck: kurz(200).default(""),
        sache: z.object({ bezeichnung: kurz(1000).min(3, "Bitte die Sache genau bezeichnen."), herkunft: z.enum(SACH_HERKUNFT), unterlagen: z.boolean() }).optional(),
        gegenleistung: z.boolean().default(false),
        verzichtAufwand: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Spenden mehr erfassen.");
      await ladeSpender(ctx.benutzer.organisationId, input.spenderId);
      if (input.art === "sache" && !input.sache) throw fehler("BAD_REQUEST", "Bei einer Sachspende bitte die Sache bezeichnen.");
      const heute = heuteDe();
      // Bar heißt: jetzt in die Kasse. Überweisung und Sache: Tag des Eingangs, nicht in der Zukunft.
      const bar = input.art === "geld" && input.weg === "bar";
      const datum = bar ? heute : (input.datum ?? heute);
      if (datum > heute) throw fehler("BAD_REQUEST", "Der Tag der Zuwendung liegt in der Zukunft.");
      const sp = await db.transaction(async (tx) => {
        // Immer unter der Kassensperre mit frischer Phase: ein gleichzeitiger Abschluss nimmt dieselbe Sperre.
        if ((await sperreKasseMitPhase(tx, s.id)) === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Spenden mehr erfassen.");
        const [neu] = await tx
          .insert(spende)
          .values({
            schauId: s.id,
            spenderId: input.spenderId,
            art: input.art,
            weg: input.art === "sache" ? "bank" : input.weg,
            betragCent: input.betragCent,
            datum,
            zweck: input.zweck,
            sache: input.art === "sache" ? input.sache : null,
            gegenleistung: input.gegenleistung,
            verzichtAufwand: input.art === "geld" && input.verzichtAufwand,
            erfasstVon: ctx.benutzer.id,
          })
          .returning();
        await protokolliere(tx, { schauId: s.id, tabelle: "spende", datensatzId: neu!.id, aktion: bar ? "Spende bar" : input.art === "sache" ? "Sachspende" : "Spende überwiesen", neu, akteur: ctx });
        return neu!;
      });
      await archiviereSpendenquittung(s, sp.id);
      return { id: sp.id };
    }),

  /** Storno (nur Ausstellungsleitung): nicht, solange eine gültige Zuwendungsbestätigung sie umfasst. */
  stornieren: adminProcedure.input(z.object({ spendeId: dbId, grund })).mutation(async ({ ctx, input }) => {
    const [z0] = await ladeSpenden(db, { spendeId: input.spendeId });
    if (!z0 || z0.spender.organisationId !== ctx.benutzer.organisationId) throw fehler("NOT_FOUND", "Spende nicht gefunden.");
    const s = await ladeSchau(ctx.benutzer.organisationId, z0.spende.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Stornos mehr.");
    await db.transaction(async (tx) => {
      // Beide Sperren: Kasse (Barspende) und Bestätigungen (sonst bestätigt eine gleichzeitige Anfrage die Spende noch).
      if ((await sperreKasseMitPhase(tx, s.id)) === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Stornos mehr.");
      await sperreBestaetigungen(tx, ctx.benutzer.organisationId);
      // Mit dem Meldegeld zugesagt: steckt im Saldo – nach Quittung oder SEPA-Datei nicht mehr ändern.
      if (z0.spende.weg === "meldung" && z0.spende.meldungId != null) {
        const [mm] = await tx.select({ ausstellerId: meldung.ausstellerId }).from(meldung).where(eq(meldung.id, z0.spende.meldungId));
        if (mm) {
          await pruefeNichtAbgerechnet(tx, s.id, mm.ausstellerId);
          const lauf = await offenerLauf(tx, s.id);
          if (lauf?.posten.some((p) => p.ausstellerId === mm.ausstellerId)) throw fehler("CONFLICT", "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen.");
          // Die Spende steckt im Betrag, den die offene Lastschriftdatei einzieht.
          if (await inOffenerLastschrift(tx, s.id, { meldungIds: [z0.spende.meldungId] })) throw fehler("CONFLICT", LASTSCHRIFT_OFFEN);
        }
      }
      const [b] = await tx
        .select({ id: bestaetigungSpende.bestaetigungId })
        .from(bestaetigungSpende)
        .innerJoin(zuwendungsbestaetigung, eq(zuwendungsbestaetigung.id, bestaetigungSpende.bestaetigungId))
        .where(and(eq(bestaetigungSpende.spendeId, input.spendeId), isNull(zuwendungsbestaetigung.storniertAm)));
      if (b) throw fehler("BAD_REQUEST", "Die Spende steht auf einer Zuwendungsbestätigung – erst die Bestätigung stornieren.");
      const r = await tx.update(spende).set({ storniertAm: new Date(), storniertVon: ctx.benutzer.id, stornoGrund: input.grund }).where(and(eq(spende.id, input.spendeId), isNull(spende.storniertAm))).returning({ id: spende.id });
      if (!r.length) throw fehler("BAD_REQUEST", "Die Spende ist schon storniert.");
      await protokolliere(tx, { schauId: s.id, tabelle: "spende", datensatzId: input.spendeId, aktion: "Spende storniert", alt: z0.spende, grund: input.grund, akteur: ctx });
    });
    if (z0.spende.weg === "bar") await archiviereSpendenquittung(s, input.spendeId, true);
    return { ok: true };
  }),

  bestaetigen: adminProcedure.input(z.object({ spendeId: dbId })).mutation(({ ctx, input }) =>
    db.transaction((tx) => bestaetigeSpende(tx, ctx.benutzer.organisationId, input.spendeId, { benutzer: ctx.benutzer })),
  ),

  sammelbestaetigen: adminProcedure.input(z.object({ spenderId: dbId, jahr: z.number().int().min(2000).max(2100) })).mutation(({ ctx, input }) =>
    db.transaction((tx) => sammelbestaetige(tx, ctx.benutzer.organisationId, input.spenderId, input.jahr, { benutzer: ctx.benutzer })),
  ),

  bestaetigungStornieren: adminProcedure.input(z.object({ id: dbId, grund })).mutation(async ({ ctx, input }) => {
    await db.transaction((tx) => storniereBestaetigung(tx, ctx.benutzer.organisationId, input.id, input.grund, { benutzer: ctx.benutzer }));
    return { ok: true };
  }),
});
