import { TRPCError } from "@trpc/server";
import { abmeldungLesen, letzteEingabe, untaetigAbgelaufen } from "@schau/domain";
import { and, eq, gt, isNull } from "drizzle-orm";
import { config } from "./config";
import { db } from "./db/client";
import { benutzer, organisation, preisrichter, schau, sitzung } from "./db/schema";

export const COOKIE = "schau_sitzung";
/** Eigenes Cookie für Preisrichter, damit Tablet- und Büro-Anmeldung auf einem Gerät nebeneinander bestehen. */
export const COOKIE_RICHTER = "schau_richter";

export function sha256(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

export function zufallsToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

export async function hashPasswort(passwort: string): Promise<string> {
  return Bun.password.hash(passwort, { algorithm: "argon2id" });
}

/**
 * Passwortprüfungen (Argon2, je 64 MB Speicher) laufen höchstens zu viert gleichzeitig; weitere warten in einer
 * Schlange. Ist auch die voll, wird die Anfrage abgewiesen – eine Flut von Anmeldeversuchen legt so den Server nicht lahm.
 */
const MAX_PRUEFUNGEN = 4;
const MAX_WARTEND = 64;
let pruefungen = 0;
const wartend: (() => void)[] = [];

/** Ohne gültigen Hash (Einladung noch nicht angenommen, Konto entfernt): gleich lange rechnen, dann ablehnen. */
let ersatzHash: Promise<string> | null = null;

export async function pruefePasswort(passwort: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$")) {
    ersatzHash ??= hashPasswort(zufallsToken());
    await pruefePasswort(passwort, await ersatzHash);
    return false;
  }
  if (pruefungen >= MAX_PRUEFUNGEN) {
    if (wartend.length >= MAX_WARTEND) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Der Server ist gerade ausgelastet. Bitte gleich noch einmal versuchen." });
    await new Promise<void>((weiter) => wartend.push(weiter));
  } else pruefungen++;
  try {
    return await Bun.password.verify(passwort, hash);
  } finally {
    // Den Platz direkt an den nächsten Wartenden weitergeben.
    const naechster = wartend.shift();
    if (naechster) naechster();
    else pruefungen--;
  }
}

export async function neueSitzung(ziel: { benutzerId?: number; preisrichterId?: number }, ausfuehrer: Pick<typeof db, "insert"> = db): Promise<string> {
  const token = zufallsToken();
  const laeuftAb = new Date(Date.now() + config.sessionDays * 86_400_000);
  await ausfuehrer.insert(sitzung).values({ id: sha256(token), ...ziel, laeuftAb });
  return token;
}

/** Stand eines Kontos beim Lesen vor der (langsamen) Passwortprüfung. */
export interface KontoStand {
  id: number;
  email: string;
  passwortHash: string;
  aktiv: boolean;
  geloeschtAm: Date | null;
  totpAktivSeit: Date | null;
}

/**
 * Sitzung nur, wenn sich das Konto seit dem Lesen nicht verändert hat (Passwort, Adresse, Sperre, Entfernen, 2FA) –
 * unter Zeilensperre in derselben Transaktion. Sonst entstünde eine Anmeldung, die vor einem Passwort-Reset, einer
 * Sperre oder der 2FA-Einrichtung begonnen hat, erst danach und bliebe gültig.
 */
export async function sitzungWennUnveraendert(stand: KontoStand): Promise<string> {
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select({ email: benutzer.email, passwortHash: benutzer.passwortHash, aktiv: benutzer.aktiv, geloeschtAm: benutzer.geloeschtAm, totpAktivSeit: benutzer.totpAktivSeit })
      .from(benutzer)
      .where(eq(benutzer.id, stand.id))
      .for("update");
    const zeit = (d: Date | null) => d?.getTime() ?? 0;
    if (!b || !b.aktiv || b.geloeschtAm || b.email !== stand.email || b.passwortHash !== stand.passwortHash || zeit(b.totpAktivSeit) !== zeit(stand.totpAktivSeit)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Die Anmeldung ist abgelaufen. Bitte noch einmal anmelden." });
    }
    return neueSitzung({ benutzerId: stand.id }, tx);
  });
}

/** Kennung einer Sitzung in der Datenbank (SHA-256 des Cookie-Werts). */
/**
 * Nur die Sprache am Konto einer gültigen Sitzung – lesend, ohne Nebenwirkung (zählt nicht als Eingabe, beendet nichts).
 * Für Fehlertexte der Datei-Adressen (datei-sprache.ts); ob die Sitzung wirklich noch angemeldet ist, prüft die Route selbst.
 */
export async function spracheDerSitzung(token: string): Promise<string | null> {
  const [z] = await db
    .select({ sprache: benutzer.sprache })
    .from(sitzung)
    .innerJoin(benutzer, eq(benutzer.id, sitzung.benutzerId))
    .where(and(eq(sitzung.id, sha256(token)), gt(sitzung.laeuftAb, new Date()), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)));
  return z?.sprache ?? null;
}

export function sitzungsId(token: string): string {
  return sha256(token);
}

export async function beendeSitzung(token: string): Promise<void> {
  await db.delete(sitzung).where(eq(sitzung.id, sha256(token)));
}

