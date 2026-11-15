import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { inflateSync } from "node:zlib";
import { KATALOG_AUFTEILUNGEN, KATALOG_FUSSZEILEN, KATALOG_GESTALTUNG_VORGABE, KATALOG_LINIEN, KATALOG_SCHRIFTEN, KATALOG_STILE, KATALOG_TEILE, KATALOG_TITELBILDER, KATALOG_TITELHINTERGRUENDE, pruefeLizenz, type KatalogTeil } from "@schau/domain";
import { z } from "zod";
import { db } from "../db/client";
import { ANZEIGE_GROESSEN, BEITRAG_ARTEN, bild, katalogBeitrag, katalogGestaltung, KATALOG_FORMATE } from "../db/schema";
import { oeffentlichSichtbarProcedure, benutzerProcedure, fehler, ladeSchau, router, dbId } from "../trpc";

/** Größte Bilddatei. Fotos aus dem Handy sind meist 2–4 MB; mehr macht nur das PDF schwer. */
export const BILD_MAX_BYTES = 5 * 1024 * 1024;
/** Logo: klein halten, es wird in jeden Kaufbeleg und jede Quittung eingebettet. */
export const LOGO_MAX_BYTES = 600 * 1024;

const STANDARD = { format: "A4" as const, untertitel: "", schirmherr: "", ausstellungsleitung: "", eintritt: "", farbe: "#2f5d3a", schrift: "klassisch" as const, stil: "klassisch" as const, aufteilung: "zweispaltig" as const, rassebilder: true, sparteNeueSeite: false, ausgeblendet: [] as KatalogTeil[], druck: "", termineKreis: "", termineLand: "", ...KATALOG_GESTALTUNG_VORGABE };

/** Gestaltung einer Schau, mit Standardwerten, solange nichts gespeichert ist. */
export async function ladeGestaltung(schauId: number) {
  const [g] = await db.select().from(katalogGestaltung).where(eq(katalogGestaltung.schauId, schauId));
  return g ?? { schauId, ...STANDARD };
}

/** Erkennt PNG und JPEG am Dateianfang – die Endung oder Angabe des Browsers zählt nicht. */
export function bildTyp(b: Buffer): "image/png" | "image/jpeg" | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Abmessungen aus dem Dateikopf. `entpacken`: pdfkit muss das PNG beim Einbetten vollständig entpacken (Alphakanal,
 * Transparenz-Tabelle oder Zeilensprung) – das kostet je Bild ein Vielfaches von Breite × Höhe × 4 Byte Speicher.
 * JPEG und einfache PNG bettet es ohne Entpacken ein.
 */
