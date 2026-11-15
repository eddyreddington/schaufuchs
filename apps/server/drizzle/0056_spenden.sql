CREATE TABLE "bestaetigung_spende" (
	"bestaetigung_id" integer NOT NULL,
	"spende_id" integer NOT NULL,
	CONSTRAINT "bestaetigung_spende_bestaetigung_id_spende_id_pk" PRIMARY KEY("bestaetigung_id","spende_id")
);
--> statement-breakpoint
CREATE TABLE "spende" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"spender_id" integer NOT NULL,
	"art" text NOT NULL,
	"weg" text NOT NULL,
	"betrag_cent" integer NOT NULL,
	"datum" date,
	"meldung_id" integer,
	"zweck" text DEFAULT '' NOT NULL,
	"sache" jsonb,
	"gegenleistung" boolean DEFAULT false NOT NULL,
	"verzicht_aufwand" boolean DEFAULT false NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"storniert_am" timestamp with time zone,
	"storniert_von" integer,
	"storno_grund" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spender" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"ist_firma" boolean DEFAULT false NOT NULL,
	"vorname" text DEFAULT '' NOT NULL,
	"nachname" text NOT NULL,
	"strasse" text DEFAULT '' NOT NULL,
	"plz" text DEFAULT '' NOT NULL,
	"ort" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"aussteller_id" integer,
	"nennung_name" boolean DEFAULT false NOT NULL,
	"nennung_betrag" boolean DEFAULT false NOT NULL,
	"notiz" text DEFAULT '' NOT NULL,
	"test_schau_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zuwendungsbestaetigung" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"nummer" integer NOT NULL,
	"spender_id" integer NOT NULL,
	"art" text NOT NULL,
	"betrag_cent" integer NOT NULL,
	"pdf" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storniert_am" timestamp with time zone,
	"storniert_von" integer,
	"storno_grund" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "steuer" jsonb;--> statement-breakpoint
ALTER TABLE "bestaetigung_spende" ADD CONSTRAINT "bestaetigung_spende_bestaetigung_id_zuwendungsbestaetigung_id_fk" FOREIGN KEY ("bestaetigung_id") REFERENCES "public"."zuwendungsbestaetigung"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bestaetigung_spende" ADD CONSTRAINT "bestaetigung_spende_spende_id_spende_id_fk" FOREIGN KEY ("spende_id") REFERENCES "public"."spende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spende" ADD CONSTRAINT "spende_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spende" ADD CONSTRAINT "spende_spender_id_spender_id_fk" FOREIGN KEY ("spender_id") REFERENCES "public"."spender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spende" ADD CONSTRAINT "spende_meldung_id_meldung_id_fk" FOREIGN KEY ("meldung_id") REFERENCES "public"."meldung"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spende" ADD CONSTRAINT "spende_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spende" ADD CONSTRAINT "spende_storniert_von_benutzer_id_fk" FOREIGN KEY ("storniert_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spender" ADD CONSTRAINT "spender_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spender" ADD CONSTRAINT "spender_aussteller_id_aussteller_id_fk" FOREIGN KEY ("aussteller_id") REFERENCES "public"."aussteller"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spender" ADD CONSTRAINT "spender_test_schau_id_schau_id_fk" FOREIGN KEY ("test_schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuwendungsbestaetigung" ADD CONSTRAINT "zuwendungsbestaetigung_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuwendungsbestaetigung" ADD CONSTRAINT "zuwendungsbestaetigung_spender_id_spender_id_fk" FOREIGN KEY ("spender_id") REFERENCES "public"."spender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuwendungsbestaetigung" ADD CONSTRAINT "zuwendungsbestaetigung_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuwendungsbestaetigung" ADD CONSTRAINT "zuwendungsbestaetigung_storniert_von_benutzer_id_fk" FOREIGN KEY ("storniert_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bestaetigung_spende_spende_idx" ON "bestaetigung_spende" USING btree ("spende_id");--> statement-breakpoint
CREATE INDEX "spende_schau_idx" ON "spende" USING btree ("schau_id");--> statement-breakpoint
CREATE INDEX "spende_spender_idx" ON "spende" USING btree ("spender_id");--> statement-breakpoint
CREATE INDEX "spende_meldung_idx" ON "spende" USING btree ("meldung_id");--> statement-breakpoint
CREATE INDEX "spender_name_idx" ON "spender" USING btree ("organisation_id","nachname","vorname");--> statement-breakpoint
CREATE INDEX "spender_aussteller_idx" ON "spender" USING btree ("aussteller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zuwendungsbestaetigung_nummer" ON "zuwendungsbestaetigung" USING btree ("organisation_id","nummer");