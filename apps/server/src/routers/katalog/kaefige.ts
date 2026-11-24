/** Käfige und Grundplatten: Käfigbedarf, Aufsteller und Sockelbild, Grundplatten, Käfigregeln und -maße. */
import { AUFSTELLER_STANDARD, VERKLEIDUNG_STANDARD, verkleidungVon, etagenNormal, stabilerText, GRUNDPLATTE_STANDARD, KAEFIG_TYPEN, kaefigName, kaefigTyp, kaefigVorschlag, nummernBereiche, type KaefigTyp } from "@schau/domain";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { BILD_MAX_PIXEL, bildMasse, bildTyp, pngLesbar } from "../katalog-gestaltung";
import { bild, schau } from "../../db/schema";
import { ladeEintraege } from "../../services/eintraege";
import { pruefeNichtAbgeschlossen } from "../../services/kasse";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, dbId } from "../../trpc";
import { PLATTEN_MASS, ETAGEN } from "./gemeinsam";

/** Sockelbild höchstens 2 MB – in 3D wird es ohnehin auf 512 px verkleinert. */
const SOCKEL_BILD_MAX_BYTES = 2 * 1024 * 1024;

export const katalogKaefige = {
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
        const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("no key update");
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
        const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("no key update");
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
      const [aktuell] = await tx.select({ aufsteller: schau.aufsteller }).from(schau).where(eq(schau.id, s.id)).for("no key update");
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
        const [aktuell] = await tx.select({ halle: schau.halle }).from(schau).where(eq(schau.id, s.id)).for("no key update");
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
        const [aktuell] = await tx.select({ kaefigRegeln: schau.kaefigRegeln }).from(schau).where(eq(schau.id, s.id)).for("no key update");
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
        const [aktuell] = await tx.select({ kaefigMasse: schau.kaefigMasse }).from(schau).where(eq(schau.id, s.id)).for("no key update");
        const alt = aktuell?.kaefigMasse ?? {};
        const neu = { ...alt };
        if (input.mass) neu[input.typ] = input.mass;
        else delete neu[input.typ];
        await tx.update(schau).set({ kaefigMasse: neu }).where(eq(schau.id, s.id));
        await protokolliere(tx, { schauId: s.id, tabelle: "schau", datensatzId: s.id, aktion: "Käfigmaß", alt: { [input.typ]: alt[input.typ] ?? null }, neu: { [input.typ]: input.mass }, akteur: ctx });
      });
      return { ok: true };
    }),
};
