/** Abrechnung je Aussteller, Auszahlung (bar oder Überweisung, auch Nachzahlung und Rückforderung) und ihr Storno. */
import { verdeckeIban } from "@schau/domain";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { auszahlung } from "../../db/schema";
import { LASTSCHRIFT_OFFEN, pruefeNichtAbgeschlossen, sperreKasseMitPhase } from "../../services/kasse";
import { archiviereQuittung } from "../../services/kassenbuch";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";
import { abrechnungListe, AUSZAHLUNG_PHASEN, naechsteQuittungNr, pruefeKassenbestand } from "./gemeinsam";

export const auszahlungen = {
  abrechnung: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const zeilen = await abrechnungListe(s.id);
    // Helfer an der Kasse sehen nur, ob und welche IBAN hinterlegt ist (gekürzt) – überweisen darf nur die AL.
    return ctx.benutzer.rolle === "admin" ? zeilen : zeilen.map((z) => ({ ...z, iban: verdeckeIban(z.iban) }));
  }),

  /**
   * Bucht die Auszahlung. Gibt es schon gültige Buchungen, wird nur der Unterschied gebucht (Nachzahlung oder
   * Rückforderung) – mit eigener Quittung und Bezug auf die erste. Bereits gezahltes Geld wird so nie doppelt ausgezahlt.
   */
  auszahlen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        ausstellerId: dbId,
        art: z.enum(["bar", "ueberweisung"]).default("bar"),
        /** Der Betrag, den die Seite angezeigt hat – weicht er ab, wird nichts gebucht (die Seite war veraltet). */
        erwartetCent: z.number().int().min(-100_000_000).max(100_000_000).optional(),
        /** Rückforderung per Überweisung: das Geld ist auf dem Vereinskonto eingegangen. */
        eingangBestaetigt: z.boolean().default(false),
        /** Administrator bestätigt eine Barauszahlung, für die das Kassenbuch nicht genug Bargeld ausweist. */
        trotzdem: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const pruefePhase = (phase: string) => {
      if (!AUSZAHLUNG_PHASEN.includes(phase as never))
        throw fehler("BAD_REQUEST", phase === "abgeschlossen" ? "Die Schau ist abgeschlossen – für Buchungen erst mit Grund zurück zur Abrechnung." : "Ausgezahlt wird ab der Phase „Schau“. Meldegeld-Erstattungen vorher an der Meldung buchen.");
    };
    pruefePhase(s.phase);
    // Funktionstrennung: eine Überweisung ohne SEPA-Datei bucht nur die Ausstellungsleitung.
    if (input.art === "ueberweisung" && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Überweisungen bucht die Ausstellungsleitung (Administratoren).");
    const a = await db.transaction(async (tx) => {
      pruefePhase(await sperreKasseMitPhase(tx, s.id));
      const zeile = (await abrechnungListe(s.id, tx, { nurAusstellerId: input.ausstellerId })).find((z) => z.ausstellerId === input.ausstellerId);
      if (!zeile) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
      if (zeile.inUeberweisung) throw fehler("CONFLICT", "Aussteller steht in der offenen SEPA-Datei. Erst die Datei buchen oder verwerfen.");
      if (zeile.imEinzug) throw fehler("CONFLICT", LASTSCHRIFT_OFFEN);
      if (zeile.auszahlung && zeile.nochOffenCent === 0) throw fehler("CONFLICT", `Bereits abgerechnet (Quittung ${zeile.auszahlung.quittungNr}).`);
      // Überweisung an den Aussteller nur mit hinterlegter IBAN (sonst nennt die Zahlungsanzeige ein Konto, das es nicht gibt).
      if (input.art === "ueberweisung" && zeile.nochOffenCent > 0 && !zeile.iban) {
        throw fehler("BAD_REQUEST", "Für eine Überweisung fehlt die IBAN des Ausstellers – bitte an der Meldung hinterlegen oder bar auszahlen.");
      }
      if (input.erwartetCent !== undefined && input.erwartetCent !== zeile.nochOffenCent) {
        const euro = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
        throw fehler("CONFLICT", `Der Betrag hat sich geändert: jetzt ${euro(zeile.nochOffenCent)} statt ${euro(input.erwartetCent)}. Bitte die Seite neu laden und prüfen.`);
      }
      const erste = zeile.buchungen.find((b) => !b.storniertAm);
      // Funktionstrennung: Nachzahlungen und Rückforderungen (die Abrechnung hat sich nach einer Quittung geändert)
      // bucht nur die Ausstellungsleitung.
      if (erste && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nachzahlungen und Rückforderungen bucht die Ausstellungsleitung (Administratoren).");
      if (zeile.nochOffenCent < 0 && input.art === "ueberweisung" && !input.eingangBestaetigt)
        throw fehler("BAD_REQUEST", "Eine Rückforderung per Überweisung erst buchen, wenn das Geld auf dem Vereinskonto eingegangen ist.");
      if (input.art === "bar" && zeile.nochOffenCent > 0) await pruefeKassenbestand(tx, s.id, zeile.nochOffenCent, ctx.benutzer, input.trotzdem);
      const [a] = await tx
        .insert(auszahlung)
        .values({
          schauId: s.id,
          ausstellerId: input.ausstellerId,
          betragCent: zeile.nochOffenCent,
          art: input.art,
          quittungNr: await naechsteQuittungNr(tx, s.id),
          ausgezahltVon: ctx.benutzer.id,
          bezugQuittungNr: erste?.quittungNr ?? null,
        })
        .returning();
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "auszahlung",
        datensatzId: a!.id,
        aktion: erste ? (zeile.nochOffenCent > 0 ? "nachgezahlt" : "zurückgefordert") : "ausgezahlt",
        neu: { ausstellerId: zeile.ausstellerId, betrag: zeile.nochOffenCent, art: input.art, quittungNr: a!.quittungNr, bezugQuittungNr: erste?.quittungNr ?? null },
        akteur: ctx,
      });
      return a!;
    });
    await archiviereQuittung(s, a.ausstellerId, a.quittungNr);
    return a;
    }),

  /**
   * Storniert eine Buchung, bei der kein Geld geflossen ist (Fehlbuchung, Überweisung von der Bank zurückgebucht).
   * Die Buchung bleibt mit Grund sichtbar und zählt nicht mehr. Für Korrekturen nach echter Zahlung: Differenz auszahlen.
   */
  auszahlungStornieren: adminProcedure
    .input(z.object({ schauId: dbId, id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      pruefeNichtAbgeschlossen(s);
      const a = await db.transaction(async (tx) => {
        pruefeNichtAbgeschlossen({ phase: await sperreKasseMitPhase(tx, input.schauId) });
        const [a] = await tx.select().from(auszahlung).where(and(eq(auszahlung.id, input.id), eq(auszahlung.schauId, input.schauId)));
        if (!a) throw fehler("NOT_FOUND", "Auszahlung nicht gefunden.");
        if (a.storniertAm) throw fehler("CONFLICT", `Quittung ${a.quittungNr} ist bereits storniert.`);
        // Nur die jüngste gültige Buchung: sonst bezöge sich eine spätere Nachzahlung auf einen falschen Stand.
        const [neuere] = await tx
          .select({ nr: auszahlung.quittungNr })
          .from(auszahlung)
          .where(and(eq(auszahlung.schauId, input.schauId), eq(auszahlung.ausstellerId, a.ausstellerId), isNull(auszahlung.storniertAm), gt(auszahlung.id, a.id)));
        if (neuere) throw fehler("CONFLICT", `Erst die spätere Quittung ${neuere.nr} stornieren.`);
        await tx.update(auszahlung).set({ storniertAm: new Date(), storniertVon: ctx.benutzer.id, stornoGrund: input.grund }).where(eq(auszahlung.id, a.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "auszahlung", datensatzId: a.id, aktion: "storniert", alt: a, grund: input.grund, akteur: ctx });
        return a;
      });
      await archiviereQuittung(s, a.ausstellerId, a.quittungNr, true);
      return { ok: true };
    }),
};
