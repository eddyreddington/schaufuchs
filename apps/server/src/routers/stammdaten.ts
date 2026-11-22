import { bdrgGruppe, bdrgGruppeGueltig, parseStammdatenCsv } from "@schau/domain";
import { and, asc, count, desc, eq, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { farbenschlag, katalogeintrag, rasse, schau, sparte, stammdatenVersion } from "../db/schema";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, router, dbId } from "../trpc";

/** Sucht Farbenschläge für die Eingabe "Rasse, Farbenschlag". Wird auch vom öffentlichen Meldeformular genutzt. */
export async function sucheFarbenschlag(versionId: number, q: string, limit = 30) {
  const woerter = q
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 5);
  const bedingungen = woerter.map((w) => {
    const muster = `%${ohneJoker(w)}%`;
    return or(ilike(rasse.name, muster), ilike(farbenschlag.name, muster), ilike(sparte.name, muster));
  });
  // Bei Tausenden Farbenschlägen zählt die Reihenfolge: "King" soll die Rasse King zeigen, nicht Pekingenten und Dorking.
  const rang = woerter.map((roh) => {
    const w = ohneJoker(roh);
    return sql`case
      when lower(${rasse.name}) = lower(${roh}) then 0
      when ${rasse.name} ilike ${`${w}%`} then 1
      when ${rasse.name} ilike ${`% ${w}%`} or ${rasse.name} ilike ${`%-${w}%`} then 2
      when ${farbenschlag.name} ilike ${`${w}%`} or ${farbenschlag.name} ilike ${`% ${w}%`} or ${farbenschlag.name} ilike ${`%-${w}%`} then 3
      else 4 end`;
  });
  return db
    .select({
      id: farbenschlag.id,
      farbenschlag: farbenschlag.name,
      rasseId: rasse.id,
      rasse: rasse.name,
      sparte: sparte.name,
    })
    .from(farbenschlag)
    .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
    .innerJoin(sparte, eq(sparte.id, rasse.sparteId))
    .where(and(eq(farbenschlag.versionId, versionId), ...bedingungen))
    .orderBy(...(rang.length ? [asc(sql`${sql.join(rang, sql` + `)}`)] : []), asc(sparte.folge), asc(rasse.folge), asc(farbenschlag.folge))
    .limit(limit);
}

/** Eingabe wörtlich suchen: % und _ sind bei ilike sonst Platzhalter. */
function ohneJoker(w: string) {
  return w.replace(/[\\%_]/g, (z) => `\\${z}`);
}

/** Versionen, die ein Verein sehen und nutzen darf: eigene und die vom Betreiber bereitgestellten (ohne Verein). */
export function versionSichtbar(organisationId: number) {
  return or(isNull(stammdatenVersion.organisationId), eq(stammdatenVersion.organisationId, organisationId));
}

/** Prüft, dass der Verein diese Version nutzen darf. */
export async function pruefeVersion(organisationId: number, versionId: number) {
  const [v] = await db
    .select({ id: stammdatenVersion.id })
    .from(stammdatenVersion)
    .where(and(eq(stammdatenVersion.id, versionId), versionSichtbar(organisationId)));
  if (!v) throw fehler("BAD_REQUEST", "Diese Stammdaten-Version gibt es nicht.");
}

/** Spielt ein Verzeichnis ein. organisationId null = für alle Vereine (nur Betreiber, z. B. per Skript). */
export async function importiereStammdaten(input: { name: string; jahr: number; quelle: string; csv: string; organisationId: number | null }) {
  const { baum, fehler: probleme } = parseStammdatenCsv(input.csv);
  if (baum.sparten.length === 0) throw fehler("BAD_REQUEST", "Die Datei enthält keine gültigen Zeilen.");
  return db.transaction(async (tx) => {
    const [v] = await tx.insert(stammdatenVersion).values({ organisationId: input.organisationId, name: input.name, jahr: input.jahr, quelle: input.quelle }).returning();
    let folgeS = 0;
    let folgeR = 0;
    let folgeF = 0;
    let farben = 0;
    for (const s of baum.sparten) {
      const [sp] = await tx.insert(sparte).values({ versionId: v!.id, name: s.name, folge: ++folgeS }).returning();
      for (const r of s.rassen) {
        const [ra] = await tx.insert(rasse).values({ versionId: v!.id, sparteId: sp!.id, name: r.name, folge: ++folgeR, gruppe: r.gruppe }).returning();
        await tx.insert(farbenschlag).values(
          r.farbenschlaege.map((f) => ({ versionId: v!.id, rasseId: ra!.id, name: f, folge: ++folgeF })),
        );
        farben += r.farbenschlaege.length;
      }
    }
    return { versionId: v!.id, farbenschlaege: farben, hinweise: probleme };
  });
}

