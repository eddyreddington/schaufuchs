/** Gesundheitsjournal in der Halle: Liste, Eintrag erfassen, Sperre aufheben. */
import { formatKatalognummer } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { gesundheit, katalogeintrag } from "../../db/schema";
import { ladeEintraege } from "../../services/eintraege";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";

export const halleGesundheit = {
  /** Gesundheitsjournal (Art. 25 DelVO (EU) 2019/2035): Krankheit, Verdacht, Todesfall, Maßnahme. */
  gesundheit: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [eintraege, liste] = await Promise.all([
      ladeEintraege(input.schauId),
      db.select().from(gesundheit).where(eq(gesundheit.schauId, input.schauId)).orderBy(gesundheit.zeitpunkt),
    ]);
    return liste.map((g) => {
      const e = eintraege.find((x) => x.id === g.katalogeintragId);
      return { ...g, tier: e ? { katalogNr: e.katalogNr, suffix: e.suffix, bezeichnung: e.bezeichnung, geschlecht: e.geschlecht, alter: e.alter, aussteller: e.ausstellerName } : null, tierText: e ? "" : g.tierText };
    });
  }),

  gesundheitErfassen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Katalognummer wie auf der Käfigkarte („12“, „100a“); leer für Beobachtungen ohne einzelnes Tier. */
        nr: z.string().trim().max(20).default(""),
        befund: z.string().trim().min(3, "Befund fehlt.").max(1000),
        massnahme: z.string().trim().max(1000).default(""),
        tierarzt: z.string().trim().max(200).default(""),
        verendet: z.boolean().default(false),
        sperre: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      let katalogeintragId: number | null = null;
      let tierText = "";
      if (input.nr) {
        const m = input.nr.match(/^(\d+)([a-z]*)$/i);
        const e = m ? (await ladeEintraege(input.schauId)).find((x) => x.katalogNr === Number(m[1]) && x.suffix === (m[2] ?? "").toLowerCase()) : undefined;
        if (!e) throw fehler("NOT_FOUND", `Katalognummer ${input.nr} nicht gefunden.`);
        katalogeintragId = e.id;
        // Als Text festhalten: das Journal muss das Tier auch nach Storno oder Löschung der Meldung nennen.
        tierText = `${formatKatalognummer(e)} ${e.bezeichnung}, ${e.geschlecht} ${e.alter} (${e.ausstellerName})`;
      }
      // Ein verendetes Tier ist immer gesperrt (kein Verkauf, kein Preis) – das lässt sich nicht aufheben.
      const { nr: _nr, ...eingabe } = input;
      const werte = { ...eingabe, sperre: eingabe.sperre || eingabe.verendet };
      await db.transaction(async (tx) => {
        // Das Tier sperren: so ordnet sich das Erfassen mit einer gleichzeitigen Ausgabe (die sperrt das Tier auch und liest
        // die Sperren danach frisch) – Entscheidung 033.
        if (katalogeintragId) await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.id, katalogeintragId)).for("update");
        const [g] = await tx.insert(gesundheit).values({ ...werte, katalogeintragId, tierText, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "gesundheit", datensatzId: g!.id, aktion: "erfasst", neu: { ...werte, nr: input.nr }, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Sperre aufheben (z. B. Tierarzt gibt Entwarnung) – nur die Ausstellungsleitung; der Eintrag bleibt im Journal. */
  gesundheitFreigeben: adminProcedure
    .input(z.object({ schauId: dbId, id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [g] = await tx.select().from(gesundheit).where(and(eq(gesundheit.id, input.id), eq(gesundheit.schauId, input.schauId))).for("update");
        if (!g) throw fehler("NOT_FOUND", "Eintrag nicht gefunden.");
        if (g.verendet) throw fehler("BAD_REQUEST", "Ein verendetes Tier bleibt gesperrt.");
        // Schon aufgehoben (zweites Gerät mit älterer Liste, oder gleichzeitig): Zeitpunkt und Grund der ersten Aufhebung
        // bleiben im Journal stehen, nichts doppelt protokollieren.
        if (!g.sperre) return;
        await tx.update(gesundheit).set({ sperre: false, aufgehobenAm: new Date(), aufhebungGrund: input.grund }).where(eq(gesundheit.id, g.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "gesundheit", datensatzId: g.id, aktion: "Sperre aufgehoben", grund: input.grund, akteur: ctx });
      });
      return { ok: true };
    }),
};
