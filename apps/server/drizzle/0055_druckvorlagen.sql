CREATE TABLE "druckvorlage" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"schau_id" integer,
	"art" text NOT NULL,
	"name" text NOT NULL,
	"daten" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "vorlage_bewertungskarte_id" integer;--> statement-breakpoint
ALTER TABLE "druckvorlage" ADD CONSTRAINT "druckvorlage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "druckvorlage" ADD CONSTRAINT "druckvorlage_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schau" ADD CONSTRAINT "schau_vorlage_bewertungskarte_id_druckvorlage_id_fk" FOREIGN KEY ("vorlage_bewertungskarte_id") REFERENCES "public"."druckvorlage"("id") ON DELETE set null ON UPDATE no action;