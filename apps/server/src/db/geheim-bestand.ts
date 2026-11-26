/**
 * Stellt Altbestand im Klartext auf verschlüsselte Spalten um und bindet Bankdaten ohne Zeile (`enc1:`) an ihre Zeile
 * (`enc2:`, Entscheidung 035). Läuft bei jedem Start nach den Migrationen; findet es nichts mehr, tut es nichts. Lesen
 * über Drizzle reicht den Altbestand unverändert durch, Schreiben verschlüsselt (Bankdaten gebunden).
 */
import { eq, inArray, sql } from "drizzle-orm";
import type { db as Db } from "./client";
import { bankdatenFuer, datenschluessel, entschluessele, erlaubeKlartext, PRAEFIX_ZEILE } from "./geheim";
import { aussteller, benutzer, sepaLauf, sepaMandat } from "./schema";

/** Klartext (Altbestand vor der Verschlüsselung). */
const klar = (spalte: string) => sql.raw(`(${spalte} <> '' and ${spalte} !~ '^enc[12]:')`);
/** Bankdaten noch nicht an ihre Zeile gebunden (Klartext oder `enc1:`). */
const ungebunden = (spalte: string) => `(${spalte} <> '' and ${spalte} not like '${PRAEFIX_ZEILE}%')`;

/**
 * Passt der Schlüssel zu den vorhandenen Daten? Je Spalte wird ein verschlüsselter Wert probeweise gelesen. Sonst
 * startet die Anwendung nicht – mit einem falschen (z. B. neu erzeugten) Schlüssel würde sie Neues anders verschlüsseln
 * als den Bestand, und keiner der beiden Schlüssel könnte danach alles lesen.
 */
export async function pruefeDatenschluessel(db: typeof Db) {
  datenschluessel(); // ohne Schlüssel in Produktion sofort abbrechen, nicht erst beim ersten Zugriff
  const proben: [string, string][] = [
    ["select iban as w from aussteller where iban ~ '^enc[12]:' limit 1", "aussteller.iban"],
    ["select kontoinhaber as w from aussteller where kontoinhaber ~ '^enc[12]:' limit 1", "aussteller.kontoinhaber"],
    ["select totp_geheim as w from benutzer where totp_geheim ~ '^enc[12]:' limit 1", "benutzer.totpGeheim"],
    ["select daten->>'enc' as w from sepa_lauf where daten ? 'enc' limit 1", "sepaLauf.daten"],
    ["select iban as w from sepa_mandat where iban ~ '^enc[12]:' limit 1", "sepaMandat.iban"],
    ["select kontoinhaber as w from sepa_mandat where kontoinhaber ~ '^enc[12]:' limit 1", "sepaMandat.kontoinhaber"],
    ["select daten->>'enc' as w from lastschrift_lauf where daten ? 'enc' limit 1", "lastschriftLauf.daten"],
  ];
  // Bankdaten ohne Zeile (enc1, vor Entscheidung 035) sind hier noch erlaubt: die Umstellung bindet sie gleich danach.
  erlaubeKlartext(true);
  try {
    for (const [q, feld] of proben) {
      const [z] = (await db.execute(sql.raw(q))) as unknown as { w: string }[];
      if (z) entschluessele(z.w, feld); // wirft mit klarer Meldung
    }
  } finally {
    erlaubeKlartext(null);
  }
}

export async function verschluesseleBestand(db: typeof Db) {
  erlaubeKlartext(true);
  try {
    return await umstellen(db);
  } finally {
    erlaubeKlartext(null);
  }
}

async function umstellen(db: typeof Db) {
  return db.transaction(async (tx) => {
    const ids = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: number }[]).map((r) => r.id);
    // Bankdaten: Klartext und `enc1:` (ohne Zeile) werden an ihre Zeile gebunden. Ein `enc2:` mit fremder Zeile bleibt,
    // wie es ist – das fällt in Abrechnung und Lastschrift auf (db/geheim.ts).
    // Nur die ungebundenen Spalten einer Zeile: ein gebundener Nachbarwert wird nie neu (an diese Zeile) gebunden.
    const binde = async (tabelle: "aussteller" | "sepaMandat") => {
      const t = tabelle === "aussteller" ? aussteller : sepaMandat;
      const name = tabelle === "aussteller" ? "aussteller" : "sepa_mandat";
      const zeilen = (await tx.execute(sql.raw(`select id, iban, kontoinhaber from ${name} where ${ungebunden("iban")} or ${ungebunden("kontoinhaber")} for update`))) as unknown as { id: number; iban: string; kontoinhaber: string }[];
      for (const z of zeilen) {
        const neu: { iban?: string; kontoinhaber?: string } = {};
        for (const k of ["iban", "kontoinhaber"] as const) if (z[k] && !z[k].startsWith(PRAEFIX_ZEILE)) neu[k] = entschluessele(z[k], `${tabelle}.${k}`);
        await tx.update(t).set(bankdatenFuer(tabelle, z.id, neu)).where(eq(t.id, z.id));
      }
      return zeilen.length;
    };
    const a = await binde("aussteller");
    const ma = await binde("sepaMandat");
    const b = await ids(sql`select id from benutzer where totp_geheim is not null and ${klar("totp_geheim")} for update`);
    for (const id of b) {
      const [x] = await tx.select({ g: benutzer.totpGeheim }).from(benutzer).where(eq(benutzer.id, id));
      await tx.update(benutzer).set({ totpGeheim: x!.g }).where(eq(benutzer.id, id));
    }
    const s = await ids(sql`select id from sepa_lauf where not (daten ? 'enc') for update`);
    if (s.length) {
      for (const x of await tx.select({ id: sepaLauf.id, daten: sepaLauf.daten }).from(sepaLauf).where(inArray(sepaLauf.id, s))) {
        await tx.update(sepaLauf).set({ daten: x.daten }).where(eq(sepaLauf.id, x.id));
      }
    }
    return { aussteller: a, benutzer: b.length, sepa: s.length, mandate: ma };
  });
}
