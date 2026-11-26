import { verzeichnisVorschlaegeZwischengespeichert } from "../services/vereinsverzeichnis";
import { adressVorschlaege, bewertungsText, datenschutzAbschnitte, datenschutzKurz, datumIn, fehlendeVereinsangaben, heuteBerlin, impressumAbschnitte, istJugendBlock, istJugendlich, JUGEND_ALTERSGRENZE, jugendKennzeichen, MELDEARTEN, mitVerzeichnis, NUR_LESEN_MELDUNG, onlineAbgelaufen, SPRACHEN, teilschauenLesen, texte, type Sprache } from "@schau/domain";
import { heuteDe } from "../services/tiergesundheit";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, type Tx } from "../db/client";
import { aussteller, gebuehr, meldung, schau } from "../db/schema";
import { ladeVereinsangaben } from "../services/datenschutz";
import { ladeEintraege, meldebetrag, skalaVon, verdeckeNamen } from "../services/eintraege";
import { ausstellerEingabe, positionEingabe, registriernummerFeld, speichereMeldung, sperreOnlineMeldung } from "../services/meldung";
import { anschlussSchluessel, Bremse, istLokaleAdresse, netz48Schluessel } from "../services/bremse";
import { sendeMail } from "../services/post";
import { protokolliere } from "../services/protokoll";
import { belegteKaefige, ONLINE_RESERVIERUNG_STUNDEN } from "../services/pruefung";
import { fehler, publicProcedure, router } from "../trpc";
import { anrede, eingangsText, meldungsLink } from "./meldung";
import { sucheFarbenschlag } from "./stammdaten";
import { oeffentlicherStand } from "../services/zwischenspeicher";
import { ausstellerDerSchau, sperreTestschauGeteilt } from "../services/testschau";
import { bankAngabe, ueberweisung } from "../services/ueberweisung";

async function ladeOeffentlich(slug: string) {
  const [s] = await db.select().from(schau).where(eq(schau.slug, slug));
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  return s;
}

/** Heute in deutscher Zeit als JJJJ-MM-TT – der Meldeschluss gilt bis Tagesende. */
function heute(): string {
  return heuteBerlin();
}

/** Sprache der Seiten für Aussteller (Entscheidung 020); fehlt sie, Deutsch. */
const spracheFeld = z.enum(SPRACHEN).default("de");

async function meldungOffen(s: typeof schau.$inferSelect, sprache: Sprache = "de", ex: Pick<Tx, "select"> = db) {
  const t = texte(sprache).schau;
  if (s.abgesagtAm) return { offen: false, grund: t.abgesagt(s.absageGrund) };
  if (s.phase !== "meldung") return { offen: false, grund: t.meldungZu };
  if (s.meldeschluss && heute() > s.meldeschluss) return { offen: false, grund: t.meldeschlussVorbei };
  if (s.kapazitaet && (await belegteKaefige(s.id, ex)) >= s.kapazitaet) return { offen: false, grund: t.hallenVoll };
  return { offen: true, grund: "" };
}

