ALTER TABLE "aussteller" ADD COLUMN "iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "aussteller" ADD COLUMN "kontoinhaber" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "auszahlung" ADD COLUMN "art" "zahlart" DEFAULT 'bar' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "verein_kontoinhaber" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "verein_iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "verein_bic" text DEFAULT '' NOT NULL;