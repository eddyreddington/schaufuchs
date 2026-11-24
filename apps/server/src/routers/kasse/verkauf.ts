/** Tierverkauf an der Kasse: Tier suchen, verkaufen, stornieren, Angebot, Verkaufsliste und Zahlungseingang bei Überweisung. */
import { normalisiereRegistriernummer, provision, REGISTRIERNUMMER_HINWEIS } from "@schau/domain";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { auszahlung, bewertung, gesundheit, katalogeintrag, meldung, schau, verkauf, verkaufZahlungseingang } from "../../db/schema";
import { ladeEintraege } from "../../services/eintraege";
import { offeneUeberweisungsverkaeufe, offenerLauf, pruefeNichtAbgerechnet, pruefeNichtAbgeschlossen, sperreKasse, sperreKasseMitPhase } from "../../services/kasse";
import { archiviereKaufbeleg } from "../../services/kassenbuch";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId, kalenderdatum } from "../../trpc";
import { naechsteBelegNr, VERKAUF_PHASEN } from "./gemeinsam";

export const tierverkauf = {
  tierSuchen: benutzerProcedure.input(z.object({ schauId: dbId, nr: z.string().max(20) })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const m = input.nr.trim().match(/^(\d+)([a-z]*)$/i);
    if (!m) return null;
    const alle = await ladeEintraege(input.schauId, { nurBestaetigt: true });
    const e = alle.find((x) => x.katalogNr === Number(m[1]) && x.suffix === (m[2] ?? "").toLowerCase());
    if (!e) return null;
    const [v] = await db.select().from(verkauf).where(and(eq(verkauf.katalogeintragId, e.id), isNull(verkauf.storniertAm)));
    return { eintrag: e, verkauf: v ?? null };
  }),

  verkaufen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        katalogeintragId: dbId,
        kaeuferName: z.string().max(500).trim().min(3, "Name des Käufers fehlt."),
        kaeuferAnschrift: z.string().max(500).trim(),
        kaeuferRegistriernummer: z.string().max(500).trim().min(5, "Registriernummer des Käufers fehlt (Viehverkehrsordnung)."),
        /** § 11c TierSchG: an Käufer unter 16 nur mit Einwilligung eines Erziehungsberechtigten – ausdrücklich bestätigen. */
        kaeuferAlter: z.enum(["ab16", "unter16"], { error: "Bitte angeben, ob der Käufer mindestens 16 Jahre alt ist (§ 11c TierSchG)." }),
        kaeuferErziehungsberechtigter: z.string().max(200).trim().default(""),
        /** Bar landet im Kassenbuch; Karte und Überweisung nicht. */
        zahlart: z.enum(["bar", "karte", "ueberweisung"]).default("bar"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Funktionstrennung wie beim Meldegeld: ein Verkauf ohne Geldeingang stellt den Erlös sofort zur (Bar-)Auszahlung
      // bereit – das bucht nur die Ausstellungsleitung.
      if (input.zahlart !== "bar" && ctx.benutzer.rolle !== "admin") {
        throw fehler("FORBIDDEN", "Verkauf auf Karte oder Überweisung nur durch die Ausstellungsleitung (der Erlös stünde sonst ohne bestätigten Geldeingang zur Auszahlung bereit).");
      }
      const pruefePhase = (phase: string) => {
        if (!VERKAUF_PHASEN.includes(phase as never)) throw fehler("BAD_REQUEST", "Verkauf erst nach der Bewertung, solange die Schau läuft (Phase „Preise“ oder „Schau“).");
      };
      pruefePhase(s.phase);
      const registriernummer = normalisiereRegistriernummer(input.kaeuferRegistriernummer);
      if (!registriernummer) throw fehler("BAD_REQUEST", `Registriernummer des Käufers ungültig: ${REGISTRIERNUMMER_HINWEIS}.`);
      const unter16 = input.kaeuferAlter === "unter16";
      if (unter16 && input.kaeuferErziehungsberechtigter.length < 3) {
        throw fehler("BAD_REQUEST", "Käufer unter 16 Jahren: nur mit Einwilligung eines Erziehungsberechtigten (§ 11c TierSchG) – bitte dessen Namen angeben.");
      }
      const v = await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        // Phase und Provisionssatz unter der Kassensperre frisch (Entscheidung 033): ein gleichzeitiger Abschluss oder eine
        // Änderung der Einstellungen nimmt dieselbe Sperre.
        const [frisch] = (await tx.select({ phase: schau.phase, provisionBp: schau.provisionBp }).from(schau).where(eq(schau.id, s.id))) as [{ phase: string; provisionBp: number }];
        pruefePhase(frisch.phase);
        const { provisionBp } = frisch;
        const [e] = await tx.select().from(katalogeintrag).where(and(eq(katalogeintrag.id, input.katalogeintragId), eq(katalogeintrag.schauId, s.id)));
        if (!e) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if (e.verkaufspreisCent == null || e.verkaufspreisCent <= 0) throw fehler("BAD_REQUEST", "Dieses Tier ist nicht verkäuflich gemeldet.");
        if (e.status !== "eingeliefert") throw fehler("BAD_REQUEST", "Tier ist nicht in der Halle (nicht eingeliefert oder schon ausgegeben).");
        const [b] = await tx.select({ id: bewertung.id }).from(bewertung).where(eq(bewertung.katalogeintragId, e.id));
        if (!b) throw fehler("BAD_REQUEST", "Tier ist noch nicht bewertet – verkauft wird erst nach der Bewertung.");
        const [krank] = await tx
          .select({ id: gesundheit.id })
          .from(gesundheit)
          .where(and(eq(gesundheit.katalogeintragId, e.id), or(eq(gesundheit.sperre, true), eq(gesundheit.verendet, true))));
        if (krank) throw fehler("BAD_REQUEST", "Tier ist im Gesundheitsjournal gesperrt (krank, verdächtig oder verendet) und darf nicht abgegeben werden.");
        const [schon] = await tx.select().from(verkauf).where(and(eq(verkauf.katalogeintragId, e.id), isNull(verkauf.storniertAm)));
        if (schon) throw fehler("CONFLICT", `Bereits verkauft (Beleg ${schon.belegNr}).`);
        const [m] = await tx.select({ ausstellerId: meldung.ausstellerId }).from(meldung).where(eq(meldung.id, e.meldungId));
        await pruefeNichtAbgerechnet(tx, s.id, m!.ausstellerId);
        const [v] = await tx
          .insert(verkauf)
          .values({
            katalogeintragId: e.id,
            kaeuferName: input.kaeuferName,
            kaeuferAnschrift: input.kaeuferAnschrift,
            kaeuferRegistriernummer: registriernummer,
            kaeuferUnter16: unter16,
            kaeuferErziehungsberechtigter: unter16 ? input.kaeuferErziehungsberechtigter : "",
            preisCent: e.verkaufspreisCent,
            provisionCent: provision(e.verkaufspreisCent, provisionBp),
            provisionBp,
            zahlart: input.zahlart,
            belegNr: await naechsteBelegNr(tx, s.id),
            verkauftVon: ctx.benutzer.id,
          })
          .returning();
        await protokolliere(tx, { schauId: s.id, tabelle: "verkauf", datensatzId: v!.id, aktion: "verkauft", neu: { nr: `${e.katalogNr}${e.suffix}`, preis: e.verkaufspreisCent, belegNr: v!.belegNr, unter16, zahlart: input.zahlart }, akteur: ctx });
        return v!;
      });
      // Beleg sofort ablegen: jeder Nachdruck zeigt genau diesen Beleg.
      await archiviereKaufbeleg(s, v.id);
      return v;
    }),

  stornieren: adminProcedure
    .input(z.object({ schauId: dbId, verkaufId: dbId, grund: z.string().max(500).trim().min(3, "Bitte einen Grund angeben.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      pruefeNichtAbgeschlossen(s);
      await db.transaction(async (tx) => {
        pruefeNichtAbgeschlossen({ phase: await sperreKasseMitPhase(tx, input.schauId) });
        const [v] = await tx
          .select({ v: verkauf, schauId: katalogeintrag.schauId, ausstellerId: meldung.ausstellerId })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
          .where(eq(verkauf.id, input.verkaufId));
        if (!v || v.schauId !== input.schauId) throw fehler("NOT_FOUND", "Verkauf nicht gefunden.");
        if (v.v.storniertAm) throw fehler("BAD_REQUEST", "Dieser Verkauf ist schon storniert.");
        await pruefeNichtAbgerechnet(tx, input.schauId, v.ausstellerId, { istAdmin: ctx.benutzer.rolle === "admin", grund: input.grund });
        // Markieren statt löschen: die Abgabe bleibt in der Verkaufsliste für das Veterinäramt (3 Jahre).
        await tx.update(verkauf).set({ storniertAm: new Date(), storniertVon: ctx.benutzer.id, stornoGrund: input.grund }).where(eq(verkauf.id, v.v.id));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "verkauf",
          datensatzId: v.v.id,
          aktion: "storniert",
          // Ohne Käuferdaten: die stehen im Verkauf selbst und werden dort nach Fristende anonymisiert.
          alt: { belegNr: v.v.belegNr, katalogeintragId: v.v.katalogeintragId, preisCent: v.v.preisCent, zahlart: v.v.zahlart },
          grund: input.grund,
          akteur: ctx,
        });
      });
      await archiviereKaufbeleg(s, input.verkaufId, true);
      return { ok: true };
    }),

  /** Tiere, die zum Verkauf stehen: verkäuflich gemeldet, eingeliefert, bewertet, nicht gesperrt und noch nicht verkauft. */
  angebot: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [alle, abgerechnet, lauf] = await Promise.all([
      ladeEintraege(input.schauId, { nurBestaetigt: true }),
      db.select({ ausstellerId: auszahlung.ausstellerId }).from(auszahlung).where(and(eq(auszahlung.schauId, input.schauId), isNull(auszahlung.storniertAm))),
      offenerLauf(db, input.schauId),
    ]);
    // Abgerechnete Aussteller (Quittung oder offene SEPA-Datei) verkaufen nichts mehr – der Verkauf würde abgelehnt.
    const gesperrt = new Set([...abgerechnet.map((x) => x.ausstellerId), ...(lauf?.posten.map((p) => p.ausstellerId) ?? [])]);
    return alle
      .filter((e) => e.katalogNr != null && (e.verkaufspreisCent ?? 0) > 0 && !e.verkauftAn && e.status === "eingeliefert" && e.bewertet && !e.gesperrt && !gesperrt.has(e.ausstellerId))
      .map((e) => ({
        id: e.id,
        katalogNr: e.katalogNr,
        suffix: e.suffix,
        sparte: e.sparte,
        bezeichnung: e.bezeichnung,
        geschlecht: e.geschlecht,
        alter: e.alter,
        punkte: e.punkte,
        sondernote: e.sondernote,
        verkaufspreisCent: e.verkaufspreisCent!,
      }));
  }),

  verkaeufe: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    // Alle Einträge (auch nicht bestätigte Meldungen): ein Verkauf behält so immer sein Tier.
    const alle = await ladeEintraege(input.schauId);
    const rows = await db.select().from(verkauf).innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId)).where(eq(katalogeintrag.schauId, input.schauId));
    return rows
      .flatMap((r) => {
        const eintrag = alle.find((e) => e.id === r.verkauf.katalogeintragId);
        return eintrag ? [{ ...r.verkauf, eintrag }] : [];
      })
      .sort((a, b) => b.belegNr - a.belegNr);
  }),

  /**
   * Zahlungseingang zu einem Verkauf per Überweisung (laut Kontoauszug) – nur Ausstellungsleitung. Erst damit zählt der
   * Erlös für den Aussteller, und das Tier darf gegen den Kaufbeleg hinaus. Unveränderbar, protokolliert.
   */
  zahlungseingangVerkauf: adminProcedure
    .input(z.object({ schauId: dbId, verkaufId: dbId, datum: kalenderdatum() }))
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      await db.transaction(async (tx) => {
        pruefeNichtAbgeschlossen({ phase: await sperreKasseMitPhase(tx, s.id) });
        const [v] = await tx
          .select({ v: verkauf, eingang: verkaufZahlungseingang.id })
          .from(verkauf)
          .innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId))
          .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
          .where(and(eq(verkauf.id, input.verkaufId), eq(katalogeintrag.schauId, s.id)));
        if (!v) throw fehler("NOT_FOUND", "Verkauf nicht gefunden.");
        if (v.v.storniertAm) throw fehler("BAD_REQUEST", "Der Verkauf ist storniert.");
        if (v.v.zahlart !== "ueberweisung") throw fehler("BAD_REQUEST", "Nur Verkäufe per Überweisung brauchen einen Zahlungseingang.");
        if (v.eingang != null) throw fehler("BAD_REQUEST", `Der Zahlungseingang zu Beleg ${v.v.belegNr} ist schon gebucht.`);
        const [e] = await tx.insert(verkaufZahlungseingang).values({ verkaufId: v.v.id, datum: input.datum, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: s.id, tabelle: "verkauf", datensatzId: v.v.id, aktion: "Zahlungseingang", neu: { belegNr: v.v.belegNr, preisCent: v.v.preisCent, datum: input.datum, eingangId: e!.id }, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Verkäufe per Überweisung, deren Zahlungseingang noch fehlt (Liste für die Kasse). */
  offeneUeberweisungen: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return offeneUeberweisungsverkaeufe(db, s.id);
  }),
};
