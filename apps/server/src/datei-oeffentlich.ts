/**
 * Öffentliche Dateien ohne Anmeldung, jeweils mit Bremse je Adresse:
 *   GET /o/:id/schauen.ics      – eigene Schauen des Vereins als Kalender (iCal)
 *   GET /s/:slug/a-bogen.pdf    – leerer A-Bogen
 *   GET /s/:slug/katalog.pdf    – öffentlicher Katalog nach Freigabe der Ergebnisse (zwischengespeichert als Datei)
 */
import { ONLINE_MONATE, onlineAbgelaufen, schreibeIcal } from "@schau/domain";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config";
import { db } from "./db/client";
import { aenderung, organisation, schau } from "./db/schema";
import { aBogenPdf } from "./pdf/a-bogen";
import { heuteDe } from "./services/tiergesundheit";
import { eigeneSchauenFuerKalender } from "./services/termine";
import { Bremse } from "./services/bremse";
import { oeffentlicherStand } from "./services/zwischenspeicher";
import { clientIp } from "./besucher-adresse";
import { katalogNacheinander } from "./datei-katalog";
import { pdf, zahlAus } from "./datei-hilfen";

/**
 * Öffentlicher Katalog nach Freigabe der Ergebnisse. Erzeugt wird er nur, wenn sich seit dem letzten Mal etwas
 * geändert hat (Protokollstand der Schau), und dann höchstens alle 10 Minuten neu – außer bei Datenschutz-Änderungen
 * (Löschung, Widerruf der Online-Veröffentlichung, Stifter): die gelten sofort. Gleichzeitige Abrufe teilen sich eine
 * Erzeugung; gespeichert werden höchstens 20 Kataloge. Je Adresse höchstens 20 Abrufe pro Minute.
 * Ausgeliefert wird aus einer Datei: Ein langsamer Abruf hält sonst das ganze PDF je Verbindung im Arbeitsspeicher.
 */
const KATALOG_ABSTAND_MS = 10 * 60_000;
const KATALOG_MAX = 20;
type KatalogEintrag = { stand: string; maxId: number; zaehler: number; zeit: number; pfad: Promise<string> };
const katalogCache = new Map<number, KatalogEintrag>();
export const katalogVerzeichnis = join(tmpdir(), `schau-katalog-${config.port}`);
let katalogDateiNr = 0;
async function katalogAlsDatei(s: typeof schau.$inferSelect): Promise<string> {
  const inhalt = await katalogNacheinander(s, { online: true });
  mkdirSync(katalogVerzeichnis, { recursive: true, mode: 0o700 });
  const pfad = join(katalogVerzeichnis, `${s.id}-${process.pid}-${++katalogDateiNr}.pdf`);
  await Bun.write(pfad, inhalt);
  return pfad;
}
/** Abgelöste Datei später löschen: ein Abruf, der sie gerade erst bekommen hat, soll sie noch öffnen können. */
function katalogVerwerfen(e: KatalogEintrag | undefined) {
  e?.pfad.then(
    (pfad) => void setTimeout(() => void rm(pfad, { force: true }).catch(() => {}), 60_000).unref?.(),
    () => {},
  );
}
const katalogBremse = new Bremse(20, 60_000, "Zu viele Abrufe. Bitte gleich noch einmal versuchen.");
async function datenschutzGeaendert(schauId: number, seit: number) {
  const [x] = await db
    .select({ n: count() })
    .from(aenderung)
    .where(and(eq(aenderung.schauId, schauId), gt(aenderung.id, seit), inArray(aenderung.tabelle, ["aussteller", "meldung", "stiftung"])));
  return (x?.n ?? 0) > 0;
}
/**
 * Eigene Schauen des Vereins als Kalender (iCal) – andere Vereine abonnieren ihn für die Katalogseite „Kommende
 * Schauen“. Nur Name, Ort, Tage und Link zur Schauseite; abschaltbar unter „Katalog“ → „Kommende Schauen“.
 */
const kalenderBremse = new Bremse(60, 60_000, "Zu viele Abrufe.");
const aBogenBremse = new Bremse(30, 60_000, "Zu viele Abrufe. Bitte gleich noch einmal versuchen.");

