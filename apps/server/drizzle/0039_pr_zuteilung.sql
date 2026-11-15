CREATE TABLE "pr_zuteilung" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"preisrichter_id" integer NOT NULL,
	"sparte" text DEFAULT '' NOT NULL,
	"rasse" text NOT NULL,
	"farbenschlag" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pr_zuteilung" ADD CONSTRAINT "pr_zuteilung_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_zuteilung" ADD CONSTRAINT "pr_zuteilung_preisrichter_id_preisrichter_id_fk" FOREIGN KEY ("preisrichter_id") REFERENCES "public"."preisrichter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_zuteilung_eindeutig" ON "pr_zuteilung" USING btree ("schau_id","sparte","rasse","farbenschlag");