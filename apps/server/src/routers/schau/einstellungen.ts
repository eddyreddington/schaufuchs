/** Einstellungen einer Schau: Felder speichern, Reihenfolge der Katalognummern, Teilschauen und Notenskala. */
import { rueckmeldungFehler, teilschauenLesen, TEILSCHAUEN_MAX, KONTINGENT_BASEN, imEwr, normalisiereIban, pruefeBic, pruefeIban, KAEFIG_TYPEN, UNTERSUCHUNG_ARTEN, SORTIER_KRITERIEN, istStandardSortierung, sortierungNormal } from "@schau/domain";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { katalogeintrag, meldung, preisrichter, schau, verkauf } from "../../db/schema";
import { pruefeNichtAbgeschlossen } from "../../services/kasse";
import { protokolliere } from "../../services/protokoll";
import { pruefeVersion } from "../stammdaten";
import { adminProcedure, fehler, ladeSchau, dbId, kalenderdatum } from "../../trpc";

const datum = kalenderdatum().nullable();

const schauFelder = z.object({
  name: z.string().max(200).min(3),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  veranstalter: z.string().max(500),
  ort: z.string().max(500),
  meldeschluss: datum,
  einlieferung: z.string().max(500),
  bewertungAm: datum,
  /** Rückmeldung der Preisrichter bis (Verpflichtung); fehlt das Feld (ältere Oberfläche), bleibt der Stand. */
  preisrichterRueckmeldungBis: datum.optional(),
  oeffnungszeiten: z.string().max(500),
  aussetzen: z.string().max(500),
  reklamationsfrist: datum,
  kapazitaet: z.number().int().positive().max(100_000).nullable(),
  stammdatenVersionId: dbId.nullable(),
  provisionBp: z.number().int().min(0).max(5000),
  katalogStart: z.number().int().min(1).max(1_000_000),
  jugendSeparat: z.boolean(),
  staemmeVorn: z.boolean(),
  /** Reihenfolge der Käfigblöcke für die Katalognummern (jede Größe höchstens einmal); null = nach Sparten. */
  kaefigFolge: z
    .array(z.enum(KAEFIG_TYPEN))
    .max(KAEFIG_TYPEN.length)
    .refine((f) => new Set(f).size === f.length, "Jede Käfiggröße nur einmal.")
    .nullable()
    .default(null),
  kontingentJe: z.enum(KONTINGENT_BASEN),
  /** Meldegeld bei der Einlieferung statt vorab per Überweisung (Texte für Aussteller). */
  zahlungBeiEinlieferung: z.boolean().default(false),
  /** Überweisung mit Referenz und GiroCode auf das Vereinskonto (Entscheidung 021). */
  // Fehlt das Feld (älterer Browser-Tab, Skript), bleibt der Stand – sonst schaltete jedes Speichern den Code ab.
  girocode: z.boolean().optional(),
  bestimmungen: z.string().max(20_000),
  bankverbindung: z.string().max(500),
  kontaktEmail: z.string().max(500),
  // Veterinäramt: Registrierung der Veranstaltung, Anzeige 4 Wochen vorher, Auflagen.
  vetRegistriernummer: z.string().trim().max(100).default(""),
  vetAmt: z.string().trim().max(500).default(""),
  vetAnzeigeAm: datum.default(null),
  vetAktenzeichen: z.string().trim().max(200).default(""),
  wassergefluegelUntersuchung: z.boolean().default(false),
  // Tiergesundheit (§ 7 GeflPestSchV, Merkblatt des Veterinäramts). Fehlt eine Angabe (ältere Oberfläche), bleibt der Stand.
  untersuchung: z.enum(UNTERSUCHUNG_ARTEN).nullable().optional(),
  untersuchungTage: z.number().int().min(1).max(30).optional(),
  einlassUntersuchungAm: datum.optional(),
  einlassTierarzt: z.string().trim().max(200).optional(),
  ndTageMin: z.number().int().min(0).max(730).nullable().optional(),
  ndTageMax: z.number().int().min(0).max(730).nullable().optional(),
  pmvTageMin: z.number().int().min(0).max(730).nullable().optional(),
  pmvTageMax: z.number().int().min(0).max(730).nullable().optional(),
  auslandZugelassen: z.boolean().optional(),
  prHoechstzahl: z.number().int().min(1).max(1000).optional(),
  obmannHoechstzahl: z.number().int().min(1).max(1000).optional(),
  erklaerungen: z.string().max(5_000).default(""),
  vereinKontoinhaber: z.string().max(500).trim(),
  vereinIban: z
    .string()
    .transform(normalisiereIban)
    .superRefine((v, c) => {
      const f = v ? pruefeIban(v) : null;
      if (f) c.addIssue({ code: "custom", message: `Vereinskonto: ${f}` });
    }),
  vereinBic: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .superRefine((v, c) => {
      const f = v ? pruefeBic(v) : null;
      if (f) c.addIssue({ code: "custom", message: f });
    }),
});

