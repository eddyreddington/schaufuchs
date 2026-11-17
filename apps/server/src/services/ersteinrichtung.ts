/**
 * Ersteinrichtung: Verein und erster Administrator. Zwei Wege mit demselben Kern – im Browser mit Passwort (und
 * Einrichtungscode, auth.einrichten) und über die Kommandozeile ohne Passwort, mit einem Link „Passwort setzen“
 * (`schaufuchs einrichten`, Entscheidung 026).
 */
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPasswort } from "../auth";
import { config } from "../config";
import { db, type Tx } from "../db/client";
import { benutzer, organisation } from "../db/schema";
import { neueEinladung, OHNE_PASSWORT, willkommensText } from "../routers/auth/gemeinsam";
import { mailStatus, sendeMailJetzt } from "./post";
import { protokolliere } from "./protokoll";
import { legeTextbausteineAn } from "./textbausteine";

/** Angaben der Ersteinrichtung – gleich für Browser und Kommandozeile (Fehlertexte: die übersetzten Standardtexte). */
export const ersteinrichtungAngaben = z.object({
  organisation: z.string().trim().min(2).max(500),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().max(200).email(),
});

/** Kein zweiter Verein: beide Wege prüfen das unter derselben Sperre. */
export const BEREITS_EINGERICHTET = "Die Einrichtung ist bereits erfolgt.";

/** Sperre für die Dauer der Transaktion: zwei gleichzeitige Einrichtungen legen sonst beide einen Verein an. */
async function sperre(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${0x45494e52}::int)`);
}

/** Legt Verein, ersten Administrator und die Textbausteine des Vereins an – nur, solange es keine Benutzer gibt. */
async function legeVereinAn(tx: Tx, a: { organisation: string; name: string; email: string; passwortHash: string }) {
  const [o] = await tx.insert(organisation).values({ name: a.organisation }).returning();
  const [b] = await tx
    .insert(benutzer)
    .values({ organisationId: o!.id, name: a.name, email: a.email.toLowerCase(), passwortHash: a.passwortHash, rolle: "admin" })
    .returning();
  await legeTextbausteineAn(tx, o!.id);
  return b!;
}

/**
 * Ersteinrichtung im Browser (auth.einrichten): mit Passwort. Der teure Hash (Argon2, 64 MB) erst unter der Sperre und
 * nach der Zählung – nach der Einrichtung kostet ein Aufruf so nichts mehr, davor rechnet nur einer zur Zeit.
 */
export async function richteEinMitPasswort(a: { organisation: string; name: string; email: string; passwort: string }) {
  return db.transaction(async (tx) => {
    await sperre(tx);
    const [r] = await tx.select({ n: count() }).from(benutzer);
    if ((r?.n ?? 0) > 0) return null;
    return legeVereinAn(tx, { ...a, passwortHash: await hashPasswort(a.passwort) });
  });
}

export interface BefehlErgebnis {
  /** Neu angelegt oder nur ein neuer Link für den Administrator, der sein Passwort noch nicht gesetzt hat. */
  neu: boolean;
  verein: string;
  /** Name des Administrators, wie gespeichert (beim erneuten Aufruf unverändert). */
  name: string;
  email: string;
  bis: Date;
  /** Nur mit --link-zeigen. */
  link?: string;
  /** Ohne --link-zeigen: ging die Mail hinaus? */
  mail?: { gesendet: boolean; fehler: string };
}

/**
 * Ersteinrichtung über die Kommandozeile. Wer den Befehl aufrufen kann, verwaltet den Server – der Einrichtungscode
 * entfällt. Der Administrator bekommt kein Passwort, sondern einen Link „Passwort setzen“ (die Einladung, wie für neue
 * Benutzer), per Mail oder mit `linkZeigen` im Terminal. Noch einmal aufgerufen, solange genau dieser Administrator sein
 * Passwort nicht gesetzt hat, gibt es einen neuen Link (der alte gilt dann nicht mehr) – etwa wenn die Mail nicht ankam.
 */
export async function richteEinPerBefehl(eingabe: { organisation: string; name: string; email: string; linkZeigen: boolean }): Promise<BefehlErgebnis> {
  // bleibt deutsch: diese und die nächste Meldung nur auf der Kommandozeile
  if (config.nurLesen) throw new Error(`${NUR_LESEN_MELDUNG} Für die Einrichtung NUR_LESEN abschalten.`);
  const a = ersteinrichtungAngaben.parse(eingabe);
  if (!eingabe.linkZeigen && !mailStatus().eingerichtet) {
    // bleibt deutsch
    throw new Error(`${mailStatus().fehler || "Der Mailversand ist nicht eingerichtet (SMTP_URL)."} Mit --link-zeigen steht der Link stattdessen hier im Terminal.`);
  }
  const email = a.email.toLowerCase();
  const { konto, verein, neu, einladung } = await db.transaction(async (tx) => {
    await sperre(tx);
    const alle = await tx.select().from(benutzer).limit(2);
    let konto = alle[0];
    const neu = !konto;
    if (!konto) konto = await legeVereinAn(tx, { ...a, passwortHash: OHNE_PASSWORT });
    else if (alle.length > 1 || konto.email !== email) throw new Error(BEREITS_EINGERICHTET);
    // Nur ohne Passwort, aktiv und nicht entfernt – das prüft neueEinladung für genau diese Zeile.
    const einladung = await neueEinladung(tx, konto);
    if (!einladung) throw new Error(BEREITS_EINGERICHTET);
    const [o] = await tx.select({ name: organisation.name }).from(organisation).where(eq(organisation.id, konto.organisationId));
    await protokolliere(tx, {
      schauId: null,
      tabelle: "benutzer",
      datensatzId: konto.id,
      aktion: neu ? "Ersteinrichtung: Verein und Administrator angelegt, Link „Passwort setzen“ erstellt" : "Neuer Link „Passwort setzen“ (Ersteinrichtung)",
      akteur: { text: "Kommandozeile" },
    });
    return { konto, verein: o?.name ?? "", neu, einladung };
  });
  const ergebnis: BefehlErgebnis = { neu, verein, name: konto.name, email: konto.email, bis: einladung.bis };
  if (eingabe.linkZeigen) return { ...ergebnis, link: einladung.link };
  const text = willkommensText({ name: konto.name, email: konto.email, rolle: "admin", verein, einladung });
  const mail = await sendeMailJetzt(konto.organisationId, konto.email, `Ihr Zugang zu SchauFUCHS${verein ? ` – ${verein}` : ""}`, text);
  return { ...ergebnis, mail };
}
