ALTER TABLE "benutzer" ADD COLUMN "einladung_hash" text;--> statement-breakpoint
ALTER TABLE "benutzer" ADD COLUMN "einladung_bis" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_einladung_idx" ON "benutzer" USING btree ("einladung_hash");