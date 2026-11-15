CREATE TABLE "aenderung_geloescht" (
	"id" integer PRIMARY KEY NOT NULL,
	"schau_id" integer,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Bisher legte db/schutz.sql die Tabelle an – in bestehenden Datenbanken ist sie schon da.
CREATE TABLE IF NOT EXISTS "aenderung_kette" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"letzte_id" integer,
	"letzter_hash" text
);
--> statement-breakpoint
CREATE TABLE "sepa_lauf" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"nachricht_id" text NOT NULL,
	"daten" jsonb NOT NULL,
	"status" text DEFAULT 'offen' NOT NULL,
	"erstellt_von" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abgeschlossen_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "preisvergabe" DROP CONSTRAINT "preisvergabe_preisart_id_preisart_id_fk";
--> statement-breakpoint
ALTER TABLE "aenderung" ADD COLUMN "hash_version" integer;--> statement-breakpoint
ALTER TABLE "gesundheit" ADD COLUMN "tier_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalogeintrag" ADD COLUMN "bewertung_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "ist_preisrichter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preisvergabe" ADD COLUMN "betrag_cent" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "abgeschlossen_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sepa_lauf" ADD CONSTRAINT "sepa_lauf_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sepa_lauf_nachricht" ON "sepa_lauf" USING btree ("nachricht_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sepa_lauf_offen" ON "sepa_lauf" USING btree ("schau_id") WHERE status = 'offen';--> statement-breakpoint
ALTER TABLE "preisvergabe" ADD CONSTRAINT "preisvergabe_preisart_id_preisart_id_fk" FOREIGN KEY ("preisart_id") REFERENCES "public"."preisart"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Daten übernehmen: Preisgeld je Vergabe festhalten, Preisrichter-Befreiung an die Meldung, Versionszähler an das Tier.
UPDATE "preisvergabe" v SET "betrag_cent" = p."betrag_cent" FROM "preisart" p WHERE p."id" = v."preisart_id" AND v."betrag_cent" IS NULL;--> statement-breakpoint
UPDATE "meldung" m SET "ist_preisrichter" = a."ist_preisrichter" FROM "aussteller" a WHERE a."id" = m."aussteller_id";--> statement-breakpoint
UPDATE "katalogeintrag" k SET "bewertung_version" = b."version" FROM "bewertung" b WHERE b."katalogeintrag_id" = k."id";--> statement-breakpoint
UPDATE "schau" SET "abgeschlossen_am" = now() WHERE "phase" = 'abgeschlossen' AND "abgeschlossen_am" IS NULL;--> statement-breakpoint
-- Offene SEPA-Datei aus dem Protokoll in die eigene Tabelle übernehmen …
INSERT INTO "sepa_lauf" ("schau_id", "nachricht_id", "daten", "status", "erstellt_von", "created_at")
SELECT a."schau_id", a."neu"->>'nachrichtId', a."neu", 'offen', a."wer", a."zeitpunkt"
FROM "aenderung" a
WHERE a."tabelle" = 'auszahlung' AND a."aktion" = 'SEPA-Datei erstellt' AND a."neu" IS NOT NULL AND a."schau_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "aenderung" b
    WHERE b."schau_id" = a."schau_id" AND b."tabelle" = 'auszahlung' AND b."aktion" IN ('SEPA-Datei verworfen', 'Überweisungen gebucht')
      AND b."neu"->>'nachrichtId' = a."neu"->>'nachrichtId'
  );--> statement-breakpoint
-- … und IBANs, Kontoinhaber und Käuferdaten aus dem Protokoll entfernen (Leeren erlaubt der Schutz-Trigger, die Kette bleibt gültig).
UPDATE "aenderung" SET "neu" = NULL WHERE "tabelle" = 'auszahlung' AND "aktion" = 'SEPA-Datei erstellt' AND "neu" IS NOT NULL;--> statement-breakpoint
UPDATE "aenderung" SET "alt" = NULL WHERE "tabelle" = 'auszahlung' AND "aktion" = 'SEPA-Datei verworfen' AND "alt" IS NOT NULL;--> statement-breakpoint
UPDATE "aenderung" SET "alt" = NULL WHERE "tabelle" = 'verkauf' AND "aktion" = 'storniert' AND "alt" IS NOT NULL;
