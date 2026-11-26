/** Gemeinsame Bausteine der Anmeldung und Benutzerverwaltung: Bremsen (ein Zählerstand für alle Prozeduren), Prüfungen, Einladung, Willkommens- und Hinweismails. */
import { and, asc, count, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hashPasswort, sha256, zufallsToken } from "../../auth";
import { config } from "../../config";
import { db } from "../../db/client";
import { benutzer, organisation, postausgang } from "../../db/schema";
import { Bremse, Stufenbremse, Wartezeit } from "../../services/bremse";
import { EINLADUNG_MUSTER, legeMailAb, MAX_VERSUCHE, sendeMail, versendeAbgelegt } from "../../services/post";
import { protokollZuletzt } from "../../services/protokoll";
import { fehler } from "../../trpc";

export const passwort = z.string().min(10, "Das Passwort braucht mindestens 10 Zeichen.").max(200);
export const MAX_AGE = config.sessionDays * 86_400;

// Bremsen gegen Durchprobieren von Passwörtern:
// - je Gerät (Adresse) und Konto 10 Fehlversuche in 15 Minuten,
// - je Adresse insgesamt 30 Fehlversuche in 15 Minuten (gegen Durchprobieren über viele Konten); bekannte Paare aus
//   Konto und Adresse und von der AL freigegebene Konten zählen dabei nicht mit und werden nicht gesperrt,
// - je Konto eine steigende Wartezeit nach 10 Fehlversuchen von fremden Adressen (höchstens 5 Minuten). Adressen, von
//   denen das Konto sich schon angemeldet hat, betrifft sie nicht – ein Fremder sperrt so niemanden aus.
export const bremse = new Bremse(10, 15 * 60_000, "Zu viele Fehlversuche. Bitte später erneut versuchen.");
export const bremseJeAdresse = new Bremse(30, 15 * 60_000, "Zu viele Fehlversuche von dieser Adresse. Bitte 15 Minuten warten.");
export const wartezeitJeKonto = new Wartezeit(10, 5 * 60_000, 60 * 60_000, (min) => `Zu viele Fehlversuche für dieses Konto. Bitte bis zu ${min} Minute${min === 1 ? "" : "n"} warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben.`);
/**
 * Zweiter Faktor: je Konto 10 Fehlversuche in 15 Minuten (über alle Anmeldungen hinweg – ein Code hat nur 6 Ziffern).
 * Bei der Anmeldung zählen Codes aus der App außerdem 24 Stunden lang: nach 30 Fehlversuchen ist die Anmeldung mit Code
 * gesperrt, bis die Ausstellungsleitung die Sperre aufhebt (Entscheidung 036) – sonst probierte jemand mit bekanntem
 * Passwort über Wochen weiter. Ein Notfallcode kommt dann noch hinein. Hinweismails: CODE_HINWEIS_NACH und bei der Sperre.
 */
