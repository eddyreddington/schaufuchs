import { bdrgGruppe, bewertetGruppe, bewertetSparte, formatKatalognummer, regelnAusZuteilung, vergleicheEinteilFolge, ZUSAGEN, type RassenRegel } from "@schau/domain";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPasswort } from "../auth";
import { db } from "../db/client";
import { preisrichter, prEinteilung, prZuteilung, schau, sitzung } from "../db/schema";
import { ladeEintraege } from "../services/eintraege";
import { bereicheDerSchau, einteilSchluessel, einteilTier, jugendSeparatEingeteilt, ladeRegeln, sperreEinteilung } from "../services/einteilung";
import type { Akteur } from "../services/protokoll";
import { protokollZuletzt, protokolliere } from "../services/protokoll";
import { pinBremse, pinWartezeitJeRichter } from "./bewertung";
import { zuteilung } from "../services/pruefung";
import { oeffentlichSichtbarProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId } from "../trpc";
import type { Tx } from "../db/client";
import { pruefeNichtAbgeschlossen } from "../services/kasse";
import { schlageEinteilungVor, type RichterWahl } from "../services/einteilung-vorschlag";
import { loeschePreisrichter, speicherePreisrichter } from "../services/preisrichter-speichern";

/** Zufällige 8-stellige PIN, gleich verteilt (Werte oberhalb des letzten vollen Hundertmillionen-Blocks verworfen). */
export function neuePin(): string {
  for (;;) {
    const x = crypto.getRandomValues(new Uint32Array(1))[0]!;
    if (x < 4_200_000_000) return String(x % 100_000_000).padStart(8, "0");
  }
}

/**
 * Setzt die Einteilung nach Nummern – mit den Prüfungen: keine Überschneidung, nur bekannte Preisrichter, nur Sparten, die
 * der Preisrichter bewertet, bewertete Tiere wechseln nur nach Bestätigung. `zusatz` läuft in derselben Transaktion
 * (Einteilung nach Rassen speichern).
 */
