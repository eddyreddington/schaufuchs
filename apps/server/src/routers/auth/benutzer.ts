/** Benutzerverwaltung durch die Ausstellungsleitung: Liste, Angaben, Anlegen, Sperren, Löschen, Rolle, Passwort, Sperre aufheben. */
import { NUR_LESEN_MELDUNG } from "@schau/domain";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { hashPasswort, sitzungsId, zufallsToken } from "../../auth";
import { config } from "../../config";
import { db } from "../../db/client";
import { benutzer, sitzung } from "../../db/schema";
import { protokolliere } from "../../services/protokoll";
import { adminProcedure, fehler, dbId } from "../../trpc";
import { passwort, bremse, wartezeitJeKonto, codeBremse, zweiFaktorBremse, anlegenBremse, passwortBremse, OHNE_PASSWORT, willkommenBremse, verwalte, adminBleibt, hinweisMail, istFremdschluesselFehler, ohneEinladung, willkommenVorbereiten, versendeWillkommen, sendeWillkommen, benutzerUebersicht } from "./gemeinsam";

export const benutzerVerwaltung = {
  benutzerListe: adminProcedure.query(async ({ ctx }) =>
    (await benutzerUebersicht(ctx.benutzer.organisationId)).map((b) => ({ ...b, wartet: wartezeitJeKonto.wartet(`mail:${b.email}`) })),
  ),

  /** Ein Benutzer mit allem, was die Verwaltung braucht (für dessen eigene Seite). */
  benutzerGet: adminProcedure.input(z.object({ id: dbId })).query(async ({ ctx, input }) => {
    const [b] = await benutzerUebersicht(ctx.benutzer.organisationId, input.id);
    if (!b) throw fehler("NOT_FOUND", "Benutzer nicht gefunden.");
    return { ...b, wartet: wartezeitJeKonto.wartet(`mail:${b.email}`) };
  }),

  /** Name und E-Mail ändern (die E-Mail ist die Anmeldung – über alle Vereine eindeutig). */
  benutzerSpeichern: adminProcedure
    .input(
      z.object({
        id: dbId,
        name: z.string().trim().max(200).min(2, "Bitte einen Namen angeben."),
        email: z.string().trim().max(200).email("E-Mail-Adresse ungültig."),
        /** Nach einer Korrektur die Willkommensmail an die (neue) Adresse schicken. */
        willkommensmail: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const mitMail = !!input.willkommensmail;
      if (mitMail) willkommenBremse.versuch([`admin:${ctx.benutzer.id}`, `an:${input.id}`]);
      const { b, alteAdresse, willkommen } = await verwalte(ctx, input.id, async (tx, b) => {
        const neueAdresse = email !== b.email;
        if (neueAdresse) {
          // Adressänderungen zählen immer (auch erfolgreiche) – so lässt sich damit keine Mail-Flut auslösen.
          anlegenBremse.versuch([`admin:${ctx.benutzer.id}`]);
          const [schon] = await tx.select({ id: benutzer.id }).from(benutzer).where(eq(benutzer.email, email));
          if (schon) throw fehler("CONFLICT", "Diese E-Mail-Adresse lässt sich nicht verwenden. Bitte eine andere angeben.");
        }
        // Ein Einladungslink an die alte (vielleicht vertippte) Adresse gilt nicht mehr, ebenso alle Sitzungen.
        await tx.update(benutzer).set({ name: input.name, email, ...(neueAdresse ? ohneEinladung : {}) }).where(eq(benutzer.id, b.id));
        if (neueAdresse) await tx.delete(sitzung).where(eq(sitzung.benutzerId, b.id));
        await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Benutzer geändert", alt: { name: b.name, email: b.email }, neu: { name: input.name, email }, akteur: ctx });
        const jetzt = { ...b, name: input.name, email };
        // Willkommensmail (ggf. mit neuem Link) für genau diese Zeile vorbereiten – versendet wird nach dem Commit.
        const willkommen = mitMail && b.aktiv ? await willkommenVorbereiten(tx, ctx.benutzer, jetzt) : null;
        if (willkommen) {
          await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: willkommen.einladung ? "Einladung gesendet" : "Willkommensmail gesendet", neu: { benutzer: jetzt.name }, akteur: ctx });
        }
        return { b: jetzt, alteAdresse: neueAdresse ? b.email : null, willkommen };
      });
      // Die bisherige Adresse erfährt von der Änderung – sonst ließe sich ein Konto unbemerkt umleiten. Bei offener
      // Einladung (noch nie angemeldet, oft vertippt) nicht: dann ging schon die Einladung an eine falsche Adresse.
      if (alteAdresse && b.passwortHash !== OHNE_PASSWORT) {
        await hinweisMail(ctx.benutzer, alteAdresse, "Die Anmeldeadresse Ihres Zugangs wurde geändert", [
          `Guten Tag ${b.name},`,
          "",
          `${ctx.benutzer.name} hat die Anmeldeadresse Ihres Zugangs zu SchauFUCHS geändert. Diese Adresse (${alteAdresse}) gilt für die Anmeldung nicht mehr.`,
        ]);
      }
      if (!willkommen) return { ok: true, willkommensmail: false };
      await versendeWillkommen(ctx.benutzer.organisationId, willkommen);
      return { ok: true, willkommensmail: true };
    }),

  /** Alle Geräte eines Benutzers abmelden (z. B. Tablet an der Kasse liegen gelassen). */
  benutzerAbmelden: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const eigene = input.id === ctx.benutzer.id && ctx.cookieTokens.benutzer ? sitzungsId(ctx.cookieTokens.benutzer) : "";
    return verwalte(ctx, input.id, async (tx, b) => {
      const weg = await tx.delete(sitzung).where(and(eq(sitzung.benutzerId, b.id), ne(sitzung.id, eigene))).returning({ id: sitzung.id });
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Auf allen Geräten abgemeldet", neu: { benutzer: b.name, geraete: weg.length }, akteur: ctx });
      return { abgemeldet: weg.length };
    });
  }),

  benutzerAnlegen: adminProcedure
    .input(
      z.object({
        name: z.string().trim().max(200).min(2),
        email: z.string().trim().max(200).email(),
        /** Ohne Passwort bekommt die Person einen Einladungslink und legt es selbst fest (Regelfall). */
        passwort: passwort.optional(),
        rolle: z.enum(["admin", "mitarbeiter"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      // Die Anmeldung läuft nur über die E-Mail-Adresse – sie muss deshalb über alle Vereine eindeutig sein. Die
      // Antwort ist für eigene und fremde Konten gleich; die Bremse verhindert das massenhafte Abfragen von Adressen.
      // Gezählt werden nur Konflikte: erfolgreiche Anlagen werden gutgeschrieben.
      const gutschrift = anlegenBremse.versuch([`admin:${ctx.benutzer.id}`]);
      const [vorhanden] = await db.select({ id: benutzer.id }).from(benutzer).where(eq(benutzer.email, email));
      if (vorhanden) throw fehler("CONFLICT", "Diese E-Mail-Adresse lässt sich nicht verwenden. Bitte eine andere angeben.");
      const [neu] = await db
        .insert(benutzer)
        .values({
          organisationId: ctx.benutzer.organisationId,
          name: input.name,
          email,
          passwortHash: input.passwort ? await hashPasswort(input.passwort) : OHNE_PASSWORT,
          rolle: input.rolle,
        })
        .returning({ id: benutzer.id, passwortHash: benutzer.passwortHash });
      gutschrift();
      await db.transaction((tx) =>
        protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: neu!.id, aktion: "Benutzer angelegt", neu: { name: input.name, email, rolle: input.rolle, einladung: !input.passwort }, akteur: ctx }),
      );
      // Willkommensmail nie mit Passwort: entweder mit Einladungslink oder das Passwort kommt persönlich. Scheitert der
      // Versand, bleibt die Mail im Postausgang – das Anlegen gilt trotzdem; die Einladung lässt sich neu schicken.
      let einladung = false;
      try {
        einladung = (await sendeWillkommen(ctx.benutzer, { id: neu!.id, name: input.name, email, rolle: input.rolle, passwortHash: neu!.passwortHash })).einladung;
      } catch (e) {
        console.error("[auth] Willkommensmail nicht abgelegt:", e instanceof Error ? e.message.split("\n")[0] : e);
      }
      return { ok: true, willkommensmail: true, einladung, id: neu!.id };
    }),

  benutzerAktiv: adminProcedure
    .input(z.object({ id: dbId, aktiv: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Lesemodus (Entscheidung 025): Sperren geht (Konto bei Verdacht stilllegen), Entsperren nicht.
      if (input.aktiv && config.nurLesen) throw fehler("FORBIDDEN", NUR_LESEN_MELDUNG);
      if (input.id === ctx.benutzer.id) throw fehler("BAD_REQUEST", "Sie können sich nicht selbst sperren.");
      await verwalte(ctx, input.id, async (tx, b) => {
        if (!input.aktiv) await adminBleibt(tx, ctx.benutzer.organisationId, b.id);
        // Gesperrt gilt auch ein offener Einladungslink nicht mehr (nach dem Entsperren eine neue Einladung schicken).
        await tx.update(benutzer).set({ aktiv: input.aktiv, ...(input.aktiv ? {} : ohneEinladung) }).where(eq(benutzer.id, b.id));
        // Sperren meldet alle Geräte ab – nach dem Entsperren gelten alte Sitzungen nicht wieder.
        if (!input.aktiv) await tx.delete(sitzung).where(eq(sitzung.benutzerId, b.id));
        await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: input.aktiv ? "Benutzer entsperrt" : "Benutzer gesperrt", neu: { benutzer: b.name }, akteur: ctx });
      });
      return { ok: true };
    }),

  /** Willkommensmail noch einmal schicken (z. B. kam die erste nicht an). Ohne Passwort. */
  benutzerWillkommen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    willkommenBremse.versuch([`admin:${ctx.benutzer.id}`, `an:${input.id}`]);
    // Unter der Vereinssperre: der Link entsteht für genau die gelesene Adresse; versendet wird nach dem Commit.
    const w = await verwalte(ctx, input.id, async (tx, b) => {
      if (!b.aktiv) throw fehler("BAD_REQUEST", "Der Benutzer ist gesperrt. Bitte erst entsperren.");
      const w = await willkommenVorbereiten(tx, ctx.benutzer, b);
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: w.einladung ? "Einladung gesendet" : "Willkommensmail gesendet", neu: { benutzer: b.name }, akteur: ctx });
      return w;
    });
    await versendeWillkommen(ctx.benutzer.organisationId, w);
    return { ok: true, an: w.an, einladung: w.einladung };
  }),

  /**
   * Benutzer löschen. Ohne Spuren (nie etwas erfasst) verschwindet der Datensatz ganz. Mit Spuren in Protokoll, Kasse,
   * Zahlungen usw. wird er entfernt: keine Anmeldung mehr, E-Mail-Adresse wieder frei, Passwort, 2FA und Sitzungen weg –
   * nur der Name bleibt, damit nachvollziehbar bleibt, wer was erfasst hat.
   */
  benutzerLoeschen: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.benutzer.id) throw fehler("BAD_REQUEST", "Sie können sich nicht selbst löschen.");
    return verwalte(ctx, input.id, async (tx, b) => {
      await adminBleibt(tx, ctx.benutzer.organisationId, b.id);
      let ganz = true;
      try {
        await tx.transaction(async (t2) => {
          await t2.delete(benutzer).where(eq(benutzer.id, b.id));
        });
      } catch (e) {
        if (!istFremdschluesselFehler(e)) throw e;
        ganz = false;
        await tx
          .update(benutzer)
          .set({
            geloeschtAm: new Date(),
            aktiv: false,
            // Keine gültige Adresse und nicht vorhersagbar: niemand kann sie vorher belegen oder sich damit anmelden.
            email: `geloescht-${b.id}-${zufallsToken(9)}`,
            passwortHash: OHNE_PASSWORT,
            totpGeheim: null,
            totpAktivSeit: null,
            totpLetzterSchritt: 0,
            totpNotfall: [],
            ...ohneEinladung,
          })
          .where(eq(benutzer.id, b.id));
        await tx.delete(sitzung).where(eq(sitzung.benutzerId, b.id));
      }
      await protokolliere(tx, {
        schauId: null,
        tabelle: "benutzer",
        datensatzId: b.id,
        aktion: ganz ? "Benutzer gelöscht" : "Benutzer entfernt (Name bleibt für Protokoll und Kasse)",
        alt: { name: b.name, rolle: b.rolle },
        akteur: ctx,
      });
      return { ganz };
    });
  }),

  /** Rolle ändern. Die eigene nicht, und es bleibt immer mindestens ein aktiver Administrator. */
  benutzerRolle: adminProcedure.input(z.object({ id: dbId, rolle: z.enum(["admin", "mitarbeiter"]) })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.benutzer.id) throw fehler("BAD_REQUEST", "Die eigene Rolle ändert ein anderer Administrator.");
    await verwalte(ctx, input.id, async (tx, b) => {
      if (b.rolle === input.rolle) return;
      if (input.rolle !== "admin") await adminBleibt(tx, ctx.benutzer.organisationId, b.id);
      await tx.update(benutzer).set({ rolle: input.rolle }).where(eq(benutzer.id, b.id));
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Rolle geändert", alt: { rolle: b.rolle }, neu: { rolle: input.rolle, benutzer: b.name }, akteur: ctx });
    });
    return { ok: true };
  }),

  /**
   * Neues Passwort durch die Ausstellungsleitung (vergessen). Meldet alle Geräte ab und benachrichtigt die Person per
   * Mail – ohne das Passwort, das wird persönlich weitergegeben.
   */
  benutzerPasswortSetzen: adminProcedure.input(z.object({ id: dbId, passwort })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.benutzer.id) throw fehler("BAD_REQUEST", "Das eigene Passwort bitte unter „Eigenes Passwort ändern“ ändern.");
    const hash = await hashPasswort(input.passwort);
    const b = await verwalte(ctx, input.id, async (tx, b) => {
      await tx.update(benutzer).set({ passwortHash: hash, ...ohneEinladung }).where(eq(benutzer.id, b.id));
      await tx.delete(sitzung).where(eq(sitzung.benutzerId, b.id));
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Passwort neu gesetzt", neu: { benutzer: b.name }, akteur: ctx });
      return b;
    });
    codeBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    passwortBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    zweiFaktorBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    await hinweisMail(ctx.benutzer, b.email, "Ihr Passwort für SchauFUCHS wurde neu gesetzt", [
      `Guten Tag ${b.name},`,
      "",
      `${ctx.benutzer.name} hat Ihr Passwort für SchauFUCHS neu gesetzt. Das neue Passwort erhalten Sie persönlich.`,
      `Anmelden: ${config.publicUrl}/anmelden`,
    ]);
    return { ok: true };
  }),

  /** Hebt Wartezeit und Sperren nach Fehlversuchen für ein Konto auf (z. B. wenn jemand Fremdes es aufhält). */
  sperreAufheben: adminProcedure.input(z.object({ id: dbId })).mutation(async ({ ctx, input }) => {
    const b = await verwalte(ctx, input.id, async (tx, b) => {
      await protokolliere(tx, { schauId: null, tabelle: "benutzer", datensatzId: b.id, aktion: "Sperre nach Fehlversuchen aufgehoben", neu: { benutzer: b.name }, akteur: ctx });
      return b;
    });
    wartezeitJeKonto.zuruecksetzen(`mail:${b.email}`, true);
    bremse.zuruecksetzen((k) => k.startsWith("ip:") && k.endsWith(`:${b.email}`));
    codeBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    passwortBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    zweiFaktorBremse.zuruecksetzen((k) => k === `konto:${b.id}`);
    return { ok: true };
  }),
};
