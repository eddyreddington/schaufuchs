import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import { z, ZodError } from "zod";

// Fehlertexte der Eingabeprüfung auf Deutsch: eigene Texte in den Schemas gehen vor, dann kurze Texte für die häufigen
// Fälle (wie bisher in der Oberfläche), sonst die deutschen Standardtexte von zod.
z.config(z.locales.de());
z.config({ customError: kurzerPruefText });

/** Kurzer deutscher Text für häufige Prüffehler; `undefined` = Standardtext. */
export function kurzerPruefText(iss: z.core.$ZodRawIssue): string | undefined {
  const i = iss as z.core.$ZodRawIssue & { origin?: string; maximum?: number | bigint; minimum?: number | bigint; inclusive?: boolean; exact?: boolean; expected?: string; format?: string };
  const zahl = (v: number | bigint | undefined) => String(v ?? "");
  const text = i.origin === "string";
  const liste = i.origin === "array" || i.origin === "set";
  const wert = i.origin === "number" || i.origin === "bigint";
  switch (i.code) {
    case "too_big":
      if (text) return i.exact ? `Genau ${zahl(i.maximum)} Zeichen.` : i.inclusive === false ? `Weniger als ${zahl(i.maximum)} Zeichen.` : `Höchstens ${zahl(i.maximum)} Zeichen.`;
      if (liste) return `Höchstens ${zahl(i.maximum)} Einträge.`;
      if (wert) return i.inclusive === false ? `Kleiner als ${zahl(i.maximum)}.` : `Höchstens ${zahl(i.maximum)}.`;
      return undefined;
    case "too_small":
      if (text) return i.exact ? `Genau ${zahl(i.minimum)} Zeichen.` : i.inclusive === false ? `Mehr als ${zahl(i.minimum)} Zeichen.` : zahl(i.minimum) === "1" ? "Pflichtfeld." : `Mindestens ${zahl(i.minimum)} Zeichen.`;
      if (liste) return `Mindestens ${zahl(i.minimum)} ${zahl(i.minimum) === "1" ? "Eintrag" : "Einträge"}.`;
      if (wert) return i.inclusive === false ? `Größer als ${zahl(i.minimum)}.` : `Mindestens ${zahl(i.minimum)}.`;
      return undefined;
    case "invalid_type":
      if (i.input === undefined) return "Pflichtfeld.";
      if (i.expected === "int") return "Bitte eine ganze Zahl eingeben.";
      if (i.expected === "date") return "Ungültiges Datum.";
      return "Ungültige Eingabe.";
    case "invalid_value":
      return "Ungültige Auswahl.";
    case "invalid_format":
      return i.format === "email" ? "Ungültige E-Mail-Adresse." : "Ungültiges Format.";
    default:
      return undefined;
  }
}
import type { Angemeldet } from "./auth";
import { db } from "./db/client";
import { schau } from "./db/schema";
import { trpcGesperrt } from "./lesemodus";

export interface Context extends Angemeldet {
  /** Antwort-Header, z. B. für Set-Cookie beim Anmelden. */
  setCookie: (wert: string) => void;
  /** geraet: Gerätekennzeichen (auth.ts, COOKIE_GERAET) für die Bremsen der Anmeldung. */
  cookieTokens: { benutzer: string | undefined; richter: string | undefined; geraet?: string | undefined };
  ip: string;
}

/** Höchstens so viele Fehler der Eingabeprüfung gehen an den Browser – die Antwort bleibt klein, egal was kam. */
const MAX_PRUEFFEHLER = 20;

/**
 * superjson baut aus den Metadaten einer Anfrage Objekte, BEVOR irgendeine Prüfung läuft: {"json":12000000,
 * "meta":{"values":[["typed-array","Uint8Array"]]}} (80 Byte, ohne Anmeldung) erzeugte ein Feld mit 12 Millionen
 * Einträgen und ließ den Server am Speicherlimit sterben; lange Pfade kosteten Sekunden Rechenzeit. Die Oberfläche
 * sendet nur Datumswerte und „undefined“ – alles andere wird abgewiesen, Pfade und Anzahl sind begrenzt.
 */