export const einstellungen = {
  aktualisieren: adminProcedure
    .input(z.object({ id: dbId, daten: schauFelder }))
    .mutation(async ({ ctx, input }) => {
      const alt = await ladeSchau(ctx.benutzer.organisationId, input.id);
      // Der GiroCode trägt Kontoinhaber und IBAN des Vereinskontos – ohne sie gäbe es keinen gültigen Code.
      const dt = input.daten;
      if ((dt.girocode ?? alt.girocode) && !dt.zahlungBeiEinlieferung) {
        if (!dt.vereinIban || !dt.vereinKontoinhaber) throw fehler("BAD_REQUEST", "Für den GiroCode bitte Kontoinhaber und IBAN des Vereinskontos eintragen.");
        // Im Code stehen höchstens 70 Zeichen; ein gekürzter Name ergäbe bei der Empfängerüberprüfung „ähnlich“.
        if ([...dt.vereinKontoinhaber].length > 70) throw fehler("BAD_REQUEST", "Für den GiroCode darf der Kontoinhaber höchstens 70 Zeichen haben.");
        if (!imEwr(dt.vereinIban) && !dt.vereinBic) throw fehler("BAD_REQUEST", "Das Vereinskonto liegt außerhalb des EWR – für den GiroCode bitte auch die BIC eintragen.");
      }
      if (input.daten.slug !== alt.slug) {
        // Ab der Meldung stecken Links in versandten Mails („Meine Meldung“, Widerruf) und in den Tablets der Preisrichter.
        if (alt.phase !== "vorbereitung") throw fehler("BAD_REQUEST", "Die Kurzadresse lässt sich nur in der Vorbereitung ändern – danach würden versandte Links und angemeldete Tablets ungültig.");
        // Auch nach „Zurück zur Vorbereitung“: Gibt es schon Meldungen oder Tablet-PINs, hängen Links daran.
        const [[mel], [pin]] = await Promise.all([
          db.select({ n: count() }).from(meldung).where(eq(meldung.schauId, alt.id)),
          db.select({ n: count() }).from(preisrichter).where(and(eq(preisrichter.schauId, alt.id), sql`${preisrichter.pinHash} is not null`)),
        ]);
        if ((mel?.n ?? 0) > 0 || (pin?.n ?? 0) > 0)
          throw fehler("BAD_REQUEST", "Die Kurzadresse lässt sich nicht mehr ändern: Es gibt schon Meldungen oder Tablet-PINs, deren Links daran hängen.");
        const [x] = await db.select({ id: schau.id }).from(schau).where(eq(schau.slug, input.daten.slug));
        if (x) throw fehler("CONFLICT", "Diese Kurzadresse ist schon vergeben.");
      }
      // Am Bewertungstag hängen Jugendtarif und Speicherfristen – ein vertipptes Jahr fällt hier auf.
      if (input.daten.bewertungAm && input.daten.bewertungAm !== alt.bewertungAm) {
        const fruehestens = new Date(alt.createdAt.getTime() - 366 * 86_400_000).toISOString().slice(0, 10);
        const spaetestens = new Date(Date.now() + 3 * 366 * 86_400_000).toISOString().slice(0, 10);
        if (input.daten.bewertungAm < fruehestens || input.daten.bewertungAm > spaetestens) throw fehler("BAD_REQUEST", "Der Bewertungstag liegt mehr als ein Jahr vor dem Anlegen der Schau oder mehr als drei Jahre in der Zukunft – bitte das Jahr prüfen.");
      }
      const rueckmeldung = rueckmeldungFehler(dt.preisrichterRueckmeldungBis === undefined ? alt.preisrichterRueckmeldungBis : dt.preisrichterRueckmeldungBis, dt.bewertungAm);
      if (rueckmeldung) throw fehler("BAD_REQUEST", rueckmeldung);
      if (alt.katalogGedruckt && input.daten.stammdatenVersionId !== alt.stammdatenVersionId) {
        throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Stammdaten lassen sich nicht mehr wechseln.");
      }
      // Gemeldete Tiere verweisen auf Rassen und Farbenschläge der bisherigen Version: ein Wechsel ließe sich nicht mehr
      // speichern und mischte die Katalogfolge. Fehlt etwas, das Verzeichnis lieber ergänzen.
      const versionWechsel = input.daten.stammdatenVersionId !== alt.stammdatenVersionId;
      // Der Provisionssatz steht auf Kaufbelegen und Quittungen – nach dem ersten Verkauf nicht mehr änderbar.
      if (input.daten.provisionBp !== alt.provisionBp) {
        const [v] = await db.select({ id: verkauf.id }).from(verkauf).innerJoin(katalogeintrag, eq(katalogeintrag.id, verkauf.katalogeintragId)).where(eq(katalogeintrag.schauId, alt.id)).limit(1);
        if (v) throw fehler("BAD_REQUEST", "Es gibt schon Verkäufe – der Provisionssatz lässt sich nicht mehr ändern.");
      }
      if (
        alt.katalogGedruckt &&
        (input.daten.jugendSeparat !== alt.jugendSeparat || input.daten.staemmeVorn !== alt.staemmeVorn || JSON.stringify(input.daten.kaefigFolge ?? null) !== JSON.stringify(alt.kaefigFolge ?? null))
      ) {
        throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Reihenfolge im Katalog lässt sich nicht mehr ändern.");
      }
      // Nur eigene oder bereitgestellte Versionen; eine schon gesetzte bleibt erlaubt.
      const versionId = input.daten.stammdatenVersionId;
      if (versionId != null && versionId !== alt.stammdatenVersionId) await pruefeVersion(ctx.benutzer.organisationId, versionId);
      await db.transaction(async (tx) => {
        if (versionWechsel) {
          // In derselben Transaktion mit gesperrter Schau prüfen: eine gleichzeitig gespeicherte Meldung wartet so.
          // Stornierte und abgelehnte Meldungen zählen nicht.
          await tx.select({ id: schau.id }).from(schau).where(eq(schau.id, input.id)).for("update");
          const [x] = await tx
            .select({ id: katalogeintrag.id })
            .from(katalogeintrag)
            .innerJoin(meldung, eq(meldung.id, katalogeintrag.meldungId))
            .where(and(eq(katalogeintrag.schauId, alt.id), inArray(meldung.status, ["offen", "bestaetigt"]), sql`(${katalogeintrag.farbenschlagId} is not null or ${katalogeintrag.rasseId} is not null)`))
            .limit(1);
          if (x) throw fehler("BAD_REQUEST", "Es gibt schon gemeldete Tiere – das Verzeichnis lässt sich nicht mehr wechseln. Fehlende Rassen oder Farbenschläge bitte unter „Rassen und Farbenschläge“ → „Ergänzen“ nachtragen (bei einem für alle Vereine bereitgestellten Verzeichnis: eigenes Verzeichnis einspielen, bevor gemeldet wird).");
        }
        await tx.update(schau).set(input.daten).where(eq(schau.id, input.id));
        await protokolliere(tx, { schauId: input.id, tabelle: "schau", datensatzId: input.id, aktion: "geändert", alt, neu: input.daten, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Reihenfolge der Katalognummern (Kriterien in Rangfolge, ausgeschaltet, umgekehrt; siehe SORTIER_KRITERIEN). Gespeichert
   * wird die vollständige Liste, die Vorgabe als null. Die Nummern folgen erst beim nächsten Vergeben; nach dem
   * Festschreiben gesperrt wie Jugendblock und Stämme vorn.
   */
  katalogSortierungSetzen: adminProcedure
    .input(
      z.object({
        id: dbId,
        sortierung: z
          .array(z.object({ kriterium: z.enum(SORTIER_KRITERIEN), aus: z.boolean().optional(), umgekehrt: z.boolean().optional() }))
          .max(SORTIER_KRITERIEN.length)
          .refine((f) => new Set(f.map((x) => x.kriterium)).size === f.length, "Jedes Kriterium nur einmal.")
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.id));
      const neu = istStandardSortierung(input.sortierung) ? null : sortierungNormal(input.sortierung);
      return db.transaction(async (tx) => {
        // Gesperrt gelesen: ein gleichzeitiges Festschreiben der Nummern wartet bzw. wird hier gesehen.
        const [s] = await tx.select({ gedruckt: schau.katalogGedruckt, alt: schau.katalogSortierung }).from(schau).where(eq(schau.id, geladen.id)).for("update");
        if (s!.gedruckt) throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – die Reihenfolge im Katalog lässt sich nicht mehr ändern.");
        // jsonb ordnet die Schlüssel um: verglichen wird die normalisierte Liste.
        const alt = s!.alt ? sortierungNormal(s!.alt) : null;
        if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
        await tx.update(schau).set({ katalogSortierung: neu }).where(eq(schau.id, geladen.id));
        await protokolliere(tx, { schauId: geladen.id, tabelle: "schau", datensatzId: geladen.id, aktion: "Reihenfolge der Katalognummern", alt: { sortierung: alt }, neu: { sortierung: neu }, akteur: ctx });
        return { ok: true, geaendert: true };
      });
    }),

  /**
   * Teilschauen (Entscheidung 016) in Katalogfolge. Eine Teilschau mit Meldungen lässt sich nicht entfernen; nach dem
   * Festschreiben der Katalognummern ändert sich nichts mehr an Folge und Zuordnung.
   */
  teilschauenSetzen: adminProcedure
    .input(z.object({ id: dbId, teilschauen: z.array(z.object({ id: z.string().max(10).optional(), name: z.string().max(200) })).max(TEILSCHAUEN_MAX) }))
    .mutation(async ({ ctx, input }) => {
      const geladen = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.id));
      const neu = teilschauenLesen(input.teilschauen);
      return db.transaction(async (tx) => {
        const [s] = await tx.select({ gedruckt: schau.katalogGedruckt, alt: schau.teilschauen }).from(schau).where(eq(schau.id, geladen.id)).for("update");
        const alt = teilschauenLesen(s!.alt);
        if (JSON.stringify(alt) === JSON.stringify(neu)) return { ok: true, geaendert: false };
        if (s!.gedruckt && JSON.stringify(alt.map((t) => t.id)) !== JSON.stringify(neu.map((t) => t.id)))
          throw fehler("BAD_REQUEST", "Die Katalognummern sind festgeschrieben – Teilschauen lassen sich nur noch umbenennen.");
        // Meldungen ohne Angabe gehören zur bisher ersten Teilschau. Ändert sich die erste (Umsortieren, Entfernen),
        // rutschten sie still in eine andere – deshalb vorher ausdrücklich der bisherigen zuordnen.
        if (alt[0] && neu[0]?.id !== alt[0].id) {
          await tx.update(meldung).set({ teilschau: alt[0].id }).where(and(eq(meldung.schauId, geladen.id), isNull(meldung.teilschau)));
        }
        // Meldungen einer entfernten Teilschau fielen still in die erste – deshalb erst umhängen.
        const weg = alt.filter((t) => !neu.some((n) => n.id === t.id));
        for (const t of weg) {
          const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(meldung).where(and(eq(meldung.schauId, geladen.id), eq(meldung.teilschau, t.id)));
          if (m!.n) throw fehler("BAD_REQUEST", `Zur Teilschau „${t.name}“ gehören noch ${m!.n} Meldungen – bitte erst einer anderen Teilschau zuordnen.`);
        }
        await tx.update(schau).set({ teilschauen: neu }).where(eq(schau.id, geladen.id));
        await protokolliere(tx, { schauId: geladen.id, tabelle: "schau", datensatzId: geladen.id, aktion: "Teilschauen", alt: { teilschauen: alt }, neu: { teilschauen: neu }, akteur: ctx });
        return { ok: true, geaendert: true };
      });
    }),

  notenskalaSetzen: adminProcedure
    .input(
      z.object({
        schauId: dbId,
        skala: z.array(z.object({ kuerzel: z.string().min(1), name: z.string().min(1), punkte: z.array(z.number().int().min(0).max(100)).min(1) })).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      // Nach der Freigabe stehen die Noten in Katalog, Ergebnissen und Karten – die Skala bleibt dann fest.
      if (s.ergebnisseFreigegeben) throw fehler("BAD_REQUEST", "Die Ergebnisse sind freigegeben – die Notenskala lässt sich nicht mehr ändern.");
      await db.transaction(async (tx) => {
        await tx.update(schau).set({ notenskala: input.skala }).where(eq(schau.id, input.schauId));
        await protokolliere(tx, { schauId: input.schauId, tabelle: "schau", datensatzId: input.schauId, aktion: "Notenskala", alt: s.notenskala, neu: input.skala, akteur: ctx });
      });
      return { ok: true };
    }),
};
