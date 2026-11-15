ALTER TABLE "meldung" ADD COLUMN "kl_datum" date;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "kl_tierarzt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "gz_datum" date;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "gz_nummer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "untersuchung" text;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "untersuchung_tage" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "einlass_untersuchung_am" date;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "einlass_tierarzt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "nd_tage_min" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "nd_tage_max" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "pmv_tage_min" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "pmv_tage_max" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "ausland_zugelassen" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "abgesagt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "absage_grund" text DEFAULT '' NOT NULL;