ALTER TYPE "public"."zahlart" ADD VALUE 'karte';--> statement-breakpoint
CREATE TABLE "aenderung_anonymisiert" (
	"id" integer PRIMARY KEY NOT NULL,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Alte Einträge „SEPA-Datei verworfen“ (Hash-Aufbau 1) hatten Inhalt in alt UND neu; 0012 leerte nur alt –
-- die Prüfung meldete danach „Inhalt verändert“. Beide leeren (wie jede Anonymisierung).
UPDATE "aenderung" SET "neu" = NULL WHERE "aktion" = 'SEPA-Datei verworfen' AND "alt" IS NULL AND "neu" IS NOT NULL AND coalesce("hash_version", 1) = 1;--> statement-breakpoint
-- Bisher anonymisierte Einträge vermerken: vor diesem Stand gab es den Vermerk noch nicht. Erkennbar daran, dass der
-- gespeicherte Inhalts-Hash nicht zum jetzt leeren Inhalt passt.
INSERT INTO "aenderung_anonymisiert" ("id")
SELECT "id" FROM "aenderung"
WHERE "alt" IS NULL AND "neu" IS NULL AND "inhalt_hash" IS NOT NULL
  AND "inhalt_hash" <> CASE
    WHEN coalesce("hash_version", 1) >= 3 THEN encode(sha256(convert_to(jsonb_build_array(NULL::jsonb, NULL::jsonb, "grund")::text, 'UTF8')), 'hex')
    WHEN "hash_version" = 2 THEN encode(sha256(convert_to('[null, null]', 'UTF8')), 'hex')
    ELSE encode(sha256(convert_to('|', 'UTF8')), 'hex')
  END
ON CONFLICT DO NOTHING;
