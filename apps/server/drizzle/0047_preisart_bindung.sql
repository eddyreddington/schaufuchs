ALTER TABLE "preisart" ADD COLUMN "zielgruppe" text DEFAULT 'alle' NOT NULL;--> statement-breakpoint
ALTER TABLE "preisart" ADD COLUMN "sparte" text DEFAULT '' NOT NULL;