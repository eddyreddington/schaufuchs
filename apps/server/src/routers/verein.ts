import { ABMELDUNG_MINUTEN, abmeldungLesen, alsText, datenschutzAbschnitte, fehlendeVereinsangaben, impressumAbschnitte, istEigenerVerein, istVereinsmitglied } from "@schau/domain";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, not, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { aussteller, organisation, schau } from "../db/schema";
import { ausstellerVerwaltungEingabe, eigeneVereinsnamen, setzeVereinsnamen, speichereAussteller, vereinsangabenUebersicht } from "../services/aussteller";
import { bereinige, ladeAuskunftPerson, ladeVereinsangaben, loescheAussteller } from "../services/datenschutz";
import { protokolliere } from "../services/protokoll";
import { echteAussteller } from "../services/testschau";
import { adminProcedure, benutzerProcedure, dbId, fehler, router } from "../trpc";

const text = (max: number) => z.string().trim().max(max).default("");
const minuten = z.number().int().refine((m) => (ABMELDUNG_MINUTEN as readonly number[]).includes(m), "Diese Frist gibt es nicht.");

export const vereinRouter = router({
  /** Angaben für Impressum und Datenschutzhinweise, dazu die daraus erzeugten Texte. */
  get: benutzerProcedure.query(async ({ ctx }) => {
    const v = await ladeVereinsangaben(ctx.benutzer.organisationId);
    return {
      angaben: v,
      fehlend: fehlendeVereinsangaben(v),
      impressum: impressumAbschnitte(v),
      datenschutz: datenschutzAbschnitte(v),
      muster: alsText(datenschutzAbschnitte({ ...v, datenschutzText: "" })),
    };
  }),

  speichern: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Name des Vereins fehlt.").max(200),
        anschrift: text(500),
        email: z.string().trim().max(200).email("E-Mail-Adresse ungültig.").or(z.literal("")).default(""),
        telefon: text(50),
        vertretung: text(1000),
        register: text(200),
        inhaltVerantwortlich: text(500),
        datenschutzbeauftragter: text(500),
        impressumZusatz: text(5000),
        datenschutzZusatz: text(10_000),
        datenschutzText: text(50_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        const [alt] = await tx.select().from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId));
        await tx.update(organisation).set(input).where(eq(organisation.id, ctx.benutzer.organisationId));
        await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: "Vereinsangaben", alt, neu: input, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Automatische Abmeldung nach Untätigkeit: Minuten je Rolle. */
  abmeldung: adminProcedure.query(async ({ ctx }) => {
    const [o] = await db.select({ abmeldung: organisation.abmeldung }).from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId));
    return abmeldungLesen(o?.abmeldung);
  }),

  abmeldungSpeichern: adminProcedure
    .input(z.object({ admin: minuten, mitarbeiter: minuten, preisrichter: minuten }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        const [o] = await tx.select({ abmeldung: organisation.abmeldung }).from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId)).for("update");
        await tx.update(organisation).set({ abmeldung: input }).where(eq(organisation.id, ctx.benutzer.organisationId));
        await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: "Automatische Abmeldung", alt: abmeldungLesen(o?.abmeldung), neu: input, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Aussteller des Vereins: Verwaltung, Auskunft und Löschung – getrennt nach Vereinsmitgliedern und Externen. */
  aussteller: adminProcedure
    .input(
      z.object({
        q: z.string().trim().max(200).default(""),
        filter: z.enum(["aktiv", "gesperrt", "geloescht"]).default("aktiv"),
        gruppe: z.enum(["alle", "mitglieder", "externe"]).default("alle"),
        /** Nur Aussteller mit einer Meldung in dieser Schau; bei einer Testschau ihre Test-Aussteller. */
        schauId: dbId.nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const org = ctx.benutzer.organisationId;
      // Mitglied nach Vereinsangabe: die Rohwerte, die einer eigenen Schreibweise entsprechen (Vergleich wie in der Fachlogik).
      const [eigene, roh] = await Promise.all([
        eigeneVereinsnamen(db, org),
        db.selectDistinct({ verein: aussteller.verein }).from(aussteller).where(and(eq(aussteller.organisationId, org), echteAussteller())),
      ]);
      const eigeneRoh = roh.map((r) => r.verein).filter((v) => istEigenerVerein(v, eigene));
      const nachVerein = eigeneRoh.length ? inArray(aussteller.verein, eigeneRoh) : sql`false`;
      // coalesce: „mitglied = true“ ergäbe bei NULL (automatisch) selbst NULL, und NOT(NULL) ließe Externe aus der Liste fallen.
      const istMitglied = sql<boolean>`coalesce(${aussteller.mitglied}, ${nachVerein})`;
      // Ohne Schau-Auswahl nur echte Aussteller: Test-Aussteller stehen nur unter ihrer Testschau (services/testschau.ts).
      const where = [eq(aussteller.organisationId, org)];
      if (input.schauId) {
        const [s] = await db.select({ id: schau.id, test: schau.test }).from(schau).where(and(eq(schau.id, input.schauId), eq(schau.organisationId, org)));
        if (!s) throw fehler("NOT_FOUND", "Schau nicht gefunden.");
        if (s.test) where.push(eq(aussteller.testSchauId, s.id));
        else where.push(echteAussteller(), sql`exists (select 1 from meldung m where m.aussteller_id = "aussteller"."id" and m.schau_id = ${s.id})`);
      } else where.push(echteAussteller());
      if (input.filter === "aktiv") where.push(isNull(aussteller.gesperrtAm), isNull(aussteller.geloeschtAm));
      if (input.filter === "gesperrt") where.push(isNotNull(aussteller.gesperrtAm));
      if (input.filter === "geloescht") where.push(isNotNull(aussteller.geloeschtAm));
      if (input.gruppe === "mitglieder") where.push(istMitglied);
      if (input.gruppe === "externe") where.push(not(istMitglied));
      if (input.q) {
        const q = `%${input.q}%`;
        where.push(or(ilike(aussteller.nachname, q), ilike(aussteller.vorname, q), ilike(aussteller.ort, q), ilike(aussteller.email, q), ilike(aussteller.registriernummer, q), ilike(aussteller.verein, q))!);
      }
      const zeilen = await db
        // Tabellennamen in den Unterabfragen ausgeschrieben: ohne Join ließe Drizzle sie weg, und "id" träfe die Meldung.
        .select({
          id: aussteller.id,
          vorname: aussteller.vorname,
          nachname: aussteller.nachname,
          plz: aussteller.plz,
          ort: aussteller.ort,
          verein: aussteller.verein,
          email: aussteller.email,
          telefon: aussteller.telefon,
          mitgliedVonHand: aussteller.mitglied,
          gesperrtAm: aussteller.gesperrtAm,
          loeschenAb: aussteller.loeschenAb,
          geloeschtAm: aussteller.geloeschtAm,
          meldungen: sql<number>`(select count(*)::int from meldung m where m.aussteller_id = "aussteller"."id")`,
          letzteMeldung: sql<string | null>`(select to_char(max(m.eingegangen_am) at time zone 'Europe/Berlin', 'YYYY-MM-DD') from meldung m where m.aussteller_id = "aussteller"."id")`,
        })
        .from(aussteller)
        .where(and(...where))
        .orderBy(input.filter === "aktiv" ? asc(aussteller.nachname) : desc(aussteller.gesperrtAm), asc(aussteller.vorname))
        .limit(500);
      return zeilen.map((z) => ({ ...z, mitglied: istVereinsmitglied({ verein: z.verein, mitglied: z.mitgliedVonHand }, eigene) }));
    }),

  /** Stammdaten eines Ausstellers zum Bearbeiten (ohne Geburtsdatum). */
  ausstellerDaten: adminProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const [a] = await db.select().from(aussteller).where(and(eq(aussteller.id, input.id), eq(aussteller.organisationId, ctx.benutzer.organisationId)));
    if (!a) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
    if (a.gesperrtAm || a.geloeschtAm) throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt und lassen sich nicht mehr ändern.");
    const { geburtsdatum: _g, testSchauId: _t, gesperrtAm: _s, loeschenAb: _l, geloeschtAm: _x, createdAt: _c, organisationId: _o, ...rest } = a;
    return rest;
  }),

  /** Aussteller anlegen oder Stammdaten ändern (mit Protokoll; Bankdaten nicht, solange eine offene SEPA-Datei sie enthält). */
  ausstellerSpeichern: adminProcedure
    .input(ausstellerVerwaltungEingabe)
    .mutation(({ ctx, input }) => db.transaction((tx) => speichereAussteller(tx, ctx.benutzer.organisationId, input, ctx))),

  /** Vereinsangaben der Aussteller und die Schreibweisen, die als eigener Verein gelten. */
  vereinsangaben: adminProcedure.query(({ ctx }) => vereinsangabenUebersicht(db, ctx.benutzer.organisationId)),

  vereinsnamenSetzen: adminProcedure
    .input(z.object({ namen: z.array(z.string().max(500)).max(50) }))
    .mutation(({ ctx, input }) => db.transaction((tx) => setzeVereinsnamen(tx, ctx.benutzer.organisationId, input.namen, ctx))),

  /** Löschen auf Wunsch (Art. 17 DSGVO): sofort, oder gesperrt bis zum Ende der Aufbewahrungsfrist. */
  ausstellerLoeschen: adminProcedure
    .input(z.object({ id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben, z. B. „Wunsch per E-Mail vom …“.").max(500) }))
    .mutation(({ ctx, input }) => db.transaction((tx) => loescheAussteller(tx, ctx.benutzer.organisationId, input.id, input.grund, ctx))),

  /** Speicherfristen sofort anwenden (läuft sonst täglich von selbst). */
  /** Auskunft für Käufer und Preisrichter (keine Aussteller-Stammdaten), gesucht nach Name – als POST, damit der Name in keiner URL steht. */
  auskunftPerson: adminProcedure
    .input(z.object({ name: z.string().trim().min(3, "Bitte mindestens 3 Zeichen.").max(200) }))
    .mutation(async ({ ctx, input }) => {
      const r = await ladeAuskunftPerson(ctx.benutzer.organisationId, input.name);
      await protokolliere(db, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: "Auskunft Käufer/Preisrichter erstellt", akteur: ctx });
      return r;
    }),
  bereinigen: adminProcedure.mutation(({ ctx }) => bereinige(new Date(), { organisationId: ctx.benutzer.organisationId })),
});
