/**
 * Schau anlegen (leer oder aus einer Vorlage), Demodaten einer Testschau, Schau löschen und als Testschau kennzeichnen.
 */
import { type Aufsteller, EingabeFehler, halleOhneFestenPlan } from "@schau/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import { db } from "../../db/client";
import { aussteller, bild, gebuehr, katalogBeitrag, katalogeintrag, katalogGestaltung, postausgang, preisart, preisrichter, schau, stammdatenVersion, verkauf } from "../../db/schema";
import { sperreKasse } from "../../services/kasse";
import { protokolliere } from "../../services/protokoll";
import { kennzeichneAlsTestschau, sperreTestschauExklusiv, testschauVorschau } from "../../services/testschau";
import { fuellen, mitDemoSperre, zuruecksetzen, type Einspieler } from "../../testschau";
import { versionSichtbar } from "../stammdaten";
import { adminProcedure, fehler, ladeSchau, dbId } from "../../trpc";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Demodaten in eine Testschau einspielen (src/testschau.ts, über die normalen Programmwege mit Protokoll unter dem
 * Namen des Administrators mit Zusatz „(Testdaten)“). `neu`: vorher alles Bisherige der Testschau entfernen.
 */
async function demodatenEinspielen(wer: Einspieler, schauId: number, neu: boolean): Promise<{ ok: true; meldungen: number; tiere: number; faelle: string[] } | { ok: false; fehler: string }> {
  try {
    // Ein Lauf zur Zeit (Datenbank-Sitzungssperre, gilt auch für das Skript und weitere Prozesse).
    return await mitDemoSperre(async () => {
      const [s] = await db.select({ slug: schau.slug, test: schau.test }).from(schau).where(eq(schau.id, schauId));
      if (!s?.test) return { ok: false as const, fehler: "Demodaten gibt es nur in einer Testschau." };
      if (neu) await zuruecksetzen(s.slug, { leise: true });
      const r = await fuellen(s.slug, undefined, { wer, leise: true });
      return { ok: true as const, ...r };
    });
  } catch (e) {
    // Gründe aus dem Einspielen (EingabeFehler) und Meldungen der Programmwege zeigen; alles andere bleibt intern.
    const zeigbar = e instanceof EingabeFehler || (e instanceof TRPCError && e.code !== "INTERNAL_SERVER_ERROR" && !(e.cause instanceof ZodError));
    if (!zeigbar) console.error("[demodaten] Einspielen abgebrochen:", e);
    const grund = zeigbar ? e.message : "Interner Fehler. Bitte erneut versuchen; besteht er weiter, die Ausstellungsleitung informieren.";
    return { ok: false, fehler: `Demodaten nicht vollständig eingespielt: ${grund}` };
  }
}

