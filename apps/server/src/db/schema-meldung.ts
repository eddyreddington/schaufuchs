/** Aussteller und Meldungen: Aussteller, Meldung, Zahlung des Meldegelds, Katalogeinträge (Tiere). Über schema.ts exportiert. */
import { type KaefigTyp } from "@schau/domain";
import { boolean, date, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { geheimText } from "./geheim";
import { alterEnum, eingangEnum, eintragStatusEnum, meldeartEnum, meldungStatusEnum, zahlartEnum } from "./schema-aufzaehlungen";
import { benutzer, farbenschlag, organisation, rasse } from "./schema-mandant";
import { schau } from "./schema-schau";
import { created, createdNachSperre, ts } from "./spalten";

// ── Aussteller und Meldungen ───────────────────────────────────────────

export const aussteller = pgTable(
  "aussteller",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id").notNull().references(() => organisation.id),
    vorname: text("vorname").notNull(),
    nachname: text("nachname").notNull(),
    strasse: text("strasse").notNull().default(""),
    plz: text("plz").notNull().default(""),
    ort: text("ort").notNull().default(""),
    telefon: text("telefon").notNull().default(""),
    email: text("email").notNull().default(""),
    verein: text("verein").notNull().default(""),
    kreisverband: text("kreisverband").notNull().default(""),
    /** Registriernummer nach Viehverkehrsordnung. */
    registriernummer: text("registriernummer").notNull().default(""),
    geburtsdatum: date("geburtsdatum"),
    istPreisrichter: boolean("ist_preisrichter").notNull().default(false),
    /** Vereinsmitglied von Hand gesetzt; null: nach der Vereinsangabe (Schreibweisen unter `organisation.vereinsnamen`). */
    mitglied: boolean("mitglied"),
    /**
     * Test-Aussteller: gehört nur zu dieser Testschau und verschwindet mit ihr (Kaskade). null = echter Aussteller des
     * Vereins. Echte Schauen sehen nur echte, eine Testschau nur ihre eigenen (services/testschau.ts).
     */
    testSchauId: integer("test_schau_id").references(() => schau.id, { onDelete: "cascade" }),
    /** Für die Überweisung von Preisgeld und Verkaufserlös (freiwillig). */
    // Verschlüsselt und an die Zeile gebunden (db/geheim.ts) – schreiben nur über bankdatenFuer().
    iban: geheimText("iban", "aussteller.iban", { zeile: true }).notNull().default(""),
    kontoinhaber: geheimText("kontoinhaber", "aussteller.kontoinhaber", { zeile: true }).notNull().default(""),
    /** Löschung verlangt, aber Aufbewahrungsfrist läuft: Daten gesperrt (Art. 18 DSGVO), gelöscht ab loeschenAb. */
    gesperrtAm: ts("gesperrt_am"),
    loeschenAb: date("loeschen_ab"),
    geloeschtAm: ts("geloescht_am"),
    createdAt: created(),
  },
  (t) => [index("aussteller_name_idx").on(t.nachname, t.vorname), index("aussteller_test_schau_idx").on(t.testSchauId)],
);

