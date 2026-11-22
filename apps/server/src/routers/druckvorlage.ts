/**
 * Druckvorlagen (vorerst Bewertungskarte): Vorlagen des Vereins anlegen, ändern, löschen; je Schau eine auswählen oder
 * für die Schau abwandeln (eigene Kopie mit schauId). Gelesen wird der Inhalt immer über kartenVorlageLesen(), damit
 * nur gültige Werte gespeichert und gedruckt werden. Jede Änderung steht im Protokoll.
 */
import { BRIEF_VORGABE, briefVorlageLesen, KARTEN_VORGABE, kartenVorlageLesen } from "@schau/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { druckvorlage, schau } from "../db/schema";
import { ladeBriefVorlage } from "../pdf/brief";
import { protokolliere } from "../services/protokoll";
import { SERIENBRIEF_AUSWAHL, serienbriefEmpfaenger } from "../services/serienbrief";
import { adminProcedure, dbId, fehler, ladeSchau, router } from "../trpc";
import { druckFormateProzeduren } from "./druck-formate";

const name = z.string().trim().min(1, "Name fehlt.").max(80);

/** Bewertungskarten-Vorlage des Vereins laden – eine fremde oder die Briefvorlage gilt als nicht vorhanden. */
async function ladeVorlage(organisationId: number, id: number) {
  const [v] = await db
    .select()
    .from(druckvorlage)
    .where(and(eq(druckvorlage.id, id), eq(druckvorlage.organisationId, organisationId), eq(druckvorlage.art, "bewertungskarte")));
  if (!v) throw fehler("NOT_FOUND", "Vorlage nicht gefunden.");
  return v;
}

