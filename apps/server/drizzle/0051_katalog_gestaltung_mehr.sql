ALTER TABLE "katalog_gestaltung" ADD COLUMN "akzent" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "titel_hintergrund" text DEFAULT 'weiss' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "titelbild" text DEFAULT 'eingepasst' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "fusszeile" text DEFAULT 'linie' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "linien" text DEFAULT 'normal' NOT NULL;