/**
 * Kontoauszug-Import (Entscheidung 023), nur Administratoren: Datei aus dem Onlinebanking (camt.053 oder CSV) prüfen –
 * Gutschriften mit Vorschlag zur Meldung – und die bestätigten Posten als Zahlung „Überweisung“ buchen. Vom Auszug wird
 * nichts gespeichert außer einem Fingerabdruck je gebuchter Gutschrift (gegen Doppelbuchung); fremde Umsätze nie.
 * Lesen und Zuordnen: packages/domain/src/kontoauszug.ts.
 */
import { createHash } from "node:crypto";
import { buchungsSchluessel, gefordertCent, leseKontoauszug, ordneZu, type Buchung } from "@schau/domain";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { aussteller, meldung, zahlung } from "../db/schema";
import { meldebetrag, meldebetraege } from "../services/eintraege";
import { inOffenerLastschrift, LASTSCHRIFT_OFFEN, sperreKasse } from "../services/kasse";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, dbId, fehler, ladeSchau, router } from "../trpc";
import { pruefeBezahlt } from "./meldung";

/** Größte Datei: Ein Jahr Vereinskonto als CSV oder camt bleibt weit darunter. */
export const KONTOAUSZUG_MAX_BYTES = 4 * 1024 * 1024;
const MAX_POSTEN = 5000;

const datei = z.string().min(1).max(Math.ceil((KONTOAUSZUG_MAX_BYTES * 4) / 3) + 8);

function lesen(base64: string): Buchung[] {
  const daten = Buffer.from(base64, "base64");
  if (!daten.length) throw fehler("BAD_REQUEST", "Die Datei ist leer.");
  if (daten.length > KONTOAUSZUG_MAX_BYTES) throw fehler("BAD_REQUEST", "Die Datei ist zu groß (höchstens 4 MB).");
  let buchungen: Buchung[];
  try {
    buchungen = leseKontoauszug(new Uint8Array(daten));
  } catch (e) {
    throw fehler("BAD_REQUEST", e instanceof Error ? e.message : "Die Datei ließ sich nicht lesen.");
  }
  if (buchungen.length > MAX_POSTEN) throw fehler("BAD_REQUEST", `Zu viele Gutschriften (höchstens ${MAX_POSTEN}). Bitte einen kürzeren Zeitraum exportieren.`);
  return buchungen;
}

/** Fingerabdruck je Gutschrift: ohne Klartext, je Verein verschieden. */
function fingerabdruecke(organisationId: number, buchungen: Buchung[]): string[] {
  return buchungsSchluessel(buchungen).map((k) => createHash("sha256").update(`${organisationId}|${k}`).digest("hex"));
}

/** Meldungen, denen Geld zugeordnet werden kann (offen oder bestätigt), mit offenem Betrag. */
async function zuordenbareMeldungen(schauId: number) {
  const ms = await db
    .select({ id: meldung.id, istJugend: meldung.istJugend, istPreisrichter: meldung.istPreisrichter, vorname: aussteller.vorname, nachname: aussteller.nachname })
    .from(meldung)
    .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
    .where(and(eq(meldung.schauId, schauId), inArray(meldung.status, ["offen", "bestaetigt"])));
  const betraege = await meldebetraege(db, schauId, ms);
  return ms.map((m) => {
    const b = betraege.get(m.id);
    return { id: m.id, vorname: m.vorname, nachname: m.nachname, offenCent: b ? gefordertCent(b) - b.bezahltCent : 0 };
  });
}

