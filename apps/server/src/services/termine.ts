/**
 * Kommende Schauen: Termine für die Katalogseite, abonnierte Kalender (iCal) abrufen und abgleichen, eigene Schauen
 * als Kalender. Fachregeln in @schau/domain (kommende-schauen.ts).
 */
import { gleicheAb, leseIcal, schauTage, type IcalTermin, type KommenderTermin } from "@schau/domain";
import { and, asc, eq, ne } from "drizzle-orm";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { config } from "../config";
import { db } from "../db/client";
import { schau, schautermin, terminabo } from "../db/schema";
import { kurzerFehler } from "./fehlertext";
import { protokolliere, type Akteur } from "./protokoll";
import { heuteDe } from "./tiergesundheit";

/** Größte Kalenderdatei. Ein Vereinskalender hat wenige KB; mehr ist kein Schaukalender. */
export const KALENDER_MAX_BYTES = 1024 * 1024;
const KALENDER_ZEITLIMIT_MS = 15_000;
const MAX_WEITERLEITUNGEN = 3;

/** Eigene Schauen als Termine (ohne Testschauen, abgesagte und die gerade gedruckte). */
async function eigeneSchauen(organisationId: number, ohneSchauId: number | null): Promise<KommenderTermin[]> {
  const liste = await db
    .select({ id: schau.id, name: schau.name, ort: schau.ort, bewertungAm: schau.bewertungAm, oeffnungszeiten: schau.oeffnungszeiten, test: schau.test, abgesagtAm: schau.abgesagtAm })
    .from(schau)
    .where(and(eq(schau.organisationId, organisationId), ohneSchauId ? ne(schau.id, ohneSchauId) : undefined));
  return liste.flatMap((s) => {
    const tage = s.test || s.abgesagtAm ? null : schauTage(s.bewertungAm, s.oeffnungszeiten);
    return tage ? [{ name: s.name, ort: s.ort, von: tage.von, bis: tage.bis > tage.von ? tage.bis : null, ebene: "kreis" as const, kreisverband: "", landesverband: "", quelle: "eigene Schau", eigene: true }] : [];
  });
}

/** Alle übernommenen Termine des Vereins und seine anderen Schauen – Auswahl und Kürzung macht `kommendeSchauen`. */
export async function ladeKommende(organisationId: number, schauId: number | null): Promise<KommenderTermin[]> {
  const [termine, eigene] = await Promise.all([
    db
      .select()
      .from(schautermin)
      .where(and(eq(schautermin.organisationId, organisationId), eq(schautermin.status, "uebernommen")))
      .orderBy(asc(schautermin.von)),
    eigeneSchauen(organisationId, schauId),
  ]);
  return [
    ...termine.map((t) => ({ name: t.name, ort: t.ort, von: t.von, bis: t.bis, ebene: t.ebene, kreisverband: t.kreisverband, landesverband: t.landesverband, quelle: t.quelle })),
    ...eigene,
  ];
}

/** Termine der eigenen Schauen für den veröffentlichten Kalender. */
export async function eigeneSchauenFuerKalender(organisationId: number) {
  const liste = await db
    .select({ id: schau.id, slug: schau.slug, name: schau.name, ort: schau.ort, veranstalter: schau.veranstalter, bewertungAm: schau.bewertungAm, oeffnungszeiten: schau.oeffnungszeiten, test: schau.test, abgesagtAm: schau.abgesagtAm })
    .from(schau)
    .where(eq(schau.organisationId, organisationId))
    .orderBy(asc(schau.bewertungAm));
  const host = new URL(config.publicUrl).host;
  return liste.flatMap((s) => {
    const tage = s.test || s.abgesagtAm ? null : schauTage(s.bewertungAm, s.oeffnungszeiten);
    if (!tage) return [];
    return [{ uid: `schau-${s.id}@${host}`, name: s.name, ort: s.ort, von: tage.von, bis: tage.bis, url: `${config.publicUrl}/s/${s.slug}`, beschreibung: s.veranstalter ? `Veranstalter: ${s.veranstalter}` : "" }];
  });
}

// ── Abruf ───────────────────────────────────────────────────────────────

