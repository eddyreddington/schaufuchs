/** Gebühren und Preisarten einer Schau setzen, ändern und löschen (gesperrt, sobald Geld oder Preise daran hängen). */
import { GEBUEHR_ARTEN, PREIS_ZIELGRUPPEN, PREIS_QUELLEN, RUNDUNGEN } from "@schau/domain";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { auszahlung, bewertung, gebuehr, katalogeintrag, preisart, preisvergabe } from "../../db/schema";
import { offeneLastschrift, offenerLauf, sperreKasse } from "../../services/kasse";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, fehler, ladeSchau, dbId } from "../../trpc";

const preisartEingabe = z.object({
  id: dbId.optional(),
  schauId: dbId,
  kuerzel: z.string().min(1).max(10),
  name: z.string().max(200).min(2),
  betragCent: z.number().int().min(0).max(10_000_000),
  sachpreis: z.string().max(500),
  quelle: z.enum(PREIS_QUELLEN),
  schluesselProTiere: z.number().int().positive().max(100_000).nullable(),
  anzahlProSchluessel: z.number().int().min(0).max(1000),
  anzahlProPreisrichter: z.number().int().min(0).max(1000),
  mindestpunkte: z.number().int().min(0).max(100).nullable(),
  rundung: z.enum(RUNDUNGEN),
  folge: z.number().int().min(-100_000).max(100_000),
  zielgruppe: z.enum(PREIS_ZIELGRUPPEN).default("alle"),
  sparte: z.string().trim().max(100).default(""),
});

/**
 * Felder einer Preisart, die vergebene Preise betreffen – nach der ersten Vergabe fest. Kontingent und Rundung bleiben
 * änderbar (der Betrag steht je Vergabe fest; ein überzogenes Kontingent meldet die Prüfliste), Mindestpunkte nur so,
 * dass alle schon vergebenen Preise sie erfüllen.
 */
const PREISART_GEBUNDEN = ["betragCent", "quelle"] as const;

/** Vor Änderungen am Meldegeld: nach der ersten Auszahlung und bei offener SEPA-Datei gesperrt (Salden lägen sonst schief). */
async function pruefeGebuehrenAenderbar(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], schauId: number) {
  const [a] = await tx.select({ nr: auszahlung.quittungNr }).from(auszahlung).where(and(eq(auszahlung.schauId, schauId), isNull(auszahlung.storniertAm))).limit(1);
  if (a) throw fehler("BAD_REQUEST", `Es gibt schon Auszahlungen (Quittung ${a.nr}) – Gebühren und Preise lassen sich nicht mehr ändern.`);
  if (await offenerLauf(tx, schauId)) throw fehler("BAD_REQUEST", "Es gibt eine offene SEPA-Datei – erst buchen oder verwerfen.");
  // Die Lastschriftdatei hält die Beträge fest; neue Gebühren ergäben andere Meldegelder als die, die die Bank einzieht.
  if (await offeneLastschrift(tx, schauId)) throw fehler("BAD_REQUEST", "Es gibt eine offene Lastschriftdatei – erst buchen oder verwerfen.");
}

export const gebuehrenUndPreisarten = {
  gebuehrenSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        gebuehren: z
          .array(
            z.object({ art: z.enum(GEBUEHR_ARTEN), jugend: z.boolean(), betragCent: z.number().int().min(0).max(10_000_000), befreitPreisrichter: z.boolean() }),
          )
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        await pruefeGebuehrenAenderbar(tx, input.schauId);
        const alt = await tx.select().from(gebuehr).where(eq(gebuehr.schauId, input.schauId));
        await tx.delete(gebuehr).where(eq(gebuehr.schauId, input.schauId));
        if (input.gebuehren.length) await tx.insert(gebuehr).values(input.gebuehren.map((g) => ({ ...g, schauId: input.schauId })));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "gebuehr",
          datensatzId: null,
          aktion: "gesetzt",
          alt: alt.map(({ art, jugend, betragCent, befreitPreisrichter }) => ({ art, jugend, betragCent, befreitPreisrichter })),
          neu: input.gebuehren,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Preisart anlegen oder ändern. Ist sie schon vergeben, bleiben Betrag, Quelle, Kontingent und Mindestpunkte fest
   * (Name, Kürzel, Sachpreis und Reihenfolge lassen sich weiter ändern). Jede Änderung steht im Protokoll.
   */
  preisartSpeichern: adminProcedure.input(preisartEingabe).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const { id, ...werte } = input;
    await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      if (id) {
        const [alt] = await tx.select().from(preisart).where(and(eq(preisart.id, id), eq(preisart.schauId, input.schauId)));
        if (!alt) throw fehler("NOT_FOUND", "Preisart nicht gefunden.");
        const [{ n }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.preisartId, id))) as [{ n: number }];
        const geaendert = PREISART_GEBUNDEN.filter((k) => alt[k] !== werte[k]);
        // Die Bindung bestimmt Kontingent und Berechtigung schon vergebener Preise: dann fest.
        if (n > 0 && (alt.zielgruppe !== werte.zielgruppe || alt.sparte !== werte.sparte)) {
          throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben – die Bindung (Jugend/Senioren, Sparte) lässt sich nicht mehr ändern. Bitte eine neue Preisart anlegen.`);
        }
        if (n > 0 && geaendert.length) {
          throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben – Betrag und Quelle lassen sich nicht mehr ändern. Bitte eine neue Preisart anlegen.`);
        }
        if (n > 0 && werte.mindestpunkte != null && werte.mindestpunkte !== alt.mindestpunkte) {
          const vergeben = await tx
            .select({ nr: katalogeintrag.katalogNr, suffix: katalogeintrag.suffix, punkte: bewertung.punkte })
            .from(preisvergabe)
            .innerJoin(katalogeintrag, eq(katalogeintrag.id, preisvergabe.katalogeintragId))
            .leftJoin(bewertung, eq(bewertung.katalogeintragId, katalogeintrag.id))
            .where(eq(preisvergabe.preisartId, id));
          const darunter = vergeben.filter((v) => v.punkte == null || v.punkte < werte.mindestpunkte!);
          if (darunter.length) {
            throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon an Tiere mit weniger Punkten vergeben (Nr. ${darunter.map((v) => `${v.nr}${v.suffix}`).join(", ")}). Erst diese Preise entfernen.`);
          }
        }
        await tx.update(preisart).set(werte).where(eq(preisart.id, id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: id, aktion: "geändert", alt, neu: werte, akteur: ctx });
      } else {
        const [neu] = await tx.insert(preisart).values(werte).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: neu!.id, aktion: "angelegt", neu: werte, akteur: ctx });
      }
    });
    return { ok: true };
  }),

  preisartLoeschen: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      const [alt] = await tx.select().from(preisart).where(and(eq(preisart.id, input.id), eq(preisart.schauId, input.schauId)));
      if (!alt) throw fehler("NOT_FOUND", "Preisart nicht gefunden.");
      const [{ n }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.preisartId, input.id))) as [{ n: number }];
      if (n > 0) throw fehler("BAD_REQUEST", `„${alt.kuerzel}“ ist schon ${n}× vergeben und lässt sich nicht löschen. Erst die Preise entfernen.`);
      await tx.delete(preisart).where(eq(preisart.id, input.id));
      await protokolliere(tx, { schauId: input.schauId, tabelle: "preisart", datensatzId: input.id, aktion: "gelöscht", alt, akteur: ctx });
    });
    return { ok: true };
  }),
};
