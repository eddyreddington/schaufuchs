-- Vereine ohne Textbausteine (alle, die nicht aus den Demo-Daten stammen) bekommen den Grundbestand für das Tablet.
INSERT INTO "textbaustein" ("organisation_id", "kategorie", "text")
SELECT o."id", v."kategorie", v."text"
FROM "organisation" o
CROSS JOIN (VALUES
  ('vorzug', 'gute Form'),
  ('vorzug', 'kräftiger Körper'),
  ('vorzug', 'satte Farbe'),
  ('vorzug', 'gute Haltung'),
  ('vorzug', 'feine Kopfpunkte'),
  ('vorzug', 'gute Zeichnung'),
  ('wunsch', 'Kamm feiner gezackt'),
  ('wunsch', 'Schwanz voller'),
  ('wunsch', 'Rücken breiter'),
  ('wunsch', 'Farbe gleichmäßiger'),
  ('wunsch', 'Stand freier'),
  ('mangel', 'Kamm zu grob'),
  ('mangel', 'Farbe ungleichmäßig'),
  ('mangel', 'Schwanz zu schmal'),
  ('mangel', 'fehlende Kondition')
) AS v("kategorie", "text")
WHERE NOT EXISTS (SELECT 1 FROM "textbaustein" t WHERE t."organisation_id" = o."id");
