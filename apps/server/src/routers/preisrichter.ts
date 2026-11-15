import { formatKatalognummer, regelnAusZuteilung, type RassenRegel } from "@schau/domain";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPasswort } from "../auth";
import { db } from "../db/client";
import { preisrichter, prEinteilung, prZuteilung, sitzung } from "../db/schema";
import { ladeEintraege } from "../services/eintraege";
import { bereicheDerSchau, einteilSchluessel, einteilTier, ladeRegeln, sperreEinteilung } from "../services/einteilung";
import type { Akteur } from "../services/protokoll";
import { protokolliere } from "../services/protokoll";
import { pinBremse, pinWartezeitJeRichter } from "./bewertung";
import { zuteilung } from "../services/pruefung";
import { oeffentlichSichtbarProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId } from "../trpc";
import type { Tx } from "../db/client";
import { pruefeNichtAbgeschlossen } from "../services/kasse";

type Nummer = { nr: number; suffix?: string; rasse: string; sparte?: string | null };
type Gruppe = { nr: number; anzahl: number; ersteRasse: string; letzteRasse: string; sparten: Set<string> };
/** `gewicht`: Höchstzahl des Preisrichters (Obmann weniger) – die Tiere verteilen sich in diesem Verhältnis. Ohne Angabe 1. */
export type RichterWahl = { id: number; sparten: string[]; gewicht?: number };
const gewichtVon = (r: RichterWahl) => (r.gewicht && r.gewicht > 0 ? r.gewicht : 1);

/** Bewertet dieser Preisrichter diese Sparte? Ohne Angabe bewertet er alles. */
export const bewertetSparte = (r: { sparten?: string[] | null }, sparte: string | null | undefined) => !r.sparten?.length || r.sparten.includes(sparte ?? "");

/** Nummern in Katalogfolge zu ganzen Nummern bündeln (24, 24a, 24b gehören zusammen). */
function gruppieren(nummern: Nummer[]): Gruppe[] {
  const sortiert = [...nummern].sort((a, b) => a.nr - b.nr || (a.suffix ?? "").localeCompare(b.suffix ?? ""));
  const gruppen: Gruppe[] = [];
  for (const n of sortiert) {
    const g = gruppen.at(-1);
    if (g && g.nr === n.nr) {
      g.anzahl++;
      g.letzteRasse = n.rasse;
      g.sparten.add(n.sparte ?? "");
    } else gruppen.push({ nr: n.nr, anzahl: 1, ersteRasse: n.rasse, letzteRasse: n.rasse, sparten: new Set([n.sparte ?? ""]) });
  }
  return gruppen;
}

/**
 * Schneidet Gruppen in aufeinanderfolgende Bereiche mit den Zielgrößen `ziele` (der letzte nimmt den Rest) und schneidet
 * dabei möglichst an einer Rassengrenze (höchstens 25 % vom Ziel entfernt).
 */
function schneiden(gruppen: Gruppe[], ziele: number[]): { von: number; bis: number }[] {
  const bloecke: { von: number; bis: number }[] = [];
  let start = 0;
  for (let r = 0; r < ziele.length && start < gruppen.length; r++) {
    if (r === ziele.length - 1) {
      bloecke.push({ von: gruppen[start]!.nr, bis: gruppen[gruppen.length - 1]!.nr });
      break;
    }
    const ziel = ziele[r]!;
    let ende = -1;
    let besterAbstand = Infinity;
    let naechste = start;
    let naechsterAbstand = Infinity;
    let anzahl = 0;
    for (let i = start; i < gruppen.length - 1; i++) {
      anzahl += gruppen[i]!.anzahl;
      const abstand = Math.abs(anzahl - ziel);
      if (abstand < naechsterAbstand) {
        naechsterAbstand = abstand;
        naechste = i;
      }
      if (anzahl < ziel * 0.75) continue;
      if (anzahl > ziel * 1.25) break;
      if (gruppen[i + 1]!.ersteRasse !== gruppen[i]!.letzteRasse && abstand < besterAbstand) {
        besterAbstand = abstand;
        ende = i;
      }
    }
    if (ende < 0) ende = naechste;
    bloecke.push({ von: gruppen[start]!.nr, bis: gruppen[ende]!.nr });
    start = ende + 1;
  }
  return bloecke;
}