const META_TYPEN = new Set(["Date", "undefined"]);
const META_MAX_KNOTEN = 20_000;
const META_MAX_SCHLUESSEL = 120;
/** Segmente je vollständigem Pfad und über alle Blätter – die Oberfläche braucht ein paar Dutzend. */
const META_MAX_SEGMENTE = 64;
const META_MAX_SEGMENTE_GESAMT = 50_000;
export function pruefeMeta(meta: unknown) {
  if (meta == null) return;
  const nein = () => new TRPCError({ code: "BAD_REQUEST", message: "Die Anfrage enthält nicht unterstützte Angaben." });
  if (typeof meta !== "object" || Array.isArray(meta)) throw nein();
  let knoten = 0;
  // superjson läuft für jedes Blatt den ganzen Pfad ab: begrenzt sind deshalb die Segmente je Pfad (auch über
  // verschachtelte Schlüssel hinweg, "a.b.c" zählt drei) und ihre Summe über alle Blätter.
  let segmenteGesamt = 0;
  const segmente = (k: string) => k.split(".").length;
  const schluesselOk = (k: string) => k.length <= META_MAX_SCHLUESSEL && segmente(k) <= META_MAX_SEGMENTE;
  const stapel: { v: unknown; tiefe: number }[] = [];
  const m = meta as { values?: unknown; referentialEqualities?: unknown };
  if (m.values !== undefined) stapel.push({ v: m.values, tiefe: 0 });
  while (stapel.length) {
    const { v, tiefe } = stapel.pop()!;
    if (++knoten > META_MAX_KNOTEN) throw nein();
    if (Array.isArray(v)) {
      // Blatt: [Typ] oder [Typ, Unterbaum]
      if (v.length < 1 || v.length > 2 || typeof v[0] !== "string" || !META_TYPEN.has(v[0])) throw nein();
      segmenteGesamt += tiefe;
      if (segmenteGesamt > META_MAX_SEGMENTE_GESAMT) throw nein();
      if (v.length === 2) stapel.push({ v: v[1], tiefe });
    } else if (v && typeof v === "object") {
      const eintraege = Object.entries(v);
      if (knoten + eintraege.length > META_MAX_KNOTEN) throw nein();
      for (const [k, x] of eintraege) {
        if (!schluesselOk(k)) throw nein();
        const neu = tiefe + segmente(k);
        if (neu > META_MAX_SEGMENTE) throw nein();
        stapel.push({ v: x, tiefe: neu });
      }
    } else throw nein();
  }
  // Verweise auf dasselbe Objekt: nur Listen kurzer Pfade.
  const r = m.referentialEqualities;
  if (r !== undefined) {
    const listen = Array.isArray(r) ? [r[0], r[1]] : [r];
    for (const l of listen) {
      if (l === undefined) continue;
      if (Array.isArray(l)) {
        if (l.length > 1000 || l.some((k) => typeof k !== "string" || !schluesselOk(k))) throw nein();
      } else if (l && typeof l === "object") {
        const e = Object.entries(l);
        if (e.length > 1000) throw nein();
        for (const [k, pfade] of e) {
          if (!schluesselOk(k) || !Array.isArray(pfade) || pfade.length > 1000 || pfade.some((x) => typeof x !== "string" || !schluesselOk(x))) throw nein();
        }
      } else throw nein();
    }
  }
}
const transformer = {
  serialize: (wert: unknown) => superjson.serialize(wert),
  deserialize: (wert: unknown) => {
    pruefeMeta((wert as { meta?: unknown } | null)?.meta);
    return superjson.deserialize(wert as Parameters<typeof superjson.deserialize>[0]);
  },
};

const t = initTRPC.context<Context>().create({
  transformer,
  errorFormatter({ shape, error }) {
    // Unerwartete Fehler (z. B. aus der Datenbank) nie im Wortlaut ausliefern: sie enthalten SQL, Spalten und Parameter.
    // Der vollständige Fehler steht im Server-Protokoll (onError in index.ts).
    const intern = error.code === "INTERNAL_SERVER_ERROR";
    const zod = error.cause instanceof ZodError ? new ZodError(error.cause.issues.slice(0, MAX_PRUEFFEHLER)).flatten() : null;
    return {
      ...shape,
      message: intern
        ? "Interner Fehler. Bitte erneut versuchen; besteht er weiter, die Ausstellungsleitung informieren."
        : zod
          ? "Bitte die Eingaben prüfen."
          : shape.message,
      data: { ...shape.data, stack: undefined, zod },
    };
  },
});