// Bremsen gegen Missbrauch des offenen Formulars: je IP höchstens 20 Meldungen pro Stunde,
// je Empfängeradresse höchstens 10 Bestätigungsmails am Tag (sonst ließe sich die Schau als Mail-Versender nutzen).
// Gezählt wird vor dem Speichern (gleichzeitige Anfragen kommen so nicht vorbei); scheitert die Meldung, wird der
// Versuch zurückgegeben – Eingabefehler sperren niemanden aus.
const sucheJeAnschluss = new Bremse(120, 60_000, "Zu viele Suchanfragen. Bitte einen Moment warten.");
/** Zweite Stufe je IPv6-/48: sonst hätte ein /48 das 256-Fache der Grenze je /56. */
const sucheJeNetz = new Bremse(600, 60_000, "Zu viele Suchanfragen. Bitte einen Moment warten.");
/** Abrufe der Schau-Seite (mit Vereinsvorschlägen): viel mehr als ein Mensch braucht, aber keine Dauerlast. */
// Ein Abruf kostet dank Zwischenspeicher nur wenige Millisekunden; viele Besucher teilen sich oft einen Anschluss (Hallen-WLAN).
const seiteJeAnschluss = new Bremse(600, 60_000, "Zu viele Anfragen. Bitte einen Moment warten.");
const seiteJeNetz = new Bremse(3000, 60_000, "Zu viele Anfragen. Bitte einen Moment warten.");
const meldungenJeIp = new Bremse(20, 3_600_000, "Zu viele Meldungen. Bitte später erneut versuchen.");
const mailsJeAdresse = new Bremse(10, 86_400_000, "An diese E-Mail-Adresse wurden heute schon viele Bestätigungen geschickt. Bitte morgen erneut versuchen oder die Ausstellungsleitung fragen.");
// Ein Anschluss belegt online höchstens die halbe Halle (mindestens 30 Tiere) – so lange, wie eine unbezahlte Meldung
// reserviert bleibt. Sonst füllen wenige Anfragen von einem Anschluss die ganze Halle. Eine Familie oder ein Vereinsheim
// kommt darunter gut aus; mehr trägt die AL von Hand ein. Die Obergrenze kommt je Aufruf (nach Hallengröße).
const tiereJeAnschluss = new Bremse(30, ONLINE_RESERVIERUNG_STUNDEN * 3_600_000, "Von dieser Adresse wurden schon viele Tiere gemeldet. Weitere Meldungen bitte über die Ausstellungsleitung.");
/** Dieselbe Grenze je IPv6-/48: ein /48 (ein Standort) hat sonst 256 Anschlüsse zu je einer halben Halle. */
const tiereJeNetz = new Bremse(30, ONLINE_RESERVIERUNG_STUNDEN * 3_600_000, "Von dieser Adresse wurden schon viele Tiere gemeldet. Weitere Meldungen bitte über die Ausstellungsleitung.");
/** Wer im Protokoll ohne Anmeldung über das Formular bzw. den Link aus der Mail handelt. */
export const AKTEUR_ONLINE = "Aussteller (online)";
export const ONLINE_WIDERRUFEN = "Online-Veröffentlichung widerrufen";
/** Kennung der Sperre für gleichzeitige Meldungen mit derselben E-Mail (Doppelklick). */
const MELDUNG_SPERRE = 0x4d454c44; // "MELD"

const meldeEingabe = z.object({
  slug: z.string().max(100),
  aussteller: ausstellerEingabe.omit({ id: true, istPreisrichter: true }).extend({
    email: z.string().max(200).trim().email("Bitte eine gültige E-Mail-Adresse angeben."),
    registriernummer: z.string().trim().min(1, "Die Registriernummer (Viehverkehrsordnung) ist Pflicht.").pipe(registriernummerFeld),
  }),
  istJugend: z.boolean(),
  /** Teilschau, wenn die Schau welche hat (Kennung); fehlt bzw. null = die erste. */
  teilschau: z.string().max(10).nullable().default(null),
  istPreisrichter: z.boolean(),
  positionen: z.array(positionEingabe).min(1, "Bitte mindestens ein Tier melden.").max(200),
  zustimmung: z.literal(true, { error: "Bitte die AAB und die Sonderbestimmungen anerkennen." }),
  /** Freiwillig und getrennt von den AAB: Name, Wohnort und Verein im Internet. */
  onlineVeroeffentlichung: z.boolean().default(false),
  erziehungsberechtigter: z.string().trim().max(200).default(""),
  /** Pflichterklärungen der Schau (Herkunft nicht aus Sperrgebiet, Karenzzeit) – alle angekreuzt. */
  erklaerungen: z.boolean().default(false),
  stiftung: z.object({ betragCent: z.number().int().min(0).max(10_000_000), vorgabe: z.string().max(200) }).nullable(),
  /** Freiwillige Spende für die Ausstellung; „nennen“: Name im Katalog als Spender (Einwilligung). */
  spende: z.object({ betragCent: z.number().int().min(0).max(1_000_000), nennen: z.boolean() }).nullable().default(null),
  bemerkung: z.string().max(1000),
  /** Sprache des Formulars: Fehlermeldungen und Bestätigungsmail, gespeichert an der Meldung. */
  sprache: spracheFeld,
});
type MeldeInput = z.infer<typeof meldeEingabe>;