/**
 * Teilt nummerierte Tiere auf die Preisrichter auf und schneidet dabei möglichst an einer Rassengrenze.
 * Nachmeldungen (24, 24a, 24b) haben dieselbe Nummer und bleiben beim selben Preisrichter – die Einteilung
 * arbeitet mit ganzen Nummern, ein Schnitt dazwischen ergäbe überlappende Bereiche.
 *
 * Bewertet ein Preisrichter nur bestimmte Sparten, bekommt er nur diese: Die Nummern werden in Abschnitte gleicher
 * Sparte(n) geteilt; jeder Abschnitt geht an so wenige passende Preisrichter wie nötig (eine Sparte möglichst bei einem),
 * die am wenigsten zu tun haben – die engsten Abschnitte zuerst, damit am Ende alle etwa gleich viel bewerten.
 * `fehlend`: Sparten, die niemand bewertet (diese Nummern bleiben ohne Preisrichter).
 */
export function schlageEinteilungVor(
  nummern: Nummer[],
  richterEingabe: number[] | RichterWahl[],
): { preisrichterId: number; vonNr: number; bisNr: number }[] & { fehlend?: string[] } {
  const richter: RichterWahl[] = richterEingabe.map((r) => (typeof r === "number" ? { id: r, sparten: [] } : r));
  const gruppen = gruppieren(nummern);
  if (gruppen.length === 0 || richter.length === 0) return [];
  // Ohne Einschränkungen: gleichmäßig in Katalogfolge.
  if (richter.every((r) => !r.sparten.length)) return schneidenGleichmaessig(gruppen, richter);
  // Abschnitte: aufeinanderfolgende Nummern mit denselben passenden Preisrichtern.
  const passend = (g: Gruppe) => richter.filter((r) => [...g.sparten].every((sp) => bewertetSparte(r, sp)));
  const abschnitte: { gruppen: Gruppe[]; richter: RichterWahl[]; anzahl: number; index: number }[] = [];
  for (const g of gruppen) {
    const p = passend(g);
    const a = abschnitte.at(-1);
    if (a && a.richter.length === p.length && a.richter.every((r, i) => r.id === p[i]!.id)) {
      a.gruppen.push(g);
      a.anzahl += g.anzahl;
    } else abschnitte.push({ gruppen: [g], richter: p, anzahl: g.anzahl, index: abschnitte.length });
  }
  // Ohne Preisrichter: je Sparte; Tiere ohne Sparte und Nummern mit gemischten Sparten (Nachmeldung 24a einer anderen
  // Sparte als 24 – eine Nummer geht nur an einen Preisrichter) eigens benannt.
  const fehlend = [
    ...new Set(
      abschnitte
        .filter((a) => !a.richter.length)
        .flatMap((a) => a.gruppen)
        .map((g) => {
          const sp = [...g.sparten];
          if (sp.length > 1) return `Nr. ${g.nr} (${sp.map((x) => x || "ohne Sparte").join(" und ")})`;
          return sp[0] || "Tiere ohne Sparte";
        }),
    ),
  ];
  const zuteilbar = abschnitte.filter((a) => a.richter.length);
  const last = new Map(richter.map((r) => [r.id, 0]));
  const ergebnis: { preisrichterId: number; vonNr: number; bisNr: number }[] = [];
  /**
   * Auffüllen: Füllstand h (Last je Höchstzahl) mit Summe max(0, h · Gewicht − Last) = Anzahl; je Preisrichter sein
   * Anteil – ein Obmann mit kleinerer Höchstzahl ist so früher „voll“.
   */
  const auffuellen = (ids: RichterWahl[], anzahl: number) => {
    const lasten = ids.map((r) => last.get(r.id)!);
    const gewichte = ids.map(gewichtVon);
    const stand = lasten.map((l, i) => l / gewichte[i]!);
    let lo = Math.min(...stand), hi = Math.max(...stand) + anzahl / Math.min(...gewichte);
    for (let i = 0; i < 50; i++) {
      const h = (lo + hi) / 2;
      if (lasten.reduce((n, l, j) => n + Math.max(0, h * gewichte[j]! - l), 0) < anzahl) lo = h;
      else hi = h;
    }
    return ids.map((r, i) => ({ r, anteil: Math.max(0, hi * gewichte[i]! - lasten[i]!) }));
  };
  // Engste Abschnitte zuerst (die wenigsten passenden Preisrichter), dann die großen.
  for (const a of [...zuteilbar].sort((x, y) => x.richter.length - y.richter.length || y.anzahl - x.anzahl || x.index - y.index)) {
    // Auf alle passenden nach ihrer Last verteilen; Anteile unter 15 Tieren fallen weg (ein kleiner Abschnitt bleibt so
    // ganz bei einem Preisrichter) – niemand bekommt eine Handvoll Tiere einer Sparte.
    let kandidaten = [...a.richter];
    let mit = auffuellen(kandidaten, a.anzahl);
    const mindest = Math.min(15, a.anzahl);
    while (mit.length > 1 && mit.some((x) => x.anteil < mindest)) {
      const kleinster = mit.reduce((x, y) => (y.anteil < x.anteil ? y : x));
      kandidaten = kandidaten.filter((r) => r !== kleinster.r);
      mit = auffuellen(kandidaten, a.anzahl);
    }
    mit = mit.filter((x) => x.anteil >= 0.5).sort((x, y) => richter.indexOf(x.r) - richter.indexOf(y.r));
    const bloecke = schneiden(a.gruppen, mit.map((x) => x.anteil));
    bloecke.forEach((b, i) => {
      const r = mit[i]!.r;
      ergebnis.push({ preisrichterId: r.id, vonNr: b.von, bisNr: b.bis });
      last.set(r.id, last.get(r.id)! + a.gruppen.filter((g) => g.nr >= b.von && g.nr <= b.bis).reduce((n, g) => n + g.anzahl, 0));
    });
  }
  // Aneinandergrenzende Bereiche desselben Preisrichters zusammenfassen (1–3 und 4–29 → 1–29) – nur, wenn keine Nummer
  // dazwischen liegt (sonst bekäme er Tiere einer Sparte, die er nicht bewertet).
  const naechsteNr = new Map(gruppen.map((g, i) => [g.nr, gruppen[i + 1]?.nr]));
  const sortiert: typeof ergebnis = [];
  for (const e of ergebnis.sort((x, y) => x.vonNr - y.vonNr)) {
    const vor = sortiert.at(-1);
    if (vor && vor.preisrichterId === e.preisrichterId && naechsteNr.get(vor.bisNr) === e.vonNr) vor.bisNr = e.bisNr;
    else sortiert.push({ ...e });
  }
  return Object.assign(sortiert, { fehlend });
}

