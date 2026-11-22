ALTER TABLE "schau" ADD COLUMN "einteilung_jugend_separat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_zuteilung" ADD COLUMN "jugend" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_zuteilung_eindeutig_jugend" ON "pr_zuteilung" USING btree ("schau_id","sparte","rasse","farbenschlag","jugend");--> statement-breakpoint
DROP INDEX "pr_zuteilung_eindeutig";
