ALTER TABLE "aussteller" ADD COLUMN "test_schau_id" integer;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aussteller" ADD CONSTRAINT "aussteller_test_schau_id_schau_id_fk" FOREIGN KEY ("test_schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aussteller_test_schau_idx" ON "aussteller" USING btree ("test_schau_id");