/**
 * Umfang einer Eingabe begrenzen, BEVOR zod sie prüft: zod prüft bei .max() trotzdem jedes Element und sammelt alle
 * Fehler (bis zod 4.6.6 ohne Grenze, GHSA-mrhx-c7xc-m3w5) – eine kleine Anfrage mit zehntausenden leeren Einträgen bände
 * sonst Hunderte MB Speicher.
 * Listen höchstens 500 Einträge (Tablet-Abgleich 2000), insgesamt höchstens 30.000 Werte, Verschachtelung höchstens 12.
 */
const MAX_LISTE = 500;
const MAX_LISTE_JE_AUFRUF: Record<string, number> = { "richter.abgleich": 2000, "oeffentlich.melden": 200, "kasse.ueberweisungenBuchen": 5000 };
const MAX_WERTE = 30_000;
const MAX_TIEFE = 12;
export function pruefeUmfang(wert: unknown, maxListe = MAX_LISTE) {
  const stapel: [unknown, number][] = [[wert, 0]];
  let werte = 0;
  while (stapel.length) {
    const [v, tiefe] = stapel.pop()!;
    if (++werte > MAX_WERTE) throw fehler("BAD_REQUEST", "Die Anfrage ist zu umfangreich.");
    if (v === null || typeof v !== "object" || v instanceof Date) continue;
    // Nur einfache Objekte und Listen: Felder aus Binärdaten, Map, Set usw. haben in einer Eingabe nichts zu suchen.
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw fehler("BAD_REQUEST", "Die Anfrage enthält nicht unterstützte Angaben.");
    if (tiefe > MAX_TIEFE) throw fehler("BAD_REQUEST", "Die Anfrage ist zu tief verschachtelt.");
    if (Array.isArray(v)) {
      if (v.length > maxListe) throw fehler("BAD_REQUEST", `Höchstens ${maxListe} Einträge je Liste.`);
      for (const x of v) stapel.push([x, tiefe + 1]);
    } else {
      const teile = Object.values(v);
      if (werte + teile.length > MAX_WERTE) throw fehler("BAD_REQUEST", "Die Anfrage ist zu umfangreich.");
      for (const x of teile) stapel.push([x, tiefe + 1]);
    }
  }
}
/**
 * Prüft den Rohtext einer JSON-Anfrage, bevor er geparst wird: JSON.parse und superjson binden je leerem Eintrag ein
 * Vielfaches seiner Textlänge, und bei tief verschachtelten superjson-Metadaten wächst der Speicher mit dem Quadrat der
 * Tiefe (eine anonyme Anfrage von 82 KB band so 1,5 GB) – noch bevor pruefeUmfang läuft.
 * Gezählt wird außerhalb von Zeichenketten: Zeichen, die Werte erzeugen ({ [ ,), und die Klammertiefe. Die Grenzen passen
 * zu MAX_WERTE und MAX_TIEFE, mit Platz für Bündelung und Metadaten.
 */
const MAX_STRUKTUR = 2 * MAX_WERTE;
const MAX_KLAMMERTIEFE = 32;
export function strukturZuGross(text: string, grenze = MAX_STRUKTUR): boolean {
  let anzahl = 0;
  let klammern = 0;
  let inText = false;
  for (let i = 0; i < text.length; i++) {
    const z = text.charCodeAt(i);
    if (inText) {
      if (z === 92) i++; // Backslash: das nächste Zeichen gehört zum Text
      else if (z === 34) inText = false;
    } else if (z === 34) inText = true;
    else if (z === 123 || z === 91) {
      if (++klammern > MAX_KLAMMERTIEFE || ++anzahl > grenze) return true;
    } else if (z === 125 || z === 93) klammern--;
    else if (z === 44 && ++anzahl > grenze) return true;
  }
  return false;
}

