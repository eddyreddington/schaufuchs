/** Anmeldung: Status, Ersteinrichtung, Anmelden (auch zweiter Schritt), Abmelden, eigenes Passwort und eigene Sprache. */
import { abmeldungLesen, SPRACHEN } from "@schau/domain";
import { and, count, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { beendeSitzung, cookieHeader, hashPasswort, neueSitzung, pruefePasswort, sitzungsId, sitzungWennUnveraendert } from "../../auth";
import { config } from "../../config";
import { db } from "../../db/client";
import { benutzer, organisation, schau, sitzung } from "../../db/schema";
import { protokolliere } from "../../services/protokoll";
import { BEREITS_EINGERICHTET, ersteinrichtungAngaben, richteEinMitPasswort } from "../../services/ersteinrichtung";
import { beendeZweiterSchritt, hashNotfallcode, ladeZweiterSchritt, pruefeTotp, starteZweiterSchritt, zweiterSchrittFehlgeschlagen } from "../../services/zweifaktor";
import { benutzerProcedure, fehler, publicProcedure } from "../../trpc";
import { passwort, MAX_AGE, bremse, bremseJeAdresse, wartezeitJeKonto, codeBremse, passwortBremse, dummyHash, gleich } from "./gemeinsam";

export const anmeldung = {
  status: publicProcedure.query(async ({ ctx }) => {
    const [r] = await db.select({ n: count() }).from(benutzer);
    let organisationName: string | null = null;
    let abmeldungBenutzer: number | null = null;
    if (ctx.benutzer) {
      const [o] = await db.select().from(organisation).where(eq(organisation.id, ctx.benutzer.organisationId));
      organisationName = o?.name ?? null;
      abmeldungBenutzer = abmeldungLesen(o?.abmeldung)[ctx.benutzer.rolle];
    }
    // Schau der Preisrichter-Sitzung: das Tablet prüft, ob sie zum aufgerufenen Link gehört.
    const [rs] = ctx.richter
      ? await db.select({ slug: schau.slug, abmeldung: organisation.abmeldung }).from(schau).innerJoin(organisation, eq(organisation.id, schau.organisationId)).where(eq(schau.id, ctx.richter.schauId))
      : [];
    const richterSlug = rs?.slug ?? null;
    return {
      eingerichtet: (r?.n ?? 0) > 0,
      benutzer: ctx.benutzer,
      richter: ctx.richter ? { ...ctx.richter, slug: richterSlug } : null,
      organisationName,
      appName: config.appName,
      einrichtungsCodeNoetig: !!config.einrichtungsCode,
      /** Administrator ohne 2FA: die Oberfläche führt zuerst zur Einrichtung. */
      zweiFaktorPflicht: !!ctx.benutzer?.zweiFaktorPflicht,
      /** Automatische Abmeldung nach so vielen Minuten ohne Eingabe (Büro bzw. Tablet). */
      abmeldung: { benutzer: abmeldungBenutzer, richter: rs ? abmeldungLesen(rs.abmeldung).preisrichter : null },
    };
  }),

  /** Ersteinrichtung: legt Verein und ersten Administrator an. Nur solange es keine Benutzer gibt. */
  einrichten: publicProcedure
    .input(ersteinrichtungAngaben.extend({ passwort, code: z.string().max(200).default("") }))
    .mutation(async ({ ctx, input }) => {
      const erfolg = bremse.versuch([`ip:${ctx.ip}`]);
      if (config.einrichtungsCode && !gleich(input.code, config.einrichtungsCode)) throw fehler("FORBIDDEN", "Der Einrichtungscode stimmt nicht.");
      erfolg();
      const b = await richteEinMitPasswort(input);
      if (!b) throw fehler("FORBIDDEN", BEREITS_EINGERICHTET);
      ctx.setCookie(cookieHeader(await neueSitzung({ benutzerId: b.id }), MAX_AGE));
      return { ok: true };
    }),

  anmelden: publicProcedure
    .input(z.object({ email: z.string().max(200), passwort: z.string().max(200) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      // Erst alle Bremsen prüfen, dann zählen: ein abgewiesener Versuch verbraucht so keinen Zähler einer anderen Stufe
      // (sonst sperrten abgewiesene Anmeldungen am Ende ein ganzes Netz).
      const kGeraet = [`ip:${ctx.ip}:${email}`];
      const kAdresse = [`ip:${ctx.ip}`];
      const ohneAdressSperre = wartezeitJeKonto.istAusgenommen(`mail:${email}`, ctx.ip);
      bremse.pruefe(kGeraet);
      if (!ohneAdressSperre) bremseJeAdresse.pruefe(kAdresse);
      wartezeitJeKonto.pruefe(`mail:${email}`, ctx.ip);
      const zurueckGeraet = bremse.versuch(kGeraet);
      const zurueckAdresse = ohneAdressSperre ? () => {} : bremseJeAdresse.versuch(kAdresse);
      const zurueckKonto = wartezeitJeKonto.versuch(`mail:${email}`, ctx.ip);
      let ok = false;
      const [b] = await db.select().from(benutzer).where(eq(benutzer.email, email));
      try {
        ok = await pruefePasswort(input.passwort, b?.passwortHash ?? (await dummyHash));
      } catch (e) {
        // Nicht geprüft (z. B. Server ausgelastet): zählt nicht als Fehlversuch.
        zurueckGeraet();
        zurueckAdresse();
        zurueckKonto(false);
        throw e;
      }
      if (!b || !b.aktiv || b.geloeschtAm || !ok) throw fehler("UNAUTHORIZED", "E-Mail oder Passwort stimmt nicht.");
      zurueckGeraet();
      zurueckAdresse();
      if (b.totpAktivSeit) {
        // Passwort stimmt, die Sitzung gibt es erst mit dem zweiten Faktor. Die Adresse gilt erst danach als bekannt.
        zurueckKonto(false);
        return { ok: false as const, zweiterFaktor: true as const, token: starteZweiterSchritt(b.id, ctx.ip, b) };
      }
      // Sitzung nur, wenn sich das Konto während der Passwortprüfung nicht geändert hat (Reset, Sperre, 2FA, Adresse).
      const sitzungToken = await sitzungWennUnveraendert(b);
      zurueckKonto(true);
      ctx.setCookie(cookieHeader(sitzungToken, MAX_AGE));
      return { ok: true as const, zweiterFaktor: false as const, token: "" };
    }),

  /** Zweiter Schritt der Anmeldung: Code aus der Authenticator-App oder ein Notfallcode. */
  anmeldenCode: publicProcedure
    .input(z.object({ token: z.string().max(100), code: z.string().trim().max(20) }))
    .mutation(async ({ ctx, input }) => {
      const z2 = ladeZweiterSchritt(input.token);
      if (!z2) throw fehler("UNAUTHORIZED", "Die Anmeldung ist abgelaufen. Bitte noch einmal mit Passwort anmelden.");
      const kKonto = [`konto:${z2.benutzerId}`];
      const zurueck = codeBremse.versuch(kKonto);
      const [b] = await db.select().from(benutzer).where(eq(benutzer.id, z2.benutzerId));
      if (!b || !b.aktiv || b.geloeschtAm || !b.totpAktivSeit || !b.totpGeheim) {
        beendeZweiterSchritt(input.token);
        throw fehler("UNAUTHORIZED", "Die Anmeldung ist abgelaufen. Bitte noch einmal mit Passwort anmelden.");
      }
      let gueltig = false;
      const schritt = pruefeTotp(b.totpGeheim, input.code, b.totpLetzterSchritt);
      if (schritt != null) {
        // Nur einmal annehmen, auch bei zwei gleichzeitigen Anfragen mit demselben Code.
        const n = await db.update(benutzer).set({ totpLetzterSchritt: schritt }).where(and(eq(benutzer.id, b.id), lt(benutzer.totpLetzterSchritt, schritt))).returning({ id: benutzer.id });
        gueltig = n.length === 1;
      } else if (/^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(input.code)) {
        const hash = hashNotfallcode(input.code);
        if (b.totpNotfall.includes(hash)) {
          // In SQL entfernen, nicht die vorher gelesene Liste zurückschreiben: zwei gleichzeitig eingelöste Codes
          // machten sonst einen schon verbrauchten wieder gültig.
          const n = await db
            .update(benutzer)
            .set({ totpNotfall: sql`${benutzer.totpNotfall} - ${hash}::text` })
            .where(and(eq(benutzer.id, b.id), sql`${benutzer.totpNotfall} ? ${hash}`))
            .returning({ id: benutzer.id });
          gueltig = n.length === 1;
        }
      }
      if (!gueltig) {
        zweiterSchrittFehlgeschlagen(input.token);
        throw fehler("UNAUTHORIZED", "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.");
      }
      zurueck();
      beendeZweiterSchritt(input.token);
      // Jetzt gilt die Adresse als bekannt (Schutz vor Sperren durch Fremde, wie bei der Anmeldung ohne zweiten Faktor).
      try {
        wartezeitJeKonto.versuch(`mail:${b.email}`, z2.ip)(true);
      } catch {
        /* Wartezeit läuft gerade – die Anmeldung gelingt trotzdem, nur ohne Merken der Adresse. */
      }
      // Auch hier: nur, wenn sich das Konto seit dem Passwort nicht geändert hat (z. B. Reset durch die AL dazwischen).
      ctx.setCookie(cookieHeader(await sitzungWennUnveraendert(z2.stand), MAX_AGE));
      return { ok: true as const, notfallUebrig: b.totpNotfall.length - (schritt == null ? 1 : 0) };
    }),

  abmelden: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.cookieTokens.benutzer) await beendeSitzung(ctx.cookieTokens.benutzer);
    ctx.setCookie(cookieHeader("", 0));
    return { ok: true };
  }),

  passwortAendern: benutzerProcedure
    .input(z.object({ alt: z.string().max(500), neu: passwort }))
    .mutation(async ({ ctx, input }) => {
      // Gebremst wie das Einrichten der 2FA: wer eine fremde Sitzung erwischt, kann so nicht das Passwort durchprobieren.
      const zurueck = passwortBremse.versuch([`konto:${ctx.benutzer.id}`]);
      const [b] = await db.select().from(benutzer).where(eq(benutzer.id, ctx.benutzer.id));
      if (!b || !(await pruefePasswort(input.alt, b.passwortHash))) throw fehler("BAD_REQUEST", "Das bisherige Passwort stimmt nicht.");
      zurueck();
      const hash = await hashPasswort(input.neu);
      await db.transaction(async (tx) => {
        // Nur auf den geprüften Stand (Entscheidung 033): Setzt die Ausstellungsleitung zwischen Prüfen und Speichern ein
        // neues Passwort oder sperrt das Konto, gilt ihre Änderung – sonst überschriebe ein Angreifer mit bekanntem
        // Passwort den Reset gleich wieder.
        const ok = await tx
          .update(benutzer)
          .set({ passwortHash: hash })
          .where(and(eq(benutzer.id, b.id), eq(benutzer.passwortHash, b.passwortHash), eq(benutzer.aktiv, true), isNull(benutzer.geloeschtAm)))
          .returning({ id: benutzer.id });
        if (!ok.length) throw fehler("UNAUTHORIZED", "Das Konto wurde inzwischen geändert (z. B. Passwort neu gesetzt). Bitte neu anmelden.");
        // Alle anderen Sitzungen beenden (z. B. ein vergessenes Gerät); die aktuelle bleibt – wenn es sie noch gibt.
        const eigene = ctx.cookieTokens.benutzer ? sitzungsId(ctx.cookieTokens.benutzer) : "";
        if (eigene && !(await tx.select({ id: sitzung.id }).from(sitzung).where(eq(sitzung.id, eigene)).for("update")).length) {
          throw fehler("UNAUTHORIZED", "Das Konto wurde inzwischen geändert (z. B. Passwort neu gesetzt). Bitte neu anmelden.");
        }
        await tx.delete(sitzung).where(and(eq(sitzung.benutzerId, b.id), ne(sitzung.id, eigene)));
        await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Eigenes Passwort geändert", akteur: ctx });
      });
      return { ok: true };
    }),

  /** Sprache der Oberfläche für das eigene Konto merken (Entscheidung 022); gilt auf jedem Gerät nach der Anmeldung. */
  spracheSetzen: benutzerProcedure.input(z.object({ sprache: z.enum(SPRACHEN) })).mutation(async ({ ctx, input }) => {
    await db.update(benutzer).set({ sprache: input.sprache }).where(eq(benutzer.id, ctx.benutzer.id));
    return { ok: true };
  }),
};