export const druckvorlageRouter = router({
  // Formatvorgaben der übrigen Drucke (Entscheidung 029): druckvorlage.formate, druckvorlage.formateSetzen.
  ...druckFormateProzeduren,

  /** Alle Kartenvorlagen des Vereins: die allgemeinen und die für einzelne Schauen abgewandelten. */
  liste: adminProcedure.query(async ({ ctx }) => {
    const zeilen = await db
      .select({ id: druckvorlage.id, name: druckvorlage.name, schauId: druckvorlage.schauId, schauName: schau.name, daten: druckvorlage.daten })
      .from(druckvorlage)
      .leftJoin(schau, eq(schau.id, druckvorlage.schauId))
      .where(and(eq(druckvorlage.organisationId, ctx.benutzer.organisationId), eq(druckvorlage.art, "bewertungskarte")))
      .orderBy(asc(druckvorlage.name), asc(druckvorlage.id));
    return zeilen.map((z) => ({ ...z, daten: kartenVorlageLesen(z.daten) }));
  }),

  /** Vorgabe (so druckt SchauFUCHS ohne eigene Vorlage) – Ausgangspunkt für eine neue Vorlage. */
  vorgabe: adminProcedure.query(() => KARTEN_VORGABE),

  speichern: adminProcedure
    .input(z.object({ id: dbId.optional(), name, daten: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const daten = kartenVorlageLesen(input.daten);
      const org = ctx.benutzer.organisationId;
      return db.transaction(async (tx) => {
        if (input.id == null) {
          const [neu] = await tx.insert(druckvorlage).values({ organisationId: org, art: "bewertungskarte", name: input.name, daten }).returning({ id: druckvorlage.id });
          await protokolliere(tx, { schauId: null, tabelle: "druckvorlage", datensatzId: neu!.id, aktion: "Druckvorlage angelegt", neu: { name: input.name, daten }, akteur: ctx });
          return { id: neu!.id };
        }
        const alt = await ladeVorlage(org, input.id);
        await tx.update(druckvorlage).set({ name: input.name, daten }).where(eq(druckvorlage.id, alt.id));
        await protokolliere(tx, { schauId: alt.schauId, tabelle: "druckvorlage", datensatzId: alt.id, aktion: "Druckvorlage geändert", alt: { name: alt.name, daten: alt.daten }, neu: { name: input.name, daten }, akteur: ctx });
        return { id: alt.id };
      });
    }),

  /** Löschen: Schauen, die sie nutzen, drucken danach wieder mit der Vorgabe. */
  loeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const v = await ladeVorlage(ctx.benutzer.organisationId, input.id);
    await db.transaction(async (tx) => {
      await tx.delete(druckvorlage).where(eq(druckvorlage.id, v.id));
      await protokolliere(tx, { schauId: v.schauId, tabelle: "druckvorlage", datensatzId: v.id, aktion: "Druckvorlage gelöscht", alt: { name: v.name, daten: v.daten }, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Welche Vorlage eine Schau nutzt (null = Vorgabe) und welche zur Wahl stehen. */
  fuerSchau: adminProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const wahl = await db
      .select({ id: druckvorlage.id, name: druckvorlage.name, schauId: druckvorlage.schauId })
      .from(druckvorlage)
      .where(and(eq(druckvorlage.organisationId, s.organisationId), eq(druckvorlage.art, "bewertungskarte")))
      .orderBy(asc(druckvorlage.name));
    return { vorlageId: s.vorlageBewertungskarteId, wahl: wahl.filter((w) => w.schauId == null || w.schauId === s.id) };
  }),

  /** Vorlage für eine Schau wählen (Vereinsvorlage oder die eigene Fassung dieser Schau; null = Vorgabe). */
  waehlen: adminProcedure.input(z.object({ schauId: dbId, vorlageId: dbId.nullable() })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (input.vorlageId != null) {
      const v = await ladeVorlage(s.organisationId, input.vorlageId);
      if (v.schauId != null && v.schauId !== s.id) throw fehler("BAD_REQUEST", "Diese Vorlage gehört zu einer anderen Schau.");
    }
    await db.transaction(async (tx) => {
      await tx.update(schau).set({ vorlageBewertungskarteId: input.vorlageId }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Druckvorlage Bewertungskarte gewählt", alt: { vorlageId: s.vorlageBewertungskarteId }, neu: { vorlageId: input.vorlageId }, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Für diese Schau abwandeln: Kopie der gewählten Vorlage (oder der Vorgabe) nur für diese Schau, gleich gewählt. */
  fuerSchauAnpassen: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const quelle = s.vorlageBewertungskarteId ? await ladeVorlage(s.organisationId, s.vorlageBewertungskarteId) : null;
    if (quelle?.schauId === s.id) return { id: quelle.id };
    return db.transaction(async (tx) => {
      const daten = kartenVorlageLesen(quelle?.daten ?? KARTEN_VORGABE);
      const [neu] = await tx
        .insert(druckvorlage)
        .values({ organisationId: s.organisationId, schauId: s.id, art: "bewertungskarte", name: `${s.name}: ${quelle?.name ?? "Vorgabe"}`.slice(0, 80), daten })
        .returning({ id: druckvorlage.id });
      await tx.update(schau).set({ vorlageBewertungskarteId: neu!.id }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "druckvorlage", datensatzId: neu!.id, aktion: "Druckvorlage für die Schau angepasst", neu: { quelle: quelle?.id ?? null }, akteur: ctx });
      return { id: neu!.id };
    });
  }),

  // ── Briefvorlage (eine je Verein) ──────────────────────────────────────

  /** Briefvorlage des Vereins und die Vorgabe (zum Zurücksetzen einzelner Texte). */
  brief: adminProcedure.query(async ({ ctx }) => ({ vorlage: await ladeBriefVorlage(ctx.benutzer.organisationId), vorgabe: BRIEF_VORGABE })),

  briefSpeichern: adminProcedure.input(z.object({ daten: z.unknown() })).mutation(async ({ ctx, input }) => {
    const daten = briefVorlageLesen(input.daten);
    const org = ctx.benutzer.organisationId;
    await db.transaction(async (tx) => {
      const [alt] = await tx
        .select()
        .from(druckvorlage)
        .where(and(eq(druckvorlage.organisationId, org), eq(druckvorlage.art, "brief"), isNull(druckvorlage.schauId)))
        .orderBy(asc(druckvorlage.id))
        .limit(1);
      if (alt) await tx.update(druckvorlage).set({ daten }).where(eq(druckvorlage.id, alt.id));
      const id = alt?.id ?? (await tx.insert(druckvorlage).values({ organisationId: org, art: "brief", name: "Briefvorlage", daten }).returning({ id: druckvorlage.id }))[0]!.id;
      await protokolliere(tx, { schauId: null, tabelle: "druckvorlage", datensatzId: id, aktion: "Briefvorlage gespeichert", alt: alt?.daten ?? null, neu: daten, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Wie viele Empfänger ein Serienbrief mit dieser Auswahl hätte (vor dem Erzeugen anzeigen). */
  serienbriefAnzahl: adminProcedure.input(z.object({ auswahl: z.enum(SERIENBRIEF_AUSWAHL), schauId: dbId.optional() })).query(async ({ ctx, input }) => {
    if (input.auswahl === "schau" && input.schauId != null) await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const liste = await serienbriefEmpfaenger(ctx.benutzer.organisationId, input.auswahl, input.schauId);
    return { anzahl: liste.length, ohneAnschrift: liste.filter((a) => !a.strasse.trim() || !a.ort.trim()).length };
  }),
});
