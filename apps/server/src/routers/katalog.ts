import { halleNormal, istRechteckUmriss, pruefeHallenUmriss, pruefeUmriss, umrissNormal, AUFSTELLER_STANDARD, gefordertCent, VERKLEIDUNG_STANDARD, verkleidungVon, ETAGEN_MAX, etagenNormal, bewertungsText, neuSetzen, halleZumNeuSetzen, type Halle, mitWandreihe, reihenVersatzNachUmbau, festschreiben, plattenStand, pruefeEntfernt, pruefeTeileEntfernt, formatKatalognummer, halleSchluessel, type KaefigRegel, stabilerText, GRUNDPLATTE_STANDARD, HALLE_STANDARD, HAUPTGANG_STANDARD, KAEFIG_TYPEN, kaefigName, kaefigTyp, planeHalle, vergleicheFolge, type PlanTier, kaefigVorschlag, nachmeldungsNummern, nummernBereiche, luekenlosAuffuellen, planFolge, planUnordnung, vergebeKatalognummern, stellVorschlaege, type KaefigTyp, type SortierSchritt, belegungImPlan, gleicherPlatz, platzImPlan, tierVersetzen, type KaefigPlatz } from "@schau/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { BILD_MAX_PIXEL, bildMasse, bildTyp, pngLesbar } from "./katalog-gestaltung";

/** Sockelbild höchstens 2 MB – in 3D wird es ohnehin auf 512 px verkleinert. */
const SOCKEL_BILD_MAX_BYTES = 2 * 1024 * 1024;
import { bild, gesundheit, katalogeintrag, meldung, preisrichter, prEinteilung, schau, verkauf, verkaufZahlungseingang } from "../db/schema";
import { alsFolge, ladeEintraege, meldebetraege, skalaVon } from "../services/eintraege";
import { rassenEinteilungAnwenden, sperreEinteilung } from "../services/einteilung";
import { pruefeNichtAbgeschlossen, sperreKasse } from "../services/kasse";
import { bindungen } from "../services/meldung";
import { protokolliere } from "../services/protokoll";
import { nachweisStand } from "../services/tiergesundheit";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId, kalenderdatum } from "../trpc";

/** Grundplatte je Käfigart (cm); eine Art ohne Angabe nimmt die Vorgabe. */
const PLATTEN_MASS = z
  .object(
    Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.object({ laenge: z.number().min(20).max(1000), tiefe: z.number().min(20).max(300) }).optional()])) as Record<
      (typeof KAEFIG_TYPEN)[number],
      z.ZodOptional<z.ZodObject<{ laenge: z.ZodNumber; tiefe: z.ZodNumber }>>
    >,
  )
  .strict();

/** Etagen einer Halle aus der Eingabe, sonst die gespeicherten; keine (nur eine Etage) = kein Feld. */
function etagenAus(eingabe: Partial<Record<string, number>> | undefined, gespeichert: { etagen?: Partial<Record<string, number>> } | null | undefined): { etagen?: Partial<Record<KaefigTyp, number>> } {
  const e = etagenNormal((eingabe ?? gespeichert?.etagen) as Partial<Record<KaefigTyp, number>> | undefined);
  return e ? { etagen: e } : { etagen: undefined };
}

/** Käfige übereinander je Käfigart (1 bis 4; fehlend = eine Etage). */
const ETAGEN = z.object(Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.number().int().min(1).max(ETAGEN_MAX).optional()])) as Record<(typeof KAEFIG_TYPEN)[number], z.ZodOptional<z.ZodNumber>>).strict();

