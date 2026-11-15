CREATE TABLE "beleg" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"art" text NOT NULL,
	"nummer" integer NOT NULL,
	"pdf" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kassenabschluss" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"datum" date NOT NULL,
	"soll_cent" integer NOT NULL,
	"ist_cent" integer NOT NULL,
	"differenz_cent" integer NOT NULL,
	"bemerkung" text DEFAULT '' NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kassenbewegung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"art" text NOT NULL,
	"betrag_cent" integer NOT NULL,
	"grund" text DEFAULT '' NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aenderung" ADD COLUMN "vorher_id" integer;--> statement-breakpoint
ALTER TABLE "aenderung" ADD COLUMN "vorher_hash" text;--> statement-breakpoint
ALTER TABLE "aenderung" ADD COLUMN "inhalt_hash" text;--> statement-breakpoint
ALTER TABLE "aenderung" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "bewertung" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "zahlart" "zahlart" DEFAULT 'bar' NOT NULL;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "provision_bp" integer;--> statement-breakpoint
ALTER TABLE "zahlung" ADD COLUMN "grund" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "zahlung" ADD COLUMN "storno_von" integer;--> statement-breakpoint
ALTER TABLE "beleg" ADD CONSTRAINT "beleg_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kassenabschluss" ADD CONSTRAINT "kassenabschluss_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kassenabschluss" ADD CONSTRAINT "kassenabschluss_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kassenbewegung" ADD CONSTRAINT "kassenbewegung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kassenbewegung" ADD CONSTRAINT "kassenbewegung_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "beleg_unique" ON "beleg" USING btree ("schau_id","art","nummer");--> statement-breakpoint
CREATE UNIQUE INDEX "kassenabschluss_tag" ON "kassenabschluss" USING btree ("schau_id","datum");--> statement-breakpoint
-- Bisherige Verkäufe: Provisionssatz der Schau übernehmen (ab jetzt wird er je Verkauf gespeichert).
UPDATE "verkauf" v SET "provision_bp" = s."provision_bp" FROM "katalogeintrag" k JOIN "schau" s ON s."id" = k."schau_id" WHERE k."id" = v."katalogeintrag_id" AND v."provision_bp" IS NULL;
