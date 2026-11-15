ALTER TABLE "schau" ADD COLUMN "staemme_vorn" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Schon gedruckte Kataloge behalten ihre bisherige Reihenfolge (Nachmeldungen reihen sich sonst falsch ein).
UPDATE "schau" SET "staemme_vorn" = false WHERE "katalog_gedruckt" = true;
