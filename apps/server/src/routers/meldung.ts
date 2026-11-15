import { formatEuro, gefordertCent, MELDUNG_STATUS, mitVerzeichnis, verdeckeIban } from "@schau/domain";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db/client";
import { aussteller, katalogeintrag, meldung, schau, stiftung, zahlung } from "../db/schema";
import { ladeEintraege, meldebetrag } from "../services/eintraege";
import { offeneStornoZahlungen, pruefeNichtAbgeschlossen, sperreKasse, offenerLauf } from "../services/kasse";
import { bindungen, hatAuszahlung, meldungEingabe, speichereMeldung } from "../services/meldung";
import { sendeMail } from "../services/post";
import { archiviereKassenbeleg } from "../services/kassenbuch";
import { einteilungNachStatus } from "../services/einteilung";
import { verzeichnisVorschlaegeZwischengespeichert } from "../services/vereinsverzeichnis";
import { protokolliere, type Akteur } from "../services/protokoll";
import { heuteDe } from "../services/tiergesundheit";
import { adminProcedure, benutzerProcedure, fehler, ladeSchau, router, type Schau, dbId, kalenderdatum } from "../trpc";
import { Bremse } from "../services/bremse";
import { ausstellerDerSchau, echteAussteller } from "../services/testschau";

async function ladeMeldung(organisationId: number, meldungId: number) {
  const [m] = await db.select().from(meldung).where(eq(meldung.id, meldungId));
  if (!m) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
  const s = await ladeSchau(organisationId, m.schauId);
  return { m, s };
}

/** Bestätigt die Meldung automatisch, sobald der volle Betrag bezahlt ist. */
async function pruefeBezahlt(meldungId: number, akteur: Akteur) {
  // Unter Zeilensperre und nur aus „offen“: eine gleichzeitige Stornierung bleibt bestehen.
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(meldung).where(eq(meldung.id, meldungId)).for("update");
    if (m?.status !== "offen") return false;
    const b = await meldebetrag(tx, meldungId);
    if (!(b.summeCent > 0 && b.bezahltCent >= b.summeCent)) return false;
    await tx.update(meldung).set({ status: "bestaetigt" }).where(and(eq(meldung.id, meldungId), eq(meldung.status, "offen")));
    // Erst mit „bestätigt“ kommt die Meldung in Katalog, Abrechnung und Preisvergabe – das gehört ins Protokoll.
    await protokolliere(tx, { schauId: m.schauId, tabelle: "meldung", datensatzId: meldungId, aktion: "Status", alt: "offen", neu: "bestaetigt", grund: "automatisch nach vollständiger Zahlung", akteur });
    // Hat die Meldung schon Katalognummern (festgeschrieben), folgen die Preisrichter-Bereiche.
    await einteilungNachStatus(tx, m.schauId, meldungId, akteur);
    return true;
  });
}

