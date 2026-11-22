/** Hallenplan: Plan und Stellvorschläge, festschreiben, neu setzen, Tier versetzen, Käfiginfo, Halle speichern, Wandreihe. */
import { halleNormal, AUFSTELLER_STANDARD, bewertungsText, neuSetzen, halleZumNeuSetzen, type Halle, mitWandreihe, reihenVersatzNachUmbau, festschreiben, plattenStand, pruefeEntfernt, pruefeTeileEntfernt, formatKatalognummer, halleSchluessel, stabilerText, HALLE_STANDARD, kaefigName, kaefigTyp, planeHalle, planUnordnung, stellVorschlaege, belegungImPlan, gleicherPlatz, platzImPlan, richterImPlan, tierVersetzen, type KaefigPlatz } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { katalogeintrag, preisrichter, prEinteilung, schau } from "../../db/schema";
import { ladeEintraege, skalaVon } from "../../services/eintraege";
import { einteilTier, ladeRegeln } from "../../services/einteilung";
import { pruefeNichtAbgeschlossen } from "../../services/kasse";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";
import { etagenAus, KAEFIG_PLATZ, HALLE_EINGABE, mitGeprueftemUmriss, umrissEinheitlich, planNeuSetzenIn, planTiere } from "./gemeinsam";

