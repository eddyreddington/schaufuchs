ALTER TABLE "postausgang" ADD COLUMN "aussteller_id" integer;--> statement-breakpoint
ALTER TABLE "stiftung" ADD COLUMN "online_nennen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "postausgang" ADD CONSTRAINT "postausgang_aussteller_id_aussteller_id_fk" FOREIGN KEY ("aussteller_id") REFERENCES "public"."aussteller"("id") ON DELETE set null ON UPDATE no action;