async function schreibeEinteilung(
  tx: Tx,
  ctx: Akteur,
  schauId: number,
  einteilung: { preisrichterId: number; vonNr: number; bisNr: number }[],
  bestaetigt: boolean | undefined,
  opts: { zusatz?: (tx: Tx) => Promise<void>; aktion?: string; ausnahmen?: Set<number> } = {},
) {
  const { zusatz, aktion, ausnahmen } = opts;
  const sortiert = [...einteilung].sort((a, b) => a.vonNr - b.vonNr);
  for (const [i, e] of sortiert.entries()) {
    if (e.vonNr > e.bisNr) throw fehler("BAD_REQUEST", `Bereich ${e.vonNr}–${e.bisNr} ist ungültig.`);
    const naechster = sortiert[i + 1];
    if (naechster && naechster.vonNr <= e.bisNr) throw fehler("BAD_REQUEST", `Bereiche überschneiden sich bei Nr. ${naechster.vonNr}.`);
  }
  const richter = await tx.select({ id: preisrichter.id, name: preisrichter.name, sparten: preisrichter.sparten, gruppen: preisrichter.gruppen }).from(preisrichter).where(eq(preisrichter.schauId, schauId));
  if (einteilung.some((e) => !richter.some((r) => r.id === e.preisrichterId))) throw fehler("BAD_REQUEST", "Unbekannter Preisrichter.");
  // Bewertete Tiere oder Tiere mit Preis, die den Preisrichter wechseln: Kontingent und Zuständigkeit gehen mit.
  const [bisher, eintraege] = await Promise.all([
    tx.select().from(prEinteilung).where(eq(prEinteilung.schauId, schauId)),
    ladeEintraege(schauId, { nurBestaetigt: true, ex: tx }),
  ]);
  const alt = zuteilung(eintraege, bisher);
  const neu = zuteilung(eintraege, sortiert);
  const umgehaengt = eintraege
    .filter((e) => (e.bewertet || e.preise.length > 0) && alt.has(e.id) && alt.get(e.id) !== neu.get(e.id))
    .map((e) => formatKatalognummer(e));
  // Nur Sparten und BDRG-Gruppen, die der Preisrichter bewertet (unter „Preisrichter bearbeiten“ festgelegt).
  const falsch = new Map<string, { name: string; sparte?: string; gruppe?: string; nummern: string[] }>();
  for (const e of eintraege) {
    const rid = neu.get(e.id);
    const pr = richter.find((x) => x.id === rid);
    const sp = e.sparte ?? e.einordnungSparte ?? "";
    // Ausnahme: eine Unternummer (24a) einer anderen Rasse hängt an der Nummer 24 – sie wird gemeldet, sperrt aber nicht.
    if (!pr || ausnahmen?.has(e.id)) continue;
    const grund = !bewertetSparte(pr, sp) ? { sparte: sp } : !bewertetGruppe(pr, e.gruppe) ? { gruppe: bdrgGruppe(e.gruppe) } : null;
    if (!grund) continue;
    const k = JSON.stringify([pr.id, grund]);
    const f = falsch.get(k) ?? { name: pr.name, ...grund, nummern: [] };
    f.nummern.push(formatKatalognummer(e));
    falsch.set(k, f);
  }
  if (falsch.size) {
    const nr = (f: { nummern: string[] }) => `${f.nummern.slice(0, 5).join(", ")}${f.nummern.length > 5 ? " …" : ""}`;
    const liste = [...falsch.values()];
    const text = liste
      .map((f) => (f.gruppe != null ? `${f.name} bewertet keine Gruppe ${f.gruppe} (Nr. ${nr(f)})` : `${f.name} bewertet keine ${f.sparte || "Tiere ohne Sparte"} (Nr. ${nr(f)})`))
      .join("; ");
    const gruppen = liste.filter((f) => f.gruppe != null).length;
    if (gruppen === liste.length) throw fehler("BAD_REQUEST", `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Gruppe ergänzen.`);
    if (gruppen > 0) throw fehler("BAD_REQUEST", `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte bzw. Gruppe ergänzen.`);
    throw fehler("BAD_REQUEST", `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte ergänzen.`);
  }
  if (umgehaengt.length && !bestaetigt) {
    const liste = umgehaengt.slice(0, 10).join(", ") + (umgehaengt.length > 10 ? " …" : "");
    throw fehler("CONFLICT", `Bereits bewertete Tiere wechseln den Preisrichter: Nr. ${liste}.`);
  }
  // Protokoll zuletzt (Entscheidung 033): `zusatz` protokolliert, danach wird die Einteilung noch geschrieben.
  await protokollZuletzt(tx, async () => {
    if (zusatz) await zusatz(tx);
    await tx.delete(prEinteilung).where(eq(prEinteilung.schauId, schauId));
    if (sortiert.length) await tx.insert(prEinteilung).values(sortiert.map((e) => ({ ...e, schauId: schauId })));
    await protokolliere(tx, {
      schauId: schauId,
      tabelle: "pr_einteilung",
      datensatzId: null,
      aktion: aktion ?? (zusatz ? "aus Einteilung nach Rassen" : "gesetzt"),
      neu: umgehaengt.length ? { einteilung: sortiert, umgehaengt } : sortiert,
      akteur: ctx,
    });
  });
}

