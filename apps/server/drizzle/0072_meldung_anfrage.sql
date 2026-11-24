-- Entscheidung 033: Kennung des anlegenden Formulars. Die neue Spalte ist in allen Bestandszeilen NULL, der eindeutige
-- Index kann an ihnen also nicht scheitern (NULL-Werte gelten als verschieden).
ALTER TABLE "meldung" ADD COLUMN "anfrage_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "meldung_schau_anfrage" ON "meldung" USING btree ("schau_id","anfrage_id");