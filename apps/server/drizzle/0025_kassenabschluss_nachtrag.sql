DROP INDEX "kassenabschluss_tag";--> statement-breakpoint
ALTER TABLE "kassenabschluss" ADD COLUMN "nachtrag" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kassenabschluss_tag" ON "kassenabschluss" USING btree ("schau_id","datum","nachtrag");