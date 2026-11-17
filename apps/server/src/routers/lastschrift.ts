/**
 * SEPA-Lastschrift für das Standgeld (Entscheidung 018), nur Administratoren: Gläubiger-ID des Vereins, Mandate der
 * Aussteller, je Schau eine Lastschriftdatei (pain.008) mit allen offenen Meldegeldern von Ausstellern mit gültigem
 * Mandat. Gebucht wird genau der Inhalt der Datei (als Zahlung „Lastschrift“), Rücklastschriften einzeln. Bar und
 * Überweisung bleiben daneben möglich; wer schon bezahlt hat, steht nicht in der Datei.
 */
import { bankarbeitstag, datumIn, EingabeFehler, erzeugeSepaLastschrift, euroIn, istSprache, texte, fruehesteFaelligkeit, gefordertCent, heuteBerlin, imEwr, mandatGueltig, normalisiereGlaeubigerId, normalisiereIban, pruefeGlaeubigerId, pruefeIban, pruefeMandatsreferenz, verdeckeIban, vorgeschlageneFaelligkeit, datumKurz } from "@schau/domain";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db/client";
import { aussteller, auszahlung, bestaetigungSpende, lastschriftLauf, type LastschriftLaufDaten, type LastschriftLaufPosten, meldung, organisation, schau, sepaMandat, spende, zahlung, zuwendungsbestaetigung } from "../db/schema";
import { meldebetraege } from "../services/eintraege";
import { offeneLastschrift, offeneLastschriftenDesVereins, offenerLauf, sperreKasse } from "../services/kasse";
import { sendeMail } from "../services/post";
import { protokolliere } from "../services/protokoll";
import { adminProcedure, dbId, fehler, kalenderdatum, ladeSchau, router } from "../trpc";

const datum = kalenderdatum();

/**
 * Was jetzt eingezogen würde: bestätigte Meldungen mit offenem Meldegeld und gültigem Mandat zur Fälligkeit. Nicht
 * dabei ist, wessen Meldegeld die Kasse schon verrechnet hat (gültige Auszahlung oder offene SEPA-Überweisung) – das
 * zöge die Bank sonst ein zweites Mal ein. Ein einmaliges Mandat steht in höchstens einer offenen Datei.
 */