export const schauAnlegen = {
  /**
   * Neue Schau anlegen – leer mit Startwerten oder aus einer früheren Schau des Vereins als Vorlage. Mit Vorlage kommt alles
   * mit außer Meldungen und Geld: Einstellungen (ohne Termine und Bearbeitungsstand), Gebühren, Preisarten, Preisrichter
   * (ohne PIN), Katalog-Gestaltung, Beiträge, Bilder, Käfigregeln, Käfigmaße und Halle. Nicht übernommen: Meldungen, Tiere,
   * Stiftungen, Kasse, Belege, Auszahlungen, Gesundheitsjournal und die Preisrichter-Einteilung nach Katalognummern.
   */
  anlegen: adminProcedure
    .input(
      z.object({
        name: z.string().max(200).min(3),
        ort: z.string().max(500),
        vorlageId: dbId.optional(),
        /** Testschau: eigene Aussteller, nie in echten Schauen. */
        test: z.boolean().default(false),
        /** Testschau gleich mit Demodaten füllen (src/testschau.ts) – die Oberfläche tut das immer. */
        demodaten: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vorlage = input.vorlageId ? await ladeSchau(ctx.benutzer.organisationId, input.vorlageId) : null;
      // Eine Testschau bringt erfundene Preisrichter, Grußworte und Angaben mit – nur Vorlage für eine weitere Testschau.
      if (vorlage?.test && !input.test) throw fehler("BAD_REQUEST", "Eine Testschau taugt nur als Vorlage für eine weitere Testschau.");
      let slug = slugify(input.name) || "schau";
      const [vorhanden] = await db.select({ id: schau.id }).from(schau).where(eq(schau.slug, slug));
      if (vorhanden) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const [version] = await db.select().from(stammdatenVersion).where(versionSichtbar(ctx.benutzer.organisationId)).orderBy(desc(stammdatenVersion.jahr), desc(stammdatenVersion.id)).limit(1);
      // Die Käfige gehören dem Verein, die Halle ist meist dieselbe: beides aus der letzten Schau übernehmen.
      const [letzte] = await db.select({ kaefigMasse: schau.kaefigMasse, aufsteller: schau.aufsteller, halle: schau.halle }).from(schau).where(eq(schau.organisationId, ctx.benutzer.organisationId)).orderBy(desc(schau.id)).limit(1);
      if (input.demodaten && !input.test) throw fehler("BAD_REQUEST", "Demodaten gibt es nur für eine Testschau.");
      const angelegt = await db.transaction(async (tx) => {
        // Aus der Vorlage: Einstellungen ohne Termine, Phase, Festschreiben, Freigabe und Abschluss.
        const ausVorlage = vorlage
          ? {
              veranstalter: vorlage.veranstalter,
              einlieferung: vorlage.einlieferung,
              oeffnungszeiten: vorlage.oeffnungszeiten,
              aussetzen: vorlage.aussetzen,
              kapazitaet: vorlage.kapazitaet,
              provisionBp: vorlage.provisionBp,
              katalogStart: vorlage.katalogStart,
              jugendSeparat: vorlage.jugendSeparat,
              staemmeVorn: vorlage.staemmeVorn,
              teilschauen: vorlage.teilschauen,
              kontingentJe: vorlage.kontingentJe,
              bestimmungen: vorlage.bestimmungen,
              bankverbindung: vorlage.bankverbindung,
              zahlungBeiEinlieferung: vorlage.zahlungBeiEinlieferung,
              vereinKontoinhaber: vorlage.vereinKontoinhaber,
              vereinIban: vorlage.vereinIban,
              vereinBic: vorlage.vereinBic,
              girocode: vorlage.girocode,
              kontaktEmail: vorlage.kontaktEmail,
              vetRegistriernummer: vorlage.vetRegistriernummer,
              vetAmt: vorlage.vetAmt,
              wassergefluegelUntersuchung: vorlage.wassergefluegelUntersuchung,
              untersuchung: vorlage.untersuchung,
              untersuchungTage: vorlage.untersuchungTage,
              ndTageMin: vorlage.ndTageMin,
              ndTageMax: vorlage.ndTageMax,
              pmvTageMin: vorlage.pmvTageMin,
              pmvTageMax: vorlage.pmvTageMax,
              auslandZugelassen: vorlage.auslandZugelassen,
              prHoechstzahl: vorlage.prHoechstzahl,
              obmannHoechstzahl: vorlage.obmannHoechstzahl,
              erklaerungen: vorlage.erklaerungen,
              notenskala: vorlage.notenskala,
              kaefigRegeln: vorlage.kaefigRegeln,
              kaefigFolge: vorlage.kaefigFolge,
              katalogSortierung: vorlage.katalogSortierung,
              kaefigMasse: vorlage.kaefigMasse,
              aufsteller: vorlage.aufsteller,
              // Ohne verschobene Grundplatten und entfernte leere Plätze: die gehören zum festen Plan dieser Schau.
              halle: vorlage.halle ? halleOhneFestenPlan(vorlage.halle) : null,
            }
          : { kaefigMasse: letzte?.kaefigMasse ?? {}, aufsteller: ohneSockelbild(letzte?.aufsteller ?? null), halle: letzte?.halle ? halleOhneFestenPlan(letzte.halle) : null };
        const [s] = await tx
          .insert(schau)
          .values({
            organisationId: ctx.benutzer.organisationId,
            name: input.name,
            ort: input.ort,
            slug,
            stammdatenVersionId: version?.id ?? null,
            ...ausVorlage,
            test: input.test,
          })
          .returning();
        if (vorlage) {
          const neueBildId = await kopiereAusVorlage(tx, vorlage.id, s!.id);
          // Das Sockelbild ist mitkopiert: auf die Kopie zeigen.
          const alt = vorlage.aufsteller?.verkleidung?.bildId;
          if (alt != null) {
            const neu = neueBildId.get(alt) ?? null;
            await tx.update(schau).set({ aufsteller: { ...vorlage.aufsteller!, verkleidung: { ...vorlage.aufsteller!.verkleidung!, bildId: neu } } }).where(eq(schau.id, s!.id));
          }
          // Testschau aus einer echten Vorlage: keine echten Preisrichter (Name, Kontakt) in Übungsdaten – die
          // Demodaten bringen erfundene mit.
          if (input.test && !vorlage.test) await tx.delete(preisrichter).where(eq(preisrichter.schauId, s!.id));
          await protokolliere(tx, { schauId: s!.id, tabelle: "schau", datensatzId: s!.id, aktion: "angelegt", neu: { ...input, vorlage: vorlage.name }, akteur: ctx });
          return { id: s!.id };
        }
        // Startwerte, wie sie auf vielen Meldebögen stehen – werden in den Einstellungen angepasst.
        await tx.insert(gebuehr).values([
          { schauId: s!.id, art: "einzeltier", jugend: false, betragCent: 0 },
          { schauId: s!.id, art: "einzeltier", jugend: true, betragCent: 0 },
          { schauId: s!.id, art: "stamm", jugend: false, betragCent: 0 },
          { schauId: s!.id, art: "katalog", jugend: false, betragCent: 0, befreitPreisrichter: true },
          { schauId: s!.id, art: "kostenanteil", jugend: false, betragCent: 0 },
        ]);
        await tx.insert(preisart).values([
          { schauId: s!.id, kuerzel: "E", name: "Ehrenpreis", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 1, folge: 1 },
          { schauId: s!.id, kuerzel: "Z", name: "Zuschlagspreis", quelle: "standgeld", schluesselProTiere: 10, anzahlProSchluessel: 2, folge: 2 },
        ]);
        await protokolliere(tx, { schauId: s!.id, tabelle: "schau", datensatzId: s!.id, aktion: "angelegt", neu: input, akteur: ctx });
        return { id: s!.id };
      });
      if (!input.demodaten) return { ...angelegt, demodaten: null };
      // Erst nach dem Anlegen (eigene Programmwege mit Protokoll); scheitert es, steht die Schau trotzdem.
      return { ...angelegt, demodaten: await demodatenEinspielen(ctx.benutzer, angelegt.id, false) };
    }),

  /**
   * Testschau: Demodaten neu einspielen – Meldungen, Test-Aussteller, Geld, Katalog und Bewertungen weg, frische
   * Demodaten bis zur Einlieferung. Einstellungen, Gebühren, Preisarten, Halle und Käfigmaße bleiben.
   */
  demodatenNeu: adminProcedure.input(z.object({ id: dbId, name: z.string().max(200) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (!s.test) throw fehler("BAD_REQUEST", "Demodaten gibt es nur in einer Testschau.");
    if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
    const r = await demodatenEinspielen(ctx.benutzer, s.id, true);
    if (!r.ok) throw fehler("BAD_REQUEST", r.fehler);
    return r;
  }),

  /**
   * Löscht eine leere Schau (z. B. zum Ausprobieren angelegt): nur in der Vorbereitung, ohne Meldungen, Geld, Belege oder
   * Stiftungen, mit eingetipptem Namen und Grund. Eine Testschau dagegen in jeder Phase mit allem, was dazugehört –
   * auch ihren Test-Ausstellern (Kaskade über `aussteller.testSchauId`); echte Aussteller hat sie nicht. Protokoll und Kassendaten sind sonst gegen Löschen geschützt – der
   * Schalter gilt nur in dieser Transaktion, jede gelöschte Protokollzeile wird vermerkt (Kettenprüfung bleibt gültig),
   * und das Vereinsprotokoll hält das Löschen fest.
   */
  loeschen: adminProcedure
    .input(z.object({ id: dbId, name: z.string().max(200), grund: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
      if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
      if (input.grund.length < 3) throw fehler("BAD_REQUEST", "Bitte einen Grund für das Löschen angeben.");
      await db.transaction(async (tx) => {
        // Testschau: erst laufende Meldungen abwarten (gleiche Reihenfolge wie dort: Testschau-Sperre, dann Kasse).
        if (s.test) await sperreTestschauExklusiv(tx, s.id);
        await sperreKasse(tx, s.id);
        const [aktuell] = await tx.select().from(schau).where(eq(schau.id, s.id)).for("update");
        if (!aktuell) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
        if (!aktuell.test && aktuell.phase !== "vorbereitung") throw fehler("BAD_REQUEST", "Löschen geht nur, solange die Schau in der Vorbereitung steht.");
        const zahl = async (sqlText: ReturnType<typeof sql>) => Number(((await tx.execute(sqlText)) as unknown as { n: number }[])[0]?.n ?? 0);
        const hindernisse = [
          [await zahl(sql`select count(*)::int as n from meldung where schau_id = ${s.id}`), "Meldung(en)"],
          [await zahl(sql`select count(*)::int as n from stiftung where schau_id = ${s.id}`), "Stiftung(en)"],
          [await zahl(sql`select count(*)::int as n from spende where schau_id = ${s.id}`), "Spende(n)"],
          [await zahl(sql`select count(*)::int as n from kassenbewegung where schau_id = ${s.id}`), "Kassenbuchung(en)"],
          [await zahl(sql`select count(*)::int as n from kassenabschluss where schau_id = ${s.id}`), "Tagesabschlüsse"],
          [await zahl(sql`select count(*)::int as n from auszahlung where schau_id = ${s.id}`), "Auszahlung(en)"],
          [await zahl(sql`select count(*)::int as n from beleg where schau_id = ${s.id}`), "Beleg(e)"],
          // Das Gesundheitsjournal ist aufbewahrungspflichtig (auch Beobachtungen ohne Tier).
          [await zahl(sql`select count(*)::int as n from gesundheit where schau_id = ${s.id}`), "Eintrag/Einträge im Gesundheitsjournal"],
        ].filter(([n]) => (n as number) > 0);
        if (hindernisse.length && !aktuell.test) {
          throw fehler("BAD_REQUEST", `Die Schau hat schon ${hindernisse.map(([n, was]) => `${n} ${was}`).join(", ")} und lässt sich nicht löschen.`);
        }
        await tx.execute(sql`set local schau.loeschen = 'ja'`);
        // Verkäufe hängen mit RESTRICT an den Tieren – vor der Schau löschen (nur bei Testschauen vorhanden).
        // Noch wartende Mails an die Test-Aussteller dieser Schau gehen nicht mehr hinaus.
        if (aktuell.test) await tx.delete(postausgang).where(and(eq(postausgang.status, "wartet"), inArray(postausgang.ausstellerId, tx.select({ id: aussteller.id }).from(aussteller).where(eq(aussteller.testSchauId, s.id)))));
        if (aktuell.test) await tx.delete(verkauf).where(inArray(verkauf.katalogeintragId, tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, s.id))));
        await tx.delete(schau).where(eq(schau.id, s.id));
        await protokolliere(tx, {
          schauId: null,
          tabelle: "schau",
          datensatzId: s.id,
          aktion: "Schau gelöscht",
          alt: { id: s.id, name: s.name, slug: s.slug, ort: s.ort, ...(aktuell.test ? { test: true, inhalt: hindernisse.map(([n, was]) => `${n} ${was}`).join(", ") } : {}) },
          grund: input.grund,
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Eine bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen): ihre Aussteller
   * werden Test-Aussteller und verschwinden aus Verwaltung und echten Schauen. Endgültig, mit eingetipptem Namen.
   */
  alsTestschau: adminProcedure.input(z.object({ id: dbId, name: z.string().max(200), anzahl: z.number().int().min(0).optional(), /** Echte Aussteller auf Test-Kopien umhängen (bestätigt). */ kopien: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    if (input.name.trim() !== s.name.trim()) throw fehler("BAD_REQUEST", "Zur Bestätigung bitte den Namen der Schau genau eintippen.");
    return db.transaction((tx) => kennzeichneAlsTestschau(tx, ctx.benutzer.organisationId, s.id, ctx, { anzahl: input.anzahl, kopien: input.kopien }));
  }),

  /** Vor dem Kennzeichnen: wer würde Test-Aussteller, wer ist echt (und verhindert es)? */
  testschauVorschau: adminProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.id);
    return testschauVorschau(db, s.id);
  }),
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Gebühren, Preisarten, Preisrichter (ohne PIN), Katalog-Gestaltung, Bilder und Beiträge aus der Vorlage übernehmen. */
async function kopiereAusVorlage(tx: Tx, von: number, nach: number) {
  const [gebuehren, preisarten, richter, gestaltung, bilder, beitraege] = await Promise.all([
    tx.select().from(gebuehr).where(eq(gebuehr.schauId, von)),
    tx.select().from(preisart).where(eq(preisart.schauId, von)),
    tx.select().from(preisrichter).where(eq(preisrichter.schauId, von)).orderBy(asc(preisrichter.id)),
    tx.select().from(katalogGestaltung).where(eq(katalogGestaltung.schauId, von)),
    tx.select().from(bild).where(eq(bild.schauId, von)).orderBy(asc(bild.id)),
    tx.select().from(katalogBeitrag).where(eq(katalogBeitrag.schauId, von)),
  ]);
  if (gebuehren.length) await tx.insert(gebuehr).values(gebuehren.map(({ id: _, ...g }) => ({ ...g, schauId: nach })));
  if (preisarten.length) await tx.insert(preisart).values(preisarten.map(({ id: _, ...p }) => ({ ...p, schauId: nach })));
  // Preisrichter ohne PIN: die neue Schau bekommt neue PINs (alte Tablets melden sich nicht an der neuen Schau an).
  // Einzeln, damit die neuen Nummern sicher zugeordnet sind: die Zuordnung zum Obmann zeigt danach auf den Obmann der neuen Schau.
  const neueId = new Map<number, number>();
  for (const { id, createdAt: _, pinHash: __, obmannId: ___, ...r } of richter) {
    const [neu] = await tx.insert(preisrichter).values({ ...r, schauId: nach }).returning({ id: preisrichter.id });
    neueId.set(id, neu!.id);
  }
  for (const r of richter)
    if (r.obmannId != null && neueId.has(r.obmannId)) await tx.update(preisrichter).set({ obmannId: neueId.get(r.obmannId)! }).where(eq(preisrichter.id, neueId.get(r.id)!));
  if (gestaltung[0]) await tx.insert(katalogGestaltung).values({ ...gestaltung[0], schauId: nach });
  const neueBildId = new Map<number, number>();
  for (const { id, createdAt: _, ...b } of bilder) {
    const [neu] = await tx.insert(bild).values({ ...b, schauId: nach }).returning({ id: bild.id });
    neueBildId.set(id, neu!.id);
  }
  if (beitraege.length)
    await tx.insert(katalogBeitrag).values(beitraege.map(({ id: _, ...k }) => ({ ...k, schauId: nach, bildId: k.bildId != null ? (neueBildId.get(k.bildId) ?? null) : null })));
  return neueBildId;
}

/** Aufsteller der letzten Schau für eine neue ohne Vorlage: die Bilder kommen nicht mit, also auch kein Sockelbild. */
function ohneSockelbild(a: Aufsteller | null): Aufsteller | null {
  return a?.verkleidung?.bildId != null ? { ...a, verkleidung: { ...a.verkleidung, bildId: null } } : a;
}