/**
 * Gleichmäßig in Katalogfolge (ohne Sparten-Einschränkung): jedes Ziel aus dem Rest im Verhältnis der Höchstzahl zu den
 * übrigen Preisrichtern (Obmann weniger).
 */
function schneidenGleichmaessig(gruppen: Gruppe[], richter: RichterWahl[]) {
  const ids = richter.map((r) => r.id);
  const bloecke: { von: number; bis: number }[] = [];
  let start = 0;
  for (let r = 0; r < ids.length && start < gruppen.length; r++) {
    const uebrig = ids.length - r;
    const restGruppen = gruppen.slice(start);
    if (uebrig === 1) {
      bloecke.push({ von: restGruppen[0]!.nr, bis: restGruppen.at(-1)!.nr });
      break;
    }
    const restGewicht = richter.slice(r).reduce((n, x) => n + gewichtVon(x), 0);
    const ziel = (restGruppen.reduce((n, g) => n + g.anzahl, 0) * gewichtVon(richter[r]!)) / restGewicht;
    const [erster] = schneiden(restGruppen, [ziel, Infinity]);
    bloecke.push(erster!);
    start = gruppen.findIndex((g) => g.nr === erster!.bis) + 1;
  }
  return bloecke.map((b, i) => ({ preisrichterId: ids[i]!, vonNr: b.von, bisNr: b.bis }));
}

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
  const richter = await tx.select({ id: preisrichter.id, name: preisrichter.name, sparten: preisrichter.sparten }).from(preisrichter).where(eq(preisrichter.schauId, schauId));
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
  // Nur Sparten, die der Preisrichter bewertet (unter „Preisrichter bearbeiten“ festgelegt).
  const falsch = new Map<string, { name: string; sparte: string; nummern: string[] }>();
  for (const e of eintraege) {
    const rid = neu.get(e.id);
    const pr = richter.find((x) => x.id === rid);
    const sp = e.sparte ?? e.einordnungSparte ?? "";
    // Ausnahme: eine Unternummer (24a) einer anderen Rasse hängt an der Nummer 24 – sie wird gemeldet, sperrt aber nicht.
    if (!pr || bewertetSparte(pr, sp) || ausnahmen?.has(e.id)) continue;
    const k = JSON.stringify([pr.id, sp]);
    const f = falsch.get(k) ?? { name: pr.name, sparte: sp, nummern: [] };
    f.nummern.push(formatKatalognummer(e));
    falsch.set(k, f);
  }
  if (falsch.size) {
    const text = [...falsch.values()].map((f) => `${f.name} bewertet keine ${f.sparte || "Tiere ohne Sparte"} (Nr. ${f.nummern.slice(0, 5).join(", ")}${f.nummern.length > 5 ? " …" : ""})`).join("; ");
    throw fehler("BAD_REQUEST", `${text}. Bitte die Bereiche anders verteilen oder beim Preisrichter die Sparte ergänzen.`);
  }
  if (umgehaengt.length && !bestaetigt) {
    const liste = umgehaengt.slice(0, 10).join(", ") + (umgehaengt.length > 10 ? " …" : "");
    throw fehler("CONFLICT", `Bereits bewertete Tiere wechseln den Preisrichter: Nr. ${liste}.`);
  }
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const { id, ...werte } = input;
      if (id) {
        const [r] = await db.select().from(preisrichter).where(eq(preisrichter.id, id));
        if (!r || r.schauId !== input.schauId) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
        await db.update(preisrichter).set(werte).where(eq(preisrichter.id, id));
        return { id };
      }
      const [r] = await db.insert(preisrichter).values(werte).returning();
      return { id: r!.id };
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
    let geloescht: { id: number }[];
    try {
      geloescht = await db
        .delete(preisrichter)
        .where(and(eq(preisrichter.id, input.id), eq(preisrichter.schauId, input.schauId)))
        .returning({ id: preisrichter.id });
    } catch {
      throw fehler("CONFLICT", "Der Preisrichter hat schon bewertet und kann nicht gelöscht werden.");
    }
    if (geloescht.length === 0) throw fehler("NOT_FOUND", "Preisrichter nicht gefunden.");
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
      .map((e) => ({ nr: e.katalogNr!, suffix: e.suffix, rasse: e.rasse ?? e.freitext, sparte: e.sparte ?? e.einordnungSparte }));
    const v = schlageEinteilungVor(nummern, richter);
    return { einteilung: [...v], fehlend: v.fehlend ?? [] };
  }),

  /**
   * Einteilung nach Rassen: alle gemeldeten Rassen (offene und bestätigte Meldungen) in Ausstellungsfolge mit Tierzahl
   * und Farbenschlägen, dazu die gespeicherten Regeln.
   */
  zuteilung: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [eintraege, regeln] = await Promise.all([gemeldet(input.schauId), ladeRegeln(db, input.schauId)]);
    // Gruppiert mit demselben Schlüssel, mit dem gespeichert und angewendet wird (ohne Rücksicht auf Schreibweise); es
    // gilt die erste Schreibweise. Gespeicherte Regeln kommen in der Schreibweise der Anzeige zurück.
    const gruppen: { sparte: string; rasse: string; anzahl: number; farben: { farbenschlag: string; anzahl: number }[] }[] = [];
    const jeRasse = new Map<string, (typeof gruppen)[number]>();
    const schreibweise = new Map<string, { sparte: string; rasse: string; farbenschlag: string }>();
    for (const e of [...eintraege].sort(nachFolge)) {
      const t = einteilTier(e);
      const sparte = t.sparte ?? "";
      const k = einteilSchluessel(sparte, t.rasse);
      let g = jeRasse.get(k);
      if (!g) {
        g = { sparte, rasse: t.rasse, anzahl: 0, farben: [] };
        jeRasse.set(k, g);
        gruppen.push(g);
        schreibweise.set(k, { sparte, rasse: t.rasse, farbenschlag: "" });
      }
      g.anzahl++;
      const fk = einteilSchluessel(sparte, t.rasse, t.farbenschlag);
      const f = g.farben.find((x) => einteilSchluessel(g.sparte, g.rasse, x.farbenschlag) === fk);
      if (f) f.anzahl++;
      else {
        g.farben.push({ farbenschlag: t.farbenschlag ?? "", anzahl: 1 });
        schreibweise.set(fk, { sparte: g.sparte, rasse: g.rasse, farbenschlag: t.farbenschlag ?? "" });
      }
    }
    const angezeigt = regeln.map((r) => ({ ...r, ...(schreibweise.get(einteilSchluessel(r.sparte, r.rasse, r.farbenschlag)) ?? {}) }));
    return { gruppen, regeln: angezeigt, nummeriert: eintraege.some((e) => e.katalogNr != null) };
  }),

  /**
   * Einteilung nach Rassen speichern. Sind schon Katalognummern vergeben, rechnet sie die Bereiche gleich neu (mit den
   * Prüfungen der Einteilung nach Nummern); sonst geschieht das beim Vergeben der Nummern.
   */
  zuteilungSetzen: oeffentlichSichtbarProcedure
    .input(
      z.object({
        schauId: dbId,
        regeln: z
          .array(z.object({ preisrichterId: dbId, sparte: z.string().trim().max(100), rasse: z.string().trim().min(1).max(300), farbenschlag: z.string().trim().max(300) }))
          .max(3000),
        bestaetigt: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const richter = await db.select({ id: preisrichter.id, name: preisrichter.name, sparten: preisrichter.sparten }).from(preisrichter).where(eq(preisrichter.schauId, input.schauId));
      // Doppelte (gleiche Sparte, Rasse, Farbenschlag ohne Rücksicht auf Schreibweise): die letzte gilt.
      const eindeutig = new Map<string, RassenRegel>();
      for (const r of input.regeln) eindeutig.set(einteilSchluessel(r.sparte, r.rasse, r.farbenschlag), r);
      const regeln = [...eindeutig.values()];
      for (const r of regeln) {
        const pr = richter.find((x) => x.id === r.preisrichterId);
        if (!pr) throw fehler("BAD_REQUEST", "Unbekannter Preisrichter.");
        if (!bewertetSparte(pr, r.sparte)) throw fehler("BAD_REQUEST", `${pr.name} bewertet keine ${r.sparte || "Tiere ohne Sparte"} (${r.rasse}). Bitte einen anderen Preisrichter wählen oder beim Preisrichter die Sparte ergänzen.`);
      }
      const speichern = async (tx: Tx) => {
        await tx.delete(prZuteilung).where(eq(prZuteilung.schauId, input.schauId));
        if (regeln.length) await tx.insert(prZuteilung).values(regeln.map((r) => ({ ...r, schauId: input.schauId })));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "pr_zuteilung",
          datensatzId: null,
          aktion: "Einteilung nach Rassen",
          neu: regeln.map((r) => ({ preisrichter: richter.find((x) => x.id === r.preisrichterId)!.name, sparte: r.sparte, rasse: r.rasse, ...(r.farbenschlag ? { farbenschlag: r.farbenschlag } : {}) })),
          akteur: ctx,
        });
      };
      // Unter der Sperre: Nummern und Einteilung ändern sich nicht, während hier gerechnet wird.
      return db.transaction(async (tx) => {
        await sperreEinteilung(tx, input.schauId);
        const b = await bereicheDerSchau(tx, input.schauId, regeln);
        if (b.nummeriert === 0) {
          await speichern(tx);
          return { bereiche: null, ohne: 0, abweichend: [] as string[] };
        }
        await schreibeEinteilung(tx, ctx, input.schauId, b.bereiche, input.bestaetigt, { zusatz: speichern, ausnahmen: new Set(b.abweichend.map((x) => x.id)) });
        return { bereiche: b.bereiche, ohne: b.ohne, abweichend: b.abweichend.map((x) => x.nummer) };
      });
    }),

  /**
   * Vorschlag: gleichmäßig verteilen in der Folge Sparte, Rasse, Farbenschlag (ohne die Blöcke für Stämme und Jugend – so
   * liegt jede Rasse beisammen und wird nur geteilt, wenn es nicht anders geht), dann je Rasse bzw. Farbenschlag.
   */
  zuteilungVorschlagen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [richter, eintraege] = await Promise.all([
      richterMitGewicht(input.schauId, s),
      gemeldet(input.schauId),
    ]);
    if (!eintraege.length) return { regeln: [] as RassenRegel[], fehlend: [] as string[] };
    const folge = [...eintraege].sort(nachFolge);
    // Je Farbenschlag eine „Nummer“: geschnitten wird nie mitten in einem Farbenschlag.
    const nrVon = new Map<string, number>();
    const nummern = folge.map((e) => {
      const t = einteilTier(e);
      const k = einteilSchluessel(t.sparte, t.rasse, t.farbenschlag);
      if (!nrVon.has(k)) nrVon.set(k, nrVon.size + 1);
      return { nr: nrVon.get(k)!, rasse: einteilSchluessel(t.sparte, t.rasse), sparte: t.sparte };
    });
    const v = schlageEinteilungVor(nummern, richter);
    const regeln = regelnAusZuteilung(
      folge.map((e, i) => {
        const n = nummern[i]!.nr;
        return { ...einteilTier(e), preisrichterId: v.find((x) => n >= x.vonNr && n <= x.bisNr)?.preisrichterId ?? null };
      }),
    );
    return { regeln, fehlend: v.fehlend ?? [] };
  }),
});

