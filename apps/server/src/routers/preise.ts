import { brauchtObmann, PHASEN, PHASEN_LABEL, stiftungUngedeckt } from "@schau/domain";
import { and, asc, count, eq, sum } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/client";
import { auszahlung, kassenbewegung, meldung, preisart, preisrichter, preisvergabe, prEinteilung, schau, stiftung } from "../db/schema";
import { ladeEintraege, skalaVon } from "../services/eintraege";
import { entfernePreis, vergebePreis } from "../services/preise";
import { inOffenerLastschrift, LASTSCHRIFT_OFFEN, pruefeNichtAbgerechnet, pruefeNichtAbgeschlossen, sperreKasse } from "../services/kasse";
import { archiviereKassenbeleg } from "../services/kassenbuch";
import { heuteDe } from "../services/tiergesundheit";
import { protokolliere } from "../services/protokoll";
import { kontingente, offeneStiftungen, zuteilung } from "../services/pruefung";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, pruefeNachFreigabe, router, dbId, kalenderdatum } from "../trpc";

/**
 * Verringert sich die gestiftete Zahl einer Stiftungs-Preisart um „weniger“, müssen die schon vergebenen Preise gedeckt
 * bleiben – gezählt wie bei der Vergabe (`stiftungUngedeckt`: Preise aus Stiftungen; Zusatzpreise „zusätzlich je
 * Preisrichter“ zählen im Kontingent je Preisrichter). Standgeld-Preise hängen nicht an Stiftungen und werden nicht geprüft.
 */
async function pruefeStiftungDeckung(tx: Tx, preisartId: number, weniger: number) {
  const [art] = await tx.select().from(preisart).where(eq(preisart.id, preisartId));
  if (!art || art.quelle !== "stiftung") return;
  const [vergaben, [st]] = await Promise.all([
    tx.select({ stiftungId: preisvergabe.stiftungId }).from(preisvergabe).where(eq(preisvergabe.preisartId, preisartId)),
    tx.select({ n: sum(stiftung.anzahl) }).from(stiftung).where(eq(stiftung.preisartId, preisartId)),
  ]);
  const u = stiftungUngedeckt(art, Number(st?.n ?? 0) - weniger, vergaben);
  if (u) throw fehler("BAD_REQUEST", `Von diesem Stiftungspreis sind schon ${u.vergeben} vergeben – danach wären nur ${u.verfuegbar} verfügbar. Erst Preise entfernen.`);
}

/**
 * Eine mit der Meldung zugesagte Stiftung steckt im Saldo des Ausstellers: nach der Quittung oder in der offenen
 * SEPA-Datei ändert sie sich nicht mehr still (Kassensperre wie bei Preisen und Verkäufen).
 */
async function pruefeStiftungAenderbar(tx: Tx, schauId: number, meldungId: number | null, betragAendert: boolean) {
  // Immer sperren: auch „Bar erhalten“ (Stiftung ohne Meldung) läuft unter der Kassensperre.
  await sperreKasse(tx, schauId);
  if (meldungId == null) return;
  const [m] = await tx.select({ ausstellerId: meldung.ausstellerId }).from(meldung).where(eq(meldung.id, meldungId));
  if (m) await pruefeNichtAbgerechnet(tx, schauId, m.ausstellerId);
  // Der Betrag steckt im Meldegeld, das die offene Lastschriftdatei einzieht.
  if (betragAendert && (await inOffenerLastschrift(tx, schauId, { meldungIds: [meldungId] }))) throw fehler("CONFLICT", LASTSCHRIFT_OFFEN);
}

/** Die für Reklamationen wichtigen Felder einer Stiftung (Geld in Cent). */
function stiftungFuerProtokoll(s: { stifter: string; preisartId: number | null; anzahl: number; betragCent: number; eingegangenAm: string | null }) {
  return { stifter: s.stifter, preisartId: s.preisartId, anzahl: s.anzahl, betragCent: s.betragCent, eingegangenAm: s.eingegangenAm };
}

