/** Einlieferung in der Halle: Ringnummer, Käfig je Tier, Suche, Status (Einlieferung, Ausgabe), Impfnachweise. */
import { gefordertCent, KAEFIG_TYPEN, kaefigName, kaefigTyp } from "@schau/domain";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { gesundheit, katalogeintrag, meldung, verkauf, verkaufZahlungseingang } from "../../db/schema";
import { ladeEintraege, meldebetraege } from "../../services/eintraege";
import { pruefeNichtAbgeschlossen, sperreKasse } from "../../services/kasse";
import { bindungen } from "../../services/meldung";
import { protokolliere } from "../../services/protokoll";
import { nachweisStand } from "../../services/tiergesundheit";
import { benutzerProcedure, fehler, ladeSchau, dbId, kalenderdatum } from "../../trpc";

export const halleEinlieferung = {
  /** Ringnummer bei der Einlieferung nach der Ringkarte eintragen (Kennzeichnung für Kaufbeleg und Veterinärliste). */
  ringnummerSetzen: benutzerProcedure
    .input(z.object({ schauId: dbId, id: dbId, ringnummern: z.string().trim().max(200), grund: z.string().trim().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [alt] = await tx
          .select({ ringnummern: katalogeintrag.ringnummern })
          .from(katalogeintrag)
          .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, input.schauId)))
          .for("update");
        if (!alt) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if ((alt.ringnummern ?? "") === input.ringnummern) return;
        // Wie beim Status: Nach Freigabe, Verkauf oder Abschluss stehen Ringnummern auf Belegen und der Liste für das
        // Veterinäramt – dann nur noch die Ausstellungsleitung mit Grund.
        const [verkauft] = await tx.select({ id: verkauf.id }).from(verkauf).where(and(eq(verkauf.katalogeintragId, input.id), isNull(verkauf.storniertAm))).limit(1);
        const fest = s.ergebnisseFreigegeben || s.phase === "abgeschlossen" || !!verkauft;
        if (fest && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nach Freigabe, Verkauf oder Abschluss ändert nur die Ausstellungsleitung die Ringnummer (mit Grund).");
        if (fest && input.grund.length < 3) throw fehler("BAD_REQUEST", "Bitte einen Grund für die Änderung der Ringnummer angeben.");
        await tx.update(katalogeintrag).set({ ringnummern: input.ringnummern }).where(eq(katalogeintrag.id, input.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "katalogeintrag", datensatzId: input.id, aktion: "Ringnummer", alt: alt.ringnummern, neu: input.ringnummern, grund: input.grund || undefined, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Andere Käfiggröße für ein einzelnes Tier, z. B. das Zwerghuhn in den letzten freien Großkäfig. null = wieder
   * automatisch (Regel der Rasse bzw. Sparte). Helfer dürfen das, weil sie die Tiere bei der Einlieferung einsetzen.
   */
  kaefigSetzen: benutzerProcedure
    .input(z.object({ schauId: dbId, id: dbId, typ: z.enum(KAEFIG_TYPEN).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("PRECONDITION_FAILED", "Die Schau ist abgeschlossen.");
      await db.transaction(async (tx) => {
        const [alt] = await tx
          .select({ art: katalogeintrag.art, kaefigWahl: katalogeintrag.kaefigWahl })
          .from(katalogeintrag)
          .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, input.schauId)))
          .for("update");
        if (!alt) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if (alt.art === "bruteier") throw fehler("BAD_REQUEST", "Bruteier brauchen keinen Käfig.");
        if ((alt.kaefigWahl ?? null) === input.typ) return;
        await tx.update(katalogeintrag).set({ kaefigWahl: input.typ }).where(eq(katalogeintrag.id, input.id));
        await protokolliere(tx, {
          schauId: input.schauId, tabelle: "katalogeintrag", datensatzId: input.id, aktion: "Käfig je Tier",
          alt: alt.kaefigWahl ? kaefigName(alt.kaefigWahl, s.kaefigMasse) : "automatisch", neu: input.typ ? kaefigName(input.typ, s.kaefigMasse) : "automatisch", akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /** Einlieferung: Aussteller mit ihren Tieren, gesucht nach Name oder Katalognummer. */
  suche: benutzerProcedure.input(z.object({ schauId: dbId, q: z.string().max(200) })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const alle = await ladeEintraege(input.schauId, { nurBestaetigt: true });
    const q = input.q.trim().toLowerCase();
    const nr = Number.parseInt(q, 10);
    const treffer = q
      ? alle.filter((e) => (Number.isFinite(nr) ? e.katalogNr === nr : e.ausstellerName.toLowerCase().includes(q)))
      : alle;
    const meldungIds = [...new Set(treffer.map((e) => e.meldungId))].slice(0, 30);
    const meldungen = meldungIds.length ? await db.select().from(meldung).where(inArray(meldung.id, meldungIds)) : [];
    // Meldegeld aller Treffer mit wenigen Abfragen (nicht je Meldung einzeln).
    const betraege = await meldebetraege(db, s.id, meldungen);
    return Promise.all(
      meldungIds.map(async (id) => {
        // Käfiggröße je Tier (nach den Regeln der Schau), damit die Halle gleich weiß, wohin es kommt.
        const tiere = alle
          .filter((e) => e.meldungId === id)
          .map((e) => {
            const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, wahl: e.kaefigWahl }, s.kaefigRegeln ?? []);
            const auto = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse }, s.kaefigRegeln ?? []);
            return { ...e, kaefigGroesse: typ ? kaefigName(typ, s.kaefigMasse) : null, kaefigTyp: typ, kaefigAuto: auto };
          });
        const m = meldungen.find((x) => x.id === id)!;
        // Viele Vereine kassieren das Meldegeld bei der Einlieferung: offener Betrag (mit zugesagter Stiftung und Spende) gleich hier.
        const b = betraege.get(id)!;
        const geld = { summeCent: b.summeCent, stiftungCent: b.stiftungCent, spendeCent: b.spendeCent, bezahltCent: b.bezahltCent, offenCent: gefordertCent(b) - b.bezahltCent };
        return { meldung: m, name: tiere[0]!.ausstellerName, ort: tiere[0]!.ort, tiere, geld, nachweise: nachweisStand(m, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer) };
      }),
    );
  }),

  statusSetzen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        ids: z.array(dbId).min(1),
        status: z.enum(["katalogisiert", "eingeliefert", "fehlt", "ausgesetzt"]),
        /**
         * Grund für eine bewusste Ausnahme (steht im Protokoll): Einlieferung ohne geprüften Nachweis, Ausgabe eines
         * gesperrten Tiers, Statusänderung nach der Freigabe.
         */
        uebersteuern: z.string().trim().max(500).default(""),
        /** Ausgabe eines verkauften Tiers nur gegen Kaufbeleg: dessen Nummer. */
        belegNr: z.number().int().positive().max(1_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const betroffen = await ladeEintraege(input.schauId);
      const ziel = betroffen.filter((e) => input.ids.includes(e.id));
      const nr = (e: (typeof ziel)[number]) => `${e.katalogNr ?? "?"}${e.suffix}`;
      const grund = input.uebersteuern;
      const ausnahmen: string[] = [];
      // Nach der Freigabe stehen die Ergebnisse fest: Ausgabe und Zurücknehmen der Ausgabe gehen weiter,
      // alles andere (fehlt, nicht eingeliefert) nur durch die Ausstellungsleitung mit Grund.
      // Ein bewertetes Tier war in der Halle, auch wenn die Einlieferung (Nachweis offen) nicht abgehakt ist.
      const nurAusgabe = (e: (typeof ziel)[number]) =>
        (input.status === "ausgesetzt" && (e.status === "eingeliefert" || (e.status === "katalogisiert" && e.bewertet))) ||
        (input.status === "eingeliefert" && e.status === "ausgesetzt");
      if (s.ergebnisseFreigegeben && ziel.some((e) => !nurAusgabe(e) && e.status !== input.status)) {
        if (ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nach der Freigabe der Ergebnisse ändert nur die Ausstellungsleitung den Status (Ausgabe ausgenommen).");
        if (grund.length < 3) throw fehler("PRECONDITION_FAILED", "Die Ergebnisse sind freigegeben. Statusänderung nur mit Grund.");
        ausnahmen.push("nach der Freigabe");
      }
      if (input.status === "fehlt" || input.status === "katalogisiert") {
        // Ein bewertetes, prämiertes oder verkauftes Tier war da – „fehlt“ würde Ergebnis und Kontingent verfälschen.
        const gebunden = await bindungen(db, ziel.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Geht nicht: ${gebunden.join("; ")}.`);
      }
      if (input.status === "ausgesetzt") {
        const verkauft = ziel.filter((e) => e.verkaufBelegNr != null && e.status !== "ausgesetzt");
        if (verkauft.length > 1) throw fehler("BAD_REQUEST", "Verkaufte Tiere bitte einzeln gegen Kaufbeleg ausgeben.");
        const v = verkauft[0];
        if (v && input.belegNr !== v.verkaufBelegNr)
          throw fehler("BAD_REQUEST", input.belegNr == null ? `Nr. ${nr(v)} ist verkauft – Ausgabe nur gegen Kaufbeleg.` : `Der Kaufbeleg ${input.belegNr} gehört nicht zu Nr. ${nr(v)}.`);
        if (v) ausnahmen.push(`gegen Kaufbeleg ${v.verkaufBelegNr}`);
        if (v) {
          // Per Überweisung verkauft: erst nach gebuchtem Zahlungseingang hinaus (sonst wäre das Tier weg und das Geld nicht da).
          const [vk] = await db
            .select({ zahlart: verkauf.zahlart, eingang: verkaufZahlungseingang.id })
            .from(verkauf)
            .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
            .where(and(eq(verkauf.katalogeintragId, v.id), isNull(verkauf.storniertAm)));
          if (vk?.zahlart === "ueberweisung" && vk.eingang == null) {
            if (ctx.benutzer.rolle !== "admin" || grund.length < 3)
              throw fehler("PRECONDITION_FAILED", `Nr. ${nr(v)} ist per Überweisung verkauft – der Zahlungseingang ist noch nicht gebucht (Kasse › Verkauf). Ausgabe vorher nur durch die Ausstellungsleitung mit Grund.`);
            ausnahmen.push("Überweisung noch nicht eingegangen");
          }
        }
        const gesperrt = ziel.filter((e) => e.gesperrt && e.status !== "ausgesetzt");
        if (gesperrt.length) {
          if (grund.length < 3)
            throw fehler("PRECONDITION_FAILED", `Gesperrt (Gesundheitsjournal): Nr. ${gesperrt.map(nr).join(", ")}. Ausgabe nur mit Grund, z. B. Anordnung des Tierarztes.`);
          ausnahmen.push(`gesperrt: ${gesperrt.map(nr).join(", ")}`);
        }
      }
      // Impfpflichtige Tiere kommen nur mit geprüftem Nachweis in die Halle (§ 7 GeflPestSchV, Sonderbestimmungen).
      let ohneNachweis: string[] = [];
      // Nur Tiere, die neu in die Halle kommen – das Zurücknehmen einer Ausgabe prüft nicht noch einmal.
      const neuInDerHalle = ziel.filter((e) => e.status !== "eingeliefert" && e.status !== "ausgesetzt");
      if (input.status === "eingeliefert" && neuInDerHalle.length) {
        const ids = [...new Set(neuInDerHalle.map((e) => e.meldungId))];
        const meldungen = ids.length ? await db.select().from(meldung).where(inArray(meldung.id, ids)) : [];
        ohneNachweis = meldungen.flatMap((m) => {
          const tiere = betroffen.filter((e) => e.meldungId === m.id);
          const n = nachweisStand(m, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer);
          return n.noetig.length && !n.geprueft ? [`${tiere[0]!.ausstellerName} (${n.noetig.map((x) => x.toUpperCase()).join(", ")})`] : [];
        });
        if (ohneNachweis.length && input.uebersteuern.length < 3) {
          throw fehler("PRECONDITION_FAILED", `Nachweis nicht geprüft: ${ohneNachweis.join("; ")}. Erst den Nachweis prüfen oder mit Grund ohne Nachweis einliefern.`);
        }
      }
      await db.transaction(async (tx) => {
        // Erst die Kasse, dann die Tiere sperren (dieselbe Reihenfolge wie Verkauf, Preisvergabe und Meldung – sonst
        // könnten sie sich gegenseitig blockieren), und die Bindungen hier noch einmal prüfen: sonst käme eine
        // gleichzeitige Tablet-Note, Preisvergabe oder ein Verkauf zwischen Prüfung und Speichern dazwischen
        // (bewertetes Tier mit „fehlt“, verkauftes Tier ohne Beleg ausgegeben).
        const ids = ziel.map((e) => e.id);
        await sperreKasse(tx, input.schauId);
        if (ids.length) await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(inArray(katalogeintrag.id, ids)).orderBy(asc(katalogeintrag.id)).for("update");
        if (input.status === "fehlt" || input.status === "katalogisiert") {
          const gebunden = await bindungen(tx, ids);
          if (gebunden.length) throw fehler("CONFLICT", `Inzwischen geändert – geht nicht: ${gebunden.join("; ")}.`);
        }
        if (input.status === "ausgesetzt" && ids.length) {
          const jetzt = await tx.select({ id: verkauf.katalogeintragId, belegNr: verkauf.belegNr }).from(verkauf).where(and(inArray(verkauf.katalogeintragId, ids), isNull(verkauf.storniertAm)));
          const neuVerkauft = jetzt.filter((v) => {
            const e = ziel.find((x) => x.id === v.id);
            return e && e.status !== "ausgesetzt" && e.verkaufBelegNr !== v.belegNr;
          });
          if (neuVerkauft.length) throw fehler("CONFLICT", "Ein Tier wurde inzwischen verkauft – bitte neu laden und gegen Kaufbeleg ausgeben.");
          // Sperren im Gesundheitsjournal frisch lesen: eine inzwischen erfasste Sperre (das Erfassen sperrt das Tier
          // ebenfalls) braucht wie jede andere einen Grund und steht als Ausnahme im Protokoll (Entscheidung 033).
          const gesperrtJetzt = new Set(
            (await tx.select({ id: gesundheit.katalogeintragId }).from(gesundheit).where(and(inArray(gesundheit.katalogeintragId, ids), or(eq(gesundheit.sperre, true), eq(gesundheit.verendet, true))))).map((g) => g.id),
          );
          const neuGesperrt = ziel.filter((e) => gesperrtJetzt.has(e.id) && !e.gesperrt && e.status !== "ausgesetzt");
          if (neuGesperrt.length) {
            if (grund.length < 3)
              throw fehler("PRECONDITION_FAILED", `Gesperrt (Gesundheitsjournal): Nr. ${neuGesperrt.map(nr).join(", ")}. Ausgabe nur mit Grund, z. B. Anordnung des Tierarztes.`);
            ausnahmen.push(`gesperrt: ${neuGesperrt.map(nr).join(", ")}`);
          }
        }
        await tx
          .update(katalogeintrag)
          .set({ status: input.status })
          .where(and(eq(katalogeintrag.schauId, input.schauId), inArray(katalogeintrag.id, ids)));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "katalogeintrag",
          datensatzId: null,
          aktion: [`Status ${input.status}`, ohneNachweis.length ? "ohne geprüften Nachweis" : "", ...ausnahmen].filter(Boolean).join(", "),
          neu: ziel.map(nr),
          grund: ohneNachweis.length || ausnahmen.length ? grund : "",
          akteur: ctx,
        });
      });
      return { ok: true, anzahl: ziel.length };
    }),

  /**
   * Nachweise bei der Einlieferung: ND-Impfung (Hühner, Puten), PMV-Impfung (Tauben), Untersuchung Wassergeflügel.
   * Die Oberfläche speichert beim Verlassen jedes Feldes und beim Haken; „geprüft“ geht nur, wenn alle nötigen
   * Nachweise vollständig und in der Frist sind.
   */
  vetSetzen: benutzerProcedure
    .input(
      z.object({
        meldungId: dbId,
        nd: z.object({ datum: kalenderdatum().nullable(), impfstoff: z.string().max(200), tierarzt: z.string().max(200) }),
        pmv: z.object({ datum: kalenderdatum().nullable(), impfstoff: z.string().max(200), tierarzt: z.string().max(200) }),
        wg: z.object({ datum: kalenderdatum().nullable(), sentinel: z.boolean(), stelle: z.string().max(200) }),
        /** Klinische Untersuchung (Bescheinigung) und Gesundheitszertifikat – fehlen sie, bleibt der Stand. */
        kl: z.object({ datum: kalenderdatum().nullable(), tierarzt: z.string().max(200) }).optional(),
        gz: z.object({ datum: kalenderdatum().nullable(), nummer: z.string().max(200) }).optional(),
        geprueft: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [geladen] = await db.select({ schauId: meldung.schauId }).from(meldung).where(eq(meldung.id, input.meldungId));
      if (!geladen) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
      // Der Impfnachweis ist eine tierseuchenrechtliche Aufzeichnung: nach dem Abschluss nur noch lesen.
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, geladen.schauId));
      // Vergleich, Prüfung und „alt“ am gesperrten Stand: zwei Anfragen kurz nacheinander (Feld verlassen, dann Haken)
      // folgen so aufeinander, statt beide denselben alten Stand zu sehen (Entscheidung 033).
      return db.transaction(async (tx) => {
        const [m] = await tx.select().from(meldung).where(eq(meldung.id, input.meldungId)).for("update");
        if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
        const werte = {
          vetImpfdatum: input.nd.datum,
          vetImpfstoff: input.nd.impfstoff.trim(),
          vetTierarzt: input.nd.tierarzt.trim(),
          pmvImpfdatum: input.pmv.datum,
          pmvImpfstoff: input.pmv.impfstoff.trim(),
          pmvTierarzt: input.pmv.tierarzt.trim(),
          wgDatum: input.wg.datum,
          wgSentinel: input.wg.sentinel,
          wgStelle: input.wg.stelle.trim(),
          ...(input.kl ? { klDatum: input.kl.datum, klTierarzt: input.kl.tierarzt.trim() } : {}),
          ...(input.gz ? { gzDatum: input.gz.datum, gzNummer: input.gz.nummer.trim() } : {}),
        };
        const alt = {
          vetImpfdatum: m.vetImpfdatum,
          vetImpfstoff: m.vetImpfstoff,
          vetTierarzt: m.vetTierarzt,
          pmvImpfdatum: m.pmvImpfdatum,
          pmvImpfstoff: m.pmvImpfstoff,
          pmvTierarzt: m.pmvTierarzt,
          wgDatum: m.wgDatum,
          wgSentinel: m.wgSentinel,
          wgStelle: m.wgStelle,
          ...(input.kl ? { klDatum: m.klDatum, klTierarzt: m.klTierarzt } : {}),
          ...(input.gz ? { gzDatum: m.gzDatum, gzNummer: m.gzNummer } : {}),
          geprueft: !!m.vetGeprueftAm,
        };
        const neu = { ...werte, geprueft: input.geprueft };
        // Unverändert (z. B. Feld ohne Änderung verlassen): nichts schreiben, nichts protokollieren.
        if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
        if (input.geprueft) {
          const tiere = await ladeEintraege(m.schauId, { nurMeldungId: m.id, ex: tx });
          const n = nachweisStand({ ...m, ...werte }, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer);
          if (n.fehler.length) throw fehler("BAD_REQUEST", `Nachweis nicht vollständig: ${n.fehler.join(" ")}`);
        }
        await tx
          .update(meldung)
          .set({ ...werte, vetGeprueftAm: input.geprueft ? (m.vetGeprueftAm ?? new Date()) : null })
          .where(eq(meldung.id, m.id));
        await protokolliere(tx, { schauId: m.schauId, tabelle: "meldung", datensatzId: m.id, aktion: "Impfnachweis", alt, neu, akteur: ctx });
        return { ok: true, geaendert: true };
      });
    }),
};
