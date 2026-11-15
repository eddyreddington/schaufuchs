ALTER TABLE "auszahlung" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "kassenabschluss" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "kassenbewegung" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "verkauf" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "zahlung" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();