export const preisrichterRouter = router({
  liste: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [richter, einteilung, eintraege] = await Promise.all([
      db.select().from(preisrichter).where(eq(preisrichter.schauId, input.schauId)).orderBy(asc(preisrichter.name)),
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, input.schauId)).orderBy(asc(prEinteilung.vonNr)),
      ladeEintraege(input.schauId, { nurBestaetigt: true }),
    ]);
    const zu = zuteilung(eintraege, einteilung);
    return {
      richter: richter.map(({ pinHash, ...r }) => {
        const meine = eintraege.filter((e) => zu.get(e.id) === r.id);
        return {
          ...r,
          hatPin: !!pinHash,
          pinWartet: pinWartezeitJeRichter.wartet(`pr:${r.id}:alle`),
          tiere: meine.length,
          bewertet: meine.filter((e) => e.bewertet).length,
          einteilung: einteilung.filter((x) => x.preisrichterId === r.id),
        };
      }),
      nummeriert: eintraege.filter((e) => e.katalogNr != null).length,
      ohneZuteilung: eintraege.filter((e) => e.katalogNr != null && !zu.has(e.id)).length,
    };
  }),

  speichern: oeffentlichSichtbarProcedure
    .input(
      z.object({
        schauId: dbId,
        id: dbId.optional(),
        name: z.string().max(200).min(2),
        anschrift: z.string().max(500),
        email: z.string().max(200),
        telefon: z.string().max(50),
        istObmann: z.boolean(),
        /** Sparten, die er bewertet (leer = alle). */
        sparten: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
        /** Anschrift im gedruckten Katalog – nur mit seinem Einverständnis. Fehlt die Angabe, bleibt der Stand. */
        anschriftImKatalog: z.boolean().optional(),
        /** BDRG-Gruppen (A, Z1, BV …), für die er zugelassen ist; leer = keine Einschränkung. Ab hier: fehlt, bleibt der Stand. */
        gruppen: z.array(z.string().max(20)).max(40).optional(),
        /** Obmann derselben Schau, dem er zugeordnet ist; null = keiner. */
        obmannId: dbId.nullable().optional(),
        zusage: z.enum(ZUSAGEN).optional(),
        /** Wofür er zugesagt hat (z. B. Jahre). */
        zugesagtFuer: z.string().trim().max(200).optional(),
        /** Vorbehalt der Zusage. */
        vorbehalt: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      return speicherePreisrichter(input, ctx);
    }),

  /**
   * Erzeugt eine neue 8-stellige PIN für das Tablet. Sie wird nur dieses eine Mal angezeigt.
   * Alle Tablets dieses Preisrichters werden dabei abgemeldet (z. B. verlorenes Gerät, PIN mitgelesen).
   */
  pinErzeugen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [r] = await db.select().from(preisrichter).where(eq(preisrichter.id, input.id));
    if (!r || r.schauId !== input.schauId) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
    const pin = neuePin();
    const pinHash = await hashPasswort(pin);
    // Neue PIN: auch die Fehlversuch-Sperre dieses Preisrichters aufheben.
    pinBremse.zuruecksetzen((k) => k.startsWith(`pr:${r.id}:`));
    pinWartezeitJeRichter.zuruecksetzen(`pr:${r.id}:alle`);
    await db.transaction(async (tx) => {
      await tx.update(preisrichter).set({ pinHash }).where(eq(preisrichter.id, r.id));
      const beendet = await tx.delete(sitzung).where(eq(sitzung.preisrichterId, r.id)).returning({ id: sitzung.id });
      await protokolliere(tx, {
        schauId: input.schauId,
        tabelle: "preisrichter",
        datensatzId: r.id,
        aktion: r.pinHash ? "PIN neu, Sitzungen beendet" : "PIN erzeugt",
        neu: { name: r.name, beendeteSitzungen: beendet.length },
        akteur: ctx,
      });
    });
    return { pin };
  }),

  /** Hebt die Wartezeit nach PIN-Fehlversuchen auf, ohne eine neue PIN zu vergeben. */
  sperreAufheben: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [r] = await db.select().from(preisrichter).where(eq(preisrichter.id, input.id));
    if (!r || r.schauId !== input.schauId) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
    pinBremse.zuruecksetzen((k) => k.startsWith(`pr:${r.id}:`));
    pinWartezeitJeRichter.zuruecksetzen(`pr:${r.id}:alle`, true);
    return { ok: true };
  }),

  loeschen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await loeschePreisrichter(input.schauId, input.id, ctx);
    return { ok: true };
  }),

  einteilungSetzen: oeffentlichSichtbarProcedure
    .input(
      z.object({
        schauId: dbId,
        einteilung: z.array(z.object({ preisrichterId: dbId, vonNr: z.number().int().min(1).max(1_000_000), bisNr: z.number().int().min(1).max(1_000_000) })).max(200),
        /** Bestätigt, dass bereits bewertete Tiere den Preisrichter wechseln dürfen. */
        bestaetigt: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      // Von Hand nach Nummern: Eine Einteilung nach Rassen gilt dann nicht mehr (sonst rechnete die nächste Nummernvergabe
      // die Bereiche neu und überschriebe die Handarbeit).
      await db.transaction(async (tx) => {
        await sperreEinteilung(tx, input.schauId);
        const regeln = await ladeRegeln(tx, input.schauId);
        const aufheben = async (t: Tx) => {
          await t.delete(prZuteilung).where(eq(prZuteilung.schauId, input.schauId));
          await protokolliere(t, { schauId: input.schauId, tabelle: "pr_zuteilung", datensatzId: null, aktion: "Einteilung nach Rassen aufgehoben (von Hand nach Nummern)", alt: regeln, neu: null, akteur: ctx });
        };
        await schreibeEinteilung(tx, ctx, input.schauId, input.einteilung, input.bestaetigt, { zusatz: regeln.length ? aufheben : undefined, aktion: "gesetzt" });
      });
      return { ok: true };
    }),

  einteilungVorschlagen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [richter, eintraege] = await Promise.all([
      richterMitGewicht(input.schauId, s),
      ladeEintraege(input.schauId, { nurBestaetigt: true }),
    ]);
    const nummern = eintraege
      .filter((e) => e.katalogNr != null)
      .map((e) => ({ nr: e.katalogNr!, suffix: e.suffix, rasse: e.rasse ?? e.freitext, sparte: e.sparte ?? e.einordnungSparte, gruppe: e.gruppe }));
    const v = schlageEinteilungVor(nummern, richter);
    return { einteilung: [...v], fehlend: v.fehlend ?? [] };
  }),

  /**
   * Einteilung nach Rassen: alle gemeldeten Rassen (offene und bestätigte Meldungen) in Ausstellungsfolge mit Tierzahl
   * und Farbenschlägen, dazu die gespeicherten Regeln.
   */
  zuteilung: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const separat = s.einteilungJugendSeparat;
    const [eintraege, regeln] = await Promise.all([gemeldet(input.schauId), ladeRegeln(db, input.schauId)]);
    // Gruppiert mit demselben Schlüssel, mit dem gespeichert und angewendet wird (ohne Rücksicht auf Schreibweise); es
    // gilt die erste Schreibweise. Gespeicherte Regeln kommen in der Schreibweise der Anzeige zurück.
    // `gruppe`: BDRG-Gruppe der Rasse (leer = nicht gepflegt) – die Auswahl zeigt nur Preisrichter, die sie bewerten.
    // `jugend`: die Jugend der Rasse als eigene Zeile (nur bei „Jugend separat“).
    const gruppen: { sparte: string; rasse: string; jugend: boolean; gruppe: string; anzahl: number; farben: { farbenschlag: string; anzahl: number }[] }[] = [];
    const jeRasse = new Map<string, (typeof gruppen)[number]>();
    const schreibweise = new Map<string, { sparte: string; rasse: string; farbenschlag: string }>();
    for (const e of nachFolge(eintraege, s)) {
      const t = einteilTier(e, separat);
      const sparte = t.sparte ?? "";
      const k = einteilSchluessel(sparte, t.rasse, "", t.istJugend);
      let g = jeRasse.get(k);
      if (!g) {
        const rk = einteilSchluessel(sparte, t.rasse);
        const sw = schreibweise.get(rk);
        g = { sparte: sw?.sparte ?? sparte, rasse: sw?.rasse ?? t.rasse, jugend: !!t.istJugend, gruppe: bdrgGruppe(e.gruppe), anzahl: 0, farben: [] };
        jeRasse.set(k, g);
        gruppen.push(g);
        if (!sw) schreibweise.set(rk, { sparte, rasse: t.rasse, farbenschlag: "" });
      }
      g.anzahl++;
      const fk = einteilSchluessel(sparte, t.rasse, t.farbenschlag);
      const f = g.farben.find((x) => einteilSchluessel(g.sparte, g.rasse, x.farbenschlag) === fk);
      if (f) f.anzahl++;
      else {
        const sw = schreibweise.get(fk);
        g.farben.push({ farbenschlag: sw?.farbenschlag ?? t.farbenschlag ?? "", anzahl: 1 });
        if (!sw) schreibweise.set(fk, { sparte: g.sparte, rasse: g.rasse, farbenschlag: t.farbenschlag ?? "" });
      }
    }
    const angezeigt = regeln.map((r) => ({ ...r, ...(schreibweise.get(einteilSchluessel(r.sparte, r.rasse, r.farbenschlag)) ?? {}) }));
    return { gruppen, regeln: angezeigt, nummeriert: eintraege.some((e) => e.katalogNr != null), jugendSeparat: separat };
  }),

  /**
   * Einteilung nach Rassen speichern. Sind schon Katalognummern vergeben, rechnet sie die Bereiche gleich neu (mit den
   * Prüfungen der Einteilung nach Nummern); sonst geschieht das beim Vergeben der Nummern. Bei „Jugend mit der Rasse“
   * bleiben die gespeicherten Jugendregeln, wie sie sind (sie sind dann nicht zu sehen und gelten erst wieder bei „separat“).
   */
  zuteilungSetzen: oeffentlichSichtbarProcedure
    .input(
      z.object({
        schauId: dbId,
        regeln: z
          .array(
            z.object({
              preisrichterId: dbId,
              sparte: z.string().trim().max(100),
              rasse: z.string().trim().min(1).max(300),
              farbenschlag: z.string().trim().max(300),
              /** Nur für die Jugend der Rasse (bei „Jugend separat“); fehlt = für alle Tiere der Rasse. */
              jugend: z.boolean().optional(),
            }),
          )
          .max(3000),
        bestaetigt: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const [richter, tiere] = await Promise.all([
        db.select({ id: preisrichter.id, name: preisrichter.name, sparten: preisrichter.sparten, gruppen: preisrichter.gruppen }).from(preisrichter).where(eq(preisrichter.schauId, input.schauId)),
        gemeldet(input.schauId),
      ]);
      // BDRG-Gruppe je gemeldeter Rasse (ein Farbenschlag zählt mit der Gruppe seiner Rasse).
      const gruppeVon = new Map(tiere.map((e) => { const t = einteilTier(e); return [einteilSchluessel(t.sparte, t.rasse), e.gruppe] as const; }));
      // Doppelte (gleiche Sparte, Rasse, Farbenschlag ohne Rücksicht auf Schreibweise): die letzte gilt.
      const eindeutig = new Map<string, RassenRegel & { jugend: boolean }>();
      for (const r of input.regeln) eindeutig.set(einteilSchluessel(r.sparte, r.rasse, r.farbenschlag, r.jugend), { ...r, jugend: !!r.jugend });
      let regeln = [...eindeutig.values()];
      const pruefe = () => {
        for (const r of regeln) {
          const pr = richter.find((x) => x.id === r.preisrichterId);
          if (!pr) throw fehler("BAD_REQUEST", "Unbekannter Preisrichter.");
          if (!bewertetSparte(pr, r.sparte)) throw fehler("BAD_REQUEST", `${pr.name} bewertet keine ${r.sparte || "Tiere ohne Sparte"} (${r.rasse}). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Sparte ergänzen.`);
          const gruppe = gruppeVon.get(einteilSchluessel(r.sparte, r.rasse));
          if (!bewertetGruppe(pr, gruppe)) throw fehler("BAD_REQUEST", `${pr.name} bewertet keine Gruppe ${bdrgGruppe(gruppe)} (${r.rasse}). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Gruppe ergänzen.`);
        }
      };
      // „Jugend in der Einteilung“, gelesen unter der Sperre (siehe unten): ein gleichzeitiges Umschalten kommt nicht dazwischen.
      let separat = false;
      const speichern = async (tx: Tx) => {
        await tx.delete(prZuteilung).where(separat ? eq(prZuteilung.schauId, input.schauId) : and(eq(prZuteilung.schauId, input.schauId), eq(prZuteilung.jugend, false)));
        if (regeln.length) await tx.insert(prZuteilung).values(regeln.map((r) => ({ ...r, schauId: input.schauId })));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "pr_zuteilung",
          datensatzId: null,
          aktion: "Einteilung nach Rassen",
          neu: regeln.map((r) => ({ preisrichter: richter.find((x) => x.id === r.preisrichterId)!.name, sparte: r.sparte, rasse: r.rasse, ...(r.farbenschlag ? { farbenschlag: r.farbenschlag } : {}), ...(r.jugend ? { jugend: true } : {}) })),
          akteur: ctx,
        });
      };
      // Unter der Sperre: Nummern und Einteilung ändern sich nicht, während hier gerechnet wird.
      return db.transaction(async (tx) => {
        await sperreEinteilung(tx, input.schauId);
        separat = await jugendSeparatEingeteilt(tx, input.schauId);
        // Bei „mit der Rasse“ zählen nur die Regeln ohne Merkmal; geprüft wird, was gespeichert wird.
        if (!separat) regeln = regeln.filter((r) => !r.jugend);
        pruefe();
        const b = await bereicheDerSchau(tx, input.schauId, regeln, separat);
        if (b.nummeriert === 0) {
          await speichern(tx);
          return { bereiche: null, ohne: 0, abweichend: [] as string[] };
        }
        await schreibeEinteilung(tx, ctx, input.schauId, b.bereiche, input.bestaetigt, { zusatz: speichern, ausnahmen: new Set(b.abweichend.map((x) => x.id)) });
        return { bereiche: b.bereiche, ohne: b.ohne, abweichend: b.abweichend.map((x) => x.nummer) };
      });
    }),

  /**
   * Vorschlag: gleichmäßig verteilen in der Folge Sparte, Rasse, Farbenschlag (ohne die Blöcke für Stämme – so liegt jede
   * Rasse beisammen und wird nur geteilt, wenn es nicht anders geht), dann je Rasse bzw. Farbenschlag. Bei „Jugend
   * separat“ ist die Jugend jeder Rasse eine eigene Einheit (am Ende bzw. hinter ihrer Rasse wie im Katalog).
   */
  zuteilungVorschlagen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [richter, eintraege] = await Promise.all([
      richterMitGewicht(input.schauId, s),
      gemeldet(input.schauId),
    ]);
    if (!eintraege.length) return { regeln: [] as RassenRegel[], fehlend: [] as string[] };
    const folge = nachFolge(eintraege, s);
    // Je Farbenschlag eine „Nummer“: geschnitten wird nie mitten in einem Farbenschlag.
    const nrVon = new Map<string, number>();
    const nummern = folge.map((e) => {
      const t = einteilTier(e, s.einteilungJugendSeparat);
      const k = einteilSchluessel(t.sparte, t.rasse, t.farbenschlag, t.istJugend);
      if (!nrVon.has(k)) nrVon.set(k, nrVon.size + 1);
      return { nr: nrVon.get(k)!, rasse: einteilSchluessel(t.sparte, t.rasse, "", t.istJugend), sparte: t.sparte, gruppe: e.gruppe };
    });
    const v = schlageEinteilungVor(nummern, richter);
    const regeln = regelnAusZuteilung(
      folge.map((e, i) => {
        const n = nummern[i]!.nr;
        return { ...einteilTier(e, s.einteilungJugendSeparat), preisrichterId: v.find((x) => n >= x.vonNr && n <= x.bisNr)?.preisrichterId ?? null };
      }),
    );
    return { regeln, fehlend: v.fehlend ?? [] };
  }),

  /**
   * Jugend in der Einteilung nach Rassen: mit ihrer Rasse (Vorgabe) oder separat mit eigenen Zeilen und Preisrichtern.
   * Mit Katalognummern und Regeln rechnet die Software die Bereiche gleich neu (Rückfrage, wenn bewertete Tiere den
   * Preisrichter wechseln). Jugendregeln bleiben beim Zurückschalten gespeichert, gelten aber erst wieder bei „separat“.
   */
  einteilungJugendSetzen: oeffentlichSichtbarProcedure
    .input(z.object({ schauId: dbId, separat: z.boolean(), bestaetigt: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      return db.transaction(async (tx) => {
        await sperreEinteilung(tx, input.schauId);
        const [{ alt }] = (await tx.select({ alt: schau.einteilungJugendSeparat }).from(schau).where(eq(schau.id, s.id)).for("no key update")) as [{ alt: boolean }];
        const nichts = { bereiche: null, ohne: 0, abweichend: [] as string[] };
        if (alt === input.separat) return nichts;
        const setzen = async (t: Tx) => {
          await t.update(schau).set({ einteilungJugendSeparat: input.separat }).where(eq(schau.id, s.id));
          await protokolliere(t, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Jugend in der Einteilung", alt: { einteilungJugendSeparat: alt }, neu: { einteilungJugendSeparat: input.separat }, akteur: ctx });
        };
        const regeln = await ladeRegeln(tx, s.id);
        const b = regeln.length ? await bereicheDerSchau(tx, s.id, regeln, input.separat) : null;
        if (!b || b.nummeriert === 0) {
          await setzen(tx);
          return nichts;
        }
        await schreibeEinteilung(tx, ctx, s.id, b.bereiche, input.bestaetigt, { zusatz: setzen, aktion: "aus Einteilung nach Rassen", ausnahmen: new Set(b.abweichend.map((x) => x.id)) });
        return { bereiche: b.bereiche, ohne: b.ohne, abweichend: b.abweichend.map((x) => x.nummer) };
      });
    }),
});

