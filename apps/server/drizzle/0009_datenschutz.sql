ALTER TABLE "aussteller" ADD COLUMN "gesperrt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "aussteller" ADD COLUMN "loeschen_ab" date;--> statement-breakpoint
ALTER TABLE "aussteller" ADD COLUMN "geloescht_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "online_zustimmung_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "erziehungsberechtigter" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "anschrift" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "telefon" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "vertretung" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "register" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "inhalt_verantwortlich" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "datenschutzbeauftragter" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "impressum_zusatz" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "datenschutz_zusatz" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "datenschutz_text" text DEFAULT '' NOT NULL;