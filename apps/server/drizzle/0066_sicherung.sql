CREATE TABLE "sicherung" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"am" timestamp with time zone NOT NULL,
	CONSTRAINT "sicherung_eine_zeile" CHECK ("sicherung"."id" = 1)
);