export const oeffentlichRouter = router({
  schau: publicProcedure.input(z.object({ slug: z.string().max(100), sprache: spracheFeld })).query(async ({ ctx, input }) => {
    // Die Seite lädt einmal; massenhaftes Abrufen (Last) wird gebremst wie die Suche.
    if (!istLokaleAdresse(ctx.ip)) {
      const netz = netz48Schluessel(ctx.ip);
      if (netz) seiteJeNetz.pruefe([netz]);
      seiteJeAnschluss.versuch([anschlussSchluessel(ctx.ip)]);
      if (netz) seiteJeNetz.versuch([netz]);
    }
    const s = await ladeOeffentlich(input.slug);
    const [gebuehren, offen, verein, vereinsZeilen] = await Promise.all([
      db.select().from(gebuehr).where(eq(gebuehr.schauId, s.id)),
      meldungOffen(s, input.sprache),
      ladeVereinsangaben(s.organisationId),
      // Nur Verein und Kreisverband bisheriger Aussteller – keine Namen, keine Adressen. Nur aus bestätigten Meldungen
      // (keine anonym eingeschleusten oder abgelehnten Texte) und höchstens 100 Zeichen lang.
      db
        .selectDistinct({ verein: aussteller.verein, kreisverband: aussteller.kreisverband })
        .from(aussteller)
        .where(
          and(
            eq(aussteller.organisationId, s.organisationId),
            ausstellerDerSchau(s),
            isNull(aussteller.geloeschtAm),
            isNull(aussteller.gesperrtAm),
            ne(aussteller.verein, ""),
            sql`char_length(${aussteller.verein}) <= 100`,
            sql`exists (select 1 from meldung mb where mb.aussteller_id = ${aussteller.id} and mb.status = 'bestaetigt')`,
          ),
        )
        .limit(500)
        .then((l) => l.map((x) => ({ verein: x.verein, kreisverband: x.kreisverband.length <= 100 ? x.kreisverband : "" }))),
    ]);
    // Dazu die Vereine aus dem Vereinsverzeichnis (öffentliche Namen, kein Personenbezug); eigene Angaben gehen vor.
    const vorschlag = mitVerzeichnis(vereinsZeilen, await verzeichnisVorschlaegeZwischengespeichert());
    return {
      verein: verein.name,
      datenschutzKurz: datenschutzKurz(verein, input.sprache),
      name: s.name,
      /** Testschau: Hinweis auf der Seite (keine echte Ausstellung). */
      test: s.test,
      veranstalter: s.veranstalter,
      ort: s.ort,
      meldeschluss: s.meldeschluss,
      einlieferung: s.einlieferung,
      bewertungAm: s.bewertungAm,
      oeffnungszeiten: s.oeffnungszeiten,
      aussetzen: s.aussetzen,
      bestimmungen: s.bestimmungen,
      erklaerungen: s.erklaerungen.split("\n").map((z) => z.trim()).filter(Boolean),
      bankverbindung: bankAngabe(s),
      zahlungBeiEinlieferung: s.zahlungBeiEinlieferung,
      /** Für die Anzeige der Käfiggröße je Meldezeile. */
      kaefigRegeln: s.kaefigRegeln ?? [],
      kaefigMasse: s.kaefigMasse ?? {},
      /** Teilschauen zur Auswahl im Formular (leer: keine Auswahl). */
      teilschauen: teilschauenLesen(s.teilschauen),
      /** Vorschläge im Formular: Vereine (mit eindeutigem Kreisverband) und Kreisverbände. */
      vereine: vorschlag.vereine,
      kreisverbaende: vorschlag.kreisverbaende,
      kontaktEmail: s.kontaktEmail,
      stammdatenVersionId: s.stammdatenVersionId,
      gebuehren: gebuehren.filter((g) => g.betragCent > 0),
      meldung: offen,
      // Nach der Veröffentlichungsfrist (Datenschutzhinweise) nicht mehr im Internet.
      ergebnisse: s.ergebnisseFreigegeben && !onlineAbgelaufen(s.bewertungAm, heuteDe()),
      katalog: (s.katalogGedruckt || s.ergebnisseFreigegeben) && !onlineAbgelaufen(s.bewertungAm, heuteDe()),
    };
  }),

  /** Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) des ausrichtenden Vereins. */
  rechtstexte: publicProcedure.input(z.object({ slug: z.string().max(100) })).query(async ({ input }) => {
    const s = await ladeOeffentlich(input.slug);
    const v = await ladeVereinsangaben(s.organisationId);
    return { schau: s.name, test: s.test, verein: v.name, vollstaendig: fehlendeVereinsangaben(v).length === 0, impressum: impressumAbschnitte(v), datenschutz: datenschutzAbschnitte(v) };
  }),

  farbenschlagSuche: publicProcedure.input(z.object({ slug: z.string(), q: z.string().max(80) })).query(async ({ ctx, input }) => {
    // Tippen im Meldeformular braucht wenige Anfragen; massenhaftes Auslesen oder Lasterzeugen wird gebremst.
    if (!istLokaleAdresse(ctx.ip)) {
      const netz = netz48Schluessel(ctx.ip);
      // Erst beide Grenzen prüfen, dann zählen: eine abgewiesene Anfrage verbraucht keinen Zähler der anderen Stufe.
      if (netz) sucheJeNetz.pruefe([netz]);
      sucheJeAnschluss.versuch([anschlussSchluessel(ctx.ip)]);
      if (netz) sucheJeNetz.versuch([netz]);
    }
    const s = await ladeOeffentlich(input.slug);
    if (!s.stammdatenVersionId || input.q.trim().length < 2) return [];
    return sucheFarbenschlag(s.stammdatenVersionId, input.q, 20);
  }),

  melden: publicProcedure
    .input(meldeEingabe)
    .mutation(async ({ ctx, input }) => {
      const email = input.aussteller.email.toLowerCase();
      const zurueckIp = meldungenJeIp.versuch([`ip:${ctx.ip}`]);
      let zurueckMail: () => void;
      try {
        zurueckMail = mailsJeAdresse.versuch([`mail:${email}`]);
      } catch (e) {
        zurueckIp();
        throw e;
      }
      try {
        return await meldeOnline(input, email, ctx.ip);
      } catch (e) {
        zurueckIp();
        zurueckMail();
        throw e;
      }
    }),


  meineMeldung: publicProcedure.input(z.object({ slug: z.string().max(100), token: z.string().max(500).min(10) })).query(async ({ input }) => {
    const s = await ladeOeffentlich(input.slug);
    const [m] = await db.select().from(meldung).where(and(eq(meldung.zugangsToken, input.token), eq(meldung.schauId, s.id)));
    if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden. Bitte den Link aus der E-Mail verwenden.");
    const [a] = await db.select().from(aussteller).where(eq(aussteller.id, m.ausstellerId));
    const [eintraege, betrag] = await Promise.all([ladeEintraege(s.id, { nurMeldungId: m.id }), meldebetrag(db, m.id)]);
    const skala = skalaVon(s);
    return {
      schau: { name: s.name, test: s.test, bankverbindung: bankAngabe(s), zahlungBeiEinlieferung: s.zahlungBeiEinlieferung, freigegeben: s.ergebnisseFreigegeben },
      status: m.status,
      name: `${a!.vorname} ${a!.nachname}`,
      online: !!m.onlineZustimmungAm,
      jugend: m.istJugend,
      meldebogen: !!m.zustimmungAm,
      /** Online an einen vorhandenen Stammsatz gemeldet: der Inhaber bestätigt sie hier (Entscheidung 034). */
      bestaetigen: m.eingang === "online" && !m.zustimmungAm && (m.status === "offen" || m.status === "bestaetigt"),
      betrag,
      // Verwendungszweck und GiroCode nur für eine gültige Meldung mit offenem Betrag (Entscheidung 021).
      ueberweisung: await ueberweisung(s, m, a!, betrag),
      tiere: eintraege
        .sort((x, y) => (x.katalogNr ?? 1e9) - (y.katalogNr ?? 1e9) || x.position - y.position)
        .map((e) => ({
          katalogNr: e.katalogNr,
          suffix: e.suffix,
          bezeichnung: e.bezeichnung,
          art: e.art,
          geschlecht: e.geschlecht,
          alter: e.alter,
          verkaufspreisCent: e.verkaufspreisCent,
          // Ergebnisse erst nach Freigabe – dann auch die Texte der Bewertungskarte.
          ergebnis: s.ergebnisseFreigegeben ? bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala) : null,
          karte: s.ergebnisseFreigegeben ? { vorzuege: e.vorzuege, wuensche: e.wuensche, maengel: e.maengel } : null,
          preise: s.ergebnisseFreigegeben ? e.preise.map((p) => p.kuerzel) : [],
          verkauft: s.ergebnisseFreigegeben ? !!e.verkauftAn : false,
        })),
    };
  }),

  /** Einwilligung in die Online-Veröffentlichung erteilen oder widerrufen (Art. 7 Abs. 3 DSGVO) – so einfach wie die Erteilung. */
  onlineVeroeffentlichung: publicProcedure
    .input(
      z.object({
        slug: z.string().max(100),
        token: z.string().max(500).min(10),
        erlaubt: z.boolean(),
        /** Jugendliche: Name des Erziehungsberechtigten, der einverstanden ist (nur beim Erlauben nötig). */
        erziehungsberechtigter: z.string().trim().max(200).default(""),
        sprache: spracheFeld,
      }),
    )
    .mutation(async ({ input }) => {
      // Lesemodus (Entscheidung 025): nur der Widerruf geht (Art. 7 Abs. 3 DSGVO), das Erteilen nicht.
      if (input.erlaubt && config.nurLesen) throw fehler("FORBIDDEN", NUR_LESEN_MELDUNG);
      const s = await ladeOeffentlich(input.slug);
      const [m] = await db.select().from(meldung).where(and(eq(meldung.zugangsToken, input.token), eq(meldung.schauId, s.id)));
      if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden. Bitte den Link aus der E-Mail verwenden.");
      if (!!m.onlineZustimmungAm === input.erlaubt) return { online: input.erlaubt };
      // Erteilen nur an einer gültigen Meldung (eine stornierte steht in keinem Katalog); Widerrufen geht immer.
      if (input.erlaubt && (m.status === "abgelehnt" || m.status === "storniert")) throw fehler("BAD_REQUEST", texte(input.sprache).meine.nichtAktiv);
      // Widerrufen geht immer ohne Hürde (Art. 7 Abs. 3 DSGVO). Nur das Erteilen hat Bedingungen und eine Bremse: der
      // Widerruf an einer bestätigten Meldung erneuert den öffentlichen Katalog sofort (datenschutzGeaendert) – nicht in
      // einer Schleife. Ein Widerruf setzt ein Erteilen voraus.
      if (input.erlaubt) {
        // Wie im Meldeformular: Minderjährige erlauben die Veröffentlichung nur mit einem Erziehungsberechtigten.
        if (m.istJugend && input.erziehungsberechtigter.length < 3) {
          throw fehler("BAD_REQUEST", texte(input.sprache).meine.fehlerEltern);
        }
        einwilligungBremse.versuch([`meldung:${m.id}`]);
      }
      await db.transaction(async (tx) => {
        // Gesperrt neu lesen: ein Doppelklick schreibt keinen zweiten Eintrag, und ein gleichzeitiges Bearbeiten durch die
        // Ausstellungsleitung liest die Zeile erst danach (Entscheidung 033).
        const [frisch] = await tx.select({ am: meldung.onlineZustimmungAm, status: meldung.status }).from(meldung).where(eq(meldung.id, m.id)).for("no key update");
        if (!!frisch?.am === input.erlaubt) return;
        if (input.erlaubt && (frisch?.status === "abgelehnt" || frisch?.status === "storniert")) throw fehler("BAD_REQUEST", texte(input.sprache).meine.nichtAktiv);
        await tx
          .update(meldung)
          .set({ onlineZustimmungAm: input.erlaubt ? new Date() : null, ...(input.erlaubt && m.istJugend ? { erziehungsberechtigter: input.erziehungsberechtigter } : {}) })
          .where(eq(meldung.id, m.id));
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "meldung",
          datensatzId: m.id,
          aktion: input.erlaubt ? "Online-Veröffentlichung erlaubt" : ONLINE_WIDERRUFEN,
          akteur: { text: AKTEUR_ONLINE },
        });
      });
      return { online: input.erlaubt };
    }),

  /**
   * Online-Meldung an einen vorhandenen Stammsatz bestätigen (Entscheidung 034): Wer den Link aus der Mail an die
   * hinterlegte Adresse hat, erkennt damit die AAB an (Meldebogen). Erst dann zieht ein Mandat das Meldegeld ein.
   * Ein Knopf, kein Aufruf beim Öffnen – Virenscanner öffnen Links in Mails von selbst.
   */
  meldungBestaetigen: publicProcedure
    .input(z.object({ slug: z.string().max(100), token: z.string().max(500).min(10), sprache: spracheFeld }))
    .mutation(async ({ input }) => {
      if (config.nurLesen) throw fehler("FORBIDDEN", NUR_LESEN_MELDUNG);
      const s = await ladeOeffentlich(input.slug);
      const [m] = await db.select({ id: meldung.id }).from(meldung).where(and(eq(meldung.zugangsToken, input.token), eq(meldung.schauId, s.id)));
      if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden. Bitte den Link aus der E-Mail verwenden.");
      await db.transaction(async (tx) => {
        // Gesperrt lesen: ein Doppelklick schreibt keinen zweiten Eintrag (Entscheidung 033).
        const [frisch] = await tx.select({ am: meldung.zustimmungAm, status: meldung.status, eingang: meldung.eingang }).from(meldung).where(eq(meldung.id, m.id)).for("no key update");
        if (frisch!.status === "abgelehnt" || frisch!.status === "storniert") throw fehler("BAD_REQUEST", texte(input.sprache).meine.nichtAktiv);
        // Nur Online-Meldungen (wie das Feld „bestaetigen“): Papier- und AL-Meldungen erkennt die AL mit dem Meldebogen an.
        if (frisch!.am || frisch!.eingang !== "online") return;
        await tx.update(meldung).set({ zustimmungAm: new Date() }).where(eq(meldung.id, m.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "meldung", datensatzId: m.id, aktion: "vom Aussteller bestätigt", akteur: { text: AKTEUR_ONLINE } });
      });
      return { ok: true };
    }),

  ergebnisse: publicProcedure.input(z.object({ slug: z.string().max(100) })).query(async ({ ctx, input }) => {
    abrufBremse.versuch([`ip:${ctx.ip}`]);
    const s = await ladeOeffentlich(input.slug);
    if (!s.ergebnisseFreigegeben || onlineAbgelaufen(s.bewertungAm, heuteDe())) return { freigegeben: false as const, name: s.name, test: s.test, tiere: [] };
    // Zwischengespeichert nach Protokollstand: neu berechnet nur nach einer Änderung, gleichzeitige Abrufe teilen sich eine Berechnung.
    const stand = await oeffentlicherStand(s.id);
    const schluessel = `${stand.schluessel}:${s.name}:${s.jugendSeparat}:${s.staemmeVorn}:${s.notenskala ? JSON.stringify(s.notenskala) : ""}`;
    const alt = ergebnisCache.get(s.id);
    if (alt && alt.schluessel === schluessel) return alt.daten;
    // Nur das Neuberechnen ist teuer – dafür die strengere Bremse (Abrufe aus dem Zwischenspeicher kosten fast nichts).
    ergebnisBremse.versuch([`ip:${ctx.ip}`]);
    const daten = berechneErgebnisse(s);
    ergebnisCache.delete(s.id);
    ergebnisCache.set(s.id, { schluessel, daten });
    while (ergebnisCache.size > 50) ergebnisCache.delete(ergebnisCache.keys().next().value!);
    daten.catch(() => ergebnisCache.get(s.id)?.daten === daten && ergebnisCache.delete(s.id));
    return daten;
  }),
});

