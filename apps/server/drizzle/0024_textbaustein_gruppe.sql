ALTER TABLE "textbaustein" ADD COLUMN "gruppe" text DEFAULT 'Gesamteindruck' NOT NULL;--> statement-breakpoint
ALTER TABLE "textbaustein" ADD COLUMN "art" text DEFAULT 'alle' NOT NULL;--> statement-breakpoint
-- Bisheriger Grundbestand (Migration 0019): Merkmal und Art nachtragen. Eigene Bausteine bleiben bei „Gesamteindruck“.
UPDATE "textbaustein" SET "gruppe" = v.gruppe, "art" = v.art
FROM (VALUES
  ('vorzug','gute Form','Form','alle'), ('vorzug','kräftiger Körper','Form','alle'), ('vorzug','satte Farbe','Farbe','alle'),
  ('vorzug','gute Haltung','Haltung','alle'), ('vorzug','feine Kopfpunkte','Kopf','alle'), ('vorzug','gute Zeichnung','Zeichnung','alle'),
  ('wunsch','Kamm feiner gezackt','Kamm','huehner'), ('wunsch','Schwanz voller','Schwanz','alle'), ('wunsch','Rücken breiter','Rücken','alle'),
  ('wunsch','Farbe gleichmäßiger','Farbe','alle'), ('wunsch','Stand freier','Haltung','alle'), ('mangel','Kamm zu grob','Kamm','huehner'),
  ('mangel','Farbe ungleichmäßig','Farbe','alle'), ('mangel','Schwanz zu schmal','Schwanz','alle'), ('mangel','fehlende Kondition','Kondition/Pflege','alle')
) AS v(kategorie, text, gruppe, art)
WHERE "textbaustein"."kategorie" = v.kategorie AND "textbaustein"."text" = v.text;
