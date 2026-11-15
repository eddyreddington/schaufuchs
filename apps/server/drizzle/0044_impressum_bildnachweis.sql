ALTER TABLE "bild" ADD COLUMN "urheber" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "lizenz" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "quelle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "katalog_gestaltung" ADD COLUMN "druck" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "namen_widerspruch_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "preisrichter" ADD COLUMN "anschrift_im_katalog" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "preisrichter" SET "anschrift_im_katalog" = true WHERE "anschrift" <> '';