async function posten(tx: Tx, organisationId: number, schauId: number, faelligAm: string, opts: { sperren?: boolean } = {}) {
  const meldungen = await tx
    .select({ id: meldung.id, ausstellerId: meldung.ausstellerId, istJugend: meldung.istJugend, istPreisrichter: meldung.istPreisrichter, sprache: meldung.sprache, vorname: aussteller.vorname, nachname: aussteller.nachname, email: aussteller.email })
    .from(meldung)
    .innerJoin(aussteller, eq(aussteller.id, meldung.ausstellerId))
    .where(and(eq(meldung.schauId, schauId), eq(meldung.status, "bestaetigt")));
  const betraege = await meldebetraege(tx, schauId, meldungen);
  // Beim Erstellen unter Zeilensperre: ein gleichzeitiger Widerruf wartet und sieht danach die offene Datei, eine
  // gleichzeitige Datei einer anderen Schau sieht danach das schon vergebene Einmal-Mandat.
  const mandatWo = and(eq(sepaMandat.organisationId, organisationId), inArray(sepaMandat.ausstellerId, meldungen.map((m) => m.ausstellerId)));
  const mandate = !meldungen.length ? [] : opts.sperren ? await tx.select().from(sepaMandat).where(mandatWo).for("update") : await tx.select().from(sepaMandat).where(mandatWo);
  const abgerechnet = new Set([
    ...(await tx.select({ id: auszahlung.ausstellerId }).from(auszahlung).where(and(eq(auszahlung.schauId, schauId), isNull(auszahlung.storniertAm)))).map((x) => x.id),
    ...((await offenerLauf(tx, schauId))?.posten.map((p) => p.ausstellerId) ?? []),
  ]);
  // Einmalige Mandate in offenen Dateien anderer Schauen des Vereins (gebucht gelten sie über letzteNutzungAm als genutzt).
  const einmalVergeben = new Set((await offeneLastschriftenDesVereins(tx, organisationId)).filter((l) => l.schauId !== schauId).flatMap((l) => l.daten.posten.filter((p) => !p.wiederkehrend).map((p) => p.mandatId)));
  const liste: (LastschriftLaufPosten & { email: string; sprache: string })[] = [];
  const ohne: { name: string; grund: string; offenCent: number }[] = [];
  for (const m of meldungen) {
    const b = betraege.get(m.id)!;
    const offen = gefordertCent(b) - b.bezahltCent;
    if (offen <= 0 || abgerechnet.has(m.ausstellerId)) continue;
    const name = `${m.nachname}, ${m.vorname}`;
    const eigene = mandate.filter((x) => x.ausstellerId === m.ausstellerId).sort((a, c) => c.id - a.id);
    const grund = (x: (typeof eigene)[number]) =>
      mandatGueltig(x, faelligAm) ?? (pruefeIban(x.iban) ? "IBAN des Mandats ungültig." : null) ?? (!imEwr(x.iban) ? "Konto außerhalb von EU/EWR." : null) ?? (!x.wiederkehrend && einmalVergeben.has(x.id) ? "Das einmalige Mandat steht schon in einer anderen Lastschriftdatei." : null);
    const gueltig = eigene.find((x) => !grund(x));
    if (!gueltig) {
      if (eigene.length) ohne.push({ name, grund: grund(eigene[0]!)!, offenCent: offen });
      continue;
    }
    if (!gueltig.wiederkehrend) einmalVergeben.add(gueltig.id);
    liste.push({ meldungId: m.id, ausstellerId: m.ausstellerId, mandatId: gueltig.id, name, kontoinhaber: gueltig.kontoinhaber || name, iban: gueltig.iban, betragCent: offen, mandatsreferenz: gueltig.referenz, unterschriebenAm: gueltig.unterschriebenAm, wiederkehrend: gueltig.wiederkehrend, email: m.email, sprache: m.sprache });
  }
  return { liste, ohne };
}

async function glaeubiger(tx: Pick<Tx, "select">, organisationId: number, s: { vereinKontoinhaber: string; vereinIban: string; vereinBic: string; veranstalter: string }) {
  const [o] = await tx.select({ name: organisation.name, glaeubigerId: organisation.glaeubigerId }).from(organisation).where(eq(organisation.id, organisationId));
  return { name: s.vereinKontoinhaber || o?.name || s.veranstalter, iban: s.vereinIban, bic: s.vereinBic, glaeubigerId: o?.glaeubigerId ?? "" };
}

function xmlAus(s: { id: number; name: string }, l: { nachrichtId: string; faelligAm: string; daten: LastschriftLaufDaten }) {
  return erzeugeSepaLastschrift({
    nachrichtId: l.nachrichtId,
    erstelltAm: new Date(l.daten.erstelltAm),
    faelligAm: l.faelligAm,
    glaeubiger: l.daten.glaeubiger,
    posten: l.daten.posten.map((p) => ({
      endToEndId: `S${s.id}-M${p.meldungId}-${l.nachrichtId.split("-").pop()}`,
      name: p.kontoinhaber,
      iban: p.iban,
      betragCent: p.betragCent,
      verwendungszweck: `${s.name} Meldegeld ${p.name}`,
      mandatsreferenz: p.mandatsreferenz,
      unterschriebenAm: p.unterschriebenAm,
      wiederkehrend: p.wiederkehrend,
    })),
  });
}

const mandatEingabe = z.object({
  ausstellerId: dbId,
  referenz: z.string().trim().max(35).default(""),
  unterschriebenAm: datum,
  wiederkehrend: z.boolean(),
  iban: z.string().trim().max(50),
  kontoinhaber: z.string().trim().max(70),
});

