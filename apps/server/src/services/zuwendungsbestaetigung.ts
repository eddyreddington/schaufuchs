/**
 * Zuwendungsbestätigungen ausstellen und stornieren (Entscheidung 013). Ausgestellt wird nur, was die Fachregeln
 * erlauben (bestaetigungsSperren, sammelbestaetigung); das PDF wird beim Ausstellen erzeugt und als Doppel
 * unveränderbar abgelegt (§ 50 Abs. 7 EStDV) – jeder Nachdruck zeigt genau dieses.
 */
import { createHash } from "node:crypto";
import { bestaetigungsSperren, sammelbestaetigung } from "@schau/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "../db/client";
import { bestaetigungSpende, schau, zuwendungsbestaetigung } from "../db/schema";
import { ladeDesign } from "../pdf/dokumente-gemeinsam";
import { type BestaetigungsSpende, zuwendungsbestaetigungPdf } from "../pdf/spenden";
import { fehler } from "../trpc";
import { type Akteur, protokolliere } from "./protokoll";
import { ladeSpenden, ladeSteuer, naechsteBestaetigungsnummer, sperreBestaetigungen, type SpendeZeile } from "./spenden";
import { heuteDe } from "./tiergesundheit";

/** Stellt für eine Spende (Geld oder Sache) eine Einzelbestätigung aus. */
export async function bestaetigeSpende(tx: Tx, organisationId: number, spendeId: number, akteur: Akteur & { benutzer: { id: number; name: string } }) {
  await sperreBestaetigungen(tx, organisationId);
  const [z] = await ladeSpendenDesVereins(tx, organisationId, { spendeId });
  if (!z) throw fehler("NOT_FOUND", "Spende nicht gefunden.");
  return stelleAus(tx, organisationId, z.spender, [z], z.spende.art === "sache" ? "sache" : "geld", akteur);
}

/** Sammelbestätigung über alle bestätigungsfähigen Geldzuwendungen eines Spenders in einem Kalenderjahr. */
export async function sammelbestaetige(tx: Tx, organisationId: number, spenderId: number, jahr: number, akteur: Akteur & { benutzer: { id: number; name: string } }) {
  await sperreBestaetigungen(tx, organisationId);
  const zeilen = await ladeSpendenDesVereins(tx, organisationId, { spenderId });
  if (!zeilen.length) throw fehler("NOT_FOUND", "Keine Spenden dieses Spenders.");
  const auswahl = sammelbestaetigung(
    zeilen.map((z) => ({ ...z.fuerBestaetigung, zeile: z })),
    jahr,
  );
  if (!auswahl.spenden.length) throw fehler("BAD_REQUEST", `Für ${jahr} gibt es keine Geldspende, die noch bestätigt werden kann.`);
  return stelleAus(
    tx,
    organisationId,
    zeilen[0]!.spender,
    auswahl.spenden.map((s) => s.zeile),
    "sammel",
    akteur,
    jahr,
  );
}

/**
 * Spenden des Vereins (nur eigene Schauen), gefiltert nach einer Spende oder einem Spender – ohne Spenden aus
 * Testschauen: Übungsdaten bekommen keine Zuwendungsbestätigung und keine Nummer aus der echten Reihe.
 */
async function ladeSpendenDesVereins(tx: Tx, organisationId: number, f: { spendeId?: number; spenderId?: number }) {
  const alle = await ladeSpenden(tx, f.spenderId != null ? { spenderId: f.spenderId } : { spendeId: f.spendeId! });
  const test = new Set((await tx.select({ id: schau.id }).from(schau).where(and(eq(schau.organisationId, organisationId), eq(schau.test, true)))).map((x) => x.id));
  if (f.spendeId != null && alle.some((z) => test.has(z.spende.schauId))) throw fehler("BAD_REQUEST", "In einer Testschau gibt es keine Zuwendungsbestätigungen.");
  return alle.filter((z) => z.spender.organisationId === organisationId && !test.has(z.spende.schauId));
}