/** Adressen im eigenen Netz (Router, Datenbank, Cloud-Metadaten) darf der Server nicht für Fremde abrufen. */
export function istInterneAdresse(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  const gemappt = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (gemappt) return istInterneAdresse(gemappt[1]!);
  // IPv4 in IPv6 verpackt (kompatibel, NAT64, 6to4) zählt wie die IPv4-Adresse – im Zweifel gesperrt.
  const eingebettet = v6.match(/^(?:::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (eingebettet) return istInterneAdresse(eingebettet[1]!);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff") || v6.startsWith("::ffff:") || v6.startsWith("64:ff9b:") || v6.startsWith("2002:");
}

/**
 * Namensauflösung für den Abruf: prüft jede Adresse, mit der wirklich verbunden wird. Die Prüfung beim Speichern allein
 * reicht nicht – ein Name kann zwischen Prüfung und Abruf auf eine interne Adresse umschwenken (DNS-Rebinding).
 */
export function sichereAufloesung(host: string, opts: { all?: boolean; family?: number }, cb: (e: Error | null, adresse?: string | LookupAddress[], familie?: number) => void) {
  dnsLookup(host, { all: true, family: opts?.family ?? 0 }, (e, adressen) => {
    if (e) return cb(e);
    if (!lokalErlaubt() && (!adressen.length || adressen.some((a) => istInterneAdresse(a.address)))) return cb(new Error("Adressen im eigenen Netz können nicht abonniert werden."));
    if (opts?.all) return cb(null, adressen);
    cb(null, adressen[0]!.address, adressen[0]!.family);
  });
}

/** Eine Anfrage ohne Weiterleitung: Status, Ziel einer Weiterleitung oder der Inhalt (höchstens KALENDER_MAX_BYTES). */
function abrufEinmal(url: URL): Promise<{ status: number; ziel: string | null; text: string }> {
  return new Promise((fertig, fehler) => {
    const modul = url.protocol === "https:" ? https : http;
    const anfrage = modul.get(
      url,
      { lookup: sichereAufloesung as never, timeout: KALENDER_ZEITLIMIT_MS, headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "User-Agent": "SchauFUCHS (Kalenderabruf)" } },
      (antwort) => {
        const status = antwort.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          antwort.resume();
          return fertig({ status, ziel: antwort.headers.location ?? null, text: "" });
        }
        if (Number(antwort.headers["content-length"] ?? 0) > KALENDER_MAX_BYTES) {
          antwort.destroy();
          return fehler(new Error("Die Kalenderdatei ist größer als 1 MB."));
        }
        const teile: Buffer[] = [];
        let groesse = 0;
        antwort.on("data", (b: Buffer) => {
          groesse += b.length;
          if (groesse > KALENDER_MAX_BYTES) {
            antwort.destroy();
            fehler(new Error("Die Kalenderdatei ist größer als 1 MB."));
          } else teile.push(b);
        });
        antwort.on("end", () => fertig({ status, ziel: null, text: Buffer.concat(teile).toString("utf8") }));
        antwort.on("error", fehler);
      },
    );
    anfrage.on("timeout", () => anfrage.destroy(new Error("Der Server hat nicht rechtzeitig geantwortet.")));
    anfrage.on("error", fehler);
  });
}

/** Nur zum Ausprobieren auf dem eigenen Rechner: Kalender auf localhost abonnieren (nie in Produktion). */
const lokalErlaubt = () => !config.production && process.env.TERMINABO_LOKAL === "1";

