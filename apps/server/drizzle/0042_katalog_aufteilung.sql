ALTER TABLE "katalog_gestaltung" ADD COLUMN "aufteilung" text DEFAULT 'zweispaltig' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "rassebilder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "sparte_neue_seite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "ausgeblendet" jsonb DEFAULT '[]'::jsonb NOT NULL;