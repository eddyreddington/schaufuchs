/** Mandant (Verein) mit Benutzern und Sitzungen; Stammdaten des Verzeichnisses (Sparten, Rassen, Farbenschläge je Version). Über schema.ts exportiert. */
import { type Steuerstatus } from "@schau/domain";
import { boolean, index, integer, jsonb, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { geheimText } from "./geheim";
import { rolleEnum } from "./schema-aufzaehlungen";
import { preisrichter } from "./schema-bewertung";
import { created, ts } from "./spalten";

// ── Mandant und Benutzer ───────────────────────────────────────────────

/** Ein Verein oder Verband, der Schauen ausrichtet. Grundlage für Mandantenfähigkeit. */
export const organisation = pgTable("organisation", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Impressum (§ 5 DDG) und Datenschutzhinweise (Art. 13 DSGVO) – der Verein ist Anbieter und Verantwortlicher.
  anschrift: text("anschrift").notNull().default(""),
  email: text("email").notNull().default(""),
  telefon: text("telefon").notNull().default(""),
  vertretung: text("vertretung").notNull().default(""),
  register: text("register").notNull().default(""),
  inhaltVerantwortlich: text("inhalt_verantwortlich").notNull().default(""),
  datenschutzbeauftragter: text("datenschutzbeauftragter").notNull().default(""),
  impressumZusatz: text("impressum_zusatz").notNull().default(""),
  datenschutzZusatz: text("datenschutz_zusatz").notNull().default(""),
  /** Eigener Text des Vereins – ersetzt das Muster aus der Software. */
  datenschutzText: text("datenschutz_text").notNull().default(""),
  /** Schreibweisen des eigenen Vereinsnamens in den Meldungen: Aussteller damit gelten als Vereinsmitglied. */
  vereinsnamen: jsonb("vereinsnamen").$type<string[]>().notNull().default([]),
  /** Eigene Schauen als iCal-Kalender veröffentlichen (/o/:id/schauen.ics) – andere Vereine abonnieren ihn für „Kommende Schauen“. */
  termineVeroeffentlichen: boolean("termine_veroeffentlichen").notNull().default(true),
  /** Automatische Abmeldung nach so vielen Minuten ohne Eingabe, je Rolle (packages/domain/src/abmeldung.ts); null = Vorgabe. */
  abmeldung: jsonb("abmeldung").$type<Partial<Record<"admin" | "mitarbeiter" | "preisrichter", number>>>(),
  /** Steuerliche Angaben für Zuwendungsbestätigungen (packages/domain/src/spenden.ts); null = nicht eingetragen. */
  steuer: jsonb("steuer").$type<Steuerstatus>(),
  /** Gläubiger-Identifikationsnummer für SEPA-Lastschriften (Entscheidung 018); leer = keine Lastschrift. */
  glaeubigerId: text("glaeubiger_id").notNull().default(""),
  /**
   * Gelernte Zuordnungen des Imports: Schreibweise aus der Datei (suchNorm von Rasse und Farbenschlag) → Rasse und
   * Farbenschlag im Verzeichnis, mit Namen statt Nummern (die gelten je Verzeichnisversion).
   */
  importZuordnungen: jsonb("import_zuordnungen").$type<Record<string, { rasse: string; farbenschlag: string }>>().notNull().default({}),
  createdAt: created(),
});

export const benutzer = pgTable(
  "benutzer",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id").notNull().references(() => organisation.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwortHash: text("passwort_hash").notNull(),
    rolle: rolleEnum("rolle").notNull().default("mitarbeiter"),
    aktiv: boolean("aktiv").notNull().default(true),
    /** Zwei-Faktor-Anmeldung (TOTP): Schlüssel in Base32, gesetzt schon während der Einrichtung. */
    totpGeheim: geheimText("totp_geheim", "benutzer.totpGeheim"), // verschlüsselt (db/geheim.ts)
    /** Erst mit der Bestätigung durch einen gültigen Code aktiv. */
    totpAktivSeit: ts("totp_aktiv_seit"),
    /** Zuletzt angenommener Zeitschritt – ein Code gilt nur einmal. */
    totpLetzterSchritt: integer("totp_letzter_schritt").notNull().default(0),
    /** SHA-256 der noch nicht benutzten Notfallcodes. */
    totpNotfall: jsonb("totp_notfall").$type<string[]>().notNull().default([]),
    /**
     * Entfernt, obwohl der Benutzer Spuren in Protokoll oder Kasse hat: Anmeldung, E-Mail, Passwort und 2FA sind weg,
     * nur der Name bleibt für die Nachvollziehbarkeit. Ohne Spuren wird der Datensatz ganz gelöscht.
     */
    geloeschtAm: ts("geloescht_am"),
    /**
     * Einladung: SHA-256 des Links, mit dem die Person ihr Passwort selbst festlegt (nur einmal, bis einladungBis).
     * Solange sie nicht angenommen ist, steht als Passwort-Hash "-" – eine Anmeldung ist dann nicht möglich.
     */
    einladungHash: text("einladung_hash"),
    einladungBis: ts("einladung_bis"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("benutzer_email_idx").on(t.email), uniqueIndex("benutzer_einladung_idx").on(t.einladungHash)],
);

export const sitzung = pgTable("sitzung", {
  /** SHA-256 des Tokens aus dem Cookie. */
  id: text("id").primaryKey(),
  benutzerId: integer("benutzer_id").references(() => benutzer.id, { onDelete: "cascade" }),
  preisrichterId: integer("preisrichter_id").references(() => preisrichter.id, { onDelete: "cascade" }),
  laeuftAb: ts("laeuft_ab").notNull(),
  /** Letzte Eingabe in dieser Sitzung – für die automatische Abmeldung nach Untätigkeit. */
  zuletzt: ts("zuletzt").notNull().defaultNow(),
  createdAt: created(),
});

// ── Stammdaten (je Jahr versioniert) ───────────────────────────────────

export const stammdatenVersion = pgTable("stammdaten_version", {
  id: serial("id").primaryKey(),
  /** Verein, der die Version eingespielt hat. null = vom Betreiber für alle Vereine bereitgestellt. */
  organisationId: integer("organisation_id").references(() => organisation.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jahr: integer("jahr").notNull(),
  quelle: text("quelle").notNull().default(""),
  createdAt: created(),
});

export const sparte = pgTable("sparte", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  folge: integer("folge").notNull(),
});

export const rasse = pgTable(
  "rasse",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
    sparteId: integer("sparte_id").notNull().references(() => sparte.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folge: integer("folge").notNull(),
  },
  (t) => [index("rasse_version_idx").on(t.versionId)],
);

export const farbenschlag = pgTable(
  "farbenschlag",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id").notNull().references(() => stammdatenVersion.id, { onDelete: "cascade" }),
    rasseId: integer("rasse_id").notNull().references(() => rasse.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folge: integer("folge").notNull(),
  },
  (t) => [index("farbenschlag_rasse_idx").on(t.rasseId), index("farbenschlag_version_idx").on(t.versionId, t.folge)],
);
