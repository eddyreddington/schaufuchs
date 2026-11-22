/**
 * Spendenquittung einer Spende erzeugen (für das Belegarchiv, services/kassenbuch.ts): Briefkopf und Farbe aus der
 * Briefvorlage des Vereins, Hinweis auf die Zuwendungsbestätigung nur, wenn der Verein sie ausstellen darf.
 */
import { bescheidSperre, druckFormateLesen, SPENDE_WEG_LABEL } from "@schau/domain";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { schau } from "../db/schema";
import { belegKopf, briefDesign, ladeBriefVorlage } from "../pdf/brief";
import { kopfzeile, ladeDesign, verein } from "../pdf/dokumente-gemeinsam";
import { spendenquittungPdf } from "../pdf/spenden";
import { ladeSpenden, ladeSteuer } from "./spenden";
import { heuteDe } from "./tiergesundheit";

export async function spendenquittung(schauId: number, spendeId: number, storno: boolean) {
  const [s] = await db.select().from(schau).where(eq(schau.id, schauId));
  const [z] = await ladeSpenden(db, { spendeId });
  if (!s || !z || z.spende.schauId !== schauId || (storno && !z.spende.storniertAm)) return null;
  const [d, brief, { steuer }] = await Promise.all([ladeDesign(s), ladeBriefVorlage(s.organisationId), ladeSteuer(s.organisationId)]);
  const am = z.spende.storniertAm ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }).format(z.spende.storniertAm) : "";
  return spendenquittungPdf(briefDesign(d, brief), {
    kopf: belegKopf(brief, verein(s), kopfzeile(s)),
    nummer: z.spende.id,
    storno: storno ? { grund: z.spende.stornoGrund, am } : null,
    spender: z.spender,
    art: z.spende.art,
    weg: SPENDE_WEG_LABEL[z.spende.weg],
    betragCent: z.spende.betragCent,
    datum: z.datum,
    zweck: z.spende.zweck,
    sache: z.spende.sache,
    bestaetigungMoeglich: !z.spende.gegenleistung && bescheidSperre(steuer, heuteDe()) == null,
  }, druckFormateLesen(s.druckFormate).kassenbeleg);
}
