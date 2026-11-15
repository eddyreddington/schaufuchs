/**
 * Gemeinsamer Zustand und Hilfen für den Schau-Ablauf (ablauf.test.ts und die Teile in diesem Ordner). Die Teile laufen
 * nacheinander gegen dieselbe Test-Datenbank und bauen aufeinander auf.
 */
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Mod = {
  appRouter: typeof import("../router").appRouter;
  db: typeof import("../db/client").db;
  sql: typeof import("../db/client").sql;
  schema: typeof import("../db/schema");
  eq: typeof import("drizzle-orm").eq;
  desc: typeof import("drizzle-orm").desc;
  inArray: typeof import("drizzle-orm").inArray;
  ne: typeof import("drizzle-orm").ne;
};

/** Module und Datenbank – gesetzt in beforeAll von ablauf.test.ts. */
export let m: Mod;
/** Administrator des Testvereins – gesetzt im ersten Test („Einrichtung, Stammdaten, Schau“). */
export let adminKontext: import("../trpc").Context;
export const setzeM = (x: Mod) => {
  m = x;
};
export const setzeAdminKontext = (k: import("../trpc").Context) => {
  adminKontext = k;
};

/** Verzeichnis src (Pfade zu seed/, drizzle/ relativ dazu). */
export const SRC = join(import.meta.dir, "..");

export const leer = { benutzer: null, richter: null, cookieTokens: { benutzer: undefined, richter: undefined }, ip: "test", setCookie: () => {} };

/** Testhilfe: Text eines PDFs (pdftotext, Poppler) – der Rohinhalt ist komprimiert und taugt nicht zum Suchen. */
export function pdfText(pdf: Buffer): string {
  const datei = join(tmpdir(), `schau-test-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(datei, pdf);
  try {
    const r = Bun.spawnSync(["pdftotext", "-layout", datei, "-"]);
    if (r.exitCode !== 0) throw new Error(`pdftotext fehlgeschlagen: ${r.stderr.toString()}`);
    return r.stdout.toString();
  } finally {
    rmSync(datei, { force: true });
  }
}

/** Testhilfe: Tiere wie nach der Bewertung verkaufsbereit machen (eingeliefert, bewertet, Phase „Schau“). */
export async function verkaufsbereit(schauId: number, ids: number[]) {
  const [s] = await m.db.select().from(m.schema.schau).where(m.eq(m.schema.schau.id, schauId));
  if (s!.phase !== "preise" && s!.phase !== "schau") await m.db.update(m.schema.schau).set({ phase: "schau" }).where(m.eq(m.schema.schau.id, schauId));
  await m.db.update(m.schema.katalogeintrag).set({ status: "eingeliefert" }).where(m.inArray(m.schema.katalogeintrag.id, ids));
  await m.db.insert(m.schema.bewertung).values(ids.map((id) => ({ katalogeintragId: id, punkte: 93 }))).onConflictDoNothing();
}
