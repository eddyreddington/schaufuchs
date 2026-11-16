ALTER TABLE "zahlung" ADD COLUMN "bank_buchung" text;--> statement-breakpoint
CREATE UNIQUE INDEX "zahlung_bank_buchung" ON "zahlung" USING btree ("bank_buchung");