/** Preisrichter für die Vorschläge, mit der Höchstzahl als Gewicht: ein Obmann bekommt im Verhältnis weniger Tiere. */
async function richterMitGewicht(schauId: number, s: { prHoechstzahl: number; obmannHoechstzahl: number }): Promise<RichterWahl[]> {
  const liste = await db
    .select({ id: preisrichter.id, sparten: preisrichter.sparten, istObmann: preisrichter.istObmann })
    .from(preisrichter)
    .where(eq(preisrichter.schauId, schauId))
    .orderBy(asc(preisrichter.id));
  return liste.map((r) => ({ id: r.id, sparten: r.sparten ?? [], gewicht: r.istObmann ? s.obmannHoechstzahl : s.prHoechstzahl }));
}

/** Gemeldete Tiere für die Einteilung: offene und bestätigte Meldungen (geplant wird vor dem Meldeschluss). */
async function gemeldet(schauId: number) {
  return (await ladeEintraege(schauId)).filter((e) => e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt");
}

/** Ausstellungsfolge: Sparte, Rasse, Farbenschlag (Einträge ohne Verzeichnis-Folge ans Ende, nach Namen). */
function nachFolge(a: Awaited<ReturnType<typeof gemeldet>>[number], b: Awaited<ReturnType<typeof gemeldet>>[number]) {
  const ta = einteilTier(a), tb = einteilTier(b);
  return (
    (a.sparteFolge ?? 1e9) - (b.sparteFolge ?? 1e9) ||
    (ta.sparte ?? "").localeCompare(tb.sparte ?? "") ||
    (a.rasseFolge ?? 1e9) - (b.rasseFolge ?? 1e9) ||
    ta.rasse.localeCompare(tb.rasse) ||
    (a.farbFolge ?? 1e9) - (b.farbFolge ?? 1e9) ||
    (ta.farbenschlag ?? "").localeCompare(tb.farbenschlag ?? "")
  );
}
