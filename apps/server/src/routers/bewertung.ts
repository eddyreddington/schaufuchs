import { BAUSTEIN_ART_LISTE, BAUSTEIN_KATEGORIEN, bausteinFuerTier, brauchtObmann, passtZuPreisart, STANDARD_NOTENSKALA } from "@schau/domain";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { beendeSitzung, cookieHeader, COOKIE_RICHTER, geraetNachAnmeldung, geraetSchluessel, neueSitzung, pruefeAuslastung, pruefePasswort } from "../auth";
import { config } from "../config";
import { db } from "../db/client";
import { bewertung, katalogeintrag, preisart, preisrichter, preisvergabe, prEinteilung, schau, textbaustein } from "../db/schema";
import { bewertungEingabe, RICHTER_PHASEN, setzeBewertungZurueck, speichereBewertung } from "../services/bewertung";
import { ladeEintraege, skalaVon } from "../services/eintraege";
import { entfernePreis, vergebePreis } from "../services/preise";
import { Bremse, Wartezeit } from "../services/bremse";
import { kurzerFehler } from "../services/fehlertext";
import { ergaenzeGrundbestand, sperreBausteine, TEXTBAUSTEINE_MAX } from "../services/textbausteine";
import { protokolliere } from "../services/protokoll";
import { kontingente, zuteilung } from "../services/pruefung";
import { adminProcedure, benutzerProcedure, fehler, dbId, ladeSchau, pruefeNachFreigabe, publicProcedure, richterProcedure, router, sqlZustand } from "../trpc";
import { pruefeNichtAbgeschlossen } from "../services/kasse";

// PIN-Anmeldung (8 Ziffern, nur in den Phasen mit Tablet):
// - je Gerät (Adresse) und Preisrichter 8 Fehlversuche in 15 Minuten – ein Vertipper sperrt nicht die ganze Halle,
// - je Adresse insgesamt 60 (gegen Durchprobieren über alle Preisrichter); bekannte Tablets und von der AL freigegebene
//   Preisrichter zählen dabei nicht mit und werden nicht gesperrt,
// - je Preisrichter eine steigende Wartezeit nach 10 Fehlversuchen von fremden Adressen (höchstens 15 Minuten);
//   Tablets, die schon angemeldet waren, betrifft sie nicht. Die AL hebt sie auf („Sperre aufheben“ oder neue PIN).
// Ein Tablet, an dem sich der Preisrichter schon angemeldet hat, erkennt der Server am Gerätekennzeichen (Cookie,
// Entscheidung 036): Für es gilt eine eigene Bremse statt der Adresse – Fremde im selben Hallen-WLAN sperren es nicht aus.
export const pinBremse = new Bremse(8, 15 * 60_000, "Zu viele Fehlversuche. Bitte 15 Minuten warten oder bei der Ausstellungsleitung eine neue PIN holen.");
export const pinBremseJeAdresse = new Bremse(60, 15 * 60_000, "Zu viele Fehlversuche von diesem Netz. Bitte 15 Minuten warten.");
export const pinWartezeitJeRichter = new Wartezeit(
  10,
  15 * 60_000,
  60 * 60_000,
  (min) => `Zu viele Fehlversuche für diesen Preisrichter. Bitte bis zu ${min} Minute${min === 1 ? "" : "n"} warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben.`,
);

