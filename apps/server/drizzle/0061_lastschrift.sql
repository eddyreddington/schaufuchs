ALTER TYPE "public"."zahlart" ADD VALUE 'lastschrift';--> statement-breakpoint
CREATE TABLE "lastschrift_lauf" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"nachricht_id" text NOT NULL,
	"faellig_am" date NOT NULL,
	"daten" jsonb NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abgeschlossen_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sepa_mandat" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"aussteller_id" integer NOT NULL,
	"referenz" text NOT NULL,
	"unterschrieben_am" date NOT NULL,
	"wiederkehrend" boolean DEFAULT true NOT NULL,
	"iban" text NOT NULL,
	"kontoinhaber" text NOT NULL,
	"widerrufen_am" date,
	"letzte_nutzung_am" date,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "glaeubiger_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lastschrift_lauf" ADD CONSTRAINT "lastschrift_lauf_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lastschrift_lauf" ADD CONSTRAINT "lastschrift_lauf_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sepa_mandat" ADD CONSTRAINT "sepa_mandat_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sepa_mandat" ADD CONSTRAINT "sepa_mandat_aussteller_id_aussteller_id_fk" FOREIGN KEY ("aussteller_id") REFERENCES "public"."aussteller"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sepa_mandat" ADD CONSTRAINT "sepa_mandat_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lastschrift_lauf_nachricht" ON "lastschrift_lauf" USING btree ("nachricht_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lastschrift_lauf_offen" ON "lastschrift_lauf" USING btree ("schau_id") WHERE status = 'offen';--> statement-breakpoint
CREATE UNIQUE INDEX "sepa_mandat_referenz" ON "sepa_mandat" USING btree ("organisation_id","referenz");--> statement-breakpoint
CREATE INDEX "sepa_mandat_aussteller" ON "sepa_mandat" USING btree ("aussteller_id");