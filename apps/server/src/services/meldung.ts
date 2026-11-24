import { ALTER, EINGANG, gefordertCent, heuteBerlin, istAuslaendisch, istJugendlich, JUGEND_ALTERSGRENZE, MELDEARTEN, normalisiereIban, normalisiereRegistriernummer, pruefeGeschlecht, pruefeIban, REGISTRIERNUMMER_HINWEIS, teilschauenLesen, teilschauVon, texte, type Sprache } from "@schau/domain";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { zufallsToken } from "../auth";
import type { Tx } from "../db/client";
import { aussteller, auszahlung, bewertung, farbenschlag, gesundheit, katalogeintrag, meldung, preisvergabe, schau, sepaLauf, stiftung, rasse, verkauf } from "../db/schema";
import { fehler, dbId, kalenderdatum } from "../trpc";
import { meldebetrag } from "./eintraege";
import { inOffenerLastschrift, LASTSCHRIFT_OFFEN, offenerLauf, sperreKasse } from "./kasse";
import { MELDUNG_VERALTET, meldungStand } from "./meldung-stand";
import { pruefeAusstellerZurSchau, sperreTestschauGeteilt, testSchauIdFuer } from "./testschau";
import { protokolliere, type Akteur } from "./protokoll";
import { meldungsspendeAnlegen } from "./spenden";

/** Registriernummer nach § 26 ViehVerkV, einheitlich geschrieben; leer bleibt leer (Pflicht prüfen die Aufrufer). */
export const registriernummerFeld = z
  .string()
  .max(50)
  .trim()
  .transform((v, c) => {
    if (!v) return "";
    const n = normalisiereRegistriernummer(v);
    if (!n) {
      c.addIssue({ code: "custom", message: `Registriernummer ungültig: ${REGISTRIERNUMMER_HINWEIS}.` });
      return z.NEVER;
    }
    return n;
  });

export const ausstellerEingabe = z.object({
  id: dbId.optional(),
  vorname: z.string().max(100).trim().min(1, "Vorname fehlt."),
  nachname: z.string().max(100).trim().min(1, "Nachname fehlt."),
  strasse: z.string().max(500).trim(),
  plz: z.string().max(20).trim(),
  ort: z.string().max(500).trim(),
  telefon: z.string().max(50).trim(),
  email: z.string().max(200).trim().email("E-Mail-Adresse ungültig.").or(z.literal("")),
  verein: z.string().max(500).trim(),
  kreisverband: z.string().max(500).trim(),
  registriernummer: registriernummerFeld,
  geburtsdatum: kalenderdatum().nullable(),
  istPreisrichter: z.boolean(),
  iban: z
    .string()
    .trim()
    .default("")
    .transform(normalisiereIban)
    .superRefine((v, c) => {
      const f = v ? pruefeIban(v) : null;
      if (f) c.addIssue({ code: "custom", message: f });
    }),
  kontoinhaber: z.string().max(200).trim().default(""),
});

export const positionEingabe = z
  .object({
    id: dbId.optional(),
    farbenschlagId: dbId.nullable(),
    freitext: z.string().max(500).trim(),
    /** Bei freier Bezeichnung: Rasse zum Einordnen im Katalog. */
    rasseId: dbId.nullable().default(null),
    art: z.enum(MELDEARTEN),
    geschlecht: z.string().regex(/^\d{1,2},\d{1,2}$/, "Geschlecht als 1,0 / 0,1 / 1,2 angeben."),
    alter: z.enum(ALTER),
    istAoc: z.boolean(),
    istNeuzuechtung: z.boolean(),
    eigeneZucht: z.boolean(),
    verkaufspreisCent: z.number().int().min(0).max(10_000_000).nullable(),
    ringnummern: z.string().trim().max(200).default(""),
  })
  .refine((p) => p.farbenschlagId != null || p.freitext.length > 0, "Rasse und Farbenschlag fehlen.")
  .refine((p) => p.farbenschlagId != null || p.rasseId != null, "Bei freier Bezeichnung bitte die Rasse wählen, bei der das Tier im Katalog steht.")
  // 0,0 ist kein Tier; Einzeltier genau eines, Stamm und Voliere mehrere.
  .superRefine((p, c) => {
    const f = pruefeGeschlecht(p.art, p.geschlecht);
    if (f) c.addIssue({ code: "custom", message: f, path: ["geschlecht"] });
  })
  // Aus dem Verzeichnis gewählt: die Rasse ergibt sich aus dem Farbenschlag.
  .transform((p) => (p.farbenschlagId != null ? { ...p, rasseId: null, freitext: "" } : p));