export const meldung = pgTable(
  "meldung",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    ausstellerId: integer("aussteller_id").notNull().references(() => aussteller.id),
    eingang: eingangEnum("eingang").notNull(),
    eingegangenAm: ts("eingegangen_am").notNull().defaultNow(),
    istJugend: boolean("ist_jugend").notNull().default(false),
    /** Teilschau der Meldung (Kennung aus schau.teilschauen); leer bzw. unbekannt = die erste. */
    teilschau: text("teilschau"),
    /** Preisrichter-Befreiung für genau diese Meldung (nicht am Stammsatz – sonst änderte sie frühere Schauen rückwirkend). */
    istPreisrichter: boolean("ist_preisrichter").notNull().default(false),
    /** Meldebogen unterschrieben bzw. AAB online anerkannt – Voraussetzung für den Namen im Katalog. */
    zustimmungAm: ts("zustimmung_am"),
    /** Freiwillige Einwilligung in die Veröffentlichung im Internet (Ergebnisse, Online-Katalog); widerruflich. */
    onlineZustimmungAm: ts("online_zustimmung_am"),
    /** Bei Jugendmeldungen: Erziehungsberechtigter, der mit der Meldung einverstanden ist. */
    erziehungsberechtigter: text("erziehungsberechtigter").notNull().default(""),
    status: meldungStatusEnum("status").notNull().default("offen"),
    bemerkung: text("bemerkung").notNull().default(""),
    /** Geheimer Link-Schlüssel, mit dem der Aussteller seine Meldung ansieht. */
    zugangsToken: text("zugangs_token").notNull().unique(),
    /** Sprache der Mails an den Aussteller zu dieser Meldung (Entscheidung 020); online die Sprache des Formulars. */
    sprache: text("sprache").notNull().default("de"),
    /** ND-Impfung (Hühner, Puten). */
    vetImpfdatum: date("vet_impfdatum"),
    vetImpfstoff: text("vet_impfstoff").notNull().default(""),
    vetTierarzt: text("vet_tierarzt").notNull().default(""),
    /** PMV-Impfung (Tauben). */
    pmvImpfdatum: date("pmv_impfdatum"),
    pmvImpfstoff: text("pmv_impfstoff").notNull().default(""),
    pmvTierarzt: text("pmv_tierarzt").notNull().default(""),
    /** Wassergeflügel: virologische Untersuchung (Labor) oder Sentinel-Bestätigung (Behörde). */
    wgDatum: date("wg_datum"),
    wgSentinel: boolean("wg_sentinel").notNull().default(false),
    wgStelle: text("wg_stelle").notNull().default(""),
    /** Tierärztliche Bescheinigung der klinischen Untersuchung (§ 7 Abs. 1 GeflPestSchV), wenn die Schau sie verlangt. */
    klDatum: date("kl_datum"),
    klTierarzt: text("kl_tierarzt").notNull().default(""),
    /** Herkunft im Ausland: amtliches Gesundheitszertifikat bzw. TRACES-NT-Meldung. */
    gzDatum: date("gz_datum"),
    gzNummer: text("gz_nummer").notNull().default(""),
    /** Alle nötigen Nachweise liegen vor und sind geprüft. */
    vetGeprueftAm: ts("vet_geprueft_am"),
    /** Pflichterklärungen der Schau abgegeben (online angekreuzt bzw. auf dem Meldebogen unterschrieben). */
    erklaerungenAm: ts("erklaerungen_am"),
    /**
     * Verfall: Meldegeld einer stornierten oder abgelehnten Meldung, das der Verein behält (z. B. Rücktritt nach dem
     * Meldeschluss laut AAB) – mit Grund. Ohne Verfall oder Erstattung hält die Zahlung den Abschluss der Schau auf.
     */
    /**
     * Widerspruch gegen die Nennung im Katalog (Art. 21 DSGVO): Name, Ort und Verein stehen dann weder im Druck noch
     * online – die Zustimmung zu den Ausstellungsbestimmungen bleibt davon unberührt.
     */
    namenWiderspruchAm: ts("namen_widerspruch_am"),
    verfallenCent: integer("verfallen_cent").notNull().default(0),
    verfallGrund: text("verfall_grund").notNull().default(""),
    verfallenAm: ts("verfallen_am"),
    /**
     * Kennung des Formulars, das die Meldung angelegt hat (beim Öffnen erzeugt). Kommt dieselbe Anfrage noch einmal
     * (verlorene Antwort, zweiter Klick), liefert der Server die schon angelegte Meldung statt einer zweiten (Entscheidung 033).
     */
    anfrageId: text("anfrage_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("meldung_schau_aussteller").on(t.schauId, t.ausstellerId), uniqueIndex("meldung_schau_anfrage").on(t.schauId, t.anfrageId)],
);

export const zahlung = pgTable(
  "zahlung",
  {
    id: serial("id").primaryKey(),
    meldungId: integer("meldung_id").notNull().references(() => meldung.id, { onDelete: "cascade" }),
    betragCent: integer("betrag_cent").notNull(),
    datum: date("datum").notNull(),
    art: zahlartEnum("art").notNull().default("ueberweisung"),
    erfasstVon: integer("erfasst_von").references(() => benutzer.id),
    /** Grund (Pflicht bei Erstattung und Storno). */
    grund: text("grund").notNull().default(""),
    /** Gegenbuchung zu dieser Zahlung (Storno statt Löschen – Kassendaten bleiben unverändert). */
    stornoVon: integer("storno_von"),
    /**
     * Aus dem Kontoauszug gebucht (Entscheidung 023): Fingerabdruck der Gutschrift (SHA-256 aus Datum, Betrag, IBAN,
     * Verwendungszweck), damit ein zweimal hochgeladener Auszug nichts doppelt bucht. Kein Klartext vom Auszug.
     */
    bankBuchung: text("bank_buchung"),
    createdAt: createdNachSperre(),
  },
  (t) => [uniqueIndex("zahlung_bank_buchung").on(t.bankBuchung)],
);

export const katalogeintrag = pgTable(
  "katalogeintrag",
  {
    id: serial("id").primaryKey(),
    schauId: integer("schau_id").notNull().references(() => schau.id, { onDelete: "cascade" }),
    meldungId: integer("meldung_id").notNull().references(() => meldung.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    farbenschlagId: integer("farbenschlag_id").references(() => farbenschlag.id),
    /** Bezeichnung, wenn nicht im Verzeichnis (AOC, Neuzüchtung). */
    freitext: text("freitext").notNull().default(""),
    /** Bei freier Bezeichnung: Rasse, bei der das Tier im Katalog eingeordnet wird. */
    rasseId: integer("rasse_id").references(() => rasse.id),
    art: meldeartEnum("art").notNull().default("einzeltier"),
    geschlecht: text("geschlecht").notNull().default("1,0"),
    alter: alterEnum("alter").notNull().default("jung"),
    istAoc: boolean("ist_aoc").notNull().default(false),
    istNeuzuechtung: boolean("ist_neuzuechtung").notNull().default(false),
    eigeneZucht: boolean("eigene_zucht").notNull().default(true),
    verkaufspreisCent: integer("verkaufspreis_cent"),
    katalogNr: integer("katalog_nr"),
    suffix: text("suffix").notNull().default(""),
    kaefig: text("kaefig").notNull().default(""),
    /** Für dieses Tier gewählte Käfiggröße (z. B. nur noch ein Großkäfig frei); null = automatisch. */
    kaefigWahl: text("kaefig_wahl").$type<KaefigTyp>(),
    /** Käfigblock bei der Nummernvergabe – Nachmeldungen werden danach eingeordnet, auch wenn sich Regeln später ändern. */
    kaefigBlock: text("kaefig_block").$type<KaefigTyp>(),
    /** Zählt jede Bewertungsänderung und jedes Zurücksetzen – das Tablet erkennt so Änderungen anderer (monoton). */
    bewertungVersion: integer("bewertung_version").notNull().default(0),
    ringnummern: text("ringnummern").notNull().default(""),
    status: eintragStatusEnum("status").notNull().default("gemeldet"),
    createdAt: created(),
  },
  (t) => [
    index("eintrag_schau_idx").on(t.schauId),
    index("eintrag_meldung_idx").on(t.meldungId),
    uniqueIndex("eintrag_katalognr").on(t.schauId, t.katalogNr, t.suffix),
  ],
);