/** Eingabe einer Halle (cm), wie sie gespeichert wird – auch für Stellvorschläge zu einer noch nicht gespeicherten Halle. */
/** Ein Käfigplatz im festen Plan: in einer Reihe (Lage im Reihensystem) oder in einem Käfigblock (Platz ab 0). */
const KAEFIG_PLATZ = z.discriminatedUnion("art", [
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
function mitGeprueftemUmriss(halle: Halle, masse: Parameters<typeof pruefeHallenUmriss>[1], vorher?: Halle | null): Halle {
  const f = pruefeHallenUmriss(halle, masse, vorher);
  if (f) throw fehler("BAD_REQUEST", f);
  return umrissEinheitlich(halle);
}

/** Grundriss einheitlich (normalisiert; ein Rechteck als keiner) – ohne die Prüfung der Flächen und Teile. */
function umrissEinheitlich(halle: Halle): Halle {
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

export const katalogRouter = router({
  /**
   * Käfigbedarf: je Käfiggröße die gemeldeten und bestätigten Tiere (ohne fehlende) und die Käfignummern (= Katalognummern)
   * der bestätigten. Dazu je Rasse die automatische und die geltende Größe – für Abweichungen (Regeln je Rasse).
   */
  kaefigbedarf: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const regeln = s.kaefigRegeln ?? [];
    const alle = (await ladeEintraege(s.id)).filter((e) => (e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt") && e.status !== "fehlt");
    const rasseVon = (e: (typeof alle)[number]) => e.rasse ?? e.einordnungRasse ?? null;
    // Je Tier: eigene Wahl vor Regel der Rasse vor Grundregel.
    const mitTyp = alle.map((e) => ({ e, typ: kaefigTyp({ art: e.art, sparte: e.sparte, rasse: rasseVon(e), wahl: e.kaefigWahl }, regeln) }));
    const typen = KAEFIG_TYPEN.map((typ) => {
      const hier = mitTyp.filter((x) => x.typ === typ);
      const bestaetigt = hier.filter((x) => x.e.meldungStatus === "bestaetigt");
      return { typ, label: kaefigName(typ, s.kaefigMasse), gemeldet: hier.length, bestaetigt: bestaetigt.length, nummern: nummernBereiche(bestaetigt.map((x) => x.e)) };
    });
    // Je Rasse (nur Einzeltiere – Stämme und Volieren haben ihren eigenen Käfig).
    const jeRasse = new Map<string, { rasse: string; sparte: string; anzahl: number; auto: KaefigTyp; typ: KaefigTyp; vorschlag: ReturnType<typeof kaefigVorschlag> }>();
    for (const { e } of mitTyp) {
      const rasse = rasseVon(e);
      if (e.art !== "einzeltier" || !rasse) continue;
      // Größe der Rasse ohne die Wahl einzelner Tiere (die zählen oben, ändern aber nicht die Regel der Rasse).
      const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse }, regeln)!;
      const auto = kaefigTyp({ art: e.art, sparte: e.sparte, rasse })!;
      const z = jeRasse.get(rasse) ?? { rasse, sparte: e.sparte ?? "", anzahl: 0, auto, typ, vorschlag: kaefigVorschlag(rasse, auto) };
      z.anzahl++;
      jeRasse.set(rasse, z);
    }
    return {
      typen,
      ohneKaefig: mitTyp.filter((x) => x.typ == null).length,
      rassen: [...jeRasse.values()].sort((a, b) => a.sparte.localeCompare(b.sparte, "de") || a.rasse.localeCompare(b.rasse, "de")),
      regeln,
      /** Eingetragene Maße (fehlende gelten nach Richtwert). */
      masse: s.kaefigMasse ?? {},
      /** Katalognummern nach Käfigblöcken? Dann verschiebt eine geänderte Größe erst beim Neu-Nummerieren die Nummern. */
      nachBloecken: !!s.kaefigFolge?.length,
      nummernVergeben: alle.some((e) => e.katalogNr != null),
      /** Tiere mit eigener Käfigwahl (z. B. Zwerghuhn im Großkäfig). */
      einzelwahl: alle.filter((e) => e.kaefigWahl).length,
      festgeschrieben: s.katalogGedruckt,
      /** Grundplatte und Käfige je Platte (aus der Halle; ohne Halle die Vorgabe). */
      platte: s.halle?.platte ?? GRUNDPLATTE_STANDARD,
      jePlatte: s.halle?.jePlatte ?? {},
      plattenMass: s.halle?.plattenMass ?? {},
      /** Etagen je Käfigart (fehlend = eine). */
      etagen: s.halle?.etagen ?? {},
      hatHalle: !!s.halle,
      /** Aufsteller unter den Grundplatten (Höhe in cm); ohne Angabe die Vorgabe. */
      aufsteller: s.aufsteller ?? AUFSTELLER_STANDARD,
    };
  }),

  /** Höhe der Aufsteller (cm), auf denen die Grundplatten stehen; null = wieder Vorgabe. Für die 3D-Ansicht. */
  aufstellerSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        aufsteller: z
          .object({
            hoehe: z.number().min(0).max(300),
            /** Sockelverkleidung: an/aus und Farbe; das Bild setzt `sockelBildSetzen` (bleibt hier erhalten). */
            verkleidung: z.object({ an: z.boolean(), farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict().optional(),
          })
          .strict()
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      await db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("update");
        const alt = aktuell?.aufsteller ?? null;
        // Ohne Angabe bleibt die gespeicherte Verkleidung; das Bild bleibt immer (eigener Weg).
        const bildId = alt?.verkleidung?.bildId ?? null;
        const verkleidung = input.aufsteller?.verkleidung ? { ...input.aufsteller.verkleidung, bildId } : alt?.verkleidung;
        const neu = input.aufsteller ? { hoehe: input.aufsteller.hoehe, ...(verkleidung ? { verkleidung } : {}) } : bildId != null ? { ...AUFSTELLER_STANDARD, verkleidung: { ...VERKLEIDUNG_STANDARD, bildId } } : null;
        if (stabilerText(alt) === stabilerText(neu)) return;
        await tx.update(schau).set({ aufsteller: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Aufsteller", alt, neu, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Bild für die Sockelverkleidung (z. B. die Plane eines Sponsors): wie die Katalogbilder geprüft (PNG oder JPEG, Größe,
   * Pixel), ersetzt ein vorheriges. Wird in 3D entlang der Reihen wiederholt. Nur Administratoren, mit Protokoll.
   */
  sockelBildSetzen: adminProcedure
    .input(z.object({ schauId: dbId, name: z.string().max(200), base64: z.string().max(Math.ceil((SOCKEL_BILD_MAX_BYTES * 4) / 3) + 8) }))
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const daten = Buffer.from(input.base64, "base64");
      if (daten.length > SOCKEL_BILD_MAX_BYTES) throw fehler("BAD_REQUEST", "Das Bild ist größer als 2 MB. Bitte verkleinern (z. B. 2000 Pixel breit).");
      const mime = bildTyp(daten);
      if (!mime) throw fehler("BAD_REQUEST", "Nur Bilder im Format JPEG oder PNG.");
      const m = bildMasse(daten);
      if (!m || !m.breite || !m.hoehe) throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen. Bitte als JPEG oder PNG neu speichern.");
      if (m.breite * m.hoehe > BILD_MAX_PIXEL) throw fehler("BAD_REQUEST", `Das Bild ist mit ${m.breite} × ${m.hoehe} Pixeln zu groß. Bitte verkleinern.`);
      if (m.entpacken && !pngLesbar(daten)) throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen (beschädigt oder unvollständig). Bitte neu speichern.");
      return db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("update");
        await tx.delete(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "sockel")));
        const [b] = await tx.insert(bild).values({ schauId: s.id, rolle: "sockel", mime, name: input.name, daten }).returning({ id: bild.id });
        const alt = aktuell?.aufsteller ?? null;
        const neu = { ...(alt ?? AUFSTELLER_STANDARD), verkleidung: { ...verkleidungVon(alt), bildId: b!.id } };
        await tx.update(schau).set({ aufsteller: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Sockelbild", alt: alt?.verkleidung?.bildId ?? null, neu: { bildId: b!.id, name: input.name, mime, breite: m.breite, hoehe: m.hoehe }, akteur: ctx });
        return { id: b!.id };
      });
    }),

  /** Bild der Sockelverkleidung entfernen (die Verkleidung bleibt in ihrer Farbe). */
  sockelBildEntfernen: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    await db.transaction(async (tx) => {
      const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("update");
      const alt = aktuell?.aufsteller ?? null;
      if (alt?.verkleidung?.bildId == null) return;
      await tx.delete(bild).where(and(eq(bild.schauId, s.id), eq(bild.rolle, "sockel")));
      await tx.update(schau).set({ aufsteller: { ...alt, verkleidung: { ...alt.verkleidung, bildId: null } } }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Sockelbild", alt: alt.verkleidung.bildId, neu: null, akteur: ctx });
    });
    return { ok: true };
  }),

  /**
   * Grundplatte (Länge × Tiefe in cm) und Käfige je Platte für einzelne Käfigarten (fehlend = automatisch aus Platte und
   * Käfigbreite). Steht in der Halle; ohne angelegte Halle wird sie mit der Vorgabe angelegt.
   */
  plattenSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        platte: z.object({ laenge: z.number().min(50).max(1000), tiefe: z.number().min(30).max(300) }),
        jePlatte: z.object(Object.fromEntries(KAEFIG_TYPEN.map((t) => [t, z.number().int().min(1).max(20).optional()])) as Record<(typeof KAEFIG_TYPEN)[number], z.ZodOptional<z.ZodNumber>>).strict(),
        /** Grundplatte je Käfigart (fehlend = Vorgabe: ab 70 cm die Platte oben, kleinere so groß wie ihre Käfige). */
        plattenMass: PLATTEN_MASS.default({}),
        /** Etagen je Käfigart; fehlt die Angabe, bleiben die gespeicherten. */
        etagen: ETAGEN.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ halle: schau.halle }).from(schau).where(eq(schau.id, s.id)).for("update");
        const alt = aktuell?.halle ?? null;
        // Ohne Halle keine Platten speichern: sonst entstünde unbemerkt eine Vorgabe-Halle, die niemand eingegeben hat.
        if (!alt) throw fehler("BAD_REQUEST", "Bitte zuerst unter „Hallenplan“ die Halle anlegen – die Grundplatten gehören zu ihr.");
        const jePlatte = Object.fromEntries(Object.entries(input.jePlatte).filter(([, n]) => n != null));
        const plattenMass = Object.fromEntries(Object.entries(input.plattenMass).filter(([, m]) => m != null));
        const etagen = input.etagen ? etagenNormal(input.etagen) : etagenNormal(alt.etagen);
        const { etagen: _e, ...ohneEtagen } = alt;
        const neu = { ...ohneEtagen, platte: input.platte, jePlatte, plattenMass, ...(etagen ? { etagen } : {}) };
        const vorher = { platte: alt?.platte ?? GRUNDPLATTE_STANDARD, jePlatte: alt?.jePlatte ?? {}, plattenMass: alt?.plattenMass ?? {}, etagen: etagenNormal(alt.etagen) ?? {} };
        const nachher = { platte: input.platte, jePlatte, plattenMass, etagen: etagen ?? {} };
        if (stabilerText(vorher) === stabilerText(nachher)) return;
        await tx.update(schau).set({ halle: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Grundplatten", alt: vorher, neu: nachher, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Abweichende Käfiggröße für eine Rasse festlegen (typ null = wieder automatisch). */
  kaefigRegelSetzen: adminProcedure
    .input(z.object({ schauId: dbId, rasse: z.string().trim().min(1).max(200), typ: z.enum(KAEFIG_TYPEN).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ kaefigRegeln: schau.kaefigRegeln }).from(schau).where(eq(schau.id, s.id)).for("update");
        const alt = aktuell?.kaefigRegeln ?? [];
        const gleich = (r: { rasse: string }) => r.rasse.trim().toLocaleLowerCase("de") === input.rasse.toLocaleLowerCase("de");
        const neu = [...alt.filter((r) => !gleich(r)), ...(input.typ ? [{ rasse: input.rasse, typ: input.typ }] : [])].slice(0, 500);
        await tx.update(schau).set({ kaefigRegeln: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Käfigregel", alt: alt.find(gleich) ?? null, neu: input.typ ? { rasse: input.rasse, typ: input.typ } : null, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Maße der eigenen Käfige je Käfigart (cm); null = wieder Richtwert. */
  kaefigMassSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        typ: z.enum(KAEFIG_TYPEN),
        mass: z.object({ breite: z.number().min(10).max(2000), tiefe: z.number().min(10).max(2000), hoehe: z.number().min(10).max(500) }).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ kaefigMasse: schau.kaefigMasse }).from(schau).where(eq(schau.id, s.id)).for("update");
        const alt = aktuell?.kaefigMasse ?? {};
        const neu = { ...alt };
        if (input.mass) neu[input.typ] = input.mass;
        else delete neu[input.typ];
        await tx.update(schau).set({ kaefigMasse: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Käfigmaß", alt: { [input.typ]: alt[input.typ] ?? null }, neu: { [input.typ]: input.mass }, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Hallenplan: alle gemeldeten Tiere (offen und bestätigt) mit Käfig in Katalogfolge (Käfignummern) auf die Reihen der Halle verteilt; dazu
   * die Preisrichter-Bereiche. Ohne angelegte Halle nur die Vorgaben. Keine Ausstellernamen – nur Rasse und Nummer.
   */
  hallenplan: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const { tiere, richter, sitzen, farben } = await planTiere(s);
    const halle = s.halle ?? null;
    const plan = halle ? planeHalle(halle, tiere, s.kaefigMasse, s.hallenplanFest) : null;
    return {
      halle,
      /** Für die 3D-Ansicht: Aufsteller und Farbenschlag je Tier (Gefiederfarbe der Figuren). */
      aufsteller: s.aufsteller ?? AUFSTELLER_STANDARD,
      farben,
      vorgabe: HALLE_STANDARD,
      plan,
      /** Fester Plan nach dem Umstellen: freie Plätze zwischen belegten, Nummern nicht in Planfolge (für den Hinweis). */
      unordnung: plan && halle && s.hallenplanFest ? planUnordnung(plan, halle.richtung ?? "quer", s.katalogGedruckt) : null,
      /** Schon Tiere eingeliefert: freie Plätze bleiben, wo sie sind (nur nummeriert wird noch nach dem Plan). */
      eingeliefert: sitzen,
      anzahl: tiere.length,
      ohneNummer: tiere.filter((t) => t.nr == null).length,
      masse: s.kaefigMasse ?? {},
      richter,
      /** Für „Nach Plan nummerieren“: festgeschriebene Katalognummern bleiben, dann nur die Käfigplätze. */
      katalogGedruckt: s.katalogGedruckt,
      katalogStart: s.katalogStart,
      abgeschlossen: s.phase === "abgeschlossen",
    };
  }),

  /**
   * Stellvorschläge: die Halle in anderen Aufstellungen (Richtung, Wandreihen, bündig, Hauptgang) durchgerechnet, mit
   * Eingängen, Flächen und eingesetzten Teilen. Übernommen wird ein Vorschlag mit `halleSetzen`.
   */
  stellVorschlaege: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (!s.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
    const { tiere } = await planTiere(s);
    // Stand, aus dem gerechnet wurde: „Übernehmen“ schickt ihn als `basis` – wurde die Halle inzwischen geändert, lehnt
    // `halleSetzen` ab, statt die Änderung mit einem veralteten Vorschlag zu überschreiben.
    return { ...stellVorschlaege(s.halle, tiere, s.kaefigMasse), basis: halleSchluessel(s.halle) };
  }),

  /**
   * Stellvorschläge für eine noch nicht gespeicherte Halle (geführter Ablauf „Halle einrichten“): nur Ausstellungsleitung,
   * als POST (ein Entwurf mit vielen Teilen sprengt sonst die Länge der Adresse), Hallen bis 20.000 m².
   */
  stellVorschlaegeEntwurf: adminProcedure.input(z.object({ schauId: dbId, entwurf: HALLE_EINGABE })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (input.entwurf.breite * input.entwurf.laenge > 20_000 * 10_000) throw fehler("BAD_REQUEST", "Die Halle ist zu groß (höchstens 20.000 m²).");
    const halle = umrissEinheitlich({ ...input.entwurf, plattenMass: input.entwurf.plattenMass ?? s.halle?.plattenMass ?? {}, ...etagenAus(input.entwurf.etagen, s.halle) });
    const { tiere } = await planTiere(s);
    return { ...stellVorschlaege(halle, tiere, s.kaefigMasse), basis: halleSchluessel(s.halle ?? null) };
  }),

  /**
   * Plan festschreiben: Die Lage jedes Käfigs wird gespeichert, die Automatik rechnet danach nicht mehr neu. Nachmeldungen
   * kommen in frei gewordene Plätze oder unter „noch zu stellen“. „Plan neu setzen“ (planLoesen) gibt den Plan wieder frei.
   */
  planFestschreiben: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Automatisch aus dem Editor: nur, solange der Plan nicht schon (anderswo) festgeschrieben ist. */
        nurWennLose: z.boolean().optional(),
        /** Grundplatten, wie der Editor sie zeigt (`plattenStand`) – weichen sie ab, wird nicht festgeschrieben. */
        plattenStand: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (!s.halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
    const { tiere } = await planTiere(s);
    return db.transaction(async (tx) => {
      // Halle frisch und gesperrt: ein gleichzeitiges Speichern der Halle darf nicht verloren gehen.
      const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
      if (input.nurWennLose && aktuell?.fest)
        throw fehler("CONFLICT", "Der Plan wurde inzwischen festgeschrieben – er wird neu geladen, bitte die Änderung noch einmal machen.");
      const halle = aktuell?.halle ?? s.halle!;
      // Aus dem frisch gerechneten Plan (auch wenn schon festgeschrieben war – nur über „Plan neu setzen“ bzw. ausdrücklich).
      const plan = planeHalle(halle, tiere, s.kaefigMasse);
      if (input.plattenStand && input.plattenStand !== plattenStand(plan))
        throw fehler("CONFLICT", "Der Plan hat sich inzwischen geändert (Nachmeldung oder Storno) – er wird neu geladen, bitte die Änderung noch einmal machen.");
      const fest = festschreiben(halle, plan, s.kaefigMasse, new Date().toISOString());
      // Entfernte leere Plätze gehörten zum vorigen festen Plan; der neue enthält nur, was jetzt gerechnet ist.
      const { entfernt, ...ohne } = halle;
      await tx.update(schau).set({ hallenplanFest: fest, ...(entfernt?.length ? { halle: ohne } : {}) }).where(eq(schau.id, s.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Hallenplan festgeschrieben", neu: { kaefige: plan.reihen.reduce((n, x) => n + x.kaefige.length, 0), nichtPlatziert: plan.nichtPlatziert.length }, akteur: ctx });
      return { am: fest.am };
    });
  }),

  /**
   * Plan neu setzen: die Software stellt alle Käfige neu (siehe `planNeuSetzenIn`). Mit `halle` zugleich neue Einstellungen
   * der Halle (Maße, Gänge, Richtung, Wandreihen …) – dann mit `basis` (Stand, auf dem die Änderung beruht).
   */
  planNeuSetzen: adminProcedure
    .input(z.object({ schauId: dbId, basis: z.string().max(100).optional(), halle: HALLE_EINGABE.optional(), grund: z.string().trim().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (input.halle && input.halle.breite * input.halle.laenge > 20_000 * 10_000) throw fehler("BAD_REQUEST", "Die Halle ist zu groß (höchstens 20.000 m²).");
      return planNeuSetzenIn(ctx, s, input);
    }),

  /** Früherer Name von „Plan neu setzen“ (ohne neue Einstellungen) – für ältere geöffnete Seiten. */
  planLoesen: adminProcedure.input(z.object({ schauId: dbId, grund: z.string().trim().max(500).default("") })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await planNeuSetzenIn(ctx, s, { grund: input.grund });
    return { ok: true };
  }),

  /**
   * Tier im festen Plan von Hand versetzen (Rückmeldung 15.11.2026): in einen freien Käfig gleicher Größe oder Tausch mit einem
   * Tier gleicher Größe (siehe `tierVersetzen` in der Domain). Nur im festen Plan; Katalognummern bleiben. `von` und
   * `erwartet`: wie der Editor den Plan zeigt – hat er sich inzwischen geändert, wird abgelehnt. Ist der Katalog gedruckt
   * oder eines der Tiere schon eingeliefert, kommt ohne `bestaetigt` nur die Rückfrage zurück (es ändert sich nichts).
   */
  tierVersetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        tierId: dbId,
        von: KAEFIG_PLATZ.nullable(),
        ziel: KAEFIG_PLATZ.nullable(),
        /** Tier, das der Editor auf dem Ziel zeigt (null = frei). */
        erwartet: dbId.nullable(),
        bestaetigt: z.boolean().default(false),
        /** Rückgängig bzw. Wiederholen im Editor (fürs Protokoll). */
        grund: z.string().trim().max(200).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const { tiere } = await planTiere(geladen);
      return db.transaction(async (tx) => {
        const [frisch] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest, gedruckt: schau.katalogGedruckt, phase: schau.phase }).from(schau).where(eq(schau.id, geladen.id)).for("update");
        // Phase frisch (gesperrt): eine eben abgeschlossene Schau wird nicht mehr geändert.
        pruefeNichtAbgeschlossen({ ...geladen, phase: frisch!.phase });
        const halle = frisch?.halle;
        if (!halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
        if (!frisch.fest) throw fehler("BAD_REQUEST", "Erst „Automatisch planen“ ausschalten – sonst stellt die Software die Käfige wieder nach der Katalogfolge.");
        const plan = planeHalle(halle, tiere, geladen.kaefigMasse, frisch.fest);
        if (plan.fest?.veraltet) throw fehler("BAD_REQUEST", "Der feste Plan passt nicht mehr zu Halle oder Käfigmaßen – erst „Plan neu setzen“.");
        const ziel = input.ziel as KaefigPlatz | null;
        const jetztDa = ziel ? (belegungImPlan(plan, ziel)?.tierId ?? null) : null;
        if (!gleicherPlatz(platzImPlan(plan, input.tierId), input.von as KaefigPlatz | null) || jetztDa !== input.erwartet)
          throw fehler("CONFLICT", "Der Plan hat sich inzwischen geändert – er wird neu geladen, bitte noch einmal.");
        const e = tierVersetzen(frisch.fest, plan, tiere, input.tierId, ziel);
        if (!e.ok) throw fehler("BAD_REQUEST", e.fehler);
        const nrVon = (id: number) => tiere.find((t) => t.id === id)?.nr ?? "ohne Nummer";
        if (!input.bestaetigt) {
          const ids = [input.tierId, ...(e.getauscht != null ? [e.getauscht] : [])];
          const sitzen = (await ladeEintraege(geladen.id, { ex: tx })).filter((x) => ids.includes(x.id) && ["eingeliefert", "fehlt", "ausgesetzt"].includes(x.status));
          if (sitzen.length)
            return { rueckfrage: `${sitzen.map((x) => `Nr. ${nrVon(x.id)}`).join(" und ")} ${sitzen.length === 1 ? "ist schon eingeliefert – das Tier muss" : "sind schon eingeliefert – die Tiere müssen"} in der Halle umgesetzt werden.` };
          if (frisch.gedruckt) return { rueckfrage: "Der Katalog ist gedruckt – Käfigplätze und Karten stimmen erst wieder nach „Käfigplätze nach Plan“." };
        }
        await tx.update(schau).set({ hallenplanFest: e.fest }).where(eq(schau.id, geladen.id));
        await protokolliere(tx, {
          schauId: geladen.id,
          tabelle: "katalogeintrag",
          datensatzId: input.tierId,
          aktion: e.getauscht != null ? "Tiere im Hallenplan getauscht" : "Tier im Hallenplan versetzt",
          alt: { nr: nrVon(input.tierId), platz: e.von },
          neu: { platz: ziel, ...(e.getauscht != null ? { getauscht: { id: e.getauscht, nr: nrVon(e.getauscht), platz: e.von } } : {}) },
          grund: input.grund,
          akteur: ctx,
        });
        // Beim Tausch auch beim anderen Tier ein Eintrag (Reklamationen suchen je Tier).
        if (e.getauscht != null)
          await protokolliere(tx, {
            schauId: geladen.id,
            tabelle: "katalogeintrag",
            datensatzId: e.getauscht,
            aktion: "Tiere im Hallenplan getauscht",
            alt: { nr: nrVon(e.getauscht), platz: ziel },
            neu: { platz: e.von, getauscht: { id: input.tierId, nr: nrVon(input.tierId), platz: ziel } },
            grund: input.grund,
            akteur: ctx,
          });
        return { rueckfrage: null, getauscht: e.getauscht, von: e.von };
      });
    }),

  /**
   * Angaben zu einem Käfig im Hallenplan (beim Klick): Tier, Züchter, Preisrichter, Status, Bewertung und Preise. Nur für
   * Ausstellungsleitung und Helfer – Preisrichter haben keinen Zugang zu Benutzer-Abfragen.
   */
  kaefigInfo: benutzerProcedure.input(z.object({ schauId: dbId, id: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [k] = await db
      .select({ meldungId: katalogeintrag.meldungId })
      .from(katalogeintrag)
      .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, s.id)));
    if (!k) throw fehler("NOT_FOUND", "Käfig nicht gefunden.");
    const e = (await ladeEintraege(s.id, { nurMeldungId: k.meldungId })).find((x) => x.id === input.id)!;
    const [einteilung, richter] = await Promise.all([
      db.select().from(prEinteilung).where(eq(prEinteilung.schauId, s.id)),
      db.select({ id: preisrichter.id, name: preisrichter.name }).from(preisrichter).where(eq(preisrichter.schauId, s.id)),
    ]);
    const name = (id: number | null | undefined) => richter.find((r) => r.id === id)?.name ?? null;
    const zugeteilt = e.katalogNr == null ? undefined : einteilung.find((x) => e.katalogNr! >= x.vonNr && e.katalogNr! <= x.bisNr);
    const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, wahl: e.kaefigWahl }, s.kaefigRegeln ?? []);
    return {
      id: e.id,
      nr: e.katalogNr == null ? null : formatKatalognummer(e),
      tier: e.bezeichnung,
      sparte: e.sparte ?? e.einordnungSparte ?? "",
      art: e.art,
      geschlecht: e.geschlecht,
      alter: e.alter,
      jugend: e.istJugend,
      ringnummern: e.ringnummern ?? "",
      status: e.status,
      meldungStatus: e.meldungStatus,
      kaefig: typ ? kaefigName(typ, s.kaefigMasse) : null,
      kaefigGewaehlt: !!e.kaefigWahl,
      zuechter: { name: e.ausstellerName, ort: e.ort ?? "", verein: e.verein ?? "", gesperrt: !!e.ausstellerGesperrt },
      meldungId: e.meldungId,
      preisrichter: name(zugeteilt?.preisrichterId),
      bewertung: e.bewertet ? bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skalaVon(s)) : null,
      bewertetVon: name(e.bewertetVon),
      preise: e.preise.map((p) => `${p.kuerzel} ${p.name}`),
      verkauft: e.verkaufBelegNr != null,
    };
  }),

  /** Halle für den Hallenplan festlegen (Maße in cm). */
  halleSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Stand, auf dem die Änderung beruht (halleSchluessel) – weicht er ab, hat inzwischen jemand anders gespeichert. */
        basis: z.string().max(100).optional(),
        halle: HALLE_EINGABE,
        /** Was der Editor getan hat (z. B. „Leeres entfernt“, „Rückgängig“) – für das Protokoll. */
        grund: z.string().trim().max(300).optional(),
        /** „Planung zurücksetzen“: eingesetzte Teile fallen weg, auch belegte (ihre Tiere stellt der neu gerechnete Plan). */
        zuruecksetzen: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [alt] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
        if (input.basis !== undefined && input.basis !== halleSchluessel(alt?.halle ?? null))
          throw fehler("CONFLICT", "Die Halle wurde inzwischen von jemand anderem geändert – der Plan wird neu geladen, bitte die Änderung noch einmal machen.");
        const { entfernt, ...rest } = input.halle;
        const halle: Halle = mitGeprueftemUmriss({ ...rest, plattenMass: input.halle.plattenMass ?? alt?.halle?.plattenMass ?? {}, ...etagenAus(rest.etagen, alt?.halle), ...(entfernt?.length ? { entfernt } : {}) }, s.kaefigMasse, alt?.halle ?? null);
        // Im festen Plan stehen die Platten fest – ein anderer Grundriss geht nur mit „Plan neu setzen“ (wie die Reihenrichtung).
        if (alt?.fest && alt.halle && stabilerText(halleNormal(alt.halle).umriss ?? null) !== stabilerText(halleNormal(halle).umriss ?? null))
          throw fehler("BAD_REQUEST", "Ein anderer Grundriss geht im festen Plan nur mit „Plan neu setzen“.");
        // Neu entfernte Platten und Plätze: nur leere im festen Plan (gerechnet mit den bisher entfernten). Wegfallende
        // Käfigblöcke und Volieren: nur leere (gerechnet mit der bisherigen Halle) – außer beim Zurücksetzen der Planung.
        const neuEntfernt = stabilerText(entfernt ?? []) !== stabilerText(alt?.halle?.entfernt ?? []);
        const teileWeg = !input.zuruecksetzen && (alt?.halle?.objekte ?? []).some((o) => !(halle.objekte ?? []).some((x) => x.id === o.id));
        if (neuEntfernt || teileWeg) {
          const { tiere } = await planTiere(s);
          if (neuEntfernt) {
            const plan = planeHalle({ ...halle, entfernt: alt?.halle?.entfernt }, tiere, s.kaefigMasse, alt?.fest);
            const meldung = pruefeEntfernt(alt?.halle?.entfernt, entfernt, alt?.fest, plan);
            if (meldung) throw fehler("BAD_REQUEST", meldung);
          }
          if (teileWeg && alt?.halle) {
            const meldung = pruefeTeileEntfernt(alt.halle, halle, planeHalle(alt.halle, tiere, s.kaefigMasse, alt.fest));
            if (meldung) throw fehler("BAD_REQUEST", meldung);
          }
        }
        await tx.update(schau).set({ halle }).where(eq(schau.id, s.id));
        // Nur die geänderten Teile ins (unveränderbare) Protokoll – der Editor speichert jede Verschiebung einzeln.
        const vorher = (alt?.halle ?? {}) as Record<string, unknown>;
        const nachher = halle as unknown as Record<string, unknown>;
        // Vergleich mit sortierten Schlüsseln: PostgreSQL ordnet die Schlüssel in jsonb neu.
        const geaendert = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].filter((k) => stabilerText(vorher[k]) !== stabilerText(nachher[k]));
        if (geaendert.length === 0) return;
        await protokolliere(tx, {
          schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Halle",
          alt: alt?.halle ? Object.fromEntries(geaendert.map((k) => [k, vorher[k] ?? null])) : null,
          neu: Object.fromEntries(geaendert.map((k) => [k, nachher[k] ?? null])),
          ...(input.grund ? { grund: input.grund } : {}),
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /**
   * Einzelreihe an einer Wand (die Ausstellungsleitung hat eine Reihe an die Wand gezogen): dort steht dann eine
   * Einzelreihe, die übrigen Reihen ordnen sich neu (Gänge, auch vor Eingängen, bleiben frei). Von Hand verschobene Reihen
   * bleiben, wo sie stehen; die gezogene Reihe fällt dabei weg (an ihrer Stelle steht die Einzelreihe). Ein fester Plan
   * wird dabei neu gesetzt – nur mit `neuSetzen` (Rückfrage in der Oberfläche).
   */
  wandreiheStellen: adminProcedure
    .input(z.object({ schauId: dbId, basis: z.string().max(100), reihe: z.number().int().min(1).max(500), seite: z.enum(["anfang", "ende"]), neuSetzen: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const { tiere } = await planTiere(s);
      return db.transaction(async (tx) => {
        const [aktuell] = await tx.select({ halle: schau.halle, fest: schau.hallenplanFest }).from(schau).where(eq(schau.id, s.id)).for("update");
        const halle = aktuell?.halle;
        if (!halle) throw fehler("BAD_REQUEST", "Erst die Halle anlegen.");
        if (input.basis !== halleSchluessel(halle)) throw fehler("CONFLICT", "Die Halle wurde inzwischen von jemand anderem geändert – der Plan wird neu geladen, bitte noch einmal.");
        if (aktuell.fest && !input.neuSetzen) throw fehler("BAD_REQUEST", "Der Plan ist festgeschrieben – erst bestätigen, dass er neu gesetzt wird.");
        const alt = planeHalle(halle, tiere, s.kaefigMasse, aktuell.fest);
        if (!alt.reihen.some((r) => r.nr === input.reihe)) throw fehler("BAD_REQUEST", "Diese Reihe gibt es nicht (mehr) – der Plan wird neu geladen.");
        // Neu gesetzt (siehe `neuSetzen`): Platten nach Nummer, entfernte leere Plätze und eingesetzte Teile gehören zur alten
        // Aufstellung; von Hand verschobene Reihen bleiben, wo sie stehen. Was nicht in die Reihen passt, bekommt Käfigblöcke.
        const basisNeu = mitWandreihe(halleZumNeuSetzen(halle), input.seite);
        const neuPlan = planeHalle(basisNeu, tiere, s.kaefigMasse);
        const reihenVersatz = reihenVersatzNachUmbau(alt, neuPlan, halle.reihenVersatz ?? [], input.reihe, halle);
        const neu = neuSetzen(basisNeu, tiere, s.kaefigMasse, { reihenVersatz }).halle;
        await tx.update(schau).set({ halle: neu, hallenplanFest: null }).where(eq(schau.id, s.id));
        await protokolliere(tx, {
          schauId: s.id,
          tabelle: "schau",
          datensatzId: s.id,
          aktion: "Einzelreihe an der Wand",
          alt: { reihe: input.reihe, wandreihen: halle.wandreihen, wandreiheSeite: halle.wandreiheSeite ?? null, reihenVersatz: halle.reihenVersatz ?? [], objekte: halle.objekte ?? [], ...(aktuell.fest ? { fest: aktuell.fest.am, plattenVersatz: halle.plattenVersatz ?? [] } : {}) },
          neu: { seite: input.seite, wandreihen: neu.wandreihen, wandreiheSeite: neu.wandreiheSeite ?? null, reihenVersatz, objekte: neu.objekte ?? [] },
          ...(aktuell.fest ? { grund: "Plan neu gesetzt" } : {}),
          akteur: ctx,
        });
        return { ok: true, neuGesetzt: !!aktuell.fest };
      });
    }),

  liste: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return ladeEintraege(input.schauId, { nurBestaetigt: true });
  }),

  /**
   * Vor dem Festschreiben: alle Nummern lückenlos neu.
   * Danach (Bewertungskarten sind gedruckt): nur Tiere ohne Nummer bekommen eine Unternummer (Nachmeldung), nichts verschiebt sich.
   */
  nummernVergeben: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    if (!s.stammdatenVersionId) throw fehler("BAD_REQUEST", "Bitte zuerst Stammdaten wählen.");
    const alle = await ladeEintraege(s.id, { nurBestaetigt: true });
    if (alle.length === 0) throw fehler("BAD_REQUEST", "Es gibt keine bestätigten Meldungen.");
    const opts = { start: s.katalogStart, jugendSeparat: s.jugendSeparat, staemmeVorn: s.staemmeVorn, kaefigFolge: s.kaefigFolge, sortierung: s.katalogSortierung };
    const folge = (e: Parameters<typeof alsFolge>[0]) => alsFolge(e, s.kaefigRegeln ?? []);

    return db.transaction(async (tx) => {
      // Gleichzeitig darf niemand die Preisrichter einteilen (die Bereiche hängen an diesen Nummern).
      await sperreEinteilung(tx, s.id);
      // Festgeschrieben oder nicht: unter Zeilensperre frisch lesen. Schreibt ein zweiter Admin gerade fest, wartet der
      // Aufruf und nummeriert danach nur nach (statt den festgeschriebenen Katalog neu zu nummerieren).
      const [{ gedruckt }] = (await tx.select({ gedruckt: schau.katalogGedruckt }).from(schau).where(eq(schau.id, s.id)).for("update")) as [{ gedruckt: boolean }];
      // Unter der Sperre frisch laden (eine Meldung kann inzwischen bestätigt worden sein).
      const alle = await ladeEintraege(s.id, { nurBestaetigt: true, ex: tx });
      let geaendert = 0;
      const verletzt: string[] = [];
      if (!gedruckt) {
        const gebunden = await bindungen(tx, alle.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Neu nummerieren geht nicht mehr – es gibt schon Bewertungen, Preise oder Verkäufe (z. B. ${gebunden[0]}). Bitte die Nummern festschreiben; neue Tiere bekommen dann Unternummern.`);
        const nummern = vergebeKatalognummern(alle.map(folge), opts);
        // Erst alle Nummern lösen, sonst kollidiert der eindeutige Index beim Umnummerieren.
        await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "" }).where(eq(katalogeintrag.schauId, s.id));
        for (const e of alle) {
          const k = nummern.get(e.id)!;
          await tx
            .update(katalogeintrag)
            .set({ katalogNr: k.nr, suffix: k.suffix, kaefig: String(k.nr), kaefigBlock: folge(e).kaefigTyp ?? null, status: e.status === "gemeldet" ? "katalogisiert" : e.status })
            .where(eq(katalogeintrag.id, e.id));
          geaendert++;
        }
      } else {
        // Nachmeldungen in Ausstellungsfolge nummerieren, damit sie untereinander richtig stehen. Belegt sind alle
        // Nummern der Schau – auch die einer Meldung, die wieder auf „offen“ steht (eindeutiger Index).
        // Vorhandene Nummern stehen im Block von damals (gespeichert), nicht nach einer später geänderten Regel.
        const nummeriert = (await ladeEintraege(s.id, { ex: tx }))
          .filter((e) => e.katalogNr != null)
          .map((e) => ({ ...folge(e), ...(e.kaefigBlock ? { kaefigTyp: e.kaefigBlock } : {}), nr: e.katalogNr!, suffix: e.suffix }));
        const neu = alle.filter((x) => x.katalogNr == null);
        const nummern = nachmeldungsNummern(neu.map(folge), nummeriert, opts);
        // Zählen die Käfige nach dem Hallenplan („Käfigplätze nach Plan“), bekommt eine Nachmeldung keine Käfignummer aus
        // ihrer Katalognummer (die gibt es dort für ein anderes Tier) – „Käfigplätze nach Plan“ vergibt ihr den Platz.
        const kaefigeNachPlan = (await ladeEintraege(s.id, { ex: tx })).some((e) => e.katalogNr != null && e.kaefig !== "" && e.kaefig !== `${e.katalogNr}${e.suffix}`);
        for (const e of neu) {
          const k = nummern.get(e.id)!;
          await tx
            .update(katalogeintrag)
            .set({ katalogNr: k.nr, suffix: k.suffix, kaefig: kaefigeNachPlan ? "" : `${k.nr}${k.suffix}`, kaefigBlock: folge(e).kaefigTyp ?? null, status: "katalogisiert" })
            .where(eq(katalogeintrag.id, e.id));
          if (k.reihenfolgeVerletzt) verletzt.push(`${k.nr}${k.suffix}`);
          geaendert++;
        }
      }
      // Einteilung nach Rassen: die Nummernbereiche der Preisrichter folgen den neuen Nummern.
      const einteilung = await rassenEinteilungAnwenden(tx, s.id, ctx);
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "katalogeintrag",
        datensatzId: null,
        aktion: gedruckt ? "Nachmeldungen nummeriert" : "Katalognummern vergeben",
        neu: { anzahl: geaendert, ...(verletzt.length ? { ausserhalbDerFolge: verletzt } : {}) },
        akteur: ctx,
      });
      return { geaendert, nachmeldungen: gedruckt, ausserhalbDerFolge: verletzt, ohnePreisrichter: einteilung?.ohne ?? null, einteilung };
    });
  }),

  /**
   * Nach dem Umstellen im Hallenplan: Nummern in der Reihenfolge, in der die Käfige jetzt im (festgeschriebenen) Plan stehen
   * (siehe `planFolge`). Vor dem Festschreiben der Katalognummern bekommen alle bestätigten Tiere neue Katalognummern ab dem
   * Katalogstart (Käfig = Katalognummer; Tiere ohne Platz danach in Katalogfolge) – nur solange nichts an den Nummern hängt.
   * Danach (Katalog gedruckt) bleiben die Katalognummern; vergeben werden nur die Käfigplätze 1, 2, 3 … (Tiere ohne Platz
   * ohne Käfignummer).
   */
  nummernNachPlan: adminProcedure.input(z.object({ schauId: dbId })).mutation(async ({ ctx, input }) => {
    const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
    return db.transaction(async (tx) => {
      // Halle, fester Plan und Druckstand frisch und gesperrt: ein gleichzeitiges Speichern der Halle oder Festschreiben der
      // Nummern wartet, statt mit einem älteren Stand nummeriert zu werden.
      const [frisch] = await tx
        .select({ halle: schau.halle, fest: schau.hallenplanFest, gedruckt: schau.katalogGedruckt, phase: schau.phase })
        .from(schau)
        .where(eq(schau.id, geladen.id))
        .for("update");
      const s = pruefeNichtAbgeschlossen({ ...geladen, phase: frisch!.phase, halle: frisch!.halle, hallenplanFest: frisch!.fest, katalogGedruckt: frisch!.gedruckt });
      if (!s.halle) throw fehler("BAD_REQUEST", "Erst unter „Hallenplan“ die Halle anlegen.");
      if (!s.hallenplanFest)
        throw fehler("BAD_REQUEST", "Erst den Plan festschreiben (im Halleneditor eine Reihe oder Platte verschieben) – sonst stellt die Software die Käfige nach den neuen Nummern wieder um.");
      // Gleichzeitig darf niemand die Preisrichter einteilen (die Bereiche hängen an den Nummern).
      await sperreEinteilung(tx, s.id);
      const { tiere } = await planTiere(s);
      let plan = planeHalle(s.halle, tiere, s.kaefigMasse, s.hallenplanFest);
      if (plan.fest?.veraltet) throw fehler("BAD_REQUEST", "Der feste Plan passt nicht mehr zu Halle oder Käfigmaßen – erst „Plan neu setzen“ und den Plan wieder festschreiben.");
      const richtung = s.halle.richtung ?? "quer";
      // Erst lückenlos auffüllen: je Käfiggröße rücken die Tiere in Planfolge in frei gewordene Plätze, die freien wandern ans
      // Ende. Nur solange noch kein Tier eingeliefert ist – danach sitzen sie in ihren Käfigen, dann wird nur nummeriert.
      let aufgerueckt = 0;
      let aufrueckenGesperrt = false;
      if (planUnordnung(plan, richtung).freiDazwischen > 0) {
        const sitzen = (await ladeEintraege(s.id, { ex: tx })).some((e) => (e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt") && ["eingeliefert", "fehlt", "ausgesetzt"].includes(e.status));
        if (sitzen) aufrueckenGesperrt = true;
        else {
          const { fest: neuFest, verschoben } = luekenlosAuffuellen(s.hallenplanFest, plan, richtung);
          if (verschoben) {
            await tx.update(schau).set({ hallenplanFest: neuFest }).where(eq(schau.id, s.id));
            plan = planeHalle(s.halle, tiere, s.kaefigMasse, neuFest);
            aufgerueckt = verschoben;
          }
        }
      }
      const folge = planFolge(plan, richtung);
      const opts = { start: s.katalogStart, jugendSeparat: s.jugendSeparat, staemmeVorn: s.staemmeVorn, kaefigFolge: s.kaefigFolge, sortierung: s.katalogSortierung };
      const regeln = s.kaefigRegeln ?? [];
      // Nummern: nur bestätigte Tiere (wie „Katalognummern vergeben“). Käfigplätze: jedes Tier, das im Plan einen Käfig
      // belegt – auch eine offene Meldung (wie im Plan).
      const alle = (await ladeEintraege(s.id, { ex: tx })).filter((e) => (s.katalogGedruckt ? e.meldungStatus === "offen" || e.meldungStatus === "bestaetigt" : e.meldungStatus === "bestaetigt"));
      const nachId = new Map(alle.map((e) => [e.id, e]));
      const imPlan = folge.filter((x) => nachId.has(x)).map((x) => nachId.get(x)!);
      const drin = new Set(imPlan.map((e) => e.id));
      // Ohne Platz: in bisheriger Folge (Nummer, sonst Katalogfolge).
      const ohnePlatz = alle
        .filter((e) => !drin.has(e.id))
        .sort((a, b) => (a.katalogNr ?? Infinity) - (b.katalogNr ?? Infinity) || vergleicheFolge(alsFolge(a, regeln), alsFolge(b, regeln), opts));
      const aenderungen: [number, string, string][] = [];
      if (!s.katalogGedruckt) {
        const gebunden = await bindungen(tx, alle.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Neu nummerieren geht nicht mehr – es gibt schon Bewertungen, Preise oder Verkäufe (z. B. ${gebunden[0]}). Bitte die Nummern festschreiben; dann folgen nur die Käfigplätze dem Plan.`);
        const reihe = [...imPlan, ...ohnePlatz];
        const neu = new Map(reihe.map((e, i) => [e.id, s.katalogStart + i]));
        for (const e of reihe) if (e.katalogNr !== neu.get(e.id) || e.suffix !== "" || e.kaefig !== String(neu.get(e.id))) aenderungen.push([e.id, `${e.katalogNr ?? "–"}${e.suffix}`, String(neu.get(e.id))]);
        if (aenderungen.length) {
          // Erst alle Nummern lösen, sonst kollidiert der eindeutige Index beim Umnummerieren.
          await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "" }).where(eq(katalogeintrag.schauId, s.id));
          for (const e of reihe) {
            const nr = neu.get(e.id)!;
            await tx
              .update(katalogeintrag)
              .set({ katalogNr: nr, suffix: "", kaefig: String(nr), kaefigBlock: alsFolge(e, regeln).kaefigTyp ?? null, status: e.status === "gemeldet" ? "katalogisiert" : e.status })
              .where(eq(katalogeintrag.id, e.id));
          }
        }
      } else {
        const platz = new Map(imPlan.map((e, i) => [e.id, String(i + 1)]));
        for (const e of [...imPlan, ...ohnePlatz]) {
          const k = platz.get(e.id) ?? "";
          if (e.kaefig === k) continue;
          aenderungen.push([e.id, e.kaefig || "–", k || "–"]);
          await tx.update(katalogeintrag).set({ kaefig: k }).where(eq(katalogeintrag.id, e.id));
        }
      }
      // Einteilung nach Rassen: die Nummernbereiche der Preisrichter folgen den neuen Nummern. Ist von Hand nach
      // Nummernbereichen eingeteilt (ohne Regeln nach Rassen), bleiben die Bereiche stehen – das sagt die Antwort.
      const einteilung = !s.katalogGedruckt && aenderungen.length ? await rassenEinteilungAnwenden(tx, s.id, ctx) : null;
      const einteilungVonHand =
        !s.katalogGedruckt && aenderungen.length > 0 && !einteilung && (await tx.select({ id: prEinteilung.id }).from(prEinteilung).where(eq(prEinteilung.schauId, s.id)).limit(1)).length > 0;
      await protokolliere(tx, {
        schauId: s.id,
        tabelle: "katalogeintrag",
        datensatzId: null,
        aktion: s.katalogGedruckt ? "Käfigplätze nach Hallenplan vergeben" : "Katalognummern nach Hallenplan vergeben",
        // Je geänderter Eintrag: [Id, vorher, nachher] – Grundlage für Rückfragen zu Karten und Käfigen.
        neu: { anzahl: aenderungen.length, ohnePlatz: ohnePlatz.length, aufgerueckt, ...(aufrueckenGesperrt ? { aufrueckenGesperrt } : {}), aenderungen, ...(einteilungVonHand ? { einteilungVonHand } : {}) },
        akteur: ctx,
      });
      return {
        modus: s.katalogGedruckt ? ("plaetze" as const) : ("nummern" as const),
        geaendert: aenderungen.length,
        ohnePlatz: ohnePlatz.length,
        ohnePreisrichter: einteilung?.ohne ?? null,
        einteilungVonHand,
        aufgerueckt,
        aufrueckenGesperrt,
      };
    });
  }),

  gedrucktSetzen: adminProcedure
    .input(z.object({ schauId: dbId, gedruckt: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      await db.transaction(async (tx) => {
        if (!input.gedruckt) {
          // Aufheben heißt: beim nächsten Vergeben verschieben sich alle Nummern. Das darf nur, solange nichts
          // an den Nummern hängt – sonst passen Bewertungskarten, Kaufbelege und Preisrichter-Einteilung nicht mehr.
          const ids = (await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.schauId, input.schauId))).map((x) => x.id);
          const gebunden = await bindungen(tx, ids);
          if (gebunden.length)
            throw fehler("BAD_REQUEST", `Die Festschreibung lässt sich nicht mehr aufheben – es gibt schon Bewertungen, Preise oder Verkäufe (${gebunden.length} Tiere, z. B. ${gebunden[0]}). Neue Tiere bekommen Unternummern.`);
        }
        await tx.update(schau).set({ katalogGedruckt: input.gedruckt }).where(eq(schau.id, input.schauId));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "schau",
          datensatzId: input.schauId,
          aktion: input.gedruckt ? "Katalognummern festgeschrieben" : "Festschreibung der Katalognummern aufgehoben",
          akteur: ctx,
        });
      });
      return { ok: true };
    }),

});