/**
 * Ergebnisse: je Adresse höchstens 600 Abrufe pro Minute (eine Halle oder ein Mobilfunknetz teilt sich oft eine
 * Adresse) und höchstens 30 Neuberechnungen.
 */
const einwilligungBremse = new Bremse(10, 3_600_000, "Die Einwilligung wurde gerade oft geändert. Bitte in einer Stunde erneut versuchen.");
const abrufBremse = new Bremse(600, 60_000, "Zu viele Abrufe. Bitte gleich noch einmal versuchen.");
const ergebnisBremse = new Bremse(30, 60_000, "Zu viele Abrufe. Bitte gleich noch einmal versuchen.");
const ergebnisCache = new Map<number, { schluessel: string; daten: ReturnType<typeof berechneErgebnisse> }>();

async function berechneErgebnisse(s: typeof schau.$inferSelect) {
  const skala = skalaVon(s);
  // Namen nur mit Einwilligung in die Online-Veröffentlichung – sonst „nicht veröffentlicht“, auch für die Suche.
  const eintraege = verdeckeNamen(await ladeEintraege(s.id, { nurBestaetigt: true }), "online");
  return {
    freigegeben: true as const,
    name: s.name,
    test: s.test,
    staemmeVorn: s.staemmeVorn,
    tiere: eintraege
      .filter((e) => e.katalogNr != null)
      .map((e) => ({
        katalogNr: e.katalogNr!,
        suffix: e.suffix,
        sparte: e.sparte ?? "Sonstige",
        rasse: e.rasse ?? e.freitext,
        bezeichnung: e.bezeichnung,
        art: e.art,
        artIndex: MELDEARTEN.indexOf(e.art),
        geschlecht: e.geschlecht,
        alter: e.alter,
        ergebnis: e.status === "fehlt" ? "fehlt" : bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala),
        punkte: e.punkte,
        preise: e.preise.map((p) => p.kuerzel),
        aussteller: e.verdeckt ? "nicht veröffentlicht" : `${e.vorname} ${e.nachname}`,
        verdeckt: e.verdeckt,
        verein: e.verein,
        // Kein „istJugend“: nur, was die Seite zeigt – die Überschrift des Jugendblocks oder die Marke an der Zeile.
        /** Steht im eigenen Block „Jugend – …“ (Einstellung „eigener Block am Ende“). */
        jugendBlock: istJugendBlock(e, s),
        /** Marke „Jugend“ an der Zeile: nur bei Jugend in der Rasse eingereiht (beim eigenen Block steht die Überschrift). */
        jugendKennzeichen: jugendKennzeichen(e, s),
      })),
  };
}


