ALTER TABLE "gesundheit" ADD COLUMN "aufgehoben_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gesundheit" ADD COLUMN "aufhebung_grund" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Bisher aufgehobene Sperren aus dem Protokoll übernehmen (vorher unterschied das Journal „nie gesperrt“ nicht von „aufgehoben“).
UPDATE "gesundheit" g SET "aufgehoben_am" = a."zeitpunkt", "aufhebung_grund" = a."grund"
FROM "aenderung" a
WHERE a."tabelle" = 'gesundheit' AND a."aktion" = 'Sperre aufgehoben' AND a."datensatz_id" = g."id" AND g."sperre" = false;