export const lastschriftRouter = router({
  einstellungen: adminProcedure.query(async ({ ctx }) => {
    const [o] = await db.select({ glaeubigerId: organisation.glaeubigerId }).from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId));
    return { glaeubigerId: o?.glaeubigerId ?? "" };
  }),

  glaeubigerIdSetzen: adminProcedure.input(z.object({ glaeubigerId: z.string().max(40) })).mutation(async ({ ctx, input }) => {
    const id = normalisiereGlaeubigerId(input.glaeubigerId);
    if (id) {
      const f = pruefeGlaeubigerId(id);
      if (f) throw fehler("BAD_REQUEST", f);
    }
    await db.transaction(async (tx) => {
      const [alt] = await tx.select({ g: organisation.glaeubigerId }).from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId));
      if (alt?.g === id) return;
      await tx.update(organisation).set({ glaeubigerId: id }).where(eq(organisation.id, ctx.benutzer.organisationId));
      await protokolliere(tx, { schauId: null, tabelle: "organisation", datensatzId: ctx.benutzer.organisationId, aktion: "Gläubiger-ID", alt: alt?.g ?? "", neu: id, akteur: ctx });
    });
    return { glaeubigerId: id };
  }),

  /** Mandate eines Ausstellers (IBAN gekürzt). */
  mandate: adminProcedure.input(z.object({ ausstellerId: dbId })).query(async ({ ctx, input }) => {
    const liste = await db.select().from(sepaMandat).where(and(eq(sepaMandat.organisationId, ctx.benutzer.organisationId), eq(sepaMandat.ausstellerId, input.ausstellerId))).orderBy(desc(sepaMandat.id));
    const h = heuteBerlin();
    return liste.map((m) => ({ id: m.id, referenz: m.referenz, unterschriebenAm: m.unterschriebenAm, wiederkehrend: m.wiederkehrend, iban: verdeckeIban(m.iban), kontoinhaber: m.kontoinhaber, widerrufenAm: m.widerrufenAm, letzteNutzungAm: m.letzteNutzungAm, gueltig: mandatGueltig(m, h) }));
  }),

  /** Mandat erfassen (unterschriebenes Formular). Ohne Referenz vergibt SchauFUCHS eine eindeutige. */
  mandatAnlegen: adminProcedure.input(mandatEingabe).mutation(async ({ ctx, input }) => {
    const org = ctx.benutzer.organisationId;
    const iban = normalisiereIban(input.iban);
    const ibanFehler = pruefeIban(iban);
    if (ibanFehler) throw fehler("BAD_REQUEST", ibanFehler);
    // Außerhalb von EU/EWR (z. B. CH, GB) verlangt die Lastschrift zusätzlich BIC und Anschrift des Zahlers – nicht vorgesehen.
    if (!imEwr(iban)) throw fehler("BAD_REQUEST", "Lastschrift nur von Konten in EU/EWR – für andere Länder bräuchte sie BIC und Anschrift. Bitte bar oder per Überweisung.");
    if (input.unterschriebenAm > heuteBerlin()) throw fehler("BAD_REQUEST", "Das Datum der Unterschrift liegt in der Zukunft.");
    return db.transaction(async (tx) => {
      const [a] = await tx.select({ id: aussteller.id, vorname: aussteller.vorname, nachname: aussteller.nachname, testSchauId: aussteller.testSchauId, gesperrtAm: aussteller.gesperrtAm, geloeschtAm: aussteller.geloeschtAm }).from(aussteller).where(and(eq(aussteller.id, input.ausstellerId), eq(aussteller.organisationId, org))).for("update");
      if (!a) throw fehler("NOT_FOUND", "Aussteller nicht gefunden.");
      // Nach Löschwunsch (Art. 17) oder bei Einschränkung (Art. 18) keine neuen Bankdaten zu dieser Person.
      if (a.gesperrtAm || a.geloeschtAm) throw fehler("BAD_REQUEST", "Die Daten dieses Ausstellers sind gelöscht bzw. gesperrt – kein neues Mandat.");
      // Die Nummer des Mandats (nicht die Anzahl): eine Referenz kommt nie zweimal vor, auch nicht nach der Bereinigung.
      const [{ id }] = (await tx.execute(sql`select nextval(pg_get_serial_sequence('sepa_mandat', 'id'))::int as id`)) as unknown as [{ id: number }];
      const referenz = input.referenz || `SF-M${id}`;
      const rf = pruefeMandatsreferenz(referenz);
      if (rf) throw fehler("BAD_REQUEST", rf);
      const [doppelt] = await tx.select({ id: sepaMandat.id }).from(sepaMandat).where(and(eq(sepaMandat.organisationId, org), eq(sepaMandat.referenz, referenz)));
      if (doppelt) throw fehler("CONFLICT", `Die Mandatsreferenz „${referenz}“ gibt es schon.`);
      const [m] = await tx
        .insert(sepaMandat)
        .values({ id, organisationId: org, ausstellerId: a.id, referenz, unterschriebenAm: input.unterschriebenAm, wiederkehrend: input.wiederkehrend, iban, kontoinhaber: input.kontoinhaber || `${a.vorname} ${a.nachname}`, erstelltVon: ctx.benutzer.id })
        .returning({ id: sepaMandat.id });
      await protokolliere(tx, { schauId: a.testSchauId, tabelle: "aussteller", datensatzId: a.id, aktion: "SEPA-Mandat erfasst", neu: { referenz, unterschriebenAm: input.unterschriebenAm, wiederkehrend: input.wiederkehrend, iban: verdeckeIban(iban) }, akteur: ctx });
      return { id: m!.id, referenz };
    });
  }),

  mandatWiderrufen: adminProcedure.input(z.object({ id: dbId, am: datum })).mutation(async ({ ctx, input }) => {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(sepaMandat).where(and(eq(sepaMandat.id, input.id), eq(sepaMandat.organisationId, ctx.benutzer.organisationId))).for("update");
      if (!m) throw fehler("NOT_FOUND", "Mandat nicht gefunden.");
      if (m.widerrufenAm) throw fehler("BAD_REQUEST", "Das Mandat ist schon widerrufen.");
      // Die offene Datei enthält das Mandat fest; ein Widerruf danach ginge unbemerkt mit zur Bank.
      if ((await offeneLastschriftenDesVereins(tx, m.organisationId)).some((l) => l.daten.posten.some((p) => p.mandatId === m.id)))
        throw fehler("CONFLICT", "Das Mandat steht in einer offenen Lastschriftdatei – erst die Datei verwerfen (oder nach dem Einzug buchen), dann widerrufen.");
      await tx.update(sepaMandat).set({ widerrufenAm: input.am }).where(eq(sepaMandat.id, m.id));
      await protokolliere(tx, { schauId: null, tabelle: "aussteller", datensatzId: m.ausstellerId, aktion: "SEPA-Mandat widerrufen", neu: { referenz: m.referenz, am: input.am }, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Vorschau: was jetzt eingezogen würde, wer ein ungültiges Mandat hat, die offene Datei und frühere Läufe. */
  uebersicht: adminProcedure.input(z.object({ schauId: dbId, faelligAm: datum.optional() })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const frueheste = fruehesteFaelligkeit(heuteBerlin());
    // Ohne Angabe 14 Tage (Vorabankündigung); ein früheres als das früheste Datum gibt es nicht.
    const faellig = input.faelligAm && input.faelligAm >= frueheste ? input.faelligAm : vorgeschlageneFaelligkeit(heuteBerlin());
    return db.transaction(async (tx) => {
      const g = await glaeubiger(tx, ctx.benutzer.organisationId, s);
      const offen = await offeneLastschrift(tx, s.id);
      const { liste, ohne } = await posten(tx, ctx.benutzer.organisationId, s.id, faellig);
      const laeufe = await tx.select().from(lastschriftLauf).where(eq(lastschriftLauf.schauId, s.id)).orderBy(desc(lastschriftLauf.id));
      return {
        frueheste,
        faelligAm: faellig,
        sperre: pruefeGlaeubigerId(g.glaeubigerId) ? "Unter „Verein und Datenschutz“ fehlt die Gläubiger-ID des Vereins." : pruefeIban(g.iban) ? "In den Einstellungen der Schau fehlt das Vereinskonto (IBAN)." : null,
        vorschau: liste.map((p) => ({ meldungId: p.meldungId, name: p.name, betragCent: p.betragCent, mandatsreferenz: p.mandatsreferenz, iban: verdeckeIban(p.iban) })),
        ohneGueltigesMandat: ohne,
        laeufe: laeufe.map((l) => ({ id: l.id, nachrichtId: l.nachrichtId, faelligAm: l.faelligAm, status: l.status, summeCent: l.daten.summeCent, anzahl: l.daten.posten.length, createdAt: l.createdAt, posten: l.daten.posten.map((p) => ({ meldungId: p.meldungId, name: p.name, betragCent: p.betragCent, zurueck: !!p.zurueck })) })),
        offen: offen ? { nachrichtId: offen.nachrichtId } : null,
      };
    });
  }),

  /** Lastschriftdatei festlegen; auf Wunsch geht an jeden Zahler mit E-Mail die Vorabankündigung. */
  erstellen: adminProcedure.input(z.object({ schauId: dbId, faelligAm: datum, vorabankuendigung: z.boolean() })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    const frueheste = fruehesteFaelligkeit(heuteBerlin());
    if (input.faelligAm < frueheste) throw fehler("BAD_REQUEST", `Frühestes Fälligkeitsdatum ist der ${datumKurz(frueheste)}.`);
    if (!bankarbeitstag(input.faelligAm)) throw fehler("BAD_REQUEST", "Die Fälligkeit muss ein Bankarbeitstag sein (kein Wochenende, kein Bankfeiertag).");
    const ergebnis = await db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      // Unter der Sperre frisch: ein gleichzeitiger Abschluss nimmt dieselbe Sperre (routers/schau.ts phaseSetzen).
      const [frisch] = await tx.select({ phase: schau.phase }).from(schau).where(eq(schau.id, s.id));
      if (frisch?.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
      if (await offeneLastschrift(tx, s.id)) throw fehler("CONFLICT", "Es gibt schon eine offene Lastschriftdatei. Erst buchen oder verwerfen.");
      const g = await glaeubiger(tx, ctx.benutzer.organisationId, s);
      const { liste } = await posten(tx, ctx.benutzer.organisationId, s.id, input.faelligAm, { sperren: true });
      if (!liste.length) throw fehler("BAD_REQUEST", "Kein offenes Meldegeld bei Ausstellern mit gültigem Mandat.");
      const nachrichtId = `SF-L${s.id}-${Date.now().toString(36).toUpperCase()}`;
      const daten: LastschriftLaufDaten = { posten: liste.map(({ email: _e, sprache: _s, ...p }) => p), glaeubiger: g, summeCent: liste.reduce((n, p) => n + p.betragCent, 0), erstelltAm: new Date().toISOString() };
      try {
        xmlAus(s, { nachrichtId, faelligAm: input.faelligAm, daten }); // prüft Gläubiger-ID, IBANs und Beträge vorher
      } catch (e) {
        if (e instanceof EingabeFehler) throw fehler("BAD_REQUEST", e.message);
        throw e;
      }
      await tx.insert(lastschriftLauf).values({ schauId: s.id, nachrichtId, faelligAm: input.faelligAm, daten, erstelltVon: ctx.benutzer.id });
      await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: null, aktion: "Lastschriftdatei erstellt", neu: { nachrichtId, faelligAm: input.faelligAm, anzahl: liste.length, summeCent: daten.summeCent }, akteur: ctx });
      return { nachrichtId, liste, g };
    });
    // Vorabankündigung (Pre-Notification) nach dem Speichern – an alle mit E-Mail-Adresse.
    let angekuendigt = 0;
    if (input.vorabankuendigung) {
      for (const p of ergebnis.liste) {
        if (!p.email) continue;
        // In der Sprache der Meldung (Entscheidung 020).
        const sprache = istSprache(p.sprache) ? p.sprache : "de";
        const t = texte(sprache).mail;
        const text = [
          t.gutenTag(p.name.split(", ").reverse().join(" ")),
          "",
          t.lastschrift(s.name, euroIn(p.betragCent, sprache), sprache === "de" ? datumKurz(input.faelligAm) : datumIn(input.faelligAm, sprache), verdeckeIban(p.iban)),
          "",
          t.mandatsreferenz(p.mandatsreferenz),
          t.glaeubigerId(ergebnis.g.glaeubigerId),
          "",
          t.deckung,
          "",
          ergebnis.g.name,
        ].join("\n");
        await sendeMail(ctx.benutzer.organisationId, p.email, t.betreffLastschrift(s.name), text, p.ausstellerId);
        angekuendigt++;
      }
    }
    return { nachrichtId: ergebnis.nachrichtId, anzahl: ergebnis.liste.length, angekuendigt };
  }),

  /** Die XML-Datei der offenen Lastschrift (bei jedem Abruf derselbe Inhalt). */
  datei: adminProcedure.input(z.object({ schauId: dbId })).query(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    const l = await offeneLastschrift(db, s.id);
    if (!l) throw fehler("NOT_FOUND", "Keine offene Lastschriftdatei.");
    return { dateiname: `lastschrift-${l.nachrichtId}.xml`, xml: xmlAus(s, l) };
  }),

  verwerfen: adminProcedure.input(z.object({ schauId: dbId, nachrichtId: z.string().max(40), grund: z.string().trim().min(3, "Bitte einen Grund angeben.").max(300) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    await db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const l = await offeneLastschrift(tx, s.id);
      if (!l || l.nachrichtId !== input.nachrichtId) throw fehler("CONFLICT", "Diese Lastschriftdatei ist nicht mehr offen.");
      await tx.update(lastschriftLauf).set({ status: "verworfen", abgeschlossenAm: new Date(), daten: ohneBankdaten(l.daten) }).where(eq(lastschriftLauf.id, l.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: null, aktion: "Lastschriftdatei verworfen", neu: { nachrichtId: l.nachrichtId }, grund: input.grund, akteur: ctx });
    });
    return { ok: true };
  }),

  /** Die Bank hat eingezogen: je Posten eine Zahlung „Lastschrift“ zum Fälligkeitstag, Mandate als genutzt markiert. */
  buchen: adminProcedure.input(z.object({ schauId: dbId, nachrichtId: z.string().max(40) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    return db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const l = await offeneLastschrift(tx, s.id);
      if (!l || l.nachrichtId !== input.nachrichtId) throw fehler("CONFLICT", "Diese Lastschriftdatei ist nicht mehr offen.");
      for (const p of l.daten.posten) {
        const [z] = await tx.insert(zahlung).values({ meldungId: p.meldungId, betragCent: p.betragCent, datum: l.faelligAm, art: "lastschrift", grund: `Lastschrift ${l.nachrichtId}`, erfasstVon: ctx.benutzer.id }).returning({ id: zahlung.id });
        await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: z!.id, aktion: "erfasst", neu: { meldungId: p.meldungId, betragCent: p.betragCent, art: "lastschrift", datum: l.faelligAm }, akteur: ctx });
        // Die späteste Fälligkeit zählt: eine ältere Datei, später gebucht, setzt die Nutzung nicht zurück (Verfall, Löschfrist).
        await tx.update(sepaMandat).set({ letzteNutzungAm: sql`greatest(coalesce(${sepaMandat.letzteNutzungAm}, ${l.faelligAm}::date), ${l.faelligAm}::date)` }).where(eq(sepaMandat.id, p.mandatId));
      }
      await tx.update(lastschriftLauf).set({ status: "gebucht", abgeschlossenAm: new Date(), daten: ohneBankdaten(l.daten) }).where(eq(lastschriftLauf.id, l.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: null, aktion: "Lastschriften gebucht", neu: { nachrichtId: l.nachrichtId, anzahl: l.daten.posten.length, summeCent: l.daten.summeCent }, akteur: ctx });
      return { anzahl: l.daten.posten.length, summeCent: l.daten.summeCent };
    });
  }),

  /** Rücklastschrift: der Betrag kam zurück – Gegenbuchung, das Meldegeld ist wieder offen. */
  ruecklastschrift: adminProcedure.input(z.object({ schauId: dbId, laufId: dbId, meldungId: dbId, grund: z.string().trim().min(3, "Bitte den Grund der Bank angeben.").max(300) })).mutation(async ({ ctx, input }) => {
    const s = await ladeSchau(ctx.benutzer.organisationId, input.schauId);
    if (s.phase === "abgeschlossen") throw fehler("BAD_REQUEST", "Die Schau ist abgeschlossen.");
    return db.transaction(async (tx) => {
      await sperreKasse(tx, s.id);
      const [l] = await tx.select().from(lastschriftLauf).where(and(eq(lastschriftLauf.id, input.laufId), eq(lastschriftLauf.schauId, s.id))).for("update");
      if (!l || l.status !== "gebucht") throw fehler("BAD_REQUEST", "Nur gebuchte Lastschriften lassen sich zurückbuchen.");
      const p = l.daten.posten.find((x) => x.meldungId === input.meldungId);
      if (!p) throw fehler("NOT_FOUND", "Diese Meldung steht nicht in der Lastschrift.");
      if (p.zurueck) throw fehler("BAD_REQUEST", "Die Rücklastschrift ist schon gebucht.");
      // Eine Spende mit dem Meldegeld gilt mit dem Einzug als eingegangen; ist sie schon bestätigt, wäre die
      // Zuwendungsbestätigung nach der Rückbuchung falsch (§ 10b Abs. 4 EStG) – erst sie stornieren.
      const [zb] = await tx
        .select({ nummer: zuwendungsbestaetigung.nummer })
        .from(spende)
        .innerJoin(bestaetigungSpende, eq(bestaetigungSpende.spendeId, spende.id))
        .innerJoin(zuwendungsbestaetigung, eq(zuwendungsbestaetigung.id, bestaetigungSpende.bestaetigungId))
        .where(and(eq(spende.meldungId, p.meldungId), isNull(spende.storniertAm), isNull(zuwendungsbestaetigung.storniertAm)))
        .limit(1);
      if (zb) throw fehler("CONFLICT", `Zur Spende mit diesem Meldegeld gibt es die Zuwendungsbestätigung Nr. ${zb.nummer}. Bitte erst die Bestätigung stornieren (Spenden), dann die Rücklastschrift buchen.`);
      const [z] = await tx.insert(zahlung).values({ meldungId: p.meldungId, betragCent: -p.betragCent, datum: heuteBerlin(), art: "lastschrift", grund: `Rücklastschrift ${l.nachrichtId}: ${input.grund}`, erfasstVon: ctx.benutzer.id }).returning({ id: zahlung.id });
      await tx.update(lastschriftLauf).set({ daten: { ...l.daten, posten: l.daten.posten.map((x) => (x.meldungId === p.meldungId ? { ...x, zurueck: true } : x)) } }).where(eq(lastschriftLauf.id, l.id));
      await protokolliere(tx, { schauId: s.id, tabelle: "zahlung", datensatzId: z!.id, aktion: "Rücklastschrift", neu: { meldungId: p.meldungId, betragCent: -p.betragCent }, grund: input.grund, akteur: ctx });
      return { ok: true };
    });
  }),
});

/** Nach Buchen oder Verwerfen bleibt nur, wer wie viel – keine Bankdaten (wie beim Überweisungslauf). */
function ohneBankdaten(d: LastschriftLaufDaten): LastschriftLaufDaten {
  return { ...d, glaeubiger: { ...d.glaeubiger, iban: "", bic: "" }, posten: d.posten.map((p) => ({ ...p, iban: "", kontoinhaber: "" })) };
}