export const halleRouter = router({
  /** Ringnummer bei der Einlieferung nach der Ringkarte eintragen (Kennzeichnung für Kaufbeleg und Veterinärliste). */
  ringnummerSetzen: benutzerProcedure
    .input(z.object({ schauId: dbId, id: dbId, ringnummern: z.string().trim().max(200), grund: z.string().trim().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [alt] = await tx
          .select({ ringnummern: katalogeintrag.ringnummern })
          .from(katalogeintrag)
          .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, input.schauId)))
          .for("update");
        if (!alt) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if ((alt.ringnummern ?? "") === input.ringnummern) return;
        // Wie beim Status: Nach Freigabe, Verkauf oder Abschluss stehen Ringnummern auf Belegen und der Liste für das
        // Veterinäramt – dann nur noch die Ausstellungsleitung mit Grund.
        const [verkauft] = await tx.select({ id: verkauf.id }).from(verkauf).where(and(eq(verkauf.katalogeintragId, input.id), isNull(verkauf.storniertAm))).limit(1);
        const fest = s.ergebnisseFreigegeben || s.phase === "abgeschlossen" || !!verkauft;
        if (fest && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nach Freigabe, Verkauf oder Abschluss ändert nur die Ausstellungsleitung die Ringnummer (mit Grund).");
        if (fest && input.grund.length < 3) throw fehler("BAD_REQUEST", "Bitte einen Grund für die Änderung der Ringnummer angeben.");
        await tx.update(katalogeintrag).set({ ringnummern: input.ringnummern }).where(eq(katalogeintrag.id, input.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "katalogeintrag", datensatzId: input.id, aktion: "Ringnummer", alt: alt.ringnummern, neu: input.ringnummern, grund: input.grund || undefined, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Andere Käfiggröße für ein einzelnes Tier, z. B. das Zwerghuhn in den letzten freien Großkäfig. null = wieder
   * automatisch (Regel der Rasse bzw. Sparte). Helfer dürfen das, weil sie die Tiere bei der Einlieferung einsetzen.
   */
  kaefigSetzen: benutzerProcedure
    .input(z.object({ schauId: dbId, id: dbId, typ: z.enum(KAEFIG_TYPEN).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (s.phase === "abgeschlossen") throw fehler("PRECONDITION_FAILED", "Die Schau ist abgeschlossen.");
      await db.transaction(async (tx) => {
        const [alt] = await tx
          .select({ art: katalogeintrag.art, kaefigWahl: katalogeintrag.kaefigWahl })
          .from(katalogeintrag)
          .where(and(eq(katalogeintrag.id, input.id), eq(katalogeintrag.schauId, input.schauId)))
          .for("update");
        if (!alt) throw fehler("NOT_FOUND", "Tier nicht gefunden.");
        if (alt.art === "bruteier") throw fehler("BAD_REQUEST", "Bruteier brauchen keinen Käfig.");
        if ((alt.kaefigWahl ?? null) === input.typ) return;
        await tx.update(katalogeintrag).set({ kaefigWahl: input.typ }).where(eq(katalogeintrag.id, input.id));
        await protokolliere(tx, {
          schauId: input.schauId, tabelle: "katalogeintrag", datensatzId: input.id, aktion: "Käfig je Tier",
          alt: alt.kaefigWahl ? kaefigName(alt.kaefigWahl, s.kaefigMasse) : "automatisch", neu: input.typ ? kaefigName(input.typ, s.kaefigMasse) : "automatisch", akteur: ctx,
        });
      });
      return { ok: true };
    }),

  /** Einlieferung: Aussteller mit ihren Tieren, gesucht nach Name oder Katalognummer. */
  suche: benutzerProcedure.input(z.object({ schauId: dbId, q: z.string().max(200) })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const alle = await ladeEintraege(input.schauId, { nurBestaetigt: true });
    const q = input.q.trim().toLowerCase();
    const nr = Number.parseInt(q, 10);
    const treffer = q
      ? alle.filter((e) => (Number.isFinite(nr) ? e.katalogNr === nr : e.ausstellerName.toLowerCase().includes(q)))
      : alle;
    const meldungIds = [...new Set(treffer.map((e) => e.meldungId))].slice(0, 30);
    const meldungen = meldungIds.length ? await db.select().from(meldung).where(inArray(meldung.id, meldungIds)) : [];
    // Meldegeld aller Treffer mit wenigen Abfragen (nicht je Meldung einzeln).
    const betraege = await meldebetraege(db, s.id, meldungen);
    return Promise.all(
      meldungIds.map(async (id) => {
        // Käfiggröße je Tier (nach den Regeln der Schau), damit die Halle gleich weiß, wohin es kommt.
        const tiere = alle
          .filter((e) => e.meldungId === id)
          .map((e) => {
            const typ = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse, wahl: e.kaefigWahl }, s.kaefigRegeln ?? []);
            const auto = kaefigTyp({ art: e.art, sparte: e.sparte, rasse: e.rasse ?? e.einordnungRasse }, s.kaefigRegeln ?? []);
            return { ...e, kaefigGroesse: typ ? kaefigName(typ, s.kaefigMasse) : null, kaefigTyp: typ, kaefigAuto: auto };
          });
        const m = meldungen.find((x) => x.id === id)!;
        // Viele Vereine kassieren das Meldegeld bei der Einlieferung: offener Betrag (mit zugesagter Stiftung und Spende) gleich hier.
        const b = betraege.get(id)!;
        const geld = { summeCent: b.summeCent, stiftungCent: b.stiftungCent, spendeCent: b.spendeCent, bezahltCent: b.bezahltCent, offenCent: gefordertCent(b) - b.bezahltCent };
        return { meldung: m, name: tiere[0]!.ausstellerName, ort: tiere[0]!.ort, tiere, geld, nachweise: nachweisStand(m, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer) };
      }),
    );
  }),

  statusSetzen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        ids: z.array(dbId).min(1),
        status: z.enum(["katalogisiert", "eingeliefert", "fehlt", "ausgesetzt"]),
        /**
         * Grund für eine bewusste Ausnahme (steht im Protokoll): Einlieferung ohne geprüften Nachweis, Ausgabe eines
         * gesperrten Tiers, Statusänderung nach der Freigabe.
         */
        uebersteuern: z.string().trim().max(500).default(""),
        /** Ausgabe eines verkauften Tiers nur gegen Kaufbeleg: dessen Nummer. */
        belegNr: z.number().int().positive().max(1_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const betroffen = await ladeEintraege(input.schauId);
      const ziel = betroffen.filter((e) => input.ids.includes(e.id));
      const nr = (e: (typeof ziel)[number]) => `${e.katalogNr ?? "?"}${e.suffix}`;
      const grund = input.uebersteuern;
      const ausnahmen: string[] = [];
      // Nach der Freigabe stehen die Ergebnisse fest: Ausgabe und Zurücknehmen der Ausgabe gehen weiter,
      // alles andere (fehlt, nicht eingeliefert) nur durch die Ausstellungsleitung mit Grund.
      // Ein bewertetes Tier war in der Halle, auch wenn die Einlieferung (Nachweis offen) nicht abgehakt ist.
      const nurAusgabe = (e: (typeof ziel)[number]) =>
        (input.status === "ausgesetzt" && (e.status === "eingeliefert" || (e.status === "katalogisiert" && e.bewertet))) ||
        (input.status === "eingeliefert" && e.status === "ausgesetzt");
      if (s.ergebnisseFreigegeben && ziel.some((e) => !nurAusgabe(e) && e.status !== input.status)) {
        if (ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Nach der Freigabe der Ergebnisse ändert nur die Ausstellungsleitung den Status (Ausgabe ausgenommen).");
        if (grund.length < 3) throw fehler("PRECONDITION_FAILED", "Die Ergebnisse sind freigegeben. Statusänderung nur mit Grund.");
        ausnahmen.push("nach der Freigabe");
      }
      if (input.status === "fehlt" || input.status === "katalogisiert") {
        // Ein bewertetes, prämiertes oder verkauftes Tier war da – „fehlt“ würde Ergebnis und Kontingent verfälschen.
        const gebunden = await bindungen(db, ziel.map((e) => e.id));
        if (gebunden.length) throw fehler("BAD_REQUEST", `Geht nicht: ${gebunden.join("; ")}.`);
      }
      if (input.status === "ausgesetzt") {
        const verkauft = ziel.filter((e) => e.verkaufBelegNr != null && e.status !== "ausgesetzt");
        if (verkauft.length > 1) throw fehler("BAD_REQUEST", "Verkaufte Tiere bitte einzeln gegen Kaufbeleg ausgeben.");
        const v = verkauft[0];
        if (v && input.belegNr !== v.verkaufBelegNr)
          throw fehler("BAD_REQUEST", input.belegNr == null ? `Nr. ${nr(v)} ist verkauft – Ausgabe nur gegen Kaufbeleg.` : `Der Kaufbeleg ${input.belegNr} gehört nicht zu Nr. ${nr(v)}.`);
        if (v) ausnahmen.push(`gegen Kaufbeleg ${v.verkaufBelegNr}`);
        if (v) {
          // Per Überweisung verkauft: erst nach gebuchtem Zahlungseingang hinaus (sonst wäre das Tier weg und das Geld nicht da).
          const [vk] = await db
            .select({ zahlart: verkauf.zahlart, eingang: verkaufZahlungseingang.id })
            .from(verkauf)
            .leftJoin(verkaufZahlungseingang, eq(verkaufZahlungseingang.verkaufId, verkauf.id))
            .where(and(eq(verkauf.katalogeintragId, v.id), isNull(verkauf.storniertAm)));
          if (vk?.zahlart === "ueberweisung" && vk.eingang == null) {
            if (ctx.benutzer.rolle !== "admin" || grund.length < 3)
              throw fehler("PRECONDITION_FAILED", `Nr. ${nr(v)} ist per Überweisung verkauft – der Zahlungseingang ist noch nicht gebucht (Kasse › Verkauf). Ausgabe vorher nur durch die Ausstellungsleitung mit Grund.`);
            ausnahmen.push("Überweisung noch nicht eingegangen");
          }
        }
        const gesperrt = ziel.filter((e) => e.gesperrt && e.status !== "ausgesetzt");
        if (gesperrt.length) {
          if (grund.length < 3)
            throw fehler("PRECONDITION_FAILED", `Gesperrt (Gesundheitsjournal): Nr. ${gesperrt.map(nr).join(", ")}. Ausgabe nur mit Grund, z. B. Anordnung des Tierarztes.`);
          ausnahmen.push(`gesperrt: ${gesperrt.map(nr).join(", ")}`);
        }
      }
      // Impfpflichtige Tiere kommen nur mit geprüftem Nachweis in die Halle (§ 7 GeflPestSchV, Sonderbestimmungen).
      let ohneNachweis: string[] = [];
      // Nur Tiere, die neu in die Halle kommen – das Zurücknehmen einer Ausgabe prüft nicht noch einmal.
      const neuInDerHalle = ziel.filter((e) => e.status !== "eingeliefert" && e.status !== "ausgesetzt");
      if (input.status === "eingeliefert" && neuInDerHalle.length) {
        const ids = [...new Set(neuInDerHalle.map((e) => e.meldungId))];
        const meldungen = ids.length ? await db.select().from(meldung).where(inArray(meldung.id, ids)) : [];
        ohneNachweis = meldungen.flatMap((m) => {
          const tiere = betroffen.filter((e) => e.meldungId === m.id);
          const n = nachweisStand(m, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer);
          return n.noetig.length && !n.geprueft ? [`${tiere[0]!.ausstellerName} (${n.noetig.map((x) => x.toUpperCase()).join(", ")})`] : [];
        });
        if (ohneNachweis.length && input.uebersteuern.length < 3) {
          throw fehler("PRECONDITION_FAILED", `Nachweis nicht geprüft: ${ohneNachweis.join("; ")}. Erst den Nachweis prüfen oder mit Grund ohne Nachweis einliefern.`);
        }
      }
      await db.transaction(async (tx) => {
        // Erst die Kasse, dann die Tiere sperren (dieselbe Reihenfolge wie Verkauf, Preisvergabe und Meldung – sonst
        // könnten sie sich gegenseitig blockieren), und die Bindungen hier noch einmal prüfen: sonst käme eine
        // gleichzeitige Tablet-Note, Preisvergabe oder ein Verkauf zwischen Prüfung und Speichern dazwischen
        // (bewertetes Tier mit „fehlt“, verkauftes Tier ohne Beleg ausgegeben).
        const ids = ziel.map((e) => e.id);
        await sperreKasse(tx, input.schauId);
        if (ids.length) await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(inArray(katalogeintrag.id, ids)).orderBy(asc(katalogeintrag.id)).for("update");
        if (input.status === "fehlt" || input.status === "katalogisiert") {
          const gebunden = await bindungen(tx, ids);
          if (gebunden.length) throw fehler("CONFLICT", `Inzwischen geändert – geht nicht: ${gebunden.join("; ")}.`);
        }
        if (input.status === "ausgesetzt" && ids.length) {
          const jetzt = await tx.select({ id: verkauf.katalogeintragId, belegNr: verkauf.belegNr }).from(verkauf).where(and(inArray(verkauf.katalogeintragId, ids), isNull(verkauf.storniertAm)));
          const neuVerkauft = jetzt.filter((v) => {
            const e = ziel.find((x) => x.id === v.id);
            return e && e.status !== "ausgesetzt" && e.verkaufBelegNr !== v.belegNr;
          });
          if (neuVerkauft.length) throw fehler("CONFLICT", "Ein Tier wurde inzwischen verkauft – bitte neu laden und gegen Kaufbeleg ausgeben.");
        }
        await tx
          .update(katalogeintrag)
          .set({ status: input.status })
          .where(and(eq(katalogeintrag.schauId, input.schauId), inArray(katalogeintrag.id, ids)));
        await protokolliere(tx, {
          schauId: input.schauId,
          tabelle: "katalogeintrag",
          datensatzId: null,
          aktion: [`Status ${input.status}`, ohneNachweis.length ? "ohne geprüften Nachweis" : "", ...ausnahmen].filter(Boolean).join(", "),
          neu: ziel.map(nr),
          grund: ohneNachweis.length || ausnahmen.length ? grund : "",
          akteur: ctx,
        });
      });
      return { ok: true, anzahl: ziel.length };
    }),

  /**
   * Nachweise bei der Einlieferung: ND-Impfung (Hühner, Puten), PMV-Impfung (Tauben), Untersuchung Wassergeflügel.
   * Die Oberfläche speichert beim Verlassen jedes Feldes und beim Haken; „geprüft“ geht nur, wenn alle nötigen
   * Nachweise vollständig und in der Frist sind.
   */
  vetSetzen: benutzerProcedure
    .input(
      z.object({
        meldungId: dbId,
        nd: z.object({ datum: kalenderdatum().nullable(), impfstoff: z.string().max(200), tierarzt: z.string().max(200) }),
        pmv: z.object({ datum: kalenderdatum().nullable(), impfstoff: z.string().max(200), tierarzt: z.string().max(200) }),
        wg: z.object({ datum: kalenderdatum().nullable(), sentinel: z.boolean(), stelle: z.string().max(200) }),
        /** Klinische Untersuchung (Bescheinigung) und Gesundheitszertifikat – fehlen sie, bleibt der Stand. */
        kl: z.object({ datum: kalenderdatum().nullable(), tierarzt: z.string().max(200) }).optional(),
        gz: z.object({ datum: kalenderdatum().nullable(), nummer: z.string().max(200) }).optional(),
        geprueft: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [m] = await db.select().from(meldung).where(eq(meldung.id, input.meldungId));
      if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
      // Der Impfnachweis ist eine tierseuchenrechtliche Aufzeichnung: nach dem Abschluss nur noch lesen.
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, m.schauId));
      const werte = {
        vetImpfdatum: input.nd.datum,
        vetImpfstoff: input.nd.impfstoff.trim(),
        vetTierarzt: input.nd.tierarzt.trim(),
        pmvImpfdatum: input.pmv.datum,
        pmvImpfstoff: input.pmv.impfstoff.trim(),
        pmvTierarzt: input.pmv.tierarzt.trim(),
        wgDatum: input.wg.datum,
        wgSentinel: input.wg.sentinel,
        wgStelle: input.wg.stelle.trim(),
        ...(input.kl ? { klDatum: input.kl.datum, klTierarzt: input.kl.tierarzt.trim() } : {}),
        ...(input.gz ? { gzDatum: input.gz.datum, gzNummer: input.gz.nummer.trim() } : {}),
      };
      const alt = {
        vetImpfdatum: m.vetImpfdatum,
        vetImpfstoff: m.vetImpfstoff,
        vetTierarzt: m.vetTierarzt,
        pmvImpfdatum: m.pmvImpfdatum,
        pmvImpfstoff: m.pmvImpfstoff,
        pmvTierarzt: m.pmvTierarzt,
        wgDatum: m.wgDatum,
        wgSentinel: m.wgSentinel,
        wgStelle: m.wgStelle,
        ...(input.kl ? { klDatum: m.klDatum, klTierarzt: m.klTierarzt } : {}),
        ...(input.gz ? { gzDatum: m.gzDatum, gzNummer: m.gzNummer } : {}),
        geprueft: !!m.vetGeprueftAm,
      };
      const neu = { ...werte, geprueft: input.geprueft };
      // Unverändert (z. B. Feld ohne Änderung verlassen): nichts schreiben, nichts protokollieren.
      if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
      if (input.geprueft) {
        const tiere = await ladeEintraege(m.schauId, { nurMeldungId: m.id });
        const n = nachweisStand({ ...m, ...werte }, tiere.map((t) => t.tierart), s, tiere[0]?.registriernummer);
        if (n.fehler.length) throw fehler("BAD_REQUEST", `Nachweis nicht vollständig: ${n.fehler.join(" ")}`);
      }
      await db.transaction(async (tx) => {
        await tx
          .update(meldung)
          .set({ ...werte, vetGeprueftAm: input.geprueft ? (m.vetGeprueftAm ?? new Date()) : null })
          .where(eq(meldung.id, m.id));
        await protokolliere(tx, { schauId: m.schauId, tabelle: "meldung", datensatzId: m.id, aktion: "Impfnachweis", alt, neu, akteur: ctx });
      });
      return { ok: true, geaendert: true };
    }),

  /** Gesundheitsjournal (Art. 25 DelVO (EU) 2019/2035): Krankheit, Verdacht, Todesfall, Maßnahme. */
  gesundheit: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [eintraege, liste] = await Promise.all([
      ladeEintraege(input.schauId),
      db.select().from(gesundheit).where(eq(gesundheit.schauId, input.schauId)).orderBy(gesundheit.zeitpunkt),
    ]);
    return liste.map((g) => {
      const e = eintraege.find((x) => x.id === g.katalogeintragId);
      return { ...g, tier: e ? { katalogNr: e.katalogNr, suffix: e.suffix, bezeichnung: e.bezeichnung, geschlecht: e.geschlecht, alter: e.alter, aussteller: e.ausstellerName } : null, tierText: e ? "" : g.tierText };
    });
  }),

  gesundheitErfassen: benutzerProcedure
    .input(
      z.object({
        schauId: dbId,
        /** Katalognummer wie auf der Käfigkarte („12“, „100a“); leer für Beobachtungen ohne einzelnes Tier. */
        nr: z.string().trim().max(20).default(""),
        befund: z.string().trim().min(3, "Befund fehlt.").max(1000),
        massnahme: z.string().trim().max(1000).default(""),
        tierarzt: z.string().trim().max(200).default(""),
        verendet: z.boolean().default(false),
        sperre: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      let katalogeintragId: number | null = null;
      let tierText = "";
      if (input.nr) {
        const m = input.nr.match(/^(\d+)([a-z]*)$/i);
        const e = m ? (await ladeEintraege(input.schauId)).find((x) => x.katalogNr === Number(m[1]) && x.suffix === (m[2] ?? "").toLowerCase()) : undefined;
        if (!e) throw fehler("NOT_FOUND", `Katalognummer ${input.nr} nicht gefunden.`);
        katalogeintragId = e.id;
        // Als Text festhalten: das Journal muss das Tier auch nach Storno oder Löschung der Meldung nennen.
        tierText = `${formatKatalognummer(e)} ${e.bezeichnung}, ${e.geschlecht} ${e.alter} (${e.ausstellerName})`;
      }
      // Ein verendetes Tier ist immer gesperrt (kein Verkauf, kein Preis) – das lässt sich nicht aufheben.
      const { nr: _nr, ...eingabe } = input;
      const werte = { ...eingabe, sperre: eingabe.sperre || eingabe.verendet };
      await db.transaction(async (tx) => {
        const [g] = await tx.insert(gesundheit).values({ ...werte, katalogeintragId, tierText, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: input.schauId, tabelle: "gesundheit", datensatzId: g!.id, aktion: "erfasst", neu: { ...werte, nr: input.nr }, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Sperre aufheben (z. B. Tierarzt gibt Entwarnung) – nur die Ausstellungsleitung; der Eintrag bleibt im Journal. */
  gesundheitFreigeben: adminProcedure
    .input(z.object({ schauId: dbId, id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db.transaction(async (tx) => {
        const [g] = await tx.select().from(gesundheit).where(and(eq(gesundheit.id, input.id), eq(gesundheit.schauId, input.schauId)));
        if (!g) throw fehler("NOT_FOUND", "Eintrag nicht gefunden.");
        if (g.verendet) throw fehler("BAD_REQUEST", "Ein verendetes Tier bleibt gesperrt.");
        await tx.update(gesundheit).set({ sperre: false, aufgehobenAm: new Date(), aufhebungGrund: input.grund }).where(eq(gesundheit.id, g.id));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "gesundheit", datensatzId: g.id, aktion: "Sperre aufgehoben", grund: input.grund, akteur: ctx });
      });
      return { ok: true };
    }),
});

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
  // Schon eingeliefert (Tiere sitzen in ihren Käfigen): dann rückt „Nach Plan nummerieren“ nichts mehr um.
  const sitzen = alle.some((e) => ["eingeliefert", "fehlt", "ausgesetzt"].includes(e.status));
  return { tiere, richter, sitzen, farben };
}
