ALTER TABLE "organisation" ADD COLUMN "abmeldung" jsonb;--> statement-breakpoint
ALTER TABLE "sitzung" ADD COLUMN "zuletzt" timestamp with time zone DEFAULT now() NOT NULL;