export const codeBremse = new Stufenbremse(
  new Bremse(10, 15 * 60_000, "Zu viele falsche Codes. Bitte 15 Minuten warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben."),
  new Bremse(30, 24 * 60 * 60_000, "Zu viele falsche Codes. Die Anmeldung mit Code ist gesperrt – bitte einen Notfallcode verwenden oder die Ausstellungsleitung bitten, die Sperre aufzuheben."),
);
export const CODE_HINWEIS_NACH = 5;
/** Passwortabfrage beim Einrichten und Abschalten der Zwei-Faktor-Anmeldung. */
export const zweiFaktorBremse = new Bremse(5, 15 * 60_000, "Zu viele Fehlversuche. Bitte später erneut versuchen.");
export const anlegenBremse = new Bremse(30, 60 * 60_000, "Zu viele neue Benutzer in kurzer Zeit. Bitte später weitermachen.");
/** „Passwort ändern“: eigener Zähler je Konto (nicht derselbe wie beim Einrichten der 2FA). */
export const passwortBremse = new Bremse(5, 15 * 60_000, "Zu viele Fehlversuche. Bitte 15 Minuten warten oder die Ausstellungsleitung bitten, die Sperre aufzuheben.");
/** Wo jemand seinen eigenen Zugang (Passwort, 2FA) findet. */
export const eigenerZugang = (rolle: "admin" | "mitarbeiter") => (rolle === "admin" ? "unter „Benutzer“ → eigener Name" : "unter „Mein Zugang“ oben im Menü");
/** Einladungslinks: falsche oder abgelaufene Links je Adresse begrenzt. */
export const einladungBremse = new Bremse(20, 15 * 60_000, "Zu viele Versuche mit Einladungslinks. Bitte 15 Minuten warten.");
export const EINLADUNG_TAGE = 7;
/** Ohne gültigen Hash: Einladung noch nicht angenommen. */
export const OHNE_PASSWORT = "-";
/** Erneute Willkommensmails: je Empfänger und je Ausstellungsleitung begrenzt, damit niemand damit Postfächer flutet. */
export const willkommenBremse = new Bremse(20, 60 * 60_000, "Zu viele Willkommensmails in kurzer Zeit. Bitte später erneut versuchen.");
/** Vergleichswert, damit eine unbekannte E-Mail genauso lange braucht wie ein falsches Passwort (keine Benutzer-Erkennung). */
export const dummyHash = hashPasswort("kein-benutzer-" + Math.random());

