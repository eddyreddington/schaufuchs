CREATE TYPE "public"."alter" AS ENUM('jung', 'alt');--> statement-breakpoint
CREATE TYPE "public"."eingang" AS ENUM('online', 'papier', 'email');--> statement-breakpoint
CREATE TYPE "public"."eintrag_status" AS ENUM('gemeldet', 'katalogisiert', 'eingeliefert', 'fehlt', 'ausgesetzt');--> statement-breakpoint
CREATE TYPE "public"."erfasst_auf" AS ENUM('tablet', 'pc');--> statement-breakpoint
CREATE TYPE "public"."gebuehr_art" AS ENUM('einzeltier', 'stamm', 'voliere', 'bruteier', 'katalog', 'kostenanteil');--> statement-breakpoint
CREATE TYPE "public"."meldeart" AS ENUM('einzeltier', 'stamm', 'voliere', 'bruteier');--> statement-breakpoint
CREATE TYPE "public"."meldung_status" AS ENUM('offen', 'bestaetigt', 'abgelehnt', 'storniert');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('vorbereitung', 'meldung', 'katalog', 'einlieferung', 'bewertung', 'preise', 'schau', 'abrechnung', 'abgeschlossen');--> statement-breakpoint
CREATE TYPE "public"."preis_quelle" AS ENUM('standgeld', 'stiftung');--> statement-breakpoint
CREATE TYPE "public"."rolle" AS ENUM('admin', 'mitarbeiter');--> statement-breakpoint
CREATE TYPE "public"."sondernote" AS ENUM('oB', 'u');--> statement-breakpoint
CREATE TYPE "public"."zahlart" AS ENUM('ueberweisung', 'bar', 'sonstige');--> statement-breakpoint
CREATE TABLE "aenderung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer,
	"tabelle" text NOT NULL,
	"datensatz_id" integer,
	"aktion" text NOT NULL,
	"alt" jsonb,
	"neu" jsonb,
	"benutzer_id" integer,
	"preisrichter_id" integer,
	"wer" text DEFAULT '' NOT NULL,
	"grund" text DEFAULT '' NOT NULL,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aussteller" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"vorname" text NOT NULL,
	"nachname" text NOT NULL,
	"strasse" text DEFAULT '' NOT NULL,
	"plz" text DEFAULT '' NOT NULL,
	"ort" text DEFAULT '' NOT NULL,
	"telefon" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"verein" text DEFAULT '' NOT NULL,
	"kreisverband" text DEFAULT '' NOT NULL,
	"registriernummer" text DEFAULT '' NOT NULL,
	"geburtsdatum" date,
	"ist_preisrichter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auszahlung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"aussteller_id" integer NOT NULL,
	"betrag_cent" integer NOT NULL,
	"quittung_nr" integer NOT NULL,
	"ausgezahlt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benutzer" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passwort_hash" text NOT NULL,
	"rolle" "rolle" DEFAULT 'mitarbeiter' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bewertung" (
	"id" serial PRIMARY KEY NOT NULL,
	"katalogeintrag_id" integer NOT NULL,
	"preisrichter_id" integer,
	"punkte" integer,
	"sondernote" "sondernote",
	"vorzuege" text DEFAULT '' NOT NULL,
	"wuensche" text DEFAULT '' NOT NULL,
	"maengel" text DEFAULT '' NOT NULL,
	"erfasst_auf" "erfasst_auf" DEFAULT 'pc' NOT NULL,
	"geraet_zeit" timestamp with time zone DEFAULT now() NOT NULL,
	"obmann_bestaetigt_von" integer,
	"obmann_bestaetigt_am" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bewertung_katalogeintrag_id_unique" UNIQUE("katalogeintrag_id")
);
--> statement-breakpoint
CREATE TABLE "farbenschlag" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"rasse_id" integer NOT NULL,
	"name" text NOT NULL,
	"folge" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gebuehr" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"art" "gebuehr_art" NOT NULL,
	"jugend" boolean DEFAULT false NOT NULL,
	"betrag_cent" integer NOT NULL,
	"befreit_preisrichter" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "katalogeintrag" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"meldung_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"farbenschlag_id" integer,
	"freitext" text DEFAULT '' NOT NULL,
	"art" "meldeart" DEFAULT 'einzeltier' NOT NULL,
	"geschlecht" text DEFAULT '1,0' NOT NULL,
	"alter" "alter" DEFAULT 'jung' NOT NULL,
	"ist_aoc" boolean DEFAULT false NOT NULL,
	"ist_neuzuechtung" boolean DEFAULT false NOT NULL,
	"eigene_zucht" boolean DEFAULT true NOT NULL,
	"verkaufspreis_cent" integer,
	"katalog_nr" integer,
	"suffix" text DEFAULT '' NOT NULL,
	"kaefig" text DEFAULT '' NOT NULL,
	"ringnummern" text DEFAULT '' NOT NULL,
	"status" "eintrag_status" DEFAULT 'gemeldet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meldung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"aussteller_id" integer NOT NULL,
	"eingang" "eingang" NOT NULL,
	"eingegangen_am" timestamp with time zone DEFAULT now() NOT NULL,
	"ist_jugend" boolean DEFAULT false NOT NULL,
	"zustimmung_am" timestamp with time zone,
	"status" "meldung_status" DEFAULT 'offen' NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"zugangs_token" text NOT NULL,
	"vet_impfdatum" date,
	"vet_impfstoff" text DEFAULT '' NOT NULL,
	"vet_tierarzt" text DEFAULT '' NOT NULL,
	"vet_geprueft_am" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meldung_zugangs_token_unique" UNIQUE("zugangs_token")
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postausgang" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"an" text NOT NULL,
	"betreff" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'wartet' NOT NULL,
	"fehler" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gesendet_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pr_einteilung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"preisrichter_id" integer NOT NULL,
	"von_nr" integer NOT NULL,
	"bis_nr" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preisart" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"kuerzel" text NOT NULL,
	"name" text NOT NULL,
	"betrag_cent" integer DEFAULT 0 NOT NULL,
	"sachpreis" text DEFAULT '' NOT NULL,
	"quelle" "preis_quelle" DEFAULT 'standgeld' NOT NULL,
	"schluessel_pro_tiere" integer,
	"anzahl_pro_schluessel" integer DEFAULT 1 NOT NULL,
	"anzahl_pro_preisrichter" integer DEFAULT 0 NOT NULL,
	"mindestpunkte" integer,
	"folge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preisrichter" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"name" text NOT NULL,
	"anschrift" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"telefon" text DEFAULT '' NOT NULL,
	"pin_hash" text,
	"ist_obmann" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preisvergabe" (
	"id" serial PRIMARY KEY NOT NULL,
	"katalogeintrag_id" integer NOT NULL,
	"preisart_id" integer NOT NULL,
	"preisrichter_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rasse" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"sparte_id" integer NOT NULL,
	"name" text NOT NULL,
	"folge" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schau" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"veranstalter" text DEFAULT '' NOT NULL,
	"ort" text DEFAULT '' NOT NULL,
	"meldeschluss" date,
	"einlieferung" text DEFAULT '' NOT NULL,
	"bewertung_am" date,
	"oeffnungszeiten" text DEFAULT '' NOT NULL,
	"aussetzen" text DEFAULT '' NOT NULL,
	"reklamationsfrist" date,
	"kapazitaet" integer,
	"phase" "phase" DEFAULT 'vorbereitung' NOT NULL,
	"stammdaten_version_id" integer,
	"provision_bp" integer DEFAULT 1500 NOT NULL,
	"katalog_start" integer DEFAULT 1 NOT NULL,
	"jugend_separat" boolean DEFAULT true NOT NULL,
	"katalog_gedruckt" boolean DEFAULT false NOT NULL,
	"ergebnisse_freigegeben" boolean DEFAULT false NOT NULL,
	"bestimmungen" text DEFAULT '' NOT NULL,
	"bankverbindung" text DEFAULT '' NOT NULL,
	"kontakt_email" text DEFAULT '' NOT NULL,
	"notenskala" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schau_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sitzung" (
	"id" text PRIMARY KEY NOT NULL,
	"benutzer_id" integer,
	"preisrichter_id" integer,
	"laeuft_ab" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sparte" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"name" text NOT NULL,
	"folge" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stammdaten_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"jahr" integer NOT NULL,
	"quelle" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stiftung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"stifter" text NOT NULL,
	"meldung_id" integer,
	"preisart_id" integer,
	"anzahl" integer DEFAULT 1 NOT NULL,
	"betrag_cent" integer DEFAULT 0 NOT NULL,
	"vorgabe" text DEFAULT '' NOT NULL,
	"eingegangen_am" date
);
--> statement-breakpoint
CREATE TABLE "textbaustein" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"kategorie" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verkauf" (
	"id" serial PRIMARY KEY NOT NULL,
	"katalogeintrag_id" integer NOT NULL,
	"kaeufer_name" text NOT NULL,
	"kaeufer_anschrift" text DEFAULT '' NOT NULL,
	"kaeufer_registriernummer" text NOT NULL,
	"preis_cent" integer NOT NULL,
	"provision_cent" integer NOT NULL,
	"beleg_nr" integer NOT NULL,
	"verkauft_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verkauf_katalogeintrag_id_unique" UNIQUE("katalogeintrag_id")
);
--> statement-breakpoint
CREATE TABLE "zahlung" (
	"id" serial PRIMARY KEY NOT NULL,
	"meldung_id" integer NOT NULL,
	"betrag_cent" integer NOT NULL,
	"datum" date NOT NULL,
	"art" "zahlart" DEFAULT 'ueberweisung' NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aenderung" ADD CONSTRAINT "aenderung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aenderung" ADD CONSTRAINT "aenderung_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aenderung" ADD CONSTRAINT "aenderung_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aussteller" ADD CONSTRAINT "aussteller_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD CONSTRAINT "auszahlung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD CONSTRAINT "auszahlung_aussteller_id_aussteller_id_fk" FOREIGN KEY ("aussteller_id") REFERENCES "public"."aussteller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD CONSTRAINT "auszahlung_ausgezahlt_von_benutzer_id_fk" FOREIGN KEY ("ausgezahlt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benutzer" ADD CONSTRAINT "benutzer_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung" ADD CONSTRAINT "bewertung_katalogeintrag_id_katalogeintrag_id_fk" FOREIGN KEY ("katalogeintrag_id") REFERENCES "public"."katalogeintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung" ADD CONSTRAINT "bewertung_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bewertung" ADD CONSTRAINT "bewertung_obmann_bestaetigt_von_preisrichter_id_fk" FOREIGN KEY ("obmann_bestaetigt_von") REFERENCES "public"."preisrichter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farbenschlag" ADD CONSTRAINT "farbenschlag_version_id_stammdaten_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."stammdaten_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farbenschlag" ADD CONSTRAINT "farbenschlag_rasse_id_rasse_id_fk" FOREIGN KEY ("rasse_id") REFERENCES "public"."rasse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gebuehr" ADD CONSTRAINT "gebuehr_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalogeintrag" ADD CONSTRAINT "katalogeintrag_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalogeintrag" ADD CONSTRAINT "katalogeintrag_meldung_id_meldung_id_fk" FOREIGN KEY ("meldung_id") REFERENCES "public"."meldung"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalogeintrag" ADD CONSTRAINT "katalogeintrag_farbenschlag_id_farbenschlag_id_fk" FOREIGN KEY ("farbenschlag_id") REFERENCES "public"."farbenschlag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meldung" ADD CONSTRAINT "meldung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meldung" ADD CONSTRAINT "meldung_aussteller_id_aussteller_id_fk" FOREIGN KEY ("aussteller_id") REFERENCES "public"."aussteller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postausgang" ADD CONSTRAINT "postausgang_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_einteilung" ADD CONSTRAINT "pr_einteilung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_einteilung" ADD CONSTRAINT "pr_einteilung_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preisart" ADD CONSTRAINT "preisart_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD CONSTRAINT "preisrichter_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preisvergabe" ADD CONSTRAINT "preisvergabe_katalogeintrag_id_katalogeintrag_id_fk" FOREIGN KEY ("katalogeintrag_id") REFERENCES "public"."katalogeintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preisvergabe" ADD CONSTRAINT "preisvergabe_preisart_id_preisart_id_fk" FOREIGN KEY ("preisart_id") REFERENCES "public"."preisart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preisvergabe" ADD CONSTRAINT "preisvergabe_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rasse" ADD CONSTRAINT "rasse_version_id_stammdaten_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."stammdaten_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rasse" ADD CONSTRAINT "rasse_sparte_id_sparte_id_fk" FOREIGN KEY ("sparte_id") REFERENCES "public"."sparte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schau" ADD CONSTRAINT "schau_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schau" ADD CONSTRAINT "schau_stammdaten_version_id_stammdaten_version_id_fk" FOREIGN KEY ("stammdaten_version_id") REFERENCES "public"."stammdaten_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitzung" ADD CONSTRAINT "sitzung_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitzung" ADD CONSTRAINT "sitzung_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sparte" ADD CONSTRAINT "sparte_version_id_stammdaten_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."stammdaten_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stiftung" ADD CONSTRAINT "stiftung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stiftung" ADD CONSTRAINT "stiftung_meldung_id_meldung_id_fk" FOREIGN KEY ("meldung_id") REFERENCES "public"."meldung"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stiftung" ADD CONSTRAINT "stiftung_preisart_id_preisart_id_fk" FOREIGN KEY ("preisart_id") REFERENCES "public"."preisart"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbaustein" ADD CONSTRAINT "textbaustein_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verkauf" ADD CONSTRAINT "verkauf_katalogeintrag_id_katalogeintrag_id_fk" FOREIGN KEY ("katalogeintrag_id") REFERENCES "public"."katalogeintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verkauf" ADD CONSTRAINT "verkauf_verkauft_von_benutzer_id_fk" FOREIGN KEY ("verkauft_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlung" ADD CONSTRAINT "zahlung_meldung_id_meldung_id_fk" FOREIGN KEY ("meldung_id") REFERENCES "public"."meldung"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlung" ADD CONSTRAINT "zahlung_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aenderung_schau_idx" ON "aenderung" USING btree ("schau_id","zeitpunkt");--> statement-breakpoint
CREATE INDEX "aussteller_name_idx" ON "aussteller" USING btree ("nachname","vorname");--> statement-breakpoint
CREATE UNIQUE INDEX "auszahlung_unique" ON "auszahlung" USING btree ("schau_id","aussteller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_email_idx" ON "benutzer" USING btree ("email");--> statement-breakpoint
CREATE INDEX "farbenschlag_rasse_idx" ON "farbenschlag" USING btree ("rasse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gebuehr_unique" ON "gebuehr" USING btree ("schau_id","art","jugend");--> statement-breakpoint
CREATE INDEX "eintrag_schau_idx" ON "katalogeintrag" USING btree ("schau_id");--> statement-breakpoint
CREATE INDEX "eintrag_meldung_idx" ON "katalogeintrag" USING btree ("meldung_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eintrag_katalognr" ON "katalogeintrag" USING btree ("schau_id","katalog_nr","suffix");--> statement-breakpoint
CREATE UNIQUE INDEX "meldung_schau_aussteller" ON "meldung" USING btree ("schau_id","aussteller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preisvergabe_unique" ON "preisvergabe" USING btree ("katalogeintrag_id","preisart_id");--> statement-breakpoint
CREATE INDEX "rasse_version_idx" ON "rasse" USING btree ("version_id");