async function stelleAus(tx: Tx, organisationId: number, spender: SpendeZeile["spender"], zeilen: SpendeZeile[], art: "geld" | "sache" | "sammel", akteur: Akteur & { benutzer: { id: number; name: string } }, jahr?: number) {
  const heute = heuteDe();
  const { steuer, name, anschrift } = await ladeSteuer(organisationId, tx);
  for (const z of zeilen) {
    const sperren = bestaetigungsSperren(z.fuerBestaetigung, spender, steuer, heute);
    if (sperren.length) throw fehler("BAD_REQUEST", sperren.join(" "));
  }
  if (!name.trim() || !anschrift.trim()) throw fehler("BAD_REQUEST", "Name und Anschrift des Vereins fehlen (Verein und Datenschutz → Vereinsangaben).");
  const nummer = await naechsteBestaetigungsnummer(tx, organisationId);
  const [s] = await tx.select().from(schau).where(eq(schau.id, zeilen[0]!.spende.schauId));
  const spenden: BestaetigungsSpende[] = zeilen.map((z) => ({ datum: z.datum!, betragCent: z.spende.betragCent, verzichtAufwand: z.spende.verzichtAufwand, sache: z.spende.sache }));
  const pdf = await zuwendungsbestaetigungPdf(await ladeDesign(s!), { art, nummer: String(nummer), verein: { name, anschrift }, spender, steuer, spenden, heute, jahr });
  const betragCent = spenden.reduce((n, x) => n + x.betragCent, 0);
  const [b] = await tx
    .insert(zuwendungsbestaetigung)
    .values({ organisationId, nummer, spenderId: spender.id, art: art === "sammel" ? "sammel" : "einzel", betragCent, pdf, sha256: createHash("sha256").update(pdf).digest("hex"), erstelltVon: akteur.benutzer.id })
    .returning({ id: zuwendungsbestaetigung.id });
  await tx.insert(bestaetigungSpende).values(zeilen.map((z) => ({ bestaetigungId: b!.id, spendeId: z.spende.id })));
  await protokolliere(tx, {
    schauId: zeilen.length === 1 ? zeilen[0]!.spende.schauId : null,
    tabelle: "zuwendungsbestaetigung",
    datensatzId: b!.id,
    aktion: art === "sammel" ? "Sammelbestätigung ausgestellt" : "Zuwendungsbestätigung ausgestellt",
    neu: { nummer, spenderId: spender.id, betragCent, spenden: zeilen.map((z) => z.spende.id) },
    akteur,
  });
  return { id: b!.id, nummer };
}

/** Storno einer Bestätigung: ungültig, ihre Spenden lassen sich danach neu bestätigen. */
export async function storniereBestaetigung(tx: Tx, organisationId: number, id: number, grund: string, akteur: Akteur & { benutzer: { id: number; name: string } }) {
  await sperreBestaetigungen(tx, organisationId);
  const [b] = await tx.select().from(zuwendungsbestaetigung).where(and(eq(zuwendungsbestaetigung.id, id), eq(zuwendungsbestaetigung.organisationId, organisationId)));
  if (!b) throw fehler("NOT_FOUND", "Zuwendungsbestätigung nicht gefunden.");
  if (b.storniertAm) throw fehler("BAD_REQUEST", "Die Bestätigung ist schon storniert.");
  await tx.update(zuwendungsbestaetigung).set({ storniertAm: new Date(), storniertVon: akteur.benutzer.id, stornoGrund: grund }).where(and(eq(zuwendungsbestaetigung.id, id), isNull(zuwendungsbestaetigung.storniertAm)));
  await protokolliere(tx, { schauId: null, tabelle: "zuwendungsbestaetigung", datensatzId: id, aktion: "Zuwendungsbestätigung storniert", alt: { nummer: b.nummer, betragCent: b.betragCent }, grund, akteur });
}