export function oeffentlicheDateien(app: Hono<any>) {
  app.get("/o/:id{[0-9]+}/schauen.ics", async (c) => {
    try {
      kalenderBremse.versuch([`ip:${clientIp(c)}`]);
    } catch {
      return c.text("Zu viele Abrufe. Bitte später noch einmal.", 429);
    }
    const id = zahlAus(c.req.param("id"));
    const [o] = id == null ? [] : await db.select({ name: organisation.name, an: organisation.termineVeroeffentlichen }).from(organisation).where(eq(organisation.id, id));
    if (!o || !o.an) return c.text("Kalender nicht gefunden.", 404);
    const ics = schreibeIcal({ name: `Schauen ${o.name}`, prodid: "-//SchauFUCHS//Schautermine//DE" }, await eigeneSchauenFuerKalender(id!), new Date());
    return c.body(ics, 200, { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="schauen.ics"`, "Cache-Control": "public, max-age=3600" });
  });

  // Leerer A-Bogen für alle, die auf Papier melden – nur Angaben, die auf der Schauseite ohnehin öffentlich stehen.
  app.get("/s/:slug/a-bogen.pdf", async (c) => {
    try {
      aBogenBremse.versuch([`ip:${clientIp(c)}`]);
    } catch {
      return c.text("Zu viele Abrufe. Bitte gleich noch einmal versuchen.", 429);
    }
    const [s] = await db.select().from(schau).where(eq(schau.slug, c.req.param("slug").slice(0, 100)));
    if (!s || s.abgesagtAm) return c.text("Schau nicht gefunden.", 404);
    return pdf(c, (await aBogenPdf(s))!, `a-bogen-${s.slug}.pdf`);
  });

  app.get("/s/:slug/katalog.pdf", async (c) => {
    try {
      katalogBremse.versuch([`ip:${clientIp(c)}`]);
    } catch {
      return c.text("Zu viele Abrufe. Bitte gleich noch einmal versuchen.", 429);
    }
    const [s] = await db.select().from(schau).where(eq(schau.slug, c.req.param("slug").slice(0, 100)));
    if (!s || !s.ergebnisseFreigegeben) return c.text("Der Katalog ist noch nicht veröffentlicht.", 404);
    if (onlineAbgelaufen(s.bewertungAm, heuteDe())) return c.text(`Der Katalog steht nur ${ONLINE_MONATE} Monate nach der Schau im Internet.`, 404);
    const neu = await oeffentlicherStand(s.id);
    const alt = katalogCache.get(s.id);
    let eintrag = alt;
    // Sofort neu: Datenschutz-Änderungen und bewusste Änderungen an Gestaltung oder Preisrichter-Angaben.
    const sofort = async (a: NonNullable<typeof alt>) => a.zaehler !== neu.zaehler || (await datenschutzGeaendert(s.id, a.maxId));
    if (!alt || (alt.stand !== neu.schluessel && (Date.now() - alt.zeit > KATALOG_ABSTAND_MS || (await sofort(alt))))) {
      // Während der Prüfung oben kann eine gleichzeitige Anfrage schon erneuert haben: dann deren Katalog nehmen.
      const aktuell = katalogCache.get(s.id);
      if (aktuell && aktuell !== alt) eintrag = aktuell;
      else {
        eintrag = { stand: neu.schluessel, maxId: neu.maxId, zaehler: neu.zaehler, zeit: Date.now(), pfad: katalogAlsDatei(s) };
        katalogVerwerfen(aktuell);
        katalogCache.delete(s.id);
        katalogCache.set(s.id, eintrag);
        // Älteste zuerst verwerfen (Map behält die Einfüge-Reihenfolge).
        while (katalogCache.size > KATALOG_MAX) {
          const aeltester = katalogCache.keys().next().value!;
          katalogVerwerfen(katalogCache.get(aeltester));
          katalogCache.delete(aeltester);
        }
        const e = eintrag;
        e.pfad.catch(() => katalogCache.get(s.id) === e && katalogCache.delete(s.id));
      }
    }
    const katalogDatei = Bun.file(await eintrag!.pfad);
    if (!(await katalogDatei.exists())) {
      // Von außen gelöscht (z. B. Aufräumen von /tmp): beim nächsten Abruf neu erzeugen.
      if (katalogCache.get(s.id) === eintrag) katalogCache.delete(s.id);
      return c.text("Der Katalog wird gerade neu erzeugt. Bitte gleich noch einmal versuchen.", 503);
    }
    return new Response(katalogDatei, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="katalog-${s.slug}.pdf"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  });
}
