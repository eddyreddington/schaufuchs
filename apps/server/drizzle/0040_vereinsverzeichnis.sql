CREATE TABLE "vereinsverzeichnis" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kreisverband" text DEFAULT '' NOT NULL,
	"landesverband" text DEFAULT '' NOT NULL,
	"quelle" text DEFAULT '' NOT NULL,
	"schluessel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vereinsverzeichnis_schluessel" ON "vereinsverzeichnis" USING btree ("schluessel");