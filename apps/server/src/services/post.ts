import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { config } from "../config";
import { db } from "../db/client";
import { entschluessele, verschluessele } from "../db/geheim";
import { postausgang } from "../db/schema";
import { kurzerFehler } from "./fehlertext";

/** Angaben in SMTP_URL, die die Verschlüsselung abschalten könnten – sie gelten nur mit SMTP_OHNE_TLS=1. */
const TLS_ANGABEN = ["secure", "requireTLS", "ignoreTLS", "opportunisticTLS"];

/**
 * SMTP_URL (smtp://benutzer:passwort@host:587 oder smtps://…:465) mit kurzen Zeitgrenzen: ein gestörter Mailserver
 * hält keine Anfrage auf. Weitere Angaben als Parameter, z. B. ?tls.rejectUnauthorized=false.
 * Immer verschlüsselt (Entscheidung 036): smtps:// von Anfang an, smtp:// nur mit STARTTLS (requireTLS) – sonst
 * genügte es, das STARTTLS-Angebot des Mailservers auf dem Weg zu streichen, und Passwort und Einladungslinks gingen im
 * Klartext hinaus. Abschalten nur ausdrücklich mit SMTP_OHNE_TLS=1 (etwa ein Mailserver im eigenen Netz ohne TLS).
 */
export function smtpOptionen(url: string, ohneTls = smtpOhneTls()) {
  const u = new URL(url);
  // TLS ab Verbindungsbeginn: smtps://, Port 465 oder ausdrücklich ?secure=true (so liefen ältere Installationen schon –
  // das ist mindestens so streng wie STARTTLS). ?secure=false schaltet dagegen nichts ab (siehe unten).
  const secure = u.protocol === "smtps:" || u.searchParams.get("secure") === "true" || (u.port === "465" && u.searchParams.get("secure") !== "false");
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
    ...(ohneTls ? { requireTLS: extra.requireTLS === true } : { secure, requireTLS: !secure, ignoreTLS: false, opportunisticTLS: false }),
  };
}

/** SMTP_OHNE_TLS=1: Mailversand auch ohne Verschlüsselung (Warnung im Server-Log). */
function smtpOhneTls() {
  return /^(1|true|ja)$/i.test(process.env.SMTP_OHNE_TLS?.trim() ?? "");
}

