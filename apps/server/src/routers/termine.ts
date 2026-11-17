/**
 * Kommende Schauen: Termine anderer Schauen pflegen (von Hand oder aus abonnierten Kalendern) und für den Katalog
 * Kreis und Landesverband wählen. Termine gelten für alle Schauen des Vereins.
 */
import { kommendeSchauen, schauTage, TERMIN_EBENEN, verbandSchluessel } from "@schau/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db/client";
import { katalogGestaltung, organisation, schautermin, terminabo } from "../db/schema";
import { Bremse } from "../services/bremse";
import { protokolliere } from "../services/protokoll";
import { aboAbrufen, KalenderFehler, ladeKommende, pruefeKalenderAdresse } from "../services/termine";
import { termineGeaendert } from "../services/zwischenspeicher";
import { adminProcedure, benutzerProcedure, dbId, fehler, kalenderdatum, ladeSchau, oeffentlichSichtbarProcedure, router } from "../trpc";
import { ladeGestaltung } from "./katalog-gestaltung";

/** Höchstens so viele Abos je Verein – mehr braucht kein Kreis, und jedes kostet einen Abruf am Tag. */
export const ABOS_MAX = 30;
/** Höchstens so viele Termine je Verein. */
export const TERMINE_MAX = 2000;

const abrufBremse = new Bremse(10, 10 * 60_000, "Zu viele Abrufe. Bitte in ein paar Minuten noch einmal.");

const text = (max: number) => z.string().trim().max(max);

