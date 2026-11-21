/** Gemeinsames für Katalog und Hallenplan: Eingabe der Halle (Schemas), Grundriss prüfen, Plan neu setzen, Tiere für den Plan. */
import { istRechteckUmriss, pruefeHallenUmriss, pruefeUmriss, umrissNormal, ETAGEN_MAX, etagenNormal, neuSetzen, halleZumNeuSetzen, type Halle, formatKatalognummer, halleSchluessel, type KaefigRegel, stabilerText, GRUNDPLATTE_STANDARD, HAUPTGANG_STANDARD, KAEFIG_TYPEN, kaefigTyp, vergleicheFolge, type PlanTier, type KaefigTyp, type SortierSchritt } from "@schau/domain";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { preisrichter, prEinteilung, schau } from "../../db/schema";
import { alsFolge, ladeEintraege } from "../../services/eintraege";
import { protokolliere } from "../../services/protokoll";
import { fehler, ladeSchau } from "../../trpc";

/** Grundplatte je Käfigart (cm); eine Art ohne Angabe nimmt die Vorgabe. */
export const PLATTEN_MASS = z
  .object(
    Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.object({ laenge: z.number().min(20).max(1000), tiefe: z.number().min(20).max(300) }).optional()])) as Record<
      (typeof KAEFIG_TYPEN)[number],
      z.ZodOptional<z.ZodObject<{ laenge: z.ZodNumber; tiefe: z.ZodNumber }>>
    >,
  )
  .strict();

/** Etagen einer Halle aus der Eingabe, sonst die gespeicherten; keine (nur eine Etage) = kein Feld. */
export function etagenAus(eingabe: Partial<Record<string, number>> | undefined, gespeichert: { etagen?: Partial<Record<string, number>> } | null | undefined): { etagen?: Partial<Record<KaefigTyp, number>> } {
  const e = etagenNormal((eingabe ?? gespeichert?.etagen) as Partial<Record<KaefigTyp, number>> | undefined);
  return e ? { etagen: e } : { etagen: undefined };
}

/** Käfige übereinander je Käfigart (1 bis 4; fehlend = eine Etage). */
export const ETAGEN = z.object(Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.number().int().min(1).max(ETAGEN_MAX).optional()])) as Record<(typeof KAEFIG_TYPEN)[number], z.ZodOptional<z.ZodNumber>>).strict();

/** Eingabe einer Halle (cm), wie sie gespeichert wird – auch für Stellvorschläge zu einer noch nicht gespeicherten Halle. */
/** Ein Käfigplatz im festen Plan: in einer Reihe (Lage im Reihensystem) oder in einem Käfigblock (Platz ab 0). */
export const KAEFIG_PLATZ = z.discriminatedUnion("art", [
  z.object({ art: z.literal("reihe"), reihe: z.number().int().min(1).max(10_000), x: z.number().min(-100_000).max(100_000), y: z.number().min(-100_000).max(100_000), etage: z.number().int().min(0).max(10).optional() }),
  z.object({ art: z.literal("block"), objektId: z.string().min(1).max(100), i: z.number().int().min(0).max(1000) }),
]);