export const kontoauszugRouter = router({
  /** Datei lesen und zuordnen – bucht nichts. */
  pruefen: adminProcedure.input(z.object({ schauId: dbId, base64: datei })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const buchungen = lesen(input.base64);
    const meldungen = await zuordenbareMeldungen(s.id);
    const schluessel = fingerabdruecke(ctx.benutzer.organisationId, buchungen);
    const schon = new Set(
      schluessel.length ? (await db.select({ h: zahlung.bankBuchung }).from(zahlung).where(inArray(zahlung.bankBuchung, schluessel))).map((x) => x.h) : [],
    );
    return {
      posten: ordneZu(buchungen, meldungen).map((z, i) => ({
        schluessel: schluessel[i]!,
        datum: z.buchung.datum,
        betragCent: z.buchung.betragCent,
        name: z.buchung.name.slice(0, 140),
        zweck: z.buchung.zweck.slice(0, 140),
        meldungId: z.meldungId,
        sicherheit: z.sicherheit,
        hinweis: z.hinweis,
        gebucht: schon.has(schluessel[i]!),
      })),
      meldungen: meldungen.map((m) => ({ id: m.id, name: `${m.nachname}, ${m.vorname}`, offenCent: m.offenCent })).sort((a, b) => a.name.localeCompare(b.name, "de")),
    };
  }),

  /**
   * Ausgewählte Gutschriften buchen. Betrag und Datum kommen aus der Datei (erneut gelesen), nicht aus dem Browser;
   * jede Gutschrift höchstens einmal (Fingerabdruck), nur auf offene oder bestätigte Meldungen dieser Schau.
   */
  buchen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        base64: datei,
        posten: z
          .array(
            z.object({
              schluessel: z.string().length(64),
              meldungId: dbId,
              /** Offener Betrag der Meldung, wie „prüfen“ ihn gezeigt hat: weicht er ab, wurde inzwischen anders bezahlt. */
              offenCent: z.number().int().min(-10_000_000).max(10_000_000),
            }),
          )
          .min(1)
          .max(MAX_POSTEN),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – für Buchungen erst mit Grund zurück zur Abrechnung.");
      const buchungen = lesen(input.base64);
      const nachSchluessel = new Map(fingerabdruecke(ctx.benutzer.organisationId, buchungen).map((k, i) => [k, buchungen[i]!]));
      const erlaubt = new Map((await zuordenbareMeldungen(s.id)).map((m) => [m.id, m]));
      // Erst alles prüfen, dann buchen: Ein Abbruch mittendrin ließe gebuchte Meldungen unbestätigt zurück.
      if (input.posten.some((p) => !nachSchluessel.has(p.schluessel))) throw fehler("BAD_REQUEST", "Ein Posten steht nicht in dieser Datei. Bitte die Datei erneut prüfen.");
      const uebersprungen: { datum: string; betragCent: number; grund: string }[] = [];
      const beruehrt = new Set<number>();
      /** Erwarteter offener Betrag je Meldung – sinkt mit jeder Buchung dieses Laufs (zwei Teilzahlungen im Auszug). */
      const erwartet = new Map<number, number>();
      let bestaetigt = 0;
      try {
        for (const p of input.posten) {
          const b = nachSchluessel.get(p.schluessel)!;
          if (!erlaubt.has(p.meldungId)) {
            uebersprungen.push({ datum: b.datum, betragCent: b.betragCent, grund: "Meldung nicht offen oder bestätigt" });
            continue;
          }
          beruehrt.add(p.meldungId);
          const soll = erwartet.get(p.meldungId) ?? p.offenCent;
          const ergebnis = await db.transaction(async (tx) => {
            await sperreKasse(tx, s.id);
            // Steht das Meldegeld in der offenen Lastschriftdatei, zieht die Bank es ein – nicht zusätzlich buchen.
            if (await inOffenerLastschrift(tx, s.id, { meldungIds: [p.meldungId] })) return LASTSCHRIFT_OFFEN;
            // Schon aus einem früheren Auszug gebucht: das zuerst melden (der offene Betrag hat sich dadurch ja geändert).
            const [frueher] = await tx.select({ id: zahlung.id }).from(zahlung).where(eq(zahlung.bankBuchung, p.schluessel));
            if (frueher) return "schon gebucht";
            // Inzwischen bar kassiert oder von Hand gebucht? Dann nicht zusätzlich (Überzahlung stünde zur Auszahlung bereit).
            const mb = await meldebetrag(tx, p.meldungId);
            if (gefordertCent(mb) - mb.bezahltCent !== soll) return "inzwischen anders bezahlt – bitte neu prüfen";
            const [z] = await tx
              .insert(zahlung)
              .values({ meldungId: p.meldungId, betragCent: b.betragCent, datum: b.datum, art: "ueberweisung", erfasstVon: ctx.benutzer.id, bankBuchung: p.schluessel })
              .onConflictDoNothing({ target: zahlung.bankBuchung })
              .returning();
            if (!z) return "schon gebucht";
            await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: z.id, aktion: "erfasst", neu: { meldungId: p.meldungId, betragCent: b.betragCent, datum: b.datum, art: "ueberweisung", quelle: "Kontoauszug" }, akteur: ctx });
            return null;
          });
          if (ergebnis) uebersprungen.push({ datum: b.datum, betragCent: b.betragCent, grund: ergebnis });
          else erwartet.set(p.meldungId, soll - b.betragCent);
        }
      } finally {
        // Auch nach einem Fehler und für „schon gebucht“: jede berührte, jetzt ganz bezahlte Meldung bestätigen.
        for (const id of beruehrt) if (await pruefeBezahlt(id, ctx).catch(() => false)) bestaetigt++;
      }
      return { gebucht: input.posten.length - uebersprungen.length, bestaetigt, uebersprungen };
    }),
});
