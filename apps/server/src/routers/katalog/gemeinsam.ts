/** Gemeinsames für Katalog und Hallenplan: Eingabe der Halle (Schemas), Grundriss prüfen, Plan neu setzen, Tiere für den Plan. */
import { aussehenBereinigt, flaecheBereinigt, nummerFolgeBereinigt, TUER_ARTEN, FIRST_HOEHE_MAX, HALLEN_BOEDEN, PRALLWAND_HOEHE_MAX, WAND_HOEHE_MAX, WAND_HOEHE_MIN, istRechteckUmriss, pruefeHallenUmriss, pruefeUmriss, umrissNormal, ETAGEN_MAX, etagenNormal, neuSetzen, halleZumNeuSetzen, type Halle, formatKatalognummer, halleSchluessel, type KaefigRegel, stabilerText, GRUNDPLATTE_STANDARD, HAUPTGANG_STANDARD, KAEFIG_TYPEN, kaefigTyp, vergleicheFolge, type PlanTier, type KaefigTyp, type SortierSchritt, planeHalle, richterImPlan, hallenStandVon } from "@schau/domain";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../../db/client";
import { preisrichter, prEinteilung, schau } from "../../db/schema";
import { alsFolge, ladeEintraege, type Eintrag } from "../../services/eintraege";
import { einteilTier, ladeRegeln } from "../../services/einteilung";
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
        /** Eingang: Tür in 3D (Entscheidung 028) – nur an Eingängen und nur abweichend von der Vorgabe gespeichert. */
        tuer: z.enum(TUER_ARTEN).optional(),
      }).transform(flaecheBereinigt),
    )
    .max(50),
  objekte: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        art: z.enum(["voliere", "kaefigblock", "tisch", "bank", "garnitur", "pokaltisch"]),
        typ: z.enum(KAEFIG_TYPEN).optional(),
        /** Tisch, Bank, Garnitur, Pokaltisch: Länge, Tiefe (Tisch bzw. Bank) und Tiefe der Bänke einer Garnitur (cm). */
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
  /** Wie „Nach Plan nummerieren“ zählt (ohne Vorgabe: der Schlüssel der Halle bleibt wie vorher). */
  nummerFolge: z
    .object({
      startReihe: z.number().int().min(1).max(500).optional(),
      absteigend: z.boolean().optional(),
      vomEnde: z.boolean().optional(),
      schlange: z.boolean().optional(),
      doppelAbwechselnd: z.boolean().optional(),
    })
    // Nur gesetzte Werte; ohne Einstellung fällt das Feld weg (der Schlüssel der Halle bleibt wie ohne Einstellung). Der
    // Editor bereinigt seinen Entwurf genauso (`halleBereinigt`).
    .transform(nummerFolgeBereinigt)
    .optional(),
  /** Aussehen in 3D (Entscheidung 028): begrenzt, nur Abweichungen von der Vorgabe; ohne fällt das Feld weg. */
  aussehen: z
    .object({
      boden: z.enum(HALLEN_BOEDEN).optional(),
      abdeckung: z.boolean().optional(),
      prallwand: z.union([z.literal("holz"), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional(),
      prallwandHoehe: z.number().int().min(0).max(PRALLWAND_HOEHE_MAX).optional(),
      wandHoehe: z.number().int().min(WAND_HOEHE_MIN).max(WAND_HOEHE_MAX).optional(),
      firstHoehe: z.number().int().min(WAND_HOEHE_MIN).max(FIRST_HOEHE_MAX).optional(),
      fenster: z.boolean().optional(),
      decke: z.boolean().optional(),
      linien: z.boolean().optional(),
      geraete: z.boolean().optional(),
    })
    .transform(aussehenBereinigt)
    .optional(),
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
export async function planNeuSetzenIn(akteur: Akteur, s: Awaited<ReturnType<typeof ladeSchau>>, e: { basis?: string; halle?: z.infer<typeof HALLE_EINGABE>; grund: string }, inTx?: Tx) {
  const { tiere } = await planTiere(s);
  // `inTx`: in der Transaktion des Aufrufers (Entscheiden für einen Entwurf: Einsetzen und Archivieren zusammen).
  const setzen = async (tx: Tx) => {
    const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest, phase: schau.phase }).from(schau).where(eq(schau.id, s.id)).for("no key update");
    // Phase unter der Sperre: eine eben abgeschlossene Schau wird nicht mehr geändert.
    if (aktuell?.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
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
      // Der bisherige feste Plan vollständig (Lage jedes Käfigs und Tiers): so lässt sich der Stand vor dem Neu-Setzen aus
      // dem Protokoll wiederherstellen (Rückmeldung 21.11.2026, damals ging er verloren).
      alt: { ...(aktuell?.fest ? { fest: aktuell.fest.am, festPlan: aktuell.fest } : {}), ...Object.fromEntries(geaendert.map((k) => [k, vorher[k] ?? null])) },
      neu: { ...Object.fromEntries(geaendert.map((k) => [k, nachher[k] ?? null])), eingesetzt, ohne },
      ...(e.grund ? { grund: e.grund } : {}),
      akteur,
    });
    return { eingesetzt, ohne };
  };
  return inTx ? setzen(inTx) : db.transaction(setzen);
}