/** Vergleich in konstanter Zeit (Einrichtungscode). */
export function gleich(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Text der Willkommensmail für neue Benutzer – bewusst ohne Passwort. Ohne `von` (Ersteinrichtung über die
 * Kommandozeile) gibt es niemanden im Verein, an den sich die Person wenden kann: dann der Betreiber der Installation.
 */
export function willkommensText(a: {
  name: string;
  email: string;
  rolle: "admin" | "mitarbeiter";
  verein: string;
  von?: { name: string; email: string };
  einladung?: { link: string; bis: Date };
}) {
  const passwort = a.einladung
    ? [
        "Bitte legen Sie Ihr Passwort über diesen Link selbst fest. Er gilt nur einmal und bis",
        `${new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(a.einladung.bis)} Uhr:`,
        "",
        a.einladung.link,
        "",
        "Danach sind Sie gleich angemeldet. Später melden Sie sich mit Ihrer E-Mail-Adresse und diesem Passwort an.",
        ...(a.rolle === "admin" ? ["", `Als Administrator richten Sie danach die Zwei-Faktor-Anmeldung ein (${eigenerZugang("admin")}) – erst dann stehen die Verwaltungsfunktionen zur Verfügung.`] : []),
      ]
    : [
        `Ihr Passwort erhalten Sie von ${a.von?.name ?? "der Ausstellungsleitung"} persönlich – aus Sicherheitsgründen steht es nicht in dieser Mail.`,
        `Bitte ändern Sie es nach der ersten Anmeldung ${eigenerZugang(a.rolle)}.`,
      ];
  return [
    `Guten Tag ${a.name},`,
    "",
    `für Sie wurde ein Zugang zu SchauFUCHS${a.verein ? ` des ${a.verein}` : ""} angelegt.`,
    "",
    `Anmelden:        ${config.publicUrl}/anmelden`,
    `E-Mail-Adresse:  ${a.email}`,
    `Rolle:           ${a.rolle === "admin" ? "Ausstellungsleitung (Administrator)" : "Helfer (Meldestelle, Kasse, Halle)"}`,
    "",
    ...passwort,
    "",
    a.von
      ? `Haben Sie diesen Zugang nicht erwartet, melden Sie sich bitte bei ${a.von.name} (${a.von.email}).`
      : "Haben Sie diesen Zugang nicht erwartet, melden Sie sich bitte bei der Person, die SchauFUCHS für Ihren Verein betreibt.",
    "",
    "Viele Grüße",
    a.verein || a.von?.name || config.appName,
  ].join("\n");
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Verwalter = { benutzer: { id: number; organisationId: number; name: string; email: string } };

/**
 * Jede Änderung an Benutzern eines Vereins läuft nacheinander (Sperre je Verein) und prüft innerhalb der Sperre neu:
 * Ist der Handelnde noch aktiver Administrator? So legt eine gerade herabgestufte Ausstellungsleitung niemanden mehr an,
 * und zwei Administratoren können sich nicht gleichzeitig gegenseitig die Rechte nehmen.
 */
export async function verwalteVerein<T>(ctx: Verwalter, arbeit: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4711, ${ctx.benutzer.organisationId})`);
    const [ich] = await tx
      .select({ id: benutzer.id })
      .from(benutzer)
      .where(and(eq(benutzer.id, ctx.benutzer.id), eq(benutzer.rolle, "admin"), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)));
    if (!ich) throw fehler("FORBIDDEN", "Nur für Administratoren.");
    // Protokoll zuletzt (Entscheidung 033): Benutzerzeile (E-Mail und Einladung stehen in eindeutigen Indizes – ihr
    // UPDATE sperrt wie FOR UPDATE und wartet auf Einfügungen, die auf den Benutzer verweisen), Sitzungen und Mail im
    // Postausgang erst schreiben, dann protokollieren – sonst hielte die Transaktion beim Warten die Protokoll-Kette.
    return protokollZuletzt(tx, () => arbeit(tx));
  });
}

/** Wie verwalteVerein, dazu der Zielbenutzer unter der Sperre: ein gerade entfernter lässt sich nicht wiederbeleben. */
export async function verwalte<T>(ctx: Verwalter, id: number, arbeit: (tx: Tx, b: typeof benutzer.$inferSelect) => Promise<T>): Promise<T> {
  return verwalteVerein(ctx, async (tx) => {
    const [b] = await tx
      .select()
      .from(benutzer)
      .where(and(eq(benutzer.id, id), eq(benutzer.organisationId, ctx.benutzer.organisationId), isNull(benutzer.geloeschtAm)));
    if (!b) throw fehler("NOT_FOUND", "Benutzer nicht gefunden.");
    return arbeit(tx, b);
  });
}

/** Nach der Änderung muss noch ein aktiver Administrator übrig sein (außer dem betroffenen Benutzer). */
export async function adminBleibt(tx: Tx, organisationId: number, ohne: number) {
  const [r] = await tx
    .select({ n: count() })
    .from(benutzer)
    .where(and(eq(benutzer.organisationId, organisationId), eq(benutzer.rolle, "admin"), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm), ne(benutzer.id, ohne)));
  if ((r?.n ?? 0) === 0) throw fehler("BAD_REQUEST", "Es muss mindestens ein aktiver Administrator bleiben.");
}

/** Hinweismails: je Empfänger und je Auslöser begrenzt (die Änderung gilt trotzdem, nur die Mail entfällt). */
export const hinweisBremse = new Bremse(10, 60 * 60_000, "Zu viele Hinweismails.");

/**
 * Hinweismail ohne Link und ohne Passwort. Scheitert das Ablegen, gilt die Änderung trotzdem. selbst: die Person hat es
 * selbst ausgelöst (z. B. 2FA eingerichtet) – dann der Rat, bei fremdem Zugriff sofort zu handeln.
 */
export async function hinweisMail(akteur: { id: number; organisationId: number; name: string; email: string }, an: string, betreff: string, zeilen: string[], selbst = false) {
  try {
    hinweisBremse.versuch([`an:${an}`, `von:${akteur.id}`]);
  } catch {
    console.error("[auth] Hinweismail ausgelassen (Bremse)");
    return;
  }
  const schluss = selbst
    ? "Waren Sie das nicht, ändern Sie bitte sofort Ihr Passwort und informieren Sie die Ausstellungsleitung."
    : `Haben Sie das nicht veranlasst, melden Sie sich bitte bei ${akteur.name} (${akteur.email}).`;
  try {
    await sendeMail(akteur.organisationId, an, betreff, [...zeilen, "", schluss].join("\n"));
  } catch (e) {
    console.error("[auth] Hinweismail nicht abgelegt:", e instanceof Error ? e.message.split("\n")[0] : e);
  }
}

export function istFremdschluesselFehler(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    if ((x as { code?: unknown }).code === "23503") return true;
  }
  return false;
}

export type Ausfuehrer = Pick<typeof db, "select" | "update" | "insert">;

/**
 * Neuer Einladungslink; ein älterer gilt damit nicht mehr. In der Datenbank steht nur der Hash. Nur für genau diese
 * Zeile (Adresse wie gelesen, ohne Passwort, aktiv, nicht entfernt) – sonst null.
 */
export async function neueEinladung(tx: Ausfuehrer, an: { id: number; email: string }) {
  const token = zufallsToken(32);
  const bis = new Date(Date.now() + EINLADUNG_TAGE * 86_400_000);
  const ok = await tx
    .update(benutzer)
    .set({ einladungHash: sha256(token), einladungBis: bis })
    .where(and(eq(benutzer.id, an.id), eq(benutzer.email, an.email), eq(benutzer.passwortHash, OHNE_PASSWORT), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)))
    .returning({ id: benutzer.id });
  if (!ok.length) return null;
  // Noch nicht verschickte Mails mit einem älteren Link (z. B. Mailserver gestört): nicht mehr versenden und den Link
  // unkenntlich machen – er gilt ab jetzt nicht mehr, und die Mail führte nur auf eine Fehlerseite.
  await entwerteEinladungsmails(tx, an.email, "durch einen neueren Link ersetzt");
  // Hinter "#": der Teil geht nie an den Server und landet so in keinem Protokoll eines Webservers.
  return { link: `${config.publicUrl}/einladung#${token}`, bis };
}

/**
 * Noch nicht verschickte Einladungsmails an diese Adresse: nicht mehr versenden, den Link darin unkenntlich machen
 * (neuerer Link, Einladung angenommen). Was gerade beim Mailserver ist („sendet“), geht noch hinaus; versende macht den
 * Link danach unkenntlich.
 */
export async function entwerteEinladungsmails(tx: Pick<typeof db, "update">, an: string, grund: string) {
  await tx
    .update(postausgang)
    .set({ text: sql`regexp_replace(${postausgang.text}, ${EINLADUNG_MUSTER}, ${`\\1(${grund})`}, 'g')`, status: "fehler", versuche: MAX_VERSUCHE, fehler: `Nicht versendet: ${grund}.` })
    .where(and(eq(postausgang.an, an), inArray(postausgang.status, ["wartet", "fehler"]), sql`${postausgang.text} like '%/einladung#%'`));
}

/** Einladung gilt nicht mehr (Adresse geändert, gesperrt, Passwort gesetzt, entfernt). */
export const ohneEinladung = { einladungHash: null, einladungBis: null };

/**
 * Legt die Willkommensmail in den Postausgang – nie mit Passwort. Hat die Person noch kein Passwort, enthält sie einen
 * frischen Einladungslink, mit dem sie es selbst festlegt.
 */
export interface Willkommen {
  an: string;
  betreff: string;
  einladung: boolean;
  /** Schon im Postausgang (in derselben Transaktion abgelegt), versendet wird nach dem Commit. */
  mailId: number | null;
}

/**
 * Bereitet die Willkommensmail vor und legt sie ab – in der Transaktion, damit der Link genau zu der gelesenen Zeile
 * gehört und ein gleichzeitiger zweiter Aufruf (wartet auf die Vereinssperre) diese Mail schon sieht und entwertet,
 * statt dass sie nach dem Commit mit einem überholten Link hinterherkommt (Entscheidung 033).
 */
export async function willkommenVorbereiten(
  tx: Ausfuehrer,
  akteur: { organisationId: number; name: string; email: string },
  an: { id: number; name: string; email: string; rolle: "admin" | "mitarbeiter"; passwortHash: string },
): Promise<Willkommen> {
  const [o] = await tx.select({ name: organisation.name }).from(organisation).where(eq(organisation.id, akteur.organisationId));
  const einladung = an.passwortHash === OHNE_PASSWORT ? ((await neueEinladung(tx, an)) ?? undefined) : undefined;
  const betreff = `Ihr Zugang zu SchauFUCHS${o?.name ? ` – ${o.name}` : ""}`;
  const text = willkommensText({ name: an.name, email: an.email, rolle: an.rolle, verein: o?.name ?? "", von: { name: akteur.name, email: akteur.email }, einladung });
  return { an: an.email, betreff, einladung: !!einladung, mailId: await legeMailAb(tx, akteur.organisationId, an.email, betreff, text) };
}

/** Versand erst nach dem Commit – eine abgebrochene Änderung verschickt so keine Mail. */
export function versendeWillkommen(w: Willkommen) {
  versendeAbgelegt(w.mailId, w.an, w.betreff);
}

/** Anlegen: vorbereiten und versenden in einem (die Zeile ist gerade erst entstanden). */
export async function sendeWillkommen(akteur: { organisationId: number; name: string; email: string }, an: Parameters<typeof willkommenVorbereiten>[2]) {
  const w = await db.transaction((tx) => willkommenVorbereiten(tx, akteur, an));
  versendeWillkommen(w);
  return { einladung: w.einladung };
}

/** Offene, gültige Einladung zu einem Link – nur für aktive, nicht entfernte Konten. */
export async function ladeEinladung(token: string) {
  const [b] = await db
    .select({ id: benutzer.id, name: benutzer.name, email: benutzer.email, organisationId: benutzer.organisationId, einladungHash: benutzer.einladungHash })
    .from(benutzer)
    .where(and(eq(benutzer.einladungHash, sha256(token)), gt(benutzer.einladungBis, new Date()), eq(benutzer.passwortHash, OHNE_PASSWORT), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)));
  if (!b) throw await einladungFehler(db);
  return b;
}