async function meldeOnline(input: MeldeInput, email: string, ip: string) {
  const s = await ladeOeffentlich(input.slug);
  const t = texte(input.sprache);
  const offen = await meldungOffen(s, input.sprache);
  if (!offen.offen) throw fehler("BAD_REQUEST", offen.grund);
  if (input.istJugend) {
    // Jugendtarif und Jugendblock nur mit passendem Geburtsdatum – Stichtag ist der Bewertungstag.
    const geb = input.aussteller.geburtsdatum;
    if (!geb) throw fehler("BAD_REQUEST", t.fehler.jugendGeburtsdatum);
    const stichtag = s.bewertungAm ?? heute();
    if (!istJugendlich(geb, stichtag)) throw fehler("BAD_REQUEST", t.fehler.nichtMehrJugend(datumIn(stichtag, input.sprache), JUGEND_ALTERSGRENZE));
    // Minderjährige brauchen für die Meldung (Meldegeld) und eine Einwilligung die Zustimmung der Eltern.
    if (input.erziehungsberechtigter.length < 3) throw fehler("BAD_REQUEST", t.meine.fehlerEltern);
  }
  if (s.erklaerungen.trim() && !input.erklaerungen) throw fehler("BAD_REQUEST", t.fehler.erklaerungen);
  // Eine einzelne Online-Meldung belegt höchstens ein Viertel der Halle (mindestens 30 Tiere) – größere über die AL.
  if (s.kapazitaet && input.positionen.length > Math.max(30, Math.floor(s.kapazitaet / 4))) {
    throw fehler("BAD_REQUEST", t.fehler.zuVieleTiere);
  }
  if (s.kapazitaet && (await belegteKaefige(s.id)) + input.positionen.length > s.kapazitaet) {
    throw fehler("BAD_REQUEST", t.fehler.halleVoll);
  }
  // Scheitert die Meldung, zählen ihre Tiere nicht.
  const zurueckTiere = s.kapazitaet && !istLokaleAdresse(ip) ? tiereZaehlen(`${s.id}`, ip, input.positionen.length, Math.max(30, Math.ceil(s.kapazitaet / 2))) : () => {};

  const r = await db.transaction(async (tx) => {
    // Die Prüfungen oben sind die schnelle Antwort. Maßgeblich ist der Stand unter der Sperre je Schau: zwei gleichzeitige
    // Meldungen sähen sonst beide noch Platz in der Halle (oder die Meldephase noch offen).
    await sperreOnlineMeldung(tx, s.id);
    // Testschau-Sperre (geteilt) vor der Sperre je Adresse – Reihenfolge nach Entscheidung 033; speichereMeldung nimmt
    // sie noch einmal (geteilt, ohne Warten).
    await sperreTestschauGeteilt(tx, s.id);
    const [frisch] = await tx.select().from(schau).where(eq(schau.id, s.id));
    const jetzt = await meldungOffen(frisch!, input.sprache, tx);
    if (!jetzt.offen) throw fehler("BAD_REQUEST", jetzt.grund);
    if (frisch!.kapazitaet && (await belegteKaefige(s.id, tx)) + input.positionen.length > frisch!.kapazitaet) throw fehler("BAD_REQUEST", t.fehler.halleVoll);
    // Doppelte Online-Meldung erkennen (gleiche E-Mail und Registriernummer) – unter einer Sperre je Schau und
    // Adresse, damit auch ein Doppelklick (zwei gleichzeitige Anfragen) nur eine Meldung anlegt.
    // Bestehende Ausstellerdaten werden online nie überschrieben – die AL führt Dubletten bei Bedarf zusammen.
    await tx.execute(sql`select pg_advisory_xact_lock(${MELDUNG_SPERRE}::int, hashtext(${`${s.id}:${email}`}))`);
    const schon = await tx
      .select({ id: meldung.id })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(
        and(
          eq(meldung.schauId, s.id),
          eq(aussteller.email, email),
          eq(aussteller.registriernummer, input.aussteller.registriernummer),
          // Weitere Personen desselben Betriebs (Familie, Jugendliche) melden mit eigenem Namen.
          sql`lower(trim(${aussteller.vorname})) = lower(trim(${input.aussteller.vorname}))`,
          sql`lower(trim(${aussteller.nachname})) = lower(trim(${input.aussteller.nachname}))`,
        ),
      );
    if (schon.length) throw fehler("CONFLICT", t.fehler.schonGemeldet);
    // Bekannter Aussteller (gleiche E-Mail, Registriernummer und Name im Verein): die Meldung hängt am vorhandenen
    // Stammsatz, statt in jeder Schau einen neuen anzulegen. Dessen Daten werden online nicht überschrieben.
    const [bekannt] = await tx
      .select({ id: aussteller.id })
      .from(aussteller)
      .where(
        and(
          eq(aussteller.organisationId, s.organisationId),
          ausstellerDerSchau(s),
          sql`lower(${aussteller.email}) = ${email}`,
          eq(aussteller.registriernummer, input.aussteller.registriernummer),
          sql`lower(trim(${aussteller.vorname})) = lower(trim(${input.aussteller.vorname}))`,
          sql`lower(trim(${aussteller.nachname})) = lower(trim(${input.aussteller.nachname}))`,
          sql`${aussteller.gesperrtAm} is null and ${aussteller.geloeschtAm} is null`,
        ),
      )
      .orderBy(aussteller.id)
      .limit(1);
    return speichereMeldung(
      tx,
      s.organisationId,
      {
        schauId: s.id,
        aussteller: { ...input.aussteller, email, istPreisrichter: input.istPreisrichter, ...(bekannt ? { id: bekannt.id } : {}) },
        eingang: "online",
        istJugend: input.istJugend,
        teilschau: input.teilschau,
        bemerkung: input.bemerkung,
        // Am vorhandenen Stammsatz erkennt der Inhaber die AAB erst über den Link aus der Mail an (Entscheidung 034).
        zustimmung: !bekannt,
        onlineZustimmung: input.onlineVeroeffentlichung,
        erziehungsberechtigter: input.erziehungsberechtigter,
        erklaerungen: !!s.erklaerungen.trim() && input.erklaerungen,
        positionen: input.positionen,
        stiftung: input.stiftung,
        spende: input.spende,
      },
      { text: AKTEUR_ONLINE },
      { bestehendenNichtAendern: !!bekannt, sprache: input.sprache },
    ).then((x) => ({ ...x, bekannt: !!bekannt }));
  }).catch((e) => {
    zurueckTiere();
    throw e;
  });
  const [m] = await db.select().from(meldung).where(eq(meldung.id, r.meldungId));
  const [a] = await db.select({ vorname: aussteller.vorname, nachname: aussteller.nachname }).from(aussteller).where(eq(aussteller.id, r.ausstellerId));
  const ue = await ueberweisung(s, m!, a!, r.betrag);
  // Anrede nur aus Buchstaben: sie ist frei eingegeben und ginge sonst mit Links als Werbung mit Vereinsabsender hinaus.
  const text = eingangsText(s, anrede(input.aussteller.vorname, input.aussteller.nachname), r.betrag.summeCent, meldungsLink(s, m!.zugangsToken, input.sprache), input.onlineVeroeffentlichung, r.betrag.stiftungCent, r.betrag.spendeCent, input.sprache, ue);
  await sendeMail(s.organisationId, email, t.mail.betreffMeldung(s.name), r.bekannt ? text.split("\n").map((z) => (z === t.mail.pruefenLink ? t.mail.bestaetigenLink : z)).join("\n") : text, r.ausstellerId);
  // Vorhandener Stammsatz (Entscheidung 034): Link und Überweisungsdaten nur per Mail an die hinterlegte Adresse. Wer
  // fremde Angaben eingibt, bekommt so keinen Zugang zur Meldung, und die Antwort verrät nichts über ein Mandat.
  // Leeres token: kein Link in der Antwort.
  if (r.bekannt) return { token: "", betrag: r.betrag, ueberweisung: null };
  return { token: m!.zugangsToken, betrag: r.betrag, ueberweisung: ue };
}

/** Tiere je Anschluss und je IPv6-/48 zählen; Rückgabe gibt beide wieder frei. */
function tiereZaehlen(schau: string, ip: string, menge: number, max: number) {
  const zurueckAnschluss = tiereJeAnschluss.menge(`${schau}:${anschlussSchluessel(ip)}`, menge, max);
  const netz = netz48Schluessel(ip);
  try {
    const zurueckNetz = netz ? tiereJeNetz.menge(`${schau}:${netz}`, menge, max) : () => {};
    return () => {
      zurueckAnschluss();
      zurueckNetz();
    };
  } catch (e) {
    zurueckAnschluss();
    throw e;
  }
}