/** Bewertung am PC (Nachtragen von Papierkarten, Korrekturen nach Reklamation). */
export const bewertungRouter = router({
  liste: benutzerProcedure
    .input(z.object({ schauId: dbId, preisrichterId: dbId.nullable().default(null) }))
    .query(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const [eintraege, einteilung, richter] = await Promise.all([
        ladeEintraege(s.id, { nurBestaetigt: true }),
        db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
        db.select({ id: preisrichter.id, name: preisrichter.name, istObmann: preisrichter.istObmann }).from(preisrichter).where(eq(preisrichter.schauId, s.id)),
      ]);
      const zu = zuteilung(eintraege, einteilung);
      const skala = skalaVon(s);
      return {
        skala: skala ?? STANDARD_NOTENSKALA,
        richter,
        freigegeben: s.ergebnisseFreigegeben,
        phase: s.phase,
        tabletOffen: RICHTER_PHASEN.includes(s.phase) && !s.ergebnisseFreigegeben,
        eintraege: eintraege
          .filter((e) => e.katalogNr != null && (input.preisrichterId == null || zu.get(e.id) === input.preisrichterId))
          .map((e) => ({
            ...e,
            preisrichterId: zu.get(e.id) ?? null,
            obmannOffen: brauchtObmann({ punkte: e.punkte, sondernote: e.sondernote }, skala) && !e.obmannBestaetigtAm,
          })),
      };
    }),

  setzen: adminProcedure
    .input(bewertungEingabe.extend({ schauId: dbId, grund: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      pruefeNachFreigabe(pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId)), ctx.benutzer);
      const r = await db.transaction((tx) =>
        speichereBewertung(tx, input, { akteur: ctx, preisrichterId: null, quelle: "pc", istAL: true, grund: input.grund, schauId: input.schauId }),
      );
      if (r.status === "fehler") throw fehler("BAD_REQUEST", r.meldung);
      if (r.status === "veraltet") throw fehler("CONFLICT", "Die Note wurde inzwischen anderswo geändert (z. B. am Tablet). Bitte die Seite neu laden und prüfen.");
      return r;
    }),

  /** Nimmt eine Bewertung zurück, damit das Tier neu bewertet werden kann. */
  zuruecksetzen: adminProcedure
    .input(z.object({ schauId: dbId, katalogeintragId: dbId, grund: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      pruefeNachFreigabe(pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId)), ctx.benutzer);
      return db.transaction((tx) =>
        setzeBewertungZurueck(tx, input.katalogeintragId, { akteur: ctx, preisrichterId: null, quelle: "pc", istAL: true, grund: input.grund, schauId: input.schauId }),
      );
    }),

  /** Obmann-Bestätigung, die die Ausstellungsleitung im Auftrag des Obmanns einträgt. */
  obmannBestaetigen: adminProcedure
    .input(z.object({ schauId: dbId, katalogeintragId: dbId, obmannId: dbId, /** Stand, den die Seite angezeigt hat. */ version: z.number().int().min(0).max(2_147_483_647).optional() }))
    .mutation(async ({ ctx, input }) => {
      pruefeNachFreigabe(pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId)), ctx.benutzer);
      const [o] = await db.select().from(preisrichter).where(eq(preisrichter.id, input.obmannId));
      if (!o || o.schauId !== input.schauId) throw fehler("BAD_REQUEST", "Preisrichter nicht gefunden.");
      // Ein normaler Preisrichter bestätigt nur, wenn die Note vom einzigen Obmann stammt (sonst bliebe die Freigabe blockiert).
      await bestaetige(input.schauId, input.katalogeintragId, o.id, { benutzer: ctx.benutzer }, o.istObmann, input.version);
      return { ok: true };
    }),

  textbausteine: benutzerProcedure.query(({ ctx }) =>
    db
      .select()
      .from(textbaustein)
      .where(eq(textbaustein.organisationId, ctx.benutzer.organisationId))
      .orderBy(asc(textbaustein.gruppe), asc(textbaustein.kategorie), asc(textbaustein.id)),
  ),

  textbausteinSpeichern: adminProcedure
    .input(
      z.object({
        kategorie: z.enum(BAUSTEIN_KATEGORIEN),
        text: z.string().trim().min(2).max(120),
        gruppe: z.string().trim().min(2, "Bitte ein Merkmal angeben.").max(40),
        art: z.enum(BAUSTEIN_ART_LISTE as [string, ...string[]]),
        /** Optional nur für diese Rasse (Name wie im Verzeichnis). */
        rasse: z.string().trim().max(100).nullish().transform((r) => r || null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await sperreBausteine(tx, ctx.benutzer.organisationId);
        const [schon] = await tx
          .select({ id: textbaustein.id })
          .from(textbaustein)
          .where(and(eq(textbaustein.organisationId, ctx.benutzer.organisationId), eq(textbaustein.kategorie, input.kategorie), eq(textbaustein.gruppe, input.gruppe), eq(textbaustein.art, input.art), eq(textbaustein.text, input.text), input.rasse ? sql`lower(${textbaustein.rasse}) = lower(${input.rasse})` : isNull(textbaustein.rasse)));
        if (schon) throw fehler("CONFLICT", "Diesen Textbaustein gibt es schon.");
        const [anzahl] = await tx.select({ n: sql<number>`count(*)::int` }).from(textbaustein).where(eq(textbaustein.organisationId, ctx.benutzer.organisationId));
        if ((anzahl?.n ?? 0) >= TEXTBAUSTEINE_MAX) throw fehler("BAD_REQUEST", `Es gibt schon ${TEXTBAUSTEINE_MAX} Textbausteine – bitte erst nicht benötigte löschen.`);
        await tx.insert(textbaustein).values({ ...input, organisationId: ctx.benutzer.organisationId });
      });
      return { ok: true };
    }),

  /** Fehlende Bausteine aus dem Grundbestand übernehmen – eigene bleiben unverändert, nichts wird gelöscht. */
  textbausteinGrundbestand: adminProcedure.mutation(async ({ ctx }) => ({ neu: await ergaenzeGrundbestand(ctx.benutzer.organisationId) })),

  textbausteinLoeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    await db.delete(textbaustein).where(and(eq(textbaustein.id, input.id), eq(textbaustein.organisationId, ctx.benutzer.organisationId)));
    return { ok: true };
  }),
});