const bezeichnung = z.string().trim().min(1, "Bitte ausfüllen.").max(200);
const gleicherName = (a: string, b: string) => a.localeCompare(b, "de", { sensitivity: "accent" }) === 0;

export const stammdatenRouter = router({
  /** Sparten und Rassen einer Version – für die Vorschläge beim Ergänzen. */
  gliederung: benutzerProcedure.input(z.object({ versionId: dbId })).query(async ({ ctx, input }) => {
    await pruefeVersion(ctx.benutzer.organisationId, input.versionId);
    const [sparten, rassen] = await Promise.all([
      db.select({ id: sparte.id, name: sparte.name }).from(sparte).where(eq(sparte.versionId, input.versionId)).orderBy(asc(sparte.folge)),
      db.select({ id: rasse.id, name: rasse.name, sparteId: rasse.sparteId, gruppe: rasse.gruppe }).from(rasse).where(eq(rasse.versionId, input.versionId)).orderBy(asc(rasse.folge)),
    ]);
    return { sparten, rassen };
  }),

  /**
   * Ergänzt ein eingespieltes Verzeichnis von Hand um Sparte, Rasse und Farbenschläge. Vorhandene Sparten und Rassen
   * werden über den Namen wiederverwendet; Neues kommt ans Ende seiner Gruppe, die bisherige Ausstellungsfolge und
   * vergebene Katalognummern bleiben so unberührt. Nur für Versionen des eigenen Vereins.
   */
  ergaenzen: adminProcedure
    .input(z.object({ versionId: dbId, sparte: bezeichnung, rasse: bezeichnung, farbenschlaege: z.array(bezeichnung).min(1, "Bitte mindestens einen Farbenschlag angeben.").max(200) }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        // Sperrt die Version: gleichzeitige Ergänzungen bekommen so keine doppelte Folge.
        const [v] = await tx
          .select({ id: stammdatenVersion.id, organisationId: stammdatenVersion.organisationId })
          .from(stammdatenVersion)
          .where(and(eq(stammdatenVersion.id, input.versionId), versionSichtbar(ctx.benutzer.organisationId)))
          .for("update");
        if (!v) throw fehler("NOT_FOUND", "Version nicht gefunden.");
        if (v.organisationId !== ctx.benutzer.organisationId) {
          throw fehler("FORBIDDEN", "Diese Version ist für alle Vereine bereitgestellt und lässt sich nicht ergänzen. Bitte ein eigenes Verzeichnis einspielen.");
        }
        const naechste = async (spalte: typeof sparte.folge | typeof rasse.folge | typeof farbenschlag.folge, tabelle: typeof sparte | typeof rasse | typeof farbenschlag) => {
          const [r] = await tx.select({ m: max(spalte) }).from(tabelle).where(eq(tabelle.versionId, v.id));
          return (r?.m ?? 0) + 1;
        };

        const sparten = await tx.select({ id: sparte.id, name: sparte.name }).from(sparte).where(eq(sparte.versionId, v.id));
        let sp = sparten.find((s) => gleicherName(s.name, input.sparte));
        const neueSparte = !sp;
        if (!sp) [sp] = await tx.insert(sparte).values({ versionId: v.id, name: input.sparte, folge: await naechste(sparte.folge, sparte) }).returning({ id: sparte.id, name: sparte.name });

        const rassen = await tx.select({ id: rasse.id, name: rasse.name }).from(rasse).where(and(eq(rasse.versionId, v.id), eq(rasse.sparteId, sp!.id)));
        let ra = rassen.find((r) => gleicherName(r.name, input.rasse));
        const neueRasse = !ra;
        if (!ra) [ra] = await tx.insert(rasse).values({ versionId: v.id, sparteId: sp!.id, name: input.rasse, folge: await naechste(rasse.folge, rasse) }).returning({ id: rasse.id, name: rasse.name });

        const vorhanden = await tx.select({ name: farbenschlag.name }).from(farbenschlag).where(eq(farbenschlag.rasseId, ra!.id));
        const anlegen: string[] = [];
        const schonDa: string[] = [];
        for (const f of input.farbenschlaege) {
          if (vorhanden.some((x) => gleicherName(x.name, f)) || anlegen.some((x) => gleicherName(x, f))) schonDa.push(f);
          else anlegen.push(f);
        }
        if (anlegen.length === 0) throw fehler("CONFLICT", `Alle angegebenen Farbenschläge gibt es bei „${ra!.name}“ schon.`);
        let folge = await naechste(farbenschlag.folge, farbenschlag);
        await tx.insert(farbenschlag).values(anlegen.map((name) => ({ versionId: v.id, rasseId: ra!.id, name, folge: folge++ })));
        await protokolliere(tx, {
          schauId: null,
          tabelle: "stammdaten_version",
          datensatzId: v.id,
          aktion: "Verzeichnis ergänzt",
          neu: { sparte: sp!.name, neueSparte, rasse: ra!.name, neueRasse, farbenschlaege: anlegen },
          akteur: ctx,
        });
        return { sparte: sp!.name, rasse: ra!.name, neueSparte, neueRasse, angelegt: anlegen, schonDa };
      });
    }),
  /**
   * BDRG-Gruppen je Rasse pflegen (A, Z1, BV …; leer = keine). Nur für Versionen des eigenen Vereins; jede Änderung mit
   * altem und neuem Wert im Protokoll.
   */
  gruppenSetzen: adminProcedure
    .input(z.object({ versionId: dbId, gruppen: z.array(z.object({ rasseId: dbId, gruppe: z.string().max(20) })).min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const neu = input.gruppen.map((g) => ({ rasseId: g.rasseId, gruppe: bdrgGruppe(g.gruppe) }));
      if (neu.some((g) => g.gruppe && !bdrgGruppeGueltig(g.gruppe))) throw fehler("BAD_REQUEST", "Gruppe ungültig – kurzer Text wie A, Z1 oder BV.");
      return db.transaction(async (tx) => {
        const [v] = await tx
          .select({ id: stammdatenVersion.id, organisationId: stammdatenVersion.organisationId })
          .from(stammdatenVersion)
          .where(and(eq(stammdatenVersion.id, input.versionId), versionSichtbar(ctx.benutzer.organisationId)))
          .for("update");
        if (!v) throw fehler("NOT_FOUND", "Version nicht gefunden.");
        if (v.organisationId !== ctx.benutzer.organisationId) {
          throw fehler("FORBIDDEN", "Diese Version ist für alle Vereine bereitgestellt und lässt sich nicht ergänzen. Bitte ein eigenes Verzeichnis einspielen.");
        }
        const ids = [...new Set(neu.map((g) => g.rasseId))];
        const rassen = await tx.select({ id: rasse.id, name: rasse.name, gruppe: rasse.gruppe }).from(rasse).where(and(eq(rasse.versionId, v.id), inArray(rasse.id, ids)));
        if (rassen.length !== ids.length) throw fehler("NOT_FOUND", "Rasse nicht gefunden.");
        const aenderungen: { rasse: string; alt: string; neu: string }[] = [];
        for (const g of neu) {
          const r = rassen.find((x) => x.id === g.rasseId)!;
          if (r.gruppe === g.gruppe) continue;
          await tx.update(rasse).set({ gruppe: g.gruppe }).where(eq(rasse.id, r.id));
          aenderungen.push({ rasse: r.name, alt: r.gruppe, neu: g.gruppe });
          r.gruppe = g.gruppe;
        }
        if (aenderungen.length)
          await protokolliere(tx, { schauId: null, tabelle: "stammdaten_version", datensatzId: v.id, aktion: "Gruppen geändert", neu: aenderungen, akteur: ctx });
        return { geaendert: aenderungen.length };
      });
    }),

  versionen: benutzerProcedure.query(async ({ ctx }) => {
    const zeilen = await db
      .select({
        id: stammdatenVersion.id,
        name: stammdatenVersion.name,
        jahr: stammdatenVersion.jahr,
        quelle: stammdatenVersion.quelle,
        createdAt: stammdatenVersion.createdAt,
        organisationId: stammdatenVersion.organisationId,
        // Join statt Unterabfrage: dort liefe "id" ohne Tabellennamen auf farbenschlag.id hinaus.
        farbenschlaege: count(farbenschlag.id),
      })
      .from(stammdatenVersion)
      .leftJoin(farbenschlag, eq(farbenschlag.versionId, stammdatenVersion.id))
      .where(versionSichtbar(ctx.benutzer.organisationId))
      .groupBy(stammdatenVersion.id)
      .orderBy(desc(stammdatenVersion.jahr), desc(stammdatenVersion.id));
    // eigene = false: vom Betreiber für alle Vereine bereitgestellt, kann der Verein nicht löschen.
    return zeilen.map(({ organisationId, ...v }) => ({ ...v, eigene: organisationId === ctx.benutzer.organisationId }));
  }),

  importieren: adminProcedure
    .input(z.object({ name: z.string().trim().min(2).max(200), jahr: z.number().int().min(2000).max(2100), quelle: z.string().max(500), csv: z.string().max(10_000_000).min(5) }))
    .mutation(({ ctx, input }) => importiereStammdaten({ ...input, organisationId: ctx.benutzer.organisationId })),

  /** Löscht nur eigene Versionen des Vereins; die des Betreibers (ohne Verein) bleiben. */
  loeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const [v] = await db
      .select({ organisationId: stammdatenVersion.organisationId })
      .from(stammdatenVersion)
      .where(and(eq(stammdatenVersion.id, input.id), versionSichtbar(ctx.benutzer.organisationId)));
    if (!v) throw fehler("NOT_FOUND", "Version nicht gefunden.");
    if (v.organisationId == null) throw fehler("FORBIDDEN", "Diese Version ist für alle Vereine bereitgestellt und kann nicht gelöscht werden.");
    const [r] = await db.select({ n: count() }).from(schau).where(eq(schau.stammdatenVersionId, input.id));
    if ((r?.n ?? 0) > 0) throw fehler("CONFLICT", "Diese Version wird von einer Schau verwendet.");
    // Auch Meldungen einer Schau, die inzwischen eine andere Version nutzt, können noch darauf verweisen.
    const [ref] = await db
      .select({ id: katalogeintrag.id })
      .from(katalogeintrag)
      .leftJoin(farbenschlag, eq(farbenschlag.id, katalogeintrag.farbenschlagId))
      .leftJoin(rasse, eq(rasse.id, katalogeintrag.rasseId))
      .where(or(eq(farbenschlag.versionId, input.id), eq(rasse.versionId, input.id)))
      .limit(1);
    if (ref) throw fehler("CONFLICT", "Gemeldete Tiere verweisen auf diese Version – sie lässt sich nicht löschen.");
    const geloescht = await db
      .delete(stammdatenVersion)
      .where(and(eq(stammdatenVersion.id, input.id), eq(stammdatenVersion.organisationId, ctx.benutzer.organisationId)))
      .returning({ id: stammdatenVersion.id })
      .catch((e: unknown) => {
        // Gleichzeitig gemeldet: der Fremdschlüssel verhindert das Löschen – verständlich melden statt 500.
        const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
        if (code === "23503") throw fehler("CONFLICT", "Gemeldete Tiere verweisen auf diese Version – sie lässt sich nicht löschen.");
        throw e;
      });
    if (geloescht.length === 0) throw fehler("NOT_FOUND", "Version nicht gefunden.");
    return { ok: true };
  }),

  suche: benutzerProcedure.input(z.object({ versionId: dbId, q: z.string().max(200) })).query(async ({ ctx, input }) => {
    await pruefeVersion(ctx.benutzer.organisationId, input.versionId);
    return sucheFarbenschlag(input.versionId, input.q);
  }),

  baum: benutzerProcedure.input(z.object({ versionId: dbId })).query(async ({ ctx, input }) => {
    await pruefeVersion(ctx.benutzer.organisationId, input.versionId);
    const rows = await db
      .select({ sparte: sparte.name, rasse: rasse.name, farbenschlag: farbenschlag.name, gruppe: rasse.gruppe })
      .from(farbenschlag)
      .innerJoin(rasse, eq(rasse.id, farbenschlag.rasseId))
      .innerJoin(sparte, eq(sparte.id, rasse.sparteId))
      .where(eq(farbenschlag.versionId, input.versionId))
      .orderBy(asc(sparte.folge), asc(rasse.folge), asc(farbenschlag.folge));
    return rows;
  }),
});