export const meldungEingabe = z.object({
  schauId: dbId,
  meldungId: dbId.optional(),
  aussteller: ausstellerEingabe,
  eingang: z.enum(EINGANG),
  istJugend: z.boolean(),
  /** Teilschau (Kennung aus den Einstellungen der Schau); null = die erste, fehlt = unverändert. */
  teilschau: z.string().max(10).nullable().optional(),
  bemerkung: z.string().max(2_000),
  zustimmung: z.boolean(),
  /** Freiwillige Einwilligung in die Veröffentlichung im Internet. */
  onlineZustimmung: z.boolean().default(false),
  /**
   * Stand der Einwilligung beim Öffnen des Formulars. Gleich dem gesendeten Wert heißt: im Formular nicht geändert –
   * dann bleibt der aktuelle Stand (z. B. ein inzwischen über „Meine Meldung“ erklärter Widerruf) erhalten.
   */
  onlineZustimmungVorher: z.boolean().optional(),
  /** Stand der Meldung beim Öffnen des Formulars (meldung.get): weicht er ab, wird nichts gespeichert (Entscheidung 033). */
  stand: z.string().max(64).optional(),
  /** Kennung des Formulars einer neuen Meldung: dieselbe Anfrage zweimal legt nur eine Meldung an. */
  anfrageId: z.string().uuid().optional(),
  /**
   * Widerspruch gegen die Nennung im Katalog (Art. 21 DSGVO), von der Ausstellungsleitung erfasst. Fehlt die Angabe
   * (öffentliches Formular, ältere Oberfläche), bleibt der gespeicherte Stand.
   */
  namenWiderspruch: z.boolean().optional(),
  erziehungsberechtigter: z.string().trim().max(200).default(""),
  /** Pflichterklärungen der Schau (Herkunft, Karenzzeit) abgegeben. */
  erklaerungen: z.boolean().default(false),
  positionen: z.array(positionEingabe).max(500),
  stiftung: z.object({ betragCent: z.number().int().min(0).max(10_000_000), vorgabe: z.string().max(500) }).nullable().optional(),
  /** Freiwillige Spende für die Ausstellung (nie vorausgewählt, kein Meldegeld) – nur bei einer neuen Meldung. */
  spende: z.object({ betragCent: z.number().int().min(0).max(10_000_000), nennen: z.boolean().default(false) }).nullable().optional(),
});
export type MeldungEingabe = z.infer<typeof meldungEingabe>;

/** Kennung der Sperre je Anfrage-Kennung einer neuen Meldung (pg_advisory_xact_lock). */
const ANFRAGE_SPERRE = 0x4d414e46; // "MANF"

/**
 * Legt eine Meldung an oder ändert sie (samt Aussteller und Positionen).
 * Positionen, die nicht mehr übergeben werden, werden gelöscht – außer sie sind schon bewertet.
 */
/**
 * `ibanVerdeckt`: Das Formular kam mit gekürzter IBAN (Helfer ohne Bankdaten-Recht) – ein leeres IBAN-Feld heißt dann
 * „unverändert“, nicht „löschen“.
 */
