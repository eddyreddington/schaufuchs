CREATE TYPE "public"."kontingent_basis" AS ENUM('preisrichter', 'schau');--> statement-breakpoint
CREATE TYPE "public"."rundung" AS ENUM('voll', 'angefangen');--> statement-breakpoint
ALTER TABLE "preisart" ADD COLUMN "rundung" "rundung" DEFAULT 'voll' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "kontingent_je" "kontingent_basis" DEFAULT 'preisrichter' NOT NULL;