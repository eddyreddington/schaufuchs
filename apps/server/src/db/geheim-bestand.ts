/**
 * Stellt Altbestand im Klartext auf verschlüsselte Spalten um (läuft bei jedem Start nach den Migrationen; findet es
 * nichts mehr, tut es nichts). Lesen über Drizzle reicht den Klartext unverändert durch, Schreiben verschlüsselt.
 */
import { eq, inArray, sql } from "drizzle-orm";
import type { db as Db } from "./client";
import { datenschluessel, entschluessele, erlaubeKlartext, PRAEFIX } from "./geheim";
import { aussteller, benutzer, sepaLauf } from "./schema";

const klar = (spalte: string) => sql.raw(`(${spalte} <> '' and ${spalte} not like '${PRAEFIX}%')`);

/**
 * Passt der Schlüssel zu den vorhandenen Daten? Je Spalte wird ein verschlüsselter Wert probeweise gelesen. Sonst
 * startet die Anwendung nicht – mit einem falschen (z. B. neu erzeugten) Schlüssel würde sie Neues anders verschlüsseln
 * als den Bestand, und keiner der beiden Schlüssel könnte danach alles lesen.
 */
export async function pruefeDatenschluessel(db: typeof Db) {
  datenschluessel(); // ohne Schlüssel in Produktion sofort abbrechen, nicht erst beim ersten Zugriff
  const proben: [string, string][] = [
    ["select iban as w from aussteller where iban like 'enc1:%' limit 1", "aussteller.iban"],
    ["select kontoinhaber as w from aussteller where kontoinhaber like 'enc1:%' limit 1", "aussteller.kontoinhaber"],
    ["select totp_geheim as w from benutzer where totp_geheim like 'enc1:%' limit 1", "benutzer.totpGeheim"],
    ["select daten->>'enc' as w from sepa_lauf where daten ? 'enc' limit 1", "sepaLauf.daten"],
  ];
  for (const [q, feld] of proben) {
    const [z] = (await db.execute(sql.raw(q))) as unknown as { w: string }[];
    if (z) entschluessele(z.w, feld); // wirft mit klarer Meldung
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
    const a = await ids(sql`select id from aussteller where ${klar("iban")} or ${klar("kontoinhaber")} for update`);
    for (const id of a) {
      const [x] = await tx.select({ iban: aussteller.iban, kontoinhaber: aussteller.kontoinhaber }).from(aussteller).where(eq(aussteller.id, id));
      await tx.update(aussteller).set(x!).where(eq(aussteller.id, id));
    }
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
    return { aussteller: a.length, benutzer: b.length, sepa: s.length };
  });
}
