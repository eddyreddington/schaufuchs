ALTER TABLE "meldung" ADD COLUMN "teilschau" text;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "teilschauen" jsonb DEFAULT '[]'::jsonb NOT NULL;