/** Warnungen für das Server-Log beim Start: Verschlüsselung abgeschaltet oder Angaben in SMTP_URL übergangen. */
export function smtpWarnungen(url: string, ohneTls = smtpOhneTls()): string[] {
  if (ohneTls) return ["SMTP_OHNE_TLS=1: Mails, SMTP-Passwort und Einladungslinks gehen unverschlüsselt hinaus, wenn der Mailserver kein STARTTLS anbietet. Nur für einen Mailserver im eigenen Netz."];
  const uebergangen = [...new URL(url).searchParams.entries()].filter(([k, v]) => TLS_ANGABEN.includes(k) && !(k === "secure" && v === "true")).map(([k]) => k);
  return uebergangen.length ? [`SMTP_URL: ${uebergangen.join(", ")} übergangen – der Versand bleibt verschlüsselt. Abschalten nur mit SMTP_OHNE_TLS=1.`] : [];
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
    const t = nodemailer.createTransport(smtpOptionen(config.smtp));
    for (const w of smtpWarnungen(config.smtp)) console.warn(`[post] ${w}`);
    return t;
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
export const MAX_VERSUCHE = 20;

/** Zeitpunkt, ab dem der nächste Versuch fällig ist (nach `versuche` bisherigen Versuchen). */
export function naechsterVersuch(createdAt: Date, versuche: number): Date | null {
  if (versuche >= MAX_VERSUCHE) return null;
  let t = createdAt.getTime();
  for (let i = 1; i <= versuche; i++) t += Math.min(5 * 2 ** (i - 1), 360) * 60_000;
  return t - createdAt.getTime() > POST_WIEDERHOLEN_MS ? null : new Date(t);
}

/**
 * Einladungslinks im Postausgang (Entscheidung 035): der Teil hinter „/einladung#“ steht dort nur verschlüsselt
 * (Datenschlüssel), eingesetzt wird er erst beim Versand; danach, beim Annehmen oder bei einem neueren Link wird er
 * unkenntlich gemacht. So taugt weder die Datenbank noch eine Sicherung als Zugang.
 */
const EINLADUNG_FELD = "postausgang.einladung";
/** Link im Text: verschlüsselt (enc1:…) oder aus der Zeit davor im Klartext. Auch für regexp_replace in PostgreSQL. */
export const EINLADUNG_MUSTER = "(/einladung#)(enc1:[A-Za-z0-9+/=]+|[A-Za-z0-9_-]+)";
export function einladungVerbergen(text: string): string {
  return text.replace(/(\/einladung#)(?!enc1:)([A-Za-z0-9_-]+)/g, (_, a: string, t: string) => a + verschluessele(t, EINLADUNG_FELD));
}
export function einladungEinsetzen(text: string): string {
  return text.replace(/(\/einladung#)(enc1:[A-Za-z0-9+/=]+)/g, (_, a: string, c: string) => a + entschluessele(c, EINLADUNG_FELD));
}
/** Link unkenntlich machen; `grund` steht danach in Klammern hinter „/einladung#“. */
export function einladungEntfernen(text: string, grund: string): string {
  return text.replace(new RegExp(EINLADUNG_MUSTER, "g"), `$1(${grund})`);
}

/**
 * Legt eine E-Mail in den Postausgang und versendet sie im Hintergrund, wenn SMTP eingerichtet ist – die Anfrage
 * wartet nicht auf den Mailserver. Ohne SMTP bleibt sie dort sichtbar (Entwicklung, Testbetrieb).
 */
export async function sendeMail(organisationId: number, an: string, betreff: string, text: string, ausstellerId?: number): Promise<void> {
  if (!an) return;
  versendeAbgelegt(await legeMailAb(db, organisationId, an, betreff, text, ausstellerId), an, betreff);
}

/**
 * Nur ablegen – in der Transaktion des Aufrufers, damit die Mail mit ihr steht oder fällt und eine gleichzeitige Änderung
 * sie schon sieht (z. B. entwertet ein neuerer Einladungslink sie). Versendet wird nach dem Commit (versendeAbgelegt).
 */
export async function legeMailAb(ex: Pick<typeof db, "insert">, organisationId: number, an: string, betreff: string, text: string, ausstellerId?: number): Promise<number | null> {
  if (!an) return null;
  const [m] = await ex.insert(postausgang).values({ organisationId, an, betreff, text: einladungVerbergen(text), ausstellerId: ausstellerId ?? null }).returning({ id: postausgang.id });
  return m?.id ?? null;
}

/** Versand einer abgelegten Mail im Hintergrund (nach dem Commit); ohne SMTP bleibt sie im Postausgang. */
export function versendeAbgelegt(id: number | null, an = "", betreff = "") {
  if (!transport || id == null) {
    if (!config.production && id != null) console.log(`[Post] an ${an}: ${betreff}`);
    return;
  }
  void versende(id);
}

/**
 * Wie sendeMail, wartet aber auf den Mailserver und meldet das Ergebnis – für die Kommandozeile, deren Prozess danach
 * endet. Misslingt der Versand, bleibt die Mail im Postausgang und der laufende Server versucht es weiter.
 */
export async function sendeMailJetzt(organisationId: number, an: string, betreff: string, text: string): Promise<{ gesendet: boolean; fehler: string }> {
  const [m] = await db.insert(postausgang).values({ organisationId, an, betreff, text: einladungVerbergen(text) }).returning({ id: postausgang.id });
  if (!transport) return { gesendet: false, fehler: smtpFehler || "Mailversand ist nicht eingerichtet (SMTP_URL)." };
  await versende(m!.id);
  const [r] = await db.select({ status: postausgang.status, fehler: postausgang.fehler }).from(postausgang).where(eq(postausgang.id, m!.id));
  return { gesendet: r?.status === "gesendet", fehler: r?.fehler ?? "" };
}

/** Was versende vom Mailserver braucht (Tests geben einen eigenen mit). */
export type Versender = { sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown> };

/** Bis der Versandstand beim Start zurückgesetzt ist, beansprucht niemand eine Mail – sonst erfasste ihn das Zurücksetzen. */
let versandBereit: Promise<unknown> = Promise.resolve();

/**
 * Beim Start sendet noch niemand: was auf „sendet“ steht, hat ein Neustart mitten im Versand hinterlassen. Setzt voraus,
 * dass genau ein Serverprozess die Datenbank bedient (Entscheidung 033). versende wartet, bis das erledigt ist.
 */
export function setzeUnterbrocheneZurueck(): Promise<unknown> {
  versandBereit = db
    .update(postausgang)
    .set({ status: "fehler", fehler: "Versand unterbrochen (Neustart des Servers)." })
    .where(eq(postausgang.status, "sendet"))
    .catch((e) => console.error("[post] Versandstand:", ohneAdressen(kurzerFehler(e))));
  return versandBereit;
}

export async function versende(id: number, versender: Versender | null = transport) {
  if (!versender) return;
  try {
    await versandBereit;
    // Beanspruchen (Entscheidung 033): nur wer die Zeile von „wartet“ oder „fehler“ auf „sendet“ setzt, schickt sie. So
    // geht eine Mail nicht doppelt hinaus, wenn „Erneut senden“, der Versandlauf oder zwei Administratoren zugleich laufen.
    // Mit allen Versuchen verbrauchte Fehler (auch eine durch einen neueren Link entwertete Einladung) bleiben liegen;
    // „Erneut senden“ setzt vorher auf „wartet“.
    const [m] = await db
      .update(postausgang)
      .set({ status: "sendet" })
      .where(and(eq(postausgang.id, id), or(eq(postausgang.status, "wartet"), and(eq(postausgang.status, "fehler"), lt(postausgang.versuche, MAX_VERSUCHE)))))
      .returning();
    if (!m) return;
    try {
      await versender.sendMail({ from: config.mailFrom, to: m.an, subject: m.betreff, text: einladungEinsetzen(m.text) });
      // Einladungslinks nach dem Versand unkenntlich machen: im Postausgang bleibt nur, dass eine Einladung ging.
      const text = einladungEntfernen(m.text, "nach dem Versand entfernt");
      await db
        .update(postausgang)
        .set({ status: "gesendet", gesendetAm: new Date(), fehler: "", versuche: m.versuche + 1, text })
        .where(and(eq(postausgang.id, id), eq(postausgang.status, "sendet")));
    } catch (err) {
      const text = String(err instanceof Error ? err.message : err).slice(0, 500);
      // Auch in Produktion ins Log (ohne Empfänger): sonst fällt ein gestörter Mailserver niemandem auf.
      console.error(`[post] Mail ${id} nicht versendet (Versuch ${m.versuche + 1}): ${ohneAdressen(text)}`);
      await db
        .update(postausgang)
        .set({ status: "fehler", fehler: text, versuche: m.versuche + 1 })
        .where(and(eq(postausgang.id, id), eq(postausgang.status, "sendet")));
    }
  } catch (e) {
    console.error("[post] Versand gescheitert:", ohneAdressen(kurzerFehler(e)));
  }
}

/** Versandlauf: noch nicht versandte Mails erneut versuchen (z. B. nach einer Störung des Mailservers). */
export function starteMailversand() {
  if (!transport) return;
  void setzeUnterbrocheneZurueck();
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
            inArray(postausgang.status, ["wartet", "fehler"]),
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