export async function speichereMeldung(tx: Tx, organisationId: number, input: MeldungEingabe, akteur: Akteur, opts: { istAdmin?: boolean; ibanVerdeckt?: boolean; /** Online-Meldung eines bekannten Ausstellers: Stammdaten bleiben, wie sie sind. */ bestehendenNichtAendern?: boolean; /** Online-Meldung: Sprache des Formulars – für Fehlermeldungen und, bei einer neuen Meldung, gespeichert (Entscheidung 020). */ sprache?: Sprache } = {}) {
  await sperreTestschauGeteilt(tx, input.schauId);
  // Bearbeiten: erst die Kasse, dann Schau und Meldung frisch (Reihenfolge Kasse vor Zeile, Entscheidung 033) – so sehen
  // Phase, Einwilligung und Stand, was eine Buchung oder ein Abschluss während des Wartens geändert hat.
  if (input.meldungId) await sperreKasse(tx, input.schauId);
  const [s] = await tx.select().from(schau).where(eq(schau.id, input.schauId));
  if (!s || s.organisationId !== organisationId) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  // Dieselbe Anfrage noch einmal (verlorene Antwort, zweiter Klick): die schon angelegte Meldung zurückgeben.
  if (!input.meldungId && input.anfrageId) {
    await tx.execute(sql`select pg_advisory_xact_lock(${ANFRAGE_SPERRE}::int, hashtext(${input.anfrageId}))`);
    const [schon] = await tx.select({ id: meldung.id, ausstellerId: meldung.ausstellerId }).from(meldung).where(and(eq(meldung.schauId, input.schauId), eq(meldung.anfrageId, input.anfrageId)));
    if (schon) return { meldungId: schon.id, ausstellerId: schon.ausstellerId, betrag: await meldebetrag(tx, schon.id) };
  }
  // Abgesagt (oder online nicht mehr in der Meldephase): unter der geteilten Sperre gelesen – absagen wartet exklusiv
  // darauf, sieht also jede Meldung, die vorher durchkam.
  if (!input.meldungId && s.abgesagtAm) throw fehler("BAD_REQUEST", texte(opts.sprache ?? "de").schau.abgesagt(s.absageGrund));
  if (!input.meldungId && input.eingang === "online" && s.phase !== "meldung") throw fehler("BAD_REQUEST", texte(opts.sprache ?? "de").schau.meldungZu);

  // Farbenschläge müssen zur Stammdatenversion der Schau gehören.
  const fIds = input.positionen.map((p) => p.farbenschlagId).filter((x): x is number => x != null);
  if (fIds.length) {
    const gefunden = await tx
      .select({ id: farbenschlag.id })
      .from(farbenschlag)
      .where(and(inArray(farbenschlag.id, fIds), eq(farbenschlag.versionId, s.stammdatenVersionId ?? -1)));
    if (gefunden.length !== new Set(fIds).size) throw fehler("BAD_REQUEST", "Unbekannter Farbenschlag in der Meldung.");
  }
  const rIds = input.positionen.map((p) => p.rasseId).filter((x): x is number => x != null);
  if (rIds.length) {
    const gefunden = await tx
      .select({ id: rasse.id })
      .from(rasse)
      .where(and(inArray(rasse.id, rIds), eq(rasse.versionId, s.stammdatenVersionId ?? -1)));
    if (gefunden.length !== new Set(rIds).size) throw fehler("BAD_REQUEST", "Unbekannte Rasse in der Meldung.");
  }

  // Aussteller – das Geburtsdatum nur bei Jugendmeldung (Datenminimierung, es dient allein dem Jugendtarif).
  const { id: aid, ...eingabe } = input.aussteller;
  const adaten = { ...eingabe, geburtsdatum: input.istJugend ? eingabe.geburtsdatum : null };
  // Jugendtarif nur, wer am Bewertungstag noch jugendlich ist (wie bei der Online-Meldung).
  if (input.istJugend && adaten.geburtsdatum) {
    const stichtag = s.bewertungAm ?? heuteBerlin();
    if (!istJugendlich(adaten.geburtsdatum, stichtag)) throw fehler("BAD_REQUEST", `Laut Geburtsdatum am Bewertungstag nicht mehr jugendlich (unter ${JUGEND_ALTERSGRENZE} Jahre) – bitte ohne Jugend erfassen.`);
  }
  // Teilschau: nur eine, die es in dieser Schau gibt.
  const teilschauen = teilschauenLesen(s.teilschauen);
  if (input.teilschau != null && !teilschauen.some((t) => t.id === input.teilschau)) throw fehler("BAD_REQUEST", texte(opts.sprache ?? "de").fehler.teilschau);
  // Herkunft aus einem anderen Mitgliedstaat nur, wenn die Schau das zulässt (Gesundheitszertifikat, TRACES, Einlasskontrolle).
  if (!s.auslandZugelassen && istAuslaendisch(input.aussteller.registriernummer)) {
    throw fehler("BAD_REQUEST", texte(opts.sprache ?? "de").fehler.keinAusland);
  }
  const vorherige = input.meldungId ? (await tx.select().from(meldung).where(eq(meldung.id, input.meldungId)).for("update"))[0] : undefined;
  if (input.meldungId && (!vorherige || vorherige.schauId !== s.id)) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
  if (vorherige && input.stand !== undefined && input.stand !== (await meldungStand(tx, vorherige.id))) throw fehler("CONFLICT", MELDUNG_VERALTET);
  // Der Aussteller einer Meldung bleibt: ein Wechsel ließe Auszahlungen, Belege und Verkäufe beim alten zurück.
  if (vorherige && aid !== vorherige.ausstellerId) {
    throw fehler("BAD_REQUEST", "Der Aussteller einer Meldung lässt sich nicht wechseln. Bitte die Meldung stornieren und für den richtigen Aussteller neu erfassen.");
  }
  // Eine zugesagte Stiftung steckt im Saldo. An einer bestehenden Meldung ändert sie deshalb nur der eine Weg mit Rolle,
  // Kassensperre, Deckungsprüfung und Protokoll: preise.stiftungSpeichern. Die Oberfläche sendet hier keine Stiftung.
  if (vorherige && input.stiftung && input.stiftung.betragCent > 0) {
    throw fehler("BAD_REQUEST", "Eine Stiftung an einer bestehenden Meldung ändert die Ausstellungsleitung unter „Preise und Freigabe“.");
  }
  if (vorherige && input.spende && input.spende.betragCent > 0) {
    throw fehler("BAD_REQUEST", "Eine Spende zu einer bestehenden Meldung erfasst die Ausstellungsleitung unter „Spenden“.");
  }
  // Nach einer Abrechnung (Quittung oder SEPA-Datei) und ab Phase „Abrechnung“ ändert Geld-Relevantes nur die
  // Ausstellungsleitung: Meldegeld, Tiere, Jugend, Preisrichter-Befreiung, Bankdaten. Die Kassensperre sorgt dafür,
  // dass keine Auszahlung zwischen Prüfung und Speichern dazwischenkommt.
  // Eine abgeschlossene Schau ist nur noch zu lesen (sonst entstünden offene Beträge nach dem Abschluss).
  if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – Meldungen nur noch lesen. Für Korrekturen erst mit Grund zurück zur Abrechnung.");
  const spaetePhase = s.phase === "abrechnung";
  let abgerechnet = false;
  let imEinzug = false;
  let vorherBetrag: Awaited<ReturnType<typeof meldebetrag>> | null = null;
  if (vorherige) {
    vorherBetrag = await meldebetrag(tx, vorherige.id);
    abgerechnet = (await hatAuszahlung(tx, s.id, vorherige.ausstellerId)) != null || !!(await offenerLauf(tx, s.id))?.posten.some((p) => p.ausstellerId === vorherige.ausstellerId);
    imEinzug = await inOffenerLastschrift(tx, s.id, { meldungIds: [vorherige.id] });
    // Nach dem Festschreiben stehen die Nummern im gedruckten Katalog im Block ihrer Teilschau (wie teilschauenSetzen).
    if (s.katalogGedruckt && input.teilschau !== undefined && input.teilschau !== vorherige.teilschau)
      throw fehler("BAD_REQUEST", "Der Katalog ist festgeschrieben – die Teilschau einer Meldung bleibt dann, wie sie ist.");
  }
  const nurAL = (abgerechnet || spaetePhase) && !opts.istAdmin;

  let ausstellerId = aid;
  const aenderungen: { feld: string; alt: string; neu: string }[] = [];
  let gesperrt = false;
  if (ausstellerId) {
    // Zeile sperren: Ein gleichzeitiges „Als Testschau kennzeichnen“ einer anderen Schau sieht diese Meldung dann (oder
    // diese Meldung sieht danach das neue Kennzeichen).
    const [a] = await tx.select().from(aussteller).where(eq(aussteller.id, ausstellerId)).for("update");
    if (!a || a.organisationId !== organisationId) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
    // Test-Aussteller nur in ihrer Testschau, echte nur in echten Schauen (services/testschau.ts).
    pruefeAusstellerZurSchau(a, s);
    if (!input.meldungId && (a.gesperrtAm || a.geloeschtAm)) throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt. Bitte neu anlegen.");
    // Gelöschte oder gesperrte Daten (Art. 17/18 DSGVO) stellt kein noch offenes Formular wieder her.
    gesperrt = !!(a.gesperrtAm || a.geloeschtAm);
    if (opts.ibanVerdeckt && !adaten.iban && a.iban) adaten.iban = a.iban;
    if (opts.bestehendenNichtAendern) {
      // Die Jugendprüfung oben lief mit dem eingegebenen Datum; gespeichert bleibt das vorhandene.
      for (const k of ["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "verein", "kreisverband", "registriernummer", "iban", "kontoinhaber", "istPreisrichter", "geburtsdatum"] as const) {
        (adaten as Record<string, unknown>)[k] = a[k];
      }
      // Jugend: maßgeblich ist das gespeicherte Geburtsdatum (ein eingegebenes jüngeres zählt nicht).
      if (input.istJugend && a.geburtsdatum) {
        const stichtag = s.bewertungAm ?? heuteBerlin();
        if (!istJugendlich(a.geburtsdatum, stichtag)) throw fehler("BAD_REQUEST", `Laut Geburtsdatum am Bewertungstag nicht mehr jugendlich (unter ${JUGEND_ALTERSGRENZE} Jahre) – bitte ohne Jugend melden.`);
      }
    } else if (!input.istJugend) {
      // Eine Meldung ohne Jugend löscht das bekannte Geburtsdatum nicht (es zählt für spätere Jugendmeldungen).
      adaten.geburtsdatum = a.geburtsdatum;
    }
    // Bankdaten hängen am Aussteller, nicht an der Schau: läuft für ihn irgendwo im Verein schon Schau oder Abrechnung
    // oder gibt es eine Auszahlung in einer nicht abgeschlossenen Schau, gilt die Sperre auch hier.
    const andereSchauen = await tx
      .select({ id: schau.id, phase: schau.phase })
      .from(meldung)
      .innerJoin(schau, eq(schau.id, meldung.schauId))
      .where(and(eq(meldung.ausstellerId, a.id), ne(schau.id, s.id), ne(schau.phase, "abgeschlossen")));
    const anderswoAktiv =
      andereSchauen.some((x) => x.phase === "schau" || x.phase === "abrechnung") ||
      (
        await tx
          .select({ id: auszahlung.id })
          .from(auszahlung)
          .innerJoin(schau, eq(schau.id, auszahlung.schauId))
          .where(and(eq(auszahlung.ausstellerId, a.id), isNull(auszahlung.storniertAm), ne(schau.phase, "abgeschlossen")))
          .limit(1)
      ).length > 0;
    // Bankdaten: eine vorhandene IBAN ändert nur die Ausstellungsleitung, und nie, solange eine SEPA-Datei sie enthält.
    // Eine erste IBAN kurz vor der Auszahlung ebenfalls nur sie (sonst lenkte ein Helfer die Überweisung um).
    const bankGeaendert =
      (a.iban && a.iban !== adaten.iban) ||
      (a.kontoinhaber && a.kontoinhaber !== adaten.kontoinhaber) ||
      ((spaetePhase || s.phase === "schau" || abgerechnet || anderswoAktiv) && ((!a.iban && !!adaten.iban) || (!a.kontoinhaber && !!adaten.kontoinhaber)));
    if (bankGeaendert) {
      if (!opts.istAdmin) throw fehler("FORBIDDEN", "Eine vorhandene IBAN oder den Kontoinhaber ändert nur die Ausstellungsleitung (Administratoren).");
      const offen = await tx.select({ daten: sepaLauf.daten }).from(sepaLauf).innerJoin(schau, eq(schau.id, sepaLauf.schauId)).where(and(eq(sepaLauf.status, "offen"), eq(schau.organisationId, organisationId)));
      if (offen.some((l) => (l.daten as { posten: { ausstellerId: number }[] }).posten.some((p) => p.ausstellerId === a.id))) {
        throw fehler("BAD_REQUEST", "Der Aussteller steht in einer offenen SEPA-Datei – erst die Datei buchen oder verwerfen, dann die Bankdaten ändern.");
      }
    }
    // Was sich an den Stammdaten ändert, steht im Protokoll (Bankdaten nur gekürzt).
    const maske = (k: string, v: string) => (k === "iban" && v ? `…${v.slice(-4)}` : k === "geburtsdatum" && v ? "(angegeben)" : v);
    for (const k of ["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "verein", "registriernummer", "iban", "kontoinhaber", "istPreisrichter", "geburtsdatum"] as const) {
      const alt = String(a[k] ?? "");
      const neu = String(adaten[k] ?? "");
      if (alt !== neu) aenderungen.push({ feld: k, alt: maske(k, alt), neu: maske(k, neu) });
    }
    // Geänderte Bankdaten wirken in jeder laufenden Schau des Ausstellers – dort ebenfalls vermerken.
    if (!gesperrt && aenderungen.some((x) => x.feld === "iban" || x.feld === "kontoinhaber")) {
      const bank = aenderungen.filter((x) => x.feld === "iban" || x.feld === "kontoinhaber");
      for (const x of new Set(andereSchauen.map((y) => y.id))) {
        await protokolliere(tx, { schauId: x, tabelle: "aussteller", datensatzId: a.id, aktion: "Bankdaten geändert (in anderer Schau)", alt: Object.fromEntries(bank.map((y) => [y.feld, y.alt])), neu: Object.fromEntries(bank.map((y) => [y.feld, y.neu])), akteur });
      }
    }
    if (gesperrt) {
      if (aenderungen.length) throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern. Bitte die Seite neu laden.");
    } else await tx.update(aussteller).set(adaten).where(eq(aussteller.id, ausstellerId));
  } else {
    const [a] = await tx.insert(aussteller).values({ ...adaten, organisationId, testSchauId: testSchauIdFuer(s) }).returning();
    ausstellerId = a!.id;
  }

  // Auch Bemerkung und Erziehungsberechtigter kommen nach einer Löschung nicht aus einem alten Formular zurück.
  if (gesperrt && vorherige) {
    const eltern = input.istJugend ? input.erziehungsberechtigter : "";
    if (input.bemerkung !== vorherige.bemerkung || eltern !== vorherige.erziehungsberechtigter) {
      throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern. Bitte die Seite neu laden.");
    }
  }

  // Online-Veröffentlichung einer Jugendmeldung neu erlaubt: wie im öffentlichen Weg nur mit Erziehungsberechtigtem.
  const unveraendert = vorherige && input.onlineZustimmungVorher !== undefined && input.onlineZustimmungVorher === input.onlineZustimmung;
  if (input.istJugend && input.onlineZustimmung && !vorherige?.onlineZustimmungAm && !unveraendert && input.erziehungsberechtigter.length < 3) {
    throw fehler("BAD_REQUEST", "Jugendmeldung: Die Veröffentlichung im Internet braucht das Einverständnis eines Erziehungsberechtigten – bitte dessen Namen eintragen.");
  }
  // Meldung
  let meldungId = input.meldungId;
  let onlineGeaendert: boolean | null = null;
  let onlineWirksam = input.onlineZustimmung;
  if (vorherige) {
    const m = vorherige;
    meldungId = m.id;
    // Einwilligung nur ändern, wenn das Formular sie ausdrücklich geändert hat (sonst gewänne ein veraltetes Formular).
    const online = input.onlineZustimmungVorher !== undefined && input.onlineZustimmungVorher === input.onlineZustimmung ? !!m.onlineZustimmungAm : input.onlineZustimmung;
    if (!!m.onlineZustimmungAm !== online) onlineGeaendert = online;
    onlineWirksam = online;
    await tx
      .update(meldung)
      .set({
        istJugend: input.istJugend,
        ...(input.teilschau !== undefined ? { teilschau: input.teilschau } : {}),
        istPreisrichter: input.aussteller.istPreisrichter,
        bemerkung: input.bemerkung,
        zustimmungAm: input.zustimmung ? (m.zustimmungAm ?? new Date()) : null,
        onlineZustimmungAm: online ? (m.onlineZustimmungAm ?? new Date()) : null,
        erziehungsberechtigter: input.istJugend ? input.erziehungsberechtigter : "",
        erklaerungenAm: input.erklaerungen ? (m.erklaerungenAm ?? new Date()) : null,
        ...(input.namenWiderspruch !== undefined ? { namenWiderspruchAm: input.namenWiderspruch ? (m.namenWiderspruchAm ?? new Date()) : null } : {}),
      })
      .where(eq(meldung.id, m.id));
  } else {
    const [doppelt] = await tx
      .select({ id: meldung.id })
      .from(meldung)
      .where(and(eq(meldung.schauId, s.id), eq(meldung.ausstellerId, ausstellerId)));
    if (doppelt) throw fehler("CONFLICT", "Für diesen Aussteller gibt es schon eine Meldung zu dieser Schau.");
    const [m] = await tx
      .insert(meldung)
      .values({
        schauId: s.id,
        ausstellerId,
        eingang: input.eingang,
        istJugend: input.istJugend,
        teilschau: input.teilschau ?? null,
        istPreisrichter: input.aussteller.istPreisrichter,
        bemerkung: input.bemerkung,
        zustimmungAm: input.zustimmung ? new Date() : null,
        namenWiderspruchAm: input.namenWiderspruch ? new Date() : null,
        onlineZustimmungAm: input.onlineZustimmung ? new Date() : null,
        erziehungsberechtigter: input.istJugend ? input.erziehungsberechtigter : "",
        erklaerungenAm: input.erklaerungen ? new Date() : null,
        zugangsToken: zufallsToken(18),
        anfrageId: input.anfrageId ?? null,
        sprache: opts.sprache ?? "de",
      })
      .returning();
    meldungId = m!.id;
  }
  if (!meldungId) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");

  // Positionen abgleichen
  const vorhanden = await tx.select().from(katalogeintrag).where(eq(katalogeintrag.meldungId, meldungId));
  const behalten = new Set(input.positionen.map((p) => p.id).filter(Boolean));
  const weg = vorhanden.filter((v) => !behalten.has(v.id));
  // Festgeschriebene Nummern stehen auf Bewertungs- und Käfigkarten und im gedruckten Katalog: ein nummeriertes Tier
  // bleibt in der Meldung (sonst ginge seine Nummer bei einer Nachmeldung an ein anderes Tier). Kommt es nicht, wird es
  // bei der Einlieferung als „fehlt“ markiert; die ganze Meldung lässt sich stornieren (die Nummern bleiben reserviert).
  const nr = (v: typeof katalogeintrag.$inferSelect) => `Nr. ${v.katalogNr}${v.suffix ?? ""}`;
  if (s.katalogGedruckt) {
    const gedruckt = weg.filter((v) => v.katalogNr != null);
    if (gedruckt.length)
      throw fehler(
        "BAD_REQUEST",
        `Die Katalognummern sind festgeschrieben – diese Tiere bleiben in der Meldung: ${gedruckt.map(nr).join(", ")}. Kommt ein Tier nicht, bei der Einlieferung als „fehlt“ markieren; die ganze Meldung lässt sich stornieren.`,
      );
  }
  // Bewertete, prämierte, verkaufte, eingelieferte Tiere und solche im Gesundheitsjournal bleiben: Bewertungskarte,
  // Preis, Kaufbeleg, Abrechnung und die Tierliste fürs Veterinäramt hängen daran.
  const gebunden = await bindungen(tx, weg.map((v) => v.id), { loeschen: true, statuswechsel: true });
  if (gebunden.length) throw fehler("BAD_REQUEST", `Diese Tiere können nicht aus der Meldung entfernt werden: ${gebunden.join("; ")}.`);
  if (weg.length) await tx.delete(katalogeintrag).where(inArray(katalogeintrag.id, weg.map((v) => v.id)));

  // Bewertete, prämierte oder verkaufte Tiere: was das Tier ausmacht (Rasse, Art, Geschlecht, Alter), bleibt fest –
  // sonst passten Bewertungskarte, Preis, Kaufbeleg und Katalog nicht mehr zum Tier.
  const festeFelder = ["farbenschlagId", "rasseId", "freitext", "art", "geschlecht", "alter", "istAoc", "istNeuzuechtung"] as const;
  const veraendert = input.positionen.filter((p) => {
    const alt = p.id ? vorhanden.find((v) => v.id === p.id) : undefined;
    return alt && festeFelder.some((k) => (alt[k] ?? null) !== (p[k] ?? null));
  });
  // Nach dem Festschreiben gilt das für jedes nummerierte Tier: Karte und Katalog zeigen es schon so.
  if (s.katalogGedruckt) {
    const gedruckt = veraendert.map((p) => vorhanden.find((v) => v.id === p.id)!).filter((v) => v.katalogNr != null);
    if (gedruckt.length)
      throw fehler(
        "BAD_REQUEST",
        `Die Katalognummern sind festgeschrieben – Rasse, Farbenschlag, Art, Geschlecht und Alter dieser Tiere stehen schon auf Karten und im Katalog: ${gedruckt.map(nr).join(", ")}. Zum Ändern das Tier als „fehlt“ markieren und richtig nachmelden (Unternummer).`,
      );
  }
  const festGebunden = await bindungen(tx, veraendert.map((p) => p.id!), { aenderung: true });
  if (festGebunden.length) throw fehler("BAD_REQUEST", `Diese Tiere lassen sich nicht mehr ändern (Rasse, Art, Geschlecht, Alter): ${festGebunden.join("; ")}.`);
  // Verkaufspreis: fest erst mit dem Verkauf; bei schon bewerteten Tieren ändert ihn nur die Ausstellungsleitung.
  const preisAenderungen = input.positionen.flatMap((p) => {
    const alt = p.id ? vorhanden.find((v) => v.id === p.id) : undefined;
    return alt && (alt.verkaufspreisCent ?? null) !== (p.verkaufspreisCent ?? null) ? [{ alt, neu: p.verkaufspreisCent ?? null }] : [];
  });
  if (preisAenderungen.length) {
    const ids = preisAenderungen.map((x) => x.alt.id);
    const [verkauft] = await tx.select({ belegNr: verkauf.belegNr }).from(verkauf).where(and(inArray(verkauf.katalogeintragId, ids), isNull(verkauf.storniertAm)));
    if (verkauft) throw fehler("BAD_REQUEST", `Verkaufspreis eines verkauften Tiers (Beleg ${verkauft.belegNr}) lässt sich nicht ändern – erst den Verkauf stornieren.`);
    const [bewertet] = await tx.select({ id: bewertung.id }).from(bewertung).where(inArray(bewertung.katalogeintragId, ids));
    if (bewertet && !opts.istAdmin) throw fehler("FORBIDDEN", "Den Verkaufspreis bewerteter Tiere ändert nur die Ausstellungsleitung.");
  }

  for (const [i, p] of input.positionen.entries()) {
    const { id, ...werte } = p;
    if (id) {
      if (!vorhanden.some((v) => v.id === id)) throw fehler("BAD_REQUEST", "Position gehört nicht zu dieser Meldung.");
      await tx.update(katalogeintrag).set({ ...werte, position: i }).where(eq(katalogeintrag.id, id));
    } else {
      await tx.insert(katalogeintrag).values({ ...werte, position: i, schauId: s.id, meldungId });
    }
  }

  // Nur bei einer neuen Meldung (bestehende: siehe oben).
  if (input.stiftung && input.stiftung.betragCent > 0) {
    await tx.insert(stiftung).values({
      schauId: s.id,
      meldungId,
      stifter: `${input.aussteller.vorname} ${input.aussteller.nachname}`,
      betragCent: input.stiftung.betragCent,
      vorgabe: input.stiftung.vorgabe,
    });
  }
  if (!vorherige && input.spende && input.spende.betragCent > 0) {
    await meldungsspendeAnlegen(tx, { organisationId, schauId: s.id, meldungId, ausstellerId: ausstellerId!, betragCent: input.spende.betragCent, nennen: input.spende.nennen, akteur });
  }

  const betrag = await meldebetrag(tx, meldungId);
  if (vorherige && vorherBetrag) {
    const geldGeaendert =
      vorherBetrag.summeCent !== betrag.summeCent ||
      weg.length > 0 ||
      input.positionen.some((p) => !p.id) ||
      vorherige.istJugend !== input.istJugend ||
      vorherige.istPreisrichter !== input.aussteller.istPreisrichter;
    // Die offene Lastschriftdatei zieht den alten Betrag ein: der Betrag bleibt, bis sie gebucht oder verworfen ist.
    if (imEinzug && gefordertCent(vorherBetrag) !== gefordertCent(betrag)) throw fehler("CONFLICT", LASTSCHRIFT_OFFEN);
    if (geldGeaendert && nurAL) {
      throw fehler("FORBIDDEN", abgerechnet ? "Der Aussteller ist abgerechnet: Tiere, Jugend und Preisrichter-Befreiung ändert nur die Ausstellungsleitung." : "Ab der Abrechnung ändert Tiere, Jugend und Preisrichter-Befreiung nur die Ausstellungsleitung.");
    }
  }

  // Protokoll als letzter Schritt (die Protokollkette sperrt bis zum Ende der Transaktion). Was Geld und Katalog
  // betrifft, steht mit altem und neuem Stand darin (Grundlage für Reklamationen).
  await protokolliere(tx, {
    schauId: s.id,
    tabelle: "meldung",
    datensatzId: meldungId,
    aktion: input.meldungId ? "geändert" : "angelegt",
    alt: vorherige && vorherBetrag ? { meldegeldCent: vorherBetrag.summeCent, positionen: vorhanden.length, jugend: vorherige.istJugend, preisrichter: vorherige.istPreisrichter } : undefined,
    neu: {
      aussteller: `${adaten.nachname}, ${adaten.vorname}`,
      positionen: input.positionen.length,
      eingang: input.eingang,
      online: onlineWirksam,
      meldegeldCent: betrag.summeCent,
      ...(betrag.stiftungCent ? { stiftungCent: betrag.stiftungCent } : {}),
      ...(betrag.spendeCent ? { spendeCent: betrag.spendeCent } : {}),
      jugend: input.istJugend,
      ...(teilschauen.length ? { teilschau: teilschauVon(teilschauen, input.teilschau !== undefined ? input.teilschau : vorherige?.teilschau)?.name } : {}),
      preisrichter: input.aussteller.istPreisrichter,
      ...(weg.length ? { entfernt: weg.map((v) => `${v.katalogNr != null ? `${v.katalogNr}${v.suffix}` : "ohne Nr."} ${v.art} ${v.geschlecht}`) } : {}),
      ...(preisAenderungen.length
        ? { verkaufspreis: preisAenderungen.map((x) => ({ nr: x.alt.katalogNr != null ? `${x.alt.katalogNr}${x.alt.suffix}` : null, altCent: x.alt.verkaufspreisCent, neuCent: x.neu })) }
        : {}),
    },
    akteur,
  });
  if (aenderungen.length) {
    await protokolliere(tx, { schauId: s.id, tabelle: "aussteller", datensatzId: ausstellerId, aktion: "Stammdaten geändert", alt: Object.fromEntries(aenderungen.map((x) => [x.feld, x.alt])), neu: Object.fromEntries(aenderungen.map((x) => [x.feld, x.neu])), akteur });
  }
  if (onlineGeaendert != null) {
    await protokolliere(tx, { schauId: s.id, tabelle: "meldung", datensatzId: meldungId, aktion: onlineGeaendert ? "Online-Veröffentlichung erlaubt" : "Online-Veröffentlichung widerrufen", akteur });
  }

  return { meldungId, ausstellerId, betrag };
}

/**
 * Was Katalogeinträge gegen Entfernen oder Stornieren sperrt – je Tier ein lesbarer Grund
 * („Nr. 12: verkauft (Beleg 5), erst den Verkauf stornieren“). Leer heißt: nichts gebunden.
 */
/**
 * opts.loeschen: auch stornierte Verkäufe binden (der Beleg bleibt 3 Jahre in der Verkaufsliste).
 * opts.statuswechsel: auch eingelieferte/ausgegebene Tiere und Einträge im Gesundheitsjournal binden (Storno der
 * Meldung nähme sie sonst aus der Tierliste fürs Veterinäramt).
 */
export async function bindungen(tx: Tx, ids: number[], opts: { loeschen?: boolean; statuswechsel?: boolean; aenderung?: boolean } = {}): Promise<string[]> {
  if (!ids.length) return [];
  const [eintraege, bewertet, preise, verkauft, journal] = await Promise.all([
    tx.select({ id: katalogeintrag.id, nr: katalogeintrag.katalogNr, suffix: katalogeintrag.suffix, status: katalogeintrag.status }).from(katalogeintrag).where(inArray(katalogeintrag.id, ids)),
    tx.select({ id: bewertung.katalogeintragId }).from(bewertung).where(inArray(bewertung.katalogeintragId, ids)),
    tx.select({ id: preisvergabe.katalogeintragId }).from(preisvergabe).where(inArray(preisvergabe.katalogeintragId, ids)),
    tx.select({ id: verkauf.katalogeintragId, belegNr: verkauf.belegNr, storniertAm: verkauf.storniertAm }).from(verkauf).where(inArray(verkauf.katalogeintragId, ids)),
    opts.statuswechsel ? tx.select({ id: gesundheit.katalogeintragId }).from(gesundheit).where(inArray(gesundheit.katalogeintragId, ids)) : [],
  ]);
  return eintraege.flatMap((e) => {
    const v = verkauft.filter((x) => x.id === e.id);
    const gueltig = v.find((x) => !x.storniertAm);
    const gruende = [
      gueltig ? `verkauft (Beleg ${gueltig.belegNr}), erst den Verkauf stornieren` : "",
      // Auch stornierte Abgaben bleiben 3 Jahre in der Verkaufsliste – das Tier bleibt deshalb stehen.
      opts.loeschen && !gueltig && v.length ? `steht mit storniertem Beleg ${v.map((x) => x.belegNr).join(", ")} in der Verkaufsliste` : "",
      preise.some((p) => p.id === e.id) ? "hat einen Preis" : "",
      bewertet.some((b) => b.id === e.id) ? "ist bewertet" : "",
      opts.statuswechsel && (e.status === "eingeliefert" || e.status === "ausgesetzt") ? (e.status === "eingeliefert" ? "ist eingeliefert" : "ist ausgegeben") : "",
      opts.statuswechsel && journal.some((j) => j.id === e.id) ? "steht im Gesundheitsjournal" : "",
    ].filter(Boolean);
    return gruende.length ? [`${e.nr != null ? `Nr. ${e.nr}${e.suffix}` : "Tier"} ${gruende.join(", ")}`] : [];
  });
}

/** Gültige Auszahlungen des Ausstellers in dieser Schau (stornierte zählen nicht). */
export async function hatAuszahlung(tx: Tx, schauId: number, ausstellerId: number): Promise<number | null> {
  const [a] = await tx
    .select({ nr: auszahlung.quittungNr })
    .from(auszahlung)
    .where(and(eq(auszahlung.schauId, schauId), eq(auszahlung.ausstellerId, ausstellerId), isNull(auszahlung.storniertAm)));
  return a?.nr ?? null;
}
