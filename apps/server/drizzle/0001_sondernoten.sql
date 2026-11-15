ALTER TABLE "bewertung" ALTER COLUMN "sondernote" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."sondernote";--> statement-breakpoint
CREATE TYPE "public"."sondernote" AS ENUM('u', 'oB', 'uM', 'nA');--> statement-breakpoint
ALTER TABLE "bewertung" ALTER COLUMN "sondernote" SET DATA TYPE "public"."sondernote" USING "sondernote"::"public"."sondernote";