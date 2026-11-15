ALTER TABLE "benutzer" ADD COLUMN "totp_geheim" text;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_aktiv_seit" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_letzter_schritt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "totp_notfall" jsonb DEFAULT '[]'::jsonb NOT NULL;