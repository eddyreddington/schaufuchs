CREATE TABLE "verkauf_zahlungseingang" (
	"id" serial PRIMARY KEY NOT NULL,
	"verkauf_id" integer NOT NULL,
	"datum" date NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "verkauf_zahlungseingang_verkauf_id_unique" UNIQUE("verkauf_id")
);
--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "verfallen_cent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "verfall_grund" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "verfallen_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verkauf_zahlungseingang" ADD CONSTRAINT "verkauf_zahlungseingang_verkauf_id_verkauf_id_fk" FOREIGN KEY ("verkauf_id") REFERENCES "public"."verkauf"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verkauf_zahlungseingang" ADD CONSTRAINT "verkauf_zahlungseingang_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "verkauf_zahlungseingang" ("verkauf_id", "datum") SELECT "id", ("created_at" AT TIME ZONE 'Europe/Berlin')::date FROM "verkauf" WHERE "zahlart" = 'ueberweisung' AND "storniert_am" IS NULL;