export function bildMasse(b: Buffer): { breite: number; hoehe: number; entpacken: boolean } | null {
  const typ = bildTyp(b);
  if (typ === "image/png" && b.length >= 33 && b.toString("latin1", 12, 16) === "IHDR") {
    const farbtyp = b[25]!;
    let entpacken = farbtyp === 4 || farbtyp === 6 || b[28] === 1;
    // Chunks bis zu den Bilddaten nach einer Transparenz-Tabelle durchsuchen.
    for (let i = 8; i + 8 <= b.length; ) {
      const laenge = b.readUInt32BE(i);
      const art = b.toString("latin1", i + 4, i + 8);
      if (art === "IDAT") break;
      if (art === "tRNS") entpacken = true;
      i += 12 + laenge;
    }
    return { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20), entpacken };
  }
  if (typ === "image/jpeg") {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { breite: b.readUInt16BE(i + 7), hoehe: b.readUInt16BE(i + 5), entpacken: false };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Lassen sich die Bilddaten eines PNG vollständig entpacken? pdfkit entpackt PNG mit Alphakanal (und mit
 * Transparenz-Tabelle oder Zeilensprung) nebenbei; ein Fehler darin kommt nie zurück, der Katalog würde nie fertig.
 * Deshalb vorher hier, synchron und mit fester Obergrenze für das Ergebnis.
 */
export function pngLesbar(b: Buffer, maxEntpackt = 32 * 1024 * 1024): boolean {
  if (bildTyp(b) !== "image/png") return false;
  const teile: Buffer[] = [];
  let ende = false;
  try {
    for (let i = 8; i + 12 <= b.length; ) {
      const laenge = b.readUInt32BE(i);
      const art = b.toString("latin1", i + 4, i + 8);
      if (i + 12 + laenge > b.length) return false;
      if (art === "IDAT") teile.push(b.subarray(i + 8, i + 8 + laenge));
      if (art === "IEND") {
        ende = true;
        break;
      }
      i += 12 + laenge;
    }
    if (!ende || !teile.length) return false;
    // Beim Hochladen höchstens 1,5 Millionen Pixel (ENTPACKEN_MAX_PIXEL) zu 8 Byte; der Katalog lässt mehr zu (ältere Bilder).
    inflateSync(Buffer.concat(teile), { maxOutputLength: maxEntpackt });
    return true;
  } catch {
    return false;
  }
}

/** Größtes PNG, das pdfkit entpacken muss (z. B. 1500 × 1000). Fotos und Anzeigen bitte als JPEG. */
export const ENTPACKEN_MAX_PIXEL = 1_500_000;
/** Größtes Bild überhaupt (Schutz vor „Pixelbomben“ – kleine Datei, riesige Fläche). */
export const BILD_MAX_PIXEL = 50_000_000;

async function pruefeBild(schauId: number, bildId: number | null) {
  if (bildId == null) return;
  const [b] = await db.select({ id: bild.id }).from(bild).where(and(eq(bild.id, bildId), eq(bild.schauId, schauId)));
  if (!b) throw fehler("BAD_REQUEST", "Dieses Bild gehört nicht zur Schau.");
}

const gestaltungEingabe = z.object({
  format: z.enum(KATALOG_FORMATE),
  untertitel: z.string().trim().max(200),
  schirmherr: z.string().trim().max(200),
  ausstellungsleitung: z.string().trim().max(3000),
  eintritt: z.string().trim().max(500),
  farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farbe als #RRGGBB angeben."),
  // Fehlt eine Angabe (ältere Oberfläche im Zwischenspeicher), bleibt der gespeicherte Wert – keine stille Rückstellung.
  schrift: z.enum(KATALOG_SCHRIFTEN).optional(),
  stil: z.enum(KATALOG_STILE).optional(),
  aufteilung: z.enum(KATALOG_AUFTEILUNGEN).optional(),
  rassebilder: z.boolean().optional(),
  sparteNeueSeite: z.boolean().optional(),
  ausgeblendet: z.array(z.enum(KATALOG_TEILE)).max(KATALOG_TEILE.length).transform((x) => [...new Set(x)]).optional(),
  /** Impressum: Druckerei mit Anschrift oder „Eigendruck“. */
  druck: z.string().trim().max(300).optional(),
  /** Leer: wie die Vereinsfarbe. */
  akzent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Akzentfarbe als #RRGGBB angeben.")]).optional(),
  titelHintergrund: z.enum(KATALOG_TITELHINTERGRUENDE).optional(),
  titelbild: z.enum(KATALOG_TITELBILDER).optional(),
  fusszeile: z.enum(KATALOG_FUSSZEILEN).optional(),
  linien: z.enum(KATALOG_LINIEN).optional(),
});

/** Bildnachweis eines Vereinsbilds: leer bei eigenem Foto; fremde Fotos mit Urheber (und Lizenz). */
const bildAngaben = z.object({
  urheber: z.string().trim().max(300).default(""),
  lizenz: z.string().trim().max(100).default(""),
  quelle: z.string().trim().max(500).default(""),
});
/** NC/ND und CC BY ohne Urheber passen nicht in einen verkauften Katalog (siehe pruefeLizenz). */
function pruefeBildAngaben(a: z.infer<typeof bildAngaben>) {
  const r = pruefeLizenz({ urheber: a.urheber, lizenz: a.lizenz, lizenzUrl: "" }, false);
  if (!r.ok) throw fehler("BAD_REQUEST", r.fehler);
}

/**
 * Vorschau des Katalogs mit noch nicht gespeicherten Einstellungen – nur die Darstellung (keine Texte wie Namen, die
 * sonst in Adressen und Server-Protokollen stünden). Kommt als Abfrage an „/datei/:schauId/katalog.pdf“.
 */
const vorschauEingabe = z
  .object({
    format: z.enum(KATALOG_FORMATE).optional(),
    schrift: z.enum(KATALOG_SCHRIFTEN).optional(),
    stil: z.enum(KATALOG_STILE).optional(),
    aufteilung: z.enum(KATALOG_AUFTEILUNGEN).optional(),
    farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    rassebilder: z.enum(["0", "1"]).transform((x) => x === "1").optional(),
    neueSeite: z.enum(["0", "1"]).transform((x) => x === "1").optional(),
    ohne: z
      .string()
      .max(300)
      .transform((x) => x.split(",").filter(Boolean))
      .pipe(z.array(z.enum(KATALOG_TEILE)).max(KATALOG_TEILE.length))
      .optional(),
  })
  .strict();
export type KatalogVorschau = Partial<
  Pick<typeof katalogGestaltung.$inferSelect, "format" | "schrift" | "stil" | "aufteilung" | "farbe" | "rassebilder" | "sparteNeueSeite" | "ausgeblendet" | "untertitel" | "schirmherr" | "ausstellungsleitung" | "eintritt" | "druck" | "akzent" | "titelHintergrund" | "titelbild" | "fusszeile" | "linien">
>;

/**
 * Live-Vorschau der Katalogseite: das ganze Formular, auch die Texte, im Rumpf einer POST-Anfrage (nicht in der
 * Adresse, also nicht in Protokollen). `kurz`: nur die ersten Tiere je Abteilung (siehe katalogPdf).
 */
const vorschauKoerperEingabe = z.object({ daten: gestaltungEingabe.partial().strict(), kurz: z.boolean() }).strict();
export const VORSCHAU_MAX_BYTES = 32 * 1024;
export function vorschauAusKoerper(koerper: unknown): { vorschau: KatalogVorschau; kurz: boolean } | null {
  const r = vorschauKoerperEingabe.safeParse(koerper);
  if (!r.success) return null;
  const vorschau = Object.fromEntries(Object.entries(r.data.daten).filter(([, v]) => v !== undefined)) as KatalogVorschau;
  return { vorschau, kurz: r.data.kurz };
}

/** Vorschau-Angaben aus der Adresse; null ohne Angaben, „ungueltig“ bei unbekannten oder falschen Werten. */
export function vorschauAus(abfrage: Record<string, string>): KatalogVorschau | null | "ungueltig" {
  if (!Object.keys(abfrage).length) return null;
  const r = vorschauEingabe.safeParse(abfrage);
  if (!r.success) return "ungueltig";
  const { neueSeite, ohne, ...rest } = r.data;
  return { ...rest, ...(neueSeite !== undefined ? { sparteNeueSeite: neueSeite } : {}), ...(ohne !== undefined ? { ausgeblendet: [...new Set(ohne)] } : {}) };
}

const beitragEingabe = z.object({
  id: dbId.optional(),
  art: z.enum(BEITRAG_ARTEN),
  titel: z.string().trim().max(200),
  unterzeile: z.string().trim().max(300),
  text: z.string().max(20000),
  bildId: dbId.nullable(),
  groesse: z.enum(ANZEIGE_GROESSEN),
});

export const katalogGestaltungRouter = router({
  laden: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const [gestaltung, beitraege, bilder] = await Promise.all([
      ladeGestaltung(input.schauId),
      db.select().from(katalogBeitrag).where(eq(katalogBeitrag.schauId, input.schauId)).orderBy(asc(katalogBeitrag.art), asc(katalogBeitrag.folge), asc(katalogBeitrag.id)),
      db
        .select({ id: bild.id, rolle: bild.rolle, name: bild.name, mime: bild.mime, urheber: bild.urheber, lizenz: bild.lizenz, quelle: bild.quelle, bytes: sql<number>`octet_length(${bild.daten})::int` })
        .from(bild)
        // Das Bild der Sockelverkleidung (3D-Hallenplan) gehört nicht zum Katalog.
        .where(and(eq(bild.schauId, input.schauId), ne(bild.rolle, "sockel")))
        .orderBy(asc(bild.id)),
    ]);
    return { gestaltung, beitraege, bilder };
  }),

  speichern: oeffentlichSichtbarProcedure
    .input(z.object({ schauId: dbId, daten: gestaltungEingabe }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      await db
        .insert(katalogGestaltung)
        .values({ schauId: input.schauId, ...input.daten })
        .onConflictDoUpdate({ target: katalogGestaltung.schauId, set: input.daten });
      return { ok: true };
    }),

  bildHochladen: oeffentlichSichtbarProcedure
    .input(
      z.object({
        schauId: dbId,
        rolle: z.enum(["logo", "titel", "beitrag"]),
        name: z.string().max(200),
        // Base64 wird um ein Drittel größer als die Datei.
        base64: z.string().max(Math.ceil((BILD_MAX_BYTES * 4) / 3) + 8),
        angaben: bildAngaben.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (input.angaben) pruefeBildAngaben(input.angaben);
      const daten = Buffer.from(input.base64, "base64");
      if (daten.length > BILD_MAX_BYTES) throw fehler("BAD_REQUEST", "Das Bild ist größer als 5 MB.");
      // Das Logo steckt in jedem archivierten Beleg – groß gespeichert bläht es Datenbank und Sicherungen auf.
      if (input.rolle === "logo" && daten.length > LOGO_MAX_BYTES)
        throw fehler("BAD_REQUEST", "Das Logo ist größer als 600 KB. Bitte verkleinern (z. B. 600 Pixel breit) – es steht auf jedem Beleg.");
      const mime = bildTyp(daten);
      if (!mime) throw fehler("BAD_REQUEST", "Nur Bilder im Format JPEG oder PNG.");
      // Große PNG mit Transparenz muss der Katalogdruck vollständig entpacken – mehrere davon sprengten den Speicher.
      const m = bildMasse(daten);
      if (!m || !m.breite || !m.hoehe) throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen. Bitte als JPEG oder PNG neu speichern.");
      const pixel = m.breite * m.hoehe;
      if (pixel > BILD_MAX_PIXEL) throw fehler("BAD_REQUEST", `Das Bild ist mit ${m.breite} × ${m.hoehe} Pixeln zu groß. Bitte verkleinern.`);
      if (m.entpacken && pixel > ENTPACKEN_MAX_PIXEL) {
        throw fehler(
          "BAD_REQUEST",
          `Das PNG-Bild mit durchsichtigem Hintergrund ist mit ${m.breite} × ${m.hoehe} Pixeln zu groß für den Katalogdruck. Bitte als JPEG speichern oder auf höchstens 1,5 Millionen Pixel verkleinern (z. B. 1500 × 1000).`,
        );
      }
      // Nur diese PNG entpackt pdfkit (nebenbei, ohne Fehler zurückzugeben); die übrigen bettet es unverändert ein.
      if (m.entpacken && !pngLesbar(daten)) throw fehler("BAD_REQUEST", "Das Bild lässt sich nicht lesen (beschädigt oder unvollständig). Bitte neu speichern.");
      return db.transaction(async (tx) => {
        // Logo und Titelbild gibt es nur einmal – das neue ersetzt das alte.
        if (input.rolle !== "beitrag") await tx.delete(bild).where(and(eq(bild.schauId, input.schauId), eq(bild.rolle, input.rolle)));
        const [b] = await tx.insert(bild).values({ schauId: input.schauId, rolle: input.rolle, mime, name: input.name, daten, ...(input.angaben ?? {}) }).returning({ id: bild.id });
        return { id: b!.id };
      });
    }),

  /** Urheber, Lizenz und Quelle eines Vereinsbilds (Bildnachweis im Katalog). */
  bildAngabenSetzen: oeffentlichSichtbarProcedure.input(bildAngaben.extend({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const { schauId, id, ...werte } = input;
    pruefeBildAngaben(werte);
    const r = await db.update(bild).set(werte).where(and(eq(bild.id, id), eq(bild.schauId, schauId))).returning({ id: bild.id });
    if (!r.length) throw fehler("NOT_FOUND", "Bild nicht gefunden.");
    return { ok: true };
  }),

  bildLoeschen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.delete(bild).where(and(eq(bild.id, input.id), eq(bild.schauId, input.schauId)));
    return { ok: true };
  }),

  beitragSpeichern: oeffentlichSichtbarProcedure
    .input(z.object({ schauId: dbId, beitrag: beitragEingabe }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const { id, ...b } = input.beitrag;
      await pruefeBild(input.schauId, b.bildId);
      if (id != null) {
        const [x] = await db
          .update(katalogBeitrag)
          .set(b)
          .where(and(eq(katalogBeitrag.id, id), eq(katalogBeitrag.schauId, input.schauId)))
          .returning({ id: katalogBeitrag.id });
        if (!x) throw fehler("NOT_FOUND", "Beitrag nicht gefunden.");
        return { id };
      }
      const [{ n }] = (await db
        .select({ n: sql<number>`coalesce(max(${katalogBeitrag.folge}), 0)::int` })
        .from(katalogBeitrag)
        .where(and(eq(katalogBeitrag.schauId, input.schauId), eq(katalogBeitrag.art, b.art)))) as [{ n: number }];
      const [neu] = await db.insert(katalogBeitrag).values({ schauId: input.schauId, ...b, folge: n + 1 }).returning({ id: katalogBeitrag.id });
      return { id: neu!.id };
    }),

  beitragLoeschen: oeffentlichSichtbarProcedure.input(z.object({ schauId: dbId, id: dbId })).mutation(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.delete(katalogBeitrag).where(and(eq(katalogBeitrag.id, input.id), eq(katalogBeitrag.schauId, input.schauId)));
    return { ok: true };
  }),

  /** Neue Reihenfolge einer Art (Grußworte, Anzeigen, Seiten) als Liste der IDs. */
  beitraegeOrdnen: oeffentlichSichtbarProcedure
    .input(z.object({ schauId: dbId, ids: z.array(dbId).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      if (!input.ids.length) return { ok: true };
      await db.transaction(async (tx) => {
        const vorhanden = await tx
          .select({ id: katalogBeitrag.id })
          .from(katalogBeitrag)
          .where(and(eq(katalogBeitrag.schauId, input.schauId), inArray(katalogBeitrag.id, input.ids)));
        if (vorhanden.length !== new Set(input.ids).size) throw fehler("BAD_REQUEST", "Unbekannter Beitrag.");
        for (const [i, id] of input.ids.entries()) await tx.update(katalogBeitrag).set({ folge: i + 1 }).where(eq(katalogBeitrag.id, id));
      });
      return { ok: true };
    }),
});
