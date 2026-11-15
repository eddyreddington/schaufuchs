import type { BausteinArt, BausteinKategorie } from "@schau/domain";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { textbaustein } from "../db/schema";
import { TEXTBAUSTEINE_LISTE } from "./textbausteine-grundbestand";

export interface Grundbaustein {
  kategorie: BausteinKategorie;
  gruppe: string;
  art: BausteinArt;
  text: string;
}

/**
 * Grundbestand für das Tablet der Preisrichter – eigene Formulierungen im üblichen Stil der Bewertungskarten, gegliedert
 * nach Merkmal und Geflügelart (Quellen und Vorgehen: docs/textbausteine-quellen.md). Die Ausstellungsleitung pflegt ihn
 * unter „Verein und Datenschutz“.
 */
export const TEXTBAUSTEINE_GRUNDBESTAND: Grundbaustein[] = TEXTBAUSTEINE_LISTE;

export async function legeTextbausteineAn(tx: Tx, organisationId: number) {
  for (let i = 0; i < TEXTBAUSTEINE_GRUNDBESTAND.length; i += 500) {
    await tx.insert(textbaustein).values(TEXTBAUSTEINE_GRUNDBESTAND.slice(i, i + 500).map((b) => ({ organisationId, ...b })));
  }
}

const schluessel = (b: { kategorie: string; gruppe: string; art: string; text: string }) => `${b.kategorie}|${b.gruppe}|${b.art}|${b.text.toLowerCase()}`;

/** Höchstzahl der Bausteine je Verein (Tablet und Pflege bleiben bedienbar). */
export const TEXTBAUSTEINE_MAX = 3000;

/** Änderungen an den Bausteinen eines Vereins nacheinander (sonst entstünden bei gleichzeitigen Aufrufen Doppelte). */
export async function sperreBausteine(tx: Tx, organisationId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(4712, ${organisationId})`);
}

/** Ergänzt fehlende Bausteine des Grundbestands. Vorhandene (auch geänderte oder eigene) bleiben, nichts wird gelöscht. */
export async function ergaenzeGrundbestand(organisationId: number): Promise<number> {
  return db.transaction(async (tx) => {
    await sperreBausteine(tx, organisationId);
    const vorhanden = await tx.select().from(textbaustein).where(and(eq(textbaustein.organisationId, organisationId)));
    // Nur Bausteine ohne Rasse zählen als vorhanden – ein gleichlautender Baustein für eine Rasse ersetzt den allgemeinen nicht.
    const da = new Set(vorhanden.filter((b) => !b.rasse).map(schluessel));
    const fehlen = TEXTBAUSTEINE_GRUNDBESTAND.filter((b) => !da.has(schluessel(b))).slice(0, Math.max(0, TEXTBAUSTEINE_MAX - vorhanden.length));
    for (let i = 0; i < fehlen.length; i += 500) {
      await tx.insert(textbaustein).values(fehlen.slice(i, i + 500).map((b) => ({ organisationId, ...b })));
    }
    return fehlen.length;
  });
}
