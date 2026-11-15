CREATE TABLE "rassebild" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"rasse" text NOT NULL,
	"mime" text NOT NULL,
	"daten" "bytea" NOT NULL,
	"breite" integer NOT NULL,
	"hoehe" integer NOT NULL,
	"urheber" text DEFAULT '' NOT NULL,
	"lizenz" text DEFAULT '' NOT NULL,
	"lizenz_url" text DEFAULT '' NOT NULL,
	"quelle" text DEFAULT '' NOT NULL,
	"geprueft" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rassebild" ADD CONSTRAINT "rassebild_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rassebild_org_rasse" ON "rassebild" USING btree ("organisation_id","rasse");