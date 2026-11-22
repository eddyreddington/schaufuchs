CREATE TYPE "public"."pr_zusage" AS ENUM('offen', 'zugesagt', 'abgesagt');--> statement-breakpoint
ALTER TABLE "rasse" ADD COLUMN "gruppe" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "gruppen" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "obmann_id" integer;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "zusage" "pr_zusage" DEFAULT 'offen' NOT NULL;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "zugesagt_fuer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "vorbehalt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD CONSTRAINT "preisrichter_obmann_id_preisrichter_id_fk" FOREIGN KEY ("obmann_id") REFERENCES "public"."preisrichter"("id") ON DELETE set null ON UPDATE no action;