/** Anrede für die Bestätigungsmail: nur Buchstaben, Leerzeichen, Bindestrich, Apostroph (keine Links, keine Domains). */
export function anrede(vorname: string, nachname: string) {
  return `${vorname} ${nachname}`.replace(/[^\p{L}\p{M}\s'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Was der Aussteller zahlt und wann – je nach Zahlungsweise der Schau (vorab per Überweisung oder bei der Einlieferung). */
export function zahlungsZeilen(s: Pick<Schau, "bankverbindung" | "zahlungBeiEinlieferung">, betragCent: number, stiftungCent = 0, spendeCent = 0): string[] {
  const summe = betragCent + stiftungCent + spendeCent;
  if (summe <= 0) return ["Für diese Meldung fällt kein Meldegeld an. Die Ausstellungsleitung bestätigt sie."];
  const zusatz = [stiftungCent > 0 && `Ehrenpreisstiftung ${formatEuro(stiftungCent)}`, spendeCent > 0 && `Spende ${formatEuro(spendeCent)}`].filter(Boolean);
  const betrag = zusatz.length ? `Meldegeld ${formatEuro(betragCent)} + ${zusatz.join(" + ")} = ${formatEuro(summe)}` : formatEuro(summe);
  if (s.zahlungBeiEinlieferung) return [`Zu zahlen bei der Einlieferung der Tiere: ${betrag}`];
  return [`Zu zahlen: ${betrag}`, s.bankverbindung ? `Bankverbindung: ${s.bankverbindung}` : "", "Die Meldung wird erst nach Zahlungseingang bearbeitet."];
}

export function eingangsText(s: Schau, name: string, betragCent: number, link: string, online?: boolean, stiftungCent = 0, spendeCent = 0) {
  return [
    name ? `Guten Tag ${name},` : "Guten Tag,",
    "",
    `Ihre Meldung zur Schau „${s.name}“ ist eingegangen.`,
    ...zahlungsZeilen(s, betragCent, stiftungCent, spendeCent),
    "",
    `Hier können Sie Ihre Meldung prüfen und später Ihre Ergebnisse sehen:`,
    link,
    "",
    "Bitte prüfen Sie Rasse, Farbenschlag, Geschlecht und Alter jedes Tieres.",
    "",
    online === undefined
      ? ""
      : online
        ? "Sie haben eingewilligt, dass Name, Wohnort und Verein in den Online-Ergebnissen erscheinen. Widerrufen können Sie das jederzeit über den Link oben."
        : "Im Internet erscheinen Sie ohne Namen. Über den Link oben können Sie die Veröffentlichung jederzeit erlauben.",
    `Datenschutzhinweise: ${config.publicUrl}/s/${s.slug}/datenschutz`,
    "",
    s.kontaktEmail ? `Fragen an: ${s.kontaktEmail}` : "",
  ]
    .filter((z, i, arr) => z !== "" || arr[i - 1] !== "")
    .join("\n");
}

/**
 * Bankdaten sieht vollständig nur die Ausstellungsleitung; Helfer der Meldestelle sehen, ob und welche IBAN hinterlegt
 * ist (gekürzt), ändern können sie sie ohnehin nicht. Das Geburtsdatum (nur Jugend) brauchen sie für den Jugendtarif.
 */
function fuerRolle<T extends { iban: string }>(a: T, rolle: string): T & { ibanVerdeckt: string } {
  return rolle === "admin" ? { ...a, ibanVerdeckt: "" } : { ...a, iban: "", ibanVerdeckt: verdeckeIban(a.iban) };
}

const bestaetigungBremse = new Bremse(5, 86_400_000, "Diese Bestätigung wurde heute schon mehrmals verschickt. Bitte morgen erneut versuchen.");

export const meldungRouter = router({
  liste: benutzerProcedure
    .input(z.object({ schauId: dbId, q: z.string().max(200).default(""), status: z.enum(MELDUNG_STATUS).nullable().default(null) }))
    .query(async ({ ctx, input }) => {
      await ladeSchau(ctx.benutzer.organisationId, input.schauId);
      const where = [eq(meldung.schauId, input.schauId)];
      if (input.status) where.push(eq(meldung.status, input.status));
      if (input.q.trim()) {
        const q = `%${input.q.trim()}%`;
        where.push(or(ilike(aussteller.nachname, q), ilike(aussteller.vorname, q), ilike(aussteller.ort, q), ilike(aussteller.verein, q))!);
      }
      const rows = await db
        .select({
          id: meldung.id,
          status: meldung.status,
          eingang: meldung.eingang,
          eingegangenAm: meldung.eingegangenAm,
          istJugend: meldung.istJugend,
          teilschau: meldung.teilschau,
          istPreisrichter: meldung.istPreisrichter,
          vetGeprueftAm: meldung.vetGeprueftAm,
          ausstellerId: aussteller.id,
          name: sql<string>`${aussteller.nachname} || ', ' || ${aussteller.vorname}`,
          ort: aussteller.ort,
          verein: aussteller.verein,
          registriernummer: aussteller.registriernummer,
          // Tabellennamen ausgeschrieben: Ohne Join ließe Drizzle sie weg, und "id" träfe die innere Tabelle.
          tiere: sql<number>`(select count(*)::int from katalogeintrag k where k.meldung_id = "meldung"."id")`,
          bezahltCent: sql<number>`coalesce((select sum(z.betrag_cent)::int from zahlung z where z.meldung_id = "meldung"."id"), 0)`,
        })
        .from(meldung)
        .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
        .where(and(...where))
        .orderBy(asc(aussteller.nachname), asc(aussteller.vorname));
      // Betrag je Meldung berechnen (Gebührenlogik liegt in der Fachschicht, nicht in SQL).
      return Promise.all(rows.map(async (r) => ({ ...r, betragCent: (await meldebetrag(db, r.id)).summeCent })));
    }),

  get: benutzerProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const { m, s } = await ladeMeldung(ctx.benutzer.organisationId, input.id);
    const [a] = await db.select().from(aussteller).where(eq(aussteller.id, m.ausstellerId));
    const [eintraege, zahlungen, betrag, stiftungen] = await Promise.all([
      ladeEintraege(s.id, { nurMeldungId: m.id }),
      db.select().from(zahlung).where(eq(zahlung.meldungId, m.id)).orderBy(asc(zahlung.datum)),
      meldebetrag(db, m.id),
      db.select().from(stiftung).where(eq(stiftung.meldungId, m.id)),
    ]);
    return {
      meldung: m,
      aussteller: fuerRolle(a!, ctx.benutzer.rolle),
      eintraege: eintraege.sort((x, y) => x.position - y.position),
      zahlungen,
      betrag,
      stiftung: stiftungen[0] ?? null,
      link: `${config.publicUrl}/s/${s.slug}/meldung/${m.zugangsToken}`,
    };
  }),

  /** Vorschläge für Ort zur PLZ, Straße, Verein und Kreisverband aus den bisherigen Ausstellern des Vereins. */
  adressVorschlaege: benutzerProcedure.input(z.object({ schauId: dbId }).optional()).query(async ({ ctx, input }) => {
    // In einer Testschau nur ihre eigenen Angaben – echte Adressen sollen nicht in Übungsdaten geraten.
    const s = input ? await ladeSchau(ctx.benutzer.organisationId, input.schauId) : null;
    const zeilen = await db
      .select({ strasse: aussteller.strasse, plz: aussteller.plz, ort: aussteller.ort, verein: aussteller.verein, kreisverband: aussteller.kreisverband })
      .from(aussteller)
      // Gesperrte (Löschwunsch während der Aufbewahrungsfrist) und gelöschte Aussteller liefern keine Vorschläge.
      // Nur echte Aussteller – Adressen aus Testschauen kommen nie in echte Formulare.
      .where(and(eq(aussteller.organisationId, ctx.benutzer.organisationId), s ? ausstellerDerSchau(s) : echteAussteller(), isNull(aussteller.geloeschtAm), isNull(aussteller.gesperrtAm)))
      .limit(20000);
    // Dazu die Vereine aus dem Vereinsverzeichnis (nur Namen und Kreisverband); die eigenen Angaben gehen vor.
    return mitVerzeichnis(zeilen, await verzeichnisVorschlaegeZwischengespeichert());
  }),

  ausstellerSuche: benutzerProcedure.input(z.object({ schauId: dbId, q: z.string().max(200) })).query(async ({ ctx, input }) => {
    // Echte Schauen finden nur echte Aussteller, eine Testschau nur ihre eigenen (services/testschau.ts).
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const q = `%${input.q.trim()}%`;
    const treffer = await db
      .select()
      .from(aussteller)
      .where(
        and(
          eq(aussteller.organisationId, ctx.benutzer.organisationId),
          ausstellerDerSchau(s),
          // Gelöschte und gesperrte Aussteller werden nicht mehr vorgeschlagen.
          isNull(aussteller.gesperrtAm),
          isNull(aussteller.geloeschtAm),
          or(ilike(aussteller.nachname, q), ilike(aussteller.vorname, q), ilike(aussteller.registriernummer, q)),
        ),
      )
      .orderBy(asc(aussteller.nachname))
      .limit(15);
    return treffer.map(({ gesperrtAm: _g, geloeschtAm: _l, testSchauId: _t, ...a }) => fuerRolle(a, ctx.benutzer.rolle));
  }),

  speichern: benutzerProcedure.input(meldungEingabe).mutation(async ({ ctx, input }) => {
    const istAdmin = ctx.benutzer.rolle === "admin";
    const r = await db.transaction((tx) => speichereMeldung(tx, ctx.benutzer.organisationId, input, ctx, { istAdmin, ibanVerdeckt: !istAdmin }));
    await pruefeBezahlt(r.meldungId, ctx);
    return r;
  }),

  statusSetzen: benutzerProcedure
    .input(z.object({ id: dbId, status: z.enum(MELDUNG_STATUS), grund: z.string().max(500).default("") }))
    .mutation(async ({ ctx, input }) => {
      const { m: geladen, s } = await ladeMeldung(ctx.benutzer.organisationId, input.id);
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – der Status einer Meldung lässt sich nicht mehr ändern.");
      // Der verfallene Betrag gehört dem Verein – eine wieder aufgenommene Meldung verrechnete ihn noch einmal.
      if (geladen.verfallenCent > 0 && input.status !== "storniert" && input.status !== "abgelehnt")
        throw fehler("BAD_REQUEST", "Für diese Meldung ist ein Verfall gebucht – sie bleibt storniert bzw. abgelehnt. Bitte eine neue Meldung erfassen.");
      await db.transaction(async (tx) => {
        // Status gesperrt neu lesen: Rechte, Bindungen und Protokoll beruhen auf dem aktuellen Stand (kein Wettlauf mit
        // einer gleichzeitigen Stornierung oder Ablehnung).
        const [frisch] = await tx.select().from(meldung).where(eq(meldung.id, geladen.id)).for("update");
        if (!frisch) throw fehler("NOT_FOUND", "Meldung nicht gefunden.");
        const m = frisch;
        // Helfer bestätigen offene Meldungen (auch ohne Zahlung – bezahlt wird oft erst bei der Einlieferung) und nehmen eine
        // versehentliche Bestätigung zurück (bestätigt → offen, nur solange nichts daran hängt, siehe unten). Ablehnen,
        // Stornieren und Wiederaufnehmen bleibt bei der Ausstellungsleitung.
        const helferDarf = (m.status === "offen" && input.status === "bestaetigt") || (m.status === "bestaetigt" && input.status === "offen");
        if (ctx.benutzer.rolle !== "admin" && !helferDarf) {
          throw fehler("FORBIDDEN", "Ablehnen, Stornieren und Wiederaufnehmen einer Meldung nur durch die Ausstellungsleitung (Administratoren).");
        }
        // Zurück auf „offen“ nur ohne Zahlung – sonst fiele bezahltes Meldegeld aus der Abrechnung.
        if (m.status === "bestaetigt" && input.status === "offen") {
          await sperreKasse(tx, m.schauId);
          const b = await meldebetrag(tx, m.id);
          if (b.bezahltCent !== 0) throw fehler("BAD_REQUEST", "Die Meldung hat schon eine Zahlung – sie kann nicht zurück auf „offen“. Erst die Zahlung stornieren (Ausstellungsleitung).");
        }
        // Eine bestätigte Meldung verlässt den Katalog nur, wenn nichts daran hängt – sonst fiele der Aussteller
        // samt Verkäufen und Preisen aus der Abrechnung.
        // Auch der Umweg bestätigt → offen → storniert ist gesperrt: geprüft wird jeder Wechsel aus „bestätigt“ und
        // jedes Storno bzw. jede Ablehnung.
        if ((m.status === "bestaetigt" && input.status !== "bestaetigt") || input.status === "storniert" || input.status === "abgelehnt") {
          await sperreKasse(tx, m.schauId);
          const ids = (await tx.select({ id: katalogeintrag.id }).from(katalogeintrag).where(eq(katalogeintrag.meldungId, m.id))).map((x) => x.id);
          // Auch eingelieferte Tiere und Einträge im Gesundheitsjournal binden (Tierliste fürs Veterinäramt).
          const gebunden = await bindungen(tx, ids, { statuswechsel: true });
          const quittung = await hatAuszahlung(tx, m.schauId, m.ausstellerId);
          if (quittung != null) gebunden.unshift(`Aussteller ist abgerechnet (Quittung ${quittung})`);
          if ((await offenerLauf(tx, m.schauId))?.posten.some((p) => p.ausstellerId === m.ausstellerId)) gebunden.unshift("Aussteller steht in der offenen SEPA-Datei");
          if (gebunden.length) throw fehler("BAD_REQUEST", `Die Meldung kann nicht mehr ${input.status === "storniert" ? "storniert" : input.status === "abgelehnt" ? "abgelehnt" : "zurückgesetzt"} werden: ${gebunden.join("; ")}.`);
        }
        await tx.update(meldung).set({ status: input.status }).where(eq(meldung.id, m.id));
        if (input.status === "abgelehnt" || input.status === "storniert") {
          // Abgelehnte Tiere verlieren ihre Katalognummer – außer der Katalog ist festgeschrieben: gedruckte Nummern
          // bleiben reserviert und kommen zurück, wenn die Meldung wieder aufgenommen wird.
          const [sch] = await tx.select({ fest: schau.katalogGedruckt }).from(schau).where(eq(schau.id, m.schauId));
          if (!sch?.fest) await tx.update(katalogeintrag).set({ katalogNr: null, suffix: "", status: "gemeldet" }).where(eq(katalogeintrag.meldungId, m.id));
        }
        await protokolliere(tx, {
          schauId: m.schauId,
          tabelle: "meldung",
          datensatzId: m.id,
          aktion: "Status",
          alt: m.status,
          neu: input.status,
          grund: input.grund,
          akteur: ctx,
        });
        // Nummerierte Meldung (Katalog festgeschrieben): die Preisrichter-Bereiche folgen dem neuen Status.
        await einteilungNachStatus(tx, m.schauId, m.id, ctx);
      });
      return { ok: true };
    }),

  zahlungErfassen: benutzerProcedure
    .input(
      z.object({
        meldungId: dbId,
        betragCent: z.number().int().min(-10_000_000).max(10_000_000).refine((v) => v !== 0, "Betrag fehlt."),
        /** Offener Betrag, den die Oberfläche angezeigt hat (Einlieferung): weicht er ab, wurde schon kassiert. */
        erwartetOffenCent: z.number().int().min(-10_000_000).max(10_000_000).optional(),
        // Echtes Kalenderdatum (2026-13-45 ergäbe sonst einen Datenbankfehler).
        datum: kalenderdatum(),
        art: z.enum(["ueberweisung", "bar", "sonstige"]),
        /** Pflicht bei negativen Beträgen (Erstattung). */
        grund: z.string().trim().max(500).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { m, s } = await ladeMeldung(ctx.benutzer.organisationId, input.meldungId);
      if (input.betragCent < 0 && input.grund.length < 3) throw fehler("BAD_REQUEST", "Erstattung (negativer Betrag): bitte einen Grund angeben.");
      // Funktionstrennung: Geld zurückgeben bucht nur die Ausstellungsleitung, ebenso Eingänge auf dem Konto – Helfer
      // sehen keinen Kontoauszug; eine Scheinbuchung „Überweisung“ würde sonst Guthaben für eine Barauszahlung erzeugen.
      if (input.betragCent < 0 && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Erstattungen bucht die Ausstellungsleitung (Administratoren).");
      if (input.art !== "bar" && ctx.benutzer.rolle !== "admin") throw fehler("FORBIDDEN", "Überweisungen und sonstige Eingänge bucht die Ausstellungsleitung (Administratoren) nach dem Kontoauszug.");
      if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen – für Buchungen erst mit Grund zurück zur Abrechnung.");
      const { grund, erwartetOffenCent, ...werte } = input;
      const z = await db.transaction(async (tx) => {
        // Gleiche Sperre wie bei Verkauf und Auszahlung: die Abrechnung sieht immer einen vollständigen Stand.
        await sperreKasse(tx, m.schauId);
        // Doppelt kassieren verhindern (zwei Helfer gleichzeitig, erneuter Klick nach Netzfehler): unter der Sperre neu rechnen.
        const b = await meldebetrag(tx, m.id);
        const offen = gefordertCent(b) - b.bezahltCent;
        if (erwartetOffenCent !== undefined && offen !== erwartetOffenCent) {
          throw fehler("CONFLICT", `Das Meldegeld wurde inzwischen schon kassiert (offen jetzt ${(offen / 100).toFixed(2).replace(".", ",")} €). Bitte die Anzeige neu laden.`);
        }
        // Funktionstrennung: Mehr als offen ist, nimmt ein Helfer nicht an – die Überzahlung stünde sonst gleich zur
        // Barauszahlung bereit (Scheinbuchung und Auszahlung ohne zweites Augenpaar).
        if (ctx.benutzer.rolle !== "admin" && input.betragCent > Math.max(0, offen)) {
          throw fehler("FORBIDDEN", `Offen sind ${formatEuro(Math.max(0, offen))} – mehr bucht nur die Ausstellungsleitung (Überzahlung).`);
        }
        const [z] = await tx.insert(zahlung).values({ ...werte, grund, erfasstVon: ctx.benutzer.id }).returning();
        await protokolliere(tx, { schauId: m.schauId, tabelle: "zahlung", datensatzId: z!.id, aktion: input.betragCent < 0 ? "erstattet" : "erfasst", neu: werte, grund, akteur: ctx });
        return z!;
      });
      // Bares Meldegeld bekommt eine Einzahlungsquittung im Belegarchiv (wie jede Barbewegung im Kassenbuch).
      if (z.art === "bar") await archiviereKassenbeleg(s, "einzahlung", z.id);
      const bestaetigt = await pruefeBezahlt(m.id, ctx);
      return { bestaetigt };
    }),

  /**
   * Erstattungen nach einer Absage gesammelt buchen: für jede stornierte Meldung mit Zahlungseingang eine Gegenbuchung
   * (Überweisung) über den offenen Betrag – nachdem das Geld tatsächlich überwiesen ist. Nur Ausstellungsleitung.
   */
  erstattungenBuchen: adminProcedure
    .input(z.object({ schauId: dbId, datum: kalenderdatum(), meldungIds: z.array(dbId).min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const s = pruefeNichtAbgeschlossen(await ladeSchau(ctx.benutzer.organisationId, input.schauId));
      const anzahl = await db.transaction(async (tx) => {
        await sperreKasse(tx, s.id);
        const offen = (await offeneStornoZahlungen(tx, s.id)).filter((x) => input.meldungIds.includes(x.meldungId) && x.restCent > 0);
        for (const x of offen) {
          const werte = { meldungId: x.meldungId, betragCent: -x.restCent, datum: input.datum, art: "ueberweisung" as const };
          const grund = s.abgesagtAm ? `Erstattung nach Absage der Schau` : "Erstattung (Meldung storniert)";
          const [z] = await tx.insert(zahlung).values({ ...werte, grund, erfasstVon: ctx.benutzer.id }).returning();
          await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: z!.id, aktion: "erstattet", neu: werte, grund, akteur: ctx });
        }
        return offen.length;
      });
      return { ok: true, gebucht: anzahl };
    }),

  /** Stornierte Meldungen mit Zahlungseingang: wem ist was zu erstatten (mit IBAN nur für die Ausstellungsleitung). */
  zuErstatten: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const liste = await offeneStornoZahlungen(db, s.id);
    if (!liste.length) return [];
    const konten = await db
      .select({ meldungId: meldung.id, iban: aussteller.iban, kontoinhaber: aussteller.kontoinhaber })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(inArray(meldung.id, liste.map((x) => x.meldungId)));
    return liste.map((x) => {
      const k = konten.find((y) => y.meldungId === x.meldungId);
      const iban = k?.iban ?? "";
      return { ...x, iban: ctx.benutzer.rolle === "admin" ? iban : verdeckeIban(iban), kontoinhaber: k?.kontoinhaber || x.name };
    });
  }),

  /**
   * Verfall: Das Meldegeld einer stornierten oder abgelehnten Meldung behält der Verein (z. B. Rücktritt nach dem
   * Meldeschluss laut AAB). Nur Ausstellungsleitung, mit Grund, protokolliert. Damit hält die Zahlung den Abschluss
   * nicht mehr auf; erstatten geht weiter über eine Zahlung mit negativem Betrag.
   */
  verfallBuchen: adminProcedure
    .input(z.object({ id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { m, s } = await ladeMeldung(ctx.benutzer.organisationId, input.id);
      pruefeNichtAbgeschlossen(s);
      if (m.status !== "storniert" && m.status !== "abgelehnt") throw fehler("BAD_REQUEST", "Verfall gibt es nur bei stornierten oder abgelehnten Meldungen.");
      await db.transaction(async (tx) => {
        await sperreKasse(tx, m.schauId);
        const [akt] = await tx.select().from(meldung).where(eq(meldung.id, m.id)).for("update");
        const [b] = await tx.select({ s: sum(zahlung.betragCent) }).from(zahlung).where(eq(zahlung.meldungId, m.id));
        const rest = Number(b?.s ?? 0) - akt!.verfallenCent;
        if (rest <= 0) throw fehler("BAD_REQUEST", "Es ist nichts offen, das verfallen könnte (kein Zahlungseingang oder schon erstattet).");
        const verfallenCent = akt!.verfallenCent + rest;
        await tx.update(meldung).set({ verfallenCent, verfallGrund: input.grund, verfallenAm: new Date() }).where(eq(meldung.id, m.id));
        await protokolliere(tx, { schauId: m.schauId, tabelle: "meldung", datensatzId: m.id, aktion: "Verfall", alt: { verfallenCent: akt!.verfallenCent }, neu: { verfallenCent, betragCent: rest }, grund: input.grund, akteur: ctx });
      });
      return { ok: true };
    }),

  /**
   * Falsch erfasste Zahlung stornieren – nur Ausstellungsleitung, mit Grund. Gebucht wird eine Gegenbuchung;
   * die ursprüngliche Zahlung bleibt unverändert stehen (Kassendaten sind unveränderbar).
   */
  zahlungStornieren: adminProcedure
    .input(z.object({ id: dbId, grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const [z] = await db.select().from(zahlung).where(eq(zahlung.id, input.id));
      if (!z) throw fehler("NOT_FOUND", "Zahlung nicht gefunden.");
      const { m, s } = await ladeMeldung(ctx.benutzer.organisationId, z.meldungId);
      // Wie beim Erfassen: in der abgeschlossenen Schau keine Buchung mehr (sonst ein Kassentag ohne Abschluss).
      pruefeNichtAbgeschlossen(s);
      const g = await db.transaction(async (tx) => {
        await sperreKasse(tx, m.schauId);
        if (z.stornoVon) throw fehler("BAD_REQUEST", "Eine Gegenbuchung lässt sich nicht stornieren.");
        const [schon] = await tx.select({ id: zahlung.id }).from(zahlung).where(eq(zahlung.stornoVon, z.id));
        if (schon) throw fehler("CONFLICT", "Diese Zahlung ist bereits storniert.");
        const [g] = await tx
          .insert(zahlung)
          .values({ meldungId: z.meldungId, betragCent: -z.betragCent, datum: heuteDe(), art: z.art, erfasstVon: ctx.benutzer.id, grund: input.grund, stornoVon: z.id })
          .returning();
        await protokolliere(tx, { schauId: m.schauId, tabelle: "zahlung", datensatzId: g!.id, aktion: "storniert", alt: z, neu: g, grund: input.grund, akteur: ctx });
        return g!;
      });
      if (g.art === "bar") await archiviereKassenbeleg(s, "einzahlung", g.id);
      return { ok: true };
    }),

  bestaetigungSenden: benutzerProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const { m, s } = await ladeMeldung(ctx.benutzer.organisationId, input.id);
    // Kein Mailversand in Schleife (Ruf des Absenders, Belästigung des Ausstellers).
    bestaetigungBremse.versuch([`meldung:${m.id}`]);
    const [a] = await db.select().from(aussteller).where(eq(aussteller.id, m.ausstellerId));
    if (!a?.email) throw fehler("BAD_REQUEST", "Der Aussteller hat keine E-Mail-Adresse.");
    const b = await meldebetrag(db, m.id);
    await sendeMail(
      s.organisationId,
      a.email,
      `Meldung ${s.name}`,
      eingangsText(s, anrede(a.vorname, a.nachname), b.summeCent, `${config.publicUrl}/s/${s.slug}/meldung/${m.zugangsToken}`, !!m.onlineZustimmungAm, b.stiftungCent, b.spendeCent),
      a.id,
    );
    return { ok: true };
  }),

  zuletzt: benutzerProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    return db
      .select({ id: meldung.id, name: sql<string>`${aussteller.nachname} || ', ' || ${aussteller.vorname}`, eingang: meldung.eingang, am: meldung.eingegangenAm })
      .from(meldung)
      .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
      .where(eq(meldung.schauId, input.schauId))
      .orderBy(desc(meldung.eingegangenAm))
      .limit(8);
  }),
});