async function bestaetige(
  schauId: number,
  katalogeintragId: number,
  obmannId: number,
  akteur: Parameters<typeof protokolliere>[1]["akteur"],
  istObmann = true,
  /** Stand, den der Obmann gesehen hat – eine inzwischen geänderte Note bestätigt er nicht ungesehen. */
  version?: number,
) {
  // In einer Transaktion mit gesperrter Tierzeile: zwischen Prüfen der Version und Bestätigen kommt keine neue Note
  // dazwischen (die Bewertung sperrt dieselbe Zeile).
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(schau).where(eq(schau.id, schauId));
    const [treffer] = await tx
      .select({ b: bewertung, version: katalogeintrag.bewertungVersion, nr: katalogeintrag.katalogNr })
      .from(katalogeintrag)
      .innerJoin(bewertung, eq(bewertung.katalogeintragId, katalogeintrag.id))
      .where(and(eq(katalogeintrag.id, katalogeintragId), eq(katalogeintrag.schauId, schauId)))
      .for("update", { of: katalogeintrag });
    const b = treffer?.b;
    if (!s || !b || !brauchtObmann(b, skalaVon(s))) throw fehler("BAD_REQUEST", "Für dieses Tier ist keine Obmann-Bestätigung nötig.");
    if (version !== undefined && version !== treffer.version) throw fehler("CONFLICT", "Die Note wurde inzwischen geändert – bitte neu laden und erneut prüfen.");
    // Die Bestätigung ist eine zweite Meinung: die eigene Note bestätigt ein Obmann nicht selbst. Bewertet hat der
    // Preisrichter der Note – bei einer am PC nachgetragenen Papierkarte der, dem das Tier zugeteilt ist.
    const nr = treffer.nr;
    const zugeteilt = nr == null ? null : (await tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, schauId))).find((x) => nr >= x.vonNr && nr <= x.bisNr)?.preisrichterId;
    const bewertender = b.preisrichterId ?? zugeteilt ?? null;
    if (bewertender === obmannId) {
      throw fehler("BAD_REQUEST", "Die eigene Bewertung kann der Obmann nicht selbst bestätigen. Bitte einen zweiten Obmann eintragen (Seite Preisrichter) oder die Ausstellungsleitung bestätigen lassen – im Auftrag eines anderen Preisrichters.");
    }
    if (!istObmann) {
      // Ausnahme für kleine Schauen: Gibt es außer dem Bewertenden keinen Obmann, darf ein anderer Preisrichter bestätigen.
      const obleute = await tx.select({ id: preisrichter.id }).from(preisrichter).where(and(eq(preisrichter.schauId, schauId), eq(preisrichter.istObmann, true)));
      if (obleute.some((o) => o.id !== bewertender)) throw fehler("BAD_REQUEST", "Bestätigen darf nur ein Obmann – es gibt einen weiteren Obmann.");
    }
    await tx.update(bewertung).set({ obmannBestaetigtVon: obmannId, obmannBestaetigtAm: new Date() }).where(eq(bewertung.id, b.id));
    await protokolliere(tx, { schauId, tabelle: "bewertung", datensatzId: katalogeintragId, aktion: "Obmann bestätigt", neu: { punkte: b.punkte }, akteur });
  });
}

