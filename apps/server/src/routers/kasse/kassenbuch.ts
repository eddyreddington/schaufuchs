/** Kassenbuch der Barkasse: Tage mit Bewegungen, Einlage und Entnahme, Tagesabschluss, archivierte Belege. */
import { datumKurz } from "@schau/domain";
import { z } from "zod";
import { db } from "../../db/client";
import { kassenabschluss, kassenbewegung, KASSENBEWEGUNG_ARTEN } from "../../db/schema";
import { sperreKasse, sperreKasseMitPhase } from "../../services/kasse";
import { archiviereKassenbeleg, belegListe, ladeKassenbuch, sollBestand } from "../../services/kassenbuch";
import { protokolliere } from "../../services/protokoll";
import { heuteDe } from "../../services/tiergesundheit";
import { benutzerProcedure, fehler, ladeSchau, dbId, kalenderdatum } from "../../trpc";
import { istKalenderdatum, letzterAbschluss, pruefeKassenbestand } from "./gemeinsam";

export const barkasse = {
  // ── Kassenbuch (Barkasse) ───────────────────────────────────────────────

  /** Kassenbuch nach Tagen: Anfangsbestand, Bargeldbewegungen, Soll, Tagesabschluss. */
  kassenbuch: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const tage = await ladeKassenbuch(input.schauId);
    const heute = heuteDe();
    // Abzuschließen ist immer der älteste Tag mit Bargeld ohne Abschluss (nach Mitternacht also der Vortag) –
    // Kassentage nur der Reihe nach, sonst stimmte der Anfangsbestand nicht. Ohne offenen Tag: heute.
    // Tage vor dem letzten Abschluss zählen nicht mehr (Bestand vor Einführung der Reihenfolge: ein übersprungener Tag
    // ließe sich nie mehr abschließen und blockierte sonst die Kasse für immer).
    const letzter = letzterAbschluss(tage);
    // Offen ist auch ein abgeschlossener Tag mit Barbuchungen danach: er braucht einen Nachtragsabschluss.
    const offen = tage.filter((t) => ((!t.abschluss && t.bewegungen.length && t.datum > letzter) || t.nachtragOffen) && t.datum <= heute).map((t) => t.datum);
    const heuteTag = tage.find((t) => t.datum === heute);
    const heuteAbgeschlossen = !!heuteTag?.abschluss && !heuteTag.nachtragOffen;
    const vorschlag = offen[0] ?? heute;
    const sollJe = { [vorschlag]: await sollBestand(input.schauId, db, vorschlag) };
    const nachtragJe = Object.fromEntries(offen.map((d) => [d, !!tage.find((t) => t.datum === d)?.abschluss]));
    return { tage, heute, heuteAbgeschlossen, sollCent: sollJe[vorschlag] ?? 0, vorschlag, offeneTage: offen[0] || !heuteAbgeschlossen ? [vorschlag] : [], sollJe, nachtragJe };
  }),

  /** Wechselgeld zu Beginn, Einlage oder Entnahme (z. B. Bargeld zur Bank). */
  kassenbewegung: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        art: z.enum(KASSENBEWEGUNG_ARTEN),
        betragCent: z.number().int().min(1, "Betrag fehlt.").max(10_000_000),
        grund: z.string().trim().max(500).default(""),
        /** Entnahme, obwohl das Kassenbuch nicht so viel Bargeld ausweist (nur nach Rückfrage). */
        trotzdem: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Kassenbuchungen mehr.");
      if (input.art === "entnahme" && input.grund.length < 3) throw fehler("BAD_REQUEST", "Bei einer Entnahme bitte den Zweck angeben (z. B. „Einzahlung Bank“).");
      // Funktionstrennung: Geld aus der Kasse nehmen darf nur die Ausstellungsleitung.
      if (input.art === "entnahme" && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Entnahmen bucht die Ausstellungsleitung (Administratoren).");
      const k = await db.transaction(async (tx) => {
        if ((await sperreKasseMitPhase(tx, input.schauId)) === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – keine Kassenbuchungen mehr.");
        if (input.art === "entnahme") await pruefeKassenbestand(tx, input.schauId, input.betragCent, ctx.benutzer, input.trotzdem);
        const { trotzdem: _t, ...werte } = input;
        const [k] = await tx.insert(kassenbewegung).values({ ...werte, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "kassenbewegung", datensatzId: k!.id, aktion: input.art, neu: k, grund: input.grund, akteur: ctx });
        return k!;
      });
      await archiviereKassenbeleg(s, "eigenbeleg", k.id);
      return { ok: true };
    }),

  /**
   * Tagesabschluss mit gezähltem Bestand für einen Kassentag (Standard: heute; nach Mitternacht der Vortag).
   * Eine Differenz braucht eine Erklärung. Barbuchungen bleiben danach möglich; sie stehen als Nachtrag im Kassenbuch und
   * werden mit einem Nachtragsabschluss (neu gezählter Bestand) abgeschlossen. Frühere Abschlüsse bleiben unverändert.
   */
  tagesabschluss: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        datum: kalenderdatum().optional(),
        istCent: z.number().int().min(0).max(100_000_000),
        bemerkung: z.string().trim().max(1000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const datum = input.datum ?? heuteDe();
      if (!istKalenderdatum(datum)) throw fehler("BAD_REQUEST", "Datum ungültig.");
      if (datum > heuteDe()) throw fehler("BAD_REQUEST", "Ein Tagesabschluss für einen künftigen Tag geht nicht.");
      return db.transaction(async (tx) => {
        await sperreKasse(tx, input.schauId);
        const tage = await ladeKassenbuch(input.schauId, tx);
        const tag = tage.find((t) => t.datum === datum);
        if (tag?.abschluss && !tag.nachtragOffen) throw fehler("BAD_REQUEST", `Der Kassentag ${datumKurz(datum)} ist schon abgeschlossen (keine Barbuchung seitdem).`);
        const nachtrag = tag?.abschluss ? tag.abschluss.nachtrag + 1 : 0;
        // Kassentage nur der Reihe nach: sonst stimmte der Anfangsbestand der Folgetage nicht mehr, und ein früherer
        // offener Tag ließe sich nie mehr abschließen.
        if (tage.some((t) => t.datum > datum && t.abschluss)) throw fehler("BAD_REQUEST", "Ein späterer Kassentag ist schon abgeschlossen.");
        const frueher = tage.find((t) => t.datum < datum && ((t.datum > letzterAbschluss(tage) && !t.abschluss && t.bewegungen.length) || t.nachtragOffen));
        if (frueher) throw fehler("BAD_REQUEST", `Erst den Kassentag ${datumKurz(frueher.datum)} abschließen.`);
        if (datum !== heuteDe() && !tage.some((t) => t.datum === datum && t.bewegungen.length)) throw fehler("BAD_REQUEST", "An diesem Tag gab es keine Bargeldbewegung.");
        const sollCent = await sollBestand(input.schauId, tx, datum);
        const differenzCent = input.istCent - sollCent;
        if (differenzCent !== 0 && input.bemerkung.length < 3) {
          throw fehler("BAD_REQUEST", `Gezählt ${(input.istCent / 100).toFixed(2)} €, Soll ${(sollCent / 100).toFixed(2)} € – bitte die Differenz erklären.`);
        }
        const [a] = await tx
          .insert(kassenabschluss)
          .values({ schauId: input.schauId, datum, sollCent, istCent: input.istCent, differenzCent, bemerkung: input.bemerkung, erfasstVon: ctx.benutzer.id, nachtrag })
          .returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "kassenabschluss", datensatzId: a!.id, aktion: nachtrag ? "Nachtragsabschluss" : "Tagesabschluss", neu: a, grund: input.bemerkung, akteur: ctx });
        return a!;
      });
    }),

  /** Archivierte Belege mit Prüfsumme (SHA-256). */
  belege: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return belegListe(input.schauId);
  }),
};