/**
 * Tiere für den Hallenplan: alle gemeldeten (offen und bestätigt) in Katalogfolge, mit Käfigart und Preisrichter – mit
 * Nummer aus den Nummernbereichen, ohne Nummer aus der Einteilung nach Rassen (`richterImPlan`; der Hallenplan kommt vor
 * den Katalognummern, die Farben stehen so schon vorher). `geladen`: schon geladene Einträge der Schau (`ladeEintraege(s.id)`),
 * spart das zweite Laden (Prüfliste).
 */
export async function planTiere(s: { id: number; kaefigRegeln: KaefigRegel[] | null; katalogStart: number; jugendSeparat: boolean; staemmeVorn: boolean; kaefigFolge: KaefigTyp[] | null; katalogSortierung?: SortierSchritt[] | null; einteilungJugendSeparat?: boolean }, geladen?: Eintrag[]) {
  const [alle, einteilung, richter, rassenRegeln] = await Promise.all([
    // Alle gemeldeten Tiere (offen und bestätigt) – der Plan dient dem Aufbau vor der Einlieferung. Ein als fehlend
    // gemeldetes Tier behält seinen Käfig (der steht schon); nur abgelehnte und stornierte Meldungen fallen heraus.
    (geladen ? Promise.resolve(geladen) : ladeEintraege(s.id)).then((l) => l.filter((e) => e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt")),
    db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
    db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)).orderBy(asc(preisrichter.name)),
    ladeRegeln(db, s.id),
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
    const preisrichterId = richterImPlan({ ...einteilTier(e, !!s.einteilungJugendSeparat), nr: e.katalogNr }, einteilung, rassenRegeln);
    const nr = e.katalogNr == null ? null : formatKatalognummer(e);
    if (e.farbenschlag) farben.push([e.id, e.farbenschlag]);
    tiere.push({ id: e.id, typ, nr, ...(e.kaefig && e.kaefig !== nr ? { kaefig: e.kaefig } : {}), rasse: e.rasse ?? e.einordnungRasse ?? e.freitext, sparte: e.sparte ?? "ohne Sparte", preisrichterId });
  }
  return { tiere, richter, farben };
}

/**
 * Stand des Hallenplans für die Seite „Katalognummern“ (`hallenStandVon`): Halle, fester Plan, veraltet, Tiere mit und ohne
 * Platz, schon nummeriert – gerechnet wie die Seite „Hallenplan“ (dieselben Tiere, derselbe Plan).
 */
export async function hallenStand(s: Parameters<typeof planTiere>[0] & { halle: Halle | null; hallenplanFest: Parameters<typeof planeHalle>[3]; kaefigMasse: Parameters<typeof planeHalle>[2] }) {
  const { tiere } = await planTiere(s);
  return hallenStandVon(s.halle ? planeHalle(s.halle, tiere, s.kaefigMasse, s.hallenplanFest) : null, tiere, !!s.hallenplanFest);
}
