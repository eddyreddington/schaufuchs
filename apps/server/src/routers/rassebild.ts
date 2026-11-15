/** Rassebilder: ansehen (alle Benutzer) und pflegen (Ausstellungsleitung). */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { rasse, rassebild, sparte } from "../db/schema";
import { protokolliere } from "../services/protokoll";
import { rassebilderGeaendert } from "../services/zwischenspeicher";
import { RASSEBILD_MAX_BYTES, speichereRassebild } from "../services/rassebild";
import { adminProcedure, benutzerProcedure, dbId, fehler, router } from "../trpc";
import { pruefeVersion } from "./stammdaten";
import { pruefeLizenz } from "@schau/domain";

/** Nur http(s)-Adressen (eine „javascript:“-Adresse würde als Link ausgeführt). */
const adresse = z
  .string()
  .trim()
  .max(500)
  .default("")
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Nur Adressen mit http:// oder https://.");
const angaben = z.object({
  urheber: z.string().trim().max(300).default(""),
  lizenz: z.string().trim().max(100).default(""),
  lizenzUrl: adresse,
  quelle: adresse,
});

export const rassebildRouter = router({
  /** Alle Rassen eines Verzeichnisses mit ihrem Bild (falls vorhanden). */
  liste: benutzerProcedure.input(z.object({ versionId: dbId })).query(async ({ ctx, input }) => {
    await pruefeVersion(ctx.benutzer.organisationId, input.versionId);
    const [rassen, bilder] = await Promise.all([
      db
        .select({ rasse: rasse.name, sparte: sparte.name })
        .from(rasse)
        .innerJoin(sparte, eq(sparte.id, rasse.sparteId))
        .where(eq(rasse.versionId, input.versionId))
        .orderBy(asc(sparte.folge), asc(rasse.folge)),
      db
        .select({ id: rassebild.id, rasse: rassebild.rasse, urheber: rassebild.urheber, lizenz: rassebild.lizenz, lizenzUrl: rassebild.lizenzUrl, quelle: rassebild.quelle, geprueft: rassebild.geprueft, breite: rassebild.breite, hoehe: rassebild.hoehe, stand: rassebild.createdAt })
        .from(rassebild)
        .where(eq(rassebild.organisationId, ctx.benutzer.organisationId)),
    ]);
    const jeRasse = new Map(bilder.map((b) => [b.rasse, b]));
    return rassen.map((r) => ({ ...r, bild: jeRasse.get(r.rasse) ?? null }));
  }),

  /** Bild hochladen oder ersetzen (von Hand gepflegt = geprüft). */
  hochladen: adminProcedure
    .input(
      angaben.extend({
        rasse: z.string().trim().min(1).max(200),
        base64: z.string().max(Math.ceil((RASSEBILD_MAX_BYTES * 4) / 3) + 8),
        // Die Oberfläche schickt beim Ersetzen false: Erst mit den Angaben (Urheber, Lizenz) kommt es in den Katalog.
        geprueft: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { rasse: name, base64, geprueft: gewuenscht, ...a } = input;
      const daten = Buffer.from(base64, "base64");
      // In den Katalog nur mit katalogtauglicher Lizenz – sonst wird das Bild gespeichert, bleibt aber ungeprüft.
      const l = pruefeLizenz(a, true);
      if (l.ok && !a.lizenzUrl) a.lizenzUrl = l.lizenzUrl;
      const geprueft = gewuenscht && l.ok;
      await db.transaction(async (tx) => {
        const r = (await speichereRassebild(tx, ctx.benutzer.organisationId, name, daten, a, { geprueft }))!;
        await protokolliere(tx, { schauId: null, tabelle: "rassebild", datensatzId: r.id, aktion: "Rassebild gespeichert", alt: r.alt ? { rasse: name, ...r.alt } : undefined, neu: { rasse: name, ...a, geprueft }, akteur: ctx });
      });
      rassebilderGeaendert();
      return { ok: true, geprueft, hinweis: gewuenscht && !l.ok ? l.fehler : null };
    }),

  /** Urheber, Lizenz, Quelle und „geprüft“ ändern. */
  angabenSetzen: adminProcedure.input(angaben.extend({ id: dbId, geprueft: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { id, ...werte } = input;
    // „Passt“ (geprüft) nur mit katalogtauglicher Lizenz: Urheber und Lizenz bei CC BY, kein NC/ND.
    if (werte.geprueft) {
      const l = pruefeLizenz(werte, true);
      if (!l.ok) throw fehler("BAD_REQUEST", l.fehler);
      if (!werte.lizenzUrl) werte.lizenzUrl = l.lizenzUrl;
    }
    await db.transaction(async (tx) => {
      const [b] = await tx
        .select({ rasse: rassebild.rasse, urheber: rassebild.urheber, lizenz: rassebild.lizenz, lizenzUrl: rassebild.lizenzUrl, quelle: rassebild.quelle, geprueft: rassebild.geprueft })
        .from(rassebild)
        .where(and(eq(rassebild.id, id), eq(rassebild.organisationId, ctx.benutzer.organisationId)))
        .for("update");
      if (!b) throw fehler("NOT_FOUND", "Bild nicht gefunden.");
      await tx.update(rassebild).set(werte).where(eq(rassebild.id, id));
      await protokolliere(tx, { schauId: null, tabelle: "rassebild", datensatzId: id, aktion: "Rassebild-Angaben", alt: b, neu: { rasse: b.rasse, ...werte }, akteur: ctx });
    });
    rassebilderGeaendert();
    return { ok: true };
  }),

  loeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    await db.transaction(async (tx) => {
      const [b] = await tx
        .delete(rassebild)
        .where(and(eq(rassebild.id, input.id), eq(rassebild.organisationId, ctx.benutzer.organisationId)))
        .returning({ rasse: rassebild.rasse, urheber: rassebild.urheber, lizenz: rassebild.lizenz, lizenzUrl: rassebild.lizenzUrl, quelle: rassebild.quelle, geprueft: rassebild.geprueft });
      if (!b) throw fehler("NOT_FOUND", "Bild nicht gefunden.");
      await protokolliere(tx, { schauId: null, tabelle: "rassebild", datensatzId: input.id, aktion: "Rassebild gelöscht", alt: b, akteur: ctx });
    });
    rassebilderGeaendert();
    return { ok: true };
  }),
});