/** SQLSTATE eines Datenbankfehlers (auch eingepackt in DrizzleQueryError). */
export function sqlZustand(e: unknown): string {
  for (let x = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return "";
}

const basis = t.procedure.use(async ({ getRawInput, path, type, next }) => {
  // Lesemodus (Entscheidung 025): vor jeder anderen Prüfung, damit nichts angefasst wird.
  if (trpcGesperrt(type, path)) throw fehler("FORBIDDEN", NUR_LESEN_MELDUNG);
  pruefeUmfang(await getRawInput(), MAX_LISTE_JE_AUFRUF[path] ?? MAX_LISTE);
  const r = await next();
  // Zwei gleichzeitige Änderungen derselben Tiere (Deadlock, Serialisierung) oder zu langes Warten auf eine Sperre
  // (55P03, lock_timeout, Entscheidung 033): kein „Interner Fehler“, sondern ein Hinweis.
  // Bewusst nicht CONFLICT – damit böten Seiten „trotzdem speichern“ an und überschrieben die andere Änderung.
  if (!r.ok && ["40P01", "40001", "55P03"].includes(sqlZustand(r.error.cause))) {
    throw fehler("SERVICE_UNAVAILABLE", "Gleichzeitig hat jemand dasselbe geändert. Bitte noch einmal versuchen.");
  }
  return r;
});

export const router = t.router;
export const publicProcedure = basis;

export const fehler = (code: TRPCError["code"], message: string) => new TRPCError({ code, message });

/** Datenbank-ID (PostgreSQL integer): Werte außerhalb ergäben sonst einen internen Datenbankfehler. */
export const dbId = z.number().int().min(1).max(2_147_483_647);

/** Echtes Kalenderdatum JJJJ-MM-TT zwischen 1900 und 2100 (2026-02-30 oder 2026-13-45 ergäben sonst einen Datenbankfehler). */
export const kalenderdatum = (meldung = "Datum ungültig.") =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, meldung)
    .refine((d) => {
      const t = Date.parse(`${d}T12:00:00Z`);
      return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d && d >= "1900-01-01" && d <= "2100-12-31";
    }, meldung);

export const benutzerProcedure = basis.use(({ ctx, next }) => {
  if (!ctx.benutzer) throw fehler("UNAUTHORIZED", "Bitte anmelden.");
  // Ein im selben Browser angemeldeter Preisrichter gehört nicht zu dieser Anfrage (sonst stünde er im Protokoll).
  return next({ ctx: { ...ctx, benutzer: ctx.benutzer, richter: null } });
});

export const adminProcedure = benutzerProcedure.use(({ ctx, next }) => {
  // Pflicht: Administratoren verwalten erst nach eingerichteter Zwei-Faktor-Anmeldung (bis dahin gelten sie als Helfer).
  if (ctx.benutzer.zweiFaktorPflicht) {
    throw fehler("FORBIDDEN", "Für Administratoren ist die Zwei-Faktor-Anmeldung Pflicht. Bitte zuerst unter „Benutzer“ einrichten.");
  }
  if (ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nur für Administratoren.");
  return next();
});

export const richterProcedure = basis.use(({ ctx, next }) => {
  if (!ctx.richter) throw fehler("UNAUTHORIZED", "Bitte als Preisrichter anmelden.");
  return next({ ctx: { ...ctx, richter: ctx.richter, benutzer: null } });
});

/**
 * Admin-Änderungen, die öffentlich sichtbar sind, aber nicht im Protokoll stehen (Katalog-Gestaltung, Angaben der
 * Preisrichter): erneuern nach Erfolg die öffentlichen Zwischenspeicher der Schau.
 */
export const oeffentlichSichtbarProcedure = adminProcedure.use(async ({ getRawInput, next }) => {
  const r = await next();
  if (r.ok) {
    const eingabe = (await getRawInput()) as { schauId?: unknown } | undefined;
    if (typeof eingabe?.schauId === "number") (await import("./services/zwischenspeicher")).oeffentlichGeaendert(eingabe.schauId);
  }
  return r;
});

/** Lädt eine Schau und prüft, dass sie zur Organisation des Benutzers gehört. */
export async function ladeSchau(organisationId: number, schauId: number) {
  const [s] = await db
    .select()
    .from(schau)
    .where(and(eq(schau.id, schauId), eq(schau.organisationId, organisationId)));
  if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
  return s;
}

export type Schau = Awaited<ReturnType<typeof ladeSchau>>;

/** Nach der Freigabe ändert nur noch die Ausstellungsleitung (Rolle admin) Noten, Preise und Obmann-Bestätigungen. */
export function pruefeNachFreigabe(s: Pick<Schau, "ergebnisseFreigegeben">, b: { rolle: string }) {
  if (s.ergebnisseFreigegeben && b.rolle !== "admin") throw fehler("FORBIDDEN", "Nach der Freigabe nur durch die Ausstellungsleitung.");
}