export const HALLE_EINGABE = z.object({
  breite: z.number().min(100).max(50000),
  laenge: z.number().min(100).max(50000),
  /** Freier, rechtwinkliger Grundriss (Entscheidung 019); geprüft in `mitGeprueftemUmriss`. */
  umriss: z.array(z.object({ x: z.number().int().min(-50000).max(50000), y: z.number().int().min(-50000).max(50000) })).max(64).optional(),
  gang: z.number().min(50).max(1000),
  wandreihen: z.boolean(),
  wandreiheSeite: z.enum(["anfang", "ende"]).optional(),
  richtung: z.enum(["quer", "laengs"]).default("quer"),
  quergang: z.boolean(),
  wandBuendig: z.boolean().default(true),
  // Restplätze der letzten Platte einer Käfigart (siehe Halle.restPlaetze in der Domain): Standard gemischt, „frei“ ohne Schalter in der Oberfläche.
  restPlaetze: z.enum(["frei", "naechsteArt"]).optional(),
  hauptgang: z.object({ breite: z.number().min(0).max(2000), lage: z.enum(["anfang", "ende", "beide", "mitte", "keiner"]) }).default(HAUPTGANG_STANDARD),
  platte: z.object({ laenge: z.number().min(50).max(1000), tiefe: z.number().min(30).max(300) }).default(GRUNDPLATTE_STANDARD),
  jePlatte: z.object(Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.number().int().min(1).max(20).optional()])) as Record<(typeof KAEFIG_TYPEN)[number], z.ZodOptional<z.ZodNumber>>).strict().default({}),
  /** Fehlt die Angabe, bleibt das gespeicherte Plattenmaß je Käfigart (es wird unter „Käfige“ gepflegt). */
  plattenMass: PLATTEN_MASS.optional(),
  /** Etagen je Käfigart; fehlt die Angabe, bleiben die gespeicherten (sie werden unter „Käfige“ gepflegt). */
  etagen: ETAGEN.optional(),
  flaechen: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        art: z.enum(["sperre", "eingang", "volieren"]),
        x: z.number().min(0).max(50000),
        y: z.number().min(0).max(50000),
        breite: z.number().min(10).max(50000),
        tiefe: z.number().min(10).max(50000),
      }),
    )
    .max(50),
  objekte: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        art: z.enum(["voliere", "kaefigblock", "tisch", "bank", "garnitur"]),
        typ: z.enum(KAEFIG_TYPEN).optional(),
        /** Tisch, Bank, Garnitur: Länge, Tiefe (Tisch bzw. Bank) und Tiefe der Bänke einer Garnitur (cm). */
        laenge: z.number().min(30).max(2000).optional(),
        tiefe: z.number().min(10).max(500).optional(),
        bankTiefe: z.number().min(10).max(200).optional(),
        /** Von der Software eingesetzt (fällt beim Neu-Setzen ohne Rückfrage weg). */
        auto: z.boolean().optional(),
        /** Käfigblock: Seite mit der offenen Front (Hallenkoordinaten). */
        front: z.enum(["x+", "x-", "z+", "z-"]).optional(),
        x: z.number().min(-1000).max(50000),
        y: z.number().min(-1000).max(50000),
        drehung: z.union([z.literal(0), z.literal(90)]),
      }),
    )
    .max(300)
    .default([]),
  reihenVersatz: z
    .array(
      z.object({
        nr: z.number().int().min(1).max(500),
        dx: z.number().min(-50000).max(50000),
        dy: z.number().min(-50000).max(50000),
        drehung: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
      }),
    )
    .max(500)
    .default([]),
  plattenVersatz: z
    .array(
      z.object({
        reihe: z.number().int().min(1).max(500),
        platte: z.number().int().min(0).max(2000),
        dx: z.number().min(-50000).max(50000),
        dy: z.number().min(-50000).max(50000),
        drehung: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
      }),
    )
    .max(2000)
    .default([]),
  spartenStart: z
    .array(z.object({ sparte: z.string().trim().min(1).max(200), reihe: z.number().int().min(1).max(500) }))
    .max(100)
    .default([]),
  /** Im festen Plan entfernte leere Grundplatten und Plätze (ohne Vorgabe: der Schlüssel der Halle bleibt wie vorher). */
  entfernt: z
    .array(z.object({ reihe: z.number().int().min(1).max(500), art: z.enum(["platte", "platz"]), x: z.number().min(-50000).max(50000), y: z.number().min(-50000).max(50000), etage: z.number().int().min(1).max(ETAGEN_MAX - 1).optional() }))
    .max(5000)
    .optional(),
});

type Akteur = Parameters<typeof protokolliere>[1]["akteur"];

/**
 * Grundriss prüfen und einheitlich ablegen (Entscheidung 019): gültig, passend zu Breite und Länge, nichts außerhalb; ein
 * Rechteck als Grundriss wird nicht gespeichert (die Halle bleibt eine gewöhnliche).
 */
export function mitGeprueftemUmriss(halle: Halle, masse: Parameters<typeof pruefeHallenUmriss>[1], vorher?: Halle | null): Halle {
  const f = pruefeHallenUmriss(halle, masse, vorher);
  if (f) throw fehler("BAD_REQUEST", f);
  return umrissEinheitlich(halle);
}

/** Grundriss einheitlich (normalisiert; ein Rechteck als keiner) – ohne die Prüfung der Flächen und Teile. */
export function umrissEinheitlich(halle: Halle): Halle {
  const { umriss, ...rest } = halle;
  if (istRechteckUmriss(umriss)) return rest;
  const f = pruefeUmriss(umriss!);
  if (f) throw fehler("BAD_REQUEST", f);
  return { ...rest, umriss: umrissNormal(umriss!) };
}

/**
 * Plan neu setzen (siehe `neuSetzen` in der Domain): mit neuen Einstellungen der Halle (`halle`) oder ohne, in einem Schritt
 * unter Sperre. Verschobenes, entfernte Plätze und eingesetzte Teile der bisherigen Aufstellung fallen weg – auch belegte
 * Blöcke, ihre Tiere stellt der neue Plan; was nicht in die Reihen passt, bekommt Käfigblöcke. Der Plan ist danach nicht fest.
 */