const terminEingabe = z
  .object({
    name: text(200).min(2, "Bitte den Namen der Schau angeben."),
    ort: text(200),
    von: kalenderdatum("Beginn ungültig."),
    bis: kalenderdatum("Ende ungültig.").nullable(),
    ebene: z.enum(TERMIN_EBENEN),
    kreisverband: text(200),
    landesverband: text(200),
    quelle: text(200),
    quelleUrl: z.union([z.literal(""), z.string().trim().max(500).url("Link ungültig.").regex(/^https?:\/\//i, "Link muss mit http:// oder https:// beginnen.")]),
  })
  .refine((t) => !t.bis || t.bis >= t.von, { message: "Das Ende liegt vor dem Beginn.", path: ["bis"] });

const aboEingabe = z.object({
  name: text(200).min(2, "Bitte einen Namen für den Kalender angeben."),
  url: text(500).min(8, "Bitte die Adresse des Kalenders angeben."),
  ebene: z.enum(TERMIN_EBENEN),
  kreisverband: text(200),
  landesverband: text(200),
  aktiv: z.boolean(),
});

async function ladeTermin(organisationId: number, id: number) {
  const [t] = await db
    .select()
    .from(schautermin)
    .where(and(eq(schautermin.id, id), eq(schautermin.organisationId, organisationId)));
  if (!t) throw fehler("NOT_FOUND", "Termin nicht gefunden.");
  return t;
}

async function ladeAbo(organisationId: number, id: number) {
  const [a] = await db
    .select()
    .from(terminabo)
    .where(and(eq(terminabo.id, id), eq(terminabo.organisationId, organisationId)));
  if (!a) throw fehler("NOT_FOUND", "Kalender nicht gefunden.");
  return a;
}

const pruefeAdresse = async (url: string) => {
  try {
    return (await pruefeKalenderAdresse(url)).toString();
  } catch (e) {
    if (e instanceof KalenderFehler) throw fehler("BAD_REQUEST", e.message);
    throw e;
  }
};

export const termineRouter = router({
  /** Alles für die Pflegeseite: Termine, Abos, Wahl im Katalog dieser Schau und die Vorschau der Katalogseite. */
  laden: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const org = ctx.benutzer.organisationId;
    const [termine, abos, gestaltung, [o], kommend] = await Promise.all([
      db.select().from(schautermin).where(eq(schautermin.organisationId, org)).orderBy(asc(schautermin.von), asc(schautermin.name)),
      db.select().from(terminabo).where(eq(terminabo.organisationId, org)).orderBy(asc(terminabo.name)),
      ladeGestaltung(s.id),
      db.select({ termineVeroeffentlichen: organisation.termineVeroeffentlichen }).from(organisation).where(eq(organisation.id, org)),
      ladeKommende(org, s.id),
    ]);
    const tage = schauTage(s.bewertungAm, s.oeffnungszeiten);
    const nach = tage?.bis ?? null;
    // Gleiche Verbände nur einmal, in der Schreibweise des ersten Eintrags.
    const verbaende = (werte: string[]) => {
      const m = new Map<string, string>();
      for (const w of werte.map((x) => x.trim()).filter(Boolean)) if (!m.has(verbandSchluessel(w))) m.set(verbandSchluessel(w), w);
      return [...m.values()].sort((a, b) => a.localeCompare(b, "de"));
    };
    return {
      termine,
      abos,
      wahl: { kreis: gestaltung.termineKreis, land: gestaltung.termineLand },
      kreise: verbaende([...termine.filter((t) => t.ebene === "kreis").map((t) => t.kreisverband), ...abos.filter((a) => a.ebene === "kreis").map((a) => a.kreisverband)]),
      laender: verbaende([...termine.filter((t) => t.ebene === "land").map((t) => t.landesverband), ...abos.filter((a) => a.ebene === "land").map((a) => a.landesverband)]),
      schautage: tage,
      /** So stünde die Seite heute im Katalog dieser Schau. */
      vorschau: nach ? kommendeSchauen(kommend, { nach, kreis: gestaltung.termineKreis, land: gestaltung.termineLand }) : [],
      teilAusgeblendet: gestaltung.ausgeblendet.includes("kommendeSchauen"),
      veroeffentlichen: o?.termineVeroeffentlichen ?? true,
      kalenderAdresse: `${config.publicUrl}/o/${org}/schauen.ics`,
    };
  }),

  /** Kreis und Landesverband für den Katalog dieser Schau (leer = alle). */
  wahlSetzen: oeffentlichSichtbarProcedure
    .input(z.object({ schauId: dbId, kreis: text(200), land: text(200) }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const werte = { termineKreis: input.kreis, termineLand: input.land };
      await db.insert(katalogGestaltung).values({ schauId: input.schauId, ...werte }).onConflictDoUpdate({ target: katalogGestaltung.schauId, set: werte });
      return { ok: true };
    }),

  /** Seite „Kommende Schauen“ im Katalog dieser Schau drucken oder weglassen (derselbe Wert wie unter „Teile des Katalogs“). */
  druckenSetzen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, an: z.boolean() })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.transaction(async (tx) => {
      await tx.insert(katalogGestaltung).values({ schauId: input.schauId }).onConflictDoNothing();
      const [g] = await tx.select({ ausgeblendet: katalogGestaltung.ausgeblendet }).from(katalogGestaltung).where(eq(katalogGestaltung.schauId, input.schauId)).for("update");
      const ohne = (g?.ausgeblendet ?? []).filter((t) => t !== "kommendeSchauen");
      await tx.update(katalogGestaltung).set({ ausgeblendet: input.an ? ohne : [...ohne, "kommendeSchauen"] }).where(eq(katalogGestaltung.schauId, input.schauId));
    });
    return { ok: true };
  }),

  /** Eigener Eintrag (neu oder geändert). Von Hand Eingetragenes gilt als geprüft und kommt in den Katalog. */
  speichern: adminProcedure.input(z.object({ id: dbId.optional(), termin: terminEingabe })).mutation(async ({ ctx, input }) => {
    const org = ctx.benutzer.organisationId;
    const t = { ...input.termin, quelle: input.termin.quelle || "eigene Eintragung" };
    const id = await db.transaction(async (tx) => {
      if (input.id != null) {
        const alt = await ladeTermin(org, input.id);
        // Wer einen Vorschlag bearbeitet, hat ihn geprüft; eine offene Abweichung ist damit erledigt.
        await tx.update(schautermin).set({ ...t, status: "uebernommen", abweichung: null }).where(eq(schautermin.id, alt.id));
        await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: alt.id, aktion: "Termin geändert", alt: { ...alt, abweichung: undefined }, neu: t, akteur: ctx });
        return alt.id;
      }
      const vorhanden = await tx.select({ id: schautermin.id }).from(schautermin).where(eq(schautermin.organisationId, org)).limit(TERMINE_MAX);
      if (vorhanden.length >= TERMINE_MAX) throw fehler("BAD_REQUEST", `Höchstens ${TERMINE_MAX} Termine. Bitte alte Termine löschen.`);
      const [neu] = await tx.insert(schautermin).values({ organisationId: org, ...t, status: "uebernommen" }).returning({ id: schautermin.id });
      await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: neu!.id, aktion: "Termin eingetragen", neu: t, akteur: ctx });
      return neu!.id;
    });
    termineGeaendert();
    return { id };
  }),

  loeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const alt = await ladeTermin(ctx.benutzer.organisationId, input.id);
    await db.transaction(async (tx) => {
      await tx.delete(schautermin).where(eq(schautermin.id, alt.id));
      await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: alt.id, aktion: "Termin gelöscht", alt, akteur: ctx });
    });
    termineGeaendert();
    return { ok: true };
  }),

  /** Vorschläge prüfen: übernehmen (dann im Katalog) oder verwerfen (kommt auch beim nächsten Abruf nicht wieder). */
  pruefen: adminProcedure
    .input(z.object({ ids: z.array(dbId).min(1).max(500), aktion: z.enum(["uebernehmen", "verwerfen"]) }))
    .mutation(async ({ ctx, input }) => {
      const org = ctx.benutzer.organisationId;
      await db.transaction(async (tx) => {
        const liste = await tx
          .select()
          .from(schautermin)
          .where(and(eq(schautermin.organisationId, org), inArray(schautermin.id, input.ids)));
        if (liste.length !== new Set(input.ids).size) throw fehler("NOT_FOUND", "Termin nicht gefunden.");
        const status = input.aktion === "uebernehmen" ? "uebernommen" : "verworfen";
        await tx.update(schautermin).set({ status }).where(inArray(schautermin.id, input.ids));
        for (const t of liste) {
          await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: t.id, aktion: input.aktion === "uebernehmen" ? "Vorschlag übernommen" : "Vorschlag verworfen", alt: { status: t.status }, neu: { status, name: t.name, von: t.von, quelle: t.quelle }, akteur: ctx });
        }
      });
      termineGeaendert();
      return { ok: true };
    }),

  /** Abweichung der Quelle übernehmen (Angaben ersetzen bzw. entfallenen Termin löschen) oder ignorieren. */
  abweichung: adminProcedure.input(z.object({ id: dbId, aktion: z.enum(["uebernehmen", "ignorieren"]) })).mutation(async ({ ctx, input }) => {
    const t = await ladeTermin(ctx.benutzer.organisationId, input.id);
    if (!t.abweichung) throw fehler("BAD_REQUEST", "Für diesen Termin meldet die Quelle keine Änderung.");
    const a = t.abweichung;
    await db.transaction(async (tx) => {
      if (input.aktion === "ignorieren") {
        await tx.update(schautermin).set({ abweichung: null }).where(eq(schautermin.id, t.id));
        await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: t.id, aktion: "Änderung der Quelle ignoriert", alt: a, akteur: ctx });
      } else if ("entfallen" in a) {
        await tx.delete(schautermin).where(eq(schautermin.id, t.id));
        await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: t.id, aktion: "Termin gelöscht (steht nicht mehr im Kalender)", alt: t, akteur: ctx });
      } else {
        await tx.update(schautermin).set({ ...a, abweichung: null }).where(eq(schautermin.id, t.id));
        await protokolliere(tx, { schauId: null, tabelle: "schautermin", datensatzId: t.id, aktion: "Änderung der Quelle übernommen", alt: { name: t.name, ort: t.ort, von: t.von, bis: t.bis }, neu: a, akteur: ctx });
      }
    });
    termineGeaendert();
    return { ok: true };
  }),

  aboSpeichern: adminProcedure.input(z.object({ id: dbId.optional(), abo: aboEingabe })).mutation(async ({ ctx, input }) => {
    const org = ctx.benutzer.organisationId;
    const abo = { ...input.abo, url: await pruefeAdresse(input.abo.url) };
    const id = await db.transaction(async (tx) => {
      if (input.id != null) {
        const alt = await ladeAbo(org, input.id);
        await tx.update(terminabo).set(abo).where(eq(terminabo.id, alt.id));
        // Ebene, Verband und Name gelten für alle Termine des Kalenders – auch für schon übernommene.
        await tx.update(schautermin).set({ ebene: abo.ebene, kreisverband: abo.kreisverband, landesverband: abo.landesverband, quelle: abo.name }).where(eq(schautermin.aboId, alt.id));
        await protokolliere(tx, { schauId: null, tabelle: "terminabo", datensatzId: alt.id, aktion: "Kalender geändert", alt, neu: abo, akteur: ctx });
        return alt.id;
      }
      const vorhanden = await tx.select({ id: terminabo.id }).from(terminabo).where(eq(terminabo.organisationId, org));
      if (vorhanden.length >= ABOS_MAX) throw fehler("BAD_REQUEST", `Höchstens ${ABOS_MAX} Kalender.`);
      const [neu] = await tx.insert(terminabo).values({ organisationId: org, ...abo }).returning({ id: terminabo.id });
      await protokolliere(tx, { schauId: null, tabelle: "terminabo", datensatzId: neu!.id, aktion: "Kalender abonniert", neu: abo, akteur: ctx });
      return neu!.id;
    });
    termineGeaendert();
    return { id };
  }),

  /** Abo beenden: offene Vorschläge verschwinden, übernommene Termine bleiben (ohne Verbindung zum Kalender). */
  aboLoeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const alt = await ladeAbo(ctx.benutzer.organisationId, input.id);
    await db.transaction(async (tx) => {
      await tx.delete(schautermin).where(and(eq(schautermin.aboId, alt.id), inArray(schautermin.status, ["vorschlag", "verworfen"])));
      await tx.update(schautermin).set({ abweichung: null }).where(eq(schautermin.aboId, alt.id));
      await tx.delete(terminabo).where(eq(terminabo.id, alt.id));
      await protokolliere(tx, { schauId: null, tabelle: "terminabo", datensatzId: alt.id, aktion: "Kalender-Abo beendet", alt, akteur: ctx });
    });
    termineGeaendert();
    return { ok: true };
  }),

  /** Jetzt abrufen statt auf den täglichen Abruf zu warten. */
  aboAbrufen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const abo = await ladeAbo(ctx.benutzer.organisationId, input.id);
    abrufBremse.versuch([`org:${ctx.benutzer.organisationId}`]);
    const r = await aboAbrufen(abo.id, ctx);
    termineGeaendert();
    return r;
  }),

  /** Eigene Schauen als Kalender veröffentlichen (für andere Vereine zum Abonnieren). */
  veroeffentlichenSetzen: adminProcedure.input(z.object({ an: z.boolean() })).mutation(async ({ ctx, input }) => {
    await db.transaction(async (tx) => {
      await tx.update(organisation).set({ termineVeroeffentlichen: input.an }).where(eq(organisation.id, ctx.benutzer.organisationId));
      await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: input.an ? "Schautermine als Kalender veröffentlicht" : "Schautermine-Kalender abgeschaltet", akteur: ctx });
    });
    return { ok: true };
  }),
});

