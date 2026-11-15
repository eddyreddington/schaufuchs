-- Migration 0014 hat in ihrer ersten Fassung auch neuere Einträge „SEPA-Datei verworfen“ (Hash-Aufbau 3) geleert, den
-- Grund aber stehen lassen: Die Prüfung meldet dort dauerhaft „Inhalt verändert“. Wer so eine Datenbank hat, bekommt
-- hier auch den Grund geleert – die Einträge gelten dann als anonymisiert (der Vermerk entsteht im Schutz-Trigger).
-- Erkennbar daran, dass der gespeicherte Inhalts-Hash nicht zum jetzt leeren Inhalt samt Grund passt.
UPDATE "aenderung" SET "grund" = ''
WHERE "aktion" = 'SEPA-Datei verworfen' AND "alt" IS NULL AND "neu" IS NULL AND "hash_version" >= 3 AND "grund" <> ''
  AND "inhalt_hash" <> encode(sha256(convert_to(jsonb_build_array(NULL::jsonb, NULL::jsonb, "grund")::text, 'UTF8')), 'hex');