/**
 * Fehler für einen ungültigen oder abgelaufenen Einladungslink. Solange noch kein Benutzer der Installation ein Passwort
 * hat, ist die Einrichtung nicht abgeschlossen: Den ersten Administrator legt der Befehl `schaufuchs einrichten` an
 * (Entscheidung 026), eine Ausstellungsleitung zum Fragen gibt es noch nicht – dann nennt der Hinweis den Befehl.
 */
export async function einladungFehler(ex: Tx | typeof db) {
  const [mitPasswort] = await ex.select({ id: benutzer.id }).from(benutzer).where(ne(benutzer.passwortHash, OHNE_PASSWORT)).limit(1);
  return mitPasswort
    ? fehler("NOT_FOUND", "Dieser Einladungslink ist ungültig oder abgelaufen. Bitte die Ausstellungsleitung um eine neue Einladung.")
    : fehler("NOT_FOUND", "Die Einrichtung ist noch nicht abgeschlossen. Einen neuen Link erzeugt, wer diese SchauFUCHS-Installation betreut (Befehl „schaufuchs einrichten“).");
}

/** Benutzer eines Vereins mit Rolle, Status, Zwei-Faktor-Stand und angemeldeten Geräten. */
export async function benutzerUebersicht(organisationId: number, id?: number) {
  return db
    .select({
      id: benutzer.id,
      name: benutzer.name,
      email: benutzer.email,
      rolle: benutzer.rolle,
      aktiv: benutzer.aktiv,
      zweiFaktor: sql<boolean>`${benutzer.totpAktivSeit} is not null`,
      zweiFaktorSeit: benutzer.totpAktivSeit,
      notfallUebrig: sql<number>`jsonb_array_length(${benutzer.totpNotfall})`,
      angelegt: benutzer.createdAt,
      geraete: sql<number>`(select count(*)::int from sitzung s where s.benutzer_id = "benutzer"."id" and s.laeuft_ab > now())`,
      einladungOffen: sql<boolean>`${benutzer.passwortHash} = ${OHNE_PASSWORT}`,
      einladungBis: benutzer.einladungBis,
      zuletzt: sql<Date | null>`(select max(s.created_at) from sitzung s where s.benutzer_id = "benutzer"."id")`.mapWith((v: string | Date) => new Date(v)),
    })
    .from(benutzer)
    .where(and(eq(benutzer.organisationId, organisationId), isNull(benutzer.geloeschtAm), id ? eq(benutzer.id, id) : undefined))
    .orderBy(asc(benutzer.name));
}
