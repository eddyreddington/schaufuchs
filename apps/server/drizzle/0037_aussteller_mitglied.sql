ALTER TABLE "aussteller" ADD COLUMN "mitglied" boolean;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "vereinsnamen" jsonb DEFAULT '[]'::jsonb NOT NULL;