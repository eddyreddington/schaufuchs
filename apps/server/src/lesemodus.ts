/**
 * Lesemodus (Entscheidung 025): Mit NUR_LESEN=1 nimmt der Server keine Änderungen an, z. B. während einer Wartung oder
 * wenn der Betreiber eine Installation nur noch zum Nachsehen offen lässt. Gesperrt wird an zwei Stellen: jede
 * tRPC-Mutation (trpc.ts, vor jeder anderen Prüfung) und jede schreibende Anfrage außerhalb von /trpc (hier). Belege,
 * die erst beim Abruf entstehen, werden im Lesemodus nur erzeugt, nicht abgelegt (services/kassenbuch.ts).
 * Hintergrundarbeiten des Servers (Löschfristen, Postausgang, Kalender-Abos) laufen weiter – für einen Umzug mit
 * eingefrorener Datenbank die Anwendung anhalten.
 */
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import type { MiddlewareHandler } from "hono";
import { config } from "./config";

/**
 * Mutationen, die auch im Lesemodus gehen: An- und Abmelden (Lesen braucht eine Anmeldung; Pflicht-2FA sonst eine
 * Sackgasse), Schutz bei Verdacht (eigenes Passwort; Administratoren melden ein Konto ab oder sperren es – Entsperren
 * nicht, siehe benutzerAktiv), die Sprache der Oberfläche und der Widerruf der Online-Veröffentlichung (Art. 7 Abs. 3
 * DSGVO: jederzeit – das Erteilen sperrt die Prozedur selbst). Einladungen nicht: wer eingeladen ist, sieht den
 * Lesemodus schon beim Öffnen des Links, nicht erst nach der Eingabe des Passworts.
 */
export const IM_LESEMODUS_ERLAUBT: ReadonlySet<string> = new Set([
  "auth.anmelden",
  "auth.anmeldenCode",
  "auth.abmelden",
  "auth.zweiFaktorEinrichten",
  "auth.zweiFaktorBestaetigen",
  "auth.passwortAendern",
  "auth.benutzerAbmelden",
  "auth.benutzerAktiv",
  "auth.spracheSetzen",
  "richter.anmelden",
  "richter.abmelden",
  "oeffentlich.onlineVeroeffentlichung",
]);

/** POST-Adressen außerhalb von /trpc, die nur ein PDF erzeugen und nichts speichern. */
const NUR_PDF = /^\/datei\/(\d+\/katalog-vorschau|druckvorlage\/(vorschau|probedruck|brief)|serienbrief)\.pdf$/;

/** Ist dieser tRPC-Aufruf im Lesemodus gesperrt? Alles außer Abfragen (auch künftige Subscriptions). */
export function trpcGesperrt(typ: string, pfad: string): boolean {
  return config.nurLesen && typ !== "query" && !IM_LESEMODUS_ERLAUBT.has(pfad);
}

/** Schreibende Anfragen außerhalb von /trpc: im Lesemodus 403, außer den PDF-Vorschauen. */
export const lesemodusSperre: MiddlewareHandler = async (c, next) => {
  const schreibt = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
  if (config.nurLesen && schreibt && !c.req.path.startsWith("/trpc/") && !NUR_PDF.test(c.req.path)) return c.text(NUR_LESEN_MELDUNG, 403);
  return next();
};