export interface Angemeldet {
  /**
   * zweiFaktor: aus der Sitzung immer gesetzt; fehlt er (nur in Tests konstruierte Kontexte), gilt keine Pflicht.
   * zweiFaktorPflicht: Administrator ohne 2FA bei aktiver Pflicht – er gilt dann überall als Helfer (rolle "mitarbeiter"),
   * bis die 2FA eingerichtet ist; so greifen alle Rollenprüfungen, auch in Downloads und benutzerProcedure.
   */
  benutzer: { id: number; organisationId: number; name: string; email: string; rolle: "admin" | "mitarbeiter"; sprache?: string | null; zweiFaktor?: boolean; zweiFaktorPflicht?: boolean } | null;
  richter: { id: number; schauId: number; name: string; istObmann: boolean } | null;
}

/**
 * eingabeVorMs: wie lange die letzte Eingabe in der Oberfläche her ist (Kopfzeile x-eingabe-vor); fehlt die Angabe,
 * zählt der Aufruf selbst als Eingabe (z. B. Download per Link).
 */
export async function ladeSitzung(benutzerToken: string | undefined, richterToken?: string | undefined, eingabeVorMs?: number): Promise<Angemeldet> {
  const [b, r] = await Promise.all([ladeEine(benutzerToken, eingabeVorMs), ladeEine(richterToken, eingabeVorMs)]);
  return { benutzer: b.benutzer, richter: r.richter };
}

/**
 * Automatische Abmeldung nach Untätigkeit (Frist je Rolle, Verein und Datenschutz). Im Büro zählt die zuletzt gespeicherte
 * Eingabe – ein neu geöffneter Tab nach langer Pause belebt die Sitzung nicht wieder. Am Preisrichter-Tablet zählt auch die
 * gemeldete Eingabe, denn dort wird ohne Netz weiterbewertet und erst später übertragen.
 */
async function nochAktiv(s: { id: string; zuletzt: Date }, minuten: number, eingabeVorMs: number | undefined, ohneNetz: boolean): Promise<boolean> {
  const jetzt = new Date();
  const neu = letzteEingabe(s.zuletzt, jetzt, eingabeVorMs);
  if (untaetigAbgelaufen(ohneNetz ? neu : s.zuletzt, jetzt, minuten)) {
    await db.delete(sitzung).where(eq(sitzung.id, s.id));
    return false;
  }
  // Nicht bei jedem Aufruf schreiben: halbe Minute Genauigkeit reicht.
  if (neu.getTime() - s.zuletzt.getTime() > 30_000) await db.update(sitzung).set({ zuletzt: neu }).where(eq(sitzung.id, s.id));
  return true;
}

async function ladeEine(token: string | undefined, eingabeVorMs?: number): Promise<Angemeldet> {
  const leer: Angemeldet = { benutzer: null, richter: null };
  if (!token) return leer;
  const [s] = await db
    .select()
    .from(sitzung)
    .where(and(eq(sitzung.id, sha256(token)), gt(sitzung.laeuftAb, new Date())));
  if (!s) return leer;
  if (s.benutzerId) {
    const [b] = await db
      .select({
        id: benutzer.id,
        organisationId: benutzer.organisationId,
        name: benutzer.name,
        email: benutzer.email,
        rolle: benutzer.rolle,
        sprache: benutzer.sprache,
        aktiv: benutzer.aktiv,
        geloeschtAm: benutzer.geloeschtAm,
        totpAktivSeit: benutzer.totpAktivSeit,
        abmeldung: organisation.abmeldung,
      })
      .from(benutzer)
      .innerJoin(organisation, eq(organisation.id, benutzer.organisationId))
      .where(eq(benutzer.id, s.benutzerId));
    // Entfernte Konten gelten nie als angemeldet, auch wenn "aktiv" durch einen Fehler wieder gesetzt wäre.
    if (b?.aktiv && !b.geloeschtAm) {
      if (!(await nochAktiv(s, abmeldungLesen(b.abmeldung)[b.rolle], eingabeVorMs, false))) return leer;
      const { geloeschtAm: _, totpAktivSeit, abmeldung: _a, ...rest } = b;
      const pflicht = config.zweiFaktorPflichtAdmin && rest.rolle === "admin" && !totpAktivSeit;
      return { benutzer: { ...rest, rolle: pflicht ? "mitarbeiter" : rest.rolle, zweiFaktor: !!totpAktivSeit, zweiFaktorPflicht: pflicht }, richter: null };
    }
  }
  if (s.preisrichterId) {
    const [p] = await db
      .select({ id: preisrichter.id, schauId: preisrichter.schauId, name: preisrichter.name, istObmann: preisrichter.istObmann, abmeldung: organisation.abmeldung })
      .from(preisrichter)
      .innerJoin(schau, eq(schau.id, preisrichter.schauId))
      .innerJoin(organisation, eq(organisation.id, schau.organisationId))
      .where(eq(preisrichter.id, s.preisrichterId));
    if (p) {
      if (!(await nochAktiv(s, abmeldungLesen(p.abmeldung).preisrichter, eingabeVorMs, true))) return leer;
      const { abmeldung: _a, ...richter } = p;
      return { benutzer: null, richter };
    }
  }
  return leer;
}

export function cookieHeader(token: string, maxAgeSeconds: number, name = COOKIE): string {
  const secure = config.cookieSecure ? "; Secure" : "";
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
