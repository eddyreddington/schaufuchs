CREATE TABLE "bild" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"rolle" text DEFAULT 'beitrag' NOT NULL,
	"mime" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"daten" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "katalog_beitrag" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"art" text NOT NULL,
	"folge" integer DEFAULT 0 NOT NULL,
	"titel" text DEFAULT '' NOT NULL,
	"unterzeile" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"bild_id" integer,
	"groesse" text DEFAULT 'ganz' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "katalog_gestaltung" (
	"schau_id" integer PRIMARY KEY NOT NULL,
	"format" text DEFAULT 'A5' NOT NULL,
	"untertitel" text DEFAULT '' NOT NULL,
	"schirmherr" text DEFAULT '' NOT NULL,
	"ausstellungsleitung" text DEFAULT '' NOT NULL,
	"eintritt" text DEFAULT '' NOT NULL,
	"farbe" text DEFAULT '#2f5d3a' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bild" ADD CONSTRAINT "bild_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalog_beitrag" ADD CONSTRAINT "katalog_beitrag_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalog_beitrag" ADD CONSTRAINT "katalog_beitrag_bild_id_bild_id_fk" FOREIGN KEY ("bild_id") REFERENCES "public"."bild"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD CONSTRAINT "katalog_gestaltung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bild_schau_idx" ON "bild" USING btree ("schau_id");--> statement-breakpoint
CREATE INDEX "katalog_beitrag_schau_idx" ON "katalog_beitrag" USING btree ("schau_id","art","folge");