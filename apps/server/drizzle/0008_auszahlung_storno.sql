ALTER TABLE "verkauf" DROP CONSTRAINT "verkauf_katalogeintrag_id_katalogeintrag_id_fk";
--> statement-breakpoint
DROP INDEX "auszahlung_unique";--> statement-breakpoint
ALTER TABLE "auszahlung" ADD COLUMN "bezug_quittung_nr" integer;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD COLUMN "storniert_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD COLUMN "storniert_von" integer;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD COLUMN "storno_grund" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD CONSTRAINT "auszahlung_storniert_von_benutzer_id_fk" FOREIGN KEY ("storniert_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verkauf" ADD CONSTRAINT "verkauf_katalogeintrag_id_katalogeintrag_id_fk" FOREIGN KEY ("katalogeintrag_id") REFERENCES "public"."katalogeintrag"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auszahlung_quittung_unique" ON "auszahlung" USING btree ("schau_id","quittung_nr");