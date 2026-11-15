-- Tablet-PINs haben seit diesem Update 8 Ziffern; ältere 6-stellige PINs taugen nicht mehr zur Anmeldung.
-- Sie werden ungültig gemacht, damit die Seite „Preisrichter“ „keine PIN“ zeigt und die Ausstellungsleitung neue
-- erzeugt (statt dass Preisrichter am Schautag mit einer alten PIN scheitern). Angemeldete Tablets bleiben angemeldet.
UPDATE "preisrichter" SET "pin_hash" = NULL WHERE "pin_hash" IS NOT NULL;
