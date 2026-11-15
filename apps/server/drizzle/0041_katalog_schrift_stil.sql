ALTER TABLE "katalog_gestaltung" ALTER COLUMN "format" SET DEFAULT 'A4';--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "schrift" text DEFAULT 'klassisch' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "stil" text DEFAULT 'klassisch' NOT NULL;