export async function pruefeKalenderAdresse(adresse: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(adresse.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new Error("Die Adresse ist ungültig.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Nur Adressen mit https:// (oder webcal://).");
  if (url.username || url.password) throw new Error("Adressen mit Benutzername oder Passwort sind nicht erlaubt.");
  if (lokalErlaubt()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const adressen = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  if (!adressen.length) throw new Error(`Der Server ${host} ist nicht erreichbar (Name unbekannt).`);
  if (adressen.some(istInterneAdresse)) throw new Error("Adressen im eigenen Netz können nicht abonniert werden.");
  return url;
}

/** Lädt eine Kalenderdatei: höchstens 1 MB, 15 Sekunden, drei Weiterleitungen (jede wird erneut geprüft). */
export async function holeKalender(adresse: string): Promise<string> {
  let url = await pruefeKalenderAdresse(adresse);
  for (let i = 0; ; i++) {
    const r = await abrufEinmal(url);
    if (r.status >= 300 && r.status < 400) {
      if (!r.ziel || i >= MAX_WEITERLEITUNGEN) throw new Error("Zu viele Weiterleitungen.");
      url = await pruefeKalenderAdresse(new URL(r.ziel, url).toString());
      continue;
    }
    if (r.status < 200 || r.status >= 300) throw new Error(`Der Server antwortet mit Fehler ${r.status}.`);
    if (!r.text.includes("BEGIN:VCALENDAR")) throw new Error("Unter der Adresse liegt kein Kalender im iCal-Format (.ics).");
    return r.text;
  }
}

export interface AbrufErgebnis {
  ok: boolean;
  fehler: string;
  anzahl: number;
  neu: number;
  geaendert: number;
  entfernt: number;
}

/**
 * Ruft ein Abo ab (oder nimmt `text`, z. B. in Tests) und gleicht ab: neue Termine als Vorschlag, Vorschläge folgen der
 * Quelle, übernommene Termine bekommen nur einen Abweichungshinweis. Fehler stehen am Abo, nichts wird gelöscht.
 */
export async function aboAbrufen(aboId: number, akteur: Akteur, text?: string): Promise<AbrufErgebnis> {
  const [abo] = await db.select().from(terminabo).where(eq(terminabo.id, aboId));
  // bleibt deutsch: interne Annahme, der Router prüft das Abo vorher
  if (!abo) throw new Error("Abo nicht gefunden.");
  let termine: IcalTermin[];
  try {
    termine = leseIcal(text ?? (await holeKalender(abo.url)));
  } catch (e) {
    const meldung =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
        ? "Der Server hat nicht rechtzeitig geantwortet."
        : e instanceof Error
          ? e.message
          : `Abruf fehlgeschlagen (${kurzerFehler(e)}).`;
    await db.update(terminabo).set({ letzterAbruf: new Date(), letzterFehler: meldung.slice(0, 300) }).where(eq(terminabo.id, aboId));
    return { ok: false, fehler: meldung, anzahl: 0, neu: 0, geaendert: 0, entfernt: 0 };
  }
  const heute = heuteDe();
  return db.transaction(async (tx) => {
    const vorhanden = await tx.select().from(schautermin).where(eq(schautermin.aboId, aboId));
    const a = gleicheAb(vorhanden, termine, heute);
    const jetzt = new Date();
    const basis = { organisationId: abo.organisationId, ebene: abo.ebene, kreisverband: abo.kreisverband, landesverband: abo.landesverband, quelle: abo.name, aboId, abgerufenAm: jetzt };
    if (a.neu.length) {
      await tx
        .insert(schautermin)
        .values(a.neu.map((t) => ({ ...basis, uid: t.uid, name: t.name, ort: t.ort, von: t.von, bis: t.bis, quelleUrl: t.url || abo.url, status: "vorschlag" as const })))
        .onConflictDoNothing();
    }
    for (const { id, termin: t } of a.vorschlagAktualisieren) {
      await tx.update(schautermin).set({ name: t.name, ort: t.ort, von: t.von, bis: t.bis, quelleUrl: t.url || abo.url, abgerufenAm: jetzt }).where(eq(schautermin.id, id));
    }
    for (const id of a.vorschlagEntfernen) await tx.delete(schautermin).where(and(eq(schautermin.id, id), eq(schautermin.status, "vorschlag")));
    for (const { id, abweichung } of a.abweichung) await tx.update(schautermin).set({ abweichung, abgerufenAm: jetzt }).where(eq(schautermin.id, id));
    for (const id of a.abweichungErledigt) await tx.update(schautermin).set({ abweichung: null, abgerufenAm: jetzt }).where(eq(schautermin.id, id));
    await tx.update(terminabo).set({ letzterAbruf: jetzt, letzterErfolg: jetzt, letzterFehler: "", anzahl: termine.length }).where(eq(terminabo.id, aboId));
    const geaendert = a.vorschlagAktualisieren.length + a.abweichung.length;
    if (a.neu.length || geaendert || a.vorschlagEntfernen.length) {
      await protokolliere(tx, {
        schauId: null,
        tabelle: "terminabo",
        datensatzId: aboId,
        aktion: "Kalender abgerufen",
        neu: {
          abo: abo.name,
          neu: a.neu.map((t) => `${t.von} ${t.name}`),
          vorschlaegeAktualisiert: a.vorschlagAktualisieren.map((x) => `${x.termin.von} ${x.termin.name}`),
          vorschlaegeEntfernt: a.vorschlagEntfernen,
          abweichungen: a.abweichung.map((x) => x.id),
        },
        akteur,
      });
    }
    return { ok: true, fehler: "", anzahl: termine.length, neu: a.neu.length, geaendert, entfernt: a.vorschlagEntfernen.length };
  });
}

/** Ruft alle aktiven Abos ab, eins nach dem anderen. */
export async function alleAbosAbrufen() {
  const abos = await db.select({ id: terminabo.id }).from(terminabo).where(eq(terminabo.aktiv, true));
  let fehler = 0;
  for (const a of abos) {
    const r = await aboAbrufen(a.id, { text: "Kalenderabruf (täglich)" }).catch((e) => ({ ok: false, fehler: kurzerFehler(e) }));
    if (!r.ok) fehler++;
  }
  if (abos.length) console.log(`[termine] ${abos.length} Kalender abgerufen, ${fehler} mit Fehler.`);
}

/** Abruf zwei Minuten nach dem Start und dann einmal täglich. */
export function starteTerminabruf() {
  const lauf = () => void alleAbosAbrufen().catch((e) => console.error("[termine] Abruf fehlgeschlagen:", kurzerFehler(e)));
  setTimeout(lauf, 2 * 60_000).unref?.();
  setInterval(lauf, 86_400_000).unref?.();
}
