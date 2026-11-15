CREATE TABLE "hallenentwurf" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"schau_id" integer,
	"name" text NOT NULL,
	"halle" jsonb NOT NULL,
	"archiviert" boolean DEFAULT false NOT NULL,
	"herkunft" text DEFAULT '' NOT NULL,
	"erstellt_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archiviert_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hallenentwurf" ADD CONSTRAINT "hallenentwurf_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallenentwurf" ADD CONSTRAINT "hallenentwurf_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallenentwurf" ADD CONSTRAINT "hallenentwurf_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hallenentwurf_org_idx" ON "hallenentwurf" USING btree ("organisation_id","archiviert");