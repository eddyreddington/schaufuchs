CREATE TABLE "gesundheit" (
	"id" serial PRIMARY KEY NOT NULL,
	"schau_id" integer NOT NULL,
	"katalogeintrag_id" integer,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL,
	"befund" text NOT NULL,
	"massnahme" text DEFAULT '' NOT NULL,
	"tierarzt" text DEFAULT '' NOT NULL,
	"verendet" boolean DEFAULT false NOT NULL,
	"sperre" boolean DEFAULT true NOT NULL,
	"erfasst_von" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verkauf" DROP CONSTRAINT "verkauf_katalogeintrag_id_unique";--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "pmv_impfdatum" date;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "pmv_impfstoff" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "pmv_tierarzt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "wg_datum" date;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "wg_sentinel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "wg_stelle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meldung" ADD COLUMN "erklaerungen_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "vet_registriernummer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "vet_amt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "vet_anzeige_am" date;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "vet_aktenzeichen" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "wassergefluegel_untersuchung" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schau" ADD COLUMN "erklaerungen" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "kaeufer_unter16" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "kaeufer_erziehungsberechtigter" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "storniert_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "storniert_von" integer;--> statement-breakpoint
ALTER TABLE "verkauf" ADD COLUMN "storno_grund" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gesundheit" ADD CONSTRAINT "gesundheit_schau_id_schau_id_fk" FOREIGN KEY ("schau_id") REFERENCES "public"."schau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gesundheit" ADD CONSTRAINT "gesundheit_katalogeintrag_id_katalogeintrag_id_fk" FOREIGN KEY ("katalogeintrag_id") REFERENCES "public"."katalogeintrag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gesundheit" ADD CONSTRAINT "gesundheit_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verkauf" ADD CONSTRAINT "verkauf_storniert_von_benutzer_id_fk" FOREIGN KEY ("storniert_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verkauf_tier_gueltig" ON "verkauf" USING btree ("katalogeintrag_id") WHERE storniert_am is null;--> statement-breakpoint
-- Bisher gab es nur einen Impfnachweis je Meldung. Meldet jemand ausschließlich Tauben, war das die PMV-Impfung.
WITH sparten AS (
  SELECT k.meldung_id, bool_and(coalesce(sp.name, sp2.name, '') ILIKE '%taube%') AS nur_tauben
  FROM katalogeintrag k
  LEFT JOIN farbenschlag f ON f.id = k.farbenschlag_id
  LEFT JOIN rasse r ON r.id = f.rasse_id
  LEFT JOIN sparte sp ON sp.id = r.sparte_id
  LEFT JOIN rasse r2 ON r2.id = k.rasse_id
  LEFT JOIN sparte sp2 ON sp2.id = r2.sparte_id
  GROUP BY k.meldung_id
)
UPDATE "meldung" m SET
  "pmv_impfdatum" = m."vet_impfdatum", "pmv_impfstoff" = m."vet_impfstoff", "pmv_tierarzt" = m."vet_tierarzt",
  "vet_impfdatum" = NULL, "vet_impfstoff" = '', "vet_tierarzt" = ''
FROM sparten s
WHERE s.meldung_id = m.id AND s.nur_tauben AND (m."vet_impfdatum" IS NOT NULL OR m."vet_impfstoff" <> '');