/**
 * Vorübergehende Störung der Datenbank (Verbindung, Ressourcen, Verklemmung, zu langes Warten auf eine Sperre – 55P03,
 * lock_timeout, Entscheidung 033) – lohnt einen späteren Versuch.
 */
function voruebergehend(e: unknown): boolean {
  const code = sqlZustand(e) || String((e as { cause?: { code?: unknown } })?.cause?.code ?? (e as { code?: unknown })?.code ?? "");
  return /^(08|53|57P|55P03|40001|40P01)|^(CONNECTION_|CONNECT_TIMEOUT|ECONNREFUSED|ECONNRESET|ETIMEDOUT)/.test(code);
}

/** Alles, was der Preisrichter am Tablet braucht. Tiere sind anonym: keine Ausstellernamen. */
async function richterDaten(richterId: number, schauId: number, istObmann: boolean) {
  const [s] = await db.select().from(schau).where(eq(schau.id, schauId));
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  const [eintraege, einteilung, richter, arten, bausteine] = await Promise.all([
    ladeEintraege(schauId, { nurBestaetigt: true }),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, schauId)),
    db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, schauId)),
    db.select().from(preisart).where(eq(preisart.schauId, schauId)).orderBy(asc(preisart.folge)),
    db.select().from(textbaustein).where(eq(textbaustein.organisationId, s.organisationId)),
  ]);
  const zu = zuteilung(eintraege, einteilung);
  const skala = skalaVon(s);
  const anonym = (e: (typeof eintraege)[number]) => ({
    id: e.id,
    katalogNr: e.katalogNr,
    suffix: e.suffix,
    kaefig: e.kaefig,
    sparte: e.sparte,
    bezeichnung: e.bezeichnung,
    art: e.art,
    geschlecht: e.geschlecht,
    alter: e.alter,
    fehlt: e.status === "fehlt",
    istJugend: e.istJugend,
    punkte: e.punkte,
    sondernote: e.sondernote,
    /** Rasse (auch bei freier Bezeichnung die gewählte) – für Bausteine, die nur für eine Rasse gelten. */
    rasse: e.rasse ?? e.einordnungRasse ?? null,
    vorzuege: e.vorzuege ?? "",
    wuensche: e.wuensche ?? "",
    maengel: e.maengel ?? "",
    obmannBestaetigt: !!e.obmannBestaetigtAm,
    /** Stand am Server – das Tablet schickt ihn beim Speichern mit (Konflikterkennung ohne Geräteuhr). */
    version: e.bewertungVersion ?? null,
    preise: e.preise.map((p) => ({ id: p.preisartId, kuerzel: p.kuerzel })),
    /** Preisarten, deren Bindung (Jugend/Senioren, Sparte) zu diesem Tier passt. */
    preisartenErlaubt: arten.filter((a) => a.quelle === "standgeld" && passtZuPreisart(a, e)).map((a) => a.id),
  });
  const meine = eintraege.filter((e) => zu.get(e.id) === richterId);
  const k = kontingente(eintraege, zu, richter, arten, s.kontingentJe).find((x) => s.kontingentJe === "schau" || x.preisrichterId === richterId);
  return {
    schau: { id: s.id, name: s.name, phase: s.phase, freigegeben: s.ergebnisseFreigegeben, offen: RICHTER_PHASEN.includes(s.phase) && !s.ergebnisseFreigegeben },
    skala: skala ?? STANDARD_NOTENSKALA,
    tiere: meine.map(anonym),
    // Nur Kontingente aus dem Standgeld: Zusatzpreise gestifteter Preisarten vergibt die Ausstellungsleitung.
    kontingent: (k?.arten ?? []).filter((a) => !a.zusatz),
    preisarten: arten.filter((a) => a.quelle === "standgeld").map((a) => ({ id: a.id, kuerzel: a.kuerzel, name: a.name, mindestpunkte: a.mindestpunkte })),
    // Nur Bausteine, die zu den Tieren dieses Preisrichters passen (das Tablet holt die Daten regelmäßig neu).
    textbausteine: bausteine
      .filter((b) => meine.some((e) => bausteinFuerTier(b, { sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, bezeichnung: e.bezeichnung })))
      .sort((x, y) => x.gruppe.localeCompare(y.gruppe, "de") || x.kategorie.localeCompare(y.kategorie) || x.id - y.id)
      .map((b) => ({ kategorie: b.kategorie, text: b.text, gruppe: b.gruppe, art: b.art, rasse: b.rasse })),
    // Ohne die eigenen Noten: die bestätigt ein Obmann nicht selbst.
    obmannListe: istObmann
      ? eintraege
          .filter((e) => brauchtObmann({ punkte: e.punkte, sondernote: e.sondernote }, skala) && !e.obmannBestaetigtAm && e.bewertetVon !== richterId && !(e.bewertetVon == null && zu.get(e.id) === richterId))
          .map(anonym)
      : [],
  };
}