export const preiseRouter = router({
  uebersicht: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [eintraege, einteilung, richter, arten, stiftungen] = await Promise.all([
      ladeEintraege(s.id, { nurBestaetigt: true }),
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
      db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
      db.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge)),
      db.select().from(stiftung).where(eq(stiftung.schauId, s.id)).orderBy(asc(stiftung.id)),
    ]);
    const zu = zuteilung(eintraege, einteilung);
    return {
      freigegeben: s.ergebnisseFreigegeben,
      preisarten: arten,
      kontingentJe: s.kontingentJe,
      kontingente: kontingente(eintraege, zu, richter, arten, s.kontingentJe),
      /** Für die Preisverteilung: bei Kontingent „je Schau“ gibt es auch ohne Preisrichter eine Zeile. */
      anzahlPreisrichter: richter.length,
      stiftungen,
      eintraege: eintraege
        .filter((e) => e.punkte != null)
        .map((e) => ({ ...e, preisrichterId: zu.get(e.id) ?? null })),
    };
  }),

  vergeben: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        katalogeintragId: dbId,
        preisartId: dbId,
        /** Gestifteter Preis: aus dieser Stiftung (ohne Angabe die erste mit freien Preisen). */
        stiftungId: dbId.nullable().default(null),
        /** Bewusst ohne Stiftung (zusätzlich je Preisrichter, Betrag der Preisart). */
        ohneStiftung: z.boolean().default(false),
        /** Reklamation nach der Abrechnung: Pflicht. */
        grund: z.string().trim().max(500).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      pruefeNachFreigabe(await ladeSchau(ctx.benutzer.organisationId, input.schauId), ctx.benutzer);
      await db.transaction((tx) => vergebePreis(tx, { ...input, preisrichterId: null, akteur: ctx, istAL: true, istAdmin: ctx.benutzer.rolle === "admin" }));
      return { ok: true };
    }),

  entfernen: adminProcedure
    .input(z.object({ schauId: dbId, preisvergabeId: dbId, /** Reklamation nach der Abrechnung: Pflicht. */ grund: z.string().trim().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      pruefeNachFreigabe(await ladeSchau(ctx.benutzer.organisationId, input.schauId), ctx.benutzer);
      await db.transaction((tx) => entfernePreis(tx, { ...input, preisrichterId: null, akteur: ctx, istAL: true, istAdmin: ctx.benutzer.rolle === "admin" }));
      return { ok: true };
    }),

  stiftungSpeichern: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        id: dbId.optional(),
        stifter: z.string().max(500).min(2),
        preisartId: dbId.nullable(),
        anzahl: z.number().int().min(1).max(1000),
        betragCent: z.number().int().min(0).max(10_000_000),
        vorgabe: z.string().max(500),
        eingegangenAm: kalenderdatum().nullable(),
        /** Stifter ohne Meldung: im Online-Katalog nennen (nur mit seiner Zustimmung). */
        onlineNennen: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const { id, ...werte } = input;
      // Preisart muss zur selben Schau gehören – sonst zeigte die Stiftung auf die Preisart eines fremden Vereins.
      if (input.preisartId != null) {
        const [art] = await db.select({ id: preisart.id }).from(preisart).where(and(eq(preisart.id, input.preisartId), eq(preisart.schauId, input.schauId)));
        if (!art) throw fehler("BAD_REQUEST", "Preisart gehört nicht zu dieser Schau.");
      }
      await db.transaction(async (tx) => {
        let alt: typeof stiftung.$inferSelect | undefined;
        let datensatzId = id;
        if (id) {
          // Erst sperren, dann lesen: „Bar erhalten“ und Vergaben laufen unter derselben Sperre.
          await sperreKasse(tx, input.schauId);
          [alt] = await tx.select().from(stiftung).where(and(eq(stiftung.id, id), eq(stiftung.schauId, input.schauId)));
          if (!alt) throw fehler("NOT_FOUND", "Stiftung nicht gefunden.");
          await pruefeStiftungAenderbar(tx, input.schauId, alt.meldungId, alt.betragCent !== input.betragCent);
          // Aus dieser Stiftung schon vergeben: Preisart und Betrag stehen in den Vergaben (Abrechnung), Anzahl nicht darunter.
          const [{ n: aus }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.stiftungId, alt.id))) as [{ n: number }];
          if (aus > 0 && (alt.preisartId !== input.preisartId || alt.betragCent !== input.betragCent)) {
            throw fehler("BAD_REQUEST", `Aus dieser Stiftung sind schon ${aus} Preise vergeben – Preisart und Betrag lassen sich nicht mehr ändern. Erst die Preise entfernen.`);
          }
          if (input.anzahl < aus) throw fehler("BAD_REQUEST", `Aus dieser Stiftung sind schon ${aus} Preise vergeben – die Anzahl kann nicht darunter liegen.`);
          if (alt.kassenbewegungId != null && alt.betragCent !== input.betragCent) throw fehler("BAD_REQUEST", "Der Betrag ist schon als Einlage im Kassenbuch gebucht und lässt sich nicht mehr ändern.");
          // Schon vergebene Stiftungspreise behalten ihre Deckung: nicht unter die vergebene Zahl verringern.
          if (alt.preisartId != null && (alt.preisartId !== input.preisartId || input.anzahl < alt.anzahl)) {
            await pruefeStiftungDeckung(tx, alt.preisartId, alt.preisartId === input.preisartId ? alt.anzahl - input.anzahl : alt.anzahl);
          }
          // Bar erhalten: der Eingang steht im Kassenbuch und bleibt vermerkt.
          await tx.update(stiftung).set(alt.kassenbewegungId != null ? { ...werte, eingegangenAm: alt.eingegangenAm } : werte).where(eq(stiftung.id, id));
        } else {
          const [neu] = await tx.insert(stiftung).values(werte).returning({ id: stiftung.id });
          datensatzId = neu!.id;
        }
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "stiftung",
          datensatzId: datensatzId ?? null,
          aktion: alt ? "geändert" : "angelegt",
          alt: alt && stiftungFuerProtokoll(alt),
          neu: stiftungFuerProtokoll(werte),
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Bar übergebene Stiftung ohne Meldung: als Einlage ins Kassenbuch (mit Eigenbeleg) und als eingegangen vermerken.
   * Stiftungen mit Meldung laufen über das Meldegeld.
   */
  stiftungBarErhalten: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    const k = await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      const [st] = await tx.select().from(stiftung).where(and(eq(stiftung.id, input.id), eq(stiftung.schauId, input.schauId)));
      if (!st) throw fehler("NOT_FOUND", "Stiftung nicht gefunden.");
      if (st.meldungId != null) throw fehler("BAD_REQUEST", "Diese Stiftung wird mit dem Meldegeld bezahlt – Zahlung bitte an der Meldung erfassen.");
      if (st.kassenbewegungId != null) throw fehler("BAD_REQUEST", "Diese Stiftung ist schon im Kassenbuch gebucht.");
      if (st.betragCent <= 0) throw fehler("BAD_REQUEST", "Die Stiftung hat keinen Geldbetrag (Sachpreis).");
      const [k] = await tx
        .insert(kassenbewegung)
        .values({ schauId: input.schauId, art: "einlage", betragCent: st.betragCent, grund: `Stiftung von ${st.stifter}`.slice(0, 500), erfasstVon: ctx.benutzer.id })
        .returning();
      await tx.update(stiftung).set({ kassenbewegungId: k!.id, eingegangenAm: st.eingegangenAm ?? heuteDe() }).where(eq(stiftung.id, st.id));
      await protokolliere(tx, { schauId: input.schauId, tabelle: "kassenbewegung", datensatzId: k!.id, aktion: "einlage", neu: k, grund: `Stiftung ${st.id} bar erhalten`, akteur: ctx });
      await protokolliere(tx, { schauId: input.schauId, tabelle: "stiftung", datensatzId: st.id, aktion: "bar erhalten", alt: stiftungFuerProtokoll(st), neu: { kassenbewegungId: k!.id, betragCent: st.betragCent }, akteur: ctx });
      return k!;
    });
    await archiviereKassenbeleg(s, "eigenbeleg", k.id);
    return { ok: true, kassenbewegungId: k.id };
  }),

  stiftungLoeschen: adminProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    await db.transaction(async (tx) => {
      await sperreKasse(tx, input.schauId);
      const [vorher] = await tx.select().from(stiftung).where(and(eq(stiftung.id, input.id), eq(stiftung.schauId, input.schauId)));
      if (!vorher) throw fehler("NOT_FOUND", "Stiftung nicht gefunden.");
      await pruefeStiftungAenderbar(tx, input.schauId, vorher.meldungId, vorher.betragCent !== 0);
      const [{ n: aus }] = (await tx.select({ n: count() }).from(preisvergabe).where(eq(preisvergabe.stiftungId, vorher.id))) as [{ n: number }];
      if (aus > 0) throw fehler("BAD_REQUEST", `Aus dieser Stiftung sind schon ${aus} Preise vergeben. Erst die Preise entfernen.`);
      if (vorher.kassenbewegungId != null) throw fehler("BAD_REQUEST", "Die Stiftung ist schon als Einlage im Kassenbuch gebucht und bleibt deshalb stehen.");
      if (vorher.preisartId != null) await pruefeStiftungDeckung(tx, vorher.preisartId, vorher.anzahl);
      const [alt] = await tx.delete(stiftung).where(eq(stiftung.id, vorher.id)).returning();
      if (!alt) throw fehler("NOT_FOUND", "Stiftung nicht gefunden.");
      await protokolliere(tx, { schauId: input.schauId, tabelle: "stiftung", datensatzId: alt.id, aktion: "gelöscht", alt: stiftungFuerProtokoll(alt), akteur: ctx });
    });
    return { ok: true };
  }),

  /**
   * Gibt die Ergebnisse frei (öffentlich sichtbar, Bewertung geschlossen). Gesperrt bei offenen Bewertungen, Obmann-
   * Bestätigungen, überzogenem Kontingent, fehlender Stiftungsdeckung und bestätigten Tieren ohne Nummer. Die Rücknahme
   * braucht einen Grund; ab „Schau & Verkauf“ oder nach Auszahlungen zusätzlich die ausdrückliche Bestätigung.
   */
  freigeben: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        freigegeben: z.boolean(),
        /** Hinweise (frühe Phase, freie Preise, bewertet ohne Einlieferung; bei der Rücknahme: späte Phase) gesehen. */
        trotzdem: z.boolean().default(false),
        grund: z.string().trim().max(500).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
    const geladen = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    // Alles in einer Transaktion unter Kasse → Schau (ADR 033): Preise, Noten am Tablet und eine zweite Freigabe warten,
    // bis hier geprüft und geschrieben ist – oder die Freigabe wartet auf sie und prüft danach den neuen Stand.
    return db.transaction(async (tx) => {
      await sperreKasse(tx, geladen.id);
      const [frisch] = await tx.select().from(schau).where(eq(schau.id, geladen.id)).for("no key update");
      // Freigeben und Zurücknehmen ändern den veröffentlichten Katalog – nach dem Abschluss nicht mehr.
      const s = pruefeNichtAbgeschlossen(frisch!);
      // Schon so (z. B. ein zweiter Tab mit altem Stand): nichts zu prüfen, nichts zu schreiben, nichts zu protokollieren.
      if (s.ergebnisseFreigegeben === input.freigegeben) return { ok: true };
      if (input.freigegeben) {
        const eintraege = await ladeEintraege(s.id, { nurBestaetigt: true, ex: tx });
        const offen = eintraege.filter((e) => e.katalogNr != null && e.status !== "fehlt" && !e.bewertet).length;
        if (offen) throw fehler("BAD_REQUEST", `${offen} Tiere sind noch nicht bewertet.`);
        const obmann = eintraege.filter((e) => brauchtObmann({ punkte: e.punkte, sondernote: e.sondernote }, skalaVon(s)) && !e.obmannBestaetigtAm).length;
        if (obmann) throw fehler("BAD_REQUEST", `${obmann} Bewertungen („vorzüglich“ oder u.M.) sind noch nicht vom Obmann bestätigt.`);
        // Bestätigte Tiere ohne Nummer fehlten im Katalog mit Ergebnissen.
        const ohneNr = eintraege.filter((e) => e.katalogNr == null).length;
        if (ohneNr) throw fehler("BAD_REQUEST", `${ohneNr} bestätigte Tiere haben keine Katalognummer – erst nummerieren oder die Meldung bereinigen.`);
        const [einteilung, richter, arten, stiftungen] = await Promise.all([
          tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
          tx.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
          tx.select().from(preisart).where(eq(preisart.schauId, s.id)).orderBy(asc(preisart.folge)),
          tx.select().from(stiftung).where(eq(stiftung.schauId, s.id)),
        ]);
        const k = kontingente(eintraege, zuteilung(eintraege, einteilung), richter, arten, s.kontingentJe);
        const name = (z: { name: string }) => (s.kontingentJe === "schau" ? "" : ` (${z.name})`);
        // Überzogenes Kontingent (z. B. nach einer Änderung, auch Zusatzpreise je Preisrichter) und zu wenig gestiftete Preise: erst bereinigen.
        const ueber = k.flatMap((z) => z.arten.filter((a) => a.vergeben > a.verfuegbar).map((a) => `${a.kuerzel} ${a.vergeben} von ${a.verfuegbar}${name(z)}`));
        if (ueber.length) throw fehler("BAD_REQUEST", `Kontingent überschritten: ${ueber.join(", ")}. Bitte erst Preise entfernen.`);
        const ungedeckt = arten
          .filter((a) => a.quelle === "stiftung")
          .flatMap((a) => {
            const gestiftet = stiftungen.filter((st) => st.preisartId === a.id).reduce((n, st) => n + st.anzahl, 0);
            const u = stiftungUngedeckt(a, gestiftet, eintraege.flatMap((e) => e.preise.filter((p) => p.preisartId === a.id)));
            return u ? [`${a.kuerzel} ${u.vergeben} vergeben, ${u.verfuegbar} gestiftet`] : [];
          });
        if (ungedeckt.length) throw fehler("BAD_REQUEST", `Stiftungspreise nicht gedeckt: ${ungedeckt.join(", ")}. Bitte Stiftung ergänzen oder Preise entfernen.`);
        // Hinweise, keine Sperre: Freie Preise können berechtigt sein (kein Tier mit genug Punkten).
        if (!input.trotzdem) {
          // Freie Zusatzpreise (gestiftet, zusätzlich je Preisrichter) sind ein Angebot, kein Hinweis.
          const frei = k.flatMap((z) => z.arten.filter((a) => !a.zusatz && a.vergeben < a.verfuegbar).map((a) => `${a.kuerzel} ${a.verfuegbar - a.vergeben} von ${a.verfuegbar}${name(z)}`));
          const ohneEinlieferung = eintraege.filter((e) => e.status === "katalogisiert" && e.bewertet).length;
          const stiftungFrei = offeneStiftungen(stiftungen, eintraege);
          const hinweise = [
            ...(PHASEN.indexOf(s.phase) < PHASEN.indexOf("preise") ? [`Die Schau steht noch in der Phase „${PHASEN_LABEL[s.phase]}“ – die Preisrichter können am Tablet noch Preise vergeben.`] : []),
            ...(frei.length ? [`Noch freie Preise: ${frei.join(", ")}.`] : []),
            ...(stiftungFrei.length ? [`Gestiftete Preise noch nicht vergeben: ${stiftungFrei.join("; ")}.`] : []),
            ...(stiftungen.some((st) => st.preisartId == null)
              ? [`Stiftung(en) ohne Preisart: ${stiftungen.filter((st) => st.preisartId == null).map((st) => st.stifter).join(", ")} – sie zählen für keinen Preis.`]
              : []),
            ...(ohneEinlieferung ? [`${ohneEinlieferung} Tiere sind bewertet, aber nicht als eingeliefert abgehakt (Nachweis prüfen oder mit Grund einliefern).`] : []),
          ];
          if (hinweise.length) throw fehler("PRECONDITION_FAILED", `${hinweise.join(" ")} Trotzdem freigeben?`);
        }
      } else {
        // Die Rücknahme öffnet die Bewertung wieder – der Katalog mit Ergebnissen ist dann evtl. schon gedruckt.
        if (input.grund.length < 3) throw fehler("BAD_REQUEST", "Freigabe zurücknehmen nur mit Grund.");
        if (!input.trotzdem) {
          const [{ n }] = (await tx.select({ n: count() }).from(auszahlung).where(eq(auszahlung.schauId, s.id))) as [{ n: number }];
          const spaet = PHASEN.indexOf(s.phase) >= PHASEN.indexOf("schau");
          if (spaet || n > 0) {
            throw fehler(
              "PRECONDITION_FAILED",
              `${spaet ? `Die Schau steht schon in der Phase „${PHASEN_LABEL[s.phase]}“. ` : ""}${n ? `Es gibt schon ${n} Auszahlung(en). ` : ""}Ergebnisse, Preise und Abrechnung können sich danach ändern. Trotzdem zurücknehmen?`,
            );
          }
        }
      }
      await tx.update(schau).set({ ergebnisseFreigegeben: input.freigegeben }).where(eq(schau.id, s.id));
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "schau",
        datensatzId: s.id,
        aktion: input.freigegeben ? "Ergebnisse freigegeben" : "Freigabe zurückgenommen",
        grund: input.grund,
        akteur: ctx,
      });
      return { ok: true };
    });
  }),
});
