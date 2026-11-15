ALTER TABLE "stammdaten_version" ADD COLUMN "organisation_id" integer;--> statement-breakpoint
ALTER TABLE "stammdaten_version" ADD CONSTRAINT "stammdaten_version_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Bestand zuordnen: Versionen, die nur Schauen eines Vereins nutzen, gehören diesem Verein.
UPDATE "stammdaten_version" v SET "organisation_id" = (SELECT min(s."organisation_id") FROM "schau" s WHERE s."stammdaten_version_id" = v."id")
  WHERE (SELECT count(DISTINCT s."organisation_id") FROM "schau" s WHERE s."stammdaten_version_id" = v."id") = 1;--> statement-breakpoint
-- Gibt es nur einen Verein, gehören ihm auch die ungenutzten Versionen. Sonst bleiben sie für alle sichtbar (null).
UPDATE "stammdaten_version" SET "organisation_id" = (SELECT min("id") FROM "organisation")
  WHERE "organisation_id" IS NULL AND (SELECT count(*) FROM "organisation") = 1;
