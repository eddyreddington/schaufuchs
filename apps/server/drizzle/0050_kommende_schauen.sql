CREATE TABLE "schautermin" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"ort" text DEFAULT '' NOT NULL,
	"von" date NOT NULL,
	"bis" date,
	"ebene" text NOT NULL,
	"kreisverband" text DEFAULT '' NOT NULL,
	"landesverband" text DEFAULT '' NOT NULL,
	"quelle" text DEFAULT '' NOT NULL,
	"quelle_url" text DEFAULT '' NOT NULL,
	"abo_id" integer,
	"uid" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'uebernommen' NOT NULL,
	"abweichung" jsonb,
	"abgerufen_am" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminabo" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"ebene" text NOT NULL,
	"kreisverband" text DEFAULT '' NOT NULL,
	"landesverband" text DEFAULT '' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"letzter_abruf" timestamp with time zone,
	"letzter_erfolg" timestamp with time zone,
	"letzter_fehler" text DEFAULT '' NOT NULL,
	"anzahl" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "termine_kreis" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "termine_land" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "termine_veroeffentlichen" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schautermin" ADD CONSTRAINT "schautermin_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schautermin" ADD CONSTRAINT "schautermin_abo_id_terminabo_id_fk" FOREIGN KEY ("abo_id") REFERENCES "public"."terminabo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminabo" ADD CONSTRAINT "terminabo_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schautermin_org_von_idx" ON "schautermin" USING btree ("organisation_id","von");--> statement-breakpoint
CREATE UNIQUE INDEX "schautermin_abo_uid" ON "schautermin" USING btree ("abo_id","uid");--> statement-breakpoint
CREATE INDEX "terminabo_org_idx" ON "terminabo" USING btree ("organisation_id");