export const katalogHallenplan = {
  /**
   * Hallenplan: alle gemeldeten Tiere (offen und bestätigt) mit Käfig in Katalogfolge (Käfignummern) auf die Reihen der Halle verteilt; dazu
   * die Preisrichter-Bereiche. Ohne angelegte Halle nur die Vorgaben. Keine Ausstellernamen – nur Rasse und Nummer.
   */
  hallenplan: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const { tiere, richter, farben } = await planTiere(s);
    const halle = s.halle ?? null;
    const plan = halle ? planeHalle(halle, tiere, s.kaefigMasse, s.hallenplanFest) : null;
    return {
      halle,
      /** Für die 3D-Ansicht: Aufsteller und Farbenschlag je Tier (Gefiederfarbe der Figuren). */
      aufsteller: s.aufsteller ?? AUFSTELLER_STANDARD,
      farben,
      vorgabe: HALLE_STANDARD,
      plan,
      /** Fester Plan nach dem Umstellen: freie Plätze zwischen belegten, Nummern nicht in Planfolge (für den Hinweis). */
      unordnung: plan && halle && s.hallenplanFest ? planUnordnung(plan, halle.richtung ?? "quer", s.katalogGedruckt, halle.nummerFolge) : null,
      anzahl: tiere.length,
      ohneNummer: tiere.filter((t) => t.nr == null).length,
      masse: s.kaefigMasse ?? {},
      richter,
      /** Für „Nach Plan nummerieren“: festgeschriebene Katalognummern bleiben, dann nur die Käfigplätze. */
      katalogGedruckt: s.katalogGedruckt,
      katalogStart: s.katalogStart,
      abgeschlossen: s.phase === "abgeschlossen",
    };
  }),

  /**
   * Stellvorschläge: die Halle in anderen Aufstellungen (Richtung, Wandreihen, bündig, Hauptgang) durchgerechnet, mit
   * Eingängen, Flächen und eingesetzten Teilen. Übernommen wird ein Vorschlag mit `halleSetzen`.
   */
  stellVorschlaege: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (!s.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
    const { tiere } = await planTiere(s);
    // Stand, aus dem gerechnet wurde: „Übernehmen“ schickt ihn als `basis` – wurde die Halle inzwischen geändert, lehnt
    // `halleSetzen` ab, statt die Änderung mit einem veralteten Vorschlag zu überschreiben.
    return { ...stellVorschlaege(s.halle, tiere, s.kaefigMasse), basis: halleSchluessel(s.halle) };
  }),

  /**
   * Stellvorschläge für eine noch nicht gespeicherte Halle (geführter Ablauf „Halle einrichten“): nur Ausstellungsleitung,
   * als POST (ein Entwurf mit vielen Teilen sprengt sonst die Länge der Adresse), Hallen bis 20.000 m².
   */
  stellVorschlaegeEntwurf: adminProcedure.input(z.object({ schauId: dbId, entwurf: HALLE_EINGABE })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (input.entwurf.breite * input.entwurf.laenge > 20_000 * 10_000) throw fehler("BAD_REQUEST", "Die Halle ist zu groß (höchstens 20.000 m²).");
    const halle = umrissEinheitlich({ ...input.entwurf, plattenMass: input.entwurf.plattenMass ?? s.halle?.plattenMass ?? {}, ...etagenAus(input.entwurf.etagen, s.halle) });
    const { tiere } = await planTiere(s);
    return { ...stellVorschlaege(halle, tiere, s.kaefigMasse), basis: halleSchluessel(s.halle ?? null) };
  }),

  /**
   * Plan festschreiben: Die Lage jedes Käfigs wird gespeichert, die Automatik rechnet danach nicht mehr neu. Nachmeldungen
   * kommen in frei gewordene Plätze oder unter „noch zu stellen“. „Plan neu setzen“ (planLoesen) gibt den Plan wieder frei.
   */
  planFestschreiben: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Automatisch aus dem Editor: nur, solange der Plan nicht schon (anderswo) festgeschrieben ist. */
        nurWennLose: z.boolean().optional(),
        /** Grundplatten, wie der Editor sie zeigt (`plattenStand`) – weichen sie ab, wird nicht festgeschrieben. */
        plattenStand: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (!s.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
    const { tiere } = await planTiere(s);
    return db.transaction(async (tx) => {
      // Halle frisch und gesperrt: ein gleichzeitiges Speichern der Halle darf nicht verloren gehen.
      const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
      if (input.nurWennLose && aktuell?.fest)
        throw fehler("CONFLICT", "Der Plan wurde inzwischen festgeschrieben – er wird neu geladen, bitte die Änderung noch einmal machen.");
      const halle = aktuell?.halle ?? s.halle!;
      // Aus dem frisch gerechneten Plan (auch wenn schon festgeschrieben war – nur über „Plan neu setzen“ bzw. ausdrücklich).
      const plan = planeHalle(halle, tiere, s.kaefigMasse);
      if (input.plattenStand && input.plattenStand !== plattenStand(plan))
        throw fehler("CONFLICT", "Der Plan hat sich inzwischen geändert (Nachmeldung oder Storno) – er wird neu geladen, bitte die Änderung noch einmal machen.");
      const fest = festschreiben(halle, plan, s.kaefigMasse, new Date().toISOString());
      // Entfernte leere Plätze gehörten zum vorigen festen Plan; der neue enthält nur, was jetzt gerechnet ist.
      const { entfernt, ...ohne } = halle;
      await tx.update(schau).set({ hallenplanFest: fest, ...(entfernt?.length ? { halle: ohne } : {}) }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Hallenplan festgeschrieben", neu: { kaefige: plan.reihen.reduce((n, x) => n + x.kaefige.length, 0), nichtPlatziert: plan.nichtPlatziert.length }, akteur: ctx });
      return { am: fest.am };
    });
  }),

  /**
   * Plan neu setzen: die Software stellt alle Käfige neu (siehe `planNeuSetzenIn`). Mit `halle` zugleich neue Einstellungen
   * der Halle (Maße, Gänge, Richtung, Wandreihen …) – dann mit `basis` (Stand, auf dem die Änderung beruht).
   */
  planNeuSetzen: adminProcedure
    .input(z.object({ schauId: dbId, basis: z.string().max(100).optional(), halle: HALLE_EINGABE.optional(), grund: z.string().trim().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (input.halle && input.halle.breite * input.halle.laenge > 20_000 * 10_000) throw fehler("BAD_REQUEST", "Die Halle ist zu groß (höchstens 20.000 m²).");
      return planNeuSetzenIn(ctx, s, input);
    }),

  /** Früherer Name von „Plan neu setzen“ (ohne neue Einstellungen) – für ältere geöffnete Seiten. */
  planLoesen: adminProcedure.input(z.object({ schauId: dbId, grund: z.string().trim().max(500).default("") })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await planNeuSetzenIn(ctx, s, { grund: input.grund });
    return { ok: true };
  }),

  /**
   * Tier im festen Plan von Hand versetzen (Rückmeldung 15.11.2026): in einen freien Käfig gleicher Größe oder Tausch mit einem
   * Tier gleicher Größe (siehe `tierVersetzen` in der Domain). Nur im festen Plan; Katalognummern bleiben. `von` und
   * `erwartet`: wie der Editor den Plan zeigt – hat er sich inzwischen geändert, wird abgelehnt. Ist der Katalog gedruckt
   * oder eines der Tiere schon eingeliefert, kommt ohne `bestaetigt` nur die Rückfrage zurück (es ändert sich nichts).
   */
  tierVersetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        tierId: dbId,
        von: KAEFIG_PLATZ.nullable(),
        ziel: KAEFIG_PLATZ.nullable(),
        /** Tier, das der Editor auf dem Ziel zeigt (null = frei). */
        erwartet: dbId.nullable(),
        bestaetigt: z.boolean().default(false),
        /** Rückgängig bzw. Wiederholen im Editor (fürs Protokoll). */
        grund: z.string().trim().max(200).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const { tiere } = await planTiere(geladen);
      return db.transaction(async (tx) => {
        const [frisch] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest, gedruckt: schau.katalogGedruckt, phase: schau.phase }).from(schau).where(eq(schau.id, geladen.id)).for("update");
        // Phase frisch (gesperrt): eine eben abgeschlossene Schau wird nicht mehr geändert.
        pruefeNichtAbgeschlossen({ ...geladen, phase: frisch!.phase });
        const halle = frisch?.halle;
        if (!halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
        if (!frisch.fest) throw fehler("BAD_REQUEST", "Erst „Automatisch planen“ ausschalten – sonst stellt die Software die Käfige wieder nach der Katalogfolge.");
        const plan = planeHalle(halle, tiere, geladen.kaefigMasse, frisch.fest);
        if (plan.fest?.veraltet) throw fehler("BAD_REQUEST", "Der feste Plan passt nicht mehr zu Halle oder Käfigmaßen – erst „Plan neu setzen“.");
        const ziel = input.ziel as KaefigPlatz | null;
        const jetztDa = ziel ? (belegungImPlan(plan, ziel)?.tierId ?? null) : null;
        if (!gleicherPlatz(platzImPlan(plan, input.tierId), input.von as KaefigPlatz | null) || jetztDa !== input.erwartet)
          throw fehler("CONFLICT", "Der Plan hat sich inzwischen geändert – er wird neu geladen, bitte noch einmal.");
        const e = tierVersetzen(frisch.fest, plan, tiere, input.tierId, ziel);
        if (!e.ok) throw fehler("BAD_REQUEST", e.fehler);
        const nrVon = (id: number) => tiere.find((t) => t.id === id)?.nr ?? "ohne Nummer";
        if (!input.bestaetigt) {
          const ids = [input.tierId, ...(e.getauscht != null ? [e.getauscht] : [])];
          const sitzen = (await ladeEintraege(geladen.id, { ex: tx })).filter((x) => ids.includes(x.id) && ["eingeliefert", "fehlt", "ausgesetzt"].includes(x.status));
          if (sitzen.length)
            return { rueckfrage: `${sitzen.map((x) => `Nr. ${nrVon(x.id)}`).join(" und ")} ${sitzen.length === 1 ? "ist schon eingeliefert – das Tier muss" : "sind schon eingeliefert – die Tiere müssen"} in der Halle umgesetzt werden.` };
          if (frisch.gedruckt) return { rueckfrage: "Der Katalog ist gedruckt – Käfigplätze und Karten stimmen erst wieder nach „Käfigplätze nach Plan“." };
        }
        await tx.update(schau).set({ hallenplanFest: e.fest }).where(eq(schau.id, geladen.id));
        await protokolliere(tx, {
          schauId: geladen.id,
          tabelle: "katalogeintrag",
          datensatzId: input.tierId,
          aktion: e.getauscht != null ? "Tiere im Hallenplan getauscht" : "Tier im Hallenplan versetzt",
          alt: { nr: nrVon(input.tierId), platz: e.von },
          neu: { platz: ziel, ...(e.getauscht != null ? { getauscht: { id: e.getauscht, nr: nrVon(e.getauscht), platz: e.von } } : {}) },
          grund: input.grund,
          akteur: ctx,
        });
        // Beim Tausch auch beim anderen Tier ein Eintrag (Reklamationen suchen je Tier).
        if (e.getauscht != null)
          await protokolliere(tx, {
            schauId: geladen.id,
            tabelle: "katalogeintrag",
            datensatzId: e.getauscht,
            aktion: "Tiere im Hallenplan getauscht",
            alt: { nr: nrVon(e.getauscht), platz: ziel },
            neu: { platz: e.von, getauscht: { id: input.tierId, nr: nrVon(input.tierId), platz: ziel } },
            grund: input.grund,
            akteur: ctx,
          });
        return { rueckfrage: null, getauscht: e.getauscht, von: e.von };
      });
    }),

  /**
   * Angaben zu einem Käfig im Hallenplan (beim Klick): Tier, Züchter, Preisrichter, Status, Bewertung und Preise. Nur für
   * Ausstellungsleitung und Helfer – Preisrichter haben keinen Zugang zu Benutzer-Abfragen.
   */
  kaefigInfo: benutzerProcedure.input(z.object({ schauId: dbId, id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [k] = await db
      .select({ meldungId: katalogeintrag.meldungId })
      .from(katalogeintrag)
      .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, s.id)));
    if (!k) throw fehler("NOT_FOUND", "Käfig nicht gefunden.");
    const e = (await ladeEintraege(s.id, { nurMeldungId: k.meldungId })).find((x) => x.id === input.id)!;
    const [einteilung, richter, regeln] = await Promise.all([
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
      db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)),
      ladeRegeln(db, s.id),
    ]);
    const name = (id: number | null | undefined) => richter.find((r) => r.id === id)?.name ?? null;
    // Wie im Plan: mit Nummer aus den Bereichen, ohne Nummer aus der Einteilung nach Rassen.
    const zugeteilt = richterImPlan({ ...einteilTier(e, s.einteilungJugendSeparat), nr: e.katalogNr }, einteilung, regeln);
    const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, wahl: e.kaefigWahl }, s.kaefigRegeln ?? []);
    return {
      id: e.id,
      nr: e.katalogNr == null ? null : formatKatalognummer(e),
      tier: e.bezeichnung,
      sparte: e.sparte ?? e.einordnungSparte ?? "",
      art: e.art,
      geschlecht: e.geschlecht,
      alter: e.alter,
      jugend: e.istJugend,
      ringnummern: e.ringnummern ?? "",
      status: e.status,
      meldungStatus: e.meldungStatus,
      kaefig: typ ? kaefigName(typ, s.kaefigMasse) : null,
      kaefigGewaehlt: !!e.kaefigWahl,
      zuechter: { name: e.ausstellerName, ort: e.ort ?? "", verein: e.verein ?? "", gesperrt: !!e.ausstellerGesperrt },
      meldungId: e.meldungId,
      preisrichter: name(zugeteilt),
      bewertung: e.bewertet ? bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skalaVon(s)) : null,
      bewertetVon: name(e.bewertetVon),
      preise: e.preise.map((p) => `${p.kuerzel} ${p.name}`),
      verkauft: e.verkaufBelegNr != null,
    };
  }),

  /** Halle für den Hallenplan festlegen (Maße in cm). */
  halleSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Stand, auf dem die Änderung beruht (halleSchluessel) – weicht er ab, hat inzwischen jemand anders gespeichert. */
        basis: z.string().max(100).optional(),
        halle: HALLE_EINGABE,
        /** Was der Editor getan hat (z. B. „Leeres entfernt“, „Rückgängig“) – für das Protokoll. */
        grund: z.string().trim().max(300).optional(),
        /** „Planung zurücksetzen“: eingesetzte Teile fallen weg, auch belegte (ihre Tiere stellt der neu gerechnete Plan). */
        zuruecksetzen: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [alt] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
        if (input.basis !== undefined && input.basis !== halleSchluessel(alt?.halle ?? null))
          throw fehler("CONFLICT", "Die Halle wurde inzwischen von jemand anderem geändert – der Plan wird neu geladen, bitte die Änderung noch einmal machen.");
        const { entfernt, ...rest } = input.halle;
        const halle: Halle = mitGeprueftemUmriss({ ...rest, plattenMass: input.halle.plattenMass ?? alt?.halle?.plattenMass ?? {}, ...etagenAus(rest.etagen, alt?.halle), ...(entfernt?.length ? { entfernt } : {}) }, s.kaefigMasse, alt?.halle ?? null);
        // Im festen Plan stehen die Platten fest – ein anderer Grundriss geht nur mit „Plan neu setzen“ (wie die Reihenrichtung).
        if (alt?.fest && alt.halle && stabilerText(halleNormal(alt.halle).umriss ?? null) !== stabilerText(halleNormal(halle).umriss ?? null))
          throw fehler("BAD_REQUEST", "Ein anderer Grundriss geht im festen Plan nur mit „Plan neu setzen“.");
        // Neu entfernte Platten und Plätze: nur leere im festen Plan (gerechnet mit den bisher entfernten). Wegfallende
        // Käfigblöcke und Volieren: nur leere (gerechnet mit der bisherigen Halle) – außer beim Zurücksetzen der Planung.
        const neuEntfernt = stabilerText(entfernt ?? []) !== stabilerText(alt?.halle?.entfernt ?? []);
        const teileWeg = !input.zuruecksetzen && (alt?.halle?.objekte ?? []).some((o) => !(halle.objekte ?? []).some((x) => x.id === o.id));
        if (neuEntfernt || teileWeg) {
          const { tiere } = await planTiere(s);
          if (neuEntfernt) {
            const plan = planeHalle({ ...halle, entfernt: alt?.halle?.entfernt }, tiere, s.kaefigMasse, alt?.fest);
            const meldung = pruefeEntfernt(alt?.halle?.entfernt, entfernt, alt?.fest, plan);
            if (meldung) throw fehler("BAD_REQUEST", meldung);
          }
          if (teileWeg && alt?.halle) {
            const meldung = pruefeTeileEntfernt(alt.halle, halle, planeHalle(alt.halle, tiere, s.kaefigMasse, alt.fest));
            if (meldung) throw fehler("BAD_REQUEST", meldung);
          }
        }
        await tx.update(schau).set({ halle }).where(eq(schau.id, s.id));
        // Nur die geänderten Teile ins (unveränderbare) Protokoll – der Editor speichert jede Verschiebung einzeln.
        const vorher = (alt?.halle ?? {}) as Record<string, unknown>;
        const nachher = halle as unknown as Record<string, unknown>;
        // Vergleich mit sortierten Schlüsseln: PostgreSQL ordnet die Schlüssel in jsonb neu.
        const geaendert = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].filter((k) => stabilerText(vorher[k]) !== stabilerText(nachher[k]));
        if (geaendert.length === 0) return;
        await protokolliere(tx, {
          schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Halle",
          alt: alt?.halle ? Object.fromEntries(geaendert.map((k) => [k, vorher[k] ?? null])) : null,
          neu: Object.fromEntries(geaendert.map((k) => [k, nachher[k] ?? null])),
          ...(input.grund ? { grund: input.grund } : {}),
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Einzelreihe an einer Wand (die Ausstellungsleitung hat eine Reihe an die Wand gezogen): dort steht dann eine
   * Einzelreihe, die übrigen Reihen ordnen sich neu (Gänge, auch vor Eingängen, bleiben frei). Von Hand verschobene Reihen
   * bleiben, wo sie stehen; die gezogene Reihe fällt dabei weg (an ihrer Stelle steht die Einzelreihe). Ein fester Plan
   * wird dabei neu gesetzt – nur mit `neuSetzen` (Rückfrage in der Oberfläche).
   */
  wandreiheStellen: adminProcedure
    .input(z.object({ schauId: dbId, basis: z.string().max(100), reihe: z.number().int().min(1).max(500), seite: z.enum(["anfang", "ende"]), neuSetzen: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const { tiere } = await planTiere(s);
      return db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
        const halle = aktuell?.halle;
        if (!halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
        if (input.basis !== halleSchluessel(halle)) throw fehler("CONFLICT", "Die Halle wurde inzwischen von jemand anderem geändert – der Plan wird neu geladen, bitte noch einmal.");
        if (aktuell.fest && !input.neuSetzen) throw fehler("BAD_REQUEST", "Der Plan ist festgeschrieben – erst bestätigen, dass er neu gesetzt wird.");
        const alt = planeHalle(halle, tiere, s.kaefigMasse, aktuell.fest);
        if (!alt.reihen.some((r) => r.nr === input.reihe)) throw fehler("BAD_REQUEST", "Diese Reihe gibt es nicht (mehr) – der Plan wird neu geladen.");
        // Neu gesetzt (siehe `neuSetzen`): Platten nach Nummer, entfernte leere Plätze und eingesetzte Teile gehören zur alten
        // Aufstellung; von Hand verschobene Reihen bleiben, wo sie stehen. Was nicht in die Reihen passt, bekommt Käfigblöcke.
        const basisNeu = mitWandreihe(halleZumNeuSetzen(halle), input.seite);
        const neuPlan = planeHalle(basisNeu, tiere, s.kaefigMasse);
        const reihenVersatz = reihenVersatzNachUmbau(alt, neuPlan, halle.reihenVersatz ?? [], input.reihe, halle);
        const neu = neuSetzen(basisNeu, tiere, s.kaefigMasse, { reihenVersatz }).halle;
        await tx.update(schau).set({ halle: neu, hallenplanFest: null }).where(eq(schau.id, s.id));
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "schau",
          datensatzId: s.id,
          aktion: "Einzelreihe an der Wand",
          alt: { reihe: input.reihe, wandreihen: halle.wandreihen, wandreiheSeite: halle.wandreiheSeite ?? null, reihenVersatz: halle.reihenVersatz ?? [], objekte: halle.objekte ?? [], ...(aktuell.fest ? { fest: aktuell.fest.am, plattenVersatz: halle.plattenVersatz ?? [] } : {}) },
          neu: { seite: input.seite, wandreihen: neu.wandreihen, wandreiheSeite: neu.wandreiheSeite ?? null, reihenVersatz, objekte: neu.objekte ?? [] },
          ...(aktuell.fest ? { grund: "Plan neu gesetzt" } : {}),
          akteur: ctx,
        });
        return { ok: true, neuGesetzt: !!aktuell.fest };
      });
    }),
};
