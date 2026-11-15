import { and, eq, gt, lt, ne } from "drizzle-orm";
import nodemailer from "nodemailer";
import { config } from "../config";
import { db } from "../db/client";
import { postausgang } from "../db/schema";
import { kurzerFehler } from "./fehlertext";

/**
 * SMTP_URL (smtp://benutzer:passwort@host:587 oder smtps://…:465) mit kurzen Zeitgrenzen: ein gestörter Mailserver
 * hält keine Anfrage auf. Weitere Angaben als Parameter, z. B. ?tls.rejectUnauthorized=false.
 */
export function smtpOptionen(url: string) {
  const u = new URL(url);
  const secure = u.protocol === "smtps:";
  const extra: Record<string, unknown> = {};
  const tls: Record<string, unknown> = {};
  for (const [k, roh] of u.searchParams) {
    const v = roh === "true" ? true : roh === "false" ? false : /^\d+$/.test(roh) ? Number(roh) : roh;
    if (k.startsWith("tls.")) tls[k.slice(4)] = v;
    else extra[k] = v;
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : secure ? 465 : 587,
    secure,
    auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(Object.keys(tls).length ? { tls } : {}),
    ...extra,
  };
}

/** Für das Server-Log: SMTP-Antworten nennen oft den Empfänger – Personendaten gehören nicht in die Container-Logs. */
export function ohneAdressen(text: string): string {
  return text.replace(/<?[^\s<>"';:,]+@[^\s<>"';:,]+>?/g, "<Adresse>");
}

/** Fehler beim Lesen von SMTP_URL – der Server startet dann ohne Mailversand, statt abzustürzen. */
let smtpFehler = "";

function ladeTransport() {
  if (!config.smtp) return null;
  try {
    return nodemailer.createTransport(smtpOptionen(config.smtp));
  } catch {
    smtpFehler =
      "SMTP_URL ist ungültig. Sonderzeichen in Benutzer oder Passwort bitte URL-kodieren (z. B. # → %23, / → %2F, ? → %3F, % → %25, @ → %40). Bis dahin bleiben Mails im Postausgang.";
    console.error(`[post] ${smtpFehler}`);
    return null;
  }
}

const transport = ladeTransport();

/** Für die Anzeige des Postausgangs: ist der Versand eingerichtet, und wenn nicht, warum nicht? */
export function mailStatus() {
  return { eingerichtet: !!transport, fehler: smtpFehler };
}

/** Wiederholung fehlgeschlagener Mails: nach 5, 10, 20 … Minuten, höchstens alle 6 Stunden, bis die Mail 2 Tage alt ist. */
export const POST_WIEDERHOLEN_MS = 2 * 86_400_000;
const MAX_VERSUCHE = 20;

/** Zeitpunkt, ab dem der nächste Versuch fällig ist (nach `versuche` bisherigen Versuchen). */
export function naechsterVersuch(createdAt: Date, versuche: number): Date | null {
  if (versuche >= MAX_VERSUCHE) return null;
  let t = createdAt.getTime();
  for (let i = 1; i <= versuche; i++) t += Math.min(5 * 2 ** (i - 1), 360) * 60_000;
  return t - createdAt.getTime() > POST_WIEDERHOLEN_MS ? null : new Date(t);
}

/**
 * Legt eine E-Mail in den Postausgang und versendet sie im Hintergrund, wenn SMTP eingerichtet ist – die Anfrage
 * wartet nicht auf den Mailserver. Ohne SMTP bleibt sie dort sichtbar (Entwicklung, Testbetrieb).
 */
export async function sendeMail(organisationId: number, an: string, betreff: string, text: string, ausstellerId?: number): Promise<void> {
  if (!an) return;
  const [m] = await db.insert(postausgang).values({ organisationId, an, betreff, text, ausstellerId: ausstellerId ?? null }).returning({ id: postausgang.id });
  if (!transport || !m) {
    if (!config.production) console.log(`[Post] an ${an}: ${betreff}`);
    return;
  }
  void versende(m.id);
}

export async function versende(id: number) {
  try {
    const [m] = await db.select().from(postausgang).where(eq(postausgang.id, id));
    if (!m || m.status === "gesendet" || !transport) return;
    try {
      await transport.sendMail({ from: config.mailFrom, to: m.an, subject: m.betreff, text: m.text });
      // Einladungslinks nach dem Versand unkenntlich machen: im Postausgang bleibt nur, dass eine Einladung ging.
      const text = m.text.replace(/(\/einladung#)[A-Za-z0-9_-]+/g, "$1(nach dem Versand entfernt)");
      await db.update(postausgang).set({ status: "gesendet", gesendetAm: new Date(), fehler: "", versuche: m.versuche + 1, text }).where(eq(postausgang.id, id));
    } catch (err) {
      const text = String(err instanceof Error ? err.message : err).slice(0, 500);
      // Auch in Produktion ins Log (ohne Empfänger): sonst fällt ein gestörter Mailserver niemandem auf.
      console.error(`[post] Mail ${id} nicht versendet (Versuch ${m.versuche + 1}): ${ohneAdressen(text)}`);
      await db
        .update(postausgang)
        .set({ status: "fehler", fehler: text, versuche: m.versuche + 1 })
        .where(eq(postausgang.id, id));
    }
  } catch (e) {
    console.error("[post] Versand gescheitert:", ohneAdressen(kurzerFehler(e)));
  }
}

/** Versandlauf: noch nicht versandte Mails erneut versuchen (z. B. nach einer Störung des Mailservers). */
export function starteMailversand() {
  if (!transport) return;
  let laeuft = false;
  const lauf = async () => {
    if (laeuft) return;
    laeuft = true;
    try {
      const jetzt = Date.now();
      const offen = await db
        .select({ id: postausgang.id, createdAt: postausgang.createdAt, versuche: postausgang.versuche })
        .from(postausgang)
        .where(
          and(
            ne(postausgang.status, "gesendet"),
            lt(postausgang.versuche, MAX_VERSUCHE),
            gt(postausgang.createdAt, new Date(jetzt - POST_WIEDERHOLEN_MS)),
            // Ganz frische Mails versendet noch sendeMail selbst.
            lt(postausgang.createdAt, new Date(jetzt - 60_000)),
          ),
        )
        .orderBy(postausgang.id)
        .limit(500);
      const faellig = offen.filter((m) => (naechsterVersuch(m.createdAt, m.versuche)?.getTime() ?? Infinity) <= jetzt).slice(0, 50);
      for (const m of faellig) await versende(m.id);
    } catch (e) {
      console.error("[post] Versandlauf:", ohneAdressen(kurzerFehler(e)));
    } finally {
      laeuft = false;
    }
  };
  setInterval(() => void lauf(), 5 * 60_000).unref?.();
}