/** Schnittstelle für das Preisrichter-Tablet. */
export const richterRouter = router({
  anmeldeInfo: publicProcedure.input(z.object({ slug: z.string().max(100) })).query(async ({ input }) => {
    const [s] = await db.select().from(schau).where(eq(schau.slug, input.slug));
    if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
    // Namen der Preisrichter erst, wenn am Tablet bewertet wird (vorher und nach der Schau nicht öffentlich).
    const offen = RICHTER_PHASEN.includes(s.phase);
    const richter = offen ? await db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)) : [];
    // abgeschlossen: Das Tablet löscht dann seine gespeicherten Daten dieser Schau (Tierliste, Bausteine).
    return { name: s.name, richter, offen, abgeschlossen: s.phase === "abgeschlossen", slug: s.slug };
  }),

  anmelden: publicProcedure
    // 8 Ziffern (ältere 6-stellige PINs: bitte unter „Preisrichter“ neu erzeugen).
    .input(z.object({ slug: z.string().max(100), preisrichterId: dbId, pin: z.string().regex(/^\d{8}$/, "Die PIN hat 8 Ziffern.") }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await db
        .select({ r: preisrichter, slug: schau.slug, phase: schau.phase })
        .from(preisrichter)
        .innerJoin(schau, eq(schau.id, preisrichter.schauId))
        .where(eq(preisrichter.id, input.preisrichterId));
      if (!r || r.slug !== input.slug || !r.r.pinHash) throw fehler("UNAUTHORIZED", "PIN stimmt nicht.");
      // Vor der Einlieferung und nach den Preisen gibt es am Tablet nichts zu tun – dann auch keine Anmeldung
      // (sonst ließe sich die PIN über Wochen verteilt durchprobieren).
      if (!RICHTER_PHASEN.includes(r.phase)) throw fehler("FORBIDDEN", "Die Anmeldung am Tablet ist nur von der Einlieferung bis zu den Preisen möglich.");
      // Erst alle Bremsen prüfen, dann zählen (vor der PIN-Prüfung – parallele Anfragen kommen so nicht vorbei): ein
      // abgewiesener Versuch verbraucht keinen Zähler einer anderen Stufe, sonst sperrten sie am Ende die ganze Halle.
      pruefeAuslastung();
      const kRichter = `pr:${r.r.id}:alle`;
      const geraet = geraetSchluessel(ctx.cookieTokens.geraet);
      const bekanntesGeraet = !!geraet && pinWartezeitJeRichter.istBekannt(kRichter, geraet);
      const herkunft = bekanntesGeraet ? geraet : ctx.ip;
      const kGeraet = [`pr:${r.r.id}:ip:${herkunft}`];
      const kAdresse = [`ip:${ctx.ip}`];
      const ohneAdressSperre = bekanntesGeraet || pinWartezeitJeRichter.istAusgenommen(kRichter, ctx.ip);
      pinBremse.pruefe(kGeraet);
      if (!ohneAdressSperre) pinBremseJeAdresse.pruefe(kAdresse);
      pinWartezeitJeRichter.pruefe(kRichter, herkunft);
      const zurueckGeraet = pinBremse.versuch(kGeraet);
      const zurueckAdresse = ohneAdressSperre ? () => {} : pinBremseJeAdresse.versuch(kAdresse);
      const zurueckRichter = pinWartezeitJeRichter.versuch(kRichter, herkunft);
      let ok = false;
      try {
        ok = await pruefePasswort(input.pin, r.r.pinHash);
      } catch (e) {
        zurueckGeraet();
        zurueckAdresse();
        zurueckRichter(false);
        throw e;
      }
      if (!ok) throw fehler("UNAUTHORIZED", "PIN stimmt nicht.");
      zurueckGeraet();
      zurueckAdresse();
      zurueckRichter(true);
      pinWartezeitJeRichter.merke(kRichter, ctx.ip);
      pinWartezeitJeRichter.merke(kRichter, geraetNachAnmeldung(ctx));
      ctx.setCookie(cookieHeader(await neueSitzung({ preisrichterId: r.r.id }), config.sessionDays * 86_400, COOKIE_RICHTER));
      return { ok: true };
    }),

  abmelden: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.cookieTokens.richter) await beendeSitzung(ctx.cookieTokens.richter);
    ctx.setCookie(cookieHeader("", 0, COOKIE_RICHTER));
    return { ok: true };
  }),

  daten: richterProcedure.query(({ ctx }) => richterDaten(ctx.richter.id, ctx.richter.schauId, ctx.richter.istObmann)),

  /** Nimmt die auf dem Tablet gesammelten Bewertungen entgegen (auch nach längerer Offline-Zeit). */
  abgleich: richterProcedure.input(z.object({ bewertungen: z.array(bewertungEingabe).max(2000) })).mutation(async ({ ctx, input }) => {
    const [einteilung, eintraege] = await Promise.all([
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, ctx.richter.schauId)),
      ladeEintraege(ctx.richter.schauId, { nurBestaetigt: true }),
    ]);
    const zu = zuteilung(eintraege, einteilung);
    const ergebnisse = [];
    for (const b of input.bewertungen) {
      if (zu.get(b.katalogeintragId) !== ctx.richter.id) {
        ergebnisse.push({ katalogeintragId: b.katalogeintragId, status: "fehler" as const, meldung: "Tier ist Ihnen nicht zugeteilt." });
        continue;
      }
      // Jeder Eintrag für sich: ein unerwarteter Fehler bei einem Tier hält die übrigen nicht auf.
      try {
        ergebnisse.push(
          await db.transaction((tx) =>
            speichereBewertung(tx, b, { akteur: { richter: ctx.richter }, preisrichterId: ctx.richter.id, quelle: "tablet", istAL: false, schauId: ctx.richter.schauId }),
          ),
        );
      } catch (e) {
        console.error("[tablet] Bewertung nicht gespeichert:", kurzerFehler(e));
        // Datenbank kurz nicht erreichbar, Verklemmung u. Ä.: das Tablet behält den Eintrag und sendet später erneut.
        // Alles andere (z. B. unzulässige Zeichen im Text) bleibt ein Fehler, den der Preisrichter sehen muss.
        ergebnisse.push(
          voruebergehend(e)
            ? { katalogeintragId: b.katalogeintragId, status: "spaeter" as const, meldung: "Server vorübergehend gestört – wird erneut gesendet." }
            : { katalogeintragId: b.katalogeintragId, status: "fehler" as const, meldung: "Interner Fehler beim Speichern – bitte der Ausstellungsleitung melden." },
        );
      }
    }
    return { ergebnisse };
  }),

  /** Der Preisrichter nimmt seine Bewertung zurück (nur mit Verbindung, nur bis zur Freigabe). */
  zuruecksetzen: richterProcedure.input(z.object({ katalogeintragId: dbId, basisVersion: z.number().int().min(0).max(2_147_483_647).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const [einteilung, eintraege] = await Promise.all([
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, ctx.richter.schauId)),
      ladeEintraege(ctx.richter.schauId, { nurBestaetigt: true }),
    ]);
    if (zuteilung(eintraege, einteilung).get(input.katalogeintragId) !== ctx.richter.id) throw fehler("FORBIDDEN", "Tier ist Ihnen nicht zugeteilt.");
    return db.transaction((tx) =>
      setzeBewertungZurueck(tx, input.katalogeintragId, { akteur: { richter: ctx.richter }, preisrichterId: ctx.richter.id, quelle: "tablet", istAL: false, schauId: ctx.richter.schauId }, input.basisVersion),
    );
  }),

  preisVergeben: richterProcedure.input(z.object({ katalogeintragId: dbId, preisartId: dbId })).mutation(async ({ ctx, input }) => {
    await db.transaction((tx) =>
      vergebePreis(tx, { ...input, schauId: ctx.richter.schauId, preisrichterId: ctx.richter.id, akteur: { richter: ctx.richter }, istAL: false }),
    );
    return { ok: true };
  }),

  preisEntfernen: richterProcedure.input(z.object({ katalogeintragId: dbId, preisartId: dbId })).mutation(async ({ ctx, input }) => {
    const [p] = await db
      .select()
      .from(preisvergabe)
      .where(and(eq(preisvergabe.katalogeintragId, input.katalogeintragId), eq(preisvergabe.preisartId, input.preisartId)));
    if (!p) throw fehler("NOT_FOUND", "Preis nicht gefunden.");
    await db.transaction((tx) =>
      entfernePreis(tx, { schauId: ctx.richter.schauId, preisvergabeId: p.id, preisrichterId: ctx.richter.id, akteur: { richter: ctx.richter }, istAL: false }),
    );
    return { ok: true };
  }),

  obmannBestaetigen: richterProcedure.input(z.object({ katalogeintragId: dbId, version: z.number().int().min(0).max(2_147_483_647).optional() })).mutation(async ({ ctx, input }) => {
    if (!ctx.richter.istObmann) throw fehler("FORBIDDEN", "Nur der Obmann kann bestätigen.");
    // Wie bei Noten: am Tablet nur in den Bewertungsphasen und bis zur Freigabe.
    const [s] = await db.select().from(schau).where(eq(schau.id, ctx.richter.schauId));
    if (!s || s.ergebnisseFreigegeben || !RICHTER_PHASEN.includes(s.phase)) {
      throw fehler("BAD_REQUEST", "Bewertung ist geschlossen. Änderungen nur über die Ausstellungsleitung.");
    }
    await bestaetige(ctx.richter.schauId, input.katalogeintragId, ctx.richter.id, { richter: ctx.richter }, true, input.version);
    return { ok: true };
  }),
});