/** Preisrichter für die Vorschläge, mit der Höchstzahl als Gewicht: ein Obmann bekommt im Verhältnis weniger Tiere. */
async function richterMitGewicht(schauId: number, s: { prHoechstzahl: number; obmannHoechstzahl: number }): Promise<RichterWahl[]> {
  const liste = await db
    .select({ id: preisrichter.id, sparten: preisrichter.sparten, gruppen: preisrichter.gruppen, istObmann: preisrichter.istObmann })
    .from(preisrichter)
    .where(eq(preisrichter.schauId, schauId))
    .orderBy(asc(preisrichter.id));
  return liste.map((r) => ({ id: r.id, sparten: r.sparten ?? [], gruppen: r.gruppen ?? [], gewicht: r.istObmann ? s.obmannHoechstzahl : s.prHoechstzahl }));
}

/** Gemeldete Tiere für die Einteilung: offene und bestätigte Meldungen (geplant wird vor dem Meldeschluss). */
async function gemeldet(schauId: number) {
  return (await ladeEintraege(schauId)).filter((e) => e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt");
}

/** Folge der Einteilung (siehe vergleicheEinteilFolge): Sparte, Rasse, Farbenschlag; die Jugend separat wie im Katalog. */
function nachFolge(eintraege: Awaited<ReturnType<typeof gemeldet>>, s: { einteilungJugendSeparat: boolean; jugendSeparat: boolean }) {
  const mit = eintraege.map((e) => ({ e, t: { ...einteilTier(e, s.einteilungJugendSeparat), sparteFolge: e.sparteFolge, rasseFolge: e.rasseFolge, farbFolge: e.farbFolge } }));
  return mit.sort((a, b) => vergleicheEinteilFolge(a.t, b.t, { jugendAmEnde: s.jugendSeparat })).map((x) => x.e);
}
