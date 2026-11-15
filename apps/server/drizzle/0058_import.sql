CREATE TABLE "importlauf" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"schau_id" integer,
	"art" text NOT NULL,
	"dateiname" text DEFAULT '' NOT NULL,
	"aussteller_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meldung_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anzahl_tiere" integer DEFAULT 0 NOT NULL,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zurueckgenommen_am" timestamp with time zone,
	"zurueckgenommen_von" integer
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "import_zuordnungen" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "importlauf" ADD CONSTRAINT "importlauf_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importlauf" ADD CONSTRAINT "importlauf_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importlauf" ADD CONSTRAINT "importlauf_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importlauf" ADD CONSTRAINT "importlauf_zurueckgenommen_von_benutzer_id_fk" FOREIGN KEY ("zurueckgenommen_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;