export async function planNeuSetzenIn(akteur: Akteur, s: Awaited<ReturnType<typeof ladeSchau>>, e: { basis?: string; halle?: z.infer<typeof HALLE_EINGABE>; grund: string }) {
  const { tiere } = await planTiere(s);
  return db.transaction(async (tx) => {
    const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
    if (e.basis !== undefined && e.basis !== halleSchluessel(aktuell?.halle ?? null))
      throw fehler("CONFLICT", "Die Halle wurde inzwischen von jemand anderem geändert – der Plan wird neu geladen, bitte die Änderung noch einmal machen.");
    const vorbereitet: Halle | null = e.halle ? { ...e.halle, plattenMass: e.halle.plattenMass ?? aktuell?.halle?.plattenMass ?? {}, ...etagenAus(e.halle.etagen, aktuell?.halle) } : null;
    // Geprüft wird, was nach dem Neu-Setzen bleibt: eingesetzte Blöcke und Volieren fallen dabei weg, Flächen und Möbel nicht.
    if (vorbereitet) mitGeprueftemUmriss(halleZumNeuSetzen(vorbereitet), s.kaefigMasse);
    const roh: Halle | null = vorbereitet ? umrissEinheitlich(vorbereitet) : (aktuell?.halle ?? null);
    if (!roh) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
    const { halle, eingesetzt, ohne } = neuSetzen(roh, tiere, s.kaefigMasse);
    await tx.update(schau).set({ halle, hallenplanFest: null }).where(eq(schau.id, s.id));
    // Ins Protokoll die geänderten Teile der Halle (wie beim Speichern der Halle) und der bisherige feste Plan.
    const vorher = (aktuell?.halle ?? {}) as Record<string, unknown>;
    const nachher = halle as unknown as Record<string, unknown>;
    const geaendert = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].filter((k) => stabilerText(vorher[k]) !== stabilerText(nachher[k]));
    await protokolliere(tx, {
      schauId: s.id,
      tabelle: "schau",
      datensatzId: s.id,
      aktion: "Hallenplan neu gesetzt",
      alt: { ...(aktuell?.fest ? { fest: aktuell.fest.am } : {}), ...Object.fromEntries(geaendert.map((k) => [k, vorher[k] ?? null])) },
      neu: { ...Object.fromEntries(geaendert.map((k) => [k, nachher[k] ?? null])), eingesetzt, ohne },
      ...(e.grund ? { grund: e.grund } : {}),
      akteur,
    });
    return { eingesetzt, ohne };
  });
}

/** Tiere für den Hallenplan: alle gemeldeten (offen und bestätigt) in Katalogfolge, mit Käfigart und Preisrichter. */
export async function planTiere(s: { id: number; kaefigRegeln: KaefigRegel[] | null; katalogStart: number; jugendSeparat: boolean; staemmeVorn: boolean; kaefigFolge: KaefigTyp[] | null; katalogSortierung?: SortierSchritt[] | null }) {
  const [alle, einteilung, richter] = await Promise.all([
    // Alle gemeldeten Tiere (offen und bestätigt) – der Plan dient dem Aufbau vor der Einlieferung. Ein als fehlend
    // gemeldetes Tier behält seinen Käfig (der steht schon); nur abgelehnte und stornierte Meldungen fallen heraus.
    ladeEintraege(s.id).then((l) => l.filter((e) => e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt")),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
  ]);
  const regeln = s.kaefigRegeln ?? [];
  const opts = { start: s.katalogStart, jugendSeparat: s.jugendSeparat, staemmeVorn: s.staemmeVorn, kaefigFolge: s.kaefigFolge, sortierung: s.katalogSortierung };
  // Erst die nummerierten in Nummernfolge, dann (noch) nicht nummerierte in Ausstellungsfolge.
  const mitNr = alle.filter((e) => e.katalogNr != null).sort((a, b) => a.katalogNr! - b.katalogNr! || a.suffix.localeCompare(b.suffix));
  const ohneNr = alle.filter((e) => e.katalogNr == null).sort((a, b) => vergleicheFolge(alsFolge(a, regeln), alsFolge(b, regeln), opts));
  const tiere: PlanTier[] = [];
  /** Farbenschlag je Tier (Tier-ID, Name), nur wo einer eingetragen ist. */
  const farben: [number, string][] = [];
  for (const e of [...mitNr, ...ohneNr]) {
    // Physisch zählt auch die Käfigwahl bei der Einlieferung.
    const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, wahl: e.kaefigWahl }, regeln);
    if (!typ) continue;
    const z = e.katalogNr == null ? undefined : einteilung.find((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr);
    const nr = e.katalogNr == null ? null : formatKatalognummer(e);
    if (e.farbenschlag) farben.push([e.id, e.farbenschlag]);
    tiere.push({ id: e.id, typ, nr, ...(e.kaefig && e.kaefig !== nr ? { kaefig: e.kaefig } : {}), rasse: e.rasse ?? e.einordnungRasse ?? e.freitext, sparte: e.sparte ?? "ohne Sparte", preisrichterId: z?.preisrichterId ?? null });
  }
  return { tiere, richter, farben };
}
