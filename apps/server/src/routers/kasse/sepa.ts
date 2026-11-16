/** SEPA-Sammelüberweisung an die Aussteller: offene Datei anzeigen, erstellen, verwerfen und als ausgezahlt buchen. */
import { verdeckeIban } from "@schau/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { auszahlung, schau, sepaLauf } from "../../db/schema";
import { offeneLastschrift, offenerLauf, schliesseLauf, SEPA_ERSTELLT, SEPA_GEBUCHT, SEPA_VERWORFEN, sperreKasse, type UeberweisungsLauf } from "../../services/kasse";
import { archiviereQuittung } from "../../services/kassenbuch";
import { protokolliere } from "../../services/protokoll";
import { heuteDe } from "../../services/tiergesundheit";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId, kalenderdatum } from "../../trpc";
import { kurzerFehler } from "../../services/fehlertext";
import { abrechnungListe, naechsteQuittungNr, SEPA_PHASEN, sepaXml } from "./gemeinsam";

export const sepaUeberweisung = {
  /** Die offene SEPA-Datei (erstellt, noch nicht gebucht) oder null. */
  ueberweisungsdatei: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const lauf = await offenerLauf(db, s.id);
    // Helfer sehen, wer in der Datei steht, aber keine vollständigen Bankdaten (die Datei bearbeitet nur die AL).
    if (!lauf || ctx.benutzer.rolle === "admin") return lauf;
    return { ...lauf, posten: lauf.posten.map((p) => ({ ...p, iban: verdeckeIban(p.iban) })) };
  }),

  /** Legt die SEPA-Datei mit allen jetzt überweisbaren Ausstellern fest. Herunterladen beliebig oft, immer derselbe Inhalt. */
  ueberweisungsdateiErstellen: adminProcedure
    .input(z.object({ schauId: dbId, ausfuehrungAm: kalenderdatum("Ausführungsdatum ungültig.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Echtes Kalenderdatum (kein 31.02.) und nicht in der Vergangenheit – sonst lehnt die Bank die Datei ab.
      const d = new Date(`${input.ausfuehrungAm}T12:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.ausfuehrungAm) throw fehler("BAD_REQUEST", "Ausführungsdatum ungültig.");
      if (input.ausfuehrungAm < heuteDe()) throw fehler("BAD_REQUEST", "Das Ausführungsdatum liegt in der Vergangenheit.");
      if (!SEPA_PHASEN.includes(s.phase)) throw fehler("BAD_REQUEST", "Die SEPA-Datei gehört in die Phase „Abrechnung“ (nach der Schau).");
      if (!s.vereinIban) throw fehler("BAD_REQUEST", "Bitte zuerst das Vereinskonto in den Einstellungen eintragen.");
      return db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        if (await offenerLauf(tx, s.id)) throw fehler("CONFLICT", "Es gibt schon eine offene SEPA-Datei. Erst buchen oder verwerfen.");
        // Phase unter der Sperre frisch lesen: ein gleichzeitiger Abschluss nimmt dieselbe Sperre (routers/schau.ts phaseSetzen).
        const [frisch] = await tx.select({ phase: schau.phase }).from(schau).where(eq(schau.id, s.id));
        if (!frisch || !SEPA_PHASEN.includes(frisch.phase)) throw fehler("BAD_REQUEST", "Die SEPA-Datei gehört in die Phase „Abrechnung“ (nach der Schau).");
        // Die Salden rechnen offenes Meldegeld ab, das die offene Lastschrift gerade einzieht – erst sie buchen oder verwerfen.
        if (await offeneLastschrift(tx, s.id)) throw fehler("CONFLICT", "Es gibt eine offene Lastschriftdatei. Erst buchen oder verwerfen, dann die Überweisungen.");
        const zeilen = (await abrechnungListe(s.id, tx)).filter((z) => z.ueberweisbar);
        if (zeilen.length === 0) throw fehler("BAD_REQUEST", "Keine offenen Überweisungen.");
        const jetzt = new Date();
        const lauf: UeberweisungsLauf = {
          nachrichtId: `SCHAU${s.id}-${jetzt.getTime().toString(36).toUpperCase()}`,
          erstelltAm: jetzt.toISOString(),
          ausfuehrungAm: input.ausfuehrungAm,
          auftraggeber: { name: s.vereinKontoinhaber || s.veranstalter || s.name, iban: s.vereinIban!, bic: s.vereinBic },
          posten: zeilen.map((z) => ({ ausstellerId: z.ausstellerId, name: z.name, kontoinhaber: z.kontoinhaber, iban: z.iban!, betragCent: z.nochOffenCent })),
          summeCent: zeilen.reduce((x, z) => x + z.nochOffenCent, 0),
        };
        try {
          sepaXml(s, lauf); // prüft IBANs und Beträge, bevor die Datei festgehalten wird
        } catch (err) {
          throw fehler("BAD_REQUEST", err instanceof Error ? err.message : String(err));
        }
        await tx.insert(sepaLauf).values({ schauId: s.id, nachrichtId: lauf.nachrichtId, daten: lauf, erstelltVon: ctx.benutzer.name });
        // Im Protokoll nur Kennung, Anzahl, Summe und Beträge je Aussteller – keine IBANs, Namen oder Kontoinhaber.
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "auszahlung",
          datensatzId: null,
          aktion: SEPA_ERSTELLT,
          neu: { nachrichtId: lauf.nachrichtId, ausfuehrungAm: lauf.ausfuehrungAm, anzahl: lauf.posten.length, summe: lauf.summeCent, posten: lauf.posten.map((p) => ({ ausstellerId: p.ausstellerId, betragCent: p.betragCent })) },
          akteur: ctx,
        });
        return lauf;
      });
    }),

  /** Verwirft die offene SEPA-Datei, z. B. wenn die Bank sie abgelehnt hat. */
  ueberweisungsdateiVerwerfen: adminProcedure
    .input(z.object({ schauId: dbId, nachrichtId: z.string().max(500), grund: z.string().max(500).trim().min(3, "Bitte einen Grund angeben.") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const lauf = await offenerLauf(tx, s.id);
        if (!lauf || lauf.nachrichtId !== input.nachrichtId) throw fehler("CONFLICT", "Diese SEPA-Datei ist nicht mehr offen.");
        await schliesseLauf(tx, s.id, lauf.nachrichtId, "verworfen");
        await protokolliere(tx, { schauId: s.id, tabelle: "auszahlung", datensatzId: null, aktion: SEPA_VERWORFEN, neu: { nachrichtId: lauf.nachrichtId, anzahl: lauf.posten.length, summe: lauf.summeCent }, grund: input.grund, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Bucht die Aussteller aus der offenen SEPA-Datei mit den Beträgen der Datei als ausgezahlt (Art: Überweisung). */
  ueberweisungenBuchen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Kennung der Datei, die der Bank übergeben wurde. */
        nachrichtId: z.string().max(500).optional(),
        /** Nur zur Kontrolle: muss genau den Ausstellern der Datei entsprechen. */
        ausstellerIds: z.array(dbId).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Buchen bestätigt nur eine schon erstellte (und meist schon ausgeführte) Überweisung – nicht an die Phase gebunden,
      // sonst blieben die Aussteller nach einem Rückwechsel gesperrt. Abschließen geht mit offener Datei ohnehin nicht.
      const gebucht: { ausstellerId: number; quittungNr: number }[] = [];
      let stand: Awaited<ReturnType<typeof abrechnungListe>> = [];
      const r = await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const lauf = await offenerLauf(tx, s.id);
        if (!lauf) throw fehler("BAD_REQUEST", "Keine offenen Überweisungen. Bitte zuerst die SEPA-Datei erstellen.");
        if (input.nachrichtId && input.nachrichtId !== lauf.nachrichtId) throw fehler("CONFLICT", "Diese SEPA-Datei ist nicht mehr offen.");
        if (input.ausstellerIds) {
          const soll = new Set(lauf.posten.map((p) => p.ausstellerId));
          if (new Set(input.ausstellerIds).size !== soll.size || !input.ausstellerIds.every((id) => soll.has(id))) throw fehler("CONFLICT", "Die Auswahl weicht von der SEPA-Datei ab.");
        }
        // Frühere gültige Buchungen: die Überweisung ist dann eine Nachzahlung mit Bezug auf die erste Quittung.
        const frueher = await tx
          .select()
          .from(auszahlung)
          .where(and(eq(auszahlung.schauId, s.id), inArray(auszahlung.ausstellerId, lauf.posten.map((p) => p.ausstellerId)), isNull(auszahlung.storniertAm)))
          .orderBy(asc(auszahlung.id));
        let nr = (await naechsteQuittungNr(tx, s.id)) - 1;
        for (const p of lauf.posten) {
          const erste = frueher.find((a) => a.ausstellerId === p.ausstellerId);
          gebucht.push({ ausstellerId: p.ausstellerId, quittungNr: nr + 1 });
          await tx.insert(auszahlung).values({
            schauId: s.id,
            ausstellerId: p.ausstellerId,
            betragCent: p.betragCent,
            art: "ueberweisung",
            quittungNr: ++nr,
            ausgezahltVon: ctx.benutzer.id,
            bezugQuittungNr: erste?.quittungNr ?? null,
          });
        }
        await schliesseLauf(tx, s.id, lauf.nachrichtId, "gebucht");
        // Stand zum Buchungszeitpunkt festhalten: die Quittungen entstehen danach im Hintergrund und zeigen genau ihn.
        // Nur die Aussteller dieser Datei rechnen: die Kasse bleibt dafür gesperrt.
        stand = await abrechnungListe(s.id, tx, { nurAusstellerIds: lauf.posten.map((p) => p.ausstellerId) });
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "auszahlung",
          datensatzId: null,
          aktion: SEPA_GEBUCHT,
          neu: { nachrichtId: lauf.nachrichtId, anzahl: lauf.posten.length, summe: lauf.summeCent },
          akteur: ctx,
        });
        return { anzahl: lauf.posten.length, summeCent: lauf.summeCent };
      });
      // Quittungen im Hintergrund ablegen (bei vielen Posten dauert das); fehlt eine, entsteht sie beim ersten Abruf.
      void (async () => {
        for (const g of gebucht) await archiviereQuittung(s, g.ausstellerId, g.quittungNr, false, stand.find((z) => z.ausstellerId === g.ausstellerId));
      })().catch((e) => console.error("[belege] Quittungen der SEPA-Buchung:", kurzerFehler(e)));
      return r;
    }),
};
